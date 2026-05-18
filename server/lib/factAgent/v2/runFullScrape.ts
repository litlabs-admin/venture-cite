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
import * as schema from "@shared/schema";
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { safeFetchTextWithLockedIp } from "../../ssrf";
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

// Build provider clients lazily; same pattern as factSheetV2.ts. A
// missing OPENROUTER_API_KEY just disables the Claude fallback rather
// than crashing — single-provider extraction still works.
function buildOpenaiProvider(): ProviderClient {
  return {
    name: "openai",
    async call(prompt) {
      const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const messages =
        typeof prompt === "string"
          ? [{ role: "user" as const, content: prompt }]
          : [
              { role: "system" as const, content: prompt.system },
              { role: "user" as const, content: prompt.user },
            ];
      const res = await openaiClient.chat.completions.create({
        model: MODELS.misc,
        response_format: { type: "json_object" },
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
    timeout: 45_000,
    maxRetries: 1,
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
      // 1. Sitemap discovery + URL tier scoring (mirrors the /plan handler).
      const fetcher = async (url: string, opts?: { maxBytes?: number }) =>
        safeFetchTextWithLockedIp(url, {
          maxBytes: opts?.maxBytes ?? 500_000,
        }).then((r) => ({ status: r.status, text: r.text }));

      const sitemapUrls = await discoverSitemapUrls(normalized, fetcher);
      const selectedUrls = selectTopUrls(normalized, sitemapUrls);

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
            await persistFacts(outcome.facts as never, {
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
        } catch (err) {
          logger.warn({ err, runId: activeRunId, pageId: p.pageId }, "runFullScrape: page failed");
        }
      });

      const next = async () => {
        while (queue.length > 0 && Date.now() < deadlineMs) {
          const job = queue.shift();
          if (!job) return;
          await job();
        }
      };
      const runners: Promise<void>[] = [];
      for (let i = 0; i < PER_PAGE_CONCURRENCY; i++) runners.push(next());
      await Promise.all(runners);

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
          await persistFacts(searchOutcome.facts as never, {
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
      try {
        await runAggregate({ runId: activeRunId, brandId: brand.id });
      } catch (err) {
        logger.warn({ err, runId: activeRunId }, "runFullScrape: aggregate failed");
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
