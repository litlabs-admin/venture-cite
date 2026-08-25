// Pure site-health scoring - no I/O, no imports with module-scope side
// effects (no OpenAI client construction, no route registration).
//
// Lives here (not server/routes/dashboard.ts, where it originally lived)
// because server/lib/siteHealthHistory.ts needs to call it from inside the
// fact-scrape worker's success path (server/lib/factAgent/v2/runFullScrape.ts).
// Importing it FROM dashboard.ts would drag that whole route file - and its
// module-scope `new OpenAI(...)` client construction (server/lib/routesShared.ts)
// - into the scraper's dependency graph, which broke
// tests/unit/v2FactSheetRefresh.test.ts's OpenAI mock the first time this was
// wired up. dashboard.ts re-exports this for backward compatibility with
// existing imports/tests.
export const DISCOVERY_WEIGHTS = { robotsTxt: 10, sitemapXml: 15, llmsTxt: 10 } as const;

export function scoreSiteHealth(params: {
  website: string | null;
  discovery: {
    robotsTxt: boolean | null;
    sitemapXml: boolean | null;
    llmsTxt: boolean | null;
  };
  crawlers: { total: number; allowed: number };
  crawl: { pagesFetched: number; pagesFailed: number } | null; // null = no crawl run
  pending?: boolean; // true = compute hasn't finished - never scored
}): number | null {
  const { website, discovery, crawlers, crawl, pending } = params;

  if (pending) return null;
  if (!website && !crawl) return null;

  let earned = 0;
  let attainable = 0;

  for (const key of Object.keys(DISCOVERY_WEIGHTS) as (keyof typeof DISCOVERY_WEIGHTS)[]) {
    const value = discovery[key];
    if (value === null || value === undefined) continue; // unknown - excluded, not zeroed
    attainable += DISCOVERY_WEIGHTS[key];
    if (value) earned += DISCOVERY_WEIGHTS[key];
  }

  attainable += 35;
  earned += crawlers.total > 0 ? Math.round((crawlers.allowed / crawlers.total) * 35) : 0;

  if (crawl) {
    attainable += 30;
    const denom = crawl.pagesFetched + crawl.pagesFailed;
    if (denom > 0) {
      earned += Math.round((crawl.pagesFetched / denom) * 30);
    }
  }

  if (attainable === 0) return null;
  return Math.round((earned / attainable) * 100);
}
