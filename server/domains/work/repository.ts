import { and, desc, eq } from "drizzle-orm";
import {
  WORK_POLICY_VERSION,
  awardDecision,
  awardKey,
  pointsForTask,
  reviewOutcome,
  transitionTask as applyTaskTransition,
  validateEvidenceActor,
  validateEvidenceForTask,
  validateEvidenceReferences,
  validateTriggerEvidenceActor,
  validateTriggerEvidenceReferences,
  validateVerificationActor,
  verifyTask,
} from "./policy";
import type { db } from "../../db";
import { workAwardEvents } from "@shared/schema";
import type { RequestActor } from "../../lib/requestActor";
import type { RequestRepositoryTransaction } from "../../data/requestRepositoryTransaction";
import { setRestrictedRequestContext } from "../../data/restrictedRequestTransaction";
import { WorkPolicyError, parseMeasurementScope } from "@shared/work";
import type {
  CapabilityMilestone,
  EvidenceReference,
  MeasurementScope,
  TaskCommand,
  VerificationMethod,
} from "@shared/work";
import {
  findActiveBrand,
  insertBrandCapabilityEvent,
  insertWorkAward,
  insertWorkOutcomeReview,
  insertWorkTaskEvent,
  insertWorkTaskEvidence,
  insertWorkTask,
  listWorkTasks,
  listWorkTaskEvidence,
  listWorkTaskEvents,
  nextWorkEvidenceVersion,
  selectBrandCapabilityEventByKey,
  selectActiveBrandGoal,
  selectSummaryInputs,
  selectWorkAwardById,
  selectWorkAwardByKey,
  selectWorkAwardByReversalReference,
  selectWorkTask,
  selectWorkTaskByKey,
  selectWorkOutcomeReview,
  toWorkAwardView,
  workAwardClientColumns,
  toWorkCapabilityEventView,
  toWorkOutcomeReviewView,
  toWorkTaskView,
  updateWorkTaskState,
  type WorkAwardView,
  type WorkCapabilityEventView,
  type WorkEvidenceInput,
  type WorkOutcomeReviewView,
  type WorkTaskDatabaseRow,
  type WorkSummaryInputs,
  type WorkTaskCreateInput,
  type WorkTaskFilters,
  type WorkTaskView,
  type WorkTaskDetailsView,
  type WorkGoal,
} from "../../storage/workStorage";
import { createDatabaseWorkEvidenceAuthorizer } from "./evidenceReaders";
import type { TriggerEvidenceReference } from "./opportunities";

export type {
  WorkSummaryInputs,
  WorkTaskCreateInput,
  WorkTaskFilters,
  WorkTaskView,
  WorkTaskDetailsView,
  WorkGoal,
} from "../../storage/workStorage";

export type { WorkAwardView, WorkCapabilityEventView, WorkEvidenceInput, WorkOutcomeReviewView };

export type WorkMutationResult<T> =
  | { kind: "updated"; value: T }
  | { kind: "conflict"; currentRevision: number }
  | { kind: "not_found" };

export type WorkTaskTriggerCreateInput = WorkTaskCreateInput & {
  ruleVersion: number;
};

export type WorkTaskTriggerCreateResult = {
  task: WorkTaskView;
  created: boolean;
};

export interface WorkOpportunityRepository {
  createTaskWithTriggerEvidence(
    brandId: string,
    input: WorkTaskTriggerCreateInput,
    evidence: readonly TriggerEvidenceReference[],
  ): Promise<WorkTaskTriggerCreateResult | undefined>;
}

export type WorkMeasurementScope = MeasurementScope;

export type WorkEvidenceAuthorizationInput = {
  actor: RequestActor;
  brandId: string;
  taskId: string;
  taskVersion: number;
  verification: VerificationMethod;
  evidence: readonly EvidenceReference[];
};

export type WorkEvidenceAuthorizationResult = "authorized" | "not_found" | "invalid_evidence";

export type WorkEvidenceAuthorizer = (
  input: WorkEvidenceAuthorizationInput,
) => Promise<WorkEvidenceAuthorizationResult>;

