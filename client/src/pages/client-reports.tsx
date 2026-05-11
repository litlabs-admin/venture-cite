import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import { pageExplainers } from "@/lib/pageExplainers";
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  MessageSquare,
  Target,
  BarChart3,
  Calendar,
  FileText,
  CheckCircle2,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { SiOpenai, SiGoogle } from "react-icons/si";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

// Display-only badge metadata (icons + badge colors). Platform names
// themselves are defined in @shared/constants; this just adds per-platform UI.
const AI_PLATFORM_BADGES = [
  { name: "ChatGPT", icon: <SiOpenai className="h-4 w-4" />, color: "bg-green-500" },
  { name: "Claude", icon: <span className="text-xs font-bold">C</span>, color: "bg-orange-500" },
  { name: "Perplexity", icon: <span className="text-xs font-bold">P</span>, color: "bg-blue-500" },
  { name: "Gemini", icon: <SiGoogle className="h-4 w-4" />, color: "bg-purple-500" },
  { name: "Copilot", icon: <span className="text-xs font-bold">M</span>, color: "bg-cyan-500" },
];

interface ReportMetrics {
  brandMentionFrequency: number;
  previousBMF: number;
  shareOfVoice: number;
  previousSOV: number;
  citationRate: number;
  previousCitationRate: number;
  promptCoverage: number;
  previousPromptCoverage: number;
  platformBreakdown: { platform: string; citations: number; mentions: number; trend: number }[];
  topPerformingContent: { title: string; citations: number; platform: string }[];
  recommendations: string[];
}

type NotificationPreference = {
  type: string;
  label: string;
  description: string;
  channel: string;
  emailEnabled: boolean;
};

