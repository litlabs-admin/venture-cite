// Server-side full v2 fact-scrape pipeline for one brand.
//
// Extracted from the monthly-refresh cron so the SAME proven pipeline
// (sitemap discovery -> static pages -> search-LLM -> user-enrich ->
// aggregate) backs three callers: the monthly refresh, the onboarding
// activation pipeline (FactSheet kernel built BEFORE prompts), and any
// future manual server-side trigger. Keeping one implementation means
// the resumable cron backstop and lifecycle cleanup reason about a
// single run shape.
//
// Each brand's work is gated by a per-brand advisory lock so a manual
// re-scrape, the cron, and first-run activation can't double-run the
// same brand concurrently.
import { db } from "../../../db";
import { and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { safeFetchTextWithLockedIp } from "../../ssrf";
import { emitEvent, flushEvents } from "./eventLog";
import { createRobotsCache } from "../robotsCache";
import { canonicalizeUrl } from "../canonicalize";
import { persistFacts } from "../persistFacts";
import { runStaticSource } from "./sourceStatic";
import { runSearchSource } from "./sourceSearch";
import { runUserEnrichSource } from "./sourceUserEnrich";
import { runAggregate } from "./aggregate";
import { persistUserFacts } from "./persistUserFacts";
import { discoverSitemapUrls } from "./sitemapDiscovery";
import { selectTopUrls } from "./urlTierScoring";
import { hybridDiscoverUrls } from "./hybridUrlDiscovery";
import type { RankerLlmCallable } from "./urlRanker";
import { fetchWikidataFacts } from "./wikidataExtractor";
import { normalizeHttps } from "./planGuards";
import { callWithFailover, type ProviderClient } from "./llmFailover";
import { withDynamicAdvisoryLock, dynamicLockNamespaces } from "../../advisoryLock";
import OpenAI from "openai";
import { MODELS, OPENROUTER_BASE_URL } from "../../modelConfig";

const PER_PAGE_CONCURRENCY = 3;

// Normalized brand shape the pipeline needs. Callers map their own row
// representation (drizzle camelCase Brand, raw snake_case SQL row, …)
// into this so the pipeline body stays representation-agnostic.
export interface FullScrapeBrandInput {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  products: string[];
  targetAudience: string | null;
  uniqueSellingPoints: string[];
  keyValues: string | null;
  brandVoice: string | null;
  tone: string | null;
}

// LLM call timeout per provider attempt. Derives from
// VERCEL_FUNCTION_BUDGET_MS via vercelBudget.ts so the deployment can
// be retuned between Vercel Hobby (10 s function budget) and Pro (60 s)
// with a single env flip. Pro default = 25 s; Hobby = ~6 s.
import { LLM_CALL_TIMEOUT_MS } from "./vercelBudget";

// Build provider clients lazily; same pattern as factSheetV2.ts. A
// missing OPENROUTER_API_KEY just disables the Claude fallback rather
// than crashing — single-provider extraction still works.
//
// v2 (2026-05-28): both providers now honour `prompt.responseFormat`
// when present. OpenAI gets it as a real json_schema response_format
// (strict mode → schema-valid output guaranteed). OpenRouter's
// pass-through model providers (when the underlying model is OpenAI-
// family) honour it the same way. Claude via OpenRouter currently
// ignores the json_schema flavour; the prompt's text instruction is
// the fallback there.
function buildOpenaiProvider(): ProviderClient {
  return {
    name: "openai",
    async call(prompt) {
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: LLM_CALL_TIMEOUT_MS,
        maxRetries: 0,
      });
      const messages =
        typeof prompt === "string"
          ? [{ role: "user" as const, content: prompt }]
          : [
              { role: "system" as const, content: prompt.system },
              { role: "user" as const, content: prompt.user },
            ];
      const responseFormat =
        typeof prompt === "object" && "responseFormat" in prompt && prompt.responseFormat
          ? prompt.responseFormat
          : { type: "json_object" as const };
      const res = await openaiClient.chat.completions.create({
        model: MODELS.misc,
        response_format: responseFormat as never,
        messages,
      });
      return res.choices?.[0]?.message?.content ?? "";
    },
  };
}

