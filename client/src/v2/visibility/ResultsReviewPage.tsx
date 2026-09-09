import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  CircleCheck,
  FileText,
  Info,
  Link2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { StateBadge } from "../state/StateBadge";
import { LEVEL_REQUIREMENT, LevelHexagon } from "../today/ProgressRail";
import { latestObservedWeek, useVisibilityMentionRate } from "../data/visibilityTrend";
import {
  REVIEW_DECISIONS,
  grantedAwards,
  useRecordResultsReview,
  useReviewTask,
  useVerifiedWork,
  type ReviewDecision,
} from "../data/visibilityEvidence";
import { useWorkSummary } from "../data/workSummary";
import {
  Bar,
  Breadcrumb,
  PanelHeading,
  RailHeading,
  VisibilityFrame,
  formatStamp,
} from "./VisibilityFrame";
import { VisibilityTabs } from "./VisibilityPage";

// Results review.
//
// The screen where a user says what the measurement meant, which is the only
// place in the product where a person's judgement is recorded as evidence.
// Three things it will not do:
//
//   - It will not pretend a period it cannot name. The review is recorded
//     against `cycleKey`, the server's "once per review period" key, and the
//     period named here is the latest OBSERVED week - the window the screen
//     actually shows. With no observed week there is no period to review, and
//     the form says so instead of inventing one.
//   - It will not offer to save without a task. The review posts against a
//     `review_results_and_record_decision` task; with none in the queue the
//     control is disabled and states why, rather than failing on submit.
//   - It will not label a decision as more than it records. The four options
//     are the server's own outcomes (`reviewRequestSchema`), worded as the
//     observation each one stores.

function SummaryCard({
  icon,
  label,
  value,
  note,
  measured = true,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  note?: string;
  measured?: boolean;
}) {
  return (
    <div className="rounded-md border border-vc-default bg-vc-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vc-muted text-vc-secondary"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-caption text-vc-secondary">{label}</p>
          {measured ? (
            <p className="mt-0.5 text-section font-semibold text-vc-primary">{value}</p>
          ) : (
            <div className="mt-0.5">
              <StateBadge state="not_measured" className="text-body" />
            </div>
          )}
          {note && <p className="mt-1 text-caption text-vc-tertiary">{note}</p>}
        </div>
      </div>
    </div>
  );
}

function SourceLink({
  icon,
  label,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  to: "/v2/visibility/evidence" | "/v2/today";
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 border-b border-vc-default py-3.5 text-body text-vc-primary transition-colors hover:text-vc-accent"
    >
      <span className="text-vc-tertiary" aria-hidden="true">
        {icon}
      </span>
      {label}
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-vc-tertiary" aria-hidden="true" />
    </Link>
  );
}

