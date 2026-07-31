// Wave 9.5 / Vercel migration: Postgres-backed token-bucket rate limits.
//
// Previously a process-local Map (single-instance only). On serverless,
// per-lambda Maps make the limit per-lambda instead of global, so users
// can multiply their effective quota by N×concurrent lambdas. This module
// now stores bucket state in `rate_limit_buckets` (migration 0043) and
// uses SELECT ... FOR UPDATE to atomically refill+decrement.
//
// API stays the same; tryAcquire and secondsUntilAvailable became async.
// Mention/listicle scanners and tests already await acquireOrWait.

import { pool } from "../db";
import { logger } from "./logger";

interface BucketConfig {
  /** Max tokens the bucket can hold. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
}

const CONFIGS: Record<string, BucketConfig> = {
  // Reddit unauth: ~10 req/min. Refill 1 token / 6 s; bucket of 10 so
  // a fresh user gets a small burst before throttling kicks in.
  reddit: { capacity: 10, refillPerSec: 1 / 6 },
  // Wikipedia: be conservative per their User-Agent policy. Bucket
  // ample but refill is steady.
  wikipedia: { capacity: 30, refillPerSec: 5 },
  // Hacker News (Algolia): generous, but cap to avoid surprise spikes.
  hackernews: { capacity: 30, refillPerSec: 5 },
  // Manual-add: 10 per user per minute (1 token per 6 seconds).
  "manual-add": { capacity: 10, refillPerSec: 10 / 60 },
  // 2026-05-27: split the legacy `manual-discovery` bucket into one
  // bucket PER feature. The shared bucket had capacity 3 - touching any 3
  // of {Listicles, Wikipedia, FAQ generate, Keyword discover} in a brand
  // session within 4 minutes rate-limited ALL four, which the user
  // experienced as "broken." Per-feature buckets isolate the cost of
  // each action: hit the FAQ limit and the others remain available.
  // Capacity 10, refill 1 / 20 s ≈ 3 per minute steady state with a 10-
  // burst headroom - enough for a power user to run several scans in a
  // row but still capped against runaway re-clicks.
  "discover-listicles": { capacity: 10, refillPerSec: 1 / 20 },
  "scan-wikipedia": { capacity: 10, refillPerSec: 1 / 20 },
  "generate-faqs": { capacity: 10, refillPerSec: 1 / 20 },
  "discover-keywords": { capacity: 10, refillPerSec: 1 / 20 },
  // Kept for backwards compatibility - anywhere still passing
  // "manual-discovery" gets the same generous shape as the per-feature
  // buckets above. Should be removable after a grep confirms no callers.
  "manual-discovery": { capacity: 10, refillPerSec: 1 / 20 },
};

function applyRefill(tokens: number, lastRefill: Date, cfg: BucketConfig, now: number): number {
  const elapsedSec = (now - lastRefill.getTime()) / 1000;
  // 2026-05-28: self-heal clock-skew corruption. If `last_refill_at` is in
  // the FUTURE (negative elapsed) - which happens when the DB and the app
  // server clocks are skewed, or when a previous bug persisted a bad
  // timestamp - the old code returned `tokens` unchanged. A row stuck at
  // tokens=0 with a future last_refill_at would stay stuck FOREVER (the
  // refill curve never advances). Treat negative elapsed as "clock skew /
  // bad state" and reset the bucket to full capacity.
  if (elapsedSec < -1) return cfg.capacity;
  if (elapsedSec <= 0) return tokens;
  // 2026-05-28: also self-heal "stuck-at-zero" rows. If enough wall time
  // has elapsed for the bucket to be at FULL capacity (2× the full-fill
  // duration, as a margin), but tokens is still pathologically low
  // (< 0.1), the refill math must have been skipped on a prior UPDATE
  // (e.g. a deploy mid-transaction). Snap back to capacity.
  const fullFillSec = cfg.capacity / cfg.refillPerSec;
  if (elapsedSec > fullFillSec * 2 && tokens < 0.1) return cfg.capacity;
  return Math.min(cfg.capacity, tokens + elapsedSec * cfg.refillPerSec);
}

/**
 * Try to acquire 1 token immediately. Returns true if acquired, false
 * if the bucket is empty. Atomic via SELECT ... FOR UPDATE so concurrent
 * lambdas can't double-spend.
 */
export async function tryAcquire(provider: string, scopeId: string): Promise<boolean> {
  const cfg = CONFIGS[provider];
  if (!cfg) return true; // unknown provider: don't gate

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Initialise the row at full capacity on first use; ON CONFLICT
    // makes the insert a no-op when the row already exists.
    await client.query(
      `INSERT INTO rate_limit_buckets (provider, scope_id, tokens, last_refill_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (provider, scope_id) DO NOTHING`,
      [provider, scopeId, cfg.capacity],
    );
    const { rows } = await client.query<{
      tokens: string;
      last_refill_at: Date;
    }>(
      `SELECT tokens::text, last_refill_at
       FROM rate_limit_buckets
       WHERE provider = $1 AND scope_id = $2
       FOR UPDATE`,
      [provider, scopeId],
    );
    if (rows.length === 0) {
      // Race: another tx deleted the row between insert and select. Treat
      // as "no capacity" rather than re-inserting; next call will retry.
      await client.query("ROLLBACK");
      return false;
    }
    const now = Date.now();
    const refilled = applyRefill(
      Number(rows[0].tokens),
      new Date(rows[0].last_refill_at),
      cfg,
      now,
    );
    if (refilled < 1) {
      // Persist the refill so secondsUntilAvailable() returns a meaningful
      // ETA even though the acquire failed.
      await client.query(
        `UPDATE rate_limit_buckets
         SET tokens = $3, last_refill_at = to_timestamp($4 / 1000.0)
         WHERE provider = $1 AND scope_id = $2`,
        [provider, scopeId, refilled, now],
      );
      await client.query("COMMIT");
      return false;
    }
    const remaining = refilled - 1;
    await client.query(
      `UPDATE rate_limit_buckets
       SET tokens = $3, last_refill_at = to_timestamp($4 / 1000.0)
       WHERE provider = $1 AND scope_id = $2`,
      [provider, scopeId, remaining, now],
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore - original error is what matters
    }
    logger.warn({ err, provider, scopeId }, "rateLimit: tryAcquire failed");
    // Fail-open on infrastructure errors: better to over-call upstream
    // briefly than to wedge every scan when the DB hiccups.
    return true;
  } finally {
    client.release();
  }
}

