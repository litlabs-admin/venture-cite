// Live: tracked prompts, stored answer rows, cited URLs, source excerpts, and existing work tasks.
// Pending backend work: diagnosis page evidence, persisted hypothesis linkage, and task creation.

import { useState } from "react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useBrandFacts, type BrandFactView } from "@/v2/data/brandFacts";
import { useBrandPrompts, usePromptResults, type PromptResultView } from "@/v2/data/promptResults";
import { useWorkTasks } from "@/v2/data/workTasks";
import type { WorkTaskSummaryView } from "@/v2/data/workSummary";
import {
  defaultPromptId,
  observe,
  pathOf,
  retrievalOf,
  toAnswerRows,
} from "@/v2/diagnostics/answerRows";
import { isFailedCheck } from "@shared/citationFailure";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board11AnswerRecord, Board11Data, Board11Question } from "./Screen";

function measured<T>(value: T): { kind: "measured"; value: T } {
  return { kind: "measured", value };
}

function notMeasured(reason: string): { kind: "not-measured"; reason: string } {
  return { kind: "not-measured", reason };
}

function answerRecords(
  result: PromptResultView | undefined,
  brandName: string,
): Board11AnswerRecord[] {
  return (result?.platforms ?? [])
    .slice()
    .sort((left, right) => left.platform.localeCompare(right.platform))
    .map((row) => {
      const failed = isFailedCheck(row.snippet);
      return {
        model: row.platform,
        status: failed ? "failed" : "successful",
        snippet: row.snippet
          ? measured(row.snippet)
          : notMeasured("No answer snippet was recorded."),
        note: measured(
          failed
            ? "No answer generated."
            : row.isCited
              ? `${brandName} mentioned.`
              : `${brandName} not mentioned.`,
        ),
        fullResponse: row.fullResponse
          ? measured(row.fullResponse)
          : notMeasured("The full answer was not recorded."),
        sourceUrls: measured(row.citedUrls),
        checkedAt: measured(row.checkedAt),
      };
    });
}

function sourceFact(facts: BrandFactView[] | undefined): BrandFactView | undefined {
  return (facts ?? []).find((fact) => fact.sourceExcerpt && fact.sourceUrl);
}

function openExperiment(tasks: WorkTaskSummaryView[] | undefined): WorkTaskSummaryView | undefined {
  const openStates = new Set(["suggested", "accepted", "reopened", "in_progress"]);
  return (tasks ?? []).find(
    (task) =>
      openStates.has(task.state) &&
      (task.type === "improve_page_for_buyer_need" ||
        task.type === "complete_visibility_experiment"),
  );
}

