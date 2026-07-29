import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

// ─── Command Center data layer ───────────────────────────────────────────────
// One hook, one fan-out. Every panel reads from here so the page issues each
// request exactly once and no panel invents its own parallel fetch.
//
// HONESTY RULE: a field is `null` when the backend cannot measure it. Panels
// render `–` for null and never substitute 0. The three metrics with no
// backing source at all (site health, perception, AI traffic/conversations)
// have no query here — their panels are empty states by construction.

export interface HeroData {
  visibilityScore: number;
  visibilityDelta: number | null;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
}
export interface TrendWeek {
  weekStart: string;
  cited: number;
  total: number;
  citationRate: number;
}
export interface MetricRow {
  metricType: string;
  metricValue: number | string;
  snapshotDate: string;
}
export interface LeaderRow {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  shareOfVoice: number;
}
export interface Recommendation {
  id: string;
  title: string;
  why: string;
  ctaLabel: string;
  ctaHref: string;
  priority: "P0" | "P1" | "P2";
  category: string;
}
export interface PlatformRank {
  aiPlatform: string;
  isLive: boolean;
  rank: number | null;
  citedCount: number;
  totalCount: number;
  visibilityScore: number;
}
export interface PromptRow {
  promptId: string;
  prompt: string;
  platforms: { platform: string; isCited: boolean }[];
}
export interface CitedUrl {
  platform: string;
  prompt: string;
  url: string;
  citedAt: string;
}

type Envelope<T> = { success: boolean; data: T };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function useCommandCenterData(brandId: string) {
  const enabled = !!brandId;

  const hero = useQuery<Envelope<HeroData>>({
    queryKey: [`/api/dashboard/hero/${brandId}`],
    enabled,
  });
  const trend = useQuery<Envelope<{ weeks: TrendWeek[] }>>({
    queryKey: [`/api/dashboard/citation-trend/${brandId}`],
    enabled,
  });
  // 30 days is the widest range the chart's toggle offers; 7D/14D slice this
  // same series client-side rather than refetching per range.
  const history = useQuery<Envelope<MetricRow[]>>({
    queryKey: [`/api/metrics-history/${brandId}?metricType=visibility_score&days=30`],
    enabled,
  });
  const leaderboard = useQuery<Envelope<LeaderRow[]>>({
    queryKey: [`/api/competitors/leaderboard?brandId=${brandId}`],
    enabled,
  });
  const recommendations = useQuery<Envelope<Recommendation[]>>({
    queryKey: [`/api/brands/${brandId}/recommendations`],
    enabled,
  });
  const platforms = useQuery<Envelope<{ platforms: PlatformRank[] }>>({
    queryKey: [`/api/dashboard/rankings/${brandId}`],
    enabled,
  });
  const prompts = useQuery<
    Envelope<{ byPrompt: PromptRow[]; totalChecks: number; totalCited: number }>
  >({
    queryKey: [`/api/brand-prompts/${brandId}/results`],
    enabled,
  });
  const citedUrls = useQuery<Envelope<{ items: CitedUrl[]; total: number; truncated: boolean }>>({
    queryKey: [`/api/dashboard/cited-urls/${brandId}`],
    enabled,
  });
  // `stats.total` on this endpoint is all-time, so the 7-day figure comes from
  // counting the windowed rows. `truncated` is surfaced rather than hidden —
  // a capped count is shown as "200+", never as a precise number it isn't.
  const mentionsFrom = useMemo(() => new Date(Date.now() - SEVEN_DAYS_MS).toISOString(), []);
  const mentions = useQuery<{ rows: unknown[]; nextCursor: string | null }>({
    queryKey: [`/api/brand-mentions/${brandId}?from=${mentionsFrom}&limit=200`],
    enabled,
  });

  const h = hero.data?.data;

  // Visibility series for the chart. metrics_history stores one row per
  // snapshot; anything sparser than 2 points can't draw a line, and the panel
  // says so instead of drawing a flat fake.
  const visibilitySeries = useMemo(() => {
    const rows = history.data?.data ?? [];
    return rows
      .map((r) => ({
        date: r.snapshotDate,
        value: typeof r.metricValue === "string" ? Number(r.metricValue) : r.metricValue,
      }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [history.data]);

  // Top citing domains, aggregated client-side — the API returns raw cited
  // URLs with no domain rollup.
  const topSources = useMemo(() => {
    const items = citedUrls.data?.data?.items ?? [];
    const counts = new Map<string, number>();
    for (const it of items) {
      let host: string;
      try {
        host = new URL(it.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);
  }, [citedUrls.data]);

  const weeks = trend.data?.data?.weeks ?? [];
  const thisWeek = weeks.length ? weeks[weeks.length - 1] : null;

  const mentionRows = mentions.data?.rows?.length ?? 0;
  const mentionsTruncated = !!mentions.data?.nextCursor;

  return {
    isLoading: hero.isLoading || trend.isLoading || leaderboard.isLoading || platforms.isLoading,
    hero: h,
    heroLoading: hero.isLoading,
    hasMeasured: !!h && (h.totalChecks ?? 0) > 0,

    visibilitySeries,
    visibilityLoading: history.isLoading,

    weeks,
    thisWeek,
    citationsThisWeek: thisWeek?.cited ?? null,

    mentions7d: mentions.isLoading ? null : mentionRows,
    mentionsTruncated,

    leaderboard: leaderboard.data?.data ?? [],
    leaderboardLoading: leaderboard.isLoading,

    recommendations: recommendations.data?.data ?? [],
    recommendationsLoading: recommendations.isLoading,

    platforms: platforms.data?.data?.platforms ?? [],
    platformsLoading: platforms.isLoading,

    prompts: prompts.data?.data?.byPrompt ?? [],
    promptsLoading: prompts.isLoading,

    topSources,
    totalCitedUrls: citedUrls.data?.data?.total ?? null,
    citedUrlsTruncated: !!citedUrls.data?.data?.truncated,
    citationsLoading: citedUrls.isLoading,
  };
}
