import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { TextArea } from "@/v2/shared/ui/TextArea";
import { Panel } from "@/v2/shared/ui/Panel";
import { cn } from "@/lib/utils";
import {
  useRecordResultsReview,
  type ReviewDecision as ApiReviewDecision,
} from "@/v2/data/visibilityEvidence";
import { VisibilityTabStrip } from "@/v2/visibility/VisibilityTabStrip";
import {
  BrandProgressRail,
  NotMeasured,
  ReviewFormPanel,
  ReviewLayout,
  ReviewPeriodHeader,
  ReviewSummaryCards,
  type ReviewMetric,
  type ReviewProgressData,
} from "./shared/ReviewTemplate";

export type Board10Decision = "improvement" | "not_conclusive" | "revision" | "unavailable";

export type Board10Award = {
  label: string;
  points: ReviewMetric<number>;
};

export type Board10Data = {
  context: { brandId: string; mode: "guided" | "expert" };
  review: {
    periodStart: ReviewMetric<string>;
    periodEnd: ReviewMetric<string>;
    verifiedChanges: ReviewMetric<number>;
    mentions: ReviewMetric<number>;
    successfulAnswers: ReviewMetric<number>;
    businessResultsState: "not-connected" | "not-measured";
    decision: Board10Decision | null;
    notes: string;
    awardPoints: ReviewMetric<number>;
    /** The review task this form posts against. Without one in the queue
     *  there is nothing to save against, so the form disables and says why
     *  rather than failing on submit. */
    taskId: ReviewMetric<string>;
    taskRevision: ReviewMetric<number>;
  };
  progress: ReviewProgressData & {
    awardHistory: readonly Board10Award[];
    completedRequirements: ReviewMetric<number>;
    requiredRequirements: ReviewMetric<number>;
  };
};

const DECISION_OPTIONS: readonly {
  value: Exclude<Board10Decision, "unavailable">;
  label: string;
}[] = [
  { value: "improvement", label: "Continue the change" },
  { value: "not_conclusive", label: "The evidence is not yet conclusive" },
  { value: "revision", label: "Revise the approach" },
];

function metric<T>(value: ReviewMetric<T>, format: (entry: T) => ReactNode = String): ReactNode {
  return value.kind === "measured" ? format(value.value) : <NotMeasured />;
}

