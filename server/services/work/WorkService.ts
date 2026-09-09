import {
  WorkPolicyError,
  type EvidenceReference,
  type TaskCommand,
  type TaskState,
  type TaskType,
  type VerificationMethod,
} from "@shared/work";
import type { RequestActor } from "../../lib/requestActor";
import type {
  WorkOutcomeReviewInput,
  WorkRepository,
  WorkVerificationResult,
} from "../../domains/work/repository";
import type {
  WorkAwardView,
  WorkGoal,
  WorkSummaryInputs,
  WorkTaskDetailsView,
  WorkTaskView,
} from "../../storage/workStorage";
import { WorkServiceError } from "./workServiceErrors";

export type WorkBrandReader = {
  findActiveBrand(actor: RequestActor, brandId: string): Promise<{ id: string } | undefined>;
};

export type WorkTaskWithDetails = WorkTaskView & { details: WorkTaskDetailsView };

export type WorkExportDetails = WorkTaskDetailsView & {
  awards: WorkAwardView[];
  reversals: WorkAwardView[];
};

export type WorkTaskPageFilters = {
  status?: string;
  taskType?: TaskType;
  date?: string;
  taskId?: string;
  limit?: number;
  cursor?: string;
};

export type WorkHistoryEvent = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  taskTitle: string;
  taskType: TaskType;
  revision: number;
  priorState: string | null;
  state: TaskState;
  actorId: string | null;
  actorKind: string;
  reason: string | null;
  verificationMethod: unknown;
  occurredAt: Date;
  award?: WorkHistoryAward;
};

export type WorkHistoryAward = {
  awardKey: string;
  points: number;
  taskType: TaskType;
  taskVersion: number;
  ruleVersion: number;
  cycleKey: string;
  verification: VerificationMethod;
  evidenceCount: number;
  awarded: boolean;
  awardedAt: Date;
  awardStatus: "awarded" | "reversed" | "adjustment";
};

export type WorkTodayResult = {
  mode: "guided" | "expert";
  summary: WorkSummaryInputs | undefined;
  goal: WorkGoal | null;
  tasks: Array<WorkTaskView | WorkTaskWithDetails>;
};

export type WorkService = ReturnType<typeof createWorkService>;