export type WorkEvidenceReaderResult = "owned_usable" | "owned_unusable" | "not_found";

export type WorkEvidenceReaders = {
  [K in EvidenceReference["kind"]]: (input: {
    actor: RequestActor;
    brandId: string;
    taskId: string;
    taskVersion: number;
    reference: Extract<EvidenceReference, { kind: K }>;
  }) => Promise<WorkEvidenceReaderResult>;
};

export function createWorkEvidenceAuthorizer(readers: WorkEvidenceReaders): WorkEvidenceAuthorizer {
  return async (input) => {
    for (const reference of input.evidence) {
      const result = await readEvidenceReference(readers, input, reference);
      if (result === "not_found") return result;
      if (result === "owned_unusable") return "invalid_evidence";
    }
    return "authorized";
  };
}

async function readEvidenceReference(
  readers: WorkEvidenceReaders,
  input: WorkEvidenceAuthorizationInput,
  reference: EvidenceReference,
): Promise<WorkEvidenceReaderResult> {
  const context = {
    actor: input.actor,
    brandId: input.brandId,
    taskId: input.taskId,
    taskVersion: input.taskVersion,
  };
  switch (reference.kind) {
    case "source":
      return readers.source({ ...context, reference });
    case "artifact":
      return readers.artifact({ ...context, reference });
    case "measurement":
      return readers.measurement({ ...context, reference });
    case "fault_repair":
      return readers.fault_repair({ ...context, reference });
    case "content_change":
      return readers.content_change({ ...context, reference });
    case "authored_work":
      return readers.authored_work({ ...context, reference });
    case "confirmation":
      return readers.confirmation({ ...context, reference });
    case "decision":
      return readers.decision({ ...context, reference });
    case "experiment":
      return readers.experiment({ ...context, reference });
  }
}

export type WorkOutcomeDecision = "improvement" | "decline" | "no_material_change" | "unavailable";

export type VerifyAndAwardInput = {
  cycleKey: string;
  verification: VerificationMethod;
  evidence: readonly EvidenceReference[];
  capability?: {
    milestone: CapabilityMilestone;
    eventKey: string;
    eventKind?: "achieved" | "reversed";
    reason: string;
  };
};

export type WorkVerificationResult = {
  task: WorkTaskView;
  award: WorkAwardView;
  capability?: WorkCapabilityEventView;
  created: boolean;
};

export type WorkOutcomeReviewInput = {
  cycleKey: string;
  measurementScope: WorkMeasurementScope;
  decision: WorkOutcomeDecision;
  notes?: string | null;
  visibilityEvidenceVersion?: number | null;
  businessResultEventId?: string | null;
  nextCheckAt?: string | null;
};

export type WorkOutcomeReviewResult = {
  task: WorkTaskView;
  review: WorkOutcomeReviewView;
};

export type WorkReversalResult = {
  task: WorkTaskView;
  award: WorkAwardView;
};

export type WorkRepository = {
  getTask(brandId: string, taskId: string): Promise<WorkTaskView | undefined>;
  listTasks(brandId: string, filters?: WorkTaskFilters): Promise<WorkTaskView[] | undefined>;
  getSummaryInputs(brandId: string): Promise<WorkSummaryInputs | undefined>;
  getActiveBrandGoal(brandId: string): Promise<WorkGoal | null | undefined>;
  getTaskDetails(brandId: string, taskId: string): Promise<WorkTaskDetailsView | undefined>;
  listAwardEvents(brandId: string): Promise<WorkAwardView[] | undefined>;
  createTask(brandId: string, input: WorkTaskCreateInput): Promise<WorkTaskView | undefined>;
  appendEvidence(
    brandId: string,
    taskId: string,
    expectedRevision: number,
    evidence: readonly WorkEvidenceInput[],
  ): Promise<WorkMutationResult<WorkTaskView>>;
  transitionTask(
    brandId: string,
    taskId: string,
    expectedRevision: number,
    command: TaskCommand,
  ): Promise<WorkMutationResult<WorkTaskView>>;
  submitTask(
    brandId: string,
    taskId: string,
    expectedRevision: number,
    evidence: readonly WorkEvidenceInput[],
  ): Promise<WorkMutationResult<WorkTaskView>>;
  verifyAndAward(
    brandId: string,
    taskId: string,
    expectedRevision: number,
    input: VerifyAndAwardInput,
  ): Promise<WorkMutationResult<WorkVerificationResult>>;
  recordOutcomeReview(
    brandId: string,
    taskId: string,
    expectedRevision: number,
    input: WorkOutcomeReviewInput,
  ): Promise<WorkMutationResult<WorkOutcomeReviewResult>>;
  reverseAward(
    brandId: string,
    taskId: string,
    expectedRevision: number,
    input: { awardId: string; reason: string },
  ): Promise<WorkMutationResult<WorkReversalResult>>;
};

