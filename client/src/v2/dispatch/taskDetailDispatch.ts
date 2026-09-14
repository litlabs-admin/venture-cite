import type { TaskState, TaskType } from "@shared/work";
import { SCREENS, type ScreenRegistryEntry } from "@/v2/screens/registry";

export type TaskDetailStep = "brief" | "editor" | "revision" | "publication-check" | "confirmation";

export type TaskContentKind = "buyer-guide" | "other";

export type TaskDetailDispatchSummary = {
  taskType: TaskType;
  taskKey: string;
  state: TaskState;
  /** Present only when another data source identifies a page step. */
  step?: TaskDetailStep;
  /** Present only when the task data identifies a buyer-guide page. */
  contentKind?: TaskContentKind;
};

export type TaskDetailRoute = ScreenRegistryEntry["Route"];

function stepFromState(state: TaskState): TaskDetailStep | undefined {
  switch (state) {
    case "suggested":
    case "accepted":
    case "reopened":
      return "brief";
    case "in_progress":
      return "editor";
    case "submitted":
      return "confirmation";
    case "verified":
    case "waiting_for_observation":
    case "dismissed":
    case "not_applicable":
      return undefined;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function isBuyerGuide(summary: TaskDetailDispatchSummary): boolean {
  return (
    summary.contentKind === "buyer-guide" || summary.taskKey.startsWith("content:buyer-guide:")
  );
}

export function selectTaskDetailBoard(summary: TaskDetailDispatchSummary): keyof typeof SCREENS {
  if (summary.taskType === "repair_confirmed_access_or_factual_fault") return "b04";
  if (summary.taskType === "complete_visibility_experiment") return "b17";

  const step = summary.step ?? stepFromState(summary.state);
  if (step === "confirmation") return "b05";

  if (summary.taskType !== "improve_page_for_buyer_need") return "b19";

  switch (step) {
    case "brief":
    case "editor":
      return isBuyerGuide(summary) ? "b06" : "b19";
    case "revision":
      return "b15";
    case "publication-check":
      return "b16";
    case undefined:
      return "b19";
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

export function taskDetailDispatch(summary: TaskDetailDispatchSummary): TaskDetailRoute {
  return SCREENS[selectTaskDetailBoard(summary)].Route;
}
