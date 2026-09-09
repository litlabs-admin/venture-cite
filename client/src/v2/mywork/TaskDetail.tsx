import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Check, CircleCheck, Clock, ShieldCheck } from "lucide-react";
import type { TaskState } from "@shared/work";
import type { WorkSummaryView } from "../data/workSummary";
import type { WorkTaskDetailView } from "../data/workTasks";
import { completionRuleSentences, evidenceLabel, formatDate } from "./evidence";
import { ConfirmationGate } from "./ConfirmationGate";
import { STATE_LABELS } from "./taskBuckets";
import { TaskActions } from "./TaskActions";

// The task detail.
//
// One screen, three shapes, chosen by the task's state rather than by a
// prop: the work not yet done, the work submitted and waiting on a human
// confirmation (the artboard's gate), and the work finished. The header, the
// step strip and the evidence table are common to all three, so the screen
// never rearranges itself under the reader between visits.

const STEPS = ["Review evidence", "Update your page", "Verify work"] as const;

/** Which of the three steps the task has passed. Read from the state machine,
 *  not from a click count, so a reload cannot lose it. */
function stepProgress(state: TaskState): { done: number; current: number } {
  if (state === "verified" || state === "waiting_for_observation") return { done: 3, current: 3 };
  if (state === "submitted") return { done: 2, current: 3 };
  if (state === "in_progress") return { done: 1, current: 2 };
  if (state === "accepted" || state === "reopened") return { done: 1, current: 2 };
  return { done: 0, current: 1 };
}