export function createWorkRepository({
  actor,
  database,
  evidenceAuthorizer,
}: {
  actor: RequestActor;
  database: typeof db;
  evidenceAuthorizer?: WorkEvidenceAuthorizer;
}): WorkRepository & WorkOpportunityRepository {
  const run = <T>(
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (transaction) => {
      await setRestrictedRequestContext({
        actor,
        role: "venturecite_request",
        transaction,
      });
      return operation(transaction);
    });

  return {
    getTask(brandId, taskId) {
      return run(async (transaction) => {
        const row = await selectWorkTask(transaction, brandId, actor.userId, taskId);
        return row ? toWorkTaskView(row) : undefined;
      });
    },

    listTasks(brandId, filters = {}) {
      return run(async (transaction) => {
        const visibility = await findActiveBrand(transaction, brandId, actor.userId);
        if (visibility.kind !== "owned_active") return undefined;
        const rows = await listWorkTasks(transaction, brandId, actor.userId, filters);
        return rows.map(toWorkTaskView);
      });
    },

    getSummaryInputs(brandId) {
      return run(async (transaction) => {
        const visibility = await findActiveBrand(transaction, brandId, actor.userId);
        if (visibility.kind !== "owned_active") return undefined;
        return selectSummaryInputs(transaction, brandId, actor.userId);
      });
    },

    getActiveBrandGoal(brandId) {
      return run(async (transaction) => {
        const visibility = await findActiveBrand(transaction, brandId, actor.userId);
        if (visibility.kind !== "owned_active") return undefined;
        return selectActiveBrandGoal(transaction, brandId);
      });
    },

    getTaskDetails(brandId, taskId) {
      return run(async (transaction) => {
        const task = await selectWorkTask(transaction, brandId, actor.userId, taskId);
        if (!task) return undefined;
        const [evidence, history] = await Promise.all([
          listWorkTaskEvidence(transaction, brandId, actor.userId, taskId, task.taskVersion),
          listWorkTaskEvents(transaction, brandId, actor.userId, taskId, task.taskVersion),
        ]);
        return { evidence, history };
      });
    },

    listAwardEvents(brandId) {
      return run(async (transaction) => {
        const visibility = await findActiveBrand(transaction, brandId, actor.userId);
        if (visibility.kind !== "owned_active") return undefined;
        const rows = await transaction
          .select(workAwardClientColumns)
          .from(workAwardEvents)
          .where(
            and(eq(workAwardEvents.brandId, brandId), eq(workAwardEvents.userId, actor.userId)),
          )
          .orderBy(desc(workAwardEvents.occurredAt), desc(workAwardEvents.id));
        return rows.map(toWorkAwardView);
      });
    },

    createTask(brandId, input) {
      return run(async (transaction) => {
        if (!isValidTaskInput(input)) {
          throw new Error("Work task input is invalid");
        }
        const visibility = await findActiveBrand(transaction, brandId, actor.userId);
        if (visibility.kind !== "owned_active") return undefined;
        const taskVersion = input.taskVersion ?? 1;
        const taskKey = input.taskKey.trim();
        await insertWorkTask(
          transaction,
          actor.userId,
          brandId,
          { ...input, taskKey, taskVersion },
          pointsForTask(input.taskType),
          WORK_POLICY_VERSION,
        );
        const row = await selectWorkTaskByKey(
          transaction,
          brandId,
          actor.userId,
          taskKey,
          taskVersion,
        );
        return row ? toWorkTaskView(row) : undefined;
      });
    },

    createTaskWithTriggerEvidence(brandId, input, evidence) {
      return run(async (transaction) => {
        if (
          !isValidTaskInput(input) ||
          !Number.isInteger(input.ruleVersion) ||
          input.ruleVersion < 1
        ) {
          throw new Error("Work trigger task input is invalid");
        }
        const visibility = await findActiveBrand(transaction, brandId, actor.userId);
        if (visibility.kind !== "owned_active") return undefined;
        validateTriggerEvidenceReferences(input.taskType, evidence);
        validateTriggerEvidenceActor(evidence, actor.userId);
        const taskVersion = input.taskVersion ?? 1;
        const taskKey = input.taskKey.trim();
        const inserted = await insertWorkTask(
          transaction,
          actor.userId,
          brandId,
          { ...input, taskKey, taskVersion },
          pointsForTask(input.taskType),
          input.ruleVersion,
        );
        const row = await selectWorkTaskByKey(
          transaction,
          brandId,
          actor.userId,
          taskKey,
          taskVersion,
        );
        if (!row) return undefined;
        if (inserted) {
          await insertWorkTaskEvidence(transaction, {
            brandId,
            userId: actor.userId,
            taskId: row.id,
            taskVersion: row.taskVersion,
            evidence,
            role: "trigger",
            status: "verified",
            evidenceVersion: 1,
          });
        }
        return {
          task: toWorkTaskView(row),
          created: inserted,
        };
      });
    },

    appendEvidence(brandId, taskId, expectedRevision, evidence) {
      return run(async (transaction) => {
        const lookup = await findOwnedTask(transaction, brandId, actor.userId, taskId);
        if (lookup.kind === "not_found") return lookup;
        if (lookup.row.revision !== expectedRevision) {
          return { kind: "conflict", currentRevision: lookup.row.revision };
        }
        validateEvidenceReferences(lookup.row.taskType, evidence);
        validateEvidenceActor(evidence, actor.userId);
        const updated = await updateWorkTaskState(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          expectedRevision,
          state: lookup.row.state,
        });
        if (!updated) return currentTaskConflict(transaction, brandId, actor.userId, taskId);
        const evidenceVersion = await nextWorkEvidenceVersion(
          transaction,
          brandId,
          actor.userId,
          taskId,
          lookup.row.taskVersion,
        );
        await insertWorkTaskEvidence(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          evidence,
          role: "submission",
          status: "submitted",
          evidenceVersion,
        });
        await insertWorkTaskEvent(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          revision: updated.revision,
          priorState: lookup.row.state,
          nextState: lookup.row.state,
          reason: "Evidence appended",
        });
        return updatedTaskResult(transaction, brandId, actor.userId, taskId);
      });
    },

    transitionTask(brandId, taskId, expectedRevision, command) {
      return run(async (transaction) => {
        const lookup = await findOwnedTask(transaction, brandId, actor.userId, taskId);
        if (lookup.kind === "not_found") return lookup;
        if (lookup.row.revision !== expectedRevision) {
          return { kind: "conflict", currentRevision: lookup.row.revision };
        }
        if (command.kind === "submit") {
          return submitTaskInTransaction(
            transaction,
            actor.userId,
            brandId,
            taskId,
            expectedRevision,
            lookup.row,
            command.evidence,
          );
        }
        const nextState = applyTaskTransition(lookup.row.state, lookup.row.taskType, command);
        const updated = await updateWorkTaskState(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          expectedRevision,
          state: nextState,
          dismissalReason: transitionDismissalReason(command),
        });
        if (!updated) return currentTaskConflict(transaction, brandId, actor.userId, taskId);
        await insertWorkTaskEvent(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          revision: updated.revision,
          priorState: lookup.row.state,
          nextState,
          reason: transitionReason(command),
        });
        return updatedTaskResult(transaction, brandId, actor.userId, taskId);
      });
    },

    submitTask(brandId, taskId, expectedRevision, evidence) {
      return run(async (transaction) => {
        const lookup = await findOwnedTask(transaction, brandId, actor.userId, taskId);
        if (lookup.kind === "not_found") return lookup;
        if (lookup.row.revision !== expectedRevision) {
          return { kind: "conflict", currentRevision: lookup.row.revision };
        }
        return submitTaskInTransaction(
          transaction,
          actor.userId,
          brandId,
          taskId,
          expectedRevision,
          lookup.row,
          evidence,
        );
      });
    },

    verifyAndAward(brandId, taskId, expectedRevision, input) {
      return run(async (transaction) => {
        const lookup = await findOwnedTask(transaction, brandId, actor.userId, taskId);
        if (lookup.kind === "not_found") return lookup;
        const key = awardKey({
          accountId: actor.userId,
          brandId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          cycleKey: input.cycleKey,
          ruleVersion: WORK_POLICY_VERSION,
        });
        const existingAward = await selectWorkAwardByKey(
          transaction,
          brandId,
          actor.userId,
          taskId,
          lookup.row.taskVersion,
          key,
        );
        if (existingAward) {
          return {
            kind: "updated",
            value: {
              task: toWorkTaskView(lookup.row),
              award: toWorkAwardView(existingAward),
              created: false,
            },
          };
        }
        validateVerificationActor(input.verification, actor.userId);
        validateEvidenceActor(input.evidence, actor.userId);
        validateEvidenceForTask(lookup.row.taskType, input.evidence);
        const transactionAuthorizer =
          evidenceAuthorizer ?? createDatabaseWorkEvidenceAuthorizer(transaction, actor);
        await authorizeEvidence(transactionAuthorizer, {
          actor,
          brandId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          verification: input.verification,
          evidence: input.evidence,
        });
        if (lookup.row.revision !== expectedRevision) {
          return { kind: "conflict", currentRevision: lookup.row.revision };
        }
        verifyTask(lookup.row.state, input.verification);
        const decision = awardDecision({
          accountId: actor.userId,
          brandId,
          taskId,
          taskType: lookup.row.taskType,
          taskVersion: lookup.row.taskVersion,
          cycleKey: input.cycleKey,
          ruleVersion: WORK_POLICY_VERSION,
          verification: input.verification,
          evidence: input.evidence,
          awarded: true,
        });
        const updated = await updateWorkTaskState(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          expectedRevision,
          state: "verified",
          verificationMethod: input.verification,
          dismissalReason: null,
        });
        if (!updated) {
          const current = await selectWorkTask(transaction, brandId, actor.userId, taskId);
          const concurrentAward = current
            ? await selectWorkAwardByKey(
                transaction,
                brandId,
                actor.userId,
                taskId,
                lookup.row.taskVersion,
                key,
              )
            : undefined;
          if (current && concurrentAward) {
            return {
              kind: "updated",
              value: {
                task: toWorkTaskView(current),
                award: toWorkAwardView(concurrentAward),
                created: false,
              },
            };
          }
          return current
            ? { kind: "conflict", currentRevision: current.revision }
            : { kind: "not_found" };
        }
        const evidenceVersion = await nextWorkEvidenceVersion(
          transaction,
          brandId,
          actor.userId,
          taskId,
          lookup.row.taskVersion,
        );
        await insertWorkTaskEvidence(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          evidence: input.evidence,
          role: "verification",
          status: "verified",
          evidenceVersion,
        });
        await insertWorkTaskEvent(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          revision: updated.revision,
          priorState: lookup.row.state,
          nextState: "verified",
          reason: "Task verified",
          verificationMethod: input.verification,
        });
        const awardRow = await insertWorkAward(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          cycleKey: input.cycleKey,
          awardKey: decision.awardKey,
          points: decision.points,
          ruleVersion: decision.ruleVersion,
          evidenceVersion,
          verificationMethod: input.verification,
          reason: "Verified work task",
        });
        const finalAward =
          awardRow ??
          (await selectWorkAwardByKey(
            transaction,
            brandId,
            actor.userId,
            taskId,
            lookup.row.taskVersion,
            decision.awardKey,
          ));
        if (!finalAward) throw new Error("Work award was not persisted");
        let capability: WorkCapabilityEventView | undefined;
        if (input.capability) {
          const capabilityRow = await insertBrandCapabilityEvent(transaction, {
            brandId,
            userId: actor.userId,
            taskId,
            taskVersion: lookup.row.taskVersion,
            milestone: input.capability.milestone,
            eventKey: input.capability.eventKey,
            eventKind: input.capability.eventKind,
            reason: input.capability.reason,
            evidenceVersion,
          });
          const finalCapability =
            capabilityRow ??
            (await selectBrandCapabilityEventByKey(
              transaction,
              brandId,
              actor.userId,
              input.capability.eventKey,
              taskId,
              lookup.row.taskVersion,
            ));
          if (
            !finalCapability ||
            finalCapability.taskId !== taskId ||
            finalCapability.taskVersion !== lookup.row.taskVersion ||
            finalCapability.milestone !== input.capability.milestone
          ) {
            throw new Error("Work capability event key conflicts with another task milestone");
          }
          capability = toWorkCapabilityEventView(finalCapability);
        }
        const finalTask = await selectWorkTask(transaction, brandId, actor.userId, taskId);
        if (!finalTask) return { kind: "not_found" };
        return {
          kind: "updated",
          value: {
            task: toWorkTaskView(finalTask),
            award: toWorkAwardView(finalAward),
            created: awardRow !== undefined,
            ...(capability ? { capability } : {}),
          },
        };
      });
    },

    recordOutcomeReview(brandId, taskId, expectedRevision, input) {
      return run(async (transaction) => {
        const lookup = await findOwnedTask(transaction, brandId, actor.userId, taskId);
        if (lookup.kind === "not_found") return lookup;
        const measurementScope = parseMeasurementScope(input.measurementScope);
        const existingReview = await selectWorkOutcomeReview(
          transaction,
          brandId,
          actor.userId,
          taskId,
          lookup.row.taskVersion,
          input.cycleKey,
        );
        if (existingReview) {
          return {
            kind: "updated",
            value: {
              task: toWorkTaskView(lookup.row),
              review: toWorkOutcomeReviewView(existingReview),
            },
          };
        }
        if (lookup.row.revision !== expectedRevision) {
          return { kind: "conflict", currentRevision: lookup.row.revision };
        }
        const nextState = reviewOutcome(lookup.row.state);
        const updated = await updateWorkTaskState(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          expectedRevision,
          state: nextState,
          dismissalReason: null,
        });
        if (!updated) {
          const current = await selectWorkTask(transaction, brandId, actor.userId, taskId);
          const concurrentReview = await selectWorkOutcomeReview(
            transaction,
            brandId,
            actor.userId,
            taskId,
            lookup.row.taskVersion,
            input.cycleKey,
          );
          if (current && concurrentReview) {
            return {
              kind: "updated",
              value: {
                task: toWorkTaskView(current),
                review: toWorkOutcomeReviewView(concurrentReview),
              },
            };
          }
          return current
            ? { kind: "conflict", currentRevision: current.revision }
            : { kind: "not_found" };
        }
        const reviewRow = await insertWorkOutcomeReview(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          cycleKey: input.cycleKey,
          measurementScope,
          decision: input.decision,
          notes: input.notes,
          visibilityEvidenceVersion: input.visibilityEvidenceVersion,
          businessResultEventId: input.businessResultEventId,
          nextCheckAt: input.nextCheckAt,
        });
        await insertWorkTaskEvent(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          revision: updated.revision,
          priorState: lookup.row.state,
          nextState,
          reason: "Outcome review recorded",
        });
        const finalTask = await selectWorkTask(transaction, brandId, actor.userId, taskId);
        if (!finalTask) return { kind: "not_found" };
        return {
          kind: "updated",
          value: {
            task: toWorkTaskView(finalTask),
            review: toWorkOutcomeReviewView(reviewRow),
          },
        };
      });
    },

    reverseAward(brandId, taskId, expectedRevision, input) {
      return run(async (transaction) => {
        if (!isNonEmpty(input.reason)) {
          throw new WorkPolicyError("invalid_evidence", "Award reversal requires a reason");
        }
        const lookup = await findOwnedTask(transaction, brandId, actor.userId, taskId);
        if (lookup.kind === "not_found") return lookup;
        const existingReversal = await selectWorkAwardByReversalReference(
          transaction,
          brandId,
          actor.userId,
          taskId,
          lookup.row.taskVersion,
          input.awardId,
        );
        if (existingReversal) {
          return {
            kind: "updated",
            value: {
              task: toWorkTaskView(lookup.row),
              award: toWorkAwardView(existingReversal),
            },
          };
        }
        if (lookup.row.revision !== expectedRevision) {
          return { kind: "conflict", currentRevision: lookup.row.revision };
        }
        const award = await selectWorkAwardById(
          transaction,
          brandId,
          actor.userId,
          taskId,
          lookup.row.taskVersion,
          input.awardId,
        );
        if (!award || award.awardStatus !== "awarded") {
          return { kind: "not_found" };
        }
        const updated = await updateWorkTaskState(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          expectedRevision,
          state: lookup.row.state,
        });
        if (!updated) {
          const current = await selectWorkTask(transaction, brandId, actor.userId, taskId);
          const concurrentReversal = await selectWorkAwardByReversalReference(
            transaction,
            brandId,
            actor.userId,
            taskId,
            lookup.row.taskVersion,
            input.awardId,
          );
          if (current && concurrentReversal) {
            return {
              kind: "updated",
              value: {
                task: toWorkTaskView(current),
                award: toWorkAwardView(concurrentReversal),
              },
            };
          }
          return current
            ? { kind: "conflict", currentRevision: current.revision }
            : { kind: "not_found" };
        }
        const reversal = await insertWorkAward(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          cycleKey: award.cycleKey,
          awardKey: `${award.awardKey}:reversal`,
          points: -Math.abs(award.points),
          ruleVersion: award.ruleVersion,
          evidenceVersion: award.evidenceVersion,
          verificationMethod: normalizeStoredVerification(award.verificationMethod),
          reason: input.reason,
          awardStatus: "reversed",
          reversalReference: award.id,
        });
        const finalReversal =
          reversal ??
          (await selectWorkAwardByReversalReference(
            transaction,
            brandId,
            actor.userId,
            taskId,
            lookup.row.taskVersion,
            award.id,
          ));
        if (!finalReversal) throw new Error("Work award reversal was not persisted");
        await insertWorkTaskEvent(transaction, {
          brandId,
          userId: actor.userId,
          taskId,
          taskVersion: lookup.row.taskVersion,
          revision: updated.revision,
          priorState: lookup.row.state,
          nextState: lookup.row.state,
          reason: input.reason,
        });
        const finalTask = await selectWorkTask(transaction, brandId, actor.userId, taskId);
        if (!finalTask) return { kind: "not_found" };
        return {
          kind: "updated",
          value: { task: toWorkTaskView(finalTask), award: toWorkAwardView(finalReversal) },
        };
      });
    },
  };
}

