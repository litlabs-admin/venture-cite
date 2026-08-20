// Articles CRUD + revisions + distributions + geo-rankings routes.
//
// Articles use a brand-scoped ID instead of a slug route.
// referenced by id only. The unique slug column was dropped in migration 0033.
// Drafts are now articles with status='draft' (the legacy content_drafts
// table is gone), so this file owns the draft creation endpoint too.
//
// Routes:
//   POST   /api/articles                                - create ready article
//   POST   /api/articles/draft                          - create draft article
//   GET    /api/articles                                - list (status-filterable)
//   GET    /api/articles/:id                            - single article
//   PUT    /api/articles/:id                            - update (optimistic lock)
//   DELETE /api/articles/:id                            - delete
//   GET    /api/articles/:id/revisions                  - list revisions newest-first
//   GET    /api/articles/:id/revisions/:revId           - single revision
//   POST   /api/articles/:id/revisions/:revId/restore   - restore old revision
//   POST   /api/distributions                           - create pending rows
//   GET    /api/distributions/:articleId                - list distributions
//   PATCH  /api/distribute/entry/:distributionId        - edit saved copy
//   POST   /api/distribute/:articleId                   - AI-format to platforms
//   POST   /api/geo-rankings                            - record a ranking observation
//   GET    /api/geo-rankings                            - list rankings
//   GET    /api/geo-rankings/platform/:platform         - list by AI platform

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { requireUser, requireArticle, requireBrand, getUserBrandIds } from "../lib/ownership";
import { parsePagination } from "../lib/pagination";
import { aiLimitMiddleware, openai, sendError, asyncHandler } from "../lib/routesShared";
import { postToBuffer } from "../lib/bufferPost";
import { createRequestActor } from "../lib/requestActor";
import { contentRequestData } from "../data/contentRequestData";

const distributionCreateSchema = z.object({
  articleId: z.string().min(1),
  platforms: z.array(z.string().min(1)).min(1),
});

const distributionEditSchema = z.object({ content: z.string() });

const distributionFormatSchema = z.object({
  platforms: z.array(z.string().min(1)).min(1),
});

const bufferPostSchema = z.object({ channelId: z.string().min(1) });

function metadataWithContent(metadata: unknown, content: string): Record<string, unknown> {
  const current =
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata : {};
  return { ...current, content };
}

