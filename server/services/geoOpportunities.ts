// GEO opportunity finder for server/routes/analytics.ts.
//
// Extracted verbatim from server/routes/analytics.ts (B7-14 service-layer
// split). No Express types, no req/res - functions take explicit
// parameters (including the already-ownership-checked brand) and either
// return plain data or throw.

import type { Brand } from "@shared/schema";
import { storage } from "../storage";

// Platform recommendations database
export const GEO_PLATFORMS = {
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
export const INDUSTRY_SUBREDDITS: Record<
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

export async function computeGeoOpportunitiesForBrand(brand: Brand) {
  const industry = brand.industry || "default";
  const subreddits = INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS["default"];

  // Compute real citation-share breakdown from the brand's geo_rankings.
  // Every cited ranking carries `citingOutletUrl` / `citingOutletName`;
  // aggregate by domain, then bucket into Reddit / own-site /
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
  // No `since` bound here, deliberately, and confirmed as a product
  // decision on 2026-08-29: /api/geo-opportunities/:brandId reports
  // against the brand's entire history, while
  // /api/geo-analytics/:brandId scopes to a run window.
  // Adding a window would make the two pages agree but would drop older
  // cited rows from the key stats and per-platform shares, leaving this
  // page sparse for any brand without a recent run. Do not "fix" the
  // inconsistency by adding one; it is intended.
  // Use the indexed (articleId) read instead of scanning every
  // geo_ranking row in the table and post-filtering in memory - see
  // the equivalent fix on /api/geo-analytics/:brandId above. No
  // `since` bound is applied here (unlike that route): this endpoint
  // reports against the brand's entire history, not a run window.
  const articleIds = articles.map((a) => a.id);
  const articleRankings = articleIds.length
    ? await storage.getGeoRankingsByArticleIds(articleIds)
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
    ownSite = 0,
    thirdParty = 0;
  for (const r of cited) {
    const domain = extractDomain(r.citingOutletUrl);
    if (!domain) continue;
    if (domain.includes("reddit.com")) reddit++;
    else if (brandDomain && domain.includes(brandDomain)) ownSite++;
    else thirdParty++;
  }
  const pct = (n: number) => (totalCited > 0 ? Math.round((n / totalCited) * 1000) / 10 : 0);
  const keyStats =
    totalCited > 0
      ? {
          thirdPartyCitationShare: pct(reddit + thirdParty),
          redditCitationShare: pct(reddit),
          brandWebsiteCitationShare: pct(ownSite),
        }
      : {
          // No citation data yet - surface zeros so the user sees "run a
          // citation check first" rather than misleading industry averages.
          thirdPartyCitationShare: 0,
          redditCitationShare: 0,
          brandWebsiteCitationShare: 0,
        };

  // Generate content ideas based on brand
  const contentIdeas = [];

  if (brand.products && brand.products.length > 0) {
    contentIdeas.push({
      type: "How-to Guide",
      title: `How ${brand.products[0]} Can Help [Target Audience Problem]`,
      platform: "Reddit",
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
    platform: "Reddit",
    description: "Answer the questions your target audience asks",
  });

  return {
    brand: {
      id: brand.id,
      name: brand.name,
      industry: brand.industry,
    },
    subreddits,
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
            totalCited > 0 ? Math.round(((perPlatform[key] || 0) / totalCited) * 1000) / 10 : 0,
          citationCount: perPlatform[key] || 0,
        }))
        .sort((a, b) => b.citationShare - a.citationShare);
    })(),
    strategyTips: [
      "AI systems cite 91% from third-party sources - focus on Reddit and YouTube",
      "Build karma/reputation before adding brand mentions",
      "Use balanced perspectives (pros + cons) - AI trusts authentic evaluations",
      "Question-response format is optimal for AI indexing",
      "Average cited post is 1 year old - evergreen content wins",
      "AI visitors are worth 4.4x traditional organic visitors",
    ],
  };
}

export function computeGenericGeoOpportunities(industry: string) {
  const subreddits = INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS["default"];

  return {
    platforms: Object.values(GEO_PLATFORMS).sort((a, b) => b.citationShare - a.citationShare),
    subreddits,
    industries: Object.keys(INDUSTRY_SUBREDDITS).filter((k) => k !== "default"),
    keyStats: {
      thirdPartyCitationShare: 91,
      redditCitationShare: 21,
      brandWebsiteCitationShare: 9,
    },
    strategyTips: [
      "AI systems cite 91% from third-party sources - focus on Reddit and YouTube",
      "Build karma/reputation before adding brand mentions",
      "Use balanced perspectives (pros + cons) - AI trusts authentic evaluations",
      "Question-response format is optimal for AI indexing",
      "Average cited post is 1 year old - evergreen content wins",
      "AI visitors are worth 4.4x traditional organic visitors",
    ],
  };
}
