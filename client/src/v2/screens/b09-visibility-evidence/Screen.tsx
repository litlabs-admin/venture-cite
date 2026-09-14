import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  CitedUrlPage,
  EngineRanking,
  VisibilityHero,
  WorkHistoryEventView,
} from "@/v2/data/visibilityEvidence";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { VisibilityTabStrip } from "@/v2/visibility/VisibilityTabStrip";

export type Board09Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; value: T; asOf: string };

export type Board09Trend = {
  labels: Board09Value<readonly string[]>;
  mentionRate: Board09Value<readonly number[]>;
  confidenceUpper: Board09Value<readonly number[]>;
  confidenceLower: Board09Value<readonly number[]>;
};

export type Board09SourceEvidenceRow = {
  sourcePath: string;
  checkType: string;
  checkedAt: string;
  result: Board09Value<"Verified" | "Citation recorded">;
  selected: boolean;
};

export type Board09EngineRow = {
  name: string;
  answerCount: Board09Value<number>;
};

export type Board09WorkChange = {
  title: string;
  points: Board09Value<number>;
};

export type Board09Data = {
  context: {
    brandId: string;
    mode: V2Mode;
  };
  visibility: {
    mentionRate: Board09Value<number>;
    mentioned: Board09Value<number>;
    successfulAnswers: Board09Value<number>;
    failedAttempts: Board09Value<number>;
    approvedQuestions: Board09Value<number>;
    engines: Board09Value<number>;
    recommendations: Board09Value<number>;
    trend: Board09Trend;
  };
  filters: {
    dateWindow: Board09Value<string>;
    engineCount: Board09Value<number>;
    questionCount: Board09Value<number>;
  };
  verifiedWork: {
    totalPoints: Board09Value<number>;
    changeCount: Board09Value<number>;
    changeSummary: Board09Value<string>;
    level: Board09Value<{ level: number; name: string }>;
    nextLevel: Board09Value<{ name: string; points: number }>;
    progressRate: Board09Value<number>;
    changes: Board09Value<readonly Board09WorkChange[]>;
  };
  sourceEvidence: Board09Value<readonly Board09SourceEvidenceRow[]>;
  review: {
    message: string;
    actionLabel: string;
    rewardPoints: Board09Value<number>;
    businessResults: Board09Value<boolean>;
  };
  coverage: {
    successfulAnswers: Board09Value<number>;
    failedAttempts: Board09Value<number>;
    approvedQuestions: Board09Value<number>;
    engines: Board09Value<number>;
    lastChecked: Board09Value<string>;
  };
  observedEngines: Board09Value<readonly Board09EngineRow[]>;
};

type Board09RoutePath =
  "/v2/today" | "/v2/my-work" | "/v2/visibility/evidence" | "/v2/visibility/results";

const TABS = ["Mentions", "Recommendations", "Citations"] as const;
type Board09Tab = (typeof TABS)[number];

