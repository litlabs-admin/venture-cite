import { createHash } from "node:crypto";
import { WorkPolicyError } from "@shared/work";
import type {
  AwardDecision,
  EvidenceReference,
  LevelDefinition,
  LevelProgress,
  TaskCommand,
  TaskState,
  TaskType,
  VerificationMethod,
} from "@shared/work";
import type { TriggerEvidenceReference } from "./opportunities";

export const WORK_POLICY_VERSION = 1;

const TASK_POINTS: Readonly<Record<TaskType, number>> = {
  approve_essential_brand_facts: 20,
  approve_buyer_question_set: 20,
  establish_measurement_baseline: 20,
  repair_confirmed_access_or_factual_fault: 40,
  improve_page_for_buyer_need: 40,
  complete_earned_media_or_community_work: 30,
  review_results_and_record_decision: 10,
  complete_visibility_experiment: 50,
};

const LEVELS: readonly LevelDefinition[] = [
  { level: 1, name: "Start", points: 0, capabilityMilestone: "goal_selected_and_queue_reviewed" },
  { level: 2, name: "Ready", points: 60, capabilityMilestone: "baseline_ready" },
  { level: 3, name: "Improve", points: 160, capabilityMilestone: "evidenced_changes_complete" },
  { level: 4, name: "Learn", points: 320, capabilityMilestone: "decision_recorded" },
  { level: 5, name: "Maintain", points: 550, capabilityMilestone: "multi_period_maintenance" },
];

const TRANSITIONS: Readonly<Record<TaskState, Partial<Record<TaskCommand["kind"], TaskState>>>> = {
  suggested: { accept: "accepted", dismiss: "dismissed", mark_not_applicable: "not_applicable" },
  accepted: { start: "in_progress", dismiss: "dismissed", mark_not_applicable: "not_applicable" },
  in_progress: { submit: "submitted", dismiss: "dismissed", mark_not_applicable: "not_applicable" },
  submitted: {},
  verified: {},
  waiting_for_observation: { reopen: "reopened" },
  dismissed: {},
  not_applicable: {},
  reopened: { start: "in_progress", dismiss: "dismissed", mark_not_applicable: "not_applicable" },
};

const REQUIRED_EVIDENCE_KINDS: Readonly<Record<TaskType, readonly EvidenceReference["kind"][]>> = {
  approve_essential_brand_facts: ["source", "confirmation"],
  approve_buyer_question_set: ["artifact", "confirmation"],
  establish_measurement_baseline: ["measurement"],
  repair_confirmed_access_or_factual_fault: ["fault_repair"],
  improve_page_for_buyer_need: ["content_change", "confirmation"],
  complete_earned_media_or_community_work: ["authored_work", "confirmation"],
  review_results_and_record_decision: ["measurement", "decision"],
  complete_visibility_experiment: ["experiment", "measurement", "decision"],
};

export function validateCompletionRuleForTask(
  taskType: TaskType,
  requiredKinds: readonly EvidenceReference["kind"][],
): readonly EvidenceReference["kind"][] {
  const policyKinds = REQUIRED_EVIDENCE_KINDS[taskType];
  const exactMatch =
    requiredKinds.length === policyKinds.length &&
    requiredKinds.every((kind) => policyKinds.includes(kind)) &&
    new Set(requiredKinds).size === policyKinds.length;
  if (!exactMatch) {
    throw new WorkPolicyError(
      "configuration_error",
      `${taskType} completion rule must match the task evidence policy`,
    );
  }
  return [...policyKinds];
}

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function assertReason(
  command: Extract<TaskCommand, { kind: "dismiss" | "mark_not_applicable" | "reopen" }>,
): void {
  if (!isNonEmpty(command.reason)) {
    throw new WorkPolicyError("invalid_evidence", `${command.kind} requires a reason`);
  }
}

