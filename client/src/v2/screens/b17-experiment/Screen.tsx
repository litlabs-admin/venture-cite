import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { KeyValueList } from "@/v2/shared/ui/KeyValueList";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import "./styles.css";

export type Board17Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; reason: string; asOf: string };

export type Board17Stage = {
  label: string;
  caption: Board17Value<string>;
  status: "completed" | "active" | "pending";
};

export type Board17Chart = {
  labels: readonly string[];
  current: readonly (number | null)[];
  baseline: readonly (number | null)[];
};

export type Board17LogEntry = {
  date: Board17Value<string>;
  event: Board17Value<string>;
  details: Board17Value<string>;
  evidence: Board17Value<{ label: string; path: string } | null>;
};

export type Board17Data = {
  navigation: { brandId: string; mode: "guided" | "expert" };
  brand: { name: Board17Value<string> };
  experiment: {
    title: Board17Value<string>;
    status: Board17Value<"Running" | "Completed" | "Review pending">;
    stages: Board17Value<readonly Board17Stage[]>;
    questionSetName: Board17Value<string>;
    questionCount: Board17Value<number>;
    questionCategories: Board17Value<readonly string[]>;
    engines: Board17Value<readonly string[]>;
    baselineStart: Board17Value<string>;
    baselineEnd: Board17Value<string>;
    changedPage: Board17Value<string>;
    observationStart: Board17Value<string>;
    observationEnd: Board17Value<string>;
    nextMeasurement: Board17Value<string>;
    successThreshold: Board17Value<number>;
    baselineMentions: Board17Value<number>;
    currentMentions: Board17Value<number>;
    baselineDenominator: Board17Value<number>;
    currentDenominator: Board17Value<number>;
    chart: Board17Value<Board17Chart>;
    conclusion: Board17Value<string>;
    conclusionDetail: Board17Value<string>;
    log: Board17Value<readonly Board17LogEntry[]>;
    evidenceLimits: {
      questionCount: Board17Value<number>;
      engineCount: Board17Value<number>;
      geoAndLanguage: Board17Value<string>;
      personalization: Board17Value<string>;
    };
    confounds: readonly { label: string; detail: Board17Value<string> }[];
  };
  nextMeasurement: { workPoints: Board17Value<number> };
  sourceObservation: Board17Value<VisibilityMentionRate>;
};

export const measured = <T,>(value: T): Board17Value<T> => ({ kind: "measured", value });

export const unavailable = <T,>(reason: string): Board17Value<T> => ({
  kind: "not-measured",
  reason,
});

function stateForValue<T>(value: Board17Value<T>): "not-measured" | "failed" | "stale" {
  return value.kind === "measured" ? "not-measured" : value.kind;
}

function ValueText<T>({
  value,
  format = String,
  className,
}: {
  value: Board17Value<T>;
  format?: (value: T) => string;
  className?: string;
}) {
  if (value.kind !== "measured") {
    return <StateLabel state={stateForValue(value)} className={className} />;
  }
  return <span className={className}>{format(value.value)}</span>;
}

function formatDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatStageCaption(value: string): string {
  if (value.startsWith("From ")) return `From ${formatDate(value.slice(5))}`;
  const range = value.split(" – ");
  return range.length === 2
    ? `${formatDate(range[0])} – ${formatDate(range[1])}`
    : formatDate(value);
}

function formatRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function queryHref(data: Board17Data, path: string): string {
  return `${path}?brandId=${encodeURIComponent(data.navigation.brandId)}&mode=${data.navigation.mode}`;
}

function InternalLink({
  data,
  path,
  children,
}: {
  data: Board17Data;
  path: string;
  children: ReactNode;
}) {
  return (
    <LinkWithArrow href={queryHref(data, path)} className={`${v2Type.bodyStrong} b17-link`}>
      {children}
    </LinkWithArrow>
  );
}

function StageTracker({ data }: { data: Board17Data }) {
  const stages = data.experiment.stages;
  return (
    <div className="b17-stage-tracker" aria-label="Experiment stages">
      {stages.kind === "measured" ? (
        stages.value.map((stage, index) => (
          <div className={`b17-stage b17-stage-${stage.status}`} key={stage.label}>
            <div className="b17-stage-marker">
              {stage.status === "completed" ? <V2Icon name="check" size={13} /> : index + 1}
            </div>
            <div className="b17-stage-copy">
              <div className={v2Type.bodyStrong}>{stage.label}</div>
              <div className={`${v2Type.meta} b17-muted`}>
                <ValueText value={stage.caption} format={formatStageCaption} />
              </div>
            </div>
          </div>
        ))
      ) : (
        <StateLabel state={stateForValue(stages)} />
      )}
    </div>
  );
}

