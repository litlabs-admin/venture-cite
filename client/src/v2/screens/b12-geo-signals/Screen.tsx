import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2IconName } from "@/v2/contracts/icons";
import { DiagnosticsTabStrip } from "@/v2/diagnostics/DiagnosticsTabStrip";
import { DonutChart } from "@/v2/shared/charts/DonutChart";
import { Sparkline } from "@/v2/shared/charts/Sparkline";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { PointsPill } from "@/v2/shared/ui/PointsPill";
import { SectionHeading } from "@/v2/shared/ui/SectionHeading";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board12Measured<T> = { kind: "measured"; value: T };
export type Board12NotMeasured = { kind: "not-measured"; reason: string };
export type Board12Value<T> = Board12Measured<T> | Board12NotMeasured;

export type Board12Status = "detected" | "verified" | "confirmation" | "stale";

export type Board12Trend = {
  delta: number;
  points: readonly number[];
};

export type Board12SourceSignal = {
  id: string;
  sourceType: Board12Value<string>;
  description: Board12Value<string>;
  icon: V2IconName;
  detected: Board12Value<number>;
  verified: Board12Value<number>;
  status: Board12Value<Board12Status>;
  trend: Board12Value<Board12Trend>;
};

export type Board12SeriesPoint = { x: string; y: number | null };

export type Board12Series = {
  primary: readonly Board12SeriesPoint[];
  median: readonly Board12SeriesPoint[];
  xLabels: readonly string[];
};

export type Board12SourceMix = {
  verifiedTotal: Board12Value<number>;
  segments: readonly {
    id: string;
    label: Board12Value<string>;
    share: Board12Value<number>;
  }[];
};

export type Board12Opportunity = {
  title: Board12Value<string>;
  description: Board12Value<string>;
  points: Board12Value<number>;
  evidence: Board12Value<string>;
  mechanism: Board12Value<string>;
  uncertainty: Board12Value<"Low" | "Medium" | "High">;
  uncertaintyDetail: Board12Value<string>;
};

export type Board12EvidenceGap = {
  id: string;
  title: string;
  detail: string;
};

export type Board12Verification = {
  title: Board12Value<string>;
  detail: Board12Value<string>;
  why: Board12Value<string>;
  effort: Board12Value<number>;
  upside: Board12Value<"Low" | "Medium" | "High">;
};

export type Board12Data = {
  brandId: string;
  brand: { name: Board12Value<string> };
  signalCoverage: {
    score: Board12Value<number>;
    previousScore: Board12Value<number>;
    change: Board12Value<number>;
    periodStart: string;
    periodEnd: string;
    series: Board12Value<Board12Series>;
  };
  sourceSignals: readonly Board12SourceSignal[];
  sourceMix: Board12SourceMix;
  opportunity: Board12Opportunity;
  missingEvidence: readonly Board12EvidenceGap[];
  nextVerification: Board12Verification;
};

export type Board12ScreenProps = {
  data: Board12Data;
  staleAsOf?: string;
};

function isMeasured<T>(value: Board12Value<T>): value is Board12Measured<T> {
  return value.kind === "measured";
}

function measuredValue<T>(value: Board12Value<T>): T | undefined {
  return isMeasured(value) ? value.value : undefined;
}

function valueNode<T>(value: Board12Value<T>, render: (item: T) => ReactNode) {
  if (!isMeasured(value)) {
    return (
      <span title={value.reason}>
        <StateLabel state="not-measured" />
      </span>
    );
  }
  return render(value.value);
}

function statusNode(value: Board12Value<Board12Status>) {
  if (!isMeasured(value)) return valueNode(value, () => null);
  const definition: Record<Board12Status, { icon: V2IconName; label: ReactNode; tone: string }> = {
    detected: { icon: "eye", label: "Detected", tone: "var(--v2-brand)" },
    verified: { icon: "check", label: "Verified", tone: "var(--v2-ok)" },
    confirmation: {
      icon: "q",
      label: (
        <>
          <span>User confirmation</span>
          <br />
          <span>required</span>
        </>
      ),
      tone: "var(--v2-brand)",
    },
    stale: { icon: "cdown", label: "Stale", tone: "var(--v2-warn)" },
  };
  const item = definition[value.value];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
      style={{ color: item.tone }}
    >
      <V2Icon name={item.icon} size={14} />
      <span>{item.label}</span>
    </span>
  );
}

function ArrowAction({ children }: { children: ReactNode }) {
  return (
    <Button className="h-10 rounded-lg px-3 text-[13.5px]" variant="ghost" type="button">
      {children}
      <V2Icon name="arrow" size={14} />
    </Button>
  );
}

