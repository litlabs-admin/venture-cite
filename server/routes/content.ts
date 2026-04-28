// Content generation routes.
//
// Wave 7 (content unification): the legacy three-table model
// (content_drafts + content_generation_jobs + articles) was collapsed into a
// single articles table with status='draft'|'generating'|'ready'|'failed'.
// The /api/content-drafts CRUD endpoints are gone — drafts are just articles
// with status='draft' now (see /api/articles/draft in routes/articles.ts).
//
// What remains here:
//   POST /api/articles/:id/generate          — enqueue a generation job for
//                                               an existing draft article
//   GET  /api/content-jobs/active            — caller's most recent in-flight
//                                               or recently-finished job
//   GET  /api/content-jobs/:jobId            — poll a single job (JSON)
//   GET  /api/content-jobs/:jobId/stream     — SSE: tail stream_buffer live
//   POST /api/content-jobs/:jobId/cancel     — mark cancelled; worker bails
//   POST /api/articles/:id/improve           — Auto-Improve: 1 rewrite pass,
//                                               creates a revision, bumps
//                                               version, no fork.
//   POST /api/keyword-suggestions            — keyword brainstorm (unchanged)
//   GET  /api/popular-topics                 — trending topics by industry
//   POST /api/keyword-research/discover      — AI keyword discovery
//   GET  /api/keyword-research/:brandId      — list research rows
//   GET  /api/keyword-research/:brandId/opportunities
//   PATCH /api/keyword-research/:id          — update row
//   DELETE /api/keyword-research/:id         — delete row

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import { MODELS } from "../lib/modelConfig";
import { type GenerationPayload } from "../contentGenerationWorker";
import {
  requireUser,
  requireBrand,
  requireArticle,
  requireKeywordResearch,
  pickFields,
} from "../lib/ownership";
import { withArticleQuota, isUsageLimitError } from "../lib/usageLimit";
import type { Tier } from "../lib/llmPricing";
import {
  openai,
  aiLimitMiddleware,
  sendError,
  safeParseJson,
  MAX_CONTENT_LENGTH,
} from "../lib/routesShared";

