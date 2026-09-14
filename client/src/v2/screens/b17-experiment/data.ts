// Live: brand name, available work points, and the visibility observation payload.
// Pending backend work: experiment definition, fixed question set, engines, windows, threshold, results, chart, log, and confounds.

import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useReviewTask } from "@/v2/data/visibilityEvidence";
import {
  latestObservedWeek,
  useVisibilityMentionRate,
  type VisibilityMentionRate,
} from "@/v2/data/visibilityTrend";
import { type WorkTaskSummaryView } from "@/v2/data/workSummary";
import { useWorkTasks } from "@/v2/data/workTasks";
import { measured, unavailable, type Board17Data } from "./Screen";

type Board17Input = {
  brandId: string;
  brandName: string;
  tasks: WorkTaskSummaryView[];
  reviewTask: WorkTaskSummaryView | undefined;
  mentionRate: VisibilityMentionRate;
};

export function mapBoard17Data(input: Board17Input): Board17Data {
  const hasExperimentTask = input.tasks.some(
    (task) => task.type === "complete_visibility_experiment",
  );
  const title = unavailable<string>(
    hasExperimentTask
      ? "The experiment definition is not returned by the backend."
      : "No experiment definition is available.",
  );
  const workPoints = input.reviewTask
    ? measured(input.reviewTask.points)
    : unavailable<number>("No results review task exists.");

  return {
    navigation: { brandId: input.brandId, mode: "guided" },
    brand: { name: measured(input.brandName) },
    experiment: {
      title,
      status: unavailable("The experiment status is not stored by the backend."),
      stages: unavailable("The experiment stages are not stored by the backend."),
      questionSetName: unavailable("The fixed question set is not stored by the backend."),
      questionCount: unavailable(
        "The approved experiment question count is not returned by the backend.",
      ),
      questionCategories: unavailable(
        "The experiment question categories are not stored by the backend.",
      ),
      engines: unavailable("The experiment engine set is not stored by the backend."),
      baselineStart: unavailable("The baseline window is not stored by the backend."),
      baselineEnd: unavailable("The baseline window is not stored by the backend."),
      changedPage: unavailable("The changed page is not stored by the backend."),
      observationStart: unavailable("The observation window is not stored by the backend."),
      observationEnd: unavailable("The observation window is not stored by the backend."),
      nextMeasurement: unavailable("The next measurement date is not stored by the backend."),
      successThreshold: unavailable("The experiment threshold is not stored by the backend."),
      baselineMentions: unavailable("The experiment baseline result is not stored by the backend."),
      currentMentions: unavailable("The experiment result is not stored by the backend."),
      baselineDenominator: unavailable(
        "The experiment baseline sample is not stored by the backend.",
      ),
      currentDenominator: unavailable("The experiment sample is not stored by the backend."),
      chart: unavailable("The experiment comparison chart is not stored by the backend."),
      conclusion: unavailable("The experiment conclusion is not stored by the backend."),
      conclusionDetail: unavailable("The experiment conclusion is not stored by the backend."),
      log: unavailable("The experiment log is not stored by the backend."),
      evidenceLimits: {
        questionCount: unavailable("The experiment question limit is not stored by the backend."),
        engineCount: unavailable("The experiment engine limit is not stored by the backend."),
        geoAndLanguage: unavailable("The experiment locale is not stored by the backend."),
        personalization: unavailable(
          "The experiment personalization setting is not stored by the backend.",
        ),
      },
      confounds: [
        {
          label: "Additional content changes",
          detail: unavailable("The confound check is not stored by the backend."),
        },
        {
          label: "Brand campaigns",
          detail: unavailable("The confound check is not stored by the backend."),
        },
      ],
    },
    nextMeasurement: { workPoints },
    sourceObservation: measured(input.mentionRate),
  };
}

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function useBoard17Data(): V2LiveResult<Board17Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const tasksQuery = useWorkTasks(selectedBrandId);
  const reviewQuery = useReviewTask(selectedBrandId);
  const mentionRateQuery = useVisibilityMentionRate(selectedBrandId);

  if (
    brandsLoading ||
    tasksQuery.isPending ||
    reviewQuery.isPending ||
    mentionRateQuery.isPending
  ) {
    return { state: { kind: "loading" } };
  }

  if (tasksQuery.isError || reviewQuery.isError || mentionRateQuery.isError) {
    return { state: { kind: "error", message: "Experiment data unavailable" } };
  }

  if (
    !selectedBrandId ||
    !selectedBrand ||
    !tasksQuery.data ||
    !reviewQuery.data ||
    !mentionRateQuery.data
  ) {
    return {
      state: { kind: "not-measured", reason: "Experiment data is not available for this brand." },
    };
  }

  const data = mapBoard17Data({
    brandId: selectedBrandId,
    brandName: selectedBrand.name,
    tasks: tasksQuery.data.items,
    reviewTask: reviewQuery.data.items[0],
    mentionRate: mentionRateQuery.data,
  });
  const latestWeek = latestObservedWeek(mentionRateQuery.data.weeks);
  if (latestWeek) {
    const asOf = latestWeek.weekStart;
    const age = Date.now() - new Date(`${asOf}T23:59:59Z`).getTime();
    if (age > STALE_AFTER_MS) {
      return {
        state: {
          kind: "stale",
          reason: "The latest visibility observation is older than 30 days.",
          asOf,
        },
        data,
      };
    }
  }
  return { state: { kind: "ready" }, data };
}
