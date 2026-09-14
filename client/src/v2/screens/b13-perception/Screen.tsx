import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DiagnosticsTabStrip } from "@/v2/diagnostics/DiagnosticsTabStrip";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { Divider } from "@/v2/shared/ui/Divider";
import { Panel } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { StatusDot } from "@/v2/shared/ui/StatusDot";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { UnderlineTabs, type UnderlineTab } from "@/v2/shared/ui/UnderlineTabs";
import "./styles.css";

export type Board13Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string };

export type Board13Coverage = "High" | "Medium" | "Low" | "Conflicting";
export type Board13Confidence = "High" | "Medium" | "Low";
export type Board13Action = "Keep" | "Prioritize" | "Improve" | "Clarify";

export type Board13Theme = {
  id: string;
  name: Board13Value<string>;
  observed: Board13Value<string>;
  approved: Board13Value<string>;
  coverage: Board13Value<Board13Coverage>;
  coverageCount: Board13Value<number>;
  coverageTotal: Board13Value<number>;
  coverageRate: Board13Value<number>;
  confidence: Board13Value<Board13Confidence>;
  action: Board13Value<Board13Action>;
  selected: boolean;
};

export type Board13Answer = {
  id: string;
  model: Board13Value<string>;
  snippet: Board13Value<string>;
  sourceUrl: Board13Value<string>;
  sourceHref: Board13Value<string>;
  retrievedAt: Board13Value<string>;
};

export type Board13Data = {
  brandId: Board13Value<string>;
  brandName: Board13Value<string>;
  summary: Board13Value<string>;
  accurateThemes: Board13Value<number>;
  missingThemes: Board13Value<number>;
  conflictingClaims: Board13Value<number>;
  unverifiedImpressions: Board13Value<number>;
  themes: Board13Value<readonly Board13Theme[]>;
  answers: Board13Value<readonly Board13Answer[]>;
  successfulAnswers: Board13Value<number>;
  mentionedAnswers: Board13Value<number>;
  measuredAt: Board13Value<string>;
  evidenceBoundaries: {
    observed: Board13Value<string>;
    unknown: Board13Value<string>;
    nextCheck: Board13Value<string>;
    noCausalClaim: Board13Value<string>;
    finalNote: Board13Value<string>;
  };
};

type ValueStateProps<T> = {
  state: Board13Value<T>;
  render: (value: T) => ReactNode;
  className?: string;
};

