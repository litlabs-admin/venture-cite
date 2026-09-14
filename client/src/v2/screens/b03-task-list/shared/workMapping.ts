import type { TaskState, TaskType } from "@shared/work";
import type { WorkStatus, WorkValue } from "./WorkRowParts";
import type { Board03TaskState } from "../Screen";

export function measured<T>(value: T): WorkValue<T> {
  return { kind: "measured", value };
}

export function notMeasured<T>(reason: string): WorkValue<T> {
  return { kind: "not-measured", reason };
}

export function fromNullable<T>(value: T | null | undefined, reason: string): WorkValue<T> {
  return value === null || value === undefined ? notMeasured(reason) : measured(value);
}

export function board03StateForTask(state: TaskState): Board03TaskState | null {
  switch (state) {
    case "suggested":
    case "accepted":
    case "reopened":
      return "todo";
    case "in_progress":
    case "submitted":
      return "in-progress";
    case "waiting_for_observation":
      return "waiting";
    case "verified":
      return "completed";
    case "dismissed":
    case "not_applicable":
      return null;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function queueStatusForTask(state: TaskState): WorkStatus {
  switch (state) {
    case "suggested":
    case "accepted":
    case "reopened":
      return "ready";
    case "in_progress":
    case "submitted":
      return "in-progress";
    case "waiting_for_observation":
      return "waiting";
    case "verified":
      return "completed";
    case "dismissed":
    case "not_applicable":
      return "not-measured";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function iconForTaskType(type: TaskType): "doc" | "map" | "chart" | "globe" | "facts" {
  switch (type) {
    case "repair_confirmed_access_or_factual_fault":
      return "doc";
    case "improve_page_for_buyer_need":
      return "map";
    case "review_results_and_record_decision":
    case "complete_visibility_experiment":
    case "establish_measurement_baseline":
      return "chart";
    case "complete_earned_media_or_community_work":
      return "globe";
    case "approve_essential_brand_facts":
    case "approve_buyer_question_set":
      return "facts";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function completionRuleText(
  type: TaskType,
  required: readonly string[] | undefined,
): WorkValue<string> {
  if (!required || required.length === 0) {
    return notMeasured("The completion rule is not available.");
  }
  if (type === "repair_confirmed_access_or_factual_fault" && required.includes("fault_repair")) {
    return measured("We check the page update. You confirm business accuracy.");
  }
  return notMeasured("The completion rule is not available for this task view.");
}