function ChartLegend({ brandName, hasMedian }: { brandName: string; hasMedian: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="Chart legend">
      <span className="inline-flex items-center gap-2 text-[12px] text-[color:var(--v2-ink3)]">
        <span className="h-2 w-2 rounded-full bg-[var(--v2-series-1)]" />
        {brandName}
      </span>
      {hasMedian ? (
        <span className="inline-flex items-center gap-2 text-[12px] text-[color:var(--v2-ink3)]">
          <span className="h-2 w-2 rounded-full bg-[var(--v2-series-2)]" />
          Industry median
        </span>
      ) : null}
    </div>
  );
}

function SignalChart({
  value,
  endpointText,
  brandName,
}: {
  value: Board12Value<Board12Series>;
  endpointText?: string;
  brandName: string;
}) {
  return valueNode(value, (series) => {
    // No industry-median source exists (see data.ts) - the median series is
    // always empty on live data. Only the fixture, which stands in for an
    // approved render rather than a real read, carries median points, so the
    // dashed line and its legend entry are conditional on data actually being
    // there rather than on which mode is rendering.
    const hasMedian = series.median.length > 0;
    return (
      <div>
        <TrendChart
          ariaLabel="Verified signal coverage over the last 30 days"
          endpointBadge={endpointText ? { seriesId: "primary", text: endpointText } : undefined}
          height={218}
          series={
            hasMedian
              ? [
                  {
                    id: "primary",
                    label: brandName,
                    points: series.primary,
                    style: "solid",
                    area: true,
                  },
                  {
                    id: "median",
                    label: "Industry median",
                    points: series.median,
                    style: "dashed",
                  },
                ]
              : [
                  {
                    id: "primary",
                    label: brandName,
                    points: series.primary,
                    style: "solid",
                    area: true,
                  },
                ]
          }
          xLabels={series.xLabels}
          yDomain={[0, 100]}
          yTicks={[0, 25, 50, 75, 100]}
        />
        <ChartLegend brandName={brandName} hasMedian={hasMedian} />
      </div>
    );
  });
}

