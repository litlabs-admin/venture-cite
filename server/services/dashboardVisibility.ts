// Dashboard visibility service - the business logic behind the
// citation-derived dashboard views (Track 12 - AI Visibility Report
// redesign): hero numbers, per-platform rankings, the cited-urls list, the
// competitor gap matrix, and the weekly citation trend.
//
// Extracted verbatim from server/routes/dashboard.ts. No Express types here:
// every function takes explicit parameters (a brand, a `since` cutoff, or a
// brandId) and returns plain data or throws. The route handlers own parsing,
// ownership, and response shaping; everything else lives here.

import { storage } from "../storage";
import { AI_PLATFORMS_CORE } from "@shared/constants";
import type { Brand, BrandPrompt, Competitor, GeoRanking } from "@shared/schema";
import { citationRatePct, computeVisibilityScore } from "@shared/visibilityMetrics";
import { splitCitationContext } from "../lib/citationContextFormat";

// Platforms we surface on the dashboard. Only platforms in this list
// are rendered as rows - matches the set we actually query via
// citationChecker. Adding a platform here requires adding it to the
// citation runner too.
const CORE_PLATFORMS = AI_PLATFORMS_CORE;

// Strip the citation-delimiter markers from a stored citationContext (see
// server/lib/citationContextFormat.ts for the format and both markers). For
// dashboard display we only want the body text - the status line is
// redundant with the Cited/Not cited pill the UI already renders.
function extractResponseBody(ctx: string | null | undefined): string | null {
  const { fullResponse } = splitCitationContext(ctx);
  if (fullResponse) return fullResponse;
  if (!ctx) return null;
  // No delimiter - treat whole string as body, unless it starts with the
  // obvious "Cited" / "Not cited" status lines, in which case skip it.
  const trimmed = ctx.trim();
  if (/^(Cited|Not cited|Check failed)/i.test(trimmed)) return null;
  return trimmed || null;
}

// ---------------------------------------------------------------------------
// Shared loader - brand prompts + cited/uncited rankings.
//
// Accept an optional `since` Date to override the default.
// 30-day window. Used by Citations to scope dashboard reads to "rankings
// from the active run only" while a fresh run is in flight - without
// this, completed-cells from the new run mix with un-rechecked-cells
// from the old run for the entire run duration. When `since` is null
// (no active run), behavior is unchanged: 30-day rolling window.
//
// NOTE: this loader is deliberately prompt-rankings-only, with a 30-day
// default window and a `since` override - that is confirmed intended
// behaviour (see server/routes/dashboard.ts's `?since=` query handling),
// not a defect. Preserved exactly.
export async function loadRankingsContext(
  brandId: string,
  opts: { windowDays?: number; since?: Date | null } = {},
) {
  const since =
    opts.since instanceof Date && !isNaN(opts.since.getTime())
      ? opts.since
      : new Date(Date.now() - (opts.windowDays ?? 30) * 24 * 60 * 60 * 1000);
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  const promptIds = prompts.map((p) => p.id);
  const rankings =
    promptIds.length > 0 ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since) : [];
  return { prompts, promptIds, rankings, since };
}

function toCitedArr(rankings: GeoRanking[]) {
  return rankings.filter((r) => r.isCited === 1);
}

function lastScanAt(rankings: GeoRanking[]): Date | null {
  if (rankings.length === 0) return null;
  let latest = rankings[0].checkedAt;
  for (const r of rankings) {
    if (r.checkedAt > latest) latest = r.checkedAt;
  }
  return latest;
}

