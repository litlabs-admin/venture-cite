import { TASK_TYPES, WorkPolicyError, type EvidenceReference, type TaskType } from "@shared/work";
import type { RequestActor } from "../../lib/requestActor";
import {
  validateCompletionRuleForTask,
  validateTriggerEvidenceActor,
  validateTriggerEvidenceReferences,
} from "./policy";
import type { BrandId } from "./types";

/**
 * Evidence that an authoritative server reader uses to explain why a task
 * exists. Trigger artifacts have not received human review yet.
 */
export type TriggerEvidenceReference =
  | Exclude<EvidenceReference, { kind: "artifact" }>
  | (Omit<Extract<EvidenceReference, { kind: "artifact" }>, "reviewedByUserId"> & {
      kind: "artifact";
    });

export type CompletionRule = {
  required: readonly EvidenceReference["kind"][];
  [key: string]: unknown;
};

export type WorkOpportunity = {
  taskKey: string;
  taskType: TaskType;
  ruleVersion: number;
  title: string;
  reason: string;
  completionRule: CompletionRule;
  evidence: TriggerEvidenceReference[];
};

export interface WorkOpportunitySource {
  readonly sourceKey: string;
  collect(input: { actor: RequestActor; brandId: BrandId }): Promise<WorkOpportunity[]>;
}

const EVIDENCE_KINDS = new Set<EvidenceReference["kind"]>([
  "source",
  "artifact",
  "measurement",
  "fault_repair",
  "content_change",
  "authored_work",
  "confirmation",
  "decision",
  "experiment",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function invalidOpportunity(message: string): WorkPolicyError {
  return new WorkPolicyError("configuration_error", `Invalid work opportunity: ${message}`);
}

function invalidEvidence(error: unknown): WorkPolicyError {
  if (error instanceof WorkPolicyError) {
    return new WorkPolicyError(error.code, `Invalid evidence: ${error.message}`);
  }
  return new WorkPolicyError("invalid_evidence", "Invalid evidence");
}

function validateCompletionRule(value: unknown): CompletionRule {
  if (!isRecord(value) || !Array.isArray(value.required) || value.required.length === 0) {
    throw invalidOpportunity("completionRule.required must contain evidence kinds");
  }

  const required = value.required;
  const seen = new Set<string>();
  for (const kind of required) {
    if (typeof kind !== "string" || !EVIDENCE_KINDS.has(kind as EvidenceReference["kind"])) {
      throw invalidOpportunity("completionRule.required contains an unsupported evidence kind");
    }
    if (seen.has(kind)) {
      throw invalidOpportunity("completionRule.required cannot contain duplicate evidence kinds");
    }
    seen.add(kind);
  }

  return {
    ...value,
    required: [...(required as EvidenceReference["kind"][])],
  };
}

export function validateWorkOpportunity(
  value: unknown,
  actor?: RequestActor,
  sourceKey?: string,
): WorkOpportunity {
  if (!isRecord(value)) throw invalidOpportunity("must be an object");
  const taskKey = value.taskKey;
  if (!isNonEmptyString(taskKey)) throw invalidOpportunity("taskKey must be non-empty");
  const normalizedTaskKey = taskKey.trim();
  if (
    sourceKey !== undefined &&
    (!isNonEmptyString(sourceKey) || !normalizedTaskKey.startsWith(`${sourceKey.trim()}:`))
  ) {
    throw invalidOpportunity("taskKey must use the source namespace");
  }
  const taskType = value.taskType;
  if (!TASK_TYPES.includes(taskType as TaskType)) {
    throw invalidOpportunity("taskType is unsupported");
  }
  const ruleVersion = value.ruleVersion;
  if (typeof ruleVersion !== "number" || !Number.isInteger(ruleVersion) || ruleVersion < 1) {
    throw invalidOpportunity("ruleVersion must be a positive integer");
  }
  const title = value.title;
  if (!isNonEmptyString(title)) throw invalidOpportunity("title must be non-empty");
  const reason = value.reason;
  if (!isNonEmptyString(reason)) throw invalidOpportunity("reason must be non-empty");

  const completionRule = validateCompletionRule(value.completionRule);
  const validatedTaskType = taskType as TaskType;
  const policyRequiredKinds = validateCompletionRuleForTask(
    validatedTaskType,
    completionRule.required,
  );
  if (!Array.isArray(value.evidence)) {
    throw invalidOpportunity("evidence must be an array");
  }

  try {
    const evidence = validateTriggerEvidenceReferences(validatedTaskType, value.evidence);
    if (actor) validateTriggerEvidenceActor(evidence, actor.userId);
    return {
      taskKey: normalizedTaskKey,
      taskType: validatedTaskType,
      ruleVersion,
      title: title.trim(),
      reason: reason.trim(),
      completionRule: { ...completionRule, required: policyRequiredKinds },
      evidence: [...evidence],
    };
  } catch (error) {
    throw invalidEvidence(error);
  }
}
