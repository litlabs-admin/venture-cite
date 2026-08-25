import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { NoValue, PanelLabel } from "@/components/dashboard-panels/primitives";
import type { SiteHealthScanHistoryEntry } from "./types";

const ACCENT = "var(--brand-accent)";

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
    <div className="rounded border border-vc-default bg-vc-surface px-3 py-2 shadow-vc-overlay">
      <p className="mb-0.5 text-label text-vc-tertiary">{label ? fmtDay(label) : ""}</p>
      <p className="font-mono text-body font-semibold tabular-nums text-vc-primary">
        {payload[0].value}
        <span className="ml-1 text-label font-normal text-vc-tertiary">score</span>
      </p>
    </div>
  );
}

export function HistoryTab({ brandId }: { brandId: string }) {
  const historyQuery = useQuery<{
    success: boolean;
    data: { scans: SiteHealthScanHistoryEntry[] };
  }>({
    queryKey: [`/api/dashboard/site-health/${brandId}/history`],
    enabled: !!brandId,
  });

  // API returns newest-first; the chart wants oldest-first, left to right.
  const scans = useMemo(
    () => [...(historyQuery.data?.data?.scans ?? [])].reverse(),
    [historyQuery.data],
  );

  const chartData = scans
    .filter((s) => s.score !== null)
    .map((s) => ({ date: s.createdAt, score: s.score as number }));

  const latest = scans[scans.length - 1];
  const previous = scans.length > 1 ? scans[scans.length - 2] : null;
  const change =
    latest?.score !== null &&
    latest?.score !== undefined &&
    previous?.score !== null &&
    previous?.score !== undefined
      ? latest.score - previous.score
      : null;
  const best = scans.reduce<number | null>(
    (max, s) => (s.score !== null ? Math.max(max ?? s.score, s.score) : max),
    null,
  );

  if (historyQuery.isLoading) {
    return <div className="h-64 w-full animate-pulse bg-vc-muted/40" />;
  }

  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
        <p className="mb-1 text-body text-vc-tertiary">No scan history yet</p>
        <p className="text-data text-vc-tertiary/80">
          History starts recording from your next completed scan onward - past scans weren't
          tracked.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-y divide-vc-default border-b border-vc-default sm:grid-cols-4 sm:divide-y-0">
        <div className="px-6 py-5">
          <PanelLabel>Checks score</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {latest?.score !== null && latest?.score !== undefined ? (
              `${latest.score}/100`
            ) : (
              <NoValue />
            )}
          </div>
        </div>
        <div className="px-6 py-5">
          <PanelLabel>Change</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {change !== null ? change > 0 ? `+${change}` : change : <NoValue />}
          </div>
        </div>
        <div className="px-6 py-5">
          <PanelLabel>Best</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {best ?? <NoValue />}
          </div>
        </div>
        <div className="px-6 py-5">
          <PanelLabel>Scans</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {scans.length}
          </div>
        </div>
      </div>

      <div className="border-b border-vc-default px-8 py-6">
        <PanelLabel>Score trend</PanelLabel>
        {chartData.length < 2 ? (
          <p className="mt-3 text-data text-vc-tertiary">
            Needs at least two scored scans to draw a trend - one so far.
          </p>
        ) : (
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="siteHealthScoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["dataMin - 5", "dataMax + 5"]}
                  tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  fill="url(#siteHealthScoreGradient)"
                  dot={{ r: 2.5, fill: "var(--bg-surface-2)", stroke: ACCENT, strokeWidth: 1.25 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="px-8 py-4">
        <PanelLabel>Past scans</PanelLabel>
        <div className="overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_72px_72px_72px_72px] items-center gap-x-4 border-b border-vc-default pb-2">
              <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
                Date
              </span>
              <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
                Score
              </span>
              <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
                Change
              </span>
              <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
                Pages
              </span>
              <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
                Issues
              </span>
            </div>
            {[...scans].reverse().map((s, i, arr) => {
              const prev = arr[i + 1];
              const rowChange =
                s.score !== null && prev?.score !== null && prev?.score !== undefined
                  ? s.score - prev.score
                  : null;
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px_72px] items-center gap-x-4 h-11 border-b border-vc-default"
                >
                  <span className="text-caption text-vc-secondary">
                    {new Date(s.createdAt).toLocaleDateString()}
                    {i === 0 && <span className="ml-2 text-label text-vc-accent">Latest</span>}
                  </span>
                  <span className="tabular-nums text-data text-vc-tertiary">{s.score ?? "–"}</span>
                  <span className="tabular-nums text-data text-vc-tertiary">
                    {rowChange === null ? "–" : rowChange > 0 ? `+${rowChange}` : rowChange}
                  </span>
                  <span className="tabular-nums text-data text-vc-tertiary">
                    {s.pagesCrawled ?? "–"}
                  </span>
                  <span className="tabular-nums text-data text-vc-tertiary">
                    {s.issues.critical + s.issues.high + s.issues.medium + s.issues.low}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
