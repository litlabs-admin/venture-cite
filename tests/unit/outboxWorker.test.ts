import { describe, expect, it, vi } from "vitest";
import type { ClaimedOutboxCommand, OutboxRepository } from "../../server/outbox/outboxRepository";
import {
  maintainOutboxLease,
  runOutboxWorkerOnce,
  type OutboxCommandHandler,
} from "../../server/outbox/outboxWorker";

function claimed(): ClaimedOutboxCommand {
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
    startedAt: new Date("2026-08-20T00:00:00Z"),
    completedAt: null,
    deadLetteredAt: null,
  };
}

function repository(command: ClaimedOutboxCommand | null): OutboxRepository {
  return {
    enqueueInTransaction: vi.fn(),
    claimNext: vi.fn().mockResolvedValue(command),
    renewLease: vi.fn().mockResolvedValue(true),
    markSucceeded: vi.fn().mockResolvedValue(true),
    reschedule: vi.fn().mockResolvedValue({ kind: "pending" }),
    moveToDeadLetter: vi.fn().mockResolvedValue(true),
    cancelAggregate: vi.fn(),
    requestCancellation: vi.fn(),
    cancelClaimed: vi.fn().mockResolvedValue(true),
    isCancellationRequested: vi.fn().mockResolvedValue(false),
  };
}

describe("outbox worker", () => {
  it("does nothing when no command is ready", async () => {
    const outbox = repository(null);
    const handlers = { "content_cost.record": vi.fn() };

    await expect(
      runOutboxWorkerOnce({
        outbox,
        handlers,
        leaseSeconds: 120,
      }),
    ).resolves.toEqual({ kind: "idle" });
    expect(outbox.claimNext).toHaveBeenCalledWith({
      leaseSeconds: 120,
      kinds: ["content_cost.record"],
    });
  });

  it("records a sanitized success result after a handler succeeds", async () => {
    const command = claimed();
    const outbox = repository(command);
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": vi.fn().mockResolvedValue({ providerReference: "cost-1" }),
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "succeeded",
      commandId: "command-1",
    });
    expect(outbox.markSucceeded).toHaveBeenCalledWith({
      id: command.id,
      leaseToken: command.leaseToken,
      providerReference: "cost-1",
      providerResult: { providerReference: "cost-1" },
    });
  });

  it("converges when the same command is delivered twice", async () => {
    const command = claimed();
    const outbox = repository(command);
    const appliedKeys = new Set<string>();
    const handler = vi.fn(async ({ idempotencyKey }: Parameters<OutboxCommandHandler>[0]) => {
      appliedKeys.add(idempotencyKey);
      return { providerReference: idempotencyKey };
    });
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": handler,
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "succeeded",
      commandId: command.id,
    });
    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "succeeded",
      commandId: command.id,
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(appliedKeys).toEqual(new Set([command.idempotencyKey]));
  });

  it("reschedules a retryable handler failure", async () => {
    const command = claimed();
    const outbox = repository(command);
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": vi.fn().mockRejectedValue(new Error("temporary provider failure")),
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "rescheduled",
      commandId: "command-1",
    });
    expect(outbox.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: command.id,
        leaseToken: command.leaseToken,
        errorCode: "unknown_error",
      }),
    );
  });

  it("finalizes cancellation before invoking a handler", async () => {
    const command = claimed();
    const outbox = repository(command);
    (outbox.isCancellationRequested as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const handler = vi.fn();
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": handler,
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "cancelled",
      commandId: command.id,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(outbox.markSucceeded).not.toHaveBeenCalled();
    expect(outbox.cancelClaimed).toHaveBeenCalledWith({
      id: command.id,
      leaseToken: command.leaseToken,
    });
  });

  it("reports a lost lease when cancellation finalization loses the race", async () => {
    const command = claimed();
    const outbox = repository(command);
    (outbox.isCancellationRequested as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (outbox.cancelClaimed as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const handler = vi.fn();
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": handler,
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "lost_lease",
      commandId: command.id,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(outbox.cancelClaimed).toHaveBeenCalledWith({
      id: command.id,
      leaseToken: command.leaseToken,
    });
  });

  it("keeps the lease heartbeat active while a cancellation-requested effect runs", async () => {
    vi.useFakeTimers();
    try {
      const command = claimed();
      const outbox = repository(command);
      const lease = maintainOutboxLease({ outbox, command, leaseSeconds: 3 });

      await vi.advanceTimersByTimeAsync(1_000);

      expect(outbox.renewLease).toHaveBeenCalledWith({
        id: command.id,
        leaseToken: command.leaseToken,
        leaseSeconds: 3,
      });
      await lease.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("records provider success when cancellation arrives during the effect", async () => {
    const command = claimed();
    const outbox = repository(command);
    const handler = vi.fn(async () => {
      await outbox.requestCancellation({ id: command.id });
      return { providerReference: "cost-1" };
    });
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": handler,
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "succeeded",
      commandId: command.id,
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(outbox.markSucceeded).toHaveBeenCalled();
    expect(outbox.requestCancellation).toHaveBeenCalledWith({ id: command.id });
  });

  it("does not turn an in-flight failure into cancellation", async () => {
    const command = claimed();
    const outbox = repository(command);
    (outbox.reschedule as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: "dead_letter" });
    const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
      "stripe.create_customer": vi.fn(),
      "resend.send_email": vi.fn(),
      "buffer.create_post": vi.fn(),
      "openai.create_response": vi.fn(),
      "content_cost.record": vi.fn().mockRejectedValue(new Error("temporary provider failure")),
    };

    await expect(runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 120 })).resolves.toEqual({
      kind: "dead_lettered",
      commandId: command.id,
    });
  });

  it("aborts a handler after a heartbeat loses the lease", async () => {
    vi.useFakeTimers();
    try {
      const command = claimed();
      const outbox = repository(command);
      (outbox.renewLease as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      let signal: AbortSignal | null = null;
      const handlers: Record<ClaimedOutboxCommand["kind"], OutboxCommandHandler> = {
        "stripe.create_customer": vi.fn(),
        "resend.send_email": vi.fn(),
        "buffer.create_post": vi.fn(),
        "openai.create_response": vi.fn(),
        "content_cost.record": vi.fn(async (input) => {
          signal = input.signal;
          await new Promise<void>((resolve) => input.signal.addEventListener("abort", resolve));
          throw new Error("aborted");
        }),
      };
      const run = runOutboxWorkerOnce({ outbox, handlers, leaseSeconds: 3 });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(run).resolves.toEqual({ kind: "lost_lease", commandId: command.id });
      expect(signal?.aborted).toBe(true);
      expect(outbox.reschedule).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
