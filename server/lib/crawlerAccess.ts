// Reusable AI-crawler / robots.txt evaluation logic.
//
// Extracted from server/routes/analytics.ts (POST /api/check-crawler-permissions)
// so the dashboard site-health endpoint can reuse the same crawler list,
// robots.txt parser, and allowed/blocked/unknown evaluation without
// duplicating them.

import { safeFetchText } from "./ssrf";
import { withOriginLimit } from "./originConcurrency";

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
export const AI_CRAWLERS: Array<{
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
    description: "OpenAI's main training crawler — gathers content for ChatGPT and future models.",
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
export function parseRobotsTxt(
  content: string,
): { userAgent: string; rules: { type: "allow" | "disallow"; path: string }[] }[] {
  const blocks: { userAgent: string; rules: { type: "allow" | "disallow"; path: string }[] }[] = [];
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
    const hasDisallowAll = specificBlock.rules.some((r) => r.type === "disallow" && r.path === "/");
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
    const hasDisallowAll = wildcardBlock.rules.some((r) => r.type === "disallow" && r.path === "/");
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

export type CrawlerResult = (typeof AI_CRAWLERS)[number] & {
  status: "allowed" | "blocked" | "unknown";
  reason: string;
  recommendation: string | null;
};

// Evaluate every known AI crawler against parsed robots.txt blocks. Mirrors
// the per-crawler evaluation previously inlined in the
// POST /api/check-crawler-permissions handler, byte-for-byte.
export function evaluateCrawlers(params: {
  blocks: ReturnType<typeof parseRobotsTxt>;
  robotsTxtExists: boolean;
  fetchError: string;
}): CrawlerResult[] {
  const { blocks, robotsTxtExists, fetchError } = params;
  return AI_CRAWLERS.map((crawler) => {
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
}

// Thrown by fetchRobots when the URL itself is disallowed (private IP,
// unresolvable host, non-http(s) scheme, etc). Mirrors the original
// check-crawler-permissions catch-block regex test
// (/private|not allowed|resolve|Invalid URL|http/i) so callers that need
// the original "this URL is not allowed" 400 behaviour can detect it,
// while callers that just want a best-effort result can catch-and-degrade.
export class DisallowedUrlError extends Error {}

// Fetch robots.txt for a website via the SSRF-safe helper, deriving the
// origin exactly as the crawler-permissions endpoint does.
export async function fetchRobots(website: string): Promise<{
  origin: string;
  robotsTxtExists: boolean;
  content: string;
  fetchError: string;
}> {
  const urlObj = new URL(website.startsWith("http") ? website : `https://${website}`);
  const origin = urlObj.origin;

  let content = "";
  let robotsTxtExists = false;
  let fetchError = "";

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const { status, text } = await withOriginLimit(origin, () =>
      safeFetchText(robotsUrl, {
        maxBytes: 1 * 1024 * 1024,
        timeoutMs: 10_000,
        headers: { "User-Agent": "GEO-Platform-Checker/1.0" },
      }),
    );
    if (status >= 200 && status < 300) {
      content = text;
      robotsTxtExists = true;
    } else if (status === 404) {
      robotsTxtExists = false;
    } else {
      // Includes 429 (rate-limited) and 5xx — both are "we don't know",
      // never "the site blocks everyone" (that would be a real robots.txt
      // saying so, not us getting throttled).
      fetchError = `HTTP ${status}`;
    }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Failed to fetch robots.txt";
    if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
      throw new DisallowedUrlError(msg);
    }
    fetchError = msg;
  }

  return { origin, robotsTxtExists, content, fetchError };
}

// Fetch discovery signals (robots.txt, sitemap.xml, llms.txt, mcp.json,
// security.txt) for a website, used by the site-health citation-readiness
// score.
//
// TRI-STATE, not boolean. A timeout, a 429, a DNS failure, a 5xx, or any
// thrown error is indistinguishable from a genuine 404 if both collapse to
// `false` — that conflation is exactly what made a rate-limited/slow file
// score as "missing" instead of "we don't know". So each flag is:
//   true  = confirmed present (2xx + non-empty body)
//   false = confirmed absent (an explicit 4xx other than 429)
//   null  = UNKNOWN — timeout, network error, 429, 5xx, or any throw.
// scoreSiteHealth excludes `null` entries from both earned and attainable
// points; the UI renders them as a distinct dash/muted state, not a failure.
export async function fetchDiscovery(website: string): Promise<{
  robotsTxt: boolean | null;
  sitemapXml: boolean | null;
  llmsTxt: boolean | null;
  mcpJson: boolean | null;
  securityTxt: boolean | null;
}> {
  const urlObj = new URL(website.startsWith("http") ? website : `https://${website}`);
  const origin = urlObj.origin;

  const fetchPresence = async (path: string): Promise<boolean | null> => {
    try {
      const { status, text } = await withOriginLimit(origin, () =>
        safeFetchText(`${origin}${path}`, {
          maxBytes: 1 * 1024 * 1024,
          timeoutMs: 10_000,
          headers: { "User-Agent": "GEO-Platform-Checker/1.0" },
        }),
      );
      // 429 is "we got throttled", never "confirmed absent" — check before
      // the general 4xx bucket below (429 IS a 4xx status).
      if (status === 429) return null;
      if (status >= 200 && status < 300) return text.trim().length > 0;
      if (status >= 400 && status < 500) return false; // explicit "not found"
      return null; // 3xx, 5xx, or anything else we can't call a measurement
    } catch {
      return null; // timeout / DNS / TLS / network error — unknown, not absent
    }
  };

  const robotsPresence = async (): Promise<boolean | null> => {
    const r = await fetchRobots(website);
    // fetchError covers network failure AND any non-2xx/404 status (429,
    // 5xx, etc — see fetchRobots above), so it maps directly to "unknown".
    if (r.fetchError) return null;
    return r.robotsTxtExists && r.content.trim().length > 0;
  };

  // The reference checks FIVE discovery files: robots.txt, sitemap.xml,
  // llms.txt, mcp.json and security.txt (the last two render as "—" when
  // absent rather than as a failure — they are emerging conventions, not
  // requirements). All five are probed concurrently (bounded to 2-at-a-time
  // per origin via withOriginLimit — five parallel requests at once is not
  // being a good citizen of someone else's server); any failure resolves to
  // `null` (unknown), never an exception and never a silent "absent".
  const [robotsResult, sitemapResult, llmsResult, mcpResult, securityResult] =
    await Promise.allSettled([
      robotsPresence(),
      fetchPresence("/sitemap.xml"),
      fetchPresence("/llms.txt"),
      fetchPresence("/mcp.json"),
      // Canonical location is /.well-known/security.txt (RFC 9116); the legacy
      // root path is still widely used, so either counts as present. If the
      // canonical path is confirmed absent or unknown, fall back to the
      // legacy path before giving up.
      fetchPresence("/.well-known/security.txt").then((ok) =>
        ok === true ? true : fetchPresence("/security.txt"),
      ),
    ]);

  const val = (r: PromiseSettledResult<boolean | null>) =>
    r.status === "fulfilled" ? r.value : null;
  return {
    robotsTxt: val(robotsResult),
    sitemapXml: val(sitemapResult),
    llmsTxt: val(llmsResult),
    mcpJson: val(mcpResult),
    securityTxt: val(securityResult),
  };
}
