// Community posts routes (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// The original monolith now only mounts this module via setupCommunityRoutes.
//
// Includes:
//   GET    /api/community-posts       — list posts (optionally scoped to brand)
//   POST   /api/community-posts       — create a community post
//   GET    /api/community-posts/:id   — fetch a single post
//   PATCH  /api/community-posts/:id   — update a post
//   DELETE /api/community-posts/:id   — delete a post
//   POST   /api/community-discover    — AI-powered community group discovery
//   POST   /api/community-generate    — AI-powered community post generation

import type { Express } from "express";
import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import {
  requireUser,
  requireBrand,
  requireCommunityPost,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import { aiLimitMiddleware, openai, safeParseJson, sendError } from "../lib/routesShared";

export function setupCommunityRoutes(app: Express): void {
  // ============ Community Engagement Routes ============

  const COMMUNITY_POST_WRITE_FIELDS = [
    "brandId",
    "platform",
    "groupName",
    "groupUrl",
    "title",
    "content",
    "postUrl",
    "status",
    "postType",
    "keywords",
    "generatedByAi",
    "postedAt",
  ] as const;

  app.get("/api/community-posts", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, platform, status } = req.query;
      if (brandId && typeof brandId === "string") {
        const posts = await storage.getCommunityPosts(brandId, {
          platform: platform as string | undefined,
          status: status as string | undefined,
        });
        return res.json({ success: true, data: posts });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getCommunityPosts(undefined, {
        platform: platform as string | undefined,
        status: status as string | undefined,
      });
      const posts = all.filter((p: any) => p.brandId && brandIds.has(p.brandId));
      res.json({ success: true, data: posts });
    } catch (error) {
      sendError(res, error, "Failed to fetch community posts");
    }
  });

  app.post("/api/community-posts", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, COMMUNITY_POST_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.platform || !body.groupName || !body.content) {
        return res
          .status(400)
          .json({ success: false, error: "platform, groupName, and content are required" });
      }
      const post = await storage.createCommunityPost(body as any);
      res.json({ success: true, data: post });
    } catch (error) {
      sendError(res, error, "Failed to create community post");
    }
  });

  app.get("/api/community-posts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const post = await requireCommunityPost(req.params.id, user.id);
      res.json({ success: true, data: post });
    } catch (error) {
      sendError(res, error, "Failed to fetch community post");
    }
  });

  app.patch("/api/community-posts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCommunityPost(req.params.id, user.id);
      const update = pickFields<any>(req.body, COMMUNITY_POST_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      // Drizzle's timestamp columns default to mode "date" and reject ISO
      // strings, so coerce incoming `postedAt` before passing to the DAO.
      if (typeof update.postedAt === "string") {
        const d = new Date(update.postedAt);
        update.postedAt = Number.isNaN(d.getTime()) ? null : d;
      }
      const post = await storage.updateCommunityPost(req.params.id, update as any);
      if (!post) return res.status(404).json({ success: false, error: "Post not found" });
      res.json({ success: true, data: post });
    } catch (error) {
      sendError(res, error, "Failed to update community post");
    }
  });

  app.delete("/api/community-posts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCommunityPost(req.params.id, user.id);
      const deleted = await storage.deleteCommunityPost(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Post not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete community post");
    }
  });

  // AI-powered community group discovery
  app.post("/api/community-discover", aiLimitMiddleware, async (req, res) => {
    try {
      requireUser(req);
      const { brandName, industry, keywords, platform } = req.body ?? {};

      if (!brandName || !industry) {
        return res
          .status(400)
          .json({ success: false, error: "Brand name and industry are required" });
      }

      const prompt = `You are a community marketing expert. Find relevant online communities where the brand "${brandName}" in the "${industry}" industry should be active to build citations and authority for AI search engines.

${keywords?.length ? `Target keywords: ${keywords.join(", ")}` : ""}
${platform ? `Focus on platform: ${platform}` : "Include Reddit, Quora, Hacker News, and niche forums"}

Return a JSON array of 10-15 community groups with this structure:
[{
  "platform": "reddit" | "quora" | "hackernews" | "forum" | "discord" | "slack",
  "name": "group/subreddit/space name",
  "url": "direct URL to the group",
  "members": "estimated member count string",
  "relevance": "high" | "medium",
  "description": "Why this group is relevant and how to participate",
  "suggestedApproach": "Specific strategy for engaging without being spammy",
  "topicIdeas": ["topic 1", "topic 2", "topic 3"]
}]

Only return the JSON array, no other text.`;

      const completion = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const parsed = safeParseJson<any>(completion.choices[0].message.content);
      const groups = Array.isArray(parsed) ? parsed : parsed?.groups || parsed?.communities || [];

      res.json({ success: true, data: groups });
    } catch (error) {
      sendError(res, error, "Failed to discover communities");
    }
  });

  // AI-powered community post generation
  app.post("/api/community-generate", aiLimitMiddleware, async (req, res) => {
    try {
      requireUser(req);
      const { brandName, brandDescription, platform, groupName, topic, postType, tone } =
        req.body ?? {};

      if (!brandName || !platform || !groupName || !topic) {
        return res
          .status(400)
          .json({ success: false, error: "Brand name, platform, group, and topic are required" });
      }

      const platformGuidelines: Record<string, string> = {
        reddit:
          "Reddit values authentic, helpful content. Never be overtly promotional. Share genuine expertise. Use the community's language style. Add value first, mention brand naturally only if relevant. Follow subreddit rules.",
        quora:
          "Quora rewards detailed, expert answers. Cite sources, share personal experience, be thorough. You can mention your brand as a relevant example but the answer should be valuable standalone.",
        hackernews:
          "Hacker News values technical depth, original insights, and contrarian thinking. Be substantive. Avoid marketing language entirely. Focus on technical merit and data.",
        forum:
          "Forum posts should be helpful and community-oriented. Build reputation through consistent, valuable contributions. Never spam.",
        discord:
          "Discord is conversational. Be helpful, concise, and friendly. Share expertise naturally in conversations.",
        slack:
          "Slack communities value professional, concise contributions. Share actionable insights and resources.",
      };

      const prompt = `You are an expert community marketer. Generate a ${postType || "post"} for ${platform} in the "${groupName}" group/community.

Brand: ${brandName}
${brandDescription ? `Brand description: ${brandDescription}` : ""}
Topic: ${topic}
Tone: ${tone || "helpful and authentic"}

Platform guidelines: ${platformGuidelines[platform] || "Be helpful and authentic."}

CRITICAL RULES:
- The content must provide genuine value to the community
- Do NOT be overtly promotional or spammy
- Mention the brand naturally only if it adds value to the discussion
- Focus on being helpful, informative, and engaging
- Write like a real community member, not a marketer
- Include specific examples, data points, or actionable advice

Return a JSON object with:
{
  "title": "Post title (if applicable for the platform)",
  "content": "The full post/answer content",
  "hashtags": ["relevant", "hashtags"],
  "tips": ["Posting tip 1", "Posting tip 2"],
  "bestTimeToPost": "Suggested time/day to post for maximum visibility"
}

Only return the JSON object, no other text.`;

      const completion = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });

      const result = safeParseJson<any>(completion.choices[0].message.content) ?? {
        content: completion.choices[0].message.content || "",
      };

      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error, "Failed to generate community content");
    }
  });
}
