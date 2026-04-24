import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  isCircuitOpenError,
} from "../../server/lib/circuitBreaker";

const baseOpts = {
  name: "test",
  failureThreshold: 3,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts closed and passes calls through", async () => {
    const cb = new CircuitBreaker(baseOpts);
    const result = await cb.run(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("opens after failureThreshold infra failures within window", async () => {
    const cb = new CircuitBreaker(baseOpts);
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(async () => Promise.reject(new Error("ECONNRESET")))).rejects.toThrow(
        "ECONNRESET",
      );
    }
    expect(cb.getState()).toBe("open");
  });

  it("fails fast with CircuitOpenError when open", async () => {
    const cb = new CircuitBreaker(baseOpts);
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(async () => Promise.reject(new Error("ETIMEDOUT")))).rejects.toThrow();
    }
    let invoked = false;
    await expect(
      cb.run(async () => {
        invoked = true;
        return "should not get here";
      }),
    ).rejects.toThrow(CircuitOpenError);
    expect(invoked).toBe(false);
  });

  it("transitions to half-open after cooldownMs and lets one trial through", async () => {
    const cb = new CircuitBreaker(baseOpts);
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(async () => Promise.reject(new Error("ECONNRESET")))).rejects.toThrow();
    }
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(31_000);
    expect(cb.getState()).toBe("half-open");

    const result = await cb.run(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens immediately if the half-open trial fails", async () => {
    const cb = new CircuitBreaker(baseOpts);
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(async () => Promise.reject(new Error("502")))).rejects.toThrow();
    }
    vi.advanceTimersByTime(31_000);
    expect(cb.getState()).toBe("half-open");

    await expect(cb.run(async () => Promise.reject(new Error("503")))).rejects.toThrow("503");
    expect(cb.getState()).toBe("open");
  });

  it("ignores 4xx (client) errors when counting failures", async () => {
    const cb = new CircuitBreaker(baseOpts);
    // Each is a permanent client error — should NOT count toward the threshold.
    for (let i = 0; i < 5; i++) {
      await expect(
        cb.run(async () => Promise.reject(new Error("422 Unprocessable"))),
      ).rejects.toThrow();
    }
    expect(cb.getState()).toBe("closed");
    expect(cb.failureCount()).toBe(0);
  });

  it("prunes failures that fall outside the sliding window", async () => {
    const cb = new CircuitBreaker(baseOpts);
    await expect(cb.run(async () => Promise.reject(new Error("500")))).rejects.toThrow();
    await expect(cb.run(async () => Promise.reject(new Error("500")))).rejects.toThrow();
    expect(cb.failureCount()).toBe(2);

    // Move past the window — those failures should age out.
    vi.advanceTimersByTime(61_000);
    expect(cb.failureCount()).toBe(0);

    // One more failure should not yet trip (counter is back to 1).
    await expect(cb.run(async () => Promise.reject(new Error("500")))).rejects.toThrow();
    expect(cb.getState()).toBe("closed");
  });

  it("isCircuitOpenError discriminator works", () => {
    const err = new CircuitOpenError("test", 1000);
    expect(isCircuitOpenError(err)).toBe(true);
    expect(isCircuitOpenError(new Error("other"))).toBe(false);
    expect(isCircuitOpenError(null)).toBe(false);
  });

  it("CircuitOpenError surfaces a friendly retry-after hint", () => {
    const err = new CircuitOpenError("openai", 12_000);
    expect(err.message).toContain("openai");
    expect(err.message).toContain("12s");
    expect(err.retryAfterMs).toBe(12_000);
    expect(err.breakerName).toBe("openai");
  });
});
