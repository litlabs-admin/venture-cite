import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  brandCapabilityEvents,
  brandGoals,
  brands,
  workOutcomeReviews,
  workTaskEvidence,
  workTaskEvents,
  workAwardEvents,
  users,
  workTasks,
  type BrandCapabilityEvent,
  type WorkAwardEvent,
  type WorkOutcomeReview,
  type WorkTask,
} from "@shared/schema";
import {
  TASK_TYPES,
  type CapabilityMilestone,
  type EvidenceReference,
  type MeasurementScope,
  type TaskState,
  type TaskType,
  type VerificationMethod,
  parseMeasurementScope,
} from "@shared/work";
import type { RequestRepositoryTransaction } from "../data/requestRepositoryTransaction";
import type { TriggerEvidenceReference } from "../domains/work/opportunities";

/**
 * The task fields that a customer-facing work response may contain.
 *
 * User identifiers, policy internals, and worker state stay outside this
 * projection. The repository maps database rows to this shape before return.
 */
const workTaskDatabaseColumns = {
  id: workTasks.id,
  brandId: workTasks.brandId,
  goalId: workTasks.goalId,
  taskKey: workTasks.taskKey,
  taskVersion: workTasks.taskVersion,
  taskType: workTasks.taskType,
  state: workTasks.state,
  revision: workTasks.revision,
  title: workTasks.title,
  desiredResult: workTasks.desiredResult,
  buyerNeed: workTasks.buyerNeed,
  recommendedChange: workTasks.recommendedChange,
  reason: workTasks.reason,
  confidence: workTasks.confidence,
  effort: workTasks.effort,
  points: workTasks.points,
  completionRule: workTasks.completionRule,
  measurementScope: workTasks.measurementScope,
  nextCheckAt: workTasks.nextCheckAt,
  blockedReason: workTasks.blockedReason,
  dismissalReason: workTasks.dismissalReason,
  createdAt: workTasks.createdAt,
  updatedAt: workTasks.updatedAt,
  ownerFirstName: users.firstName,
  ownerLastName: users.lastName,
  ownerProfileImageUrl: users.profileImageUrl,
  ownerUserId: users.id,
} as const;

export const workTaskClientColumns = {
  id: workTasks.id,
  brandId: workTasks.brandId,
  goalId: workTasks.goalId,
  taskKey: workTasks.taskKey,
  taskVersion: workTasks.taskVersion,
  taskType: workTasks.taskType,
  state: workTasks.state,
  revision: workTasks.revision,
  title: workTasks.title,
  desiredResult: workTasks.desiredResult,
  buyerNeed: workTasks.buyerNeed,
  recommendedChange: workTasks.recommendedChange,
  reason: workTasks.reason,
  confidence: workTasks.confidence,
  effort: workTasks.effort,
  points: workTasks.points,
  completionRule: workTasks.completionRule,
  measurementScope: workTasks.measurementScope,
  nextCheckAt: workTasks.nextCheckAt,
  blockedReason: workTasks.blockedReason,
  dismissalReason: workTasks.dismissalReason,
  createdAt: workTasks.createdAt,
  updatedAt: workTasks.updatedAt,
} as const;

type WorkTaskClientRow = Pick<WorkTask, keyof typeof workTaskClientColumns>;
export type WorkTaskDatabaseRow = Omit<WorkTaskClientRow, "taskType" | "state"> & {
  taskType: TaskType;
  state: TaskState;
  ownerUserId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerProfileImageUrl: string | null;
};

type WorkTaskQueryRow = Omit<WorkTaskClientRow, "taskType" | "state"> & {
  taskType: string;
  state: string;
  ownerUserId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerProfileImageUrl: string | null;
};

export type WorkEvidenceRole = "trigger" | "submission" | "verification" | "result";
export type WorkEvidenceStatus = "submitted" | "verified" | "rejected" | "unavailable" | "failed";

export type WorkEvidenceInput = EvidenceReference;
export type WorkTriggerEvidenceInput = TriggerEvidenceReference;

type WorkTaskEvidenceInsertBase = {
  brandId: string;
  userId: string;
  taskId: string;
  taskVersion: number;
  status: WorkEvidenceStatus;
  evidenceVersion?: number;
};

type WorkTaskEvidenceInsertInput =
  | (WorkTaskEvidenceInsertBase & {
      role: "trigger";
      evidence: readonly WorkTriggerEvidenceInput[];
    })
  | (WorkTaskEvidenceInsertBase & {
      role: Exclude<WorkEvidenceRole, "trigger">;
      evidence: readonly WorkEvidenceInput[];
    });

const workAwardDatabaseColumns = {
  id: workAwardEvents.id,
  taskId: workAwardEvents.taskId,
  brandId: workAwardEvents.brandId,
  taskVersion: workAwardEvents.taskVersion,
  cycleKey: workAwardEvents.cycleKey,
  awardKey: workAwardEvents.awardKey,
  points: workAwardEvents.points,
  ruleVersion: workAwardEvents.ruleVersion,
  evidenceVersion: workAwardEvents.evidenceVersion,
  verificationMethod: workAwardEvents.verificationMethod,
  reason: workAwardEvents.reason,
  awardStatus: workAwardEvents.awardStatus,
  reversalReference: workAwardEvents.reversalReference,
  occurredAt: workAwardEvents.occurredAt,
} as const;

export const workAwardClientColumns = {
  id: workAwardEvents.id,
  taskId: workAwardEvents.taskId,
  brandId: workAwardEvents.brandId,
  taskVersion: workAwardEvents.taskVersion,
  cycleKey: workAwardEvents.cycleKey,
  awardKey: workAwardEvents.awardKey,
  points: workAwardEvents.points,
  ruleVersion: workAwardEvents.ruleVersion,
  evidenceVersion: workAwardEvents.evidenceVersion,
  verificationMethod: workAwardEvents.verificationMethod,
  reason: workAwardEvents.reason,
  awardStatus: workAwardEvents.awardStatus,
  reversalReference: workAwardEvents.reversalReference,
  occurredAt: workAwardEvents.occurredAt,
} as const;