function Steps({ state }: { state: TaskState }) {
  const { done, current } = stepProgress(state);
  return (
    <ol className="mt-5 flex items-center gap-3" data-testid="v2-task-steps">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const isDone = number <= done;
        const isCurrent = number === current && !isDone;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden="true"
              data-step={isDone ? "done" : isCurrent ? "current" : "todo"}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-data font-medium ${
                isDone || isCurrent ? "bg-vc-accent text-white" : "bg-vc-muted text-vc-tertiary"
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : number}
            </span>
            <span
              className={`truncate text-body ${
                isDone || isCurrent ? "font-medium text-vc-primary" : "text-vc-tertiary"
              }`}
            >
              {label}
            </span>
            {number < STEPS.length && (
              <span className="h-px min-w-4 flex-1 bg-vc-default" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The artboard's before/after table. "Before" is the evidence that opened the
 *  task; "after" is the evidence recorded against the change. Where the change
 *  has not been recorded the cell says so rather than repeating the before
 *  value, which would read as "nothing changed" instead of "not yet done". */
function BeforeAfter({ task }: { task: WorkTaskDetailView }) {
  const evidence = task.evidence ?? [];
  const before = evidence.filter((item) => item.role === "trigger");
  const after = evidence.filter((item) => item.role !== "trigger");
  if (before.length === 0 && after.length === 0) return null;

  const rows = Math.max(before.length, after.length);
  return (
    <div className="mt-5 overflow-x-auto rounded-md border border-vc-default">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-vc-default">
            <th className="px-4 py-2 text-data font-medium tracking-wide text-vc-tertiary uppercase">
              Evidence
            </th>
            <th className="px-4 py-2 text-data font-medium tracking-wide text-vc-tertiary uppercase">
              Before
            </th>
            <th className="px-4 py-2 text-data font-medium tracking-wide text-vc-tertiary uppercase">
              After
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, index) => {
            const left = before[index];
            const right = after[index];
            const date = formatDate(left?.retrievedAt ?? right?.retrievedAt ?? null);
            return (
              <tr
                key={left?.id ?? right?.id ?? index}
                className="border-b border-vc-default last:border-b-0"
              >
                <td className="px-4 py-3 align-top text-body text-vc-secondary">
                  {left ? evidenceLabel(left) : right ? evidenceLabel(right) : ""}
                  {date && (
                    <span className="mt-0.5 block text-caption text-vc-tertiary">{date}</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-body text-vc-secondary">
                  {left?.excerpt ?? <span className="text-vc-tertiary">Not recorded</span>}
                </td>
                <td className="px-4 py-3 align-top text-body font-medium text-vc-primary">
                  {right?.excerpt ?? (
                    <span className="font-normal text-vc-tertiary">Not recorded yet</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The three states after this screen. Drawn for every task, because the
 *  sequence is the product's argument: work, then measurement, then answers -
 *  and the points are paid at the first, not the last. */
function WhatHappensNext({ checkedOn }: { checkedOn: string | null }) {
  const items = [
    { icon: CircleCheck, title: "Work complete", body: "Your update is recorded." },
    { icon: Clock, title: "Waiting for observation", body: "Our systems monitor the page." },
    { icon: BarChart3, title: "Review answers", body: "We evaluate answer accuracy over time." },
  ];
  return (
    <div className="mt-8 border-t border-vc-default pt-5" data-testid="v2-what-happens-next">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="shrink-0">
          <p className="text-body font-semibold text-vc-primary">What happens next</p>
          {checkedOn && <p className="text-caption text-vc-tertiary">Checked {checkedOn}</p>}
        </div>
        {items.map(({ icon: Icon, title, body }, index) => (
          <div key={title} className="flex min-w-0 items-start gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vc-muted text-vc-secondary"
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-body font-medium text-vc-primary">{title}</p>
              <p className="text-caption text-vc-secondary">{body}</p>
            </div>
            {index < items.length - 1 && (
              <ArrowRight
                className="mt-1.5 h-3.5 w-3.5 shrink-0 text-vc-tertiary"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskDetailRail({
  task,
  summary,
}: {
  task: WorkTaskDetailView;
  summary: WorkSummaryView | undefined;
}) {
  const rules = completionRuleSentences(task.completionRule?.required);
  const awarded = task.state === "verified" || task.state === "waiting_for_observation";

  return (
    <div data-testid="v2-task-detail-rail" className="space-y-6">
      <section>
        <h2 className="flex items-center gap-2 text-section font-semibold text-vc-primary">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md bg-vc-accent-subtle text-vc-accent"
            aria-hidden="true"
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          Completion check
        </h2>
        {rules.map((line) => (
          <p key={line} className="mt-2 text-body text-vc-secondary">
            {line}
          </p>
        ))}
        <p className="mt-3 rounded-md bg-vc-accent-subtle px-3 py-2 text-caption font-medium text-vc-accent">
          {awarded
            ? `${task.points} work points awarded`
            : `${task.points} work points after confirmation`}
        </p>
      </section>

      {summary && (
        <section className="border-t border-vc-default pt-5">
          <h3 className="text-body font-semibold text-vc-primary">Private brand progress</h3>
          <p className="mt-2 text-section font-semibold text-vc-primary">
            Level {summary.currentLevel.level} · {summary.currentLevel.name}
          </p>
          <p className="mt-1 text-body tabular-nums text-vc-secondary">
            {summary.nextThreshold
              ? `${summary.points} of ${summary.nextThreshold.points} work points`
              : `${summary.points} work points`}
          </p>
          {summary.nextThreshold && (
            <p className="mt-1 text-caption text-vc-tertiary">
              Next level: {summary.nextThreshold.name}
            </p>
          )}
        </section>
      )}

      <section className="border-t border-vc-default pt-5">
        <h3 className="text-body font-semibold text-vc-primary">Next: measure the result</h3>
        <p className="mt-1 text-body text-vc-secondary">
          Your work points stay earned while we wait for new observations. Points reward verified
          work; they do not predict visibility.
        </p>
      </section>
    </div>
  );
}

export function TaskDetail({ brandId, task }: { brandId: string; task: WorkTaskDetailView }) {
  const rules = completionRuleSentences(task.completionRule?.required);

  return (
    <div data-testid="v2-task-detail">
      <p className="text-caption text-vc-tertiary">
        <Link to="/v2/my-work" search={{}} className="text-vc-accent hover:underline">
          My work
        </Link>{" "}
        / {STATE_LABELS[task.state]}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-metric font-semibold leading-tight text-vc-primary">{task.title}</h1>
        <span className="shrink-0 rounded-full bg-vc-accent-subtle px-2 py-0.5 text-data font-medium text-vc-accent">
          {task.points} work points
        </span>
      </div>

      <Steps state={task.state} />
      <BeforeAfter task={task} />

      {task.state === "submitted" ? (
        <ConfirmationGate brandId={brandId} task={task} />
      ) : task.state === "verified" || task.state === "waiting_for_observation" ? (
        <section className="mt-6" data-testid="v2-task-complete">
          <p className="flex items-center gap-2 text-body font-medium text-vc-primary">
            <Check className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
            Work verified · {task.points} points awarded
          </p>
          <p className="mt-1 text-body text-vc-secondary">
            {task.state === "waiting_for_observation"
              ? "The next measurement will check whether answers change. Nothing more is needed from you."
              : "The observation window opens with the next measurement."}
          </p>
          <div className="mt-4">
            <TaskActions brandId={brandId} task={task} />
          </div>
        </section>
      ) : task.state === "dismissed" || task.state === "not_applicable" ? (
        <section className="mt-6" data-testid="v2-task-closed">
          <p className="text-body text-vc-secondary">
            This task was closed as {STATE_LABELS[task.state].toLowerCase()}. It was not completed,
            so no points were awarded.
          </p>
        </section>
      ) : (
        <section className="mt-6" data-testid="v2-task-open">
          <h2 className="text-body font-semibold text-vc-primary">What counts as done</h2>
          {rules.map((line) => (
            <p key={line} className="mt-1 text-body text-vc-secondary">
              {line}
            </p>
          ))}
          <p className="mt-3 text-body text-vc-secondary">{task.recommendedChange}</p>
          {/* Submitting the change is not a control on this screen: the
              evidence it requires is written by the systems that make the
              change. Saying so is more honest than a button that fails. */}
          <p className="mt-3 text-caption text-vc-tertiary">
            Make the change on your site. The check that records it runs on its own, and this task
            moves to your confirmation once it has.
          </p>
          <div className="mt-4">
            <TaskActions brandId={brandId} task={task} />
          </div>
        </section>
      )}

      <WhatHappensNext checkedOn={formatDate(task.updatedAt)} />
    </div>
  );
}
