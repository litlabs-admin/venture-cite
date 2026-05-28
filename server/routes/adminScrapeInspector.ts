// Admin-only inspector for fact-sheet scrape runs.
//
// Surface: a single page rendered at /admin/scrape/:runId (client side).
// API: GET /api/admin/scrape/:runId returns the run row, all pages,
// every fact_scrape_event in order, and the resolved facts. The client
// renders this as a timeline + per-event detail cards.
//
// Why admin-only: this exposes internal diagnostics (LLM error
// messages, dropped factKey patterns, page guard outcomes). End users
// don't need to see it; operators do.

import type { Express, Request, Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import { isAuthenticated, isAdmin } from "../auth";
import { asyncHandler } from "../lib/asyncHandler";

export function setupAdminScrapeInspectorRoutes(app: Express): void {
  app.get(
    "/api/admin/scrape/:runId",
    isAuthenticated,
    isAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;

      // 1. Run row (the high-level summary the inspector shows at top).
      const runRows = await db
        .select()
        .from(schema.brandFactScrapeRuns)
        .where(eq(schema.brandFactScrapeRuns.id, runId))
        .limit(1);
      const run = runRows[0];
      if (!run) {
        return res.status(404).json({ success: false, error: "Run not found" });
      }

      // 2. Brand context (name + URL — we want the inspector to label
      // the report with the brand, not just a UUID).
      const brandRows = await db
        .select({
          id: schema.brands.id,
          name: schema.brands.name,
          website: schema.brands.website,
          industry: schema.brands.industry,
        })
        .from(schema.brands)
        .where(eq(schema.brands.id, run.brandId))
        .limit(1);
      const brand = brandRows[0] ?? null;

      // 3. Per-page rows from this run.
      const pages = await db
        .select()
        .from(schema.brandFactScrapePages)
        .where(eq(schema.brandFactScrapePages.runId, runId))
        .orderBy(asc(schema.brandFactScrapePages.id));

      // 4. Per-source aggregate logs (already-computed status per
      // source: static_pages, search_llm, user_enrich, aggregate, paste).
      const logs = await db
        .select()
        .from(schema.factScrapeLogs)
        .where(eq(schema.factScrapeLogs.runId, runId))
        .orderBy(asc(schema.factScrapeLogs.createdAt));

      // 5. Event timeline — the heart of the inspector. Every
      // significant step the scraper took, in order.
      const events = await db
        .select()
        .from(schema.factScrapeEvents)
        .where(eq(schema.factScrapeEvents.runId, runId))
        .orderBy(asc(schema.factScrapeEvents.createdAt));

      // 6. Facts that survived (after dedup + consolidation). Inspector
      // shows these grouped by domain with their provenance expanded.
      const facts = await db
        .select()
        .from(schema.brandFactSheet)
        .where(eq(schema.brandFactSheet.brandId, run.brandId));

      // 7. Aggregated counters the inspector header shows.
      const totals = {
        pages: pages.length,
        pagesOk: pages.filter((p) => p.status === "done").length,
        pagesSkipped: pages.filter((p) => p.status?.startsWith("skipped_")).length,
        pagesFailed: pages.filter((p) => p.status === "failed").length,
        events: events.length,
        eventsFailed: events.filter((e) => e.outcome === "failed").length,
        facts: facts.length,
        factsScraped: facts.filter((f) => f.source === "scraped").length,
        factsUser: facts.filter((f) => f.source === "user" || f.source === "user_manual").length,
      };

      res.json({
        success: true,
        data: {
          run,
          brand,
          pages,
          logs,
          events,
          facts,
          totals,
        },
      });
    }),
  );

  // Admin-only: trigger re-verification of a single fact. Used for
  // debugging / spot-checking the reverify pipeline without waiting
  // for the cron tick.
  app.post(
    "/api/admin/scrape/fact/:factId/reverify",
    isAuthenticated,
    isAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const factId = req.params.factId;
      const { reverifyFact } = await import("../lib/factAgent/v2/reverifyFact");
      const { LLM_CALL_TIMEOUT_MS } = await import("../lib/factAgent/v2/vercelBudget");
      const OpenAI = (await import("openai")).default;
      const { MODELS } = await import("../lib/modelConfig");
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        // Tier-aware: admin-only manual re-verify still has to fit in
        // the function budget on Hobby.
        timeout: LLM_CALL_TIMEOUT_MS,
        maxRetries: 0,
      });
      const llm = async (prompt: unknown) => {
        const messages =
          typeof prompt === "string"
            ? [{ role: "user" as const, content: prompt }]
            : [
                {
                  role: "system" as const,
                  content: (prompt as { system: string }).system,
                },
                {
                  role: "user" as const,
                  content: (prompt as { user: string }).user,
                },
              ];
        const responseFormat =
          typeof prompt === "object" &&
          prompt &&
          "responseFormat" in prompt &&
          (prompt as { responseFormat?: unknown }).responseFormat
            ? (prompt as { responseFormat: unknown }).responseFormat
            : { type: "json_object" as const };
        const r = await openai.chat.completions.create({
          model: MODELS.misc,
          response_format: responseFormat as never,
          messages,
        });
        return r.choices?.[0]?.message?.content ?? "";
      };
      const result = await reverifyFact({ factId, llm });
      res.json({ success: true, data: result });
    }),
  );

  // List recent runs (so admins can find a run to inspect without
  // knowing the UUID).
  app.get(
    "/api/admin/scrape/runs/recent",
    isAuthenticated,
    isAdmin,
    asyncHandler(async (_req: Request, res: Response) => {
      const recent = await db
        .select({
          id: schema.brandFactScrapeRuns.id,
          brandId: schema.brandFactScrapeRuns.brandId,
          status: schema.brandFactScrapeRuns.status,
          triggeredBy: schema.brandFactScrapeRuns.triggeredBy,
          errorKind: schema.brandFactScrapeRuns.errorKind,
          startedAt: schema.brandFactScrapeRuns.startedAt,
          completedAt: schema.brandFactScrapeRuns.completedAt,
          pagesFetched: schema.brandFactScrapeRuns.pagesFetched,
          factsExtracted: schema.brandFactScrapeRuns.factsExtracted,
        })
        .from(schema.brandFactScrapeRuns)
        .orderBy(desc(schema.brandFactScrapeRuns.startedAt))
        .limit(50);

      // The list is intentionally simple. Inspector page links to
      // /admin/scrape/:id for each entry.
      res.json({ success: true, data: recent });
    }),
  );
}