export function transitionTask(
  state: TaskState,
  taskType: TaskType,
  command: TaskCommand,
): TaskState {
  if (command.kind === "submit") validateEvidenceForTask(taskType, command.evidence);
  if (
    command.kind === "dismiss" ||
    command.kind === "mark_not_applicable" ||
    command.kind === "reopen"
  ) {
    assertReason(command);
  }
  const next = TRANSITIONS[state][command.kind];
  if (!next) {
    throw new WorkPolicyError(
      "invalid_transition",
      `invalid_transition: ${state} cannot ${command.kind}`,
    );
  }
  return next;
}

export function verifyTask(state: TaskState, verification: VerificationMethod): TaskState {
  if (state !== "submitted") {
    throw new WorkPolicyError("invalid_transition", `invalid_transition: ${state} cannot verify`);
  }
  if (verification.kind === "system_check" && !isNonEmpty(verification.checkId)) {
    throw new WorkPolicyError("invalid_verification", "system verification requires a check id");
  }
  if (
    verification.kind === "human_confirmation" &&
    (!isNonEmpty(verification.confirmedByUserId) || !isNonEmpty(verification.note))
  ) {
    throw new WorkPolicyError(
      "invalid_verification",
      "human verification requires a user id and note",
    );
  }
  return "verified";
}

export function waitForObservation(state: TaskState): TaskState {
  if (state !== "verified") {
    throw new WorkPolicyError(
      "invalid_transition",
      `invalid_transition: ${state} cannot wait_for_observation`,
    );
  }
  return "waiting_for_observation";
}

export function reviewOutcome(state: TaskState): TaskState {
  if (state === "verified" || state === "waiting_for_observation") {
    return "waiting_for_observation";
  }
  throw new WorkPolicyError(
    "invalid_transition",
    `invalid_transition: ${state} cannot record an outcome review`,
  );
}

export function validateEvidenceForTask(
  taskType: TaskType,
  evidence: readonly EvidenceReference[],
): readonly EvidenceReference[] {
  const references = validateEvidenceReferences(taskType, evidence);
  const kinds = new Set<EvidenceReference["kind"]>();
  for (const reference of references) kinds.add(reference.kind);
  for (const requiredKind of REQUIRED_EVIDENCE_KINDS[taskType]) {
    if (!kinds.has(requiredKind)) {
      throw new WorkPolicyError(
        "missing_evidence",
        `${taskType} requires ${requiredKind} evidence`,
      );
    }
  }
  return references;
}

export function validateEvidenceReferences(
  taskType: TaskType,
  evidence: readonly EvidenceReference[],
): readonly EvidenceReference[] {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new WorkPolicyError("missing_evidence", `${taskType} requires evidence`);
  }
  for (const reference of evidence) {
    if (!reference || !isNonEmpty(reference.label)) {
      throw new WorkPolicyError("invalid_evidence", `${taskType} contains invalid evidence`);
    }
    validateEvidenceFields(reference, taskType);
  }
  return evidence;
}

/**
 * Validate evidence attached while a server adapter creates a task.
 * Trigger artifacts describe internal records before a reviewer acts.
 */
export function validateTriggerEvidenceReferences(
  taskType: TaskType,
  evidence: readonly TriggerEvidenceReference[],
): readonly TriggerEvidenceReference[] {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new WorkPolicyError("missing_evidence", `${taskType} requires evidence`);
  }
  for (const reference of evidence) {
    if (!reference || !isNonEmpty(reference.label)) {
      throw new WorkPolicyError("invalid_evidence", `${taskType} contains invalid evidence`);
    }
    validateEvidenceFields(reference, taskType, true);
  }
  return evidence;
}

export function validateEvidenceActor(
  evidence: readonly EvidenceReference[],
  actorUserId: string,
): readonly EvidenceReference[] {
  for (const reference of evidence) {
    switch (reference.kind) {
      case "artifact":
        if (!("reviewedByUserId" in reference) || reference.reviewedByUserId !== actorUserId) {
          throw new WorkPolicyError(
            "invalid_evidence",
            "artifact evidence must name the authorized reviewer",
          );
        }
        break;
      case "authored_work":
        if (reference.authoredByUserId !== actorUserId) {
          throw new WorkPolicyError(
            "invalid_evidence",
            "authored-work evidence must name the authorized author",
          );
        }
        break;
      case "confirmation":
        if (reference.confirmedByUserId !== actorUserId) {
          throw new WorkPolicyError(
            "invalid_evidence",
            "confirmation evidence must name the authorized confirmer",
          );
        }
        break;
      default:
        break;
    }
  }
  return evidence;
}

