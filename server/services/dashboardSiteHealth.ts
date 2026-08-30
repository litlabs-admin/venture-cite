// Dashboard site-health service.
//
// Robots.txt-based AI crawler access scoring, the fact-scrape issue
// aggregate, per-page severity, and per-page content findings - all backing
// the Site Health tab. Extracted verbatim from server/routes/dashboard.ts.
//
// No Express types here. Every function takes explicit parameters (a brand,
// a brandId, a list of urls) and returns plain data or throws.

import { storage } from "../storage";
import { logger } from "../lib/logger";
import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { brandFactScrapePages, siteHealthFindingStatus } from "@shared/schema";
import type { Brand } from "@shared/schema";
import {
  parseRobotsTxt,
  evaluateCrawlers,
  fetchRobots,
  fetchDiscovery,
  AI_CRAWLERS,
} from "../lib/crawlerAccess";
import { detectPlatform } from "../lib/platformDetect";
import { safeFetchText } from "../lib/ssrf";
import { withOriginLimit } from "../lib/originConcurrency";
import { scanPagesForFindings } from "../lib/siteHealthContentScan";
import type { SiteHealthFinding } from "@shared/siteHealthFindings";
import { pageFindingIds } from "@shared/siteHealthFindings";
import { scoreSiteHealth } from "../lib/scoreSiteHealth";

// ---------------------------------------------------------------------------
// GET /api/dashboard/site-health/:brandId - in-module robots.txt cache.
//
// The crawler-access evaluation hits the network (robots.txt fetch), which
// is too slow/expensive to redo on every dashboard load. Cache per brandId
// with a 6-hour TTL; no new DB table needed since this is a cheap
// point-in-time snapshot, not something we need to persist or query.
// ---------------------------------------------------------------------------
type SiteHealthCacheEntry = {
  checkedAt: string;
  website: string | null;
  discovery: {
    robotsTxt: boolean | null;
    sitemapXml: boolean | null;
    llmsTxt: boolean | null;
    mcpJson: boolean | null;
    securityTxt: boolean | null;
  };
  total: number;
  allowed: number;
  blocked: number;
  unknown: number;
  blockedCrawlers: string[];
  platform: string | null;
  // Sitemap URL count - the SITE's size (crawled pages the sitemap
  // advertises), distinct from `pagesFetched` on a scrape run (the
  // cost-bounded fact-extraction SAMPLE, ~10 URLs). null = sitemap
  // unavailable/unfetchable; the UI falls back to pagesCrawled.
  sitemapUrlCount: number | null;
  // PENDING, not measured. Set only on the deadline-timeout placeholder
  // returned by getSiteHealthCached when the real compute hasn't finished -
  // never set on anything that reaches cacheSiteHealth. A pending entry
  // carries all-false/null discovery and zero crawler counts, which look
  // exactly like a genuinely terrible site if a caller forgets to check this
  // flag, so scoreSiteHealth and the UI both gate on it explicitly.
  pending?: boolean;
};
const SITE_HEALTH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// BOUNDED. A plain unbounded Map here was a slow memory leak: entries are only
// ever overwritten per brand, never removed, so a long-lived process serving
// many brands grows forever. Map preserves insertion order, so deleting the
// first key evicts the oldest - enough for a cache this small, without pulling
// in an LRU dependency.
const SITE_HEALTH_CACHE_MAX = 500;
// Bounded wait for a cold-cache compute before answering with a placeholder.
//
// Was 4s. Live probing against apple.com measured: robots 477ms, sitemap
// 135ms, llms.txt 7777ms (a 404 that serves a 110KB custom error page),
// mcp.json 1531ms, security.txt 132ms - i.e. a real, honest compute that
// legitimately exceeds 4s on a slow 404 page. 4s guaranteed a timeout on any
// site with one slow discovery file, and the timeout placeholder used to be
// scored and rendered as if it were real data (all-false discovery, zero
// crawler counts) - a timeout is not a measurement. 9s gives probes (each
// individually capped at 10s) room to actually finish while still protecting
// the dashboard from a truly hung site.
const SITE_HEALTH_DEADLINE_MS = 9_000;
const siteHealthCache = new Map<string, SiteHealthCacheEntry>();

