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
  DEFAULT_CITATION_PLATFORMS,
} from "../citationChecker";
import { generateBrandPrompts } from "../lib/promptGenerator";
import { generateSuggestedPrompts } from "../lib/suggestionGenerator";
import { aiLimitMiddleware, sendError } from "../lib/routesShared";
import { detectBrandAndCompetitors, matchEntity } from "../lib/brandMatcher";
import { logger } from "../lib/logger";

// Wave 9: module-scoped SSE registry for the per-user connection cap. Maps
// userId -> Map<symbol, closer>. Map preserves insertion order, so calling
// `keys().next().value` gives us the oldest stream for FIFO eviction. We
// never grow unbounded — each cleanup deletes its key, and the outer entry
// is removed when the user has no streams left.
const sseStreams = new Map<string, Map<symbol, () => void>>();

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
  app.post("/api/brand-prompts/:brandId/suggestions/:suggestionId/accept", async (req, res) => {
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
  // Wave 9: async kickoff. Previously this awaited runBrandPrompts in-line
  // (30-120s of held-open HTTP — blew through every reverse-proxy idle
  // timeout and produced lying "Check failed" toasts on successful runs).
  // We now create the citation_runs row synchronously, schedule the run on
  // setImmediate, and return the runId. Client switches entirely to the
  // SSE/polling channel for completion. The partial unique index from
  // migration 0035 guarantees only one in-flight run per brand — duplicate
  // kickoffs (e.g. two tabs racing) get 409 with the existing runId so the
  // UI can join the existing stream rather than starting a duplicate.
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
      res.json({
        success: true,
        data: { runId: result.runId, status: "running" },
      });
    } catch (error) {
      sendError(res, error, "Failed to start brand citation check");
    }
  });

  // Update auto-citation schedule for a brand.
  // Wave 9: accepts hour (0-23 UTC) and active (bool) in addition to the
  // schedule + day fields. Hour controls when on the chosen day the run
  // fires; active pauses the schedule without losing the day/hour pick.
  app.patch("/api/brands/:brandId/citation-schedule", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { schedule, day, hour, active } = req.body || {};
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
      if (hour !== undefined)
        update.autoCitationHour = Math.max(0, Math.min(23, Number(hour) || 0));
      if (active !== undefined) update.autoCitationActive = Boolean(active);
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

  // ============ Wave 8: live-update lifecycle ============
  //
  // Cheap "is any run live for this brand" gate. Hit by every dependent
  // page on an 8s interval; while the answer is non-empty those pages
  // bump their dependent queries onto a 6s refetchInterval and stop
  // polling once it goes empty (firing a one-time invalidate on the
  // transition).
  app.get("/api/brands/:brandId/citation-runs/active", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const runs = await storage.getActiveCitationRuns(brand.id);
      res.json({ success: true, data: { runs } });
    } catch (error) {
      sendError(res, error, "Failed to fetch active citation runs");
    }
  });

  // SSE stream of run progress + per-ranking events for the active brand.
  // The Citations page subscribes when a run is live. EventSource can't
  // send Authorization headers, so auth happens via ?token=<JWT> validated
  // inline (and the path is in SELF_AUTHED_PREFIXES so the global Bearer
  // guard skips it).
  //
  // Polling-based — the handler ticks every SSE_TICK_MS and emits:
  //   - `progress` whenever progressPct/totalChecks/totalCited change
  //   - `ranking` for new geo_rankings rows since the last tick
  //   - `complete` when the run reaches a terminal status
  // Connection is capped at SSE_MAX_DURATION_MS so a hung tab doesn't
  // hold a slot forever; the client reconnects.
  app.get("/api/brands/:brandId/citation-events", async (req, res) => {
    const SSE_TICK_MS = 1_000;
    const SSE_MAX_DURATION_MS = 5 * 60 * 1000;
    const SSE_HEARTBEAT_MS = 20_000;
    try {
      // Auth: ?token=<JWT> (since EventSource can't send headers).
      const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : null;
      const headerAuth = req.headers.authorization;
      const token = tokenFromQuery
        ? tokenFromQuery
        : headerAuth?.startsWith("Bearer ")
          ? headerAuth.slice(7)
          : null;
      if (!token) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const { supabaseAdmin } = await import("../supabase");
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const userId = data.user.id;

      // Verify ownership of the brand. requireBrand throws OwnershipError
      // (404) on a miss, which we catch and return as 404.
      try {
        await requireBrand(req.params.brandId, userId);
      } catch {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const brandId = req.params.brandId;

      // Wave 9: per-user connection cap. A misbehaving client opening 50
      // tabs would otherwise hold 50 polling connections each ticking at
      // 1s. Cap at 3 streams per user; on the 4th, close the oldest.
      // Map insertion order is preserved, so the first-key semantics give
      // us oldest-first eviction.
      const SSE_PER_USER_CAP = 3;
      const userStreams = sseStreams.get(userId) ?? new Map<symbol, () => void>();
      while (userStreams.size >= SSE_PER_USER_CAP) {
        const oldestKey = userStreams.keys().next().value;
        if (!oldestKey) break;
        const closeOld = userStreams.get(oldestKey);
        userStreams.delete(oldestKey);
        try {
          closeOld?.();
        } catch {
          /* ignore */
        }
      }
      sseStreams.set(userId, userStreams);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: string, payload: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // Track state per-run so we don't re-emit identical progress and
      // don't re-emit rankings we've already pushed.
      const runState = new Map<
        string,
        { lastPct: number; lastTotalChecks: number; lastSinceMs: number }
      >();

      const startedAt = Date.now();
      let cancelled = false;
      // Wave 9: heartbeat. Comment frames keep idle proxies (Cloudflare 100s,
      // ALB 60s) from killing the connection during quiet periods between
      // ticks. Sent every 20s — well under any standard proxy idle timeout.
      const heartbeat = setInterval(() => {
        if (cancelled) return;
        try {
          res.write(": ping\n\n");
        } catch {
          /* socket already closed */
        }
      }, SSE_HEARTBEAT_MS);

      const streamKey = Symbol("sse");
      const cleanup = () => {
        cancelled = true;
        clearInterval(heartbeat);
        userStreams.delete(streamKey);
        if (userStreams.size === 0) sseStreams.delete(userId);
      };
      userStreams.set(streamKey, () => {
        try {
          send("end", { reason: "evicted" });
        } catch {
          /* ignore */
        }
        try {
          res.end();
        } catch {
          /* ignore */
        }
        cleanup();
      });
      req.on("close", cleanup);

      const tick = async () => {
        if (cancelled) return;
        if (Date.now() - startedAt > SSE_MAX_DURATION_MS) {
          // Wave 9: signal client to reconnect rather than just dropping.
          // Client's onEnd handler refreshes the JWT and re-opens if still
          // active.
          send("end", { reason: "timeout", reconnect: true });
          cleanup();
          return res.end();
        }
        try {
          const active = await storage.getActiveCitationRuns(brandId);
          // Initialize state for any newly-seen run.
          for (const r of active) {
            if (!runState.has(r.id)) {
              runState.set(r.id, {
                lastPct: -1,
                lastTotalChecks: -1,
                // Wave 9: backfill from the run's startedAt rather than a
                // fixed 60s window. On (re)connect to a long-running run,
                // every existing ranking is replayed as a `ranking` event so
                // the Latest Results UI populates immediately.
                lastSinceMs: r.startedAt ? new Date(r.startedAt).getTime() : Date.now() - 60_000,
              });
            }
          }
          // Emit progress + ranking events for each known run.
          for (const [runId, state] of Array.from(runState.entries())) {
            const live = await storage.getCitationRunLiveState(runId);
            if (!live) continue;
            if (live.progressPct !== state.lastPct || live.totalChecks !== state.lastTotalChecks) {
              send("progress", {
                runId,
                progressPct: live.progressPct,
                totalChecks: live.totalChecks,
                totalCited: live.totalCited,
                citationRate: live.citationRate,
                status: live.status,
              });
              state.lastPct = live.progressPct;
              state.lastTotalChecks = live.totalChecks;
            }
            // Per-ranking events since cursor.
            const recent = await storage.getRecentRankingsForRun(runId, state.lastSinceMs, 50);
            for (const r of recent) {
              send("ranking", {
                runId,
                rankingId: r.id,
                aiPlatform: r.aiPlatform,
                isCited: r.isCited,
              });
              if (r.checkedAt) {
                const ms = new Date(r.checkedAt).getTime();
                if (ms > state.lastSinceMs) state.lastSinceMs = ms;
              }
            }
            // Terminal? Emit complete and stop tracking.
            if (live.status !== "pending" && live.status !== "running") {
              send("complete", {
                runId,
                status: live.status,
                citationRate: live.citationRate,
                totalChecks: live.totalChecks,
                totalCited: live.totalCited,
              });
              runState.delete(runId);
            }
          }
          // If there are no active runs AND no in-flight tracked state,
          // close the stream — client will reconnect when it sees a
          // new active run via the polling status gate.
          if (active.length === 0 && runState.size === 0) {
            send("end", { reason: "no_active_runs" });
            cleanup();
            return res.end();
          }
        } catch (err) {
          // Don't tear down the stream on a transient DB blip.
          // Wave 9: use structured logger per CLAUDE.md.
          logger.warn({ err, brandId, userId }, "citation_events.tick_error");
        }
        setTimeout(tick, SSE_TICK_MS);
      };
      setTimeout(tick, SSE_TICK_MS);
    } catch (error) {
      sendError(res, error, "Failed to open citation events stream");
    }
  });

  // Drill-down into a specific citation run — returns per-prompt × per-platform results.
  app.get("/api/brand-prompts/:brandId/run/:runId/details", async (req, res) => {
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
            console.warn(
              `[re-detect-all] aggregate recompute failed for run ${runId}:`,
              err instanceof Error ? err.message : err,
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
