// Orphan-run reconciliation.
//
// Without this, a server crash mid-`runBrandPrompts` leaves the citation_runs
// row pinned at status='running' forever. Every dependent page then sees
// `hasActive=true` and polls indefinitely, *and* the per-brand dedup index
// (migration 0035) blocks any new runs for that brand. This runs once on
// boot to mark stale rows failed before the polling hooks ever see them.

import { pool } from "../db";
import { logger } from "./logger";

// Staleness is judged against last_advance_started_at (migration 0123), not
// started_at. citation_runs is slice-based (server/citationChecker.ts): a
// healthy run's worker loop stamps last_advance_started_at every time it
// actually persists progress (bumpCitationRunProgress), so it legitimately
// stays 'running' - and keeps refreshing this column - across many ticks. A
// threshold compared against started_at instead measures total run age, not
// staleness: measured against 449 production runs that completed
// successfully, 38.5% took longer than the previous 5-minute threshold. See
// .audit/B6/B6a-12-citation-run-staleness.md.
//
// Threshold derivation: AUTO_CITATION_CRON (server/scheduler.ts) fires
// hourly, and a run that is only waiting for its next scheduled slice - not
// dead - can legitimately sit untouched for up to that full 60-minute tick
// interval. cronStepBudget's derived slice budgets
// (server/lib/factAgent/v2/vercelBudget.ts) and the external orchestrator's
// own total budget (CRON_ORCHESTRATOR_BUDGET_MS=900000 in render.yaml, i.e.
// 15 minutes) are both well inside that hour, so 60 minutes is already the
// longest legitimate gap anywhere in this codebase's cron design. 240
// minutes (4 hours) gives that a 4x margin, and also clears the slowest of
// the 449 measured successful runs (175.58 minutes total elapsed) with
// margin to spare - so even a row whose last_advance_started_at is NULL and
// falls back to started_at (see below) does not misjudge that historical
// worst case as dead.
//
// Exported as a ms constant too: server/citationChecker.ts reuses this exact
// threshold at run-CREATION time (an automatic caller with a stale active
// row reaps it inline instead of waiting for this boot-time/daily sweep to
// get around to it - see citationChecker.ts's runBrandPrompts). Single
// source of truth for "how old since last progress is definitely-dead" for
// this table - the two reap sites must never drift apart.
const STALE_SINCE_LAST_PROGRESS_MINUTES = 240;
const STALE_SINCE_LAST_PROGRESS_INTERVAL = `${STALE_SINCE_LAST_PROGRESS_MINUTES} minutes`;
export const STALE_SINCE_LAST_PROGRESS_MS = STALE_SINCE_LAST_PROGRESS_MINUTES * 60_000;

// Shared decision used by BOTH reap sites - this boot-time/daily sweep's SQL
// (via STALE_SINCE_LAST_PROGRESS_MS, mirrored into the interval above) and
// server/citationChecker.ts's inline reap (calls this function directly).
// One function instead of two independent age comparisons means the two
// sites cannot silently drift apart on which timestamp they read or how
// they fall back when it's NULL.
export function isRunStaleSinceLastProgress(
  run: { startedAt: Date | string; lastAdvanceStartedAt: Date | string | null },
  now: number = Date.now(),
): boolean {
  const lastProgressAt = run.lastAdvanceStartedAt ?? run.startedAt;
  const ageMs = now - new Date(lastProgressAt).getTime();
  return ageMs >= STALE_SINCE_LAST_PROGRESS_MS;
}

export async function reconcileOrphanCitationRuns(): Promise<void> {
  try {
    // COALESCE to started_at when last_advance_started_at is NULL - a row
    // created before migration 0123, or one reaped/created in the instant
    // before its first progress stamp. That reproduces exactly the old
    // (started_at-only) judgment for that row, until it either gets a real
    // last_advance_started_at or ages out under this same threshold anyway.
    const result = await pool.query(`
      UPDATE citation_runs
         SET status = 'failed',
             error_message = 'orphaned by restart',
             completed_at = COALESCE(completed_at, NOW()),
             progress_pct = 100
       WHERE status IN ('pending', 'running')
         AND COALESCE(last_advance_started_at, started_at)
             < NOW() - INTERVAL '${STALE_SINCE_LAST_PROGRESS_INTERVAL}'
       RETURNING id, brand_id
    `);
    if (result.rowCount && result.rowCount > 0) {
      logger.warn(
        {
          count: result.rowCount,
          ids: result.rows.map((r) => r.id),
        },
        "citation.runs.orphaned_reconciled",
      );
    }
  } catch (err) {
    logger.error({ err }, "citation.runs.orphan_reconciliation_failed");
    // Don't crash the boot sequence over this - worst case is the partial
    // unique index keeps blocking new runs until manual cleanup.
  }
}
