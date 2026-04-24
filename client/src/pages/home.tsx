import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  MessageSquare,
  Play,
  Sparkles,
} from "lucide-react";
import type { BrandMention } from "@shared/schema";
import PageHeader from "@/components/PageHeader";
import BrandSelector from "@/components/BrandSelector";
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

interface HeroData {
  visibilityScore: number;
  visibilityDelta: number;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  industryAvg: number | null;
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

function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "Not scanned yet";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
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
    <Card className="relative shadow-sm border-border/60">
      {pendingDot && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      )}
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
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

function useDashboardQueries(brandId: string) {
  const enabled = !!brandId;
  const hero = useQuery<{ success: boolean; data: HeroData }>({
    queryKey: [`/api/dashboard/hero/${brandId}`],
    enabled,
  });
  const rankings = useQuery<{ success: boolean; data: { platforms: PlatformRanking[] } }>({
    queryKey: [`/api/dashboard/rankings/${brandId}`],
    enabled,
  });
  const gap = useQuery<{
    success: boolean;
    data: { categories: string[]; rows: GapMatrixRow[] };
  }>({
    queryKey: [`/api/dashboard/gap-matrix/${brandId}`],
    enabled,
  });
  const entity = useQuery<{ success: boolean; data: EntityStrengthData }>({
    queryKey: [`/api/dashboard/entity-strength/${brandId}`],
    enabled,
  });
  // 8-week citation trend, computed directly from geo_rankings on the
  // server. Replaces the old metrics_history-powered "Score History"
  // chart, which showed 0 scans for most users because it depended on
  // snapshots that were rarely written.
  const trend = useQuery<{
    success: boolean;
    data: {
      weeks: { weekStart: string; cited: number; total: number; citationRate: number }[];
    };
  }>({
    queryKey: [`/api/dashboard/citation-trend/${brandId}`],
    enabled,
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
  });
  const redditMentions = useQuery<{ success: boolean; data: BrandMention[] }>({
    queryKey: [`/api/brand-mentions/${brandId}?platform=reddit`],
    enabled,
  });
  return { hero, rankings, gap, entity, trend, leaderboard, redditMentions };
}

// Explicit hex values so the "dot" beside each legend entry renders
// consistently regardless of theme tokens. Prior version used
// hsl(var(--primary)) for index 0, which resolved to near-black on dark
// theme and read as "missing" next to the user's own brand. Ordered so
// adjacent slices are perceptually distinct.
const DONUT_COLORS = [
  "#3b82f6", // blue
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#a855f7", // purple
  "#f59e0b", // amber
];

