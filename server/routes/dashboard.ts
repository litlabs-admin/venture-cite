// Dashboard aggregate endpoints (Track 12 — AI Visibility Report redesign).
//
// Thin read-only endpoints that assemble the hero/rankings/gap-matrix/
// entity-strength views from existing Phase-1 tables. No new schema.
//
// Included:
//   GET /api/dashboard/hero/:brandId            — hero row numbers
//   GET /api/dashboard/rankings/:brandId        — per-platform rollup + snippets
//   GET /api/dashboard/gap-matrix/:brandId      — competitor × query-type cells
//   GET /api/dashboard/entity-strength/:brandId — composite + 4 sub-scores

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { AI_PLATFORMS_CORE, VISIBILITY_CHECKLIST_TOTAL } from "@shared/constants";
import type { BrandPrompt, GeoRanking, Competitor } from "@shared/schema";
import { getRecommendations, type RecommendationState } from "../lib/recommendationsEngine";
import { citationRatePct, computeVisibilityScore } from "../lib/visibilityMetrics";

// Platforms we surface on the dashboard. Only platforms in this list
// are rendered as rows — matches the set we actually query via
// citationChecker. Adding a platform here requires adding it to the
// citation runner too.
const CORE_PLATFORMS = AI_PLATFORMS_CORE;

// Strip the citation-delimiter markers from a stored citationContext.
// Rows are persisted as "{statusLine}\n\n||| RAW_RESPONSE |||\n{body}"
// (or the older "--- RAW RESPONSE ---"). For dashboard display we only
// want the body text — the status line is redundant with the Cited/Not
// cited pill the UI already renders.
function extractResponseBody(ctx: string | null | undefined): string | null {
  if (!ctx) return null;
  const markers = ["\n\n||| RAW_RESPONSE |||\n", "\n\n--- RAW RESPONSE ---\n"];
  for (const m of markers) {
    const idx = ctx.indexOf(m);
    if (idx !== -1) {
      const body = ctx.slice(idx + m.length).trim();
      return body.length > 0 ? body : null;
    }
  }
  // No delimiter — treat whole string as body, unless it starts with the
  // obvious "Cited" / "Not cited" status lines, in which case skip it.
  const trimmed = ctx.trim();
  if (/^(Cited|Not cited|Check failed)/i.test(trimmed)) return null;
  return trimmed || null;
}

async function requireOwnedBrand(req: any) {
  const user = requireUser(req);
  const brand = await storage.getBrandById(req.params.brandId);
  if (!brand || brand.userId !== user.id) return null;
  return brand;
}