type WorkAwardDatabaseRow = Pick<WorkAwardEvent, keyof typeof workAwardDatabaseColumns>;

export type WorkAwardView = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  cycleKey: string;
  awardKey: string;
  points: number;
  ruleVersion: number;
  evidenceVersion: number;
  verificationMethod: VerificationMethod;
  reason: string;
  awardStatus: "awarded" | "reversed" | "adjustment";
  reversalReference: string | null;
  occurredAt: Date;
};

const workOutcomeReviewClientColumns = {
  id: workOutcomeReviews.id,
  taskId: workOutcomeReviews.taskId,
  brandId: workOutcomeReviews.brandId,
  taskVersion: workOutcomeReviews.taskVersion,
  cycleKey: workOutcomeReviews.cycleKey,
  measurementScope: workOutcomeReviews.measurementScope,
  decision: workOutcomeReviews.decision,
  notes: workOutcomeReviews.notes,
  visibilityEvidenceVersion: workOutcomeReviews.visibilityEvidenceVersion,
  businessResultEventId: workOutcomeReviews.businessResultEventId,
  nextCheckAt: workOutcomeReviews.nextCheckAt,
  createdAt: workOutcomeReviews.createdAt,
  updatedAt: workOutcomeReviews.updatedAt,
} as const;

type WorkOutcomeReviewDatabaseRow = Pick<
  WorkOutcomeReview,
  keyof typeof workOutcomeReviewClientColumns
>;

export type WorkOutcomeReviewView = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  cycleKey: string;
  measurementScope: MeasurementScope;
  decision: "improvement" | "decline" | "no_material_change" | "unavailable";
  notes: string | null;
  visibilityEvidenceVersion: number | null;
  businessResultEventId: string | null;
  nextCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const workCapabilityClientColumns = {
  id: brandCapabilityEvents.id,
  brandId: brandCapabilityEvents.brandId,
  milestone: brandCapabilityEvents.milestone,
  eventKey: brandCapabilityEvents.eventKey,
  eventKind: brandCapabilityEvents.eventKind,
  taskId: brandCapabilityEvents.taskId,
  taskVersion: brandCapabilityEvents.taskVersion,
  evidenceVersion: brandCapabilityEvents.evidenceVersion,
  reason: brandCapabilityEvents.reason,
  occurredAt: brandCapabilityEvents.occurredAt,
} as const;

type WorkCapabilityDatabaseRow = Pick<
  BrandCapabilityEvent,
  keyof typeof workCapabilityClientColumns
>;

export type WorkCapabilityEventView = {
  id: string;
  brandId: string;
  milestone: CapabilityMilestone;
  eventKey: string;
  eventKind: "achieved" | "reversed";
  taskId: string | null;
  taskVersion: number | null;
  evidenceVersion: number | null;
  reason: string;
  occurredAt: Date;
};

export type WorkTaskOwner = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export type WorkTaskView = Omit<WorkTaskClientRow, "taskType" | "state" | "confidence"> & {
  taskType: TaskType;
  state: TaskState;
  confidence: number | null;
  owner: WorkTaskOwner | null;
};

export type WorkTaskEvidenceView = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  evidenceVersion: number;
  role: WorkEvidenceRole;
  kind: string;
  status: WorkEvidenceStatus;
  sourceUrl: string | null;
  finalUrl: string | null;
  canonicalUrl: string | null;
  retrievedAt: Date | null;
  observedAt: Date | null;
  excerpt: string | null;
  structuredFinding: unknown;
  createdAt: Date;
};

export type WorkTaskEventView = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  revision: number;
  priorState: string | null;
  nextState: string;
  actorId: string | null;
  actorKind: string;
  reason: string | null;
  verificationMethod: unknown;
  createdAt: Date;
};

export type WorkTaskDetailsView = {
  evidence: WorkTaskEvidenceView[];
  history: WorkTaskEventView[];
};

export type WorkTaskFilters = {
  state?: TaskState | readonly TaskState[];
  taskType?: TaskType | readonly TaskType[];
  limit?: number;
  offset?: number;
};

export type WorkTaskCreateInput = {
  taskKey: string;
  taskVersion?: number;
  taskType: TaskType;
  goalId?: string | null;
  title: string;
  desiredResult: string;
  buyerNeed?: string | null;
  recommendedChange: string;
  reason?: string | null;
  confidence?: string | null;
  effort?: number | null;
  completionRule?: unknown;
  measurementScope?: unknown;
  nextCheckAt?: string | null;
  sourceRecommendationId?: string | null;
};

export type WorkTaskSummaryCounts = {
  total: number;
  pending: number;
  suggested: number;
  accepted: number;
  inProgress: number;
  submitted: number;
  verified: number;
  waitingForObservation: number;
  dismissed: number;
  notApplicable: number;
  reopened: number;
};

export type WorkAwardSummary = {
  eventCount: number;
  points: number;
  awardedPoints: number;
  reversedPoints: number;
  adjustmentPoints: number;
  latestOccurredAt: Date | null;
};

export type WorkMilestoneSummary = {
  milestone: CapabilityMilestone;
  eventKind: "achieved" | "reversed";
  occurredAt: Date;
};

export type WorkSummaryInputs = {
  taskCounts: WorkTaskSummaryCounts;
  awards: WorkAwardSummary;
  capabilityState: WorkMilestoneSummary[];
};

export type WorkGoal = {
  title: string;
  statement: string;
};

const TASK_STATES: readonly TaskState[] = [
  "suggested",
  "accepted",
  "in_progress",
  "submitted",
  "verified",
  "waiting_for_observation",
  "dismissed",
  "not_applicable",
  "reopened",
];

