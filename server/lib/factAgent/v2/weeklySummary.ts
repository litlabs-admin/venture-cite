// Weekly observability summary. Reads fact_scrape_logs for the past 7 days
// and emits a single info log capturing health metrics. Operators query
// the log stream (or Sentry breadcrumbs) for the `fact_scrape_v2_weekly_summary`
// event to see weekly health at a glance.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { logger } from "../../logger";

export interface SourceStats {
  source: string;
  totalRuns: number;
  doneRuns: number;
  failedRuns: number;
  skippedRuns: number;
  totalFacts: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface WeeklySummaryResult {
  sources: SourceStats[];
  topErrorKinds: Array<{ errorKind: string; count: number }>;
  consistentlyEmptyBrands: Array<{ brandId: string; emptyRunCount: number }>;
}

interface PgResult<T> {
  rows: T[];
}

export async function runWeeklySummary(): Promise<WeeklySummaryResult> {
  const perSourceRows = await db.execute(sql`
    SELECT
      source,
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE status = 'done')::int AS done_runs,
      count(*) FILTER (WHERE status = 'failed')::int AS failed_runs,
      count(*) FILTER (WHERE status = 'skipped')::int AS skipped_runs,
      coalesce(sum(fact_count), 0)::int AS total_facts,
      coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
    FROM fact_scrape_logs
    WHERE created_at >= now() - interval '7 days'
      AND source IN ('static_pages','search_llm','user_enrich','aggregate','paste')
    GROUP BY source
    ORDER BY source
  `);
  const sources: SourceStats[] = (
    perSourceRows as unknown as PgResult<{
      source: string;
      total_runs: number;
      done_runs: number;
      failed_runs: number;
      skipped_runs: number;
      total_facts: number;
      avg_latency_ms: number;
    }>
  ).rows.map((r) => ({
    source: r.source,
    totalRuns: r.total_runs,
    doneRuns: r.done_runs,
    failedRuns: r.failed_runs,
    skippedRuns: r.skipped_runs,
    totalFacts: r.total_facts,
    avgLatencyMs: r.avg_latency_ms,
    successRate: r.total_runs > 0 ? r.done_runs / r.total_runs : 0,
  }));

  const errorRows = await db.execute(sql`
    SELECT error_kind, count(*)::int AS count
    FROM fact_scrape_logs
    WHERE created_at >= now() - interval '7 days'
      AND error_kind IS NOT NULL
    GROUP BY error_kind
    ORDER BY count DESC
    LIMIT 10
  `);
  const topErrorKinds = (
    errorRows as unknown as PgResult<{ error_kind: string; count: number }>
  ).rows.map((r) => ({ errorKind: r.error_kind, count: r.count }));

  const emptyBrandRows = await db.execute(sql`
    SELECT r.brand_id, count(*)::int AS empty_run_count
    FROM brand_fact_scrape_runs r
    WHERE r.error_kind = 'all_sources_empty'
      AND r.completed_at >= now() - interval '7 days'
    GROUP BY r.brand_id
    HAVING count(*) >= 3
    ORDER BY count(*) DESC
    LIMIT 20
  `);
  const consistentlyEmptyBrands = (
    emptyBrandRows as unknown as PgResult<{ brand_id: string; empty_run_count: number }>
  ).rows.map((r) => ({ brandId: r.brand_id, emptyRunCount: r.empty_run_count }));

  const result: WeeklySummaryResult = { sources, topErrorKinds, consistentlyEmptyBrands };

  logger.info(
    {
      event: "fact_scrape_v2_weekly_summary",
      sources: result.sources,
      topErrorKinds: result.topErrorKinds,
      consistentlyEmptyBrands: result.consistentlyEmptyBrands,
      window: "7d",
    },
    "fact-scrape v2 weekly summary",
  );

  return result;
}