export function useBoard11Data(): V2LiveResult<Board11Data> {
  const { selectedBrand, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const promptsQuery = useBrandPrompts(selectedBrandId || undefined);
  const resultsQuery = usePromptResults(selectedBrandId || undefined);
  const factsQuery = useBrandFacts(selectedBrandId || undefined);
  const tasksQuery = useWorkTasks(selectedBrandId);
  // Which tracked question the switcher has selected. `undefined` means "use
  // the default" - the question with a real diagnostic finding, same rule
  // `defaultPromptId` always used. Held here (not in the Route) so the hook
  // stays the one place that owns "which question is this board showing".
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | undefined>(undefined);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId || !selectedBrand) {
    return { state: { kind: "empty", reason: "No brand is selected for prompt diagnosis." } };
  }
  if (
    promptsQuery.isPending ||
    resultsQuery.isPending ||
    factsQuery.isPending ||
    tasksQuery.isPending
  ) {
    return { state: { kind: "loading" } };
  }
  if (promptsQuery.isError || resultsQuery.isError || factsQuery.isError || tasksQuery.isError) {
    const failedReads = [
      promptsQuery.isError ? "prompt" : null,
      resultsQuery.isError ? "answer" : null,
      factsQuery.isError ? "source evidence" : null,
      tasksQuery.isError ? "experiment" : null,
    ].filter((item): item is string => item !== null);
    return {
      state: { kind: "error", message: `The ${failedReads.join(", ")} data could not be loaded.` },
    };
  }

  const prompts = (promptsQuery.data ?? []).filter(
    (prompt) => prompt.status === "tracked" && !prompt.paused,
  );
  if (prompts.length === 0) {
    return {
      state: {
        kind: "empty",
        reason: `No approved buyer question exists for ${selectedBrand.name}.`,
      },
    };
  }

  const byPrompt = resultsQuery.data?.byPrompt ?? [];
  // A selection that no longer exists (the brand changed under the page, or
  // the question was un-tracked) falls back to the default rather than
  // pointing at a question that is no longer in `prompts`.
  const requestedId =
    selectedQuestionId && prompts.some((row) => row.id === selectedQuestionId)
      ? selectedQuestionId
      : undefined;
  const activeId = requestedId ?? defaultPromptId(prompts, byPrompt);
  const prompt = prompts.find((item) => item.id === activeId) ?? prompts[0];
  const result = byPrompt.find((item) => item.promptId === prompt.id);
  const resultById = new Map(byPrompt.map((row) => [row.promptId, row]));
  const questions: Board11Question[] = prompts.map((row) => {
    const rowObservation = observe(toAnswerRows(resultById.get(row.id)));
    return {
      id: row.id,
      text: row.prompt,
      hasFinding: rowObservation.successful > 0 && rowObservation.absent > 0,
    };
  });
  const rows = toAnswerRows(result);
  const observation = observe(rows);
  const retrieval = retrievalOf(rows, resultsQuery.data?.brandDomain);
  const fact = sourceFact(factsQuery.data);
  const experiment = openExperiment(tasksQuery.data?.items);
  const source = fact
    ? {
        path: measured(pathOf(fact.sourceUrl) ?? fact.sourceUrl ?? ""),
        excerpt: measured(fact.sourceExcerpt ?? ""),
      }
    : {
        path: notMeasured("No source path was recorded."),
        excerpt: notMeasured("No source excerpt was recorded."),
      };
  const staleAsOf = result?.lastCheckedAt ?? prompt.createdAt;
  const hasStaleQuery =
    promptsQuery.isStale || resultsQuery.isStale || factsQuery.isStale || tasksQuery.isStale;
  const data: Board11Data = {
    brandId: selectedBrand.id,
    brandName: selectedBrand.name,
    questions,
    selectedQuestionId: prompt.id,
    onSelectQuestion: setSelectedQuestionId,
    buyerQuestion: {
      text: prompt.prompt,
      state: measured("Approved buyer question"),
      intent: prompt.category?.trim()
        ? measured(`${prompt.category.trim()} intent`)
        : notMeasured("No question intent was recorded."),
    },
    answerObservation: {
      brandMentioned:
        observation.successful > 0
          ? measured(observation.mentioned > 0)
          : notMeasured("No successful answer was recorded."),
      successfulCount:
        observation.successful > 0
          ? measured(observation.successful)
          : notMeasured("No successful answer was recorded."),
      successfulTotal:
        observation.successful > 0
          ? notMeasured("The render denominator includes a failed answer attempt.")
          : notMeasured("No successful answer denominator exists."),
      failedCount:
        observation.failed > 0
          ? measured(observation.failed)
          : notMeasured("No failed answer attempt was recorded."),
    },
    sourceCoverage: {
      retrieved:
        retrieval.kind === "not_measured"
          ? notMeasured("Source URL coverage is not recorded for these answers.")
          : measured(retrieval.kind === "retrieved"),
    },
    pageEvidence: {
      text: notMeasured("No diagnosis evidence table confirms a page assessment."),
    },
    assessment: { state: measured("Hypothesis — needs testing") },
    source,
    experiment: experiment
      ? {
          title: measured(experiment.title),
          points: measured(experiment.points),
          timing: notMeasured("The task timing is not included in this response."),
          action: measured({ kind: "open", taskId: experiment.id }),
        }
      : {
          title: notMeasured("No experiment exists for this question."),
          points: notMeasured("No experiment points exist."),
          timing: notMeasured("No experiment timing exists."),
          action: notMeasured("Task creation is not available."),
        },
    answerRecords: answerRecords(result, selectedBrand.name),
    changeHistory: notMeasured("Change history is not stored for prompt answers."),
  };

  return hasStaleQuery
    ? {
        state: {
          kind: "stale",
          reason: "Prompt answers may be out of date.",
          asOf: staleAsOf,
        },
        data,
      }
    : { state: { kind: "ready" }, data };
}
