// AI intelligence: mentions, hallucinations, citation quality, brand facts, portfolio, sources, traffic, prompt tests, metrics, alerts (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split. The
// original monolith now only mounts this module via setupIntelligenceRoutes.

import type { Express } from "express";
import { storage } from "../storage";
import {
  requireUser,
  requireBrand,
  requireHallucination,
  requireBrandFact,
  requireCitationQuality,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { z } from "zod";
import { assertTransition, InvalidStateTransitionError } from "../lib/statusTransitions";

// (The Slack-webhook validator + SLACK_WEBHOOK_RE constant lived here
// until they were removed alongside the legacy notification endpoint.
// Slack delivery now goes through ./lib/slackNotify, which handles its
// own URL allow-listing.)

// Mention routes moved to server/routes/mentions.ts (mentions rebuild)

export function setupIntelligenceRoutes(app: Express): void {
  // ================== CITATION QUALITY ==================

  const CITATION_QUALITY_WRITE_FIELDS = [
    "brandId",
    "articleId",
    "aiPlatform",
    "prompt",
    "citationUrl",
    "authorityScore",
    "relevanceScore",
    "recencyScore",
    "positionScore",
    "isPrimaryCitation",
    "totalQualityScore",
    "sourceType",
    "competingCitations",
    "metadata",
  ] as const;

  app.get(
    "/api/citation-quality",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId, aiPlatform, minScore } = req.query;
        if (brandId && typeof brandId === "string") {
          const qualities = await storage.getCitationQualities(brandId, {
            aiPlatform: aiPlatform as string,
            minScore: minScore ? parseInt(minScore as string) : undefined,
          });
          return res.json({ success: true, data: qualities });
        }
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getCitationQualities(undefined, {
          aiPlatform: aiPlatform as string,
          minScore: minScore ? parseInt(minScore as string) : undefined,
        });
        const qualities = all.filter((q: any) => q.brandId && brandIds.has(q.brandId));
        res.json({ success: true, data: qualities });
      } catch (error) {
        sendError(res, error, "Failed to fetch citation qualities");
      }
    }),
  );

  app.get(
    "/api/citation-quality/stats/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const stats = await storage.getCitationQualityStats(req.params.brandId);
        res.json({ success: true, data: stats });
      } catch (error) {
        sendError(res, error, "Failed to fetch citation quality stats");
      }
    }),
  );

  app.post(
    "/api/citation-quality",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, CITATION_QUALITY_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        const quality = await storage.createCitationQuality(body as any);
        res.json({ success: true, data: quality });
      } catch (error) {
        sendError(res, error, "Failed to create citation quality");
      }
    }),
  );

  app.patch(
    "/api/citation-quality/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireCitationQuality(req.params.id, user.id);
        const update = pickFields<any>(req.body, CITATION_QUALITY_WRITE_FIELDS);
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        const quality = await storage.updateCitationQuality(req.params.id, update as any);
        if (!quality)
          return res.status(404).json({ success: false, error: "Citation quality not found" });
        res.json({ success: true, data: quality });
      } catch (error) {
        sendError(res, error, "Failed to update citation quality");
      }
    }),
  );

  app.delete(
    "/api/citation-quality/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireCitationQuality(req.params.id, user.id);
        const deleted = await storage.deleteCitationQuality(req.params.id);
        if (!deleted)
          return res.status(404).json({ success: false, error: "Citation quality not found" });
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete citation quality");
      }
    }),
  );

  // ================== HALLUCINATION DETECTION ==================

  const HALLUCINATION_WRITE_FIELDS = [
    "brandId",
    "aiPlatform",
    "prompt",
    "claimedStatement",
    "actualFact",
    "hallucinationType",
    "severity",
    "category",
    "isResolved",
    "remediationSteps",
    "remediationStatus",
    "resolvedAt",
    "verifiedBy",
    "metadata",
  ] as const;

  app.get(
    "/api/hallucinations",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId, severity, isResolved } = req.query;
        const filters = {
          severity: severity as string,
          isResolved: isResolved === "true" ? true : isResolved === "false" ? false : undefined,
        };
        // brandId is now required. The previous fallback (global read + filter
        // by user's brandIds) was cheap to brute-force and could leak hallucinations
        // from brands whose IDs leaked elsewhere.
        if (!brandId || typeof brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId query param is required" });
        }
        await requireBrand(brandId, user.id);
        const hallucinations = await storage.getBrandHallucinations(brandId, filters);
        res.json({ success: true, data: hallucinations });
      } catch (error) {
        sendError(res, error, "Failed to fetch hallucinations");
      }
    }),
  );

  app.get(
    "/api/hallucinations/stats/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const stats = await storage.getHallucinationStats(req.params.brandId);
        res.json({ success: true, data: stats });
      } catch (error) {
        sendError(res, error, "Failed to fetch hallucination stats");
      }
    }),
  );

  app.post(
    "/api/hallucinations",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, HALLUCINATION_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        const hallucination = await storage.createBrandHallucination(body as any);
        res.json({ success: true, data: hallucination });
      } catch (error) {
        sendError(res, error, "Failed to create hallucination entry");
      }
    }),
  );

  // Strict Zod shape so arbitrary severity / remediationStatus strings
  // can't land in the DB via PATCH. Matches the CHECK constraint in
  // migration 0026.
  const hallucinationPatchSchema = z
    .object({
      brandId: z.string().optional(),
      aiPlatform: z.string().optional(),
      prompt: z.string().optional(),
      claimedStatement: z.string().optional(),
      actualFact: z.string().nullable().optional(),
      hallucinationType: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      category: z.string().nullable().optional(),
      isResolved: z.number().int().min(0).max(1).optional(),
      remediationSteps: z.array(z.string()).nullable().optional(),
      remediationStatus: z
        .enum(["pending", "in_progress", "resolved", "dismissed", "verified"])
        .optional(),
      resolvedAt: z.coerce.date().nullable().optional(),
      verifiedBy: z.string().nullable().optional(),
      metadata: z.any().optional(),
    })
    .strict();

  app.patch(
    "/api/hallucinations/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const existing = await requireHallucination(req.params.id, user.id);
        const parsed = hallucinationPatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid update", details: parsed.error.issues });
        }
        const update = parsed.data as Record<string, any>;
        if (update.brandId) await requireBrand(update.brandId, user.id);
        // Guard remediation_status transitions.
        if (update.remediationStatus && update.remediationStatus !== existing.remediationStatus) {
          assertTransition(
            "hallucination_remediation",
            existing.remediationStatus as string | null | undefined,
            update.remediationStatus,
          );
        }
        const hallucination = await storage.updateBrandHallucination(req.params.id, update as any);
        if (!hallucination)
          return res.status(404).json({ success: false, error: "Hallucination not found" });
        res.json({ success: true, data: hallucination });
      } catch (error) {
        if (error instanceof InvalidStateTransitionError) {
          return res.status(409).json({ success: false, error: error.message });
        }
        sendError(res, error, "Failed to update hallucination");
      }
    }),
  );

  app.post(
    "/api/hallucinations/:id/resolve",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const existing = await requireHallucination(req.params.id, user.id);
        // Idempotent only within legal transitions. Re-resolving a resolved
        // row returns 409 so the UI can show "already resolved".
        assertTransition(
          "hallucination_remediation",
          existing.remediationStatus as string | null | undefined,
          "resolved",
        );
        const hallucination = await storage.resolveBrandHallucination(req.params.id);
        if (!hallucination)
          return res.status(404).json({ success: false, error: "Hallucination not found" });
        res.json({ success: true, data: hallucination });
      } catch (error) {
        if (error instanceof InvalidStateTransitionError) {
          return res.status(409).json({ success: false, error: error.message });
        }
        sendError(res, error, "Failed to resolve hallucination");
      }
    }),
  );

  app.delete(
    "/api/hallucinations/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireHallucination(req.params.id, user.id);
        const deleted = await storage.deleteBrandHallucination(req.params.id);
        if (!deleted)
          return res.status(404).json({ success: false, error: "Hallucination not found" });
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete hallucination");
      }
    }),
  );

  // ================== BRAND FACT SHEET ==================

  // Get brand facts
  app.get(
    "/api/brand-facts/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const facts = await storage.getBrandFacts(req.params.brandId);
        res.json({ success: true, data: facts });
      } catch (error) {
        sendError(res, error, "Failed to fetch brand facts");
      }
    }),
  );

  const BRAND_FACT_WRITE_FIELDS = [
    "brandId",
    "domain",
    "subcategory",
    // Legacy alias: migration 0059 renamed fact_category -> subcategory.
    // Older clients / the manual "Add Fact" dialog still post factCategory;
    // normalizeFactBody remaps it so the NOT NULL subcategory column is set.
    "factCategory",
    "factKey",
    "factValue",
    "sourceUrl",
    "isActive",
    "metadata",
  ] as const;

  function normalizeFactBody(body: Record<string, any>): Record<string, any> {
    if (body.factCategory != null && body.subcategory == null) {
      body.subcategory = body.factCategory;
    }
    delete body.factCategory;
    return body;
  }

  app.post(
    "/api/brand-facts",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = normalizeFactBody(pickFields<any>(req.body, BRAND_FACT_WRITE_FIELDS));
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        if (!body.subcategory || typeof body.subcategory !== "string") {
          return res
            .status(400)
            .json({ success: false, error: "subcategory (or legacy factCategory) is required" });
        }
        await requireBrand(body.brandId, user.id);
        // Manually-entered facts are user-authoritative: tag them as
        // `user_manual` (highest source priority in getBrandFacts' dedup, where
        // the schema default "manual" is unranked and would lose to scraped
        // rows) and set userOverridden so later scrapes never clobber them.
        const fact = await storage.createBrandFact({
          ...body,
          source: "user_manual",
          userOverridden: true,
        } as any);
        res.json({ success: true, data: fact });
      } catch (error) {
        sendError(res, error, "Failed to create brand fact");
      }
    }),
  );

  app.patch(
    "/api/brand-facts/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrandFact(req.params.id, user.id);
        const update = normalizeFactBody(pickFields<any>(req.body, BRAND_FACT_WRITE_FIELDS));
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        const fact = await storage.updateBrandFact(req.params.id, update as any);
        if (!fact) return res.status(404).json({ success: false, error: "Fact not found" });
        res.json({ success: true, data: fact });
      } catch (error) {
        sendError(res, error, "Failed to update brand fact");
      }
    }),
  );

  app.delete(
    "/api/brand-facts/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrandFact(req.params.id, user.id);
        const deleted = await storage.deleteBrandFact(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "Fact not found" });
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete brand fact");
      }
    }),
  );

  // Metrics History routes
  app.get(
    "/api/metrics-history/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = req.params;
        await requireBrand(brandId, user.id);
        const metricType = req.query.metricType as string | undefined;
        const daysParam = req.query.days;
        const days = daysParam ? parseInt(daysParam as string, 10) : 30;

        const history = await storage.getMetricsHistory(brandId, metricType, days);
        res.json({ success: true, data: history });
      } catch (error) {
        sendError(res, error, "Failed to get metrics history");
      }
    }),
  );

  app.post(
    "/api/metrics-history/record/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = req.params;
        await requireBrand(brandId, user.id);
        await storage.recordCurrentMetrics(brandId);
        res.json({ success: true, message: "Metrics snapshot recorded" });
      } catch (error) {
        sendError(res, error, "Failed to record metrics");
      }
    }),
  );
}
