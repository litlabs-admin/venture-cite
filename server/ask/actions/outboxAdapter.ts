// Outbox handlers for Ask's action kinds (04-implementation-plan.md §4,
// 07-integration-and-hardening.md §2). Approving a card enqueues one of
// these; it never executes inline - matching the observed "Add to queue"
// verb (01-trakkr-teardown.md R1).
//
// Undo rule (07 §2, verified against server/outbox/outboxWorker.ts and
// outboxRepository.ts): cancellation is honoured at claim, pre-handler and
// on-release, but NOT once a handler is executing. So undo always enqueues
// the inverse command and additionally requests cancellation as a
// best-effort optimisation - it never races "cancel or run the inverse".
// Every handler below is therefore idempotent and safe to run against a
// forward action that never actually executed.
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "@shared/schema";
import type { OutboxCommandHandler } from "../../outbox/outboxWorker";
import { logger } from "../../lib/logger";
import { citationRatePct } from "@shared/visibilityMetrics";

export function createAskTrackPromptHandler(): OutboxCommandHandler {
  return async ({ command }) => {
    const payload = command.payload as Extract<
      typeof command.payload,
      { kind: "ask.track_prompt" }
    >;
    const { storage } = await import("../../storage");
    // Idempotent: promoting an already-tracked prompt is a harmless re-set,
    // not an error - a retried delivery must not fail.
    await storage.promoteSuggestionToTracked(payload.promptId, null);
    await db
      .update(schema.agentTasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        artifactType: "brand_prompt",
        artifactId: payload.promptId,
        outputData: { success: true, action: "prompt_tracked", promptId: payload.promptId },
      })
      .where(and(eq(schema.agentTasks.id, payload.taskId), eq(schema.agentTasks.status, "queued")));
    return { providerReference: `ask-track-prompt:${payload.taskId}` };
  };
}

export function createAskUntrackPromptHandler(): OutboxCommandHandler {
  return async ({ command }) => {
    const payload = command.payload as Extract<
      typeof command.payload,
      { kind: "ask.untrack_prompt" }
    >;
    const { storage } = await import("../../storage");
    // archiveBrandPrompt is already idempotent (an UPDATE with no matching
    // status guard - archiving an already-archived prompt is a no-op write).
    await storage.archiveBrandPrompt(payload.promptId);
    await db
      .update(schema.agentTasks)
      .set({ status: "reversed", reversedAt: new Date() })
      .where(eq(schema.agentTasks.id, payload.taskId));
    return { providerReference: `ask-untrack-prompt:${payload.taskId}` };
  };
}

export function createAskRunCitationCheckHandler(): OutboxCommandHandler {
  return async ({ command }) => {
    const payload = command.payload as Extract<
      typeof command.payload,
      { kind: "ask.run_citation_check" }
    >;
    const { storage } = await import("../../storage");

    // Atomic claim via the SAME primitive agentTaskExecutor.ts uses
    // (storage.claimAgentTask flips queued -> in_progress in one UPDATE,
    // matching zero rows for a loser). Deliberately NOT calling
    // executeAgentTask itself: that function dispatches only on
    // taskType === 'prompt_test' (isKnownAgentTaskType), and Ask's
    // agent_tasks rows carry taskType = the Ask action kind
    // ('run_citation_check') for card rendering (execute.ts's
    // toActionCard). Reusing the atomic claim without the taskType coupling
    // keeps the two "kind" concepts - Ask's action kind and
    // agentTaskExecutor's dispatch key - from colliding on one column.
    const claimed = await storage.claimAgentTask(payload.taskId);
    if (!claimed) {
      // Not claimable: either already run, or the undo path
      // (cancel_citation_check) got there first and flipped it to
      // 'cancelled'. Both are a successful outcome for THIS command - the
      // idempotent-inverse rule from 07 §2 means "nothing to do" is not an
      // error.
      logger.info({ taskId: payload.taskId }, "ask.run_citation_check: task no longer claimable");
      return { providerReference: `ask-run-citation-check:${payload.taskId}:skipped` };
    }

    try {
      const promptIds = claimed.inputData
        ? ((claimed.inputData as Record<string, unknown>).promptIds as string[] | undefined)
        : payload.promptIds;
      const runResult = await import("../../citationChecker").then((m) =>
        m.runBrandPrompts(payload.brandId, undefined, {
          triggeredBy: "manual",
          promptIds: promptIds && promptIds.length > 0 ? promptIds : undefined,
        }),
      );
      await storage.updateAgentTask(payload.taskId, {
        status: "completed",
        completedAt: new Date(),
        artifactType: "citation_run",
        artifactId: runResult.runId,
        outputData: {
          success: true,
          action: "citation_run_completed",
          runId: runResult.runId,
          totalChecks: runResult.totalChecks,
          totalCited: runResult.totalCited,
          citationRate: citationRatePct(runResult.totalCited, runResult.totalChecks),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await storage.updateAgentTask(payload.taskId, {
        status: "failed",
        completedAt: new Date(),
        error: message,
      });
      throw err;
    }
    return { providerReference: `ask-run-citation-check:${payload.taskId}` };
  };
}

export function createAskCancelCitationCheckHandler(): OutboxCommandHandler {
  return async ({ command }) => {
    const payload = command.payload as Extract<
      typeof command.payload,
      { kind: "ask.cancel_citation_check" }
    >;
    // Atomic conditional update: only cancels a run that has not yet been
    // claimed by the forward handler. If the forward handler already
    // claimed it (status='in_progress'/'completed'), this is a no-op -
    // exactly the idempotent-inverse rule from 07 §2. Undo of an
    // already-completed run is reported as permanently unavailable by
    // isReversible in kinds.ts, so the UI should not reach this path for a
    // completed run in the first place; this guard is the server-side
    // backstop if it does.
    const result = await db
      .update(schema.agentTasks)
      .set({ status: "cancelled", completedAt: new Date(), reversedAt: new Date() })
      .where(
        and(
          eq(schema.agentTasks.id, payload.taskId),
          inArray(schema.agentTasks.status, ["proposed", "queued", "scheduled"]),
        ),
      )
      .returning({ id: schema.agentTasks.id });
    if (result.length === 0) {
      logger.info(
        { taskId: payload.taskId },
        "ask.cancel_citation_check: task already claimed or resolved - no-op",
      );
    }
    return { providerReference: `ask-cancel-citation-check:${payload.taskId}` };
  };
}
