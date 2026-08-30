// Analytics routes for crawler permissions, GEO analytics, sentiment, and opportunities.
//
// Extracted from server/routes.ts as part of the per-domain split.
// The original monolith now only mounts this module via setupAnalyticsRoutes.
//
// Business logic lives in server/services/crawlerPermissions.ts,
// server/services/geoAnalytics.ts, and server/services/geoOpportunities.ts.
// Each handler below only parses and validates input, enforces ownership,
// calls one service function, and shapes the response (B7-14 service-layer
// split).
//
// Includes:
//   POST /api/check-crawler-permissions    - robots.txt-based AI crawler audit
//   GET  /api/geo-analytics/:brandId       - SoV + AI visibility + sentiment rollup
//   POST /api/analyze-sentiment            - OpenAI sentiment classifier
//   POST /api/geo-analytics/:brandId/snapshot - persist a visibility snapshot
//   GET  /api/geo-analytics/:brandId/history  - snapshot history
//   GET  /api/geo-opportunities/:brandId   - brand-specific opportunity finder
//   GET  /api/geo-opportunities            - industry-generic opportunity finder

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser } from "../lib/ownership";
import { DisallowedUrlError } from "../lib/crawlerAccess";
import { checkCrawlerPermissions, InvalidUrlFormatError } from "../services/crawlerPermissions";
import {
  computeGeoAnalytics,
  recordVisibilitySnapshot,
  getVisibilityHistory,
  analyzeSentimentText,
  SentimentUnavailableError,
} from "../services/geoAnalytics";
import {
  computeGeoOpportunitiesForBrand,
  computeGenericGeoOpportunities,
} from "../services/geoOpportunities";
import {
  aiLimitMiddleware,
  sendError,
  MAX_CONTENT_LENGTH,
  asyncHandler,
} from "../lib/routesShared";

import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
export function setupAnalyticsRoutes(app: Express): void {
  // ========== AI CRAWLER PERMISSION CHECKER ==========

  // Check AI crawler permissions for a URL - SSRF-guarded + rate-limited.
  app.post(
    "/api/check-crawler-permissions",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      requireUser(req);
      const { url } = req.body ?? {};

      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      try {
        const data = await checkCrawlerPermissions(url);
        res.json({ success: true, data });
      } catch (error) {
        if (error instanceof InvalidUrlFormatError) {
          return res.status(400).json({ success: false, error: "Invalid URL format" });
        }
        if (error instanceof DisallowedUrlError) {
          return res.status(400).json({ success: false, error: "This URL is not allowed" });
        }
        logger.error({ err: error }, "Crawler check error");
        captureAndFlush(error, { tags: { source: "analytics.ts:539" } });
        res.status(500).json({ success: false, error: "Failed to check crawler permissions" });
      }
    }),
  );

  // ========== GEO ANALYTICS (Share of Voice, AI Visibility Score, Sentiment) ==========

  // Get comprehensive GEO analytics for a brand - :brandId is ownership-
  // checked via app.param before this handler runs.
  app.get(
    "/api/geo-analytics/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        // The optional ?since=<ISO> filters rankings to a fresh
        // citation run's window. Without this, every all-time ranking
        // counts during a fresh run, so the new run's incoming numbers
        // are statistically dwarfed by months of history. When the param
        // is missing/malformed we fall back to all-time (legacy behavior).
        // The client sends `since=all` when there is no active
        // run, give me the all-time view." Treat it the same as missing.
        const sinceRaw = typeof req.query.since === "string" ? req.query.since : null;
        const sinceDate = sinceRaw && sinceRaw !== "all" ? new Date(sinceRaw) : null;
        const sinceFilter = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : undefined;

        const data = await computeGeoAnalytics(brand, sinceFilter);

        res.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.error({ err: error }, "GEO analytics error");
        captureAndFlush(error, { tags: { source: "analytics.ts:790" } });
        res.status(500).json({ success: false, error: "Failed to fetch GEO analytics" });
      }
    }),
  );

  // Analyze sentiment using OpenAI
  app.post(
    "/api/analyze-sentiment",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        requireUser(req);
        const { text, context } = req.body ?? {};

        if (!text || typeof text !== "string") {
          return res.status(400).json({ success: false, error: "Text is required" });
        }
        if (text.length > MAX_CONTENT_LENGTH) {
          return res
            .status(413)
            .json({ success: false, error: `Text exceeds ${MAX_CONTENT_LENGTH} characters` });
        }
        const contextStr = typeof context === "string" ? context.slice(0, 500) : "";

        const result = await analyzeSentimentText(text, contextStr);

        res.json({ success: true, data: result });
      } catch (error) {
        if (error instanceof SentimentUnavailableError) {
          return res.status(503).json({
            success: false,
            error: error.message,
            message: "Please contact support to enable sentiment analysis.",
          });
        }
        sendError(res, error, "Failed to analyze sentiment");
      }
    }),
  );

  // Record visibility snapshot for tracking over time
  app.post(
    "/api/geo-analytics/:brandId/snapshot",
    asyncHandler(async (req, res) => {
      try {
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        const snapshot = await recordVisibilitySnapshot(brand.id, req.body);

        res.json({ success: true, data: snapshot });
      } catch (error) {
        logger.error({ err: error }, "Snapshot error");
        captureAndFlush(error, { tags: { source: "analytics.ts:1087" } });
        res.status(500).json({ success: false, error: "Failed to create snapshot" });
      }
    }),
  );

  // Get visibility history for a brand
  app.get(
    "/api/geo-analytics/:brandId/history",
    asyncHandler(async (req, res) => {
      try {
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        const limit = parseInt(req.query.limit as string) || 30;
        const snapshots = await getVisibilityHistory(brand.id, limit);

        res.json({
          success: true,
          data: {
            brand: { id: brand.id, name: brand.name },
            snapshots,
          },
        });
      } catch (error) {
        logger.error({ err: error }, "History error");
        captureAndFlush(error, { tags: { source: "analytics.ts:1111" } });
        res.status(500).json({ success: false, error: "Failed to fetch history" });
      }
    }),
  );

  // ========== GEO OPPORTUNITY FINDER ==========

  // Get GEO opportunities for a brand
  app.get(
    "/api/geo-opportunities/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        const data = await computeGeoOpportunitiesForBrand(brand);

        res.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.error({ err: error }, "GEO opportunities error");
        captureAndFlush(error, { tags: { source: "analytics.ts:1505" } });
        res.status(500).json({ success: false, error: "Failed to generate opportunities" });
      }
    }),
  );

  // Get generic GEO opportunities (no brand)
  app.get(
    "/api/geo-opportunities",
    asyncHandler(async (req, res) => {
      try {
        const { industry = "default" } = req.query;
        const data = computeGenericGeoOpportunities(industry as string);

        res.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.error({ err: error }, "GEO opportunities error");
        captureAndFlush(error, { tags: { source: "analytics.ts:1542" } });
        res.status(500).json({ success: false, error: "Failed to generate opportunities" });
      }
    }),
  );
}