export function setupContentRoutes(app: Express): void {
  // ── Generate content for an existing draft article ─────────────────────────
  //
  // Wave 7: the article must already exist in status='draft'. The route
  // verifies ownership, atomically reserves a quota slot + inserts the
  // generation job + flips the article to status='generating' (well, the
  // worker actually flips it on claim — see setArticleGeneratingFromDraft).
  // Returns the jobId immediately; the client polls or streams.
  app.post("/api/articles/:id/generate", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.id, user.id);

      if (article.status !== "draft" && article.status !== "failed") {
        return res.status(409).json({
          success: false,
          error: `Cannot generate — article is in status '${article.status}'.`,
          code: "invalid_status",
        });
      }

      const {
        keywords,
        industry,
        type = "article",
        targetCustomers,
        geography,
        contentStyle = "b2c",
      } = req.body ?? {};

      if (!keywords || typeof keywords !== "string" || !keywords.trim()) {
        return res.status(400).json({ success: false, error: "keywords are required" });
      }
      if (!industry || typeof industry !== "string") {
        return res.status(400).json({ success: false, error: "industry is required" });
      }
      if (!process.env.OPENAI_API_KEY) {
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

      // Persist the form-state fields onto the article so the draft preserves
      // what the user typed, even before the worker claims the job. This also
      // ensures a Cancel that returns the article to 'draft' shows the same
      // form values the user submitted.
      await db
        .update(schema.articles)
        .set({
          keywords: keywords
            .split(",")
            .map((k: string) => k.trim())
            .filter(Boolean),
          industry,
          contentType: type,
          targetCustomers: targetCustomers ?? null,
          geography: geography ?? null,
          contentStyle,
          updatedAt: new Date(),
        })
        .where(eq(schema.articles.id, article.id));

      // Atomic check + reserve + insert.
      const tier = ((user as any).accessTier || "free") as Tier;
      const jobId = await withArticleQuota(user.id, tier, async (tx) => {
        const [row] = await tx
          .insert(schema.contentGenerationJobs)
          .values({
            userId: user.id,
            brandId: article.brandId,
            articleId: article.id,
            status: "pending",
            requestPayload: payload as never,
          })
          .returning();
        return row.id;
      });

      // Flip the article into 'generating' synchronously so the client UI
      // switches to the streaming view immediately. The worker's claim
      // (which polls every 5-60s) used to do this transition, but that
      // left a long window where the form was still visible after the
      // user clicked Generate. Doing it here is safe — the worker only
      // reads articleId from the job and re-confirms ownership.
      await db
        .update(schema.articles)
        .set({ status: "generating", jobId, updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));

      return res.json({ success: true, data: { jobId, status: "pending" } });
    } catch (error) {
      if (isUsageLimitError(error)) {
        return res.status(403).json({
          success: false,
          error: error.message,
          limitReached: true,
          remaining: 0,
        });
      }
      return sendError(res, error, "Failed to enqueue content generation job");
    }
  });

  // ── Poll job status (JSON) ─────────────────────────────────────────────────

  app.get("/api/content-jobs/active", async (req, res) => {
    try {
      const user = requireUser(req);
      const active = await storage.getActiveContentJob(user.id);
      if (active) {
        return res.json({ success: true, data: { ...active, type: "active" } });
      }
      const recent = await storage.getRecentCompletedContentJob(user.id);
      if (recent) {
        return res.json({ success: true, data: { ...recent, type: "completed" } });
      }
      res.json({ success: true, data: null });
    } catch (error) {
      sendError(res, error, "Failed to fetch active job");
    }
  });

  app.get("/api/content-jobs/:jobId", async (req, res) => {
    try {
      const user = requireUser(req);
      const job = await storage.getContentJobById(req.params.jobId, user.id);
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
  });

  // ── SSE stream of job's stream_buffer ─────────────────────────────────────
  //
  // Tails content_generation_jobs.stream_buffer at SSE_TICK_MS, emitting
  // deltas as `event: delta` messages. Sends `event: end` and closes when
  // the job reaches a terminal state. Capped at SSE_MAX_DURATION_MS so a
  // hung browser tab doesn't hold a connection open forever.
  app.get("/api/content-jobs/:jobId/stream", async (req: Request, res: Response) => {
    const SSE_TICK_MS = 250;
    const SSE_MAX_DURATION_MS = 5 * 60 * 1000;
    try {
      // EventSource can't send Authorization headers, so SSE auth is via
      // ?token=<JWT>. The route is in SELF_AUTHED_PREFIXES so the global
      // requireAuthForApi guard skips it; we validate inline here.
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
      const job = await storage.getContentJobById(req.params.jobId, userId);
      if (!job) return res.status(404).json({ success: false, error: "Job not found" });

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable nginx buffering
      });

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Replay any buffer already accumulated (so a late connection doesn't
      // miss the first tokens).
      let lastLength = 0;
      const initialBuffer = (job as any).streamBuffer ?? "";
      if (typeof initialBuffer === "string" && initialBuffer.length > 0) {
        send("delta", { text: initialBuffer });
        lastLength = initialBuffer.length;
      }
      // If the job is already terminal, send 'end' and close right away.
      if (job.status !== "pending" && job.status !== "running") {
        send("end", { status: job.status });
        return res.end();
      }

      const startedAt = Date.now();
      let cancelled = false;
      req.on("close", () => {
        cancelled = true;
      });

      const tick = async () => {
        if (cancelled) return;
        if (Date.now() - startedAt > SSE_MAX_DURATION_MS) {
          send("end", { status: "timeout" });
          return res.end();
        }
        try {
          const [row] = await db
            .select({
              status: schema.contentGenerationJobs.status,
              streamBuffer: schema.contentGenerationJobs.streamBuffer,
            })
            .from(schema.contentGenerationJobs)
            .where(eq(schema.contentGenerationJobs.id, job.id))
            .limit(1);
          if (!row) {
            send("end", { status: "missing" });
            return res.end();
          }
          const buf = row.streamBuffer ?? "";
          if (buf.length > lastLength) {
            send("delta", { text: buf.slice(lastLength) });
            lastLength = buf.length;
          }
          if (row.status !== "pending" && row.status !== "running") {
            send("end", { status: row.status });
            return res.end();
          }
        } catch {
          // On a transient DB read error, just try again next tick.
        }
        setTimeout(tick, SSE_TICK_MS);
      };
      setTimeout(tick, SSE_TICK_MS);
    } catch (error) {
      sendError(res, error, "Failed to open job stream");
    }
  });

  // ── Cancel a running job ───────────────────────────────────────────────────
  //
  // Sets job.status='cancelled'; the worker checks this every CANCEL_CHECK_MS
  // during the stream and aborts the OpenAI call. The worker also handles
  // refunding the quota slot and flipping the article back to 'draft'.
  app.post("/api/content-jobs/:jobId/cancel", async (req, res) => {
    try {
      const user = requireUser(req);
      const job = await storage.getContentJobById(req.params.jobId, user.id);
      if (!job) return res.status(404).json({ success: false, error: "Job not found" });
      if (job.status !== "pending" && job.status !== "running") {
        return res.json({ success: true, data: { status: job.status, alreadyTerminal: true } });
      }
      await storage.updateContentJob(job.id, {
        status: "cancelled",
        completedAt: new Date(),
      } as any);
      // The worker will notice on its next tick and refund + reset the
      // article. But if the job never made it to 'running' (claim hadn't
      // happened yet) we should refund + reset here — otherwise the article
      // sits in 'draft' but the quota stays consumed.
      if (job.status === "pending") {
        const { refundArticleQuota } = await import("../lib/usageLimit");
        await refundArticleQuota(user.id, job.id, "cancelled").catch(() => undefined);
        if (job.articleId) {
          await storage.setArticleDraft(job.articleId).catch(() => undefined);
        }
      }
      res.json({ success: true, data: { status: "cancelled" } });
    } catch (error) {
      sendError(res, error, "Failed to cancel job");
    }
  });

  // ── Auto-Improve ────────────────────────────────────────────────────────────
  //
  // One rewrite pass. Creates an immutable revision row from the current
  // content (so it's preserved for diff/restore), then writes the rewritten
  // content back to the article and bumps version. The legacy 3-pass loop +
  // human-score gating is gone.
  app.post("/api/articles/:id/improve", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.id, user.id);
      if (!article.content) {
        return res
          .status(400)
          .json({ success: false, error: "Cannot improve an article with no content yet." });
      }
      if ((article.content || "").length > MAX_CONTENT_LENGTH) {
        return res.status(413).json({
          success: false,
          error: `Article exceeds ${MAX_CONTENT_LENGTH} characters.`,
        });
      }
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          success: false,
          error: "Auto-Improve is not available. OpenAI API key is not configured.",
        });
      }

      const instructions =
        typeof req.body?.instructions === "string" ? req.body.instructions : null;
      const expectedVersion =
        typeof req.body?.expectedVersion === "number" ? req.body.expectedVersion : null;

      // Snapshot the current content as a revision before we overwrite it.
      // The new content will get its own revision after the rewrite succeeds.
      // Doing it in this order means even if the LLM call fails, the revision
      // history is untouched (no orphan "rewrite I'm about to do" rows).
      const beforeContent = article.content;

      const systemPrompt = `You are an expert editor. Rewrite the user's article to be clearer, more authoritative, and more readable while preserving all factual content, structure, and markdown formatting. Return ONLY the rewritten markdown — no preamble, no commentary.${instructions ? `\n\nFollow these specific instructions: ${instructions}` : ""}`;

      const response = await openai.chat.completions.create({
        model: MODELS.contentHumanize,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: beforeContent },
        ],
        max_tokens: 4500,
        temperature: 0.7,
      });
      const improved = response.choices[0].message.content?.trim();
      if (!improved) {
        return res
          .status(502)
          .json({ success: false, error: "AI returned an empty response. Please try again." });
      }

      // Optimistic-lock: if the caller passed expectedVersion, only write
      // when the row hasn't moved. Returns 409 otherwise.
      let updated;
      if (expectedVersion !== null) {
        updated = await storage.updateArticleIfVersion(article.id, expectedVersion, {
          content: improved,
        } as any);
        if (!updated) {
          const current = await storage.getArticleById(article.id);
          return res.status(409).json({
            success: false,
            error:
              "Article changed since you started editing. Refresh to see the latest content, then re-apply your changes.",
            code: "version_conflict",
            current,
          });
        }
      } else {
        updated = await storage.updateArticle(article.id, { content: improved } as any);
      }

      // Persist both the before-snapshot (so users can revert) and the new
      // revision (so the diff viewer has both sides indexed).
      await storage.createRevision({
        articleId: article.id,
        content: beforeContent,
        source: "manual_edit",
        createdBy: user.id,
      });
      await storage.createRevision({
        articleId: article.id,
        content: improved,
        source: "auto_improve",
        createdBy: user.id,
      });

      res.json({
        success: true,
        article: updated,
        improvedContent: improved,
      });
    } catch (error) {
      sendError(res, error, "Failed to auto-improve article");
    }
  });

  // ── Keyword Suggestions ────────────────────────────────────────────────────
  app.post("/api/keyword-suggestions", aiLimitMiddleware, async (req, res) => {
    const { input, industry } = req.body;

    if (!input || input.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Keyword suggestions are not available. OpenAI API key is not configured.",
        message: "Please contact support to enable keyword suggestions.",
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: MODELS.keywordSuggestions,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a keyword research expert. Return a JSON object of the shape {"suggestions": ["keyword 1", "keyword 2", ...]} with 6-8 short keyword phrases relevant to the user's input and industry. Only output valid JSON, nothing else.`,
          },
          {
            role: "user",
            content: `Input: "${input}"\nIndustry: ${industry}\n\nReturn {"suggestions": [6-8 short keyword phrases]}`,
          },
        ],
        max_tokens: 300,
      });

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ suggestions?: unknown } | string[]>(rawContent);
      let suggestions: string[] = [];
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((s): s is string => typeof s === "string");
      } else if (parsed && Array.isArray((parsed as any).suggestions)) {
        suggestions = ((parsed as any).suggestions as unknown[]).filter(
          (s): s is string => typeof s === "string",
        );
      }

      res.json({
        success: true,
        suggestions: suggestions.slice(0, 8),
      });
    } catch (error) {
      console.error("Keyword suggestion error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        success: false,
        error: errorMessage,
        message: "Failed to generate keyword suggestions. Please try again.",
      });
    }
  });

  // ── Popular Topics ─────────────────────────────────────────────────────────
  // The hardcoded fallback only covers four "headline" industries. For
  // anything else, callers fall through to the LLM branch above; if that
  // fails too we serve a generic single-entry fallback. Documented rather
  // than expanded — exhaustive coverage of 50+ industries is not worth the
  // hardcoded-list maintenance burden.
  app.get("/api/popular-topics", async (req, res) => {
    const { industry } = req.query;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Popular topics feature is not available. OpenAI API key is not configured.",
        message: "Please contact support to enable trending topics.",
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: MODELS.popularTopics,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a trend analyst expert. Return a JSON object of the shape {"topics": [{"topic": "...", "description": "...", "category": "..."}, ...]} with 6-8 trending topics. Only output valid JSON, nothing else.`,
          },
          {
            role: "user",
            content: `Industry: ${industry}\n\nReturn {"topics": [6-8 current trending topics valuable for content creators in 2026]}.`,
          },
        ],
        max_tokens: 600,
      });

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ topics?: unknown } | unknown[]>(rawContent);
      let topics: any[] = [];
      if (Array.isArray(parsed)) {
        topics = parsed;
      } else if (parsed && Array.isArray((parsed as any).topics)) {
        topics = (parsed as any).topics;
      }

      if (topics.length === 0) {
        topics = [
          {
            topic: "Industry Innovation",
            description: "Latest trends and developments",
            category: "General",
          },
        ];
      }

      res.json({
        success: true,
        topics: topics.slice(0, 8),
      });
    } catch (error) {
      console.error("Popular topics error:", error);
      res.json({
        success: true,
        topics: [
          { topic: "Industry Innovation", description: "Latest trends", category: "General" },
        ],
        fallback: true,
      });
    }
  });

  // ============ KEYWORD RESEARCH ENDPOINTS ============

  app.post("/api/keyword-research/discover", aiLimitMiddleware, async (req, res) => {
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

      const competitors = await storage.getCompetitors(brandId);
      const competitorContext =
        competitors.length > 0 ? `Competitors: ${competitors.map((c) => c.name).join(", ")}.` : "";

      let response;
      try {
        response = await openai.chat.completions.create({
          model: MODELS.keywordResearch,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert keyword researcher specializing in AI search optimization (GEO - Generative Engine Optimization). Your goal is to find keywords that will help brands get cited by AI search engines like ChatGPT, Claude, Perplexity, and Google AI.

Return a JSON object of the shape:
{
  "keywords": [
    {
      "keyword": "primary keyword phrase",
      "searchVolume": 1000-50000,
      "difficulty": 1-100,
      "opportunityScore": 1-100,
      "aiCitationPotential": 1-100,
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "category": "topic category",
      "competitorGap": 0-100,
      "suggestedContentType": "article" | "guide" | "comparison" | "how-to" | "listicle",
      "relatedKeywords": ["related term 1", "related term 2"]
    }
  ]
}

Focus on:
1. Questions AI assistants commonly answer
2. Comparison queries ("X vs Y")
3. "Best of" and recommendation queries
4. How-to and educational content
5. Industry-specific expertise queries`,
            },
            {
              role: "user",
              content: `Discover 12-15 high-opportunity keywords for this brand:

Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "Not specified"}
Products/Services: ${brand.products?.join(", ") || "Not specified"}
Target Audience: ${brand.targetAudience || "Not specified"}
${competitorContext}

Find keywords that would help this brand get cited by AI search engines. Prioritize queries where creating authoritative content could establish the brand as a trusted source.`,
            },
          ],
          max_tokens: 2000,
        });
      } catch (aiErr: any) {
        if (aiErr?.status === 429) {
          return res.status(429).json({
            success: false,
            error: "AI is busy right now. Please wait a moment and try again.",
          });
        }
        if (aiErr?.status === 401) {
          return res
            .status(503)
            .json({ success: false, error: "AI service is misconfigured. Contact support." });
        }
        if (aiErr?.name === "AbortError" || aiErr?.name === "TimeoutError") {
          return res
            .status(504)
            .json({ success: false, error: "Keyword discovery timed out. Please try again." });
        }
        return res
          .status(502)
          .json({ success: false, error: "AI service error. Please try again shortly." });
      }

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ keywords?: any[] } | any[]>(rawContent);
      const keywords: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.keywords)
          ? (parsed as any).keywords
          : [];

      if (keywords.length === 0) {
        return res.status(502).json({
          success: false,
          error: "AI returned an unexpected response. Please try again.",
        });
      }

      const existingKeywords = await storage.getKeywordResearch(brandId, {});
      const existingSet = new Set(existingKeywords.map((k) => k.keyword.trim().toLowerCase()));

      const savedKeywords = [];
      for (const kw of keywords) {
        if (!kw || typeof kw.keyword !== "string" || !kw.keyword.trim()) continue;
        const normalized = kw.keyword.trim().toLowerCase();
        if (existingSet.has(normalized)) continue;
        existingSet.add(normalized);
        const saved = await storage.createKeywordResearch({
          brandId,
          keyword: kw.keyword.trim(),
          searchVolume: typeof kw.searchVolume === "number" ? kw.searchVolume : null,
          difficulty: typeof kw.difficulty === "number" ? kw.difficulty : null,
          opportunityScore: typeof kw.opportunityScore === "number" ? kw.opportunityScore : 50,
          aiCitationPotential:
            typeof kw.aiCitationPotential === "number" ? kw.aiCitationPotential : 50,
          intent: kw.intent || "informational",
          category: kw.category || null,
          competitorGap: typeof kw.competitorGap === "number" ? kw.competitorGap : 0,
          suggestedContentType: kw.suggestedContentType || "article",
          relatedKeywords: Array.isArray(kw.relatedKeywords) ? kw.relatedKeywords : null,
          status: "discovered",
          contentGenerated: 0,
          articleId: null,
        });
        savedKeywords.push(saved);
      }

      if (savedKeywords.length === 0) {
        return res.status(200).json({
          success: false,
          error:
            "No new keywords found — try completing your brand profile (description, products, target audience) for better results.",
          count: 0,
        });
      }

      res.json({
        success: true,
        data: savedKeywords,
        count: savedKeywords.length,
      });
    } catch (error) {
      sendError(res, error, "Failed to discover keywords");
    }
  });

  app.get("/api/keyword-research/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status, category } = req.query;

      const keywords = await storage.getKeywordResearch(brandId, {
        status: status as string,
        category: category as string,
      });

      res.json({
        success: true,
        data: keywords,
      });
    } catch (error) {
      console.error("Get keyword research error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch keywords" });
    }
  });

  app.get("/api/keyword-research/:brandId/opportunities", async (req, res) => {
    try {
      const { brandId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const keywords = await storage.getTopKeywordOpportunities(brandId, limit);

      res.json({
        success: true,
        data: keywords,
      });
    } catch (error) {
      console.error("Get opportunities error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch opportunities" });
    }
  });

  app.patch("/api/keyword-research/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireKeywordResearch(req.params.id, user.id);
      const update = pickFields(req.body, [
        "keyword",
        "searchVolume",
        "difficulty",
        "opportunityScore",
        "aiCitationPotential",
        "intent",
        "category",
        "competitorGap",
        "suggestedContentType",
        "relatedKeywords",
        "status",
        "contentGenerated",
      ] as const);
      const updated = await storage.updateKeywordResearch(req.params.id, update as any);
      if (!updated) {
        return res.status(404).json({ success: false, error: "Keyword not found" });
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update keyword");
    }
  });

  app.delete("/api/keyword-research/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireKeywordResearch(req.params.id, user.id);
      const deleted = await storage.deleteKeywordResearch(req.params.id);
      res.json({ success: true, deleted });
    } catch (error) {
      sendError(res, error, "Failed to delete keyword");
    }
  });
}
