import type { RequestActor } from "../../../lib/requestActor";
import type {
  CompletionRule,
  WorkOpportunity,
  WorkOpportunitySource,
} from "../../../domains/work/opportunities";
import type { BrandId } from "../../../domains/work/types";

export type ExperimentOpportunityRecord = {
  id: string;
  brandId: BrandId;
  publishedAt: string;
  baselineRunId: string;
  baselineRunAt: string;
  laterRunId: string;
  laterRunAt: string;
};

export type ExperimentOpportunityReader = (input: {
  actor: RequestActor;
  brandId: BrandId;
}) => Promise<readonly ExperimentOpportunityRecord[]>;

const EXPERIMENT_COMPLETION_RULE_KINDS: CompletionRule["required"] = [
  "experiment",
  "measurement",
  "decision",
];

export function createExperimentOpportunitySource({
  readContent,
}: {
  readContent: ExperimentOpportunityReader;
}): WorkOpportunitySource {
  return {
    sourceKey: "experiment",
    async collect({ actor, brandId }) {
      const opportunities = (await readContent({ actor, brandId }))
        .filter((record) => record.brandId === brandId)
        .filter(isAttributableExperiment)
        .map(toExperimentOpportunity);

      return opportunities.sort((left, right) => left.taskKey.localeCompare(right.taskKey));
    },
  };
}

/**
 * A published page can attribute its effect on visibility only when a
 * completed measurement run precedes publication and another completed run
 * follows it.
 */
function isAttributableExperiment(record: ExperimentOpportunityRecord): boolean {
  if (
    record.id.trim().length === 0 ||
    record.baselineRunId.trim().length === 0 ||
    record.laterRunId.trim().length === 0 ||
    record.baselineRunId === record.laterRunId
  ) {
    return false;
  }
  const publishedAt = Date.parse(record.publishedAt);
  const baselineRunAt = Date.parse(record.baselineRunAt);
  const laterRunAt = Date.parse(record.laterRunAt);
  if (Number.isNaN(publishedAt) || Number.isNaN(baselineRunAt) || Number.isNaN(laterRunAt)) {
    return false;
  }
  return baselineRunAt <= publishedAt && publishedAt <= laterRunAt;
}

function toExperimentOpportunity(record: ExperimentOpportunityRecord): WorkOpportunity {
  const experimentId = `bofu:${record.id}`;
  return {
    taskKey: `experiment:bofu:${record.id}`,
    taskType: "complete_visibility_experiment",
    ruleVersion: 1,
    title: "Run a visibility experiment on the published page",
    reason: `The published page "${record.id}" sits between the completed citation runs ${record.baselineRunId} and ${record.laterRunId}, so its effect on visibility can be attributed.`,
    completionRule: {
      required: EXPERIMENT_COMPLETION_RULE_KINDS,
      contentId: record.id,
      publishedAt: record.publishedAt,
      baselineRunId: record.baselineRunId,
      laterRunId: record.laterRunId,
    },
    evidence: [
      {
        kind: "experiment",
        label: "Published page sits between two completed citation runs.",
        experimentId,
        hypothesis: "Publishing this page will improve the brand's visibility.",
        baselineMeasurementId: record.baselineRunId,
        changedAt: record.publishedAt,
        laterMeasurementId: record.laterRunId,
        conclusion: "Compare the successful citation runs before and after publication.",
      },
    ],
  };
}
