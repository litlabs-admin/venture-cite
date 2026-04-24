// Brand prompts + visibility progress + citation schedule routes (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// Covers the brand-level citation prompt portfolio, prompt suggestions,
// visibility-checklist persistence, citation run history / drill-down,
// brand-mention detection backfill, and the citation-schedule PATCH.

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser, requireBrand } from "../lib/ownership";
import { runBrandPrompts, DEFAULT_CITATION_PLATFORMS } from "../citationChecker";
import { generateBrandPrompts } from "../lib/promptGenerator";
import { generateSuggestedPrompts } from "../lib/suggestionGenerator";
import { aiLimitMiddleware, sendError } from "../lib/routesShared";
import { detectBrandAndCompetitors, matchEntity } from "../lib/brandMatcher";

export function setupPromptsRoutes(app: Express): void {
  // ============ BRAND-LEVEL CITATION PROMPT PORTFOLIO ============

  // Seed the initial 10 tracked prompts for a brand. Refuses if tracked
  // prompts already exist — callers must use /reset for a destructive redo.
  app.post("/api/brand-prompts/:brandId/generate", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      const existing = await storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" });
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error:
            "Tracked prompts are already set. Use suggestions to evolve them, or reset to start over.",
        });
      }

      const { saved, error } = await generateBrandPrompts(brand);
      if (error || saved.length === 0) {
        return res.status(502).json({
          success: false,
          error: error || "AI returned no usable prompts. Please try again.",
        });
      }

      res.json({ success: true, data: saved });
    } catch (error) {
      sendError(res, error, "Failed to generate brand prompts");
    }
  });

  // Reset: archive every tracked prompt + suggestion, then seed a fresh 10.
  // Destructive — requires { confirm: true } in the body.
  app.post("/api/brand-prompts/:brandId/reset", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      if (req.body?.confirm !== true) {
        return res.status(400).json({ success: false, error: "confirm: true required" });
      }
      await storage.archiveBrandPrompts(brand.id);
      await storage.archiveSuggestedPrompts(brand.id);
      const { saved, error } = await generateBrandPrompts(brand);
      if (error || saved.length === 0) {
        return res
          .status(502)
          .json({ success: false, error: error || "AI returned no usable prompts." });
      }
      res.json({ success: true, data: saved });
    } catch (error) {
      sendError(res, error, "Failed to reset brand prompts");
    }
  });

  // List suggested prompts awaiting user review.
  app.get("/api/brand-prompts/:brandId/suggestions", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const suggestions = await storage.getBrandPromptsByBrandId(brand.id, { status: "suggested" });
      res.json({ success: true, data: suggestions });
    } catch (error) {
      sendError(res, error, "Failed to fetch suggestions");
    }
  });

  // Force-refresh suggestions now (also called after each weekly auto run).
  app.post(
    "/api/brand-prompts/:brandId/suggestions/refresh",
    aiLimitMiddleware,
    async (req, res) => {
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
    },
  );

  // Accept a suggestion by swapping it in for a specific tracked prompt.
  app.post("/api/brand-prompts/:brandId/suggestions/:suggestionId/accept", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const replaceTrackedId =
        typeof req.body?.replaceTrackedId === "string" ? req.body.replaceTrackedId : "";
      if (!replaceTrackedId) {
        return res.status(400).json({ success: false, error: "replaceTrackedId is required" });
      }

      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const suggestion = all.find(
        (p) => p.id === req.params.suggestionId && p.status === "suggested",
      );
      const tracked = all.find((p) => p.id === replaceTrackedId && p.status === "tracked");
      if (!suggestion || !tracked) {
        return res
          .status(404)
          .json({ success: false, error: "Suggestion or tracked prompt not found on this brand" });
      }

      await storage.promoteSuggestionToTracked(suggestion.id, tracked.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to accept suggestion");
    }
  });

  // Dismiss a suggestion.
  app.delete("/api/brand-prompts/:brandId/suggestions/:suggestionId", async (req, res) => {
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
  });

  // Inline-edit the text of a tracked prompt.
  app.patch("/api/brand-prompts/:brandId/prompts/:promptId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const newText = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
      if (!newText) {
        return res.status(400).json({ success: false, error: "prompt text required" });
      }
      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const row = all.find((p) => p.id === req.params.promptId && p.status === "tracked");
      if (!row) return res.status(404).json({ success: false, error: "Tracked prompt not found" });
      const updated = await storage.updateBrandPromptText(row.id, newText);
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update prompt");
    }
  });

  // Archive a tracked prompt (drops it from weekly checks).
  app.delete("/api/brand-prompts/:brandId/prompts/:promptId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const row = all.find((p) => p.id === req.params.promptId && p.status === "tracked");
      if (!row) return res.status(404).json({ success: false, error: "Tracked prompt not found" });
      const trackedCount = all.filter((p) => p.status === "tracked").length;
      if (trackedCount <= 1) {
        return res.status(400).json({
          success: false,
          error: "Keep at least one tracked prompt — accept a suggestion first",
        });
      }
      await storage.archiveBrandPrompt(row.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to archive prompt");
    }
  });

  // List the stored prompts for a brand.
  app.get("/api/brand-prompts/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      res.json({ success: true, data: prompts });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand prompts");
    }
  });

  // AI Visibility Checklist progress — server-side persistence so it
  // survives device switches and browser data clears.
  app.get("/api/visibility-progress/:brandId", async (req, res) => {
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
  });

  app.post("/api/visibility-progress/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { engineId, stepId } = req.body ?? {};
      if (typeof engineId !== "string" || typeof stepId !== "string" || !engineId || !stepId) {
        return res.status(400).json({ success: false, error: "engineId and stepId are required" });
      }
      await storage.setVisibilityStep(brand.id, engineId, stepId);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to save visibility progress");
    }
  });

  app.delete("/api/visibility-progress/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { engineId, stepId } = req.body ?? {};
      if (typeof engineId !== "string" || typeof stepId !== "string" || !engineId || !stepId) {
        return res.status(400).json({ success: false, error: "engineId and stepId are required" });
      }
      await storage.unsetVisibilityStep(brand.id, engineId, stepId);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to clear visibility progress");
    }
  });

  // Run all 10 stored prompts against each platform and persist results.
  app.post("/api/brand-prompts/:brandId/run", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(503)
          .json({ success: false, error: "AI citation checks are not configured." });
      }

      const existing = await storage.getBrandPromptsByBrandId(brand.id);
      if (existing.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No prompts found. Generate prompts first." });
      }

      const platformsRaw: unknown = req.body?.platforms;
      const platforms: string[] = (
        Array.isArray(platformsRaw) ? platformsRaw : [...DEFAULT_CITATION_PLATFORMS]
      )
        .filter((p): p is string => typeof p === "string")
        .slice(0, 5);

      const { totalChecks, totalCited } = await runBrandPrompts(brand.id, platforms);
      const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;
      res.json({ success: true, data: { totalChecks, totalCited, citationRate } });
    } catch (error) {
      sendError(res, error, "Failed to run brand citation check");
    }
  });

  // Update auto-citation schedule for a brand.
  app.patch("/api/brands/:brandId/citation-schedule", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { schedule, day } = req.body || {};
      const validSchedules = ["off", "weekly", "biweekly", "monthly"];
      if (schedule && !validSchedules.includes(schedule)) {
        return res.status(400).json({
          success: false,
          error: "Invalid schedule. Must be one of: off, weekly, biweekly, monthly.",
        });
      }
      const update: Record<string, any> = {};
      if (schedule !== undefined) update.autoCitationSchedule = schedule;
      if (day !== undefined) update.autoCitationDay = Math.max(0, Math.min(6, Number(day) || 0));
      await storage.updateBrand(brand.id, update);
      const updated = await storage.getBrandById(brand.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update citation schedule");
    }
  });

  // Aggregated results for a brand's prompt runs.
  // Citation run history — returns all runs for the trend chart, newest first.
  app.get("/api/brand-prompts/:brandId/history", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const runs = await storage.getCitationRunsByBrandId(brand.id, limit);
      res.json({ success: true, data: runs });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation history");
    }
  });

  // Drill-down into a specific citation run — returns per-prompt × per-platform results.
  app.get("/api/brand-prompts/:brandId/run/:runId/details", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrand(req.params.brandId, user.id);
      const rankings = await storage.getGeoRankingsByRunId(req.params.runId);

      // Group by prompt text (since prompts may have been deleted/archived)
      const byPrompt = new Map<
        string,
        {
          prompt: string;
          platforms: Array<{
            platform: string;
            isCited: boolean;
            snippet: string | null;
            fullResponse: string | null;
            checkedAt: string;
            reDetectedAt: string | null;
          }>;
        }
      >();
      for (const r of rankings) {
        const key = r.prompt;
        if (!byPrompt.has(key)) {
          byPrompt.set(key, { prompt: key, platforms: [] });
        }
        const ctx = r.citationContext || "";
        const delimIdx = ctx.indexOf("||| RAW_RESPONSE |||");
        const oldDelimIdx = ctx.indexOf("--- RAW RESPONSE ---");
        let snippet: string | null = null;
        let fullResponse: string | null = null;
        if (delimIdx !== -1) {
          snippet = ctx.substring(0, delimIdx).trim();
          fullResponse = ctx.substring(delimIdx + 20).trim();
        } else if (oldDelimIdx !== -1) {
          snippet = ctx.substring(0, oldDelimIdx).trim();
          fullResponse = ctx.substring(oldDelimIdx + 20).trim();
        } else if (ctx) {
          snippet = ctx;
        }
        byPrompt.get(key)!.platforms.push({
          platform: r.aiPlatform,
          isCited: r.isCited === 1,
          snippet,
          fullResponse,
          checkedAt: r.checkedAt?.toISOString() || new Date().toISOString(),
          reDetectedAt: (r as any).reDetectedAt
            ? ((r as any).reDetectedAt as Date).toISOString()
            : null,
        });
      }

      res.json({ success: true, data: { byPrompt: Array.from(byPrompt.values()) } });
    } catch (error) {
      sendError(res, error, "Failed to fetch run details");
    }
  });

  // Per-brand in-memory rate limit. Matcher-only re-checks are cheap but
  // iterating thousands of stored rows still burns DB bandwidth; 60s keeps
  // repeated button clicks from stampeding.
  const reDetectLastRunAt = new Map<string, number>();
  const RE_DETECT_COOLDOWN_MS = 60_000;

  // Re-run detection across every stored surface (geo_rankings, listicles,
  // wikipedia_mentions) using the shared matcher — no AI calls. Picks up
  // new name variations added since the original run so historical rows
  // stay aligned with the current detector. Rank stays null on rows that
  // flip to cited here (the rank signal came from the original LLM pass).
  app.post("/api/brand-prompts/:brandId/re-detect-all", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      const last = reDetectLastRunAt.get(brand.id) ?? 0;
      const since = Date.now() - last;
      if (since < RE_DETECT_COOLDOWN_MS) {
        return res.status(429).json({
          success: false,
          error: `Re-check rate-limited. Try again in ${Math.ceil(
            (RE_DETECT_COOLDOWN_MS - since) / 1000,
          )}s.`,
        });
      }
      reDetectLastRunAt.set(brand.id, Date.now());

      const startedAt = Date.now();
      const competitors = await storage.getCompetitors(brand.id);
      const brandEntity = {
        id: brand.id,
        name: brand.name,
        nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
        website: brand.website ?? null,
      };
      const competitorEntities = competitors.map((c) => ({
        id: c.id,
        name: c.name,
        nameVariations: Array.isArray((c as any).nameVariations)
          ? ((c as any).nameVariations as string[])
          : [],
        domain: c.domain ?? null,
      }));

      const counts = { rankings: 0, listicles: 0, wikipedia: 0, newlyCited: 0 };
      const affectedRunIds = new Set<string>();

      // --- geo_rankings ---
      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      if (prompts.length > 0) {
        const rankings = await storage.getGeoRankingsByBrandPromptIds(prompts.map((p) => p.id));
        for (const r of rankings) {
          const ctx = r.citationContext || "";
          const delimIdx = ctx.indexOf("||| RAW_RESPONSE |||");
          const oldDelimIdx = ctx.indexOf("--- RAW RESPONSE ---");
          let responseText = "";
          if (delimIdx !== -1) {
            responseText = ctx.substring(delimIdx + "||| RAW_RESPONSE |||".length).trim();
          } else if (oldDelimIdx !== -1) {
            responseText = ctx.substring(oldDelimIdx + "--- RAW RESPONSE ---".length).trim();
          }
          if (!responseText) continue;

          const result = detectBrandAndCompetitors(responseText, brandEntity, competitorEntities);
          const newIsCited = result.brand.matched ? 1 : 0;
          const becameCited = newIsCited === 1 && r.isCited === 0;
          const isChanged = newIsCited !== r.isCited;

          if (isChanged) {
            const patch: Record<string, unknown> = {
              isCited: newIsCited,
              // Rank came from the original LLM run. If this re-check reveals
              // a new citation we have no honest way to assign rank, so
              // null it and badge the row as re-detected.
              rank: becameCited ? null : r.rank,
            };
            if (becameCited) {
              patch.reDetectedAt = new Date();
              counts.newlyCited += 1;
            }
            const newStatusLine = newIsCited === 1 ? "Cited" : "Not cited";
            patch.citationContext = `${newStatusLine}\n\n||| RAW_RESPONSE |||\n${responseText}`;
            await storage.updateGeoRanking(r.id, patch as any);
            counts.rankings += 1;
            if (r.runId) affectedRunIds.add(r.runId);
          }
        }

        // Re-aggregate affected citation_runs so the UI shows updated
        // citationRate / platformBreakdown without waiting for a fresh run.
        for (const runId of Array.from(affectedRunIds)) {
          const runRows = await storage.getGeoRankingsByRunId(runId);
          const totalChecks = runRows.length;
          const totalCited = runRows.filter((x) => x.isCited === 1).length;
          const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;
          const platformMap = new Map<string, { cited: number; checks: number }>();
          for (const x of runRows) {
            const e = platformMap.get(x.aiPlatform) || { cited: 0, checks: 0 };
            e.checks += 1;
            if (x.isCited === 1) e.cited += 1;
            platformMap.set(x.aiPlatform, e);
          }
          const platformBreakdown = Object.fromEntries(
            Array.from(platformMap.entries()).map(([p, s]) => [
              p,
              { ...s, rate: s.checks > 0 ? Math.round((s.cited / s.checks) * 100) : 0 },
            ]),
          );
          await storage.updateCitationRun(runId, {
            totalChecks,
            totalCited,
            citationRate,
            platformBreakdown,
          });
        }
      }

      // --- listicles ---
      const listicles = await storage.getListicles(brand.id).catch(() => [] as any[]);
      for (const l of listicles) {
        // No raw page text is persisted — use title + stored item names as the
        // searchable surface. Accurate for the common case where listicle
        // items contain the brand name.
        const searchText = [l.title ?? "", ...((l.competitorsMentioned ?? []) as string[])].join(
          " \n ",
        );
        if (!searchText.trim()) continue;
        const r = matchEntity(searchText, brandEntity);
        const newIsIncluded = r.matched ? 1 : 0;
        if (newIsIncluded !== l.isIncluded) {
          await storage.updateListicle(l.id, { isIncluded: newIsIncluded });
          counts.listicles += 1;
        }
      }

      // --- wikipedia_mentions ---
      const wikiRows = await storage.getWikipediaMentions(brand.id).catch(() => [] as any[]);
      for (const w of wikiRows) {
        const text = w.mentionContext ?? "";
        if (!text) continue;
        const r = matchEntity(text, brandEntity);
        const newType: "existing" | "opportunity" = r.matched ? "existing" : "opportunity";
        const newActive = r.matched ? 1 : 0;
        const typeChanged = newType !== w.mentionType;
        const activeChanged = newActive !== w.isActive;
        if (typeChanged || activeChanged) {
          await storage.updateWikipediaMention(w.id, {
            mentionType: newType,
            isActive: newActive,
          });
          counts.wikipedia += 1;
        }
      }

      res.json({
        success: true,
        data: {
          counts,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to re-detect");
    }
  });

  // Prompt generation history for a brand.
  app.get("/api/brand-prompts/:brandId/generations", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const generations = await storage.getPromptGenerationsByBrandId(brand.id);
      res.json({ success: true, data: generations });
    } catch (error) {
      sendError(res, error, "Failed to fetch prompt generations");
    }
  });

  app.get("/api/brand-prompts/:brandId/results", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      if (prompts.length === 0) {
        return res.json({
          success: true,
          data: { byPlatform: [], byPrompt: [], totalChecks: 0, totalCited: 0, citationRate: 0 },
        });
      }

      const promptIds = prompts.map((p) => p.id);
      const sinceParam =
        typeof req.query.since === "string" ? new Date(req.query.since) : undefined;
      const sinceDate = sinceParam && !isNaN(sinceParam.getTime()) ? sinceParam : undefined;

      const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds, sinceDate);

      // Keep only the latest row per (promptId, platform) so re-runs don't inflate counts.
      const latestByKey = new Map<string, (typeof rankings)[number]>();
      for (const r of rankings) {
        const key = `${r.brandPromptId}__${r.aiPlatform}`;
        const existing = latestByKey.get(key);
        if (!existing || r.checkedAt > existing.checkedAt) latestByKey.set(key, r);
      }
      const latest = Array.from(latestByKey.values());

      const platformMap = new Map<
        string,
        { platform: string; cited: number; checks: number; lastRun: Date | null }
      >();
      type PlatformEntry = {
        platform: string;
        isCited: boolean;
        snippet: string | null;
        fullResponse: string | null;
        checkedAt: Date;
        reDetectedAt: Date | null;
      };
      const promptMap = new Map<
        string,
        { promptId: string; prompt: string; rationale: string | null; platforms: PlatformEntry[] }
      >();
      for (const p of prompts)
        promptMap.set(p.id, {
          promptId: p.id,
          prompt: p.prompt,
          rationale: p.rationale,
          platforms: [],
        });

      // citationContext is stored as "{snippet}\n\n||| RAW_RESPONSE |||\n{full}"
      // (current format) or "{snippet}\n\n--- RAW RESPONSE ---\n{full}" (older
      // format written before 2026-04-16). Support both so existing rows
      // render correctly without requiring a re-run.
      const splitContext = (
        ctx: string | null,
      ): { snippet: string | null; fullResponse: string | null } => {
        if (!ctx) return { snippet: null, fullResponse: null };
        const markers = ["\n\n||| RAW_RESPONSE |||\n", "\n\n--- RAW RESPONSE ---\n"];
        for (const marker of markers) {
          const idx = ctx.indexOf(marker);
          if (idx !== -1) {
            return {
              snippet: ctx.slice(0, idx).trim() || null,
              fullResponse: ctx.slice(idx + marker.length).trim() || null,
            };
          }
        }
        return { snippet: ctx, fullResponse: null };
      };

      let totalCited = 0;
      for (const r of latest) {
        const plat = platformMap.get(r.aiPlatform) || {
          platform: r.aiPlatform,
          cited: 0,
          checks: 0,
          lastRun: null,
        };
        plat.checks += 1;
        if (r.isCited) {
          plat.cited += 1;
          totalCited += 1;
        }
        if (!plat.lastRun || r.checkedAt > plat.lastRun) plat.lastRun = r.checkedAt;
        platformMap.set(r.aiPlatform, plat);

        if (r.brandPromptId) {
          const promptRow = promptMap.get(r.brandPromptId);
          if (promptRow) {
            const { snippet, fullResponse } = splitContext(r.citationContext);
            promptRow.platforms.push({
              platform: r.aiPlatform,
              isCited: r.isCited === 1,
              snippet,
              fullResponse,
              checkedAt: r.checkedAt,
              reDetectedAt: (r as any).reDetectedAt ?? null,
            });
          }
        }
      }

      const byPlatform = Array.from(platformMap.values()).map((p) => ({
        ...p,
        citationRate: p.checks > 0 ? Math.round((p.cited / p.checks) * 100) : 0,
      }));
      const byPrompt = Array.from(promptMap.values());
      const totalChecks = latest.length;
      const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;

      res.json({
        success: true,
        data: { byPlatform, byPrompt, totalChecks, totalCited, citationRate },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand prompt results");
    }
  });
}
