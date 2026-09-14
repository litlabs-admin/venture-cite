// Live: the selected brand and work-summary request are live. Learning level,
// learning points, lesson catalog, completion, duration, and recommendations await backend work.

import { useSearch } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { V2Mode } from "@/v2/contracts/shell";
import { useWorkSummary } from "@/v2/data/workSummary";
import type { Board14Data, Board14Unavailable } from "./Screen";

const NOT_MEASURED = "Not measured because the Learn backend is not available yet.";

function unavailable(reason = NOT_MEASURED): Board14Unavailable {
  return { kind: "not-measured", reason };
}

function emptyData(brandId: string, mode: V2Mode): Board14Data {
  return {
    context: { brandId, mode },
    title: "Learn what improves AI visibility",
    subtitle: "A personalized learning path for your current stage",
    banner: {
      label: "Learning path not measured",
      text: "Learning content is not available for this brand yet.",
      progressLabel: "See your progress",
    },
    nextLesson: unavailable("No lesson content exists in the current backend."),
    lessons: unavailable("No lesson catalog exists in the current backend."),
    learning: {
      level: unavailable("Learning level is not measured."),
      stage: unavailable("Learning stage is not measured."),
      points: unavailable("Learning points are not measured."),
      nextLevelPoints: unavailable("The next learning threshold is not measured."),
      progressRate: unavailable("Learning progress is not measured."),
      completedLessons: unavailable("Completed lessons are not measured."),
      totalLessons: unavailable("The lesson path size is not measured."),
      minutesSpent: unavailable("Learning time is not measured."),
    },
    recommendedLesson: unavailable("No recommendation rule exists in the current backend."),
    visibilityNote: {
      title: "Learning points do not measure visibility.",
      text: "Learning points track progress through educational content. They are separate from work points and do not affect visibility measurements.",
    },
    help: {
      title: "Need help?",
      text: "Learn more about the Improve stage and get tips from our team.",
      linkLabel: "Open help center",
    },
  };
}

export function useBoard14Data(): V2LiveResult<Board14Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const search = useSearch({ strict: false });
  const mode: V2Mode = search.mode === "expert" ? "expert" : "guided";
  const summary = useWorkSummary(selectedBrandId);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId)
    return { state: { kind: "empty", reason: "Select a brand to open Learn." } };
  if (summary.isPending) return { state: { kind: "loading" } };
  if (summary.isError)
    return { state: { kind: "error", message: "Learning-progress data could not be loaded." } };

  const data = emptyData(summary.data.brandId, mode);
  if (summary.isStale && summary.isFetching) {
    return {
      state: {
        kind: "stale",
        reason: "The live work summary is available, but Learn data is not measured.",
        asOf: new Date(summary.dataUpdatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
