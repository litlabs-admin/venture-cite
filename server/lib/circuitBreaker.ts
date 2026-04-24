// Lightweight in-process circuit breaker (Wave 3.7).
//
// State machine:
//   closed   — all calls pass through; failures counted in sliding window
//   open     — all calls fail fast with CircuitOpenError; no upstream hit
//   half-open — one trial call allowed; success → closed, failure → open
//
// Why DIY instead of opossum: adding a dep risks the same npm install
// path-traversal we hit on the Vite upgrade, and the breaker primitive is
// ~80 lines. If we ever need bulkheads or richer event emission, swap in
// opossum then.
//
// Each provider gets its own breaker instance (see openaiBreaker /
// openrouterBreaker exports below). This isolates a Claude outage from
// taking down the OpenAI path too.
//
// Counting only "infrastructure" failures (network, 5xx, timeout) avoids
// tripping on user-input errors (4xx, invalid prompt). That classifier is
// callerSpecified — pass `isInfraFailure` to constructor or use the
// default heuristic.

import { logger } from "./logger";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number; // failures within windowMs that trip the breaker
  windowMs: number; // sliding-window length for failure counting
  cooldownMs: number; // time the breaker stays open before half-open trial
  isInfraFailure?: (err: unknown) => boolean; // override the default classifier
}

export class CircuitOpenError extends Error {
  readonly breakerName: string;
  readonly retryAfterMs: number;
  constructor(name: string, retryAfterMs: number) {
    super(
      `Circuit '${name}' is open — provider temporarily unavailable. Retry in ~${Math.ceil(retryAfterMs / 1000)}s.`,
    );
    this.name = "CircuitOpenError";
    this.breakerName = name;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isCircuitOpenError(err: unknown): err is CircuitOpenError {
  return err instanceof CircuitOpenError;
}

// Default: treat anything that smells like network/5xx as infra. Skip
// 4xx (bad request) — those are caller bugs, retrying won't help and
// shouldn't trip the breaker.
function defaultIsInfraFailure(err: unknown): boolean {
  if (!err) return false;
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/\b(econnreset|enotfound|etimedout|eai_again|aborted|timeout)\b/.test(m)) return true;
  if (/\b(500|502|503|504|529)\b/.test(m)) return true;
  if (/\b(400|401|403|404|409|410|422)\b/.test(m)) return false;
  // Default: count it as infra. Better to be cautious than miss outages.
  return true;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureTimestamps: number[] = [];
  private openedAt = 0;
  private readonly opts: Required<CircuitBreakerOptions>;

  constructor(opts: CircuitBreakerOptions) {
    this.opts = {
      isInfraFailure: defaultIsInfraFailure,
      ...opts,
    } as Required<CircuitBreakerOptions>;
  }

  getState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  // For tests / health checks.
  failureCount(): number {
    this.pruneWindow();
    return this.failureTimestamps.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();
    if (this.state === "open") {
      const elapsed = Date.now() - this.openedAt;
      throw new CircuitOpenError(this.opts.name, Math.max(0, this.opts.cooldownMs - elapsed));
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state !== "open") return;
    if (Date.now() - this.openedAt >= this.opts.cooldownMs) {
      this.state = "half-open";
      logger.info({ breaker: this.opts.name }, "circuit: half-open (cooldown elapsed)");
    }
  }

  private pruneWindow(): void {
    const cutoff = Date.now() - this.opts.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter((t) => t >= cutoff);
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failureTimestamps = [];
      logger.info({ breaker: this.opts.name }, "circuit: closed (half-open trial succeeded)");
    } else {
      // Healthy call in closed state — reset the failure counter.
      // Without this, a slow trickle of failures across hours could
      // eventually accumulate to threshold even when most calls pass.
      this.pruneWindow();
    }
  }

  private onFailure(err: unknown): void {
    if (!this.opts.isInfraFailure(err)) return;

    if (this.state === "half-open") {
      this.openedAt = Date.now();
      this.state = "open";
      logger.warn({ breaker: this.opts.name, err }, "circuit: re-opened (half-open trial failed)");
      return;
    }

    this.failureTimestamps.push(Date.now());
    this.pruneWindow();

    if (this.failureTimestamps.length >= this.opts.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
      logger.warn(
        {
          breaker: this.opts.name,
          failures: this.failureTimestamps.length,
          windowMs: this.opts.windowMs,
        },
        "circuit: opened",
      );
    }
  }
}

// Singleton instances — each provider tracked independently.
//
// Tuned for "10 failures in 60s opens the circuit; stay open 30s before
// trying again" per the audit recommendation. These thresholds should
// be loose enough to not trip on a single user's bad prompt yet tight
// enough to fail-fast during a real outage.
export const openaiBreaker = new CircuitBreaker({
  name: "openai",
  failureThreshold: 10,
  windowMs: 60_000,
  cooldownMs: 30_000,
});

export const openrouterBreaker = new CircuitBreaker({
  name: "openrouter",
  failureThreshold: 10,
  windowMs: 60_000,
  cooldownMs: 30_000,
});