function formatReviewDate(value: string): string {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatReviewMonthDay(value: string): string {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]}`;
}

function ReviewPeriod({ review }: { review: Board10Data["review"] }) {
  const start =
    review.periodStart.kind === "measured" ? formatReviewMonthDay(review.periodStart.value) : null;
  const end =
    review.periodEnd.kind === "measured" ? formatReviewDate(review.periodEnd.value) : null;
  return (
    <ReviewPeriodHeader
      title="Review the work and the result"
      start={start ?? <NotMeasured />}
      end={end ?? undefined}
    />
  );
}

function ObservedVisibility({ review }: { review: Board10Data["review"] }) {
  if (review.mentions.kind === "measured" && review.successfulAnswers.kind === "measured") {
    return (
      <>
        {review.mentions.value} / {review.successfulAnswers.value} mentions
      </>
    );
  }
  return (
    <>
      {metric(review.mentions)} / {metric(review.successfulAnswers)} mentions
    </>
  );
}

function AwardHistory({ entries }: { entries: readonly Board10Award[] }) {
  return (
    <Panel className="mt-5 px-4 py-3.5">
      <h2 className={v2Type.caps}>Award history</h2>
      <ul className="mt-2 divide-y divide-[var(--v2-line)]">
        {entries.length === 0 ? (
          <li className={cn(v2Type.meta, "py-3")}>No awards have been recorded.</li>
        ) : (
          entries.map((entry) => (
            <li className="flex items-center gap-2 py-2" key={entry.label}>
              <V2Icon name="check" size={14} className="shrink-0 text-[color:var(--v2-ink3)]" />
              <span className={cn(v2Type.body, "min-w-0 flex-1")}>{entry.label}</span>
              <span className={cn(v2Type.num, "shrink-0 text-[color:var(--v2-brand)]")}>
                {metric(entry.points, (points) => `+${points}`)}
              </span>
            </li>
          ))
        )}
      </ul>
      {entries.length > 0 ? (
        <div className="mt-2 flex items-center justify-between border-t border-[var(--v2-line)] pt-2">
          <span className={v2Type.caps}>SUM</span>
          <span className={v2Type.num}>
            {entries.every((entry) => entry.points.kind === "measured") ? (
              entries.reduce(
                (sum, entry) => sum + (entry.points.kind === "measured" ? entry.points.value : 0),
                0,
              )
            ) : (
              <NotMeasured />
            )}
          </span>
        </div>
      ) : null}
    </Panel>
  );
}

// This screen's decision values read better on the canvas than the server's
// own (`improvement` | `no_material_change` | `decline` | `unavailable`,
// `visibilityEvidence.ts`'s `ReviewDecision`), so the two are kept distinct
// and translated here rather than forcing one vocabulary onto both.
// "unavailable" is the one value both sides spell the same way.
const DECISION_TO_API: Record<Board10Decision, ApiReviewDecision> = {
  improvement: "improvement",
  not_conclusive: "no_material_change",
  revision: "decline",
  unavailable: "unavailable",
};

function DecisionForm({
  context,
  review,
  staleAsOf,
}: {
  context: Board10Data["context"];
  review: Board10Data["review"];
  staleAsOf?: string;
}) {
  const [decision, setDecision] = useState<Board10Decision | null>(review.decision);
  const [notes, setNotes] = useState(review.notes);
  const record = useRecordResultsReview(context.brandId);
  const options =
    review.decision === "unavailable"
      ? [
          ...DECISION_OPTIONS,
          {
            value: "unavailable" as const,
            label: "The measurement is unavailable for this period",
          },
        ]
      : DECISION_OPTIONS;

  // Both are needed before anything can be posted: a task to record against,
  // and the period it reviews (the server's once-per-period key).
  const canSave =
    review.taskId.kind === "measured" &&
    review.taskRevision.kind === "measured" &&
    review.periodStart.kind === "measured";
  const blocked =
    review.taskId.kind !== "measured"
      ? "No results review is in the queue for this brand yet."
      : review.periodStart.kind !== "measured"
        ? "No observation has been recorded, so there is no period to review."
        : null;

  return (
    <ReviewFormPanel title="What did you learn?">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !canSave ||
            review.taskId.kind !== "measured" ||
            review.taskRevision.kind !== "measured" ||
            review.periodStart.kind !== "measured" ||
            decision === null
          ) {
            return;
          }
          record.mutate({
            taskId: review.taskId.value,
            expectedRevision: review.taskRevision.value,
            cycleKey: review.periodStart.value,
            decision: DECISION_TO_API[decision],
            notes: notes.trim() === "" ? null : notes.trim(),
          });
        }}
      >
        <fieldset>
          <legend className="sr-only">What did you learn?</legend>
          <div>
            {options.map((option) => (
              <label
                className="flex cursor-pointer items-start gap-2.5 py-[7px]"
                key={option.value}
              >
                <input
                  checked={decision === option.value}
                  className="mt-0.5 h-4 w-4 accent-[var(--v2-brand)]"
                  name="board10-decision"
                  onChange={() => {
                    setDecision(option.value);
                    record.reset();
                  }}
                  type="radio"
                  value={option.value}
                />
                <span
                  className={cn(
                    v2Type.body,
                    decision === option.value && "font-semibold text-[color:var(--v2-ink)]",
                  )}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          className="mt-4 min-h-[76px]"
          id="board10-decision-notes"
          label="Record your decision"
          onChange={(event) => {
            setNotes(event.target.value);
            record.reset();
          }}
          rows={3}
          value={notes}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button
            className={cn(v2Type.bodyStrong, "h-10 rounded-lg px-4")}
            disabled={
              decision === null ||
              staleAsOf !== undefined ||
              review.awardPoints.kind !== "measured" ||
              !canSave ||
              record.isPending ||
              record.isSuccess
            }
            type="submit"
          >
            {record.isPending ? "Saving…" : "Save results review"}
          </Button>
          <span className={v2Type.meta}>
            <strong className="font-semibold text-[color:var(--v2-brand)]">
              {metric(review.awardPoints, (points) => `${points} work points`)}
            </strong>{" "}
            · Once per review period
          </span>
        </div>
        {staleAsOf ? (
          <p className={cn(v2Type.meta, "mt-3 text-[color:var(--v2-warn)]")} role="status">
            Stale data. This review cannot award points until it refreshes.
          </p>
        ) : null}
        {blocked ? (
          <p className={cn(v2Type.meta, "mt-3")} role="status">
            {blocked}
          </p>
        ) : null}
        {record.isError ? (
          <p className={cn(v2Type.meta, "mt-3 text-[color:var(--v2-warn)]")} role="status">
            The review was not recorded. Nothing has been saved - try again.
          </p>
        ) : null}
        {record.isSuccess ? (
          <p className={cn(v2Type.meta, "mt-3 text-[color:var(--v2-ok)]")} role="status">
            Your decision is recorded for this period.
          </p>
        ) : null}
      </form>
      <div className="mt-5 border-t border-[var(--v2-line)] pt-4">
        <h3 className={v2Type.caps}>Source links</h3>
        <div className="mt-1 divide-y divide-[var(--v2-line)]">
          <Link
            className={cn(
              v2Type.body,
              "flex items-center gap-2 py-2.5 hover:text-[color:var(--v2-brand)]",
            )}
            search={context}
            to="/v2/visibility/evidence"
          >
            <V2Icon name="srch" size={16} className="text-[color:var(--v2-ink3)]" />
            <span className="flex-1">View matching answers</span>
            <V2Icon name="chev" size={14} className="text-[color:var(--v2-ink3)]" />
          </Link>
          <Link
            className={cn(
              v2Type.body,
              "flex items-center gap-2 py-2.5 hover:text-[color:var(--v2-brand)]",
            )}
            search={context}
            to="/v2/today"
          >
            <V2Icon name="doc" size={16} className="text-[color:var(--v2-ink3)]" />
            <span className="flex-1">View page changes</span>
            <V2Icon name="chev" size={14} className="text-[color:var(--v2-ink3)]" />
          </Link>
        </div>
      </div>
    </ReviewFormPanel>
  );
}

function LimitsAndCapability({ progress }: { progress: Board10Data["progress"] }) {
  const requirements =
    progress.completedRequirements.kind === "measured" &&
    progress.requiredRequirements.kind === "measured"
      ? `${progress.completedRequirements.value} / ${progress.requiredRequirements.value} changes`
      : null;
  return (
    <>
      <Panel className="mt-5 px-4 py-3.5">
        <h2 className={v2Type.caps}>Measurement limits</h2>
        <p className={cn(v2Type.body, "mt-3 flex items-start gap-2")}>
          <V2Icon name="warn" size={15} className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]" />
          <span>
            We compare the same questions and engines. A before-and-after change alone does not
            establish cause.
          </span>
        </p>
        <p
          className={cn(
            v2Type.body,
            "mt-3 flex items-start gap-2 border-t border-[var(--v2-line)] pt-3",
          )}
        >
          <V2Icon
            name="shield"
            size={15}
            className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]"
          />
          <span>No points are lost when visibility falls.</span>
        </p>
      </Panel>
      <section
        className="mt-5 border-t border-[var(--v2-line)] pt-4"
        aria-labelledby="board10-capability"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="board10-capability" className={v2Type.bodyStrong}>
              Level 3 capability
            </h2>
            <p className={v2Type.meta}>All pending requirements complete.</p>
          </div>
          <span className={v2Type.num}>{requirements ?? <NotMeasured />}</span>
          <V2Icon name="check" size={17} className="shrink-0 text-[color:var(--v2-ok)]" />
        </div>
      </section>
    </>
  );
}

export function Board10Screen({ data, staleAsOf }: V2ScreenProps<Board10Data>) {
  return (
    <div data-testid="v2-board10-screen">
      <ReviewLayout
        main={
          <div>
            <ReviewPeriod review={data.review} />
            <div className="mb-1 mt-4">
              <VisibilityTabStrip active="b10" context={data.context} />
            </div>
            <ReviewSummaryCards
              cards={[
                {
                  icon: "check",
                  label: "Work completed",
                  value: (
                    <>
                      {metric(data.review.verifiedChanges, (count) => `${count} verified changes`)}
                    </>
                  ),
                },
                {
                  icon: "chart",
                  label: "Observed visibility",
                  value: <ObservedVisibility review={data.review} />,
                },
                {
                  icon: "link",
                  label: "Business results",
                  value:
                    data.review.businessResultsState === "not-connected" ? (
                      "Not connected"
                    ) : (
                      <NotMeasured />
                    ),
                  caption: "Do not assign points per observation.",
                  tone: "neutral",
                },
              ]}
            />
            <DecisionForm context={data.context} review={data.review} staleAsOf={staleAsOf} />
          </div>
        }
        rail={
          <div>
            <BrandProgressRail progress={data.progress} />
            <AwardHistory entries={data.progress.awardHistory} />
            <LimitsAndCapability progress={data.progress} />
          </div>
        }
      />
    </div>
  );
}
