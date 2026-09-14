import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { TaskState } from "@shared/work";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { Panel } from "@/v2/shared/ui/Panel";
import { PointsPill } from "@/v2/shared/ui/PointsPill";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { UnderlineTabs, type UnderlineTab } from "@/v2/shared/ui/UnderlineTabs";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { WorkOwner, WorkTaskIdentity, WorkValueText, type WorkValue } from "./shared/WorkRowParts";

export type Board03TaskState = "todo" | "in-progress" | "waiting" | "completed";

export type Board03TaskDetail = {
  rationale: WorkValue<string>;
  oldValue: WorkValue<string>;
  approvedValue: WorkValue<string>;
  sourcePath: WorkValue<string>;
  sourceUrl: WorkValue<string>;
  completionRule: WorkValue<string>;
};

export type Board03Task = {
  id: string;
  title: string;
  icon: "doc" | "map" | "chart" | "globe" | "facts";
  state: Board03TaskState;
  /** The task's real server state, not the four-bucket UI state above -
   *  `TaskActions`-style commands are only offered when it permits them. */
  rawState: TaskState;
  revision: number;
  evidenceLabel: WorkValue<string>;
  effortMinutes: WorkValue<number>;
  points: WorkValue<number>;
  owner: WorkValue<string>;
  rowNote: WorkValue<string>;
  action: { kind: "open-draft"; label: string } | { kind: "chevron" } | { kind: "none" };
  detail: Board03TaskDetail;
};

/** The task states `mark_not_applicable` still accepts - mirrors
 *  `TRANSITIONS` in `server/domains/work/policy.ts`. A control the server
 *  would reject is not drawn, so this list has to keep pace with that one,
 *  not invent its own. */
const CAN_MARK_NOT_APPLICABLE = new Set<TaskState>([
  "suggested",
  "accepted",
  "in_progress",
  "reopened",
]);

export type Board03CompletedRow = {
  id: string;
  title: string;
  icon: "chart" | "facts";
  points: WorkValue<number>;
};

export type Board03Data = {
  brandId: string;
  mode: "guided" | "expert";
  taskCounts: {
    todo: WorkValue<number>;
    inProgress: WorkValue<number>;
    waiting: WorkValue<number>;
    completed: WorkValue<number>;
  };
  tasks: Board03Task[];
  completedPreview: Board03CompletedRow[];
  progress: {
    level: WorkValue<number>;
    levelName: WorkValue<string>;
    workPoints: WorkValue<number>;
  };
  selectedTaskId: string;
};

type Board03Tab = "todo" | "in-progress" | "waiting" | "completed";

