// Approve / dismiss / undo orchestration for Ask action cards
// (04-implementation-plan.md §4.1, §4.3). Reads/writes agent_tasks directly
// (a shared platform table - see kinds.ts's header) and enqueues through the
// existing outbox_commands infrastructure (server/outbox/outboxRepository.ts).
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { createOutboxRepository } from "../../outbox/outboxRepository";
import { requireBrand } from "../../lib/ownership";
import type { AskActionCard } from "@shared/ask/actions";
import { ACTION_KIND_DEFS } from "./kinds";

const outbox = createOutboxRepository();

export class ActionNotFoundError extends Error {}
export class ActionConflictError extends Error {}

async function requireOwnedTask(taskId: string, userId: string): Promise<schema.AgentTask> {
  const [task] = await db
    .select()
    .from(schema.agentTasks)
    .where(eq(schema.agentTasks.id, taskId))
    .limit(1);
  if (!task || !task.brandId) throw new ActionNotFoundError("Action not found");
  await requireBrand(task.brandId, userId); // throws OwnershipError (404) on mismatch
  return task;
}

export async function toActionCard(task: schema.AgentTask): Promise<AskActionCard> {
  const def = ACTION_KIND_DEFS[task.taskType as keyof typeof ACTION_KIND_DEFS];
  const kindLabel = def?.kindLabel ?? task.taskType;
  const input = (task.inputData ?? {}) as Record<string, unknown>;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" || typeof v === "number") params[k] = String(v);
  }

  let status: AskActionCard["status"];
  switch (task.status) {
    case "proposed":
    case "queued":
    case "scheduled":
    case "in_progress":
      status = "pending";
      break;
    case "completed":
      status = "done";
      break;
    case "cancelled":
      status = "dismissed";
      break;
    case "reversed":
      status = "reversed";
      break;
    case "failed":
    default:
      status = "failed";
      break;
  }

  let isReversible = false;
  let undoDisabledReason: string | null = null;
  if (status === "done" && def) {
    const check = await def.isReversible(task);
    isReversible = check.ok;
    undoDisabledReason = check.ok ? null : check.reason;
  } else if (status !== "done") {
    undoDisabledReason = "Not yet completed";
  }

  return {
    id: task.id,
    kind: task.taskType as AskActionCard["kind"],
    kindLabel,
    status,
    title: task.taskTitle,
    inputEcho: ((task.metadata as Record<string, unknown> | null)?.inputEcho as string) ?? "",
    rationale: task.taskDescription ?? "",
    params,
    isReversible,
    undoDisabledReason,
  };
}

export async function approveAction(taskId: string, userId: string): Promise<AskActionCard> {
  const task = await requireOwnedTask(taskId, userId);
  if (task.status !== "proposed") {
    throw new ActionConflictError(`Action is '${task.status}', not proposed`);
  }

  await db.transaction(async (tx) => {
    // Conditional update inside the same transaction as the enqueue: only
    // one concurrent approve can win the 'proposed' -> 'queued' transition,
    // which is what makes a double-click safe without relying solely on the
    // outbox's own idempotency key.
    const updated = await tx
      .update(schema.agentTasks)
      .set({ status: "queued", decidedAt: new Date(), decidedBy: userId })
      .where(and(eq(schema.agentTasks.id, taskId), eq(schema.agentTasks.status, "proposed")))
      .returning({ id: schema.agentTasks.id });
    if (updated.length === 0) {
      throw new ActionConflictError("Action was already decided");
    }

    const input = (task.inputData ?? {}) as Record<string, unknown>;
    if (task.taskType === "track_prompt") {
      await outbox.enqueueInTransaction(tx, {
        kind: "ask.track_prompt",
        idempotencyKey: `ask-track-prompt:${taskId}`,
        aggregateType: "ask_action",
        aggregateId: taskId,
        userId,
        brandId: task.brandId,
        payload: {
          kind: "ask.track_prompt",
          taskId,
          promptId: String(input.promptId),
        },
        maxAttempts: 5,
        providerName: "internal",
        providerOperation: "ask_track_prompt",
      });
    } else if (task.taskType === "run_citation_check") {
      const promptIds = Array.isArray(input.promptIds) ? (input.promptIds as string[]) : undefined;
      await outbox.enqueueInTransaction(tx, {
        kind: "ask.run_citation_check",
        idempotencyKey: `ask-run-citation-check:${taskId}`,
        aggregateType: "ask_action",
        aggregateId: taskId,
        userId,
        brandId: task.brandId,
        payload: {
          kind: "ask.run_citation_check",
          taskId,
          brandId: task.brandId!,
          userId,
          ...(promptIds ? { promptIds } : {}),
        },
        maxAttempts: 3,
        providerName: "internal",
        providerOperation: "ask_run_citation_check",
      });
    } else if (task.taskType === "remember_fact") {
      await outbox.enqueueInTransaction(tx, {
        kind: "ask.remember_fact",
        idempotencyKey: `ask-remember-fact:${taskId}`,
        aggregateType: "ask_action",
        aggregateId: taskId,
        userId,
        brandId: task.brandId,
        payload: { kind: "ask.remember_fact", taskId },
        maxAttempts: 5,
        providerName: "internal",
        providerOperation: "ask_remember_fact",
      });
    } else {
      throw new ActionConflictError(`Action kind '${task.taskType}' cannot be approved`);
    }
  });

  const [reloaded] = await db
    .select()
    .from(schema.agentTasks)
    .where(eq(schema.agentTasks.id, taskId))
    .limit(1);
  return toActionCard(reloaded);
}

