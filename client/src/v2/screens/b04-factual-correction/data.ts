// Live: task projection, task evidence, work points, and level progress.
// Pending backend work: durable named page checks for URL reachability and updated text.

import { useSearch } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary, type WorkSummaryView } from "@/v2/data/workSummary";
import {
  useWorkTask,
  useWorkTasks,
  type WorkTaskDetailView,
  type WorkTaskPage,
} from "@/v2/data/workTasks";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board04Data } from "./Screen";
import type { SharedCheckState, SharedStep, SharedTextValue } from "./shared/ConfirmationShared";

export type Board04QueryState<TData = unknown> =
  { status: "pending" } | { status: "error"; error: Error } | { status: "success"; data: TData };

type SummaryWithThreshold = WorkSummaryView & {
  nextThreshold: { level: number; name: string; points: number };
};

function hasNextThreshold(summary: WorkSummaryView): summary is SummaryWithThreshold {
  return summary.nextThreshold !== null;
}

function toQueryState<TData>(query: {
  isPending: boolean;
  isError: boolean;
  data: TData | undefined;
  error: Error | null;
}): Board04QueryState<TData> {
  if (query.isPending) return { status: "pending" };
  if (query.isError) return { status: "error", error: query.error ?? new Error("Request failed") };
  if (query.data === undefined) return { status: "error", error: new Error("Response was empty") };
  return { status: "success", data: query.data };
}

function unavailable(reason: string): SharedTextValue {
  return { kind: "not-measured", reason };
}

function unavailableCheck(reason: string): SharedCheckState {
  return { kind: "not-measured", reason };
}

function measuredOrUnavailable(value: string | null | undefined, reason: string): SharedTextValue {
  return value && value.trim().length > 0 ? { kind: "measured", value } : unavailable(reason);
}

function evidenceFor(task: WorkTaskDetailView, role: "trigger" | "submission") {
  return (task.evidence ?? []).find((item) => item.role === role);
}

function checkedAtFor(task: WorkTaskDetailView): SharedTextValue {
  const evidence = evidenceFor(task, "submission") ?? evidenceFor(task, "trigger");
  const raw = evidence?.retrievedAt ?? evidence?.createdAt;
  if (!raw) return unavailable("No check date was recorded.");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return unavailable("The check date is invalid.");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return {
    kind: "measured",
    value: `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
  };
}

function sourcePathFor(task: WorkTaskDetailView): SharedTextValue {
  const evidence = evidenceFor(task, "submission") ?? evidenceFor(task, "trigger");
  const sourceUrl = evidence?.sourceUrl ?? evidence?.finalUrl;
  if (!sourceUrl) return unavailable("No source path was recorded.");
  try {
    const path = new URL(sourceUrl).pathname;
    return path.length > 0
      ? { kind: "measured", value: path }
      : unavailable("The source path is empty.");
  } catch {
    return unavailable("The source URL is invalid.");
  }
}

function steps(updateLabel: string): readonly SharedStep[] {
  return [
    { label: "Review evidence", node: { kind: "completed" } },
    { label: updateLabel, node: { kind: "completed" } },
    { label: "Verify work", node: { kind: "active", number: 3 } },
  ];
}

function checkStateForTask(task: WorkTaskDetailView): SharedCheckState {
  return task.state === "submitted"
    ? { kind: "pending" }
    : { kind: "not-measured", reason: "Human confirmation is not available for this task state." };
}

export function mapBoard04Data(
  task: WorkTaskDetailView,
  summary: SummaryWithThreshold,
): Board04Data {
  const before = evidenceFor(task, "trigger");
  const after = evidenceFor(task, "submission");
  return {
    task: {
      brandId: task.brandId,
      title: task.title,
      points: task.points,
      steps: steps("Update your page"),
      before: {
        claim: measuredOrUnavailable(before?.excerpt, "No before-page claim was recorded."),
      },
      after: { claim: measuredOrUnavailable(after?.excerpt, "No after-page claim was recorded.") },
      sourcePath: sourcePathFor(task),
      approvedFact: measuredOrUnavailable(task.desiredResult, "No approved fact was recorded."),
      note: unavailable("No evidence note was recorded."),
      checkedAt: checkedAtFor(task),
    },
    checks: {
      urlReachable: unavailableCheck("The backend does not store a named URL check yet."),
      textPresent: unavailableCheck("The backend does not store a named text check yet."),
      factConfirmed: checkStateForTask(task),
    },
    progress: {
      currentLevel: { level: summary.currentLevel.level, name: summary.currentLevel.name },
      currentPoints: summary.points,
      nextPoints: summary.nextThreshold.points,
      awardedPoints: task.points,
      nextLevel: { kind: "measured", value: summary.nextThreshold.name },
      verifiedChanges: {
        kind: "not-measured",
        reason: "The work summary does not include a verified-change count.",
      },
      requiredChanges: {
        kind: "not-measured",
        reason: "The work policy threshold is not exposed in this response.",
      },
      completionMessage: unavailable("The work summary does not include a completion message."),
    },
  };
}

type Board04QueryInputs = {
  brandId: string;
  taskId: string | undefined;
  tasks: Board04QueryState<WorkTaskPage>;
  detail: Board04QueryState<WorkTaskDetailView>;
  summary: Board04QueryState<WorkSummaryView>;
};

function errorResult(error: Error): V2LiveResult<Board04Data> {
  return { state: { kind: "error", message: error.message } };
}

export function board04ResultFromQueries({
  brandId,
  taskId,
  tasks,
  detail,
  summary,
}: Board04QueryInputs): V2LiveResult<Board04Data> {
  if (!brandId) return { state: { kind: "not-measured", reason: "No brand is selected." } };
  if (tasks.status === "pending") return { state: { kind: "loading" } };
  if (tasks.status === "error") return errorResult(tasks.error);
  if (detail.status === "error") return errorResult(detail.error);
  if (summary.status === "error") return errorResult(summary.error);
  if (!taskId) {
    return { state: { kind: "not-measured", reason: "No factual-correction task is available." } };
  }
  if (detail.status === "pending" || summary.status === "pending") {
    return { state: { kind: "loading" } };
  }
  if (detail.data.type !== "repair_confirmed_access_or_factual_fault") {
    return { state: { kind: "not-measured", reason: "This task is not a factual correction." } };
  }
  if (!hasNextThreshold(summary.data)) {
    return { state: { kind: "not-measured", reason: "The next level is not measured yet." } };
  }
  return { state: { kind: "ready" }, data: mapBoard04Data(detail.data, summary.data) };
}

function readTaskId(search: Record<string, unknown>): string | undefined {
  return typeof search.task === "string" && search.task.length > 0 ? search.task : undefined;
}

export function useBoard04Data(): V2LiveResult<Board04Data> {
  const { selectedBrandId } = useBrandSelection();
  const search = useSearch({ strict: false });
  const tasksQuery = useWorkTasks(selectedBrandId);
  const taskId =
    readTaskId(search) ??
    tasksQuery.data?.items.find((item) => item.type === "repair_confirmed_access_or_factual_fault")
      ?.id;
  const detailQuery = useWorkTask(selectedBrandId, taskId);
  const summaryQuery = useWorkSummary(selectedBrandId);

  return board04ResultFromQueries({
    brandId: selectedBrandId,
    taskId,
    tasks: toQueryState(tasksQuery),
    detail: toQueryState(detailQuery),
    summary: toQueryState(summaryQuery),
  });
}