const tabItems: readonly UnderlineTab[] = [
  { value: "todo", label: "To do" },
  { value: "in-progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
];

function isBoard03Tab(value: string): value is Board03Tab {
  switch (value) {
    case "todo":
    case "in-progress":
    case "waiting":
    case "completed":
      return true;
    default:
      return false;
  }
}

function countValue(value: WorkValue<number>): ReactNode {
  return value.kind === "measured" ? value.value : <StateLabel state="not-measured" />;
}

function tabCountKey(value: string): "todo" | "inProgress" | "waiting" | "completed" {
  switch (value) {
    case "todo":
      return "todo";
    case "in-progress":
      return "inProgress";
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    default:
      return "todo";
  }
}

function EvidenceValue({ value }: { value: WorkValue<string> }) {
  if (value.kind === "not-measured") return <WorkValueText value={value} />;
  const tone = value.value.toLowerCase().includes("conflict") ? "var(--v2-bad)" : "var(--v2-ok)";
  const icon = value.value.toLowerCase().includes("conflict") ? "warn" : "check";
  return (
    <span className={`${v2Type.meta} inline-flex items-center gap-1.5`} style={{ color: tone }}>
      <V2Icon name={icon} size={14} />
      {value.value}
    </span>
  );
}

function TaskTable({
  selectedId,
  tasks,
  onSelect,
}: {
  selectedId: string;
  tasks: readonly Board03Task[];
  onSelect: (task: Board03Task) => void;
}) {
  const columns: readonly DataColumn<Board03Task>[] = [
    {
      key: "title",
      header: "Task",
      className: "w-[42%]",
      render: (task) => (
        <span data-board03-selected={task.id === selectedId ? "true" : undefined}>
          <WorkTaskIdentity icon={task.icon} selected={task.id === selectedId} title={task.title} />
        </span>
      ),
    },
    {
      key: "evidenceLabel",
      header: "Evidence",
      render: (task) => <EvidenceValue value={task.evidenceLabel} />,
    },
    {
      key: "effortMinutes",
      header: "Effort",
      numeric: true,
      className: "whitespace-nowrap",
      render: (task) => (
        <WorkValueText
          value={task.effortMinutes}
          format={(minutes) => `${minutes} min`}
          className={v2Type.num}
        />
      ),
    },
    {
      key: "points",
      header: "Points",
      numeric: true,
      className: "whitespace-nowrap",
      render: (task) =>
        task.points.kind === "measured" ? (
          <PointsPill points={task.points.value} />
        ) : (
          <WorkValueText value={task.points} />
        ),
    },
  ];

  return (
    <DataTable
      className="mt-4 [&_tbody_tr:has([data-board03-selected=true])]:bg-[var(--v2-brand-soft)]"
      columns={columns}
      emptyMessage="No tasks are in this state."
      onRowClick={onSelect}
      rowKey={(task) => task.id}
      rows={tasks}
    />
  );
}

function SummaryRow({
  task,
  data,
  onSelect,
}: {
  task: Board03Task;
  data: Board03Data;
  onSelect: (task: Board03Task) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 border-t border-[var(--v2-line)] px-0 py-3 text-left"
      onClick={() => onSelect(task)}
    >
      <WorkTaskIdentity
        compact
        icon={task.icon}
        meta={
          task.state === "in-progress" ? (
            <span className={`${v2Type.meta} mt-0.5 block`}>
              Owner: <WorkOwner owner={task.owner} className="text-[12px]" />
            </span>
          ) : undefined
        }
        title={task.title}
      />
      <div className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-4">
        {task.state === "in-progress" ? <EvidenceValue value={task.evidenceLabel} /> : null}
        {task.state === "waiting" ? <EvidenceValue value={task.evidenceLabel} /> : null}
        {task.state === "waiting" ? (
          <WorkValueText value={task.rowNote} className={v2Type.meta} />
        ) : null}
        {task.action.kind === "open-draft" ? (
          <Link
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[color:var(--v2-brand)] hover:underline"
            onClick={(event) => event.stopPropagation()}
            params={{ taskId: task.id }}
            search={{ brandId: data.brandId, mode: data.mode }}
            to="/v2/my-work/tasks/$taskId"
          >
            {task.action.label}
            <V2Icon name="chev" size={14} />
          </Link>
        ) : task.action.kind === "chevron" ? (
          <V2Icon name="chev" size={14} className="text-[color:var(--v2-ink3)]" />
        ) : null}
      </div>
    </button>
  );
}

function CompletedRow({ row, onSelect }: { row: Board03CompletedRow; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 border-t border-[var(--v2-line)] px-0 py-2.5 text-left"
      onClick={onSelect}
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]"
      >
        <V2Icon name={row.icon} size={13} />
      </span>
      <span className={`${v2Type.body} min-w-0 flex-1`}>{row.title}</span>
      {row.points.kind === "measured" ? (
        <span className={`${v2Type.num} font-semibold text-[color:var(--v2-ok)]`}>
          +{row.points.value}
        </span>
      ) : (
        <WorkValueText value={row.points} />
      )}
    </button>
  );
}

export type Board03NotApplicableAction = {
  pendingTaskId: string | undefined;
  error: string | undefined;
  run: (task: Board03Task, reason: string) => void;
};