function stateTitle(value: Board09Value<unknown>): string | undefined {
  switch (value.kind) {
    case "measured":
      return undefined;
    case "not-measured":
    case "failed":
      return value.reason;
    case "stale":
      return `As of ${value.asOf}.`;
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function StateValue({ value }: { value: Board09Value<unknown> }) {
  const title = stateTitle(value);
  switch (value.kind) {
    case "measured":
      return <span className={v2Type.body}>{String(value.value)}</span>;
    case "not-measured":
      return (
        <span title={title}>
          <StateLabel state="not-measured" />
        </span>
      );
    case "failed":
      return (
        <span title={title}>
          <StateLabel state="failed" />
        </span>
      );
    case "stale":
      return (
        <span title={title}>
          <StateLabel state="stale" />
        </span>
      );
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function renderValue<T>(value: Board09Value<T>, render: (inner: T) => ReactNode): ReactNode {
  switch (value.kind) {
    case "measured":
      return render(value.value);
    case "not-measured":
    case "failed":
    case "stale":
      return <StateValue value={value} />;
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function mapValue<T, U>(value: Board09Value<T>, map: (inner: T) => U): Board09Value<U> {
  switch (value.kind) {
    case "measured":
      return { kind: "measured", value: map(value.value) };
    case "not-measured":
      return value;
    case "failed":
      return value;
    case "stale":
      return { kind: "stale", value: map(value.value), asOf: value.asOf };
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildV2Href(path: Board09RoutePath, context: Board09Data["context"]): string {
  const params = new URLSearchParams({ brandId: context.brandId, mode: context.mode });
  return `${path}?${params.toString()}`;
}

function TrendChart({ trend }: { trend: Board09Trend }) {
  if (trend.mentionRate.kind !== "measured") {
    return (
      <div className="flex h-[158px] items-center justify-center border border-dashed border-[var(--v2-line)]">
        <StateValue value={trend.mentionRate} />
      </div>
    );
  }

  const line = trend.mentionRate.value;
  const labels = trend.labels.kind === "measured" ? trend.labels.value : [];
  const width = 700;
  const height = 158;
  const pointX = (index: number, count: number) => (count <= 1 ? 0 : (index / (count - 1)) * width);
  const pointY = (value: number) => Math.max(0, Math.min(height, height - (value / 0.6) * height));
  const pathFor = (values: readonly number[]) =>
    values
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${pointX(index, values.length)} ${pointY(value)}`,
      )
      .join(" ");
  const linePath = pathFor(line);
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const upperPath =
    trend.confidenceUpper.kind === "measured" ? pathFor(trend.confidenceUpper.value) : "";
  const lowerPath =
    trend.confidenceLower.kind === "measured" ? pathFor(trend.confidenceLower.value) : "";
  const lastX = pointX(line.length - 1, line.length);
  const lastY = pointY(line[line.length - 1] ?? 0);
  const labelValues =
    labels.length > 0
      ? [
          labels[0] ?? "",
          labels[Math.floor(labels.length / 2)] ?? "",
          labels[labels.length - 1] ?? "",
        ]
      : ["Aug 26", "Sep 1", "Sep 8"];

  return (
    <div className="min-w-0">
      <div className="flex min-w-0">
        <div className="flex h-[158px] w-[31px] shrink-0 flex-col justify-between pr-2">
          {(["60%", "45%", "30%", "15%", "0%"] as const).map((label) => (
            <span className={v2Type.mono} key={label}>
              {label}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            aria-label="Mention rate trend"
            className="block h-[158px] w-full"
            preserveAspectRatio="none"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            <defs>
              <linearGradient id="board09-trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--v2-brand)" stopOpacity="0.16" />
                <stop offset="1" stopColor="var(--v2-brand)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="var(--v2-line)" strokeDasharray="3 4" strokeWidth="1">
              <line x1="0" x2={width} y1="0.5" y2="0.5" />
              <line x1="0" x2={width} y1="39.5" y2="39.5" />
              <line x1="0" x2={width} y1="79.5" y2="79.5" />
              <line x1="0" x2={width} y1="118.5" y2="118.5" />
            </g>
            <line stroke="var(--v2-line)" strokeWidth="1" x1="0" x2={width} y1="157.5" y2="157.5" />
            <path d={areaPath} fill="url(#board09-trend-fill)" />
            {upperPath ? (
              <path
                d={upperPath}
                fill="none"
                stroke="var(--v2-brand)"
                strokeDasharray="4 4"
                strokeOpacity="0.42"
                strokeWidth="1.2"
              />
            ) : null}
            {lowerPath ? (
              <path
                d={lowerPath}
                fill="none"
                stroke="var(--v2-brand)"
                strokeDasharray="4 4"
                strokeOpacity="0.42"
                strokeWidth="1.2"
              />
            ) : null}
            <path
              d={linePath}
              fill="none"
              stroke="var(--v2-brand)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
            />
            <circle
              cx={lastX}
              cy={lastY}
              fill="var(--v2-brand)"
              r="5"
              stroke="var(--v2-paper)"
              strokeWidth="2.4"
            />
          </svg>
          <div className="flex justify-between pt-1.5">
            {labelValues.map((label, index) => (
              <span className={v2Type.mono} key={`${label}-${index}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {trend.confidenceUpper.kind !== "measured" || trend.confidenceLower.kind !== "measured" ? (
        <p className="mt-2 flex items-center gap-1.5">
          <StateLabel state="not-measured" />
          <span className={v2Type.meta}>Confidence band is not measured.</span>
        </p>
      ) : null}
    </div>
  );
}

function FilterControl({ value }: { value: Board09Value<string> }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--v2-line)] px-2.5">
      {renderValue(value, (inner) => (
        <span className={v2Type.meta}>{inner}</span>
      ))}
      <V2Icon name="cdown" size={12} className="shrink-0 text-[color:var(--v2-ink3)]" />
    </span>
  );
}

function EvidenceTable({ value }: { value: Board09Data["sourceEvidence"] }) {
  const columns: readonly DataColumn<Board09SourceEvidenceRow>[] = [
    {
      key: "sourcePath",
      header: "Source",
      wrap: false,
      render: (row) => (
        <span className="flex items-center gap-2">
          <input
            aria-label={`Selected source ${row.sourcePath}`}
            checked={row.selected}
            className="h-3.5 w-3.5 accent-[var(--v2-brand)]"
            name="board09-source"
            readOnly
            type="radio"
          />
          <span className={v2Type.num}>{row.sourcePath}</span>
        </span>
      ),
    },
    { key: "checkType", header: "Check type", wrap: false },
    { key: "checkedAt", header: "Checked", wrap: false, className: v2Type.num },
    {
      key: "result",
      header: "Result",
      render: (row) =>
        renderValue(row.result, (result) => <span className={v2Type.bodyStrong}>{result}</span>),
    },
  ];

  return renderValue(value, (rows) => (
    <DataTable
      className="mt-1"
      columns={columns}
      emptyMessage="No source evidence has been recorded."
      rows={rows}
      rowKey={(row) => row.sourcePath}
    />
  ));
}

function TabContent({ tab, data }: { tab: Board09Tab; data: Board09Data }) {
  if (tab === "Recommendations") {
    return (
      <div className="flex min-h-[158px] items-center justify-center border border-dashed border-[var(--v2-line)]">
        {renderValue(data.visibility.recommendations, () => (
          <span className={v2Type.body}>No recommendation result is measured.</span>
        ))}
      </div>
    );
  }
  if (tab === "Citations") {
    return (
      <div className="min-h-[158px]">
        <EvidenceTable value={data.sourceEvidence} />
      </div>
    );
  }
  return <TrendChart trend={data.visibility.trend} />;
}

function VerifiedWork({ data }: { data: Board09Data }) {
  return (
    <section className="min-w-0 px-4 py-[18px] min-[1100px]:border-r min-[1100px]:border-[var(--v2-line)] min-[1100px]:pl-4">
      <h2 className={v2Type.caps}>Verified work</h2>
      <div className="mt-2 flex items-start justify-between gap-2">
        {renderValue(data.verifiedWork.totalPoints, (points) => (
          <span className="font-mono text-[27px] leading-none font-semibold tracking-[-0.03em] text-[color:var(--v2-ink)]">
            {points}
          </span>
        ))}
        {renderValue(data.verifiedWork.level, (level) => (
          <span className="shrink-0 rounded-lg border border-[var(--v2-highlight)] px-2 py-1 text-[11px] font-semibold text-[color:var(--v2-brand)]">
            Level {level.level} · {level.name}
          </span>
        ))}
      </div>
      <p className={v2Type.meta}>work points</p>
      {renderValue(data.verifiedWork.changeSummary, (summary) => (
        <p className="mt-1">
          <span className={v2Type.meta}>{summary}</span>
        </p>
      ))}
      {renderValue(data.verifiedWork.nextLevel, (next) => (
        <p className="mt-2">
          <span className={v2Type.meta}>
            <strong className="font-semibold text-[color:var(--v2-ink2)]">Next:</strong> {next.name}{" "}
            · {next.points} points and a results review
          </span>
        </p>
      ))}
      {renderValue(data.verifiedWork.progressRate, (progress) => (
        <ProgressBar className="mt-2" max={1} showValue={false} value={progress} />
      ))}
      {renderValue(data.verifiedWork.changes, (changes) => (
        <div className="mt-2">
          {changes.slice(0, 2).map((change) => (
            <div className="flex items-center gap-2 py-1" key={change.title}>
              <V2Icon name="check" size={15} className="shrink-0 text-[color:var(--v2-ok)]" />
              <span className="min-w-0 flex-1 truncate">
                <span className={v2Type.body}>{change.title}</span>
              </span>
              {renderValue(change.points, (points) => (
                <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-[color:var(--v2-brand)]">
                  +{points}
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
      <LinkWithArrow className="mt-2 text-[13px]" href={buildV2Href("/v2/my-work", data.context)}>
        View all verified work
      </LinkWithArrow>
    </section>
  );
}

function ReviewResult({ data }: { data: Board09Data }) {
  return (
    <section className="min-w-0 px-4 py-[18px] min-[1100px]:px-4">
      <h2 className={v2Type.caps}>Review the result</h2>
      <p className="mt-2">
        <span className={v2Type.body}>{data.review.message}</span>
      </p>
      <Button asChild className="mt-3 h-10 w-full rounded-lg px-2 text-[13.5px]">
        <a href={buildV2Href("/v2/visibility/results", data.context)}>{data.review.actionLabel}</a>
      </Button>
      {renderValue(data.review.rewardPoints, (points) => (
        <p className="mt-2">
          <span className="text-[11.5px] font-semibold text-[color:var(--v2-brand)]">
            {points} work points after review
          </span>
        </p>
      ))}
      <div className="mt-3 border-t border-[var(--v2-line)] pt-3">
        {data.review.businessResults.kind === "not-measured" ? (
          <p>
            <span className={v2Type.meta}>Business results: analytics not connected</span>
          </p>
        ) : (
          <p className="flex items-center gap-2">
            <StateValue value={data.review.businessResults} />
          </p>
        )}
        <a
          className="mt-1 inline-flex text-[13px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
          href="/settings"
        >
          Connect analytics
        </a>
      </div>
    </section>
  );
}

function CoverageRow({ label, value }: { label: string; value: Board09Value<unknown> }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--v2-line)] py-2">
      <span className={v2Type.body}>{label}</span>
      <span className="shrink-0 text-right">
        {renderValue(value, (inner) => (
          <span className={v2Type.num}>{String(inner)}</span>
        ))}
      </span>
    </div>
  );
}

function EngineList({ value }: { value: Board09Data["observedEngines"] }) {
  return renderValue(value, (engines) => (
    <div className="mt-1">
      {engines.map((engine) => (
        <div className="flex items-center gap-2 py-1" key={engine.name}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--v2-ok)] text-[11px] font-semibold text-[color:var(--v2-paper)]">
            {engine.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className={v2Type.body}>{engine.name}</span>
          </span>
          {renderValue(engine.answerCount, (count) => (
            <span className={v2Type.num}>{count}</span>
          ))}
        </div>
      ))}
    </div>
  ));
}

export function Board09Screen({ data, staleAsOf }: V2ScreenProps<Board09Data>) {
  const [tab, setTab] = useState<Board09Tab>("Mentions");

  return (
    <div className="min-w-0 bg-[var(--v2-paper)] text-[color:var(--v2-ink)]">
      <div className="grid min-w-0 grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_322px]">
        <main className="min-w-0 px-7 py-7">
          <h1 className={v2Type.pageTitle}>Visibility and evidence</h1>
          <div className="mb-[18px] mt-4">
            <VisibilityTabStrip active="b09" context={data.context} />
          </div>
          {staleAsOf ? (
            <p className="mt-1 flex items-center gap-2">
              <StateLabel state="stale" />
              <span className={v2Type.meta}>As of {staleAsOf}.</span>
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-start gap-5">
            <div className="shrink-0">
              {renderValue(data.visibility.mentionRate, (rate) => (
                <span
                  className="font-mono text-[40px] leading-none font-semibold tracking-[-0.04em] text-[color:var(--v2-brand)]"
                  data-testid="board09-rate-value"
                >
                  {formatPercent(rate)}
                </span>
              ))}
              <p className="mt-1">
                {renderValue(data.visibility.mentioned, (mentioned) =>
                  renderValue(data.visibility.successfulAnswers, (successful) => (
                    <span className={v2Type.meta}>
                      {mentioned} of {successful} successful answers
                    </span>
                  )),
                )}
              </p>
            </div>
            <div className="min-w-[280px] flex-1 pt-1">
              <div
                aria-label="Visibility evidence views"
                className="flex min-w-0 gap-5 border-b border-[var(--v2-line)]"
                role="tablist"
              >
                {TABS.map((entry) => (
                  <button
                    aria-selected={tab === entry}
                    className={`border-b-2 px-0 pb-2.5 pt-0 text-left ${v2Type.body} ${tab === entry ? "border-[var(--v2-brand)] text-[color:var(--v2-brand)]" : "border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"}`}
                    key={entry}
                    onClick={() => setTab(entry)}
                    role="tab"
                    type="button"
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <FilterControl value={data.filters.dateWindow} />
              <FilterControl
                value={mapValue(data.filters.engineCount, (count) => `${count} engines`)}
              />
              <FilterControl
                value={mapValue(data.filters.questionCount, (count) => `${count} questions`)}
              />
            </div>
          </div>

          <section className="mt-4" aria-labelledby="board09-mention-rate">
            <h2 className={v2Type.caps} id="board09-mention-rate">
              {tab === "Mentions" ? "Mention rate" : tab}
            </h2>
            <div className="mt-2">
              <TabContent data={data} tab={tab} />
            </div>
            {tab === "Mentions" ? (
              <p className="mt-2">
                <span className={v2Type.meta}>
                  Controlled test answers. These are not customer conversations.
                </span>
              </p>
            ) : null}
          </section>

          <div className="mt-4 grid min-w-0 grid-cols-1 border-t border-[var(--v2-line)] min-[1100px]:grid-cols-[1.42fr_1.18fr_.86fr]">
            <VerifiedWork data={data} />
            <section className="min-w-0 border-t border-[var(--v2-line)] px-4 py-[18px] min-[1100px]:border-t-0 min-[1100px]:border-r min-[1100px]:border-[var(--v2-line)]">
              <h2 className={v2Type.caps}>Source evidence</h2>
              <EvidenceTable value={data.sourceEvidence} />
              <LinkWithArrow
                className="mt-2 text-[13px]"
                href={buildV2Href("/v2/visibility/evidence", data.context)}
              >
                View all source evidence
              </LinkWithArrow>
            </section>
            <ReviewResult data={data} />
          </div>
        </main>

        <aside className="min-w-0 border-t border-[var(--v2-line)] px-6 py-7 min-[1100px]:border-l min-[1100px]:border-t-0">
          <h2 className={v2Type.sectionTitle}>Measurement coverage</h2>
          <div className="mt-3">
            <CoverageRow label="Successful answers" value={data.coverage.successfulAnswers} />
            <CoverageRow label="Failed attempts" value={data.coverage.failedAttempts} />
            <CoverageRow label="Approved questions" value={data.coverage.approvedQuestions} />
            <CoverageRow label="Engines" value={data.coverage.engines} />
            <CoverageRow label="Last checked" value={data.coverage.lastChecked} />
          </div>
          <LinkWithArrow
            className="mt-3 flex w-full justify-between text-[13px]"
            href={buildV2Href("/v2/visibility/evidence", data.context)}
          >
            Inspect answer evidence
          </LinkWithArrow>

          <section className="mt-6 border-t border-[var(--v2-line)] pt-5">
            <h2 className={v2Type.sectionTitle}>Engines observed</h2>
            <EngineList value={data.observedEngines} />
          </section>
        </aside>
      </div>
    </div>
  );
}

export type Board09QuerySnapshot = {
  brandId: string;
  loading?: boolean;
  rate: {
    data?: VisibilityMentionRate;
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  hero: {
    data?: VisibilityHero;
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  cited: {
    data?: CitedUrlPage;
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  engines: {
    data?: { platforms: EngineRanking[] };
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  approvedQuestions: {
    data?: {
      items: readonly {
        state: string;
        updatedAt: string;
        completionRule?: { questionIds?: readonly string[] } | null;
      }[];
    };
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  work: {
    data?: { items: WorkHistoryEventView[] };
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  awards: {
    data?: { items: WorkHistoryEventView[] };
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  summary: {
    data?: Pick<WorkSummaryView, "points" | "currentLevel" | "nextThreshold"> & {
      nextTask: { points: number } | null;
    };
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
  review: {
    data?: { items: readonly { points: number }[] };
    isPending: boolean;
    isError: boolean;
    isStale: boolean;
  };
};
