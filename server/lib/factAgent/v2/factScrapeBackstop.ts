// Cron backstop for runs the client abandoned mid-flight.
// Schedule: every 5 minutes (Vercel cron). Per tick:
//   1. Write cron_last_fired_at to system_state (dead-man's switch).
//   2. Find stale runs: non-terminal + last_advance_at < now-60s + retry_count < 10.
//   3. For each stale run: wrap in BEGIN; pg_try_advisory_xact_lock(brandId);
//      runAggregate; increment retry_count; COMMIT. (Transaction-level lock
//      auto-releases on crash.)
//   4. Mark runs that hit MAX_RETRIES as 'failed' with errorKind='max_retries_exceeded'.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { runAggregate } from "./aggregate";

const STALE_AFTER_MS = 60_000;
const MAX_RETRIES = 10;
const MAX_RUNS_PER_TICK = 20;
const DEAD_MAN_KEY = "fact_scrape_backstop_last_fired_at";

interface StaleRunRow {
  id: string;
  brand_id: string;
  retry_count: number;
}

export async function runFactScrapeBackstop(): Promise<{ processed: number }> {
  // Dead-man's switch.
  const prevFired = (await storage.getSystemState(DEAD_MAN_KEY)) as { iso: string } | null;
  if (prevFired?.iso) {
    const ageMs = Date.now() - new Date(prevFired.iso).getTime();
    if (ageMs > 10 * 60_000) {
      logger.error(
        { ageMs, prevFiredAt: prevFired.iso },
        "fact_scrape_backstop: previous cron tick was stale — cron may have stopped",
      );
    }
  }
  await storage.setSystemState(DEAD_MAN_KEY, { iso: new Date().toISOString() });

  // Find stale runs.
  const stale = await db.execute(sql`
    SELECT r.id, r.brand_id, r.retry_count
    FROM brand_fact_scrape_runs r
    JOIN brands b ON b.id = r.brand_id
    WHERE r.status NOT IN ('completed','failed','timeout','cancelled')
      AND r.last_advance_at < now() - (${STALE_AFTER_MS} || ' milliseconds')::interval
      AND COALESCE(r.retry_count, 0) < ${MAX_RETRIES}
      AND (b.fact_scrape_enabled = true OR b.fact_scrape_enabled IS NULL)
    ORDER BY r.last_advance_at ASC
    LIMIT ${MAX_RUNS_PER_TICK}
  `);
  const rows = (stale as unknown as { rows: StaleRunRow[] }).rows;
  if (rows.length === 0) return { processed: 0 };

  let processed = 0;
  for (const row of rows) {
    try {
      await db.transaction(async (tx) => {
        const lockRes = await tx.execute(sql`
          SELECT pg_try_advisory_xact_lock(hashtext('fact-scrape:' || ${row.brand_id})::bigint) AS got
        `);
        const got = (lockRes as unknown as { rows: Array<{ got: boolean }> }).rows[0]?.got === true;
        if (!got) return; // another tick / client holds the lock

        await runAggregate({ runId: row.id, brandId: row.brand_id });

        await tx.execute(sql`
          UPDATE brand_fact_scrape_runs
          SET retry_count = COALESCE(retry_count, 0) + 1,
              last_advance_at = now()
          WHERE id = ${row.id}
        `);
      });
      processed += 1;
    } catch (err) {
      logger.warn(
        { err, runId: row.id, brandId: row.brand_id },
        "fact_scrape_backstop: per-run failure",
      );
    }
  }

  // Mark runs that hit MAX_RETRIES as terminal-failed.
  await db.execute(sql`
    UPDATE brand_fact_scrape_runs
    SET status = 'failed',
        error_kind = 'max_retries_exceeded',
        completed_at = now()
    WHERE COALESCE(retry_count, 0) >= ${MAX_RETRIES}
      AND status NOT IN ('completed','failed','timeout','cancelled')
  `);

  return { processed };
}