function NotApplicableControl({
  task,
  action,
}: {
  task: Board03Task;
  action: Board03NotApplicableAction;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const pending = action.pendingTaskId === task.id;

  if (!CAN_MARK_NOT_APPLICABLE.has(task.rawState)) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="text-[12.5px] text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
        onClick={() => setOpen(true)}
      >
        Not applicable
      </button>
    );
  }

  return (
    <div className="w-full" data-testid="board03-not-applicable">
      <label className={`${v2Type.meta} block`} htmlFor="board03-not-applicable-reason">
        Why doesn&apos;t this apply? Recorded with the task.
      </label>
      <textarea
        id="board03-not-applicable-reason"
        className="mt-1 w-full rounded-[7px] border border-[var(--v2-line)] bg-[var(--v2-paper)] px-2 py-1.5 text-[13px] text-[color:var(--v2-ink)]"
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        value={reason}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          className="text-[12.5px] font-semibold text-[color:var(--v2-brand)] disabled:opacity-50"
          disabled={reason.trim().length === 0 || pending}
          onClick={() => {
            action.run(task, reason.trim());
            setOpen(false);
            setReason("");
          }}
        >
          {pending ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          className="text-[12.5px] text-[color:var(--v2-ink3)]"
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
        >
          Cancel
        </button>
      </div>
      {action.error ? (
        <p className="mt-1 text-[12px] text-[color:var(--v2-bad)]">{action.error}</p>
      ) : null}
    </div>
  );
}

function TaskRail({
  task,
  data,
  notApplicable,
}: {
  task: Board03Task;
  data: Board03Data;
  notApplicable: Board03NotApplicableAction;
}) {
  const [showRationale, setShowRationale] = useState(true);
  const detail = task.detail;
  return (
    <div className="min-w-0" data-testid="board03-task-rail">
      <h2 className={v2Type.sectionTitle}>{task.title}</h2>
      <button
        type="button"
        aria-expanded={showRationale}
        className="mt-5 text-left text-[13px] font-semibold text-[color:var(--v2-ink)]"
        onClick={() => setShowRationale((open) => !open)}
      >
        Why this task?
      </button>
      {showRationale ? (
        <WorkValueText value={detail.rationale} className={`${v2Type.body} mt-1 block`} />
      ) : null}

      <section className="mt-5" aria-labelledby="board03-evidence-heading">
        <h3 id="board03-evidence-heading" className={v2Type.label}>
          Evidence
        </h3>
        <div className="mt-2 grid grid-cols-[74px_minmax(0,1fr)] gap-x-3 gap-y-2">
          <span className={v2Type.caps}>Old</span>
          <WorkValueText value={detail.oldValue} className={v2Type.body} />
          <span className={`${v2Type.caps} text-[color:var(--v2-brand)]`}>Approved</span>
          <WorkValueText value={detail.approvedValue} className={`${v2Type.body} font-semibold`} />
          <span className={v2Type.caps}>Source</span>
          {detail.sourcePath.kind === "measured" && detail.sourceUrl.kind === "measured" ? (
            <a
              className="text-[12.5px] font-semibold text-[color:var(--v2-brand)] hover:underline"
              href={detail.sourceUrl.value}
              rel="noreferrer"
              target="_blank"
            >
              {detail.sourcePath.value}
            </a>
          ) : (
            <WorkValueText value={detail.sourcePath} />
          )}
        </div>
      </section>

      <section className="mt-5" aria-labelledby="board03-completion-heading">
        <h3 id="board03-completion-heading" className={v2Type.label}>
          Completion rule
        </h3>
        <WorkValueText value={detail.completionRule} className={`${v2Type.body} mt-1 block`} />
      </section>

      <Button asChild className="mt-5 h-10 w-full rounded-lg text-[13.5px]">
        <Link
          params={{ taskId: task.id }}
          search={{ brandId: data.brandId, mode: data.mode }}
          to="/v2/my-work/tasks/$taskId"
        >
          Open task
        </Link>
      </Button>
      <div className="mt-4 flex flex-wrap gap-5">
        <NotApplicableControl action={notApplicable} task={task} />
      </div>
      <div className="mt-6 border-t border-[var(--v2-line)] pt-4">
        <p className="flex items-start gap-2 text-[12.5px] font-semibold text-[color:var(--v2-brand)]">
          <V2Icon name="star" size={15} className="mt-0.5 shrink-0" />
          <span>
            {task.points.kind === "measured" ? (
              task.points.value
            ) : (
              <StateLabel state="not-measured" />
            )}{" "}
            points after verification · Awarded once
          </span>
        </p>
        <p className={`${v2Type.meta} mt-2`}>No points for clicks, drafts, generated content.</p>
      </div>
    </div>
  );
}

