import type { TaskType } from "@shared/work";
import type { WorkSummaryView, WorkTaskSummaryView } from "@/v2/data/workSummary";
import type { VisibilityMentionRate, VisibilityWeek } from "@/v2/data/visibilityTrend";
import type { V2IconName } from "@/v2/contracts/icons";
import type {
  TodayData,
  TodayPriorityTask,
  TodayTask,
  TodayValue,
  TodayVisibility,
} from "./TodayLayout";

export type AssignedTasksProjection = {
  items: WorkTaskSummaryView[];
  nextCursor: string | null;
};

const ICONS: Readonly<Record<TaskType, V2IconName>> = {
  approve_essential_brand_facts: "facts",
  approve_buyer_question_set: "q",
  establish_measurement_baseline: "chart",
  repair_confirmed_access_or_factual_fault: "doc",
  improve_page_for_buyer_need: "map",
  complete_earned_media_or_community_work: "work",
  review_results_and_record_decision: "chart",
  complete_visibility_experiment: "chart",
};

const TRIGGER_LABELS: Readonly<Record<TaskType, string>> = {
  approve_essential_brand_facts: "Facts not approved yet",
  approve_buyer_question_set: "Question set not approved",
  establish_measurement_baseline: "No baseline recorded",
  repair_confirmed_access_or_factual_fault: "Confirmed fact conflict",
  improve_page_for_buyer_need: "Buyer need unanswered",
  complete_earned_media_or_community_work: "Coverage gap",
  review_results_and_record_decision: "Results ready to review",
  complete_visibility_experiment: "Experiment ready to run",
};

function measured<T>(value: T): TodayValue<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(reason: string): TodayValue<T> {
  return { kind: "not-measured", reason };
}

