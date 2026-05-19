import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Plus, RefreshCw, History, Calendar } from "lucide-react";
import type { MetricsHistory } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/foundations";
import { chartTheme } from "@/lib/chartTheme";

export default function TrendsTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { toast } = useToast();

  const [trendDays, setTrendDays] = useState(30);
  const { data: metricsHistoryData, isLoading: trendsLoading } = useQuery<{
    success: boolean;
    data: MetricsHistory[];
  }>({
    queryKey: [`/api/metrics-history/${selectedBrandId}?days=${trendDays}`],
    enabled: !!selectedBrandId,
  });

  const metricsHistory = metricsHistoryData?.data || [];

  const recordMetricsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/metrics-history/record/${selectedBrandId}`, {});
    },
    onSuccess: () => {
      // Predicate match: the list query keys include `?days=` so the
      // bare prefix never invalidated the cached entry. Match every
      // metrics-history key for this brand regardless of window.
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith(`/api/metrics-history/${selectedBrandId}`),
      });
      toast({
        title: "Metrics snapshot recorded",
        description: "Historical data has been captured",
      });
    },
    onError: () => {
      toast({ title: "Failed to record metrics", variant: "destructive" });
    },
  });

  // Only `hallucinations` is charted: it is a real unresolved-issue count.
  // The former share_of_answer / citation_quality series were derived from
  // the dead prompt_portfolio / citation_quality tables (server-synthesized
  // numbers) and were removed — the system cannot defend them.
  const getTrendChartData = () => {
    // Bucket snapshots by timestamp rounded to the minute so multiple
    // citation runs on the same day each get their own point on the chart.
    // Previous code keyed by toLocaleDateString() which collapsed every
    // run on a given day into a single bucket — .find() took the first
    // row, leaving runs 2+N invisible and making the chart look stuck.
    const halData = metricsHistory.filter((m) => m.metricType === "hallucinations");

    const keyOf = (ts: string | Date): string => {
      const d = new Date(ts);
      d.setSeconds(0, 0);
      return d.toISOString();
    };
    const labelOf = (iso: string): string => {
      const d = new Date(iso);
      // Render in UTC with an explicit suffix. Snapshots are stored in
      // UTC; rendering in the user's local timezone made the same chart
      // read differently for collaborators in different timezones.
      const formatted = d.toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `${formatted} UTC`;
    };

    const byKey = new Map<
      string,
      {
        key: string;
        date: string;
        hallucinations: number | null;
      }
    >();
    const ensure = (key: string) => {
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          date: labelOf(key),
          hallucinations: null,
        };
        byKey.set(key, row);
      }
      return row;
    };
    for (const m of halData)
      ensure(keyOf(m.snapshotDate)).hallucinations = parseFloat(m.metricValue);

    return Array.from(byKey.values()).sort(
      (a, b) => new Date(a.key).getTime() - new Date(b.key).getTime(),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Historical Performance Trends</h3>
          <p className="text-sm text-muted-foreground">
            Track your AI intelligence metrics over time
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={trendDays.toString()} onValueChange={(v) => setTrendDays(parseInt(v))}>
            <SelectTrigger className="w-[150px]" data-testid="select-trend-days">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => recordMetricsMutation.mutate()}
            disabled={recordMetricsMutation.isPending}
            data-testid="button-record-snapshot"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${recordMetricsMutation.isPending ? "animate-spin" : ""}`}
            />
            Record Snapshot
          </Button>
        </div>
      </div>

      {trendsLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading trends data...</p>
          </CardContent>
        </Card>
      ) : getTrendChartData().length === 0 ? (
        <EmptyState
          icon={History}
          title="No Historical Data Yet"
          body="Start recording snapshots to track your metrics over time"
          cta={
            <Button
              onClick={() => recordMetricsMutation.mutate()}
              disabled={recordMetricsMutation.isPending}
              data-testid="button-first-snapshot"
            >
              <Plus className="w-4 h-4 mr-2" />
              Record First Snapshot
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Unresolved Hallucinations
              </CardTitle>
              <CardDescription>Count of unresolved AI inaccuracies over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={getTrendChartData()}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={chartTheme.tooltipContentStyle} />
                    <Line
                      type="monotone"
                      dataKey="hallucinations"
                      stroke={chartTheme.series.issues}
                      strokeWidth={2}
                      dot={{ fill: chartTheme.series.issues }}
                      name="Unresolved Issues"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
