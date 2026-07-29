import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PanelLabel } from "./primitives";

// ─── Visibility over time ────────────────────────────────────────────────────
// Left two-thirds of the first content row, 428px tall, px-8 py-6.
// Range toggle is a real <fieldset>/<label> radio group (measured: h-7,
// rounded border, p-0.5) so it is keyboard-operable, not a div pretending.
//
// The series comes from metrics_history snapshots, which are written only when
// a citation run records metrics — so the x-axis is snapshot-dated, not daily.
// With fewer than two snapshots there is no line to draw and the panel says so
// rather than rendering a flat placeholder.

const RANGES = [
  { key: "7D", days: 7 },
  { key: "14D", days: 14 },
  { key: "30D", days: 30 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const ACCENT = "#3b5bf6";

function fmtDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-vc-default bg-white px-3 py-2 shadow-vc-overlay">
      <p className="mb-0.5 text-[10px] text-vc-tertiary">{label ? fmtDay(label) : ""}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums text-vc-primary">
        {payload[0].value}
        <span className="ml-1 text-[10px] font-normal text-vc-tertiary">visibility</span>
      </p>
    </div>
  );
}

export function VisibilityChart({
  series,
  loading,
}: {
  series: { date: string; value: number }[];
  loading: boolean;
}) {
  const [range, setRange] = useState<RangeKey>("30D");

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return series.filter((p) => new Date(p.date).getTime() >= cutoff);
  }, [series, range]);

  return (
    <div className="h-full overflow-hidden border-r border-vc-default px-8 py-6 lg:col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PanelLabel>Visibility over time</PanelLabel>
        </div>
        <fieldset className="inline-flex h-7 items-center rounded border border-vc-default bg-white p-0.5">
          <legend className="sr-only">Visibility chart date range</legend>
          {RANGES.map((r) => (
            <label
              key={r.key}
              className={`relative inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-[3px] px-2 text-[12px] font-medium transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-vc-accent/40 ${
                range === r.key
                  ? "bg-vc-accent-subtle text-vc-accent"
                  : "text-vc-secondary hover:bg-vc-muted/40 hover:text-vc-primary"
              }`}
            >
              <input
                type="radio"
                name="visibility-range"
                className="sr-only"
                checked={range === r.key}
                onChange={() => setRange(r.key)}
              />
              {r.key}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="h-[340px] min-w-[200px]">
        {loading ? (
          <div className="h-full w-full rounded bg-vc-muted/40" aria-hidden />
        ) : data.length < 2 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-1 text-[13px] text-vc-tertiary">Not enough history yet</p>
            <p className="text-[11px] text-vc-tertiary/80">
              {series.length === 0
                ? "Visibility is recorded on each citation run. Run one to start the series."
                : `One snapshot recorded. A second one draws the trend.`}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="ccVisGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f5f5f4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#a8a29e" }}
                minTickGap={32}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#a8a29e" }}
                // Auto-fit with headroom, like the reference — a fixed 0–100
                // axis flattens real movement into an unreadable line.
                domain={[
                  (min: number) => Math.max(0, Math.floor((min - 5) / 5) * 5),
                  (max: number) => Math.min(100, Math.ceil((max + 5) / 5) * 5),
                ]}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e7e5e4" }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={ACCENT}
                strokeWidth={1.5}
                fill="url(#ccVisGrad)"
                dot={false}
                activeDot={{ r: 3, fill: ACCENT, stroke: "#fff", strokeWidth: 1.5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
