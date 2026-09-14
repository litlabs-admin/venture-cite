import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Chip } from "@/v2/shared/ui/Chip";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { LevelBadge } from "@/v2/shared/ui/LevelBadge";
import { Panel } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { StateLabel, type StateLabelState } from "@/v2/shared/ui/StateLabel";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import type { V2IconName } from "@/v2/contracts/icons";

export type TodayValue<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "loading" }
  | { kind: "stale"; value: T; asOf: string };

export type TodayVisibility =
  | {
      kind: "measured";
      measured: number;
      mentioned: number;
      failed: number;
      mentionRate: number;
      rangeLabel: string;
      chartPoints: ReadonlyArray<{ x: string; y: number | null }>;
      xLabels: readonly string[];
      note: TodayValue<string>;
    }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "loading" };

export type TodayTask = {
  icon: V2IconName;
  title: TodayValue<string>;
  points: TodayValue<number>;
};

export type TodayPriorityTask = TodayTask & {
  effortMinutes: TodayValue<number>;
  state: TodayValue<string>;
  detail: TodayValue<string>;
  approvedDetail: TodayValue<string>;
  desiredResult: TodayValue<string>;
};

export type TodayData<TVariant extends "board01" | "board02" = "board01" | "board02"> = {
  variant: TVariant;
  brandId: string;
  mode: "guided" | "expert";
  brand: { name: string };
  goal: TodayValue<string>;
  priorityTask: TodayPriorityTask;
  queuedTasks: readonly TodayTask[];
  visibility: TodayVisibility;
  progress: {
    level: TodayValue<number>;
    levelName: TodayValue<string>;
    workPoints: TodayValue<number>;
    nextLevelPoints: TodayValue<number>;
    nextLevel: TodayValue<number>;
    nextLevelName: TodayValue<string>;
    progressPercent: TodayValue<number>;
    pointsRemaining: TodayValue<number>;
    verifiedChanges: TodayValue<number>;
    requiredChanges: TodayValue<number>;
    changesRemaining: TodayValue<number>;
    status: TodayValue<string>;
  };
  waitingTask:
    | {
        kind: "waiting";
        title: TodayValue<string>;
        points: TodayValue<number>;
      }
    | { kind: "not-measured"; reason: string };
};

type TodayLayoutProps = {
  data: TodayData;
  staleAsOf?: string;
};

const stateForValue: Record<
  Exclude<TodayValue<unknown>["kind"], "measured" | "stale">,
  StateLabelState
> = {
  "not-measured": "not-measured",
  failed: "failed",
  loading: "not-measured",
};

function valueNode<T>(value: TodayValue<T>, format: (item: T) => ReactNode): ReactNode {
  if (value.kind === "measured") return format(value.value);
  if (value.kind === "stale") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <StateLabel state="stale" />
        <span>{format(value.value)}</span>
      </span>
    );
  }
  return <StateLabel state={stateForValue[value.kind]} />;
}

function numberValue(value: TodayValue<number>): number | undefined {
  if (value.kind === "measured" || value.kind === "stale") return value.value;
  return undefined;
}

function formatMinutes(value: TodayValue<number>, board: "board01" | "board02"): ReactNode {
  return valueNode(value, (minutes) =>
    board === "board01"
      ? `About ${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${minutes} min estimated effort`,
  );
}

function formatPoints(value: TodayValue<number>, unit: string): ReactNode {
  return valueNode(value, (points) => `${points} ${unit}`);
}

