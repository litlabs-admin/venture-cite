import type { RequestActor } from "../../../lib/requestActor";
import type {
  CompletionRule,
  WorkOpportunity,
  WorkOpportunitySource,
} from "../../../domains/work/opportunities";
import type { BrandId } from "../../../domains/work/types";

export type OutcomeReviewOpportunityRecord = {
  id: string;
  brandId: BrandId;
  taskVersion: number;
  taskType: string;
  title: string;
  completedAt: string;
};

export type OutcomeReviewOpportunityReader = (input: {
  actor: RequestActor;
  brandId: BrandId;
}) => Promise<readonly OutcomeReviewOpportunityRecord[]>;

const OUTCOME_REVIEW_COMPLETION_RULE_KINDS: CompletionRule["required"] = [
  "measurement",
  "decision",
];

export function createOutcomeReviewOpportunitySource({
  readTasks,
}: {
  readTasks: OutcomeReviewOpportunityReader;
}): WorkOpportunitySource {
  return {
    sourceKey: "outcome",
    async collect({ actor, brandId }) {
      const opportunities = (await readTasks({ actor, brandId }))
        .filter((record) => record.brandId === brandId)
        .filter(isReviewableCompletedTask)
        .map((record) => toOutcomeReviewOpportunity(record, brandId));

      return opportunities.sort((left, right) => left.taskKey.localeCompare(right.taskKey));
    },
  };
}

/**
 * A completed task is reviewable once it carries a stable version, a title,
 * and a completion date. The reader is responsible for excluding tasks that
 * already have a recorded outcome review.
 */
function isReviewableCompletedTask(record: OutcomeReviewOpportunityRecord): boolean {
  return (
    record.id.trim().length > 0 &&
    Number.isInteger(record.taskVersion) &&
    record.taskVersion > 0 &&
    record.taskType.trim().length > 0 &&
    record.title.trim().length > 0 &&
    !Number.isNaN(Date.parse(record.completedAt))
  );
}

function toOutcomeReviewOpportunity(
  record: OutcomeReviewOpportunityRecord,
  brandId: BrandId,
): WorkOpportunity {
  return {
    taskKey: `outcome:review:${record.id}:v${record.taskVersion}`,
    taskType: "review_results_and_record_decision",
    ruleVersion: 1,
    title: "Review the outcome of completed work",
    reason: `The completed task "${record.title}" (v${record.taskVersion}) has not had its outcome reviewed.`,
    completionRule: {
      required: OUTCOME_REVIEW_COMPLETION_RULE_KINDS,
      taskId: record.id,
      taskVersion: record.taskVersion,
    },
    evidence: [
      {
        kind: "measurement",
        label: "Completed work is ready for outcome review.",
        measurementId: `work-task:${record.id}:v${record.taskVersion}`,
        scopeId: `brand:${brandId}`,
        provider: "work-task",
        promptVersion: `task-v${record.taskVersion}`,
        startedAt: record.completedAt,
        endedAt: record.completedAt,
        coverage: record.title,
      },
    ],
  };
}
