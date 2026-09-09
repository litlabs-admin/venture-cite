import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VisibilityWeek } from "../data/visibilityTrend";

// The one visibility trend in this tree. Today's block and both Visibility
// screens draw this component rather than three charts that drift apart.
//
// THERE IS NO CONFIDENCE BAND, AND THERE MUST NOT BE ONE.
// The approved artboards draw a dashed interval either side of the line.
// `GET /api/v2/visibility/mention-rate/:brandId` returns weekly point buckets
// (`weekStart`, `cited`, `measured`, `mentionRate`) and nothing in
// `shared/visibilityMetrics.ts` computes an interval, so no endpoint in this
// product can say how wide that band is. A band shaded from the series itself
// - a rolling spread, a fixed percentage, a Wilson interval computed in the
// browser - would draw a statistical claim the product has never measured,
// and a reader would believe it because it looks measured. The band waits for
// a server-side interval (n per bucket plus the interval, as its own task).
//
// A WEEK WITH NO ANSWERS IS NOT A ZERO. `citationRatePct` returns 0 when
// `total` is 0, so callers filter those weeks out before passing them here;
// this component plots what it is given and never invents a floor.

const ACCENT = "var(--brand-accent)";

/** Week starts are plain `YYYY-MM-DD`, parsed and formatted in UTC so a
 *  browser behind UTC does not render the previous day. */
export function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Quarters of a multiple of 20 land the ticks on 0/15/30/45/60 for a series
 *  topping out in the forties, which is the artboards' axis. */
export function axisTop(maxRate: number): number {
  return Math.max(20, Math.ceil(maxRate / 20) * 20);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: VisibilityWeek }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const week = payload[0].payload;
  return (
    <div className="rounded border border-vc-default bg-vc-surface px-3 py-2 shadow-vc-overlay">
      <p className="mb-0.5 text-label text-vc-tertiary">
        Week of {label ? formatDay(label) : formatDay(week.weekStart)}
      </p>
      <p className="text-body font-semibold tabular-nums text-vc-primary">
        {week.mentionRate}%
        <span className="ml-1 text-label font-normal text-vc-tertiary">
          {week.cited} of {week.measured} answers collected
        </span>
      </p>
    </div>
  );
}

/**
 * The final point, and optionally its value beside it.
 *
 * Drawn as the series' own dot renderer rather than a `ReferenceDot` so the
 * chart uses only the recharts surface every other chart in this tree uses.
 */
function LastPointDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  count: number;
  label: string | null;
}) {
  const { cx, cy, index, count, label } = props;
  if (cx === undefined || cy === undefined || index !== count - 1) {
    return <circle cx={0} cy={0} r={0} fill="none" />;
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill={ACCENT} />
      {label && (
        <text
          x={cx + 8}
          y={cy}
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={600}
          fill={ACCENT}
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function TrendChart({
  weeks,
  /** The artboards print the latest rate beside the final point. */
  endLabel = false,
}: {
  weeks: VisibilityWeek[];
  endLabel?: boolean;
}) {
  const top = axisTop(weeks.reduce((max, week) => Math.max(max, week.mentionRate), 0));
  const ticks = [0, top * 0.25, top * 0.5, top * 0.75, top];
  const last = weeks[weeks.length - 1];
  const xTicks =
    weeks.length > 2
      ? [
          weeks[0].weekStart,
          weeks[Math.floor((weeks.length - 1) / 2)].weekStart,
          weeks[weeks.length - 1].weekStart,
        ]
      : weeks.map((week) => week.weekStart);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={weeks} margin={{ top: 8, right: endLabel ? 40 : 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="v2VisGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.16} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="weekStart"
          ticks={xTicks}
          tickFormatter={formatDay}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
        />
        <YAxis
          domain={[0, top]}
          ticks={ticks}
          tickFormatter={(value: number) => `${value}%`}
          tickLine={false}
          axisLine={false}
          width={40}
          tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-default)" }} />
        <Area
          type="monotone"
          dataKey="mentionRate"
          stroke={ACCENT}
          strokeWidth={1.5}
          fill="url(#v2VisGrad)"
          dot={
            <LastPointDot
              count={weeks.length}
              label={endLabel && last ? `${last.mentionRate}%` : null}
            />
          }
          activeDot={{ r: 3, fill: ACCENT, stroke: "var(--bg-surface-2)", strokeWidth: 1.5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
