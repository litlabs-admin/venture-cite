// Competitors + misc scans + robots/sitemap (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// Publication-intelligence routes were removed (Tier 2B orphan cleanup).
// Includes:
//   POST /api/competitors/discover/:brandId   - manual competitor discovery
//   GET  /robots.txt                          - AI crawler allow-list
//   GET  /sitemap.xml
//   GET  /api/competitors/leaderboard
//   GET  /api/competitors
//   POST /api/competitors
//   GET  /api/competitors/:id
//   DELETE /api/competitors/:id
//   GET  /api/competitors/:id/latest-citations

import type { Express } from "express";
import { storage } from "../storage";
import { insertCompetitorSchema } from "@shared/schema";
import { requireUser, requireBrand, requireCompetitor, getUserBrandIds } from "../lib/ownership";
import { aiLimitMiddleware, sendError, asyncHandler } from "../lib/routesShared";

export function setupPublicationsRoutes(app: Express): void {
  // Manual triggers for weekly automations - useful for dev/testing and for
  // a "Run now" button on the UI. All require ownership.
  app.post(
    "/api/competitors/discover/:brandId",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const { discoverCompetitors } = await import("../lib/competitorDiscovery");
        const inserted = await discoverCompetitors(brand.id);
        const competitors = await storage.getCompetitors(brand.id);
        res.json({ success: true, data: { inserted, competitors } });
      } catch (error) {
        sendError(res, error, "Failed to discover competitors");
      }
    }),
  );

  // `POST /api/brand-facts/scrape/:brandId` removed in Spec 2 §4.10 - replaced
  // by the slice-resumable `POST /api/brand-fact-sheet/runs` (server/routes/factSheet.ts).
  // Plan 2.4 rewires the frontend Re-scrape button to the new endpoint.

  // Mention routes moved to server/routes/mentions.ts (mentions rebuild)

  // /robots.txt and /sitemap.xml are NOT served here.
  //
  // They used to be, generated per-request from the Host header. That was
  // dead code in production: Nitro serves client/public/ directly, and this
  // Express app is only bridged at /api/*, /webhooks/* and /health, so the
  // static files always won. The handlers only ever ran under `npm run dev`,
  // which meant dev and production served DIFFERENT robots.txt and
  // sitemap.xml - the dev copies also still listed routes that no longer
  // exist (/geo-rankings, /revenue-analytics, /publications, /agent,
  // /outreach, /ai-traffic, /analytics-integrations).
  //
  // client/public/{robots.txt,sitemap.xml} are now the single source of
  // truth, with canonical production URLs - host-derived URLs made preview
  // deployments advertise their own hostnames to crawlers.

  // ========== COMPETITOR TRACKING API ROUTES ==========

  // Competitor leaderboard - requires a brandId owned by the caller.
  // Optional ?windowDays=30 controls the time window (default 30).
  app.get(
    "/api/competitors/leaderboard",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brandId = req.query.brandId as string | undefined;
        const windowDays = Number(req.query.windowDays);
        const since =
          Number.isFinite(windowDays) && windowDays > 0 && windowDays <= 365
            ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
            : undefined;
        if (brandId) {
          await requireBrand(brandId, user.id);
          const [leaderboard, allCompetitors] = await Promise.all([
            storage.getCompetitorLeaderboard(brandId, { since }),
            storage.getCompetitors(brandId),
          ]);
          // withActivity = competitors (not brand rows) with ≥1 cited row in
          // the window. Exposed alongside totalTracked so the UI can render
          // "15 tracked · 14 with activity" instead of a single misleading
          // count. See Wave B.2 in the plan.
          const withActivity = leaderboard.filter((r) => !r.isOwn && r.totalCitations > 0).length;
          return res.json({
            success: true,
            data: leaderboard,
            meta: { totalTracked: allCompetitors.length, withActivity },
          });
        }
        const brands = await storage.getBrandsByUserId(user.id);
        const aggregated: any[] = [];
        let totalTrackedAll = 0;
        let withActivityAll = 0;
        for (const brand of brands) {
          const [leaderboard, allCompetitors] = await Promise.all([
            storage.getCompetitorLeaderboard(brand.id, { since }),
            storage.getCompetitors(brand.id),
          ]);
          aggregated.push(...leaderboard);
          totalTrackedAll += allCompetitors.length;
          withActivityAll += leaderboard.filter((r) => !r.isOwn && r.totalCitations > 0).length;
        }
        res.json({
          success: true,
          data: aggregated,
          meta: { totalTracked: totalTrackedAll, withActivity: withActivityAll },
        });
      } catch (error) {
        sendError(res, error, "Failed to fetch leaderboard");
      }
    }),
  );

  // List competitors - body/query brandId is checked by enforceBrandOwnership.
  // When no brandId, restrict to brands the user owns.
  app.get(
    "/api/competitors",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brandId = req.query.brandId as string | undefined;
        if (typeof brandId === "string" && brandId) {
          await requireBrand(brandId, user.id);
          const competitors = await storage.getCompetitors(brandId);
          return res.json({ success: true, data: competitors });
        }
        const userBrandIds = await getUserBrandIds(user.id);
        const all = await storage.getCompetitors();
        const competitors = all.filter((c: any) => c.brandId && userBrandIds.has(c.brandId));
        res.json({ success: true, data: competitors });
      } catch (error) {
        sendError(res, error, "Failed to fetch competitors");
      }
    }),
  );

  // Create a competitor - brandId must belong to caller.
  app.post(
    "/api/competitors",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const parsed = insertCompetitorSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid competitor data", details: parsed.error });
        }
        const name = (parsed.data.name ?? "").trim();
        const domain = (parsed.data.domain ?? "").trim();
        if (name.length < 1 || name.length > 120) {
          return res.status(400).json({ success: false, error: "name must be 1-120 characters" });
        }
        if (domain.length > 255) {
          return res.status(400).json({ success: false, error: "domain too long" });
        }
        if (!parsed.data.brandId) {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(parsed.data.brandId, user.id);
        const competitor = await storage.createCompetitor({
          ...parsed.data,
          name,
          domain,
          discoveredBy: "manual",
          // A competitor the user adds by hand is, by definition, part of
          // their curated core set - not the broader discovered pool. Relevance
          // is a discovery-only signal, so a client-supplied score is dropped.
          tier: "core",
          relevanceScore: null,
        } as any);
        res.json({ success: true, data: competitor });
      } catch (error) {
        sendError(res, error, "Failed to create competitor");
      }
    }),
  );

  // Partial update - used by the edit dialog on the competitors page.
  // Whitelist of editable fields lives here; any other body keys are ignored.
  app.patch(
    "/api/competitors/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireCompetitor(req.params.id, user.id);

        const body = req.body ?? {};
        const patch: Record<string, unknown> = {};

        if (typeof body.name === "string") {
          const name = body.name.trim();
          if (name.length < 1 || name.length > 120) {
            return res.status(400).json({ success: false, error: "name must be 1-120 characters" });
          }
          patch.name = name;
        }
        if (typeof body.domain === "string") {
          const domain = body.domain.trim();
          if (domain.length > 255) {
            return res.status(400).json({ success: false, error: "domain too long" });
          }
          patch.domain = domain;
        }
        if (typeof body.industry === "string") {
          patch.industry = body.industry.trim().slice(0, 200);
        }
        // tier: promote/demote between the curated core set and the
        // discovered pool. Only the two known values are accepted.
        if (typeof body.tier === "string") {
          if (body.tier !== "core" && body.tier !== "discovered") {
            return res
              .status(400)
              .json({ success: false, error: "tier must be 'core' or 'discovered'" });
          }
          patch.tier = body.tier;
        }
        if (typeof body.description === "string") {
          patch.description = body.description.trim().slice(0, 2000);
        }
        // nameVariations: accept either an array of strings or a comma-separated
        // string (the UI sends whichever is easier to wire).
        if (body.nameVariations !== undefined) {
          let variations: string[] = [];
          if (Array.isArray(body.nameVariations)) {
            variations = (body.nameVariations as unknown[])
              .filter((v): v is string => typeof v === "string")
              .map((v: string) => v.trim())
              .filter((v: string) => v.length > 0);
          } else if (typeof body.nameVariations === "string") {
            variations = (body.nameVariations as string)
              .split(",")
              .map((v: string) => v.trim())
              .filter((v: string) => v.length > 0);
          }
          patch.nameVariations = variations.slice(0, 50);
        }

        if (Object.keys(patch).length === 0) {
          return res.status(400).json({ success: false, error: "no editable fields provided" });
        }

        const updated = await storage.updateCompetitor(req.params.id, patch as any);
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to update competitor");
      }
    }),
  );

  // Get competitor by id - ownership via brand.
  app.get(
    "/api/competitors/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const competitor = await requireCompetitor(req.params.id, user.id);
        res.json({ success: true, data: competitor });
      } catch (error) {
        sendError(res, error, "Failed to fetch competitor");
      }
    }),
  );

  // Delete competitor - soft-delete. The row stays in the DB so historical
  // leaderboard snapshots remain meaningful; the cron can still re-discover
  // the competitor unless the user also calls /ignore.
  app.delete(
    "/api/competitors/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireCompetitor(req.params.id, user.id);
        const deleted = await storage.deleteCompetitor(req.params.id);
        if (!deleted) {
          return res.status(404).json({ success: false, error: "Competitor not found" });
        }
        res.json({ success: true, message: "Competitor deleted" });
      } catch (error) {
        sendError(res, error, "Failed to delete competitor");
      }
    }),
  );

  // Mark a competitor as a permanent false-positive. Soft-deletes the row
  // AND sets is_ignored=1 so cron + mining paths skip it on rediscovery.
  app.post(
    "/api/competitors/:id/ignore",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireCompetitor(req.params.id, user.id);
        const ok = await storage.ignoreCompetitor(req.params.id);
        if (!ok) {
          return res.status(404).json({ success: false, error: "Competitor not found" });
        }
        res.json({ success: true, message: "Competitor ignored" });
      } catch (error) {
        sendError(res, error, "Failed to ignore competitor");
      }
    }),
  );

  // Get latest citations for a competitor - ownership required.
  app.get(
    "/api/competitors/:id/latest-citations",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireCompetitor(req.params.id, user.id);
        const latestCitations = await storage.getCompetitorLatestCitations(req.params.id);
        res.json({ success: true, data: latestCitations });
      } catch (error) {
        sendError(res, error, "Failed to fetch latest citations");
      }
    }),
  );
}