type OwnedTaskLookup = { kind: "owned"; row: WorkTaskDatabaseRow } | { kind: "not_found" };

async function findOwnedTask(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
): Promise<OwnedTaskLookup> {
  const visibility = await findActiveBrand(transaction, brandId, userId);
  if (visibility.kind !== "owned_active") return { kind: "not_found" };
  const row = await selectWorkTask(transaction, brandId, userId, taskId);
  return row ? { kind: "owned", row } : { kind: "not_found" };
}

async function currentTaskConflict(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
): Promise<WorkMutationResult<never>> {
  const current = await selectWorkTask(transaction, brandId, userId, taskId);
  return current ? { kind: "conflict", currentRevision: current.revision } : { kind: "not_found" };
}

async function updatedTaskResult(
  transaction: RequestRepositoryTransaction,
  brandId: string,
  userId: string,
  taskId: string,
): Promise<WorkMutationResult<WorkTaskView>> {
  const row = await selectWorkTask(transaction, brandId, userId, taskId);
  return row ? { kind: "updated", value: toWorkTaskView(row) } : { kind: "not_found" };
}

async function submitTaskInTransaction(
  transaction: RequestRepositoryTransaction,
  userId: string,
  brandId: string,
  taskId: string,
  expectedRevision: number,
  task: WorkTaskDatabaseRow,
  evidence: readonly WorkEvidenceInput[],
): Promise<WorkMutationResult<WorkTaskView>> {
  const references = Array.from(evidence);
  validateEvidenceForTask(task.taskType, references);
  validateEvidenceActor(references, userId);
  const nextState = applyTaskTransition(task.state, task.taskType, {
    kind: "submit",
    evidence: references,
  });
  const updated = await updateWorkTaskState(transaction, {
    brandId,
    userId,
    taskId,
    expectedRevision,
    state: nextState,
    dismissalReason: null,
    verificationMethod: null,
  });
  if (!updated) return currentTaskConflict(transaction, brandId, userId, taskId);
  const evidenceVersion = await nextWorkEvidenceVersion(
    transaction,
    brandId,
    userId,
    taskId,
    task.taskVersion,
  );
  await insertWorkTaskEvidence(transaction, {
    brandId,
    userId,
    taskId,
    taskVersion: task.taskVersion,
    evidence: references,
    role: "submission",
    status: "submitted",
    evidenceVersion,
  });
  await insertWorkTaskEvent(transaction, {
    brandId,
    userId,
    taskId,
    taskVersion: task.taskVersion,
    revision: updated.revision,
    priorState: task.state,
    nextState,
    reason: "Task submitted",
  });
  return updatedTaskResult(transaction, brandId, userId, taskId);
}