// ==========================================================================
// GET /api/dashboard/hero/:brandId
// ==========================================================================
export async function getDashboardHero(brand: Brand, since: Date | null) {
  const { rankings } = await loadRankingsContext(brand.id, { since });
  const totalChecks = rankings.length;
  const cited = toCitedArr(rankings);
  const citedChecks = cited.length;
  // Average authority across cited rows (rows with authority_score set).
  const authScores = cited
    .map((r) => r.authorityScore)
    .filter((s): s is number => typeof s === "number");
  // null (not 0) when NO cited row carries an authority score, so the
  // scorer treats authority as UNMEASURED and drops its 30-pt weight
  // instead of capping a perfect brand at 70.
  const avgAuthorityScore =
    authScores.length > 0 ? authScores.reduce((a, b) => a + b, 0) / authScores.length : null;

  // Average rank across cited rows - lower is better.
  const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
  const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

  // Canonical visibility score (server/lib/visibilityMetrics.ts) -
  // the single definition now shared by /geo-analytics, /rankings
  // and /entity-strength, so the number is identical across screens.
  // This call is byte-for-byte the prior hero formula (unit-tested).
  const visibilityScore = computeVisibilityScore(
    citedChecks,
    totalChecks,
    avgRank,
    avgAuthorityScore,
  );

  // Trend delta. The stored "visibility_score" series holds the run
  // CITATION RATE (see metricsSnapshot.ts - and weekly_catchup diffs it
  // as a rate too). So the delta MUST be rate-vs-rate: comparing the
  // composite visibilityScore against a stored rate produced a permanent
  // phantom trend (e.g. a flat brand always showing "+15"). The headline
  // number stays the composite; the arrow honestly tracks rate change.
  const history = await storage.getMetricsHistory(brand.id, "visibility_score", 90);
  let visibilityDelta = 0;
  if (history.length >= 2) {
    const prior = Number(history[history.length - 2].metricValue);
    const currentRate = citationRatePct(citedChecks, totalChecks);
    if (!Number.isNaN(prior)) visibilityDelta = currentRate - prior;
  }

  // The hero exposes only metrics we can actually compute. The former
  // missed-visits / revenue-impact / category-query / industry-average
  // fields were removed entirely: they need category-query volume and
  // per-industry benchmark data we don't have, and shipping null/
  // placeholder fields just invited fabricated numbers downstream.
  return {
    visibilityScore,
    visibilityDelta,
    citedChecks,
    totalChecks,
    citationRate: citationRatePct(citedChecks, totalChecks),
    lastScanAt: lastScanAt(rankings),
  };
}

// ==========================================================================
// GET /api/dashboard/rankings/:brandId
// ==========================================================================
export async function getDashboardRankings(brand: Brand, since: Date | null) {
  const { rankings } = await loadRankingsContext(brand.id, { since });

  // Group rows by canonical platform label (case-insensitive match).
  // Only the exact platform names the citation runner writes are honored
  // - no legacy aliases. Platforms not in CORE_PLATFORMS are ignored
  // so deprecated/unsupported engines don't leak into the dashboard.
  const canon = new Map<string, string>();
  for (const p of CORE_PLATFORMS) canon.set(p.toLowerCase(), p);

  const byPlatform = new Map<string, GeoRanking[]>();
  for (const r of rankings) {
    const label = canon.get(r.aiPlatform.toLowerCase());
    if (!label) continue; // skip platforms outside the tracked set
    const arr = byPlatform.get(label) ?? [];
    arr.push(r);
    byPlatform.set(label, arr);
  }

  const platforms = CORE_PLATFORMS.map((label) => {
    const rows = byPlatform.get(label) ?? [];
    // Skip platforms that have no data at all - no empty cards.
    if (rows.length === 0) return null;

    const cited = rows.filter((r) => r.isCited === 1);
    const citedCount = cited.length;
    const totalCount = rows.length;
    const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
    const avgRank =
      ranks.length > 0 ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;

    // Canonical 0..100 score - same scale as the hero and
    // /api/geo-analytics's platformBreakdown (one number, one
    // meaning across every screen that shows a per-platform score;
    // this used to be divided by 10 here only, which made Overview
    // and Report disagree for the same platform). Authority is null
    // (not 0) when NO cited row carries a score, so the scorer
    // drops its weight instead of capping - same as the hero.
    const authScores = cited
      .map((r) => r.authorityScore)
      .filter((s): s is number => typeof s === "number");
    const avgAuth =
      authScores.length > 0 ? authScores.reduce((a, b) => a + b, 0) / authScores.length : null;
    const score = computeVisibilityScore(citedCount, totalCount, avgRank ?? 0, avgAuth);

    const strengthLabel: "Weak" | "Moderate" | "Strong" =
      score >= 70 ? "Strong" : score >= 40 ? "Moderate" : "Weak";

    // Snippet preference: show a cited response if this platform has any
    // cited rows, otherwise fall back to the most recent non-cited response.
    // Callers render it green (cited) or red (not cited) via the
    // isCitedSnippet flag. The verbatim-responses card filters these
    // client-side so non-cited snippets never reach "What AI Says".
    const pickLatest = (arr: GeoRanking[]) =>
      [...arr]
        .filter((r) => r.citationContext)
        .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
    const citedSnippetRow = pickLatest(cited);
    const fallbackSnippetRow = citedSnippetRow ?? pickLatest(rows);
    const snippetRow = fallbackSnippetRow ?? null;
    const rawBody = snippetRow ? extractResponseBody(snippetRow.citationContext) : null;
    const latestSnippet = rawBody ? rawBody.slice(0, 600) : null;
    const latestSnippetPrompt = snippetRow?.prompt ?? null;
    const isCitedSnippet = citedSnippetRow ? true : false;

    return {
      aiPlatform: label,
      isLive: true,
      rank: avgRank,
      citedCount,
      totalCount,
      visibilityScore: score,
      strengthLabel,
      latestSnippet,
      latestSnippetPrompt,
      isCitedSnippet,
    };
  }).filter((p): p is NonNullable<typeof p> => p !== null);

  return { platforms };
}

