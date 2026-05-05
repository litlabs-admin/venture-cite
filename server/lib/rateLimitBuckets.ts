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
};

function applyRefill(tokens: number, lastRefill: Date, cfg: BucketConfig, now: number): number {
  const elapsedSec = (now - lastRefill.getTime()) / 1000;
  if (elapsedSec <= 0) return tokens;
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
      // ignore — original error is what matters
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
 */
export async function acquireOrWait(
  provider: string,
  scopeId: string,
  maxWaitMs = 30_000,
): Promise<boolean> {
  const cfg = CONFIGS[provider];
  if (!cfg) return true;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await tryAcquire(provider, scopeId)) return true;
    const waitMs = Math.max(50, Math.ceil(1000 / cfg.refillPerSec));
    const remaining = maxWaitMs - (Date.now() - start);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, Math.max(0, remaining))));
  }
  return false;
}

/**
 * Estimate seconds until at least one token will be available. Reads the
 * persisted bucket state and applies the refill curve in JS — does NOT
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
