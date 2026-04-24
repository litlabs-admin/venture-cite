import { and, eq } from "drizzle-orm";
import { db, pool } from "../db";
import * as schema from "@shared/schema";
import type { AgentTask, WorkflowRun } from "@shared/schema";
import { storage } from "../storage";
import { workflowStorage } from "../storage/workflowStorage";
import { logger } from "./logger";
import { Sentry } from "../instrument";
import type { AgentTaskType } from "./agentTaskSchemas";
import { executeAgentTask } from "./agentTaskExecutor";

export type StepStatus =
  | "pending"
  | "awaiting_approval"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type StepState = {
  key: string;
  status: StepStatus;
  taskIds?: string[];
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
  errors?: string[];
};

export type WorkflowStepContext = {
  run: WorkflowRun;
  priorOutputs: Record<string, unknown>;
};

export type WorkflowStep = {
  key: string;
  label: string;
  description: string;
  taskType?: AgentTaskType;
  requiresApproval: boolean;
  parallel?: boolean;
  /** For parallel steps: what happens when ≥1 task fails but ≥1 succeeds.
   *  "fail" (default) — fail whole step. "continue" — complete with the
   *  successful subset's outputs; record per-task errors into step.errors. */
  onPartialFailure?: "fail" | "continue";
  /** When true, this step polls a background content_generation_job instead
   *  of creating an agent_task. Uses getJobId() to read the jobId from
   *  prior step outputs. */
  awaitJob?: boolean;
  getJobId?: (priorOutputs: Record<string, unknown>) => string | null;
  buildInput: (ctx: WorkflowStepContext) => unknown;
  extractOutput: (task: AgentTask) => unknown;
  run?: (ctx: WorkflowStepContext) => Promise<unknown>;
  buildApprovalSummary?: (ctx: WorkflowStepContext) => unknown;
};

export type WorkflowDefinition = {
  key: string;
  name: string;
  description: string;
  triggerType: "manual" | "cron";
  cronSpec?: string;
  steps: WorkflowStep[];
};

function priorOutputsOf(run: WorkflowRun): Record<string, unknown> {
  const states = (run.stepStates as StepState[] | null) ?? [];
  const out: Record<string, unknown> = {};
  for (const s of states) {
    if (s.status === "completed") {
      out[s.key] = s.output;
    }
  }
  return out;
}

// Postgres advisory lock keyed by a hash of the run id. If the lock is held
// and the run hasn't advanced in >5 minutes, assume the holder crashed —
// force-release and retry. Otherwise skip the tick (another worker owns it).
async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T | null> {
  const lockKeyArg = `workflow_run:${runId}`;
  const client = await pool.connect();
  try {
    const tryAcquire = async (): Promise<boolean> => {
      const { rows } = await client.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS ok",
        [lockKeyArg],
      );
      return rows[0]?.ok === true;
    };

    let acquired = await tryAcquire();
    if (!acquired) {
      // Rescue: if the run's updatedAt is older than 5 minutes, assume the
      // lock-holder crashed and force-release.
      const run = await workflowStorage.getRun(runId);
      const updatedAt = run?.updatedAt ? new Date(run.updatedAt as unknown as string) : null;
      const stale = updatedAt !== null && Date.now() - updatedAt.getTime() > 5 * 60 * 1000;
      if (stale) {
        logger.warn(
          { runId, updatedAt },
          "workflow: advisory lock held by apparently-dead process, force-releasing",
        );
        try {
          await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [lockKeyArg]);
        } catch (err) {
          logger.warn({ err, runId }, "workflow: force-unlock failed");
        }
        acquired = await tryAcquire();
      }
    }

    if (!acquired) {
      logger.info({ runId }, "workflow: advisory lock busy, skipping tick");
      return null;
    }

    try {
      return await fn();
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [lockKeyArg]);
      } catch (err) {
        logger.warn({ err, runId }, "workflow: advisory unlock failed");
      }
    }
  } finally {
    client.release();
  }
}

export async function startRun(
  workflowKey: string,
  brandId: string,
  userId: string,
  input: unknown,
  triggeredBy: "manual" | "cron" | "chained" = "manual",
): Promise<WorkflowRun> {
  const { workflowByKey } = await import("./workflows/registry");
  const def = workflowByKey(workflowKey);
  if (!def) throw new Error(`Unknown workflow: ${workflowKey}`);

  const run = await workflowStorage.createRun({
    userId,
    brandId,
    workflowKey,
    status: "pending",
    currentStepIndex: 0,
    stepStates: [],
    input: input as never,
    triggeredBy,
  });

  await advanceRun(run.id);
  const latest = await workflowStorage.getRun(run.id);
  return latest ?? run;
}