function ValueState<T>({ state, render, className }: ValueStateProps<T>) {
  switch (state.kind) {
    case "measured":
      return <span className={className}>{render(state.value)}</span>;
    case "not-measured":
      return (
        <span className={className} title={state.reason}>
          <StateLabel state="not-measured" />
        </span>
      );
    case "failed":
      return (
        <span className={className} title={state.reason}>
          <StateLabel state="failed" />
        </span>
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function measuredText(value: Board13Value<string>, fallback: string): ReactNode {
  return value.kind === "measured" ? (
    value.value
  ) : (
    <ValueState state={value} render={() => fallback} />
  );
}

function metricIcon(kind: "accurate" | "missing" | "conflicting" | "unverified") {
  const icon =
    kind === "accurate"
      ? "check"
      : kind === "missing"
        ? "warn"
        : kind === "conflicting"
          ? "warn"
          : "q";
  const tone =
    kind === "accurate"
      ? "text-[color:var(--v2-ok)]"
      : kind === "conflicting"
        ? "text-[color:var(--v2-bad)]"
        : "text-[color:var(--v2-brand)]";
  return <V2Icon name={icon} size={17} className={tone} />;
}

function MetricTile({
  id,
  label,
  value,
  caption,
  kind,
}: {
  id: string;
  label: string;
  value: Board13Value<number>;
  caption: ReactNode;
  kind: "accurate" | "missing" | "conflicting" | "unverified";
}) {
  return (
    <div className="b13-metric-tile">
      <div className={`${v2Type.label} b13-metric-label`}>
        {metricIcon(kind)}
        <span>{label}</span>
      </div>
      <div className={`${v2Type.statBig} b13-metric-number`} data-testid={`v2-b13-metric-${id}`}>
        <ValueState state={value} render={(number) => String(number)} />
      </div>
      <p className={`${v2Type.meta} b13-metric-caption`}>{caption}</p>
    </div>
  );
}

function coverageTone(value: Board13Coverage): "ok" | "brand" | "bad" {
  switch (value) {
    case "High":
    case "Medium":
      return "ok";
    case "Low":
      return "brand";
    case "Conflicting":
      return "bad";
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function CoverageCell({ row }: { row: Board13Theme }) {
  if (row.coverage.kind !== "measured") {
    return <ValueState state={row.coverage} render={() => null} />;
  }

  return (
    <span className="b13-coverage-cell">
      <StatusDot size="md" tone={coverageTone(row.coverage.value)} />
      <span className={v2Type.body}>{row.coverage.value}</span>
      <ValueState
        className="b13-fraction"
        state={row.coverageCount}
        render={(count) => (
          <span className={v2Type.mono}>
            ({count}/
            <ValueState state={row.coverageTotal} render={(total) => String(total)} />)
          </span>
        )}
      />
    </span>
  );
}

function ModelMark({ model }: { model: string }) {
  const icon =
    model === "ChatGPT"
      ? "doc"
      : model === "Gemini"
        ? "geo"
        : model === "Claude"
          ? "diag"
          : "facts";
  const tone = model === "ChatGPT" ? "text-[color:var(--v2-ink)]" : "text-[color:var(--v2-brand)]";
  return <V2Icon name={icon} size={19} className={tone} title={model} />;
}

function modelName(value: Board13Value<string>): ReactNode {
  return (
    <ValueState
      state={value}
      render={(model) => (
        <span className="b13-model">
          <ModelMark model={model} />
          <span>{model}</span>
        </span>
      )}
    />
  );
}

function themeColumns(
  selectedThemeId: string,
  onSelect: (row: Board13Theme) => void,
): readonly DataColumn<Board13Theme>[] {
  return [
    {
      key: "name",
      header: "Theme",
      className: "b13-col-theme",
      render: (row) => (
        <span className="b13-theme-name">
          {row.id === selectedThemeId ? <span aria-hidden="true" data-row-selected="true" /> : null}
          <ValueState state={row.name} render={(value) => value} />
        </span>
      ),
    },
    {
      key: "observed",
      header: "Observed description",
      className: "b13-col-observed",
      render: (row) => <ValueState state={row.observed} render={(value) => value} />,
    },
    {
      key: "approved",
      header: "Approved fact",
      className: "b13-col-approved",
      render: (row) => <ValueState state={row.approved} render={(value) => value} />,
    },
    {
      key: "coverage",
      header: "Coverage",
      className: "b13-col-coverage",
      render: (row) => <CoverageCell row={row} />,
    },
    {
      key: "confidence",
      header: "Confidence",
      className: "b13-col-confidence",
      render: (row) => <ValueState state={row.confidence} render={(value) => value} />,
    },
    {
      key: "action",
      header: "Action",
      className: "b13-col-action",
      render: (row) => (
        <Button
          className="b13-action h-auto min-h-0 rounded-lg px-0 py-0 text-[12.2px] font-semibold"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row);
          }}
          size="default"
          type="button"
          variant="link"
        >
          <ValueState state={row.action} render={(value) => value} />
        </Button>
      ),
    },
  ];
}

const answerColumns: readonly DataColumn<Board13Answer>[] = [
  {
    key: "model",
    header: "Model",
    className: "b13-answer-model",
    render: (row) => modelName(row.model),
  },
  {
    key: "snippet",
    header: "Answer snippet",
    className: "b13-answer-snippet",
    render: (row) => <ValueState state={row.snippet} render={(value) => `“${value}”`} />,
  },
  {
    key: "sourceUrl",
    header: "Source URL",
    className: "b13-answer-url",
    render: (row) => (
      <ValueState
        state={row.sourceUrl}
        render={(label) => (
          <ValueState
            state={row.sourceHref}
            render={(href) => (
              <a
                className={`${v2Type.body} b13-source-link`}
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                {label}
              </a>
            )}
          />
        )}
      />
    ),
  },
  {
    key: "retrievedAt",
    header: "Retrieved",
    className: "b13-answer-retrieved",
    render: (row) => <ValueState state={row.retrievedAt} render={(value) => value} />,
  },
];

function SummaryPanel({ data }: { data: Board13Data }) {
  return (
    <Panel className="b13-summary-panel" padding="compact">
      <h3 className={v2Type.sectionTitle}>Perception summary</h3>
      <p className={`${v2Type.body} b13-summary-copy`}>
        <ValueState state={data.summary} render={(value) => value} />
      </p>
      <div className="b13-metrics">
        <MetricTile
          caption={
            <>
              Consistently aligned
              <br />
              with approved facts.
            </>
          }
          id="accurateThemes"
          kind="accurate"
          label="Accurate themes"
          value={data.accurateThemes}
        />
        <MetricTile
          caption={
            <>
              Important facts rarely
              <br />
              mentioned.
            </>
          }
          id="missingThemes"
          kind="missing"
          label="Missing themes"
          value={data.missingThemes}
        />
        <MetricTile
          caption={
            <>
              At least one answer
              <br />
              contradicts approved facts
              <br />
              or is misleading.
            </>
          }
          id="conflictingClaims"
          kind="conflicting"
          label="Conflicting claims"
          value={data.conflictingClaims}
        />
        <MetricTile
          caption={
            <>
              Common impressions
              <br />
              without clear source support.
            </>
          }
          id="unverifiedImpressions"
          kind="unverified"
          label="Unverified impressions"
          value={data.unverifiedImpressions}
        />
      </div>
    </Panel>
  );
}

function ThemeTable({ data }: { data: Board13Data }) {
  const rows = data.themes.kind === "measured" ? data.themes.value : [];
  const firstSelected = rows.find((row) => row.selected)?.id ?? rows[0]?.id ?? "";
  const [selectedThemeId, setSelectedThemeId] = useState(firstSelected);

  return (
    <div className="b13-theme-table-wrap">
      <DataTable
        className="b13-data-table"
        columns={themeColumns(selectedThemeId, (row) => setSelectedThemeId(row.id))}
        emptyMessage={<ValueState state={data.themes} render={() => null} />}
        onRowClick={(row) => setSelectedThemeId(row.id)}
        rowKey={(row) => row.id}
        rows={rows}
      />
    </div>
  );
}

function EvidenceTabs({ data }: { data: Board13Data }) {
  const [tab, setTab] = useState("raw");
  const tabs: readonly UnderlineTab[] = [
    { value: "raw", label: "Raw answer evidence" },
    { value: "sources", label: "Source URLs" },
  ];
  const rows = data.answers.kind === "measured" ? data.answers.value : [];

  return (
    <div className="b13-evidence-tabs">
      <UnderlineTabs items={tabs} onChange={setTab} value={tab} />
      <div className="b13-answer-table-wrap">
        <DataTable
          className="b13-data-table b13-answer-table"
          columns={answerColumns}
          emptyMessage={<ValueState state={data.answers} render={() => null} />}
          rows={rows}
        />
      </div>
    </div>
  );
}

function BoundaryItem({
  icon,
  label,
  value,
}: {
  icon: "eye" | "q" | "clock";
  label: string;
  value: Board13Value<string>;
}) {
  return (
    <div className="b13-boundary-item">
      <span className="b13-boundary-icon">
        <V2Icon name={icon} size={17} />
      </span>
      <div>
        <h3 className={`${v2Type.bodyStrong} b13-boundary-label`}>{label}</h3>
        <p className={v2Type.body}>
          <ValueState state={value} render={(text) => text} />
        </p>
      </div>
    </div>
  );
}

function EvidenceRail({ data }: { data: Board13Data }) {
  return (
    <aside aria-label="Evidence boundaries" className="b13-evidence-rail">
      <h2 className={v2Type.sectionTitle}>Evidence boundaries</h2>
      <div className="b13-boundaries">
        <BoundaryItem icon="eye" label="Observed" value={data.evidenceBoundaries.observed} />
        <BoundaryItem icon="q" label="Unknown" value={data.evidenceBoundaries.unknown} />
        <BoundaryItem icon="clock" label="Next check" value={data.evidenceBoundaries.nextCheck} />
      </div>
      <Divider className="b13-rail-divider" />
      <Panel className="b13-no-causal" padding="compact">
        <V2Icon name="shield" size={38} className="b13-claim-icon" />
        <div>
          <h3 className={v2Type.sectionTitle}>No causal claim</h3>
          <p className={`${v2Type.body} b13-claim-copy`}>
            <ValueState state={data.evidenceBoundaries.noCausalClaim} render={(text) => text} />
          </p>
          <p className={v2Type.body}>
            <ValueState state={data.evidenceBoundaries.finalNote} render={(text) => text} />
          </p>
        </div>
      </Panel>
    </aside>
  );
}

export function Board13Screen({ data, staleAsOf }: V2ScreenProps<Board13Data>) {
  const brandIdForNav = data.brandId.kind === "measured" ? data.brandId.value : undefined;
  return (
    <div className="b13-screen" data-testid="v2-board13">
      <header className="b13-header">
        <h1 className={v2Type.pageTitle}>Find the cause. Choose a useful fix.</h1>
        <div className={`${v2Type.meta} b13-header-meta`}>
          <span className={`${v2Type.bodyStrong} b13-header-context`}>
            <ValueState render={(value) => `Last measured ${value}`} state={data.measuredAt} />
          </span>
          {staleAsOf ? <StateLabel state="stale" className="b13-stale-label" /> : null}
        </div>
      </header>
      <div className="b13-diagnostic-tabs">
        <DiagnosticsTabStrip active="b13" brandId={brandIdForNav} mode="expert" />
      </div>
      <TwoColumn
        className="b13-columns"
        main={
          <div className="b13-main-column">
            <h2 className={`${v2Type.cardTitle} b13-content-title`}>
              How AI answers describe {measuredText(data.brandName, "your brand")}
            </h2>
            <p className={`${v2Type.pageSub} b13-content-subtitle`}>
              Compare what AI says about your brand with your approved brand facts.
            </p>
            <SummaryPanel data={data} />
            <section className="b13-observed-section">
              <h2 className={v2Type.sectionTitle}>Observed themes and evidence</h2>
              <p className={`${v2Type.meta} b13-section-subtitle`}>
                How AI answers describe {measuredText(data.brandName, "your brand")}, compared to
                your approved brand facts.
              </p>
              <ThemeTable data={data} />
            </section>
            <EvidenceTabs data={data} />
          </div>
        }
        rightRail={<EvidenceRail data={data} />}
        rightRailWidth={322}
      />
    </div>
  );
}