function ProgressLine({ progress }: { progress: Board03Data["progress"] }) {
  const level = progress.level.kind === "measured" ? `Level ${progress.level.value}` : null;
  const levelName = progress.levelName.kind === "measured" ? progress.levelName.value : null;
  const points =
    progress.workPoints.kind === "measured" ? `${progress.workPoints.value} work points` : null;
  if (level && levelName && points) {
    return (
      <>
        <span className="font-semibold text-[color:var(--v2-brand)]">
          {level} {levelName}
        </span>{" "}
        · <span className="font-mono tabular-nums">{points}</span>
      </>
    );
  }
  return <StateLabel state="not-measured" />;
}

const NOOP_NOT_APPLICABLE: Board03NotApplicableAction = {
  pendingTaskId: undefined,
  error: undefined,
  run: () => {},
};

export function Board03Screen({
  data,
  notApplicable = NOOP_NOT_APPLICABLE,
}: V2ScreenProps<Board03Data> & { notApplicable?: Board03NotApplicableAction }) {
  const [tab, setTab] = useState<Board03Tab>("todo");
  const [selectedId, setSelectedId] = useState(data.selectedTaskId);
  const visibleTasks = data.tasks.filter((task) => task.state === tab);
  const selectedTask = data.tasks.find((task) => task.id === selectedId) ?? data.tasks[0];

  if (!selectedTask) {
    return (
      <div className="min-h-full p-7 text-[14px] leading-[1.5]" data-testid="board03-empty">
        <Panel padding="spacious">
          <p className={v2Type.body}>No work tasks are available.</p>
        </Panel>
      </div>
    );
  }

  const tabs = tabItems.map((item) => ({
    ...item,
    count: countValue(data.taskCounts[tabCountKey(item.value)]),
  }));

  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board03-screen"
    >
      <TwoColumn
        className="min-h-full gap-0"
        main={
          <div className="min-w-0 px-7 py-6">
            <PageHeader
              title="Turn findings into verified work"
              sub="Choose a task, record the change, and check the result."
            />
            <UnderlineTabs
              className="mt-6"
              items={tabs}
              onChange={(value) => {
                if (isBoard03Tab(value)) {
                  setTab(value);
                  const first = data.tasks.find((task) => task.state === value);
                  if (first) setSelectedId(first.id);
                }
              }}
              value={tab}
            />
            <TaskTable
              selectedId={selectedId}
              tasks={visibleTasks}
              onSelect={(task) => setSelectedId(task.id)}
            />

            {tab === "todo" ? (
              <div className="mt-6">
                <h2 className={v2Type.caps}>In progress</h2>
                {data.tasks
                  .filter((task) => task.state === "in-progress")
                  .map((task) => (
                    <SummaryRow
                      key={task.id}
                      data={data}
                      onSelect={setSelectedIdTask(setSelectedId)}
                      task={task}
                    />
                  ))}
                <h2 className="mt-5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[color:var(--v2-ink3)]">
                  Waiting for observation
                </h2>
                {data.tasks
                  .filter((task) => task.state === "waiting")
                  .map((task) => (
                    <SummaryRow
                      key={task.id}
                      data={data}
                      onSelect={setSelectedIdTask(setSelectedId)}
                      task={task}
                    />
                  ))}
                <h2 className="mt-5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[color:var(--v2-ink3)]">
                  Recently completed
                </h2>
                {data.completedPreview.map((row) => (
                  <CompletedRow key={row.id} onSelect={() => setSelectedId(row.id)} row={row} />
                ))}
                <button
                  type="button"
                  className="mt-2 inline-flex text-[12.5px] font-semibold text-[color:var(--v2-brand)] hover:underline"
                  onClick={() => {
                    setTab("completed");
                    const first = data.tasks.find((task) => task.state === "completed");
                    if (first) setSelectedId(first.id);
                  }}
                >
                  View all completed ›
                </button>
              </div>
            ) : null}

            <p className="mt-6 border-t border-[var(--v2-line)] pt-4 text-[12px] text-[color:var(--v2-ink3)]">
              Private brand progress · <ProgressLine progress={data.progress} />
            </p>
          </div>
        }
        rightRail={
          <div className="border-t border-[var(--v2-line)] px-6 py-6 md:border-t-0 md:border-l">
            <TaskRail data={data} notApplicable={notApplicable} task={selectedTask} />
          </div>
        }
        rightRailWidth={322}
      />
    </div>
  );
}

function setSelectedIdTask(setSelectedId: (id: string) => void) {
  return (task: Board03Task) => setSelectedId(task.id);
}
