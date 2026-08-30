// Dashboard aggregate endpoints (Track 12 - AI Visibility Report redesign).
//
// Thin read-only endpoints that assemble the hero/rankings/gap-matrix/
// entity-strength views from existing Phase-1 tables. No new schema.
//
// Included:
//   GET /api/dashboard/hero/:brandId            - hero row numbers
//   GET /api/dashboard/rankings/:brandId        - per-platform rollup + snippets
//   GET /api/dashboard/gap-matrix/:brandId      - competitor × query-type cells
//
// Business logic lives in server/services/dashboard*.ts (B7-12 extraction).
// Handlers here only parse/validate input, enforce ownership, call one
// service function, and shape the response.

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { aiLimitMiddleware } from "../lib/routesShared";
import { listSiteHealthScanHistory } from "../lib/siteHealthHistory";
import {
  getDashboardHero,
  getDashboardRankings,
  getDashboardCitedUrls,
  getDashboardGapMatrix,
  getDashboardCitationTrend,
} from "../services/dashboardVisibility";
import { getDashboardRecommendations } from "../services/dashboardRecommendations";
import {
  getSiteHealthDashboard,
  getSiteHealthPages,
  getSiteHealthFindingStatuses,
  setSiteHealthFindingStatus,
  clearSiteHealthFindingStatus,
  getSiteHealthContentFindings,
  warmSiteHealth,
  pageSeverity,
} from "../services/dashboardSiteHealth";
import { scoreSiteHealth } from "../lib/scoreSiteHealth";
import {
  getBrandPerception,
  runBrandPerceptionScoring,
  getPerceptionProbes,
  startOrGetActivePerceptionProbeRun,
  advanceOwnedPerceptionProbeRun,
  PERCEPTION_COOLDOWN_MS,
} from "../services/dashboardPerception";

// Re-exported for backward compatibility with existing imports/tests.
export { scoreSiteHealth, warmSiteHealth, pageSeverity, PERCEPTION_COOLDOWN_MS };

async function requireOwnedBrand(req: any) {
  const user = requireUser(req);
  const brand = await storage.getBrandById(req.params.brandId);
  if (!brand || brand.userId !== user.id) return null;
  return brand;
}

