import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { Panel } from "@/v2/shared/ui/Panel";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { UnderlineTabs, type UnderlineTab } from "@/v2/shared/ui/UnderlineTabs";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import {
  WorkOwner,
  WorkStatusLabel,
  WorkTaskIdentity,
  WorkValueText,
  type WorkStatus,
  type WorkValue,
} from "../b03-task-list/shared/WorkRowParts";

export type Board39Task = {
  id: string;
  title: string;
  icon: "doc" | "map" | "chart" | "globe" | "facts";
  evidenceProblem: WorkValue<string>;
  expectedResult: WorkValue<string>;
  estimatedMinutes: WorkValue<number>;
  points: WorkValue<number>;
  ownerName: WorkValue<string>;
  dueDate: WorkValue<string>;
  status: WorkStatus;
  verificationMethod: WorkValue<string>;
};

export type Board39Data = {
  brandId: string;
  mode: "guided" | "expert";
  brandName: string;
  workGoal: WorkValue<string>;
  taskCounts: {
    ready: WorkValue<number>;
    inProgress: WorkValue<number>;
    waiting: WorkValue<number>;
    completed: WorkValue<number>;
  };
  priority: {
    id: WorkValue<string>;
    title: WorkValue<string>;
    points: WorkValue<number>;
  };
  tasks: Board39Task[];
  weeklyCapacity: {
    range: WorkValue<string>;
    plannedMinutes: WorkValue<number>;
    usedMinutes: WorkValue<number>;
  };
  progress: {
    level: WorkValue<number>;
    levelName: WorkValue<string>;
    earnedWorkPoints: WorkValue<number>;
    levelTargetPoints: WorkValue<number>;
  };
  blockerCount: WorkValue<number>;
  waitingVerificationCount: WorkValue<number>;
};

type Board39Tab = "ready" | "in-progress" | "waiting" | "completed";

