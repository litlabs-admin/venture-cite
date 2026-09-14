import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2IconName } from "@/v2/contracts/icons";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DiagnosticsTabStrip } from "@/v2/diagnostics/DiagnosticsTabStrip";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { Chip } from "@/v2/shared/ui/Chip";
import { CodeChip } from "@/v2/shared/ui/CodeChip";
import { ExternalLink } from "@/v2/shared/ui/ExternalLink";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { Panel } from "@/v2/shared/ui/Panel";
import { Segmented } from "@/v2/shared/ui/Segmented";
import { StateLabel, type StateLabelState } from "@/v2/shared/ui/StateLabel";
import { cn } from "@/lib/utils";

export type Board18Range = "7D" | "14D" | "30D";
export type Board18HealthStatus = "Healthy" | "Needs attention";

export type Board18Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; reason: string; asOf: string };

export type Board18HistoryPoint = { date: string; score: number };

export type Board18HealthCheck = {
  name: string;
  question: string;
  icon: V2IconName;
  verified: Board18Value<number>;
  needsReview: Board18Value<number>;
  userConfirmation: Board18Value<number>;
};

export type Board18PriorityIssue = {
  title: Board18Value<string>;
  description: Board18Value<string>;
  evidencePath: Board18Value<string>;
  businessImpact: Board18Value<string>;
};

export type Board18Activity = {
  event: string;
  timestamp: string;
  detail: string;
  tone: "ok" | "warn";
};

export type Board18Resource = {
  title: string;
  href: string;
  icon: V2IconName;
};

export type Board18Data = {
  navigation: { brandId: string; mode: "expert" };
  brand: { name: Board18Value<string> };
  header: { lastUpdatedAt: Board18Value<string> };
  health: {
    score: Board18Value<number>;
    status: Board18Value<Board18HealthStatus>;
    lastVerifiedAt: Board18Value<string>;
    history: Board18Value<readonly Board18HistoryPoint[]>;
    range: Board18Range;
  };
  priorityIssue: Board18PriorityIssue;
  healthChecks: readonly Board18HealthCheck[];
  evidence: {
    observed: Board18Value<number>;
    unknown: Board18Value<number>;
    nextCheckAt: Board18Value<string>;
  };
  crawlSchedule: Board18Value<string>;
  verificationActivity: Board18Value<readonly Board18Activity[]>;
  resources: readonly Board18Resource[];
};

const RANGE_ITEMS = [
  { value: "7D", label: "7D" },
  { value: "14D", label: "14D" },
  { value: "30D", label: "30D" },
] as const;

const STATUS_LABEL_BY_VALUE_KIND: Record<
  Exclude<Board18Value<unknown>["kind"], "measured">,
  StateLabelState
> = {
  "not-measured": "not-measured",
  failed: "failed",
  stale: "stale",
};

