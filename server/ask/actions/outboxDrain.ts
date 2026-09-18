// Scheduled drain for Ask's outbox commands. Mirrors
// server/outbox/contentCostOutboxDrain.ts's shape exactly (same problem,
// same idiom) but composes only Ask's four handlers - kept as its own drain
// rather than added to the existing content-cost drain's handler map, so a
// bug in Ask's action system cannot affect the shipped content-cost/LLM-job
// drain, and vice versa (minimal blast radius on an unrelated, already
// cron-scheduled job).
import type { OutboxWorkerOutcome } from "../../outbox/outboxWorker";

export type AskOutboxDrainResult = {
  claimed: number;
  succeeded: number;
  rescheduled: number;
  deadLettered: number;
  cancelled: number;
  lostLease: number;
  stopReason: "idle" | "batch_limit" | "deadline";
};

type DrainOptions = {
  maxCommands: number;
  deadlineMs: number;
  leaseSeconds: number;
};

type DrainDependencies = {
  now(): number;
  runOnce(input: { leaseSeconds: number }): Promise<OutboxWorkerOutcome>;
};

function assertOptions(options: DrainOptions): void {
  if (options.maxCommands <= 0) throw new Error("maxCommands must be positive");
  if (options.leaseSeconds <= 0) throw new Error("leaseSeconds must be positive");
}

export function createAskOutboxDrain(dependencies: DrainDependencies) {
  return async function drain(options: DrainOptions): Promise<AskOutboxDrainResult> {
    assertOptions(options);
    const result: AskOutboxDrainResult = {
      claimed: 0,
      succeeded: 0,
      rescheduled: 0,
      deadLettered: 0,
      cancelled: 0,
      lostLease: 0,
      stopReason: "idle",
    };
    while (result.claimed < options.maxCommands) {
      if (dependencies.now() >= options.deadlineMs) {
        result.stopReason = "deadline";
        return result;
      }
      const outcome = await dependencies.runOnce({ leaseSeconds: options.leaseSeconds });
      if (outcome.kind === "idle") {
        result.stopReason = "idle";
        return result;
      }
      result.claimed += 1;
      switch (outcome.kind) {
        case "succeeded":
          result.succeeded += 1;
          break;
        case "rescheduled":
          result.rescheduled += 1;
          break;
        case "dead_lettered":
          result.deadLettered += 1;
          break;
        case "cancelled":
          result.cancelled += 1;
          break;
        case "lost_lease":
          result.lostLease += 1;
          break;
      }
    }
    result.stopReason = "batch_limit";
    return result;
  };
}

export async function runAskOutboxDrain(options: DrainOptions): Promise<AskOutboxDrainResult> {
  const [adapterModule, repositoryModule, workerModule] = await Promise.all([
    import("./outboxAdapter"),
    import("../../outbox/outboxRepository"),
    import("../../outbox/outboxWorker"),
  ]);
  const outbox = repositoryModule.createOutboxRepository();
  const handlers = {
    "ask.track_prompt": adapterModule.createAskTrackPromptHandler(),
    "ask.untrack_prompt": adapterModule.createAskUntrackPromptHandler(),
    "ask.run_citation_check": adapterModule.createAskRunCitationCheckHandler(),
    "ask.cancel_citation_check": adapterModule.createAskCancelCitationCheckHandler(),
  } as const;
  const drain = createAskOutboxDrain({
    now: Date.now,
    runOnce: ({ leaseSeconds }) =>
      workerModule.runOutboxWorkerOnce({ outbox, handlers, leaseSeconds }),
  });
  return drain(options);
}
