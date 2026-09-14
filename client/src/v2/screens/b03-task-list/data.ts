/* Live: task state, titles, reasons, effort, points, owners, progress, and trigger source paths.
 * Pending backend work: approved before/after values and full weekly task details. */

import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import {
  useWorkSummary,
  type WorkSummaryView,
  type WorkTaskSummaryView,
} from "@/v2/data/workSummary";
import { useWorkTask, useWorkTasks, type WorkTaskDetailView } from "@/v2/data/workTasks";
import type { Board03Data, Board03Task, Board03TaskDetail } from "./Screen";
import type { WorkValue } from "./shared/WorkRowParts";
import {
  board03StateForTask,
  completionRuleText,
  fromNullable,
  iconForTaskType,
  measured,
  notMeasured,
} from "./shared/workMapping";

function triggerSourceUrl(detail: WorkTaskDetailView | undefined): string | undefined {
  return detail?.evidence?.find((item) => item.role === "trigger" && item.sourceUrl)?.sourceUrl ??
    undefined;
}

function sourcePath(detail: WorkTaskDetailView | undefined) {
  const sourceUrl = triggerSourceUrl(detail);
  if (!sourceUrl) return notMeasured<string>("No trigger source path is available.");
  try {
    return measured(new URL(sourceUrl).pathname || "/");
  } catch {
    return notMeasured<string>("The trigger source URL is invalid.");
  }
}

function sourceUrlValue(detail: WorkTaskDetailView | undefined) {
  const sourceUrl = triggerSourceUrl(detail);
  return sourceUrl ? measured(sourceUrl) : notMeasured<string>("No trigger source URL is available.");
}

function detailForTask(
  task: WorkTaskSummaryView,
  detail: WorkTaskDetailView | undefined,
): Board03TaskDetail {
  return {
    rationale: fromNullable(
      task.reason ?? task.desiredResult,
      "The task rationale is not available.",
    ),
    oldValue: notMeasured("No observation value is available."),
    approvedValue: notMeasured("No approved value is available."),
    sourcePath: sourcePath(detail),
    sourceUrl: sourceUrlValue(detail),
    completionRule: completionRuleText(task.type, detail?.completionRule?.required),
  };
}

function taskAction(state: Board03Task["state"]): Board03Task["action"] {
  switch (state) {
    case "in-progress":
      return { kind: "open-draft", label: "Open draft" };
    case "waiting":
      return { kind: "chevron" };
    case "todo":
    case "completed":
      return { kind: "none" };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function mapTask(task: WorkTaskSummaryView, detail?: WorkTaskDetailView): Board03Task | null {
  const state = board03StateForTask(task.state);
  if (!state) return null;
  const rowNote: WorkValue<string> =
    state === "waiting"
      ? task.nextCheckAt
        ? measured("Next measurement pending")
        : notMeasured("No next measurement is scheduled.")
      : notMeasured("No row note is available.");
  return {
    id: task.id,
    title: task.title,
    icon: iconForTaskType(task.type),
    state,
    rawState: task.state,
    revision: task.revision,
    evidenceLabel: fromNullable<string>(
      task.reason ?? task.recommendedChange,
      "No evidence summary is available.",
    ),
    effortMinutes: fromNullable(task.effort, "No effort estimate is available."),
    points: measured(task.points),
    owner: fromNullable(task.ownerName, "No task owner is available."),
    rowNote,
    action: taskAction(state),
    detail: detailForTask(task, detail),
  };
}

function countTasks(tasks: readonly Board03Task[], state: Board03Task["state"]) {
  return measured(tasks.filter((task) => task.state === state).length);
}

export function mapBoard03Data(
  summary: WorkSummaryView,
  taskPage: { items: WorkTaskSummaryView[] },
  selectedDetail: WorkTaskDetailView | undefined,
): Board03Data {
  const selectedId = taskPage.items[0]?.id ?? "";
  const tasks = taskPage.items.flatMap((task) => {
    const mapped = mapTask(task, task.id === selectedId ? selectedDetail : undefined);
    return mapped ? [mapped] : [];
  });
  return {
    brandId: summary.brandId,
    mode: summary.mode,
    taskCounts: {
      todo: countTasks(tasks, "todo"),
      inProgress: countTasks(tasks, "in-progress"),
      waiting: countTasks(tasks, "waiting"),
      completed: countTasks(tasks, "completed"),
    },
    tasks,
    completedPreview: tasks
      .filter((task) => task.state === "completed")
      .slice(0, 2)
      .map((task) => ({
        id: task.id,
        title: task.title,
        icon: task.icon === "facts" ? "facts" : "chart",
        points: task.points,
      })),
    progress: {
      level: measured(summary.currentLevel.level),
      levelName: measured(summary.currentLevel.name),
      workPoints: measured(summary.points),
    },
    selectedTaskId: tasks[0]?.id ?? "",
  };
}

function queryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load work tasks.";
}

function hasError(
  summaryQuery: ReturnType<typeof useWorkSummary>,
  tasksQuery: ReturnType<typeof useWorkTasks>,
  detailQuery: ReturnType<typeof useWorkTask>,
) {
  return summaryQuery.isError || tasksQuery.isError || detailQuery.isError;
}

export function useBoard03Data(): V2LiveResult<Board03Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const tasksQuery = useWorkTasks(selectedBrandId);
  const selectedId = tasksQuery.data?.items[0]?.id;
  const detailQuery = useWorkTask(selectedBrandId, selectedId);

  if (!selectedBrandId && !brandsLoading) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (
    brandsLoading ||
    summaryQuery.isPending ||
    tasksQuery.isPending ||
    Boolean(selectedId && detailQuery.isPending)
  ) {
    return { state: { kind: "loading" } };
  }
  if (hasError(summaryQuery, tasksQuery, detailQuery)) {
    const error = summaryQuery.error ?? tasksQuery.error ?? detailQuery.error;
    return { state: { kind: "error", message: queryErrorMessage(error) } };
  }
  if (!summaryQuery.data || !tasksQuery.data) {
    return { state: { kind: "not-measured", reason: "Work data is not available." } };
  }

  const data = mapBoard03Data(summaryQuery.data, tasksQuery.data, detailQuery.data);
  const queries = [summaryQuery, tasksQuery, detailQuery];
  const staleDates = queries
    .filter((query) => query.isFetching && query.dataUpdatedAt > 0)
    .map((query) => query.dataUpdatedAt);
  if (staleDates.length > 0) {
    return {
      state: {
        kind: "stale",
        reason: "Work data is refreshing.",
        asOf: new Date(Math.min(...staleDates)).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