export async function dismissAction(taskId: string, userId: string): Promise<AskActionCard> {
  const task = await requireOwnedTask(taskId, userId);
  const updated = await db
    .update(schema.agentTasks)
    .set({ status: "cancelled", decidedAt: new Date(), decidedBy: userId, completedAt: new Date() })
    .where(and(eq(schema.agentTasks.id, taskId), eq(schema.agentTasks.status, "proposed")))
    .returning();
  if (updated.length === 0) {
    throw new ActionConflictError(`Action is '${task.status}', not proposed`);
  }
  return toActionCard(updated[0]);
}

export async function undoAction(taskId: string, userId: string): Promise<AskActionCard> {
  const task = await requireOwnedTask(taskId, userId);
  const def = ACTION_KIND_DEFS[task.taskType as keyof typeof ACTION_KIND_DEFS];
  if (!def) throw new ActionConflictError(`Unknown action kind '${task.taskType}'`);

  const check = await def.isReversible(task);
  if (!check.ok) throw new ActionConflictError(check.reason);

  await db.transaction(async (tx) => {
    if (task.taskType === "track_prompt") {
      const input = (task.inputData ?? {}) as Record<string, unknown>;
      await outbox.enqueueInTransaction(tx, {
        kind: "ask.untrack_prompt",
        idempotencyKey: `ask-untrack-prompt:${taskId}`,
        aggregateType: "ask_action",
        aggregateId: taskId,
        userId,
        brandId: task.brandId,
        payload: { kind: "ask.untrack_prompt", taskId, promptId: String(input.promptId) },
        maxAttempts: 5,
        providerName: "internal",
        providerOperation: "ask_untrack_prompt",
      });
    } else if (task.taskType === "run_citation_check") {
      // Always enqueue the inverse; also best-effort request cancellation of
      // the forward command if it hasn't run yet (07 §2). We do not race
      // these - both always happen, and the forward handler's own
      // not_claimable branch (outboxAdapter.ts) makes this safe either way.
      await outbox.enqueueInTransaction(tx, {
        kind: "ask.cancel_citation_check",
        idempotencyKey: `ask-cancel-citation-check:${taskId}`,
        aggregateType: "ask_action",
        aggregateId: taskId,
        userId,
        brandId: task.brandId,
        payload: { kind: "ask.cancel_citation_check", taskId },
        maxAttempts: 5,
        providerName: "internal",
        providerOperation: "ask_cancel_citation_check",
      });
    } else if (task.taskType === "remember_fact") {
      await outbox.enqueueInTransaction(tx, {
        kind: "ask.forget_fact",
        idempotencyKey: `ask-forget-fact:${taskId}`,
        aggregateType: "ask_action",
        aggregateId: taskId,
        userId,
        brandId: task.brandId,
        payload: { kind: "ask.forget_fact", taskId },
        maxAttempts: 5,
        providerName: "internal",
        providerOperation: "ask_forget_fact",
      });
    }
  });

  const [reloaded] = await db
    .select()
    .from(schema.agentTasks)
    .where(eq(schema.agentTasks.id, taskId))
    .limit(1);
  return toActionCard(reloaded);
}
