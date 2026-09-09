import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TaskState } from "@shared/work";
import { useTaskCommand, type TaskCommand } from "../data/workTasks";
import type { WorkTaskSummaryView } from "../data/workSummary";

// The state transitions a task can actually take, and the controls for them.
//
// THE TABLE BELOW MIRRORS `TRANSITIONS` in `server/domains/work/policy.ts`. A
// control the server would reject is not offered: a button that fails on click
// teaches the user that the screen is guessing. Where the artboard draws a
// control the service has no endpoint for - "Assign task" - it is not drawn
// here either, because there is no assignment API and a decorative one would
// be the same lie the confirmation gate exists to prevent.
//
// `submit` is deliberately absent. It requires an evidence bundle
// (`validateEvidenceForTask`) whose ids come from the systems that made the
// change - a scrape check, a content change record. This screen cannot invent
// one, so it says what is needed rather than offering a button that cannot
// work.
const AVAILABLE: Readonly<Record<TaskState, readonly TaskCommand["kind"][]>> = {
  suggested: ["accept", "mark_not_applicable", "dismiss"],
  accepted: ["start", "mark_not_applicable", "dismiss"],
  in_progress: ["mark_not_applicable", "dismiss"],
  submitted: [],
  verified: [],
  waiting_for_observation: ["reopen"],
  dismissed: [],
  not_applicable: [],
  reopened: ["start", "mark_not_applicable", "dismiss"],
};

const LABELS: Readonly<Record<TaskCommand["kind"], string>> = {
  accept: "Accept task",
  start: "Start task",
  dismiss: "Dismiss",
  mark_not_applicable: "Not applicable",
  reopen: "Reopen",
};

/** The commands the server requires a written reason for. */
const NEEDS_REASON: readonly TaskCommand["kind"][] = ["dismiss", "mark_not_applicable", "reopen"];

export function TaskActions({
  brandId,
  task,
  primary,
}: {
  brandId: string;
  task: WorkTaskSummaryView;
  /** Rendered before the state commands - the screen's own primary control. */
  primary?: React.ReactNode;
}) {
  const [reasonFor, setReasonFor] = useState<TaskCommand["kind"] | null>(null);
  const [reason, setReason] = useState("");
  const mutation = useTaskCommand(brandId);
  const kinds = AVAILABLE[task.state];

  function run(command: TaskCommand) {
    mutation.mutate({ taskId: task.id, expectedRevision: task.revision, command });
  }

  return (
    <div data-testid="v2-task-actions">
      <div className="flex flex-wrap items-center gap-4">
        {primary}
        {kinds.map((kind) => (
          <Button
            key={kind}
            variant="ghost"
            size="sm"
            className={kind === "accept" || kind === "start" ? "text-vc-accent" : "text-vc-primary"}
            disabled={mutation.isPending}
            onClick={() => {
              if (NEEDS_REASON.includes(kind)) {
                setReasonFor((open) => (open === kind ? null : kind));
                return;
              }
              run({ kind } as TaskCommand);
            }}
          >
            {LABELS[kind]}
          </Button>
        ))}
      </div>

      {reasonFor && (
        <div className="mt-3 rounded-md border border-vc-default p-3">
          <label
            htmlFor="v2-task-reason"
            className="block text-caption font-medium text-vc-primary"
          >
            Why? This is recorded with the task.
          </label>
          <textarea
            id="v2-task-reason"
            value={reason}
            rows={2}
            onChange={(event) => setReason(event.target.value)}
            className="mt-2 w-full rounded-md border border-vc-default bg-vc-surface px-2 py-1.5 text-body text-vc-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button
              size="sm"
              /* The server rejects an empty reason, so the control is closed
                 until there is one rather than failing on submit. */
              disabled={reason.trim().length === 0 || mutation.isPending}
              onClick={() => {
                run({ kind: reasonFor, reason: reason.trim() } as TaskCommand);
                setReasonFor(null);
                setReason("");
              }}
            >
              {LABELS[reasonFor]}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReasonFor(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mutation.isError && (
        <p className="mt-3 text-caption text-destructive" data-testid="v2-task-command-error">
          That change was not saved: {mutation.error.message}
        </p>
      )}
    </div>
  );
}
