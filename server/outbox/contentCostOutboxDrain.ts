import type { OutboxWorkerOutcome } from "./outboxWorker";

export type ContentCostDrainResult = {
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

export function createContentCostOutboxDrain(dependencies: DrainDependencies) {
  return async function drain(options: DrainOptions): Promise<ContentCostDrainResult> {
    assertOptions(options);
    return runDrain(dependencies, options);
  };
}

export async function runContentCostOutboxDrain(
  options: DrainOptions,
): Promise<ContentCostDrainResult> {
  const [contentCostModule, llmModule, repositoryModule, workerModule] = await Promise.all([
    import("./contentCostOutboxAdapter"),
    import("./openAiLlmJobAdapter"),
    import("./outboxRepository"),
    import("./outboxWorker"),
  ]);
  const outbox = repositoryModule.createOutboxRepository();
  const handlers = {
    "content_cost.record": contentCostModule.createContentCostOutboxHandler(),
    "openai.start_llm_job": llmModule.createOpenAiLlmJobHandler(),
  } as const;
  const drain = createContentCostOutboxDrain({
    now: Date.now,
    runOnce: ({ leaseSeconds }) =>
      workerModule.runOutboxWorkerOnce({
        outbox,
        handlers,
        leaseSeconds,
      }),
  });
  return drain(options);
}

async function runDrain(
  dependencies: DrainDependencies,
  options: DrainOptions,
): Promise<ContentCostDrainResult> {
  const result = emptyResult("idle");
  while (result.claimed < options.maxCommands) {
    if (dependencies.now() >= options.deadlineMs) return { ...result, stopReason: "deadline" };
    const outcome = await dependencies.runOnce({ leaseSeconds: options.leaseSeconds });
    if (outcome.kind === "idle") return result;
    countOutcome(result, outcome);
  }
  return { ...result, stopReason: "batch_limit" };
}

function countOutcome(
  result: ContentCostDrainResult,
  outcome: Exclude<OutboxWorkerOutcome, { kind: "idle" }>,
) {
  result.claimed += 1;
  if (outcome.kind === "succeeded") result.succeeded += 1;
  if (outcome.kind === "rescheduled") result.rescheduled += 1;
  if (outcome.kind === "dead_lettered") result.deadLettered += 1;
  if (outcome.kind === "cancelled") result.cancelled += 1;
  if (outcome.kind === "lost_lease") result.lostLease += 1;
}

function emptyResult(stopReason: ContentCostDrainResult["stopReason"]): ContentCostDrainResult {
  return {
    claimed: 0,
    succeeded: 0,
    rescheduled: 0,
    deadLettered: 0,
    cancelled: 0,
    lostLease: 0,
    stopReason,
  };
}

function assertOptions(options: DrainOptions): void {
  if (
    !Number.isInteger(options.maxCommands) ||
    options.maxCommands < 1 ||
    options.maxCommands > 1000
  ) {
    throw new Error("Content cost drain maxCommands must be an integer from 1 to 1000");
  }
  if (!Number.isFinite(options.deadlineMs)) {
    throw new Error("Content cost drain deadlineMs must be finite");
  }
  if (
    !Number.isInteger(options.leaseSeconds) ||
    options.leaseSeconds < 3 ||
    options.leaseSeconds > 900
  ) {
    throw new Error("Content cost drain leaseSeconds must be an integer from 3 to 900");
  }
}
