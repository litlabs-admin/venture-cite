// Brand prompts, visibility progress, and citation schedule routes.
//
// Extracted from server/routes.ts as part of the per-domain split.
// Covers the brand-level citation prompt portfolio, prompt suggestions,
// visibility-checklist persistence, citation run history / drill-down,
// brand-mention detection backfill, and the citation-schedule PATCH.
//
// Business logic lives in server/services/*. Handlers here only
// parse/validate input, enforce ownership, call one service function, and
// shape the response.

import type { Express } from "express";
import { storage } from "../storage";
import {
  requireUser,
  requireBrand,
  requireCitationRun,
  sendOwnershipError,
} from "../lib/ownership";
import { advanceCitationRun } from "../citationChecker";
import { generateSuggestedPrompts } from "../lib/suggestionGenerator";
import { diagnosePrompt } from "../lib/promptDiagnose";
import { aiLimitMiddleware, sendError, asyncHandler } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { buildPromptScoreHistory, resolvePoints } from "../lib/promptScoreHistory";
import {
  generateInitialPrompts,
  resetTrackedPrompts,
  acceptPromptSuggestion,
  createTrackedPrompt,
  updateTrackedPrompt,
  archiveTrackedPrompt,
} from "../services/promptPortfolio";
import { createPromptTag, listPromptTagsWithCounts } from "../services/promptTags";
import {
  listPromptAudiencesWithScores,
  generatePromptAudiencesForBrand,
  createPromptAudience,
} from "../services/promptAudiences";
import { runSetHealthAuditForBrand } from "../services/promptSetHealth";
import { generatePhrasingsForPrompt, analyzePhrasing } from "../services/promptPhrasing";
import { startBrandCitationRun, buildCitationRunStateSnapshot } from "../services/citationRuns";
import { buildRunDetails, buildBrandPromptResults } from "../services/citationResults";
import { reDetectAllForBrand } from "../services/reDetect";

