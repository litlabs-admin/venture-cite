// V2 monthly refresh. Picks brands that haven't completed a scrape in
// 30+ days and runs the full pipeline inline. Vercel 60s function ceiling
// limits us to ~3-5 brands per cron tick; subsequent ticks pick up the
// next batch via the "completed_at IS NULL OR completed_at < 30 days"
// ordering.
//
// Each brand's work is gated with a session-level pg_try_advisory_lock so a
// manual re-scrape happening concurrently doesn't double-run the same brand.
import { sql } from "drizzle-orm";
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

const REFRESH_INTERVAL_DAYS = 30;
const MAX_BRANDS_PER_TICK = 3;
const PER_PAGE_CONCURRENCY = 3;

// Namespace reused from the dynamic-lock table — brand-level monthly-refresh
// lock so concurrent manual re-scrapes don't double-process the same brand.
// We borrow citationRunSlice's namespace slot for now; a dedicated entry in
// advisoryLock.ts is a Wave 5 tidy-up.
const MONTHLY_REFRESH_NS = dynamicLockNamespaces.citationRunSlice + 1; // 920002

// Build provider clients lazily; same pattern as factSheetV2.ts.
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

interface StaleBrand {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  products_raw: unknown;
  target_audience: string | null;
  unique_selling_points_raw: unknown;
  key_values_raw: unknown;
  brand_voice: string | null;
  tone: string | null;
}

async function findStaleBrands(limit: number): Promise<StaleBrand[]> {
  const result = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.industry, b.description,
           b.products AS products_raw,
           b.target_audience,
           b.unique_selling_points AS unique_selling_points_raw,
           b.key_values AS key_values_raw,
           b.brand_voice, b.tone
    FROM brands b
    WHERE b.deleted_at IS NULL
      AND b.fact_scrape_enabled = true
      AND b.website IS NOT NULL
      AND b.website <> ''
      AND NOT EXISTS (
        SELECT 1 FROM brand_fact_scrape_runs r
        WHERE r.brand_id = b.id
          AND r.status NOT IN ('completed','failed','timeout','cancelled')
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM brand_fact_scrape_runs r2
          WHERE r2.brand_id = b.id AND r2.status = 'completed'
        )
        OR (
          SELECT max(completed_at) FROM brand_fact_scrape_runs r3
          WHERE r3.brand_id = b.id AND r3.status = 'completed'
        ) < now() - (${REFRESH_INTERVAL_DAYS} || ' days')::interval
      )
    ORDER BY b.created_at ASC
    LIMIT ${limit}
  `);
  return (result as unknown as { rows: StaleBrand[] }).rows;
}

function coerceArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  return [];
}

async function refreshOneBrand(brand: StaleBrand, deadlineMs: number): Promise<void> {
  const websiteRaw = brand.website ?? "";
  const normalized = normalizeHttps(websiteRaw);
  if (!normalized) {
    logger.warn({ brandId: brand.id }, "monthly-refresh: brand website not normalizable");
    return;
  }

  // Session-level advisory lock so a concurrent manual re-scrape won't
  // process the same brand simultaneously.
  const lockResult = await withDynamicAdvisoryLock(
    MONTHLY_REFRESH_NS as typeof dynamicLockNamespaces.citationRunSlice,
    brand.id,
    `monthly-refresh:${brand.id}`,
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
          triggeredBy: "cron_refresh",
        })
        .returning({ id: schema.brandFactScrapeRuns.id });
      const runId = runRows[0].id;

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
            runId,
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
        callWithFailover(providers, prompt, runId);

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
            runId,
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
              runId,
              sourceUrl: p.url,
            });
          }
          await storage.insertFactScrapeLog({
            runId,
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
          logger.warn({ err, runId, pageId: p.pageId }, "monthly-refresh: page failed");
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
          runId,
        });
        if (searchOutcome.facts.length > 0) {
          await persistFacts(searchOutcome.facts as never, {
            brandId: brand.id,
            runId,
            sourceUrl: normalized,
          });
        }
        await storage.insertFactScrapeLog({
          runId,
          source: "search_llm",
          status: searchOutcome.status,
          factCount: searchOutcome.facts.length,
          latencyMs: Date.now() - searchStart,
          errorKind: searchOutcome.errorKind ?? undefined,
          diagnostics: searchOutcome.diagnostics,
        });
      } catch (err) {
        logger.warn({ err, runId }, "monthly-refresh: search-llm failed");
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
            products: coerceArray(brand.products_raw),
            targetAudience: brand.target_audience,
            uniqueSellingPoints: coerceArray(brand.unique_selling_points_raw),
            keyValues: Array.isArray(brand.key_values_raw)
              ? (brand.key_values_raw as string[]).join(", ")
              : ((brand.key_values_raw as string | null) ?? null),
            brandVoice: brand.brand_voice,
            tone: brand.tone,
          },
          runId,
        });
        await persistUserFacts(enrichOutcome.facts, {
          brandId: brand.id,
          runId,
        });
        await storage.insertFactScrapeLog({
          runId,
          source: "user_enrich",
          status: enrichOutcome.status,
          factCount: enrichOutcome.facts.length,
          latencyMs: Date.now() - enrichStart,
          errorKind: enrichOutcome.errorKind ?? undefined,
          diagnostics: enrichOutcome.diagnostics,
        });
      } catch (err) {
        logger.warn({ err, runId }, "monthly-refresh: user-enrich failed");
      }

      // 8. Aggregate — computes terminal status, reconciles conflicts,
      //    bumps last_verified, writes run.completed_at.
      try {
        await runAggregate({ runId, brandId: brand.id });
      } catch (err) {
        logger.warn({ err, runId }, "monthly-refresh: aggregate failed");
      }
    },
  );

  if (!lockResult.ran) {
    logger.info(
      { brandId: brand.id },
      "monthly-refresh: brand locked by concurrent scrape, skipping",
    );
  }
}

export async function runMonthlyFactRefresh(deadlineMs?: number): Promise<{ processed: number }> {
  const budgetEnd = deadlineMs ?? Date.now() + 45_000;
  const stale = await findStaleBrands(MAX_BRANDS_PER_TICK);
  if (stale.length === 0) return { processed: 0 };

  let processed = 0;
  for (const brand of stale) {
    if (Date.now() >= budgetEnd) break;
    try {
      await refreshOneBrand(brand, budgetEnd);
      processed += 1;
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "monthly-refresh: brand-level error");
    }
  }
  logger.info({ processed, total: stale.length }, "monthly-fact-refresh tick complete");
  return { processed };
}
