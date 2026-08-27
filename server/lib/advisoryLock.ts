// Database lease wrapper for cron jobs. Prevents two scheduler instances
// (horizontal scale, container restart overlap) from running the same job
// body simultaneously - one instance acquires the lease, others see "busy"
// and skip the tick.
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { logger } from "./logger";

const JOB_LEASE_TTL_SECONDS = 60;

// Stable numeric components per job. Keep these constants small and
// well-known so lease key derivation remains stable across deployments.
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

// Hashes an arbitrary string (e.g. a run UUID) into a stable int32. The
// namespace and this value preserve the dynamic lock identity used before
// the lease-table migration.
function stringToInt32(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // Force into signed int32 range.
  return hash | 0;
}

// Per-entity lease keyed by a stable namespace + a string ID
// (typically a UUID). Used for "only one slice of citation run X in
// flight at a time" - Vercel can spawn many concurrent /advance calls
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

export async function withJobLease<T>(
  leaseKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const holderToken = randomUUID();
  const leaseDuration = `${ttlSeconds} seconds`;
  const { rows } = await pool.query<{ holder_token: string }>(
    `insert into job_leases (lease_key, holder_token, expires_at)
     values ($1, $2, now() + $3::interval)
     on conflict (lease_key) do update
       set holder_token = excluded.holder_token,
           acquired_at = now(),
           heartbeat_at = now(),
           expires_at = excluded.expires_at
       where job_leases.expires_at < now()
     returning holder_token`,
    [leaseKey, holderToken, leaseDuration],
  );
  if (rows.length === 0) return null;

  const renewalIntervalMs = Math.max(250, Math.floor((ttlSeconds * 1_000) / 3) - 1);
  let stopped = false;
  let renewalPending = false;
  const renew = async () => {
    if (stopped || renewalPending) return;
    renewalPending = true;
    try {
      const result = await pool.query(
        `update job_leases
         set expires_at = now() + $3::interval,
             heartbeat_at = now()
         where lease_key = $1 and holder_token = $2`,
        [leaseKey, holderToken, leaseDuration],
      );
      if (result.rowCount !== 1) {
        stopped = true;
        clearInterval(renewalTimer);
        logger.warn({ leaseKey }, "job-lease: lease lost while renewing");
      }
    } catch (err) {
      logger.warn({ err, leaseKey }, "job-lease: renewal failed");
    } finally {
      renewalPending = false;
    }
  };
  const renewalTimer = setInterval(() => {
    void renew();
  }, renewalIntervalMs);
  renewalTimer.unref();

  try {
    return await fn();
  } finally {
    stopped = true;
    clearInterval(renewalTimer);
    try {
      await pool.query("delete from job_leases where lease_key = $1 and holder_token = $2", [
        leaseKey,
        holderToken,
      ]);
    } catch (err) {
      logger.warn({ err, leaseKey }, "job-lease: release failed");
    }
  }
}

function dynamicLeaseKey(namespace: DynamicLockNamespace, entityId: string): string {
  return `job-lease:dynamic:${namespace}:${stringToInt32(entityId)}`;
}

function staticLeaseKey(key: LockKey): string {
  return `job-lease:static:${key}`;
}

export async function withDynamicAdvisoryLock<T>(
  namespace: DynamicLockNamespace,
  entityId: string,
  label: string,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const result = await withJobLease(
    dynamicLeaseKey(namespace, entityId),
    JOB_LEASE_TTL_SECONDS,
    fn,
  );
  if (result === null) {
    logger.info({ namespace, entityId, label }, "advisory-lock: busy, skipping");
    return { ran: false };
  }
  return { ran: true, result };
}

// Runs `fn` holding a pooler-safe lease derived from `key`. If another
// process already holds the lease, resolves with `{ ran: false }` and does
// NOT invoke fn - the caller should treat this as a successful skip.
export async function withAdvisoryLock<T>(
  key: LockKey,
  label: string,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const result = await withJobLease(staticLeaseKey(key), JOB_LEASE_TTL_SECONDS, fn);
  if (result === null) {
    logger.info({ lockKey: key, label }, "advisory-lock: busy, skipping");
    return { ran: false };
  }
  return { ran: true, result };
}
