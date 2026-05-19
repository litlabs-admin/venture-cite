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
  requirePromptTest,
  requirePromptPortfolio,
  requireCitationQuality,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { z } from "zod";
import { assertTransition, InvalidStateTransitionError } from "../lib/statusTransitions";
import { assertSafeUrl } from "../lib/ssrf";
import { generateCorrection, CorrectionUngroundedError } from "../lib/hallucinationCorrection";

// Slack incoming webhooks have a fixed URL shape:
// https://hooks.slack.com/services/T<workspace>/B<bot>/<token>
// Pinning the host AND path here closes two bypasses the previous
// `endsWith("slack.com")` check left open: (1) attacker-controlled
// `*.slack.com` subdomains, (2) any non-webhook slack.com endpoint.
// SSRF (DNS rebinding, private-IP resolution) is handled separately by
// assertSafeUrl at fetch time.
const SLACK_WEBHOOK_RE =
  /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/;

function isValidSlackWebhookUrl(raw: unknown): raw is string {
  return typeof raw === "string" && SLACK_WEBHOOK_RE.test(raw);
}

// Mention routes moved to server/routes/mentions.ts (mentions rebuild)

export function setupIntelligenceRoutes(app: Express): void {
  // ================== PROMPT PORTFOLIO (Share-of-Answer) ==================

  const PROMPT_PORTFOLIO_WRITE_FIELDS = [
    "brandId",
    "prompt",
    "category",
    "funnelStage",
    "competitorSet",
    "region",
    "aiPlatform",
    "isBrandCited",
    "citationPosition",
    "shareOfAnswer",
    "sentiment",
    "answerVolatility",
    "consensusScore",
    "checkedHistory",
    "metadata",
  ] as const;

  app.get(
    "/api/prompt-portfolio",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId, category, funnelStage, aiPlatform } = req.query;
        if (brandId && typeof brandId === "string") {
          const prompts = await storage.getPromptPortfolio(brandId, {
            category: category as string,
            funnelStage: funnelStage as string,
            aiPlatform: aiPlatform as string,
          });
          return res.json({ success: true, data: prompts });
        }
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getPromptPortfolio(undefined, {
          category: category as string,
          funnelStage: funnelStage as string,
          aiPlatform: aiPlatform as string,
        });
        const prompts = all.filter((p: any) => p.brandId && brandIds.has(p.brandId));
        res.json({ success: true, data: prompts });
      } catch (error) {
        sendError(res, error, "Failed to fetch prompt portfolio");
      }
    }),
  );

  app.get(
    "/api/prompt-portfolio/stats/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const stats = await storage.getShareOfAnswerStats(req.params.brandId);
        res.json({ success: true, data: stats });
      } catch (error) {
        sendError(res, error, "Failed to fetch share-of-answer stats");
      }
    }),
  );

  app.post(
    "/api/prompt-portfolio",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, PROMPT_PORTFOLIO_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        const prompt = await storage.createPromptPortfolio(body as any);
        res.json({ success: true, data: prompt });
      } catch (error) {
        sendError(res, error, "Failed to create prompt entry");
      }
    }),
  );

  app.patch(
    "/api/prompt-portfolio/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requirePromptPortfolio(req.params.id, user.id);
        const update = pickFields<any>(req.body, PROMPT_PORTFOLIO_WRITE_FIELDS);
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        const prompt = await storage.updatePromptPortfolio(req.params.id, update as any);
        if (!prompt) return res.status(404).json({ success: false, error: "Prompt not found" });
        res.json({ success: true, data: prompt });
      } catch (error) {
        sendError(res, error, "Failed to update prompt entry");
      }
    }),
  );

  app.delete(
    "/api/prompt-portfolio/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requirePromptPortfolio(req.params.id, user.id);
        const deleted = await storage.deletePromptPortfolio(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "Prompt not found" });
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete prompt entry");
      }
    }),
  );

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

  // Detect → CORRECT. Generate a fact-grounded remediation plan + a
  // publish-ready public correction snippet for one hallucination, persist
  // them (the long-empty remediation_steps field + metadata.correction) and
  // move remediation to in_progress. Honest by construction: the generator
  // is constrained to the brand fact sheet + the verified contradicting
  // fact (server/lib/hallucinationCorrection.ts). Proposal only — nothing
  // is published; the user reviews it in the inspector.
  app.post(
    "/api/hallucinations/:id/draft-correction",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const existing = await requireHallucination(req.params.id, user.id);
        // Reuse the resolve button's state machine so terminal rows
        // (dismissed/verified) 409 instead of silently re-opening.
        assertTransition(
          "hallucination_remediation",
          existing.remediationStatus as string | null | undefined,
          "in_progress",
        );
        const facts = await storage.getBrandFacts(existing.brandId);
        const correction = await generateCorrection({
          claimedStatement: existing.claimedStatement,
          actualFact: existing.actualFact ?? "",
          category: existing.category,
          facts,
        });
        const prevMeta =
          existing.metadata && typeof existing.metadata === "object"
            ? (existing.metadata as Record<string, unknown>)
            : {};
        const updated = await storage.updateBrandHallucination(req.params.id, {
          remediationSteps: correction.remediationSteps,
          remediationStatus: "in_progress",
          metadata: {
            ...prevMeta,
            correction: {
              publicSnippet: correction.publicSnippet,
              factsUsed: correction.factsUsed,
              generatedAt: new Date().toISOString(),
            },
          },
        } as any);
        if (!updated)
          return res.status(404).json({ success: false, error: "Hallucination not found" });
        res.json({
          success: true,
          data: {
            remediationSteps: correction.remediationSteps,
            publicSnippet: correction.publicSnippet,
            factsUsed: correction.factsUsed,
            remediationStatus: updated.remediationStatus,
          },
        });
      } catch (error) {
        if (error instanceof InvalidStateTransitionError) {
          return res.status(409).json({ success: false, error: error.message });
        }
        if (error instanceof CorrectionUngroundedError) {
          return res.status(422).json({ success: false, error: error.message });
        }
        sendError(res, error, "Failed to draft correction");
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
        const fact = await storage.createBrandFact(body as any);
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

  // =====================================================
  // GEO AI Agent Feature Routes
  // =====================================================

  // Prompt Test Run routes
  app.get(
    "/api/prompt-tests/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = req.params;
        await requireBrand(brandId, user.id);
        const { status } = req.query;
        const filters: { status?: string } = {};
        if (status) filters.status = status as string;
        const runs = await storage.getPromptTestRuns(brandId, filters);
        res.json({ success: true, data: runs });
      } catch (error) {
        sendError(res, error, "Failed to fetch prompt test runs");
      }
    }),
  );

  const PROMPT_TEST_WRITE_FIELDS = [
    "brandId",
    "promptPortfolioId",
    "prompt",
    "aiPlatform",
    "response",
    "isBrandCited",
    "citationPosition",
    "competitorsFound",
    "sentiment",
    "shareOfAnswer",
    "hallucinationDetected",
    "hallucinationDetails",
    "sourcesCited",
    "runStatus",
    "scheduledAt",
    "completedAt",
    "error",
    "metadata",
  ] as const;

  app.post(
    "/api/prompt-tests",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, PROMPT_TEST_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        const run = await storage.createPromptTestRun(body as any);
        res.json({ success: true, data: run });
      } catch (error) {
        sendError(res, error, "Failed to create prompt test run");
      }
    }),
  );

  app.get(
    "/api/prompt-tests/run/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const run = await requirePromptTest(req.params.id, user.id);
        res.json({ success: true, data: run });
      } catch (error) {
        sendError(res, error, "Failed to fetch prompt test run");
      }
    }),
  );

  app.patch(
    "/api/prompt-tests/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requirePromptTest(req.params.id, user.id);
        const update = pickFields<any>(req.body, PROMPT_TEST_WRITE_FIELDS);
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        const run = await storage.updatePromptTestRun(req.params.id, update as any);
        if (!run)
          return res.status(404).json({ success: false, error: "Prompt test run not found" });
        res.json({ success: true, data: run });
      } catch (error) {
        sendError(res, error, "Failed to update prompt test run");
      }
    }),
  );
}
