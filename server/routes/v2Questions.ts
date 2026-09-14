// Read endpoints for the three /v2/visibility "deep" boards: the buyer
// question portfolio, one question's detail, and the citation explorer.
// The aggregation logic lives in ../services/v2QuestionViews.ts, kept free
// of any database import so it can be unit tested without one; this file is
// just the HTTP wiring: ownership checks and the database reads that feed it.

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import {
  hostnameOfUrl,
  summarizeCitationExplorer,
  summarizePortfolio,
  summarizeQuestionDetail,
} from "../services/v2QuestionViews";

const LOOKBACK_DAYS = 90;

export function setupV2QuestionsRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/visibility/questions/:brandId
  // ==========================================================================
  app.get(
    "/api/v2/visibility/questions/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const prompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const promptIds = prompts.map((prompt) => prompt.id);
        const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const [rows, audienceMap, setHealth, audiences] = await Promise.all([
          promptIds.length > 0
            ? storage.getGeoRankingsByBrandPromptIds(promptIds, since)
            : Promise.resolve([]),
          storage.getPromptAudienceMapByBrandId(brand.id),
          storage.getLatestSetHealthRun(brand.id),
          storage.getPromptAudiencesByBrandId(brand.id),
        ]);
        const audienceNameById = new Map(audiences.map((audience) => [audience.id, audience.name]));
        const audienceNamesByPrompt = new Map<string, string[]>();
        for (const [promptId, audienceIds] of Object.entries(audienceMap)) {
          audienceNamesByPrompt.set(
            promptId,
            audienceIds
              .map((id) => audienceNameById.get(id))
              .filter((name): name is string => Boolean(name)),
          );
        }
        const summary = summarizePortfolio(
          prompts,
          rows,
          audienceNamesByPrompt,
          setHealth ? { score: setHealth.score, verdict: setHealth.verdict } : null,
        );
        res.json({ success: true, data: summary });
      } catch (error) {
        sendError(res, error, "Failed to load the buyer question portfolio");
      }
    }),
  );

  // ==========================================================================
  // GET /api/v2/visibility/questions/:brandId/:questionId
  // ==========================================================================
  app.get(
    "/api/v2/visibility/questions/:brandId/:questionId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const prompt = await storage.getBrandPromptById(req.params.questionId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Question not found" });
        }
        const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const rows = await storage.getGeoRankingsByBrandPromptIds([prompt.id], since);
        const detail = summarizeQuestionDetail(prompt, rows);
        res.json({ success: true, data: detail });
      } catch (error) {
        sendError(res, error, "Failed to load the question detail");
      }
    }),
  );

  // ==========================================================================
  // GET /api/v2/visibility/citations/:brandId
  // ==========================================================================
  app.get(
    "/api/v2/visibility/citations/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const prompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const promptIds = prompts.map((prompt) => prompt.id);
        const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const rows =
          promptIds.length > 0
            ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since)
            : [];
        const brandDomain = hostnameOfUrl(brand.website);
        const summary = summarizeCitationExplorer(rows, prompts, brandDomain);
        res.json({ success: true, data: summary });
      } catch (error) {
        sendError(res, error, "Failed to load the citation explorer");
      }
    }),
  );
}
