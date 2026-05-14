// v2 endpoint surface — Plan 2 ships only POST /scrape-one.
// Plans 3-5 add /search-llm, /user-enrich, /plan, /aggregate, /paste, etc.

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError, aiLimitMiddleware, openai } from "../lib/routesShared";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { runStaticSource } from "../lib/factAgent/v2/sourceStatic";
import { runSearchSource } from "../lib/factAgent/v2/sourceSearch";
import { runUserEnrichSource } from "../lib/factAgent/v2/sourceUserEnrich";
import { persistUserFacts } from "../lib/factAgent/v2/persistUserFacts";
import { safeFetchTextWithLockedIp } from "../lib/ssrf";
import { createRobotsCache } from "../lib/factAgent/robotsCache";
import { persistFacts } from "../lib/factAgent/persistFacts";
import { callWithFailover, type ProviderClient } from "../lib/factAgent/v2/llmFailover";
import { MODELS, OPENROUTER_BASE_URL } from "../lib/modelConfig";
import { discoverSitemapUrls } from "../lib/factAgent/v2/sitemapDiscovery";
import { selectTopUrls } from "../lib/factAgent/v2/urlTierScoring";
import { normalizeHttps, evaluatePlanGuards } from "../lib/factAgent/v2/planGuards";
import { canonicalizeUrl } from "../lib/factAgent/canonicalize";
import { runAggregate } from "../lib/factAgent/v2/aggregate";
import { persistPasteFacts } from "../lib/factAgent/v2/persistPasteFacts";
import { buildExtractionPrompt, parseFactsWithRepair } from "../lib/factAgent/v2/extractionPrompt";

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

const pasteSchema = z.object({
  text: z.string().min(1).max(50_000),
});

// OpenAI primary provider client adapter — wraps the existing singleton.
const openaiProvider: ProviderClient = {
  name: "openai",
  async call(prompt) {
    const messages =
      typeof prompt === "string"
        ? [{ role: "user" as const, content: prompt }]
        : [
            { role: "system" as const, content: prompt.system },
            { role: "user" as const, content: prompt.user },
          ];
    const res = await openai.chat.completions.create({
      model: MODELS.misc,
      response_format: { type: "json_object" },
      messages,
    });
    return res.choices?.[0]?.message?.content ?? "";
  },
};

// PROJECT POLICY: every non-GPT model call MUST go through OpenRouter.
// Direct Anthropic / Google / Perplexity SDKs are not used in this codebase.
// Claude (and any other non-OpenAI model we add later) is reached via the
// OpenAI SDK pointed at OpenRouter's OpenAI-compatible endpoint.
//
// Built lazily so a missing OPENROUTER_API_KEY just disables the secondary
// provider (single-provider extraction still works) instead of crashing
// at import time.
const openrouterClient = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      timeout: 45_000,
      maxRetries: 1,
    })
  : null;

