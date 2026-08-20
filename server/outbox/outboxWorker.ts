import type { ClaimedOutboxCommand, OutboxRepository } from "./outboxRepository";
import type { OutboxCommandKind, OutboxProviderResult } from "@shared/outbox";
import { outboxErrorCodeSchema, type OutboxErrorCode } from "@shared/outbox";

export type OutboxCommandFailure = { kind: "permanent" | "transient"; code: OutboxErrorCode };
export type OutboxCommandHandler = (input: {
  command: ClaimedOutboxCommand;
  idempotencyKey: string;
  signal: AbortSignal;
}) => Promise<OutboxProviderResult>;
export type OutboxWorkerHandlers = Partial<Record<OutboxCommandKind, OutboxCommandHandler>>;
export type OutboxWorkerOutcome =
  | { kind: "idle" }
  | { kind: "succeeded"; commandId: string }
  | { kind: "rescheduled"; commandId: string }
  | { kind: "dead_lettered"; commandId: string }
  | { kind: "cancelled"; commandId: string }
  | { kind: "lost_lease"; commandId: string };

export async function runOutboxWorkerOnce(input: {
  outbox: OutboxRepository;
  handlers: OutboxWorkerHandlers;
  leaseSeconds: number;
}): Promise<OutboxWorkerOutcome> {
  // Cancellation cannot undo a provider action already in flight.
  // Adapters must use the stable key and honor this signal before their call.
  const kinds = handledKinds(input.handlers);
  if (kinds.length === 0) throw new Error("Outbox worker requires at least one handler");
  const command = await input.outbox.claimNext({
    leaseSeconds: input.leaseSeconds,
    kinds,
  });
  if (!command) return { kind: "idle" };
  const lease = maintainOutboxLease({
    outbox: input.outbox,
    command,
    leaseSeconds: input.leaseSeconds,
  });
  try {
    if (
      await input.outbox.isCancellationRequested({ id: command.id, leaseToken: command.leaseToken })
    ) {
      const cancelled = await input.outbox.cancelClaimed({
        id: command.id,
        leaseToken: command.leaseToken,
      });
      return cancelled
        ? { kind: "cancelled", commandId: command.id }
        : { kind: "lost_lease", commandId: command.id };
    }
    const handler = input.handlers[command.kind];
    if (!handler) throw { kind: "permanent", code: "invalid_command" };
    const result = await handler({
      command,
      idempotencyKey: command.idempotencyKey,
      signal: lease.signal,
    });
    await lease.assertOwned();
    const succeeded = await input.outbox.markSucceeded({
      id: command.id,
      leaseToken: command.leaseToken,
      providerReference: result.providerReference,
      providerResult: result,
    });
    return succeeded
      ? { kind: "succeeded", commandId: command.id }
      : { kind: "lost_lease", commandId: command.id };
  } catch (error) {
    if (lease.lost) return { kind: "lost_lease", commandId: command.id };
    const failure = classifyOutboxFailure(error);
    if (failure.kind === "permanent") {
      const deadLettered = await input.outbox.moveToDeadLetter({
        id: command.id,
        leaseToken: command.leaseToken,
        errorCode: failure.code,
      });
      return deadLettered
        ? { kind: "dead_lettered", commandId: command.id }
        : { kind: "lost_lease", commandId: command.id };
    }
    const retry = await input.outbox.reschedule({
      id: command.id,
      leaseToken: command.leaseToken,
      nextAvailableAt: retryAt(command.attemptCount),
      errorCode: failure.code,
    });
    if (retry.kind === "pending") return { kind: "rescheduled", commandId: command.id };
    return {
      kind: retry.kind === "dead_letter" ? "dead_lettered" : "lost_lease",
      commandId: command.id,
    };
  } finally {
    await lease.stop();
  }
}

const ALL_OUTBOX_COMMAND_KINDS = [
  "stripe.create_customer",
  "resend.send_email",
  "buffer.create_post",
  "openai.create_response",
  "openai.start_llm_job",
  "content_cost.record",
] as const satisfies readonly OutboxCommandKind[];

function handledKinds(handlers: OutboxWorkerHandlers): OutboxCommandKind[] {
  return ALL_OUTBOX_COMMAND_KINDS.filter((kind) => handlers[kind] !== undefined);
}

export function classifyOutboxFailure(error: unknown): OutboxCommandFailure {
  if (error && typeof error === "object" && "kind" in error && "code" in error) {
    const candidate = error as { kind?: unknown; code?: unknown };
    if (
      (candidate.kind === "permanent" || candidate.kind === "transient") &&
      typeof candidate.code === "string" &&
      candidate.code.length > 0
    ) {
      const code = outboxErrorCodeSchema.safeParse(candidate.code);
      if (code.success) return { kind: candidate.kind, code: code.data };
    }
  }
  return { kind: "transient", code: "unknown_error" };
}

export function maintainOutboxLease(input: {
  outbox: OutboxRepository;
  command: ClaimedOutboxCommand;
  leaseSeconds: number;
}): { signal: AbortSignal; lost: boolean; assertOwned(): Promise<void>; stop(): Promise<void> } {
  const controller = new AbortController();
  const intervalMs = Math.max(250, Math.floor((input.leaseSeconds * 1_000) / 3) - 1);
  let stopped = false;
  let lost = false;
  let pending: Promise<void> | null = null;
  const renew = () => {
    if (stopped || pending || lost) return;
    const task = input.outbox
      .renewLease({
        id: input.command.id,
        leaseToken: input.command.leaseToken,
        leaseSeconds: input.leaseSeconds,
      })
      .then(
        (owned) => {
          if (!owned) {
            lost = true;
            controller.abort();
          }
        },
        () => {
          lost = true;
          controller.abort();
        },
      );
    pending = task;
    void task.finally(() => {
      if (pending === task) pending = null;
    });
  };
  const timer = setInterval(renew, intervalMs);
  timer.unref();
  return {
    signal: controller.signal,
    get lost() {
      return lost;
    },
    async assertOwned() {
      if (pending) await pending;
      if (lost) throw new Error("Outbox command lost its lease");
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (pending) await pending;
    },
  };
}

function retryAt(attemptCount: number): Date {
  return new Date(Date.now() + Math.min(3_600, 2 ** Math.max(0, attemptCount - 1)) * 1_000);
}
