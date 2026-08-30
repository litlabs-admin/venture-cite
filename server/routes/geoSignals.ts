// GEO signals analysis, chunk, schema, and pipeline routes.
//
// Business logic lives in server/services/geoContentScoring.ts (the
// 6-signal scorecard + chunk/extractability analysis), server/services/
// schemaAudit.ts (JSON-LD schema auditing), and server/services/
// geoSignals.ts (per-route orchestration: schema-completeness resolution +
// persistence for /analyze, the AI rewrite for /optimize-chunks, and the
// stage builder for /pipeline-simulation). Each handler below only parses
// and validates input, enforces ownership, calls one service function, and
// shapes the response (B7-14 service-layer split).

import type { Express } from "express";
import { requireUser, requireBrand } from "../lib/ownership";
import { OwnershipError } from "../lib/ownership";
import { aiLimitMiddleware, MAX_CONTENT_LENGTH, asyncHandler } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { computeChunks } from "../services/geoContentScoring";
import { analyzeGeoSignals, optimizeContentChunks, simulatePipeline } from "../services/geoSignals";
import { runSchemaAudit, UnreachableUrlError } from "../services/schemaAudit";

// Maximum length of `targetQuery` accepted by /analyze and
// /pipeline-simulation. Embeddings cap is ~8K tokens; a normal user
// query is well under 200 chars. Without a cap a hostile caller can
// send a 1 MB query to burn embedding cost.
const MAX_TARGET_QUERY_LENGTH = 500;

// JSON-LD @type extraction now lives in server/lib/jsonLdExtract.ts so
// server/lib/pageContentAnalysis.ts (a pure, DB-free module) can reuse it
// without importing this route file's Express/DB dependency chain.
// Re-exported here so any existing importer of these names keeps working.
export { collectSchemaNodes } from "../lib/jsonLdExtract";

