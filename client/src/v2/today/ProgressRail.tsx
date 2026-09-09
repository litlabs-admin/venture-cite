import { Check, ChevronRight, Circle, CircleCheck, FileText } from "lucide-react";
import type { WorkSummaryView } from "../data/workSummary";

// The progress rail.
//
// Every number here is read from `/work/summary`; none is derived by guessing.
// Where the contract cannot answer a question the artboard asks (how many
// changes of how many are verified, for instance), the rail says what it does
// know instead of inventing a ratio.

/**
 * The capability milestone each level requires.
 *
 * `server/domains/work/policy.ts` owns this pairing, and the summary endpoint
 * projects `currentLevel`/`nextThreshold` without it - so reaching the next
 * level's requirement means restating the pairing here. It is a copy, and it
 * is deliberately small and level-keyed so a policy change is a one-line
 * change on this side too.
 */
export const LEVEL_REQUIREMENT: Readonly<Record<number, { milestone: string; label: string }>> = {
  1: { milestone: "goal_selected_and_queue_reviewed", label: "Choose a goal and review the queue" },
  2: { milestone: "baseline_ready", label: "Record a measurement baseline" },
  3: { milestone: "evidenced_changes_complete", label: "Verify your evidenced changes" },
  4: { milestone: "decision_recorded", label: "Record a decision from your results" },
  5: { milestone: "multi_period_maintenance", label: "Keep the work going across periods" },
};

export function LevelHexagon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden="true">
      <path
        d="M24 2.5 43 13.25v21.5L24 45.5 5 34.75v-21.5z"
        fill="var(--brand-accent-subtle)"
        stroke="var(--brand-accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M24 15.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L24 30.3l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z"
        fill="var(--brand-accent)"
      />
    </svg>
  );
}

function ChecklistRow({ done, children }: { done: boolean; children: React.ReactNode }) {
  const Glyph = done ? CircleCheck : Circle;
  return (
    <li className="flex items-start gap-2 text-body">
      <Glyph
        className={`mt-0.5 h-4 w-4 shrink-0 ${done ? "text-positive" : "text-vc-tertiary"}`}
        aria-hidden="true"
        data-glyph={done ? "done" : "todo"}
      />
      <span className={done ? "text-vc-tertiary line-through" : "text-vc-secondary"}>
        {children}
      </span>
    </li>
  );
}

export function ProgressRail({ summary }: { summary: WorkSummaryView }) {
  const { points, currentLevel, nextThreshold, milestones, pendingCount, waitingTasks } = summary;

  const requirement = nextThreshold ? LEVEL_REQUIREMENT[nextThreshold.level] : undefined;
  const requirementMet = requirement ? milestones.includes(requirement.milestone) : false;
  const pointsRemaining = nextThreshold ? Math.max(0, nextThreshold.points - points) : 0;
  const percent = nextThreshold
    ? Math.min(100, Math.max(0, Math.round((points / nextThreshold.points) * 100)))
    : 100;

  return (
    <div className="space-y-6" data-testid="v2-progress-rail">
      <section aria-labelledby="v2-progress-heading">
        <h2 id="v2-progress-heading" className="text-body font-semibold text-vc-primary">
          Your progress
        </h2>

        <div className="mt-3 flex items-center gap-3">
          <LevelHexagon />
          <div className="min-w-0">
            <p className="text-section font-semibold text-vc-primary">
              Level {currentLevel.level} · {currentLevel.name}
            </p>
            <p className="mt-0.5 text-caption tabular-nums text-vc-secondary">
              {nextThreshold
                ? `${points} / ${nextThreshold.points} work points`
                : `${points} work points`}
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
            <div className="h-full rounded-full bg-vc-accent" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-caption tabular-nums text-vc-secondary">{percent}%</span>
        </div>
      </section>

      <section aria-labelledby="v2-next-level-heading">
        <h3 id="v2-next-level-heading" className="text-body font-semibold text-vc-primary">
          {nextThreshold
            ? `To reach Level ${nextThreshold.level} · ${nextThreshold.name}`
            : "Top level reached"}
        </h3>

        {nextThreshold ? (
          <ul className="mt-3 space-y-2">
            <ChecklistRow done={pointsRemaining === 0}>
              {pointsRemaining === 0
                ? "Points earned"
                : `Earn ${pointsRemaining} more point${pointsRemaining === 1 ? "" : "s"}`}
            </ChecklistRow>
            {requirement && <ChecklistRow done={requirementMet}>{requirement.label}</ChecklistRow>}
          </ul>
        ) : (
          <p className="mt-2 text-body text-vc-secondary">
            Every level is complete. Keep the work going to hold the position.
          </p>
        )}

        <p className="mt-4 border-t border-vc-default pt-3 text-caption text-vc-tertiary">
          {pendingCount === 0
            ? "No work is open right now."
            : `${pendingCount} task${pendingCount === 1 ? "" : "s"} still open`}
        </p>
      </section>

      <section aria-labelledby="v2-waiting-heading">
        <h3 id="v2-waiting-heading" className="text-body font-semibold text-vc-primary">
          Waiting for observation
        </h3>
        <p className="mt-1 text-caption text-vc-secondary">
          {waitingTasks.length === 0
            ? "Nothing is waiting on a measurement yet."
            : "The next measurement will check the result."}
        </p>

        {waitingTasks.length > 0 && (
          <ul className="mt-3 space-y-2">
            {waitingTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-md border border-vc-default bg-vc-surface p-3"
                data-testid="v2-waiting-task"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vc-muted text-vc-secondary"
                    aria-hidden="true"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-vc-primary">{task.title}</p>
                    <p className="mt-1 flex items-start gap-1.5 text-caption text-vc-accent">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Work verified · {task.points} work points</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-vc-tertiary" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The screen's honesty note: points record work done, not visibility
          gained. It is the last thing in the rail on the artboard for the
          same reason - it qualifies everything above it. */}
      <p className="text-data text-vc-tertiary">Work points do not measure visibility.</p>
    </div>
  );
}