function renderValue<T>(value: Board18Value<T>, renderMeasured: (measured: T) => ReactNode) {
  switch (value.kind) {
    case "measured":
      return renderMeasured(value.value);
    case "not-measured":
    case "failed":
    case "stale":
      return <StateLabel state={STATUS_LABEL_BY_VALUE_KIND[value.kind]} />;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function isBoard18Range(value: string): value is Board18Range {
  return value === "7D" || value === "14D" || value === "30D";
}

function formatDate(value: string, month: "long" | "short"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month,
    day: "numeric",
    year: month === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatHistoryLabel(value: string): string {
  return formatDate(value, "short").replace(/, \d{4}$/, "");
}

function getRangeDays(range: Board18Range): number {
  switch (range) {
    case "7D":
      return 7;
    case "14D":
      return 14;
    case "30D":
      return 30;
    default: {
      const exhaustive: never = range;
      return exhaustive;
    }
  }
}

function filterHistory(points: readonly Board18HistoryPoint[], range: Board18Range) {
  if (points.length === 0) return [];
  const latestTime = new Date(points[points.length - 1]?.date ?? "").getTime();
  if (!Number.isFinite(latestTime)) return [...points];
  const earliestTime = latestTime - getRangeDays(range) * 86_400_000;
  return points.filter((point) => {
    const time = new Date(point.date).getTime();
    return Number.isFinite(time) && time >= earliestTime;
  });
}

function historyLabels(points: readonly Board18HistoryPoint[]): string[] {
  if (points.length <= 4) return points.map((point) => formatHistoryLabel(point.date));
  const indexes = [0, Math.round((points.length - 1) * 0.5), points.length - 3, points.length - 1];
  return indexes.map((index) => formatHistoryLabel(points[index]?.date ?? ""));
}

function buildInternalHref(to: string, navigation: Board18Data["navigation"]): string {
  const params = new URLSearchParams({ brandId: navigation.brandId, mode: navigation.mode });
  return `${to}?${params.toString()}`;
}

function InfoGlyph() {
  return (
    <V2Icon
      aria-hidden="true"
      className="text-[color:var(--v2-ink4)]"
      name="q"
      size={13}
      strokeWidth={1.8}
    />
  );
}

function ContextLink({
  children,
  navigation,
  to,
  className,
}: {
  children: ReactNode;
  navigation: Board18Data["navigation"];
  to: string;
  className?: string;
}) {
  return (
    <a className={className} href={buildInternalHref(to, navigation)}>
      {children}
    </a>
  );
}

function StateCount({
  value,
  label,
  tone,
}: {
  value: Board18Value<number>;
  label: string;
  tone: "ok" | "warn" | "neutral";
}) {
  return (
    <Chip className="whitespace-nowrap" leadingDot tone={tone}>
      {renderValue(value, (number) => `${number} ${label}`)}
    </Chip>
  );
}

function ScorePanel({
  data,
  range,
  onRangeChange,
}: {
  data: Board18Data;
  range: Board18Range;
  onRangeChange: (range: Board18Range) => void;
}) {
  const history = data.health.history.kind === "measured" ? data.health.history.value : [];
  const filtered = useMemo(() => filterHistory(history, range), [history, range]);
  const labels = useMemo(() => historyLabels(filtered), [filtered]);
  const chart =
    filtered.length > 0 ? (
      <TrendChart
        ariaLabel="Health score over time"
        endpointBadge={
          data.health.score.kind === "measured"
            ? { seriesId: "health", text: String(data.health.score.value) }
            : undefined
        }
        height={154}
        series={[
          {
            area: true,
            id: "health",
            label: "Health score",
            points: filtered.map((point) => ({ x: point.date, y: point.score })),
            style: "solid",
          },
        ]}
        xLabels={labels}
        yDomain={[40, 100]}
        yTicks={[100, 70, 40]}
      />
    ) : (
      <div className="flex h-[154px] items-center justify-center">
        {renderValue(data.health.history, () => null)}
      </div>
    );

  return (
    <Panel className="overflow-hidden px-5 py-4" data-testid="b18-health-panel" padding="none">
      <div className="grid min-w-0 grid-cols-[250px_minmax(0,1fr)] gap-5 max-[780px]:grid-cols-1">
        <div className="min-w-0 border-r border-[var(--v2-line)] pr-5 max-[780px]:border-r-0 max-[780px]:border-b max-[780px]:pb-4">
          <div className={cn(v2Type.label, "flex items-center gap-1.5")}>
            <span>Health score</span>
            <InfoGlyph />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span data-testid="b18-score">
              {renderValue(data.health.score, (score) => (
                <span className={cn(v2Type.statBig, "font-mono text-[52px] leading-none")}>
                  {score}
                </span>
              ))}
            </span>
            <span className={v2Type.statUnit}>/ 100</span>
          </div>
          <div className="mt-2">
            {renderValue(data.health.status, (status) => (
              <Chip leadingDot tone="warn">
                {status}
              </Chip>
            ))}
          </div>
          <div className={cn(v2Type.meta, "mt-3 flex items-center gap-1.5")}>
            <span>Last verified crawl: </span>
            {renderValue(data.health.lastVerifiedAt, (date) => formatDate(date, "long"))}
            <InfoGlyph />
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <span className={v2Type.meta}>Health score over time</span>
            <Segmented
              items={RANGE_ITEMS}
              kind="range"
              onChange={(value) => {
                if (isBoard18Range(value)) onRangeChange(value);
              }}
              value={range}
            />
          </div>
          {chart}
        </div>
      </div>
    </Panel>
  );
}

function PriorityPanel({ data }: { data: Board18Data }) {
  return (
    <Panel className="border-[var(--v2-line2)] bg-[var(--v2-bad-soft)] px-5 py-3" padding="none">
      <div className="flex items-center gap-2">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--v2-bad)] text-[10px] font-semibold text-[color:var(--v2-paper)]">
          !
        </span>
        <span className={cn(v2Type.label, "text-[color:var(--v2-bad)]")}>Priority issue</span>
      </div>
      <div className={cn(v2Type.cardTitle, "mt-2 text-[15px]")}>
        {renderValue(data.priorityIssue.title, (title) => title)}
      </div>
      <p className={cn(v2Type.body, "mt-1 max-w-[650px]")}>
        {renderValue(data.priorityIssue.description, (description) => description)}
      </p>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_230px] gap-4 border-t border-[var(--v2-line2)] pt-2 max-[920px]:grid-cols-1">
        <div className="min-w-0">
          <div className={cn(v2Type.caps, "mb-1")}>Evidence path</div>
          {renderValue(data.priorityIssue.evidencePath, (path) => (
            <CodeChip className="bg-[var(--v2-paper)]" value={path} />
          ))}
        </div>
        <div className="min-w-0">
          <div className={cn(v2Type.caps, "mb-1")}>Business impact</div>
          <div className={v2Type.body}>
            {renderValue(data.priorityIssue.businessImpact, (impact) => impact)}
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-end justify-start gap-2 max-[920px]:items-start">
          <Button
            asChild
            className="h-10 rounded-lg px-3 text-[13.5px]"
            data-testid="b18-create-task"
          >
            <ContextLink navigation={data.navigation} to="/v2/my-work">
              Create improvement task ›
            </ContextLink>
          </Button>
          <LinkWithArrow
            className={cn(v2Type.body, "text-[color:var(--v2-brand)]")}
            href={buildInternalHref("/v2/diagnostics/site-health", data.navigation)}
          >
            View full details
          </LinkWithArrow>
        </div>
      </div>
    </Panel>
  );
}

