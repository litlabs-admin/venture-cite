export const TASK_TYPES = [
  "approve_essential_brand_facts",
  "approve_buyer_question_set",
  "establish_measurement_baseline",
  "repair_confirmed_access_or_factual_fault",
  "improve_page_for_buyer_need",
  "complete_earned_media_or_community_work",
  "review_results_and_record_decision",
  "complete_visibility_experiment",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type CapabilityMilestone =
  | "goal_selected_and_queue_reviewed"
  | "baseline_ready"
  | "evidenced_changes_complete"
  | "decision_recorded"
  | "multi_period_maintenance";

export type TaskState =
  | "suggested"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "verified"
  | "waiting_for_observation"
  | "dismissed"
  | "not_applicable"
  | "reopened";

export type VerificationMethod =
  | { kind: "system_check"; checkId: string }
  | { kind: "human_confirmation"; confirmedByUserId: string; note: string };

export type MeasurementScope =
  | { kind: "period"; period: string }
  | { kind: "provider"; provider: string; period: string }
  | { kind: "prompt_set"; promptSetId: string; period: string };

export function parseMeasurementScope(value: unknown): MeasurementScope {
  if (!isRecord(value)) throw new Error("Work outcome measurement scope is invalid");
  const record = value;
  const nonEmpty = (candidate: unknown): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0;
  if (record.kind === "period" && nonEmpty(record.period)) {
    return { kind: "period", period: record.period };
  }
  if (record.kind === "provider" && nonEmpty(record.provider) && nonEmpty(record.period)) {
    return { kind: "provider", provider: record.provider, period: record.period };
  }
  if (record.kind === "prompt_set" && nonEmpty(record.promptSetId) && nonEmpty(record.period)) {
    return { kind: "prompt_set", promptSetId: record.promptSetId, period: record.period };
  }
  throw new Error("Work outcome measurement scope is invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type EvidenceReference =
  | {
      kind: "source";
      label: string;
      sourceUrl: string;
      factId?: string;
      scrapePageId?: string;
      checkId?: string;
      finalUrl?: string;
      canonicalUrl?: string;
      retrievedAt: string;
      excerpt: string;
    }
  | {
      kind: "artifact";
      label: string;
      artifactId: string;
      version: number;
      reviewedByUserId: string;
      coverage: string;
      duplicateCheck: string;
    }
  | {
      kind: "measurement";
      label: string;
      measurementId: string;
      geoRankingId?: string;
      citationRunId?: string;
      brandPromptId?: string;
      promptGenerationId?: string;
      scopeId: string;
      provider: string;
      promptVersion: string;
      startedAt: string;
      endedAt: string;
      coverage: string;
    }
  | {
      kind: "fault_repair";
      label: string;
      faultId: string;
      beforeCheckId: string;
      afterCheckId: string;
      checkedAt: string;
    }
  | {
      kind: "content_change";
      label: string;
      changeId: string;
      pageUrl: string;
      buyerNeed: string;
      publishedAt: string;
    }
  | {
      kind: "authored_work";
      label: string;
      submissionId: string;
      destinationUrl: string;
      authoredByUserId: string;
      submittedAt: string;
    }
  | {
      kind: "confirmation";
      label: string;
      confirmedByUserId: string;
      note: string;
      confirmedAt: string;
    }
  | {
      kind: "decision";
      label: string;
      decisionId: string;
      reviewPeriod: string;
      decision: string;
      basedOnMeasurementId: string;
    }
  | {
      kind: "experiment";
      label: string;
      experimentId: string;
      hypothesis: string;
      baselineMeasurementId: string;
      changedAt: string;
      laterMeasurementId: string;
      conclusion: string;
    };

export type TaskCommand =
  | { kind: "accept" }
  | { kind: "start" }
  | { kind: "submit"; evidence: EvidenceReference[] }
  | { kind: "dismiss"; reason: string }
  | { kind: "mark_not_applicable"; reason: string }
  | { kind: "reopen"; reason: string };

export interface AwardDecision {
  awardKey: string;
  points: number;
  taskType: TaskType;
  taskVersion: number;
  ruleVersion: number;
  cycleKey: string;
  verification: VerificationMethod;
  evidenceCount: number;
  awarded: boolean;
}

export interface LevelDefinition {
  level: number;
  name: "Start" | "Ready" | "Improve" | "Learn" | "Maintain";
  points: number;
  capabilityMilestone: CapabilityMilestone;
}

export interface LevelProgress {
  points: number;
  milestones: ReadonlySet<CapabilityMilestone>;
}

export type WorkPolicyErrorCode =
  | "configuration_error"
  | "invalid_transition"
  | "missing_evidence"
  | "invalid_evidence"
  | "invalid_verification";

export class WorkPolicyError extends Error {
  readonly code: WorkPolicyErrorCode;

  constructor(code: WorkPolicyErrorCode, message: string) {
    super(message);
    this.name = "WorkPolicyError";
    this.code = code;
  }
}