function InternalLink({
  data,
  to,
  children,
  className,
  ...props
}: {
  data: TodayData;
  to: "/v2/my-work" | "/v2/visibility/results";
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  return (
    <Link
      to={to}
      search={{ brandId: data.brandId, mode: data.mode }}
      className={className}
      {...props}
    >
      {children}
    </Link>
  );
}

function TaskIcon({ name, large = false }: { name: V2IconName; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)] ${
        large
          ? "h-[38px] w-[38px] rounded-[9px]"
          : "h-8 w-8 rounded-[7px] bg-[var(--v2-inset)] text-[color:var(--v2-ink2)]"
      }`}
    >
      <V2Icon name={name} size={large ? 20 : 16} />
    </span>
  );
}

function PriorityState({ value }: { value: TodayValue<string> }) {
  if (value.kind !== "measured") return valueNode(value, (item) => item);
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-[1.4] text-[color:var(--v2-bad)]">
      <V2Icon name="warn" size={15} />
      <span>{value.value}</span>
    </span>
  );
}

function Effort({ value, variant }: { value: TodayValue<number>; variant: "board01" | "board02" }) {
  if (value.kind !== "measured") {
    return <span className={v2Type.meta}>{valueNode(value, (item) => String(item))}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-[1.4] text-[color:var(--v2-ink2)]">
      <V2Icon name="clock" size={15} />
      <span>{formatMinutes(value, variant)}</span>
    </span>
  );
}

function PrimaryTask({ data }: { data: TodayData }) {
  const [explained, setExplained] = useState(false);
  const task = data.priorityTask;
  const detail = valueNode(task.detail, (item) => item);
  const approved = valueNode(task.approvedDetail, (item) => item);
  const taskLink = (
    <InternalLink data={data} to="/v2/my-work" aria-label="Review evidence" className="inline-flex">
      Review evidence
      {data.variant === "board02" ? <V2Icon name="chev" size={15} /> : null}
    </InternalLink>
  );

  if (data.variant === "board02") {
    return (
      <Panel
        data-testid="board02-priority-task"
        padding="none"
        className="mb-[18px] flex items-start gap-4 px-5 py-5"
      >
        <TaskIcon name={task.icon} large />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <h2 className={v2Type.cardTitle}>{valueNode(task.title, (item) => item)}</h2>
            <Chip tone="brand">{formatPoints(task.points, "work points")}</Chip>
          </div>
          <div className="mb-3.5 flex flex-col gap-1.5">
            <PriorityState value={task.state} />
            <Effort value={task.effortMinutes} variant={data.variant} />
          </div>
          <p className={v2Type.body}>{detail}</p>
        </div>
        <Button asChild className="h-10 shrink-0 rounded-lg px-4 text-[13.5px]" variant="default">
          {taskLink}
        </Button>
      </Panel>
    );
  }

  return (
    <section
      className="border-b border-[var(--v2-line)] pb-[22px]"
      data-testid="board01-priority-task"
    >
      <div className="flex items-start gap-4">
        <TaskIcon name={task.icon} large />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <h2 className={v2Type.cardTitle}>{valueNode(task.title, (item) => item)}</h2>
            <Chip tone="brand">{formatPoints(task.points, "work points")}</Chip>
          </div>
          <div className="mb-[11px] flex flex-wrap items-center gap-x-[18px] gap-y-1">
            <PriorityState value={task.state} />
            <Effort value={task.effortMinutes} variant={data.variant} />
          </div>
          <p className={`${v2Type.body} mb-[15px] space-y-0.5`}>
            <span className="block">{detail}</span>
            <span className="block">{approved}</span>
          </p>
          <div className="flex flex-wrap items-center gap-[18px]">
            <Button asChild className="h-10 rounded-lg px-4 text-[13.5px]">
              {taskLink}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-lg px-0 text-[13.5px] text-[color:var(--v2-brand)]"
              aria-expanded={explained}
              aria-controls="board01-task-rationale"
              onClick={() => setExplained((open) => !open)}
            >
              Why this task?
            </Button>
          </div>
          {explained ? (
            <div
              id="board01-task-rationale"
              className="mt-3 rounded-[var(--v2-radius)] bg-[var(--v2-inset)] px-3 py-2.5"
            >
              <p className={v2Type.body}>{valueNode(task.desiredResult, (item) => item)}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function QueuedTasks({ data }: { data: TodayData }) {
  const taskLinks: readonly ("/v2/my-work" | "/v2/visibility/results")[] = [
    "/v2/my-work",
    "/v2/visibility/results",
  ];
  return (
    <div
      className={data.variant === "board02" ? "mb-[22px]" : ""}
      data-testid={`${data.variant}-queued-tasks`}
    >
      {data.queuedTasks.slice(0, 2).map((task, index) => (
        <InternalLink
          data={data}
          to={taskLinks[index] ?? "/v2/my-work"}
          key={`${data.variant}-queued-${index}`}
          data-testid={`${data.variant}-queued-task`}
          className="flex w-full items-center gap-3 border-b border-[var(--v2-line)] py-4 text-left no-underline hover:bg-[var(--v2-inset)]"
        >
          <TaskIcon name={task.icon} />
          <span className={`${v2Type.bodyStrong} min-w-0 truncate`}>
            {valueNode(task.title, (item) => item)}
          </span>
          <Chip tone="brand">{formatPoints(task.points, "points")}</Chip>
          <V2Icon name="chev" size={15} className="ml-auto shrink-0 text-[color:var(--v2-ink3)]" />
        </InternalLink>
      ))}
    </div>
  );
}

function ChartYAxis() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 flex w-8 flex-col justify-between pt-0.5 pb-[38px]"
      aria-hidden="true"
    >
      {["60%", "45%", "30%", "15%", "0%"].map((label) => (
        <span key={label} className={v2Type.mono}>
          {label}
        </span>
      ))}
    </div>
  );
}

function VisibilityChart({ data }: { data: Extract<TodayVisibility, { kind: "measured" }> }) {
  return (
    <div className="relative pl-8" data-testid="today-trend-chart">
      <style>
        {".today-trend-chart [data-chart-element=chart-axis] text { visibility: hidden; }"}
      </style>
      <div className="today-trend-chart">
        <ChartYAxis />
        <TrendChart
          series={[
            {
              id: "mention-rate",
              label: "Mention rate",
              points: data.chartPoints,
              style: "solid",
              area: true,
            },
          ]}
          yDomain={[0, 60]}
          yTicks={[60, 45, 30, 15, 0]}
          xLabels={data.xLabels}
          height={190}
          ariaLabel="Observed visibility over time"
        />
      </div>
    </div>
  );
}

function Visibility({ data, staleAsOf }: { data: TodayData; staleAsOf?: string }) {
  const visibility = data.visibility;
  const heading = <h2 className={v2Type.caps}>Observed visibility</h2>;
  const range =
    visibility.kind === "measured"
      ? visibility.rangeLabel
      : data.variant === "board02"
        ? "Last 14 days"
        : "Not measured";
  const control = (
    <Button
      type="button"
      variant="ghost"
      className={
        data.variant === "board02"
          ? "h-7 rounded-lg border border-[var(--v2-line)] px-2.5 py-[5px] text-[12.5px] font-normal text-[color:var(--v2-ink2)]"
          : "h-7 rounded-lg px-2.5 py-[5px] text-[12.5px] font-normal text-[color:var(--v2-ink3)]"
      }
      aria-label="Visibility date range"
    >
      {range}
      <V2Icon name="cdown" size={13} />
    </Button>
  );

  const content = (
    <div data-testid={`${data.variant}-visibility`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        {control}
      </div>
      {visibility.kind === "measured" ? (
        <>
          {staleAsOf ? <StateLabel state="stale" className="mt-1.5" /> : null}
          <p className={`${v2Type.body} mt-1.5`}>
            Brand mentioned in {visibility.mentioned} of {visibility.measured} successful test
            answers ·{" "}
            <span className="font-mono text-[13px] font-semibold tabular-nums text-[color:var(--v2-brand)]">
              {visibility.mentionRate}%
            </span>
          </p>
          <div className="mt-4 min-w-[240px]">
            <VisibilityChart data={visibility} />
          </div>
          <p className={`${v2Type.meta} mt-3`}>{valueNode(visibility.note, (item) => item)}</p>
        </>
      ) : visibility.kind === "loading" ? (
        <div
          className="mt-4 h-[190px] animate-pulse rounded-[var(--v2-radius)] bg-[var(--v2-inset)]"
          role="status"
        >
          <span className="sr-only">Loading visibility</span>
        </div>
      ) : visibility.kind === "not-measured" ? (
        <EmptyState
          className="mt-4 min-h-[190px]"
          title={<StateLabel state="not-measured" />}
          description={visibility.reason}
        />
      ) : (
        <div className="mt-4 flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-[var(--v2-radius-panel)] border border-[var(--v2-line)] bg-[var(--v2-inset)] text-center">
          <StateLabel state="failed" />
          <p className={v2Type.meta}>{visibility.reason}</p>
        </div>
      )}
    </div>
  );

  if (data.variant === "board02") {
    return (
      <Panel padding="none" className="p-5">
        {content}
      </Panel>
    );
  }
  return <section className="border-t border-[var(--v2-line)] pt-5">{content}</section>;
}

function LevelSummary({ data }: { data: TodayData }) {
  const level = numberValue(data.progress.level);
  return (
    <div className="mb-4 flex items-center gap-3.5">
      {level === undefined ? (
        <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[var(--v2-radius)] bg-[var(--v2-inset)]">
          <StateLabel state="not-measured" />
        </div>
      ) : (
        <LevelBadge level={level} name="" size="md" className="[&>span:last-child]:hidden" />
      )}
      <div className="min-w-0">
        <p className="text-[17px] leading-[1.3] font-semibold tracking-[-0.02em] text-[color:var(--v2-ink)]">
          Level {valueNode(data.progress.level, (item) => item)} ·{" "}
          {valueNode(data.progress.levelName, (item) => item)}
        </p>
        <p className={`${v2Type.body} mt-0.5 tabular-nums`}>
          {data.variant === "board01" ? (
            <>
              {valueNode(data.progress.workPoints, (item) => item)} /{" "}
              {valueNode(data.progress.nextLevelPoints, (item) => item)} work points
            </>
          ) : (
            <>{valueNode(data.progress.workPoints, (item) => item)} work points</>
          )}
        </p>
      </div>
    </div>
  );
}

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13px] leading-[1.5] text-[color:var(--v2-ink2)]">
      <V2Icon name="check" size={16} className="mt-0.5 shrink-0 text-[color:var(--v2-ink3)]" />
      <span>{children}</span>
    </li>
  );
}

function WaitingCard({ data }: { data: TodayData }) {
  if (data.waitingTask.kind === "not-measured") {
    return <StateLabel state="not-measured" />;
  }
  return (
    <Panel padding="none" className="flex items-start gap-2.5 px-3.5 py-3">
      <TaskIcon name="doc" />
      <div className="min-w-0 flex-1">
        <p className={`${v2Type.bodyStrong} truncate`}>
          {valueNode(data.waitingTask.title, (item) => item)}
        </p>
        <p className="mt-0.5 flex items-start gap-1 text-[12px] leading-[1.4] text-[color:var(--v2-ok)]">
          <V2Icon name="check" size={13} className="mt-0.5 shrink-0" />
          <span>
            Work verified · {valueNode(data.waitingTask.points, (item) => `${item} work points`)}{" "}
            awarded
          </span>
        </p>
      </div>
      <V2Icon name="chev" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ink3)]" />
    </Panel>
  );
}

function ProgressRail({ data }: { data: TodayData }) {
  const percent = numberValue(data.progress.progressPercent);
  const waiting = data.waitingTask.kind !== "not-measured";
  return (
    <div data-testid={`${data.variant}-progress-rail`}>
      <section aria-labelledby={`${data.variant}-progress-heading`}>
        <h2 id={`${data.variant}-progress-heading`} className={v2Type.bodyStrong}>
          Your progress
        </h2>
        <LevelSummary data={data} />
        <div className="mb-5 flex items-center gap-2.5">
          {percent === undefined ? (
            <StateLabel state="not-measured" />
          ) : (
            <>
              <ProgressBar value={percent} showValue={false} className="flex-1" />
              {data.variant === "board01" ? (
                <span className={`${v2Type.num} text-[color:var(--v2-ink2)]`}>{percent}%</span>
              ) : null}
            </>
          )}
        </div>
      </section>

      {data.variant === "board01" ? (
        <section aria-labelledby="board01-next-level-heading">
          <h3 id="board01-next-level-heading" className={v2Type.bodyStrong}>
            To reach Level {valueNode(data.progress.nextLevel, (item) => item)} ·{" "}
            {valueNode(data.progress.nextLevelName, (item) => item)}
          </h3>
          <ul className="mt-2.5 space-y-2">
            <CheckLine>
              {valueNode(
                data.progress.pointsRemaining,
                (item) => `Earn ${item} more point${item === 1 ? "" : "s"}`,
              )}
            </CheckLine>
            <CheckLine>
              {valueNode(
                data.progress.changesRemaining,
                (item) => `Verify ${item} more change${item === 1 ? "" : "s"}`,
              )}
            </CheckLine>
          </ul>
          <p className={`${v2Type.meta} mt-3.5 border-t border-[var(--v2-line)] pt-4`}>
            {valueNode(data.progress.status, (item) => item)}
          </p>
        </section>
      ) : (
        <section aria-labelledby="board02-next-level-heading">
          <h3 id="board02-next-level-heading" className={v2Type.bodyStrong}>
            Next: Level {valueNode(data.progress.nextLevel, (item) => item)} ·{" "}
            {valueNode(data.progress.nextLevelName, (item) => item)}
          </h3>
          <p className={`${v2Type.body} mt-1.5`}>
            {valueNode(data.progress.pointsRemaining, (item) => `${item} points`)} and{" "}
            {valueNode(data.progress.requiredChanges, (item) => `${item} verified changes`)}{" "}
            required
          </p>
          <p className={`${v2Type.body} mt-4 border-t border-[var(--v2-line)] pt-4`}>
            <V2Icon
              name="check"
              size={16}
              className="mr-2 inline-block align-[-3px] text-[color:var(--v2-ink3)]"
            />
            {valueNode(data.progress.status, (item) => item)}
          </p>
        </section>
      )}

      <section
        aria-labelledby={`${data.variant}-waiting-heading`}
        className={data.variant === "board01" ? "mt-6" : "mt-7"}
      >
        <h3 id={`${data.variant}-waiting-heading`} className={v2Type.bodyStrong}>
          Waiting for observation
        </h3>
        <p
          className={`${v2Type.meta} mt-1 ${data.variant === "board02" ? "leading-[1.6]" : "leading-[1.6]"}`}
        >
          {data.variant === "board01"
            ? "Next measurement will check the result."
            : "Visibility impact is measured after the next observation window."}
        </p>
        {waiting ? (
          <div className="mt-3">
            <WaitingCard data={data} />
          </div>
        ) : null}
      </section>
      <p className={`${v2Type.meta} mt-5`}>
        {data.variant === "board01"
          ? "Work points do not measure visibility."
          : "Visibility impact is not yet measured."}
      </p>
    </div>
  );
}

export function TodayLayout({ data, staleAsOf }: TodayLayoutProps) {
  const title =
    data.variant === "board01" ? "Your next useful step" : "Make your next improvement count";
  return (
    <div
      className="flex min-h-full min-w-0 flex-col lg:flex-row"
      data-testid={`${data.variant}-today`}
    >
      <main className="min-w-0 flex-1 px-7 py-6 xl:px-8">
        <PageHeader
          title={title}
          sub={<>Goal: {valueNode(data.goal, (item) => item)}</>}
          className="mb-5"
        />
        <PrimaryTask data={data} />
        <QueuedTasks data={data} />
        <Visibility data={data} staleAsOf={staleAsOf} />
      </main>
      <aside
        aria-label="Your progress"
        className="w-full shrink-0 border-t border-[var(--v2-line)] px-7 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6"
      >
        <ProgressRail data={data} />
      </aside>
    </div>
  );
}
