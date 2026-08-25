import { describe, expect, it, vi } from "vitest";
import {
  createContentCostOutboxDrain,
  type ContentCostDrainResult,
} from "../../server/outbox/contentCostOutboxDrain";
import type { OutboxWorkerOutcome } from "../../server/outbox/outboxWorker";

function result(overrides: Partial<ContentCostDrainResult> = {}): ContentCostDrainResult {
  return {
    claimed: 0,
    succeeded: 0,
    rescheduled: 0,
    deadLettered: 0,
    cancelled: 0,
    lostLease: 0,
    stopReason: "idle",
    ...overrides,
  };
}

describe("content cost outbox drain", () => {
  it("stops at the deadline before it claims another command", async () => {
    let now = 1_000;
    const runOnce = vi.fn(async () => {
      now = 5_000;
      return { kind: "succeeded", commandId: "command-1" } satisfies OutboxWorkerOutcome;
    });
    const drain = createContentCostOutboxDrain({
      now: () => now,
      runOnce,
    });

    await expect(drain({ maxCommands: 5, deadlineMs: 5_000, leaseSeconds: 30 })).resolves.toEqual(
      result({ claimed: 1, succeeded: 1, stopReason: "deadline" }),
    );
    expect(runOnce).toHaveBeenCalledOnce();
  });

  it("stops at the batch limit and counts worker outcomes", async () => {
    const outcomes: OutboxWorkerOutcome[] = [
      { kind: "rescheduled", commandId: "command-1" },
      { kind: "dead_lettered", commandId: "command-2" },
    ];
    const runOnce = vi.fn(async () => outcomes.shift() ?? { kind: "idle" });
    const drain = createContentCostOutboxDrain({
      now: () => 1_000,
      runOnce,
    });

    await expect(drain({ maxCommands: 2, deadlineMs: 5_000, leaseSeconds: 30 })).resolves.toEqual(
      result({ claimed: 2, rescheduled: 1, deadLettered: 1, stopReason: "batch_limit" }),
    );
  });
});
