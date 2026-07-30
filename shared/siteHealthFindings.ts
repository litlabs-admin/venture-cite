// ─── Site Health findings ────────────────────────────────────────────────────
// Pure, framework-free derivation of "what to fix" rows from a site-health
// snapshot + its per-page crawl rows. Lives in shared/ (not server/lib or
// client/src) so both the API route and the /site-health page compute the
// SAME numbers from the SAME rules — no duplicated, driftable math.
//
// Point values are NOT invented: they mirror the real weights in
// scoreSiteHealth() (server/routes/dashboard.ts) —
//   discovery:      robots.txt = 10, sitemap.xml = 15, llms.txt = 10
//   crawler access:  up to 35, scaled by blocked/total
//   crawl success:   up to 30, scaled by the failing/thin share of pages
// mcp.json / security.txt are real, already-detected discovery signals
// (server/lib/crawlerAccess.ts `fetchDiscovery`) but carry no scoring weight
// in scoreSiteHealth, so they surface as advisory (0-pt) findings rather than
// an invented weight.
//
// HONESTY: returns [] when there is no crawl at all — a site that's never
// been crawled has nothing to "fix next", it needs a first crawl.

export type SiteHealthFindingCategory =
  "DISCOVERABILITY" | "CRAWLER ACCESS" | "CONTENT QUALITY" | "CONTENT STRUCTURE";

export interface SiteHealthFinding {
  id: string;
  category: SiteHealthFindingCategory;
  title: string;
  description: string;
  /** Real weight from scoreSiteHealth(), scaled by the share of the site
   *  affected. 0 for advisory-only findings that carry no scoring weight. */
  points: number;
  affectedUrls: string[];
  /** True for findings that are good practice but score 0 points — never
   *  faked as if they carried real weight. */
  advisory?: boolean;
}

export interface SiteHealthFindingsHealth {
  crawl: { pagesCrawled: number | null; pagesFailed: number | null };
  // boolean | null — null means UNKNOWN (probe timed out / 429 / errored),
  // not "confirmed absent". Only a confirmed-false file should surface as a
  // "missing X" finding; an unmeasured file has nothing actionable to say.
  discovery: {
    robotsTxt: boolean | null;
    sitemapXml: boolean | null;
    llmsTxt: boolean | null;
    mcpJson: boolean | null;
    securityTxt: boolean | null;
  };
  crawlers: { total: number; allowed: number; blocked: number; blockedCrawlers: string[] };
}

export interface SiteHealthFindingsPage {
  url: string;
  statusCode: number | null;
  errorKind: string | null;
  factCount: number;
}

export function computeSiteHealthFindings(
  health: SiteHealthFindingsHealth | null | undefined,
  pages: SiteHealthFindingsPage[],
): SiteHealthFinding[] {
  // No crawl at all → nothing to fix next, just a first crawl to run.
  if (!health || health.crawl.pagesCrawled === null) return [];

  const findings: SiteHealthFinding[] = [];
  const { discovery, crawlers } = health;

  if (discovery.robotsTxt === false) {
    findings.push({
      id: "missing-robots-txt",
      category: "DISCOVERABILITY",
      title: "Add a robots.txt file",
      description:
        "AI crawlers can't confirm what they're allowed to read without a robots.txt file at your site root.",
      points: 10,
      affectedUrls: [],
    });
  }
  if (discovery.sitemapXml === false) {
    findings.push({
      id: "missing-sitemap-xml",
      category: "DISCOVERABILITY",
      title: "Add a sitemap.xml file",
      description:
        "Without a sitemap, AI crawlers can only discover pages by following links, and may miss whole sections of the site.",
      points: 15,
      affectedUrls: [],
    });
  }
  if (discovery.llmsTxt === false) {
    findings.push({
      id: "missing-llms-txt",
      category: "DISCOVERABILITY",
      title: "Add an llms.txt file",
      description:
        "llms.txt gives AI systems a direct, curated summary of your site instead of making them infer one.",
      points: 10,
      affectedUrls: [],
    });
  }

  if (crawlers.total > 0 && crawlers.blocked > 0) {
    const points = Math.round((crawlers.blocked / crawlers.total) * 35);
    findings.push({
      id: "blocked-ai-crawlers",
      category: "CRAWLER ACCESS",
      title: `${crawlers.blocked} of ${crawlers.total} AI crawlers blocked`,
      description:
        crawlers.blockedCrawlers.length > 0
          ? `robots.txt blocks: ${crawlers.blockedCrawlers.join(", ")}. Blocked crawlers can never cite pages they aren't allowed to fetch.`
          : "Some AI crawlers are blocked from reading this site by robots.txt.",
      points,
      affectedUrls: [],
    });
  }

  const totalPages = pages.length;
  if (totalPages > 0) {
    const failing = pages.filter(
      (p) =>
        (p.statusCode !== null && p.statusCode >= 400) ||
        (p.statusCode === null && p.errorKind !== null),
    );
    if (failing.length > 0) {
      const points = Math.round((failing.length / totalPages) * 30);
      findings.push({
        id: "failed-pages",
        category: "CONTENT QUALITY",
        title: `${failing.length} page${failing.length === 1 ? "" : "s"} failed to crawl`,
        description:
          "Pages that return an error or fail to fetch contribute no facts an AI system could ever cite.",
        points,
        affectedUrls: failing.map((p) => p.url),
      });
    }

    const thin = pages.filter(
      (p) =>
        p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300 && p.factCount === 0,
    );
    if (thin.length > 0) {
      const points = Math.round((thin.length / totalPages) * 30);
      findings.push({
        id: "thin-content",
        category: "CONTENT QUALITY",
        title: `${thin.length} page${thin.length === 1 ? "" : "s"} with no extractable content`,
        description:
          "These pages loaded successfully but yielded zero facts — often a sign of content rendered client-side, which non-JS AI crawlers never see.",
        points,
        affectedUrls: thin.map((p) => p.url),
      });
    }
  }

  if (discovery.mcpJson === false) {
    findings.push({
      id: "missing-mcp-json",
      category: "CONTENT STRUCTURE",
      title: "Add an mcp.json file",
      description:
        "mcp.json lets MCP-aware AI agents discover the tools/actions your site exposes. Not scored — a forward-looking signal, not a citation-readiness weight.",
      points: 0,
      affectedUrls: [],
      advisory: true,
    });
  }
  if (discovery.securityTxt === false) {
    findings.push({
      id: "missing-security-txt",
      category: "CONTENT STRUCTURE",
      title: "Add a security.txt file",
      description:
        "security.txt is a best-practice disclosure file. Not scored — it has no bearing on AI citation readiness.",
      points: 0,
      affectedUrls: [],
      advisory: true,
    });
  }

  return findings.sort((a, b) => b.points - a.points);
}