export function setupPromptsRoutes(app: Express): void {
  // ============ BRAND-LEVEL CITATION PROMPT PORTFOLIO ============

  // Seed the initial 10 tracked prompts for a brand. Refuses if tracked
  // prompts already exist - callers must use /reset for a destructive redo.
  app.post(
    "/api/brand-prompts/:brandId/generate",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const result = await generateInitialPrompts(brand);
        if (result.outcome === "already_tracked") {
          return res.status(409).json({
            success: false,
            error:
              "Tracked prompts are already set. Use suggestions to evolve them, or reset to start over.",
          });
        }
        if (result.outcome === "upstream_error") {
          return res.status(502).json({ success: false, error: result.error });
        }

        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to generate brand prompts");
      }
    }),
  );

  // Reset: archive every tracked prompt + suggestion, then seed a fresh 10.
  // Destructive - requires { confirm: true } in the body.
  app.post(
    "/api/brand-prompts/:brandId/reset",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        if (req.body?.confirm !== true) {
          return res.status(400).json({ success: false, error: "confirm: true required" });
        }
        const result = await resetTrackedPrompts(brand);
        if (result.outcome === "upstream_error") {
          return res.status(502).json({ success: false, error: result.error });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to reset brand prompts");
      }
    }),
  );

  // List suggested prompts awaiting user review.
  app.get(
    "/api/brand-prompts/:brandId/suggestions",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const suggestions = await storage.getBrandPromptsByBrandId(brand.id, {
          status: "suggested",
        });
        res.json({ success: true, data: suggestions });
      } catch (error) {
        sendError(res, error, "Failed to fetch suggestions");
      }
    }),
  );

  // Force-refresh suggestions now (also called after each weekly auto run).
  app.post(
    "/api/brand-prompts/:brandId/suggestions/refresh",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const result = await generateSuggestedPrompts(brand.id, { replaceExisting: true });
        if (result.error && result.saved.length === 0) {
          return res.status(502).json({ success: false, error: result.error });
        }
        res.json({ success: true, data: result.saved });
      } catch (error) {
        sendError(res, error, "Failed to refresh suggestions");
      }
    }),
  );

  // Accept a suggestion. Two modes:
  //   * Add: tracked count is below the cap → promote without archiving
  //     anything. Body omits replaceTrackedId.
  //   * Replace: tracked count is at the cap → caller must pass the id of
  //     a tracked prompt to archive in the new prompt's place.
  app.post(
    "/api/brand-prompts/:brandId/suggestions/:suggestionId/accept",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const replaceTrackedIdRaw =
          typeof req.body?.replaceTrackedId === "string" ? req.body.replaceTrackedId : "";
        const replaceTrackedId = replaceTrackedIdRaw.trim() || null;

        const result = await acceptPromptSuggestion(
          brand,
          req.params.suggestionId,
          replaceTrackedId,
        );
        if (result.outcome === "not_found") {
          return res
            .status(404)
            .json({ success: false, error: "Suggestion not found on this brand" });
        }
        if (result.outcome === "replace_target_not_found") {
          return res
            .status(404)
            .json({ success: false, error: "Tracked prompt to replace not found" });
        }
        if (result.outcome === "tracked_set_full") {
          return res.status(409).json({
            success: false,
            error: "tracked_set_full",
            data: { trackedCount: result.trackedCount, cap: result.cap },
          });
        }
        if (result.outcome === "replaced") {
          return res.json({ success: true, data: { mode: "replaced" } });
        }
        res.json({ success: true, data: { mode: "added" } });
      } catch (error) {
        sendError(res, error, "Failed to accept suggestion");
      }
    }),
  );

  // Dismiss a suggestion.
  app.delete(
    "/api/brand-prompts/:brandId/suggestions/:suggestionId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const suggestion = all.find(
          (p) => p.id === req.params.suggestionId && p.status === "suggested",
        );
        if (!suggestion) {
          return res.status(404).json({ success: false, error: "Suggestion not found" });
        }
        await storage.archiveBrandPrompt(suggestion.id);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to dismiss suggestion");
      }
    }),
  );

  // Create one prompt by hand. Subject to the same tracked cap as
  // accept-suggestion.
  app.post(
    "/api/brand-prompts/:brandId/prompts",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const text = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
        if (!text) {
          return res.status(400).json({ success: false, error: "prompt text required" });
        }
        if (text.length > 500) {
          return res.status(400).json({ success: false, error: "prompt too long (max 500)" });
        }
        const result = await createTrackedPrompt(brand, text);
        if (result.outcome === "tracked_set_full") {
          return res.status(409).json({
            success: false,
            error: "tracked_set_full",
            data: { trackedCount: result.trackedCount, cap: result.cap },
          });
        }
        if (result.outcome === "duplicate") {
          return res.status(409).json({ success: false, error: "duplicate_prompt" });
        }
        res.status(201).json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to create prompt");
      }
    }),
  );

  // Persist a manual reordering of the tracked set. `orderIndex` already
  // drove read order everywhere; nothing could write it until now.
  app.post(
    "/api/brand-prompts/:brandId/prompts/reorder",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const ids: unknown = req.body?.ids;
        if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
          return res.status(400).json({ success: false, error: "ids must be a string array" });
        }
        const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const owned = new Set(all.map((p) => p.id));
        // Every id must belong to this brand, or a caller could renumber
        // another account's prompts by guessing ids.
        if ((ids as string[]).some((id) => !owned.has(id))) {
          return res.status(400).json({ success: false, error: "unknown prompt id" });
        }
        await storage.reorderBrandPrompts(brand.id, ids as string[]);
        const updated = await storage.getBrandPromptsByBrandId(brand.id);
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to reorder prompts");
      }
    }),
  );

  // Inline-edit the text of a tracked prompt, or flip it between tracked and
  // archived (the row's ON toggle). Body carries `prompt`, `status`, or both.
  app.patch(
    "/api/brand-prompts/:brandId/prompts/:promptId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const hasText = typeof req.body?.prompt === "string";
        const newText = hasText ? req.body.prompt.trim() : "";
        const rawStatus = req.body?.status;
        const hasStatus = rawStatus === "tracked" || rawStatus === "archived";

        if (!hasText && !hasStatus) {
          return res.status(400).json({ success: false, error: "prompt text or status required" });
        }
        if (hasText && !newText) {
          return res.status(400).json({ success: false, error: "prompt text required" });
        }

        const result = await updateTrackedPrompt(brand, {
          promptId: req.params.promptId,
          text: hasText ? newText : undefined,
          status: hasStatus ? rawStatus : undefined,
        });
        if (result.outcome === "not_found") {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        if (result.outcome === "must_keep_one_tracked") {
          return res.status(400).json({
            success: false,
            error: "Keep at least one prompt switched on",
          });
        }
        if (result.outcome === "tracked_set_full") {
          return res.status(409).json({
            success: false,
            error: "tracked_set_full",
            data: { trackedCount: result.trackedCount, cap: result.cap },
          });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to update prompt");
      }
    }),
  );

  // ON/OFF toggle. Orthogonal to status - a paused prompt stays tracked (still
  // counts against the cap) but citationChecker.ts's next run skips it.
  app.patch(
    "/api/brand-prompts/:brandId/prompts/:promptId/pause",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const paused = req.body?.paused;
        if (typeof paused !== "boolean") {
          return res.status(400).json({ success: false, error: "paused (boolean) required" });
        }
        const row = await storage.getBrandPromptById(req.params.promptId);
        if (!row || row.brandId !== brand.id || row.status !== "tracked") {
          return res.status(404).json({ success: false, error: "Tracked prompt not found" });
        }
        const updated = await storage.setBrandPromptPaused(row.id, paused);
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to update prompt paused state");
      }
    }),
  );

  // Per-question diagnosis for the /prompts/$promptId/diagnose page - counts
  // rivals/sources from stored citation results and asks the model for a
  // verdict + fixes grounded in those counts. Registered ahead of the
  // single-prompt GET below so the literal `/diagnose` suffix reads clearly
  // as its own route (Express would not shadow it either way).
  app.get(
    "/api/brand-prompts/:brandId/prompts/:promptId/diagnose",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const row = await storage.getBrandPromptById(req.params.promptId);
        if (!row || row.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        const data = await diagnosePrompt(brand, row);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to diagnose prompt");
      }
    }),
  );

  // Single-prompt fetch for the /prompts/$promptId detail page - the list
  // endpoint below returns every prompt, which the detail page shouldn't
  // have to fetch and filter client-side just to render one row's metadata.
  app.get(
    "/api/brand-prompts/:brandId/prompts/:promptId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const row = await storage.getBrandPromptById(req.params.promptId);
        if (!row || row.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        const tagIds = await storage.getTagIdsByPromptId(row.id);
        res.json({ success: true, data: { ...row, tagIds } });
      } catch (error) {
        sendError(res, error, "Failed to load prompt");
      }
    }),
  );

  // ============ PROMPT TAGS ============

  // Bulk promptId -> tagId[] map for the table's Tags column - one query
  // instead of N single-prompt lookups.
  app.get(
    "/api/brand-prompts/:brandId/prompt-tags",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const map = await storage.getPromptTagsMapByBrandId(brand.id);
        res.json({ success: true, data: map });
      } catch (error) {
        sendError(res, error, "Failed to load prompt tags");
      }
    }),
  );

  app.get(
    "/api/brand-prompts/:brandId/tags",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const data = await listPromptTagsWithCounts(brand);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load tags");
      }
    }),
  );

  app.post(
    "/api/brand-prompts/:brandId/tags",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        if (!name) return res.status(400).json({ success: false, error: "name required" });
        if (name.length > 40) {
          return res.status(400).json({ success: false, error: "name too long (max 40 chars)" });
        }
        const color = typeof req.body?.color === "string" ? req.body.color : null;
        const result = await createPromptTag(brand, name, color);
        if (result.outcome === "duplicate") {
          return res.status(409).json({ success: false, error: "duplicate_tag" });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to create tag");
      }
    }),
  );

  app.patch(
    "/api/brand-prompts/:brandId/tags/:tagId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const tags = await storage.getPromptTagsByBrandId(brand.id);
        const tag = tags.find((t) => t.id === req.params.tagId);
        if (!tag) return res.status(404).json({ success: false, error: "Tag not found" });
        const update: { name?: string; color?: string | null } = {};
        if (typeof req.body?.name === "string" && req.body.name.trim()) {
          update.name = req.body.name.trim().slice(0, 40);
        }
        if ("color" in (req.body ?? {})) update.color = req.body.color ?? null;
        const updated = await storage.updatePromptTag(tag.id, update);
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to update tag");
      }
    }),
  );

  app.delete(
    "/api/brand-prompts/:brandId/tags/:tagId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const tags = await storage.getPromptTagsByBrandId(brand.id);
        if (!tags.some((t) => t.id === req.params.tagId)) {
          return res.status(404).json({ success: false, error: "Tag not found" });
        }
        await storage.deletePromptTag(req.params.tagId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete tag");
      }
    }),
  );

  app.post(
    "/api/brand-prompts/:brandId/prompts/:promptId/tags",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const tagId = req.body?.tagId;
        if (typeof tagId !== "string" || !tagId) {
          return res.status(400).json({ success: false, error: "tagId required" });
        }
        const [prompt, tags] = await Promise.all([
          storage.getBrandPromptById(req.params.promptId),
          storage.getPromptTagsByBrandId(brand.id),
        ]);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        if (!tags.some((t) => t.id === tagId)) {
          return res.status(404).json({ success: false, error: "Tag not found" });
        }
        await storage.attachPromptTag(prompt.id, tagId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to attach tag");
      }
    }),
  );

  app.delete(
    "/api/brand-prompts/:brandId/prompts/:promptId/tags/:tagId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const prompt = await storage.getBrandPromptById(req.params.promptId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        await storage.detachPromptTag(prompt.id, req.params.tagId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to detach tag");
      }
    }),
  );

  // ============ PROMPT AUDIENCES ============

  app.get(
    "/api/brand-prompts/:brandId/prompt-audiences",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const map = await storage.getPromptAudienceMapByBrandId(brand.id);
        res.json({ success: true, data: map });
      } catch (error) {
        sendError(res, error, "Failed to load prompt audiences");
      }
    }),
  );

  app.get(
    "/api/brand-prompts/:brandId/audiences",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const data = await listPromptAudiencesWithScores(brand);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load audiences");
      }
    }),
  );

  // AI-generate audiences from the tracked prompt set. Cost safeguard
  // mirrors PERCEPTION_COOLDOWN_MS (server/routes/dashboard.ts).
  app.post(
    "/api/brand-prompts/:brandId/audiences/generate",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const result = await generatePromptAudiencesForBrand(brand);
        if (result.outcome === "cooldown") {
          res.setHeader("Retry-After", String(result.retryAfterSeconds));
          return res.status(429).json({
            success: false,
            error: "Audiences were generated recently. Try again later.",
            retryAfterSeconds: result.retryAfterSeconds,
          });
        }
        if (result.outcome === "upstream_error") {
          return res.status(502).json({ success: false, error: result.error });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to generate audiences");
      }
    }),
  );

  app.post(
    "/api/brand-prompts/:brandId/audiences",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        if (!name) return res.status(400).json({ success: false, error: "name required" });
        if (name.length > 60) {
          return res.status(400).json({ success: false, error: "name too long (max 60 chars)" });
        }
        const funnelStageRaw = req.body?.funnelStage;
        const funnelStage = ["TOFU", "MOFU", "BOFU"].includes(funnelStageRaw)
          ? funnelStageRaw
          : null;
        const description =
          typeof req.body?.description === "string" ? req.body.description.trim() || null : null;
        const result = await createPromptAudience(brand, { name, description, funnelStage });
        if (result.outcome === "duplicate") {
          return res.status(409).json({ success: false, error: "duplicate_audience" });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to create audience");
      }
    }),
  );

  app.delete(
    "/api/brand-prompts/:brandId/audiences/:audienceId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const audiences = await storage.getPromptAudiencesByBrandId(brand.id);
        if (!audiences.some((a) => a.id === req.params.audienceId)) {
          return res.status(404).json({ success: false, error: "Audience not found" });
        }
        await storage.deletePromptAudience(req.params.audienceId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete audience");
      }
    }),
  );

  app.post(
    "/api/brand-prompts/:brandId/prompts/:promptId/audiences",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const audienceId = req.body?.audienceId;
        if (typeof audienceId !== "string" || !audienceId) {
          return res.status(400).json({ success: false, error: "audienceId required" });
        }
        const [prompt, audiences] = await Promise.all([
          storage.getBrandPromptById(req.params.promptId),
          storage.getPromptAudiencesByBrandId(brand.id),
        ]);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        if (!audiences.some((a) => a.id === audienceId)) {
          return res.status(404).json({ success: false, error: "Audience not found" });
        }
        await storage.attachPromptAudience(prompt.id, audienceId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to attach audience");
      }
    }),
  );

  app.delete(
    "/api/brand-prompts/:brandId/prompts/:promptId/audiences/:audienceId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const prompt = await storage.getBrandPromptById(req.params.promptId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        await storage.detachPromptAudience(prompt.id, req.params.audienceId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to detach audience");
      }
    }),
  );

  // ============ SET HEALTH AUDIT ============

  app.get(
    "/api/brand-prompts/:brandId/set-health",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const run = await storage.getLatestSetHealthRun(brand.id);
        res.json({ success: true, data: run ?? null });
      } catch (error) {
        sendError(res, error, "Failed to load set health");
      }
    }),
  );

  app.post(
    "/api/brand-prompts/:brandId/set-health/run",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const result = await runSetHealthAuditForBrand(brand);
        if (result.outcome === "cooldown") {
          res.setHeader("Retry-After", String(result.retryAfterSeconds));
          return res.status(429).json({
            success: false,
            error: "Set Health was audited recently. Try again later.",
            retryAfterSeconds: result.retryAfterSeconds,
          });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to run set health audit");
      }
    }),
  );

  // ============ PHRASINGS ============
  // Exploratory rephrasings of one tracked prompt - deliberately NOT written
  // into geo_rankings (see migration 0099's comment), so these never affect
  // the tracked prompt's own Score/Δ/sparkline.

  app.get(
    "/api/brand-prompts/:brandId/prompts/:promptId/phrasings",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const prompt = await storage.getBrandPromptById(req.params.promptId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        const tests = await storage.getPhrasingTestsByPromptId(prompt.id);
        res.json({ success: true, data: tests });
      } catch (error) {
        sendError(res, error, "Failed to load phrasings");
      }
    }),
  );

  app.post(
    "/api/brand-prompts/:brandId/prompts/:promptId/phrasings/generate",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const prompt = await storage.getBrandPromptById(req.params.promptId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Prompt not found" });
        }
        const result = await generatePhrasingsForPrompt(brand, prompt);
        if (result.outcome === "upstream_error") {
          return res.status(502).json({ success: false, error: "AI returned no usable phrasings" });
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        sendError(res, error, "Failed to generate phrasings");
      }
    }),
  );

  // Runs one citation check per platform (6 in parallel) for one phrasing.
  app.post(
    "/api/brand-prompts/:brandId/phrasings/:phrasingId/analyze",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const test = await storage.getPhrasingTestById(req.params.phrasingId);
        if (!test) return res.status(404).json({ success: false, error: "Phrasing not found" });
        const prompt = await storage.getBrandPromptById(test.brandPromptId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Phrasing not found" });
        }

        const updated = await analyzePhrasing(brand, user.id, test);
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to analyze phrasing");
      }
    }),
  );

  // Archive a tracked prompt (drops it from weekly checks).
  app.delete(
    "/api/brand-prompts/:brandId/prompts/:promptId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const result = await archiveTrackedPrompt(brand, req.params.promptId);
        if (result.outcome === "not_found") {
          return res.status(404).json({ success: false, error: "Tracked prompt not found" });
        }
        if (result.outcome === "must_keep_one_tracked") {
          return res.status(400).json({
            success: false,
            error: "Keep at least one tracked prompt - accept a suggestion first",
          });
        }
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to archive prompt");
      }
    }),
  );

  // Per-prompt score history - powers the SCORE, Δ and 7-day sparkline
  // columns in the prompts table. Bucketing lives in
  // server/lib/promptScoreHistory.ts so it can be tested without a database.
  //
  // The join is on `brandPromptId`. The older /run/:runId/details endpoint
  // joins on prompt TEXT, which silently loses history whenever a prompt is
  // edited - this one does not, at the cost of ignoring rows written before
  // brandPromptId was populated.
  app.get(
    "/api/brand-prompts/:brandId/prompt-history",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const prompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const ids = prompts.map((p) => p.id);
        const rankings = await storage.getGeoRankingsByBrandPromptIds(ids);
        const data = buildPromptScoreHistory(ids, rankings, resolvePoints(req.query.points));
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to fetch prompt history");
      }
    }),
  );

  // List the stored prompts for a brand.
  //
  // Defaults to tracked-only, which is what every existing caller expects.
  // `?status=all` additionally returns archived rows - the prompts table needs
  // them so a prompt switched OFF stays visible and can be switched back on.
  // Without this the toggle is a one-way door: the row disappears on the next
  // refetch and nothing can reach it again.
  app.get(
    "/api/brand-prompts/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const requested = req.query.status;
        // Only "all" is honoured; anything else (including "suggested",
        // which has its own endpoint) falls back to the safe default.
        const status = requested === "all" ? "all" : "tracked";
        const prompts = await storage.getBrandPromptsByBrandId(brand.id, { status });
        // "all" in storage includes suggestions; those are a separate concept
        // with their own endpoint and must not leak into the tracked list.
        const data = status === "all" ? prompts.filter((p) => p.status !== "suggested") : prompts;
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to fetch brand prompts");
      }
    }),
  );

  // AI Visibility Checklist progress - server-side persistence so it
  // survives device switches and browser data clears.
  app.get(
    "/api/visibility-progress/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const rows = await storage.getVisibilityProgress(brand.id);
        // Reshape to { engineId: string[] } for the client.
        const grouped: Record<string, string[]> = {};
        for (const row of rows) {
          if (!grouped[row.engineId]) grouped[row.engineId] = [];
          grouped[row.engineId].push(row.stepId);
        }
        res.json({ success: true, data: grouped });
      } catch (error) {
        sendError(res, error, "Failed to fetch visibility progress");
      }
    }),
  );

  app.post(
    "/api/visibility-progress/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const { engineId, stepId } = req.body ?? {};
        if (typeof engineId !== "string" || typeof stepId !== "string" || !engineId || !stepId) {
          return res
            .status(400)
            .json({ success: false, error: "engineId and stepId are required" });
        }
        await storage.setVisibilityStep(brand.id, engineId, stepId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to save visibility progress");
      }
    }),
  );

  app.delete(
    "/api/visibility-progress/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const { engineId, stepId } = req.body ?? {};
        if (typeof engineId !== "string" || typeof stepId !== "string" || !engineId || !stepId) {
          return res
            .status(400)
            .json({ success: false, error: "engineId and stepId are required" });
        }
        await storage.unsetVisibilityStep(brand.id, engineId, stepId);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to clear visibility progress");
      }
    }),
  );

  // Run all 10 stored prompts against each platform and persist results.
  // Async kickoff: we create the citation_runs row synchronously, then
  // run a deadline-bounded slice (see citationChecker.kickoffBrandPromptsRun)
  // and return the runId. The client tracks completion via the
  // /citation-runs/state polling channel and drives any remainder via
  // /advance.
  app.post(
    "/api/brand-prompts/:brandId/run",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const platformsRaw: unknown = req.body?.platforms;
        const result = await startBrandCitationRun(brand, platformsRaw);

        if (result.outcome === "not_configured") {
          return res
            .status(503)
            .json({ success: false, error: "AI citation checks are not configured." });
        }
        if (result.outcome === "no_prompts") {
          return res
            .status(400)
            .json({ success: false, error: "No prompts found. Generate prompts first." });
        }
        if (result.outcome === "no_platforms_selected") {
          return res.status(400).json({
            success: false,
            error: "At least one platform must be selected.",
          });
        }
        if (result.outcome === "already_running") {
          return res.status(409).json({
            success: false,
            error: "already_running",
            data: { runId: result.runId },
          });
        }
        if (result.outcome === "start_failed") {
          return res.status(500).json({
            success: false,
            error: "Couldn't start run - please try again.",
          });
        }

        res.json({
          success: true,
          data: { runId: result.runId, status: "running" },
        });
      } catch (error) {
        sendError(res, error, "Failed to start brand citation check");
      }
    }),
  );

  // Citation cadence is non-configurable: scans run weekly for every
  // active brand via the auto-citation cron in server/scheduler.ts. The
  // user-facing PATCH /citation-schedule route was removed in
  // The auto_citation_* columns remain in
  // the schema as dormant fields.

  // Aggregated results for a brand's prompt runs.
  // Citation run history - returns all runs for the trend chart, newest first.
  app.get(
    "/api/brand-prompts/:brandId/history",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const runs = await storage.getCitationRunsByBrandId(brand.id, limit);
        res.json({ success: true, data: runs });
      } catch (error) {
        sendError(res, error, "Failed to fetch citation history");
      }
    }),
  );

  // ============ Live-update lifecycle ============
  //
  // Cheap "is any run live for this brand" gate. Hit by every dependent
  // page on an 8s interval; while the answer is non-empty those pages
  // bump their dependent queries onto a 6s refetchInterval and stop
  // polling once it goes empty (firing a one-time invalidate on the
  // transition).
  app.get(
    "/api/brands/:brandId/citation-runs/active",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const runs = await storage.getActiveCitationRuns(brand.id);
        res.json({ success: true, data: { runs } });
      } catch (error) {
        sendError(res, error, "Failed to fetch active citation runs");
      }
    }),
  );

  // Vercel migration: per-run progress snapshot for client polling.
  // Replaces the prior SSE endpoint (/api/brands/:brandId/citation-events).
  app.get(
    "/api/brands/:brandId/citation-runs/state",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        try {
          await requireBrand(req.params.brandId, user.id);
        } catch {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const brandId = req.params.brandId;
        const since = Math.max(0, Number(req.query.since) || 0);
        const sinceMs = since || Date.now() - 5 * 60 * 1000;

        const data = await buildCitationRunStateSnapshot(brandId, sinceMs);

        res.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.warn({ err: error }, "citation_runs.state_error");
        sendError(res, error, "Failed to read citation run state");
      }
    }),
  );

  // Advance one slice of a citation run. Driven by the client polling
  // loop on Vercel where the kickoff deadline may not have completed
  // the full 50-pair sweep, and by the daily cron drain step.
  app.post(
    "/api/brands/:brandId/citation-runs/:runId/advance",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        try {
          await requireBrand(req.params.brandId, user.id);
          // `:runId` is a sibling param - verify the run belongs to the
          // caller's brand, or a user could drive another tenant's run
          // (cross-tenant mutation + LLM cost). 404 on miss.
          const run = await requireCitationRun(req.params.runId, user.id);
          if (run.brandId !== req.params.brandId) {
            return res.status(404).json({ success: false, error: "Citation run not found" });
          }
        } catch (ownErr) {
          if (sendOwnershipError(res, ownErr)) return;
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const runId = req.params.runId;
        // 30s slice deadline. The advisory lock inside advanceCitationRun
        // serializes concurrent calls. Worst-case timeline under the 60s
        // Vercel cap: ~3s cold start + ~2s slice setup (run+rankings load)
        // + 30s of work + ~20s LLM tail (Perplexity has been observed
        // returning at 18s) + ~2s response flush = ~57s. Going higher
        // pushes us into 504 territory.
        const result = await advanceCitationRun(runId, Date.now() + 30000);
        res.json({
          success: true,
          data: { runId, done: result.done, status: result.status },
        });
      } catch (error) {
        logger.warn({ err: error }, "citation_runs.advance_error");
        sendError(res, error, "Failed to advance citation run");
      }
    }),
  );

  // Drill-down into a specific citation run - returns per-prompt × per-platform results.
  app.get(
    "/api/brand-prompts/:brandId/run/:runId/details",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        // `:runId` is a sibling param - confirm the run belongs to this brand
        // before returning its rows (which include raw LLM responses).
        const run = await requireCitationRun(req.params.runId, user.id);
        if (run.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "Citation run not found" });
        }
        const data = await buildRunDetails(brand, req.params.runId);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to fetch run details");
      }
    }),
  );

  // Re-run detection across every stored surface (geo_rankings, listicles,
  // wikipedia_mentions) using the shared matcher - no AI calls.
  app.post(
    "/api/brand-prompts/:brandId/re-detect-all",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const result = await reDetectAllForBrand(brand);
        if (result.outcome === "cooldown") {
          res.setHeader("Retry-After", String(result.retryAfterSeconds));
          return res.status(429).json({
            success: false,
            error: `Re-check rate-limited. Try again in ${result.retryAfterSeconds}s.`,
            retryAfterSeconds: result.retryAfterSeconds,
          });
        }

        res.json({
          success: true,
          data: result.data,
        });
      } catch (error) {
        sendError(res, error, "Failed to re-detect");
      }
    }),
  );

  // Prompt generation history for a brand.
  app.get(
    "/api/brand-prompts/:brandId/generations",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const generations = await storage.getPromptGenerationsByBrandId(brand.id);
        res.json({ success: true, data: generations });
      } catch (error) {
        sendError(res, error, "Failed to fetch prompt generations");
      }
    }),
  );

  app.get(
    "/api/brand-prompts/:brandId/results",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const data = await buildBrandPromptResults(brand, req.query.since);

        res.json({
          success: true,
          data,
        });
      } catch (error) {
        sendError(res, error, "Failed to fetch brand prompt results");
      }
    }),
  );
}
