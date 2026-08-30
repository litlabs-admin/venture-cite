// GEO analytics (Share of Voice, AI Visibility Score, sentiment) for
// server/routes/analytics.ts.
//
// Extracted verbatim from server/routes/analytics.ts (B7-14 service-layer
// split). No Express types, no req/res - functions take explicit
// parameters (including the already-ownership-checked brand) and either
// return plain data or throw.

import type { Brand } from "@shared/schema";
import { storage } from "../storage";
import { AI_PLATFORMS } from "@shared/constants";
import { computeVisibilityScore } from "@shared/visibilityMetrics";
import { MODELS } from "../lib/modelConfig";
import { openai, safeParseJson } from "../lib/routesShared";

// ========== GEO ANALYTICS (Share of Voice, AI Visibility Score, Sentiment) ==========

export async function computeGeoAnalytics(brand: Brand, sinceFilter: Date | undefined) {
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

  // Prefer the indexed (brandPromptId, since) read over
  // the all-rankings scan + post-filter. The article-tied rankings
  // are loaded separately and merged below - they aren't tied to
  // citation runs and don't suffer from the mixed-window problem.
  const promptRankings =
    brandPrompts.length > 0
      ? await storage.getGeoRankingsByBrandPromptIds(Array.from(brandPromptIds), sinceFilter)
      : [];
  // Use the indexed read with the same `since` filter as the
  // brand-prompt path. Previously this fetched every geo_ranking
  // row globally and post-filtered in memory - both inefficient
  // and prone to mixing all-time article rankings into a fresh
  // run's window if `checkedAt` precision drifted.
  const articleRankings = articleIds.size
    ? await storage.getGeoRankingsByArticleIds(Array.from(articleIds), sinceFilter)
    : [];
  const brandRankings = [...promptRankings, ...articleRankings];

  // Calculate metrics by platform
  const platformMetrics: Record<
    string,
    {
      mentions: number;
      citations: number;
      avgRank: number | null;
      sentiment: { positive: number; neutral: number; negative: number };
      visibilityScore: number;
    }
  > = {};

  for (const platform of AI_PLATFORMS) {
    const platformRankings = brandRankings.filter((r) => r.aiPlatform === platform);
    const citations = platformRankings.filter((r) => r.isCited === 1).length;
    // `mentions` here = total checks run on this platform. Kept on the
    // row for downstream consumers that want "checks attempted," but
    // it is NOT fed into the visibility score - that would credit
    // non-cited checks, which is the root cause of the 15/100 score
    // users saw with zero citations.
    const mentions = platformRankings.length;

    // Average rank across CITED rows only (not across all rankings).
    // Rank was previously computed over every row with a rank field -
    // which pulled down the visibility signal even when the brand
    // wasn't cited.
    const citedRows = platformRankings.filter((r) => r.isCited === 1);
    const rankedItems = citedRows.filter((r) => r.rank !== null && r.rank !== undefined);
    // Use a separate `avgRankRaw` for scoring (treat missing rank as
    // 0 = no penalty) and emit `avgRank: number | null` for the UI
    // so it can show "-" for "no rank data" vs a real 0.
    const avgRankRaw =
      rankedItems.length > 0
        ? rankedItems.reduce((sum, r) => sum + (r.rank || 0), 0) / rankedItems.length
        : 0;
    const avgRank: number | null = rankedItems.length > 0 ? Math.round(avgRankRaw * 10) / 10 : null;

    // Count sentiment (only from cited rows - sentiment of a not-cited
    // row is noise).
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    for (const ranking of citedRows) {
      const sentiment = (ranking.sentiment as "positive" | "neutral" | "negative") || "neutral";
      sentimentCounts[sentiment]++;
    }

    // Canonical visibility score (server/lib/visibilityMetrics.ts) -
    // the SAME definition as the dashboard hero and /entity-strength.
    // This used to be a different citation-count × multiplier model,
    // so the dashboard and GEO Analytics disagreed for the same
    // brand despite the hero comment claiming they matched.
    const citedAuthority = citedRows
      .map((r) => r.authorityScore)
      .filter((s): s is number => typeof s === "number");
    // null (not 0) when NO cited row on this platform carries an
    // authority score → authority is UNMEASURED, so the scorer drops
    // its 30-pt weight rather than capping the platform score at 70.
    const avgAuthority =
      citedAuthority.length > 0
        ? citedAuthority.reduce((a, b) => a + b, 0) / citedAuthority.length
        : null;
    const visibilityScore = computeVisibilityScore(citations, mentions, avgRankRaw, avgAuthority);

    platformMetrics[platform] = {
      mentions,
      citations,
      avgRank,
      sentiment: sentimentCounts,
      visibilityScore,
    };
  }

  // Get competitor data for Share of Voice calculation. Pass the
  // same `sinceFilter` so the leaderboard's totals come from the
  // same window as the brand metrics - otherwise SoV mixes a
  // run-window numerator with an all-time denominator and reads
  // dramatically too low during a fresh run. When no run is
  // active the leaderboard helper falls back to its 30-day default.
  const competitors = await storage.getCompetitors(brand.id);
  const leaderboard = await storage.getCompetitorLeaderboard(brand.id, {
    since: sinceFilter,
  });

  // Calculate total market citations (brand + all competitors)
  const brandTotalCitations = Object.values(platformMetrics).reduce(
    (sum, p) => sum + p.citations,
    0,
  );
  const totalMarketCitations = leaderboard.reduce((sum, entry) => sum + entry.totalCitations, 0);

  // Share of Voice = brand citations / total market citations * 100.
  // The numerator MUST match the own-brand total the leaderboard used
  // to build the denominator. brandTotalCitations only sums platforms
  // in AI_PLATFORMS, but the leaderboard's own-brand bucket counts
  // every platform label - so a citation on a platform outside
  // AI_PLATFORMS deflated SoV (numerator missed it, denominator kept
  // it). Read the own row straight from the leaderboard for a
  // consistent numerator/denominator; fall back defensively if for
  // some reason there's no own row.
  const ownLeaderboardRow = leaderboard.find((entry) => entry.isOwn);
  const brandSovCitations = ownLeaderboardRow?.totalCitations ?? brandTotalCitations;
  const shareOfVoice =
    totalMarketCitations > 0
      ? Math.round((brandSovCitations / totalMarketCitations) * 1000) / 10
      : 0;

  // Overall AI Visibility Score - average of per-platform scores across
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

  return {
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
      label: sentimentScore > 0.3 ? "Positive" : sentimentScore < -0.3 ? "Negative" : "Neutral",
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
  };
}

export async function recordVisibilitySnapshot(brandId: string, body: any) {
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
  } = body;

  return storage.createBrandVisibilitySnapshot({
    brandId,
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
}

export async function getVisibilityHistory(brandId: string, limit: number) {
  return storage.getBrandVisibilitySnapshots(brandId, limit);
}

// ========== SENTIMENT CLASSIFIER ==========

// Thrown when OPENAI_API_KEY isn't configured - the route maps this to a
// 503 with a support-contact message instead of a generic 500.
export class SentimentUnavailableError extends Error {}

export async function analyzeSentimentText(
  text: string,
  contextStr: string,
): Promise<{ sentiment: string; score: number; confidence: number; reasoning: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new SentimentUnavailableError(
      "Sentiment analysis is not available. OpenAI API key is not configured.",
    );
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

  return result;
}
