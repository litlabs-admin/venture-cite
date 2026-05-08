// tests/unit/tourEventBuffer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBuffer } from "../../client/src/tours/engine/eventBuffer";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("crypto", {
    randomUUID: () => "00000000-0000-0000-0000-000000000001",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("EventBuffer", () => {
  it("accumulates events and flushes on timer", async () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const buf = new EventBuffer(sender, { intervalMs: 5000, capacity: 200 });
    buf.push({
      tourId: "global-welcome",
      tourVersion: 1,
      eventType: "tour_step_viewed",
      occurredAt: new Date().toISOString(),
    });
    expect(sender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately on tour_completed", async () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const buf = new EventBuffer(sender, { intervalMs: 5000, capacity: 200 });
    buf.push({
      tourId: "global-welcome",
      tourVersion: 1,
      eventType: "tour_completed",
      occurredAt: new Date().toISOString(),
    });
    await Promise.resolve();
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately on tour_suppressed", async () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const buf = new EventBuffer(sender, { intervalMs: 5000, capacity: 200 });
    buf.push({
      tourId: "citations",
      tourVersion: 1,
      eventType: "tour_suppressed",
      occurredAt: new Date().toISOString(),
    });
    await Promise.resolve();
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("caps at capacity and drops oldest", () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const buf = new EventBuffer(sender, { intervalMs: 5000, capacity: 3 });
    for (let i = 0; i < 5; i++) {
      buf.push({
        tourId: "global-welcome",
        tourVersion: 1,
        eventType: "tour_step_viewed",
        stepIndex: i,
        occurredAt: new Date().toISOString(),
      });
    }
    expect(buf.size()).toBe(3);
  });

  it("retries failed batch once with backoff", async () => {
    const sender = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce(undefined);
    const buf = new EventBuffer(sender, { intervalMs: 5000, capacity: 200 });
    buf.push({
      tourId: "global-welcome",
      tourVersion: 1,
      eventType: "tour_step_viewed",
      occurredAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("drops batch after second failure", async () => {
    const sender = vi.fn().mockRejectedValue(new Error("net"));
    const buf = new EventBuffer(sender, { intervalMs: 5000, capacity: 200 });
    buf.push({
      tourId: "global-welcome",
      tourVersion: 1,
      eventType: "tour_step_viewed",
      occurredAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(sender).toHaveBeenCalledTimes(2);
    expect(buf.size()).toBe(0);
  });
});
