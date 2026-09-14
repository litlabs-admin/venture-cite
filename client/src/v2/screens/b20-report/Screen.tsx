import { useState, type ReactNode } from "react";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { StatStrip } from "@/v2/shared/ui/StatStrip";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { Breadcrumb } from "@/v2/shared/ui/Breadcrumb";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { LevelBadge } from "@/v2/shared/ui/LevelBadge";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { TextArea } from "@/v2/shared/ui/TextArea";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board20Value<T> =
  { kind: "measured"; value: T } | { kind: "not-measured"; reason: string };

export type Board20Trend = { points: readonly (number | null)[]; xLabels: readonly string[] };
export type Board20EngineBar = { engine: string; rate: number | null };
export type Board20Question = {
  id: string;
  text: string;
  mentions: number;
  attempts: number;
  cited: number;
  engineCount: number;
};
export type Board20Domain = { domain: string; citations: number; share: number };
export type Board20Omission = {
  questionId: string;
  text: string;
  engineCount: number;
  engineTotal: number;
  competitorNames: readonly string[];
};
export type Board20ChangeItem = { title: string; status: "Verified"; verifiedAt: string };
export type Board20Progress = {
  level: number;
  levelName: string;
  pointsEarned: number;
  pointsTarget: number | null;
  nextLevelName: string | null;
};

export type Board20Data = {
  navigation: { brandId: string; mode: V2Mode };
  period: Board20Value<{ start: string; end: string }>;
  workCompleted: Board20Value<number>;
  observedVisibility: Board20Value<{ mentions: number; attempts: number }>;
  citations: Board20Value<{ count: number; attempts: number }>;
  businessResultsDetail: string;
  trend: Board20Value<Board20Trend>;
  engineComparison: Board20Value<readonly Board20EngineBar[]>;
  buyerQuestions: readonly Board20Question[];
  citedDomains: readonly Board20Domain[];
  omissions: readonly Board20Omission[];
  completedChanges: readonly Board20ChangeItem[];
  progress: Board20Value<Board20Progress>;
  reportNote: { value: string; savedAt: string | null };
  onSaveNote: (note: string) => void;
  noteSaving: boolean;
  onExport: (format: "csv" | "json") => void;
};

type Board20ScreenProps = V2ScreenProps<Board20Data>;

const tabs = [
  { label: "Overview", path: "/v2/visibility", active: false },
  { label: "Answers", path: "/v2/visibility/evidence", active: false },
  { label: "Report", path: "/v2/visibility/report", active: true },
  { label: "Citations", path: "/v2/visibility/citations", active: false },
  { label: "Questions", path: "/v2/visibility/questions", active: false },
  { label: "Results", path: "/v2/visibility/results", active: false },
] as const;

function v2Href(path: string, navigation: Board20Data["navigation"]): string {
  const search = new URLSearchParams({ brandId: navigation.brandId, mode: navigation.mode });
  return `${path}?${search.toString()}`;
}

