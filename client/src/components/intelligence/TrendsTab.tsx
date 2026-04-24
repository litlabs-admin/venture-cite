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
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Plus,
  RefreshCw,
  Award,
  History,
  Calendar,
} from "lucide-react";
import type { MetricsHistory } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
      queryClient.invalidateQueries({ queryKey: [`/api/metrics-history/${selectedBrandId}`] });
      toast({
        title: "Metrics snapshot recorded",
        description: "Historical data has been captured",
      });
    },
    onError: () => {
      toast({ title: "Failed to record metrics", variant: "destructive" });
    },
  });

  const getTrendChartData = () => {
    // Bucket snapshots by timestamp rounded to the minute so multiple
    // citation runs on the same day each get their own point on the chart.
    // Previous code keyed by toLocaleDateString() which collapsed every
    // run on a given day into a single bucket — .find() took the first
    // row, leaving runs 2+N invisible and making the chart look stuck.
    const soaData = metricsHistory.filter((m) => m.metricType === "share_of_answer");
    const cqData = metricsHistory.filter((m) => m.metricType === "citation_quality");
    const halData = metricsHistory.filter((m) => m.metricType === "hallucinations");

    const keyOf = (ts: string | Date): string => {
      const d = new Date(ts);
      d.setSeconds(0, 0);
      return d.toISOString();
    };
    const labelOf = (iso: string): string => {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    };

    const byKey = new Map<
      string,
      {
        key: string;
        date: string;
        shareOfAnswer: number | null;
        citationQuality: number | null;
        hallucinations: number | null;
      }
    >();
    const ensure = (key: string) => {
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          date: labelOf(key),
          shareOfAnswer: null,
          citationQuality: null,
          hallucinations: null,
        };
        byKey.set(key, row);
      }
      return row;
    };
    for (const m of soaData)
      ensure(keyOf(m.snapshotDate)).shareOfAnswer = parseFloat(m.metricValue);
    for (const m of cqData)
      ensure(keyOf(m.snapshotDate)).citationQuality = parseFloat(m.metricValue);
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
        <Card>
          <CardContent className="py-12 text-center">
            <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Historical Data Yet</h3>
            <p className="text-muted-foreground mb-4">
              Start recording snapshots to track your metrics over time
            </p>
            <Button
              onClick={() => recordMetricsMutation.mutate()}
              disabled={recordMetricsMutation.isPending}
              data-testid="button-first-snapshot"
            >
              <Plus className="w-4 h-4 mr-2" />
              Record First Snapshot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Share-of-Answer Trend
              </CardTitle>
              <CardDescription>Percentage of AI responses that cite your brand</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getTrendChartData()}>
                    <defs>
                      <linearGradient id="soaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="shareOfAnswer"
                      stroke="#3b82f6"
                      fill="url(#soaGradient)"
                      name="Share of Answer (%)"
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Citation Quality Trend
                </CardTitle>
                <CardDescription>Average quality score of citations over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getTrendChartData()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis domain={[0, 100]} className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="citationQuality"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ fill: "#10b981" }}
                        name="Quality Score"
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Unresolved Hallucinations
                </CardTitle>
                <CardDescription>Count of unresolved AI inaccuracies</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getTrendChartData()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="hallucinations"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ fill: "#ef4444" }}
                        name="Unresolved Issues"
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                All Metrics Combined
              </CardTitle>
              <CardDescription>Compare all key metrics on a single chart</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={getTrendChartData()}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="shareOfAnswer"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Share of Answer (%)"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="citationQuality"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Citation Quality"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="hallucinations"
                      stroke="#ef4444"
                      strokeWidth={2}
                      name="Hallucinations"
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
