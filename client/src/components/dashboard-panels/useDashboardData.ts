import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

// ─── Dashboard data layer ───────────────────────────────────────────────
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
/**
 * The single ordering of the competitive set.
 *
 * The KPI strip's "Rank" tile and the Rankings panel are the same claim shown
 * twice, so they must not each sort for themselves — the tile used to show a
 * permanent `–` (it was specced as a cross-account global rank that no index
 * exists for) while the panel said "You: #1 of 14 tracked" directly beneath
 * it. Both now read from here.
 *
 * `ownRank` is null when the brand has no leaderboard row at all, which is
 * "not measured" — the tile renders `–`, never a fabricated position.
 */
export function rankLeaderboard(rows: LeaderRow[]): {
  sorted: LeaderRow[];
  ownRank: number | null;
  tracked: number;
} {
  const sorted = [...rows].sort((a, b) => b.shareOfVoice - a.shareOfVoice);
  const ownIndex = sorted.findIndex((r) => r.isOwn);
  return {
    sorted,
    ownRank: ownIndex < 0 ? null : ownIndex + 1,
    tracked: sorted.length,
  };
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
// Competitor gap matrix — moved here when the Monitor "Overview" tab was
// retired. /api/dashboard/gap-matrix has no other consumer, so the panel is
// the only reason it exists.
export type GapCell = "yes" | "no" | "partial" | "unknown";
export interface GapMatrixRow {
  entityType: "brand" | "competitor";
  entityId: string;
  name: string;
  totalMentions: number;
  cells: Record<string, GapCell>;
  gapCount: number;
}
// Replaced the AI Traffic / Conversations placeholders, which needed external
// integrations (GA, crawler tracking) that don't exist. These two are already
// measured for every brand and were surfaced nowhere on this page.
export interface HallucinationStats {
  total: number;
  resolved: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}
export interface Listicle {
  id: string;
  title: string;
  url: string;
  sourcePublication: string | null;
  listPosition: number | null;
  totalListItems: number | null;
  isIncluded: number; // 0 | 1 — integer column, not a boolean
  lastChecked: string;
}
export interface CitedUrl {
  platform: string;
  prompt: string;
  url: string;
  citedAt: string;
}

/** GET /api/dashboard/site-health/:brandId — citation readiness.
 *
 *  Mirrors the reference's Site Health panel, which is NOT a robots.txt check:
 *  it is a composite of whether AI systems can DISCOVER the site (robots.txt /
 *  sitemap.xml / llms.txt), whether they are ALLOWED to read it (AI crawler
 *  rules), and whether our own crawl of it actually SUCCEEDED (pages fetched
 *  vs failed). Issue counts are real rows from the last crawl, never invented
 *  severities.
 *
 *  `score` is null — never 0 — when there is nothing to measure at all. 0 is a
 *  real and terrible score (undiscoverable, blocked, unfetchable) and has to
 *  stay distinguishable from "not measured". */
export interface SiteHealth {
  website: string | null;
  checkedAt: string;
  score: number | null;
  /** True only for the deadline-timeout placeholder — the real compute is
   *  still running in the background and will populate the cache for the
   *  NEXT load. `score` is always null when this is true; discovery/crawler
   *  fields are unmeasured (null/zero), never a real reading. Panels must
   *  render a "Measuring…" state, never a score or zeroes, while this is
   *  true. */
  pending?: boolean;
  /** boolean | null per file — null means UNKNOWN (the probe timed out, hit
   *  a 429, or errored), NOT "confirmed absent". A confirmed 4xx is `false`;
   *  a confirmed 2xx-with-body is `true`. */
  discovery: {
    robotsTxt: boolean | null;
    sitemapXml: boolean | null;
    llmsTxt: boolean | null;
    mcpJson: boolean | null;
    securityTxt: boolean | null;
  };
  crawlers: {
    total: number;
    allowed: number;
    blocked: number;
    unknown: number;
    blockedCrawlers: string[];
  };
  crawl: {
    pagesCrawled: number | null;
    pagesFailed: number | null;
    /** Sitemap URL count — the SITE's size, distinct from `pagesCrawled`
     *  (the cost-bounded fact-extraction sample). Null when the sitemap
     *  could not be fetched/parsed; fall back to `pagesCrawled` for the
     *  "N pages" chip in that case. */
    sitemapUrlCount: number | null;
    lastCrawlAt: string | null;
  };
  /** Detected web framework/CMS ("Next.js", "WordPress", …) or null when no
   *  signature matched confidently. Never guessed. */
  platform: string | null;
  issues: { critical: number; high: number; medium: number; low: number; total: number };
}

/** GET /api/dashboard/perception/:brandId — the newest scored run, or null if
 *  the brand has never been scored.
 *
 *  Every axis is independently nullable: a judge that could not assess an axis
 *  from the available excerpts records null rather than a middling 50, and
 *  `overall` averages only the axes that were actually scorable. `evidenceCount`
 *  is surfaced because a score drawn from 3 excerpts is a different claim from
 *  one drawn from 400. */
export interface Perception {
  trust: number | null;
  quality: number | null;
  value: number | null;
  market: number | null;
  innovation: number | null;
  overall: number | null;
  praised: string[];
  questioned: string[];
  evidenceCount: number;
  model: string | null;
  createdAt: string;
  /** `overall` of the last up-to-7 runs, OLDEST first, for the sparkline.
   *  Empty until a brand has been scored at least once. */
  history: number[];
}

/** Distribution of LLM-judged tone across the same 7-day mention window the
 *  Mentions KPI counts. Shown beneath the perception axes as the always-on
 *  signal — tone is measured continuously, perception only when a run is
 *  triggered. */
export interface MentionTone {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  /** 0-100: share of judged mentions that are positive, neutrals counted at
   *  half weight. Null when nothing was judged in the window. */
  score: number | null;
}

/** Fold the server's sentiment buckets into the Perception panel's model.
 *
 *  Two rules carry the honesty guarantee and are covered by
 *  tests/unit/mentionTone.test.ts:
 *    - absent stats  → null (the endpoint told us nothing)
 *    - zero judged   → score null, NOT 0. "Nothing was judged this week" and
 *      "everything judged was negative" both render as a figure; they must
 *      never render as the SAME figure.
 *  Neutrals count half so a wall of neutral mentions lands mid-scale rather
 *  than reading as negative. */
export function buildTone(
  b: { positive?: number; neutral?: number; negative?: number } | undefined,
): MentionTone | null {
  if (!b) return null;
  const positive = b.positive ?? 0;
  const neutral = b.neutral ?? 0;
  const negative = b.negative ?? 0;
  const total = positive + neutral + negative;
  return {
    positive,
    neutral,
    negative,
    total,
    score: total === 0 ? null : Math.round(((positive + neutral * 0.5) / total) * 100),
  };
}

type Envelope<T> = { success: boolean; data: T };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function useDashboardData(brandId: string) {
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
  const gapMatrix = useQuery<Envelope<{ categories: string[]; rows: GapMatrixRow[] }>>({
    queryKey: [`/api/dashboard/gap-matrix/${brandId}`],
    enabled,
  });
  const hallucinations = useQuery<Envelope<HallucinationStats>>({
    queryKey: [`/api/hallucinations/stats/${brandId}`],
    enabled,
  });
  const listicles = useQuery<Envelope<Listicle[]>>({
    queryKey: [`/api/listicles?brandId=${brandId}`],
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
  // `stats.bySentiment` rides along on this SAME response — the endpoint already
  // computes it, so the Perception panel costs no extra request. It counts only
  // rows whose sentiment came from the real LLM judge (`sentiment_source='llm'`);
  // rows tagged `fallback`/`capped` are placeholder neutrals and are excluded
  // server-side (databaseStorage.getMentionStatsForBrand), which is exactly the
  // honesty guarantee this panel needs.
  const mentions = useQuery<{
    rows: unknown[];
    nextCursor: string | null;
    stats?: {
      total?: number;
      bySentiment?: { positive: number; neutral: number; negative: number };
    };
  }>({
    queryKey: [`/api/brand-mentions/${brandId}?from=${mentionsFrom}&limit=200`],
    enabled,
  });
  // Has a mention scan EVER completed for this brand?
  //
  // Without this, a brand nobody has scanned is indistinguishable from one
  // scanned with nothing found: the list query returns `rows: []` either way
  // and the KPI tile rendered a confident `0 · last 7 days`. That is the
  // "a dash is never a zero" rule inverted — the tile claimed a measurement
  // that had never been taken.
  //
  // The mention scan is opt-in (brands.monitor_mentions gates the weekly cron)
  // and otherwise runs on demand from Monitor › Mentions, so "never scanned"
  // is the normal state for a new brand, not an edge case.
  const lastMentionScan = useQuery<{ data: { completedAt?: string } | null }>({
    queryKey: [`/api/brand-mentions/scans/last/${brandId}`],
    enabled,
  });

  // Site health = AI-crawler access, read from robots.txt. Server-side cached
  // (6h TTL) so rendering the dashboard never triggers an outbound fetch, and
  // deliberately NOT behind the AI rate limiter — viewing a dashboard must not
  // consume the user's AI quota.
  const siteHealth = useQuery<{ success: boolean; data: SiteHealth }>({
    queryKey: [`/api/dashboard/site-health/${brandId}`],
    enabled,
  });

  // Newest persisted perception run. Read-only and LLM-free — scoring happens
  // behind POST .../run, which is rate-limited; rendering a dashboard must
  // never trigger a judge call. `data` is null until a brand has been scored.
  const perception = useQuery<{ success: boolean; data: Perception | null }>({
    queryKey: [`/api/dashboard/perception/${brandId}`],
    enabled,
  });

  // Tone from the mention stats already on the wire.
  const tone = useMemo<MentionTone | null>(
    () => buildTone(mentions.data?.stats?.bySentiment),
    [mentions.data],
  );

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

  const leaderboardRows = useMemo(() => leaderboard.data?.data ?? [], [leaderboard.data]);
  const leaderboardRank = useMemo(() => rankLeaderboard(leaderboardRows), [leaderboardRows]);

  const weeks = trend.data?.data?.weeks ?? [];
  const thisWeek = weeks.length ? weeks[weeks.length - 1] : null;

  const mentionRows = mentions.data?.rows?.length ?? 0;
  const mentionsTruncated = !!mentions.data?.nextCursor;
  // A completed scan is what makes 0 a measurement rather than an absence.
  const mentionsScanned = !!lastMentionScan.data?.data?.completedAt;

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

    // null = never scanned (tile shows `–`), a number = scanned and counted.
    mentions7d:
      mentions.isLoading || lastMentionScan.isLoading || !mentionsScanned ? null : mentionRows,
    mentionsTruncated,
    mentionsScanned,
    mentionsScanLoading: lastMentionScan.isLoading,

    leaderboard: leaderboardRows,
    leaderboardLoading: leaderboard.isLoading,
    // Shared with the Rankings panel via rankLeaderboard, so the KPI tile and
    // the panel can never disagree about where you stand.
    ownRank: leaderboardRank.ownRank,
    trackedBrands: leaderboardRank.tracked,

    recommendations: recommendations.data?.data ?? [],
    recommendationsLoading: recommendations.isLoading,

    platforms: platforms.data?.data?.platforms ?? [],
    platformsLoading: platforms.isLoading,

    gapCategories: gapMatrix.data?.data?.categories ?? [],
    gapRows: gapMatrix.data?.data?.rows ?? [],
    gapLoading: gapMatrix.isLoading,

    hallucinations: hallucinations.data?.data ?? null,
    hallucinationsLoading: hallucinations.isLoading,

    // `null` (not []) until the request settles, so the panels can tell
    // "never scanned" apart from "scanned, found nothing".
    listicles: listicles.data?.data ?? null,
    listiclesLoading: listicles.isLoading,

    prompts: prompts.data?.data?.byPrompt ?? [],
    promptsLoading: prompts.isLoading,

    topSources,
    totalCitedUrls: citedUrls.data?.data?.total ?? null,
    citedUrlsTruncated: !!citedUrls.data?.data?.truncated,
    citationsLoading: citedUrls.isLoading,

    siteHealth: siteHealth.data?.data ?? null,
    siteHealthLoading: siteHealth.isLoading,

    perception: perception.data?.data ?? null,
    perceptionLoading: perception.isLoading,

    tone,
    toneLoading: mentions.isLoading,
  };
}