export function validateTriggerEvidenceActor(
  evidence: readonly TriggerEvidenceReference[],
  actorUserId: string,
): readonly TriggerEvidenceReference[] {
  for (const reference of evidence) {
    switch (reference.kind) {
      case "artifact":
        if (
          "reviewedByUserId" in reference &&
          (!isNonEmpty(reference.reviewedByUserId) || reference.reviewedByUserId !== actorUserId)
        ) {
          throw new WorkPolicyError(
            "invalid_evidence",
            "artifact evidence must name the authorized reviewer",
          );
        }
        break;
      case "authored_work":
        if (reference.authoredByUserId !== actorUserId) {
          throw new WorkPolicyError(
            "invalid_evidence",
            "authored-work evidence must name the authorized author",
          );
        }
        break;
      case "confirmation":
        if (reference.confirmedByUserId !== actorUserId) {
          throw new WorkPolicyError(
            "invalid_evidence",
            "confirmation evidence must name the authorized confirmer",
          );
        }
        break;
      default:
        break;
    }
  }
  return evidence;
}

export function validateVerificationActor(
  verification: VerificationMethod,
  actorUserId: string,
): VerificationMethod {
  if (
    verification.kind === "human_confirmation" &&
    verification.confirmedByUserId !== actorUserId
  ) {
    throw new WorkPolicyError(
      "invalid_verification",
      "human verification must name the authorized confirmer",
    );
  }
  return verification;
}

function validateEvidenceFields(
  reference: EvidenceReference | TriggerEvidenceReference,
  taskType: TaskType,
  allowUnreviewedArtifact = false,
): void {
  const required = (value: unknown, field: string) => {
    if (!isNonEmpty(value)) {
      throw new WorkPolicyError("invalid_evidence", `${taskType} evidence requires ${field}`);
    }
  };
  const url = (value: string | undefined, field: string) => {
    if (value === undefined) return;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
    } catch {
      throw new WorkPolicyError(
        "invalid_evidence",
        `${taskType} evidence requires an HTTP or HTTPS ${field}`,
      );
    }
  };

  switch (reference.kind) {
    case "source":
      required(reference.sourceUrl, "sourceUrl");
      required(reference.retrievedAt, "retrievedAt");
      required(reference.excerpt, "excerpt");
      url(reference.sourceUrl, "source URL");
      url(reference.finalUrl, "final URL");
      url(reference.canonicalUrl, "canonical URL");
      return;
    case "artifact":
      required(reference.artifactId, "artifactId");
      if (!allowUnreviewedArtifact) {
        if ("reviewedByUserId" in reference) {
          required(reference.reviewedByUserId, "reviewedByUserId");
        } else {
          required(undefined, "reviewedByUserId");
        }
      } else if ("reviewedByUserId" in reference && reference.reviewedByUserId !== undefined) {
        required(reference.reviewedByUserId, "reviewedByUserId");
      }
      required(reference.coverage, "coverage");
      required(reference.duplicateCheck, "duplicateCheck");
      if (!Number.isInteger(reference.version) || reference.version < 1) {
        throw new WorkPolicyError(
          "invalid_evidence",
          `${taskType} artifact version must be positive`,
        );
      }
      return;
    case "measurement":
      required(reference.measurementId, "measurementId");
      required(reference.scopeId, "scopeId");
      required(reference.provider, "provider");
      required(reference.promptVersion, "promptVersion");
      required(reference.startedAt, "startedAt");
      required(reference.endedAt, "endedAt");
      required(reference.coverage, "coverage");
      return;
    case "fault_repair":
      required(reference.faultId, "faultId");
      required(reference.beforeCheckId, "beforeCheckId");
      required(reference.afterCheckId, "afterCheckId");
      required(reference.checkedAt, "checkedAt");
      return;
    case "content_change":
      required(reference.changeId, "changeId");
      required(reference.pageUrl, "pageUrl");
      required(reference.buyerNeed, "buyerNeed");
      required(reference.publishedAt, "publishedAt");
      url(reference.pageUrl, "page URL");
      return;
    case "authored_work":
      required(reference.submissionId, "submissionId");
      required(reference.destinationUrl, "destinationUrl");
      required(reference.authoredByUserId, "authoredByUserId");
      required(reference.submittedAt, "submittedAt");
      url(reference.destinationUrl, "destination URL");
      return;
    case "confirmation":
      required(reference.confirmedByUserId, "confirmedByUserId");
      required(reference.note, "note");
      required(reference.confirmedAt, "confirmedAt");
      return;
    case "decision":
      required(reference.decisionId, "decisionId");
      required(reference.reviewPeriod, "reviewPeriod");
      required(reference.decision, "decision");
      required(reference.basedOnMeasurementId, "basedOnMeasurementId");
      return;
    case "experiment":
      required(reference.experimentId, "experimentId");
      required(reference.hypothesis, "hypothesis");
      required(reference.baselineMeasurementId, "baselineMeasurementId");
      required(reference.changedAt, "changedAt");
      required(reference.laterMeasurementId, "laterMeasurementId");
      required(reference.conclusion, "conclusion");
      return;
  }
}