function buildOpenrouterClaudeProvider(): ProviderClient | null {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    timeout: LLM_CALL_TIMEOUT_MS,
    maxRetries: 0,
  });
  return {
    // "anthropic" is the slot bucket in llm_concurrency_slots — sized for
    // Claude-family concurrent calls. Egress is via OpenRouter, but the
    // model is Claude so we account for it under that bucket.
    name: "anthropic",
    async call(prompt) {
      const messages =
        typeof prompt === "string"
          ? [{ role: "user" as const, content: prompt }]
          : [
              { role: "system" as const, content: prompt.system },
              { role: "user" as const, content: prompt.user },
            ];
      // Claude via OpenRouter doesn't accept the OpenAI json_schema
      // response_format yet. Send json_object so we still get JSON,
      // and rely on the prompt + Zod post-validation for shape.
      const res = await client.chat.completions.create({
        model: MODELS.citationClaude,
        response_format: { type: "json_object" },
        messages,
      });
      return res.choices?.[0]?.message?.content ?? "";
    },
  };
}

// Runs the full v2 pipeline for one brand inside a per-brand advisory
// lock. Returns { ran:false } when another holder (manual re-scrape /
// cron / concurrent activation) owns the lock — the caller should treat
// that as "in progress elsewhere", not an error.
export async function runFullScrapeForBrand(
  brand: FullScrapeBrandInput,
  deadlineMs: number,
  triggeredBy: string,
): Promise<{ ran: boolean; runId?: string }> {
  const normalized = normalizeHttps(brand.website ?? "");
  if (!normalized) {
    logger.warn({ brandId: brand.id }, "runFullScrape: brand website not normalizable");
    return { ran: false };
  }

  let runId: string | undefined;

  const lockResult = await withDynamicAdvisoryLock(
    dynamicLockNamespaces.fullBrandScrape,
    brand.id,
    `full-scrape:${brand.id}`,
    async () => {
      // 2026-05-28 SAFETY NET: every code path inside this callback
      // either runs to its terminal status write or hits the catch
      // block at the end that force-writes a terminal status. There
      // is no way for the run row to remain in a non-terminal state
      // after this callback resolves.
      //
      // 1. Sitemap discovery + URL tier scoring (mirrors the /plan handler).
      const fetcher = async (url: string, opts?: { maxBytes?: number }) =>
        safeFetchTextWithLockedIp(url, {
          maxBytes: opts?.maxBytes ?? 500_000,
        }).then((r) => ({ status: r.status, text: r.text }));

      const sitemapStart = Date.now();
      // 2026-05-28 (Phase 2): if FACT_AGENT_LLM_URL_RANKER is set,
      // use the hybrid discovery (sitemap + nav graph + LLM ranking)
      // instead of the regex tier scorer. When unset, the legacy
      // regex path runs — preserving existing behaviour as the
      // default until the hybrid path is validated against the
      // benchmark.
      let selectedUrls: string[] = [];
      let sitemapUrlsLegacy: string[] = [];
      let discoveryProvenance: Array<{
        url: string;
        sources: string[];
        rankerScore: number | null;
        rankerReason: string | null;
      }> | null = null;
      let discoveryCounters: {
        sitemapCount: number;
        navCount: number;
        candidatesRanked: number;
        jinaFallbackUsed: boolean;
      } | null = null;

      if (process.env.FACT_AGENT_LLM_URL_RANKER === "true") {
        try {
          const rankerOpenai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            // Tier-aware: the ranker is the FIRST LLM call so it should
            // be the most conservative — if it stalls, the rest of the
            // pipeline gets squeezed. LLM_CALL_TIMEOUT_MS is ~6.3s on
            // Hobby / 25s on Pro.
            timeout: LLM_CALL_TIMEOUT_MS,
            maxRetries: 0,
          });
          const rankerLlm: RankerLlmCallable = async (prompt) => {
            const res = await rankerOpenai.chat.completions.create({
              model: MODELS.misc,
              response_format: prompt.responseFormat as never,
              messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user },
              ],
            });
            return res.choices?.[0]?.message?.content ?? "";
          };
          const hybridResult = await hybridDiscoverUrls({
            brandUrl: normalized,
            brandName: brand.name,
            industry: brand.industry,
            fetcher,
            llm: rankerLlm,
          });
          selectedUrls = hybridResult.urls;
          discoveryProvenance = hybridResult.provenance;
          discoveryCounters = hybridResult.counters;
        } catch (err) {
          logger.warn(
            { err, brandId: brand.id },
            "runFullScrape: hybrid discovery failed, falling back to regex tier scorer",
          );
          sitemapUrlsLegacy = await discoverSitemapUrls(normalized, fetcher);
          selectedUrls = selectTopUrls(normalized, sitemapUrlsLegacy);
        }
      } else {
        sitemapUrlsLegacy = await discoverSitemapUrls(normalized, fetcher);
        selectedUrls = selectTopUrls(normalized, sitemapUrlsLegacy);
      }
      // We emit the event AFTER inserting the run row below so we have
      // a runId to attach. Stash the timing data for that moment.
      const sitemapDurationMs = Date.now() - sitemapStart;
      const sitemapUrls = sitemapUrlsLegacy.length > 0 ? sitemapUrlsLegacy : selectedUrls;

      // 2. Create the run row.
      const runRows = await db
        .insert(schema.brandFactScrapeRuns)
        .values({
          brandId: brand.id,
          status: "pending",
          triggeredBy,
        })
        .returning({ id: schema.brandFactScrapeRuns.id });
      runId = runRows[0].id;
      const activeRunId = runId;

      // Emit the discovery telemetry now that we have a runId to attach.
      emitEvent({
        runId: activeRunId,
        brandId: brand.id,
        stepName: discoveryProvenance ? "hybrid_discovery" : "sitemap_discovery",
        outcome: selectedUrls.length === 0 ? "skipped" : "ok",
        durationMs: sitemapDurationMs,
        metadata: {
          brandUrl: normalized,
          sitemapUrlCount: sitemapUrls.length,
          selectedUrlCount: selectedUrls.length,
          firstFiveUrls: selectedUrls.slice(0, 5),
          ranker: discoveryProvenance
            ? {
                counters: discoveryCounters,
                topPicks: discoveryProvenance.slice(0, 5),
              }
            : undefined,
        },
      });

      // ★ Everything from page-creation through aggregate is wrapped in
      // this try block. The catch at the bottom force-writes a terminal
      // status if any unhandled error bubbles up.
      try {
        // 3. Create page rows (dedup by canonical URL, mirrors /plan).
        const pageRows: Array<{ pageId: string; url: string }> = [];
        const seen = new Set<string>();
        for (const url of selectedUrls) {
          const canonical = canonicalizeUrl(url);
          if (seen.has(canonical)) continue;
          seen.add(canonical);
          const inserted = await db
            .insert(schema.brandFactScrapePages)
            .values({
              runId: activeRunId,
              url,
              canonicalUrl: canonical,
              status: "pending",
            })
            .returning({
              id: schema.brandFactScrapePages.id,
              url: schema.brandFactScrapePages.url,
            });
          pageRows.push({
            pageId: inserted[0].id,
            url: inserted[0].url ?? url,
          });
        }

        // 4. Build LLM caller (same provider stack as the route handler).
        const providers: ProviderClient[] = [buildOpenaiProvider()];
        const claudeFallback = buildOpenrouterClaudeProvider();
        if (claudeFallback) providers.push(claudeFallback);
        const llm = (prompt: string | { system: string; user: string }) =>
          callWithFailover(providers, prompt, activeRunId);

        const robotsCache = createRobotsCache(normalized, (url) =>
          safeFetchTextWithLockedIp(url, {}),
        );

        // 5. Static-pages source — bounded concurrency, respects deadline.
        const queue: Array<() => Promise<void>> = pageRows.map((p) => async () => {
          const startedAt = Date.now();
          try {
            const outcome = await runStaticSource({
              url: p.url,
              brandUrl: normalized,
              brandName: brand.name,
              industry: brand.industry,
              runId: activeRunId,
              fetcher: (url, opts) =>
                safeFetchTextWithLockedIp(url, opts ?? {}).then((r) => ({
                  status: r.status,
                  text: r.text,
                  contentType: r.contentType,
                  headers: r.headers,
                })),
              llm,
              robotsCache,
            });
            if (outcome.facts.length > 0) {
              await persistFacts(outcome.facts, {
                brandId: brand.id,
                runId: activeRunId,
                sourceUrl: p.url,
              });
            }
            await storage.insertFactScrapeLog({
              runId: activeRunId,
              source: "static_pages",
              status:
                outcome.status === "done"
                  ? "done"
                  : outcome.status.startsWith("skipped_")
                    ? "skipped"
                    : "failed",
              factCount: outcome.facts.length,
              latencyMs: Date.now() - startedAt,
              errorKind: outcome.errorKind ?? undefined,
              diagnostics: outcome.diagnostics,
            });
            // Per-page event with the diagnostics the inspector needs to
            // render the timeline card.
            emitEvent({
              runId: activeRunId,
              brandId: brand.id,
              stepName: "page_extract",
              outcome:
                outcome.status === "done"
                  ? "ok"
                  : outcome.status.startsWith("skipped_")
                    ? "skipped"
                    : "failed",
              durationMs: Date.now() - startedAt,
              metadata: {
                url: p.url,
                pageStatus: outcome.status,
                factCount: outcome.facts.length,
                statusCode: outcome.statusCode,
                bytes: outcome.bytes,
                errorKind: outcome.errorKind,
                errorMessage: outcome.errorMessage?.slice(0, 200),
                diagnostics: outcome.diagnostics,
              },
            });
          } catch (err) {
            logger.warn(
              { err, runId: activeRunId, pageId: p.pageId },
              "runFullScrape: page failed",
            );
          }
        });

        // Mid-run cost-cap check. The pre-run guard in planGuards.ts only
        // gated us BEFORE any work happened; if a run spans the threshold
        // (e.g. a brand that crossed into a new month or has expensive
        // pages) the old code would have just kept burning. We poll the
        // current spend every page and bail the queue if the cap is hit.
        // Cap-hit aborts the remaining queue but lets in-flight pages
        // finish naturally — they've already paid the LLM call cost.
        let costCapHit = false;
        const isOverCostCap = async (): Promise<boolean> => {
          if (costCapHit) return true;
          try {
            const runRow = await db
              .select({
                llmCostCents: schema.brandFactScrapeRuns.llmCostCents,
              })
              .from(schema.brandFactScrapeRuns)
              .where(eq(schema.brandFactScrapeRuns.id, activeRunId))
              .limit(1);
            const monthKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
            const capRow = await db
              .select({
                factScrapeCents: schema.brandMonthlyCostCaps.factScrapeCents,
                monthlyCapCents: schema.brandMonthlyCostCaps.monthlyCapCents,
              })
              .from(schema.brandMonthlyCostCaps)
              .where(
                and(
                  eq(schema.brandMonthlyCostCaps.brandId, brand.id),
                  eq(schema.brandMonthlyCostCaps.monthKey, monthKey),
                ),
              )
              .limit(1);
            const spentThisRun = Number(runRow[0]?.llmCostCents ?? 0);
            const spentThisMonth = Number(capRow[0]?.factScrapeCents ?? 0);
            const cap = Number(capRow[0]?.monthlyCapCents ?? 500);
            if (spentThisMonth + spentThisRun >= cap) {
              logger.warn(
                { brandId: brand.id, runId: activeRunId, spentThisRun, spentThisMonth, cap },
                "runFullScrape: monthly cost cap reached mid-run, aborting remaining pages",
              );
              costCapHit = true;
              return true;
            }
          } catch (err) {
            logger.warn(
              { err, runId: activeRunId },
              "runFullScrape: mid-run cost check failed (best-effort, continuing)",
            );
          }
          return false;
        };

        const next = async () => {
          while (queue.length > 0 && Date.now() < deadlineMs) {
            if (await isOverCostCap()) break;
            const job = queue.shift();
            if (!job) return;
            await job();
          }
        };
        const runners: Promise<void>[] = [];
        for (let i = 0; i < PER_PAGE_CONCURRENCY; i++) runners.push(next());
        await Promise.all(runners);

        // 6a. Wikidata enrichment — opt-out via FACT_AGENT_WIKIDATA_ENABLED=false.
        // For any brand with a public Wikidata entry (most established
        // companies) we get verified founding date, HQ, CEO, employee
        // count, industry, ticker, and parent company at no LLM cost.
        // Two HTTP requests, ~0.5-2s typical, totally additive (facts
        // merge through persistFacts with confidence 0.95 — same
        // consolidation machinery handles agreements + disputes).
        if (process.env.FACT_AGENT_WIKIDATA_ENABLED !== "false") {
          const wdStart = Date.now();
          try {
            const wd = await fetchWikidataFacts(normalized);
            if (wd.facts.length > 0) {
              await persistFacts(wd.facts, {
                brandId: brand.id,
                runId: activeRunId,
                sourceUrl: `https://www.wikidata.org/wiki/${wd.entityId ?? ""}`,
              });
            }
            await storage.insertFactScrapeLog({
              runId: activeRunId,
              // Migration 0078 expanded the source CHECK to include
              // 'wikidata' so we no longer have to alias under search_llm.
              // The Inspector / weeklySummary aggregates now group these
              // correctly.
              source: "wikidata",
              status: wd.facts.length > 0 ? "done" : "skipped",
              factCount: wd.facts.length,
              latencyMs: wd.durationMs,
              errorKind: undefined,
              diagnostics: { wikidata: true, entityId: wd.entityId },
            });
            emitEvent({
              runId: activeRunId,
              brandId: brand.id,
              stepName: "wikidata_enrich",
              outcome: wd.facts.length > 0 ? "ok" : "skipped",
              durationMs: wd.durationMs,
              metadata: {
                entityId: wd.entityId,
                factCount: wd.facts.length,
              },
            });
          } catch (err) {
            logger.warn(
              { err, runId: activeRunId, brandUrl: normalized },
              "runFullScrape: wikidata enrichment failed (non-fatal)",
            );
            emitEvent({
              runId: activeRunId,
              brandId: brand.id,
              stepName: "wikidata_enrich",
              outcome: "failed",
              durationMs: Date.now() - wdStart,
              metadata: {
                errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err),
              },
            });
          }
        }

        // 6. Search-LLM source.
        const searchStart = Date.now();
        try {
          const searchOutcome = await runSearchSource({
            brandId: brand.id,
            brandUrl: normalized,
            brandName: brand.name,
            industry: brand.industry,
            runId: activeRunId,
          });
          if (searchOutcome.facts.length > 0) {
            await persistFacts(searchOutcome.facts, {
              brandId: brand.id,
              runId: activeRunId,
              sourceUrl: normalized,
            });
          }
          await storage.insertFactScrapeLog({
            runId: activeRunId,
            source: "search_llm",
            status: searchOutcome.status,
            factCount: searchOutcome.facts.length,
            latencyMs: Date.now() - searchStart,
            errorKind: searchOutcome.errorKind ?? undefined,
            diagnostics: searchOutcome.diagnostics,
          });
        } catch (err) {
          logger.warn({ err, runId: activeRunId }, "runFullScrape: search-llm failed");
        }

        // 7. User-enrich source.
        const enrichStart = Date.now();
        try {
          const enrichOutcome = await runUserEnrichSource({
            brand: {
              id: brand.id,
              name: brand.name,
              description: brand.description,
              industry: brand.industry,
              website: brand.website,
              products: brand.products,
              targetAudience: brand.targetAudience,
              uniqueSellingPoints: brand.uniqueSellingPoints,
              keyValues: brand.keyValues,
              brandVoice: brand.brandVoice,
              tone: brand.tone,
            },
            runId: activeRunId,
          });
          await persistUserFacts(enrichOutcome.facts, {
            brandId: brand.id,
            runId: activeRunId,
          });
          await storage.insertFactScrapeLog({
            runId: activeRunId,
            source: "user_enrich",
            status: enrichOutcome.status,
            factCount: enrichOutcome.facts.length,
            latencyMs: Date.now() - enrichStart,
            errorKind: enrichOutcome.errorKind ?? undefined,
            diagnostics: enrichOutcome.diagnostics,
          });
        } catch (err) {
          logger.warn({ err, runId: activeRunId }, "runFullScrape: user-enrich failed");
        }

        // 8. Aggregate — computes terminal status, reconciles conflicts,
        //    bumps last_verified, writes run.completed_at.
        //
        // 2026-05-28 SAFETY NET: if runAggregate throws BEFORE writing the
        // terminal status (reconciliation tx fails, log read fails, etc.),
        // the run stays in 'extracting' / 'pending' forever and the SSE
        // stream + frontend polling never see a terminal state — that's
        // exactly the "infinite loop on Adyen" symptom. Force a terminal
        // status as the absolute last act of this lock holder so a run
        // can NEVER end alive.
        let aggregateError: Error | null = null;
        try {
          await runAggregate({ runId: activeRunId, brandId: brand.id });
        } catch (err) {
          aggregateError = err instanceof Error ? err : new Error(String(err));
          logger.warn(
            { err, runId: activeRunId },
            "runFullScrape: aggregate failed, will force-terminate run",
          );
        }

        if (aggregateError) {
          try {
            // Best-effort terminal status. Use 'failed' + 'aggregate_error'
            // so the UI shows a clear cause and the backstop doesn't keep
            // retrying.
            await db
              .update(schema.brandFactScrapeRuns)
              .set({
                status: "failed",
                errorKind: "aggregate_error",
                errorMessage: aggregateError.message.slice(0, 500),
                completedAt: new Date(),
              })
              .where(eq(schema.brandFactScrapeRuns.id, activeRunId));
            emitEvent({
              runId: activeRunId,
              brandId: brand.id,
              stepName: "terminal",
              outcome: "failed",
              metadata: {
                errorKind: "aggregate_error",
                errorMessage: aggregateError.message.slice(0, 200),
              },
            });
          } catch (terminalErr) {
            // If even THIS fails, the backstop will catch the stale run
            // after retryCount=10. Log loud.
            logger.error(
              { err: terminalErr, runId: activeRunId },
              "runFullScrape: CRITICAL — could not write terminal status. Backstop will recover.",
            );
          }
        } else {
          emitEvent({
            runId: activeRunId,
            brandId: brand.id,
            stepName: "terminal",
            outcome: "ok",
            metadata: { errorKind: null },
          });
        }
        await flushEvents();
      } catch (callbackErr) {
        // ★ Catches ANY error in steps 3-8 that wasn't already handled.
        // Includes: page-row insert failures, queue setup, advisory lock
        // errors, cost-cap query failures, anything else inside the
        // worker loop that escaped a local try/catch. Force terminal.
        const err = callbackErr instanceof Error ? callbackErr : new Error(String(callbackErr));
        logger.error(
          { err, runId: activeRunId },
          "runFullScrape: unhandled error inside lock callback, force-terminating run",
        );
        try {
          await db
            .update(schema.brandFactScrapeRuns)
            .set({
              status: "failed",
              errorKind: "internal_error",
              errorMessage: err.message.slice(0, 500),
              completedAt: new Date(),
            })
            .where(eq(schema.brandFactScrapeRuns.id, activeRunId));
          emitEvent({
            runId: activeRunId,
            brandId: brand.id,
            stepName: "terminal",
            outcome: "failed",
            metadata: {
              errorKind: "internal_error",
              errorMessage: err.message.slice(0, 200),
            },
          });
          await flushEvents();
        } catch (writeErr) {
          logger.error(
            { err: writeErr, runId: activeRunId },
            "runFullScrape: CRITICAL — could not write terminal status after callback error. Backstop will recover.",
          );
        }
        // Don't rethrow — we want the lock to release cleanly and the
        // caller's response to be the (already-failed) run row.
      } finally {
        // Belt-and-suspenders: drain ANY events that landed before/
        // during the lock callback so the Vercel function doesn't
        // exit with a half-written timeline. drain() handles re-
        // entrancy and bounded backpressure internally.
        try {
          await flushEvents();
        } catch (flushErr) {
          logger.warn(
            { err: flushErr, runId: activeRunId },
            "runFullScrape: final flushEvents failed (events may be missing from inspector)",
          );
        }
      }
    },
  );

  if (!lockResult.ran) {
    logger.info(
      { brandId: brand.id },
      "runFullScrape: brand locked by concurrent scrape, skipping",
    );
  }

  return { ran: lockResult.ran, runId };
}