const openrouterClaudeProvider: ProviderClient | null = openrouterClient
  ? {
      // "anthropic" is the slot bucket in llm_concurrency_slots — sized for
      // Claude-family concurrent calls. The actual network egress is via
      // OpenRouter, but the model is Claude, so we account for it there.
      name: "anthropic",
      async call(prompt) {
        const messages =
          typeof prompt === "string"
            ? [{ role: "user" as const, content: prompt }]
            : [
                { role: "system" as const, content: prompt.system },
                { role: "user" as const, content: prompt.user },
              ];
        const res = await openrouterClient.chat.completions.create({
          model: MODELS.citationClaude,
          response_format: { type: "json_object" },
          messages,
        });
        return res.choices?.[0]?.message?.content ?? "";
      },
    }
  : null;

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
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId, pageId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const page = await storage.getScrapePageById(pageId);
        if (!page || page.runId !== runId) {
          return res.status(404).json({ success: false, error: "Page not found" });
        }

        // GPT (OpenAI direct) is the primary extractor. Claude is the
        // secondary model and is reached ONLY via OpenRouter per project
        // policy — no direct Anthropic SDK. callWithFailover invokes the
        // secondary on transient errors (5xx/429/network) from the primary.
        const providers: ProviderClient[] = [openaiProvider];
        if (openrouterClaudeProvider) providers.push(openrouterClaudeProvider);
        const llm = (prompt: string | { system: string; user: string }) =>
          callWithFailover(providers, prompt, runId);

        const robotsCache = createRobotsCache(brand.website ?? "", (url) =>
          safeFetchTextWithLockedIp(url, {}),
        );

        const outcome = await runStaticSource({
          url: page.url,
          brandUrl: brand.website ?? "",
          brandName: brand.name,
          industry: brand.industry ?? null,
          runId,
          // Task 8a extended safeFetchTextWithLockedIp to return headers,
          // which is what pageGuards.isWafBlocked needs to detect cf-ray.
          fetcher: (url, opts) =>
            safeFetchTextWithLockedIp(url, opts ?? {}).then((r) => ({
              status: r.status,
              text: r.text,
              contentType: r.contentType,
              headers: r.headers,
            })),
          llm,
          robotsCache,
        });

        // Persist results
        await storage.updateScrapePageStatus(pageId, outcome.status as never, {
          bytes: outcome.bytes,
          statusCode: outcome.statusCode,
          lang: outcome.diagnostics.lang,
          factCount: outcome.facts.length,
          errorKind: outcome.errorKind,
          errorMessage: outcome.errorMessage,
        });
        if (outcome.facts.length > 0) {
          await persistFacts(outcome.facts as never, {
            brandId: brand.id,
            runId,
            sourceUrl: page.url,
          });
        }
        await storage.incrementScrapeRunCounters(runId, {
          pagesFetched: outcome.status === "done" ? 1 : 0,
          pagesFailed: outcome.errorKind ? 1 : 0,
          factsExtracted: outcome.facts.length,
        });

        await storage.insertFactScrapeLog({
          runId,
          source: "static_pages",
          status:
            outcome.status === "done"
              ? "done"
              : outcome.status.startsWith("skipped_")
                ? "skipped"
                : "failed",
          factCount: outcome.facts.length,
          latencyMs: Date.now() - startedAt,
          errorKind: outcome.errorKind ?? undefined,
          diagnostics: outcome.diagnostics,
        });

        return res.status(200).json({
          success: true,
          runId,
          pageId,
          status: outcome.status,
          factCount: outcome.facts.length,
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
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await runSearchSource({
          brandId: brand.id,
          brandUrl: brand.website ?? "",
          brandName: brand.name,
          industry: brand.industry ?? null,
          runId,
        });

        if (outcome.facts.length > 0) {
          await persistFacts(outcome.facts as never, {
            brandId: brand.id,
            runId,
            sourceUrl: brand.website ?? "",
          });
        }

        await storage.insertFactScrapeLog({
          runId,
          source: "search_llm",
          status: outcome.status,
          factCount: outcome.facts.length,
          latencyMs: Date.now() - startedAt,
          errorKind: outcome.errorKind ?? undefined,
          diagnostics: outcome.diagnostics,
        });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.facts.length,
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
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await runUserEnrichSource({
          brand: {
            id: brand.id,
            name: brand.name,
            description: brand.description,
            industry: brand.industry,
            website: brand.website,
            products: brand.products as string[] | null,
            targetAudience: brand.targetAudience,
            uniqueSellingPoints: brand.uniqueSellingPoints as string[] | null,
            keyValues: Array.isArray(brand.keyValues)
              ? brand.keyValues.join(", ")
              : (brand.keyValues ?? null),
            brandVoice: brand.brandVoice,
            tone: brand.tone,
          },
          runId,
        });

        // Always call persistUserFacts (even on 0 facts) so existing
        // source='user' rows get cleared when the user empties their
        // onboarding fields.
        await persistUserFacts(outcome.facts, {
          brandId: brand.id,
          runId,
        });

        await storage.insertFactScrapeLog({
          runId,
          source: "user_enrich",
          status: outcome.status,
          factCount: outcome.facts.length,
          latencyMs: Date.now() - startedAt,
          errorKind: outcome.errorKind ?? undefined,
          diagnostics: outcome.diagnostics,
        });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.facts.length,
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
            error: parsed.error.errors[0]?.message ?? "Invalid request",
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

        const monthKey = new Date().toISOString().slice(0, 7);
        const [inFlight, lastCompletedAt, costCap] = await Promise.all([
          storage.getInFlightScrapeRun(brandId),
          storage.getLastCompletedScrapeRunAt(brandId),
          storage.getMonthlyCostCap(brandId, monthKey),
        ]);

        const verdict = evaluatePlanGuards({
          brand: { id: brand.id, factScrapeEnabled: (brand as any).factScrapeEnabled !== false },
          inFlightRun: inFlight,
          lastCompletedRunAt: lastCompletedAt,
          costCap: costCap
            ? { factScrapeCents: costCap.factScrapeCents, monthlyCapCents: costCap.monthlyCapCents }
            : null,
        });

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

        const candidates = await discoverSitemapUrls(normalized, async (url) =>
          safeFetchTextWithLockedIp(url, { maxBytes: 500_000 }).then((r) => ({
            status: r.status,
            text: r.text,
          })),
        );
        const selected = selectTopUrls(normalized, candidates);

        const run = await storage.createScrapeRun({
          brandId,
          status: "pending",
          triggeredBy,
        });

        const pageRows: Array<{ pageId: string; url: string }> = [];
        const seen = new Set<string>();
        for (const url of selected) {
          const canonical = canonicalizeUrl(url);
          if (seen.has(canonical)) continue;
          seen.add(canonical);
          const page = await storage.createScrapePage({
            runId: run.id,
            url,
            canonicalUrl: canonical,
            status: "pending",
          });
          pageRows.push({ pageId: page.id, url: page.url ?? url });
        }

        logger.info(
          { brandId, runId: run.id, pageCount: pageRows.length, triggeredBy },
          "factSheetV2.plan: dispatched",
        );

        return res.status(200).json({
          success: true,
          runId: run.id,
          pages: pageRows,
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
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        await requireBrand(run.brandId, user.id);

        const result = await runAggregate({ runId, brandId: run.brandId });

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
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const runId = req.params.runId;
        if (!runId) {
          return res.status(400).json({ success: false, error: "runId required" });
        }

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const providers: ProviderClient[] = [openaiProvider];
        if (openrouterClaudeProvider) providers.push(openrouterClaudeProvider);
        const llm = (prompt: string | { system: string; user: string }) =>
          callWithFailover(providers, prompt, runId);

        const prompt = buildExtractionPrompt(parsed.data.text, {
          brandUrl: brand.website ?? "",
          brandName: brand.name,
          industry: brand.industry ?? null,
        });
        const result = await parseFactsWithRepair(prompt, llm);

        const tagged = result.facts.map((f) => ({
          ...f,
          sourceUrl: brand.website ?? f.sourceUrl,
        }));

        await persistPasteFacts(tagged, { brandId: brand.id, runId });

        await storage.insertFactScrapeLog({
          runId,
          source: "paste",
          status: "done",
          factCount: tagged.length,
          latencyMs: Date.now() - startedAt,
          diagnostics: { repairUsed: result.repairUsed, inputLength: parsed.data.text.length },
        });

        return res.status(200).json({
          success: true,
          runId,
          status: "done",
          factCount: tagged.length,
          diagnostics: { repairUsed: result.repairUsed },
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
