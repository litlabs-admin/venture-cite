// V2 fact-sheet refresh. Picks brands that haven't completed a scrape in
// REFRESH_INTERVAL_DAYS and runs the full pipeline inline. Vercel 60s function
// ceiling limits us to ~3-5 brands per cron tick; subsequent ticks pick up the
// next batch via the "completed_at IS NULL OR completed_at < interval"
// ordering.
//
// Was monthly (and named for it) until the fact sheet moved to the same weekly
// rhythm as the citation run - see REFRESH_INTERVAL_DAYS.
//
// The pipeline body lives in runFullScrape.ts (shared with onboarding
// activation); this file only selects stale brands and maps each raw
// SQL row into the pipeline's input shape.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { logger } from "../../logger";
import { runFullScrapeForBrand } from "./runFullScrape";
import { cronStepBudget } from "./vercelBudget";

// Weekly, not monthly. The fact sheet is what grounds hallucination
// detection: detectHallucinationsForRun skips entirely when a brand has no
// facts, so a stale or missing fact sheet silently emptied the dashboard's
// Hallucinations panel no matter how many citation runs completed. Refreshing
// on the same weekly rhythm as the citation run keeps the two in step.
//
// Cost note: this is 4x the previous scrape volume. MAX_BRANDS_PER_TICK
// bounds it per tick, not per week - see the ceiling comment below.
const REFRESH_INTERVAL_DAYS = 7;
// ponytail: 3 brands/tick against an hourly cron is a ~72 brands/day ceiling.
// Raise this, not the schedule, if the brand count ever outgrows it - the
// staleness query already orders oldest-first, so the backlog drains in order.
const MAX_BRANDS_PER_TICK = 3;
// On Pro (60s) this resolves to ~46s. On Hobby (10s) it shrinks to
// ~7s so the cron step doesn't overrun the function timeout.
const DEFAULT_REFRESH_BUDGET_MS = cronStepBudget(0.8);

// A brand whose site is permanently unreachable never produces a 'completed'
// run - every attempt terminates 'failed' - so the staleness query below
// ("no completed run, or the last one is stale") stayed true for it forever.
// Nothing counted attempts, so it was re-selected and given a full six-source
// re-scrape on every single tick, without end. Mirrors the shape of
// AUTOPILOT_MAX_ATTEMPTS / AUTOPILOT_RETRY_BACKOFF_MINUTES in
// onboardingAutopilot.ts: a small cap on consecutive terminal failures, plus a
// backoff between attempts below that cap. See .audit/B6/B6a-07 for the trace.
//
// Deliberately small - same reasoning as the autopilot cap: this exists to
// survive a transient failure (a 5xx, a flaky DNS lookup), not to grind on a
// brand that is durably broken (dead domain, robots blocking everything).
export const FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES = 3;
// Wait between retries of a brand below the cap. Long enough that a
// transient outage has a real chance to clear before another full six-source
// scrape is spent checking again.
export const FACT_SCRAPE_RETRY_BACKOFF_HOURS = 24;
// Headroom for the retry gate below to filter candidates out and still leave
// enough real candidates to fill MAX_BRANDS_PER_TICK. The brand table this
// query runs against is small (tens of rows), so this is effectively "fetch
// everything currently stale," not a meaningful production tuning knob.
const MAX_CANDIDATE_ROWS = 200;

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

interface RecentRunRow {
  status: string;
  hours_since_started: number | string;
}

interface StaleBrandRow extends StaleBrand {
  recent_runs: RecentRunRow[] | null;
}

export interface RecentRunSummary {
  status: string;
  hoursSinceStarted: number;
}

/**
 * Decides whether a brand may be given another scrape attempt this tick.
 *
 * `recentRuns` must be ordered most-recent-first and hold at most
 * FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES entries (the query below enforces
 * this). A single non-'failed' run - most commonly 'completed' - anywhere at
 * the front of the list breaks the streak, so a brand that succeeds resets
 * to fully eligible: one bad week does not permanently disable it.
 */
