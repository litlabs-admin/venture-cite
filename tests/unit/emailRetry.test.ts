import { describe, it, expect, vi } from "vitest";
import { withEmailRetry, isTransientError } from "../../server/lib/emailRetry";

describe("isTransientError", () => {
  it("classifies invalid-address as permanent", () => {
    expect(isTransientError(new Error("Invalid recipient address"))).toBe(false);
  });

  it("classifies 422 as permanent (Resend uses 422 for bad data)", () => {
    expect(isTransientError(new Error("Request failed with status 422"))).toBe(false);
  });

  it("classifies 401 / 403 as permanent (auth issues — retrying won't help)", () => {
    expect(isTransientError(new Error("401 Unauthorized"))).toBe(false);
    expect(isTransientError(new Error("403 Forbidden"))).toBe(false);
  });

  it("classifies network/timeout errors as transient", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("getaddrinfo ENOTFOUND"))).toBe(true);
    expect(isTransientError(new Error("Request timed out"))).toBe(true);
  });

  it("classifies 5xx as transient", () => {
    expect(isTransientError(new Error("Request failed with status 500"))).toBe(true);
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe("withEmailRetry", () => {
  it("returns the value on first-attempt success", async () => {
    let calls = 0;
    const result = await withEmailRetry(async () => {
      calls += 1;
      return { id: "msg_123" };
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: "msg_123" });
      expect(result.attempts).toBe(1);
    }
  });

  it("retries transient failures up to the delay-list length", async () => {
    let calls = 0;
    const result = await withEmailRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("ECONNRESET");
        return { id: "msg_ok" };
      },
      [10, 10], // 2 retries → up to 3 attempts
    );
    expect(calls).toBe(3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(3);
  });

  it("gives up after exhausting retries on persistent transient failure", async () => {
    let calls = 0;
    const result = await withEmailRetry(async () => {
      calls += 1;
      throw new Error("ECONNRESET");
    }, [5, 5, 5]);
    expect(calls).toBe(4); // initial + 3 retries
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(4);
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("bails immediately on permanent failure (no retries)", async () => {
    let calls = 0;
    const result = await withEmailRetry(async () => {
      calls += 1;
      throw new Error("Invalid recipient address");
    }, [10, 10, 10]);
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.attempts).toBe(1);
  });

  it("waits between retries (verifies delay is observed)", async () => {
    vi.useFakeTimers();
    try {
      const startedAt = Date.now();
      let calls = 0;
      const promise = withEmailRetry(async () => {
        calls += 1;
        if (calls < 2) throw new Error("ECONNRESET");
        return { id: "ok" };
      }, [1000]);
      // Advance through the 1s delay.
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});
