// Articles CRUD + revisions + distributions + geo-rankings routes.
//
// Wave 7: removed both /api/articles/slug/:slug routes — articles are now
// referenced by id only. The unique slug column was dropped in migration 0033.
// Drafts are now articles with status='draft' (the legacy content_drafts
// table is gone), so this file owns the draft creation endpoint too.
//
// Routes:
//   POST   /api/articles                                — create ready article
//   POST   /api/articles/draft                          — create draft article
//   GET    /api/articles                                — list (status-filterable)
//   GET    /api/articles/:id                            — single article
//   PUT    /api/articles/:id                            — update (optimistic lock)
//   DELETE /api/articles/:id                            — delete
//   GET    /api/articles/:id/revisions                  — list revisions newest-first
//   GET    /api/articles/:id/revisions/:revId           — single revision
//   POST   /api/articles/:id/revisions/:revId/restore   — restore old revision
//   POST   /api/distributions                           — create pending rows
//   GET    /api/distributions/:articleId                — list distributions
//   PATCH  /api/distribute/entry/:distributionId        — edit saved copy
//   POST   /api/distribute/:articleId                   — AI-format to platforms
//   POST   /api/geo-rankings                            — record a ranking observation
//   GET    /api/geo-rankings                            — list rankings
//   GET    /api/geo-rankings/platform/:platform         — list by AI platform

