// Brand prompts + visibility progress + citation schedule routes (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// Covers the brand-level citation prompt portfolio, prompt suggestions,
// visibility-checklist persistence, citation run history / drill-down,
// brand-mention detection backfill, and the citation-schedule PATCH.

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser, requireBrand } from "../lib/ownership";
import {
  runBrandPrompts,
  kickoffBrandPromptsRun,
  advanceCitationRun,
  DEFAULT_CITATION_PLATFORMS,
} from "../citationChecker";
import { generateBrandPrompts } from "../lib/promptGenerator";
import { generateSuggestedPrompts } from "../lib/suggestionGenerator";
import { aiLimitMiddleware, sendError, asyncHandler } from "../lib/routesShared";
import { detectBrandAndCompetitors, matchEntity } from "../lib/brandMatcher";
import { logger } from "../lib/logger";
import { waitUntil } from "@vercel/functions";

export function setupPromptsRoutes(app: Express): void {
  // ============ BRAND-LEVEL CITATION PROMPT PORTFOLIO ============

  // Seed the initial 10 tracked prompts for a brand. Refuses if tracked
  // prompts already exist — callers must use /reset for a destructive redo.
  app.post(
    "/api/brand-prompts/:brandId/generate",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
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
    }),
  );

  // Reset: archive every tracked prompt + suggestion, then seed a fresh 10.
  // Destructive — requires { confirm: true } in the body.
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
  // Wave 9.1: previously the route hard-required replaceTrackedId, which
  // forced users to nuke an existing prompt even after deleting one to
  // make room. Bad UX — the dialog now adapts based on whether there's
  // an open slot.
  const TRACKED_PROMPTS_CAP = 10;
  app.post(
    "/api/brand-prompts/:brandId/suggestions/:suggestionId/accept",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const replaceTrackedIdRaw =
          typeof req.body?.replaceTrackedId === "string" ? req.body.replaceTrackedId : "";
        const replaceTrackedId = replaceTrackedIdRaw.trim() || null;

        const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const suggestion = all.find(
          (p) => p.id === req.params.suggestionId && p.status === "suggested",
        );
        if (!suggestion) {
          return res
            .status(404)
            .json({ success: false, error: "Suggestion not found on this brand" });
        }

        const trackedCount = all.filter((p) => p.status === "tracked").length;

        if (replaceTrackedId) {
          // Replace path — must point at a real tracked prompt on this brand.
          const tracked = all.find((p) => p.id === replaceTrackedId && p.status === "tracked");
          if (!tracked) {
            return res
              .status(404)
              .json({ success: false, error: "Tracked prompt to replace not found" });
          }
          await storage.promoteSuggestionToTracked(suggestion.id, tracked.id);
          return res.json({ success: true, data: { mode: "replaced" } });
        }

        // Add path — only valid when there's an open slot.
        if (trackedCount >= TRACKED_PROMPTS_CAP) {
          return res.status(409).json({
            success: false,
            error: "tracked_set_full",
            data: { trackedCount, cap: TRACKED_PROMPTS_CAP },
          });
        }
        await storage.promoteSuggestionToTracked(suggestion.id, null);
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

  // Inline-edit the text of a tracked prompt.
  app.patch(
    "/api/brand-prompts/:brandId/prompts/:promptId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const newText = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
        if (!newText) {
          return res.status(400).json({ success: false, error: "prompt text required" });
        }
        const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const row = all.find((p) => p.id === req.params.promptId && p.status === "tracked");
        if (!row)
          return res.status(404).json({ success: false, error: "Tracked prompt not found" });
        const updated = await storage.updateBrandPromptText(row.id, newText);
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to update prompt");
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
        const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const row = all.find((p) => p.id === req.params.promptId && p.status === "tracked");
        if (!row)
          return res.status(404).json({ success: false, error: "Tracked prompt not found" });
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
    }),
  );

  // List the stored prompts for a brand.
  app.get(
    "/api/brand-prompts/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const prompts = await storage.getBrandPromptsByBrandId(brand.id);
        res.json({ success: true, data: prompts });
      } catch (error) {
        sendError(res, error, "Failed to fetch brand prompts");
      }
    }),
  );

  // AI Visibility Checklist progress — server-side persistence so it
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
  // /advance. The partial unique index from migration 0035 guarantees
  // only one in-flight run per brand — duplicate kickoffs (two tabs
  // racing) get 409 with the existing runId so the UI joins it.
  app.post(
    "/api/brand-prompts/:brandId/run",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
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

        // Wave 9.2: reject empty platforms array. Previously the kickoff
        // would happily create a run, do zero AI calls, and finalize as
        // status='failed' with an "All platform calls failed" error
        // message — a phantom failed row in History for nothing. The
        // dedup index would also block legitimate retries until the
        // phantom finalized.
        if (platforms.length === 0) {
          return res.status(400).json({
            success: false,
            error: "At least one platform must be selected.",
          });
        }

        const result = await kickoffBrandPromptsRun(brand.id, platforms, {
          triggeredBy: "manual",
        });
        if (!result.ok && result.reason === "already_running") {
          return res.status(409).json({
            success: false,
            error: "already_running",
            data: { runId: result.runId },
          });
        }
        // Wave 9.2: bounded-retry path can still return ok=false with no
        // runId in the rare race window. Surface as a generic 500 so the
        // client toast says "Couldn't start run" rather than silently
        // dropping.
        if (!result.ok) {
          return res.status(500).json({
            success: false,
            error: "Couldn't start run — please try again.",
          });
        }
        // Server-side drive: progress the run without requiring an open
        // browser tab. Additive — the client /citation-runs/state +
        // /advance loop still runs as the fast path when a tab is open
        // (Vercel Hobby has no frequent cron). advanceCitationRun holds a
        // per-run advisory lock internally, so server + client slices
        // can't double-process the same pairs. Whatever doesn't finish in
        // this function's window is resumed by the daily cron's
        // drainPendingCitationRuns — a tab is no longer REQUIRED.
        const driveRunId = result.runId;
        const driveDeadlineMs = Date.now() + 50_000;
        waitUntil(
          (async () => {
            try {
              while (Date.now() < driveDeadlineMs) {
                const sliceDeadlineMs = Math.min(driveDeadlineMs, Date.now() + 12_000);
                const outcome = await advanceCitationRun(driveRunId, sliceDeadlineMs);
                if (outcome.done) break;
                await new Promise((r) => setTimeout(r, 1_500));
              }
            } catch (err) {
              logger.warn({ err, runId: driveRunId }, "citation run: server-side drive failed");
            }
          })(),
        );

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
  // Foundations Plan 1 Task 11. The auto_citation_* columns remain in
  // the schema as dormant fields.

  // Aggregated results for a brand's prompt runs.
  // Citation run history — returns all runs for the trend chart, newest first.
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

  // ============ Wave 8: live-update lifecycle ============
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
  // Client polls every ~1s with its `?since=<unixMs>` cursor; server
  // returns each active run's progressPct/totalChecks/totalCited plus any
  // geo_rankings rows created since the cursor. `done: true` on a run's
  // slot signals the client to stop polling that run.
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

        const active = await storage.getActiveCitationRuns(brandId);
        const runs: Array<{
          runId: string;
          status: string;
          progressPct: number;
          totalChecks: number;
          totalCited: number;
          citationRate: number;
          rankings: Array<{ id: string; aiPlatform: string; isCited: boolean; checkedAt: string }>;
          done: boolean;
        }> = [];

        let nextSince = sinceMs;

        for (const r of active) {
          const live = await storage.getCitationRunLiveState(r.id);
          if (!live) continue;
          const recent = await storage.getRecentRankingsForRun(r.id, sinceMs, 100);
          for (const row of recent) {
            if (row.checkedAt) {
              const ms = new Date(row.checkedAt).getTime();
              if (ms > nextSince) nextSince = ms;
            }
          }
          runs.push({
            runId: r.id,
            status: live.status,
            progressPct: live.progressPct,
            totalChecks: live.totalChecks,
            totalCited: live.totalCited,
            citationRate: live.citationRate,
            rankings: recent.map((row) => ({
              id: row.id,
              aiPlatform: row.aiPlatform,
              isCited: !!row.isCited,
              checkedAt: row.checkedAt
                ? new Date(row.checkedAt).toISOString()
                : new Date().toISOString(),
            })),
            done: live.status !== "pending" && live.status !== "running",
          });
        }

        res.json({
          success: true,
          data: {
            runs,
            since: nextSince,
            hasActive: active.length > 0,
          },
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
        } catch {
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

  // Drill-down into a specific citation run — returns per-prompt × per-platform results.
  app.get(
    "/api/brand-prompts/:brandId/run/:runId/details",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const rankings = await storage.getGeoRankingsByRunId(req.params.runId);

        // Wave 9.2: build a prompt-text → orderIndex map so the result
        // accordion is in stable, user-meaningful order. With concurrency=5
        // in the runner, rankings come back in arbitrary completion order;
        // before this, the user saw "5, 1, 7, 2, …" with no consistent
        // reading order. Prompts no longer in the brand's set (deleted /
        // archived) sort to the end via MAX_SAFE_INTEGER.
        const allPrompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const orderIndexByText = new Map<string, number>();
        for (const p of allPrompts) {
          // First match wins — if a brand has two prompts with the same
          // text (rare but possible), we use the lowest orderIndex.
          if (!orderIndexByText.has(p.prompt)) {
            orderIndexByText.set(p.prompt, p.orderIndex);
          }
        }

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

        const sortedPrompts = Array.from(byPrompt.values()).sort((a, b) => {
          const ai = orderIndexByText.get(a.prompt) ?? Number.MAX_SAFE_INTEGER;
          const bi = orderIndexByText.get(b.prompt) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        });

        res.json({ success: true, data: { byPrompt: sortedPrompts } });
      } catch (error) {
        sendError(res, error, "Failed to fetch run details");
      }
    }),
  );

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
  app.post(
    "/api/brand-prompts/:brandId/re-detect-all",
    asyncHandler(async (req, res) => {
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

        // Wave 9.1: re-detect intentionally does NOT write a citation_runs
        // row. An earlier pass added one to fire the live banner, but
        // History is meant to be a record of fresh AI runs — re-detect
        // re-evaluates *existing* responses and adds nothing new to the
        // story. The completion toast is enough; no banner needed for an
        // operation that finishes in <2s and makes no AI calls.

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

          // Wave 9.1: route through the canonical aggregator. The previous
          // inline implementation was duplicated logic that drifted from
          // updates elsewhere; some users ended up with run headers showing
          // "2/50" while the drill-down summed to 16/50. Migration 0039
          // fixed the existing rows; using the helper here keeps future
          // re-detects in sync.
          for (const runId of Array.from(affectedRunIds)) {
            try {
              await storage.recomputeCitationRunAggregate(runId);
            } catch (err) {
              logger.warn(
                { err: err },
                `[re-detect-all] aggregate recompute failed for run ${runId}:`,
              );
            }
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
    }),
  );
}