import { logger } from "../lib/logger";
export function setupArticlesRoutes(app: Express): void {
  const articleFields = z.object({
    brandId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    excerpt: z.string().nullable().optional(),
    metaDescription: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    industry: z.string().nullable().optional(),
    contentType: z.string().nullable().optional(),
    featuredImage: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    externalUrl: z.string().nullable().optional(),
  });
  const readyArticleSchema = articleFields.extend({
    brandId: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
  });
  const draftArticleSchema = articleFields.extend({ brandId: z.string().min(1) });
  const updateArticleSchema = articleFields
    .extend({ expectedVersion: z.number().int().nonnegative().optional() })
    .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
      message: "At least one article field is required",
    });
  const restoreSchema = z.object({ expectedVersion: z.number().int().nonnegative().optional() });
  // Create/save a ready article. brandId is verified to belong to the caller;
  // all other fields pass through the allowlist (no viewCount/citationCount).
  // The schema requires brandId, so orphan articles
  // are forbidden going forward.
  app.post(
    "/api/articles",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const parsed = readyArticleSchema.safeParse(req.body ?? {});
        if (!parsed.success)
          return res.status(400).json({ success: false, error: "Invalid article input" });
        const brand = await requireBrand(parsed.data.brandId, user.id);
        if (brand.deletedAt)
          return res.status(404).json({ success: false, error: "Brand not found" });
        // Force ready status; explicit drafts go through POST /api/articles/draft.
        const article = await contentRequestData.forActor(actor).articles.createReady(parsed.data);
        res.json({ success: true, article });
      } catch (error) {
        sendError(res, error, "Failed to create article");
      }
    }),
  );

  // Create a draft article. The Content page calls this on first visit so
  // the user has a stable id to PATCH form-state into. status='draft' until
  // the user clicks Generate, at which point the worker flips it.
  app.post(
    "/api/articles/draft",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const parsed = draftArticleSchema.safeParse(req.body ?? {});
        if (!parsed.success)
          return res.status(400).json({ success: false, error: "Invalid draft input" });
        const brand = await requireBrand(parsed.data.brandId, user.id);
        if (brand.deletedAt)
          return res.status(404).json({ success: false, error: "Brand not found" });
        const article = await contentRequestData.forActor(actor).articles.createDraft(parsed.data);
        res.json({ success: true, data: article });
      } catch (error) {
        sendError(res, error, "Failed to create draft article");
      }
    }),
  );

  // List articles owned by the caller. Supports filtering by status (single
  // value or comma-separated list) and brandId. Default status='ready' so
  // the Articles page only shows finished work; the Content page's Recent
  // Drafts dropdown passes status=draft,generating,failed.
  app.get(
    "/api/articles",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
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

        const articles = await contentRequestData.forActor(actor).articles.list({
          status,
          brandId: brandIdParam,
          limit,
          offset,
        });
        res.json({ success: true, data: articles, pagination: { limit, offset } });
      } catch (error) {
        sendError(res, error, "Failed to fetch articles");
      }
    }),
  );

  // Get article by ID - user must own the article's brand.
  app.get(
    "/api/articles/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const article = await contentRequestData.forActor(actor).articles.get(req.params.id);
        if (!article) return res.status(404).json({ success: false, error: "Article not found" });
        res.json({ success: true, article });
      } catch (error) {
        sendError(res, error, "Failed to fetch article");
      }
    }),
  );

  // Update article - ownership-scoped, body allowlist.
  app.put(
    "/api/articles/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const parsed = updateArticleSchema.safeParse(req.body ?? {});
        if (!parsed.success)
          return res.status(400).json({ success: false, error: "Invalid article update" });
        const { expectedVersion, ...update } = parsed.data;

        // Optimistic locking prevents an older client from overwriting
        // the reasoning. Same pattern, different table.
        let article;
        if (expectedVersion !== undefined) {
          article = await contentRequestData
            .forActor(actor)
            .articles.updateIfVersion(req.params.id, expectedVersion, update);
          if (!article) {
            const current = await contentRequestData.forActor(actor).articles.get(req.params.id);
            if (!current)
              return res.status(404).json({ success: false, error: "Article not found" });
            return res.status(409).json({
              success: false,
              error:
                "Article changed since you started editing. Refresh to see the latest content, then re-apply your changes.",
              code: "version_conflict",
              current,
            });
          }
        } else {
          article = await contentRequestData.forActor(actor).articles.update(req.params.id, update);
          if (!article) {
            return res.status(404).json({ success: false, error: "Article not found" });
          }
        }
        res.json({ success: true, article });
      } catch (error) {
        sendError(res, error, "Failed to update article");
      }
    }),
  );

  // Delete article - ownership-scoped. Hard-deletes today; soft-delete is
  // tracked as a follow-up (would need an articles.deleted_at column).
  // Cascade handles article_revisions + distributions + geo_rankings via FK.
  app.delete(
    "/api/articles/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const deleted = await contentRequestData
          .forActor(createRequestActor(user.id))
          .articles.delete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "Article not found" });
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete article");
      }
    }),
  );

  // ── Article revisions ─────────────────────────────────────────────────────
  // Each row is an immutable snapshot of articles.content at the time it was
  // recorded. Created by the worker on generation success, by Auto-Improve
  // both before and after the rewrite (so the user can revert), and by
  // Restore (which records a new manual_edit pointing at the restored state).

  app.get(
    "/api/articles/:id/revisions",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const article = await contentRequestData.forActor(actor).articles.get(req.params.id);
        if (!article) return res.status(404).json({ success: false, error: "Article not found" });
        const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
        const revisions = await contentRequestData
          .forActor(actor)
          .revisions.list(req.params.id, limit);
        res.json({ success: true, data: revisions });
      } catch (error) {
        sendError(res, error, "Failed to list revisions");
      }
    }),
  );

  app.get(
    "/api/articles/:id/revisions/:revId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const article = await contentRequestData.forActor(actor).articles.get(req.params.id);
        if (!article) return res.status(404).json({ success: false, error: "Article not found" });
        const revision = await contentRequestData.forActor(actor).revisions.get(req.params.revId);
        if (!revision || revision.articleId !== req.params.id) {
          return res.status(404).json({ success: false, error: "Revision not found" });
        }
        res.json({ success: true, data: revision });
      } catch (error) {
        sendError(res, error, "Failed to fetch revision");
      }
    }),
  );

  // Restore an old revision: the article's current content is overwritten
  // with the revision's content, version is bumped, and a new manual_edit
  // revision is recorded so the restore itself appears in the history.
  app.post(
    "/api/articles/:id/revisions/:revId/restore",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const parsed = restoreSchema.safeParse(req.body ?? {});
        if (!parsed.success)
          return res.status(400).json({ success: false, error: "Invalid restore input" });
        const result = await contentRequestData
          .forActor(actor)
          .revisions.restore(req.params.id, req.params.revId, parsed.data.expectedVersion);
        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Revision not found" });
        }
        if (result.kind === "conflict") {
          return res.status(409).json({
            success: false,
            error: "Article changed since restore was started. Refresh and try again.",
            code: "version_conflict",
            current: result.current,
          });
        }
        if (result.kind === "invalid_content") {
          return res.status(400).json({ success: false, error: "Revision content is empty" });
        }
        res.json({ success: true, article: result.article });
      } catch (error) {
        sendError(res, error, "Failed to restore revision");
      }
    }),
  );

  // Distribution routes
  app.post(
    "/api/distributions",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const parsed = distributionCreateSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ success: false, error: "articleId and platforms are required" });
        }
        const actor = createRequestActor(user.id);
        const article = await contentRequestData
          .forActor(actor)
          .articles.get(parsed.data.articleId);
        if (!article) return res.status(404).json({ success: false, error: "Article not found" });

        const distributions = await contentRequestData.forActor(actor).distributions.createMany(
          parsed.data.platforms.slice(0, 10).map((platform) => ({
            articleId: article.id,
            platform,
            status: "pending",
          })),
        );

        res.json({ success: true, data: distributions });
      } catch (error) {
        sendError(res, error, "Failed to create distributions");
      }
    }),
  );

  app.get(
    "/api/distributions/:articleId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const article = await contentRequestData.forActor(actor).articles.get(req.params.articleId);
        if (!article) return res.status(404).json({ success: false, error: "Article not found" });
        const distributions = await contentRequestData
          .forActor(actor)
          .distributions.list(req.params.articleId);
        res.json({ success: true, data: distributions });
      } catch (error) {
        sendError(res, error, "Failed to fetch distributions");
      }
    }),
  );

  // Edit saved distribution content (e.g., user tweaks the generated copy before posting)
  app.patch(
    "/api/distribute/entry/:distributionId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { distributionId } = req.params;
        const parsed = distributionEditSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "content is required" });
        }
        const actor = createRequestActor(user.id);
        const dist = await contentRequestData.forActor(actor).distributions.get(distributionId);
        if (!dist) return res.status(404).json({ success: false, error: "Distribution not found" });

        const updated = await contentRequestData
          .forActor(actor)
          .distributions.update(distributionId, {
            metadata: metadataWithContent(dist.metadata, parsed.data.content),
          });
        res.json({ success: true, data: updated });
      } catch (error) {
        sendError(res, error, "Failed to update distribution");
      }
    }),
  );

  // Distribute an article to multiple platforms. Rate-limited because it
  // makes one OpenAI call per platform (pre-fix: up to 10 calls/request with
  // no limit). Also verifies article ownership and caps the platforms list.
  app.post(
    "/api/distribute/:articleId",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const article = await contentRequestData.forActor(actor).articles.get(req.params.articleId);
        if (!article) return res.status(404).json({ success: false, error: "Article not found" });

        const parsed = distributionFormatSchema.safeParse(req.body ?? {});
        const platforms = parsed.success ? parsed.data.platforms : [];
        if (platforms.length === 0) {
          return res.status(400).json({ success: false, error: "platforms array is required" });
        }

        if (!process.env.OPENAI_API_KEY) {
          return res.status(503).json({
            success: false,
            error: "Content formatting requires OpenAI API configuration.",
          });
        }

        const brand = article.brandId ? await storage.getBrandById(article.brandId) : null;
        // 2000-char prompt cap - keeps the per-platform LLM call cheap. TODO:
        // make this brand-config or per-platform if we ever want long-form
        // distribution copy.
        const articleContent = article.content?.substring(0, 2000) || article.title || "";
        const articleTitle = article.title ?? "Untitled";

        // Run platforms in parallel. Each call writes to its own
        // distribution row, so they don't contend. ~2× faster on multi-platform.
        const results = await Promise.all(
          platforms.map(async (platform: string) => {
            const created = await contentRequestData
              .forActor(actor)
              .distributions.createMany([{ articleId: article.id, platform, status: "pending" }]);
            const distribution = created[0];
            if (!distribution) throw new Error("Distribution insert returned no row");

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
                Twitter: `Convert this article into a single Twitter/X post.
Hard constraint: total post must be ≤ 280 characters including hashtags. Do not exceed.
Include:
- A strong hook in the first sentence
- 1–2 highly relevant hashtags
- No preamble, no "Here's a post:" - output the post text only
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}

Reminder: total length ≤ 280 characters.`,
                Facebook: `Convert this article into a Facebook post.
Hard constraint: total post must be ≤ 2000 characters. Aim for under 1500 for engagement.
Include:
- A scroll-stopping opening sentence
- 2–4 short paragraphs (Facebook engagement falls off past 2000 chars)
- 1–2 emojis where natural, not forced
- 3–5 relevant hashtags at the end
- Conversational tone, not corporate
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}

Reminder: total length ≤ 2000 characters.`,
                Instagram: `Convert this article into an Instagram caption.
Hard constraints:
- Total caption ≤ 2200 characters
- The first 125 characters are critical - that's what shows before the "more" cut. Front-load the hook there.
Include:
- An attention-grabbing hook in the first 125 characters
- Body paragraphs separated by blank lines (use line breaks, no markdown)
- Up to 30 relevant hashtags grouped together at the end on a separate line, after a "." or "•••" separator
- Friendly, authentic tone
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}

Reminder: hook in the first 125 characters; total ≤ 2200 characters.`,
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
                logger.error(
                  `[distribute] ${platform} returned empty content for article ${article.id}`,
                );
                await contentRequestData.forActor(actor).distributions.update(distribution.id, {
                  status: "failed",
                  error: "AI returned empty content",
                });
                return {
                  platform,
                  status: "failed" as const,
                  error: "AI returned empty content - try again",
                };
              }

              await contentRequestData.forActor(actor).distributions.update(distribution.id, {
                status: "success",
                distributedAt: new Date(),
                metadata: { content: formattedContent },
              });
              return {
                platform,
                status: "success" as const,
                content: formattedContent,
                distributionId: distribution.id,
                platformPostId: null as string | null,
              };
            } catch (apiError) {
              await contentRequestData.forActor(actor).distributions.update(distribution.id, {
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
    }),
  );

  // Post a previously-generated distribution row to Buffer. The row
  // already holds the platform-adapted copy in `metadata.content`; we
  // call Buffer's createPost via the shared helper, then stamp the real
  // post id back onto the row so the UI can show "Posted ✓" across
  // dialog reloads.
  app.post(
    "/api/distributions/:distributionId/buffer-post",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const distribution = await contentRequestData
          .forActor(createRequestActor(user.id))
          .distributions.get(req.params.distributionId);
        if (!distribution) {
          return res.status(404).json({ success: false, error: "not_found" });
        }
        const parsed = bufferPostSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "channelId is required" });
        }
        const content = (distribution.metadata as { content?: string } | null)?.content;
        if (!content || typeof content !== "string" || !content.trim()) {
          return res.status(400).json({ success: false, error: "no_content" });
        }
        const result = await postToBuffer(user.id, parsed.data.channelId, content);
        if (result.ok) {
          await storage.updateDistribution(distribution.id, {
            platformPostId: result.postId,
            status: "scheduled",
            distributedAt: new Date(),
          });
          return res.json({
            success: true,
            data: { platformPostId: result.postId },
          });
        }
        if (result.code === "not_connected") {
          return res.status(403).json({ success: false, error: "not_connected" });
        }
        if (result.code === "rejected") {
          return res
            .status(502)
            .json({ success: false, error: result.message ?? "Buffer rejected the post" });
        }
        return res.status(502).json({ success: false, error: "buffer_unreachable" });
      } catch (error) {
        sendError(res, error, "Failed to post distribution to Buffer");
      }
    }),
  );

  // GEO Ranking routes
  app.post(
    "/api/geo-rankings",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { articleId, aiPlatform, prompt, rank, isCited, citationContext } = req.body ?? {};
        if (!articleId || typeof articleId !== "string") {
          return res.status(400).json({ success: false, error: "articleId is required" });
        }
        const article = await requireArticle(articleId, user.id);
        const ranking = await storage.createGeoRanking({
          articleId,
          brandId: article.brandId,
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
    }),
  );

  app.get(
    "/api/geo-rankings",
    asyncHandler(async (req, res) => {
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
    }),
  );

  app.get(
    "/api/geo-rankings/platform/:platform",
    asyncHandler(async (req, res) => {
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
    }),
  );
}