// Coalesces concurrent computes for the SAME brand. Without this, N dashboard
// loads landing together on a cold cache each fired their own ~5 outbound
// requests (robots + 3 discovery probes + homepage) at the customer's site - a
// thundering herd we point at someone else's server. Now the first caller does
// the work and the rest await its promise.
const siteHealthInFlight = new Map<string, Promise<SiteHealthCacheEntry>>();

function cacheSiteHealth(brandId: string, entry: SiteHealthCacheEntry): void {
  siteHealthCache.set(brandId, entry);
  while (siteHealthCache.size > SITE_HEALTH_CACHE_MAX) {
    const oldest = siteHealthCache.keys().next();
    if (oldest.done) break;
    siteHealthCache.delete(oldest.value);
  }
}

// Durable mirror of the in-process cache above.
//
// siteHealthCache is a plain Map, so it dies with the process. Every deploy
// and every restart therefore served `pending: true` ("Measuring…") on the
// first dashboard load for every brand, and because the Map is per-process
// nothing could pre-warm it either. Persisting each computed entry to
// system_state fixes both: a cold process hydrates from the last real
// measurement, and the weekly activation job can warm a brand it will never
// share a process with.
//
// system_state rather than a new table - it is an existing key/value store
// with a JSON column, and this is one row per brand. ponytail: no migration.
const siteHealthStateKey = (brandId: string) => `site_health:${brandId}`;

function isFresh(entry: SiteHealthCacheEntry): boolean {
  return Date.now() - new Date(entry.checkedAt).getTime() < SITE_HEALTH_CACHE_TTL_MS;
}

async function readPersistedSiteHealth(brandId: string): Promise<SiteHealthCacheEntry | null> {
  try {
    const raw = await storage.getSystemState(siteHealthStateKey(brandId));
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as SiteHealthCacheEntry;
    // A persisted `pending` placeholder would be a stored non-measurement.
    // cacheSiteHealth is never called with one, but reject it here too so a
    // hand-edited row can't pin a brand to "unmeasured".
    if (entry.pending || !entry.checkedAt) return null;
    return entry;
  } catch (err) {
    logger.warn({ err, brandId }, "site health: persisted read failed");
    return null;
  }
}

/** Best-effort persist. Swallows everything, including a SYNCHRONOUS throw.
 *
 *  This was `void storage.setSystemState(...).catch(...)`, which handles a
 *  rejected promise but not a method that throws before returning one - and
 *  that throw propagated out of the compute, discarding a site-health reading
 *  we had already paid for and answering `pending` instead. Losing the
 *  cross-process warm start is an acceptable failure here; losing the
 *  measurement is not. */
async function persistSiteHealth(brandId: string, entry: SiteHealthCacheEntry): Promise<void> {
  try {
    await storage.setSystemState(siteHealthStateKey(brandId), entry);
  } catch (err) {
    logger.warn({ err, brandId }, "site health: persist failed");
  }
}