export function pointsForTask(taskType: TaskType): number {
  return TASK_POINTS[taskType];
}

export function levelForProgress(progress: LevelProgress): LevelDefinition {
  const milestones = progress.milestones;
  let highest = LEVELS[0];
  for (const level of LEVELS) {
    if (progress.points >= level.points && milestones.has(level.capabilityMilestone))
      highest = level;
  }
  return highest;
}

export function awardKey(input: {
  accountId: string;
  brandId: string;
  taskId: string;
  taskVersion: number;
  cycleKey: string;
  ruleVersion: number;
}): string {
  for (const [field, value] of [
    ["accountId", input.accountId],
    ["brandId", input.brandId],
    ["taskId", input.taskId],
    ["cycleKey", input.cycleKey],
  ] as const) {
    if (!isNonEmpty(value)) {
      throw new WorkPolicyError("invalid_evidence", `award key requires ${field}`);
    }
  }
  if (!Number.isInteger(input.taskVersion) || input.taskVersion < 1) {
    throw new WorkPolicyError("invalid_evidence", "award key requires a positive task version");
  }
  if (!Number.isInteger(input.ruleVersion) || input.ruleVersion < 1) {
    throw new WorkPolicyError("invalid_evidence", "award key requires a positive rule version");
  }
  const canonical = JSON.stringify({
    accountId: input.accountId,
    brandId: input.brandId,
    taskId: input.taskId,
    taskVersion: input.taskVersion,
    cycleKey: input.cycleKey,
    ruleVersion: input.ruleVersion,
  });
  return `work_award_v1_${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export function awardDecision(input: {
  accountId: string;
  brandId: string;
  taskId: string;
  taskType: TaskType;
  taskVersion: number;
  cycleKey: string;
  ruleVersion?: number;
  verification: VerificationMethod;
  evidence: readonly EvidenceReference[];
  awarded: boolean;
}): AwardDecision {
  const ruleVersion = input.ruleVersion ?? WORK_POLICY_VERSION;
  validateEvidenceForTask(input.taskType, input.evidence);
  return {
    awardKey: awardKey({
      accountId: input.accountId,
      brandId: input.brandId,
      taskId: input.taskId,
      taskVersion: input.taskVersion,
      cycleKey: input.cycleKey,
      ruleVersion,
    }),
    points: pointsForTask(input.taskType),
    taskType: input.taskType,
    taskVersion: input.taskVersion,
    ruleVersion,
    cycleKey: input.cycleKey,
    verification: input.verification,
    evidenceCount: input.evidence.length,
    awarded: input.awarded,
  };
}

export function levels(): readonly LevelDefinition[] {
  return LEVELS;
}
