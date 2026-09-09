import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import { createOutcomeReviewOpportunitySource } from "../../server/services/work/sources/outcomeReviewOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-outcome-a" as BrandId;
const ACTOR = createRequestActor(USER_ID);

type OutcomeReviewRecord = {
  id: string;
  brandId: BrandId;
  taskVersion: number;
  taskType: string;
  title: string;
  completedAt: string;
};

function completedTask(overrides: Partial<OutcomeReviewRecord> = {}): OutcomeReviewRecord {
  return {
    id: "task-1",
    brandId: BRAND_ID,
    taskVersion: 2,
    taskType: "improve_page_for_buyer_need",
    title: "Improve the pricing page",
    completedAt: "2026-09-08T01:00:00.000Z",
    ...overrides,
  };
}

function sourceForTasks(tasks: OutcomeReviewRecord[]) {
  const readTasks = vi.fn(
    async (input: { actor: RequestActor; brandId: BrandId }): Promise<OutcomeReviewRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return tasks;
    },
  );
  return { source: createOutcomeReviewOpportunitySource({ readTasks }), readTasks };
}

describe("outcome review work opportunities", () => {
  it("creates a stable review task for completed work without a recorded decision", async () => {
    const { source, readTasks } = sourceForTasks([
      completedTask(),
      completedTask({ id: "foreign-task", brandId: "brand-outcome-b" as BrandId }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readTasks).toHaveBeenCalledTimes(1);
    expect(source.sourceKey).toBe("outcome");
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "outcome:review:task-1:v2",
      taskType: "review_results_and_record_decision",
      ruleVersion: 1,
      title: "Review the outcome of completed work",
      completionRule: {
        required: ["measurement", "decision"],
        taskId: "task-1",
        taskVersion: 2,
      },
      evidence: [
        {
          kind: "measurement",
          measurementId: "work-task:task-1:v2",
          scopeId: "brand:brand-outcome-a",
          provider: "work-task",
          promptVersion: "task-v2",
          startedAt: "2026-09-08T01:00:00.000Z",
          endedAt: "2026-09-08T01:00:00.000Z",
          coverage: "Improve the pricing page",
        },
      ],
    });
  });
});
