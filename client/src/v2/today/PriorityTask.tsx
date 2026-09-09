import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskType } from "@shared/work";
import { TASK_ICONS, TRIGGERS, formatEffort } from "../data/taskVocabulary";
import type { WorkTaskSummaryView } from "../data/workSummary";

// The lead task, and the ranked rows under it.
//
// THE TASK LEADS AND THE NUMBER FOLLOWS. This block sits at the top of the
// screen and carries the largest type on it; the visibility percentage lives
// further down at body weight inside its own section. That ordering is the
// screen's whole argument - the work is the subject, the measurement is the
// evidence - so promoting the percentage to a display number here would
// invert it.
//
// The icon, the trigger phrase and the effort wording come from
// `data/taskVocabulary.ts`, shared with My work: the two screens show the same
// tasks and must call them the same things.

function TaskTile({ type, size = "lg" }: { type: TaskType; size?: "lg" | "sm" }) {
  const Icon = TASK_ICONS[type];
  const box = size === "lg" ? "h-9 w-9" : "h-8 w-8";
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-md bg-vc-muted text-vc-secondary`}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function PointsPill({ points, unit }: { points: number; unit: string }) {
  return (
    <span className="shrink-0 rounded-full bg-vc-accent-subtle px-2 py-0.5 text-data font-medium text-vc-accent">
      {points} {unit}
    </span>
  );
}

export function PriorityTask({ task }: { task: WorkTaskSummaryView }) {
  const [explained, setExplained] = useState(false);
  const trigger = TRIGGERS[task.type];
  const effort = formatEffort(task.effort);

  return (
    <section className="border-b border-vc-default pb-6" aria-labelledby="v2-priority-task-title">
      <div className="flex items-start gap-3">
        <TaskTile type={task.type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2
              id="v2-priority-task-title"
              className="text-section font-semibold text-vc-primary"
              data-testid="v2-priority-title"
            >
              {task.title}
            </h2>
            <PointsPill points={task.points} unit="work points" />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption">
            <span
              className={`inline-flex items-center gap-1.5 ${
                trigger.alarming ? "text-destructive" : "text-vc-secondary"
              }`}
              data-trigger={trigger.alarming ? "fault" : "opportunity"}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {trigger.label}
            </span>
            {effort && (
              <span className="inline-flex items-center gap-1.5 text-vc-secondary">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {effort}
              </span>
            )}
          </div>

          {/* The board shows two lines because they say different things - what
              was observed, then what to change. Several derived task types set
              `reason` and `recommendedChange` to the same sentence, and
              printing it twice reads as a rendering fault rather than as
              emphasis, so the duplicate is dropped. */}
          <div className="mt-3 space-y-0.5 text-body text-vc-secondary">
            {task.reason && <p>{task.reason}</p>}
            {task.recommendedChange && task.recommendedChange !== task.reason && (
              <p>{task.recommendedChange}</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* The shipped `default` variant already rests as a tint and
                fills on hover. Used unmodified - no bg-* through className. */}
            <Button size="sm">Review evidence</Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-vc-accent"
              aria-expanded={explained}
              aria-controls="v2-priority-why"
              onClick={() => setExplained((open) => !open)}
            >
              Why this task?
            </Button>
          </div>

          {explained && (
            <div
              id="v2-priority-why"
              className="mt-3 rounded-md bg-vc-muted/60 px-3 py-2.5 text-body text-vc-secondary"
            >
              <p>{task.desiredResult}</p>
              {task.buyerNeed && (
                <p className="mt-1">
                  <span className="text-vc-tertiary">Buyer need: </span>
                  {task.buyerNeed}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A ranked row under the lead task.
 *
 * It expands in place rather than navigating: the row's own summary answers
 * "what is this?" without leaving Today. The expanded panel then offers the
 * one link that does leave - the task's own page under My work.
 * The chevron rotates so the affordance still reads as "there is more here".
 */
export function QueuedTaskRow({ task }: { task: WorkTaskSummaryView }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-vc-default">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="v2-queued-task"
        className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-vc-muted/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
      >
        <TaskTile type={task.type} size="sm" />
        <span className="min-w-0 truncate text-body font-medium text-vc-primary">{task.title}</span>
        <PointsPill points={task.points} unit="points" />
        <ChevronRight
          className={`ml-auto h-4 w-4 shrink-0 text-vc-tertiary transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="pb-4 pl-11">
          <p className="text-body text-vc-secondary">{task.recommendedChange}</p>
          <Link
            to="/v2/my-work"
            search={{ task: task.id }}
            className="mt-2 inline-block text-caption font-medium text-vc-accent hover:underline"
          >
            Open task
          </Link>
        </div>
      )}
    </div>
  );
}
