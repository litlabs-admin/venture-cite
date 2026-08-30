// Distribution business logic extracted from server/routes/articles.ts
// (phase B7-15). Pure functions: explicit parameters in, plain data out or
// throws. No Express types, no req/res.

import { MODELS } from "../lib/modelConfig";
import { openai } from "../lib/routesShared";
import { logger } from "../lib/logger";
import type { ContentRequestDistributionRepository } from "../data/contentRequestDistributionRepository";

export function metadataWithContent(metadata: unknown, content: string): Record<string, unknown> {
  const current =
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata : {};
  return { ...current, content };
}

export type DistributeArticleResult =
  | {
      platform: string;
      status: "success";
      content: string;
      distributionId: string;
      platformPostId: string | null;
    }
  | { platform: string; status: "failed"; error: string };

// Distribute an article to multiple platforms in parallel. Each call writes
// to its own distribution row, so they don't contend.
export async function distributeArticleToPlatforms(params: {
  article: { id: string; content: string | null; title: string | null };
  brand: { companyName: string } | null | undefined;
  platforms: string[];
  distributions: ContentRequestDistributionRepository;
}): Promise<DistributeArticleResult[]> {
  const { article, brand, platforms, distributions } = params;

  // 2000-char prompt cap - keeps the per-platform LLM call cheap. TODO:
  // make this brand-config or per-platform if we ever want long-form
  // distribution copy.
  const articleContent = article.content?.substring(0, 2000) || article.title || "";
  const articleTitle = article.title ?? "Untitled";

  const results = await Promise.all(
    platforms.map(async (platform: string) => {
      const created = await distributions.createMany([
        { articleId: article.id, platform, status: "pending" },
      ]);
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
          logger.error(`[distribute] ${platform} returned empty content for article ${article.id}`);
          await distributions.update(distribution.id, {
            status: "failed",
            error: "AI returned empty content",
          });
          return {
            platform,
            status: "failed" as const,
            error: "AI returned empty content - try again",
          };
        }

        await distributions.update(distribution.id, {
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
        await distributions.update(distribution.id, {
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

  return results;
}