function pairedQuestionValue(data: Board17Data): ReactNode {
  const { questionCount, questionCategories } = data.experiment;
  if (questionCount.kind === "measured" && questionCategories.kind === "measured") {
    return `${questionCount.value} questions (${questionCategories.value.join(", ")})`;
  }
  const state = questionCount.kind !== "measured" ? questionCount : questionCategories;
  return <StateLabel state={stateForValue(state)} />;
}

function fractionValue(
  numerator: Board17Value<number>,
  denominator: Board17Value<number>,
  testId: string,
): ReactNode {
  if (numerator.kind !== "measured" || denominator.kind !== "measured") {
    const state = numerator.kind !== "measured" ? numerator : denominator;
    return (
      <span data-testid={testId}>
        <StateLabel state={stateForValue(state)} />
      </span>
    );
  }
  return (
    <span className="b17-number" data-testid={testId}>
      {numerator.value} / {denominator.value}
    </span>
  );
}

function ExperimentDetails({ data }: { data: Board17Data }) {
  const experiment = data.experiment;
  const rows: ReactNode[] = [
    <span key="questions">{pairedQuestionValue(data)}</span>,
    <span key="engines">
      <ValueText value={experiment.engines} format={(engines) => engines.join(", ")} />
    </span>,
    <span key="baseline">
      {experiment.baselineStart.kind === "measured" &&
      experiment.baselineEnd.kind === "measured" ? (
        `${formatRange(experiment.baselineStart.value, experiment.baselineEnd.value)} (14 days)`
      ) : (
        <StateLabel
          state={stateForValue(
            experiment.baselineStart.kind === "measured"
              ? experiment.baselineEnd
              : experiment.baselineStart,
          )}
        />
      )}
    </span>,
    <span key="changed-page">
      <ValueText value={experiment.changedPage} />
    </span>,
    <span key="observation">
      {experiment.observationStart.kind === "measured" &&
      experiment.observationEnd.kind === "measured" ? (
        `${formatRange(experiment.observationStart.value, experiment.observationEnd.value)} (14 days)`
      ) : (
        <StateLabel
          state={stateForValue(
            experiment.observationStart.kind === "measured"
              ? experiment.observationEnd
              : experiment.observationStart,
          )}
        />
      )}
    </span>,
    <span key="threshold">
      {experiment.successThreshold.kind === "measured" ? (
        `≥ +${experiment.successThreshold.value} mentions`
      ) : (
        <StateLabel state={stateForValue(experiment.successThreshold)} />
      )}
      {experiment.successThreshold.kind === "measured" ? (
        <span className="b17-info-icon" aria-label="Threshold decision rule">
          i
        </span>
      ) : null}
      {experiment.baselineMentions.kind === "measured" &&
      experiment.successThreshold.kind === "measured" &&
      experiment.currentDenominator.kind === "measured"
        ? ` (from ${experiment.baselineMentions.value} to ${experiment.baselineMentions.value + experiment.successThreshold.value} of ${experiment.currentDenominator.value})`
        : null}
    </span>,
  ];
  const labels = [
    "Approved question set",
    "Engines (fixed)",
    "Baseline window",
    "Changed page",
    "Observation window",
    "Success threshold",
  ];
  return (
    <Panel className="b17-panel" padding="compact">
      <PanelHeader
        title="Experiment details"
        action={
          <InternalLink data={data} path="/v2/my-work/experiment/edit">
            Edit
          </InternalLink>
        }
      />
      <div className="b17-detail-list">
        {labels.map((label, index) => (
          <div className="b17-detail-row" key={label}>
            <div className={v2Type.label}>{label}</div>
            <div className={v2Type.body}>{rows[index]}</div>
            <div className="b17-detail-action">
              {label === "Approved question set" ? (
                <InternalLink data={data} path="/v2/my-work/questions">
                  View questions
                </InternalLink>
              ) : null}
              {label === "Engines (fixed)" ? (
                <InternalLink data={data} path="/v2/settings">
                  View settings
                </InternalLink>
              ) : null}
              {label === "Changed page" ? (
                <InternalLink data={data} path="/v2/visibility">
                  View page
                </InternalLink>
              ) : null}
              {label === "Success threshold" ? (
                <InternalLink data={data} path="/v2/learn">
                  Learn more
                </InternalLink>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function VisibilityComparison({ data }: { data: Board17Data }) {
  const experiment = data.experiment;
  const chart = experiment.chart;
  return (
    <Panel className="b17-panel" padding="compact">
      <PanelHeader title="Visibility comparison" />
      <div className="b17-chart-head">
        <div className="b17-legend">
          <span>
            <i className="b17-dot b17-dot-current" /> Current (
            {fractionValue(
              experiment.currentMentions,
              experiment.currentDenominator,
              "b17-current-legend",
            )}
            )
          </span>
          <span>
            <i className="b17-dot b17-dot-baseline" /> Baseline (
            {fractionValue(
              experiment.baselineMentions,
              experiment.baselineDenominator,
              "b17-baseline-legend",
            )}
            )
          </span>
        </div>
      </div>
      <div className="b17-chart-wrap">
        <div className="b17-chart-area">
          {chart.kind === "measured" ? (
            <TrendChart
              ariaLabel="Current and baseline visibility mentions"
              height={150}
              series={[
                {
                  id: "current",
                  label: "Current",
                  style: "solid",
                  points: chart.value.current.map((y, index) => ({ x: String(index), y })),
                },
                {
                  id: "baseline",
                  label: "Baseline",
                  style: "dashed",
                  points: chart.value.baseline.map((y, index) => ({ x: String(index), y })),
                },
              ]}
              xLabels={chart.value.labels}
              yDomain={[0, 40]}
              yTicks={[40, 30, 20, 10, 0]}
            />
          ) : (
            <div className="b17-chart-empty">
              <StateLabel state={stateForValue(chart)} />
            </div>
          )}
        </div>
        <div className="b17-chart-metrics">
          <div className="b17-metric">
            <div className={v2Type.statBig}>
              {fractionValue(
                experiment.currentMentions,
                experiment.currentDenominator,
                "b17-current-mentions",
              )}
            </div>
            <div className={v2Type.meta}>Current mentions</div>
          </div>
          <div className="b17-metric">
            <div className={v2Type.statBig}>
              {fractionValue(
                experiment.baselineMentions,
                experiment.baselineDenominator,
                "b17-baseline-mentions",
              )}
            </div>
            <div className={v2Type.meta}>Baseline mentions</div>
          </div>
          <div className="b17-conclusion">
            <div className="b17-conclusion-title">
              <V2Icon name="warn" size={15} /> <ValueText value={experiment.conclusion} />
            </div>
            <div className={`${v2Type.meta} b17-muted`}>
              <ValueText value={experiment.conclusionDetail} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ExperimentLog({ data }: { data: Board17Data }) {
  const log = data.experiment.log;
  const columns: readonly DataColumn<Board17LogEntry>[] = [
    {
      key: "date",
      header: "Date",
      wrap: false,
      render: (row) => <ValueText value={row.date} format={formatDate} />,
    },
    { key: "event", header: "Event", render: (row) => <ValueText value={row.event} /> },
    { key: "details", header: "Details", render: (row) => <ValueText value={row.details} /> },
    {
      key: "evidence",
      header: "Evidence",
      wrap: false,
      render: (row) =>
        row.evidence.kind === "measured" && row.evidence.value ? (
          <InternalLink data={data} path={row.evidence.value.path}>
            {row.evidence.value.label}
          </InternalLink>
        ) : row.evidence.kind === "measured" ? (
          "—"
        ) : (
          <StateLabel state={stateForValue(row.evidence)} />
        ),
    },
  ];
  return (
    <Panel className="b17-panel b17-log-panel" padding="compact">
      <PanelHeader title="Experiment log" />
      {log.kind === "measured" ? (
        <DataTable
          columns={columns}
          rows={log.value}
          rowKey={(row) => (row.event.kind === "measured" ? row.event.value : "unknown-event")}
          className="b17-log"
        />
      ) : (
        <StateLabel state={stateForValue(log)} />
      )}
    </Panel>
  );
}

function ControlsRail({ data }: { data: Board17Data }) {
  const experiment = data.experiment;
  const controlItems = [
    {
      label: "Status",
      value: (
        <Chip tone="ok" leadingDot>
          <ValueText value={experiment.status} />
        </Chip>
      ),
    },
    {
      label: "Start date",
      value: <ValueText value={experiment.observationStart} format={formatDate} />,
    },
    {
      label: "End date",
      value: <ValueText value={experiment.observationEnd} format={formatDate} />,
    },
    {
      label: "Next measurement",
      value: <ValueText value={experiment.nextMeasurement} format={formatDate} />,
    },
    {
      label: "Engines",
      value: <ValueText value={experiment.engines} format={(engines) => engines.join(", ")} />,
    },
    {
      label: "Question set",
      value: (
        <ValueText value={experiment.questionCount} format={(count) => `${count} questions`} />
      ),
    },
    { label: "Changed page", value: <ValueText value={experiment.changedPage} /> },
  ];
  return (
    <Panel className="b17-panel" padding="compact">
      <PanelHeader
        title="Experiment controls"
        action={
          <InternalLink data={data} path="/v2/my-work/experiment/edit">
            Edit
          </InternalLink>
        }
      />
      <KeyValueList items={controlItems} className="b17-kv" />
    </Panel>
  );
}

function EvidenceLimits({ data }: { data: Board17Data }) {
  const limits = data.experiment.evidenceLimits;
  const items = [
    {
      label: "Question set",
      value: (
        <ValueText value={limits.questionCount} format={(count) => `Fixed (${count} questions)`} />
      ),
    },
    {
      label: "Engines",
      value: <ValueText value={limits.engineCount} format={(count) => `Fixed (${count})`} />,
    },
    { label: "Geo and language", value: <ValueText value={limits.geoAndLanguage} /> },
    { label: "Personalization", value: <ValueText value={limits.personalization} /> },
  ];
  return (
    <Panel className="b17-panel" padding="compact">
      <PanelHeader title="Evidence limits" />
      <InfoNote>
        We compare the same questions and engines. A before-and-after change alone does not
        establish cause.
      </InfoNote>
      <KeyValueList items={items} className="b17-kv b17-limits" />
    </Panel>
  );
}

function ConfoundingChanges({ data }: { data: Board17Data }) {
  return (
    <Panel className="b17-panel" padding="compact">
      <PanelHeader title="Confounding changes" />
      <InfoNote className="b17-confound-note">
        Avoid other changes during the observation window.
      </InfoNote>
      <div className="b17-confounds">
        {data.experiment.confounds.map((confound) => (
          <div className="b17-confound" key={confound.label}>
            <div className={v2Type.bodyStrong}>{confound.label}</div>
            <div className={v2Type.meta}>
              <ValueText value={confound.detail} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NextSteps({ data }: { data: Board17Data }) {
  const next = data.experiment.nextMeasurement;
  return (
    <Panel className="b17-panel" padding="compact">
      <PanelHeader title="Next steps" />
      <div className="b17-next-step">
        <div className={v2Type.label}>Next measurement</div>
        <div className={`${v2Type.bodyStrong} b17-next-date`}>
          <ValueText value={next} format={formatDate} />
        </div>
        <div className={v2Type.meta}>
          <ValueText value={measured("We will collect a new set of results on this date.")} />
        </div>
      </div>
      <div className="b17-points-row">
        <span className={v2Type.label}>Work points</span>
        <span data-testid="b17-work-points">
          {data.nextMeasurement.workPoints.kind === "measured" ? (
            <Chip tone="brand" icon="star">
              {data.nextMeasurement.workPoints.value} points
            </Chip>
          ) : (
            <StateLabel state={stateForValue(data.nextMeasurement.workPoints)} />
          )}
        </span>
      </div>
      <div className={`${v2Type.meta} b17-award-copy`}>
        Awarded for completing the results review.
      </div>
      <Button
        className={`${v2Type.bodyStrong} b17-review-button`}
        disabled
        data-testid="b17-review-button"
      >
        Review next measurement
      </Button>
      <div className={`${v2Type.meta} b17-disabled-copy`}>
        Available on <ValueText value={next} format={formatDate} />
      </div>
    </Panel>
  );
}

export function Board17Screen({ data, staleAsOf }: V2ScreenProps<Board17Data>) {
  return (
    <section className="b17-board" aria-label="Experiment workspace">
      <div className="b17-topbar">
        <div className={`${v2Type.body} b17-breadcrumb`}>
          <a href={queryHref(data, "/v2/my-work")} className="b17-breadcrumb-link">
            My work
          </a>
          <span aria-hidden="true">/</span>
          <a href={queryHref(data, "/v2/my-work/experiment")} className="b17-breadcrumb-link">
            Experiment
          </a>
        </div>
        <div className={`${v2Type.meta} b17-prototype-status`}>Prototype · Sample data</div>
      </div>
      <main className="b17-main-column">
        <span className="sr-only" data-testid="b17-brand-name">
          <ValueText value={data.brand.name} />
        </span>
        <div className="b17-main-header">
          <h1 className={`${v2Type.pageTitle} b17-title`}>
            <ValueText value={data.experiment.title} />
          </h1>
        </div>
        {staleAsOf ? (
          <InfoNote className="b17-stale-note">
            This experiment data is stale as of {formatDate(staleAsOf)}.
          </InfoNote>
        ) : null}
        <StageTracker data={data} />
        <ExperimentDetails data={data} />
        <VisibilityComparison data={data} />
        <ExperimentLog data={data} />
      </main>
      <aside className="b17-rail" aria-label="Experiment support">
        <ControlsRail data={data} />
        <EvidenceLimits data={data} />
        <ConfoundingChanges data={data} />
        <NextSteps data={data} />
      </aside>
    </section>
  );
}
