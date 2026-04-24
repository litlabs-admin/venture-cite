// AI intelligence: mentions, hallucinations, citation quality, brand facts, portfolio, sources, traffic, prompt tests, metrics, alerts (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split. The
// original monolith now only mounts this module via setupIntelligenceRoutes.

import type { Express } from "express";
import { storage } from "../storage";
import {
  requireUser,
  requireBrand,
  requireArticle,
  requireBrandMention,
  requireHallucination,
  requireBrandFact,
  requireAiSource,
  requirePromptTest,
  requirePromptPortfolio,
  requireCitationQuality,
  requireAlertSetting,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import { sendError } from "../lib/routesShared";
import { z } from "zod";
import { assertTransition, InvalidStateTransitionError } from "../lib/statusTransitions";

export function setupIntelligenceRoutes(app: Express): void {
  app.get("/api/brand-mentions/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const platform = req.query.platform as string;
      const mentions = await storage.getBrandMentions(brandId, platform);

      const stats = {
        total: mentions.length,
        byPlatform: {} as Record<string, number>,
        bySentiment: { positive: 0, neutral: 0, negative: 0 },
        totalEngagement: 0,
      };

      mentions.forEach((m) => {
        stats.byPlatform[m.platform] = (stats.byPlatform[m.platform] || 0) + 1;
        if (m.sentiment === "positive") stats.bySentiment.positive++;
        else if (m.sentiment === "negative") stats.bySentiment.negative++;
        else stats.bySentiment.neutral++;
        stats.totalEngagement += m.engagementScore || 0;
      });

      res.json({ success: true, data: mentions, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch brand mentions" });
    }
  });

  const BRAND_MENTION_WRITE_FIELDS = [
    "brandId",
    "platform",
    "sourceUrl",
    "sourceTitle",
    "mentionContext",
    "sentiment",
    "sentimentScore",
    "engagementScore",
    "authorUsername",
    "isVerified",
    "mentionedAt",
    "metadata",
  ] as const;

  app.get("/api/brand-mentions", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, platform } = req.query;
      let mentions: any[];
      if (brandId && typeof brandId === "string") {
        mentions = await storage.getBrandMentions(brandId, platform as string);
      } else {
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getBrandMentions(undefined, platform as string);
        mentions = all.filter((m: any) => m.brandId && brandIds.has(m.brandId));
      }

      const stats = {
        total: mentions.length,
        byPlatform: {} as Record<string, number>,
        bySentiment: { positive: 0, neutral: 0, negative: 0 },
        totalEngagement: 0,
      };
      mentions.forEach((m: any) => {
        stats.byPlatform[m.platform] = (stats.byPlatform[m.platform] || 0) + 1;
        if (m.sentiment === "positive") stats.bySentiment.positive++;
        else if (m.sentiment === "negative") stats.bySentiment.negative++;
        else stats.bySentiment.neutral++;
        stats.totalEngagement += m.engagementScore || 0;
      });

      res.json({ success: true, data: { mentions, stats } });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand mentions");
    }
  });

  app.post("/api/brand-mentions", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, BRAND_MENTION_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const mention = await storage.createBrandMention(body as any);
      res.json({ success: true, data: mention });
    } catch (error) {
      sendError(res, error, "Failed to create brand mention");
    }
  });

  app.patch("/api/brand-mentions/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandMention(req.params.id, user.id);
      const update = pickFields<any>(req.body, BRAND_MENTION_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const mention = await storage.updateBrandMention(req.params.id, update as any);
      if (!mention) return res.status(404).json({ success: false, error: "Mention not found" });
      res.json({ success: true, data: mention });
    } catch (error) {
      sendError(res, error, "Failed to update brand mention");
    }
  });

  app.delete("/api/brand-mentions/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandMention(req.params.id, user.id);
      const deleted = await storage.deleteBrandMention(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Mention not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete brand mention");
    }
  });

  // Get mention alerts summary
  app.get("/api/brand-mentions/alerts/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const mentions = await storage.getBrandMentions(brand.id);

      // Get recent mentions (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentMentions = mentions.filter((m) => new Date(m.discoveredAt) > weekAgo);

      // Calculate trends
      const previousWeek = mentions.filter((m) => {
        const date = new Date(m.discoveredAt);
        return date <= weekAgo && date > new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
      });

      const growth =
        previousWeek.length > 0
          ? (((recentMentions.length - previousWeek.length) / previousWeek.length) * 100).toFixed(1)
          : "0";

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          thisWeek: recentMentions.length,
          lastWeek: previousWeek.length,
          growth: parseFloat(growth),
          recentMentions: recentMentions.slice(0, 10),
          platformBreakdown: recentMentions.reduce(
            (acc, m) => {
              acc[m.platform] = (acc[m.platform] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
          tips: [
            "Set up alerts for brand name variations",
            "Monitor competitor mentions for opportunities",
            "Engage with positive mentions to amplify reach",
            "Address negative mentions promptly",
          ],
        },
      });
    } catch (error) {
      console.error("Alerts error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch alerts" });
    }
  });

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

  app.get("/api/prompt-portfolio", async (req, res) => {
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
  });

  app.get("/api/prompt-portfolio/stats/:brandId", async (req, res) => {
    try {
      const stats = await storage.getShareOfAnswerStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch share-of-answer stats");
    }
  });

  app.post("/api/prompt-portfolio", async (req, res) => {
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
  });

  app.patch("/api/prompt-portfolio/:id", async (req, res) => {
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
  });

  app.delete("/api/prompt-portfolio/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePromptPortfolio(req.params.id, user.id);
      const deleted = await storage.deletePromptPortfolio(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Prompt not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete prompt entry");
    }
  });

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

  app.get("/api/citation-quality", async (req, res) => {
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
  });

  app.get("/api/citation-quality/stats/:brandId", async (req, res) => {
    try {
      const stats = await storage.getCitationQualityStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation quality stats");
    }
  });

  app.post("/api/citation-quality", async (req, res) => {
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
  });

  app.patch("/api/citation-quality/:id", async (req, res) => {
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
  });

  app.delete("/api/citation-quality/:id", async (req, res) => {
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
  });

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

  app.get("/api/hallucinations", async (req, res) => {
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
  });

  app.get("/api/hallucinations/stats/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrand(req.params.brandId, user.id);
      const stats = await storage.getHallucinationStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch hallucination stats");
    }
  });

  app.post("/api/hallucinations", async (req, res) => {
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
  });

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

  app.patch("/api/hallucinations/:id", async (req, res) => {
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
  });

  app.post("/api/hallucinations/:id/resolve", async (req, res) => {
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
  });

  app.delete("/api/hallucinations/:id", async (req, res) => {
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
  });

  // ================== BRAND FACT SHEET ==================

  // Get brand facts
  app.get("/api/brand-facts/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrand(req.params.brandId, user.id);
      const facts = await storage.getBrandFacts(req.params.brandId);
      res.json({ success: true, data: facts });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand facts");
    }
  });

  const BRAND_FACT_WRITE_FIELDS = [
    "brandId",
    "factCategory",
    "factKey",
    "factValue",
    "sourceUrl",
    "isActive",
    "metadata",
  ] as const;

  app.post("/api/brand-facts", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, BRAND_FACT_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const fact = await storage.createBrandFact(body as any);
      res.json({ success: true, data: fact });
    } catch (error) {
      sendError(res, error, "Failed to create brand fact");
    }
  });

  app.patch("/api/brand-facts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandFact(req.params.id, user.id);
      const update = pickFields<any>(req.body, BRAND_FACT_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const fact = await storage.updateBrandFact(req.params.id, update as any);
      if (!fact) return res.status(404).json({ success: false, error: "Fact not found" });
      res.json({ success: true, data: fact });
    } catch (error) {
      sendError(res, error, "Failed to update brand fact");
    }
  });

  app.delete("/api/brand-facts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandFact(req.params.id, user.id);
      const deleted = await storage.deleteBrandFact(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Fact not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete brand fact");
    }
  });

  // Metrics History routes
  app.get("/api/metrics-history/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const metricType = req.query.metricType as string | undefined;
      const daysParam = req.query.days;
      const days = daysParam ? parseInt(daysParam as string, 10) : 30;

      const history = await storage.getMetricsHistory(brandId, metricType, days);
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to get metrics history" });
    }
  });

  app.post("/api/metrics-history/record/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      await storage.recordCurrentMetrics(brandId);
      res.json({ success: true, message: "Metrics snapshot recorded" });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to record metrics" });
    }
  });

  // Alert Settings routes
  app.get("/api/alert-settings/:brandId", async (req, res) => {
    try {
      const settings = await storage.getAlertSettings(req.params.brandId);
      res.json({ success: true, data: settings });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch alert settings" });
    }
  });

  app.post("/api/alert-settings", async (req, res) => {
    try {
      const user = requireUser(req);
      const {
        brandId,
        alertType,
        isEnabled,
        threshold,
        emailEnabled,
        emailAddress,
        slackEnabled,
        slackWebhookUrl,
      } = req.body ?? {};

      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(brandId, user.id);

      if (!alertType || typeof alertType !== "string") {
        return res.status(400).json({ success: false, error: "alertType is required" });
      }

      const validAlertTypes = [
        "hallucination_detected",
        "soa_drop",
        "soa_increase",
        "quality_drop",
        "competitor_surge",
      ];
      if (!validAlertTypes.includes(alertType)) {
        return res.status(400).json({ success: false, error: "Invalid alert type" });
      }

      if (slackWebhookUrl && typeof slackWebhookUrl === "string") {
        try {
          const url = new URL(slackWebhookUrl);
          if (!url.hostname.endsWith("slack.com")) {
            return res
              .status(400)
              .json({ success: false, error: "Slack webhook URL must be from slack.com" });
          }
        } catch {
          return res.status(400).json({ success: false, error: "Invalid Slack webhook URL" });
        }
      }

      if (emailAddress && typeof emailAddress === "string") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailAddress)) {
          return res.status(400).json({ success: false, error: "Invalid email address" });
        }
      }

      const setting = await storage.createAlertSetting({
        brandId,
        alertType,
        isEnabled: isEnabled === false ? 0 : 1,
        threshold: threshold ? String(threshold) : undefined,
        emailEnabled: emailEnabled ? 1 : 0,
        emailAddress: emailAddress || undefined,
        slackEnabled: slackEnabled ? 1 : 0,
        slackWebhookUrl: slackWebhookUrl || undefined,
      });
      res.json({ success: true, data: setting });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to create alert setting" });
    }
  });

  app.patch("/api/alert-settings/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAlertSetting(req.params.id, user.id);
      const { isEnabled, threshold, emailEnabled, emailAddress, slackEnabled, slackWebhookUrl } =
        req.body ?? {};

      if (slackWebhookUrl && typeof slackWebhookUrl === "string") {
        try {
          const url = new URL(slackWebhookUrl);
          if (!url.hostname.endsWith("slack.com")) {
            return res
              .status(400)
              .json({ success: false, error: "Slack webhook URL must be from slack.com" });
          }
        } catch {
          return res.status(400).json({ success: false, error: "Invalid Slack webhook URL" });
        }
      }

      const update: Record<string, any> = {};
      if (isEnabled !== undefined) update.isEnabled = isEnabled ? 1 : 0;
      if (threshold !== undefined) update.threshold = String(threshold);
      if (emailEnabled !== undefined) update.emailEnabled = emailEnabled ? 1 : 0;
      if (emailAddress !== undefined) update.emailAddress = emailAddress;
      if (slackEnabled !== undefined) update.slackEnabled = slackEnabled ? 1 : 0;
      if (slackWebhookUrl !== undefined) update.slackWebhookUrl = slackWebhookUrl;

      const setting = await storage.updateAlertSetting(req.params.id, update);
      if (!setting) return res.status(404).json({ success: false, error: "Setting not found" });
      res.json({ success: true, data: setting });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to update alert setting" });
    }
  });

  app.delete("/api/alert-settings/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAlertSetting(req.params.id, user.id);
      const deleted = await storage.deleteAlertSetting(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Setting not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete alert setting");
    }
  });

  // Alert History routes
  app.get("/api/alert-history/:brandId", async (req, res) => {
    try {
      const { limit } = req.query;
      const history = await storage.getAlertHistory(
        req.params.brandId,
        limit ? parseInt(limit as string) : 50,
      );
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch alert history" });
    }
  });

  // Test alert endpoint — ownership-checked before firing anything.
  app.post("/api/alerts/test/:settingId", async (req, res) => {
    try {
      const user = requireUser(req);
      const setting = await requireAlertSetting(req.params.settingId, user.id);
      if (!setting) return res.status(404).json({ success: false, error: "Setting not found" });

      const channels: string[] = [];
      const errors: string[] = [];

      // Send test Slack notification with SSRF protection
      if (setting.slackEnabled === 1 && setting.slackWebhookUrl) {
        try {
          const url = new URL(setting.slackWebhookUrl);
          if (!url.hostname.endsWith("slack.com")) {
            errors.push("Invalid Slack webhook URL - must be from slack.com");
          } else {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(setting.slackWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `🔔 GEO Platform Test Alert`,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*Test Alert from GEO Platform*\n\nThis is a test notification to verify your Slack integration is working correctly.\n\n_Alert Type:_ ${setting.alertType}`,
                    },
                  },
                ],
              }),
              signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.ok) {
              channels.push("slack");
            } else {
              errors.push(`Slack returned error: ${response.status}`);
            }
          }
        } catch (e: any) {
          errors.push(`Slack failed: ${e.message || "Unknown error"}`);
        }
      }

      // Log test alert to history
      await storage.createAlertHistory({
        alertSettingId: setting.id,
        brandId: setting.brandId || undefined,
        alertType: "test",
        message: channels.length > 0 ? "Test alert sent successfully" : "Test alert failed",
        details: { channels, errors },
        sentVia: channels.join(", ") || "none",
      });

      if (errors.length > 0 && channels.length === 0) {
        return res.status(400).json({ success: false, error: errors.join("; ") });
      }

      res.json({
        success: true,
        message: `Test alert sent via: ${channels.join(", ") || "no channels configured"}`,
        warnings: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to send test alert" });
    }
  });

  // =====================================================
  // GEO AI Agent Feature Routes
  // =====================================================

  // AI Sources routes - Citation Network Tracing
  app.get("/api/ai-sources/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      // Route to getTopAiSources which synthesises from geo_rankings when the
      // (mostly empty) ai_sources table has no rows. getAiSources() reads only
      // the Phase 2 table and returns [] for every user.
      const limit = parseInt((req.query.limit as string) || "25");
      const sources = await storage.getTopAiSources(brandId, limit);
      res.json({ success: true, data: sources });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch AI sources" });
    }
  });

  const AI_SOURCE_WRITE_FIELDS = [
    "brandId",
    "aiPlatform",
    "sourceUrl",
    "sourceDomain",
    "sourceName",
    "sourceType",
    "prompt",
    "citationContext",
    "authorityScore",
    "isBrandMentioned",
    "sentiment",
    "occurrenceCount",
    "metadata",
  ] as const;

  app.post("/api/ai-sources", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AI_SOURCE_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const source = await storage.createAiSource(body as any);
      res.json({ success: true, data: source });
    } catch (error) {
      sendError(res, error, "Failed to create AI source");
    }
  });

  app.get("/api/ai-sources/top/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { limit } = req.query;
      const sources = await storage.getTopAiSources(
        brandId,
        limit ? parseInt(limit as string) : 10,
      );
      res.json({ success: true, data: sources });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch top AI sources" });
    }
  });

  app.patch("/api/ai-sources/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAiSource(req.params.id, user.id);
      const update = pickFields<any>(req.body, AI_SOURCE_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const source = await storage.updateAiSource(req.params.id, update as any);
      if (!source) return res.status(404).json({ success: false, error: "AI source not found" });
      res.json({ success: true, data: source });
    } catch (error) {
      sendError(res, error, "Failed to update AI source");
    }
  });

  app.delete("/api/ai-sources/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAiSource(req.params.id, user.id);
      const deleted = await storage.deleteAiSource(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "AI source not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete AI source");
    }
  });

  // AI Traffic Analytics routes
  app.get("/api/ai-traffic/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { aiPlatform, converted } = req.query;
      const filters: { aiPlatform?: string; converted?: boolean } = {};
      if (aiPlatform) filters.aiPlatform = aiPlatform as string;
      if (converted !== undefined) filters.converted = converted === "true";
      const sessions = await storage.getAiTrafficSessions(brandId, filters);
      res.json({ success: true, data: sessions });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch AI traffic sessions" });
    }
  });

  const AI_TRAFFIC_WRITE_FIELDS = [
    "brandId",
    "articleId",
    "aiPlatform",
    "referrerUrl",
    "landingPage",
    "userAgent",
    "sessionDuration",
    "pageViews",
    "bounced",
    "converted",
    "conversionType",
    "conversionValue",
    "country",
    "device",
    "metadata",
  ] as const;

  app.post("/api/ai-traffic", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AI_TRAFFIC_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (body.articleId && typeof body.articleId === "string") {
        await requireArticle(body.articleId, user.id);
      }
      const session = await storage.createAiTrafficSession(body as any);
      res.json({ success: true, data: session });
    } catch (error) {
      sendError(res, error, "Failed to create AI traffic session");
    }
  });

  app.get("/api/ai-traffic/stats/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const stats = await storage.getAiTrafficStats(brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch AI traffic stats" });
    }
  });

  // Prompt Test Run routes
  app.get("/api/prompt-tests/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status } = req.query;
      const filters: { status?: string } = {};
      if (status) filters.status = status as string;
      const runs = await storage.getPromptTestRuns(brandId, filters);
      res.json({ success: true, data: runs });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch prompt test runs" });
    }
  });

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

  app.post("/api/prompt-tests", async (req, res) => {
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
  });

  app.get("/api/prompt-tests/run/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const run = await requirePromptTest(req.params.id, user.id);
      res.json({ success: true, data: run });
    } catch (error) {
      sendError(res, error, "Failed to fetch prompt test run");
    }
  });

  app.patch("/api/prompt-tests/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePromptTest(req.params.id, user.id);
      const update = pickFields<any>(req.body, PROMPT_TEST_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const run = await storage.updatePromptTestRun(req.params.id, update as any);
      if (!run) return res.status(404).json({ success: false, error: "Prompt test run not found" });
      res.json({ success: true, data: run });
    } catch (error) {
      sendError(res, error, "Failed to update prompt test run");
    }
  });
}
