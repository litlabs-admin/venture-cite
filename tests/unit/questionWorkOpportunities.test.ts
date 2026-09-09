import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import { createQuestionOpportunitySource } from "../../server/services/work/sources/questionOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-questions-a" as BrandId;
const OTHER_BRAND_ID = "brand-questions-b" as BrandId;
const ACTOR = createRequestActor(USER_ID);

type QuestionOpportunityRecord = {
  id: string;
  brandId: BrandId;
  generationId: string | null;
  generationNumber: number | null;
  prompt: string;
  status: "tracked" | "suggested" | "archived";
  paused: boolean;
};

function question(overrides: Partial<QuestionOpportunityRecord> = {}): QuestionOpportunityRecord {
  return {
    id: "question-1",
    brandId: BRAND_ID,
    generationId: "generation-3",
    generationNumber: 3,
    prompt: "Which buyer problem does Acme solve?",
    status: "tracked",
    paused: false,
    ...overrides,
  };
}

function sourceForQuestions(questions: QuestionOpportunityRecord[]) {
  const readQuestions = vi.fn(
    async (input: {
      actor: RequestActor;
      brandId: BrandId;
    }): Promise<QuestionOpportunityRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return questions.filter((item) => item.brandId === input.brandId);
    },
  );

  return {
    source: createQuestionOpportunitySource({ readQuestions }),
    readQuestions,
  };
}

describe("buyer question work opportunities", () => {
  it("creates one stable task for a tracked runnable question and its immutable generation", async () => {
    const { source, readQuestions } = sourceForQuestions([
      question(),
      question({ id: "question-2", prompt: "Which team benefits from Acme?" }),
      question({ id: "foreign-question", brandId: OTHER_BRAND_ID }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readQuestions).toHaveBeenCalledTimes(1);
    expect(source.sourceKey).toBe("questions");
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "questions:g3:generation-3",
      taskType: "approve_buyer_question_set",
      ruleVersion: 1,
      completionRule: {
        required: ["artifact", "confirmation"],
        generationId: "generation-3",
        generationNumber: 3,
        questionIds: ["question-1", "question-2"],
        trackedCount: 2,
        runnableCount: 2,
        pausedCount: 0,
        suggestedCount: 0,
        archivedCount: 0,
      },
    });
    expect(opportunities[0]?.evidence).toEqual([
      {
        kind: "artifact",
        label: "Tracked buyer question generation for human review.",
        artifactId: "generation-3",
        version: 3,
        coverage: "question-1,question-2",
        duplicateCheck: "generation-3",
      },
    ]);
  });

  it("derives runnable prompts from status, pause state, prompt text, and generation", async () => {
    const { source } = sourceForQuestions([
      question({
        id: "paused-question",
        paused: true,
        generationId: "generation-7",
        generationNumber: 7,
      }),
      question({
        id: "suggested-question",
        status: "suggested",
        generationId: "generation-7",
        generationNumber: 7,
      }),
      question({
        id: "archived-question",
        status: "archived",
        generationId: "generation-7",
        generationNumber: 7,
      }),
      question({
        id: "blank-question",
        prompt: "   ",
        generationId: "generation-7",
        generationNumber: 7,
      }),
      question({ id: "missing-generation", generationId: null, generationNumber: null }),
      question({
        id: "runnable-question",
        generationId: "generation-7",
        generationNumber: 7,
      }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "questions:g7:generation-7",
      completionRule: {
        required: ["artifact", "confirmation"],
        trackedCount: 3,
        runnableCount: 1,
        pausedCount: 1,
        suggestedCount: 1,
        archivedCount: 1,
      },
    });
    expect(opportunities[0]?.evidence).toEqual([
      expect.objectContaining({
        kind: "artifact",
        artifactId: "generation-7",
        version: 7,
        coverage: "runnable-question",
      }),
    ]);
  });

  it("uses the authenticated actor and selected brand for question collection", async () => {
    const { source, readQuestions } = sourceForQuestions([
      question({ id: "brand-question" }),
      question({ id: "other-brand-question", brandId: OTHER_BRAND_ID }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readQuestions).toHaveBeenCalledWith({ actor: ACTOR, brandId: BRAND_ID });
    expect(opportunities.map((item) => item.taskKey)).toEqual(["questions:g3:generation-3"]);
    expect(opportunities[0]?.completionRule.required).toEqual(["artifact", "confirmation"]);
  });
});
