import { Circle, CircleCheck } from "lucide-react";
import type { WorkSummaryView } from "../data/workSummary";

// The right rail: where the brand is, and what the next level actually needs.
//
// WHAT IS NOT HERE, AND WHY. The artboard prints "20" beside each of the three
// steps. No contract carries a per-step point value - `/work/summary` returns
// `points`, `currentLevel` and `nextThreshold`, and nothing decomposes the gap
// between levels into per-step awards. Printing 20 would be a number this
// screen invented about the user's score, so the rail states the real
// remaining-points figure once, from `nextThreshold.points - points`, and
// leaves the steps unnumbered.

function StepRow({ done, children }: { done: boolean; children: React.ReactNode }) {
  const Glyph = done ? CircleCheck : Circle;
  return (
    <li
      className="flex items-start gap-2 border-b border-vc-default py-2.5 text-body last:border-b-0"
      data-testid="v2-start-step"
      data-done={done ? "true" : "false"}
    >
      <Glyph
        className={`mt-0.5 h-4 w-4 shrink-0 ${done ? "text-positive" : "text-vc-tertiary"}`}
        aria-hidden="true"
        data-glyph={done ? "done" : "todo"}
      />
      <span className={done ? "text-vc-tertiary" : "text-vc-secondary"}>{children}</span>
    </li>
  );
}

function LevelHexagon() {
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden="true">
      <path
        d="M24 2.5 43 13.25v21.5L24 45.5 5 34.75v-21.5z"
        fill="var(--brand-accent-subtle)"
        stroke="var(--brand-accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="5" fill="var(--brand-accent)" />
    </svg>
  );
}

export function StartRail({
  summary,
  factsApproved,
  reviewCount,
}: {
  /** Absent while `/work/summary` is loading or has failed. The rail still
   *  renders its fact step, which is the one this screen owns. */
  summary: WorkSummaryView | undefined;
  /** True only when at least one fact exists and none is still unreviewed. */
  factsApproved: boolean;
  reviewCount: number;
}) {
  const milestones = summary?.milestones ?? [];
  const pointsRemaining =
    summary?.nextThreshold != null
      ? Math.max(0, summary.nextThreshold.points - summary.points)
      : null;

  return (
    <div className="space-y-6" data-testid="v2-start-rail">
      <section>
        <div className="flex items-center gap-3">
          <LevelHexagon />
          <div className="min-w-0">
            <p className="text-section font-semibold text-vc-primary">
              {summary
                ? `Level ${summary.currentLevel.level} · ${summary.currentLevel.name}`
                : "Level not loaded"}
            </p>
            <p className="mt-0.5 text-caption tabular-nums text-vc-secondary">
              {summary ? `${summary.points} work points` : "Your score is unavailable right now."}
            </p>
          </div>
        </div>
      </section>

      <section
        className="border-t border-vc-default pt-5"
        aria-labelledby="v2-start-next-level-heading"
      >
        <h2 id="v2-start-next-level-heading" className="text-body font-semibold text-vc-primary">
          {summary?.nextThreshold
            ? `Reach Level ${summary.nextThreshold.level} · ${summary.nextThreshold.name}`
            : "Your starting steps"}
        </h2>

        <ul className="mt-2">
          <StepRow done={factsApproved}>
            {factsApproved
              ? "Essential facts approved"
              : reviewCount > 0
                ? `Approve ${reviewCount} fact${reviewCount === 1 ? "" : "s"} on this page`
                : "Approve your essential facts"}
          </StepRow>
          {/* Both remaining steps read a milestone the summary endpoint
              actually returns. Neither screen exists yet, so they are rows,
              not links - the precedent V2Nav set for an area with no route. */}
          <StepRow done={milestones.includes("goal_selected_and_queue_reviewed")}>
            Approve your buyer questions
          </StepRow>
          <StepRow done={milestones.includes("baseline_ready")}>Review baseline coverage</StepRow>
        </ul>

        <p className="mt-3 text-caption text-vc-tertiary">
          All three steps are required.
          {pointsRemaining !== null &&
            pointsRemaining > 0 &&
            ` ${pointsRemaining} more work point${pointsRemaining === 1 ? "" : "s"} to go.`}
        </p>
      </section>

      <section className="border-t border-vc-default pt-5">
        <h2 className="text-body font-semibold text-vc-primary">Why this matters</h2>
        <p className="mt-2 text-body text-vc-secondary">
          Approved facts separate a real conflict from an extraction error. Without them, a wrong
          answer about your brand and a wrong reading of your page look the same.
        </p>
        <p className="mt-2 text-body text-vc-secondary">
          Your approval establishes what is true about the business. A page check only establishes
          what a page says.
        </p>
        <p className="mt-2 text-body text-vc-secondary">
          Nothing is measured until all three steps are done.
        </p>
      </section>

      <section className="border-t border-vc-default pt-5">
        <h2 className="text-body font-semibold text-vc-primary">After that</h2>
        <p className="mt-2 text-body text-vc-secondary">
          Your first observation runs, and the ranked task list on Today opens.
        </p>
      </section>
    </div>
  );
}
