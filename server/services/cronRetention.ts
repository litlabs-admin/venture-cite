// Cron orchestrator retention/pruning steps, extracted verbatim from
// server/routes/cron.ts as part of the B7 service-layer split.
//
// Each function is one orchestrator step's worker body. The orchestrator
// itself (Orchestrator class, STEP_CAPS_MS, `orch.run("step-name", ...)`
// call sites) stays in server/routes/cron.ts -
// tests/unit/schedulerOrchestratorParity.test.ts reads that file's source
// text directly and requires those literal call sites to remain there.

import { logger } from "../lib/logger";
import { storage } from "../storage";

// v2 lifecycle cleanup: prune stale fact-scrape rows to keep table sizes
// in check. Retention windows: pages=7d, runs=30d, logs=90d; cache and
// concurrency slots expire by their own TTL columns.
export async function runV2LifecycleCleanup(): Promise<void> {
  const pages = await storage.deleteOldFactScrapePages(7);
  const runs = await storage.deleteOldFactScrapeRuns(30);
  const logs = await storage.deleteOldFactScrapeLogs(90);
  const cache = await storage.deleteExpiredFactScrapeCache();
  const slots = await storage.deleteExpiredLlmConcurrencySlots();
  logger.info({ pages, runs, logs, cache, slots }, "v2-lifecycle-cleanup: deleted rows");
}

// Signals page retention. Two tables, two policies:
//   - geo_signal_runs: cap to 100 rows per brand (keep the most
//     recent 100 ran_at per brand_id; delete older). Plus a
//     90-day hard floor so single-brand abandoned accounts
//     don't accumulate forever.
//   - schema_audits: drop rows older than 30 days. The route's
//     7-day cache TTL already covers freshness; anything past
//     that point is dead weight (one row per unique URL).
export async function runSignalsRetentionPrune(): Promise<void> {
  const { db: cronDb } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const ninetyDays = await cronDb.execute(
    sql`DELETE FROM geo_signal_runs WHERE ran_at < now() - interval '90 days'`,
  );
  const perBrandCap = await cronDb.execute(sql`
    DELETE FROM geo_signal_runs
    WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (
          PARTITION BY brand_id ORDER BY ran_at DESC
        ) AS rn FROM geo_signal_runs
      ) ranked
      WHERE rn > 100
    )
  `);
  const schemaCleanup = await cronDb.execute(
    sql`DELETE FROM schema_audits WHERE fetched_at < now() - interval '30 days'`,
  );
  const apiCostsCleanup = await cronDb.execute(
    sql`DELETE FROM api_costs WHERE created_at < now() - interval '180 days'`,
  );
  logger.info(
    {
      signalsByAge: (ninetyDays as { rowCount?: number }).rowCount ?? 0,
      signalsByCap: (perBrandCap as { rowCount?: number }).rowCount ?? 0,
      schemaAuditsByAge: (schemaCleanup as { rowCount?: number }).rowCount ?? 0,
      apiCostsByAge: (apiCostsCleanup as { rowCount?: number }).rowCount ?? 0,
    },
    "signals-retention-prune: rows deleted",
  );
}

// Phase 1 retention: 90-day rolling window on fact_scrape_events.
// Prevents unbounded growth. Keeping recent events is cheap
// (~100 events/run × 50 runs/day × 90 days ≈ 450K rows).
export async function runFactScrapeEventsPrune(): Promise<void> {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const result = await db.execute(
    sql`DELETE FROM fact_scrape_events WHERE created_at < now() - interval '90 days'`,
  );
  const deleted = (result as { rowCount?: number }).rowCount ?? 0;
  logger.info({ deleted }, "fact-scrape-events-prune: rows deleted");
}

// Vercel-Hobby LLM-jobs substrate. The mutation routes (keyword
// discovery, FAQ generation, etc.) enqueue an llm_jobs row whose
// OpenAI Responses run executes in background mode. The client
// polls /api/llm-jobs/:id. If the client never comes back (closed
// tab, mobile sleep), the cron drains the row so the user sees the
// result on next visit. Bounded by step cap.
export async function runLlmJobsDrainStep(deadline: number): Promise<void> {
  const { drainPendingLlmJobs } = await import("../lib/llmJobs");
  const counters = await drainPendingLlmJobs(deadline);
  logger.info({ counters }, "llm-jobs-drain: counters");
}

// Prune expired llm_jobs rows (24h default). Keeps the table small.
export async function runLlmJobsPruneStep(): Promise<void> {
  const { pruneExpiredLlmJobs } = await import("../lib/llmJobs");
  const deleted = await pruneExpiredLlmJobs();
  logger.info({ deleted }, "llm-jobs-prune: rows deleted");
}
