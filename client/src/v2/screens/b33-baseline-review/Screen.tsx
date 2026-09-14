import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/v2/shared/ui/Chip";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { LevelBadge } from "@/v2/shared/ui/LevelBadge";
import { Panel } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { GOAL_CATALOG, type GoalKey } from "./goalCatalog";

export type Board33Value<T> = { kind: "measured"; value: T } | { kind: "not-measured" };

const measuredOrDash = <T,>(value: Board33Value<T>, format: (v: T) => string): string =>
  value.kind === "measured" ? format(value.value) : "—";

export type Board33Data = {
  brandId: string;
  mode: "guided" | "expert";
  brand: { name: string };
  baseline: {
    measuredDate: Board33Value<string>;
    mentionCount: Board33Value<number>;
    mentionDenominator: Board33Value<number>;
    mentionRate: Board33Value<number>;
    failedCount: Board33Value<number>;
    failedDenominator: Board33Value<number>;
  };
  recommendedTask: {
    title: Board33Value<string>;
    points: Board33Value<number>;
    reason: Board33Value<string>;
  } | null;
  progress: {
    level: number;
    levelName: string;
    points: number;
    nextLevelPoints: number | null;
  };
};

export type Board33ScreenProps = V2ScreenProps<Board33Data> & {
  onChooseGoal?: (goalKey: GoalKey) => void;
  isSavingGoal?: boolean;
  saveGoalError?: string | null;
};

function SummaryCell({ label, value, support }: { label: string; value: string; support: string }) {
  return (
    <Panel padding="standard" className="min-w-0">
      <p className={v2Type.caps}>{label}</p>
      <p className={`${v2Type.statBig} mt-1.5`}>{value}</p>
      <p className={`${v2Type.meta} mt-1`}>{support}</p>
    </Panel>
  );
}