export function createWorkService({
  actor,
  repository,
  brandReader,
}: {
  actor: RequestActor;
  repository: WorkRepository;
  brandReader: WorkBrandReader;
}) {
  async function ownsBrand(brandId: string): Promise<boolean> {
    return (await brandReader.findActiveBrand(actor, brandId)) !== undefined;
  }

  async function getToday(input: {
    brandId: string;
    mode: "guided" | "expert";
  }): Promise<WorkTodayResult | { kind: "not_found" }> {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" };
    const [summary, goal, listedTasks] = await Promise.all([
      repository.getSummaryInputs(input.brandId),
      repository.getActiveBrandGoal(input.brandId),
      repository.listTasks(input.brandId, { limit: 100 }),
    ]);
    if (goal === undefined || listedTasks === undefined) return { kind: "not_found" };
    const topTasks = listedTasks
      .filter((item) => isActionableState(item.state))
      .sort(compareWorkTasks)
      .slice(0, 3);
    const tasks =
      input.mode === "guided"
        ? topTasks.map(stripStoredDetails)
        : await Promise.all(
            topTasks.map(async (item) => {
              const details = await repository.getTaskDetails(input.brandId, item.id);
              return details ? { ...item, details } : item;
            }),
          );
    return { mode: input.mode, summary, goal, tasks };
  }

  async function getTasks(input: { brandId: string }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    const result = await repository.listTasks(input.brandId);
    return result === undefined ? ({ kind: "not_found" } as const) : result;
  }

  async function getTaskPage(input: { brandId: string; filters?: WorkTaskPageFilters }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    const filters = input.filters ?? {};
    if (filters.status === "reversed") return { items: [], nextCursor: null };
    const limit = filters.limit ?? 25;
    const cursor = decodeCursor(filters.cursor);
    if (filters.cursor && !cursor) {
      throw new WorkServiceError("invalid_transition", "The work cursor is invalid");
    }
    const states = stateFilter(filters.status);
    const listed = await listAllTasks(repository, input.brandId, states, filters.taskType);
    if (listed === undefined) return { kind: "not_found" } as const;
    const filtered = listed
      .filter((task) => !filters.taskId || task.id === filters.taskId)
      .filter((task) => !filters.date || task.updatedAt.toISOString().slice(0, 10) === filters.date)
      .sort(compareWorkTasks)
      .filter((task) => !cursor || isAfterTaskCursor(task, cursor));
    const items = filtered.slice(0, limit);
    return {
      items,
      nextCursor: filtered.length > limit ? encodeTaskCursor(items[items.length - 1]) : null,
    };
  }

  async function getHistory(input: { brandId: string; filters?: WorkTaskPageFilters }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    const filters = input.filters ?? {};
    const cursor = decodeCursor(filters.cursor);
    if (filters.cursor && !cursor) {
      throw new WorkServiceError("invalid_transition", "The work cursor is invalid");
    }
    const states = filters.status === "reversed" ? undefined : stateFilter(filters.status);
    const listed = await listAllTasks(repository, input.brandId, states, filters.taskType);
    if (listed === undefined) return { kind: "not_found" } as const;
    const events: WorkHistoryEvent[] = [];
    const awards = await repository.listAwardEvents(input.brandId);
    if (awards === undefined) return { kind: "not_found" } as const;
    const taskById = new Map(listed.map((task) => [task.id, task]));
    for (const award of awards) {
      if (filters.status && filters.status !== "reversed") continue;
      if (filters.status === "reversed" && award.awardStatus !== "reversed") continue;
      if (filters.taskId && award.taskId !== filters.taskId) continue;
      const task = taskById.get(award.taskId);
      if (filters.taskType && task?.taskType !== filters.taskType) continue;
      if (filters.date && award.occurredAt.toISOString().slice(0, 10) !== filters.date) continue;
      const details = task
        ? await repository.getTaskDetails(input.brandId, award.taskId)
        : undefined;
      if (task) events.push(awardToHistoryEvent(award, task, details));
    }
    if (filters.status !== "reversed") {
      for (const task of listed) {
        if (filters.taskId && task.id !== filters.taskId) continue;
        const details = await repository.getTaskDetails(input.brandId, task.id);
        for (const event of details?.history ?? []) {
          if (!isTaskState(event.nextState)) continue;
          const projected: WorkHistoryEvent = {
            id: event.id,
            taskId: event.taskId,
            brandId: event.brandId,
            taskVersion: event.taskVersion,
            taskTitle: task.title,
            taskType: task.taskType,
            revision: event.revision,
            state: event.nextState,
            priorState: event.priorState,
            actorId: event.actorId,
            actorKind: event.actorKind,
            reason: event.reason,
            verificationMethod: event.verificationMethod,
            occurredAt: event.createdAt,
          };
          if (filters.status === "assigned" && !isActionableStateValue(projected.state)) continue;
          if (
            filters.status &&
            filters.status !== "assigned" &&
            filters.status !== "reversed" &&
            projected.state !== filters.status
          )
            continue;
          if (filters.date && projected.occurredAt.toISOString().slice(0, 10) !== filters.date)
            continue;
          events.push(projected);
        }
      }
    }
    events.sort(compareHistoryEvents);
    const filtered = events.filter((event) => !cursor || isAfterHistoryCursor(event, cursor));
    const limit = filters.limit ?? 25;
    const items = filtered.slice(0, limit);
    return {
      items,
      nextCursor: filtered.length > limit ? encodeHistoryCursor(items[items.length - 1]) : null,
    };
  }

  async function exportWork(input: { brandId: string }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    const tasks = await listAllTasks(repository, input.brandId, undefined, undefined);
    if (tasks === undefined) return { kind: "not_found" } as const;
    const awards = await repository.listAwardEvents(input.brandId);
    if (awards === undefined) return { kind: "not_found" } as const;
    const awardsByTask = new Map<string, WorkAwardView[]>();
    for (const award of awards) {
      const taskAwards = awardsByTask.get(award.taskId) ?? [];
      taskAwards.push(award);
      awardsByTask.set(award.taskId, taskAwards);
    }
    const exported = await Promise.all(
      tasks.map(async (task) => {
        const taskAwards = awardsByTask.get(task.id) ?? [];
        return {
          task,
          details: {
            ...((await repository.getTaskDetails(input.brandId, task.id)) ?? {
              evidence: [],
              history: [],
            }),
            awards: taskAwards,
            reversals: taskAwards.filter((award) => award.awardStatus === "reversed"),
          } satisfies WorkExportDetails,
        };
      }),
    );
    return { manifestVersion: 1, brandId: input.brandId, exportedAt: new Date(), tasks: exported };
  }

  async function getTask(input: { brandId: string; taskId: string }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    const task = await repository.getTask(input.brandId, input.taskId);
    if (!task) return { kind: "not_found" } as const;
    const details = await repository.getTaskDetails(input.brandId, input.taskId);
    return { task, details: details ?? { evidence: [], history: [] } };
  }

  async function transitionTask(input: {
    brandId: string;
    taskId: string;
    expectedRevision: number;
    command: TaskCommand;
  }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    if (input.command.kind === "submit" && input.command.evidence.length === 0) {
      throw new WorkServiceError("missing_evidence", "Task-specific evidence is required");
    }
    try {
      return mapMutationResult(
        await repository.transitionTask(
          input.brandId,
          input.taskId,
          input.expectedRevision,
          input.command,
        ),
      );
    } catch (error) {
      throw mapServiceError(error);
    }
  }

  async function addEvidence(input: {
    brandId: string;
    taskId: string;
    expectedRevision: number;
    evidence: readonly EvidenceReference[];
  }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    try {
      return mapMutationResult(
        await repository.appendEvidence(
          input.brandId,
          input.taskId,
          input.expectedRevision,
          input.evidence,
        ),
      );
    } catch (error) {
      throw mapServiceError(error);
    }
  }

  async function verifyTask(input: {
    brandId: string;
    taskId: string;
    expectedRevision: number;
    cycleKey: string;
    verification: WorkVerificationResult["award"]["verificationMethod"];
    evidence: readonly EvidenceReference[];
  }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    try {
      const result = await repository.verifyAndAward(
        input.brandId,
        input.taskId,
        input.expectedRevision,
        {
          cycleKey: input.cycleKey,
          verification: input.verification,
          evidence: input.evidence,
        },
      );
      if (result.kind === "not_found") return result;
      if (result.kind === "conflict") {
        throw new WorkServiceError("revision_conflict", "The task revision is stale", {
          currentRevision: result.currentRevision,
        });
      }
      return {
        ...result.value,
        created: result.value.created,
      };
    } catch (error) {
      throw mapServiceError(error);
    }
  }

  async function reviewTask(input: {
    brandId: string;
    taskId: string;
    expectedRevision: number;
    cycleKey: string;
    measurementScope: WorkOutcomeReviewInput["measurementScope"];
    decision: WorkOutcomeReviewInput["decision"];
    notes?: string | null;
    visibilityEvidenceVersion?: number | null;
    businessResultEventId?: string | null;
    nextCheckAt?: Date | string | null;
  }) {
    if (!(await ownsBrand(input.brandId))) return { kind: "not_found" } as const;
    try {
      const result = await repository.recordOutcomeReview(
        input.brandId,
        input.taskId,
        input.expectedRevision,
        {
          cycleKey: input.cycleKey,
          measurementScope: input.measurementScope,
          decision: input.decision,
          notes: input.notes,
          visibilityEvidenceVersion: input.visibilityEvidenceVersion,
          businessResultEventId: input.businessResultEventId,
          nextCheckAt:
            input.nextCheckAt instanceof Date
              ? input.nextCheckAt.toISOString()
              : (input.nextCheckAt ?? null),
        },
      );
      if (result.kind === "not_found") return result;
      if (result.kind === "conflict") {
        throw new WorkServiceError("revision_conflict", "The task revision is stale", {
          currentRevision: result.currentRevision,
        });
      }
      return { ...result.value, pointsChanged: 0 };
    } catch (error) {
      throw mapServiceError(error);
    }
  }

  return {
    getToday,
    getTasks,
    getTaskPage,
    getHistory,
    exportWork,
    getTask,
    transitionTask,
    addEvidence,
    verifyTask,
    reviewTask,
  };
}

