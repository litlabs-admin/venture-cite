import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { Breadcrumb } from "@/v2/shared/ui/Breadcrumb";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { Chip } from "@/v2/shared/ui/Chip";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board36Value<T> =
  { kind: "measured"; value: T } | { kind: "not-measured"; reason: string };

export type Board36TrendPoint = {
  weekStart: string;
  mentionRate: number | null;
  citationRate: number | null;
  failureRate: number | null;
};

export type Board36EngineRow = {
  engine: string;
  total: number;
  answered: number;
  mentioned: number;
  cited: number;
  failed: number;
};

export type Board36UrlRow = { url: string; citations: number; engineCount: number };
export type Board36CompetitorRow = { name: string; mentions: number; engineCount: number };

export type Board36Data = {
  navigation: { brandId: string; mode: V2Mode };
  question: {
    id: string;
    text: string;
    status: string;
    paused: boolean;
    category: string | null;
    journeyStage: string | null;
    region: string;
    createdAt: string;
  };
  trend: Board36Value<readonly Board36TrendPoint[]>;
  metrics: {
    mentionRate: Board36Value<number>;
    citationRate: Board36Value<number>;
    failureRate: Board36Value<number>;
    mentionCount: number;
    citationCount: number;
    failedCount: number;
    attemptCount: number;
  };
  engineRecords: readonly Board36EngineRow[];
  citedUrls: readonly Board36UrlRow[];
  competitors: readonly Board36CompetitorRow[];
  health: "good" | "needs-attention" | "not-measured";
  onTogglePause: () => void;
  pauseSaving: boolean;
};

type Board36ScreenProps = V2ScreenProps<Board36Data>;

