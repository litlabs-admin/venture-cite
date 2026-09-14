// Live: the selected brand, the work summary (for the banner's real work
// level), and Learn's own progress endpoint are all live. The lesson catalog
// itself is static content (shared/v2Lessons.ts) - there is nothing left to
// fetch for it, so it carries no loading/error state of its own.
//
// mapBoard14Data is the pure part: real work-summary and progress data in,
// Board14Data out, no hooks involved. useBoard14Data is the thin wrapper that
// resolves the query states and calls it - tests exercise the mapping
// through the pure function directly (tests/unit/v2Board14.test.tsx), the
// same split b04's and b01's data.ts use.

import { useSearch } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { V2Mode } from "@/v2/contracts/shell";
import { useWorkSummary, type WorkSummaryView } from "@/v2/data/workSummary";
import { useLearnProgress, type V2LearnCompletion } from "@/v2/data/learnProgress";
import { V2_LESSONS, V2_TOTAL_LESSON_POINTS } from "@shared/v2Lessons";
import type { Board14Data, Board14Lesson } from "./Screen";

/**
 * Learning stage names, indexed by how many of the six lessons are complete
 * (0..6). Deliberately distinct wording from the real work-level names
 * (Start/Ready/Improve/Learn/Maintain, `server/domains/work/policy.ts`) -
 * those describe GEO operating maturity for the brand's real work; these
 * describe progress through this course, and the two must never look like
 * the same system. `level` is `completedLessons + 1`, so it always matches
 * the array index used to pick the stage name below.
 */
export const LEARNING_STAGES = [
  "Getting oriented",
  "Visibility basics",
  "Source literacy",
  "Question design",
  "Technical readiness",
  "Experiment discipline",
  "Course complete",
] as const;

function buildLessons(completionByLesson: ReadonlyMap<string, V2LearnCompletion>): Board14Lesson[] {
  return V2_LESSONS.map((lesson, index) => {
    const completion = completionByLesson.get(lesson.id);
    const previous = index > 0 ? V2_LESSONS[index - 1] : null;
    return {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      durationMinutes: lesson.durationMinutes,
      points: lesson.points,
      icon: lesson.icon,
      state: completion ? "completed" : "not-started",
      completedAt: completion?.completedAt ?? null,
      prerequisite: !completion && previous ? `After ${previous.title}` : null,
    };
  });
}

/** Real work-summary and progress data in, Board14Data out. No hooks. */
export function mapBoard14Data(
  summary: WorkSummaryView,
  completions: readonly V2LearnCompletion[],
  mode: V2Mode,
): Board14Data {
  const completionByLesson = new Map(
    completions.map((completion) => [completion.lessonId, completion] as const),
  );

  const lessons = buildLessons(completionByLesson);
  const completedLessons = lessons.filter((lesson) => lesson.state === "completed");
  const firstIncomplete = lessons.find((lesson) => lesson.state === "not-started");
  const firstIncompleteSource = firstIncomplete
    ? V2_LESSONS.find((lesson) => lesson.id === firstIncomplete.id)
    : undefined;

  const earnedPoints = completedLessons.reduce((total, lesson) => total + lesson.points, 0);
  const minutesSpent = completedLessons.reduce(
    (total, lesson) => total + lesson.durationMinutes,
    0,
  );
  const stageIndex = Math.min(completedLessons.length, LEARNING_STAGES.length - 1);

  const currentLevel = summary.currentLevel;

  return {
    context: { brandId: summary.brandId, mode },
    title: "Learn what improves AI visibility",
    subtitle: "A personalized learning path for your current stage",
    banner: {
      label: `Real work level: ${currentLevel.name} (Level ${currentLevel.level})`,
      text: "That's your work level, not your progress through this course - see how it's calculated on Today.",
      progressLabel: "See your progress",
    },
    nextLesson: firstIncompleteSource
      ? {
          id: firstIncompleteSource.id,
          title: firstIncompleteSource.title,
          durationMinutes: firstIncompleteSource.durationMinutes,
          description: firstIncompleteSource.description,
          goals: firstIncompleteSource.goals,
          actionLabel: "Start lesson",
          rationaleLabel: "Why this lesson?",
          icon: firstIncompleteSource.icon,
        }
      : null,
    lessons,
    learning: {
      level: completedLessons.length + 1,
      stage: LEARNING_STAGES[stageIndex],
      points: earnedPoints,
      totalPoints: V2_TOTAL_LESSON_POINTS,
      progressRate: V2_TOTAL_LESSON_POINTS > 0 ? earnedPoints / V2_TOTAL_LESSON_POINTS : 0,
      completedLessons: completedLessons.length,
      totalLessons: V2_LESSONS.length,
      minutesSpent,
    },
    recommendedLesson: firstIncompleteSource
      ? {
          id: firstIncompleteSource.id,
          title: firstIncompleteSource.title,
          description: firstIncompleteSource.description,
          durationMinutes: firstIncompleteSource.durationMinutes,
        }
      : null,
    visibilityNote: {
      title: "Learning points do not measure visibility.",
      text: "Learning points track your progress through this course. They are separate from work points and do not affect your brand's visibility measurements.",
    },
    help: {
      title: "Need help?",
      text: "Every lesson in this path is listed below, with what's completed and what's next.",
      linkLabel: "Open help center",
    },
  };
}

export function useBoard14Data(): V2LiveResult<Board14Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const search = useSearch({ strict: false });
  const mode: V2Mode = search.mode === "expert" ? "expert" : "guided";
  const summary = useWorkSummary(selectedBrandId);
  const progress = useLearnProgress();

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId)
    return { state: { kind: "empty", reason: "Select a brand to open Learn." } };
  if (summary.isPending || progress.isPending) return { state: { kind: "loading" } };
  if (summary.isError)
    return { state: { kind: "error", message: "Work-level data could not be loaded." } };
  if (progress.isError)
    return { state: { kind: "error", message: "Learning progress could not be loaded." } };

  const data = mapBoard14Data(summary.data, progress.data.completions, mode);

  const stale =
    (summary.isStale && summary.isFetching) || (progress.isStale && progress.isFetching);
  if (stale) {
    const asOfMs = Math.max(summary.dataUpdatedAt, progress.dataUpdatedAt);
    return {
      state: {
        kind: "stale",
        reason: "Showing the last loaded work level and learning progress.",
        asOf: new Date(asOfMs).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