function Board20Tabs({ navigation }: { navigation: Board20Data["navigation"] }) {
  return (
    <nav aria-label="Visibility sections" className="border-b border-[var(--v2-line)]">
      <div className="flex flex-wrap gap-6">
        {tabs.map((tab) => (
          <a
            key={tab.label}
            aria-current={tab.active ? "page" : undefined}
            className={`pb-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)] ${
              tab.active
                ? "border-b-2 border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
                : "text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
            }`}
            href={v2Href(tab.path, navigation)}
          >
            {tab.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function notMeasured(value: Board20Value<unknown>): ReactNode {
  return value.kind === "not-measured" ? (
    <div className="flex flex-col gap-1">
      <StateLabel state="not-measured" />
      <span className={v2Type.meta}>{value.reason}</span>
    </div>
  ) : null;
}

function fractionCaption(numerator: number, denominator: number, unit: string): string {
  return denominator > 0 ? `${numerator} / ${denominator} ${unit}` : `No ${unit} observed`;
}

function TrendPanel({ trend }: { trend: Board20Value<Board20Trend> }) {
  return (
    <Panel>
      <PanelHeader title="Visibility trend" />
      {trend.kind === "not-measured" ? (
        notMeasured(trend)
      ) : (
        <>
          <TrendChart
            ariaLabel="Visibility trend, mentions per week"
            height={168}
            series={[
              {
                id: "brand",
                label: "Your brand",
                points: trend.value.points.map((point, index) => ({
                  x: String(index),
                  y: point,
                })),
                style: "solid",
                area: true,
              },
            ]}
            xLabels={trend.value.xLabels}
            yDomain={[0, Math.max(1, ...trend.value.points.filter((p): p is number => p !== null))]}
            yTicks={[]}
            legend
          />
          <InfoNote className="mt-3">
            Peer comparison is not available. This line shows your brand only.
          </InfoNote>
        </>
      )}
    </Panel>
  );
}

function EngineComparisonPanel({
  engineComparison,
}: {
  engineComparison: Board20Value<readonly Board20EngineBar[]>;
}) {
  return (
    <Panel>
      <PanelHeader title="Engine comparison" />
      {engineComparison.kind === "not-measured" ? (
        notMeasured(engineComparison)
      ) : engineComparison.value.length === 0 ? (
        <p className={v2Type.meta}>No engine has answered in this period.</p>
      ) : (
        <>
          {/* BarCompareChart requires at least two series, and a peer
              average does not exist for this brand - see the note below.
              A simple bar row avoids implying a comparison that has no
              source. */}
          <div className="flex flex-col gap-3">
            {engineComparison.value.map((bar) => (
              <ProgressBar
                key={bar.engine}
                label={bar.engine}
                max={100}
                value={bar.rate ?? 0}
                tone="brand"
              />
            ))}
          </div>
          <InfoNote className="mt-3">Peer comparison is not available for any engine.</InfoNote>
        </>
      )}
    </Panel>
  );
}

function BuyerQuestionsPanel({
  questions,
  navigation,
}: {
  questions: readonly Board20Question[];
  navigation: Board20Data["navigation"];
}) {
  const columns: DataColumn<Board20Question>[] = [
    { key: "text", header: "Question", wrap: true },
    {
      key: "mentions",
      header: "Mentions",
      numeric: true,
      render: (row) => `${row.mentions} / ${row.attempts}`,
    },
    {
      key: "cited",
      header: "Cited",
      numeric: true,
      render: (row) => `${row.cited} / ${row.attempts}`,
    },
    { key: "engineCount", header: "Engines", numeric: true },
  ];
  return (
    <Panel>
      <PanelHeader title="Top buyer questions" />
      <DataTable
        columns={columns}
        rows={questions}
        rowKey={(row) => row.id}
        emptyMessage="No buyer questions were answered in this period."
      />
      <LinkWithArrow className="mt-3" href={v2Href("/v2/visibility/questions", navigation)}>
        View all buyer questions
      </LinkWithArrow>
    </Panel>
  );
}

function CitedDomainsPanel({
  domains,
  navigation,
}: {
  domains: readonly Board20Domain[];
  navigation: Board20Data["navigation"];
}) {
  const columns: DataColumn<Board20Domain>[] = [
    { key: "domain", header: "Domain" },
    { key: "citations", header: "Citations", numeric: true },
    { key: "share", header: "Share", numeric: true, render: (row) => `${row.share}%` },
  ];
  return (
    <Panel>
      <PanelHeader title="Cited source domains" />
      <DataTable
        columns={columns}
        rows={domains}
        rowKey={(row) => row.domain}
        emptyMessage="No citation carried a source link in this period."
      />
      <LinkWithArrow className="mt-3" href={v2Href("/v2/visibility/citations", navigation)}>
        View all cited sources
      </LinkWithArrow>
    </Panel>
  );
}

function OmissionsPanel({ omissions }: { omissions: readonly Board20Omission[] }) {
  const columns: DataColumn<Board20Omission>[] = [
    { key: "text", header: "Question", wrap: true },
    {
      key: "engineCount",
      header: "Engines",
      numeric: true,
      render: (row) => `${row.engineCount} / ${row.engineTotal}`,
    },
    {
      key: "competitorNames",
      header: "Competitors mentioned",
      render: (row) =>
        row.competitorNames.length > 0
          ? `${row.competitorNames.length} (${row.competitorNames.join(", ")})`
          : "0",
    },
  ];
  return (
    <Panel>
      <PanelHeader
        title="Brand omissions"
        info="Questions where a competitor was mentioned and your brand was not."
      />
      <DataTable
        columns={columns}
        rows={omissions}
        rowKey={(row) => row.questionId}
        emptyMessage="No question showed a competitor without your brand in this period."
      />
    </Panel>
  );
}

function CompletedChangesPanel({
  changes,
  navigation,
}: {
  changes: readonly Board20ChangeItem[];
  navigation: Board20Data["navigation"];
}) {
  const columns: DataColumn<Board20ChangeItem>[] = [
    { key: "title", header: "Change", wrap: true },
    { key: "status", header: "Status", render: () => <StateLabel state="verified" /> },
    { key: "verifiedAt", header: "Verified" },
  ];
  return (
    <Panel>
      <PanelHeader title="Completed changes" />
      <DataTable
        columns={columns}
        rows={changes}
        rowKey={(row, index) => `${row.title}-${index}`}
        emptyMessage="No verified change has been recorded yet."
      />
      <LinkWithArrow className="mt-3" href={v2Href("/v2/my-work", navigation)}>
        View all page changes
      </LinkWithArrow>
    </Panel>
  );
}

function ProgressPanel({ progress }: { progress: Board20Value<Board20Progress> }) {
  return (
    <Panel>
      <PanelHeader title="Private brand progress" />
      {progress.kind === "not-measured" ? (
        notMeasured(progress)
      ) : (
        <div className="flex items-start gap-4">
          <LevelBadge level={progress.value.level} name={progress.value.levelName} />
          <div className="min-w-0 flex-1">
            <div className={v2Type.bodyStrong}>
              Level {progress.value.level} · {progress.value.levelName}
            </div>
            <div className={`${v2Type.meta} mb-2`}>
              {progress.value.pointsEarned} work points total
            </div>
            {progress.value.pointsTarget !== null ? (
              <>
                <ProgressBar
                  value={progress.value.pointsEarned}
                  max={progress.value.pointsTarget}
                  label={`${progress.value.pointsEarned} / ${progress.value.pointsTarget} points`}
                />
                {progress.value.nextLevelName ? (
                  <p className={`${v2Type.meta} mt-2`}>Next: {progress.value.nextLevelName}</p>
                ) : null}
              </>
            ) : (
              <p className={v2Type.meta}>This is the highest level.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function ReportNotesPanel({
  reportNote,
  onSaveNote,
  saving,
}: {
  reportNote: Board20Data["reportNote"];
  onSaveNote: (note: string) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(reportNote.value);
  const dirty = draft !== reportNote.value;
  return (
    <Panel>
      <PanelHeader title="Report notes" />
      <TextArea
        label="Notes for this review period"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="What changed, and what to watch next period."
        value={draft}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={v2Type.meta}>
          {reportNote.savedAt ? `Saved ${reportNote.savedAt}` : "Not saved yet"}
        </span>
        <Button
          disabled={!dirty || saving}
          onClick={() => onSaveNote(draft)}
          size="sm"
          type="button"
        >
          {saving ? "Saving…" : "Save note"}
        </Button>
      </div>
    </Panel>
  );
}

function ExportControl({ onExport }: { onExport: (format: "csv" | "json") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        className="h-10 rounded-lg px-4 text-[13.5px] font-semibold"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <V2Icon name="dl" size={15} className="mr-1.5" />
        Export report
        <V2Icon name="cdown" size={12} className="ml-1.5" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] py-1 shadow-lg">
          {(["csv", "json"] as const).map((format) => (
            <button
              className="block w-full px-3 py-2 text-left text-[13px] text-[color:var(--v2-ink2)] hover:bg-[var(--v2-inset)]"
              key={format}
              onClick={() => {
                onExport(format);
                setOpen(false);
              }}
              type="button"
            >
              Download {format.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Board20Screen({ data, staleAsOf }: Board20ScreenProps) {
  const periodText =
    data.period.kind === "measured"
      ? `${data.period.value.start} – ${data.period.value.end}`
      : "No observation period yet";

  return (
    <div className="min-w-0 bg-[var(--v2-paper)] px-7 pb-10 pt-7" data-testid="board20-screen">
      <Breadcrumb
        items={[
          { label: "Visibility", href: v2Href("/v2/visibility", data.navigation) },
          { label: "Report", current: true },
        ]}
        className="mb-3"
      />
      <PageHeader
        title="AI visibility report"
        date={periodText}
        actions={<ExportControl onExport={data.onExport} />}
      />
      <div className="mb-5 mt-4">
        <Board20Tabs navigation={data.navigation} />
      </div>
      {staleAsOf ? (
        <div className="mb-4">
          <StateLabel state="stale" />
          <span className={`${v2Type.meta} ml-2`}>As of {staleAsOf}.</span>
        </div>
      ) : null}
      <StatStrip
        className="mb-6"
        items={[
          {
            label: "Work completed",
            value:
              data.workCompleted.kind === "measured" ? (
                data.workCompleted.value
              ) : (
                <StateLabel state="not-measured" />
              ),
            unit: data.workCompleted.kind === "measured" ? "verified changes" : undefined,
            tone: data.workCompleted.kind === "measured" ? "brand" : "neutral",
          },
          {
            label: "Observed visibility",
            value:
              data.observedVisibility.kind === "measured" ? (
                data.observedVisibility.value.mentions
              ) : (
                <StateLabel state="not-measured" />
              ),
            unit: data.observedVisibility.kind === "measured" ? "mentions" : undefined,
            caption:
              data.observedVisibility.kind === "measured"
                ? fractionCaption(
                    data.observedVisibility.value.mentions,
                    data.observedVisibility.value.attempts,
                    "attempts",
                  )
                : data.observedVisibility.reason,
          },
          {
            label: "Citations",
            value:
              data.citations.kind === "measured" ? (
                data.citations.value.count
              ) : (
                <StateLabel state="not-measured" />
              ),
            unit: data.citations.kind === "measured" ? "mentions with links" : undefined,
            caption:
              data.citations.kind === "measured"
                ? fractionCaption(
                    data.citations.value.count,
                    data.citations.value.attempts,
                    "attempts",
                  )
                : data.citations.reason,
          },
          {
            label: "Business results",
            value: "Not connected",
            tone: "neutral",
            caption: data.businessResultsDetail,
          },
        ]}
      />
      <TwoColumn
        main={
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TrendPanel trend={data.trend} />
              <EngineComparisonPanel engineComparison={data.engineComparison} />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BuyerQuestionsPanel questions={data.buyerQuestions} navigation={data.navigation} />
              <CitedDomainsPanel domains={data.citedDomains} navigation={data.navigation} />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <OmissionsPanel omissions={data.omissions} />
              <CompletedChangesPanel changes={data.completedChanges} navigation={data.navigation} />
            </div>
          </div>
        }
        rightRail={
          <div className="flex flex-col gap-5">
            <ProgressPanel progress={data.progress} />
            <ReportNotesPanel
              reportNote={data.reportNote}
              onSaveNote={data.onSaveNote}
              saving={data.noteSaving}
            />
            <InfoNote>
              We compare the same questions and engines. A before-and-after change alone does not
              establish cause.
              <div className="mt-2 flex items-center gap-2 text-[color:var(--v2-ok)]">
                <V2Icon name="shield" size={14} />
                <span className="font-semibold">No points are lost when visibility falls.</span>
              </div>
            </InfoNote>
          </div>
        }
      />
    </div>
  );
}
