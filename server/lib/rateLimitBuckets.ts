// Wave 9.4: in-process token bucket for outbound API rate limits.
//
// Single-instance deployment per CLAUDE.md, so an in-memory bucket is
// fine for now; comment marks the spot for Redis migration if/when
// multi-instance lands. The Reddit unauth limit is ~10 req/min — the
// previous mention scanner sleep(2.1s) inside its own loop didn't help
// when 5 users scanned simultaneously.

interface BucketConfig {
  /** Max tokens the bucket can hold. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
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
  // Quora HTML scrape: our own throttle since they don't expose a
  // public API; be polite.
  quora: { capacity: 5, refillPerSec: 1 / 4 },
};

const buckets = new Map<string, BucketState>();

function key(provider: string, scopeId: string): string {
  return `${provider}::${scopeId}`;
}

function refill(state: BucketState, cfg: BucketConfig): void {
  const now = Date.now();
  const elapsed = (now - state.lastRefill) / 1000;
  if (elapsed > 0) {
    state.tokens = Math.min(cfg.capacity, state.tokens + elapsed * cfg.refillPerSec);
    state.lastRefill = now;
  }
}

/**
 * Try to acquire 1 token immediately. Returns true if acquired, false
 * if the bucket is empty. Callers can decide whether to await
 * `acquireOrWait` or surface 429.
 */
export function tryAcquire(provider: string, scopeId: string): boolean {
  const cfg = CONFIGS[provider];
  if (!cfg) return true; // unknown provider: don't gate
  const k = key(provider, scopeId);
  let state = buckets.get(k);
  if (!state) {
    state = { tokens: cfg.capacity, lastRefill: Date.now() };
    buckets.set(k, state);
  }
  refill(state, cfg);
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * Acquire a token, waiting up to `maxWaitMs` for capacity. Returns
 * true if a token was acquired, false on timeout. Caller should
 * surface a 429 / "try again in N seconds" toast on false.
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
    if (tryAcquire(provider, scopeId)) return true;
    // Wait one refill interval before re-checking.
    const waitMs = Math.max(50, Math.ceil(1000 / cfg.refillPerSec));
    await new Promise((r) => setTimeout(r, Math.min(waitMs, maxWaitMs)));
  }
  return false;
}

/**
 * Estimate seconds until at least one token will be available. Used to
 * surface "try again in N seconds" to the user. Returns 0 if a token is
 * already available.
 */
export function secondsUntilAvailable(provider: string, scopeId: string): number {
  const cfg = CONFIGS[provider];
  if (!cfg) return 0;
  const state = buckets.get(key(provider, scopeId));
  if (!state) return 0;
  refill(state, cfg);
  if (state.tokens >= 1) return 0;
  const deficit = 1 - state.tokens;
  return Math.ceil(deficit / cfg.refillPerSec);
}

// For tests.
export function _resetBuckets(): void {
  buckets.clear();
}
