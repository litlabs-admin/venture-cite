// AI crawler permission checker for server/routes/analytics.ts.
//
// Extracted verbatim from server/routes/analytics.ts (B7-14 service-layer
// split). No Express types, no req/res - returns plain data or throws.

import {
  AI_CRAWLERS,
  parseRobotsTxt,
  evaluateCrawlers,
  fetchRobots,
  type CrawlerResult,
} from "../lib/crawlerAccess";

// Thrown when the caller's `url` doesn't parse as a URL at all (distinct
// from DisallowedUrlError, which crawlerAccess.fetchRobots throws for
// SSRF-disallowed targets - both map to a 400 at the route, with
// different messages).
export class InvalidUrlFormatError extends Error {}

export type CrawlerPermissionsResult = {
  url: string;
  robotsTxtExists: boolean;
  robotsTxtUrl: string;
  fetchError: string | null;
  summary: {
    total: number;
    allowed: number;
    blocked: number;
    unknown: number;
    geoScore: number;
  };
  crawlers: CrawlerResult[];
  recommendations: string[];
  rawRobotsTxt: string | null;
};

export async function checkCrawlerPermissions(url: string): Promise<CrawlerPermissionsResult> {
  // Extract domain from URL
  let domain: string;
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    domain = urlObj.origin;
  } catch {
    throw new InvalidUrlFormatError("Invalid URL format");
  }

  // Fetch robots.txt via the SSRF-safe helper. Private-IP URLs, file://,
  // metadata endpoints, etc. all throw before any connection is made.
  // (DisallowedUrlError propagates to the caller as-is.)
  const fetched = await fetchRobots(url);
  const robotsTxtContent = fetched.content;
  const robotsTxtExists = fetched.robotsTxtExists;
  const fetchError = fetched.fetchError;

  // Parse and check each AI crawler
  const blocks = robotsTxtExists ? parseRobotsTxt(robotsTxtContent) : [];

  const crawlerResults = evaluateCrawlers({ blocks, robotsTxtExists, fetchError });

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
        `CRITICAL: ${blockedSearch.length} search indexing bot(s) blocked: ${blockedSearch.map((c) => c.platform).join(", ")}. These determine whether you appear in AI search answers - unblock these first.`,
      );
    }
    if (blockedRealtime.length > 0) {
      recommendations.push(
        `${blockedRealtime.length} realtime browsing bot(s) blocked: ${blockedRealtime.map((c) => c.platform).join(", ")}. Users asking the assistant to open your URL will see "couldn't access this page."`,
      );
    }
    if (blockedTraining.length > 0) {
      recommendations.push(
        `${blockedTraining.length} training crawler(s) blocked: ${blockedTraining.map((c) => c.platform).join(", ")}. Acceptable if intentional - these only affect future model training, not current answers.`,
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
    // line between) - some parsers mishandle stacked User-agent lines
    // before a single Disallow, so keep each bot isolated.
    const byPurpose: Record<"search" | "realtime" | "training", typeof AI_CRAWLERS> = {
      search: [],
      realtime: [],
      training: [],
    };
    for (const c of AI_CRAWLERS) byPurpose[c.purpose].push(c);
    const purposeSections: string[] = [];
    const pushSection = (purposeLabel: string, heading: string, crawlers: typeof AI_CRAWLERS) => {
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
      "Search indexing bots - these determine whether you appear in AI search answers",
      byPurpose.search,
    );
    pushSection(
      "realtime",
      "Realtime browsing bots - fired when a user asks an assistant to open your URL",
      byPurpose.realtime,
    );
    pushSection(
      "training",
      "Training crawlers - opt out here if you don't want content used in future model training",
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

  return {
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
  };
}
