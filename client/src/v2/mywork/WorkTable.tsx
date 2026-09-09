import { AlertCircle, Check, ChevronRight, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TASK_ICONS, TRIGGERS, formatEffortCompact } from "../data/taskVocabulary";
import type { WorkSummaryView, WorkTaskSummaryView } from "../data/workSummary";
import {
  STATE_LABELS,
  TAB_EMPTY_COPY,
  TAB_LABELS,
  TAB_ORDER,
  type TabId,
  type TaskBuckets,
} from "./taskBuckets";

// The task list.
//
// The artboard draws the To do tab: a four-column table, then the other three
// buckets summarised beneath it, then the progress line. Those trailing
// sections are a summary OF THE OTHER TABS, so they render on the To do tab
// only - repeating "In progress" underneath the In progress table would show
// the same rows twice and make the tab meaningless.

function TaskTile({ type }: { type: WorkTaskSummaryView["type"] }) {
  const Icon = TASK_ICONS[type];
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-vc-muted text-vc-secondary"
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function Trigger({ type }: { type: WorkTaskSummaryView["type"] }) {
  const trigger = TRIGGERS[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption ${
        trigger.alarming ? "text-destructive" : "text-vc-secondary"
      }`}
      data-trigger={trigger.alarming ? "fault" : "opportunity"}
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {trigger.label}
    </span>
  );
}

const GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,13rem)_4.5rem_3.5rem] items-center gap-4";

function Tabs({
  buckets,
  active,
  onSelect,
}: {
  buckets: TaskBuckets;
  active: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <div className="mt-5 flex items-center gap-6 border-b border-vc-default" role="tablist">
      {TAB_ORDER.map((tab) => {
        const selected = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`v2-work-tab-${tab}`}
            onClick={() => onSelect(tab)}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-body transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40 ${
              selected
                ? "border-vc-accent font-medium text-vc-accent"
                : "border-transparent text-vc-secondary hover:text-vc-primary"
            }`}
          >
            {TAB_LABELS[tab]}
            <span
              className={`rounded-full px-1.5 py-0.5 text-data tabular-nums ${
                selected ? "bg-vc-accent-subtle text-vc-accent" : "bg-vc-muted text-vc-secondary"
              }`}
            >
              {buckets[tab].length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: WorkTaskSummaryView;
  selected: boolean;
  onSelect: () => void;
}) {
  const effort = formatEffortCompact(task.effort);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      data-testid="v2-work-row"
      className={`${GRID} w-full border-b border-vc-default px-2 py-3 text-left transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40 ${
        selected ? "bg-vc-accent-subtle/60" : "hover:bg-vc-muted/40"
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <TaskTile type={task.type} />
        <span className="min-w-0 truncate text-body font-medium text-vc-primary">{task.title}</span>
      </span>
      <span className="min-w-0 truncate">
        <Trigger type={task.type} />
      </span>
      {/* An absent effort renders nothing rather than a guess. */}
      <span className="text-caption tabular-nums text-vc-secondary">{effort ?? ""}</span>
      <span className="justify-self-end rounded-full bg-vc-accent-subtle px-2 py-0.5 text-data font-medium tabular-nums text-vc-accent">
        {task.points}
      </span>
    </button>
  );
}

function TableHead() {
  return (
    <div
      className={`${GRID} border-b border-vc-default px-2 pb-2 text-data font-medium tracking-wide text-vc-tertiary uppercase`}
    >
      <span>Task</span>
      <span>Evidence</span>
      <span>Effort</span>
      <span className="justify-self-end">Points</span>
    </div>
  );
}

/** One of the summary rows under the table: a task from another bucket, with
 *  the one fact that bucket is about. */
function SummaryRow({
  task,
  note,
  trailing,
}: {
  task: WorkTaskSummaryView;
  note: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 border-b border-vc-default py-3"
      data-testid="v2-work-summary-row"
    >
      <TaskTile type={task.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-vc-primary">{task.title}</p>
        {task.ownerName && <p className="text-caption text-vc-tertiary">Owner: {task.ownerName}</p>}
      </div>
      <div className="shrink-0 text-caption text-vc-secondary">{note}</div>
      {trailing}
      <Link
        to="/v2/my-work"
        search={{ task: task.id }}
        className="shrink-0 text-caption font-medium text-vc-accent hover:underline"
      >
        Open
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-data font-medium tracking-wide text-vc-tertiary uppercase">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function WorkTable({
  buckets,
  activeTab,
  onTab,
  selectedId,
  onSelectTask,
  summary,
  truncated,
}: {
  buckets: TaskBuckets;
  activeTab: TabId;
  onTab: (tab: TabId) => void;
  selectedId: string | undefined;
  onSelectTask: (taskId: string) => void;
  summary: WorkSummaryView | undefined;
  truncated: boolean;
}) {
  const rows = buckets[activeTab];

  return (
    <div data-testid="v2-my-work-list">
      <h1 className="text-metric font-semibold leading-tight text-vc-primary">
        Turn findings into verified work
      </h1>
      <p className="mt-1 text-body text-vc-secondary">
        Choose a task, record the change, and check the result.
      </p>

      <Tabs buckets={buckets} active={activeTab} onSelect={onTab} />

      <div className="mt-4">
        <TableHead />
        {rows.length === 0 ? (
          <p className="py-6 text-body text-vc-secondary" data-testid="v2-work-tab-empty">
            {TAB_EMPTY_COPY[activeTab]}
          </p>
        ) : (
          rows.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={task.id === selectedId}
              onSelect={() => onSelectTask(task.id)}
            />
          ))
        )}
      </div>

      {truncated && (
        <p className="mt-3 text-caption text-vc-tertiary" data-testid="v2-work-truncated">
          Showing the first 100 tasks for this brand. The counts above cover those tasks only.
        </p>
      )}

      {activeTab === "todo" && (
        <>
          {buckets.in_progress.length > 0 && (
            <Section title="In progress">
              {buckets.in_progress.map((task) => (
                <SummaryRow key={task.id} task={task} note={STATE_LABELS[task.state]} />
              ))}
            </Section>
          )}

          {buckets.waiting.length > 0 && (
            <Section title="Waiting for observation">
              {buckets.waiting.map((task) => (
                <SummaryRow
                  key={task.id}
                  task={task}
                  note={
                    <span className="inline-flex items-center gap-1.5 text-vc-accent">
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Work verified · {task.points} points awarded
                    </span>
                  }
                  trailing={
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-caption text-vc-tertiary">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Next measurement pending
                    </span>
                  }
                />
              ))}
            </Section>
          )}

          {buckets.completed.length > 0 && (
            <Section title="Recently completed">
              {buckets.completed.slice(0, 4).map((task) => (
                <SummaryRow
                  key={task.id}
                  task={task}
                  note={
                    <span className="font-medium tabular-nums text-vc-accent">+{task.points}</span>
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => onTab("completed")}
                className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-vc-accent hover:underline"
              >
                View all completed
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Section>
          )}
        </>
      )}

      {/* Closed without the work being done. Listed under Completed so they
          are visible, and kept out of its count so "Completed" keeps meaning
          verified work. */}
      {activeTab === "completed" && buckets.closed.length > 0 && (
        <Section title="Closed without completion">
          {buckets.closed.map((task) => (
            <SummaryRow key={task.id} task={task} note={STATE_LABELS[task.state]} />
          ))}
        </Section>
      )}

      {summary && (
        <p
          className="mt-8 border-t border-vc-default pt-4 text-caption text-vc-tertiary"
          data-testid="v2-work-progress-line"
        >
          Private brand progress ·{" "}
          <span className="font-medium text-vc-accent">
            Level {summary.currentLevel.level} {summary.currentLevel.name}
          </span>{" "}
          · <span className="tabular-nums">{summary.points}</span> work points
        </p>
      )}
    </div>
  );
}