const tabItems: readonly UnderlineTab[] = [
  { value: "ready", label: "Ready" },
  { value: "in-progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
];

function isBoard39Tab(value: string): value is Board39Tab {
  switch (value) {
    case "ready":
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

function tabCountKey(value: string): "ready" | "inProgress" | "waiting" | "completed" {
  switch (value) {
    case "ready":
      return "ready";
    case "in-progress":
      return "inProgress";
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    default:
      return "ready";
  }
}

function minutes(value: number): string {
  return `${value}m`;
}

function getPercent(used: WorkValue<number>, planned: WorkValue<number>): number | null {
  if (used.kind !== "measured" || planned.kind !== "measured" || planned.value <= 0) return null;
  return (used.value / planned.value) * 100;
}

function levelMark(level: WorkValue<number>) {
  if (level.kind === "not-measured") return <StateLabel state="not-measured" />;
  return (
    <span
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 place-items-center text-[color:var(--v2-brand)] [clip-path:polygon(50%_0%,92%_25%,92%_75%,50%_100%,8%_75%,8%_25%)]"
      style={{ background: "var(--v2-brand-soft)" }}
    >
      <span className="relative grid h-9 w-9 place-items-center border border-[var(--v2-brand)] [clip-path:polygon(50%_0%,92%_25%,92%_75%,50%_100%,8%_75%,8%_25%)]">
        <V2Icon name="star" size={17} />
        <span className="absolute text-[9px] font-semibold">{level.value}</span>
      </span>
    </span>
  );
}

function CapacityValue({ data }: { data: Board39Data["weeklyCapacity"] }) {
  if (data.usedMinutes.kind === "not-measured" || data.plannedMinutes.kind === "not-measured") {
    return (
      <WorkValueText
        value={data.usedMinutes.kind === "not-measured" ? data.usedMinutes : data.plannedMinutes}
      />
    );
  }
  const hours = Math.floor(data.usedMinutes.value / 60);
  const minutesRemaining = data.usedMinutes.value % 60;
  return (
    <span className={v2Type.statBig}>
      {hours}h {minutesRemaining}m
    </span>
  );
}

function Board39Table({
  brandId,
  mode,
  tasks,
}: {
  brandId: string;
  mode: Board39Data["mode"];
  tasks: readonly Board39Task[];
}) {
  const columns: readonly DataColumn<Board39Task>[] = [
    {
      key: "title",
      header: "Task",
      className: "w-[15%]",
      render: (task) => (
        <Link
          className="inline-flex min-w-0 hover:underline"
          params={{ taskId: task.id }}
          search={{ brandId, mode }}
          to="/v2/my-work/tasks/$taskId"
        >
          <WorkTaskIdentity compact icon={task.icon} title={task.title} />
        </Link>
      ),
    },
    {
      key: "evidenceProblem",
      header: "Evidence problem",
      render: (task) => <WorkValueText value={task.evidenceProblem} />,
    },
    {
      key: "expectedResult",
      header: "Expected result",
      render: (task) => <WorkValueText value={task.expectedResult} />,
    },
    {
      key: "estimatedMinutes",
      header: "Time",
      numeric: true,
      wrap: false,
      render: (task) => (
        <WorkValueText value={task.estimatedMinutes} format={minutes} className={v2Type.num} />
      ),
    },
    {
      key: "points",
      header: "Points",
      numeric: true,
      wrap: false,
      render: (task) => <WorkValueText value={task.points} className={v2Type.num} />,
    },
    {
      key: "ownerName",
      header: "Owner",
      wrap: false,
      render: (task) => <WorkOwner owner={task.ownerName} />,
    },
    {
      key: "dueDate",
      header: "Due date",
      wrap: false,
      render: (task) => <WorkValueText value={task.dueDate} className={v2Type.num} />,
    },
    {
      key: "status",
      header: "Status",
      wrap: false,
      render: (task) => <WorkStatusLabel status={task.status} />,
    },
    {
      key: "verificationMethod",
      header: "Verification",
      render: (task) => <WorkValueText value={task.verificationMethod} />,
    },
  ];

  return (
    <DataTable
      className="mt-5"
      columns={columns}
      emptyMessage="No tasks are in this state. Return to Today to find useful work."
      rowKey={(task) => task.id}
      rows={tasks}
    />
  );
}

function CapacityRail({ data }: { data: Board39Data }) {
  const capacityPercent = getPercent(
    data.weeklyCapacity.usedMinutes,
    data.weeklyCapacity.plannedMinutes,
  );
  const progressPercent = getPercent(
    data.progress.earnedWorkPoints,
    data.progress.levelTargetPoints,
  );
  const levelTitle =
    data.progress.level.kind === "measured" && data.progress.levelName.kind === "measured"
      ? `Level ${data.progress.level.value} · ${data.progress.levelName.value}`
      : null;

  return (
    <aside className="min-w-0" aria-label="Work capacity">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={v2Type.sectionTitle}>Your weekly capacity</h2>
        <WorkValueText value={data.weeklyCapacity.range} className={v2Type.meta} />
      </div>
      <div className="mt-2">
        <CapacityValue data={data.weeklyCapacity} />
        <p className={`${v2Type.meta} mt-1`}>
          {data.weeklyCapacity.plannedMinutes.kind === "measured" ? (
            `of ${Math.floor(data.weeklyCapacity.plannedMinutes.value / 60)}h planned`
          ) : (
            <StateLabel state="not-measured" />
          )}
        </p>
      </div>
      {capacityPercent !== null ? (
        <ProgressBar className="mt-3" showValue value={capacityPercent} />
      ) : (
        <div className="mt-3">
          <StateLabel state="not-measured" />
        </div>
      )}

      <section className="mt-6 border-t border-[var(--v2-line)] pt-5">
        <h2 className={v2Type.sectionTitle}>Your progress</h2>
        <div className="mt-3 flex items-center gap-3">
          {levelMark(data.progress.level)}
          <div className="min-w-0">
            <p className={v2Type.bodyStrong}>{levelTitle ?? <StateLabel state="not-measured" />}</p>
            <p className={`${v2Type.meta} mt-0.5`}>
              {data.progress.earnedWorkPoints.kind === "measured" &&
              data.progress.levelTargetPoints.kind === "measured" ? (
                `${data.progress.earnedWorkPoints.value} / ${data.progress.levelTargetPoints.value} work points`
              ) : (
                <StateLabel state="not-measured" />
              )}
            </p>
          </div>
        </div>
        {progressPercent !== null ? (
          <ProgressBar className="mt-3" showValue value={progressPercent} />
        ) : (
          <div className="mt-3">
            <StateLabel state="not-measured" />
          </div>
        )}
      </section>

      <section className="mt-5 border-t border-[var(--v2-line)] pt-4">
        <h3 className={v2Type.label}>Blockers</h3>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.6px] border-[var(--v2-ink3)] text-[color:var(--v2-ink3)]">
            <V2Icon name="warn" size={16} />
          </span>
          <div>
            {data.blockerCount.kind === "measured" && data.blockerCount.value === 0 ? (
              <>
                <p className={v2Type.bodyStrong}>No blockers</p>
                <p className={`${v2Type.meta} mt-0.5`}>You’re all set to make progress.</p>
              </>
            ) : data.blockerCount.kind === "measured" ? (
              <>
                <p className={v2Type.bodyStrong}>{data.blockerCount.value} blockers</p>
                <p className={`${v2Type.meta} mt-0.5`}>Review the blocked tasks.</p>
              </>
            ) : (
              <StateLabel state="not-measured" />
            )}
          </div>
        </div>
      </section>

      <section className="mt-5 border-t border-[var(--v2-line)] pt-4">
        <h3 className={v2Type.label}>Waiting for verification</h3>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center text-[color:var(--v2-ink3)]">
            <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24">
              <path
                d="M6 3.5h12M6 20.5h12M7.5 3.5v3.4c0 2 1.7 3.3 3.4 4.1a1 1 0 0 1 0 1.8c-1.7.8-3.4 2.1-3.4 4.1v3.6M16.5 3.5v3.4c0 2-1.7 3.3-3.4 4.1a1 1 0 0 0 0 1.8c1.7.8 3.4 2.1 3.4 4.1v3.6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </span>
          <div>
            {data.waitingVerificationCount.kind === "measured" &&
            data.waitingVerificationCount.value === 0 ? (
              <>
                <p className={v2Type.bodyStrong}>No tasks waiting</p>
                <p className={`${v2Type.meta} mt-0.5`}>Verified work will show here.</p>
              </>
            ) : data.waitingVerificationCount.kind === "measured" ? (
              <p className={v2Type.bodyStrong}>
                {data.waitingVerificationCount.value} tasks waiting
              </p>
            ) : (
              <StateLabel state="not-measured" />
            )}
          </div>
        </div>
      </section>
      <p className={`${v2Type.meta} mt-5 border-t border-[var(--v2-line)] pt-4`}>
        Points reward verified work only.
      </p>
    </aside>
  );
}

export function Board39Screen({ data }: V2ScreenProps<Board39Data>) {
  const [tab, setTab] = useState<Board39Tab>("ready");
  const visibleTasks = data.tasks.filter((task) => task.status === tab);
  const tabs = tabItems.map((item) => ({
    ...item,
    count: countValue(data.taskCounts[tabCountKey(item.value)]),
  }));
  const priorityTitle = data.priority.title.kind === "measured" ? data.priority.title.value : "";

  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board39-screen"
    >
      <TwoColumn
        className="min-h-full gap-0"
        main={
          <div className="min-w-0 px-6 py-7">
            <PageHeader
              title="Your useful work"
              sub={
                data.workGoal.kind === "measured" ? (
                  `Goal: ${data.workGoal.value}`
                ) : (
                  <WorkValueText value={data.workGoal} />
                )
              }
            />
            <UnderlineTabs
              className="mt-6"
              items={tabs}
              onChange={(value) => {
                if (isBoard39Tab(value)) setTab(value);
              }}
              value={tab}
            />
            <Panel className="mt-6 flex items-center gap-4 px-[18px] py-4" padding="none">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]">
                <V2Icon name="doc" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={v2Type.caps}>Your top priority</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-3">
                  {priorityTitle ? (
                    <span className={v2Type.bodyStrong}>{priorityTitle}</span>
                  ) : (
                    <WorkValueText value={data.priority.title} />
                  )}
                  {data.priority.points.kind === "measured" ? (
                    <Chip tone="outline">{data.priority.points.value} work points</Chip>
                  ) : (
                    <WorkValueText value={data.priority.points} />
                  )}
                </div>
              </div>
              {data.priority.id.kind === "measured" ? (
                <Button asChild className="h-10 shrink-0 rounded-lg text-[13.5px]">
                  <Link
                    params={{ taskId: data.priority.id.value }}
                    search={{ brandId: data.brandId, mode: data.mode }}
                    to="/v2/my-work/tasks/$taskId"
                  >
                    Open task
                  </Link>
                </Button>
              ) : (
                <Button className="h-10 shrink-0 rounded-lg text-[13.5px]" disabled>
                  Open task
                </Button>
              )}
            </Panel>
            <Board39Table brandId={data.brandId} mode={data.mode} tasks={visibleTasks} />
          </div>
        }
        rightRail={
          <div className="border-t border-[var(--v2-line)] px-7 py-7 md:border-t-0 md:border-l">
            <CapacityRail data={data} />
          </div>
        }
        rightRailWidth={390}
      />
    </div>
  );
}
