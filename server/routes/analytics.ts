// Analytics: crawler permissions, GEO analytics, reports, sentiment, opportunities (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// The original monolith now only mounts this module via setupAnalyticsRoutes.
//
// Includes:
//   POST /api/check-crawler-permissions    — robots.txt-based AI crawler audit
//   GET  /api/geo-analytics/:brandId       — SoV + AI visibility + sentiment rollup
//   GET  /api/client-reports/:brandId      — current vs. prior window report metrics
//   POST /api/analyze-sentiment            — OpenAI sentiment classifier
//   POST /api/geo-analytics/:brandId/snapshot — persist a visibility snapshot
//   GET  /api/geo-analytics/:brandId/history  — snapshot history
//   GET  /api/geo-opportunities/:brandId   — brand-specific opportunity finder
//   GET  /api/geo-opportunities            — industry-generic opportunity finder

import type { Express } from "express";
import { storage } from "../storage";
import { AI_PLATFORMS as SHARED_AI_PLATFORMS, CITATION_SCORING } from "@shared/constants";
import { MODELS } from "../lib/modelConfig";
import { safeFetchText } from "../lib/ssrf";
import { requireUser } from "../lib/ownership";
import {
  openai,
  aiLimitMiddleware,
  sendError,
  safeParseJson,
  MAX_CONTENT_LENGTH,
} from "../lib/routesShared";

