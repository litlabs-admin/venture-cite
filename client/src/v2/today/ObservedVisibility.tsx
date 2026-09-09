import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { StateBadge } from "../state/StateBadge";
import { TrendChart, formatDay } from "../visibility/TrendChart";
import type { VisibilityWeek } from "../data/visibilityTrend";

// Observed visibility.
//
// This section sits BELOW the work, and the percentage inside it is body
// weight, not a display number. That is the screen's thesis: the ranked task
// leads and the measurement follows as its evidence. Promoting this number to
// a large accent figure would say the opposite.
//
// TWO THINGS THIS BLOCK REFUSES TO DO:
//   - It never prints 0% for a brand with no answers. `citationRatePct`
//     returns 0 when `total` is 0, so a zero-total week is dropped from the
//     line and a series with no answers at all renders "Not measured".
//   - It draws no confidence band. `citation-trend` returns bucket counts and
//     nothing in `shared/visibilityMetrics.ts` computes an interval, so the
//     artboard's band has no data source. A band shaded from the series
//     itself would be a picture of certainty we have not measured.

const RANGES = [
  { key: "4w", weeks: 4 },
  { key: "8w", weeks: 8 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function formatSpan(weeks: VisibilityWeek[]): string {
  if (weeks.length === 0) return "";
  const first = weeks[0].weekStart;
  const last = weeks[weeks.length - 1].weekStart;
  const year = new Date(`${last}T00:00:00Z`).getUTCFullYear();
  return `${formatDay(first)} – ${formatDay(last)}, ${year}`;
}

export function ObservedVisibility({ weeks }: { weeks: VisibilityWeek[] }) {
  const [range, setRange] = useState<RangeKey>("8w");

  const windowed = useMemo(() => {
    const size = RANGES.find((entry) => entry.key === range)?.weeks ?? 8;
    return weeks.slice(Math.max(0, weeks.length - size));
  }, [weeks, range]);

  // A week with no answers is an absence of measurement, not a measured zero,
  // so it leaves a gap in the line rather than dragging it to the floor.
  const observed = useMemo(() => windowed.filter((week) => week.measured > 0), [windowed]);
  const latest = observed.length > 0 ? observed[observed.length - 1] : null;

  return (
    <section className="pt-6" aria-labelledby="v2-visibility-heading" data-testid="v2-visibility">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="v2-visibility-heading"
          className="text-data font-medium uppercase tracking-wider text-vc-tertiary"
        >
          Observed visibility
        </h2>

        <div className="relative inline-flex items-center">
          <label htmlFor="v2-visibility-range" className="sr-only">
            Visibility date range
          </label>
          <select
            id="v2-visibility-range"
            value={range}
            onChange={(event) => setRange(event.target.value as RangeKey)}
            className="cursor-pointer appearance-none rounded-sm bg-transparent py-0.5 pr-5 pl-1 text-caption text-vc-secondary hover:text-vc-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
          >
            {RANGES.map((entry) => {
              const span = formatSpan(weeks.slice(Math.max(0, weeks.length - entry.weeks)));
              return (
                <option key={entry.key} value={entry.key}>
                  {span || `Last ${entry.weeks} weeks`}
                </option>
              );
            })}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-vc-tertiary"
            aria-hidden="true"
          />
        </div>
      </div>

      {latest ? (
        <p className="mt-1.5 text-body text-vc-secondary" data-testid="v2-visibility-sentence">
          Brand mentioned in {latest.cited} of {latest.measured} answers collected ·{" "}
          <span className="font-semibold text-vc-accent">{latest.mentionRate}%</span>
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-2" data-testid="v2-visibility-empty">
          <StateBadge state="not_measured" />
          <span className="text-body text-vc-secondary">
            No test answers have been observed for this brand yet.
          </span>
        </div>
      )}

      <div className="mt-4 h-[220px] min-w-[240px]">
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
          <TrendChart weeks={observed} />
        )}
      </div>

      {latest && (
        <p className="mt-3 text-caption text-vc-tertiary">
          Latest sample: {latest.measured} answers collected
        </p>
      )}
    </section>
  );
}
