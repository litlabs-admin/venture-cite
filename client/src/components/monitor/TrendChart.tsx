// client/src/components/monitor/TrendChart.tsx
//
// 8-week citation trend chart. The single canonical trend on the Visibility
// canvas — the audit §3.7 "two recordCurrentMetrics writing different math"
// problem is now gone because the Intelligence Trends tab was deleted and
// this is the only place a trend chart is rendered.
//
// Click a week → AppShell Inspector opens with that week's runs.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { chartTheme } from "@/lib/chartTheme";
import { useInspector } from "@/components/AppShell";
import RunResultsInspector from "./inspectors/RunResultsInspector";

type TrendWeek = {
  weekStart: string;
  citationRate: number;
  cited: number;
  total: number;
};

type WeekDatum = {
  date: string;
  weekStartIso: string;
  score: number;
  cited: number;
  total: number;
};

export default function TrendChart({
  brandId,
  weeks,
  isLoading,
}: {
  brandId: string;
  weeks: TrendWeek[];
  isLoading: boolean;
}) {
  const { open } = useInspector();
  const data: WeekDatum[] = weeks.map((w) => ({
    date: new Date(w.weekStart).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    weekStartIso: w.weekStart,
    score: w.citationRate,
    cited: w.cited,
    total: w.total,
  }));
  const hasData = data.some((w) => w.total > 0);

  function handleWeekClick(payload: unknown) {
    const p = payload as { activePayload?: Array<{ payload?: WeekDatum }> } | null | undefined;
    const week = p?.activePayload?.[0]?.payload;
    if (!week) return;
    open({
      title: `Week of ${week.date}`,
      body: <RunResultsInspector brandId={brandId} weekStartIso={week.weekStartIso} />,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Citation trend</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Run a citation check to start tracking your trend.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} onClick={handleWeekClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                stroke="var(--muted-foreground)"
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={chartTheme.tooltipContentStyle}
                labelStyle={chartTheme.tooltipLabelStyle}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke={chartTheme.series.visibility}
                strokeWidth={2}
                dot={{ r: 4, fill: chartTheme.series.visibility, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: chartTheme.series.visibility, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