function taskFromView(task: WorkTaskSummaryView): TodayPriorityTask {
  return {
    icon: ICONS[task.type],
    title: measured(task.title),
    points: measured(task.points),
    effortMinutes:
      task.effort === null
        ? notMeasured<number>("The task does not include an effort estimate.")
        : measured(task.effort),
    state: measured(TRIGGER_LABELS[task.type]),
    detail: task.reason
      ? measured(task.reason)
      : notMeasured<string>("The task does not include an observed reason."),
    approvedDetail: task.recommendedChange
      ? measured(task.recommendedChange)
      : notMeasured<string>("The task does not include a recommended change."),
    desiredResult: task.desiredResult
      ? measured(task.desiredResult)
      : notMeasured<string>("The task does not include a desired result."),
  };
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * The measured-visibility projection for one window of weeks.
 *
 * Exported so a screen can re-derive the same shape for a shorter window
 * when the user changes the visibility date range - the window is always
 * re-sliced from the full week list the adapter attaches to the result
 * (`TodayVisibility.weeks`), never re-fetched, because
 * `/api/v2/visibility/mention-rate` already returns the brand's full
 * 8-week trend in one call.
 */
export function measuredVisibility(
  weeks: readonly VisibilityWeek[],
  variant: "board01" | "board02",
): TodayVisibility {
  const latest = [...weeks].reverse().find((week) => week.measured > 0);
  if (!latest) return { kind: "not-measured", reason: "No valid observation exists yet." };

  const first = weeks[0]?.weekStart ?? latest.weekStart;
  const last = weeks[weeks.length - 1]?.weekStart ?? latest.weekStart;
  const midpoint = weeks[Math.floor(Math.max(0, weeks.length - 1) / 2)]?.weekStart ?? last;
  const year = new Date(`${last}T00:00:00Z`).getUTCFullYear();
  const note =
    variant === "board01"
      ? measured(
          `Latest sample: ${latest.measured} successful answers · ${latest.failed} failed attempts`,
        )
      : notMeasured<string>("The visibility response does not include engine and question counts.");

  return {
    kind: "measured",
    measured: latest.measured,
    mentioned: latest.cited,
    failed: latest.failed,
    mentionRate: latest.mentionRate,
    // Board02's fixed design language always says "Last 14 days" - it names
    // a fixed observation window, not the count of weeks in this slice - so
    // unlike board01's dated range, it does not vary with the selected
    // range-control size.
    rangeLabel:
      variant === "board01" ? `${formatDay(first)} – ${formatDay(last)}, ${year}` : "Last 14 days",
    chartPoints: weeks.map((week) => ({
      x: week.weekStart,
      y: week.measured > 0 ? week.mentionRate : null,
    })),
    xLabels: [formatDay(first), formatDay(midpoint), formatDay(last)],
    note,
    weeks,
  };
}

/** Re-slices `weeks` to its trailing `size` entries and re-derives the same
 *  projection - the client-side "range" a viewer can pick, since the read
 *  already carries every week the server will return for this brand. */
export function windowedVisibility(
  weeks: readonly VisibilityWeek[],
  variant: "board01" | "board02",
  size: number,
): TodayVisibility {
  return measuredVisibility(weeks.slice(Math.max(0, weeks.length - size)), variant);
}

function visibilityFromResponse(
  trend: VisibilityMentionRate | undefined,
  variant: "board01" | "board02",
  state: "loading" | "failed",
): TodayVisibility {
  if (state === "failed") return { kind: "failed", reason: "Visibility could not be loaded." };
  if (!trend) return { kind: "loading" };
  return measuredVisibility(trend.weeks, variant);
}

function progressFromSummary(summary: WorkSummaryView): TodayData["progress"] {
  const points = measured(summary.points);
  const next = summary.nextThreshold;
  if (!next) {
    return {
      level: measured(summary.currentLevel.level),
      levelName: measured(summary.currentLevel.name),
      workPoints: points,
      nextLevelPoints: notMeasured<number>("The next level is not defined."),
      nextLevel: notMeasured<number>("The next level is not defined."),
      nextLevelName: notMeasured<string>("The next level is not defined."),
      progressPercent: notMeasured<number>("The next level is not defined."),
      pointsRemaining: notMeasured<number>("The next level is not defined."),
      verifiedChanges: notMeasured<number>("The summary does not include verified change counts."),
      requiredChanges: notMeasured<number>("The summary does not include required change counts."),
      changesRemaining: notMeasured<number>(
        "The summary does not include remaining change counts.",
      ),
      status: notMeasured<string>("The summary does not include change verification status."),
    };
  }

  return {
    level: measured(summary.currentLevel.level),
    levelName: measured(summary.currentLevel.name),
    workPoints: points,
    nextLevelPoints: measured(next.points),
    nextLevel: measured(next.level),
    nextLevelName: measured(next.name),
    progressPercent: measured(Math.round((summary.points / next.points) * 100)),
    pointsRemaining: measured(Math.max(0, next.points - summary.points)),
    verifiedChanges: notMeasured<number>("The summary does not include verified change counts."),
    requiredChanges: notMeasured<number>("The summary does not include required change counts."),
    changesRemaining: notMeasured<number>("The summary does not include remaining change counts."),
    status: notMeasured<string>("The summary does not include change verification status."),
  };
}

export function buildTodayData<TVariant extends "board01" | "board02">(
  variant: TVariant,
  summary: WorkSummaryView,
  tasks: AssignedTasksProjection,
  trend: VisibilityMentionRate | undefined,
  brandName: string,
  visibilityState: "loading" | "failed" = "loading",
): TodayData<TVariant> {
  const priority = summary.nextTask
    ? taskFromView(summary.nextTask)
    : {
        icon: "doc" as const,
        title: notMeasured<string>("No priority task is assigned."),
        points: notMeasured<number>("No priority task is assigned."),
        effortMinutes: notMeasured<number>("No priority task is assigned."),
        state: notMeasured<string>("No priority task is assigned."),
        detail: notMeasured<string>("No priority task is assigned."),
        approvedDetail: notMeasured<string>("No priority task is assigned."),
        desiredResult: notMeasured<string>("No priority task is assigned."),
      };

  const queuedTasks = tasks.items
    .filter((task) => task.id !== summary.nextTask?.id)
    .slice(0, 2)
    .map(taskFromView);
  const waiting = summary.waitingTasks[0];

  return {
    variant,
    brandId: summary.brandId,
    mode: summary.mode,
    brand: { name: brandName },
    goal: summary.goal
      ? measured(summary.goal.statement)
      : notMeasured<string>("Select a goal before work can be ranked."),
    priorityTask: priority,
    queuedTasks,
    visibility: visibilityFromResponse(trend, variant, visibilityState),
    progress: progressFromSummary(summary),
    waitingTask: waiting
      ? {
          kind: "waiting",
          title: measured(waiting.title),
          points: measured(waiting.points),
        }
      : { kind: "not-measured", reason: "No task is waiting for an observation." },
  };
}
