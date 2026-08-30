// Content generation routes.
//
// The legacy three-table model
// (content_drafts + content_generation_jobs + articles) was collapsed into a
// single articles table with status='draft'|'generating'|'ready'|'failed'.
// The /api/content-drafts CRUD endpoints are gone - drafts are just articles
// with status='draft' now (see /api/articles/draft in routes/articles.ts).
//
// What remains here:
//   POST /api/articles/:id/generate          - enqueue a generation job for
//                                               an existing draft article
//   GET  /api/content-jobs/active            - caller's most recent in-flight
//                                               or recently-finished job
//   GET  /api/content-jobs/:jobId            - poll a single job (JSON)
//   GET  /api/content-jobs/:jobId/state      - poll status + elapsedSeconds
//   POST /api/content/:articleId/cancel      - cancel the article's active job
//   POST /api/content-jobs/:jobId/advance    - drive one slice of OpenAI
//                                               Responses run (Vercel migration)
//   POST /api/content-jobs/:jobId/cancel     - mark cancelled; next /advance bails
//   POST /api/articles/:id/improve           - Auto-Improve: 1 rewrite pass,
//                                               creates a revision, bumps
//                                               version, no fork.
//   POST /api/keyword-suggestions            - keyword brainstorm (unchanged)
//   GET  /api/popular-topics                 - trending topics by industry
//   POST /api/keyword-research/discover      - AI keyword discovery
//   GET  /api/keyword-research/:brandId      - list research rows
//   GET  /api/keyword-research/:brandId/opportunities
//   PATCH /api/keyword-research/:id          - update row
//   DELETE /api/keyword-research/:id         - delete row
//
// Business logic (job driving, auto-improve, keyword suggestions/discovery,
// popular topics) lives in server/services/contentGeneration.ts and
// server/services/keywordResearch.ts (phase B7-13). Handlers here only
// parse/validate input, enforce ownership, call one service function, and
// shape the response.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { type GenerationPayload } from "../contentGenerationWorker";
import { requireUser, requireBrand } from "../lib/ownership";
import {
  aiLimitMiddleware,
  sendError,
  MAX_CONTENT_LENGTH,
  asyncHandler,
} from "../lib/routesShared";
import { enforceFeatureCooldownOr429 } from "../lib/rateLimitBuckets";
import { hasEnoughBrandProfile } from "../lib/brandProfileCompleteness";

import { logger } from "../lib/logger";
import { registerLlmJobHandler } from "../lib/llmJobs";
import { createRequestActor } from "../lib/requestActor";
import { liveOpenAIEnabled } from "../lib/localFlowSafety";
import { contentRequestData } from "../data/contentRequestData";
import { usesFakeContentGenerationProvider } from "../lib/contentGenerationProvider";
import {
  computeJobStatePayload,
  contentLengthForResponse,
  driveArticleGenerationInBackground,
  advanceContentJobSlice,
  autoImproveArticle,
} from "../services/contentGeneration";
import {
  keywordDiscoveryFinalize,
  suggestKeywords,
  getPopularTopics,
  discoverBrandKeywords,
  type KeywordDiscoveryPayload,
} from "../services/keywordResearch";

export { computeJobStatePayload, contentLengthForResponse };

