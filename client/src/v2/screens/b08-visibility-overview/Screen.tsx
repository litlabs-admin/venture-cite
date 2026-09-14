import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { visibilityTabHref, VisibilityTabStrip } from "@/v2/visibility/VisibilityTabStrip";

export type Board08Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string };

export type Board08Trend = {
  points: readonly (number | null)[];
  xLabels: readonly [string, string, string];
};

export type Board08WorkItem = {
  title: string;
  icon: "doc" | "map";
  state: Board08Value<string>;
  points: Board08Value<number>;
};

export type Board08BusinessResults =
  | { kind: "not-measured"; label: string; detail: string }
  | { kind: "connected"; label: string; detail: string };

export type Board08Data = {
  navigation: { brandId: string; mode: V2Mode };
  visibility: {
    mentionRate: Board08Value<number>;
    mentioned: Board08Value<number>;
    successfulAnswers: Board08Value<number>;
    failedAttempts: Board08Value<number>;
    recommendations: Board08Value<number>;
    citations: Board08Value<number>;
    engineCount: Board08Value<number>;
    approvedQuestionCount: Board08Value<number>;
    lastObservedAt: Board08Value<string>;
    trend: Board08Value<Board08Trend>;
  };
  completedWork: readonly Board08WorkItem[];
  businessResults: Board08BusinessResults;
  nextAction: Board08Value<{ description: string; rewardPoints: number }>;
};

type Board08ScreenProps = V2ScreenProps<Board08Data>;

function v2Href(path: string, navigation: Board08Data["navigation"]): string {
  return visibilityTabHref(path, navigation);
}

function unavailableState(value: Exclude<Board08Value<unknown>, { kind: "measured" }>) {
  return <StateLabel state={value.kind === "failed" ? "failed" : "not-measured"} />;
}

function renderCoverageValue(value: Board08Value<number> | Board08Value<string>): ReactNode {
  if (value.kind === "measured") {
    return <span className={`${v2Type.num} font-semibold`}>{value.value}</span>;
  }
  return unavailableState(value);
}