export function setupAnalyticsRoutes(app: Express): void {
  // ========== AI CRAWLER PERMISSION CHECKER ==========

  // Known AI crawler user agents. Each entry carries a `category` so the
  // UI can group by vendor ("OpenAI (3 bots)") instead of rendering 15 flat
  // rows. Keep this list current — deprecated names (Claude-Web,
  // anthropic-ai, old Applebot labels) mislead users into thinking a bot
  // is blocked when the real bot is allowed under its new name.
  //
  // Note: `facebookexternalhit` is link-preview scraping, NOT AI training
  // — deliberately excluded. Meta's AI crawler is `meta-externalagent`.
  // purpose tag orthogonal to vendor category:
  //   training → crawled to build the next model weights
  //   search   → crawled to index for the vendor's AI search product
  //   realtime → fired at fetch-time when a user asks the assistant to open a URL
  // Site owners typically want to allow "search" everywhere, may opt out of
  // "training" selectively, and almost always allow "realtime".
  const AI_CRAWLERS: Array<{
    name: string;
    agent: string;
    platform: string;
    category: string;
    purpose: "training" | "search" | "realtime";
    description: string;
  }> = [
    // ── OpenAI ──
    {
      name: "GPTBot",
      agent: "GPTBot",
      platform: "OpenAI (training)",
      category: "OpenAI",
      purpose: "training",
      description:
        "OpenAI's main training crawler — gathers content for ChatGPT and future models.",
    },
    {
      name: "ChatGPT-User",
      agent: "ChatGPT-User",
      platform: "ChatGPT (browsing)",
      category: "OpenAI",
      purpose: "realtime",
      description: "User-triggered browsing agent when ChatGPT fetches a page on a user's behalf.",
    },
    {
      name: "OAI-SearchBot",
      agent: "OAI-SearchBot",
      platform: "ChatGPT Search",
      category: "OpenAI",
      purpose: "search",
      description: "OpenAI's search-indexing crawler powering ChatGPT Search.",
    },

    // ── Anthropic / Claude ──
    {
      name: "ClaudeBot",
      agent: "ClaudeBot",
      platform: "Claude (training)",
      category: "Anthropic",
      purpose: "training",
      description:
        "Anthropic's primary training crawler. Distinct from Claude-Web (legacy) and Claude-SearchBot (search).",
    },
    {
      name: "Claude-Web",
      agent: "Claude-Web",
      platform: "Claude (legacy)",
      category: "Anthropic",
      purpose: "training",
      description:
        "Older Anthropic crawler still observed in the wild; some sites treat it distinctly from ClaudeBot.",
    },
    {
      name: "Claude-User",
      agent: "Claude-User",
      platform: "Claude (browsing)",
      category: "Anthropic",
      purpose: "realtime",
      description: "User-triggered browsing agent when Claude fetches a page on a user's behalf.",
    },
    {
      name: "Claude-SearchBot",
      agent: "Claude-SearchBot",
      platform: "Claude Search",
      category: "Anthropic",
      purpose: "search",
      description: "Anthropic's search-indexing crawler for Claude's search features.",
    },

    // ── Perplexity ──
    {
      name: "PerplexityBot",
      agent: "PerplexityBot",
      platform: "Perplexity (indexing)",
      category: "Perplexity",
      purpose: "search",
      description:
        "Perplexity's indexing crawler — the retrieval side that builds Perplexity's answer index.",
    },
    {
      name: "Perplexity-User",
      agent: "Perplexity-User",
      platform: "Perplexity (browsing)",
      category: "Perplexity",
      purpose: "realtime",
      description:
        "User-triggered browsing agent when Perplexity fetches a page to answer a specific query.",
    },

    // ── Google ──
    {
      name: "Googlebot",
      agent: "Googlebot",
      platform: "Google Search",
      category: "Google",
      purpose: "search",
      description:
        "Google's primary search crawler. Blocking this removes you from Google Search entirely.",
    },
    {
      name: "Google-Extended",
      agent: "Google-Extended",
      platform: "Google AI (Gemini / AI Overviews)",
      category: "Google",
      purpose: "training",
      description:
        "Google's AI training toggle — independent from search crawling. Block this alone to keep content out of Gemini training while staying in Google Search.",
    },

    // ── Microsoft ──
    {
      name: "Bingbot",
      agent: "Bingbot",
      platform: "Bing / Copilot",
      category: "Microsoft",
      purpose: "search",
      description: "Microsoft's crawler for Bing Search and Copilot answers.",
    },

    // ── Meta ──
    {
      name: "meta-externalagent",
      agent: "meta-externalagent",
      platform: "Meta AI",
      category: "Meta",
      purpose: "training",
      description:
        "Meta's AI training crawler. (facebookexternalhit is link-preview scraping, not AI training — deliberately not checked.)",
    },
    {
      name: "FacebookBot",
      agent: "FacebookBot",
      platform: "Meta (training)",
      category: "Meta",
      purpose: "training",
      description: "Meta's training crawler for AI assistants.",
    },

    // ── ByteDance / TikTok ──
    {
      name: "Bytespider",
      agent: "Bytespider",
      platform: "ByteDance / TikTok",
      category: "ByteDance",
      purpose: "training",
      description: "ByteDance's crawler, widely used for LLM training sets.",
    },

    // ── Apple ──
    {
      name: "Applebot",
      agent: "Applebot",
      platform: "Apple (Siri / Spotlight)",
      category: "Apple",
      purpose: "search",
      description: "Apple's main crawler for Siri suggestions, Spotlight, and Safari snippets.",
    },
    {
      name: "Applebot-Extended",
      agent: "Applebot-Extended",
      platform: "Apple Intelligence (training)",
      category: "Apple",
      purpose: "training",
      description:
        "Apple's AI training toggle — block this alone to keep content out of Apple Intelligence training while staying in Siri/Spotlight.",
    },

    // ── Common Crawl ──
    {
      name: "CCBot",
      agent: "CCBot",
      platform: "Common Crawl",
      category: "Common Crawl",
      purpose: "training",
      description:
        "Common Crawl open dataset — feeds many LLMs' pretraining data (GPT-3, LLaMA, and more).",
    },
  ];

  // Parse robots.txt content
  function parseRobotsTxt(
    content: string,
  ): { userAgent: string; rules: { type: "allow" | "disallow"; path: string }[] }[] {
    const blocks: { userAgent: string; rules: { type: "allow" | "disallow"; path: string }[] }[] =
      [];
    let currentBlock: {
      userAgent: string;
      rules: { type: "allow" | "disallow"; path: string }[];
    } | null = null;

    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    // robots.txt semantics (per RFC 9309 / Google spec):
    //   Disallow: /       → block the entire site
    //   Disallow:         → empty value means NOTHING disallowed — allow all
    //   Disallow: /admin  → block only /admin
    //   Allow: /          → explicit allow-all
    // The previous parser defaulted empty Disallow to "/", which flipped
    // the semantics and showed sites with `Disallow:` (an allow-all signal)
    // as blocking every crawler. Keep empty paths empty below.
    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (lowerLine.startsWith("user-agent:")) {
        const agent = line.substring(11).trim();
        currentBlock = { userAgent: agent, rules: [] };
        blocks.push(currentBlock);
      } else if (currentBlock) {
        if (lowerLine.startsWith("disallow:")) {
          const path = line.substring(9).trim();
          currentBlock.rules.push({ type: "disallow", path });
        } else if (lowerLine.startsWith("allow:")) {
          const path = line.substring(6).trim();
          if (path) currentBlock.rules.push({ type: "allow", path });
        }
      }
    }

    return blocks;
  }

  // Check if a crawler is blocked by the parsed robots.txt rules.
  //
  // Decision order:
  //   1. Block specific to this crawler with Disallow: /  → BLOCKED (unless
  //      that same block also has Allow: / which un-blocks).
  //   2. Block specific to this crawler with only Disallow: (empty) or
  //      narrower paths → ALLOWED (site doesn't block the whole crawler).
  //   3. No specific block → fall back to wildcard (User-agent: *).
  //   4. Wildcard with Disallow: /  → BLOCKED.
  //   5. Nothing matches → ALLOWED by default.
  function isCrawlerBlocked(
    blocks: ReturnType<typeof parseRobotsTxt>,
    crawlerAgent: string,
  ): { blocked: boolean; reason: string } {
    const specificBlock = blocks.find(
      (b) => b.userAgent.toLowerCase() === crawlerAgent.toLowerCase(),
    );
    const wildcardBlock = blocks.find((b) => b.userAgent === "*");

    if (specificBlock) {
      // `Disallow: /` alone = full block. An empty `Disallow:` is the
      // opposite signal (allow all) and must NOT count here.
      const hasDisallowAll = specificBlock.rules.some(
        (r) => r.type === "disallow" && r.path === "/",
      );
      const hasAllowAll = specificBlock.rules.some((r) => r.type === "allow" && r.path === "/");
      const hasEmptyDisallow = specificBlock.rules.some(
        (r) => r.type === "disallow" && r.path === "",
      );

      if (hasDisallowAll && !hasAllowAll) {
        return {
          blocked: true,
          reason: `Explicitly blocked via "User-agent: ${crawlerAgent}" with "Disallow: /"`,
        };
      }
      if (hasAllowAll || hasEmptyDisallow) {
        return {
          blocked: false,
          reason: `Explicitly allowed via "User-agent: ${crawlerAgent}"`,
        };
      }
      // Specific block exists but only disallows narrower paths — the
      // crawler can still access the root. Treat as allowed.
      return {
        blocked: false,
        reason: `"User-agent: ${crawlerAgent}" exists but does not block the whole site`,
      };
    }

    // No specific block — fall back to wildcard.
    if (wildcardBlock) {
      const hasDisallowAll = wildcardBlock.rules.some(
        (r) => r.type === "disallow" && r.path === "/",
      );
      const hasAllowAll = wildcardBlock.rules.some((r) => r.type === "allow" && r.path === "/");
      if (hasDisallowAll && !hasAllowAll) {
        return {
          blocked: true,
          reason: 'Blocked by wildcard rule "User-agent: *" with "Disallow: /"',
        };
      }
    }

    return { blocked: false, reason: "No blocking rules found — crawler allowed by default" };
  }

  // Check AI crawler permissions for a URL — SSRF-guarded + rate-limited.
  app.post("/api/check-crawler-permissions", aiLimitMiddleware, async (req, res) => {
    requireUser(req);
    const { url } = req.body ?? {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    try {
      // Extract domain from URL
      let domain: string;
      try {
        const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
        domain = urlObj.origin;
      } catch {
        return res.status(400).json({ success: false, error: "Invalid URL format" });
      }

      // Fetch robots.txt via the SSRF-safe helper. Private-IP URLs, file://,
      // metadata endpoints, etc. all throw before any connection is made.
      let robotsTxtContent = "";
      let robotsTxtExists = false;
      let fetchError = "";

      try {
        const robotsUrl = `${domain}/robots.txt`;
        const { status, text } = await safeFetchText(robotsUrl, {
          maxBytes: 1 * 1024 * 1024,
          timeoutMs: 10_000,
          headers: { "User-Agent": "GEO-Platform-Checker/1.0" },
        });
        if (status >= 200 && status < 300) {
          robotsTxtContent = text;
          robotsTxtExists = true;
        } else if (status === 404) {
          robotsTxtExists = false;
        } else {
          fetchError = `HTTP ${status}`;
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : "Failed to fetch robots.txt";
        if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
          return res.status(400).json({ success: false, error: "This URL is not allowed" });
        }
        fetchError = msg;
      }

      // Parse and check each AI crawler
      const blocks = robotsTxtExists ? parseRobotsTxt(robotsTxtContent) : [];

      const crawlerResults = AI_CRAWLERS.map((crawler) => {
        if (!robotsTxtExists && !fetchError) {
          return {
            ...crawler,
            status: "allowed" as const,
            reason: "No robots.txt found - all crawlers allowed by default",
            recommendation: null,
          };
        }

        if (fetchError) {
          return {
            ...crawler,
            status: "unknown" as const,
            reason: `Could not check: ${fetchError}`,
            recommendation: "Ensure your robots.txt is accessible",
          };
        }

        const result = isCrawlerBlocked(blocks, crawler.agent);

        let recommendation = null;
        if (result.blocked) {
          recommendation = `To allow ${crawler.platform} to crawl your site, add these lines to robots.txt:\n\nUser-agent: ${crawler.agent}\nAllow: /`;
        }

        return {
          ...crawler,
          status: result.blocked ? ("blocked" as const) : ("allowed" as const),
          reason: result.reason,
          recommendation,
        };
      });

      // Generate summary
      const blockedCount = crawlerResults.filter((c) => c.status === "blocked").length;
      const allowedCount = crawlerResults.filter((c) => c.status === "allowed").length;
      const unknownCount = crawlerResults.filter((c) => c.status === "unknown").length;

      // Generate overall recommendations
      const recommendations: string[] = [];

      if (blockedCount > 0) {
        recommendations.push(
          `${blockedCount} AI crawler(s) are blocked. This may prevent your content from appearing in AI search results.`,
        );

        const blockedCrawlers = crawlerResults.filter((c) => c.status === "blocked");
        // Search bots are the highest-impact block: they determine whether you
        // appear in ChatGPT Search / Claude Search / Perplexity / Google AI
        // Overviews answers at all.
        const blockedSearch = blockedCrawlers.filter((c) => c.purpose === "search");
        const blockedRealtime = blockedCrawlers.filter((c) => c.purpose === "realtime");
        const blockedTraining = blockedCrawlers.filter((c) => c.purpose === "training");

        if (blockedSearch.length > 0) {
          recommendations.push(
            `CRITICAL: ${blockedSearch.length} search indexing bot(s) blocked: ${blockedSearch.map((c) => c.platform).join(", ")}. These determine whether you appear in AI search answers — unblock these first.`,
          );
        }
        if (blockedRealtime.length > 0) {
          recommendations.push(
            `${blockedRealtime.length} realtime browsing bot(s) blocked: ${blockedRealtime.map((c) => c.platform).join(", ")}. Users asking the assistant to open your URL will see "couldn't access this page."`,
          );
        }
        if (blockedTraining.length > 0) {
          recommendations.push(
            `${blockedTraining.length} training crawler(s) blocked: ${blockedTraining.map((c) => c.platform).join(", ")}. Acceptable if intentional — these only affect future model training, not current answers.`,
          );
        }
      }

      if (!robotsTxtExists && !fetchError) {
        recommendations.push(
          "No robots.txt found. Consider adding one with explicit AI crawler permissions for better control.",
        );
        // Generate the snippet straight from AI_CRAWLERS so adding/removing a
        // bot keeps the recommendation in sync with what we actually check.
        // One directive block per bot (User-agent + Allow pair with a blank
        // line between) — some parsers mishandle stacked User-agent lines
        // before a single Disallow, so keep each bot isolated.
        const byPurpose: Record<"search" | "realtime" | "training", typeof AI_CRAWLERS> = {
          search: [],
          realtime: [],
          training: [],
        };
        for (const c of AI_CRAWLERS) byPurpose[c.purpose].push(c);
        const purposeSections: string[] = [];
        const pushSection = (
          purposeLabel: string,
          heading: string,
          crawlers: typeof AI_CRAWLERS,
        ) => {
          if (crawlers.length === 0) return;
          purposeSections.push(`# ── ${heading} ──`);
          for (const c of crawlers) {
            purposeSections.push(`# ${c.platform}`);
            purposeSections.push(`User-agent: ${c.agent}`);
            purposeSections.push(`Allow: /`);
            purposeSections.push("");
          }
          void purposeLabel;
        };
        pushSection(
          "search",
          "Search indexing bots — these determine whether you appear in AI search answers",
          byPurpose.search,
        );
        pushSection(
          "realtime",
          "Realtime browsing bots — fired when a user asks an assistant to open your URL",
          byPurpose.realtime,
        );
        pushSection(
          "training",
          "Training crawlers — opt out here if you don't want content used in future model training",
          byPurpose.training,
        );
        const snippet = [
          "Recommended robots.txt for maximum GEO visibility:",
          "",
          "User-agent: *",
          "Allow: /",
          "",
          ...purposeSections,
        ].join("\n");
        recommendations.push(snippet);
      }

      res.json({
        success: true,
        data: {
          url: domain,
          robotsTxtExists,
          robotsTxtUrl: `${domain}/robots.txt`,
          fetchError: fetchError || null,
          summary: {
            total: AI_CRAWLERS.length,
            allowed: allowedCount,
            blocked: blockedCount,
            unknown: unknownCount,
            geoScore: Math.round((allowedCount / AI_CRAWLERS.length) * 100),
          },
          crawlers: crawlerResults,
          recommendations,
          rawRobotsTxt: robotsTxtExists ? robotsTxtContent : null,
        },
      });
    } catch (error) {
      console.error("Crawler check error:", error);
      res.status(500).json({ success: false, error: "Failed to check crawler permissions" });
    }
  });

  // ========== GEO ANALYTICS (Share of Voice, AI Visibility Score, Sentiment) ==========

  const AI_PLATFORMS = SHARED_AI_PLATFORMS;

  // Get comprehensive GEO analytics for a brand — :brandId is ownership-
  // checked via app.param before this handler runs.
  app.get("/api/geo-analytics/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      // Get brand's articles (all statuses; the brand-ownership guard
      // already ensured the caller owns this brand).
      const allArticles = await storage.getArticles();
      const brandArticles = allArticles.filter((a) => a.brandId === brand.id);
      const articleIds = new Set(brandArticles.map((a) => a.id));

      // citationChecker writes rankings with articleId=null + brandPromptId=<bp.id>,
      // so filtering by articleId alone drops every brand-prompt citation.
      // Widen the filter: keep rows tied to either this brand's articles OR
      // this brand's prompts.
      const brandPrompts = await storage.getBrandPromptsByBrandId(brand.id);
      const brandPromptIds = new Set(brandPrompts.map((p) => p.id));

      const allRankings = await storage.getGeoRankings();
      const brandRankings = allRankings.filter(
        (r) =>
          (r.articleId && articleIds.has(r.articleId)) ||
          (r.brandPromptId && brandPromptIds.has(r.brandPromptId)),
      );

      // Calculate metrics by platform
      const platformMetrics: Record<
        string,
        {
          mentions: number;
          citations: number;
          avgRank: number;
          sentiment: { positive: number; neutral: number; negative: number };
          visibilityScore: number;
        }
      > = {};

      for (const platform of AI_PLATFORMS) {
        const platformRankings = brandRankings.filter((r) => r.aiPlatform === platform);
        const citations = platformRankings.filter((r) => r.isCited === 1).length;
        // `mentions` here = total checks run on this platform. Kept on the
        // row for downstream consumers that want "checks attempted," but
        // it is NOT fed into the visibility score — that would credit
        // non-cited checks, which is the root cause of the 15/100 score
        // users saw with zero citations.
        const mentions = platformRankings.length;

        // Average rank across CITED rows only (not across all rankings).
        // Rank was previously computed over every row with a rank field —
        // which pulled down the visibility signal even when the brand
        // wasn't cited.
        const citedRows = platformRankings.filter((r) => r.isCited === 1);
        const rankedItems = citedRows.filter((r) => r.rank !== null && r.rank !== undefined);
        const avgRank =
          rankedItems.length > 0
            ? rankedItems.reduce((sum, r) => sum + (r.rank || 0), 0) / rankedItems.length
            : 0;

        // Count sentiment (only from cited rows — sentiment of a not-cited
        // row is noise).
        const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
        for (const ranking of citedRows) {
          const sentiment = (ranking.sentiment as "positive" | "neutral" | "negative") || "neutral";
          sentimentCounts[sentiment]++;
        }

        // Visibility score is 0 when a platform has zero citations — no
        // theater. Once there's at least one citation, the score blends
        // citation count and rank position:
        //   citationScore: up to 70 pts (was 40 + 30 for the bogus mention
        //                  score; now just the citation weight plus what
        //                  the mention weight used to be, so "Strong"
        //                  labels at a similar citation count).
        //   rankScore:     up to 30 pts, better rank = more.
        let visibilityScore = 0;
        if (citations > 0) {
          const citationScore = Math.min(
            citations * CITATION_SCORING.citationMultiplier,
            CITATION_SCORING.citationWeight + CITATION_SCORING.mentionWeight,
          );
          const rankScore =
            avgRank > 0
              ? Math.max(CITATION_SCORING.rankWeight - avgRank * CITATION_SCORING.rankMultiplier, 0)
              : 0;
          visibilityScore = Math.round(citationScore + rankScore);
        }

        platformMetrics[platform] = {
          mentions,
          citations,
          avgRank: Math.round(avgRank * 10) / 10,
          sentiment: sentimentCounts,
          visibilityScore: Math.min(visibilityScore, 100),
        };
      }

      // Get competitor data for Share of Voice calculation
      const competitors = await storage.getCompetitors(brand.id);
      const leaderboard = await storage.getCompetitorLeaderboard(brand.id);

      // Calculate total market citations (brand + all competitors)
      const brandTotalCitations = Object.values(platformMetrics).reduce(
        (sum, p) => sum + p.citations,
        0,
      );
      const totalMarketCitations = leaderboard.reduce(
        (sum, entry) => sum + entry.totalCitations,
        0,
      );

      // Share of Voice = brand citations / total market citations * 100
      const shareOfVoice =
        totalMarketCitations > 0
          ? Math.round((brandTotalCitations / totalMarketCitations) * 1000) / 10
          : 0;

      // Overall AI Visibility Score — average of per-platform scores across
      // platforms that actually have check data. Previously this averaged
      // across every platform in AI_PLATFORMS, which dragged the score
      // down with zeros for platforms the user hasn't run yet (and also
      // inflated it when the mention-score bug was in place). Now: if no
      // checks exist anywhere, score is 0; otherwise it's the honest mean
      // over platforms we have data for.
      const platformsWithData = Object.values(platformMetrics).filter(
        (p) => p.citations + p.mentions > 0,
      );
      const overallVisibilityScore =
        platformsWithData.length > 0 && brandTotalCitations > 0
          ? Math.round(
              platformsWithData.reduce((sum, p) => sum + p.visibilityScore, 0) /
                platformsWithData.length,
            )
          : 0;

      // True mentions = rows in brand_mentions (populated by the citation
      // checker for every detected brand + the organic Reddit/HN scanner).
      // Previous code used platformRankings.length (all checks, cited or
      // not), which mislabelled "total checks" as "mentions". The real
      // distinction: citation = in a ranked recommendation; mention =
      // brand name appeared in the response (or organic source).
      const brandMentions = await storage.getBrandMentions(brand.id).catch(() => [] as any[]);
      const totalBrandMentions = brandMentions.length;

      // Calculate overall sentiment
      const overallSentiment = {
        positive: Object.values(platformMetrics).reduce((sum, p) => sum + p.sentiment.positive, 0),
        neutral: Object.values(platformMetrics).reduce((sum, p) => sum + p.sentiment.neutral, 0),
        negative: Object.values(platformMetrics).reduce((sum, p) => sum + p.sentiment.negative, 0),
      };
      const totalSentimentCount =
        overallSentiment.positive + overallSentiment.neutral + overallSentiment.negative;

      // Sentiment score: -1 (all negative) to +1 (all positive)
      const sentimentScore =
        totalSentimentCount > 0
          ? Math.round(
              ((overallSentiment.positive - overallSentiment.negative) / totalSentimentCount) * 100,
            ) / 100
          : 0;

      res.json({
        success: true,
        data: {
          brand: {
            id: brand.id,
            name: brand.name,
            industry: brand.industry,
          },
          overview: {
            aiVisibilityScore: overallVisibilityScore,
            shareOfVoice,
            totalCitations: brandTotalCitations,
            totalMentions: totalBrandMentions,
            marketSize: totalMarketCitations,
            competitorCount: competitors.length,
          },
          sentiment: {
            score: sentimentScore,
            label:
              sentimentScore > 0.3 ? "Positive" : sentimentScore < -0.3 ? "Negative" : "Neutral",
            breakdown: overallSentiment,
            percentages: {
              positive:
                totalSentimentCount > 0
                  ? Math.round((overallSentiment.positive / totalSentimentCount) * 100)
                  : 0,
              neutral:
                totalSentimentCount > 0
                  ? Math.round((overallSentiment.neutral / totalSentimentCount) * 100)
                  : 0,
              negative:
                totalSentimentCount > 0
                  ? Math.round((overallSentiment.negative / totalSentimentCount) * 100)
                  : 0,
            },
          },
          platformBreakdown: platformMetrics,
          leaderboard: leaderboard.slice(0, 10),
        },
      });
    } catch (error) {
      console.error("GEO analytics error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch GEO analytics" });
    }
  });

  // Get client report metrics for a brand (used by client-facing reports)
  app.get("/api/client-reports/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { period = "30" } = req.query;
      const daysAgo = parseInt(period as string) || 30;

      const brand = await storage.getBrandById(brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      // Load everything brand-scoped once; we aggregate twice (current window
      // + prior window) from the same in-memory set.
      const allArticles = await storage.getArticles();
      const brandArticles = allArticles.filter((a) => a.brandId === brand.id);
      const articleIds = new Set(brandArticles.map((a) => a.id));

      // citationChecker writes rankings with articleId=null + brandPromptId=<bp.id>,
      // so filtering by articleId alone drops every brand-prompt citation.
      const brandPrompts = await storage.getBrandPromptsByBrandId(brandId);
      const brandPromptIds = new Set(brandPrompts.map((p) => p.id));

      const allRankings = await storage.getGeoRankings();
      const brandRankings = allRankings.filter(
        (r) =>
          (r.articleId && articleIds.has(r.articleId)) ||
          (r.brandPromptId && brandPromptIds.has(r.brandPromptId)),
      );

      const leaderboard = await storage.getCompetitorLeaderboard(brandId);
      const totalMarketCitations = leaderboard.reduce(
        (sum, entry) => sum + entry.totalCitations,
        0,
      );

      const now = Date.now();
      const currentStart = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now - 2 * daysAgo * 24 * 60 * 60 * 1000);
      const prevEnd = currentStart;

      // Wave 4 rework — use consistent definitions:
      //   totalChecks      = (prompt × platform) attempts in window
      //   totalCitations   = AI citations (cited=1 rows) in window
      //   totalMentions    = brand_mentions rows in window (AI + social)
      //   citationRate     = cited / attempted  ← NOT cited / mentions
      //   promptCoverage   = cited-prompts / tracked-prompts × 100
      type Agg = {
        totalMentions: number;
        totalCitations: number;
        citationRate: number;
        shareOfVoice: number;
        promptCoverage: number;
        platformBreakdown: {
          platform: string;
          citations: number;
          mentions: number;
          trend: number;
        }[];
      };

      const trackedPromptCount = brandPrompts.length || 1;
      const brandMentionsAll = await storage.getBrandMentions(brandId).catch(() => []);

      const aggregate = (start: Date, end: Date): Agg => {
        const windowRankings = brandRankings.filter((r) => {
          const t = r.checkedAt ? new Date(r.checkedAt).getTime() : 0;
          return t >= start.getTime() && t < end.getTime();
        });
        const windowMentions = brandMentionsAll.filter((m: any) => {
          const t = m.mentionedAt
            ? new Date(m.mentionedAt).getTime()
            : m.discoveredAt
              ? new Date(m.discoveredAt).getTime()
              : 0;
          return t >= start.getTime() && t < end.getTime();
        });

        const platformBreakdown: Agg["platformBreakdown"] = [];
        for (const platform of AI_PLATFORMS) {
          const platformRankings = windowRankings.filter((r) => r.aiPlatform === platform);
          const citations = platformRankings.filter((r) => r.isCited === 1).length;
          // Per-platform mentions = cited rankings for that platform
          // (symmetric with the unified brand_mentions model).
          const mentions = citations;
          if (citations > 0) {
            platformBreakdown.push({ platform, citations, mentions, trend: 0 });
          }
        }
        const totalChecks = windowRankings.length;
        const totalCitations = windowRankings.filter((r) => r.isCited === 1).length;
        const totalMentions = windowMentions.length;
        const citationRate = totalChecks > 0 ? Math.round((totalCitations / totalChecks) * 100) : 0;
        const shareOfVoice =
          totalMarketCitations > 0
            ? Math.round((totalCitations / totalMarketCitations) * 1000) / 10
            : 0;
        const citedPromptIds = new Set(
          windowRankings
            .filter((r) => r.isCited === 1 && r.brandPromptId)
            .map((r) => r.brandPromptId!),
        );
        const promptCoverage = Math.round((citedPromptIds.size / trackedPromptCount) * 100);
        return {
          totalMentions,
          totalCitations,
          citationRate,
          shareOfVoice,
          promptCoverage,
          platformBreakdown,
        };
      };

      const current = aggregate(currentStart, new Date(now + 1)); // +1ms to include right-edge
      const previous = aggregate(prevStart, prevEnd);

      // Top performing content from the current window (article-tied rankings).
      const articleCitations: { title: string; citations: number; platform: string }[] = [];
      for (const article of brandArticles) {
        const articleRankings = brandRankings.filter(
          (r) =>
            r.articleId === article.id &&
            r.isCited === 1 &&
            r.checkedAt &&
            new Date(r.checkedAt).getTime() >= currentStart.getTime(),
        );
        if (articleRankings.length > 0) {
          const topPlatform = articleRankings.reduce(
            (acc, r) => {
              acc[r.aiPlatform] = (acc[r.aiPlatform] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
          const bestPlatform =
            Object.entries(topPlatform).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
          articleCitations.push({
            title: article.title,
            citations: articleRankings.length,
            platform: bestPlatform,
          });
        }
      }
      const topPerformingContent = articleCitations
        .sort((a, b) => b.citations - a.citations)
        .slice(0, 5);

      const recommendations: string[] = [];
      if (current.totalCitations === 0) {
        recommendations.push(
          "Start tracking your content across AI platforms to measure citations",
        );
      }
      if (current.promptCoverage === 0 && brandPrompts.length > 0) {
        recommendations.push(
          "Your prompts aren't generating citations yet — optimize content for AI discoverability",
        );
      }
      if (current.shareOfVoice < 10 && totalMarketCitations > 0) {
        recommendations.push(
          "Increase content volume to improve share of voice against competitors",
        );
      }
      if (current.platformBreakdown.length < 3) {
        recommendations.push("Expand tracking to more AI platforms for comprehensive coverage");
      }
      if (recommendations.length === 0) {
        recommendations.push("Continue monitoring and optimizing content for AI platforms");
      }

      res.json({
        success: true,
        data: {
          brandMentionFrequency: current.totalMentions,
          previousBMF: previous.totalMentions,
          shareOfVoice: current.shareOfVoice,
          previousSOV: previous.shareOfVoice,
          citationRate: current.citationRate,
          previousCitationRate: previous.citationRate,
          promptCoverage: current.promptCoverage,
          previousPromptCoverage: previous.promptCoverage,
          platformBreakdown: current.platformBreakdown,
          topPerformingContent,
          recommendations,
        },
      });
    } catch (error) {
      console.error("Client reports error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch client report metrics" });
    }
  });

  // Analyze sentiment using OpenAI
  app.post("/api/analyze-sentiment", aiLimitMiddleware, async (req, res) => {
    try {
      requireUser(req);
      const { text, context } = req.body ?? {};

      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "Text is required" });
      }
      if (text.length > MAX_CONTENT_LENGTH) {
        return res
          .status(413)
          .json({ success: false, error: `Text exceeds ${MAX_CONTENT_LENGTH} characters` });
      }
      const contextStr = typeof context === "string" ? context.slice(0, 500) : "";

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          success: false,
          error: "Sentiment analysis is not available. OpenAI API key is not configured.",
          message: "Please contact support to enable sentiment analysis.",
        });
      }

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [
          {
            role: "system",
            content: `You are a sentiment analysis expert. Analyze the sentiment of text mentions about a brand or company.
Return a JSON object with:
- sentiment: "positive", "neutral", or "negative"
- score: a number from -1 (very negative) to +1 (very positive)
- confidence: a number from 0 to 1 indicating confidence
- reasoning: brief explanation of the sentiment

Consider:
- Tone and word choice
- Context of the mention
- Implied recommendations or criticisms
- Comparative statements with competitors`,
          },
          {
            role: "user",
            content: `Analyze the sentiment of this brand mention${contextStr ? ` (context: ${contextStr})` : ""}:\n\n"""\n${text}\n"""`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 200,
      });

      const result = safeParseJson<any>(response.choices[0].message.content) ?? {
        sentiment: "neutral",
        score: 0,
        confidence: 0,
        reasoning: "Could not parse sentiment response",
      };

      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error, "Failed to analyze sentiment");
    }
  });

  // Record visibility snapshot for tracking over time
  app.post("/api/geo-analytics/:brandId/snapshot", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const {
        aiPlatform,
        mentionCount,
        citationCount,
        shareOfVoice,
        visibilityScore,
        sentimentPositive,
        sentimentNeutral,
        sentimentNegative,
        avgSentimentScore,
      } = req.body;

      const snapshot = await storage.createBrandVisibilitySnapshot({
        brandId: brand.id,
        aiPlatform: aiPlatform || "All",
        mentionCount: mentionCount || 0,
        citationCount: citationCount || 0,
        shareOfVoice: shareOfVoice?.toString() || "0",
        visibilityScore: visibilityScore || 0,
        sentimentPositive: sentimentPositive || 0,
        sentimentNeutral: sentimentNeutral || 0,
        sentimentNegative: sentimentNegative || 0,
        avgSentimentScore: avgSentimentScore?.toString() || "0",
        metadata: null,
      });

      res.json({ success: true, data: snapshot });
    } catch (error) {
      console.error("Snapshot error:", error);
      res.status(500).json({ success: false, error: "Failed to create snapshot" });
    }
  });

  // Get visibility history for a brand
  app.get("/api/geo-analytics/:brandId/history", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 30;
      const snapshots = await storage.getBrandVisibilitySnapshots(brand.id, limit);

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          snapshots,
        },
      });
    } catch (error) {
      console.error("History error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch history" });
    }
  });

  // ========== GEO OPPORTUNITY FINDER ==========

  // Platform recommendations database
  const GEO_PLATFORMS = {
    reddit: {
      name: "Reddit",
      citationShare: 21,
      description: "User discussions heavily cited by AI systems",
      strategy: "Build karma through genuine engagement before adding brand mentions",
      tips: [
        "Join 3-5 niche subreddits and comment genuinely for weeks first",
        "Answer questions with real experience - include pros AND cons",
        "Use natural language, not marketing jargon",
        "More upvotes = stronger AI signal",
      ],
    },
    quora: {
      name: "Quora",
      citationShare: 14.3,
      description: "Q&A platform with strong AI training data partnerships",
      strategy: "Answer long-tail questions that mirror how users talk to AI chatbots",
      tips: [
        "Target questions with high follower counts",
        "Keep core answers 40-60 words (optimal for AI summaries)",
        "Add detailed context/examples below",
        "Answer consistently over months to build topical authority",
      ],
    },
    youtube: {
      name: "YouTube",
      citationShare: 18.8,
      description: "Video content transcripts are heavily indexed by AI",
      strategy: "Create educational content that answers specific questions",
      tips: [
        "Use keyword-rich titles in question format",
        "Add detailed descriptions with timestamps",
        "Include transcripts/captions for AI indexing",
        "Create how-to and explainer videos",
      ],
    },
    linkedin: {
      name: "LinkedIn",
      citationShare: 8,
      description: "Professional network with growing AI visibility",
      strategy: "Share thought leadership and industry insights",
      tips: [
        "Post original insights, not just links",
        "Engage in comments on trending industry posts",
        "Write articles on LinkedIn Publishing",
        "Use relevant hashtags for discoverability",
      ],
    },
    medium: {
      name: "Medium",
      citationShare: 6,
      description: "Long-form content platform indexed by AI",
      strategy: "Publish in-depth articles on industry topics",
      tips: [
        "Join relevant publications for wider reach",
        "Use SEO-friendly titles and subtitles",
        "Include data, case studies, and examples",
        "Link back to your main site strategically",
      ],
    },
    hackernews: {
      name: "Hacker News",
      citationShare: 5,
      description: "Tech community with high authority for AI systems",
      strategy: "Share valuable tech content and engage in discussions",
      tips: [
        "Focus on genuine value, not self-promotion",
        "Participate in Show HN for product launches",
        "Comment thoughtfully on relevant threads",
        "Best for B2B tech companies",
      ],
    },
    producthunt: {
      name: "Product Hunt",
      citationShare: 3,
      description: "Product discovery platform cited for tech products",
      strategy: "Launch products and updates for visibility",
      tips: [
        "Prepare a strong launch with visuals",
        "Engage actively on launch day",
        "Collect reviews and testimonials",
        "Great for SaaS and tech products",
      ],
    },
    wikipedia: {
      name: "Wikipedia",
      citationShare: 12,
      description: "Highest authority source for AI knowledge bases",
      strategy: "Ensure accurate brand information if notable",
      tips: [
        "Only for truly notable companies",
        "Use citations from reliable sources",
        "Do not directly edit your own page",
        "Focus on getting press coverage first",
      ],
    },
  };

  // Industry-specific subreddit recommendations
  const INDUSTRY_SUBREDDITS: Record<
    string,
    { subreddit: string; description: string; members: string }[]
  > = {
    "Public Relations": [
      {
        subreddit: "r/PublicRelations",
        description: "PR professionals discussing strategies",
        members: "45K",
      },
      { subreddit: "r/marketing", description: "Marketing strategies and tips", members: "1.2M" },
      {
        subreddit: "r/startups",
        description: "Startup founders seeking PR advice",
        members: "1.1M",
      },
      {
        subreddit: "r/Entrepreneur",
        description: "Business owners discussing growth",
        members: "3.2M",
      },
      {
        subreddit: "r/smallbusiness",
        description: "Small business owners needing PR help",
        members: "1.5M",
      },
    ],
    Technology: [
      { subreddit: "r/technology", description: "General tech discussions", members: "15M" },
      { subreddit: "r/programming", description: "Software development community", members: "6M" },
      { subreddit: "r/startups", description: "Tech startup ecosystem", members: "1.1M" },
      { subreddit: "r/SaaS", description: "Software as a Service discussions", members: "85K" },
      { subreddit: "r/webdev", description: "Web development community", members: "2.5M" },
    ],
    Finance: [
      { subreddit: "r/finance", description: "Finance professionals", members: "1.8M" },
      { subreddit: "r/investing", description: "Investment strategies", members: "2.3M" },
      { subreddit: "r/personalfinance", description: "Personal finance advice", members: "18M" },
      { subreddit: "r/fintech", description: "Financial technology", members: "45K" },
      { subreddit: "r/CryptoCurrency", description: "Cryptocurrency discussions", members: "7M" },
    ],
    Healthcare: [
      {
        subreddit: "r/healthcare",
        description: "Healthcare industry discussions",
        members: "150K",
      },
      { subreddit: "r/medicine", description: "Medical professionals", members: "850K" },
      { subreddit: "r/HealthIT", description: "Healthcare technology", members: "25K" },
      { subreddit: "r/digitalhealth", description: "Digital health innovation", members: "15K" },
    ],
    "E-commerce": [
      { subreddit: "r/ecommerce", description: "E-commerce strategies", members: "200K" },
      { subreddit: "r/shopify", description: "Shopify store owners", members: "150K" },
      { subreddit: "r/FulfillmentByAmazon", description: "Amazon sellers", members: "180K" },
      { subreddit: "r/dropshipping", description: "Dropshipping businesses", members: "350K" },
    ],
    default: [
      {
        subreddit: "r/Entrepreneur",
        description: "Business and entrepreneurship",
        members: "3.2M",
      },
      { subreddit: "r/smallbusiness", description: "Small business discussions", members: "1.5M" },
      { subreddit: "r/marketing", description: "Marketing strategies", members: "1.2M" },
      { subreddit: "r/startups", description: "Startup ecosystem", members: "1.1M" },
    ],
  };

  // Quora topic recommendations by industry
  const INDUSTRY_QUORA_TOPICS: Record<string, string[]> = {
    "Public Relations": [
      "Public Relations",
      "PR Strategies",
      "Media Relations",
      "Crisis Communications",
      "Brand Management",
      "Corporate Communications",
      "Startup PR",
    ],
    Technology: [
      "Technology Trends",
      "Software Development",
      "Artificial Intelligence",
      "Cloud Computing",
      "Cybersecurity",
      "Tech Startups",
    ],
    Finance: [
      "Finance",
      "Investment Strategies",
      "Personal Finance",
      "Fintech",
      "Venture Capital",
      "Banking",
    ],
    Healthcare: [
      "Healthcare Industry",
      "Medical Technology",
      "Digital Health",
      "Health Startups",
      "Telemedicine",
    ],
    "E-commerce": [
      "E-commerce",
      "Online Retail",
      "Dropshipping",
      "Amazon FBA",
      "Shopify",
      "Digital Marketing",
    ],
    default: ["Business Strategy", "Marketing", "Entrepreneurship", "Startups", "Small Business"],
  };

  // Get GEO opportunities for a brand
  app.get("/api/geo-opportunities/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const industry = brand.industry || "default";
      const subreddits = INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS["default"];
      const quoraTopics = INDUSTRY_QUORA_TOPICS[industry] || INDUSTRY_QUORA_TOPICS["default"];

      // Compute real citation-share breakdown from the brand's geo_rankings.
      // Every cited ranking carries `citingOutletUrl` / `citingOutletName`;
      // aggregate by domain, then bucket into Reddit / Quora / own-site /
      // everything-else ("third-party") to replace the hardcoded defaults.
      const brandDomain = (brand.website || "")
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
      const brandPrompts = await storage.getBrandPromptsByBrandId(brand.id);
      const rankings = brandPrompts.length
        ? await storage.getGeoRankingsByBrandPromptIds(brandPrompts.map((p) => p.id))
        : [];
      const articles = (await storage.getArticles()).filter((a) => a.brandId === brand.id);
      const articleRankings = articles.length
        ? (await storage.getGeoRankings()).filter(
            (r) => r.articleId && articles.some((a) => a.id === r.articleId),
          )
        : [];
      const cited = [...rankings, ...articleRankings].filter((r) => r.isCited === 1);
      const totalCited = cited.length;
      const extractDomain = (url: string | null | undefined) => {
        if (!url) return "";
        try {
          return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
        } catch {
          return (url || "")
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .split("/")[0];
        }
      };
      let reddit = 0,
        quora = 0,
        ownSite = 0,
        thirdParty = 0;
      for (const r of cited) {
        const domain = extractDomain(r.citingOutletUrl);
        if (!domain) continue;
        if (domain.includes("reddit.com")) reddit++;
        else if (domain.includes("quora.com")) quora++;
        else if (brandDomain && domain.includes(brandDomain)) ownSite++;
        else thirdParty++;
      }
      const pct = (n: number) => (totalCited > 0 ? Math.round((n / totalCited) * 1000) / 10 : 0);
      const keyStats =
        totalCited > 0
          ? {
              thirdPartyCitationShare: pct(reddit + quora + thirdParty),
              redditCitationShare: pct(reddit),
              quoraCitationShare: pct(quora),
              brandWebsiteCitationShare: pct(ownSite),
            }
          : {
              // No citation data yet — surface zeros so the user sees "run a
              // citation check first" rather than misleading industry averages.
              thirdPartyCitationShare: 0,
              redditCitationShare: 0,
              quoraCitationShare: 0,
              brandWebsiteCitationShare: 0,
            };

      // Generate content ideas based on brand
      const contentIdeas = [];

      if (brand.products && brand.products.length > 0) {
        contentIdeas.push({
          type: "How-to Guide",
          title: `How ${brand.products[0]} Can Help [Target Audience Problem]`,
          platform: "Reddit/Quora",
          description: "Answer questions about solving problems your product addresses",
        });
      }

      if (brand.uniqueSellingPoints && brand.uniqueSellingPoints.length > 0) {
        contentIdeas.push({
          type: "Thought Leadership",
          title: `Why ${brand.uniqueSellingPoints[0]} Matters in ${industry}`,
          platform: "LinkedIn/Medium",
          description: "Share insights that establish your expertise",
        });
      }

      contentIdeas.push({
        type: "Industry Insight",
        title: `${new Date().getFullYear()} Trends in ${industry}`,
        platform: "All Platforms",
        description: "Share predictions and analysis AI systems love to cite",
      });

      contentIdeas.push({
        type: "Case Study",
        title: `How We Helped a Client Achieve [Result]`,
        platform: "Medium/LinkedIn",
        description: "Real examples with data get cited by AI",
      });

      contentIdeas.push({
        type: "FAQ Response",
        title: `Common Questions About ${industry} Answered`,
        platform: "Quora/Reddit",
        description: "Answer the questions your target audience asks",
      });

      res.json({
        success: true,
        data: {
          brand: {
            id: brand.id,
            name: brand.name,
            industry: brand.industry,
          },
          subreddits,
          quoraTopics,
          contentIdeas,
          keyStats,
          totalCitedRankings: totalCited,
          // Real per-brand platform breakdown: override each GEO_PLATFORMS
          // entry's industry-benchmark citationShare with this brand's actual
          // share from cited geo_rankings. Platforms the brand hasn't been
          // cited on fall to 0, so the list reflects reality not averages.
          platforms: (() => {
            const perPlatform: Record<string, number> = {};
            for (const r of cited) {
              const d = extractDomain(r.citingOutletUrl);
              if (!d) continue;
              let key: string | null = null;
              if (d.includes("reddit.com")) key = "reddit";
              else if (d.includes("quora.com")) key = "quora";
              else if (d.includes("youtube.com")) key = "youtube";
              else if (d.includes("linkedin.com")) key = "linkedin";
              else if (d.includes("medium.com")) key = "medium";
              else if (d.includes("news.ycombinator.com")) key = "hackernews";
              else if (d.includes("producthunt.com")) key = "producthunt";
              else if (d.includes("wikipedia.org")) key = "wikipedia";
              if (key) perPlatform[key] = (perPlatform[key] || 0) + 1;
            }
            return Object.entries(GEO_PLATFORMS)
              .map(([key, p]) => ({
                ...p,
                citationShare:
                  totalCited > 0
                    ? Math.round(((perPlatform[key] || 0) / totalCited) * 1000) / 10
                    : 0,
                citationCount: perPlatform[key] || 0,
              }))
              .sort((a, b) => b.citationShare - a.citationShare);
          })(),
          strategyTips: [
            "AI systems cite 91% from third-party sources - focus on Reddit, Quora, YouTube",
            "Build karma/reputation before adding brand mentions",
            "Use balanced perspectives (pros + cons) - AI trusts authentic evaluations",
            "Question-response format is optimal for AI indexing",
            "Average cited post is 1 year old - evergreen content wins",
            "AI visitors are worth 4.4x traditional organic visitors",
          ],
        },
      });
    } catch (error) {
      console.error("GEO opportunities error:", error);
      res.status(500).json({ success: false, error: "Failed to generate opportunities" });
    }
  });

  // Get generic GEO opportunities (no brand)
  app.get("/api/geo-opportunities", async (req, res) => {
    try {
      const { industry = "default" } = req.query;
      const subreddits = INDUSTRY_SUBREDDITS[industry as string] || INDUSTRY_SUBREDDITS["default"];
      const quoraTopics =
        INDUSTRY_QUORA_TOPICS[industry as string] || INDUSTRY_QUORA_TOPICS["default"];

      res.json({
        success: true,
        data: {
          platforms: Object.values(GEO_PLATFORMS).sort((a, b) => b.citationShare - a.citationShare),
          subreddits,
          quoraTopics,
          industries: Object.keys(INDUSTRY_SUBREDDITS).filter((k) => k !== "default"),
          keyStats: {
            thirdPartyCitationShare: 91,
            redditCitationShare: 21,
            quoraCitationShare: 14.3,
            brandWebsiteCitationShare: 9,
          },
          strategyTips: [
            "AI systems cite 91% from third-party sources - focus on Reddit, Quora, YouTube",
            "Build karma/reputation before adding brand mentions",
            "Use balanced perspectives (pros + cons) - AI trusts authentic evaluations",
            "Question-response format is optimal for AI indexing",
            "Average cited post is 1 year old - evergreen content wins",
            "AI visitors are worth 4.4x traditional organic visitors",
          ],
        },
      });
    } catch (error) {
      console.error("GEO opportunities error:", error);
      res.status(500).json({ success: false, error: "Failed to generate opportunities" });
    }
  });
}