function SourceTable({ rows }: { rows: readonly Board12SourceSignal[] }) {
  const columns: readonly DataColumn<Board12SourceSignal>[] = [
    {
      key: "sourceType",
      header: "Source",
      className: "min-w-[190px] !px-2 !py-2 normal-case",
      render: (row) => (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-[color:var(--v2-brand)]">
            <V2Icon name={row.icon} size={15} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-[color:var(--v2-ink)]">
              {valueNode(row.sourceType, String)}
            </div>
            <div className={v2Type.meta}>{valueNode(row.description, String)}</div>
          </div>
        </div>
      ),
    },
    {
      key: "detected",
      header: "Detected",
      numeric: true,
      className: "!px-2 !py-2 normal-case",
      render: (row) =>
        valueNode(row.detected, (item) => <span className={v2Type.num}>{item}</span>),
    },
    {
      key: "verified",
      header: "Verified",
      numeric: true,
      className: "!px-2 !py-2 normal-case",
      render: (row) =>
        valueNode(row.verified, (item) => <span className={v2Type.num}>{item}</span>),
    },
    {
      key: "status",
      header: "Status",
      className: "min-w-[150px] !px-2 !py-2 normal-case",
      render: (row) => statusNode(row.status),
    },
    {
      key: "trend",
      header: "Trend (30d)",
      numeric: true,
      className: "min-w-[108px] !px-2 !py-2 normal-case",
      render: (row) =>
        valueNode(row.trend, (item) => (
          <div className="flex items-center justify-end gap-2">
            <Sparkline
              points={item.points}
              trend={item.delta > 0 ? "up" : item.delta < 0 ? "down" : "flat"}
              width={46}
              height={20}
            />
            <span
              className={
                item.delta >= 0 ? "text-[color:var(--v2-ok)]" : "text-[color:var(--v2-warn)]"
              }
            >
              {item.delta >= 0 ? "+" : "−"}
              {Math.abs(item.delta)}%
            </span>
          </div>
        )),
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />;
}

function OpportunityDetails({
  brandId,
  opportunity,
}: {
  brandId: string;
  opportunity: Board12Opportunity;
}) {
  return (
    <div className="mt-5 grid gap-5 border-t border-[var(--v2-line)] pt-4 md:grid-cols-3">
      <div>
        <p className={v2Type.caps}>Evidence</p>
        <p className={`${v2Type.body} mt-2 flex items-start gap-2`}>
          <V2Icon name="doc" size={17} />
          <span>{valueNode(opportunity.evidence, String)}</span>
        </p>
      </div>
      <div>
        <p className={v2Type.caps}>Expected mechanism</p>
        <p className={`${v2Type.body} mt-2 flex items-start gap-2`}>
          <V2Icon name="link" size={17} />
          <span>{valueNode(opportunity.mechanism, String)}</span>
        </p>
      </div>
      <div className="flex flex-col items-start gap-3">
        <div>
          <p className={v2Type.caps}>Uncertainty</p>
          <p className={`${v2Type.body} mt-2`}>
            <span className="mr-2 font-semibold text-[color:var(--v2-warn)]">
              {valueNode(opportunity.uncertainty, String)}
            </span>
            {valueNode(opportunity.uncertaintyDetail, String)}
          </p>
        </div>
        {/* No route in this product creates a task from a GEO-signal
            opportunity directly (see data.ts) - this links to the real work
            queue rather than performing an action nothing on the backend
            can fulfil yet. */}
        <Button asChild className="h-10 rounded-lg px-3 text-[13.5px]">
          <a href={`/v2/my-work?${new URLSearchParams({ brandId, mode: "expert" }).toString()}`}>
            Create improvement task
          </a>
        </Button>
      </div>
    </div>
  );
}

function OpportunityCard({
  brandId,
  opportunity,
}: {
  brandId: string;
  opportunity: Board12Opportunity;
}) {
  return (
    <Panel className="mt-5" padding="spacious" tone="inset">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="font-mono text-[13px] text-[color:var(--v2-ink3)]">1</span>
          <div className="min-w-0">
            <h3 className={v2Type.cardTitle}>{valueNode(opportunity.title, String)}</h3>
            <p className={`${v2Type.body} mt-2 max-w-[680px]`}>
              {valueNode(opportunity.description, String)}
            </p>
          </div>
        </div>
        {valueNode(opportunity.points, (item) => (
          <PointsPill points={item} />
        ))}
      </div>
      <OpportunityDetails brandId={brandId} opportunity={opportunity} />
    </Panel>
  );
}

function SourceMixSection({ mix }: { mix: Board12SourceMix }) {
  const segments = mix.segments.flatMap((segment) => {
    const label = measuredValue(segment.label);
    const share = measuredValue(segment.share);
    return label !== undefined && share !== undefined
      ? [{ id: segment.id, label, value: share }]
      : [];
  });
  return (
    <Panel padding="standard">
      <PanelHeader title="Source mix" />
      <p className={`${v2Type.meta} -mt-2 mb-4`}>Verified signals by source type.</p>
      <div className="flex items-center gap-5">
        <DonutChart
          centreCaption="verified"
          centreValue={
            isMeasured(mix.verifiedTotal) ? String(mix.verifiedTotal.value) : "Not measured"
          }
          segments={segments}
          size={146}
          thickness={18}
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          {mix.segments.map((segment, index) => (
            <div className="flex items-center gap-2 text-[12px]" key={segment.id}>
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0"
                style={{ backgroundColor: `var(--v2-series-${Math.min(index + 1, 6)})` }}
              />
              <span className="min-w-0 flex-1 truncate text-[color:var(--v2-ink2)]">
                {valueNode(segment.label, String)}
              </span>
              <span className="font-mono tabular-nums text-[color:var(--v2-ink)]">
                {valueNode(segment.share, (item) => `${item}%`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function MissingEvidenceSection({ rows }: { rows: readonly Board12EvidenceGap[] }) {
  return (
    <Panel padding="standard">
      <PanelHeader title="Missing evidence" action={<ArrowAction>View all</ArrowAction>} />
      <p className={`${v2Type.meta} -mt-2 mb-3`}>
        High-value signals that are absent or hard to verify.
      </p>
      <div className="divide-y divide-[var(--v2-line)]">
        {rows.map((row) => (
          <div className="py-3 first:pt-0 last:pb-0" key={row.id}>
            <p className={v2Type.bodyStrong}>{row.title}</p>
            <p className={`${v2Type.meta} mt-1`}>{row.detail}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NextVerificationSection({ verification }: { verification: Board12Verification }) {
  // No route in this product decides "the next best signal to confirm" - that
  // ranking has no backend producer (see data.ts). The action buttons below
  // only appear once a real title exists to act on; a `Not measured` panel
  // never carries a button that has nothing behind it to do.
  const hasVerification = verification.title.kind === "measured";
  return (
    <Panel padding="standard">
      <PanelHeader title="Next verification" />
      <p className={`${v2Type.meta} -mt-2 mb-4`}>The next best signal to confirm.</p>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[color:var(--v2-brand)]">
          <V2Icon name="check" size={17} />
        </span>
        <div className="min-w-0">
          <p className={v2Type.bodyStrong}>{valueNode(verification.title, String)}</p>
          <p className={`${v2Type.meta} mt-1`}>{valueNode(verification.detail, String)}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--v2-line)] pt-4">
        <p className={v2Type.caps}>Why this matters</p>
        <p className={`${v2Type.body} mt-1`}>{valueNode(verification.why, String)}</p>
      </div>
      <div className="mt-4 grid gap-3 border-t border-[var(--v2-line)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={v2Type.caps}>Estimated effort</span>
          {valueNode(verification.effort, (item) => (
            <PointsPill points={item} />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={v2Type.caps}>Potential upside</span>
          <span className="font-semibold text-[color:var(--v2-ink2)]">
            {valueNode(verification.upside, String)}
          </span>
        </div>
      </div>
      {hasVerification ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="h-10 rounded-lg px-3 text-[13.5px]" type="button">
            Mark as verified
          </Button>
          <Button className="h-10 rounded-lg px-3 text-[13.5px]" variant="outline" type="button">
            Review source <V2Icon name="arrow" size={14} />
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

export function Board12Screen({ data, staleAsOf }: Board12ScreenProps) {
  const score = measuredValue(data.signalCoverage.score);
  const change = measuredValue(data.signalCoverage.change);
  const brandName = measuredValue(data.brand.name) ?? "Not measured";
  return (
    <section
      className="v2-mono flex min-h-[calc(100vh-52px)] min-w-0 flex-col"
      data-testid="v2-board12"
    >
      <header className="border-b border-[var(--v2-line)] px-6 pb-0 pt-7 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className={v2Type.pageTitle}>Find the cause. Choose a useful fix.</h1>
            <p className={`${v2Type.pageSub} mt-2 max-w-[760px]`}>
              Diagnose how AI engines find, understand, and trust your brand — and turn signals into
              action.
            </p>
          </div>
          {staleAsOf ? <StateLabel state="stale" /> : null}
        </div>
        <div className="mt-7">
          <DiagnosticsTabStrip active="b12" brandId={data.brandId} mode="expert" />
        </div>
      </header>

      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-6 py-7 lg:px-8">
          <SectionHeading
            description="Your presence across AI engines, data sources, and the open web."
            action={
              <div className="flex items-center gap-1 rounded-lg border border-[var(--v2-line)] p-1">
                {["7D", "14D", "30D"].map((period) => (
                  <Button
                    className={`h-10 rounded-lg px-2.5 text-[13.5px] ${period === "30D" ? "bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]" : "text-[color:var(--v2-ink3)]"}`}
                    key={period}
                    type="button"
                    variant="ghost"
                  >
                    {period}
                  </Button>
                ))}
              </div>
            }
          >
            Where engines find and trust {brandName}
          </SectionHeading>

          <Panel className="mt-5" padding="spacious">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={v2Type.caps}>Verified signal coverage</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={v2Type.statBig}>
                    {score ?? <StateLabel state="not-measured" />}
                  </span>
                  <span className={v2Type.statUnit}>/ 100</span>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={
                    change !== undefined && change >= 0
                      ? "text-[color:var(--v2-ok)]"
                      : "text-[color:var(--v2-warn)]"
                  }
                >
                  {change !== undefined ? (
                    `${change >= 0 ? "+" : "−"}${Math.abs(change)}`
                  ) : (
                    <StateLabel state="not-measured" />
                  )}
                </p>
                <p className={`${v2Type.meta} mt-1`}>vs. previous 30 days</p>
              </div>
            </div>
            <div className="mt-5">
              <SignalChart
                brandName={brandName}
                endpointText={score === undefined ? undefined : String(score)}
                value={data.signalCoverage.series}
              />
            </div>
          </Panel>

          <Panel className="mt-5" padding="spacious">
            <PanelHeader
              title="Signal coverage by source"
              action={
                <span className={v2Type.meta}>
                  {data.signalCoverage.periodStart} – {data.signalCoverage.periodEnd}
                </span>
              }
            />
            <p className={`${v2Type.meta} -mt-2 mb-5`}>
              How clearly AI systems can find and verify {brandName} across the web.
            </p>
            <SourceTable rows={data.sourceSignals} />
          </Panel>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className={v2Type.sectionTitle}>Top opportunity from diagnostics</h2>
              <p className={`${v2Type.meta} mt-1`}>
                A useful, high-leverage improvement based on current signals.
              </p>
            </div>
            <ArrowAction>View all opportunities</ArrowAction>
          </div>
          <OpportunityCard brandId={data.brandId} opportunity={data.opportunity} />
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-5 border-t border-[var(--v2-line)] bg-[var(--v2-inset)] px-6 py-7 lg:w-[390px] lg:border-l lg:border-t-0 lg:px-6">
          <SourceMixSection mix={data.sourceMix} />
          <MissingEvidenceSection rows={data.missingEvidence} />
          <NextVerificationSection verification={data.nextVerification} />
        </aside>
      </div>
    </section>
  );
}