async function getSiteHealthCached(
  brandId: string,
  website: string | null,
): Promise<SiteHealthCacheEntry> {
  const cached = siteHealthCache.get(brandId);
  if (cached && isFresh(cached)) {
    return cached;
  }
  // Expired-but-real answer to fall back on, for the error and deadline paths
  // below. Starts as whatever THIS process has; the work promise upgrades it if
  // a persisted row turns up.
  let stale: SiteHealthCacheEntry | null = cached ?? null;

  // NOTHING may be awaited between this lookup and the .set() below, or the
  // coalescing breaks: N concurrent cold-cache requests would each find an
  // empty map, each start their own compute, and hammer the customer's domain
  // N times. Reading the persisted row here rather than inside `work` cost
  // exactly that (caught by the "fetchRobots called once" test) - so the read
  // lives inside the work promise, where every caller shares its result.
  let work = siteHealthInFlight.get(brandId);
  if (!work) {
    work = (async () => {
      try {
        // Cold process: a previous instance may already have measured this
        // brand. Only short-circuit on a STILL-FRESH row - a stale one is worth
        // recomputing, though it is still a better answer than `pending`, so it
        // is kept as the fallback either way.
        const persisted = await readPersistedSiteHealth(brandId);
        if (persisted) {
          siteHealthCache.set(brandId, persisted);
          stale ??= persisted;
          if (isFresh(persisted)) return persisted;
        }

        const fresh = await computeSiteHealth(website);
        cacheSiteHealth(brandId, fresh);
        await persistSiteHealth(brandId, fresh);
        return fresh;
      } catch (err) {
        // computeSiteHealth already degrades internally, but if it ever throws,
        // serve the STALE entry rather than failing the panel. Expired-but-real
        // beats nothing; only a brand we have never measured falls through.
        logger.error({ err, brandId }, "site health compute failed");
        if (stale) return stale;
        throw err;
      } finally {
        siteHealthInFlight.delete(brandId);
      }
    })();

    siteHealthInFlight.set(brandId, work);
  }

  // DEADLINE. The underlying probes each allow 10s, so a slow customer site
  // could hold this HTTP response open for ~10s - one unresponsive domain
  // stalling someone's dashboard. Wait a bounded time, then answer with what
  // we have.
  //
  // The abandoned `work` promise is deliberately NOT cancelled: it keeps
  // running and populates the cache when it finishes, so the next request
  // gets the real answer. The placeholder returned here is never cached, so
  // a timeout can't pin a brand to "unmeasured".
  const deadline = new Promise<SiteHealthCacheEntry | null>((resolve) =>
    setTimeout(() => resolve(null), SITE_HEALTH_DEADLINE_MS).unref?.(),
  );
  const raced = await Promise.race([work.catch(() => null), deadline]);
  if (raced) return raced;
  // Expired-but-real beats `pending`, whether it came from this process or a
  // previous one.
  if (stale) return stale;
  // PENDING placeholder - NEVER cached (see cacheSiteHealth callers; this
  // object is returned directly, never passed to cacheSiteHealth). Discovery
  // is UNKNOWN (null), not "absent" (false): a slow site's files may well
  // exist, we just haven't found out yet within the deadline. `pending: true`
  // is the only thing scoreSiteHealth and the UI need to check to refuse to
  // render this as a real score.
  return {
    checkedAt: new Date().toISOString(),
    website,
    discovery: { ...EMPTY_DISCOVERY },
    platform: null,
    total: 0,
    allowed: 0,
    blocked: 0,
    unknown: 0,
    blockedCrawlers: [],
    sitemapUrlCount: null,
    pending: true,
  };
}

/**
 * Compute site health for a brand and persist it, with no response deadline.
 *
 * The request path races the compute against SITE_HEALTH_DEADLINE_MS because a
 * slow customer domain must not hold a dashboard open. A background job has no
 * such caller, so it waits for the real answer - which is the whole point of
 * warming: the next dashboard load reads a finished measurement instead of
 * starting one.
 *
 * Never throws: a brand whose site is unreachable is a normal outcome here.
 */
export async function warmSiteHealth(brandId: string, website: string | null): Promise<void> {
  try {
    const fresh = await computeSiteHealth(website);
    cacheSiteHealth(brandId, fresh);
    await persistSiteHealth(brandId, fresh);
  } catch (err) {
    logger.warn({ err, brandId }, "site health: warm failed");
  }
}

// UNKNOWN, not "absent". Used for the pending-timeout placeholder and as the
// degrade-on-throw default in computeSiteHealth - both cases mean "we could
// not measure this", never "confirmed missing".
const EMPTY_DISCOVERY = {
  robotsTxt: null,
  sitemapXml: null,
  llmsTxt: null,
  mcpJson: null,
  securityTxt: null,
} as const;

// Bounded fetcher adapter for discoverSitemapUrls - reuses the same
// SSRF-safe fetch as robots/discovery, capped byte size, never throws.
const sitemapFetcher = async (url: string, opts?: { maxBytes?: number }) => {
  const { status, text } = await safeFetchText(url, {
    maxBytes: opts?.maxBytes ?? 500_000,
    timeoutMs: 10_000,
    headers: { "User-Agent": "GEO-Platform-Checker/1.0" },
  });
  return { status, text };
};