function renderValue<T>(value: Board08Value<T>, format: (entry: T) => ReactNode): ReactNode {
  switch (value.kind) {
    case "measured":
      return format(value.value);
    case "not-measured":
    case "failed":
      return unavailableState(value);
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function valueReason(value: Board08Value<unknown>): string | undefined {
  switch (value.kind) {
    case "measured":
      return undefined;
    case "not-measured":
    case "failed":
      return value.reason;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function renderFraction(
  numerator: Board08Value<number>,
  denominator: Board08Value<number>,
): ReactNode {
  if (numerator.kind !== "measured") return unavailableState(numerator);
  if (denominator.kind !== "measured") return unavailableState(denominator);
  return (
    <span className={`${v2Type.num} font-semibold`}>
      {numerator.value} / {denominator.value}
    </span>
  );
}

function renderMentionDenominator(
  mentioned: Board08Value<number>,
  successfulAnswers: Board08Value<number>,
): ReactNode {
  if (mentioned.kind !== "measured") return unavailableState(mentioned);
  if (successfulAnswers.kind !== "measured") return unavailableState(successfulAnswers);
  return `${mentioned.value} of ${successfulAnswers.value} successful test answers`;
}

function MetricFilter({ children }: { children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 rounded-lg px-3 text-[13.5px] font-medium text-[color:var(--v2-ink2)]"
    >
      {children}
      <V2Icon name="cdown" size={13} className="text-[color:var(--v2-ink3)]" />
    </Button>
  );
}

function TrendPanel({ trend }: { trend: Board08Value<Board08Trend> }) {
  if (trend.kind !== "measured") {
    return (
      <div className="flex min-h-[178px] flex-col justify-center gap-2 rounded-[var(--v2-radius-panel)] border border-[var(--v2-line)] bg-[var(--v2-inset)] px-5">
        {unavailableState(trend)}
        <p className={`${v2Type.meta} max-w-[360px]`}>{trend.reason}</p>
      </div>
    );
  }

  const lastPoint = trend.value.points[trend.value.points.length - 1];
  const endpointText =
    lastPoint === null || lastPoint === undefined ? "Not measured" : `${lastPoint}%`;
  const chartSeries = [
    {
      id: "mention-rate",
      label: "Mention rate",
      points: trend.value.points.map((point, index) => ({ x: String(index), y: point })),
      style: "solid" as const,
      area: true,
    },
  ];
  const axisLabels = [
    { label: "60%", top: "4%", dashed: true },
    { label: "45%", top: "25%", dashed: true },
    { label: "30%", top: "46%", dashed: true },
    { label: "15%", top: "67%", dashed: true },
    { label: "0%", top: "88%", dashed: false },
  ] as const;

  return (
    <div className="relative" data-testid="board08-trend">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[150px]"
        aria-hidden="true"
      >
        {axisLabels.map((axis) => (
          <span key={axis.label}>
            <span
              className={`${v2Type.mono} absolute left-0 w-8 -translate-y-1/2 text-[11px]`}
              style={{ top: axis.top }}
            >
              {axis.label}
            </span>
            <span
              className={`absolute left-9 right-0 border-t border-[var(--v2-line)] ${axis.dashed ? "border-dashed" : ""}`}
              style={{ top: axis.top }}
            />
          </span>
        ))}
      </div>
      <TrendChart
        ariaLabel="Mention rate trend"
        endpointBadge={{ seriesId: "mention-rate", text: endpointText }}
        height={168}
        series={chartSeries}
        xLabels={trend.value.xLabels}
        yDomain={[0, 60]}
        yTicks={[]}
      />
    </div>
  );
}

function CompletedWork({
  items,
  navigation,
}: {
  items: readonly Board08WorkItem[];
  navigation: Board08Data["navigation"];
}) {
  return (
    <section className="border-r border-[var(--v2-line)] px-[22px] py-[18px] max-xl:border-r-0 max-xl:border-b">
      <h2 className={`${v2Type.caps} mb-[13px]`}>Completed work</h2>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className={v2Type.meta}>No completed work.</p>
        ) : (
          items.slice(0, 2).map((item) => (
            <div className="flex gap-3" key={item.title}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
                <V2Icon name={item.icon} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`${v2Type.bodyStrong} whitespace-nowrap`}>{item.title}</div>
                <div className="mt-0.5">
                  {renderValue(item.state, (state) => (
                    <span className={`${v2Type.meta} text-[color:var(--v2-ok)]`}>{state}</span>
                  ))}
                </div>
                <div className="mt-0.5">
                  {renderValue(item.points, (points) => (
                    <span className={`${v2Type.num} font-semibold text-[color:var(--v2-brand)]`}>
                      +{points} work points
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <LinkWithArrow className="mt-4" href={v2Href("/v2/my-work", navigation)}>
        View all work
      </LinkWithArrow>
    </section>
  );
}

function ObservedOutcomes({
  visibility,
  navigation,
}: {
  visibility: Board08Data["visibility"];
  navigation: Board08Data["navigation"];
}) {
  const rows = [
    { label: "Mentions", icon: "eye" as const, numerator: visibility.mentioned },
    { label: "Recommendations", icon: "star" as const, numerator: visibility.recommendations },
    { label: "Answers with citations", icon: "link" as const, numerator: visibility.citations },
  ];

  return (
    <section className="border-r border-[var(--v2-line)] px-[22px] py-[18px] max-xl:border-r-0 max-xl:border-b">
      <h2 className={`${v2Type.caps} mb-[13px]`}>Observed outcomes</h2>
      <div>
        {rows.map((row, index) => (
          <div
            className={`flex items-center justify-between gap-3 py-2 ${index === 0 ? "" : "border-t border-[var(--v2-line)]"}`}
            key={row.label}
          >
            <span
              className={`${v2Type.body} flex min-w-0 items-center gap-2 text-[color:var(--v2-ink)]`}
            >
              <V2Icon name={row.icon} size={16} className="shrink-0" />
              <span className="truncate">{row.label}</span>
            </span>
            {renderFraction(row.numerator, visibility.successfulAnswers)}
          </div>
        ))}
      </div>
      <LinkWithArrow className="mt-3" href={v2Href("/v2/visibility/results", navigation)}>
        View all results
      </LinkWithArrow>
    </section>
  );
}

function BusinessResults({
  businessResults,
  navigation,
}: {
  businessResults: Board08BusinessResults;
  navigation: Board08Data["navigation"];
}) {
  return (
    <section className="px-[22px] py-[18px] text-center">
      <h2 className={`${v2Type.caps} mb-[13px] text-left`}>Business results</h2>
      <span className="mx-auto mb-2.5 mt-1 grid h-[38px] w-[38px] place-items-center rounded-full bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
        <V2Icon name="chart" size={19} />
      </span>
      <div className={v2Type.bodyStrong}>{businessResults.label}</div>
      <p className={`${v2Type.meta} mx-auto mb-3 mt-1.5 max-w-[190px] leading-[1.6]`}>
        {businessResults.detail}
      </p>
      {businessResults.kind === "not-measured" ? (
        <LinkWithArrow href={v2Href("/v2/settings/integrations", navigation)}>
          Connect analytics
        </LinkWithArrow>
      ) : (
        <span className={`${v2Type.meta} text-[color:var(--v2-ok)]`}>Connected</span>
      )}
    </section>
  );
}

function CoverageRail({
  visibility,
  nextAction,
  navigation,
}: {
  visibility: Board08Data["visibility"];
  nextAction: Board08Data["nextAction"];
  navigation: Board08Data["navigation"];
}) {
  return (
    <aside className="min-w-0 border-l border-[var(--v2-line)] px-6 pb-8 pt-7">
      <h2 className={`${v2Type.sectionTitle} mb-4`}>Coverage and evidence</h2>
      <div>
        {[
          { label: "Approved questions", value: visibility.approvedQuestionCount },
          { label: "Successful answers", value: visibility.successfulAnswers },
          { label: "Failed attempts", value: visibility.failedAttempts },
          { label: "Last observation", value: visibility.lastObservedAt },
        ].map((item, index) => (
          <div
            className={`flex items-center justify-between gap-3 py-2 ${index === 0 ? "" : "border-t border-[var(--v2-line)]"}`}
            key={item.label}
          >
            <span className={`${v2Type.body} text-[color:var(--v2-ink2)]`}>{item.label}</span>
            <span className="text-right">{renderCoverageValue(item.value)}</span>
          </div>
        ))}
      </div>
      <LinkWithArrow
        className="mt-3 flex w-full justify-between"
        href={v2Href("/v2/visibility/evidence", navigation)}
      >
        Inspect answers
      </LinkWithArrow>
      <div className="mt-[26px] border-t border-[var(--v2-line)] pt-5">
        <h2 className={`${v2Type.sectionTitle} mb-2.5`}>Next useful action</h2>
        {nextAction.kind === "measured" ? (
          <>
            <p className={`${v2Type.body} mb-4 leading-[1.7]`}>{nextAction.value.description}</p>
            <Button asChild className="h-10 w-full rounded-lg text-[13.5px] font-semibold">
              <a href={v2Href("/v2/visibility/results", navigation)}>Open results review</a>
            </Button>
            <div className="mt-3.5 flex items-center gap-2 text-[color:var(--v2-ok)]">
              <V2Icon name="check" size={15} />
              <span className={`${v2Type.meta} font-semibold text-[color:var(--v2-ok)]`}>
                {nextAction.value.rewardPoints} work points after recording a decision
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {unavailableState(nextAction)}
            <p className={v2Type.meta}>{valueReason(nextAction)}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

export function Board08Screen({ data, staleAsOf }: Board08ScreenProps) {
  const { visibility } = data;
  const mentionRate = renderValue(visibility.mentionRate, (rate) => `${Math.round(rate * 100)}%`);
  const sample =
    visibility.successfulAnswers.kind === "measured" &&
    visibility.failedAttempts.kind === "measured"
      ? `Latest sample: ${visibility.successfulAnswers.value} successful answers · ${visibility.failedAttempts.value} failed attempts excluded`
      : "Latest sample is not measured.";

  return (
    <div className="min-w-0 bg-[var(--v2-paper)]" data-testid="board08-screen">
      <div className="grid min-w-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_322px]">
        <main className="min-w-0 px-7 pb-8 pt-7">
          <h1 className={v2Type.pageTitle}>Understand what changed</h1>
          <div className="mb-[18px] mt-4">
            <VisibilityTabStrip active="b08" context={data.navigation} />
          </div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2 className={`${v2Type.caps} mb-1.5`}>Mention rate</h2>
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span
                  className={
                    visibility.mentionRate.kind === "measured" ? v2Type.statBig : v2Type.bodyStrong
                  }
                >
                  {mentionRate}
                </span>
                <span className={v2Type.body}>
                  {renderMentionDenominator(visibility.mentioned, visibility.successfulAnswers)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <MetricFilter>Same question set</MetricFilter>
              <MetricFilter>
                {renderValue(visibility.engineCount, (count) => `${count} engines`)}
              </MetricFilter>
            </div>
          </div>
          <TrendPanel trend={visibility.trend} />
          <p className={`${v2Type.meta} mb-1.5 mt-1`}>{sample}</p>
          <p className={`${v2Type.meta} mb-5 flex items-center gap-2`}>
            <V2Icon name="warn" size={14} />
            Visibility varies between observations. A page change does not prove causation.
          </p>
          {staleAsOf ? (
            <div className="mb-4">
              <StateLabel state="stale" />
              <span className={`${v2Type.meta} ml-2`}>As of {staleAsOf}.</span>
            </div>
          ) : null}
          <div className="-mx-7 grid border-t border-[var(--v2-line)] xl:grid-cols-[1.3fr_1fr_.82fr]">
            <CompletedWork items={data.completedWork} navigation={data.navigation} />
            <ObservedOutcomes visibility={visibility} navigation={data.navigation} />
            <BusinessResults businessResults={data.businessResults} navigation={data.navigation} />
          </div>
        </main>
        <CoverageRail
          visibility={visibility}
          nextAction={data.nextAction}
          navigation={data.navigation}
        />
      </div>
    </div>
  );
}