import type { Express } from "express";
import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import {
  requireUser,
  requireArticle,
  requireBrand,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import { parsePagination } from "../lib/pagination";
import { aiLimitMiddleware, openai, sendError } from "../lib/routesShared";

export function setupArticlesRoutes(app: Express): void {
  const ARTICLE_WRITE_FIELDS = [
    "title",
    "content",
    "excerpt",
    "metaDescription",
    "keywords",
    "industry",
    "contentType",
    "featuredImage",
    "author",
    "seoData",
    "brandId",
    "externalUrl",
  ] as const;

  // Create/save a ready article. brandId is verified to belong to the caller;
  // all other fields pass through the allowlist (no viewCount/citationCount).
  // Wave 7: brandId is now required at the schema level — orphan articles
  // are forbidden going forward.
  app.post("/api/articles", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, ARTICLE_WRITE_FIELDS);
      if (!body.brandId) {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId as string, user.id);
      if (!body.title || !body.content) {
        return res.status(400).json({ success: false, error: "title and content are required" });
      }
      // Force ready status; explicit drafts go through POST /api/articles/draft.
      const article = await storage.createArticle({ ...(body as any), status: "ready" });
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to create article");
    }
  });

  // Create a draft article. The Content page calls this on first visit so
  // the user has a stable id to PATCH form-state into. status='draft' until
  // the user clicks Generate, at which point the worker flips it.
  app.post("/api/articles/draft", async (req, res) => {
    try {
      const user = requireUser(req);
      const {
        brandId,
        title,
        keywords,
        industry,
        contentType,
        targetCustomers,
        geography,
        contentStyle,
      } = req.body ?? {};
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      // Ownership check happens inside createDraftArticle, but verify-and-friendly
      // here so the error message is clear.
      await requireBrand(brandId, user.id);
      const article = await storage.createDraftArticle(user.id, brandId, {
        title: typeof title === "string" ? title : null,
        keywords: Array.isArray(keywords)
          ? keywords.filter((k: unknown): k is string => typeof k === "string")
          : null,
        industry: typeof industry === "string" ? industry : null,
        contentType: typeof contentType === "string" ? contentType : "article",
        targetCustomers: typeof targetCustomers === "string" ? targetCustomers : null,
        geography: typeof geography === "string" ? geography : null,
        contentStyle: typeof contentStyle === "string" ? contentStyle : "b2c",
      });
      res.json({ success: true, data: article });
    } catch (error) {
      sendError(res, error, "Failed to create draft article");
    }
  });

  // List articles owned by the caller. Supports filtering by status (single
  // value or comma-separated list) and brandId. Default status='ready' so
  // the Articles page only shows finished work; the Content page's Recent
  // Drafts dropdown passes status=draft,generating,failed.
  app.get("/api/articles", async (req, res) => {
    try {
      const user = requireUser(req);
      const { limit, offset } = parsePagination(req);
      const brandIdParam = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
      if (brandIdParam) await requireBrand(brandIdParam, user.id);

      const statusParam = typeof req.query.status === "string" ? req.query.status : "ready";
      // Allow "all" to mean no filter (used by admin views / sweep tools).
      const status =
        statusParam === "all"
          ? undefined
          : statusParam.includes(",")
            ? statusParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : statusParam;

      const articles = await storage.getArticlesByUserIdWithStatus(user.id, {
        status,
        brandId: brandIdParam,
        limit,
        offset,
      });
      res.json({ success: true, data: articles, pagination: { limit, offset } });
    } catch (error) {
      sendError(res, error, "Failed to fetch articles");
    }
  });

  // Get article by ID — user must own the article's brand.
  app.get("/api/articles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.id, user.id);
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to fetch article");
    }
  });

  // Update article — ownership-scoped, body allowlist.
  app.put("/api/articles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.id, user.id);
      const update = pickFields<any>(req.body, ARTICLE_WRITE_FIELDS);
      if (update.brandId) {
        // Prevent moving an article into a brand the user doesn't own.
        await requireBrand(update.brandId as string, user.id);
      }

      // Wave 4.4: optimistic locking — see the brand-update handler for
      // the reasoning. Same pattern, different table.
      const expectedVersion =
        typeof req.body?.expectedVersion === "number" ? req.body.expectedVersion : null;

      let article;
      if (expectedVersion !== null) {
        article = await storage.updateArticleIfVersion(
          req.params.id,
          expectedVersion,
          update as any,
        );
        if (!article) {
          const current = await storage.getArticleById(req.params.id);
          return res.status(409).json({
            success: false,
            error:
              "Article changed since you started editing. Refresh to see the latest content, then re-apply your changes.",
            code: "version_conflict",
            current,
          });
        }
      } else {
        article = await storage.updateArticle(req.params.id, update as any);
        if (!article) {
          return res.status(404).json({ success: false, error: "Article not found" });
        }
      }
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to update article");
    }
  });

  // Delete article — ownership-scoped. Hard-deletes today; soft-delete is
  // tracked as a follow-up (would need an articles.deleted_at column).
  // Cascade handles article_revisions + distributions + geo_rankings via FK.
  app.delete("/api/articles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.id, user.id);
      const deleted = await storage.deleteArticle(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Article not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete article");
    }
  });

  // ── Article revisions ─────────────────────────────────────────────────────
  // Each row is an immutable snapshot of articles.content at the time it was
  // recorded. Created by the worker on generation success, by Auto-Improve
  // both before and after the rewrite (so the user can revert), and by
  // Restore (which records a new manual_edit pointing at the restored state).

  app.get("/api/articles/:id/revisions", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.id, user.id);
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const revisions = await storage.listRevisions(req.params.id, limit);
      res.json({ success: true, data: revisions });
    } catch (error) {
      sendError(res, error, "Failed to list revisions");
    }
  });

  app.get("/api/articles/:id/revisions/:revId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.id, user.id);
      const revision = await storage.getRevisionById(req.params.revId);
      if (!revision || revision.articleId !== req.params.id) {
        return res.status(404).json({ success: false, error: "Revision not found" });
      }
      res.json({ success: true, data: revision });
    } catch (error) {
      sendError(res, error, "Failed to fetch revision");
    }
  });

  // Restore an old revision: the article's current content is overwritten
  // with the revision's content, version is bumped, and a new manual_edit
  // revision is recorded so the restore itself appears in the history.
  app.post("/api/articles/:id/revisions/:revId/restore", async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.id, user.id);
      const revision = await storage.getRevisionById(req.params.revId);
      if (!revision || revision.articleId !== article.id) {
        return res.status(404).json({ success: false, error: "Revision not found" });
      }
      const expectedVersion =
        typeof req.body?.expectedVersion === "number" ? req.body.expectedVersion : null;

      let updated;
      if (expectedVersion !== null) {
        updated = await storage.updateArticleIfVersion(article.id, expectedVersion, {
          content: revision.content,
        } as any);
        if (!updated) {
          const current = await storage.getArticleById(article.id);
          return res.status(409).json({
            success: false,
            error: "Article changed since restore was started. Refresh and try again.",
            code: "version_conflict",
            current,
          });
        }
      } else {
        updated = await storage.updateArticle(article.id, { content: revision.content } as any);
      }

      // Record the restore in history. created_by = user, source = manual_edit
      // so the diff viewer shows that this point came from a human action.
      await storage.createRevision({
        articleId: article.id,
        content: revision.content,
        source: "manual_edit",
        createdBy: user.id,
      });

      res.json({ success: true, article: updated });
    } catch (error) {
      sendError(res, error, "Failed to restore revision");
    }
  });

  // Distribution routes
  app.post("/api/distributions", async (req, res) => {
    try {
      const user = requireUser(req);
      const { articleId, platforms } = req.body ?? {};
      if (!articleId || !Array.isArray(platforms)) {
        return res
          .status(400)
          .json({ success: false, error: "articleId and platforms are required" });
      }
      const article = await requireArticle(articleId, user.id);

      const distributions = [];
      for (const platform of platforms.slice(0, 10)) {
        if (typeof platform !== "string") continue;
        const distribution = await storage.createDistribution({
          articleId: article.id,
          platform,
          status: "pending",
        });
        distributions.push(distribution);
      }

      res.json({ success: true, data: distributions });
    } catch (error) {
      sendError(res, error, "Failed to create distributions");
    }
  });

  app.get("/api/distributions/:articleId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.articleId, user.id);
      const distributions = await storage.getDistributions(req.params.articleId);
      res.json({ success: true, data: distributions });
    } catch (error) {
      sendError(res, error, "Failed to fetch distributions");
    }
  });

  // Edit saved distribution content (e.g., user tweaks the generated copy before posting)
  app.patch("/api/distribute/entry/:distributionId", async (req, res) => {
    try {
      const user = requireUser(req);
      const { distributionId } = req.params;
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({ success: false, error: "content is required" });
      }
      const dist = await storage.getDistributionById(distributionId);
      if (!dist) return res.status(404).json({ success: false, error: "Distribution not found" });
      await requireArticle(dist.articleId, user.id); // verifies article belongs to user

      const updated = await storage.updateDistribution(distributionId, {
        metadata: { ...((dist.metadata as object) ?? {}), content },
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update distribution");
    }
  });

  // Distribute an article to multiple platforms. Rate-limited because it
  // makes one OpenAI call per platform (pre-fix: up to 10 calls/request with
  // no limit). Also verifies article ownership and caps the platforms list.
  app.post("/api/distribute/:articleId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.articleId, user.id);

      const platformsRaw = Array.isArray(req.body?.platforms) ? req.body.platforms : [];
      const platforms = platformsRaw
        .filter((p: unknown): p is string => typeof p === "string")
        .slice(0, 5);
      if (platforms.length === 0) {
        return res.status(400).json({ success: false, error: "platforms array is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(503)
          .json({ success: false, error: "Content formatting requires OpenAI API configuration." });
      }

      const brand = article.brandId ? await storage.getBrandById(article.brandId) : null;
      // 2000-char prompt cap — keeps the per-platform LLM call cheap. TODO:
      // make this brand-config or per-platform if we ever want long-form
      // distribution copy.
      const articleContent = article.content?.substring(0, 2000) || article.title || "";
      const articleTitle = article.title ?? "Untitled";

      // Wave 7: run platforms in parallel — each call writes to its own
      // distribution row, so they don't contend. ~2× faster on multi-platform.
      const results = await Promise.all(
        platforms.map(async (platform: string) => {
          const distribution = await storage.createDistribution({
            articleId: article.id,
            platform,
            status: "pending",
          });

          try {
            const platformPrompts: Record<string, string> = {
              LinkedIn: `Convert this article into a compelling LinkedIn post (max 3000 characters). Include:
- A strong hook in the first line to stop scrolling
- Key insights broken into short paragraphs
- Relevant hashtags (5-8)
- A call-to-action or question at the end
- Professional but conversational tone
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}`,
              Medium: `Convert this article into a well-formatted Medium story. Include:
- An engaging title and subtitle
- Clean markdown formatting with headers, bold text, and quotes
- A compelling introduction paragraph
- Key sections maintained from the original
- A strong conclusion
- 3-5 relevant tags at the end (format: Tags: tag1, tag2, tag3)
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}`,
              Reddit: `Convert this article into a Reddit post suitable for industry subreddits. Include:
- A descriptive, non-clickbait title
- A "TL;DR" at the top
- Key points in a readable format
- Genuine, helpful tone (not promotional)
- Discussion questions at the end to encourage engagement
- Suggested subreddits to post in (format: Suggested subreddits: r/sub1, r/sub2)
${brand ? `Brand: ${brand.companyName} (mention naturally, not as promotion)` : ""}

Article title: ${articleTitle}
Content: ${articleContent}`,
              Quora: `Convert this article into a comprehensive Quora answer. Include:
- A suggested question to answer
- A direct, authoritative response
- Supporting details and examples
- Conversational yet knowledgeable tone
- A brief mention of credentials/expertise
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}`,
            };

            const promptContent = platformPrompts[platform] || platformPrompts["LinkedIn"];

            const formatResponse = await openai.chat.completions.create({
              model: MODELS.distribution,
              messages: [
                {
                  role: "system",
                  content: `You are a social media content expert who adapts long-form content for specific platforms. Create engaging, platform-native content that drives engagement.`,
                },
                { role: "user", content: promptContent },
              ],
              max_tokens: 2000,
              temperature: 0.8,
            });

            const formattedContent = formatResponse.choices[0].message.content || "";

            if (!formattedContent.trim()) {
              console.error(
                `[distribute] ${platform} returned empty content for article ${article.id}`,
              );
              await storage.updateDistribution(distribution.id, {
                status: "failed",
                error: "AI returned empty content",
              });
              return {
                platform,
                status: "failed" as const,
                error: "AI returned empty content — try again",
              };
            }

            await storage.updateDistribution(distribution.id, {
              status: "success",
              distributedAt: new Date(),
              platformPostId: `${platform.toLowerCase()}_${article.id}_${Date.now()}`,
              metadata: { content: formattedContent },
            });
            return { platform, status: "success" as const, content: formattedContent };
          } catch (apiError) {
            await storage.updateDistribution(distribution.id, {
              status: "failed",
              error: apiError instanceof Error ? apiError.message : "Content formatting failed",
            });
            return {
              platform,
              status: "failed" as const,
              error: "Failed to generate platform content",
            };
          }
        }),
      );

      res.json({ success: true, data: results });
    } catch (error) {
      sendError(res, error, "Failed to distribute article");
    }
  });

  // GEO Ranking routes
  app.post("/api/geo-rankings", async (req, res) => {
    try {
      const user = requireUser(req);
      const { articleId, aiPlatform, prompt, rank, isCited, citationContext } = req.body ?? {};
      if (!articleId || typeof articleId !== "string") {
        return res.status(400).json({ success: false, error: "articleId is required" });
      }
      await requireArticle(articleId, user.id);
      const ranking = await storage.createGeoRanking({
        articleId,
        aiPlatform,
        prompt,
        rank: rank ?? null,
        isCited: isCited ? 1 : 0,
        citationContext: citationContext ?? null,
      } as any);
      res.json({ success: true, data: ranking });
    } catch (error) {
      sendError(res, error, "Failed to create GEO ranking");
    }
  });

  app.get("/api/geo-rankings", async (req, res) => {
    try {
      const user = requireUser(req);
      const articleId = req.query.articleId as string | undefined;
      if (articleId) {
        await requireArticle(articleId, user.id);
        const rankings = await storage.getGeoRankings(articleId);
        return res.json({ success: true, data: rankings });
      }
      // No articleId: return rankings only for articles the user owns.
      const brandIds = await getUserBrandIds(user.id);
      const allArticles = await storage.getArticles();
      const articleIds = new Set(
        allArticles.filter((a) => a.brandId && brandIds.has(a.brandId)).map((a) => a.id),
      );
      const allRankings = await storage.getGeoRankings();
      const rankings = allRankings.filter((r: any) => r.articleId && articleIds.has(r.articleId));
      res.json({ success: true, data: rankings });
    } catch (error) {
      sendError(res, error, "Failed to fetch GEO rankings");
    }
  });

  app.get("/api/geo-rankings/platform/:platform", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const allArticles = await storage.getArticles();
      const articleIds = new Set(
        allArticles.filter((a) => a.brandId && brandIds.has(a.brandId)).map((a) => a.id),
      );
      const all = await storage.getGeoRankingsByPlatform(req.params.platform);
      const rankings = all.filter((r: any) => r.articleId && articleIds.has(r.articleId));
      res.json({ success: true, data: rankings });
    } catch (error) {
      sendError(res, error, "Failed to fetch platform rankings");
    }
  });
}