export function setupGeoSignalsRoutes(app: Express): void {
  app.post(
    "/api/geo-signals/analyze",
    // Embedding spend protection. /analyze calls OpenAI embeddings on
    // every request; without a rate limit a single user can fire
    // ~1000 req/min. Same 10/min/user gate the other AI routes use.
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { content, targetQuery, articleUpdatedAt, schemaCompleteness, brandId, articleId } =
          req.body ?? {};
        // Reject empty + whitespace-only strings. The old check only
        // rejected "" - a payload of "   " passed and produced a
        // nonsense 5/100 row plus a billed embedding call.
        if (
          !content ||
          typeof content !== "string" ||
          content.trim().length === 0 ||
          !targetQuery ||
          typeof targetQuery !== "string" ||
          targetQuery.trim().length === 0
        ) {
          return res
            .status(400)
            .json({ success: false, error: "Content and target query required" });
        }
        if (content.length > MAX_CONTENT_LENGTH) {
          return res
            .status(413)
            .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
        }
        if (targetQuery.length > MAX_TARGET_QUERY_LENGTH) {
          return res.status(413).json({
            success: false,
            error: `Target query exceeds ${MAX_TARGET_QUERY_LENGTH} characters`,
          });
        }

        // Resolve ownership BEFORE compute to fail-fast on cross-tenant
        // requests instead of paying for embeddings + scoring first. 404 on
        // miss per anti-enumeration policy (OwnershipError bubbles to the
        // outer catch which translates it via sendOwnershipError).
        let brand: Awaited<ReturnType<typeof requireBrand>> | null = null;
        if (typeof brandId === "string" && brandId.length > 0) {
          brand = await requireBrand(brandId, user.id);
        }

        const result = await analyzeGeoSignals({
          content,
          targetQuery,
          articleUpdatedAt: typeof articleUpdatedAt === "string" ? articleUpdatedAt : undefined,
          schemaCompleteness:
            typeof schemaCompleteness === "number" ? schemaCompleteness : undefined,
          brand,
          articleId: typeof articleId === "string" && articleId.length > 0 ? articleId : null,
        });

        res.json({
          success: true,
          data: {
            signals: result.signals,
            overallScore: result.overallScore,
            termCoverageRatio: result.termCoverageRatio,
            questionHeadingFraction: result.questionHeadingFraction,
            wordCount: result.wordCount,
          },
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.error({ err }, "geo-signals/analyze failed");
        captureAndFlush(err, { tags: { source: "geo-signals/analyze" } });
        res.status(500).json({ success: false, error: "Failed to analyze signals" });
      }
    }),
  );

  app.post(
    "/api/geo-signals/chunk-analysis",
    // Chunk analysis runs multi-pass regex over up to 40 KB of content
    // - bounded CPU but expensive on hostile inputs. Rate-limit.
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        requireUser(req);
        const { content } = req.body ?? {};
        if (!content || typeof content !== "string" || content.trim().length === 0) {
          return res.status(400).json({ success: false, error: "Content required" });
        }
        if (content.length > MAX_CONTENT_LENGTH) {
          return res
            .status(413)
            .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
        }

        const { chunks, stats } = computeChunks(content);
        res.json({ success: true, data: { chunks, stats } });
      } catch (err) {
        logger.error({ err }, "geo-signals/chunk-analysis failed");
        captureAndFlush(err, { tags: { source: "geo-signals/chunk-analysis" } });
        res.status(500).json({ success: false, error: "Failed to analyze chunks" });
      }
    }),
  );

  app.post(
    "/api/geo-signals/optimize-chunks",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { content, brandId } = req.body ?? {};
        if (!content || typeof content !== "string") {
          return res.status(400).json({ success: false, error: "Content required" });
        }
        if (content.length > MAX_CONTENT_LENGTH) {
          return res
            .status(413)
            .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
        }

        let brand;
        if (brandId && typeof brandId === "string") {
          brand = await requireBrand(brandId, user.id);
        }

        const optimizedContent = await optimizeContentChunks(content, brand);
        // Reject empty responses explicitly so the UI can show a real
        // error instead of "optimised content identical to input." The
        // user has no way to tell apart "model refused" vs "no change
        // needed" with the silent-fallback behaviour.
        if (optimizedContent === null) {
          return res.status(502).json({
            success: false,
            error: "AI returned an empty optimisation. Please try again.",
          });
        }
        res.json({ success: true, data: { optimizedContent } });
      } catch (err) {
        logger.error({ err }, "geo-signals/optimize-chunks failed");
        captureAndFlush(err, { tags: { source: "geo-signals/optimize-chunks" } });
        res.status(500).json({ success: false, error: "Failed to optimize chunks" });
      }
    }),
  );

  app.post(
    "/api/geo-signals/schema-audit",
    // Outbound fetch + JSON-LD parse. Bound to the same 10 req/min
    // gate so a single user can't audit thousands of URLs (which
    // would also poison the global cache).
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        requireUser(req);
        const { url, force } = req.body ?? {};
        if (!url || typeof url !== "string") {
          return res.status(400).json({ success: false, error: "URL required" });
        }

        try {
          const audit = await runSchemaAudit(url, force);
          res.json({ success: true, data: audit });
        } catch (err) {
          if (err instanceof UnreachableUrlError) {
            return res.status(400).json({
              success: false,
              error: err.message,
            });
          }
          throw err;
        }
      } catch (err) {
        logger.error({ err }, "geo-signals/schema-audit failed");
        const msg = err instanceof Error ? err.message : "Failed to audit schema";
        captureAndFlush(err, { tags: { source: "geo-signals/schema-audit" } });
        res.status(500).json({ success: false, error: msg });
      }
    }),
  );

  // Note (2026-05-28): GET /api/geo-signals/schema-completeness/:articleId
  // used to live here but had zero client callers. The server-side
  // lookup is now done inline by /analyze (it reads articles.externalUrl,
  // hashes it, finds the cached schemaAudits row, averages
  // completenessByType). That removes one round-trip and means the
  // Authority sub-score is always populated after a successful audit.

  app.post(
    "/api/geo-signals/pipeline-simulation",
    // Calls embeddings via computeSignals - same rate-limit posture.
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        requireUser(req);
        const { content, query, articleUpdatedAt, schemaCompleteness } = req.body ?? {};
        if (
          !content ||
          typeof content !== "string" ||
          content.trim().length === 0 ||
          !query ||
          typeof query !== "string" ||
          query.trim().length === 0
        ) {
          return res.status(400).json({ success: false, error: "Content and query required" });
        }
        if (content.length > MAX_CONTENT_LENGTH) {
          return res
            .status(413)
            .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
        }
        if (query.length > MAX_TARGET_QUERY_LENGTH) {
          return res.status(413).json({
            success: false,
            error: `Query exceeds ${MAX_TARGET_QUERY_LENGTH} characters`,
          });
        }

        const { stages, query: resultQuery } = await simulatePipeline(
          content,
          query,
          typeof articleUpdatedAt === "string" ? articleUpdatedAt : undefined,
          typeof schemaCompleteness === "number" ? schemaCompleteness : undefined,
        );
        res.json({ success: true, data: { stages, query: resultQuery } });
      } catch (err) {
        logger.error({ err }, "geo-signals/pipeline-simulation failed");
        captureAndFlush(err, { tags: { source: "geo-signals/pipeline-simulation" } });
        res.status(500).json({ success: false, error: "Failed to simulate pipeline" });
      }
    }),
  );
}
