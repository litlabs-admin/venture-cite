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
  factScrapeFailureDetect: 910007,
} as const;

export type LockKey = (typeof lockKeys)[keyof typeof lockKeys];

// Hashes an arbitrary string (e.g. a run UUID) into the (int4, int4)
// keyspace Postgres advisory locks accept. The two-key form lets us keep
// the namespace ID separate from the entity ID so different lock domains
// can't accidentally collide.
function stringToInt32(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // Force into signed int32 range.
  return hash | 0;
}

// Per-entity advisory lock keyed by a stable namespace + a string ID
// (typically a UUID). Used for "only one slice of citation run X in
// flight at a time" — Vercel can spawn many concurrent /advance calls
// for the same run, and without this guard they race on the same
// (run, prompt, platform) pairs and produce duplicate geo_rankings rows.
export const dynamicLockNamespaces = {
  citationRunSlice: 920001,
  // Per-brand lock around the full v2 fact-scrape pipeline. Shared by the
  // monthly refresh cron and the onboarding activation pipeline so a
  // manual re-scrape, the cron, and first-run activation can't all scrape
  // the same brand at once.
  fullBrandScrape: 920002,
} as const;

export type DynamicLockNamespace =
  (typeof dynamicLockNamespaces)[keyof typeof dynamicLockNamespaces];

export async function withDynamicAdvisoryLock<T>(
  namespace: DynamicLockNamespace,
  entityId: string,
  label: string,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const client = await pool.connect();
  const key2 = stringToInt32(entityId);
  try {
    const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS pg_try_advisory_lock",
      [namespace, key2],
    );
    const acquired = rows[0]?.pg_try_advisory_lock === true;
    if (!acquired) {
      logger.info({ namespace, entityId, label }, "advisory-lock: busy, skipping");
      return { ran: false };
    }
    try {
      const result = await fn();
      return { ran: true, result };
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [namespace, key2]);
      } catch (err) {
        logger.warn({ err, namespace, entityId, label }, "advisory-lock: unlock failed");
      }
    }
  } finally {
    client.release();
  }
}

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