// Parse the optional ?since=<ISO> query parameter. Return null
// when missing or malformed - the loader then falls back to the default
// 30-day window. Defensive against junk input (clients only ever pass
// what useActiveCitationRuns surfaced, but we guard anyway).
function parseSinceQuery(req: { query: Record<string, unknown> }): Date | null {
  const raw = typeof req.query.since === "string" ? req.query.since : null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
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

        const data = await getDashboardHero(brand, parseSinceQuery(req));
        res.json({ success: true, data });
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

        const data = await getDashboardRankings(brand, parseSinceQuery(req));
        res.json({ success: true, data });
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

        const data = await getDashboardCitedUrls(brand, parseSinceQuery(req));
        res.json({ success: true, data });
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

        const data = await getDashboardGapMatrix(brand, parseSinceQuery(req));
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load gap matrix");
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

        const data = await getDashboardCitationTrend(brand.id);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load citation trend");
      }
    }),
  );

  // ==========================================================================
  // GET /api/brands/:brandId/recommendations
  // Phase 4: deterministic "do this next" rules engine.
  // ==========================================================================
  app.get(
    "/api/brands/:brandId/recommendations",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const user = requireUser(req);
        const recommendations = await getDashboardRecommendations(user, brand);
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

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId
  // Robots.txt-based AI crawler access score + latest fact-scrape run stats.
  // Robots.txt evaluation is cached in-module per brandId (6h TTL) so this
  // never hits the network on every dashboard load. Deliberately NOT behind
  // aiLimitMiddleware - it doesn't call any LLM and shouldn't consume quota.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const data = await getSiteHealthDashboard(brand);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load site health");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId/pages
  // Per-page rows of the LATEST completed scrape run, for the Site Health
  // detail page's issue lists. Read-only, no LLM, capped at 200 rows.
  // Empty array (never 404/500) when the brand has no crawl run yet.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId/pages",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const data = await getSiteHealthPages(brand.id);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load site health pages");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId/history
  // Newest-first scan history for the History tab (trend chart + scan log).
  // Read-only, no LLM. Empty array (never 404/500) until the brand's first
  // scrape run completes AFTER this endpoint shipped - existing brands will
  // see an empty trend until their next scan, which is expected: there is no
  // way to retroactively know what an untracked past score was.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId/history",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const rows = await listSiteHealthScanHistory(brand.id, 50);
        res.json({
          success: true,
          data: {
            scans: rows.map((r) => ({
              id: r.id,
              runId: r.runId,
              score: r.score,
              pagesCrawled: r.pagesCrawled,
              pagesFailed: r.pagesFailed,
              issues: {
                critical: r.issuesCritical,
                high: r.issuesHigh,
                medium: r.issuesMedium,
                low: r.issuesLow,
              },
              createdAt: r.createdAt.toISOString(),
            })),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load site health history");
      }
    }),
  );

  // ==========================================================================
  // Site health finding status - "Mark in progress" / "Ignore" / "Mark fixed"
  // on the finding drawer. Keyed by the finding's stable check-type id, not a
  // scan run, so status survives a rescan. A finding never touched has no
  // row and reads as "untouched" - GET never fabricates a default.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId/finding-status",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const rows = await getSiteHealthFindingStatuses(brand.id);

        res.json({
          success: true,
          data: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
        });
      } catch (error) {
        sendError(res, error, "Failed to load finding status");
      }
    }),
  );

  const FINDING_STATUS_VALUES = ["in_progress", "ignored", "fixed"] as const;

  app.put(
    "/api/dashboard/site-health/:brandId/finding-status/:findingId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { findingId } = req.params;
        const status = req.body?.status;
        if (!FINDING_STATUS_VALUES.includes(status)) {
          return res.status(400).json({
            success: false,
            error: `status must be one of: ${FINDING_STATUS_VALUES.join(", ")}`,
          });
        }

        const userId = requireUser(req).id;
        await setSiteHealthFindingStatus(brand.id, findingId, status, userId);

        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to update finding status");
      }
    }),
  );

  // "Untouched" has no row by definition - clearing status means deleting it,
  // not writing a third state.
  app.delete(
    "/api/dashboard/site-health/:brandId/finding-status/:findingId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { findingId } = req.params;
        await clearSiteHealthFindingStatus(brand.id, findingId);

        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to clear finding status");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId/content-findings
  // Per-page CONTENT findings (meta tags, OG tags, heading structure,
  // readability, structured answer formats, FAQ content, content density).
  // These require re-fetching each page's HTML (excerpt is never persisted -
  // brand_fact_scrape_pages.excerpt is a dead column), so this is a SIBLING
  // endpoint, never inlined into the hot /site-health path or its 4s
  // deadline. Cached per brand with a 6h TTL + in-flight coalescing.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId/content-findings",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const data = await getSiteHealthContentFindings(brand.id);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load site health content findings");
      }
    }),
  );

  // ==========================================================================
  // Brand perception scoring - five axes (trust/quality/value/market/
  // innovation) judged from what AI models actually said about the brand
  // (server/lib/perceptionScorer.ts). Runs are persisted so the dashboard
  // reads the newest one instead of paying an LLM call on every render.
  // ==========================================================================

  // GET /api/dashboard/perception/:brandId - read only, no LLM, cheap.
  app.get(
    "/api/dashboard/perception/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const data = await getBrandPerception(brand.id);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load brand perception");
      }
    }),
  );

  // POST /api/dashboard/perception/:brandId/run - computes and persists one
  // run. Behind aiLimitMiddleware because it calls an LLM (unlike the
  // read-only GET above and unlike site-health).
  app.post(
    "/api/dashboard/perception/:brandId/run",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const outcome = await runBrandPerceptionScoring(brand);
        if (outcome.kind === "cooldown") {
          res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
          return res.status(429).json({
            success: false,
            error: "Perception was scored recently. Try again later.",
            retryAfterSeconds: outcome.retryAfterSeconds,
          });
        }
        res.json({ success: true, data: outcome.data });
      } catch (error) {
        sendError(res, error, "Failed to run brand perception scoring");
      }
    }),
  );

  // ── Perception probes (migration 0116) ──────────────────────────────────
  // The endpoints above score perception INFERRED from citation answers. These
  // three drive the pipeline that ASKS each engine directly. Same kickoff /
  // advance / read shape as citation runs, because a full pass is 30 grounded
  // calls and cannot complete inside one request.

  // GET - latest probe run plus its matrix. Read only, no LLM.
  app.get(
    "/api/dashboard/perception/probes/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const data = await getPerceptionProbes(brand.id);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load perception probes");
      }
    }),
  );

  // POST - create a run and its pending probe rows, then return immediately.
  app.post(
    "/api/dashboard/perception/probes/:brandId/run",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const data = await startOrGetActivePerceptionProbeRun(brand);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to start a perception probe run");
      }
    }),
  );

  // POST - do as much of the run as fits in one slice. Polled by the client,
  // and backed up by cron so a closed tab does not strand a run.
  app.post(
    "/api/dashboard/perception/probes/:brandId/advance",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const runId = String(req.body?.runId ?? "");
        if (!runId) {
          return res.status(400).json({ success: false, error: "runId is required" });
        }

        const result = await advanceOwnedPerceptionProbeRun(brand, runId);
        if (result === null)
          return res.status(404).json({ success: false, error: "Run not found" });
        res.json({ success: true, data: result });
      } catch (error) {
        sendError(res, error, "Failed to advance the perception probe run");
      }
    }),
  );
}
