import type { RequestActor } from "../../../lib/requestActor";
import type {
  CompletionRule,
  TriggerEvidenceReference,
  WorkOpportunity,
  WorkOpportunitySource,
} from "../../../domains/work/opportunities";
import type { BrandId } from "../../../domains/work/types";

export type QuestionOpportunityRecord = {
  id: string;
  brandId: BrandId;
  generationId: string | null;
  generationNumber: number | null;
  prompt: string;
  status: "tracked" | "suggested" | "archived";
  paused: boolean;
};

export type QuestionOpportunityReader = (input: {
  actor: RequestActor;
  brandId: BrandId;
}) => Promise<readonly QuestionOpportunityRecord[]>;

type QuestionGenerationCounts = {
  trackedCount: number;
  runnableCount: number;
  pausedCount: number;
  suggestedCount: number;
  archivedCount: number;
};

type QuestionGenerationGroup = {
  generationId: string;
  generationNumber: number;
  records: QuestionOpportunityRecord[];
  runnable: QuestionOpportunityRecord[];
  counts: QuestionGenerationCounts;
};

const QUESTION_COMPLETION_RULE: CompletionRule = {
  required: ["artifact", "confirmation"],
};

export function createQuestionOpportunitySource({
  readQuestions,
}: {
  readQuestions: QuestionOpportunityReader;
}): WorkOpportunitySource {
  return {
    sourceKey: "questions",
    async collect({ actor, brandId }) {
      const questions = await readQuestions({ actor, brandId });
      const byGeneration = new Map<string, QuestionGenerationGroup>();
      for (const question of questions.filter((item) => item.brandId === brandId)) {
        const generationId = question.generationId;
        const generationNumber = question.generationNumber;
        if (
          !generationId ||
          typeof generationNumber !== "number" ||
          !Number.isInteger(generationNumber) ||
          generationNumber <= 0
        ) {
          continue;
        }
        const key = `${generationId}\u0000${generationNumber}`;
        const group =
          byGeneration.get(key) ??
          ({
            generationId,
            generationNumber,
            records: [],
            runnable: [],
            counts: {
              trackedCount: 0,
              runnableCount: 0,
              pausedCount: 0,
              suggestedCount: 0,
              archivedCount: 0,
            },
          } satisfies QuestionGenerationGroup);
        group.records.push(question);
        if (question.status === "tracked") group.counts.trackedCount += 1;
        if (question.status === "suggested") group.counts.suggestedCount += 1;
        if (question.status === "archived") group.counts.archivedCount += 1;
        if (question.paused) group.counts.pausedCount += 1;
        if (isRunnableQuestion(question)) {
          group.runnable.push(question);
          group.counts.runnableCount += 1;
        }
        byGeneration.set(key, group);
      }
      return [...byGeneration.values()]
        .filter((group) => group.counts.runnableCount > 0)
        .sort((left, right) => {
          return (
            left.generationNumber - right.generationNumber ||
            left.generationId.localeCompare(right.generationId)
          );
        })
        .map(toQuestionOpportunity);
    },
  };
}

function isRunnableQuestion(question: QuestionOpportunityRecord): boolean {
  return (
    question.status === "tracked" &&
    !question.paused &&
    question.prompt.trim().length > 0 &&
    typeof question.generationId === "string" &&
    question.generationId.trim().length > 0 &&
    typeof question.generationNumber === "number" &&
    Number.isInteger(question.generationNumber) &&
    question.generationNumber > 0
  );
}

function toQuestionOpportunity(group: QuestionGenerationGroup): WorkOpportunity {
  const uniqueQuestions = [
    ...new Map(group.runnable.map((question) => [question.id, question])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const questionIds = uniqueQuestions.map((question) => question.id);
  if (questionIds.length === 0) {
    throw new Error("A runnable question set must have a prompt generation");
  }
  const trigger: Extract<TriggerEvidenceReference, { kind: "artifact" }> = {
    kind: "artifact",
    label: "Tracked buyer question generation for human review.",
    artifactId: group.generationId,
    version: group.generationNumber,
    coverage: questionIds.join(","),
    duplicateCheck: group.generationId,
  };
  return {
    taskKey: `questions:g${group.generationNumber}:${group.generationId}`,
    taskType: "approve_buyer_question_set",
    ruleVersion: 1,
    title: "Review the tracked buyer-question set",
    reason: `${questionIds.length} tracked buyer questions in generation ${group.generationNumber} are ready for reviewer confirmation.`,
    completionRule: {
      ...QUESTION_COMPLETION_RULE,
      generationId: group.generationId,
      generationNumber: group.generationNumber,
      questionIds,
      trackedCount: group.counts.trackedCount,
      runnableCount: group.counts.runnableCount,
      pausedCount: group.counts.pausedCount,
      suggestedCount: group.counts.suggestedCount,
      archivedCount: group.counts.archivedCount,
    },
    evidence: [trigger],
  };
}