// ---------------------------------------------------------------------------
// Shared loader — brand prompts + cited/uncited rankings.
//
// Wave 9.2: accepts an optional `since` Date overriding the default
// 30-day window. Used by Citations to scope dashboard reads to "rankings
// from the active run only" while a fresh run is in flight — without
// this, completed-cells from the new run mix with un-rechecked-cells
// from the old run for the entire run duration. When `since` is null
// (no active run), behavior is unchanged: 30-day rolling window.
async function loadRankingsContext(
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

// Wave 9.2: parse the optional ?since=<ISO> query param. Returns null
// when missing or malformed — the loader then falls back to the default
// 30-day window. Defensive against junk input (clients only ever pass
// what useActiveCitationRuns surfaced, but we guard anyway).
function parseSinceQuery(req: { query: Record<string, unknown> }): Date | null {
  const raw = typeof req.query.since === "string" ? req.query.since : null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
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

export function setupDashboardRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/dashboard/hero/:brandId
  // ==========================================================================
  app.get(
    "/api/dashboard/hero/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });
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

        // Average rank across cited rows — lower is better.
        const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
        const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

        // Canonical visibility score (server/lib/visibilityMetrics.ts) —
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
        // CITATION RATE (see metricsSnapshot.ts — and weekly_catchup diffs it
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
        res.json({
          success: true,
          data: {
            visibilityScore,
            visibilityDelta,
            citedChecks,
            totalChecks,
            citationRate: citationRatePct(citedChecks, totalChecks),
            lastScanAt: lastScanAt(rankings),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load dashboard hero");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/rankings/:brandId
  // ==========================================================================
  app.get(
    "/api/dashboard/rankings/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });

        // Group rows by canonical platform label (case-insensitive match).
        // Only the exact platform names the citation runner writes are honored
        // — no legacy aliases. Platforms not in CORE_PLATFORMS are ignored
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
          // Skip platforms that have no data at all — no empty cards.
          if (rows.length === 0) return null;

          const cited = rows.filter((r) => r.isCited === 1);
          const citedCount = cited.length;
          const totalCount = rows.length;
          const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
          const avgRank =
            ranks.length > 0 ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;

          // Canonical 0..100 score — same scale as the hero and
          // /api/geo-analytics's platformBreakdown (one number, one
          // meaning across every screen that shows a per-platform score;
          // this used to be divided by 10 here only, which made Overview
          // and Report disagree for the same platform). Authority is null
          // (not 0) when NO cited row carries a score, so the scorer
          // drops its weight instead of capping — same as the hero.
          const authScores = cited
            .map((r) => r.authorityScore)
            .filter((s): s is number => typeof s === "number");
          const avgAuth =
            authScores.length > 0
              ? authScores.reduce((a, b) => a + b, 0) / authScores.length
              : null;
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

        res.json({ success: true, data: { platforms } });
      } catch (error) {
        sendError(res, error, "Failed to load platform rankings");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/cited-urls/:brandId
  //
  // Flat list of every URL an AI engine cited, drawn from the already-stored
  // geo_rankings.cited_urls[] array (with citing_outlet_url as a fallback when
  // the array is empty but the row is cited). Powers the Citations table on the
  // Monitor Overview + Reports so users can see exactly which pages show up,
  // without drilling into individual prompt responses. Read-only, no new schema.
  // ==========================================================================
  app.get(
    "/api/dashboard/cited-urls/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });

        // One entry per (platform, prompt, url). Dedupe identical URLs that
        // recur across runs, keeping the most recent citedAt.
        const seen = new Map<
          string,
          { platform: string; prompt: string; url: string; citedAt: Date }
        >();
        for (const r of toCitedArr(rankings)) {
          const urls =
            Array.isArray(r.citedUrls) && r.citedUrls.length > 0
              ? r.citedUrls
              : r.citingOutletUrl
                ? [r.citingOutletUrl]
                : [];
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
        const all = Array.from(seen.values()).sort(
          (a, b) => b.citedAt.getTime() - a.citedAt.getTime(),
        );
        const items = all.slice(0, MAX_ITEMS);

        res.json({
          success: true,
          data: { items, total: all.length, truncated: all.length > MAX_ITEMS },
        });
      } catch (error) {
        sendError(res, error, "Failed to load cited URLs");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/gap-matrix/:brandId
  // ==========================================================================
  app.get(
    "/api/dashboard/gap-matrix/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { prompts, rankings } = await loadRankingsContext(brand.id, {
          since: parseSinceQuery(req),
        });

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

        // Brand row — mark "yes" for any category with >=1 cited ranking.
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
            b.total === 0
              ? "unknown"
              : b.cited === 0
                ? "no"
                : b.cited === b.total
                  ? "yes"
                  : "partial";
        }

        // Competitor rows from competitor_geo_rankings.
        const competitors = (await storage.getCompetitors(brand.id)) as Competitor[];
        const topCompetitors = competitors.slice(0, 6);

        const competitorRows = await Promise.all(
          topCompetitors.map(async (comp) => {
            const cgr = await storage
              .getCompetitorGeoRankings(comp.id, { since: new Date(Date.now() - 30 * 86400000) })
              .catch(() => [] as Awaited<ReturnType<typeof storage.getCompetitorGeoRankings>>);
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
            // Gap threshold — only call a category a "gap" when the competitor
            // has at least this many more citations than the brand. Prevents
            // "competitor cited once, brand cited zero" from registering as
            // dominance. Tune per-product as the citation volume grows.
            const GAP_THRESHOLD = 2;
            for (const c of categories) {
              const b = cellCounts[c];
              const state =
                b.total === 0
                  ? "unknown"
                  : b.cited === 0
                    ? "no"
                    : b.cited === b.total
                      ? "yes"
                      : "partial";
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
          }),
        );

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

        res.json({ success: true, data: { categories, rows } });
      } catch (error) {
        sendError(res, error, "Failed to load gap matrix");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/entity-strength/:brandId
  // ==========================================================================
  // Replaces the old entity-strength endpoint. One transparent formula
  // instead of four arbitrary subscores. Kept at the same URL so existing
  // clients don't 404 while the UI migrates; data shape is different.
  //
  //   citation_health = round(100 × cite_rate × rank_factor)
  //   cite_rate   = cited / total (0..1)
  //   rank_factor = avg_rank ? max(0, 1 - (avg_rank - 1) / 10) : 1
  //
  // So a brand cited 60% of the time at average rank 2 scores
  // round(100 × 0.6 × 0.9) = 54.
  app.get(
    "/api/dashboard/entity-strength/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });
        const totalChecks = rankings.length;
        const cited = toCitedArr(rankings);
        const citedCount = cited.length;

        const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
        // Nullable for the response (UI shows "—" for no rank data); the
        // score treats null as neutral via `?? 0` (canonical factor 1).
        const avgRank: number | null =
          ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
        const authScores = cited
          .map((r) => r.authorityScore)
          .filter((s): s is number => typeof s === "number");
        // null (not 0) when authority is UNMEASURED, so the scorer drops its
        // weight instead of capping at 70 — consistent with the hero and
        // /api/geo-analytics (one number, one meaning across screens).
        const avgAuthority =
          authScores.length > 0 ? authScores.reduce((a, b) => a + b, 0) / authScores.length : null;

        // Canonical visibility score — the same definition as the
        // dashboard hero and /api/geo-analytics.
        const score = computeVisibilityScore(citedCount, totalChecks, avgRank ?? 0, avgAuthority);
        const label: "Weak" | "Moderate" | "Strong" =
          score >= 60 ? "Strong" : score >= 30 ? "Moderate" : "Weak";

        res.json({
          success: true,
          data: {
            score,
            label,
            citeRatePct: citationRatePct(citedCount, totalChecks),
            avgRank: avgRank === null ? null : Math.round(avgRank * 10) / 10,
            totalChecks,
            citedCount,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load citation health");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/citation-trend/:brandId
  // Weekly citation-rate buckets over the last 8 weeks, computed directly
  // from geo_rankings. Replaces the old metrics_history-powered "Score
  // History" chart which depended on snapshots that are rarely populated.
  // ==========================================================================
  app.get(
    "/api/dashboard/citation-trend/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const WEEKS = 8;
        const since = new Date(Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000);
        const prompts = await storage.getBrandPromptsByBrandId(brand.id);
        const promptIds = prompts.map((p) => p.id);
        const rankings =
          promptIds.length > 0
            ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since)
            : [];

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
        for (const r of rankings) {
          const key = weekStartOf(r.checkedAt).toISOString().slice(0, 10);
          const b = buckets.get(key);
          if (!b) continue;
          b.total += 1;
          if (r.isCited === 1) b.cited += 1;
        }

        const series = Array.from(buckets.entries()).map(([weekStart, b]) => ({
          weekStart,
          cited: b.cited,
          total: b.total,
          citationRate: b.total > 0 ? Math.round((b.cited / b.total) * 100) : 0,
        }));

        res.json({ success: true, data: { weeks: series } });
      } catch (error) {
        sendError(res, error, "Failed to load citation trend");
      }
    }),
  );

  // ==========================================================================
  // GET /api/brands/:brandId/recommendations
  // Phase 4: deterministic "do this next" rules engine. Loads brand state
  // via parallel storage queries, calls the pure engine in
  // server/lib/recommendationsEngine.ts, and returns up to 5 prioritised
  // recommendations. Sub-200ms target — no LLM call, just count queries.
  // ==========================================================================
  app.get(
    "/api/brands/:brandId/recommendations",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const user = requireUser(req);
        const brandId = brand.id;

        // Parallel-load all the count/state queries the engine needs.
        // 2026-05-28: replaced getLastGeoSignalRunAt (timestamp-only)
        // with getLastGeoSignalSummary (timestamp + overall score) so
        // the engine can fork the Signals rec on staleness vs result
        // quality. One query instead of two.
        const [
          articles,
          prompts,
          citationRuns,
          competitors,
          communityPosts,
          faqItems,
          visibilityRows,
          lastSignalsSummary,
        ] = await Promise.all([
          storage.getArticlesByUserIdWithStatus(user.id, { brandId, limit: 100, offset: 0 }),
          storage.getBrandPromptsByBrandId(brandId),
          storage.getCitationRunsByBrandId(brandId, 100),
          storage.getCompetitors(brandId),
          storage.getCommunityPosts(brandId),
          storage.getFaqItems(brandId),
          storage.getVisibilityProgress(brandId),
          storage.getLastGeoSignalSummary(brandId),
        ]);

        // Citation rate from the most recent COMPLETED run. Null if no runs
        // have completed yet. citation_runs orders newest-first per the
        // storage method's contract.
        const latestCompletedRun = citationRuns.find(
          (r) => r.status === "completed" || r.status === "succeeded",
        );
        const citationRate =
          latestCompletedRun && (latestCompletedRun.totalChecks ?? 0) > 0
            ? (latestCompletedRun.totalCited ?? 0) / (latestCompletedRun.totalChecks ?? 1)
            : null;

        const state: RecommendationState = {
          brand,
          articleCount: articles.length,
          promptCount: prompts.length,
          citationRunCount: citationRuns.length,
          citationRate,
          lastSignalsScanAt: lastSignalsSummary?.ranAt ?? null,
          lastSignalsScore: lastSignalsSummary?.overallScore ?? null,
          visibilityChecklistCompleted: visibilityRows.length,
          visibilityChecklistTotal: VISIBILITY_CHECKLIST_TOTAL,
          competitorCount: competitors.length,
          communityPostCount: communityPosts.length,
          faqCount: faqItems.length,
        };

        const recommendations = getRecommendations(state);
        res.json({ success: true, data: recommendations });
      } catch (error) {
        sendError(res, error, "Failed to load recommendations");
      }
    }),
  );

  // ==========================================================================
  // GET /api/brands/:brandId/alerts
  // Phase 8: run-change alerts persisted by server/lib/runChangeAlerts.ts at
  // the end of each citation run. Powers the Command Center "What changed"
  // widget so the alert rows are a live surface, not write-only data.
  // ==========================================================================
  app.get(
    "/api/brands/:brandId/alerts",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const limitRaw = Number((req.query.limit as string) ?? 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;
        const alerts = await storage.getAlertHistory(brand.id, limit);
        res.json({ success: true, data: alerts });
      } catch (error) {
        sendError(res, error, "Failed to load alerts");
      }
    }),
  );
}