/**
 * Acquire a token, waiting up to `maxWaitMs` for capacity. Returns
 * true if a token was acquired, false on timeout.
 *
 * 2026-05-27: callers passing `maxWaitMs=0` (the "try once, don't wait"
 * pattern used by every manual-discovery handler) were getting `false`
 * unconditionally - the `while (elapsed < maxWaitMs)` loop body never
 * executed when maxWaitMs was 0, so `tryAcquire` was never called and
 * the bucket state never changed. Users saw "rate limited - try again
 * in ~0s" on the first click of Listicles/Wikipedia/Keywords/FAQ since
 * the routes were written. Fix: always attempt one acquire BEFORE
 * entering the wait loop, so maxWaitMs=0 cleanly means "no waiting,
 * one try" instead of "no attempt at all."
 */
export async function acquireOrWait(
  provider: string,
  scopeId: string,
  maxWaitMs = 30_000,
): Promise<boolean> {
  const cfg = CONFIGS[provider];
  if (!cfg) return true;
  // First attempt always happens, regardless of maxWaitMs.
  if (await tryAcquire(provider, scopeId)) return true;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const waitMs = Math.max(50, Math.ceil(1000 / cfg.refillPerSec));
    const remaining = maxWaitMs - (Date.now() - start);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, Math.max(0, remaining))));
    if (await tryAcquire(provider, scopeId)) return true;
  }
  return false;
}

/**
 * Estimate seconds until at least one token will be available. Reads the
 * persisted bucket state and applies the refill curve in JS - does NOT
 * mutate the row.
 */
export async function secondsUntilAvailable(provider: string, scopeId: string): Promise<number> {
  const cfg = CONFIGS[provider];
  if (!cfg) return 0;
  try {
    const { rows } = await pool.query<{
      tokens: string;
      last_refill_at: Date;
    }>(
      `SELECT tokens::text, last_refill_at
       FROM rate_limit_buckets
       WHERE provider = $1 AND scope_id = $2`,
      [provider, scopeId],
    );
    if (rows.length === 0) return 0;
    const refilled = applyRefill(
      Number(rows[0].tokens),
      new Date(rows[0].last_refill_at),
      cfg,
      Date.now(),
    );
    if (refilled >= 1) return 0;
    return Math.ceil((1 - refilled) / cfg.refillPerSec);
  } catch (err) {
    logger.warn({ err, provider, scopeId }, "rateLimit: secondsUntilAvailable failed");
    return 0;
  }
}

// For tests: wipes every bucket. Note: hits the live DB, so test setups
// must point at a disposable schema/database.
export async function _resetBuckets(): Promise<void> {
  try {
    await pool.query("DELETE FROM rate_limit_buckets");
  } catch (err) {
    logger.warn({ err }, "rateLimit: _resetBuckets failed");
  }
}
