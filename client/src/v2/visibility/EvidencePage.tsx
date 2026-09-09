import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { StateBadge } from "../state/StateBadge";
import { observationWindowStart, useVisibilityMentionRate } from "../data/visibilityTrend";
import {
  awardForTask,
  grantedAwards,
  approvedQuestionCount,
  useApprovedQuestions,
  useAwardEvents,
  useCitedUrls,
  useEngineRankings,
  useVerifiedWork,
  useVisibilityHero,
  type CitedUrlRow,
  type EngineRanking,
  type WorkHistoryEventView,
} from "../data/visibilityEvidence";
import { useWorkSummary, type WorkSummaryView } from "../data/workSummary";
import {
  Bar,
  Breadcrumb,
  PanelHeading,
  RailHeading,
  RailRow,
  VisibilityFrame,
  formatStamp,
  formatStampWithTime,
  sourcePath,
} from "./VisibilityFrame";
import { MentionRate, NoBandNote, TrendBlock, VisibilityTabs } from "./VisibilityPage";

// Visibility: evidence.
//
// The screen a user opens to check whether the number is worth believing, so
// every panel on it answers "how was this measured" rather than "how good is
// it". The confidence band the artboard draws is the one thing it must not
// answer: no read returns an interval, and `TrendChart` explains why nothing
// is drawn in its place.
//
// The engine names in the rail come from the payload. None is written into
// this tree, so an engine added or renamed server-side needs no edit here.

const SUB_TABS = [
  { key: "mentions", label: "Mentions" },
  { key: "citations", label: "Citations" },
] as const;
type SubTab = (typeof SUB_TABS)[number]["key"];