const CAPABILITY_MILESTONES: readonly CapabilityMilestone[] = [
  "goal_selected_and_queue_reviewed",
  "baseline_ready",
  "evidenced_changes_complete",
  "decision_recorded",
  "multi_period_maintenance",
];

const isTaskState = (value: string): value is TaskState =>
  (TASK_STATES as readonly string[]).includes(value);

const isTaskType = (value: string): value is TaskType =>
  (TASK_TYPES as readonly string[]).includes(value);

const isCapabilityMilestone = (value: string): value is CapabilityMilestone =>
  (CAPABILITY_MILESTONES as readonly string[]).includes(value);

export function activeBrandScope(brandId: string, userId: string) {
  return and(eq(brands.id, brandId), eq(brands.userId, userId), isNull(brands.deletedAt));
}

function taskBrandJoinScope(brandId: string, userId: string) {
  return and(
    eq(brands.id, workTasks.brandId),
    eq(brands.id, brandId),
    eq(brands.userId, userId),
    isNull(brands.deletedAt),
  );
}

function awardBrandJoinScope(brandId: string, userId: string) {
  return and(
    eq(brands.id, workAwardEvents.brandId),
    eq(brands.id, brandId),
    eq(brands.userId, userId),
    isNull(brands.deletedAt),
  );
}

function normalizeConfidence(value: WorkTaskClientRow["confidence"]): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Work task confidence is not numeric");
  return parsed;
}

export function toWorkTaskView(row: WorkTaskDatabaseRow): WorkTaskView {
  if (!isTaskType(row.taskType)) throw new Error("Work task has an unsupported type");
  if (!isTaskState(row.state)) throw new Error("Work task has an unsupported state");
  return {
    id: row.id,
    brandId: row.brandId,
    goalId: row.goalId,
    taskKey: row.taskKey,
    taskVersion: row.taskVersion,
    taskType: row.taskType,
    state: row.state,
    revision: row.revision,
    title: row.title,
    desiredResult: row.desiredResult,
    buyerNeed: row.buyerNeed,
    recommendedChange: row.recommendedChange,
    reason: row.reason,
    confidence: normalizeConfidence(row.confidence),
    effort: row.effort,
    points: row.points,
    completionRule: row.completionRule,
    measurementScope: row.measurementScope,
    nextCheckAt: row.nextCheckAt,
    blockedReason: row.blockedReason,
    dismissalReason: row.dismissalReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owner: ownerDisplay(row),
  };
}

function ownerDisplay(row: WorkTaskDatabaseRow): WorkTaskOwner | null {
  const firstName = row.ownerFirstName ?? null;
  const lastName = row.ownerLastName ?? null;
  const profileImageUrl = row.ownerProfileImageUrl ?? null;
  const id = row.ownerUserId ?? null;
  if (id === null) {
    return null;
  }
  return {
    id,
    firstName,
    lastName,
    profileImageUrl,
  };
}

function normalizeWorkTaskDatabaseRow(row: WorkTaskQueryRow): WorkTaskDatabaseRow {
  if (!isTaskType(row.taskType)) throw new Error("Work task has an unsupported type");
  if (!isTaskState(row.state)) throw new Error("Work task has an unsupported state");
  return {
    ...row,
    taskType: row.taskType,
    state: row.state,
  };
}

export function selectWorkTask(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
): Promise<WorkTaskDatabaseRow | undefined> {
  return (async () => {
    const [row] = await transaction
      .select(workTaskDatabaseColumns)
      .from(workTasks)
      .innerJoin(brands, taskBrandJoinScope(brandId, userId))
      .leftJoin(users, eq(users.id, workTasks.ownerId))
      .where(
        and(eq(workTasks.brandId, brandId), eq(workTasks.userId, userId), eq(workTasks.id, taskId)),
      )
      .limit(1);
    return row ? normalizeWorkTaskDatabaseRow(row) : undefined;
  })();
}

export function selectWorkTaskByKey(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskKey: string,
  taskVersion: number,
): Promise<WorkTaskDatabaseRow | undefined> {
  return (async () => {
    const [row] = await transaction
      .select(workTaskDatabaseColumns)
      .from(workTasks)
      .innerJoin(brands, taskBrandJoinScope(brandId, userId))
      .leftJoin(users, eq(users.id, workTasks.ownerId))
      .where(
        and(
          eq(workTasks.brandId, brandId),
          eq(workTasks.userId, userId),
          eq(workTasks.taskKey, taskKey),
          eq(workTasks.taskVersion, taskVersion),
        ),
      )
      .limit(1);
    return row ? normalizeWorkTaskDatabaseRow(row) : undefined;
  })();
}

export function listWorkTasks(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  filters: WorkTaskFilters = {},
): Promise<WorkTaskDatabaseRow[]> {
  const conditions = [eq(workTasks.brandId, brandId), eq(workTasks.userId, userId)];
  if (filters.state !== undefined) {
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    conditions.push(
      states.length === 1 ? eq(workTasks.state, states[0]) : inArray(workTasks.state, states),
    );
  }
  if (filters.taskType !== undefined) {
    const taskTypes = Array.isArray(filters.taskType) ? filters.taskType : [filters.taskType];
    conditions.push(
      taskTypes.length === 1
        ? eq(workTasks.taskType, taskTypes[0])
        : inArray(workTasks.taskType, taskTypes),
    );
  }

  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);
  return (async () => {
    const rows = await transaction
      .select(workTaskDatabaseColumns)
      .from(workTasks)
      .innerJoin(brands, taskBrandJoinScope(brandId, userId))
      .leftJoin(users, eq(users.id, workTasks.ownerId))
      .where(and(...conditions))
      .orderBy(desc(workTasks.updatedAt), desc(workTasks.id))
      .limit(limit)
      .offset(offset);
    return rows.map(normalizeWorkTaskDatabaseRow);
  })();
}