function stateFilter(
  status: WorkTaskPageFilters["status"],
): readonly WorkTaskView["state"][] | undefined {
  if (!status) return undefined;
  if (status === "reversed") return [];
  if (status === "assigned")
    return [
      "suggested",
      "accepted",
      "in_progress",
      "submitted",
      "waiting_for_observation",
      "reopened",
    ];
  if (isTaskState(status)) return [status];
  return undefined;
}

function isTaskState(value: string): value is WorkTaskView["state"] {
  return (
    value === "suggested" ||
    value === "accepted" ||
    value === "in_progress" ||
    value === "submitted" ||
    value === "verified" ||
    value === "waiting_for_observation" ||
    value === "dismissed" ||
    value === "not_applicable" ||
    value === "reopened"
  );
}

function encodeTaskCursor(task: WorkTaskView): string {
  return encodeCursor({ timestamp: task.updatedAt.toISOString(), id: task.id });
}

function encodeHistoryCursor(event: WorkHistoryEvent): string {
  return encodeCursor({ timestamp: event.occurredAt.toISOString(), id: event.id });
}

function encodeCursor(value: { timestamp: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

type WorkCursor = { timestamp: string; id: string };

function decodeCursor(cursor: string | undefined): WorkCursor | undefined {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "timestamp" in parsed &&
      typeof parsed.timestamp === "string" &&
      !Number.isNaN(Date.parse(parsed.timestamp)) &&
      "id" in parsed &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { timestamp: new Date(parsed.timestamp).toISOString(), id: parsed.id };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function isWorkCursor(value: string): boolean {
  return decodeCursor(value) !== undefined;
}

async function listAllTasks(
  repository: WorkRepository,
  brandId: string,
  states: readonly WorkTaskView["state"][] | undefined,
  taskType: TaskType | undefined,
): Promise<WorkTaskView[] | undefined> {
  const results: WorkTaskView[] = [];
  let offset = 0;
  while (true) {
    const page = await repository.listTasks(brandId, {
      ...(states ? { state: states } : {}),
      ...(taskType ? { taskType } : {}),
      limit: 100,
      offset,
    });
    if (page === undefined) return undefined;
    results.push(...page);
    if (page.length < 100) return results;
    offset += page.length;
  }
}

function isAfterTaskCursor(task: WorkTaskView, cursor: WorkCursor): boolean {
  const time = task.updatedAt.toISOString();
  return (
    time < cursor.timestamp || (time === cursor.timestamp && task.id.localeCompare(cursor.id) > 0)
  );
}

function isAfterHistoryCursor(event: WorkHistoryEvent, cursor: WorkCursor): boolean {
  const time = event.occurredAt.toISOString();
  return (
    time < cursor.timestamp || (time === cursor.timestamp && event.id.localeCompare(cursor.id) > 0)
  );
}

function compareHistoryEvents(left: WorkHistoryEvent, right: WorkHistoryEvent): number {
  return right.occurredAt.getTime() - left.occurredAt.getTime() || left.id.localeCompare(right.id);
}

function awardToHistoryEvent(
  award: WorkAwardView,
  task: WorkTaskView,
  details: WorkTaskDetailsView | undefined,
): WorkHistoryEvent {
  return {
    id: award.id,
    taskId: award.taskId,
    brandId: award.brandId,
    taskVersion: award.taskVersion,
    taskTitle: task.title,
    taskType: task.taskType,
    revision: 0,
    state: task.state,
    priorState: null,
    actorId: null,
    actorKind: "system",
    reason: award.reason,
    verificationMethod: award.verificationMethod,
    occurredAt: award.occurredAt,
    award: {
      awardKey: award.awardKey,
      points: award.points,
      taskType: task.taskType,
      taskVersion: award.taskVersion,
      ruleVersion: award.ruleVersion,
      cycleKey: award.cycleKey,
      verification: award.verificationMethod,
      evidenceCount:
        details?.evidence.filter((item) => item.evidenceVersion === award.evidenceVersion).length ??
        0,
      awarded: award.awardStatus === "awarded",
      awardedAt: award.occurredAt,
      awardStatus: award.awardStatus,
    },
  };
}

function isNotFound(value: unknown): value is { kind: "not_found" } {
  return (
    typeof value === "object" && value !== null && "kind" in value && value.kind === "not_found"
  );
}

function stripStoredDetails(task: WorkTaskView): WorkTaskView {
  return task;
}

function isActionableState(state: WorkTaskView["state"]): boolean {
  return (
    state === "suggested" ||
    state === "accepted" ||
    state === "in_progress" ||
    state === "submitted" ||
    state === "waiting_for_observation" ||
    state === "reopened"
  );
}

function isActionableStateValue(state: string): boolean {
  return (
    state === "suggested" ||
    state === "accepted" ||
    state === "in_progress" ||
    state === "submitted" ||
    state === "waiting_for_observation" ||
    state === "reopened"
  );
}

function compareWorkTasks(left: WorkTaskView, right: WorkTaskView): number {
  const updatedDifference = right.updatedAt.getTime() - left.updatedAt.getTime();
  return updatedDifference || left.id.localeCompare(right.id);
}

function mapMutationResult<T>(
  result:
    | { kind: "updated"; value: T }
    | { kind: "conflict"; currentRevision: number }
    | { kind: "not_found" },
): T | { kind: "not_found" } {
  if (result.kind === "not_found") return result;
  if (result.kind === "conflict") {
    throw new WorkServiceError("revision_conflict", "The task revision is stale", {
      currentRevision: result.currentRevision,
    });
  }
  return result.value;
}

function mapServiceError(error: unknown): unknown {
  if (error instanceof WorkServiceError) return error;
  if (error instanceof WorkPolicyError) {
    if (error.code === "configuration_error") {
      return new WorkServiceError("configuration_error", error.message);
    }
    return new WorkServiceError(error.code, error.message);
  }
  return error;
}
