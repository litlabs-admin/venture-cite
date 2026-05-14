// Spec 2: Brand Fact Sheet redesign — run lifecycle + SSE + diff endpoints.
//
// REST surface (Batch L1 — Tasks 1-5 only):
//   POST   /api/brand-fact-sheet/runs                          create scrape run
//   GET    /api/brand-fact-sheet/runs/:runId                   read run + per-page state
//   POST   /api/brand-fact-sheet/runs/:runId/cancel            transition to 'cancelled' (CAS)
//   GET    /api/brand-fact-sheet/runs?brandId=                 list recent runs
//
// All routes scope by ownership via `requireUser` + `requireBrand`.
// 404 (not 403) on cross-tenant miss per anti-enumeration policy.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError } from "../lib/routesShared";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";

const SSE_SLICE_BUDGET_MS = 50_000; // < vercel.json maxDuration: 60s
const SSE_TICK_MS = 500;
const SSE_HEARTBEAT_MS = 15_000;

const TERMINAL_STATUSES = ["completed", "failed", "timeout", "cancelled"];

export function setupFactSheetRoutes(app: Express): void {
  // ────────────────────────────────────────────────────────────────────────
  // Task 5: GET /api/brand-fact-sheet/runs?brandId=...&limit=10
  // NOTE: must be registered BEFORE the /:runId variant so Express does not
  // greedily match the bare collection URL against the param route.
  // ────────────────────────────────────────────────────────────────────────
  const listRunsSchema = z.object({
    brandId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  });

  app.get(
    "/api/brand-fact-sheet/runs",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = listRunsSchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid query",
          });
        }
        const { brandId, limit } = parsed.data;
        await requireBrand(brandId, user.id);
        const runs = await storage.listScrapeRunsForBrand(brandId, limit);
        return res.status(200).json({ success: true, runs });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(error.status).json({ success: false, error: error.message });
        }
        return sendError(res, error, "Failed to list runs");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 3: GET /api/brand-fact-sheet/runs/:runId
  // ────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/brand-fact-sheet/runs/:runId",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const run = await storage.getScrapeRunById(req.params.runId);
        if (!run) {
          return res.status(404).json({ success: false, error: "Run not found" });
        }
        // Ownership: load brand to verify user.id matches; anti-enumeration 404.
        await requireBrand(run.brandId, user.id);

        const pages = await storage.listScrapePagesForRun(run.id);
        return res.status(200).json({ success: true, run, pages });
      } catch (error) {
        if (error instanceof OwnershipError) {
          // Cross-tenant returns the same 404 shape as not-found.
          return res.status(404).json({ success: false, error: "Run not found" });
        }
        return sendError(res, error, "Failed to load run");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 4: POST /api/brand-fact-sheet/runs/:runId/cancel
  // ────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/brand-fact-sheet/runs/:runId/cancel",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const run = await storage.getScrapeRunById(req.params.runId);
        if (!run) {
          return res.status(404).json({ success: false, error: "Run not found" });
        }
        await requireBrand(run.brandId, user.id);

        if (TERMINAL_STATUSES.includes(run.status)) {
          return res.status(409).json({
            success: false,
            code: "already_terminal",
            status: run.status,
            error: "Run is already in a terminal state.",
          });
        }

        // CAS: atomic transition only if status is still non-terminal.
        const updated = await storage.transitionScrapeRunStatusCAS(run.id, run.status, "cancelled");
        if (!updated) {
          return res.status(409).json({
            success: false,
            code: "status_changed",
            error: "Run status changed before cancel could apply.",
          });
        }

        logger.info({ runId: run.id, brandId: run.brandId }, "factSheet.runs.cancel: ok");
        return res.status(200).json({ success: true });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(404).json({ success: false, error: "Run not found" });
        }
        return sendError(res, error, "Failed to cancel run");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 6: GET /api/brand-fact-sheet/runs/:runId/stream (SSE)
  // ────────────────────────────────────────────────────────────────────────
  // SSE handler — mirrors server/routes/assistant.ts:293-312 (the correct
  // reference). DO NOT mirror server/routes/onboarding.ts:104-355 — that handler
  // is older and lacks: (a) 15s heartbeat (proxies time out at 30s+),
  // (b) req.on("close") abort handling (leaks setIntervals on disconnect),
  // (c) per-instance safety (uses an in-memory dedupe Map that breaks across
  // Vercel function instances). Spec 2 §4.5 explicitly cautions against the
  // onboarding pattern for this exact reason.
  app.get(
    "/api/brand-fact-sheet/runs/:runId/stream",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      // ---- Pre-flush auth/ownership check (returns JSON on failure) ----
      let runIdInitial: string;
      let userIdInitial: string;
      try {
        const user = requireUser(req);
        const initialRun = await storage.getScrapeRunById(req.params.runId);
        if (!initialRun) {
          return res.status(404).json({ success: false, error: "Run not found" });
        }
        await requireBrand(initialRun.brandId, user.id);
        runIdInitial = initialRun.id;
        userIdInitial = user.id;
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(404).json({ success: false, error: "Run not found" });
        }
        return sendError(res, error, "Failed to open stream");
      }

      // ---- Open SSE response ----
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      const heartbeat = setInterval(() => {
        if (!aborted) {
          try {
            res.write(": heartbeat\n\n");
          } catch {
            // ignore
          }
        }
      }, SSE_HEARTBEAT_MS);

      const lastEventId =
        (req.query.last_event_id as string | undefined) ||
        (req.headers["last-event-id"] as string | undefined);
      let { lastPageId, lastFactId } = parseLastEventId(lastEventId);

      let planEmitted = false;
      let progressLastEmitAt = 0;
      const startedAt = Date.now();

      try {
        while (!aborted) {
          const now = Date.now();
          const elapsed = now - startedAt;

          if (elapsed >= SSE_SLICE_BUDGET_MS) {
            sseWrite(res, "slice_pending", {
              lastEventId: `${lastPageId}:${lastFactId}`,
              reason: "slice_budget_reached",
            });
            break;
          }

          const run = await storage.getScrapeRunById(runIdInitial);
          if (!run) {
            sseWrite(res, "error", { kind: "not_found", message: "Run disappeared" });
            break;
          }

          if (!planEmitted && (run as any).plan) {
            sseWrite(res, "plan", {
              plan: (run as any).plan,
              expectedLanguages: (run as any).plan?.expectedLanguages ?? [],
            });
            planEmitted = true;
          }

          const pages = await storage.listScrapePagesForRun(runIdInitial);
          for (const p of pages) {
            const pid = String((p as any).id);
            if (lastPageId === "" || pid > lastPageId) {
              sseWrite(res, "page", {
                id: (p as any).id,
                url: (p as any).url,
                status: (p as any).status,
                factCount: (p as any).factCount ?? 0,
                bytes: (p as any).bytes ?? null,
                errorKind: (p as any).errorKind ?? null,
                lang: (p as any).lang ?? null,
              });
              lastPageId = pid;
            }
          }

          const facts = await storage.listFactsByRunIdSince(runIdInitial, lastFactId || null, 100);
          for (const f of facts) {
            sseWrite(res, "fact", {
              id: (f as any).id,
              domain: (f as any).domain,
              subcategory: (f as any).subcategory,
              factKey: (f as any).factKey,
              factValue: (f as any).factValue,
              valueType: (f as any).valueType,
              valuePayload: (f as any).valuePayload,
              confidence: (f as any).confidence,
              sourceUrl: (f as any).sourceUrl,
              sourceExcerpt: (f as any).sourceExcerpt,
            });
            lastFactId = String((f as any).id);
          }

          // ---- source-update events (Plan 5 Task 2) ----
          // Emit one event per v2 source (user_enrich, static_pages,
          // search_llm) whenever a log row exists for that source.
          // We read the full log list each tick and keep the latest entry
          // per source, so clients always see the most-recent status even if
          // an earlier tick was missed.
          try {
            const logs = await storage.listFactScrapeLogsForRun(runIdInitial);
            const bySource = new Map<string, (typeof logs)[number]>();
            for (const l of logs) bySource.set(l.source, l);

            const sourceMapping = [
              { dbSource: "user_enrich", emit: "userEnrich" },
              { dbSource: "static_pages", emit: "staticPages" },
              { dbSource: "search_llm", emit: "searchLlm" },
            ] as const;

            for (const m of sourceMapping) {
              const latest = bySource.get(m.dbSource);
              if (latest) {
                const payload = {
                  source: m.emit,
                  status:
                    latest.status === "done"
                      ? "done"
                      : latest.status === "failed"
                        ? "failed"
                        : "in_progress",
                  facts: latest.factCount,
                  errorKind: latest.errorKind,
                };
                res.write(`event: source-update\n`);
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
              }
            }
          } catch (err) {
            logger.warn({ err, runId: runIdInitial }, "SSE: source-update emit failed (non-fatal)");
          }

          if (now - progressLastEmitAt >= 2_000) {
            sseWrite(res, "progress", {
              status: run.status,
              pagesDone: (run as any).pagesFetched ?? 0,
              pagesTotal: (run as any).pagesPlanned ?? 0,
              factsExtracted: (run as any).factsExtracted ?? 0,
              costCents: (run as any).llmCostCents ?? 0,
            });
            progressLastEmitAt = now;
          }

          if ((run as any).errorKind && run.status === "failed") {
            sseWrite(res, "error", {
              kind: (run as any).errorKind,
              message: (run as any).errorMessage ?? "",
            });
          }

          if (TERMINAL_FOR_STREAM.includes(run.status)) {
            sseWrite(res, "done", {
              status: run.status,
              stats: {
                pagesFetched: (run as any).pagesFetched ?? 0,
                factsExtracted: (run as any).factsExtracted ?? 0,
                costCents: (run as any).llmCostCents ?? 0,
                errorKind: (run as any).errorKind ?? null,
              },
            });
            break;
          }

          await new Promise((r) => setTimeout(r, SSE_TICK_MS));
        }
      } catch (err) {
        captureAndFlush(err, {
          tags: { source: "factSheet.runs.stream", runId: runIdInitial },
        });
        if (!aborted) {
          sseWrite(res, "error", {
            kind: "stream_error",
            message: "Streaming halted unexpectedly.",
          });
        }
        logger.warn(
          { runId: runIdInitial, userId: userIdInitial },
          "factSheet.runs.stream: caught",
        );
      } finally {
        clearInterval(heartbeat);
        try {
          res.end();
        } catch {
          // ignore
        }
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 7: POST /api/brand-fact-sheet/facts/:factId/accept
  // ────────────────────────────────────────────────────────────────────────
  const acceptFactSchema = z.object({
    dismissOtherSide: z.boolean().optional().default(false),
  });

  app.post(
    "/api/brand-fact-sheet/facts/:factId/accept",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = acceptFactSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const fact = await storage.getBrandFactById(req.params.factId);
        if (!fact) {
          return res.status(404).json({ success: false, error: "Fact not found" });
        }
        await requireBrand(fact.brandId, user.id);

        const updated = await storage.acceptFact(fact.id, {
          dismissOtherSide: parsed.data.dismissOtherSide,
        });
        logger.info(
          {
            brandId: fact.brandId,
            factId: fact.id,
            domain: (fact as any).domain,
            subcategory: (fact as any).subcategory,
            factKey: (fact as any).factKey,
          },
          "factSheet.facts.accept",
        );
        return res.status(200).json({ success: true, fact: updated });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(404).json({ success: false, error: "Fact not found" });
        }
        return sendError(res, error, "Failed to accept fact");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 7: POST /api/brand-fact-sheet/facts/:factId/dismiss
  // ────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/brand-fact-sheet/facts/:factId/dismiss",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const fact = await storage.getBrandFactById(req.params.factId);
        if (!fact) {
          return res.status(404).json({ success: false, error: "Fact not found" });
        }
        await requireBrand(fact.brandId, user.id);

        const updated = await storage.dismissFact(fact.id);
        logger.info(
          {
            brandId: fact.brandId,
            factId: fact.id,
            domain: (fact as any).domain,
            subcategory: (fact as any).subcategory,
            factKey: (fact as any).factKey,
          },
          "factSheet.facts.dismiss",
        );
        return res.status(200).json({ success: true, fact: updated });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(404).json({ success: false, error: "Fact not found" });
        }
        return sendError(res, error, "Failed to dismiss fact");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 8: POST /api/brand-fact-sheet/facts/bulk-accept
  // ────────────────────────────────────────────────────────────────────────
  const bulkAcceptSchema = z.object({
    brandId: z.string().min(1),
    side: z.enum(["user", "scraped"]),
    domain: z.string().optional(),
    runId: z.string().optional(),
  });

  app.post(
    "/api/brand-fact-sheet/facts/bulk-accept",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = bulkAcceptSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { brandId, side, domain, runId } = parsed.data;
        await requireBrand(brandId, user.id);

        const conflicts = await storage.getBrandFactSheetConflicts(brandId);
        let affected = 0;
        for (const pair of conflicts) {
          if (domain && (pair.userFact as any).domain !== domain) continue;
          // MEDIUM 7: honor runId scope when provided.
          if (runId && (pair.scrapedFact as any).runId !== runId) continue;
          const keep = side === "user" ? pair.userFact : pair.scrapedFact;
          const drop = side === "user" ? pair.scrapedFact : pair.userFact;
          await storage.acceptFact(keep.id, { dismissOtherSide: false });
          await storage.dismissFact(drop.id);
          affected += 1;
        }
        logger.info({ brandId, side, domain, runId, affected }, "factSheet.facts.bulkAccept");
        return res.status(200).json({ success: true, affected });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(error.status).json({ success: false, error: error.message });
        }
        return sendError(res, error, "Failed to bulk-accept");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 9: GET /api/brand-fact-sheet/diff?brandId=...
  // ────────────────────────────────────────────────────────────────────────
  const diffQuerySchema = z.object({
    brandId: z.string().min(1),
  });

  app.get(
    "/api/brand-fact-sheet/diff",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = diffQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid query",
          });
        }
        await requireBrand(parsed.data.brandId, user.id);
        const flat = await storage.getBrandFactSheetConflicts(parsed.data.brandId);
        // CRITICAL 1: client expects domain-grouped record, not flat array.
        const conflicts: Record<string, typeof flat> = {};
        for (const pair of flat) {
          const domain = (pair.userFact as any).domain as string;
          if (!conflicts[domain]) conflicts[domain] = [];
          conflicts[domain].push(pair);
        }
        return res.status(200).json({ success: true, conflicts });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(error.status).json({ success: false, error: error.message });
        }
        return sendError(res, error, "Failed to load diff");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Plan 2.5 Task 5: GET /api/brand-fact-sheet/cost-status?brandId=...
  //
  // Spec 2 §5.4 + §4.9: surface the brand's monthly fact-scrape spend so the
  // UI can render "$X.XX of $5.00 used this month". If no cap row exists for
  // the current month yet, return defaults — lazy creation lives in the
  // first run-insert path, not here.
  // ────────────────────────────────────────────────────────────────────────
  const costStatusQuerySchema = z.object({
    brandId: z.string().min(1),
  });

  app.get(
    "/api/brand-fact-sheet/cost-status",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = costStatusQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid query",
          });
        }
        const { brandId } = parsed.data;
        // Ownership: anti-enumeration 404 via requireBrand.
        await requireBrand(brandId, user.id);

        const monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const cap = await storage.getMonthlyCostCap(brandId, monthKey);

        return res.status(200).json({
          factScrapeCents: cap?.factScrapeCents ?? 0,
          monthlyCapCents: cap?.monthlyCapCents ?? 500,
        });
      } catch (error) {
        if (error instanceof OwnershipError) {
          // Cross-tenant returns 404 (per CLAUDE.md anti-enumeration policy).
          return res.status(404).json({ success: false, error: "brand_not_found" });
        }
        return sendError(res, error, "Failed to load cost status");
      }
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Task 10: PATCH /api/brands/:brandId/fact-scrape-enabled
  // ────────────────────────────────────────────────────────────────────────
  const toggleEnabledSchema = z.object({
    enabled: z.boolean(),
  });

  app.patch(
    "/api/brands/:brandId/fact-scrape-enabled",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = toggleEnabledSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        await requireBrand(req.params.brandId, user.id);
        const updated = await storage.setBrandFactScrapeEnabled(
          req.params.brandId,
          parsed.data.enabled,
        );
        logger.info(
          { brandId: req.params.brandId, enabled: parsed.data.enabled },
          "factSheet.brand.toggleEnabled",
        );
        return res.status(200).json({ success: true, factScrapeEnabled: updated });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(error.status).json({ success: false, error: error.message });
        }
        return sendError(res, error, "Failed to toggle fact scrape");
      }
    }),
  );
}

// Reconnect cursor format: "<lastPageId>:<lastFactId>" (both ascending row ids).
// Both halves optional; an empty half = -infinity (replay from start).
function parseLastEventId(raw: string | undefined): {
  lastPageId: string;
  lastFactId: string;
} {
  if (!raw) return { lastPageId: "", lastFactId: "" };
  const [p = "", f = ""] = raw.split(":");
  return { lastPageId: p, lastFactId: f };
}

function sseWrite(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Write after end — ignore.
  }
}

const TERMINAL_FOR_STREAM = ["completed", "failed", "timeout", "cancelled"];
