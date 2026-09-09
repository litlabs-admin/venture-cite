import { Link } from "@tanstack/react-router";
import { BarChart3, ChevronRight, Eye, FileText, Info, Link2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { StateBadge } from "../state/StateBadge";
import {
  useVisibilityMentionRate,
  type VisibilityMentionRate,
  type VisibilityWeek,
} from "../data/visibilityTrend";
import {
  useCitedUrls,
  useEngineRankings,
  useReviewTask,
  useVerifiedWork,
  verificationLabel,
  useVisibilityHero,
  type WorkHistoryEventView,
} from "../data/visibilityEvidence";
import { useWorkSummary } from "../data/workSummary";
import { TrendChart } from "./TrendChart";
import {
  Bar,
  Breadcrumb,
  NotConnected,
  PanelHeading,
  RailHeading,
  RailRow,
  TabStrip,
  VisibilityFrame,
  formatStamp,
  type Tab,
} from "./VisibilityFrame";

// Visibility: overview.
//
// The screen answers "what changed", so the mention rate leads it - unlike
// Today, where the ranked task leads and the number follows as evidence.
//
// THREE NUMBERS THE ARTBOARD SHOWS THAT NO ENDPOINT RETURNS, and what this
// screen does instead of inventing them:
//   - the confidence band around the trend: not drawn (see `TrendChart`);
//   - "Recommendations n / 40": `geo_rankings` records citation, rank,
//     sentiment and authority, and nothing that records an engine
//     recommending the brand - rendered "Not measured";
//   - "Approved questions 10": no read in this area returns an
//     approved-question count - rendered "Not measured".
// The artboard's "2 failed attempts excluded" IS shown, because failures are
// real and countable: a provider call that returned nothing still writes a
// geo_rankings row, marked by a "Check failed:" status line. The live
// dashboard divides by those rows; this screen does not, and says how many it
// left out.
// A brand with no observations at all reads "Not measured" throughout, never
// 0%: `citationRatePct` returns 0 for an empty sample, and printing that zero
// would claim a measurement that was never taken.

const TABS = (active: string): Tab[] => [
  { label: "Overview", to: "/v2/visibility", active: active === "overview" },
  { label: "Answers", to: "/v2/visibility/evidence", active: active === "answers" },
  { label: "Citations" },
  { label: "Competitors" },
  { label: "Results", to: "/v2/visibility/results", active: active === "results" },
];

export function VisibilityTabs({ active }: { active: string }) {
  return <TabStrip tabs={TABS(active)} />;
}

function Heading({ trail, title }: { trail: string[]; title: string }) {
  return (
    <>
      <Breadcrumb trail={trail} />
      <h1 className="text-metric font-semibold leading-tight text-vc-primary">{title}</h1>
    </>
  );
}

/**
 * The measured headline, or the honest absence of one.
 *
 * Reads the v2 mention rate, NOT `hero.citationRate`. The hero divides by
 * every geo_rankings row, and a provider call that never returned an answer
 * is one of those rows - so its rate answers "how often was the brand
 * mentioned across everything we attempted", which reads as a visibility
 * number and is not one. This divides by answers actually collected.
 *
 * The excluded calls are named underneath rather than dropped. A denominator
 * that shrinks without explanation is the same dishonesty in the other
 * direction.
 */
export function MentionRate({ rate }: { rate: VisibilityMentionRate | undefined }) {
  if (!rate || rate.measured === 0) {
    return (
      <div className="mt-3 flex flex-col gap-2" data-testid="v2-vis-not-measured">
        <div className="flex flex-wrap items-baseline gap-3">
          <StateBadge state="not_measured" className="text-body" />
          <span className="text-body text-vc-secondary">
            No test answer has been collected for this brand yet, so there is no rate to show.
          </span>
        </div>
        {/* Attempts that all failed are not an absence of attempts, and
            "Not measured" alone would read as though nothing had been run. */}
        {rate && rate.failed > 0 ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="v2-vis-failed">
            <StateBadge state="failed" />
            <span className="text-caption text-vc-tertiary">
              {rate.failed} {rate.failed === 1 ? "call" : "calls"} returned no answer.
            </span>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-3">
      <span
        className="text-stat font-semibold tabular-nums text-vc-accent"
        data-testid="v2-vis-rate"
      >
        {rate.mentionRate}%
      </span>
      {/* "successful" is the whole claim: the denominator is the answers that
          came back, and the attempts that did not are named on the sample
          line rather than divided into this rate. */}
      <span className="text-body text-vc-secondary">
        {rate.cited} of {rate.measured} successful test answers
      </span>
    </div>
  );
}

/** The sample behind the rate, and what was left out of it. A denominator
 *  that shrinks silently is as dishonest as one inflated by failures, so the
 *  excluded attempts are counted here in the same breath as the sample. */
export function SampleLine({ rate }: { rate: VisibilityMentionRate | undefined }) {
  if (!rate || rate.measured === 0) {
    return <p className="mt-3 text-caption text-vc-tertiary">No sample has been collected.</p>;
  }
  return (
    <p className="mt-3 text-caption text-vc-tertiary">
      <span>Latest sample: {rate.measured} successful answers</span>
      {rate.failed > 0 && (
        <span data-testid="v2-vis-failed">
          {" · "}
          {rate.failed} failed {rate.failed === 1 ? "attempt" : "attempts"} excluded
        </span>
      )}
    </p>
  );
}

/** The artboard draws two dropdowns here. Neither filter exists on any read
 *  in this area, so they are stated as the facts they assert - the question
 *  set is held constant, and this many engines answered - rather than drawn
 *  as controls that would do nothing. */
export function MeasurementChips({ engineCount }: { engineCount: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption">
      <span className="rounded-full border border-vc-default px-2.5 py-1 text-vc-secondary">
        Same question set
      </span>
      <span className="rounded-full border border-vc-default px-2.5 py-1 text-vc-secondary">
        {engineCount === null ? "Engines not measured" : `${engineCount} engines`}
      </span>
    </div>
  );
}

// The trend takes no error branch of its own. It is drawn from the same
// payload as the headline rate, so there is no state where the line has
// failed and the number above it has not; a page whose rate read failed shows
// its error frame instead of reaching here.
export function TrendBlock({
  weeks,
  isPending,
  endLabel = false,
}: {
  weeks: VisibilityWeek[] | undefined;
  isPending: boolean;
  endLabel?: boolean;
}) {
  // A zero-total week is an absence of measurement, not a measured zero, so
  // it is dropped from the line rather than dragging it to the floor.
  const observed = (weeks ?? []).filter((week) => week.measured > 0);

  if (isPending) {
    return (
      <div className="mt-4" data-testid="v2-vis-trend-loading">
        <Bar className="h-[220px] w-full" />
      </div>
    );
  }
  return (
    <div className="mt-4 h-[220px] min-w-[240px]" data-testid="v2-vis-trend">
      {observed.length < 2 ? (
        <div className="flex h-full flex-col items-center justify-center rounded-md bg-vc-muted/40 text-center">
          <p className="text-body text-vc-tertiary">Not enough history to draw a trend</p>
          <p className="mt-1 text-data text-vc-tertiary/80">
            {observed.length === 0
              ? "Visibility is recorded on each measurement run."
              : "One week is recorded. A second one draws the line."}
          </p>
        </div>
      ) : (
        <TrendChart weeks={observed} endLabel={endLabel} />
      )}
    </div>
  );
}

/** The band's absence, said out loud on the screen that would have shown it.
 *  A reader who has seen the approved design must not conclude the interval
 *  was forgotten, or worse, assume the line is more certain than it is. */
export function NoBandNote() {
  return (
    <p className="mt-3 flex items-start gap-2 text-caption text-vc-tertiary">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Visibility varies between observations, and no confidence interval is drawn because none is
        measured. A page change does not prove causation.
      </span>
    </p>
  );
}

function CompletedWork({
  events,
  isPending,
  isError,
}: {
  events: WorkHistoryEventView[] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const rows = (events ?? []).slice(0, 2);
  return (
    <div className="px-0 py-5 lg:px-6 lg:first:pl-0">
      <PanelHeading>Completed work</PanelHeading>
      {isError ? (
        <p className="mt-3 text-body text-vc-tertiary">Completed work could not be loaded.</p>
      ) : isPending ? (
        <div className="mt-3">
          <Bar className="h-4 w-40" />
          <Bar className="mt-3 h-4 w-32" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-body text-vc-tertiary" data-testid="v2-vis-work-empty">
          No change has been verified yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((event) => (
            <li key={event.id} className="flex items-start gap-2.5" data-testid="v2-vis-work-row">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vc-muted text-vc-secondary"
                aria-hidden="true"
              >
                <FileText className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-vc-primary">{event.taskTitle}</p>
                {verificationLabel(event.verificationMethod) && (
                  <p className="text-caption text-vc-accent">
                    {verificationLabel(event.verificationMethod)}
                  </p>
                )}
                {event.award?.awarded && (
                  <p className="text-caption font-medium tabular-nums text-vc-accent">
                    +{event.award.points} work points
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/v2/today"
        className="mt-4 inline-flex items-center gap-0.5 text-caption text-vc-accent hover:underline"
      >
        View all work
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function OutcomeRow({
  icon,
  label,
  value,
  total,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  total: number | null;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-vc-default py-2.5">
      <span className="flex items-center gap-2 text-body text-vc-secondary">
        <span className="text-vc-tertiary" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      {value === null || total === null ? (
        <StateBadge state="not_measured" />
      ) : (
        <span className="shrink-0 text-body tabular-nums text-vc-primary">
          <span className="font-semibold">{value}</span>
          <span className="px-1 text-vc-tertiary">/</span>
          {total}
        </span>
      )}
    </li>
  );
}

function ObservedOutcomes({
  rate,
  attributedSources,
}: {
  rate: VisibilityMentionRate | undefined;
  attributedSources: number | null;
}) {
  const measured = rate && rate.measured > 0;
  return (
    <div className="border-t border-vc-default px-0 py-5 lg:border-t-0 lg:border-l lg:px-6">
      <PanelHeading>Observed outcomes</PanelHeading>
      <ul className="mt-2">
        <OutcomeRow
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Mentions"
          value={measured ? rate.cited : null}
          total={measured ? rate.measured : null}
        />
        {/* No column, table or endpoint records an engine recommending the
            brand. The row stays, because its absence is the finding. */}
        <OutcomeRow
          icon={<Star className="h-3.5 w-3.5" />}
          label="Recommendations"
          value={null}
          total={null}
        />
        {/* Deliberately NOT "answers with citations": `cited-urls` returns one
            row per engine, question and source, so it counts attributed
            sources. Labelling it as answers would overstate what was counted. */}
        <li className="flex items-center justify-between gap-3 py-2.5">
          <span className="flex items-center gap-2 text-body text-vc-secondary">
            <span className="text-vc-tertiary" aria-hidden="true">
              <Link2 className="h-3.5 w-3.5" />
            </span>
            Attributed sources
          </span>
          {attributedSources === null ? (
            <StateBadge state="not_measured" />
          ) : (
            <span className="shrink-0 text-body font-semibold tabular-nums text-vc-primary">
              {attributedSources}
            </span>
          )}
        </li>
      </ul>
      <Link
        to="/v2/visibility/evidence"
        className="mt-3 inline-flex items-center gap-0.5 text-caption text-vc-accent hover:underline"
      >
        View all results
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Business results have no endpoint anywhere in the API - not an empty one,
 *  none at all. The panel says so and offers the one act that would create
 *  the source. */
export function BusinessResults() {
  return (
    <div className="border-t border-vc-default px-0 py-5 lg:border-t-0 lg:border-l lg:px-6">
      <PanelHeading>Business results</PanelHeading>
      <NotConnected
        icon={<BarChart3 className="h-4 w-4" />}
        title="Analytics not connected"
        hint="Connect a source to measure referral visits and qualified leads."
        action={
          <Link to="/settings" className="text-caption text-vc-accent hover:underline">
            Connect analytics
          </Link>
        }
      />
    </div>
  );
}

export default function VisibilityPage() {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const heroQuery = useVisibilityHero(selectedBrandId);
  const rateQuery = useVisibilityMentionRate(selectedBrandId);
  const workQuery = useVerifiedWork(selectedBrandId);
  const enginesQuery = useEngineRankings(selectedBrandId);
  const citedQuery = useCitedUrls(selectedBrandId);
  const summaryQuery = useWorkSummary(selectedBrandId);
  const reviewQuery = useReviewTask(selectedBrandId);

  // The rate is the headline, so the screen waits for it as well as the hero
  // (which is still read for the last-observation stamp).
  if (brandsLoading || (selectedBrandId && (heroQuery.isPending || rateQuery.isPending))) {
    return (
      <div data-testid="v2-vis-loading" role="status" aria-busy="true">
        <span className="sr-only">Loading visibility</span>
        <VisibilityFrame
          main={
            <>
              <Bar className="h-4 w-24" />
              <Bar className="mt-4 h-7 w-80" />
              <Bar className="mt-6 h-4 w-full max-w-md" />
              <Bar className="mt-6 h-10 w-48" />
              <Bar className="mt-4 h-[220px] w-full" />
            </>
          }
          rail={
            <>
              <Bar className="h-5 w-44" />
              <Bar className="mt-5 h-4 w-full" />
              <Bar className="mt-3 h-4 w-full" />
              <Bar className="mt-3 h-4 w-full" />
              <Bar className="mt-8 h-9 w-full" />
            </>
          }
        />
      </div>
    );
  }

  if (!selectedBrandId) {
    return (
      <VisibilityFrame
        main={
          <div data-testid="v2-vis-no-brand" className="max-w-lg">
            <Heading trail={["Visibility"]} title="Add a brand to start measuring" />
            <p className="mt-2 text-body text-vc-secondary">
              Visibility is measured per brand, and there is no brand on this account yet.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/welcome">Add a brand</Link>
            </Button>
          </div>
        }
        rail={
          <p className="text-body text-vc-secondary">Coverage appears with your first brand.</p>
        }
      />
    );
  }

  if (heroQuery.isError || rateQuery.isError) {
    return (
      <VisibilityFrame
        main={
          <div data-testid="v2-vis-error">
            <Heading trail={["Visibility"]} title="Understand what changed" />
            <ErrorState
              title="Visibility could not be loaded"
              description="The measurement for this brand did not load. Nothing has been lost - try again."
              onRetry={() => {
                void heroQuery.refetch();
                void rateQuery.refetch();
              }}
              isRetrying={heroQuery.isFetching || rateQuery.isFetching}
            />
          </div>
        }
        rail={<p className="text-body text-vc-secondary">Coverage is unavailable right now.</p>}
      />
    );
  }

  const hero = heroQuery.data;
  const rate = rateQuery.data;
  const measured = Boolean(rate && rate.measured > 0);
  const engines = enginesQuery.data?.platforms.length ?? null;
  const reviewTask = reviewQuery.data?.items[0] ?? null;
  const nextAction = summaryQuery.data?.nextTask ?? null;

  return (
    <VisibilityFrame
      main={
        <div data-testid="v2-vis-overview">
          <Heading trail={["Visibility"]} title="Understand what changed" />
          <VisibilityTabs active="overview" />

          <section className="mt-6" aria-labelledby="v2-vis-rate-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <PanelHeading className="pt-1">
                <span id="v2-vis-rate-heading">Mention rate</span>
              </PanelHeading>
              <MeasurementChips engineCount={engines} />
            </div>

            <MentionRate rate={rate} />

            <TrendBlock weeks={rateQuery.data?.weeks} isPending={rateQuery.isPending} endLabel />

            <SampleLine rate={rate} />
            <NoBandNote />
          </section>

          <div className="mt-6 grid grid-cols-1 border-t border-vc-default lg:grid-cols-3">
            <CompletedWork
              events={workQuery.data?.items}
              isPending={workQuery.isPending}
              isError={workQuery.isError}
            />
            <ObservedOutcomes
              rate={rate}
              attributedSources={citedQuery.data ? citedQuery.data.total : null}
            />
            <BusinessResults />
          </div>
        </div>
      }
      rail={
        <div className="space-y-8">
          <section aria-labelledby="v2-vis-coverage-heading">
            <RailHeading>
              <span id="v2-vis-coverage-heading">Coverage and evidence</span>
            </RailHeading>
            <div className="mt-3">
              {/* No read in this area returns the approved-question count, so
                  it alone is stated as unmeasured. Failed attempts ARE counted:
                  a failed provider call is a geo_rankings row whose status line
                  starts "Check failed:", and the v2 mention-rate read reports
                  them rather than dividing by them. */}
              <RailRow label="Approved questions" value={null} />
              <RailRow label="Successful answers" value={measured && rate ? rate.measured : null} />
              {/* A failure count is only a measurement once something was
                  attempted: with no attempt at all, 0 would read as a
                  measured zero. */}
              <RailRow
                label="Failed attempts"
                value={rate && rate.observed > 0 ? rate.failed : null}
              />
              <RailRow
                label="Last observation"
                value={hero ? formatStamp(hero.lastScanAt) : null}
              />
            </div>
            <Link
              to="/v2/visibility/evidence"
              className="mt-3 flex items-center justify-between text-body text-vc-accent hover:underline"
            >
              Inspect answers
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section aria-labelledby="v2-vis-next-heading">
            <RailHeading>
              <span id="v2-vis-next-heading">Next useful action</span>
            </RailHeading>
            <p className="mt-2 text-body text-vc-secondary">
              {nextAction
                ? nextAction.recommendedChange
                : "Review the observed answers against the change you made before drawing a conclusion."}
            </p>
            <Button asChild className="mt-4 w-full">
              <Link to="/v2/visibility/results">Open results review</Link>
            </Button>
            {reviewTask && (
              <p className="mt-3 text-caption text-vc-accent">
                {reviewTask.points} work points after recording a decision
              </p>
            )}
          </section>
        </div>
      }
    />
  );
}