export default function Home() {
  const { brands, selectedBrand, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const [showVerbatim, setShowVerbatim] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const completedToastFired = useRef(false);
  const { toast } = useToast();

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

  const { hero, rankings, gap, entity, trend, leaderboard, redditMentions } =
    useDashboardQueries(selectedBrandId);

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
  const redditRows = redditMentions.data?.data ?? [];

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
        <PageHeader
          title="AI Visibility Report"
          description="Track how often AI engines cite your brand."
        />
        <Card>
          <CardContent className="py-16 text-center">
            <Brain className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Create a brand to get started
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Set up your first brand and we&apos;ll build a live AI visibility report showing where
              ChatGPT, Claude, Perplexity, and Gemini mention you — and where they don&apos;t.
            </p>
            <Link href="/brands">
              <Button>Create your first brand</Button>
            </Link>
          </CardContent>
        </Card>
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

  const headerLeading = selectedBrand?.logoUrl ? (
    <img
      src={selectedBrand.logoUrl}
      alt=""
      className="w-7 h-7 rounded-full object-cover bg-muted"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  ) : null;

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

      <PageHeader
        title="AI Visibility Report"
        leading={headerLeading}
        description={
          selectedBrand
            ? `Live AI-engine visibility for ${selectedBrand.name}.`
            : "Pick a brand to see the full report."
        }
        actions={
          <div className="flex items-center gap-2">
            <BrandSelector className="w-56" />
            <Link href="/content">
              <Button>
                <Sparkles className="w-4 h-4 mr-2" /> Create Content
              </Button>
            </Link>
          </div>
        }
      />

      {noCitationData ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Play className="w-14 h-14 mx-auto text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Run your first citation check</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Your dashboard comes alive once we&apos;ve queried AI engines for this brand. Takes
              about 60 seconds on your first run.
            </p>
            <Link href="/citations">
              <Button size="lg">
                <Play className="w-4 h-4 mr-2" /> Start citation check
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ===== 1. HERO ROW ===== */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* AI Visibility Score */}
            <Card
              data-testid="card-visibility-score"
              className="relative shadow-sm border-border/60"
            >
              {isAutopilotDataPending && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
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
                                ? "bg-emerald-500/10 text-emerald-400"
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
                      {heroData.industryAvg !== null && (
                        <p className="text-[11px] text-muted-foreground">
                          Industry avg: {heroData.industryAvg}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Share of AI Voice */}
            <Card data-testid="card-share-of-voice" className="relative shadow-sm border-border/60">
              {isAutopilotDataPending && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
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
                    <div className="text-muted-foreground text-center">No competitor data yet</div>
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
            <Card data-testid="card-cited-total" className="relative shadow-sm border-border/60">
              {isAutopilotDataPending && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
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
                      <span className="text-5xl font-bold text-foreground">{citedChecksAnim}</span>
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

          {/* ===== 2. CITATION TREND (8 weeks) ===== */}
          <Section
            title="Citation Trend"
            description="Weekly citation rate over the last 8 weeks"
            action={<SeeAllLink href="/citations" />}
          >
            {trend.isLoading ? (
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
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
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
                      stroke="hsl(var(--primary))"
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
            {rankings.isLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {platforms.map((p) => (
                  <PlatformRankingCard key={p.aiPlatform} platform={p} />
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
            {rankings.isLoading ? (
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
                <SeeAllLink href="/ai-intelligence" />
              </div>
            }
          >
            {leaderboard.isLoading ? (
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
            action={<SeeAllLink href="/geo-analytics" />}
          >
            {leaderboard.isLoading ? (
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
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
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
            action={<SeeAllLink href="/ai-intelligence" />}
          >
            {gap.isLoading ? (
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
              {gap.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <PromptCoverageMap
                  categories={gapData?.categories ?? []}
                  rows={gapData?.rows ?? []}
                />
              )}
            </Section>
            <Section
              title="Brand Entity Strength"
              description="How deeply AI models understand and trust your brand"
            >
              {entity.isLoading ? (
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
              <SentimentCard label="Overall Sentiment" value="Neutral" tone="amber" />
              <SentimentCard
                label="AI Confidence Score"
                value={`${heroData?.visibilityScore ?? 0}/100`}
                tone={
                  (heroData?.visibilityScore ?? 0) >= 60
                    ? "emerald"
                    : (heroData?.visibilityScore ?? 0) >= 30
                      ? "amber"
                      : "destructive"
                }
              />
              <SentimentCard
                label="Recognition"
                value={
                  (heroData?.citedChecks ?? 0) > 0 && (heroData?.citationRate ?? 0) >= 20
                    ? "Known"
                    : "Unknown"
                }
                tone={(heroData?.citationRate ?? 0) >= 20 ? "emerald" : "destructive"}
              />
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
            {gapsAiIdentifies.length > 0 && (
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
                      Expand to see verbatim AI responses across {verbatimBlocks.length} platforms.
                    </span>
                  </p>
                </div>
              </div>
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
            <RedditVisibility mentions={redditRows} loading={redditMentions.isLoading} />
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

function PromptCoverageMap({ categories, rows }: { categories: string[]; rows: GapMatrixRow[] }) {
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
          return (
            <li
              key={cat}
              className={
                "flex items-center justify-between px-3 py-2 rounded-md border " +
                (appears
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-destructive/20 bg-destructive/5")
              }
            >
              <span className="flex items-center gap-2 text-sm">
                {appears ? (
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center text-[10px]">
                    ✓
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full bg-destructive/20 text-destructive grid place-items-center text-[10px]">
                    !
                  </span>
                )}
                {cat}
              </span>
              <span className={"text-xs " + (appears ? "text-emerald-400" : "text-destructive")}>
                {appears ? "You appear" : "Absent"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RedditVisibility({ mentions, loading }: { mentions: BrandMention[]; loading: boolean }) {
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
            className={`text-2xl font-bold ${mentionCount > 0 ? "text-foreground" : "text-destructive"}`}
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
      {mentionCount === 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <MessageSquare className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="font-semibold">No Reddit presence found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your brand has zero visibility on Reddit — a major source AI platforms use for
            recommendations.
          </p>
        </div>
      )}
    </div>
  );
}