export default function ResultsReviewPage() {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const rateQuery = useVisibilityMentionRate(selectedBrandId);
  const workQuery = useVerifiedWork(selectedBrandId);
  const reviewQuery = useReviewTask(selectedBrandId);
  const record = useRecordResultsReview(selectedBrandId);

  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [notes, setNotes] = useState("");

  if (brandsLoading || (selectedBrandId && summaryQuery.isPending)) {
    return (
      <div data-testid="v2-results-loading" role="status" aria-busy="true">
        <span className="sr-only">Loading the results review</span>
        <VisibilityFrame
          main={
            <>
              <Bar className="h-4 w-40" />
              <Bar className="mt-4 h-7 w-96" />
              <Bar className="mt-6 h-20 w-full" />
              <Bar className="mt-4 h-64 w-full" />
            </>
          }
          rail={
            <>
              <Bar className="h-5 w-48" />
              <Bar className="mt-5 h-12 w-full" />
              <Bar className="mt-4 h-4 w-full" />
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
          <div data-testid="v2-results-no-brand" className="max-w-lg">
            <Breadcrumb trail={["Visibility", "Results review"]} />
            <h1 className="text-metric font-semibold text-vc-primary">
              Add a brand to review results
            </h1>
            <p className="mt-2 text-body text-vc-secondary">
              A results review belongs to one brand, and there is no brand on this account yet.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/welcome">Add a brand</Link>
            </Button>
          </div>
        }
        rail={
          <p className="text-body text-vc-secondary">Progress appears with your first brand.</p>
        }
      />
    );
  }

  if (summaryQuery.isError) {
    return (
      <VisibilityFrame
        main={
          <div data-testid="v2-results-error">
            <Breadcrumb trail={["Visibility", "Results review"]} />
            <ErrorState
              title="The results review could not be loaded"
              description="The work record for this brand did not load. Nothing has been lost - try again."
              onRetry={() => void summaryQuery.refetch()}
              isRetrying={summaryQuery.isFetching}
            />
          </div>
        }
        rail={<p className="text-body text-vc-secondary">Progress is unavailable right now.</p>}
      />
    );
  }

  const summary = summaryQuery.data;
  const rate = rateQuery.data;
  const measured = Boolean(rate && rate.measured > 0);
  const weeks = rateQuery.data?.weeks;
  const period = latestObservedWeek(weeks);
  const verifiedEvents = workQuery.data?.items ?? [];
  const awards = grantedAwards(workQuery.data?.items);
  const awardSum = awards.reduce((total, award) => total + award.points, 0);
  const reviewTask = reviewQuery.data?.items[0] ?? null;
  const next = summary?.nextThreshold ?? null;
  const points = summary?.points ?? 0;
  const percent = next ? Math.min(100, Math.max(0, Math.round((points / next.points) * 100))) : 100;
  const requirement = next ? LEVEL_REQUIREMENT[next.level] : undefined;
  const requirementMet = requirement
    ? Boolean(summary?.milestones.includes(requirement.milestone))
    : false;

  // Both are needed before anything can be written: a task to record against,
  // and an observed period to record it for.
  const blocked = !reviewTask
    ? "No results review is in the queue for this brand yet."
    : !period
      ? "No observation has been recorded, so there is no period to review."
      : null;

  return (
    <VisibilityFrame
      main={
        <div data-testid="v2-results">
          <Breadcrumb trail={["Visibility", "Results review"]} />
          <h1 className="text-metric font-semibold leading-tight text-vc-primary">
            Review the work and the result
          </h1>
          <VisibilityTabs active="results" />

          <p className="mt-4 flex items-center gap-2 text-body text-vc-secondary">
            <Calendar className="h-4 w-4 text-vc-tertiary" aria-hidden="true" />
            {period ? (
              <span data-testid="v2-results-period">
                Reviewing the week of {formatStamp(period.weekStart)}
              </span>
            ) : (
              <span className="flex items-center gap-2" data-testid="v2-results-no-period">
                <StateBadge state="not_measured" />
                <span>No observation window to review yet</span>
              </span>
            )}
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={<CircleCheck className="h-4 w-4" />}
              label="Work completed"
              value={`${verifiedEvents.length} verified change${
                verifiedEvents.length === 1 ? "" : "s"
              }`}
            />
            {/* The denominator is answers collected, not attempts. A period
                whose calls failed is reviewed on what it actually observed. */}
            <SummaryCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="Observed visibility"
              measured={measured}
              value={
                rate ? (
                  <>
                    <span className="tabular-nums">{rate.cited}</span>
                    <span className="px-1 text-vc-tertiary">/</span>
                    <span className="tabular-nums">{rate.measured}</span> mentions
                  </>
                ) : null
              }
              note={
                rate && rate.failed > 0
                  ? `${rate.failed} attempt${rate.failed === 1 ? "" : "s"} failed and are excluded`
                  : undefined
              }
            />
            <SummaryCard
              icon={<Link2 className="h-4 w-4" />}
              label="Business results"
              value="Not connected"
              note="Points are never assigned per observation."
            />
          </div>

          <section
            className="mt-6 rounded-md border border-vc-default bg-vc-surface p-5"
            aria-labelledby="v2-results-learn-heading"
          >
            <h2
              id="v2-results-learn-heading"
              className="text-section font-semibold text-vc-primary"
            >
              What did you learn?
            </h2>

            <fieldset className="mt-4">
              <legend className="sr-only">What the measurement showed</legend>
              <div className="space-y-2.5">
                {REVIEW_DECISIONS.map((entry) => (
                  <label
                    key={entry.value}
                    className="flex cursor-pointer items-start gap-2.5 text-body text-vc-primary"
                  >
                    <input
                      type="radio"
                      name="v2-results-decision"
                      value={entry.value}
                      checked={decision === entry.value}
                      onChange={() => setDecision(entry.value)}
                      className="mt-0.5 h-3.5 w-3.5 accent-(--brand-accent)"
                    />
                    <span>{entry.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label
              htmlFor="v2-results-notes"
              className="mt-5 block text-body font-medium text-vc-primary"
            >
              Record your decision
            </label>
            <textarea
              id="v2-results-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What are you keeping, changing or checking next, and why?"
              className="mt-2 w-full rounded-md border border-vc-default bg-vc-surface px-3 py-2.5 text-body text-vc-primary placeholder:text-vc-tertiary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                disabled={Boolean(blocked) || !decision || record.isPending || record.isSuccess}
                onClick={() => {
                  if (!reviewTask || !period || !decision) return;
                  record.mutate({
                    taskId: reviewTask.id,
                    expectedRevision: reviewTask.revision,
                    // The period reviewed, which is also the server's
                    // once-per-period key.
                    cycleKey: period.weekStart,
                    decision,
                    notes: notes.trim() === "" ? null : notes.trim(),
                  });
                }}
                data-testid="v2-results-save"
              >
                {record.isPending ? "Saving…" : "Save results review"}
              </Button>
              {reviewTask && (
                <span className="text-caption text-vc-accent">
                  {reviewTask.points} work points · Once per review period
                </span>
              )}
            </div>

            {blocked && (
              <p className="mt-3 text-caption text-vc-tertiary" data-testid="v2-results-blocked">
                {blocked}
              </p>
            )}
            {record.isError && (
              <p className="mt-3 text-caption text-destructive" data-testid="v2-results-failed">
                The review was not recorded. Nothing has been saved - try again.
              </p>
            )}
            {record.isSuccess && (
              <p className="mt-3 text-caption text-positive" data-testid="v2-results-saved">
                Your decision is recorded for this period.
              </p>
            )}

            <div className="mt-6 border-t border-vc-default pt-4">
              <PanelHeading>Source links</PanelHeading>
              <div className="mt-1">
                <SourceLink
                  icon={<Search className="h-4 w-4" />}
                  label="View matching answers"
                  to="/v2/visibility/evidence"
                />
                <SourceLink
                  icon={<FileText className="h-4 w-4" />}
                  label="View page changes"
                  to="/v2/today"
                />
              </div>
            </div>
          </section>
        </div>
      }
      rail={
        <div className="space-y-8">
          <section aria-labelledby="v2-results-progress-heading">
            <RailHeading>
              <span id="v2-results-progress-heading">Private brand progress</span>
            </RailHeading>

            {summary && (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <LevelHexagon />
                  <div className="min-w-0">
                    <p className="text-section font-semibold text-vc-primary">
                      Level {summary.currentLevel.level} · {summary.currentLevel.name}
                    </p>
                    <p className="mt-0.5 text-caption tabular-nums text-vc-secondary">
                      {points} work points total
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-vc-muted"
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
                  <span className="shrink-0 text-caption tabular-nums text-vc-secondary">
                    {percent}%
                  </span>
                </div>
                <p className="mt-2 text-caption tabular-nums text-vc-secondary">
                  {next ? `${points} / ${next.points} points` : `${points} points`}
                </p>
                {next && (
                  <p className="mt-1 text-caption text-vc-secondary">
                    Next: Level {next.level} {next.name} — {next.points} points and a results review
                  </p>
                )}
              </>
            )}
          </section>

          <section
            className="rounded-md border border-vc-default p-4"
            aria-labelledby="v2-results-awards-heading"
          >
            <PanelHeading>
              <span id="v2-results-awards-heading">Award history</span>
            </PanelHeading>
            {workQuery.isError ? (
              <p className="mt-3 text-body text-vc-tertiary">Award history could not be loaded.</p>
            ) : workQuery.isPending ? (
              <div className="mt-3">
                <Bar className="h-4 w-full" />
                <Bar className="mt-3 h-4 w-full" />
              </div>
            ) : awards.length === 0 ? (
              <p className="mt-3 text-body text-vc-tertiary" data-testid="v2-results-no-awards">
                No points have been awarded yet.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-2.5" data-testid="v2-results-awards">
                  {verifiedEvents
                    .filter(
                      (event) => event.award?.awarded && event.award.awardStatus === "awarded",
                    )
                    .map((event) => (
                      <li key={event.id} className="flex items-center gap-2 text-body">
                        <CircleCheck
                          className="h-3.5 w-3.5 shrink-0 text-positive"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-vc-secondary">
                          {event.taskTitle}
                        </span>
                        <span className="shrink-0 text-caption font-medium tabular-nums text-vc-accent">
                          +{event.award?.points}
                        </span>
                      </li>
                    ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-vc-default pt-3">
                  <span className="text-data font-medium uppercase tracking-wider text-vc-tertiary">
                    Sum
                  </span>
                  <span
                    className="text-body font-semibold tabular-nums text-vc-primary"
                    data-testid="v2-results-award-sum"
                  >
                    {awardSum}
                  </span>
                </div>
              </>
            )}
          </section>

          <section
            className="rounded-md border border-vc-default p-4"
            aria-labelledby="v2-results-limits-heading"
          >
            <PanelHeading>
              <span id="v2-results-limits-heading">Measurement limits</span>
            </PanelHeading>
            <p className="mt-3 flex items-start gap-2 text-body text-vc-secondary">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vc-tertiary" aria-hidden="true" />
              <span>
                The same questions and engines are compared between periods. A before-and-after
                change alone does not establish cause, and no confidence interval is drawn because
                none is measured.
              </span>
            </p>
            <p className="mt-3 flex items-start gap-2 text-body text-vc-secondary">
              <ShieldCheck
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vc-tertiary"
                aria-hidden="true"
              />
              <span>No points are lost when visibility falls.</span>
            </p>
          </section>

          {summary && next && requirement && (
            <section aria-labelledby="v2-results-capability-heading">
              <RailHeading>
                <span id="v2-results-capability-heading">Level {next.level} capability</span>
              </RailHeading>
              <p className="mt-2 flex items-start gap-2 text-body text-vc-secondary">
                <CircleCheck
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    requirementMet ? "text-positive" : "text-vc-tertiary"
                  }`}
                  aria-hidden="true"
                  data-glyph={requirementMet ? "done" : "todo"}
                />
                <span>
                  {requirement.label}
                  {requirementMet ? " — complete" : " — still required"}
                </span>
              </p>
            </section>
          )}
        </div>
      }
    />
  );
}
