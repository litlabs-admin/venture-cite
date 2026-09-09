import type { TaskState } from "@shared/work";
import type { WorkTaskSummaryView } from "../data/workSummary";

// THE TAB MAPPING. The artboard draws four tabs; the service has nine states
// (`shared/work.ts`). The mapping below is deliberate, and this comment is the
// place it is written down.
//
//   To do        <- suggested, accepted, reopened
//                   Nothing has been started. `accepted` sits here rather than
//                   in "In progress" because accepting a task is agreeing to
//                   do it, not doing it: `TRANSITIONS` in
//                   `server/domains/work/policy.ts` still requires `start`
//                   before any work can be submitted.
//   In progress  <- in_progress, submitted
//                   Work is under way, or it is done and waiting for the
//                   person to confirm it. `submitted` is the only state from
//                   which `verifyTask` will accept a confirmation, so it is
//                   the state the confirmation gate is drawn for - and it
//                   belongs with the work, not with the finished pile.
//   Waiting      <- waiting_for_observation
//                   Verified and awarded; the next measurement has not run.
//   Completed    <- verified
//                   Verified this cycle. `verified` is the state a task holds
//                   between the award and the observation window opening.
//
// `dismissed` and `not_applicable` are in NO tab. They were closed WITHOUT the
// work being done, and folding them into "Completed" would inflate a count the
// product uses to mean verified work. They are listed under the Completed tab
// in their own labelled group, so they are visible without being counted as
// completions.

export type TabId = "todo" | "in_progress" | "waiting" | "completed";

export const TAB_STATES: Readonly<Record<TabId, readonly TaskState[]>> = {
  todo: ["suggested", "accepted", "reopened"],
  in_progress: ["in_progress", "submitted"],
  waiting: ["waiting_for_observation"],
  completed: ["verified"],
};

/** Closed without the work being done. Shown, never counted as completed. */
export const CLOSED_STATES: readonly TaskState[] = ["dismissed", "not_applicable"];

export const TAB_ORDER: readonly TabId[] = ["todo", "in_progress", "waiting", "completed"];

export const TAB_LABELS: Readonly<Record<TabId, string>> = {
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
};

/** What each tab says when it holds nothing. Never a zero, never a blank
 *  frame: each sentence names the state the user is actually in. */
export const TAB_EMPTY_COPY: Readonly<Record<TabId, string>> = {
  todo: "Nothing is waiting on you. New tasks appear here as findings arrive.",
  in_progress: "No task has been started yet. Open a task from To do to begin.",
  waiting: "Nothing is waiting on a measurement yet.",
  completed: "No work has been verified yet.",
};

export type TaskBuckets = Record<TabId, WorkTaskSummaryView[]> & {
  closed: WorkTaskSummaryView[];
};

export function bucketTasks(tasks: readonly WorkTaskSummaryView[]): TaskBuckets {
  const buckets: TaskBuckets = {
    todo: [],
    in_progress: [],
    waiting: [],
    completed: [],
    closed: [],
  };
  for (const task of tasks) {
    const tab = TAB_ORDER.find((id) => TAB_STATES[id].includes(task.state));
    if (tab) buckets[tab].push(task);
    else if (CLOSED_STATES.includes(task.state)) buckets.closed.push(task);
  }
  return buckets;
}

/** The state, in the words the screen uses for it. One sentence per state, so
 *  no screen has to translate an enum on the fly. */
export const STATE_LABELS: Readonly<Record<TaskState, string>> = {
  suggested: "Suggested",
  accepted: "Accepted",
  in_progress: "In progress",
  submitted: "Awaiting your confirmation",
  verified: "Verified",
  waiting_for_observation: "Waiting for observation",
  dismissed: "Dismissed",
  not_applicable: "Not applicable",
  reopened: "Reopened",
};
