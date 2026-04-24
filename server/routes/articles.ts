// Articles CRUD + distributions + geo-rankings routes (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
//
// Routes:
//   POST   /api/articles                        — create/save article
//   GET    /api/articles                        — list caller's articles (paginated)
//   GET    /api/articles/:id                    — single article (ownership-scoped)
//   PUT    /api/articles/:id                    — update with optional optimistic lock
//   DELETE /api/articles/:id                    — delete
//   GET    /api/articles/slug/:slug             — by slug (ownership-scoped)
//   GET    /api/articles/slug/:slug             — public-viewing duplicate (increments views)
//   POST   /api/distributions                   — create pending distribution rows
//   GET    /api/distributions/:articleId        — list distributions for an article
//   PATCH  /api/distribute/entry/:distributionId — edit saved distribution content
//   POST   /api/distribute/:articleId           — AI-format + distribute to platforms
//   POST   /api/geo-rankings                    — record a GEO ranking observation
//   GET    /api/geo-rankings                    — list rankings (optionally by articleId)
//   GET    /api/geo-rankings/platform/:platform — list rankings filtered by AI platform

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
    "slug",
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
  ] as const;

  // Create/save article. brandId is verified to belong to the caller; all
  // other fields pass through the allowlist (no viewCount/citationCount).
  app.post("/api/articles", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, ARTICLE_WRITE_FIELDS);
      if (body.brandId) {
        await requireBrand(body.brandId as string, user.id);
      }
      if (!body.title || !body.slug || !body.content) {
        return res
          .status(400)
          .json({ success: false, error: "title, slug, and content are required" });
      }
      const article = await storage.createArticle(body as any);
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to create article");
    }
  });

  // Get all articles owned by the caller (across all their brands), with an
  // optional status filter.
  app.get("/api/articles", async (req, res) => {
    try {
      const user = requireUser(req);
      const { limit, offset } = parsePagination(req);
      const brandIdParam = typeof req.query.brandId === "string" ? req.query.brandId : "";
      if (brandIdParam) {
        await requireBrand(brandIdParam, user.id);
        const all = await storage.getArticlesByUserId(user.id, { limit: 500, offset: 0 });
        const filtered = all.filter((a) => a.brandId === brandIdParam);
        const page = filtered.slice(offset, offset + limit);
        return res.json({ success: true, data: page, pagination: { limit, offset } });
      }
      const articles = await storage.getArticlesByUserId(user.id, { limit, offset });
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

  // Get article by slug — also ownership-scoped. Public article viewing is
  // handled by the sitemap/static handlers, not this API.
  app.get("/api/articles/slug/:slug", async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      if (!article.brandId) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      // Verify ownership through the brand before returning.
      try {
        await requireBrand(article.brandId, user.id);
      } catch {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      res.json({ success: true, data: article });
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

  // Delete article — ownership-scoped.
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

  // Get article by slug (for public viewing)
  app.get("/api/articles/slug/:slug", async (req, res) => {
    try {
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({
          success: false,
          error: "Article not found",
        });
      }

      // Increment view count
      await storage.incrementArticleViews(article.id);

      res.json({
        success: true,
        article,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch article",
      });
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
      const articleContent = article.content?.substring(0, 2000) || article.title;

      const results = [];
      for (const platform of platforms) {
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

Article title: ${article.title}
Content: ${articleContent}`,
            Medium: `Convert this article into a well-formatted Medium story. Include:
- An engaging title and subtitle
- Clean markdown formatting with headers, bold text, and quotes
- A compelling introduction paragraph
- Key sections maintained from the original
- A strong conclusion
- 3-5 relevant tags at the end (format: Tags: tag1, tag2, tag3)
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${article.title}
Content: ${articleContent}`,
            Reddit: `Convert this article into a Reddit post suitable for industry subreddits. Include:
- A descriptive, non-clickbait title
- A "TL;DR" at the top
- Key points in a readable format
- Genuine, helpful tone (not promotional)
- Discussion questions at the end to encourage engagement
- Suggested subreddits to post in (format: Suggested subreddits: r/sub1, r/sub2)
${brand ? `Brand: ${brand.companyName} (mention naturally, not as promotion)` : ""}

Article title: ${article.title}
Content: ${articleContent}`,
            Quora: `Convert this article into a comprehensive Quora answer. Include:
- A suggested question to answer
- A direct, authoritative response
- Supporting details and examples
- Conversational yet knowledgeable tone
- A brief mention of credentials/expertise
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${article.title}
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
            results.push({
              platform,
              status: "failed",
              error: "AI returned empty content — try again",
            });
            continue;
          }

          await storage.updateDistribution(distribution.id, {
            status: "success",
            distributedAt: new Date(),
            platformPostId: `${platform.toLowerCase()}_${article.id}_${Date.now()}`,
            metadata: { content: formattedContent },
          });
          results.push({ platform, status: "success", content: formattedContent });
        } catch (apiError) {
          await storage.updateDistribution(distribution.id, {
            status: "failed",
            error: apiError instanceof Error ? apiError.message : "Content formatting failed",
          });
          results.push({
            platform,
            status: "failed",
            error: "Failed to generate platform content",
          });
        }
      }

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
