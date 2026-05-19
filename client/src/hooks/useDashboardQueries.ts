import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { BrandMention } from "@shared/schema";
import type { PlatformRanking } from "@/components/dashboard/PlatformRankingCard";
import type { GapMatrixRow } from "@/components/dashboard/CompetitorGapMatrix";
import type { EntityStrengthData } from "@/components/dashboard/BrandEntityStrength";

// Wave 9.2: the seven dashboard aggregate queries that drive the Visibility
// canvas. Extracted from the legacy `pages/monitor-overview.tsx` so it can be
// reused by both the doomed page (until it's deleted) and the new
// `MonitorVisibility` canvas via `lib/monitorQueries.ts`.
//
// `since` scopes the ranking-shaped aggregates to a fresh citation run's
// window so dashboards reset cleanly and fill in as new platform results
// land. When no run is active, `since` is null and every endpoint falls
// back to its default window. Threaded into every queryKey via the
// `{ since }` object segment, which the default queryFn at queryClient.ts
// converts into a URL query param.
//
// `refetchInterval` is supplied by `useCitationLiveRefresh` — TanStack only
// honors the cadence at observer creation time, so it must be set on the
// useQuery itself (not via setQueryDefaults).

export interface HeroData {
  visibilityScore: number;
  visibilityDelta: number;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
}

export function useDashboardQueries(
  brandId: string,
  refetchInterval: number | false,
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