function v2Href(path: string, navigation: Board36Data["navigation"]): string {
  const search = new URLSearchParams({ brandId: navigation.brandId, mode: navigation.mode });
  return `${path}?${search.toString()}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function metricValue(value: Board36Value<number>): string {
  return value.kind === "measured" ? `${value.value}%` : "Not measured";
}

function MetricTile({
  label,
  value,
  count,
  denominator,
  tone,
}: {
  label: string;
  value: Board36Value<number>;
  count: number;
  denominator: number;
  tone: "brand" | "ok" | "bad" | "neutral";
}) {
  return (
    <div className="min-w-0">
      <div className={v2Type.caps}>{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`${value.kind === "measured" ? v2Type.statBig : v2Type.bodyStrong}`}
          style={
            value.kind === "measured"
              ? { color: `var(--v2-${tone === "neutral" ? "ink3" : tone})` }
              : undefined
          }
        >
          {metricValue(value)}
        </span>
      </div>
      <div className={`${v2Type.meta} mt-1`}>
        {count} / {denominator}
      </div>
    </div>
  );
}

function TrendPanel({ trend }: { trend: Board36Value<readonly Board36TrendPoint[]> }) {
  return (
    <Panel>
      <PanelHeader
        title="Performance trend"
        info="Weekly mention, citation and failure rates for this question."
      />
      {trend.kind === "not-measured" ? (
        <div className="flex flex-col gap-1">
          <StateLabel state="not-measured" />
          <span className={v2Type.meta}>{trend.reason}</span>
        </div>
      ) : (
        <TrendChart
          ariaLabel="Mention, citation and failure rate trend"
          height={190}
          legend
          series={[
            {
              id: "mention",
              label: "Mention rate",
              points: trend.value.map((p, i) => ({ x: String(i), y: p.mentionRate })),
              style: "solid",
            },
            {
              id: "citation",
              label: "Citation rate",
              points: trend.value.map((p, i) => ({ x: String(i), y: p.citationRate })),
              style: "dashed",
            },
            {
              id: "failure",
              label: "Failed attempts",
              points: trend.value.map((p, i) => ({ x: String(i), y: p.failureRate })),
              style: "dotted",
            },
          ]}
          xLabels={trend.value.map((p) => formatDate(p.weekStart))}
          yDomain={[0, 100]}
          yTicks={[0, 25, 50, 75, 100]}
        />
      )}
    </Panel>
  );
}

function EngineTable({ rows }: { rows: readonly Board36EngineRow[] }) {
  const columns: DataColumn<Board36EngineRow>[] = [
    { key: "engine", header: "Engine" },
    {
      key: "answered",
      header: "Answered",
      numeric: true,
      render: (row) =>
        row.total > 0
          ? `${row.answered} / ${row.total} (${Math.round((row.answered / row.total) * 100)}%)`
          : "0 / 0",
    },
    {
      key: "mentioned",
      header: "Mentioned",
      numeric: true,
      render: (row) =>
        row.answered > 0
          ? `${row.mentioned} (${Math.round((row.mentioned / row.answered) * 100)}%)`
          : "0",
    },
    {
      key: "cited",
      header: "Cited",
      numeric: true,
      render: (row) =>
        row.answered > 0 ? `${row.cited} (${Math.round((row.cited / row.answered) * 100)}%)` : "0",
    },
    {
      key: "failed",
      header: "Failed",
      numeric: true,
      render: (row) =>
        row.total > 0 ? `${row.failed} (${Math.round((row.failed / row.total) * 100)}%)` : "0",
    },
    { key: "total", header: "Total", numeric: true },
  ];
  return (
    <Panel>
      <PanelHeader title="Answer records by engine" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.engine}
        emptyMessage="No engine has answered this question yet."
      />
    </Panel>
  );
}

function CitedUrlsPanel({ rows }: { rows: readonly Board36UrlRow[] }) {
  const columns: DataColumn<Board36UrlRow>[] = [
    {
      key: "url",
      header: "URL",
      wrap: true,
      render: (row) => <span className="break-all">{row.url}</span>,
    },
    { key: "citations", header: "Citations", numeric: true },
    { key: "engineCount", header: "Engines", numeric: true },
  ];
  return (
    <Panel>
      <PanelHeader title="Top cited URLs" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.url}
        emptyMessage="No cited URL yet."
      />
    </Panel>
  );
}

function CompetitorsPanel({ rows }: { rows: readonly Board36CompetitorRow[] }) {
  const columns: DataColumn<Board36CompetitorRow>[] = [
    { key: "name", header: "Brand" },
    { key: "mentions", header: "Mentions", numeric: true },
    { key: "engineCount", header: "Engines", numeric: true },
  ];
  return (
    <Panel>
      <PanelHeader title="Competitors mentioned" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        emptyMessage="No competitor has been mentioned for this question."
      />
    </Panel>
  );
}

export function Board36Screen({ data, staleAsOf }: Board36ScreenProps) {
  const { question, metrics } = data;
  const metaLine = [
    question.category ?? "Uncategorised",
    question.journeyStage ?? "Journey stage not set",
    `Region ${question.region}`,
    `Added ${formatDate(question.createdAt)}`,
  ].join(" · ");

  return (
    <div className="min-w-0 bg-[var(--v2-paper)] px-7 pb-10 pt-7" data-testid="board36-screen">
      <Breadcrumb
        items={[
          { label: "Buyer questions", href: v2Href("/v2/visibility/questions", data.navigation) },
          { label: "Question detail", current: true },
        ]}
        className="mb-3"
      />
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={v2Type.pageTitle}>{question.text}</h1>
        <Chip tone={question.paused ? "neutral" : "ok"}>
          {question.paused ? "Paused" : "Approved"}
        </Chip>
      </div>
      <p className={`${v2Type.meta} mb-1`}>{metaLine}</p>
      <p className={v2Type.meta}>Question ID: {question.id}</p>
      {staleAsOf ? (
        <div className="my-4">
          <StateLabel state="stale" />
          <span className={`${v2Type.meta} ml-2`}>As of {staleAsOf}.</span>
        </div>
      ) : null}
      <div className="mt-6">
        <TwoColumn
          main={
            <div className="flex flex-col gap-6">
              <TrendPanel trend={data.trend} />
              <div className="grid grid-cols-2 gap-6 border-y border-[var(--v2-line)] py-5 sm:grid-cols-4">
                <MetricTile
                  label="Mention rate"
                  value={metrics.mentionRate}
                  count={metrics.mentionCount}
                  denominator={metrics.attemptCount}
                  tone="brand"
                />
                <MetricTile
                  label="Citation rate"
                  value={metrics.citationRate}
                  count={metrics.citationCount}
                  denominator={metrics.attemptCount}
                  tone="ok"
                />
                <MetricTile
                  label="Failed attempts"
                  value={metrics.failureRate}
                  count={metrics.failedCount}
                  denominator={metrics.attemptCount}
                  tone="bad"
                />
                <MetricTile
                  label="Recommendation rate"
                  value={{
                    kind: "not-measured",
                    reason: "No recommendation extractor exists yet.",
                  }}
                  count={0}
                  denominator={0}
                  tone="neutral"
                />
              </div>
              <EngineTable rows={data.engineRecords} />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <CitedUrlsPanel rows={data.citedUrls} />
                <CompetitorsPanel rows={data.competitors} />
              </div>
            </div>
          }
          rightRail={
            <div className="flex flex-col gap-5">
              <Panel>
                <PanelHeader title="Question health" />
                {data.health === "not-measured" ? (
                  <StateLabel state="not-measured" />
                ) : (
                  <>
                    <div
                      className={`${v2Type.bodyStrong}`}
                      style={{ color: data.health === "good" ? "var(--v2-ok)" : "var(--v2-warn)" }}
                    >
                      {data.health === "good" ? "Good" : "Needs attention"}
                    </div>
                    <p className={`${v2Type.meta} mt-1`}>
                      {data.health === "good"
                        ? "The question is performing well with consistent answers across engines."
                        : "Answers are inconsistent or declining across engines."}
                    </p>
                  </>
                )}
              </Panel>
              <InfoNote>
                <div className="mb-2">
                  <span className="font-semibold">Observed: </span>
                  {metrics.attemptCount > 0
                    ? `Brand absent in ${metrics.attemptCount - metrics.mentionCount} of ${metrics.attemptCount} attempts`
                    : "No attempt recorded yet."}
                </div>
                <div className="mb-2">
                  <span className="font-semibold">Unknown: </span>
                  Why each model omitted the brand.
                </div>
                <div>
                  <span className="font-semibold">Next check: </span>
                  Repeat the same question set after the next page change.
                </div>
              </InfoNote>
              <Panel>
                <PanelHeader title="Actions" />
                <div className="flex flex-col gap-2.5">
                  <Button
                    asChild
                    className="h-10 justify-start rounded-lg text-[13.5px] font-semibold"
                  >
                    <a href={v2Href("/v2/diagnostics/prompts", data.navigation)}>
                      <V2Icon name="diag" size={15} className="mr-2" />
                      Diagnose result
                    </a>
                  </Button>
                  <Button
                    disabled={data.pauseSaving}
                    onClick={data.onTogglePause}
                    type="button"
                    variant="outline"
                    className="h-10 justify-start rounded-lg text-[13.5px] font-semibold"
                  >
                    {data.pauseSaving
                      ? "Saving…"
                      : question.paused
                        ? "Resume measurement"
                        : "Pause measurement"}
                  </Button>
                </div>
              </Panel>
            </div>
          }
        />
      </div>
    </div>
  );
}
