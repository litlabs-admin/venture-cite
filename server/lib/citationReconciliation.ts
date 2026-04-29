// Wave 9: orphan-run reconciliation.
//
// Without this, a server crash mid-`runBrandPrompts` leaves the citation_runs
// row pinned at status='running' forever. Every dependent page then sees
// `hasActive=true` and polls indefinitely, *and* the per-brand dedup index
// (migration 0035) blocks any new runs for that brand. This runs once on
// boot to mark stale rows failed before the polling hooks ever see them.

import { pool } from "../db";
import { logger } from "./logger";

const ORPHAN_THRESHOLD = "15 minutes";

export async function reconcileOrphanCitationRuns(): Promise<void> {
  try {
    const result = await pool.query(`
      UPDATE citation_runs
         SET status = 'failed',
             error_message = 'orphaned by restart',
             completed_at = COALESCE(completed_at, NOW()),
             progress_pct = 100
       WHERE status IN ('pending', 'running')
         AND started_at < NOW() - INTERVAL '${ORPHAN_THRESHOLD}'
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
    // Don't crash the boot sequence over this — worst case is the partial
    // unique index keeps blocking new runs until manual cleanup.
  }
}