// Site size (sitemap URL count), capped at a few hundred entries by
// discoverSitemapUrls itself (MAX_ENTRIES = 200). Degrades to null on any
// failure - never blocks or throws, runs inside the same 6h cache/4s
// deadline as the rest of computeSiteHealth.
async function getSitemapUrlCount(website: string): Promise<number | null> {
  // COUNT, don't COLLECT. `discoverSitemapUrls` exists to hand the fact-scraper
  // a workable list of URLs, so it stops at MAX_ENTRIES (200). Using its length
  // as the site's page count reported "200 pages" for apple.com, whose sitemap
  // actually holds 848 - a truncation artifact rendered as though it were a
  // measurement, which is worse than showing nothing.
  //
  // We only need the tally, so count <loc> elements directly. Nested
  // sitemapindex files are followed one level, which covers the common
  // "index -> child sitemaps" layout without turning this into a crawler.
  const origin = (() => {
    try {
      return new URL(website.startsWith("http") ? website : `https://${website}`).origin;
    } catch {
      return null;
    }
  })();
  if (!origin) return null;

  const countLocs = async (url: string): Promise<{ locs: number; children: string[] }> => {
    const fetchOrigin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return origin;
      }
    })();
    const { status, text } = await withOriginLimit(fetchOrigin, () =>
      safeFetchText(url, {
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 8_000,
        headers: { "User-Agent": "GEO-Platform-Checker/1.0" },
      }),
    );
    if (status < 200 || status >= 300) return { locs: 0, children: [] };
    const isIndex = /<sitemapindex/i.test(text);
    const locs = (text.match(/<loc>/gi) ?? []).length;
    if (!isIndex) return { locs, children: [] };
    // A sitemapindex's <loc>s are child sitemaps, not pages.
    const children = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => m[1])
      .slice(0, 25); // bounded: never fan out unboundedly on someone's site
    return { locs: 0, children };
  };

  try {
    const root = await countLocs(`${origin}/sitemap.xml`);
    if (root.children.length === 0) return root.locs > 0 ? root.locs : null;
    const childCounts = await Promise.all(
      root.children.map((c) =>
        countLocs(c)
          .then((r) => r.locs)
          .catch(() => 0),
      ),
    );
    const total = childCounts.reduce((a, b) => a + b, 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

async function computeSiteHealth(website: string | null): Promise<SiteHealthCacheEntry> {
  const checkedAt = new Date().toISOString();
  if (!website) {
    return {
      checkedAt,
      website: null,
      discovery: { ...EMPTY_DISCOVERY },
      total: 0,
      allowed: 0,
      blocked: 0,
      unknown: 0,
      blockedCrawlers: [],
      platform: null,
      sitemapUrlCount: null,
    };
  }

  try {
    const [{ robotsTxtExists, content, fetchError }, discovery, platform, sitemapUrlCount] =
      await Promise.all([
        fetchRobots(website),
        fetchDiscovery(website).catch(() => ({ ...EMPTY_DISCOVERY })),
        // Runs concurrently with the robots/discovery fetches, inside the
        // same 6h cache - never a per-render network round-trip. Best-effort:
        // detectPlatform never throws, degrades to null on any failure.
        detectPlatform(website).catch(() => null),
        // Same treatment: concurrent, best-effort, null on failure. This is
        // the SITE's page count (sitemap size), not the fact-extraction
        // sample (`pagesFetched` on a scrape run).
        getSitemapUrlCount(website),
      ]);
    const blocks = robotsTxtExists ? parseRobotsTxt(content) : [];
    const crawlerResults = evaluateCrawlers({ blocks, robotsTxtExists, fetchError });

    const total = AI_CRAWLERS.length;
    const allowed = crawlerResults.filter((c) => c.status === "allowed").length;
    const blocked = crawlerResults.filter((c) => c.status === "blocked").length;
    const unknown = crawlerResults.filter((c) => c.status === "unknown").length;
    const blockedCrawlers = crawlerResults
      .filter((c) => c.status === "blocked")
      .map((c) => c.platform);

    return {
      checkedAt,
      website,
      discovery,
      total,
      allowed,
      blocked,
      unknown,
      blockedCrawlers,
      platform,
      sitemapUrlCount,
    };
  } catch (err) {
    // Network/parse failure - degrade gracefully, never 500 the dashboard.
    logger.error({ err }, "Site health robots.txt check failed");
    return {
      checkedAt,
      website,
      discovery: { ...EMPTY_DISCOVERY },
      total: 0,
      allowed: 0,
      blocked: 0,
      unknown: 0,
      blockedCrawlers: [],
      platform: null,
      sitemapUrlCount: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Per-page severity for the Site Health detail page - SAME rules as the
// issue aggregate in the SQL below (getSiteHealthDashboard), just evaluated
// in JS over individual rows instead of a grouped count. Keep these two in
// sync; a page landing in "high" here must land in the same bucket the
// aggregate counted it in.
// ---------------------------------------------------------------------------
export function pageSeverity(page: {
  statusCode: number | null;
  status: string;
  errorKind: string | null;
  contentType: string | null;
  factCount: number;
}): "critical" | "high" | "medium" | "low" | "ok" {
  const sc = page.statusCode;
  if (
    (sc !== null && sc >= 500) ||
    (sc === null && (page.status === "failed" || page.errorKind !== null))
  ) {
    return "critical";
  }
  if (sc !== null && sc >= 400 && sc < 500) return "high";
  const isHtml = page.contentType === null || /html/i.test(page.contentType);
  if (sc !== null && sc >= 200 && sc < 300 && page.factCount === 0 && isHtml) return "medium";
  if (
    sc !== null &&
    sc >= 200 &&
    sc < 300 &&
    page.contentType !== null &&
    !/html/i.test(page.contentType)
  ) {
    return "low";
  }
  return "ok";
}

// ==========================================================================
// GET /api/dashboard/site-health/:brandId
// Robots.txt-based AI crawler access score + latest fact-scrape run stats.
// Robots.txt evaluation is cached in-module per brandId (6h TTL) so this
// never hits the network on every dashboard load.
// ==========================================================================
export async function getSiteHealthDashboard(brand: Brand) {
  const website = brand.website?.trim() || null;

  const health = await getSiteHealthCached(brand.id, website);

  const latestRun = await storage.getLatestCompletedScrapeRun(brand.id).catch(() => null);

  // Issue counts - single grouped aggregate over the latest run's
  // pages, never a full row fetch. Degrades to all-zero on any
  // failure (missing table, bad run id, etc.) - never 500s.
  let issues = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  if (latestRun) {
    try {
      const [row] = await db
        .select({
          critical: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 500 or (${brandFactScrapePages.statusCode} is null and (${brandFactScrapePages.status} = 'failed' or ${brandFactScrapePages.errorKind} is not null)))::int`,
          high: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 400 and ${brandFactScrapePages.statusCode} < 500)::int`,
          // `and (content_type is null or ilike '%html%')` keeps medium
          // and low DISJOINT. Without it a 2xx PDF that yielded no facts
          // matched both filters and `total` counted that one page twice,
          // so the severity counts would not have summed to a page count.
          // A non-HTML page yielding nothing is a `low`, not a `medium` -
          // extracting little from a PDF is expected, not a defect.
          medium: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 200 and ${brandFactScrapePages.statusCode} < 300 and ${brandFactScrapePages.factCount} = 0 and (${brandFactScrapePages.contentType} is null or ${brandFactScrapePages.contentType} ilike '%html%'))::int`,
          low: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 200 and ${brandFactScrapePages.statusCode} < 300 and ${brandFactScrapePages.contentType} is not null and ${brandFactScrapePages.contentType} not ilike '%html%')::int`,
        })
        .from(brandFactScrapePages)
        .where(sql`${brandFactScrapePages.runId} = ${latestRun.id}`);
      if (row) {
        const critical = row.critical ?? 0;
        const high = row.high ?? 0;
        const medium = row.medium ?? 0;
        const low = row.low ?? 0;
        issues = { critical, high, medium, low, total: critical + high + medium + low };
      }
    } catch (err) {
      logger.error({ err, brandId: brand.id }, "Site health issue aggregate failed");
    }
  }

  const crawl = latestRun
    ? { pagesFetched: latestRun.pagesFetched, pagesFailed: latestRun.pagesFailed }
    : null;

  const score = scoreSiteHealth({
    website: health.website,
    discovery: health.discovery,
    crawlers: { total: health.total, allowed: health.allowed },
    crawl,
    pending: health.pending,
  });

  return {
    website: health.website,
    checkedAt: health.checkedAt,
    score,
    // The compute hasn't finished within the deadline yet - the
    // discovery/crawler fields above are all-unknown/zero and MUST
    // NOT be read as a measurement. The background compute is still
    // running and will populate the cache; the next load gets the
    // real answer.
    pending: !!health.pending,
    platform: health.platform,
    discovery: health.discovery,
    crawlers: {
      total: health.total,
      allowed: health.allowed,
      blocked: health.blocked,
      unknown: health.unknown,
      blockedCrawlers: health.blockedCrawlers,
    },
    crawl: {
      // "Pages we audited" - the cost-bounded fact-extraction sample.
      pagesCrawled: latestRun?.pagesFetched ?? null,
      pagesFailed: latestRun?.pagesFailed ?? null,
      // The SITE's size - sitemap URL count. This is what the "N
      // pages" chip should show; pagesCrawled is a fallback when the
      // sitemap is unavailable.
      sitemapUrlCount: health.sitemapUrlCount,
      lastCrawlAt: latestRun ? (latestRun.completedAt ?? latestRun.startedAt).toISOString() : null,
    },
    issues,
  };
}

// ==========================================================================
// GET /api/dashboard/site-health/:brandId/pages
// Per-page rows of the LATEST completed scrape run, for the Site Health
// detail page's issue lists. Read-only, no LLM, capped at 200 rows.
// Empty array (never 404/500) when the brand has no crawl run yet.
// ==========================================================================
export async function getSiteHealthPages(brandId: string) {
  const latestRun = await storage.getLatestCompletedScrapeRun(brandId).catch(() => null);
  if (!latestRun) {
    return { runId: null, pages: [] };
  }

  const MAX_ROWS = 200;
  const rows = await db
    .select({
      url: brandFactScrapePages.url,
      statusCode: brandFactScrapePages.statusCode,
      status: brandFactScrapePages.status,
      errorKind: brandFactScrapePages.errorKind,
      contentType: brandFactScrapePages.contentType,
      factCount: brandFactScrapePages.factCount,
    })
    .from(brandFactScrapePages)
    .where(sql`${brandFactScrapePages.runId} = ${latestRun.id}`)
    .limit(MAX_ROWS);

  const pages = rows.map((r) => ({
    url: r.url,
    statusCode: r.statusCode,
    status: r.status,
    errorKind: r.errorKind,
    contentType: r.contentType,
    factCount: r.factCount,
    severity: pageSeverity(r),
    // Structural findings only (failed-pages/thin-content) - content
    // findings (meta tags, OG, readability...) require re-fetching
    // HTML per page and are too expensive to run per row here; those
    // stay scoped to the Findings tab's content-findings endpoint.
    findingIds: pageFindingIds(r),
  }));

  return { runId: latestRun.id, pages };
}

// ==========================================================================
// Site health finding status - "Mark in progress" / "Ignore" / "Mark fixed"
// on the finding drawer. Keyed by the finding's stable check-type id, not a
// scan run, so status survives a rescan. A finding never touched has no
// row and reads as "untouched" - a read never fabricates a default.
// ==========================================================================
export async function getSiteHealthFindingStatuses(brandId: string) {
  return db
    .select({
      findingId: siteHealthFindingStatus.findingId,
      status: siteHealthFindingStatus.status,
      updatedAt: siteHealthFindingStatus.updatedAt,
    })
    .from(siteHealthFindingStatus)
    .where(eq(siteHealthFindingStatus.brandId, brandId));
}

export async function setSiteHealthFindingStatus(
  brandId: string,
  findingId: string,
  status: string,
  userId: string,
): Promise<void> {
  await db
    .insert(siteHealthFindingStatus)
    .values({ brandId, findingId, status, updatedBy: userId })
    .onConflictDoUpdate({
      target: [siteHealthFindingStatus.brandId, siteHealthFindingStatus.findingId],
      set: { status, updatedAt: new Date(), updatedBy: userId },
    });
}

// "Untouched" has no row by definition - clearing status means deleting it,
// not writing a third state.
export async function clearSiteHealthFindingStatus(
  brandId: string,
  findingId: string,
): Promise<void> {
  await db
    .delete(siteHealthFindingStatus)
    .where(
      and(
        eq(siteHealthFindingStatus.brandId, brandId),
        eq(siteHealthFindingStatus.findingId, findingId),
      ),
    );
}

// ==========================================================================
// GET /api/dashboard/site-health/:brandId/content-findings
// Per-page CONTENT findings (meta tags, OG tags, heading structure,
// readability, structured answer formats, FAQ content, content density).
// These require re-fetching each page's HTML (excerpt is never persisted -
// brand_fact_scrape_pages.excerpt is a dead column), so this is a SIBLING
// computation, never inlined into the hot site-health path or its deadline.
// Cached per brand with a 6h TTL + in-flight coalescing, same shape as
// getSiteHealthCached above, so concurrent dashboard loads don't each
// re-fetch the brand's whole page set.
// ==========================================================================
const CONTENT_FINDINGS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CONTENT_FINDINGS_DEADLINE_MS = 8_000;
const CONTENT_FINDINGS_CACHE_MAX = 500;
type ContentFindingsCacheEntry = { checkedAt: number; findings: SiteHealthFinding[] };
const contentFindingsCache = new Map<string, ContentFindingsCacheEntry>();
const contentFindingsInFlight = new Map<string, Promise<ContentFindingsCacheEntry>>();

function cacheContentFindings(brandId: string, entry: ContentFindingsCacheEntry): void {
  contentFindingsCache.set(brandId, entry);
  while (contentFindingsCache.size > CONTENT_FINDINGS_CACHE_MAX) {
    const oldest = contentFindingsCache.keys().next();
    if (oldest.done) break;
    contentFindingsCache.delete(oldest.value);
  }
}

async function getContentFindingsCached(
  brandId: string,
  urls: string[],
): Promise<ContentFindingsCacheEntry> {
  const cached = contentFindingsCache.get(brandId);
  if (cached && Date.now() - cached.checkedAt < CONTENT_FINDINGS_CACHE_TTL_MS) return cached;

  const existing = contentFindingsInFlight.get(brandId);
  if (existing) return existing;

  const work = (async () => {
    try {
      const findings = await scanPagesForFindings(urls);
      const fresh = { checkedAt: Date.now(), findings };
      cacheContentFindings(brandId, fresh);
      return fresh;
    } catch (err) {
      logger.error({ err, brandId }, "content findings scan failed");
      if (cached) return cached;
      return { checkedAt: Date.now(), findings: [] };
    } finally {
      contentFindingsInFlight.delete(brandId);
    }
  })();
  contentFindingsInFlight.set(brandId, work);

  // Bounded wait - the underlying page fetches can take longer than a
  // request should stay open. If the deadline passes, the abandoned `work`
  // promise keeps running and populates the cache for the NEXT request; we
  // answer with stale cache (if any) or an empty result now, never a hung
  // response and never a cached-as-final empty placeholder.
  const deadline = new Promise<ContentFindingsCacheEntry | null>((resolve) =>
    setTimeout(() => resolve(null), CONTENT_FINDINGS_DEADLINE_MS).unref?.(),
  );
  const raced = await Promise.race([work.catch(() => null), deadline]);
  if (raced) return raced;
  if (cached) return cached;
  return { checkedAt: Date.now(), findings: [] };
}

export async function getSiteHealthContentFindings(brandId: string) {
  const latestRun = await storage.getLatestCompletedScrapeRun(brandId).catch(() => null);
  if (!latestRun) {
    return { findings: [] as SiteHealthFinding[] };
  }

  const MAX_ROWS = 50;
  const rows = await db
    .select({ url: brandFactScrapePages.url })
    .from(brandFactScrapePages)
    .where(sql`${brandFactScrapePages.runId} = ${latestRun.id}`)
    .limit(MAX_ROWS);
  const urls = rows.map((r) => r.url).filter((u): u is string => !!u);

  const { findings } = await getContentFindingsCached(brandId, urls);
  return { findings };
}