function HealthChecksPanel({ data }: { data: Board18Data }) {
  return (
    <Panel className="overflow-hidden p-0" padding="none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--v2-line)] px-5 py-3">
        <div className={cn(v2Type.label, "flex items-center gap-1.5")}>
          <span>Site health checks</span>
          <InfoGlyph />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={cn(v2Type.meta, "inline-flex items-center gap-1.5")}>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--v2-ok)]" />
            Verified
          </span>
          <span className={cn(v2Type.meta, "inline-flex items-center gap-1.5")}>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--v2-warn)]" />
            Needs review
          </span>
          <span className={cn(v2Type.meta, "inline-flex items-center gap-1.5")}>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--v2-ink4)]" />
            User confirmation required
          </span>
        </div>
      </div>
      {data.healthChecks.map((check) => (
        <div
          className="grid grid-cols-[28px_minmax(0,1fr)_auto_16px] items-center gap-3 border-b border-[var(--v2-line)] px-5 py-1.5 last:border-b-0 max-[950px]:grid-cols-[28px_minmax(0,1fr)_16px] max-[950px]:gap-2"
          key={check.name}
        >
          <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-[var(--v2-line)] text-[color:var(--v2-ink2)]">
            <V2Icon name={check.icon} size={17} />
          </span>
          <span className="min-w-0">
            <span className={cn(v2Type.bodyStrong, "block leading-[1.25]")}>{check.name}</span>
            <span className={cn(v2Type.meta, "block truncate leading-[1.25]")}>
              {check.question}
            </span>
          </span>
          <span className="flex flex-wrap justify-end gap-1.5 max-[950px]:hidden">
            <StateCount label="Verified" tone="ok" value={check.verified} />
            <StateCount label="Needs review" tone="warn" value={check.needsReview} />
            <StateCount label="User confirmation" tone="neutral" value={check.userConfirmation} />
          </span>
          <V2Icon className="text-[color:var(--v2-ink4)]" name="chev" size={16} />
        </div>
      ))}
    </Panel>
  );
}