// ==========================================================================
// GET /api/dashboard/cited-urls/:brandId
//
// Flat list of every URL an AI engine cited, drawn from the already-stored
// geo_rankings.cited_urls[] array (with citing_outlet_url as a fallback when
// the array is empty but the row is cited). Powers the Citations table on the
// Monitor Overview + Reports so users can see exactly which pages show up,
// without drilling into individual prompt responses. Read-only, no new schema.
// ==========================================================================
export async function getDashboardCitedUrls(brand: Brand, since: Date | null) {
  const { rankings } = await loadRankingsContext(brand.id, { since });

  // One entry per (platform, prompt, url). Dedupe identical URLs that
  // recur across runs, keeping the most recent citedAt.
  const seen = new Map<string, { platform: string; prompt: string; url: string; citedAt: Date }>();
  for (const r of toCitedArr(rankings)) {
    // `citingOutletUrl` ONLY - the matcher-derived source that actually
    // referenced the brand.
    //
    // This used to prefer `citedUrls`, which the schema defines as
    // "list of all URLs the LLM cited in its response" - every link in
    // the answer, most of which have nothing to do with the brand. On
    // the Apple brand that turned 117 attributed sources into 962 raw
    // URLs (226 after dedupe), so "cited URLs" counted the whole
    // bibliography of every answer we appeared in and "Top sources"
    // ranked outlets that never mentioned the brand at all.
    //
    // A cited ranking with no citingOutletUrl contributes nothing: the
    // response cited us but we could not attribute it to a source, and
    // listing its unrelated links would be a guess.
    const urls = r.citingOutletUrl ? [r.citingOutletUrl] : [];
    for (const rawUrl of urls) {
      const url = (rawUrl ?? "").trim();
      if (!url) continue;
      const key = `${r.aiPlatform}|${r.prompt}|${url}`;
      const existing = seen.get(key);
      if (!existing || r.checkedAt.getTime() > existing.citedAt.getTime()) {
        seen.set(key, {
          platform: r.aiPlatform,
          prompt: r.prompt,
          url,
          citedAt: r.checkedAt,
        });
      }
    }
  }

  // Cap the payload. After dedupe this is almost always well under the
  // limit, but a brand with a very large prompt portfolio could otherwise
  // return thousands of rows; the UI only shows the most recent anyway.
  const MAX_ITEMS = 500;
  const all = Array.from(seen.values()).sort((a, b) => b.citedAt.getTime() - a.citedAt.getTime());
  const items = all.slice(0, MAX_ITEMS);

  return { items, total: all.length, truncated: all.length > MAX_ITEMS };
}