export async function advanceRun(runId: string): Promise<void> {
  const result = await withRunLock(runId, async () => {
    await advanceRunInner(runId);
  });
  if (result === null) {
    // Busy; next tick will pick it up.
  }
}

async function advanceRunInner(runId: string): Promise<void> {
  const run = await workflowStorage.getRun(runId);
  if (!run) {
    logger.warn({ runId }, "workflow: run not found");
    return;
  }

  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return;
  }

  const { workflowByKey } = await import("./workflows/registry");
  const def = workflowByKey(run.workflowKey);
  if (!def) {
    await workflowStorage.updateRun(runId, {
      status: "failed",
      lastError: `Unknown workflow key: ${run.workflowKey}`,
    });
    return;
  }

  const steps = def.steps;
  const idx = run.currentStepIndex;

  if (idx >= steps.length) {
    await workflowStorage.updateRun(runId, {
      status: "completed",
      completedAt: new Date(),
    });
    return;
  }

  const step = steps[idx];
  const states = ((run.stepStates as StepState[] | null) ?? []).slice();
  const priorOutputs = priorOutputsOf(run);
  const ctx: WorkflowStepContext = { run, priorOutputs };

  const current: StepState = states[idx] ?? { key: step.key, status: "pending" };

  if (current.status === "pending") {
    // Approval gate for SYNTHETIC steps: run the body first (so the user sees
    // concrete output in the approval summary), then pause. Without this the
    // body never executes — the approval blocks it, then approval resets the
    // state to pending, which re-triggers the approval check → infinite no-op.
    if (step.requiresApproval && step.run && !step.taskType) {
      const existing = await workflowStorage.getPendingApproval(runId, idx);
      if (!existing) {
        let output: unknown;
        try {
          output = await step.run(ctx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(
            { err, runId, stepKey: step.key },
            "workflow: pre-approval synthetic step failed",
          );
          states[idx] = {
            ...current,
            status: "failed",
            error: msg,
            completedAt: new Date().toISOString(),
          };
          await workflowStorage.updateRun(runId, {
            status: "failed",
            lastError: msg,
            stepStates: states as never,
          });
          return;
        }
        const summary = step.buildApprovalSummary
          ? step.buildApprovalSummary({
              ...ctx,
              priorOutputs: { ...ctx.priorOutputs, [step.key]: output },
            })
          : { stepKey: step.key, label: step.label };
        await workflowStorage.createApproval({
          runId,
          stepIndex: idx,
          summary: summary as never,
        });
        states[idx] = {
          ...current,
          status: "awaiting_approval",
          startedAt: new Date().toISOString(),
          output,
        };
        await workflowStorage.updateRun(runId, {
          status: "awaiting_approval",
          stepStates: states as never,
        });
        return;
      }
      // Pending approval already exists — nothing to do; wait.
      states[idx] = { ...current, status: "awaiting_approval" };
      await workflowStorage.updateRun(runId, {
        status: "awaiting_approval",
        stepStates: states as never,
      });
      return;
    }

    // Task-based approval steps: fall through to create the task. The gate
    // fires in the "running → all tasks done" branch below, once there's
    // real output for the user to review.

    // await_job step: poll content_generation_jobs rather than spawn a task.
    if (step.awaitJob) {
      const jobId = step.getJobId ? step.getJobId(priorOutputs) : null;
      if (!jobId) {
        const msg = `awaitJob step ${step.key}: getJobId returned null`;
        states[idx] = {
          ...current,
          status: "failed",
          error: msg,
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          status: "failed",
          lastError: msg,
          stepStates: states as never,
        });
        return;
      }
      states[idx] = {
        ...current,
        status: "running",
        startedAt: new Date().toISOString(),
        output: { jobId } as unknown,
      };
      await workflowStorage.updateRun(runId, {
        status: "running",
        stepStates: states as never,
      });
      // Fall through: re-enter and poll.
      await advanceRunInner(runId);
      return;
    }

    // Synthetic step (pure computation, no agent_task).
    if (step.run && !step.taskType) {
      states[idx] = {
        ...current,
        status: "running",
        startedAt: new Date().toISOString(),
      };
      await workflowStorage.updateRun(runId, {
        status: "running",
        stepStates: states as never,
      });
      try {
        const output = await step.run(ctx);
        states[idx] = {
          ...current,
          status: "completed",
          output,
          startedAt: states[idx].startedAt,
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          currentStepIndex: idx + 1,
          stepStates: states as never,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, runId, stepKey: step.key }, "workflow: synthetic step failed");
        states[idx] = {
          ...current,
          status: "failed",
          error: msg,
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          status: "failed",
          lastError: msg,
          stepStates: states as never,
        });
        return;
      }
      // Recurse to advance into next step.
      await advanceRunInner(runId);
      return;
    }

    if (!step.taskType) {
      const msg = `Step ${step.key} has no taskType and no run() — misconfigured`;
      logger.error({ runId, stepKey: step.key }, msg);
      states[idx] = { ...current, status: "failed", error: msg };
      await workflowStorage.updateRun(runId, {
        status: "failed",
        lastError: msg,
        stepStates: states as never,
      });
      return;
    }

    // Create agent_task(s) for this step.
    const built = step.buildInput(ctx);
    const inputs: unknown[] = step.parallel && Array.isArray(built) ? built : [built];

    // Empty parallel input → complete the step with empty output and advance.
    // (Previously ids.length === 0 was treated as a misconfiguration failure.)
    if (step.parallel && inputs.length === 0) {
      states[idx] = {
        ...current,
        status: "completed",
        output: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      await workflowStorage.updateRun(runId, {
        currentStepIndex: idx + 1,
        stepStates: states as never,
      });
      await advanceRunInner(runId);
      return;
    }

    const createdIds: string[] = [];
    for (const inp of inputs) {
      const t = await storage.createAgentTask({
        brandId: run.brandId,
        taskType: step.taskType,
        taskTitle: step.label,
        taskDescription: step.description,
        triggeredBy: "automation_rule",
        status: "queued",
        inputData: inp as never,
        workflowRunId: runId,
        workflowStepKey: step.key,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      createdIds.push(t.id);
    }

    states[idx] = {
      ...current,
      status: "running",
      taskIds: createdIds,
      startedAt: new Date().toISOString(),
    };
    await workflowStorage.updateRun(runId, {
      status: "running",
      stepStates: states as never,
    });

    // Auto-execute. Parallel steps fire concurrently; sequential steps still
    // run one after the other (createdIds is length 1). Per-task errors are
    // swallowed to logs so one failure doesn't abort the others; the polling
    // branch will see the task.status=failed on the next tick.
    if (step.parallel) {
      await Promise.allSettled(
        createdIds.map(async (tid) => {
          try {
            await executeAgentTask(tid, run.userId);
          } catch (err) {
            logger.error({ err, taskId: tid, runId }, "workflow: task execution failed");
          }
        }),
      );
    } else {
      for (const tid of createdIds) {
        try {
          await executeAgentTask(tid, run.userId);
        } catch (err) {
          logger.error({ err, taskId: tid, runId }, "workflow: task execution failed");
        }
      }
    }

    // After executing, re-enter to collect results.
    await advanceRunInner(runId);
    return;
  }

  if (current.status === "running") {
    // await_job step — poll the content_generation_jobs table.
    if (step.awaitJob) {
      const jobId =
        (current.output as { jobId?: string } | undefined)?.jobId ??
        (step.getJobId ? step.getJobId(priorOutputs) : null);
      if (!jobId) {
        const msg = `awaitJob step ${step.key}: no jobId available while running`;
        states[idx] = {
          ...current,
          status: "failed",
          error: msg,
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          status: "failed",
          lastError: msg,
          stepStates: states as never,
        });
        return;
      }

      // Timeout: >15 minutes in running state → fail.
      const started = current.startedAt ? new Date(current.startedAt).getTime() : Date.now();
      if (Date.now() - started > 15 * 60 * 1000) {
        const msg = "Content generation job timed out";
        states[idx] = {
          ...current,
          status: "failed",
          error: msg,
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          status: "failed",
          lastError: msg,
          stepStates: states as never,
        });
        return;
      }

      // Look up the job directly — bypass per-user ownership check since
      // the workflow engine operates in a trusted context.
      let job: schema.ContentGenerationJob | undefined;
      try {
        const rows = await db
          .select()
          .from(schema.contentGenerationJobs)
          .where(eq(schema.contentGenerationJobs.id, jobId))
          .limit(1);
        job = rows[0];
      } catch (err) {
        logger.warn({ err, runId, jobId }, "awaitJob: lookup failed, will retry next tick");
        return;
      }

      if (!job) {
        // Job row missing — not fatal yet; next tick retries. If this
        // persists, the 15-min timeout above will catch it.
        return;
      }

      if (job.status === "completed") {
        states[idx] = {
          ...current,
          status: "completed",
          output: { articleId: job.articleId, jobId: job.id },
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          currentStepIndex: idx + 1,
          stepStates: states as never,
        });
        await advanceRunInner(runId);
        return;
      }

      if (job.status === "failed") {
        const msg = job.errorMessage || "Content generation job failed";
        states[idx] = {
          ...current,
          status: "failed",
          error: msg,
          completedAt: new Date().toISOString(),
        };
        await workflowStorage.updateRun(runId, {
          status: "failed",
          lastError: msg,
          stepStates: states as never,
        });
        return;
      }

      // Still pending/running — wait for next tick.
      return;
    }

    const ids = current.taskIds ?? [];
    if (ids.length === 0) {
      const msg = `Step ${step.key} is running with no taskIds`;
      logger.error({ runId, stepKey: step.key }, msg);
      states[idx] = { ...current, status: "failed", error: msg };
      await workflowStorage.updateRun(runId, {
        status: "failed",
        lastError: msg,
        stepStates: states as never,
      });
      return;
    }

    const tasks: AgentTask[] = [];
    for (const id of ids) {
      const t = await storage.getAgentTaskById(id);
      if (t) tasks.push(t);
    }

    const failedTasks = tasks.filter((t) => t.status === "failed" || t.status === "cancelled");
    const completedTasks = tasks.filter((t) => t.status === "completed");
    const terminal = failedTasks.length + completedTasks.length;
    const allTerminal = terminal === tasks.length && tasks.length === ids.length;
    const anyFailed = failedTasks.length > 0;
    const allDone = completedTasks.length === tasks.length && tasks.length === ids.length;

    // Parallel + onPartialFailure="continue": if all terminal and at least one
    // succeeded, complete the step with the successful subset's outputs.
    const policy = step.onPartialFailure ?? "fail";
    if (
      step.parallel &&
      policy === "continue" &&
      allTerminal &&
      completedTasks.length > 0 &&
      failedTasks.length > 0
    ) {
      const outputs = completedTasks.map((t) => step.extractOutput(t));
      const errors = failedTasks.map((t) => t.error || `Task ${t.id} failed (${t.status})`);
      states[idx] = {
        ...current,
        status: "completed",
        output: outputs,
        errors,
        completedAt: new Date().toISOString(),
      };
      await workflowStorage.updateRun(runId, {
        currentStepIndex: idx + 1,
        stepStates: states as never,
      });
      await advanceRunInner(runId);
      return;
    }

    if (anyFailed) {
      const failed = failedTasks[0];
      const msg = failed?.error || `Step ${step.key} had a failed task`;
      states[idx] = {
        ...current,
        status: "failed",
        error: msg,
        completedAt: new Date().toISOString(),
      };
      await workflowStorage.updateRun(runId, {
        status: "failed",
        lastError: msg,
        stepStates: states as never,
      });
      return;
    }

    if (allDone) {
      const outputs = tasks.map((t) => step.extractOutput(t));
      const output = step.parallel ? outputs : outputs[0];

      // Task-based approval gate: now that the task has real output, pause
      // for user review before advancing. On approve, engine merges payload
      // and advances; on reject, cancels the run.
      if (step.requiresApproval) {
        const existing = await workflowStorage.getPendingApproval(runId, idx);
        if (!existing) {
          const summaryCtx: WorkflowStepContext = {
            run,
            priorOutputs: { ...priorOutputs, [step.key]: output },
          };
          const summary = step.buildApprovalSummary
            ? step.buildApprovalSummary(summaryCtx)
            : { stepKey: step.key, label: step.label, output };
          await workflowStorage.createApproval({
            runId,
            stepIndex: idx,
            summary: summary as never,
          });
        }
        states[idx] = {
          ...current,
          status: "awaiting_approval",
          output,
        };
        await workflowStorage.updateRun(runId, {
          status: "awaiting_approval",
          stepStates: states as never,
        });
        return;
      }

      states[idx] = {
        ...current,
        status: "completed",
        output,
        completedAt: new Date().toISOString(),
      };
      await workflowStorage.updateRun(runId, {
        currentStepIndex: idx + 1,
        stepStates: states as never,
      });
      await advanceRunInner(runId);
      return;
    }

    // Still running; wait for next tick.
    return;
  }

  if (current.status === "awaiting_approval") {
    // Wait for approveStep.
    return;
  }

  if (current.status === "completed") {
    // Shouldn't normally land here — advance.
    await workflowStorage.updateRun(runId, {
      currentStepIndex: idx + 1,
    });
    await advanceRunInner(runId);
    return;
  }
}