function EvidenceBoundaries({ data }: { data: Board18Data }) {
  return (
    <Panel className="px-4 py-3" padding="none">
      <h2 className={cn(v2Type.sectionTitle, "flex items-center gap-1.5 text-[15px]")}>
        <span>Evidence boundaries</span>
        <InfoGlyph />
      </h2>
      <div className="mt-3 space-y-2">
        <EvidenceRow
          data-testid="b18-observed"
          label="Observed"
          tone="ok"
          value={data.evidence.observed}
        />
        <EvidenceRow
          data-testid="b18-unknown"
          label="Unknown"
          tone="warn"
          value={data.evidence.unknown}
        />
        <EvidenceRow
          data-testid="b18-next-check"
          label="Next check"
          tone="neutral"
          value={data.evidence.nextCheckAt}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[9px] bg-[var(--v2-inset)] px-3 py-2">
        <V2Icon className="shrink-0 text-[color:var(--v2-ink2)]" name="cal" size={17} />
        <span className="min-w-0 flex-1">
          <span className={cn(v2Type.bodyStrong, "block text-[12.5px]")}>Crawl schedule</span>
          <span className={cn(v2Type.meta, "block")}>
            {renderValue(data.crawlSchedule, (schedule) => schedule)}
          </span>
        </span>
        <span className={cn(v2Type.body, "text-[color:var(--v2-brand)]")}>Edit</span>
      </div>
    </Panel>
  );
}

function EvidenceRow({
  "data-testid": testId,
  label,
  tone,
  value,
}: {
  "data-testid": string;
  label: string;
  tone: "ok" | "warn" | "neutral";
  value: Board18Value<number | string>;
}) {
  const dotClass =
    tone === "ok"
      ? "bg-[var(--v2-ok)]"
      : tone === "warn"
        ? "bg-[var(--v2-warn)]"
        : "bg-[var(--v2-ink4)]";
  return (
    <div
      className="border-b border-[var(--v2-line)] pb-2 last:border-b-0 last:pb-0"
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
        <span className={cn(v2Type.bodyStrong, "min-w-0 flex-1 text-[12.5px]")}>{label}</span>
        <span className={cn(v2Type.num, "text-right")}>
          {renderValue(value, (current) => (
            <span>{typeof current === "number" ? current : formatDate(current, "long")}</span>
          ))}
        </span>
      </div>
      {value.kind === "measured" ? (
        <div className={cn(v2Type.meta, "ml-4 mt-1")}>{getEvidenceNote(label)}</div>
      ) : null}
    </div>
  );
}

function getEvidenceNote(label: string): string {
  switch (label) {
    case "Observed":
      return "Verified in latest crawl (Sep 9, 2026)";
    case "Unknown":
      return "Not yet verified (blocked or pending)";
    case "Next check":
      return "Re-crawl to confirm fixes";
    default:
      return "";
  }
}

