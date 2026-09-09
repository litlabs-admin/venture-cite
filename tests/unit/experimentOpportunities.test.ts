import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import { createExperimentOpportunitySource } from "../../server/services/work/sources/experimentOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-experiment-a" as BrandId;
const ACTOR = createRequestActor(USER_ID);

type ExperimentRecord = {
  id: string;
  brandId: BrandId;
  publishedAt: string;
  baselineRunId: string;
  baselineRunAt: string;
  laterRunId: string;
  laterRunAt: string;
};

function publishedContent(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    id: "content-1",
    brandId: BRAND_ID,
    publishedAt: "2026-09-08T12:00:00.000Z",
    baselineRunId: "run-before",
    baselineRunAt: "2026-09-08T10:00:00.000Z",
    laterRunId: "run-after",
    laterRunAt: "2026-09-09T10:00:00.000Z",
    ...overrides,
  };
}

function sourceForContent(content: ExperimentRecord[]) {
  const readContent = vi.fn(
    async (input: { actor: RequestActor; brandId: BrandId }): Promise<ExperimentRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return content;
    },
  );
  return { source: createExperimentOpportunitySource({ readContent }), readContent };
}

describe("visibility experiment work opportunities", () => {
  it("creates an experiment task when successful citation runs surround publication", async () => {
    const { source, readContent } = sourceForContent([
      publishedContent(),
      publishedContent({ id: "foreign-content", brandId: "brand-experiment-b" as BrandId }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readContent).toHaveBeenCalledTimes(1);
    expect(source.sourceKey).toBe("experiment");
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "experiment:bofu:content-1",
      taskType: "complete_visibility_experiment",
      ruleVersion: 1,
      title: "Run a visibility experiment on the published page",
      completionRule: {
        required: ["experiment", "measurement", "decision"],
        contentId: "content-1",
        publishedAt: "2026-09-08T12:00:00.000Z",
        baselineRunId: "run-before",
        laterRunId: "run-after",
      },
      evidence: [
        {
          kind: "experiment",
          experimentId: "bofu:content-1",
          hypothesis: "Publishing this page will improve the brand's visibility.",
          baselineMeasurementId: "run-before",
          changedAt: "2026-09-08T12:00:00.000Z",
          laterMeasurementId: "run-after",
          conclusion: "Compare the successful citation runs before and after publication.",
        },
      ],
    });
  });
});
