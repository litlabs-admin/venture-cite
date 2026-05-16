import { z } from "zod";
import { storage } from "../storage";
import { isKnownAgentTaskType, parseAgentTaskInput, type AgentTaskType } from "./agentTaskSchemas";
import { assertTransition, InvalidStateTransitionError } from "./statusTransitions";
import { logger } from "./logger";
import type { AgentTask } from "@shared/schema";

export class AgentTaskExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unknown_type"
      | "invalid_input"
      | "not_claimable"
      | "handler_failed"
      | "not_found",
    public readonly task?: AgentTask,
  ) {
    super(message);
    this.name = "AgentTaskExecutionError";
  }
}

export type ExecuteResult = {
  task: AgentTask;
  result: unknown;
  tokensUsed: number;
  artifactType: string | null;
  artifactId: string | null;
};

export async function executeAgentTask(taskId: string, userId: string): Promise<ExecuteResult> {
  // userId is part of the public signature for backwards compatibility but
  // the sole live task type (prompt_test) doesn't need it; intentionally unused.
  void userId;

  const task = await storage.getAgentTaskById(taskId);
  if (!task) {
    throw new AgentTaskExecutionError(`Task ${taskId} not found`, "not_found");
  }

  if (!isKnownAgentTaskType(task.taskType)) {
    throw new AgentTaskExecutionError(`Unknown taskType: ${task.taskType}`, "unknown_type", task);
  }

  let input: Record<string, unknown>;
  try {
    input = parseAgentTaskInput(task.taskType as AgentTaskType, task.inputData) as Record<
      string,
      unknown
    >;
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : String(err);
    throw new AgentTaskExecutionError(`Invalid inputData: ${msg}`, "invalid_input", task);
  }

  const claimed = await storage.claimAgentTask(task.id);
  if (!claimed) {
    throw new AgentTaskExecutionError(
      `Task is not claimable (current status: ${task.status})`,
      "not_claimable",
      task,
    );
  }

  let claimedTaskId: string | null = claimed.id;
  let result: Record<string, unknown> = { success: false, output: "" };
  const tokensUsed = 0;
  let artifactType: string | null = null;
  let artifactId: string | null = null;

  try {
    // Only one live task type: prompt_test. Queued by weeklyCatchupWorkflow's
    // citation_check step (server/lib/workflows/weeklyCatchup.ts).
    if ((task.taskType as AgentTaskType) === "prompt_test") {
      if (!task.brandId) throw new Error("prompt_test task requires a brandId");
      const { runBrandPrompts } = await import("../citationChecker");
      const inputPromptIds = Array.isArray(input.promptIds)
        ? (input.promptIds as string[]).filter((x) => typeof x === "string" && x.length > 0)
        : undefined;
      const triggeredBy = task.triggeredBy === "cron" ? "cron" : "manual";
      const runResult = await runBrandPrompts(task.brandId, undefined, {
        triggeredBy,
        promptIds: inputPromptIds && inputPromptIds.length > 0 ? inputPromptIds : undefined,
      });
      // Per-prompt roll-up consumed by weeklyCatchup.delta_calc:
      // `{promptId, cited, checks, platforms, bestRank}[]`.
      const byPromptMap = new Map<
        string,
        {
          promptId: string;
          cited: number;
          checks: number;
          platforms: string[];
          bestRank: number | null;
          citationContexts: string[];
        }
      >();
      for (const r of runResult.rankings) {
        const key = r.brandPromptId as string;
        const entry = byPromptMap.get(key) ?? {
          promptId: key,
          cited: 0,
          checks: 0,
          platforms: [] as string[],
          bestRank: null as number | null,
          citationContexts: [] as string[],
        };
        entry.checks += 1;
        if (r.isCited === 1) {
          entry.cited += 1;
          if (r.aiPlatform && !entry.platforms.includes(r.aiPlatform)) {
            entry.platforms.push(r.aiPlatform);
          }
          if (r.rank !== null && r.rank !== undefined) {
            entry.bestRank = entry.bestRank === null ? r.rank : Math.min(entry.bestRank, r.rank);
          }
          if (r.citationContext && entry.citationContexts.length < 3) {
            entry.citationContexts.push(String(r.citationContext).slice(0, 400));
          }
        }
        byPromptMap.set(key, entry);
      }
      const byPrompt = Array.from(byPromptMap.values());
      artifactType = "citation_run";
      artifactId = runResult.runId;
      result = {
        success: true,
        action: "citation_run_completed",
        runId: runResult.runId,
        totalChecks: runResult.totalChecks,
        totalCited: runResult.totalCited,
        citationRate:
          runResult.totalChecks > 0
            ? Math.round((runResult.totalCited / runResult.totalChecks) * 100)
            : 0,
        byPrompt,
        output: `Citation run ${runResult.runId}: ${runResult.totalCited}/${runResult.totalChecks} cited.`,
      };
    }

    assertTransition("agent_task", "in_progress", "completed");
    const updated = await storage.updateAgentTask(task.id, {
      status: "completed",
      completedAt: new Date(),
      outputData: result,
      tokensUsed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifactType: artifactType as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifactId: artifactId as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    claimedTaskId = null;

    return {
      task: updated ?? task,
      result,
      tokensUsed,
      artifactType,
      artifactId,
    };
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, taskId: task.id, taskType: task.taskType }, "agent task failed");
    try {
      await storage.updateAgentTask(task.id, {
        status: "failed",
        completedAt: new Date(),
        error: errMsg,
      });
    } finally {
      claimedTaskId = null;
    }
    throw new AgentTaskExecutionError(errMsg, "handler_failed", task);
  } finally {
    if (claimedTaskId) {
      try {
        await storage.updateAgentTask(claimedTaskId, {
          status: "failed",
          completedAt: new Date(),
          error: "Execution interrupted before completion",
        });
      } catch (err) {
        logger.error({ err, claimedTaskId }, "finally: failed to mark task failed");
      }
    }
  }
}