export async function approveStep(
  runId: string,
  stepIndex: number,
  decision: "approved" | "rejected",
  payload?: Record<string, unknown>,
): Promise<void> {
  const run = await workflowStorage.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const pending = await workflowStorage.getPendingApproval(runId, stepIndex);
  if (!pending) throw new Error(`No pending approval for run ${runId} step ${stepIndex}`);

  await workflowStorage.respondToApproval(pending.id, decision, new Date());

  const states = ((run.stepStates as StepState[] | null) ?? []).slice();
  const { workflowByKey } = await import("./workflows/registry");
  const def = workflowByKey(run.workflowKey);
  const step = def?.steps[stepIndex];
  const keyForIdx = step?.key || `step_${stepIndex}`;

  if (decision === "rejected") {
    const stepLabel = step?.label ?? `step ${stepIndex}`;
    const msg = `User rejected step "${stepLabel}" at approval gate`;
    const prior = states[stepIndex] ?? { key: keyForIdx, status: "pending" };
    states[stepIndex] = {
      ...prior,
      key: prior.key || keyForIdx,
      status: "failed",
      error: msg,
      completedAt: new Date().toISOString(),
    };
    await workflowStorage.updateRun(runId, {
      status: "cancelled",
      lastError: msg,
      stepStates: states as never,
      completedAt: new Date(),
    });
    return;
  }

  // Approved. If the step had a pre-execution synthetic body, it already ran
  // (its output is in states[stepIndex].output). Merge the user's payload
  // over that output so downstream buildInput reads curated-by-user values,
  // then mark the step completed and advance. If there was no prior body
  // (taskType-only approval gate), fall back to the original pending-reset
  // behavior so the task fires on the next tick.
  const priorState = states[stepIndex];
  const hadPriorOutput =
    priorState && priorState.status === "awaiting_approval" && priorState.output !== undefined;

  if (hadPriorOutput) {
    const original = (priorState.output as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = { ...original, ...(payload ?? {}) };
    states[stepIndex] = {
      ...priorState,
      key: priorState.key || keyForIdx,
      status: "completed",
      output: merged,
      completedAt: new Date().toISOString(),
    };
    await workflowStorage.updateRun(runId, {
      status: "running",
      currentStepIndex: stepIndex + 1,
      stepStates: states as never,
    });
    await advanceRun(runId);
    return;
  }

  // No prior output — reset to pending so advanceRun creates the task. Stash
  // the payload as the output anyway so extractOutput can see it later if
  // needed (e.g. task-based approval gates want user choices available).
  states[stepIndex] = {
    key: keyForIdx,
    status: "pending",
    output: payload ?? undefined,
  };
  await workflowStorage.updateRun(runId, {
    status: "running",
    stepStates: states as never,
  });

  await advanceRun(runId);
}

export async function cancelRun(runId: string, reason = "Cancelled by user"): Promise<void> {
  const run = await workflowStorage.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return;
  }

  const states = (run.stepStates as StepState[] | null) ?? [];
  const current = states[run.currentStepIndex];
  if (current?.taskIds && current.status === "running") {
    for (const tid of current.taskIds) {
      try {
        const t = await storage.getAgentTaskById(tid);
        if (t && (t.status === "queued" || t.status === "in_progress")) {
          await storage.updateAgentTask(tid, {
            status: "failed",
            completedAt: new Date(),
            error: "Workflow cancelled",
          });
        }
      } catch (err) {
        logger.warn({ err, taskId: tid, runId }, "workflow: cancel task best-effort failed");
      }
    }
  }

  await workflowStorage.updateRun(runId, {
    status: "cancelled",
    lastError: reason,
  });
}

export async function tickActiveRuns(): Promise<void> {
  const runs = await workflowStorage.getActiveRuns();
  for (const r of runs) {
    try {
      await advanceRun(r.id);
    } catch (err) {
      logger.error({ err, runId: r.id }, "workflow: advanceRun threw");
      Sentry.captureException(err, {
        tags: { source: "workflowEngine.tick" },
        extra: { runId: r.id },
      });
    }
  }
}

// Unused helper exports — re-exported for tests / future use.
export { priorOutputsOf };
export const _internal = { db, schema, and, eq };
