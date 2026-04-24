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
import { sendError } from "../lib/routesShared";
import { AI_PLATFORMS_CORE } from "@shared/constants";
import type { BrandPrompt, GeoRanking, Competitor } from "@shared/schema";

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round(n: number): number {
  return Math.round(n);
}

async function requireOwnedBrand(req: any) {
  const user = requireUser(req);
  const brand = await storage.getBrandById(req.params.brandId);
  if (!brand || brand.userId !== user.id) return null;
  return brand;
}

// ---------------------------------------------------------------------------
// Shared loader — brand prompts + cited/uncited rankings windowed to 30d.
// All four endpoints read the same base set, so we expose a single helper
// and let each handler slice it differently.
// ---------------------------------------------------------------------------
async function loadRankingsContext(brandId: string, windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
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

export function setupDashboardRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/dashboard/hero/:brandId
  // ==========================================================================
  app.get("/api/dashboard/hero/:brandId", async (req, res) => {
    try {
      const brand = await requireOwnedBrand(req);
      if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

      const { rankings } = await loadRankingsContext(brand.id);
      const totalChecks = rankings.length;
      const cited = toCitedArr(rankings);
      const citedChecks = cited.length;
      const citationRate = totalChecks > 0 ? citedChecks / totalChecks : 0;

      // Average authority across cited rows (rows with authority_score set).
      const authScores = cited
        .map((r) => r.authorityScore)
        .filter((s): s is number => typeof s === "number");
      const avgAuthorityScore =
        authScores.length > 0 ? authScores.reduce((a, b) => a + b, 0) / authScores.length : 0;

      // Not-found rate = fraction of checks that returned nothing
      // recognizable. Proxy: uncited with no rank and no citation context.
      const notFound = rankings.filter(
        (r) => r.isCited === 0 && r.rank === null && !r.citationContext,
      ).length;
      const notFoundRate = totalChecks > 0 ? notFound / totalChecks : 1;

      const visibilityScore = clamp(
        round(0.5 * citationRate * 100 + 0.3 * avgAuthorityScore + 0.2 * (1 - notFoundRate) * 100),
        0,
        100,
      );

      // Score delta from most recent metrics_history snapshot of the same
      // metric type. If we have <2 points, delta is 0.
      const history = await storage.getMetricsHistory(brand.id, "visibility_score", 90);
      let visibilityDelta = 0;
      if (history.length >= 2) {
        const prior = Number(history[history.length - 2].metricValue);
        if (!Number.isNaN(prior)) visibilityDelta = visibilityScore - prior;
      }

      // Missed-visits + industry average: these require real category-query
      // volume and per-industry benchmark data that we do NOT have yet. Return
      // null for all of them rather than seeding with coarse constants that
      // mislead the user. The UI omits the row when null. When industry_
      // benchmarks lands, swap these for real numbers without changing the
      // response shape.
      res.json({
        success: true,
        data: {
          visibilityScore,
          visibilityDelta,
          citedChecks,
          totalChecks,
          citationRate: Math.round(citationRate * 100),
          missedVisitsPerMonth: null,
          revenueImpactUsd: null,
          totalCategoryQueries: null,
          industryAvg: null,
          lastScanAt: lastScanAt(rankings),
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to load dashboard hero");
    }
  });

  // ==========================================================================
  // GET /api/dashboard/rankings/:brandId
  // ==========================================================================
  app.get("/api/dashboard/rankings/:brandId", async (req, res) => {
    try {
      const brand = await requireOwnedBrand(req);
      if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

      const { rankings } = await loadRankingsContext(brand.id);

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

        // Visibility /10: weighted blend of citation rate + authority + rank.
        const rate = totalCount > 0 ? citedCount / totalCount : 0;
        const auth = cited.map((r) => r.authorityScore ?? 0);
        const avgAuth = auth.length > 0 ? auth.reduce((a, b) => a + b, 0) / auth.length : 0;
        const rankPenalty = avgRank ? Math.max(0, (10 - avgRank) / 10) : 0;
        const score10 = clamp(
          Math.round(10 * (0.5 * rate + 0.3 * (avgAuth / 100) + 0.2 * rankPenalty)),
          0,
          10,
        );

        const strengthLabel: "Weak" | "Moderate" | "Strong" =
          score10 >= 7 ? "Strong" : score10 >= 4 ? "Moderate" : "Weak";

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
          visibilityScore: score10,
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
  });

  // ==========================================================================
  // GET /api/dashboard/gap-matrix/:brandId
  // ==========================================================================
  app.get("/api/dashboard/gap-matrix/:brandId", async (req, res) => {
    try {
      const brand = await requireOwnedBrand(req);
      if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

      const { prompts, rankings } = await loadRankingsContext(brand.id);

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
  });

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
  app.get("/api/dashboard/entity-strength/:brandId", async (req, res) => {
    try {
      const brand = await requireOwnedBrand(req);
      if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

      const { rankings } = await loadRankingsContext(brand.id);
      const totalChecks = rankings.length;
      const cited = toCitedArr(rankings);
      const citedCount = cited.length;
      const citeRate = totalChecks > 0 ? citedCount / totalChecks : 0;

      const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
      const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
      const rankFactor = avgRank !== null ? Math.max(0, 1 - (avgRank - 1) / 10) : 1;

      const score = clamp(Math.round(100 * citeRate * rankFactor), 0, 100);
      const label: "Weak" | "Moderate" | "Strong" =
        score >= 60 ? "Strong" : score >= 30 ? "Moderate" : "Weak";

      res.json({
        success: true,
        data: {
          score,
          label,
          citeRatePct: Math.round(citeRate * 100),
          avgRank: avgRank === null ? null : Math.round(avgRank * 10) / 10,
          totalChecks,
          citedCount,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to load citation health");
    }
  });

  // ==========================================================================
  // GET /api/dashboard/citation-trend/:brandId
  // Weekly citation-rate buckets over the last 8 weeks, computed directly
  // from geo_rankings. Replaces the old metrics_history-powered "Score
  // History" chart which depended on snapshots that are rarely populated.
  // ==========================================================================
  app.get("/api/dashboard/citation-trend/:brandId", async (req, res) => {
    try {
      const brand = await requireOwnedBrand(req);
      if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

      const WEEKS = 8;
      const since = new Date(Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000);
      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      const promptIds = prompts.map((p) => p.id);
      const rankings =
        promptIds.length > 0 ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since) : [];

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
  });
}
