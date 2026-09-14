/* Live: queue states, task text, effort, points, owners, progress, and goals.
 * Pending backend work: due dates, weekly capacity, blockers, and verification methods. */

import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import {
  useWorkSummary,
  type WorkSummaryView,
  type WorkTaskSummaryView,
} from "@/v2/data/workSummary";
import { useWorkTasks } from "@/v2/data/workTasks";
import type { Board39Data, Board39Task } from "./Screen";
import {
  fromNullable,
  iconForTaskType,
  measured,
  notMeasured,
  queueStatusForTask,
} from "../b03-task-list/shared/workMapping";

function mapQueueTask(task: WorkTaskSummaryView): Board39Task {
  return {
    id: task.id,
    title: task.title,
    icon: iconForTaskType(task.type),
    evidenceProblem: fromNullable(task.reason, "No evidence problem is available."),
    expectedResult: fromNullable(task.desiredResult, "No expected result is available."),
    estimatedMinutes: fromNullable(task.effort, "No effort estimate is available."),
    points: measured(task.points),
    ownerName: fromNullable(task.ownerName, "No task owner is available."),
    dueDate: notMeasured("The work API provides a next check, not a due date."),
    status: queueStatusForTask(task.state),
    verificationMethod: notMeasured("The task list does not include a verification method."),
  };
}

export function mapBoard39Data(
  summary: WorkSummaryView,
  taskPage: { items: WorkTaskSummaryView[] },
  brandName: string,
): Board39Data {
  const tasks = taskPage.items.map(mapQueueTask);
  const count = (status: Board39Task["status"]) =>
    measured(tasks.filter((task) => task.status === status).length);
  return {
    brandId: summary.brandId,
    mode: summary.mode,
    brandName,
    workGoal: summary.goal
      ? measured(summary.goal.statement)
      : notMeasured("No brand goal has been recorded."),
    taskCounts: {
      ready: count("ready"),
      inProgress: count("in-progress"),
      waiting: count("waiting"),
      completed: count("completed"),
    },
    priority: summary.nextTask
      ? {
          id: measured(summary.nextTask.id),
          title: measured(summary.nextTask.title),
          points: measured(summary.nextTask.points),
        }
      : {
          id: notMeasured("No priority task is available."),
          title: notMeasured("No priority task is available."),
          points: notMeasured("No priority reward is available."),
        },
    tasks,
    weeklyCapacity: {
      range: notMeasured("No weekly capacity range is stored."),
      plannedMinutes: notMeasured("No weekly capacity ledger is stored."),
      usedMinutes: notMeasured("No weekly capacity ledger is stored."),
    },
    progress: {
      level: measured(summary.currentLevel.level),
      levelName: measured(summary.currentLevel.name),
      earnedWorkPoints: measured(summary.points),
      levelTargetPoints: summary.nextThreshold
        ? measured(summary.nextThreshold.points)
        : notMeasured("No next level target is available."),
    },
    blockerCount: notMeasured("No blocker model is stored."),
    waitingVerificationCount: count("waiting"),
  };
}

function queryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load the work queue.";
}

export function useBoard39Data(): V2LiveResult<Board39Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const tasksQuery = useWorkTasks(selectedBrandId);

  if (!selectedBrandId && !brandsLoading) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (brandsLoading || summaryQuery.isPending || tasksQuery.isPending) {
    return { state: { kind: "loading" } };
  }
  if (summaryQuery.isError || tasksQuery.isError) {
    const error = summaryQuery.error ?? tasksQuery.error;
    return { state: { kind: "error", message: queryErrorMessage(error) } };
  }
  if (!summaryQuery.data || !tasksQuery.data) {
    return { state: { kind: "not-measured", reason: "Work queue data is not available." } };
  }

  const data = mapBoard39Data(
    summaryQuery.data,
    tasksQuery.data,
    selectedBrand?.name ?? "Selected brand",
  );
  if (summaryQuery.isFetching || tasksQuery.isFetching) {
    const timestamps = [summaryQuery.dataUpdatedAt, tasksQuery.dataUpdatedAt].filter(
      (time) => time > 0,
    );
    return {
      state: {
        kind: "stale",
        reason: "Work queue data is refreshing.",
        asOf: new Date(Math.min(...timestamps)).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
