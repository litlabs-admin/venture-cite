import { describe, it, expect, beforeEach } from "vitest";
import {
  tryAcquire,
  acquireOrWait,
  secondsUntilAvailable,
  _resetBuckets,
} from "../../server/lib/rateLimitBuckets";

describe("rateLimitBuckets", () => {
  beforeEach(() => {
    _resetBuckets();
  });

  it("returns true for an unknown provider (no gating)", () => {
    expect(tryAcquire("nonexistent", "scope")).toBe(true);
  });

  it("allows an initial burst up to capacity, then blocks", () => {
    // reddit: capacity 10, refill 1/6s
    let acquired = 0;
    for (let i = 0; i < 10; i++) {
      if (tryAcquire("reddit", "user-1")) acquired += 1;
    }
    expect(acquired).toBe(10);
    // 11th call should fail (no refill yet)
    expect(tryAcquire("reddit", "user-1")).toBe(false);
  });

  it("scopes per (provider, scopeId)", () => {
    for (let i = 0; i < 10; i++) tryAcquire("reddit", "user-A");
    // Different scope: fresh bucket
    expect(tryAcquire("reddit", "user-B")).toBe(true);
  });

  it("secondsUntilAvailable returns 0 when full", () => {
    expect(secondsUntilAvailable("reddit", "user-x")).toBe(0);
  });

  it("secondsUntilAvailable returns ETA when drained", () => {
    for (let i = 0; i < 10; i++) tryAcquire("reddit", "user-y");
    const eta = secondsUntilAvailable("reddit", "user-y");
    // Reddit refill rate is 1/6 token per second → next token in ~6s.
    expect(eta).toBeGreaterThan(0);
    expect(eta).toBeLessThanOrEqual(6);
  });

  it("acquireOrWait times out and returns false", async () => {
    for (let i = 0; i < 10; i++) tryAcquire("reddit", "user-z");
    const ok = await acquireOrWait("reddit", "user-z", 200);
    expect(ok).toBe(false);
  });

  it("acquireOrWait returns true immediately when capacity available", async () => {
    const ok = await acquireOrWait("reddit", "fresh-scope", 100);
    expect(ok).toBe(true);
  });
});