export function isRetryEligible(recentRuns: RecentRunSummary[]): {
  eligible: boolean;
  reason?: "cap" | "backoff";
} {
  let consecutiveFailures = 0;
  for (const run of recentRuns) {
    if (run.status !== "failed") break;
    consecutiveFailures += 1;
  }
  if (consecutiveFailures >= FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES) {
    return { eligible: false, reason: "cap" };
  }
  if (
    consecutiveFailures > 0 &&
    recentRuns[0].hoursSinceStarted < FACT_SCRAPE_RETRY_BACKOFF_HOURS
  ) {
    return { eligible: false, reason: "backoff" };
  }
  return { eligible: true };
}

export async function findStaleBrands(limit: number): Promise<StaleBrand[]> {
  const result = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.industry, b.description,
           b.products AS products_raw,
           b.target_audience,
           b.unique_selling_points AS unique_selling_points_raw,
           b.key_values AS key_values_raw,
           b.brand_voice, b.tone,
           COALESCE(
             (
               SELECT json_agg(
                        json_build_object(
                          'status', t.status,
                          'hours_since_started', t.hours_since_started
                        )
                        ORDER BY t.started_at DESC
                      )
               FROM (
                 SELECT r4.status, r4.started_at,
                        EXTRACT(EPOCH FROM (now() - r4.started_at)) / 3600.0 AS hours_since_started
                 FROM brand_fact_scrape_runs r4
                 WHERE r4.brand_id = b.id
                 ORDER BY r4.started_at DESC
                 LIMIT ${FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES}
               ) t
             ),
             '[]'::json
           ) AS recent_runs
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
    LIMIT ${MAX_CANDIDATE_ROWS}
  `);
  const rows = (result as unknown as { rows: StaleBrandRow[] }).rows;

  const excludedByCap: string[] = [];
  const eligible: StaleBrand[] = [];
  for (const row of rows) {
    const recentRuns: RecentRunSummary[] = (row.recent_runs ?? []).map((r) => ({
      status: r.status,
      hoursSinceStarted: Number(r.hours_since_started),
    }));
    const gate = isRetryEligible(recentRuns);
    if (!gate.eligible) {
      if (gate.reason === "cap") excludedByCap.push(row.id);
      continue;
    }
    const { recent_runs: _recentRuns, ...brand } = row;
    eligible.push(brand);
    if (eligible.length >= limit) break;
  }

  if (excludedByCap.length > 0) {
    logger.warn(
      { brandIds: excludedByCap, maxConsecutiveFailures: FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES },
      "fact-sheet-refresh: brand excluded from cron refresh - too many consecutive scrape failures",
    );
  }

  return eligible;
}

function coerceArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  return [];
}

async function refreshOneBrand(brand: StaleBrand, deadlineMs: number): Promise<void> {
  await runFullScrapeForBrand(
    {
      id: brand.id,
      name: brand.name,
      website: brand.website,
      industry: brand.industry,
      description: brand.description,
      products: coerceArray(brand.products_raw),
      targetAudience: brand.target_audience,
      uniqueSellingPoints: coerceArray(brand.unique_selling_points_raw),
      keyValues: Array.isArray(brand.key_values_raw)
        ? (brand.key_values_raw as string[]).join(", ")
        : ((brand.key_values_raw as string | null) ?? null),
      brandVoice: brand.brand_voice,
      tone: brand.tone,
    },
    deadlineMs,
    "cron_refresh",
  );
}

export async function runFactSheetRefresh(deadlineMs?: number): Promise<{ processed: number }> {
  const budgetEnd = deadlineMs ?? Date.now() + DEFAULT_REFRESH_BUDGET_MS;
  const stale = await findStaleBrands(MAX_BRANDS_PER_TICK);
  if (stale.length === 0) return { processed: 0 };

  let processed = 0;
  for (const brand of stale) {
    if (Date.now() >= budgetEnd) break;
    try {
      await refreshOneBrand(brand, budgetEnd);
      processed += 1;
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "fact-sheet-refresh: brand-level error");
    }
  }
  logger.info({ processed, total: stale.length }, "fact-sheet-refresh tick complete");
  return { processed };
}