const keywordUpdateSchema = z
  .object({
    keyword: z.string().min(1).optional(),
    searchVolume: z.number().int().nullable().optional(),
    difficulty: z.number().int().min(1).max(100).nullable().optional(),
    opportunityScore: z.number().int().min(1).max(100).optional(),
    aiCitationPotential: z.number().int().min(1).max(100).optional(),
    intent: z
      .enum(["informational", "commercial", "transactional", "navigational"])
      .nullable()
      .optional(),
    category: z.string().nullable().optional(),
    competitorGap: z.number().int().min(0).max(100).optional(),
    suggestedContentType: z.string().nullable().optional(),
    relatedKeywords: z.array(z.string()).nullable().optional(),
    status: z.enum(["discovered"]).optional(),
    contentGenerated: z.number().int().optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, {
    message: "At least one keyword field is required",
  });

const contentGenerationRequestSchema = z
  .object({
    keywords: z.string().refine((value) => value.trim().length > 0),
    industry: z.string().refine((value) => value.trim().length > 0),
    type: z.string().min(1).default("article"),
    targetCustomers: z.string().optional(),
    geography: z.string().optional(),
    contentStyle: z.enum(["b2b", "b2c"]).default("b2c"),
  })
  .strict();

const articleImproveRequestSchema = z
  .object({
    instructions: z.string().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .strict();

registerLlmJobHandler<
  KeywordDiscoveryPayload,
  { data: unknown[]; count: number; message?: string }
>({
  kind: "keyword_discovery",
  finalize: keywordDiscoveryFinalize,
});

export function setupContentRoutes(app: Express): void {
  // ── Generate content for an existing draft article ─────────────────────────
  //
  // The article must already exist with status='draft' or 'failed'. The
  // actor-bound command reserves quota, inserts the job, and links the article.
  // Returns the jobId immediately; the client polls or streams.
  app.post(
    "/api/articles/:id/generate",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const content = contentRequestData.forActor(createRequestActor(user.id));
        const article = await content.articles.get(req.params.id);
        if (!article) {
          return res.status(404).json({ success: false, error: "Article not found" });
        }
        const parsed = contentGenerationRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          const firstIssue = parsed.error.issues[0];
          if (firstIssue?.path[0] === "keywords") {
            return res.status(400).json({ success: false, error: "keywords are required" });
          }
          if (firstIssue?.path[0] === "industry") {
            return res.status(400).json({ success: false, error: "industry is required" });
          }
          return res
            .status(400)
            .json({ success: false, error: "Invalid content generation input" });
        }
        const { keywords, industry, type, targetCustomers, geography, contentStyle } = parsed.data;
        if (!process.env.OPENAI_API_KEY && !usesFakeContentGenerationProvider()) {
          return res.status(503).json({
            success: false,
            error: "Content generation is not available. OpenAI API key is not configured.",
          });
        }

        const payload: GenerationPayload = {
          keywords,
          industry,
          type,
          brandId: article.brandId,
          articleId: article.id,
          targetCustomers,
          geography,
          contentStyle,
        };

        const jobs = content.jobs;
        const result = await jobs.enqueueGeneration({
          articleId: req.params.id,
          brandId: article.brandId,
          requestPayload: payload,
          keywords: keywords
            .split(",")
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          industry,
          contentType: type,
          targetCustomers: targetCustomers ?? null,
          geography: geography ?? null,
          contentStyle,
        });
        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Article not found" });
        }
        if (result.kind === "conflict") {
          return res.status(409).json({
            success: false,
            error: `Cannot generate - article is in status '${result.status}'.`,
            code: "invalid_status",
          });
        }
        if (result.kind === "quota") {
          return res.status(403).json({
            success: false,
            error: `You've reached your monthly limit of ${result.cap} articles. Upgrade at /pricing for more.`,
            limitReached: true,
            remaining: 0,
          });
        }
        const jobId = result.jobId;

        // Server-side drive: progress the job without requiring an open
        // browser tab in the loop; see contentGeneration.ts for details.
        driveArticleGenerationInBackground(jobId);

        return res.json({ success: true, data: { jobId, status: "pending" } });
      } catch (error) {
        return sendError(res, error, "Failed to enqueue content generation job");
      }
    }),
  );

  // ── Poll job status (JSON) ─────────────────────────────────────────────────

  app.get(
    "/api/content-jobs/active",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const jobs = contentRequestData.forActor(createRequestActor(user.id)).jobs;
        const active = await jobs.getActive();
        if (active) {
          return res.json({ success: true, data: { ...active, type: "active" } });
        }
        const recent = await jobs.getRecentCompleted(new Date(Date.now() - 24 * 60 * 60 * 1000));
        if (recent) {
          return res.json({ success: true, data: { ...recent, type: "completed" } });
        }
        res.json({ success: true, data: null });
      } catch (error) {
        sendError(res, error, "Failed to fetch active job");
      }
    }),
  );

  app.get(
    "/api/content-jobs/:jobId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const content = contentRequestData.forActor(createRequestActor(user.id));
        const job = await content.jobs.get(req.params.jobId);
        if (!job) return res.status(404).json({ success: false, error: "Job not found" });
        res.json({
          success: true,
          data: {
            id: job.id,
            status: job.status,
            articleId: job.articleId,
            errorMessage: job.errorMessage,
            errorKind: (job as any).errorKind ?? null,
            requestPayload: job.requestPayload,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to fetch job");
      }
    }),
  );

  // ── Poll job's phase state ────────────────────────────────────────────────
  //
  // Vercel migration: replaces the streamBuffer-tail approach. Returns a
  // time-driven phase label + elapsedMs while in-progress, and done:true
  // with the terminal status once finished. The ?since= query param is
  // dropped - clients now render phase progress, not raw token content.
  app.get(
    "/api/content-jobs/:jobId/state",
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const content = contentRequestData.forActor(createRequestActor(user.id));
        const job = await content.jobs.get(req.params.jobId);
        if (!job) return res.status(404).json({ success: false, error: "Job not found" });

        res.json({
          success: true,
          data: computeJobStatePayload(job),
        });
      } catch (error) {
        sendError(res, error, "Failed to read job state");
      }
    }),
  );

  // ── Advance a job by one slice (Vercel migration) ─────────────────────────
  //
  // The browser drives generation by calling /advance in a loop until
  // /state returns `done: true`. The first call kicks off an OpenAI
  // Responses run (background mode) and stores the response_id; later
  // calls poll openai.responses.retrieve until the run completes,
  // failed, or was cancelled. advanceContentJobSlice handles the
  // per-call slice lock and delegates the run itself to runArticleSlice
  // (all success / failure / refund bookkeeping); the route just
  // enforces ownership and shapes the response.
  app.post(
    "/api/content-jobs/:jobId/advance",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const content = contentRequestData.forActor(createRequestActor(user.id));
        const job = await content.jobs.get(req.params.jobId);
        if (!job) return res.status(404).json({ success: false, error: "Job not found" });
        if (job.status !== "pending" && job.status !== "running") {
          return res.json({
            success: true,
            data: { status: job.status, done: true },
          });
        }

        const result = await advanceContentJobSlice(job, content.articles);
        if (result.kind === "busy") {
          // Another caller is mid-slice; tell client to keep polling /state.
          return res.json({
            success: true,
            data: { status: result.status, done: false, busy: true },
          });
        }

        const { outcome, updatedArticle } = result;
        res.json({
          success: outcome.status !== "failed",
          data: {
            status: outcome.status,
            done: outcome.done,
            contentLength: contentLengthForResponse(updatedArticle),
            errorKind: "errorKind" in outcome ? (outcome.errorKind ?? null) : null,
            errorMessage: "message" in outcome ? (outcome.message ?? null) : null,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to advance job");
      }
    }),
  );

  // ── Cancel a running job ───────────────────────────────────────────────────
  //
  // The actor-bound command cancels the job, refunds quota once, and resets
  // the linked article. A worker that already holds a lease loses the race.
  app.post(
    "/api/content-jobs/:jobId/cancel",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const jobs = contentRequestData.forActor(createRequestActor(user.id)).jobs;
        const job = await jobs.get(req.params.jobId);
        if (!job) return res.status(404).json({ success: false, error: "Job not found" });
        if (job.status !== "pending" && job.status !== "running") {
          return res.json({ success: true, data: { status: job.status, alreadyTerminal: true } });
        }
        const result = await jobs.cancel(job.id);
        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Job not found" });
        }
        if (result.kind === "already_terminal") {
          return res.json({
            success: true,
            data: { status: result.status, alreadyTerminal: true },
          });
        }
        res.json({ success: true, data: { status: result.status } });
      } catch (error) {
        sendError(res, error, "Failed to cancel job");
      }
    }),
  );

  // ── Cancel by articleId ─────────────────────────────────────────────────
  //
  // Convenience cancel keyed by article. Finds the article's active job
  // (article.jobId) and applies the same cancel semantics as the
  // job-level route above. Returns 404 (not 403) for non-owned articles
  // per the anti-enumeration ownership convention.
  app.post(
    "/api/content/:articleId/cancel",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const content = contentRequestData.forActor(createRequestActor(user.id));
        const result = await content.jobs.cancelForArticle(req.params.articleId);
        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Article not found" });
        }
        if (result.kind === "no_active_job") {
          return res.json({ success: true, data: { status: result.status, noActiveJob: true } });
        }
        if (result.kind === "already_terminal") {
          return res.json({
            success: true,
            data: { status: result.status, alreadyTerminal: true },
          });
        }
        res.json({ success: true, data: { status: result.status } });
      } catch (error) {
        sendError(res, error, "Failed to cancel article generation");
      }
    }),
  );

  // ── Auto-Improve ────────────────────────────────────────────────────────────
  //
  // One rewrite pass. See autoImproveArticle() for the actual work: snapshot,
  // rewrite, optimistic-lock write, and the two revision rows.
  app.post(
    "/api/articles/:id/improve",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const content = contentRequestData.forActor(actor);
        const parsed = articleImproveRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Invalid improve input" });
        }
        const article = await content.articles.get(req.params.id);
        if (!article) {
          return res.status(404).json({ success: false, error: "Article not found" });
        }

        const result = await autoImproveArticle({
          article,
          instructions: parsed.data.instructions ?? null,
          expectedVersion: parsed.data.expectedVersion,
          articles: content.articles,
          revisions: content.revisions,
        });

        if (result.kind === "no_content") {
          return res
            .status(400)
            .json({ success: false, error: "Cannot improve an article with no content yet." });
        }
        if (result.kind === "too_long") {
          return res.status(413).json({
            success: false,
            error: `Article exceeds ${MAX_CONTENT_LENGTH} characters.`,
          });
        }
        if (result.kind === "unavailable") {
          return res.status(503).json({
            success: false,
            error: "Auto-Improve is not available. OpenAI API key is not configured.",
          });
        }
        if (result.kind === "empty_response") {
          return res
            .status(502)
            .json({ success: false, error: "AI returned an empty response. Please try again." });
        }
        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Article not found" });
        }
        if (result.kind === "version_conflict") {
          return res.status(409).json({
            success: false,
            error:
              "Article changed since you started editing. Refresh to see the latest content, then re-apply your changes.",
            code: "version_conflict",
            current: result.current,
          });
        }

        res.json({
          success: true,
          article: result.article,
          improvedContent: result.improvedContent,
        });
      } catch (error) {
        sendError(res, error, "Failed to auto-improve article");
      }
    }),
  );

  // ── Keyword Suggestions ────────────────────────────────────────────────────
  app.post(
    "/api/keyword-suggestions",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      const { input, industry } = req.body;

      if (!input || input.trim().length < 2) {
        return res.json({
          success: true,
          suggestions: [],
        });
      }

      if (!process.env.OPENAI_API_KEY || process.env.CONTENT_GENERATION_PROVIDER === "fake") {
        return res.status(503).json({
          success: false,
          error: "Keyword suggestions are not available. OpenAI API key is not configured.",
          message: "Please contact support to enable keyword suggestions.",
        });
      }

      const result = await suggestKeywords(input, industry);
      if (result.kind === "error") {
        return res.status(500).json({
          success: false,
          error: result.message,
          message: "Failed to generate keyword suggestions. Please try again.",
        });
      }

      res.json({
        success: true,
        suggestions: result.suggestions,
      });
    }),
  );

  // ── Popular Topics ─────────────────────────────────────────────────────────
  // The hardcoded fallback only covers four "headline" industries. For
  // anything else, callers fall through to the LLM branch above; if that
  // fails too we serve a generic single-entry fallback. Documented rather
  // than expanded - exhaustive coverage of 50+ industries is not worth the
  // hardcoded-list maintenance burden.
  app.get(
    "/api/popular-topics",
    asyncHandler(async (req, res) => {
      const { industry } = req.query;

      if (!liveOpenAIEnabled(process.env)) {
        if (process.env.CONTENT_GENERATION_PROVIDER === "fake") {
          return res.json({
            success: true,
            topics: [
              {
                topic: "Local product research",
                description: "A deterministic topic for the local test flow",
                category: "Local test",
              },
            ],
            fallback: true,
          });
        }
        return res.status(503).json({
          success: false,
          error: "Popular topics feature is not available. OpenAI API key is not configured.",
          message: "Please contact support to enable trending topics.",
        });
      }

      const result = await getPopularTopics(industry);
      if (result.kind === "error") {
        return res.json({
          success: true,
          topics: result.topics,
          fallback: true,
        });
      }

      res.json({
        success: true,
        topics: result.topics,
      });
    }),
  );

  // ============ KEYWORD RESEARCH ENDPOINTS ============

  app.post(
    "/api/keyword-research/discover",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = req.body ?? {};
        if (!brandId || typeof brandId !== "string") {
          return res.status(400).json({ success: false, error: "Brand ID is required" });
        }

        if (!process.env.OPENAI_API_KEY) {
          return res.status(503).json({
            success: false,
            error: "AI keyword discovery is not available. OpenAI API key is not configured.",
            message: "Please contact support to enable keyword discovery.",
          });
        }

        const brand = await requireBrand(brandId, user.id);

        // Preflight: GEO keyword research is brand-profile-driven. When the
        // brand has no industry/products/audience the LLM has nothing to
        // anchor on and the response will be generic noise (or empty).
        // Surface this before the OpenAI call so the user sees a clear
        // 400 instead of "Failed to discover keywords."
        const keywordHasProfile = hasEnoughBrandProfile(brand, { includeAudience: true });
        if (!keywordHasProfile) {
          return res.status(400).json({
            success: false,
            error:
              "Add industry, products, or target audience to your brand profile to discover keywords.",
          });
        }

        // Diagnostic breadcrumb so prod logs reveal which path is failing
        // when users hit "Discover" - invocation count, profile state, etc.
        logger.info(
          {
            brandId,
            userId: user.id,
            hasIndustry: !!brand.industry,
            hasProducts: Array.isArray(brand.products) && brand.products.length > 0,
          },
          "keyword-research/discover: invoked",
        );

        if (
          await enforceFeatureCooldownOr429(res, "discover-keywords", brandId, "Keyword discovery")
        ) {
          return;
        }

        const result = await discoverBrandKeywords(brand, user.id);
        if (result.kind === "ai_error") {
          return res.status(result.status).json(result.body);
        }
        if (result.kind === "timeout") {
          return res
            .status(504)
            .json({ success: false, error: "Keyword discovery timed out. Please try again." });
        }
        if (result.kind === "service_error") {
          return res
            .status(502)
            .json({ success: false, error: "AI service error. Please try again shortly." });
        }

        // Vercel-Hobby-safe: enqueue a background LLM job instead of
        // waiting inline. 202 Accepted - the work is running on OpenAI's
        // infra. The client polls /api/llm-jobs/:jobId and renders the
        // result when status='succeeded'.
        return res.status(202).json({
          success: true,
          jobId: result.jobId,
          status: result.status,
          pollUrl: `/api/llm-jobs/${result.jobId}`,
          message: "Discovering keywords - this usually takes 10-20s.",
        });
      } catch (error) {
        sendError(res, error, "Failed to discover keywords");
      }
    }),
  );

  app.get(
    "/api/keyword-research/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = req.params;
        await requireBrand(brandId, user.id);
        const { status, category } = req.query;

        const keywords = await contentRequestData
          .forActor(createRequestActor(user.id))
          .keywords.list(brandId, {
            status: typeof status === "string" ? status : undefined,
            category: typeof category === "string" ? category : undefined,
          });

        res.json({
          success: true,
          data: keywords,
        });
      } catch (error) {
        sendError(res, error, "Failed to fetch keywords");
      }
    }),
  );

  app.get(
    "/api/keyword-research/:brandId/opportunities",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = req.params;
        await requireBrand(brandId, user.id);
        const limit = parseInt(req.query.limit as string) || 10;

        const keywords = await contentRequestData
          .forActor(createRequestActor(user.id))
          .keywords.listTopOpportunities(brandId, limit);

        res.json({
          success: true,
          data: keywords,
        });
      } catch (error) {
        sendError(res, error, "Failed to fetch opportunities");
      }
    }),
  );

  app.patch(
    "/api/keyword-research/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const keywords = contentRequestData.forActor(actor).keywords;
        if (!(await keywords.get(req.params.id))) {
          return res.status(404).json({ success: false, error: "Keyword research not found" });
        }
        const parsed = keywordUpdateSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Invalid keyword update" });
        }
        const updated = await keywords.update(req.params.id, parsed.data);
        if (!updated) {
          return res.status(404).json({ success: false, error: "Keyword not found" });
        }
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to update keyword");
      }
    }),
  );

  app.delete(
    "/api/keyword-research/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const keywords = contentRequestData.forActor(createRequestActor(user.id)).keywords;
        if (!(await keywords.get(req.params.id))) {
          return res.status(404).json({ success: false, error: "Keyword research not found" });
        }
        const deleted = await keywords.delete(req.params.id);
        res.json({ success: true, deleted });
      } catch (error) {
        sendError(res, error, "Failed to delete keyword");
      }
    }),
  );
}
