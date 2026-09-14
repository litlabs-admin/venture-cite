// Live: task projection, task evidence, work points, and level progress.
// Pending backend work: durable named page checks and a stored approved-fact value.

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
import type { Board05Data } from "./Screen";
import type {
  SharedCheckState,
  SharedStep,
  SharedTextValue,
} from "../b04-factual-correction/shared/ConfirmationShared";

export type Board05QueryState<TData = unknown> =
  { status: "pending" } | { status: "error"; error: Error } | { status: "success"; data: TData };

function toQueryState<TData>(query: {
  isPending: boolean;
  isError: boolean;
  data: TData | undefined;
  error: Error | null;
}): Board05QueryState<TData> {
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

function evidenceText(
  task: WorkTaskDetailView,
  role: "trigger" | "submission",
  reason: string,
): SharedTextValue {
  return measuredOrUnavailable(evidenceFor(task, role)?.excerpt, reason);
}

function approvedFactFor(task: WorkTaskDetailView): SharedTextValue {
  const match = /^(.+?)\s+is the correct service region\.?$/i.exec(task.desiredResult.trim());
  return match?.[1]
    ? { kind: "measured", value: match[1] }
    : unavailable("The approved fact value is not stored separately.");
}

function steps(): readonly SharedStep[] {
  return [
    { label: "Review evidence", node: { kind: "completed" } },
    { label: "Update page", node: { kind: "completed" } },
    { label: "Verify work", node: { kind: "active", number: 3 } },
  ];
}

function checkStateForTask(task: WorkTaskDetailView): SharedCheckState {
  const reason = "The backend does not store a named page check yet.";
  return task.state === "submitted"
    ? unavailableCheck(reason)
    : unavailableCheck("Page verification is not available for this task state.");
}

export function mapBoard05Data(task: WorkTaskDetailView, summary: WorkSummaryView): Board05Data {
  const nextLevel: SharedTextValue = summary.nextThreshold
    ? {
        kind: "measured",
        value: `Level ${summary.nextThreshold.level} · ${summary.nextThreshold.name}`,
      }
    : unavailable("The next level is not measured yet.");
  return {
    task: {
      brandId: task.brandId,
      title: task.title,
      points: task.points,
      steps: steps(),
      beforeText: evidenceText(task, "trigger", "No old page text was recorded."),
      updatedText: evidenceText(task, "submission", "No updated page text was recorded."),
      approvedFact: approvedFactFor(task),
      sourcePath: sourcePathFor(task),
      checkedAt: checkedAtFor(task),
    },
    checks: {
      urlReachable: checkStateForTask(task),
      textPresent: checkStateForTask(task),
    },
    confirmation: {
      accepted: false,
      value: approvedFactFor(task),
    },
    progress: {
      currentLevel: { level: summary.currentLevel.level, name: summary.currentLevel.name },
      currentPoints: summary.points,
      taskPoints: task.points,
      nextLevel,
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

type Board05QueryInputs = {
  brandId: string;
  taskId: string | undefined;
  tasks: Board05QueryState<WorkTaskPage>;
  detail: Board05QueryState<WorkTaskDetailView>;
  summary: Board05QueryState<WorkSummaryView>;
};

function errorResult(error: Error): V2LiveResult<Board05Data> {
  return { state: { kind: "error", message: error.message } };
}

export function board05ResultFromQueries({
  brandId,
  taskId,
  tasks,
  detail,
  summary,
}: Board05QueryInputs): V2LiveResult<Board05Data> {
  if (!brandId) return { state: { kind: "not-measured", reason: "No brand is selected." } };
  if (tasks.status === "pending") return { state: { kind: "loading" } };
  if (tasks.status === "error") return errorResult(tasks.error);
  if (detail.status === "error") return errorResult(detail.error);
  if (summary.status === "error") return errorResult(summary.error);
  if (!taskId)
    return { state: { kind: "not-measured", reason: "No confirmation task is available." } };
  if (detail.status === "pending" || summary.status === "pending") {
    return { state: { kind: "loading" } };
  }
  if (detail.data.type !== "improve_page_for_buyer_need") {
    return { state: { kind: "not-measured", reason: "This task is not a page improvement." } };
  }
  return { state: { kind: "ready" }, data: mapBoard05Data(detail.data, summary.data) };
}

function readTaskId(search: Record<string, unknown>): string | undefined {
  return typeof search.task === "string" && search.task.length > 0 ? search.task : undefined;
}

export function useBoard05Data(): V2LiveResult<Board05Data> {
  const { selectedBrandId } = useBrandSelection();
  const search = useSearch({ strict: false });
  const tasksQuery = useWorkTasks(selectedBrandId);
  const taskId =
    readTaskId(search) ??
    tasksQuery.data?.items.find((item) => item.type === "improve_page_for_buyer_need")?.id;
  const detailQuery = useWorkTask(selectedBrandId, taskId);
  const summaryQuery = useWorkSummary(selectedBrandId);

  return board05ResultFromQueries({
    brandId: selectedBrandId,
    taskId,
    tasks: toQueryState(tasksQuery),
    detail: toQueryState(detailQuery),
    summary: toQueryState(summaryQuery),
  });
}