function ActivityPanel({ data }: { data: Board18Data }) {
  return (
    <Panel className="px-4 py-3" padding="none">
      <div className="flex items-start justify-between gap-3">
        <h2 className={cn(v2Type.sectionTitle, "text-[15px]")}>Recent verification activity</h2>
        <LinkWithArrow
          className={cn(v2Type.meta, "shrink-0 text-[color:var(--v2-brand)]")}
          href={buildInternalHref("/v2/diagnostics/site-health", data.navigation)}
        >
          View all
        </LinkWithArrow>
      </div>
      <div className="mt-2">
        {renderValue(data.verificationActivity, (items) => (
          <div>
            {items.map((item) => (
              <div
                className="flex items-start gap-2 border-b border-[var(--v2-line)] py-1 last:border-b-0"
                key={`${item.event}-${item.timestamp}`}
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    item.tone === "ok" ? "bg-[var(--v2-ok)]" : "bg-[var(--v2-warn)]",
                  )}
                />
                <span className={cn(v2Type.body, "min-w-0 flex-1 text-[12.5px]")}>
                  {item.event}
                </span>
                <span className={cn(v2Type.mono, "shrink-0 text-right text-[11.5px]")}>
                  {item.timestamp}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ResourcesPanel({ data }: { data: Board18Data }) {
  return (
    <Panel className="px-4 py-3" padding="none">
      <h2 className={cn(v2Type.sectionTitle, "text-[15px]")}>Helpful resources</h2>
      <div className="mt-2">
        {data.resources.map((resource) => (
          <div
            className="flex items-center gap-2 border-b border-[var(--v2-line)] py-2 last:border-b-0"
            key={resource.title}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-[var(--v2-line)] text-[color:var(--v2-ink2)]">
              <V2Icon name={resource.icon} size={15} />
            </span>
            <ExternalLink
              className={cn(v2Type.meta, "min-w-0 flex-1 text-[color:var(--v2-brand)]")}
              href={resource.href}
            >
              {resource.title}
            </ExternalLink>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ScreenContext({ data }: { data: Board18Data }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 border-b border-[var(--v2-line)] bg-[var(--v2-paper)] px-7 py-2">
      <span className={v2Type.meta}>Diagnostics</span>
      <span className={cn(v2Type.meta, "flex items-center gap-2")}>
        <span>
          Last updated{" "}
          {renderValue(data.header.lastUpdatedAt, (updatedAt) => formatTime(updatedAt))}
        </span>
        <span className="h-2 w-2 rounded-full bg-[var(--v2-ok)]" />
      </span>
    </div>
  );
}

export function Board18Screen({ data, staleAsOf }: V2ScreenProps<Board18Data>) {
  const [range, setRange] = useState<Board18Range>(data.health.range);

  return (
    <div className="min-h-screen min-w-0 bg-[var(--v2-inset)] text-[color:var(--v2-ink)]">
      <ScreenContext data={data} />
      <div className="px-7 py-4">
        {staleAsOf ? (
          <div className="mb-3">
            <StateLabel state="stale" />
          </div>
        ) : null}
        <h1 className={v2Type.pageTitle}>Find the cause. Choose a useful fix.</h1>
        <p className={cn(v2Type.pageSub, "mt-1")}>
          Verify how AI crawlers see your site, fix what's blocking visibility, and track progress
          over time.
        </p>
        <div className="mt-3">
          <DiagnosticsTabStrip
            active="b18"
            brandId={data.navigation.brandId}
            mode={data.navigation.mode}
          />
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_300px] items-start gap-5 max-[1050px]:grid-cols-1">
          <main className="min-w-0 space-y-2">
            <ScorePanel data={data} onRangeChange={setRange} range={range} />
            <PriorityPanel data={data} />
            <HealthChecksPanel data={data} />
          </main>
          <aside className="min-w-0 space-y-2">
            <EvidenceBoundaries data={data} />
            <ActivityPanel data={data} />
            <ResourcesPanel data={data} />
          </aside>
        </div>
      </div>
    </div>
  );
}