function SourceEvidence({
  rows,
  isPending,
  isError,
  total,
}: {
  rows: CitedUrlRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  total: number | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const shown = (rows ?? []).slice(0, 3);
  const chosen = shown.find((row) => `${row.platform}|${row.prompt}|${row.url}` === selected);

  return (
    <div className="border-t border-vc-default px-0 py-5 lg:border-t-0 lg:border-l lg:px-6">
      <PanelHeading>Source evidence</PanelHeading>

      {isError ? (
        <p className="mt-3 text-body text-vc-tertiary" data-testid="v2-evidence-sources-error">
          Source evidence could not be loaded.
        </p>
      ) : isPending ? (
        <div className="mt-3" data-testid="v2-evidence-sources-loading">
          <Bar className="h-4 w-full" />
          <Bar className="mt-3 h-4 w-full" />
          <Bar className="mt-3 h-4 w-full" />
        </div>
      ) : shown.length === 0 ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          data-testid="v2-evidence-sources-empty"
        >
          <StateBadge state="not_measured" />
          <span className="text-body text-vc-secondary">
            No answer has attributed this brand to a source yet.
          </span>
        </div>
      ) : (
        <table className="mt-3 w-full text-left" data-testid="v2-evidence-table">
          <thead>
            <tr className="text-data uppercase tracking-wider text-vc-tertiary">
              <th scope="col" className="w-6 pb-2" />
              <th scope="col" className="pb-2 font-medium">
                Source
              </th>
              <th scope="col" className="pb-2 font-medium">
                Engine
              </th>
              <th scope="col" className="pb-2 font-medium">
                Checked
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const id = `${row.platform}|${row.prompt}|${row.url}`;
              return (
                <tr key={id} className="border-t border-vc-default" data-testid="v2-evidence-row">
                  <td className="py-2.5">
                    <input
                      type="radio"
                      name="v2-source-evidence"
                      value={id}
                      checked={selected === id}
                      onChange={() => setSelected(id)}
                      aria-label={`Show the question behind ${sourcePath(row.url)}`}
                      className="h-3.5 w-3.5 accent-(--brand-accent)"
                    />
                  </td>
                  <td className="max-w-[9rem] truncate py-2.5 text-body text-vc-primary">
                    {sourcePath(row.url)}
                  </td>
                  <td className="py-2.5 text-body text-vc-secondary">{row.platform}</td>
                  <td className="py-2.5 text-caption tabular-nums text-vc-secondary">
                    {formatStampWithTime(row.citedAt)}
                  </td>
                  {/* Every row in this feed IS a recorded citation, so the
                      result column states that and never borrows the work
                      queue's "Verified", which means a different thing. */}
                  <td className="py-2.5 text-right text-caption text-vc-accent">
                    Citation recorded
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {chosen && (
        <div
          className="mt-3 rounded-md bg-vc-muted/60 px-3 py-2.5 text-body text-vc-secondary"
          data-testid="v2-evidence-detail"
        >
          <p>
            <span className="text-vc-tertiary">Question: </span>
            {chosen.prompt}
          </p>
          <p className="mt-1 break-all">
            <span className="text-vc-tertiary">Source: </span>
            {chosen.url}
          </p>
        </div>
      )}

      {total !== null && total > shown.length && (
        <p className="mt-3 text-caption text-vc-tertiary" data-testid="v2-evidence-total">
          {total} attributed sources recorded across the observed answers.
        </p>
      )}
    </div>
  );
}

function VerifiedWork({
  events,
  awards: awardEvents,
  summary,
  isPending,
  isError,
}: {
  events: WorkHistoryEventView[] | undefined;
  /** The award stream. A `status=verified` read carries no award of its own
   *  (see `useAwardEvents`), so points are matched in from here by task id. */
  awards: WorkHistoryEventView[] | undefined;
  summary: WorkSummaryView | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const awards = grantedAwards(awardEvents);
  const points = summary?.points ?? awards.reduce((sum, award) => sum + award.points, 0);
  const verified = (events ?? []).length;
  const next = summary?.nextThreshold ?? null;
  const percent = next ? Math.min(100, Math.max(0, Math.round((points / next.points) * 100))) : 100;

  return (
    <div className="px-0 py-5 lg:px-6 lg:first:pl-0">
      <PanelHeading>Verified work</PanelHeading>

      {isError ? (
        <p className="mt-3 text-body text-vc-tertiary">Verified work could not be loaded.</p>
      ) : isPending ? (
        <div className="mt-3">
          <Bar className="h-8 w-24" />
          <Bar className="mt-3 h-4 w-40" />
          <Bar className="mt-3 h-4 w-32" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p
                className="text-stat font-semibold tabular-nums text-vc-primary"
                data-testid="v2-evidence-points"
              >
                {points}
              </p>
              <p className="text-caption text-vc-secondary">work points</p>
            </div>
            {summary && (
              <span className="shrink-0 rounded-full border border-vc-default px-2.5 py-1 text-caption text-vc-secondary">
                Level {summary.currentLevel.level} · {summary.currentLevel.name}
              </span>
            )}
          </div>

          <p className="mt-2 text-body text-vc-secondary">
            {verified === 0
              ? "No change has been verified yet."
              : `${verified} distinct change${verified === 1 ? "" : "s"} verified`}
          </p>

          {next && (
            <>
              <p className="mt-3 text-caption text-vc-secondary">
                Next: {next.name} — {next.points} points and a results review
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-vc-muted"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress to the next level"
              >
                <div
                  className="h-full rounded-full bg-vc-accent"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </>
          )}

          {(events ?? []).length > 0 && (
            <ul className="mt-4 space-y-2">
              {(events ?? []).slice(0, 2).map((event) => {
                const award = awardForTask(awardEvents, event.taskId);
                return (
                  <li
                    key={event.id}
                    className="flex items-center gap-2 text-body"
                    data-testid="v2-evidence-work-row"
                  >
                    <CircleCheck className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-vc-secondary">
                      {event.taskTitle}
                    </span>
                    {award && (
                      <span className="shrink-0 text-caption font-medium tabular-nums text-vc-accent">
                        +{award.points}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Link
        to="/v2/today"
        className="mt-4 inline-flex items-center gap-0.5 text-caption text-vc-accent hover:underline"
      >
        View all verified work
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ReviewTheResult({ points }: { points: number | null }) {
  return (
    <div className="border-t border-vc-default px-0 py-5 lg:border-t-0 lg:border-l lg:px-6">
      <PanelHeading>Review the result</PanelHeading>
      <p className="mt-3 text-body text-vc-secondary">
        Compare the next matching answer set against the change you made before drawing a
        conclusion.
      </p>
      <Button asChild className="mt-4 w-full">
        <Link to="/v2/visibility/results">Open results review</Link>
      </Button>
      {points !== null && (
        <p className="mt-3 text-caption text-vc-accent">{points} work points after review</p>
      )}
      <div className="mt-4 border-t border-vc-default pt-3">
        <BusinessResultsNote />
      </div>
    </div>
  );
}

/** The panel's one-line form of the same absence `BusinessResults` states in
 *  full on the overview: there is no business-results endpoint at all. */
function BusinessResultsNote() {
  return (
    <p className="text-caption text-vc-tertiary">
      Business results: analytics not connected.{" "}
      <Link to="/settings" className="text-vc-accent hover:underline">
        Connect analytics
      </Link>
    </p>
  );
}

function EnginesObserved({
  platforms,
  isPending,
  isError,
}: {
  platforms: EngineRanking[] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  return (
    <section aria-labelledby="v2-evidence-engines-heading">
      <RailHeading>
        <span id="v2-evidence-engines-heading">Engines observed</span>
      </RailHeading>
      {isError ? (
        <p className="mt-3 text-body text-vc-tertiary">Engine coverage could not be loaded.</p>
      ) : isPending ? (
        <div className="mt-3">
          <Bar className="h-4 w-full" />
          <Bar className="mt-3 h-4 w-full" />
        </div>
      ) : (platforms ?? []).length === 0 ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          data-testid="v2-evidence-no-engines"
        >
          <StateBadge state="not_measured" />
          <span className="text-body text-vc-secondary">No engine has answered yet.</span>
        </div>
      ) : (
        <ul className="mt-2" data-testid="v2-evidence-engines">
          {(platforms ?? []).map((platform) => (
            <li
              key={platform.aiPlatform}
              className="flex items-center justify-between gap-3 border-b border-vc-default py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-vc-muted text-data font-semibold text-vc-secondary"
                  aria-hidden="true"
                >
                  {platform.aiPlatform.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate text-body text-vc-primary">{platform.aiPlatform}</span>
              </span>
              <span className="shrink-0 text-body font-semibold tabular-nums text-vc-primary">
                {platform.totalCount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function EvidencePage() {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const [tab, setTab] = useState<SubTab>("mentions");
  const rateQuery = useVisibilityMentionRate(selectedBrandId);
  // Held to the window the trend draws, for the reason `visibilityEvidence.ts`
  // records: undefaulted these three cover 30 days, and the coverage rail would
  // count engines over one sample and answers over another.
  const since = observationWindowStart(rateQuery.data);
  const heroQuery = useVisibilityHero(selectedBrandId, since);
  const citedQuery = useCitedUrls(selectedBrandId, since);
  const enginesQuery = useEngineRankings(selectedBrandId, since);
  const workQuery = useVerifiedWork(selectedBrandId);
  const awardQuery = useAwardEvents(selectedBrandId);
  const summaryQuery = useWorkSummary(selectedBrandId);
  const approvalQuery = useApprovedQuestions(selectedBrandId);

  // ORDER MATTERS. The hero read is held behind the rate now (it takes the
  // rate's window), so a failed rate leaves the hero permanently disabled and
  // therefore permanently `isPending`. Testing the error branch first is what
  // keeps a failed read reaching its error frame instead of a skeleton that
  // never resolves.
  if (!brandsLoading && selectedBrandId && (heroQuery.isError || rateQuery.isError)) {
    return (
      <VisibilityFrame
        main={
          <div data-testid="v2-evidence-error">
            <Breadcrumb trail={["Visibility", "Evidence"]} />
            <ErrorState
              title="Evidence could not be loaded"
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

  if (brandsLoading || (selectedBrandId && (heroQuery.isPending || rateQuery.isPending))) {
    return (
      <div data-testid="v2-evidence-loading" role="status" aria-busy="true">
        <span className="sr-only">Loading visibility and evidence</span>
        <VisibilityFrame
          main={
            <>
              <Bar className="h-4 w-32" />
              <Bar className="mt-4 h-7 w-80" />
              <Bar className="mt-6 h-10 w-40" />
              <Bar className="mt-4 h-[220px] w-full" />
            </>
          }
          rail={
            <>
              <Bar className="h-5 w-48" />
              <Bar className="mt-5 h-4 w-full" />
              <Bar className="mt-3 h-4 w-full" />
              <Bar className="mt-3 h-4 w-full" />
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
          <div data-testid="v2-evidence-no-brand" className="max-w-lg">
            <Breadcrumb trail={["Visibility", "Evidence"]} />
            <h1 className="text-metric font-semibold text-vc-primary">
              Add a brand to see its evidence
            </h1>
            <p className="mt-2 text-body text-vc-secondary">
              Evidence is recorded per brand, and there is no brand on this account yet.
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

  const hero = heroQuery.data;
  const rate = rateQuery.data;
  const measured = Boolean(rate && rate.measured > 0);
  const reviewPoints = summaryQuery.data?.nextTask?.points ?? null;

  return (
    <VisibilityFrame
      main={
        <div data-testid="v2-evidence">
          <Breadcrumb trail={["Visibility", "Evidence"]} />
          <h1 className="text-metric font-semibold leading-tight text-vc-primary">
            Visibility and evidence
          </h1>
          <VisibilityTabs active="answers" />

          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <MentionRate rate={rate} />
            <div
              className="flex flex-wrap items-center gap-5 border-b border-vc-default"
              role="tablist"
              aria-label="Evidence view"
            >
              {SUB_TABS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.key}
                  onClick={() => setTab(entry.key)}
                  data-testid={`v2-evidence-tab-${entry.key}`}
                  className={`border-b-2 pb-2.5 text-body transition-colors duration-150 ${
                    tab === entry.key
                      ? "border-vc-accent font-medium text-vc-accent"
                      : "border-transparent text-vc-secondary hover:text-vc-primary"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
              {/* Recommendations has no column, table or endpoint behind it.
                  It is shown, and shown as unmeasured, rather than dropped -
                  its absence is part of what this screen reports. */}
              <span
                aria-disabled="true"
                title="No read records an engine recommending the brand."
                className="flex cursor-default items-center gap-1.5 border-b-2 border-transparent pb-2.5 text-body text-vc-tertiary"
                data-testid="v2-evidence-tab-recommendations"
              >
                Recommendations
                <StateBadge state="not_measured" />
              </span>
            </div>
          </div>

          <section className="mt-6" aria-labelledby="v2-evidence-rate-heading">
            <PanelHeading>
              <span id="v2-evidence-rate-heading">
                {tab === "mentions" ? "Mention rate" : "Attributed sources"}
              </span>
            </PanelHeading>

            {tab === "mentions" ? (
              <>
                <TrendBlock
                  weeks={rateQuery.data?.weeks}
                  isPending={rateQuery.isPending}
                  endLabel
                />
                <p className="mt-3 text-caption text-vc-tertiary">
                  Controlled test answers. These are not customer conversations.
                </p>
                <NoBandNote />
              </>
            ) : (
              <div className="mt-3" data-testid="v2-evidence-citations">
                {citedQuery.isError ? (
                  <p className="text-body text-vc-tertiary">
                    Attributed sources could not be loaded.
                  </p>
                ) : citedQuery.isPending ? (
                  <Bar className="h-4 w-48" />
                ) : citedQuery.data && citedQuery.data.total > 0 ? (
                  <p className="text-body text-vc-secondary">
                    <span className="text-stat font-semibold tabular-nums text-vc-primary">
                      {citedQuery.data.total}
                    </span>{" "}
                    sources have been attributed to this brand across the observed answers.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <StateBadge state="not_measured" />
                    <span className="text-body text-vc-secondary">
                      No answer has attributed this brand to a source yet.
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="mt-6 grid grid-cols-1 border-t border-vc-default lg:grid-cols-3">
            <VerifiedWork
              events={workQuery.data?.items}
              awards={awardQuery.data?.items}
              summary={summaryQuery.data}
              isPending={workQuery.isPending}
              isError={workQuery.isError}
            />
            <SourceEvidence
              rows={citedQuery.data?.items}
              total={citedQuery.data?.total ?? null}
              isPending={citedQuery.isPending}
              isError={citedQuery.isError}
            />
            <ReviewTheResult points={reviewPoints} />
          </div>
        </div>
      }
      rail={
        <div className="space-y-8">
          <section aria-labelledby="v2-evidence-coverage-heading">
            <RailHeading>
              <span id="v2-evidence-coverage-heading">Measurement coverage</span>
            </RailHeading>
            <div className="mt-3">
              <RailRow label="Successful answers" value={measured && rate ? rate.measured : null} />
              {/* Countable, not unmeasured: a failed provider call writes a
                  geo_rankings row with a "Check failed:" status line. */}
              <RailRow
                label="Failed attempts"
                value={rate && rate.observed > 0 ? rate.failed : null}
              />
              {/* The confirmed set's size, from the verified approval task -
                  not the tracked-prompt count, which nobody approved. */}
              <RailRow
                label="Approved questions"
                value={approvedQuestionCount(approvalQuery.data?.items)}
              />
              <RailRow
                label="Engines"
                value={enginesQuery.data ? enginesQuery.data.platforms.length || null : null}
              />
              <RailRow label="Last checked" value={hero ? formatStamp(hero.lastScanAt) : null} />
            </div>
            <Link
              to="/v2/visibility"
              className="mt-3 flex items-center justify-between text-body text-vc-accent hover:underline"
            >
              Back to the overview
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <EnginesObserved
            platforms={enginesQuery.data?.platforms}
            isPending={enginesQuery.isPending}
            isError={enginesQuery.isError}
          />
        </div>
      }
    />
  );
}
