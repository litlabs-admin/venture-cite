// Postgres advisory-lock wrapper for cron jobs. Prevents two scheduler
// instances (horizontal scale, container restart overlap) from running the
// same job body simultaneously — one instance acquires the lock, others
// see "busy" and skip the tick.
import { pool } from "../db";
import { logger } from "./logger";

// Stable int8 keys per job. Keep these constants small and well-known so
// they're easy to find in pg_locks during debugging.
export const lockKeys = {
  competitorDiscovery: 910001,
  factRefresh: 910002,
  mentionScan: 910003,
  listicleScan: 910004,
  metricsSnapshot: 910005,
  automationEvaluator: 910006,
} as const;

export type LockKey = (typeof lockKeys)[keyof typeof lockKeys];

// Runs `fn` holding a session-level advisory lock for `key`. If another
// process already holds the lock, resolves with `{ ran: false }` and does
// NOT invoke fn — the caller should treat this as a successful skip.
export async function withAdvisoryLock<T>(
  key: LockKey,
  label: string,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
      [key],
    );
    const acquired = rows[0]?.pg_try_advisory_lock === true;
    if (!acquired) {
      logger.info({ lockKey: key, label }, "advisory-lock: busy, skipping");
      return { ran: false };
    }
    try {
      const result = await fn();
      return { ran: true, result };
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [key]);
      } catch (err) {
        logger.warn({ err, lockKey: key, label }, "advisory-lock: unlock failed");
      }
    }
  } finally {
    client.release();
  }
}