// ==========================================================================
// GET /api/dashboard/gap-matrix/:brandId
// ==========================================================================
export async function getDashboardGapMatrix(brand: Brand, since: Date | null) {
  const { prompts, rankings } = await loadRankingsContext(brand.id, { since });

  // Category set = non-null distinct category values on tracked prompts.
  // Fall back to a generic "General" bucket when the prompt has none.
  const promptIdToCategory = new Map<string, string>();
  const categorySet = new Set<string>();
  for (const p of prompts as BrandPrompt[]) {
    const cat = p.category?.trim() || "General";
    promptIdToCategory.set(p.id, cat);
    categorySet.add(cat);
  }
  const categories = Array.from(categorySet).sort();

  // Brand row - mark "yes" for any category with >=1 cited ranking.
  const brandCellCounts: Record<string, { cited: number; total: number }> = {};
  for (const c of categories) brandCellCounts[c] = { cited: 0, total: 0 };
  for (const r of rankings) {
    const cat = r.brandPromptId
      ? (promptIdToCategory.get(r.brandPromptId) ?? "General")
      : "General";
    const bucket = brandCellCounts[cat];
    if (!bucket) continue;
    bucket.total += 1;
    if (r.isCited === 1) bucket.cited += 1;
  }
  const brandCells: Record<string, "yes" | "no" | "partial" | "unknown"> = {};
  for (const c of categories) {
    const b = brandCellCounts[c];
    brandCells[c] =
      b.total === 0 ? "unknown" : b.cited === 0 ? "no" : b.cited === b.total ? "yes" : "partial";
  }

  // Competitor rows from competitor_geo_rankings. Core only - the gap
  // matrix compares the brand against rival COMPANIES, and an
  // unfiltered read takes the first 6 rows of the citation-mined pool,
  // which is mostly product names and publishers.
  const competitors = (await storage.getCompetitors(brand.id, {
    tier: "core",
  })) as Competitor[];
  const topCompetitors = competitors.slice(0, 6);

  const competitorRankings =
    topCompetitors.length > 0
      ? await storage
          .getCompetitorGeoRankingsForCompetitors(
            topCompetitors.map((comp) => comp.id),
            {
              since: new Date(Date.now() - 30 * 86400000),
            },
          )
          .catch(() => [])
      : [];
  const rankingsByCompetitorId = new Map<string, typeof competitorRankings>();
  for (const ranking of competitorRankings) {
    const rankings = rankingsByCompetitorId.get(ranking.competitorId) ?? [];
    rankings.push(ranking);
    rankingsByCompetitorId.set(ranking.competitorId, rankings);
  }

  const competitorRows = topCompetitors.map((comp) => {
    const cgr = rankingsByCompetitorId.get(comp.id) ?? [];
    const cellCounts: Record<string, { cited: number; total: number }> = {};
    for (const c of categories) cellCounts[c] = { cited: 0, total: 0 };
    for (const r of cgr) {
      const cat = (r.brandPromptId && promptIdToCategory.get(r.brandPromptId)) || "General";
      const bucket = cellCounts[cat];
      if (!bucket) continue;
      bucket.total += 1;
      if (r.isCited === 1) bucket.cited += 1;
    }
    const cells: Record<string, "yes" | "no" | "partial" | "unknown"> = {};
    const cellDiffs: Record<string, number> = {};
    let totalMentions = 0;
    let gapCount = 0;
    // Gap threshold - only call a category a "gap" when the competitor
    // has at least this many more citations than the brand. Prevents
    // "competitor cited once, brand cited zero" from registering as
    // dominance. Tune per-product as the citation volume grows.
    const GAP_THRESHOLD = 2;
    for (const c of categories) {
      const b = cellCounts[c];
      const state =
        b.total === 0 ? "unknown" : b.cited === 0 ? "no" : b.cited === b.total ? "yes" : "partial";
      cells[c] = state;
      totalMentions += b.cited;
      // Magnitude gap: competitor cited count minus brand cited count
      // in the same category. Positive = competitor ahead.
      const brandBucket = brandCellCounts[c] ?? { cited: 0, total: 0 };
      const diff = b.cited - brandBucket.cited;
      cellDiffs[c] = diff;
      if (diff >= GAP_THRESHOLD) gapCount += 1;
    }
    return {
      entityType: "competitor" as const,
      entityId: comp.id,
      name: comp.name,
      totalMentions,
      cells,
      cellDiffs,
      gapCount,
    };
  });

  // Brand row always last (highlighted in UI).
  const brandTotal = Object.values(brandCellCounts).reduce((a, b) => a + b.cited, 0);
  const rows = [
    ...competitorRows,
    {
      entityType: "brand" as const,
      entityId: brand.id,
      name: brand.name,
      totalMentions: brandTotal,
      cells: brandCells,
      gapCount: 0,
    },
  ];

  return { categories, rows };
}

// ==========================================================================
// GET /api/dashboard/citation-trend/:brandId
// Weekly citation-rate buckets over the last 8 weeks, computed directly
// from geo_rankings. Replaces the old metrics_history-powered "Score
// History" chart which depended on snapshots that are rarely populated.
// ==========================================================================
export async function getDashboardCitationTrend(brandId: string) {
  const WEEKS = 8;
  const since = new Date(Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000);
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  const promptIds = prompts.map((p) => p.id);
  const weeklyTrend =
    promptIds.length > 0 ? await storage.getWeeklyCitationTrend(promptIds, since) : [];

  // Monday-anchored weeks, labelled by the week's start date.
  const weekStartOf = (d: Date) => {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = dt.getUTCDay(); // 0=Sun..6=Sat
    const diff = (day + 6) % 7; // days since Monday
    dt.setUTCDate(dt.getUTCDate() - diff);
    return dt;
  };

  type Bucket = { cited: number; total: number };
  const buckets = new Map<string, Bucket>();
  // Seed all 8 weeks so empty weeks still render as zero-height bars.
  const nowWeek = weekStartOf(new Date());
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(nowWeek);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.set(d.toISOString().slice(0, 10), { cited: 0, total: 0 });
  }
  for (const row of weeklyTrend) {
    const b = buckets.get(row.weekStart);
    if (!b) continue;
    b.total = row.total;
    b.cited = row.cited;
  }

  const series = Array.from(buckets.entries()).map(([weekStart, b]) => ({
    weekStart,
    cited: b.cited,
    total: b.total,
    citationRate: citationRatePct(b.cited, b.total),
  }));

  return { weeks: series };
}
