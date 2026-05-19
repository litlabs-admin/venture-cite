import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { chartTheme } from "@/lib/chartTheme";
import { useToast } from "@/hooks/use-toast";
import { useCitationLiveRefresh } from "@/hooks/useCitationLiveRefresh";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { Loader2, X, ArrowUp, ArrowDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  ChevronDown,
  ChevronUp,
  Info,
  MessageSquare,
  Play,
  Sparkles,
} from "lucide-react";
import type { BrandMention } from "@shared/schema";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import VisibilityGauge from "@/components/dashboard/VisibilityGauge";
import PlatformRankingCard, {
  type PlatformRanking,
} from "@/components/dashboard/PlatformRankingCard";
import PlatformVisibilityBar from "@/components/dashboard/PlatformVisibilityBar";
import CompetitorGapMatrix, { type GapMatrixRow } from "@/components/dashboard/CompetitorGapMatrix";
import BrandEntityStrength, {
  type EntityStrengthData,
} from "@/components/dashboard/BrandEntityStrength";
import VerbatimResponseCard from "@/components/dashboard/VerbatimResponseCard";
import ResultsTimeline from "@/components/dashboard/ResultsTimeline";
import RecommendationsPanel from "@/components/dashboard/RecommendationsPanel";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface HeroData {
  visibilityScore: number;
  visibilityDelta: number;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
}

interface AutopilotStatusData {
  status: "idle" | "pending" | "generating_prompts" | "running_citations" | "completed" | "failed";
  step: number;
  progress: { promptsGenerated?: number; citationsRun?: number; citationsTotal?: number } | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Animates a number from 0 → target over `duration` ms using ease-out cubic.
 * Guarded by an internal ref so repeat renders / refetches don't re-animate.
 */
function useCountUp(target: number, duration: number, enabled: boolean): number {
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (!enabled || hasAnimated.current) return;
    hasAnimated.current = true;
    const start = performance.now();
    const from = 0;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, target, duration]);
  return enabled ? value : 0;
}

function Section({
  title,
  description,
  action,
  children,
  pendingDot = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  pendingDot?: boolean;
}) {
  return (
    <Card className="relative border-border/60">
      {pendingDot && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
      )}
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function SeeAllLink({ href, label = "See all" }: { href: string; label?: string }) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {label} <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </Link>
  );
}