export async function selectSummaryInputs(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
): Promise<WorkSummaryInputs> {
  const [taskCounts] = await transaction
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${workTasks.state} in ('suggested', 'accepted', 'in_progress', 'submitted', 'waiting_for_observation', 'reopened'))::int`,
      suggested: sql<number>`count(*) filter (where ${workTasks.state} = 'suggested')::int`,
      accepted: sql<number>`count(*) filter (where ${workTasks.state} = 'accepted')::int`,
      inProgress: sql<number>`count(*) filter (where ${workTasks.state} = 'in_progress')::int`,
      submitted: sql<number>`count(*) filter (where ${workTasks.state} = 'submitted')::int`,
      verified: sql<number>`count(*) filter (where ${workTasks.state} = 'verified')::int`,
      waitingForObservation: sql<number>`count(*) filter (where ${workTasks.state} = 'waiting_for_observation')::int`,
      dismissed: sql<number>`count(*) filter (where ${workTasks.state} = 'dismissed')::int`,
      notApplicable: sql<number>`count(*) filter (where ${workTasks.state} = 'not_applicable')::int`,
      reopened: sql<number>`count(*) filter (where ${workTasks.state} = 'reopened')::int`,
    })
    .from(workTasks)
    .innerJoin(brands, taskBrandJoinScope(brandId, userId))
    .where(and(eq(workTasks.brandId, brandId), eq(workTasks.userId, userId)));

  const [awardTotals] = await transaction
    .select({
      eventCount: sql<number>`count(*)::int`,
      points: sql<number>`coalesce(sum(${workAwardEvents.points}), 0)::int`,
      awardedPoints: sql<number>`coalesce(sum(${workAwardEvents.points}) filter (where ${workAwardEvents.awardStatus} = 'awarded'), 0)::int`,
      reversedPoints: sql<number>`coalesce(sum(${workAwardEvents.points}) filter (where ${workAwardEvents.awardStatus} = 'reversed'), 0)::int`,
      adjustmentPoints: sql<number>`coalesce(sum(${workAwardEvents.points}) filter (where ${workAwardEvents.awardStatus} = 'adjustment'), 0)::int`,
      latestOccurredAt: sql<Date | null>`max(${workAwardEvents.occurredAt})`,
    })
    .from(workAwardEvents)
    .innerJoin(brands, awardBrandJoinScope(brandId, userId))
    .where(and(eq(workAwardEvents.brandId, brandId), eq(workAwardEvents.userId, userId)));

  const capabilityResult = await transaction.execute(sql`
    select distinct on (capability.milestone)
      capability.milestone as "milestone",
      capability.event_kind as "eventKind",
      capability.occurred_at as "occurredAt"
    from public.brand_capability_events as capability
    inner join public.brands as brand
      on brand.id = capability.brand_id
    where capability.brand_id = ${brandId}
      and capability.user_id = ${userId}
      and brand.id = ${brandId}
      and brand.user_id = ${userId}
      and brand.deleted_at is null
    order by capability.milestone, capability.occurred_at desc, capability.id desc
  `);

  return {
    taskCounts: normalizeTaskCounts(taskCounts),
    awards: normalizeAwardTotals(awardTotals),
    capabilityState: rowsFromResult(capabilityResult).map(normalizeMilestoneSummary),
  };
}

export async function selectActiveBrandGoal(
  transaction: RequestRepositoryTransaction,
  brandId: string,
): Promise<WorkGoal | null> {
  const [row] = await transaction
    .select({ title: brandGoals.title, statement: brandGoals.statement })
    .from(brandGoals)
    .where(and(eq(brandGoals.brandId, brandId), eq(brandGoals.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function findActiveBrand(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
): Promise<WorkBrandVisibility> {
  const [brand] = await transaction
    .select({ id: brands.id })
    .from(brands)
    .where(activeBrandScope(brandId, userId))
    .limit(1);
  return brand ? { kind: "owned_active", brandId } : { kind: "not_found" };
}

export async function listWorkTaskEvidence(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
): Promise<WorkTaskEvidenceView[]> {
  const rows = await transaction
    .select({
      id: workTaskEvidence.id,
      taskId: workTaskEvidence.taskId,
      brandId: workTaskEvidence.brandId,
      taskVersion: workTaskEvidence.taskVersion,
      evidenceVersion: workTaskEvidence.evidenceVersion,
      role: workTaskEvidence.role,
      kind: workTaskEvidence.kind,
      status: workTaskEvidence.status,
      sourceUrl: workTaskEvidence.sourceUrl,
      finalUrl: workTaskEvidence.finalUrl,
      canonicalUrl: workTaskEvidence.canonicalUrl,
      retrievedAt: workTaskEvidence.retrievedAt,
      observedAt: workTaskEvidence.observedAt,
      excerpt: workTaskEvidence.excerpt,
      structuredFinding: workTaskEvidence.structuredFinding,
      createdAt: workTaskEvidence.createdAt,
    })
    .from(workTaskEvidence)
    .innerJoin(
      brands,
      and(
        eq(brands.id, workTaskEvidence.brandId),
        eq(brands.id, brandId),
        eq(brands.userId, userId),
        isNull(brands.deletedAt),
      ),
    )
    .where(
      and(
        eq(workTaskEvidence.brandId, brandId),
        eq(workTaskEvidence.userId, userId),
        eq(workTaskEvidence.taskId, taskId),
        eq(workTaskEvidence.taskVersion, taskVersion),
      ),
    )
    .orderBy(desc(workTaskEvidence.evidenceVersion), desc(workTaskEvidence.createdAt));
  return rows.map((row) => ({
    ...row,
    role: parseWorkEvidenceRole(row.role),
    status: parseWorkEvidenceStatus(row.status),
  }));
}

function parseWorkEvidenceRole(value: string): WorkEvidenceRole {
  if (
    value === "trigger" ||
    value === "submission" ||
    value === "verification" ||
    value === "result"
  ) {
    return value;
  }
  throw new Error("Work evidence role is invalid");
}

function parseWorkEvidenceStatus(value: string): WorkEvidenceStatus {
  if (
    value === "submitted" ||
    value === "verified" ||
    value === "rejected" ||
    value === "unavailable" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("Work evidence status is invalid");
}

export async function listWorkTaskEvents(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
): Promise<WorkTaskEventView[]> {
  return transaction
    .select({
      id: workTaskEvents.id,
      taskId: workTaskEvents.taskId,
      brandId: workTaskEvents.brandId,
      taskVersion: workTaskEvents.taskVersion,
      revision: workTaskEvents.revision,
      priorState: workTaskEvents.priorState,
      nextState: workTaskEvents.nextState,
      actorId: workTaskEvents.actorId,
      actorKind: workTaskEvents.actorKind,
      reason: workTaskEvents.reason,
      verificationMethod: workTaskEvents.verificationMethod,
      createdAt: workTaskEvents.createdAt,
    })
    .from(workTaskEvents)
    .innerJoin(
      brands,
      and(
        eq(brands.id, workTaskEvents.brandId),
        eq(brands.id, brandId),
        eq(brands.userId, userId),
        isNull(brands.deletedAt),
      ),
    )
    .where(
      and(
        eq(workTaskEvents.brandId, brandId),
        eq(workTaskEvents.userId, userId),
        eq(workTaskEvents.taskId, taskId),
        eq(workTaskEvents.taskVersion, taskVersion),
      ),
    )
    .orderBy(desc(workTaskEvents.revision), desc(workTaskEvents.createdAt));
}

export type WorkBrandVisibility = { kind: "owned_active"; brandId: string } | { kind: "not_found" };

export async function insertWorkTask(
  transaction: RequestRepositoryTransaction,
  userId: string,
  brandId: string,
  input: WorkTaskCreateInput,
  points: number,
  ruleVersion: number,
): Promise<boolean> {
  const values = {
    brandId,
    userId,
    goalId: input.goalId ?? null,
    taskKey: input.taskKey,
    taskVersion: input.taskVersion ?? 1,
    taskType: input.taskType,
    state: "suggested",
    ruleVersion,
    revision: 0,
    title: input.title,
    desiredResult: input.desiredResult,
    buyerNeed: input.buyerNeed ?? null,
    recommendedChange: input.recommendedChange,
    reason: input.reason ?? null,
    confidence: input.confidence ?? null,
    effort: input.effort ?? null,
    points,
    completionRule: input.completionRule ?? {},
    measurementScope: input.measurementScope ?? null,
    nextCheckAt:
      input.nextCheckAt === null || input.nextCheckAt === undefined
        ? null
        : dateValue(input.nextCheckAt, "next task check time"),
    sourceRecommendationId: input.sourceRecommendationId ?? null,
  } satisfies typeof workTasks.$inferInsert;
  const inserted = await transaction
    .insert(workTasks)
    .values(values)
    .onConflictDoNothing({
      target: [workTasks.brandId, workTasks.taskKey, workTasks.taskVersion],
    })
    .returning({ id: workTasks.id });
  return inserted.length > 0;
}

export type WorkTaskRevisionRow = {
  id: string;
  revision: number;
  state: TaskState;
  taskVersion: number;
};

export async function updateWorkTaskState(
  transaction: RequestRepositoryTransaction,
  input: {
    brandId: string;
    userId: string;
    taskId: string;
    expectedRevision: number;
    state: TaskState;
    dismissalReason?: string | null;
    verificationMethod?: VerificationMethod | null;
  },
): Promise<WorkTaskRevisionRow | undefined> {
  const values: Partial<typeof workTasks.$inferInsert> = {
    state: input.state,
    revision: input.expectedRevision + 1,
    updatedAt: new Date(),
  };
  if (input.dismissalReason !== undefined) values.dismissalReason = input.dismissalReason;
  if (input.verificationMethod !== undefined) {
    values.verificationMethod = input.verificationMethod;
  }
  const [row] = await transaction
    .update(workTasks)
    .set(values)
    .where(
      and(
        eq(workTasks.id, input.taskId),
        eq(workTasks.brandId, input.brandId),
        eq(workTasks.userId, input.userId),
        eq(workTasks.revision, input.expectedRevision),
      ),
    )
    .returning({
      id: workTasks.id,
      revision: workTasks.revision,
      state: workTasks.state,
      taskVersion: workTasks.taskVersion,
    });
  if (!row) return undefined;
  const state = row.state;
  if (!isTaskState(state)) return undefined;
  return { ...row, state };
}

export async function insertWorkTaskEvidence(
  transaction: RequestRepositoryTransaction,
  input: WorkTaskEvidenceInsertInput,
): Promise<void> {
  if (input.evidence.length === 0) return;
  const evidenceVersion = input.evidenceVersion ?? 1;
  if (!Number.isInteger(evidenceVersion) || evidenceVersion < 1) {
    throw new Error("Work evidence version must be a positive integer");
  }
  const values = input.evidence.map((reference) => evidenceRow(input, reference, evidenceVersion));
  await transaction.insert(workTaskEvidence).values(values);
}

export async function nextWorkEvidenceVersion(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
): Promise<number> {
  const [row] = await transaction
    .select({
      nextVersion: sql<number>`coalesce(max(${workTaskEvidence.evidenceVersion}), 0) + 1`,
    })
    .from(workTaskEvidence)
    .innerJoin(
      brands,
      and(
        eq(brands.id, workTaskEvidence.brandId),
        eq(brands.id, brandId),
        eq(brands.userId, userId),
        isNull(brands.deletedAt),
      ),
    )
    .where(
      and(
        eq(workTaskEvidence.brandId, brandId),
        eq(workTaskEvidence.userId, userId),
        eq(workTaskEvidence.taskId, taskId),
        eq(workTaskEvidence.taskVersion, taskVersion),
      ),
    );
  return positiveIntegerValue(row?.nextVersion, "next evidence version");
}

function evidenceRow(
  input: {
    brandId: string;
    userId: string;
    taskId: string;
    taskVersion: number;
    role: WorkEvidenceRole;
    status: WorkEvidenceStatus;
  },
  reference: WorkEvidenceInput | WorkTriggerEvidenceInput,
  evidenceVersion: number,
) {
  const base = {
    taskId: input.taskId,
    brandId: input.brandId,
    userId: input.userId,
    taskVersion: input.taskVersion,
    evidenceVersion,
    role: input.role,
    kind: reference.kind,
    status: input.status,
    submittedBy: input.userId,
    structuredFinding: reference,
  };
  switch (reference.kind) {
    case "source":
      return {
        ...base,
        sourceId: null,
        sourceUrl: reference.sourceUrl,
        finalUrl: reference.finalUrl ?? null,
        canonicalUrl: reference.canonicalUrl ?? null,
        retrievedAt: dateValue(reference.retrievedAt, "evidence retrieved time"),
        observedAt: null,
        excerpt: reference.excerpt,
      };
    case "artifact":
      return {
        ...base,
        sourceId: reference.artifactId,
        contentVersion: String(reference.version),
        observedAt: null,
      };
    case "measurement":
      return {
        ...base,
        sourceId: reference.measurementId,
        provider: reference.provider,
        promptVersion: reference.promptVersion,
        promptScope: { scopeId: reference.scopeId, coverage: reference.coverage },
        observedAt: dateValue(reference.endedAt, "measurement ended time"),
      };
    case "fault_repair":
      return {
        ...base,
        sourceId: reference.faultId,
        observedAt: dateValue(reference.checkedAt, "fault check time"),
        promptScope: {
          beforeCheckId: reference.beforeCheckId,
          afterCheckId: reference.afterCheckId,
        },
      };
    case "content_change":
      return {
        ...base,
        sourceId: reference.changeId,
        sourceUrl: reference.pageUrl,
        observedAt: dateValue(reference.publishedAt, "content publish time"),
      };
    case "authored_work":
      return {
        ...base,
        sourceId: reference.submissionId,
        sourceUrl: reference.destinationUrl,
        observedAt: dateValue(reference.submittedAt, "submission time"),
      };
    case "confirmation":
      return {
        ...base,
        sourceId: reference.confirmedByUserId,
        observedAt: dateValue(reference.confirmedAt, "confirmation time"),
        excerpt: reference.note,
      };
    case "decision":
      return {
        ...base,
        sourceId: reference.decisionId,
        promptScope: {
          reviewPeriod: reference.reviewPeriod,
          decision: reference.decision,
          basedOnMeasurementId: reference.basedOnMeasurementId,
        },
      };
    case "experiment":
      return {
        ...base,
        sourceId: reference.experimentId,
        promptScope: {
          hypothesis: reference.hypothesis,
          baselineMeasurementId: reference.baselineMeasurementId,
          laterMeasurementId: reference.laterMeasurementId,
          conclusion: reference.conclusion,
        },
        observedAt: dateValue(reference.changedAt, "experiment change time"),
      };
  }
}

export async function insertWorkTaskEvent(
  transaction: RequestRepositoryTransaction,
  input: {
    brandId: string;
    userId: string;
    taskId: string;
    taskVersion: number;
    revision: number;
    priorState: TaskState | null;
    nextState: TaskState;
    reason?: string | null;
    verificationMethod?: VerificationMethod | null;
  },
): Promise<void> {
  await transaction.insert(workTaskEvents).values({
    taskId: input.taskId,
    brandId: input.brandId,
    userId: input.userId,
    taskVersion: input.taskVersion,
    revision: input.revision,
    priorState: input.priorState,
    nextState: input.nextState,
    actorId: input.userId,
    actorKind: "user",
    reason: input.reason ?? null,
    verificationMethod: input.verificationMethod ?? null,
  });
}

export async function selectWorkAwardByKey(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
  awardKey: string,
): Promise<WorkAwardDatabaseRow | undefined> {
  const [row] = await transaction
    .select(workAwardDatabaseColumns)
    .from(workAwardEvents)
    .innerJoin(brands, awardBrandJoinScope(brandId, userId))
    .where(
      and(
        eq(workAwardEvents.brandId, brandId),
        eq(workAwardEvents.userId, userId),
        eq(workAwardEvents.taskId, taskId),
        eq(workAwardEvents.taskVersion, taskVersion),
        eq(workAwardEvents.awardKey, awardKey),
      ),
    )
    .limit(1);
  return row;
}

export async function selectWorkAwardById(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
  awardId: string,
): Promise<WorkAwardDatabaseRow | undefined> {
  const [row] = await transaction
    .select(workAwardDatabaseColumns)
    .from(workAwardEvents)
    .innerJoin(brands, awardBrandJoinScope(brandId, userId))
    .where(
      and(
        eq(workAwardEvents.brandId, brandId),
        eq(workAwardEvents.userId, userId),
        eq(workAwardEvents.taskId, taskId),
        eq(workAwardEvents.taskVersion, taskVersion),
        eq(workAwardEvents.id, awardId),
      ),
    )
    .limit(1);
  return row;
}

export async function selectWorkAwardByReversalReference(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
  reversalReference: string,
): Promise<WorkAwardDatabaseRow | undefined> {
  const [row] = await transaction
    .select(workAwardDatabaseColumns)
    .from(workAwardEvents)
    .innerJoin(brands, awardBrandJoinScope(brandId, userId))
    .where(
      and(
        eq(workAwardEvents.brandId, brandId),
        eq(workAwardEvents.userId, userId),
        eq(workAwardEvents.taskId, taskId),
        eq(workAwardEvents.taskVersion, taskVersion),
        eq(workAwardEvents.reversalReference, reversalReference),
      ),
    )
    .limit(1);
  return row;
}

export async function insertWorkAward(
  transaction: RequestRepositoryTransaction,
  input: {
    brandId: string;
    userId: string;
    taskId: string;
    taskVersion: number;
    cycleKey: string;
    awardKey: string;
    points: number;
    ruleVersion: number;
    evidenceVersion: number;
    verificationMethod: VerificationMethod;
    reason: string;
    awardStatus?: "awarded" | "reversed" | "adjustment";
    reversalReference?: string | null;
  },
): Promise<WorkAwardDatabaseRow | undefined> {
  const [row] = await transaction
    .insert(workAwardEvents)
    .values({
      taskId: input.taskId,
      brandId: input.brandId,
      userId: input.userId,
      taskVersion: input.taskVersion,
      cycleKey: input.cycleKey,
      awardKey: input.awardKey,
      points: input.points,
      ruleVersion: input.ruleVersion,
      evidenceVersion: input.evidenceVersion,
      actorId: input.userId,
      verificationMethod: input.verificationMethod,
      reason: input.reason,
      awardStatus: input.awardStatus ?? "awarded",
      reversalReference: input.reversalReference ?? null,
    })
    .onConflictDoNothing({ target: [workAwardEvents.awardKey] })
    .returning(workAwardDatabaseColumns);
  return row;
}

export function toWorkAwardView(row: WorkAwardDatabaseRow): WorkAwardView {
  const verificationMethod = normalizeVerificationMethod(row.verificationMethod);
  if (
    row.awardStatus !== "awarded" &&
    row.awardStatus !== "reversed" &&
    row.awardStatus !== "adjustment"
  ) {
    throw new Error("Work award has an unsupported status");
  }
  return {
    id: row.id,
    taskId: row.taskId,
    brandId: row.brandId,
    taskVersion: row.taskVersion,
    cycleKey: row.cycleKey,
    awardKey: row.awardKey,
    points: row.points,
    ruleVersion: row.ruleVersion,
    evidenceVersion: row.evidenceVersion,
    verificationMethod,
    reason: row.reason,
    awardStatus: row.awardStatus,
    reversalReference: row.reversalReference,
    occurredAt: dateValue(row.occurredAt, "award time"),
  };
}

export async function insertBrandCapabilityEvent(
  transaction: RequestRepositoryTransaction,
  input: {
    brandId: string;
    userId: string;
    milestone: CapabilityMilestone;
    eventKey: string;
    eventKind?: "achieved" | "reversed";
    taskId: string;
    taskVersion: number;
    evidenceVersion?: number;
    reason: string;
  },
): Promise<WorkCapabilityDatabaseRow | undefined> {
  const [row] = await transaction
    .insert(brandCapabilityEvents)
    .values({
      brandId: input.brandId,
      userId: input.userId,
      milestone: input.milestone,
      eventKey: input.eventKey,
      eventKind: input.eventKind ?? "achieved",
      taskId: input.taskId,
      taskVersion: input.taskVersion,
      evidenceVersion: input.evidenceVersion ?? 1,
      actorId: input.userId,
      reason: input.reason,
    })
    .onConflictDoNothing({
      target: [brandCapabilityEvents.brandId, brandCapabilityEvents.eventKey],
    })
    .returning(workCapabilityClientColumns);
  return row;
}

export async function selectBrandCapabilityEventByKey(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  eventKey: string,
  taskId: string,
  taskVersion: number,
): Promise<WorkCapabilityDatabaseRow | undefined> {
  const [row] = await transaction
    .select(workCapabilityClientColumns)
    .from(brandCapabilityEvents)
    .innerJoin(
      brands,
      and(
        eq(brands.id, brandCapabilityEvents.brandId),
        eq(brands.id, brandId),
        eq(brands.userId, userId),
        isNull(brands.deletedAt),
      ),
    )
    .where(
      and(
        eq(brandCapabilityEvents.brandId, brandId),
        eq(brandCapabilityEvents.userId, userId),
        eq(brandCapabilityEvents.eventKey, eventKey),
        eq(brandCapabilityEvents.taskId, taskId),
        eq(brandCapabilityEvents.taskVersion, taskVersion),
      ),
    )
    .limit(1);
  return row;
}

export function toWorkCapabilityEventView(row: WorkCapabilityDatabaseRow): WorkCapabilityEventView {
  if (!isCapabilityMilestone(row.milestone)) throw new Error("Work milestone is unsupported");
  if (row.eventKind !== "achieved" && row.eventKind !== "reversed") {
    throw new Error("Work capability event kind is unsupported");
  }
  return {
    id: row.id,
    brandId: row.brandId,
    milestone: row.milestone,
    eventKey: row.eventKey,
    eventKind: row.eventKind,
    taskId: row.taskId,
    taskVersion: row.taskVersion,
    evidenceVersion: row.evidenceVersion,
    reason: row.reason,
    occurredAt: dateValue(row.occurredAt, "capability event time"),
  };
}

export async function insertWorkOutcomeReview(
  transaction: RequestRepositoryTransaction,
  input: {
    brandId: string;
    userId: string;
    taskId: string;
    taskVersion: number;
    cycleKey: string;
    measurementScope: MeasurementScope;
    decision: "improvement" | "decline" | "no_material_change" | "unavailable";
    notes?: string | null;
    visibilityEvidenceVersion?: number | null;
    businessResultEventId?: string | null;
    nextCheckAt?: string | null;
  },
): Promise<WorkOutcomeReviewDatabaseRow> {
  const [row] = await transaction
    .insert(workOutcomeReviews)
    .values({
      taskId: input.taskId,
      brandId: input.brandId,
      userId: input.userId,
      taskVersion: input.taskVersion,
      cycleKey: input.cycleKey,
      measurementScope: input.measurementScope,
      decision: input.decision,
      notes: input.notes ?? null,
      visibilityEvidenceVersion: input.visibilityEvidenceVersion ?? null,
      businessResultEventId: input.businessResultEventId ?? null,
      nextCheckAt:
        input.nextCheckAt === null || input.nextCheckAt === undefined
          ? null
          : dateValue(input.nextCheckAt, "next outcome check time"),
      reviewedBy: input.userId,
    })
    .returning(workOutcomeReviewClientColumns);
  if (!row) throw new Error("Work outcome review was not created");
  return row;
}

export async function selectWorkOutcomeReview(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
  taskVersion: number,
  cycleKey: string,
): Promise<WorkOutcomeReviewDatabaseRow | undefined> {
  const [row] = await transaction
    .select(workOutcomeReviewClientColumns)
    .from(workOutcomeReviews)
    .innerJoin(
      brands,
      and(
        eq(brands.id, workOutcomeReviews.brandId),
        eq(brands.id, brandId),
        eq(brands.userId, userId),
        isNull(brands.deletedAt),
      ),
    )
    .where(
      and(
        eq(workOutcomeReviews.brandId, brandId),
        eq(workOutcomeReviews.userId, userId),
        eq(workOutcomeReviews.taskId, taskId),
        eq(workOutcomeReviews.taskVersion, taskVersion),
        eq(workOutcomeReviews.cycleKey, cycleKey),
      ),
    )
    .orderBy(desc(workOutcomeReviews.updatedAt), desc(workOutcomeReviews.id))
    .limit(1);
  return row;
}

export function toWorkOutcomeReviewView(row: WorkOutcomeReviewDatabaseRow): WorkOutcomeReviewView {
  if (
    row.decision !== "improvement" &&
    row.decision !== "decline" &&
    row.decision !== "no_material_change" &&
    row.decision !== "unavailable"
  ) {
    throw new Error("Work outcome decision is unsupported");
  }
  return {
    id: row.id,
    taskId: row.taskId,
    brandId: row.brandId,
    taskVersion: row.taskVersion,
    cycleKey: row.cycleKey,
    measurementScope: parseMeasurementScope(row.measurementScope),
    decision: row.decision,
    notes: row.notes,
    visibilityEvidenceVersion: row.visibilityEvidenceVersion,
    businessResultEventId: row.businessResultEventId,
    nextCheckAt: nullableDateValue(row.nextCheckAt, "next outcome check time"),
    createdAt: dateValue(row.createdAt, "outcome review creation time"),
    updatedAt: dateValue(row.updatedAt, "outcome review update time"),
  };
}

function normalizeVerificationMethod(value: unknown): VerificationMethod {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    throw new Error("Work verification method is invalid");
  }
  const kind = value.kind;
  if (kind === "system_check" && "checkId" in value && typeof value.checkId === "string") {
    return { kind, checkId: value.checkId };
  }
  if (
    kind === "human_confirmation" &&
    "confirmedByUserId" in value &&
    typeof value.confirmedByUserId === "string" &&
    "note" in value &&
    typeof value.note === "string"
  ) {
    return { kind, confirmedByUserId: value.confirmedByUserId, note: value.note };
  }
  throw new Error("Work verification method is invalid");
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || value < 1)
    throw new Error("Work task limit must be a positive integer");
  return Math.min(value, 100);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0)
    throw new Error("Work task offset must be a non-negative integer");
  return value;
}

function normalizeTaskCounts(row: Record<string, unknown> | undefined): WorkTaskSummaryCounts {
  return {
    total: integerValue(row?.total, "total task count"),
    pending: integerValue(row?.pending, "pending task count"),
    suggested: integerValue(row?.suggested, "suggested task count"),
    accepted: integerValue(row?.accepted, "accepted task count"),
    inProgress: integerValue(row?.inProgress, "in-progress task count"),
    submitted: integerValue(row?.submitted, "submitted task count"),
    verified: integerValue(row?.verified, "verified task count"),
    waitingForObservation: integerValue(row?.waitingForObservation, "waiting task count"),
    dismissed: integerValue(row?.dismissed, "dismissed task count"),
    notApplicable: integerValue(row?.notApplicable, "not-applicable task count"),
    reopened: integerValue(row?.reopened, "reopened task count"),
  };
}

function normalizeAwardTotals(row: Record<string, unknown> | undefined): WorkAwardSummary {
  return {
    eventCount: integerValue(row?.eventCount, "award event count"),
    points: signedIntegerValue(row?.points, "award points"),
    awardedPoints: signedIntegerValue(row?.awardedPoints, "awarded points"),
    reversedPoints: signedIntegerValue(row?.reversedPoints, "reversed points"),
    adjustmentPoints: signedIntegerValue(row?.adjustmentPoints, "adjustment points"),
    latestOccurredAt: nullableDateValue(row?.latestOccurredAt, "latest award time"),
  };
}

function normalizeMilestoneSummary(row: unknown): WorkMilestoneSummary {
  if (typeof row !== "object" || row === null) {
    throw new Error("Work capability event is not an object");
  }
  const value = row as Record<string, unknown>;
  if (typeof value.milestone !== "string" || !isCapabilityMilestone(value.milestone)) {
    throw new Error("Work capability event has an unsupported milestone");
  }
  if (value.eventKind !== "achieved" && value.eventKind !== "reversed") {
    throw new Error("Work capability event has an unsupported kind");
  }
  return {
    milestone: value.milestone,
    eventKind: value.eventKind,
    occurredAt: dateValue(value.occurredAt, "capability event time"),
  };
}

function rowsFromResult(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (typeof result !== "object" || result === null || !("rows" in result)) return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows : [];
}

function integerValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Work ${field} is invalid`);
  return parsed;
}

function positiveIntegerValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Work ${field} is invalid`);
  return parsed;
}

function signedIntegerValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Work ${field} is invalid`);
  return parsed;
}

function dateValue(value: unknown, field: string): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Work ${field} is invalid`);
  return parsed;
}

function nullableDateValue(value: unknown, field: string): Date | null {
  if (value === null || value === undefined) return null;
  return dateValue(value, field);
}