async function authorizeEvidence(
  authorizer: WorkEvidenceAuthorizer | undefined,
  input: WorkEvidenceAuthorizationInput,
): Promise<void> {
  if (!authorizer) {
    throw new WorkPolicyError("configuration_error", "Evidence authorization is not configured");
  }
  const result = await authorizer(input);
  if (result === "not_found") {
    throw new WorkPolicyError("invalid_evidence", "Evidence source was not found");
  }
  if (result === "invalid_evidence") {
    throw new WorkPolicyError("invalid_evidence", "Evidence source is not usable");
  }
}

function transitionReason(command: TaskCommand): string | null {
  switch (command.kind) {
    case "dismiss":
    case "mark_not_applicable":
    case "reopen":
      return command.reason;
    case "accept":
      return "Task accepted";
    case "start":
      return "Task started";
    case "submit":
      return "Task submitted";
  }
}

function transitionDismissalReason(command: TaskCommand): string | null {
  switch (command.kind) {
    case "dismiss":
    case "mark_not_applicable":
      return command.reason;
    case "accept":
    case "start":
    case "reopen":
    case "submit":
      return null;
  }
}

function normalizeStoredVerification(value: unknown): VerificationMethod {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    throw new Error("Work award verification is invalid");
  }
  if (value.kind === "system_check" && "checkId" in value && typeof value.checkId === "string") {
    return { kind: "system_check", checkId: value.checkId };
  }
  if (
    value.kind === "human_confirmation" &&
    "confirmedByUserId" in value &&
    typeof value.confirmedByUserId === "string" &&
    "note" in value &&
    typeof value.note === "string"
  ) {
    return {
      kind: "human_confirmation",
      confirmedByUserId: value.confirmedByUserId,
      note: value.note,
    };
  }
  throw new Error("Work award verification is invalid");
}

function isValidTaskInput(input: WorkTaskCreateInput): boolean {
  if (!isNonEmpty(input.taskKey) || !isNonEmpty(input.title)) return false;
  if (!isNonEmpty(input.desiredResult) || !isNonEmpty(input.recommendedChange)) return false;
  if (
    input.taskVersion !== undefined &&
    (!Number.isInteger(input.taskVersion) || input.taskVersion < 1)
  ) {
    return false;
  }
  if (input.confidence !== undefined && input.confidence !== null) {
    if (!isNonEmpty(input.confidence)) return false;
    const confidence = Number(input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return false;
  }
  if (input.effort !== undefined && input.effort !== null) {
    if (!Number.isInteger(input.effort) || input.effort < 0) return false;
  }
  return true;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