function useDashboardQueries(
  brandId: string,
  refetchInterval: number | false,
  // Wave 9.2: when a fresh citation run is in flight for this brand,
  // `since` is the run's startedAt — server scopes ranking aggregates
  // to that window so dashboards reset cleanly and fill in as new
  // platform results land. When no run is active, this is null and
  // every endpoint falls back to its default window. Threaded into
  // every queryKey via the `{ since }` object segment, which the
  // default queryFn at queryClient.ts converts into a URL query param.
  since: string | null,
) {
  const enabled = !!brandId;
  const sinceSeg = { since: since ?? "" };
  const hero = useQuery<{ success: boolean; data: HeroData }>({
    queryKey: [`/api/dashboard/hero/${brandId}`, sinceSeg],
    enabled,
    refetchInterval,
  });
  const rankings = useQuery<{ success: boolean; data: { platforms: PlatformRanking[] } }>({
    queryKey: [`/api/dashboard/rankings/${brandId}`, sinceSeg],
    enabled,
    refetchInterval,
  });
  const gap = useQuery<{
    success: boolean;
    data: { categories: string[]; rows: GapMatrixRow[] };
  }>({
    queryKey: [`/api/dashboard/gap-matrix/${brandId}`, sinceSeg],
    enabled,
    refetchInterval,
  });
  const entity = useQuery<{ success: boolean; data: EntityStrengthData }>({
    queryKey: [`/api/dashboard/entity-strength/${brandId}`, sinceSeg],
    enabled,
    refetchInterval,
  });
  // 8-week citation trend, computed directly from geo_rankings on the
  // server. Replaces the old metrics_history-powered "Score History"
  // chart, which showed 0 scans for most users because it depended on
  // snapshots that were rarely written.
  // Wave 9.2: trend is intentionally NOT scoped to the active run —
  // it's a multi-week aggregation, and filtering it would collapse the
  // chart to a single point during a run. Leaderboard + reddit mentions
  // similarly aren't run-scoped (they don't suffer from mixed-window).
  const trend = useQuery<{
    success: boolean;
    data: {
      weeks: { weekStart: string; cited: number; total: number; citationRate: number }[];
    };
  }>({
    queryKey: [`/api/dashboard/citation-trend/${brandId}`],
    enabled,
    refetchInterval,
  });
  const leaderboard = useQuery<{
    success: boolean;
    data: {
      name: string;
      domain: string;
      isOwn: boolean;
      totalCitations: number;
      shareOfVoice: number;
    }[];
  }>({
    queryKey: [`/api/competitors/leaderboard?brandId=${brandId}`],
    enabled,
    refetchInterval,
  });
  // Key shape matches useMentions (`["/api/brand-mentions", brandId, filters]`)
  // so that ScanCompletionListener's prefix invalidation + useMentions's
  // post-scan invalidation reach this query too. Explicit queryFn because the
  // default queryFn treats the first key segment as the URL — here the URL has
  // to include the brandId path param + platform filter.
  const redditMentions = useQuery<{
    rows: BrandMention[];
    nextCursor: string | null;
    stats: unknown;
  }>({
    queryKey: ["/api/brand-mentions", brandId, { platform: "reddit" }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brand-mentions/${brandId}?platform=reddit`);
      return res.json();
    },
    enabled,
    refetchInterval,
  });
  return { hero, rankings, gap, entity, trend, leaderboard, redditMentions };
}

// Shared categorical palette (client/src/lib/chartTheme.ts) so competitor
// slices read the same across every chart in the product.
const DONUT_COLORS = chartTheme.palette;

// Monitor › Overview — the full AI-visibility analytics view. This is the
// verified dashboard implementation relocated verbatim from the old `/`
// landing page; the new lean Command Center (home.tsx) links here. Its score
// is the canonical /api/dashboard/* aggregate (CITATION_SCORING via
// dashboard.ts), so the old /api/geo-analytics formula is fully retired.
export default function MonitorOverview() {
  const { brands, selectedBrand, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const [showVerbatim, setShowVerbatim] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const completedToastFired = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: autopilotData } = useQuery<{ success: boolean; data: AutopilotStatusData }>({
    queryKey: ["autopilot-status", selectedBrandId],
    queryFn: async () => {
      if (!selectedBrandId) return { success: false, data: null as never };
      const res = await apiRequest("GET", `/api/onboarding/autopilot-status/${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
    refetchInterval: (q) => {
      const status = (q.state.data as { data?: AutopilotStatusData } | undefined)?.data?.status;
      return status && status !== "completed" && status !== "failed" && status !== "idle"
        ? 3000
        : false;
    },
  });
  const autopilot = autopilotData?.data;

  const retryAutopilotMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBrandId) throw new Error("No brand selected");
      const res = await apiRequest("POST", "/api/onboarding/autopilot-retry", {
        brandId: selectedBrandId,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to restart autopilot");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autopilot-status", selectedBrandId] });
      toast({ title: "Retry started", description: "Re-running visibility setup…" });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't restart autopilot",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const isAutopilotActive =
    !!autopilot &&
    autopilot.status !== "completed" &&
    autopilot.status !== "failed" &&
    autopilot.status !== "idle";
  const isAutopilotFailed = autopilot?.status === "failed";
  const isAutopilotDataPending =
    isAutopilotActive &&
    (autopilot?.status === "pending" ||
      autopilot?.status === "generating_prompts" ||
      autopilot?.status === "running_citations");

  // Reset banner dismissal + toast flag on brand change
  useEffect(() => {
    setBannerDismissed(false);
    completedToastFired.current = false;
  }, [selectedBrandId]);

  // Fire toast exactly once when the autopilot flips to completed
  useEffect(() => {
    if (autopilot?.status === "completed" && !completedToastFired.current) {
      completedToastFired.current = true;
      toast({ title: "Report ready", description: "Your AI visibility data is live." });
    }
  }, [autopilot?.status, toast]);

  // Wave 9: live-refresh during citation runs. The hook returns the
  // refetch cadence we thread directly into each useQuery via
  // useDashboardQueries — TanStack only honors refetchInterval at observer
  // creation time, so it must be set on the useQuery itself (not via
  // setQueryDefaults). The hook also fires a one-shot invalidate per key
  // when the run finishes so post-run aggregates appear immediately.
  const { refetchInterval } = useCitationLiveRefresh(selectedBrandId, [
    [`/api/dashboard/hero/${selectedBrandId}`],
    [`/api/dashboard/rankings/${selectedBrandId}`],
    [`/api/dashboard/gap-matrix/${selectedBrandId}`],
    [`/api/dashboard/entity-strength/${selectedBrandId}`],
    [`/api/dashboard/citation-trend/${selectedBrandId}`],
    [`/api/competitors/leaderboard?brandId=${selectedBrandId}`],
    ["/api/brand-mentions", selectedBrandId, { platform: "reddit" }],
  ]);

  // Wave 9.2: scope dashboard ranking aggregates to the active run's
  // window so a fresh run resets cleanly (vs. mixing old+new for the
  // entire run duration). TanStack dedupes the gate query — calling
  // useActiveCitationRuns here doesn't add a second poll. When no run
  // is active, `since` is null and endpoints fall back to their default
  // 30-day window.
  const { runs: activeRuns } = useActiveCitationRuns(selectedBrandId);
  const since = activeRuns[0]?.startedAt ?? null;

  const { hero, rankings, gap, entity, trend, leaderboard, redditMentions } = useDashboardQueries(
    selectedBrandId,
    refetchInterval,
    since,
  );

  const heroData = hero.data?.data;
  const platforms = rankings.data?.data.platforms ?? [];

  // Count-up animations — fire once when data arrives, not on refetches.
  const visibilityScoreAnim = useCountUp(
    heroData?.visibilityScore ?? 0,
    800,
    heroData?.visibilityScore !== undefined,
  );
  const citedChecksAnim = useCountUp(
    heroData?.citedChecks ?? 0,
    800,
    heroData?.citedChecks !== undefined,
  );
  const gapData = gap.data?.data;
  const entityData = entity.data?.data;
  const trendWeeks = trend.data?.data?.weeks ?? [];
  const leaderboardRows = leaderboard.data?.data ?? [];
  const ownRow = leaderboardRows.find((e) => e.isOwn);
  const ownShareOfVoice = Math.round(ownRow?.shareOfVoice ?? 0);
  const shareOfVoiceAnim = useCountUp(ownShareOfVoice, 800, !!ownRow);
  const topCompetitor = leaderboardRows
    .filter((e) => !e.isOwn)
    .sort((a, b) => b.shareOfVoice - a.shareOfVoice)[0];
  const redditRows = redditMentions.data?.rows ?? [];

  const noCitationData = !!selectedBrandId && !hero.isLoading && (heroData?.totalChecks ?? 0) === 0;

  const trendChartData = useMemo(() => {
    return trendWeeks.map((w) => ({
      date: new Date(w.weekStart).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      score: w.citationRate,
      cited: w.cited,
      total: w.total,
    }));
  }, [trendWeeks]);
  const trendHasData = trendChartData.some((w) => w.total > 0);

  // Share of Voice donut — rescale to the tracked brand + tracked
  // competitors only. "Others" (every untracked company the AI happened to
  // name alongside us) used to fill most of the pie and made the user's
  // slice look artificially small. Dropping it tells a cleaner story:
  // "among the brands you track, here's your share."
  const sovDonutData = useMemo(() => {
    if (leaderboardRows.length === 0) return [];
    const total = leaderboardRows.reduce((s, r) => s + r.shareOfVoice, 0);
    if (total <= 0) return [];
    return [...leaderboardRows]
      .sort((a, b) => b.shareOfVoice - a.shareOfVoice)
      .slice(0, 10)
      .map((e) => ({ name: e.name, value: Math.round((e.shareOfVoice / total) * 100) }));
  }, [leaderboardRows]);

  // One verbatim block per platform that has a cited response. We don't
  // dedupe by prompt here — if two platforms answered the same prompt,
  // showing both responses is still useful because the wording, rank, and
  // sources differ between engines. Cap at CORE_PLATFORMS length (5).
  const verbatimBlocks = useMemo(() => {
    return platforms
      .filter((p) => p.latestSnippet && p.isCitedSnippet)
      .slice(0, 5)
      .map((p) => ({
        platform: p.aiPlatform,
        prompt: p.latestSnippetPrompt,
        response: p.latestSnippet ?? "",
      }));
  }, [platforms]);

  // Only surface a cited response here — never the "Not cited" fallback
  // that we fetch for the Generative Rankings cards.
  const firstPlatformSnippet = platforms.find((p) => p.latestSnippet && p.isCitedSnippet);

  // Heuristics derived from the citation-health data: flag weak citation
  // rate, weak rank positioning, no Reddit presence, and broad missing
  // coverage across platforms. Replaces the old subscore-based flags that
  // depended on arbitrary weighted buckets.
  const gapsAiIdentifies = useMemo(() => {
    const gaps: string[] = [];
    if (entityData && entityData.totalChecks > 0) {
      if (entityData.citeRatePct < 25) gaps.push("low citation rate across tracked prompts");
      if (entityData.avgRank !== null && entityData.avgRank > 5)
        gaps.push("cited but ranked low in AI lists");
    }
    if (redditRows.length === 0) gaps.push("no Reddit presence");
    const platformsWithNoCitations = platforms.filter((p) => p.citedCount === 0).length;
    if (platformsWithNoCitations >= 3) gaps.push("missing on multiple AI platforms");
    return gaps;
  }, [entityData, redditRows, platforms]);

  // Day-0 alarm rule (§4.4): a surface may render destructive tone
  // only when we have evidence the brand has actually been measured.
  // "Measured" = a completed citation run exists AND the autopilot is
  // not still mid-run. Drives gating throughout this page.
  const hasMeasured =
    (heroData?.totalChecks ?? 0) > 0 &&
    heroData?.lastScanAt != null &&
    autopilot?.status !== "running_citations" &&
    autopilot?.status !== "generating_prompts" &&
    autopilot?.status !== "pending";

  // Reddit cron runs weekly (Mondays). A brand whose first measurement
  // completed any other day still has no Reddit scan yet — so we need a
  // signal independent of `hasMeasured` before flipping the Reddit panel
  // to destructive tone. The mentions query already settles to a
  // (possibly empty) data array once a scan has run; isFetched +
  // !isError is the canonical "we have an answer" signal.
  const hasRedditScan = redditMentions.isFetched && !redditMentions.isError;

  // ---------- Empty states ----------
  if (brandsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Brain}
          title="Create a brand to get started"
          description={
            <>
              Set up your first brand and we&apos;ll build a live AI visibility report showing where
              ChatGPT, Claude, Perplexity, and Gemini mention you — and where they don&apos;t.
            </>
          }
          action={{
            label: "Create your first brand",
            href: "/setup?tab=brands",
            onClick: () => {},
          }}
        />
      </div>
    );
  }

  // ---------- Main layout ----------
  const bannerVisible = (isAutopilotActive || isAutopilotFailed) && !bannerDismissed;
  const bannerText = (() => {
    if (!autopilot) return "";
    const p = autopilot.progress ?? {};
    switch (autopilot.status) {
      case "pending":
        return "Starting your AI visibility report…";
      case "generating_prompts":
        return "Generating tracked prompts…";
      case "running_citations":
        return `Running citations across AI platforms — ${p.citationsRun ?? 0}/${p.citationsTotal ?? 0} done`;
      default:
        return "";
    }
  })();

  return (
    <div className="space-y-4">
      {bannerVisible && (
        <div
          className={`-mx-4 -mt-4 px-4 py-2 border-b transition-opacity duration-500 ${
            isAutopilotFailed
              ? "bg-destructive/5 border-destructive/30"
              : "bg-primary/5 border-primary/20"
          } ${autopilot?.status === "completed" ? "opacity-0" : "opacity-100"}`}
          data-testid="autopilot-banner"
        >
          <div className="flex items-center gap-3 text-sm">
            {isAutopilotFailed ? (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
            )}
            <span
              className={`flex-1 truncate ${isAutopilotFailed ? "text-destructive" : "text-foreground"}`}
            >
              {isAutopilotFailed ? (autopilot?.error ?? "Autopilot setup failed.") : bannerText}
            </span>
            {!isAutopilotFailed && autopilot && (
              <span className="text-xs text-muted-foreground shrink-0">
                Step {autopilot.step || 1}/3
              </span>
            )}
            {isAutopilotFailed && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryAutopilotMutation.mutate()}
                disabled={retryAutopilotMutation.isPending}
                className="shrink-0"
                data-testid="autopilot-retry"
              >
                {retryAutopilotMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Retrying…
                  </>
                ) : (
                  "Retry"
                )}
              </Button>
            )}
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Onboarding spine + a single-line "what to expect" caption. The
          RecommendationsPanel is the canonical next-actions surface; the
          timeline caption sets timing expectations for everyone. */}
      <ResultsTimeline compact />
      {hero.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Couldn't load dashboard data — please refresh.</AlertDescription>
        </Alert>
      )}
      <div>
        <RecommendationsPanel />
      </div>

      {noCitationData ? (
        <EmptyState
          icon={Play}
          title="Run your first citation check"
          description="Your dashboard comes alive once we've queried AI engines for this brand. Takes about 60 seconds on your first run."
          action={{
            label: "Start citation check",
            href: "/monitor?tab=citations",
            onClick: () => {},
          }}
        />
      ) : (
        <>
          {/* ===== 1. HERO ROW ===== */}
          {hero.isError ? (
            <ErrorState
              title="Couldn't load dashboard metrics"
              onRetry={() => hero.refetch()}
              isRetrying={hero.isRefetching}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {/* AI Visibility Score */}
              <Card data-testid="card-visibility-score" className="relative border-border/60">
                {isAutopilotDataPending && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
                )}
                <CardContent className="p-5 flex flex-col h-full">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground text-center">
                    AI Visibility Score
                  </p>
                  <div className="flex-1 flex flex-col items-center justify-center py-2">
                    {hero.isLoading ? (
                      <Skeleton className="h-32 w-32 rounded-full" />
                    ) : isAutopilotDataPending && heroData?.visibilityScore === undefined ? (
                      <div className="h-[140px] w-[140px] rounded-full grid place-items-center text-5xl font-bold text-muted-foreground">
                        —
                      </div>
                    ) : (
                      <VisibilityGauge score={visibilityScoreAnim} size={140} />
                    )}
                  </div>
                  <div className="mt-auto pt-2 text-center">
                    {heroData ? (
                      <>
                        {heroData.visibilityDelta !== null && heroData.visibilityDelta !== 0 ? (
                          <div className="flex items-center justify-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                heroData.visibilityDelta > 0
                                  ? "bg-chart-4/10 text-chart-4"
                                  : "bg-destructive/10 text-destructive"
                              }`}
                            >
                              {heroData.visibilityDelta > 0 ? (
                                <ArrowUp className="w-3 h-3" />
                              ) : (
                                <ArrowDown className="w-3 h-3" />
                              )}
                              {heroData.visibilityDelta > 0 ? "+" : ""}
                              {heroData.visibilityDelta} pts
                            </span>
                          </div>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Last scan:{" "}
                          {formatRelativeTime(
                            heroData.lastScanAt ?? selectedBrand?.autopilotCompletedAt ?? null,
                          )}
                        </p>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* Share of AI Voice */}
              <Card data-testid="card-share-of-voice" className="relative border-border/60">
                {isAutopilotDataPending && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
                )}
                <CardContent className="p-5 flex flex-col h-full">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground text-center">
                    Share of AI Voice
                  </p>
                  {leaderboard.isLoading ? (
                    <Skeleton className="mt-4 h-14 w-24 mx-auto" />
                  ) : isAutopilotDataPending && !ownRow ? (
                    <div className="mt-3 text-center">
                      <div className="text-5xl font-bold text-muted-foreground leading-none">—</div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        of AI answers in your category mention you
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 text-center">
                      <div className="text-5xl font-bold text-foreground leading-none">
                        {shareOfVoiceAnim}
                        <span className="text-2xl text-muted-foreground font-semibold">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        of AI answers in your category mention you
                      </p>
                    </div>
                  )}
                  <div className="mt-auto pt-4 space-y-1.5 text-xs">
                    {topCompetitor ? (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="truncate">Top competitor · {topCompetitor.name}</span>
                        <span className="font-medium text-foreground">
                          {Math.round(topCompetitor.shareOfVoice)}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-center">
                        No competitor data yet
                      </div>
                    )}
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Competitors tracked</span>
                      <span className="font-medium text-foreground">
                        {leaderboardRows.filter((e) => !e.isOwn).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cited / Total */}
              <Card data-testid="card-cited-total" className="relative border-border/60">
                {isAutopilotDataPending && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
                )}
                <CardContent className="p-5 flex flex-col h-full">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground text-center">
                    Cited / Total Checks
                  </p>
                  {hero.isLoading ? (
                    <Skeleton className="mt-4 h-14 w-40 mx-auto" />
                  ) : isAutopilotDataPending && heroData?.citedChecks === undefined ? (
                    <div className="mt-3 text-center">
                      <div className="text-5xl font-bold text-muted-foreground leading-none">—</div>
                    </div>
                  ) : (
                    <div className="mt-3 text-center">
                      <div className="leading-none">
                        <span className="text-5xl font-bold text-foreground">
                          {citedChecksAnim}
                        </span>
                        <span className="text-2xl font-semibold text-muted-foreground">
                          {" "}
                          / {heroData?.totalChecks ?? 0}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5">
                        {heroData?.citationRate ?? 0}% citation rate
                      </div>
                    </div>
                  )}
                  <div className="mt-auto pt-4">
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700"
                        style={{ width: `${heroData?.citationRate ?? 0}%` }}
                      />
                    </div>
                    {heroData?.lastScanAt && (
                      <p className="text-[11px] text-muted-foreground mt-2 text-center">
                        Last scan {new Date(heroData.lastScanAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===== 2. CITATION TREND (8 weeks) ===== */}
          <Section
            title="Citation Trend"
            description="Weekly citation rate over the last 8 weeks"
            action={<SeeAllLink href="/monitor?tab=citations" />}
          >
            {trend.isError ? (
              <ErrorState
                title="Couldn't load citation trend"
                onRetry={() => trend.refetch()}
                isRetrying={trend.isRefetching}
              />
            ) : trend.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !trendHasData ? (
              <div className="relative h-64">
                <svg
                  viewBox="0 0 400 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full opacity-[0.08]"
                  aria-hidden="true"
                >
                  <path
                    d="M 20,60 Q 100,40 180,55 T 360,45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="relative h-full flex items-center justify-center text-sm text-muted-foreground">
                  Run a citation check to start tracking your trend.
                </div>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ReTooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                      formatter={(value: number, _n, payload: any) => [
                        `${value}% (${payload.payload.cited}/${payload.payload.total} cited)`,
                        "Citation rate",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke={chartTheme.series.visibility}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          {/* ===== 3. GENERATIVE RANKINGS ===== */}
          <Section
            title="Generative Rankings"
            description="Where you appear when AI users ask about your category"
            pendingDot={isAutopilotDataPending}
            action={
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {platforms.filter((p) => p.isLive).length}/{platforms.length} live
                </Badge>
              </div>
            }
          >
            {rankings.isError ? (
              <ErrorState
                title="Couldn't load generative rankings"
                onRetry={() => rankings.refetch()}
                isRetrying={rankings.isRefetching}
              />
            ) : rankings.isLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {platforms.map((p) => (
                  <PlatformRankingCard key={p.aiPlatform} platform={p} hasMeasured={hasMeasured} />
                ))}
              </div>
            )}
          </Section>

          {/* ===== 4. PLATFORM VISIBILITY ===== */}
          <Section
            title="Platform Visibility"
            description="Your score across each major AI platform"
            pendingDot={isAutopilotDataPending}
          >
            {rankings.isError ? (
              <ErrorState
                title="Couldn't load platform visibility"
                onRetry={() => rankings.refetch()}
                isRetrying={rankings.isRefetching}
              />
            ) : rankings.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="divide-y divide-border">
                {platforms.map((p) => (
                  <PlatformVisibilityBar key={p.aiPlatform} platform={p} />
                ))}
              </div>
            )}
          </Section>

          {/* ===== 5. COMPETITORS DOMINATING ===== */}
          <Section
            title="Competitors Dominating AI Results"
            description="Brands appearing more than you across AI-trusted sources"
            pendingDot={isAutopilotDataPending}
            action={
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {leaderboardRows.filter((e) => !e.isOwn).length} detected
                </Badge>
                <SeeAllLink href="/monitor?tab=competitors" />
              </div>
            }
          >
            {leaderboard.isError ? (
              <ErrorState
                title="Couldn't load competitor leaderboard"
                onRetry={() => leaderboard.refetch()}
                isRetrying={leaderboard.isRefetching}
              />
            ) : leaderboard.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : leaderboardRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No competitor data yet.</p>
            ) : (
              <div className="space-y-2">
                {leaderboardRows
                  .filter((e) => !e.isOwn)
                  .sort((a, b) => b.totalCitations - a.totalCitations)
                  .slice(0, 10)
                  .map((entry, i) => {
                    const max = Math.max(1, leaderboardRows[0]?.totalCitations ?? 1);
                    const pct = Math.round((entry.totalCitations / max) * 100);
                    return (
                      <div
                        key={entry.domain || entry.name}
                        className="grid grid-cols-[3rem_1fr_3rem_8rem] items-center gap-3 px-3 py-2 rounded-md border border-border/50"
                      >
                        <span className="text-sm text-muted-foreground">#{i + 1}</span>
                        <span className="flex items-center gap-2 min-w-0">
                          {entry.domain ? (
                            <img
                              src={`/api/logo-proxy?url=${encodeURIComponent(
                                `https://www.google.com/s2/favicons?domain=${entry.domain}&sz=32`,
                              )}`}
                              alt=""
                              width={16}
                              height={16}
                              className="w-4 h-4 rounded-full bg-muted shrink-0"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
                              }}
                            />
                          ) : null}
                          <span className="font-medium text-foreground truncate">{entry.name}</span>
                        </span>
                        <span className="text-right text-sm text-muted-foreground">
                          {entry.totalCitations}
                        </span>
                        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-destructive/70"
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Section>

          {/* ===== 6. SHARE OF AI VOICE ===== */}
          <Section
            title="Share of AI Voice"
            description="% of AI answers in your category that mention each brand"
            action={<SeeAllLink href="/monitor?tab=share-of-answer" />}
          >
            {leaderboard.isError ? (
              <ErrorState
                title="Couldn't load share of voice"
                onRetry={() => leaderboard.refetch()}
                isRetrying={leaderboard.isRefetching}
              />
            ) : leaderboard.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : sovDonutData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No share-of-voice data yet.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sovDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={84}
                        paddingAngle={2}
                      >
                        {sovDonutData.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 py-4">
                  {sovDonutData.map((slice, i) => (
                    <div
                      key={slice.name}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        {slice.name}
                      </span>
                      <span className="font-semibold">{Math.round(slice.value)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* ===== 7. COMPETITOR GAP MATRIX ===== */}
          <Section
            title="Competitor Gap Analysis"
            description="Exact query types where each competitor beats you — your attack surface"
            action={<SeeAllLink href="/monitor?tab=competitors" />}
          >
            {gap.isError ? (
              <ErrorState
                title="Couldn't load competitor gap analysis"
                onRetry={() => gap.refetch()}
                isRetrying={gap.isRefetching}
              />
            ) : gap.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <CompetitorGapMatrix
                categories={gapData?.categories ?? []}
                rows={gapData?.rows ?? []}
              />
            )}
          </Section>

          {/* ===== 8. COVERAGE + ENTITY STRENGTH ===== */}
          <div className="grid md:grid-cols-2 gap-4">
            <Section
              title="Prompt Coverage Map"
              description="How many AI queries in your category you appear in"
            >
              {gap.isError ? (
                <ErrorState
                  title="Couldn't load prompt coverage"
                  onRetry={() => gap.refetch()}
                  isRetrying={gap.isRefetching}
                />
              ) : gap.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <PromptCoverageMap
                  categories={gapData?.categories ?? []}
                  rows={gapData?.rows ?? []}
                  hasMeasured={hasMeasured}
                />
              )}
            </Section>
            <Section
              title="Brand Entity Strength"
              description="How deeply AI models understand and trust your brand"
            >
              {entity.isError ? (
                <ErrorState
                  title="Couldn't load brand entity strength"
                  onRetry={() => entity.refetch()}
                  isRetrying={entity.isRefetching}
                />
              ) : entity.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : entityData ? (
                <BrandEntityStrength data={entityData} />
              ) : (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              )}
            </Section>
          </div>

          {/* ===== 9. AI SENTIMENT & POSITIONING ===== */}
          <Section
            title="AI Sentiment & Positioning"
            description="How AI perceives and positions your brand"
          >
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {hasMeasured ? (
                <>
                  {/* Recognition only when measured. AI Confidence Score and
                      hardcoded Neutral Sentiment are deferred to Spec 3. */}
                  <SentimentCard
                    label="Recognition"
                    value={
                      (heroData?.citedChecks ?? 0) > 0 && (heroData?.citationRate ?? 0) >= 20
                        ? "Known"
                        : "Unknown"
                    }
                    tone={(heroData?.citationRate ?? 0) >= 20 ? "emerald" : "destructive"}
                  />
                </>
              ) : (
                <div className="md:col-span-3 rounded-md border border-border bg-muted/30 px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {autopilot?.status === "running_citations" ||
                    autopilot?.status === "generating_prompts" ||
                    autopilot?.status === "pending"
                      ? "Measuring your brand's visibility now — this typically takes 1–2 minutes."
                      : "We'll surface recognition, sentiment, and confidence after your first citation scan completes."}
                  </p>
                </div>
              )}
            </div>
            {firstPlatformSnippet && firstPlatformSnippet.latestSnippet && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-4 mb-4">
                <div className="text-xs uppercase tracking-wide text-primary mb-2">
                  How AI describes {selectedBrand?.name ?? "your brand"}
                </div>
                <p className="text-sm text-foreground italic">
                  &ldquo;{firstPlatformSnippet.latestSnippet}&rdquo;
                </p>
              </div>
            )}
            {hasMeasured && gapsAiIdentifies.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-destructive mb-2">
                  Gaps AI identifies
                </div>
                <ul className="space-y-1">
                  {gapsAiIdentifies.map((gap) => (
                    <li key={gap} className="text-sm text-muted-foreground flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!hasMeasured && (
              <p className="text-sm text-muted-foreground mt-2">
                Gaps will appear after your first citation scan.
              </p>
            )}
          </Section>

          {/* ===== 10. WHAT AI SAYS ABOUT YOU ===== */}
          <Section
            title="What AI Says About You"
            description="Live responses — verbatim what AI tells your potential customers"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVerbatim((v) => !v)}
                disabled={verbatimBlocks.length === 0}
              >
                {showVerbatim ? (
                  <>
                    Hide <ChevronUp className="w-3 h-3 ml-1" />
                  </>
                ) : (
                  <>
                    See full AI answers <ChevronDown className="w-3 h-3 ml-1" />
                  </>
                )}
              </Button>
            }
          >
            {verbatimBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No verbatim responses yet — run a citation check to populate.
              </p>
            ) : !showVerbatim ? (
              hasMeasured ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold text-destructive">
                        {selectedBrand?.name ?? "Your brand"}{" "}
                        {(heroData?.citationRate ?? 0) < 50
                          ? "is underexposed here."
                          : "has mixed coverage."}{" "}
                      </span>
                      <span className="text-muted-foreground">
                        Expand to see verbatim AI responses across {verbatimBlocks.length}{" "}
                        platforms.
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/30 p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Verbatim AI responses will populate after your first scan completes.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {verbatimBlocks.map((b, i) => (
                  <VerbatimResponseCard
                    key={i}
                    platform={b.platform}
                    prompt={b.prompt}
                    response={b.response}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* ===== 11. REDDIT VISIBILITY ===== */}
          <Section
            title="Reddit Visibility"
            description="Your brand's presence in the communities AI platforms index most"
          >
            {redditMentions.isError ? (
              <ErrorState
                title="Couldn't load Reddit visibility"
                onRetry={() => redditMentions.refetch()}
                isRetrying={redditMentions.isRefetching}
              />
            ) : (
              <RedditVisibility
                mentions={redditRows}
                loading={redditMentions.isLoading}
                hasMeasured={hasMeasured && hasRedditScan}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components local to the page
// ============================================================================

function SentimentCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "emerald" | "destructive";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : "text-destructive";
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 text-center">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function PromptCoverageMap({
  categories,
  rows,
  hasMeasured,
}: {
  categories: string[];
  rows: GapMatrixRow[];
  hasMeasured: boolean;
}) {
  const brandRow = rows.find((r) => r.entityType === "brand");
  if (!brandRow || categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No prompt coverage data yet.</p>;
  }
  const appearing = categories.filter(
    (c) => brandRow.cells[c] === "yes" || brandRow.cells[c] === "partial",
  ).length;
  const pct = Math.round((appearing / categories.length) * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">You appear in</span>
        <span className="font-semibold text-foreground">
          {appearing} of {categories.length}
        </span>
        <span className="text-muted-foreground">AI query types</span>
        <span className="ml-auto font-semibold text-emerald-400">{pct}%</span>
      </div>
      <ul className="space-y-1.5">
        {categories.map((cat) => {
          const state = brandRow.cells[cat] ?? "unknown";
          const appears = state === "yes" || state === "partial";
          const absentRowClasses = hasMeasured
            ? "border-destructive/20 bg-destructive/5"
            : "border-border bg-muted/30";
          const absentLabelClasses = hasMeasured ? "text-destructive" : "text-muted-foreground";
          const absentGlyphBg = hasMeasured
            ? "bg-destructive/20 text-destructive"
            : "bg-muted text-muted-foreground";
          const absentLabel = hasMeasured ? "Absent" : "Pending";
          return (
            <li
              key={cat}
              className={
                "flex items-center justify-between px-3 py-2 rounded-md border " +
                (appears ? "border-emerald-500/20 bg-emerald-500/5" : absentRowClasses)
              }
            >
              <span className="flex items-center gap-2 text-sm">
                {appears ? (
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center text-[10px]">
                    ✓
                  </span>
                ) : (
                  <span
                    className={
                      "w-4 h-4 rounded-full grid place-items-center text-[10px] " + absentGlyphBg
                    }
                  >
                    !
                  </span>
                )}
                {cat}
              </span>
              <span className={"text-xs " + (appears ? "text-emerald-400" : absentLabelClasses)}>
                {appears ? "You appear" : absentLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RedditVisibility({
  mentions,
  loading,
  hasMeasured,
}: {
  mentions: BrandMention[];
  loading: boolean;
  hasMeasured: boolean;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const communities = new Set<string>();
  for (const m of mentions) {
    const match = m.sourceUrl.match(/reddit\.com\/r\/([^\/]+)/i);
    if (match) communities.add(match[1].toLowerCase());
  }
  // Only two honest metrics: total Reddit mentions from the scanner, and
  // how many distinct subreddits they spread across. Prior version also
  // showed "Threads Found" — it was the same count as Mentions, presented
  // differently, which was theater.
  const mentionCount = mentions.length;
  const communityCount = communities.size;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Brand Mentions
          </p>
          <p
            className={`text-2xl font-bold ${mentionCount > 0 ? "text-foreground" : hasMeasured ? "text-destructive" : "text-muted-foreground"}`}
          >
            {mentionCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">posts name you</p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Subreddits
          </p>
          <p className="text-2xl font-bold text-foreground">{communityCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">distinct communities</p>
        </div>
      </div>
      {mentionCount === 0 &&
        (hasMeasured ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
            <MessageSquare className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="font-semibold">No Reddit presence found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your brand has zero visibility on Reddit — a major source AI platforms use for
              recommendations.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-6 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-semibold text-foreground">Reddit scan runs weekly</p>
            <p className="text-sm text-muted-foreground mt-1">
              We'll surface Reddit visibility here once the first scan has run for this brand.
            </p>
          </div>
        ))}
    </div>
  );
}