function GoalCard({
  entry,
  selected,
  onSelect,
}: {
  entry: (typeof GOAL_CATALOG)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="board33-goal-card"
      className="w-full text-left"
    >
      <Panel
        selected={selected}
        padding="standard"
        className="flex items-start gap-3 transition-colors"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
            selected
              ? "border-[var(--v2-brand)] bg-[var(--v2-brand)] text-[color:var(--v2-paper)]"
              : "border-[var(--v2-line2)] text-transparent"
          }`}
        >
          <V2Icon name="check" size={12} />
        </span>
        <div className="min-w-0">
          <h3 className={v2Type.bodyStrong}>{entry.title}</h3>
          <p className={`${v2Type.body} mt-1`}>{entry.description}</p>
        </div>
      </Panel>
    </button>
  );
}

export function Board33Screen({
  data,
  onChooseGoal,
  isSavingGoal,
  saveGoalError,
}: Board33ScreenProps) {
  const [selectedGoal, setSelectedGoal] = useState<GoalKey | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const { baseline, recommendedTask, progress } = data;

  return (
    <div
      className="flex min-h-full min-w-0 flex-col lg:flex-row"
      data-testid="board33-baseline-review"
    >
      <main className="min-w-0 flex-1 px-7 py-6 xl:px-8">
        <PageHeader
          title="Your starting point is ready"
          sub={
            baseline.measuredDate.kind === "measured" ? (
              <>
                Here&apos;s {data.brand.name}&apos;s baseline from {baseline.measuredDate.value}.
                Choose a goal to get your first recommended step.
              </>
            ) : (
              <>Choose a goal to get {data.brand.name}&apos;s first recommended step.</>
            )
          }
          className="mb-5"
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="board33-summary">
          <SummaryCell
            label={`Mentions ${data.brand.name}`}
            value={measuredOrDash(baseline.mentionCount, (v) => String(v))}
            support={
              baseline.mentionDenominator.kind === "measured"
                ? `of ${baseline.mentionDenominator.value} successful answers`
                : "successful answers"
            }
          />
          <SummaryCell
            label="Mention rate"
            value={measuredOrDash(baseline.mentionRate, (v) => `${v}%`)}
            support="of successful answers"
          />
          <SummaryCell
            label="Failed attempts"
            value={measuredOrDash(baseline.failedCount, (v) => String(v))}
            support={
              baseline.failedDenominator.kind === "measured"
                ? `of ${baseline.failedDenominator.value} attempts`
                : "attempts"
            }
          />
          <SummaryCell
            label="Measurement date"
            value={measuredOrDash(baseline.measuredDate, (v) => v)}
            support="Latest baseline"
          />
        </div>

        <EmptyState
          className="mt-4"
          icon="doc"
          title={<StateLabel state="not-measured" />}
          description="Per-engine and buyer-journey-stage results aren't available yet. This baseline shows the totals the measurement pipeline reports today."
        />

        <section className="mt-7" aria-labelledby="board33-goals-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="board33-goals-heading" className={v2Type.sectionTitle}>
              Choose your primary goal
            </h2>
            <Button
              type="button"
              variant="ghost"
              className="h-auto px-0 text-[13px] text-[color:var(--v2-brand)]"
              aria-expanded={explainOpen}
              aria-controls="board33-goal-explain"
              onClick={() => setExplainOpen((open) => !open)}
            >
              Why these goals?
            </Button>
          </div>
          <p className={`${v2Type.body} mt-1`}>
            Select one goal to get a personalized plan. You can change this anytime.
          </p>
          {explainOpen ? (
            <div
              id="board33-goal-explain"
              className="mt-2 rounded-[var(--v2-radius)] bg-[var(--v2-inset)] px-3 py-2.5"
            >
              <p className={v2Type.body}>
                Each goal ranks the same evidence differently: visibility work favors buyer-facing
                pages, citations favor first-party sources, inquiries favor conversion pages, and
                corrections favor fixing what is already published and wrong.
              </p>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {GOAL_CATALOG.map((entry) => (
              <GoalCard
                key={entry.key}
                entry={entry}
                selected={selectedGoal === entry.key}
                onSelect={() => setSelectedGoal(entry.key)}
              />
            ))}
          </div>
        </section>

        {recommendedTask ? (
          <section className="mt-6 border-t border-[var(--v2-line)] pt-5">
            <p className={v2Type.caps}>First recommended task</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h3 className={v2Type.cardTitle}>
                {measuredOrDash(recommendedTask.title, (v) => v)}
              </h3>
              <Chip tone="brand">
                {measuredOrDash(recommendedTask.points, (v) => `${v} work points`)}
              </Chip>
            </div>
            {recommendedTask.reason.kind === "measured" ? (
              <p className={`${v2Type.body} mt-1.5`}>{recommendedTask.reason.value}</p>
            ) : null}
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-10 rounded-lg px-4 text-[13.5px]"
            disabled={!selectedGoal || isSavingGoal}
            onClick={() => selectedGoal && onChooseGoal?.(selectedGoal)}
          >
            {isSavingGoal ? "Saving…" : "Choose goal and start"}
          </Button>
          {saveGoalError ? (
            <span className="text-[13px] text-[color:var(--v2-bad)]">{saveGoalError}</span>
          ) : null}
        </div>
      </main>

      <aside
        aria-label="Your progress"
        className="w-full shrink-0 space-y-5 border-t border-[var(--v2-line)] px-7 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6"
      >
        <section>
          <h2 className={v2Type.bodyStrong}>Your progress</h2>
          <div className="mt-3 flex items-center gap-3.5">
            <LevelBadge
              level={progress.level}
              name=""
              size="md"
              className="[&>span:last-child]:hidden"
            />
            <div className="min-w-0">
              <p className="text-[17px] leading-[1.3] font-semibold tracking-[-0.02em] text-[color:var(--v2-ink)]">
                Level {progress.level} · {progress.levelName}
              </p>
              <p className={`${v2Type.body} mt-0.5 tabular-nums`}>
                {progress.nextLevelPoints !== null
                  ? `${progress.points} / ${progress.nextLevelPoints} work points`
                  : `${progress.points} work points`}
              </p>
            </div>
          </div>
          {progress.nextLevelPoints !== null ? (
            <ProgressBar
              className="mt-4"
              value={Math.round((progress.points / progress.nextLevelPoints) * 100)}
            />
          ) : null}
        </section>

        <section className="border-t border-[var(--v2-line)] pt-5">
          <h3 className={v2Type.bodyStrong}>About this baseline</h3>
          <p className={`${v2Type.body} mt-2`}>
            {baseline.failedDenominator.kind === "measured"
              ? `${baseline.failedDenominator.value} test prompts observed in this window.`
              : "The observation window total isn't available yet."}
          </p>
          <p className={`${v2Type.meta} mt-2`}>
            If an engine could not return a result, it&apos;s counted as a failed attempt, not a
            missed mention.
          </p>
        </section>

        <section className="border-t border-[var(--v2-line)] pt-5">
          <h3 className={v2Type.bodyStrong}>Your starting level</h3>
          <p className={`${v2Type.body} mt-2`}>
            Level {progress.level} · {progress.levelName}. Complete guided tasks to unlock the next
            level.
          </p>
          <p className={`${v2Type.meta} mt-3`}>
            Work points do not measure visibility. They track the guided steps you complete.
          </p>
        </section>
      </aside>
    </div>
  );
}