export default function ClientReports() {
  const { selectedBrandId, brands, isLoading: brandsLoading } = useBrandSelection();
  const [reportPeriod, setReportPeriod] = useState<string>("30");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: metricsResponse,
    isLoading: metricsLoading,
    isError: metricsIsError,
    isRefetching: metricsIsRefetching,
    refetch: refetchMetrics,
    dataUpdatedAt,
  } = useQuery<{
    success: boolean;
    data: ReportMetrics;
  }>({
    queryKey: ["/api/client-reports", selectedBrandId, { period: reportPeriod }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/client-reports/${selectedBrandId}?period=${reportPeriod}`,
      );
      return res.json();
    },
    enabled: !!selectedBrandId,
  });

  const metrics = metricsResponse?.data;

  const calcGrowth = (current: number, previous: number): string => {
    if (previous === 0) return "—"; // No historical data available
    const growth = ((current - previous) / previous) * 100;
    const prefix = growth >= 0 ? "+" : "";
    return `${prefix}${growth.toFixed(1)}%`;
  };

  const lastRefreshedLabel = (() => {
    if (!dataUpdatedAt) return "—";
    const ageMs = Date.now() - dataUpdatedAt;
    const ageMin = Math.round(ageMs / 60000);
    if (ageMin < 1) return "just now";
    if (ageMin < 60) return `${ageMin}m ago`;
    return `${Math.round(ageMin / 60)}h ago`;
  })();

  // Weekly-report toggle — reuses the existing notification-preferences
  // pattern from settings.tsx so the cron in server/scheduler.ts (which
  // gates on users.weeklyReportEnabled) picks up the change.
  const prefsQueryKey = ["/api/user/notification-preferences"];
  const { data: prefsData } = useQuery<{
    success: boolean;
    data: NotificationPreference[];
  }>({
    queryKey: prefsQueryKey,
  });
  const weeklyPref = prefsData?.data.find((p) => p.type === "weekly_report");
  const weeklyReportEnabled = weeklyPref?.emailEnabled ?? false;

  const prefMutation = useMutation({
    mutationFn: async (input: { type: string; emailEnabled: boolean }) => {
      const res = await apiRequest("PATCH", "/api/user/notification-preferences", input);
      return (await res.json()) as { success: boolean; error?: string };
    },
    onMutate: async ({ type, emailEnabled }) => {
      await queryClient.cancelQueries({ queryKey: prefsQueryKey });
      const prev = queryClient.getQueryData<{ success: boolean; data: NotificationPreference[] }>(
        prefsQueryKey,
      );
      if (prev) {
        queryClient.setQueryData(prefsQueryKey, {
          ...prev,
          data: prev.data.map((p) => (p.type === type ? { ...p, emailEnabled } : p)),
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(prefsQueryKey, ctx.prev);
      toast({
        title: "Could not update preference",
        description: "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: prefsQueryKey });
    },
  });

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Client Reports - VentureCite</title>
      </Helmet>
      <PageHeader
        title="GEO Performance Report"
        description="AI visibility metrics and citation analytics"
        explainer={pageExplainers.clientReports}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Select Brand</CardTitle>
          </CardHeader>
          <CardContent>
            {brandsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : brands.length === 0 ? (
              <p className="text-muted-foreground">No brands found. Create a brand first.</p>
            ) : (
              <BrandSelector className="w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Report Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={reportPeriod} onValueChange={setReportPeriod}>
              <SelectTrigger data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {!selectedBrandId ? (
        <EmptyState
          icon={FileText}
          title="Select a Brand to Generate Report"
          description="Choose a brand above to see AI visibility metrics, citation tracking, and performance insights."
        />
      ) : metricsIsError ? (
        <ErrorState
          title="Couldn't load report"
          onRetry={() => refetchMetrics()}
          isRetrying={metricsIsRefetching}
        />
      ) : metricsLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-8 w-8 rounded-lg mb-4" />
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : !metrics ? (
        <EmptyState
          icon={BarChart3}
          title="No Data Available"
          description="Start tracking your brand across AI platforms to generate reports."
        />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Brand Mentions
                  </span>
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="metric-bmf"
                >
                  {metrics.brandMentionFrequency}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {calcGrowth(metrics.brandMentionFrequency, metrics.previousBMF)} vs. prev. period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Share of Voice
                  </span>
                  <PieChart className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="metric-sov"
                >
                  {metrics.shareOfVoice}%
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {calcGrowth(metrics.shareOfVoice, metrics.previousSOV)} vs. prev. period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Citation Rate
                  </span>
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="metric-citation-rate"
                >
                  {metrics.citationRate}%
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {calcGrowth(metrics.citationRate, metrics.previousCitationRate)} vs. prev. period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Prompt Coverage
                  </span>
                  <Target className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="metric-prompt-coverage"
                >
                  {metrics.promptCoverage}%
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {calcGrowth(metrics.promptCoverage, metrics.previousPromptCoverage)} vs. prev.
                  period
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-violet-500" />
                Performance by AI Platform
              </CardTitle>
              <CardDescription>Citations and mentions breakdown by platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {metrics.platformBreakdown.map((platform, i) => {
                  const platformInfo = AI_PLATFORM_BADGES.find((p) => p.name === platform.platform);
                  const maxCitations = Math.max(
                    ...metrics.platformBreakdown.map((p) => p.citations),
                  );
                  const percentage = (platform.citations / maxCitations) * 100;

                  return (
                    <div
                      key={platform.platform}
                      className="p-4 bg-muted/50 rounded-lg"
                      data-testid={`platform-row-${i}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 ${platformInfo?.color || "bg-slate-600"} rounded-lg flex items-center justify-center text-foreground`}
                          >
                            {platformInfo?.icon}
                          </div>
                          <span className="font-medium text-foreground">{platform.platform}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground">
                              {platform.citations}
                            </p>
                            <p className="text-xs text-muted-foreground">citations</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground">{platform.mentions}</p>
                            <p className="text-xs text-muted-foreground">mentions</p>
                          </div>
                          <Badge
                            className={
                              platform.trend >= 0
                                ? "bg-green-500/20 text-green-500"
                                : "bg-red-500/20 text-red-400"
                            }
                          >
                            {platform.trend >= 0 ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {platform.trend >= 0 ? "+" : ""}
                            {platform.trend}%
                          </Badge>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Top Performing Content
                </CardTitle>
                <CardDescription>Content pieces generating the most AI citations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.topPerformingContent.map((content, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      data-testid={`content-row-${i}`}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground text-sm">{content.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Top platform: {content.platform}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-violet-500">{content.citations}</p>
                        <p className="text-xs text-muted-foreground">citations</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Recommendations
                </CardTitle>
                <CardDescription>Actions to improve AI visibility</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                      data-testid={`recommendation-${i}`}
                    >
                      <div className="p-1 bg-green-500/20 rounded">
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                      </div>
                      <p className="text-sm text-foreground">{rec}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="">
            <CardContent className="py-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    Report Generated: {new Date().toLocaleDateString()}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Data reflects {reportPeriod}-day period. Last refreshed: {lastRefreshedLabel}.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="schedule-weekly-report"
                    checked={weeklyReportEnabled}
                    disabled={!weeklyPref || prefMutation.isPending}
                    onCheckedChange={(checked) =>
                      prefMutation.mutate({ type: "weekly_report", emailEnabled: checked })
                    }
                    data-testid="switch-schedule-report"
                    aria-label="Schedule weekly report"
                  />
                  <Label htmlFor="schedule-weekly-report" className="cursor-pointer">
                    Schedule Weekly Report
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
