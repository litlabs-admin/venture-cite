// Publications + competitors + misc scans (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// Includes:
//   POST /api/competitors/discover/:brandId   — manual competitor discovery
//   POST /api/brand-facts/scrape/:brandId     — manual fact-sheet scrape
//   POST /api/brand-mentions/scan/:brandId    — manual mention scan
//   GET  /robots.txt                          — AI crawler allow-list
//   GET  /api/publications/metrics/:industry
//   GET  /api/publications/top/:industry
//   GET  /api/publications/references
//   POST /api/publications/reference
//   POST /api/publications/metrics
//   GET  /api/competitors/leaderboard
//   GET  /api/competitors
//   POST /api/competitors
//   GET  /api/competitors/:id
//   DELETE /api/competitors/:id
//   POST /api/competitors/:id/snapshots
//   GET  /api/competitors/:id/snapshots
//   GET  /api/competitors/:id/latest-citations

import type { Express } from "express";
import { storage } from "../storage";
import { insertCompetitorSchema, insertCompetitorCitationSnapshotSchema } from "@shared/schema";
import { requireUser, requireBrand, requireCompetitor, getUserBrandIds } from "../lib/ownership";
import { aiLimitMiddleware, sendError } from "../lib/routesShared";

export function setupPublicationsRoutes(app: Express): void {
  // Manual triggers for weekly automations — useful for dev/testing and for
  // a "Run now" button on the UI. All require ownership.
  app.post("/api/competitors/discover/:brandId", aiLimitMiddleware, async (req, res) => {
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
  });

  app.post("/api/brand-facts/scrape/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const { scrapeBrandFacts } = await import("../lib/factExtractor");
      const inserted = await scrapeBrandFacts(brand.id);
      const facts = await storage.getBrandFacts(brand.id);
      res.json({ success: true, data: { inserted, facts } });
    } catch (error) {
      sendError(res, error, "Failed to scrape brand facts");
    }
  });

  app.post("/api/brand-mentions/scan/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const { scanBrandMentions } = await import("../lib/mentionScanner");
      const inserted = await scanBrandMentions(brand.id);
      const mentions = await storage.getBrandMentions(brand.id);
      res.json({ success: true, data: { inserted, mentions } });
    } catch (error) {
      sendError(res, error, "Failed to scan brand mentions");
    }
  });

  // robots.txt — public pages are crawlable (landing, pricing, privacy,
  // article permalinks), authenticated app routes are explicitly blocked so
  // they don't leak into search results. All AI crawlers (GPTBot, Claude,
  // Perplexity, etc.) get the same allow-list — no preferential treatment
  // beyond the baseline user-agent rules.
  app.get("/robots.txt", async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const robotsTxt = `User-agent: *
Allow: /
Allow: /pricing
Allow: /privacy
Allow: /article/
Disallow: /api/
Disallow: /dashboard
Disallow: /content
Disallow: /citations
Disallow: /articles
Disallow: /brands
Disallow: /keyword-research
Disallow: /ai-visibility
Disallow: /ai-intelligence
Disallow: /geo-rankings
Disallow: /geo-analytics
Disallow: /geo-tools
Disallow: /geo-signals
Disallow: /revenue-analytics
Disallow: /publications
Disallow: /competitors
Disallow: /crawler-check
Disallow: /opportunities
Disallow: /agent
Disallow: /outreach
Disallow: /ai-traffic
Disallow: /analytics-integrations
Disallow: /faq-manager
Disallow: /client-reports
Disallow: /brand-fact-sheet
Disallow: /community
Disallow: /settings
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password

Sitemap: ${baseUrl}/sitemap.xml`;

    res.header("Content-Type", "text/plain");
    res.header("Cache-Control", "public, max-age=3600");
    res.send(robotsTxt);
  });

  // Sitemap.xml — public pages only. Articles are no longer published on
  // VentureCite-owned URLs (slug column was dropped in Wave 7). Users link
  // to their own externally-hosted articles via `articles.externalUrl`,
  // which is not our concern to advertise.
  app.get("/sitemap.xml", async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const now = new Date().toISOString();

    const staticPaths = ["/", "/pricing", "/privacy"];
    const articleEntries = "";

    const staticEntries = staticPaths
      .map((p) => `  <url>\n    <loc>${baseUrl}${p}</loc>\n    <lastmod>${now}</lastmod>\n  </url>`)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${articleEntries}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // ========== PUBLICATION INTELLIGENCE API ROUTES ==========

  // Get publication metrics for industry
  app.get("/api/publications/metrics/:industry", async (req, res) => {
    try {
      const { industry } = req.params;
      const metrics = await storage.getPublicationMetrics(industry);

      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch publication metrics" });
    }
  });

  // Get top publications by industry
  app.get("/api/publications/top/:industry", async (req, res) => {
    try {
      const { industry } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const topPublications = await storage.getTopPublicationsByIndustry(industry, limit);

      res.json({ success: true, data: topPublications });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch top publications" });
    }
  });

  // Get all publication references
  app.get("/api/publications/references", async (req, res) => {
    try {
      const { industry, aiPlatform } = req.query;

      const filters = {
        industry: industry as string | undefined,
        aiPlatform: aiPlatform as string | undefined,
      };

      const references = await storage.getPublicationReferences(filters);

      res.json({ success: true, data: references });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch publication references" });
    }
  });

  // Create or update publication reference (from GEO ranking checks)
  app.post("/api/publications/reference", async (req, res) => {
    try {
      const reference = await storage.createPublicationReference(req.body);

      res.json({ success: true, data: reference });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to create publication reference" });
    }
  });

  // Update publication metrics (aggregation endpoint)
  app.post("/api/publications/metrics", async (req, res) => {
    try {
      const metric = await storage.upsertPublicationMetric(req.body);

      res.json({ success: true, data: metric });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to update publication metrics" });
    }
  });

  // ========== COMPETITOR TRACKING API ROUTES ==========

  // Competitor leaderboard — requires a brandId owned by the caller.
  // Optional ?windowDays=30 controls the time window (default 30).
  app.get("/api/competitors/leaderboard", async (req, res) => {
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
  });

  // List competitors — body/query brandId is checked by enforceBrandOwnership.
  // When no brandId, restrict to brands the user owns.
  app.get("/api/competitors", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandId = req.query.brandId as string | undefined;
      if (brandId) {
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
  });

  // Create a competitor — brandId must belong to caller.
  app.post("/api/competitors", async (req, res) => {
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
      } as any);
      res.json({ success: true, data: competitor });
    } catch (error) {
      sendError(res, error, "Failed to create competitor");
    }
  });

  // Partial update — used by the edit dialog on the competitors page.
  // Whitelist of editable fields lives here; any other body keys are ignored.
  app.patch("/api/competitors/:id", async (req, res) => {
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
  });

  // Get competitor by id — ownership via brand.
  app.get("/api/competitors/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const competitor = await requireCompetitor(req.params.id, user.id);
      res.json({ success: true, data: competitor });
    } catch (error) {
      sendError(res, error, "Failed to fetch competitor");
    }
  });

  // Delete competitor — soft-delete. The row stays in the DB so historical
  // leaderboard snapshots remain meaningful; the cron can still re-discover
  // the competitor unless the user also calls /ignore.
  app.delete("/api/competitors/:id", async (req, res) => {
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
  });

  // Mark a competitor as a permanent false-positive. Soft-deletes the row
  // AND sets is_ignored=1 so cron + mining paths skip it on rediscovery.
  app.post("/api/competitors/:id/ignore", async (req, res) => {
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
  });

  // Add citation snapshot for a competitor — ownership required.
  app.post("/api/competitors/:id/snapshots", async (req, res) => {
    try {
      const user = requireUser(req);
      const competitor = await requireCompetitor(req.params.id, user.id);
      const competitorId = competitor.id;

      const snapshotData = { ...req.body, competitorId };
      const parsed = insertCompetitorCitationSnapshotSchema.safeParse(snapshotData);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid snapshot data", details: parsed.error });
      }

      const snapshot = await storage.createCompetitorCitationSnapshot(parsed.data);
      res.json({ success: true, data: snapshot });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to create citation snapshot" });
    }
  });

  // Get citation snapshots for a competitor — ownership required.
  app.get("/api/competitors/:id/snapshots", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCompetitor(req.params.id, user.id);
      const snapshots = await storage.getCompetitorCitationSnapshots(req.params.id);
      res.json({ success: true, data: snapshots });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation snapshots");
    }
  });

  // Get latest citations for a competitor — ownership required.
  app.get("/api/competitors/:id/latest-citations", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCompetitor(req.params.id, user.id);
      const latestCitations = await storage.getCompetitorLatestCitations(req.params.id);
      res.json({ success: true, data: latestCitations });
    } catch (error) {
      sendError(res, error, "Failed to fetch latest citations");
    }
  });
}
