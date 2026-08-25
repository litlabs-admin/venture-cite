import { describe, expect, it, vi } from "vitest";
import type { ClaimedOutboxCommand } from "../../server/outbox/outboxRepository";

const stubs = vi.hoisted(() => ({ transaction: vi.fn(), insert: vi.fn(), execute: vi.fn() }));
vi.mock("../../server/db", () => ({ db: { transaction: stubs.transaction } }));

const { createContentCostOutboxHandler } =
  await import("../../server/outbox/contentCostOutboxAdapter");

function command(): ClaimedOutboxCommand {
  return {
    id: "command-1",
    kind: "content_cost.record",
    status: "processing",
    idempotencyKey: "content-cost:job-1:response-1",
    aggregateType: "content_generation_job",
    aggregateId: "job-1",
    userId: "user-1",
    brandId: "brand-1",
    payload: {
      kind: "content_cost.record",
      contentJobId: "job-1",
      providerResponseId: "response-1",
      service: "openai",
      model: "gpt-test",
      tokensIn: 10,
      tokensOut: 20,
    },
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: new Date("2026-08-20T00:00:00Z"),
    leaseToken: "00000000-0000-4000-8000-000000000001",
    leaseExpiresAt: new Date("2026-08-20T00:02:00Z"),
    providerName: "internal",
    providerOperation: "record_content_cost",
    createdAt: new Date("2026-08-20T00:00:00Z"),
  };
}

describe("content cost outbox adapter", () => {
  it("uses the stable command key so duplicate delivery inserts one cost row", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    stubs.insert.mockReturnValue({ values });
    stubs.transaction.mockImplementation(async (work: (transaction: unknown) => Promise<void>) =>
      work({ execute: stubs.execute, insert: stubs.insert }),
    );
    const handler = createContentCostOutboxHandler();

    await expect(
      handler({
        command: command(),
        idempotencyKey: "content-cost:job-1:response-1",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ providerReference: "response-1" });
    await expect(
      handler({
        command: command(),
        idempotencyKey: "content-cost:job-1:response-1",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ providerReference: "response-1" });

    expect(stubs.insert).toHaveBeenCalledTimes(2);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
    expect(stubs.execute).toHaveBeenCalledTimes(6);
  });
});
