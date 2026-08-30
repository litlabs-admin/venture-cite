// The v2 endpoint surface includes POST /scrape-one.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError, aiLimitMiddleware } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { normalizeHttps } from "../lib/factAgent/v2/planGuards";
import { getFactSheetRunById, getFactSheetPageById } from "../services/factSheetRuns";
import {
  scrapeFactSheetPage,
  searchFactSheetLlm,
  enrichFactSheetFromUser,
  extractFactSheetFromPaste,
} from "../services/factSheetV2Sources";
import {
  evaluateFactSheetRunGuards,
  createFactSheetPlan,
  startFactSheetFullRescrape,
  aggregateFactSheetRun,
} from "../services/factSheetV2Pipeline";

const scrapeOneSchema = z.object({
  runId: z.string().min(1),
  pageId: z.string().min(1),
});

const searchLlmSchema = z.object({
  runId: z.string().min(1),
});

const userEnrichSchema = z.object({
  runId: z.string().min(1),
});

const planSchema = z.object({
  brandId: z.string().min(1),
  triggeredBy: z.enum(["user_rescrape", "onboarding"]).optional().default("user_rescrape"),
});

const aggregateSchema = z.object({
  runId: z.string().min(1),
});

const fullRescrapeSchema = z.object({
  brandId: z.string().min(1),
});

const pasteSchema = z.object({
  text: z.string().min(1).max(50_000),
});

export function setupFactSheetV2Routes(app: Express): void {
  app.post(
    "/api/brand-fact-sheet/scrape-one",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = scrapeOneSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { runId, pageId } = parsed.data;

        const run = await getFactSheetRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const page = await getFactSheetPageById(pageId);
        if (!page || page.runId !== runId) {
          return res.status(404).json({ success: false, error: "Page not found" });
        }

        const outcome = await scrapeFactSheetPage({ runId, brand, page, startedAt });

        return res.status(200).json({
          success: true,
          runId,
          pageId,
          status: outcome.status,
          factCount: outcome.factCount,
          canonicalRedirect: outcome.canonicalRedirect,
          discoveredUrls: outcome.discoveredUrls,
          diagnostics: outcome.diagnostics,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.scrape-one failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.scrape-one" } });
        return sendError(res, err, "Failed to scrape page");
      }
    }),
  );

  app.post(
    "/api/brand-fact-sheet/search-llm",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = searchLlmSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await getFactSheetRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await searchFactSheetLlm({ runId, brand, startedAt });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.factCount,
          errorKind: outcome.errorKind,
          diagnostics: outcome.diagnostics,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.search-llm failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.search-llm" } });
        return sendError(res, err, "Failed to search-LLM");
      }
    }),
  );

  app.post(
    "/api/brand-fact-sheet/user-enrich",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = userEnrichSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await getFactSheetRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await enrichFactSheetFromUser({ runId, brand, startedAt });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.factCount,
          diagnostics: outcome.diagnostics,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.user-enrich failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.user-enrich" } });
        return sendError(res, err, "Failed to user-enrich");
      }
    }),
  );

  app.post(
    "/api/brand-fact-sheet/plan",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = planSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { brandId, triggeredBy } = parsed.data;
        const brand = await requireBrand(brandId, user.id);

        const normalized = normalizeHttps(brand.website ?? "");
        if (!normalized) {
          return res.status(400).json({
            success: false,
            error: "Brand website must be http(s) URL",
          });
        }

        const verdict = await evaluateFactSheetRunGuards(brand);

        if (!verdict.ok) {
          const body: Record<string, unknown> = {
            success: false,
            code: verdict.code,
            error: verdict.message,
          };
          if (verdict.code === "already_running") body.runId = verdict.runId;
          if (verdict.code === "cooldown") body.unlockAtMs = verdict.unlockAtMs;
          return res.status(verdict.status).json(body);
        }

        const { runId, pages } = await createFactSheetPlan({
          brandId,
          normalizedWebsite: normalized,
          triggeredBy,
        });

        return res.status(200).json({
          success: true,
          runId,
          pages,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.plan failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.plan" } });
        return sendError(res, err, "Failed to create plan");
      }
    }),
  );

  app.post(
    "/api/brand-fact-sheet/full-rescrape",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = fullRescrapeSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { brandId } = parsed.data;
        const brand = await requireBrand(brandId, user.id);

        const normalized = normalizeHttps(brand.website ?? "");
        if (!normalized) {
          return res
            .status(400)
            .json({ success: false, error: "Brand website must be http(s) URL" });
        }

        // Same guards as /plan so a server-driven re-scrape can't stack on
        // an in-flight run, ignore the cooldown, or bust the monthly cost
        // cap. The structured 409 shape matches /plan so the client renders
        // the same cooldown / already-running states.
        const verdict = await evaluateFactSheetRunGuards(brand);
        if (!verdict.ok) {
          const body: Record<string, unknown> = {
            success: false,
            code: verdict.code,
            error: verdict.message,
          };
          if (verdict.code === "already_running") body.runId = verdict.runId;
          if (verdict.code === "cooldown") body.unlockAtMs = verdict.unlockAtMs;
          return res.status(verdict.status).json(body);
        }

        await startFactSheetFullRescrape(brand);

        return res.status(200).json({ success: true });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.full-rescrape failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.full-rescrape" } });
        return sendError(res, err, "Failed to start re-scrape");
      }
    }),
  );

  app.post(
    "/api/brand-fact-sheet/aggregate",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = aggregateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await getFactSheetRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        await requireBrand(run.brandId, user.id);

        const result = await aggregateFactSheetRun({ runId, brandId: run.brandId });

        return res.status(200).json({
          success: true,
          runId,
          status: result.status,
          errorKind: result.errorKind,
          totalFacts: result.totalFacts,
          disagreementsIncremented: result.disagreementsIncremented,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.aggregate failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.aggregate" } });
        return sendError(res, err, "Failed to aggregate");
      }
    }),
  );

  app.post(
    "/api/brand-fact-sheet/runs/:runId/paste",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = pasteSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const runId = req.params.runId;
        if (!runId) {
          return res.status(400).json({ success: false, error: "runId required" });
        }

        const run = await getFactSheetRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await extractFactSheetFromPaste({
          runId,
          brand,
          text: parsed.data.text,
          startedAt,
        });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.factCount,
          diagnostics: outcome.diagnostics,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.paste failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.paste" } });
        return sendError(res, err, "Failed to extract from paste");
      }
    }),
  );
}
