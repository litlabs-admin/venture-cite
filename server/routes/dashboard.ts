// Dashboard aggregate endpoints (Track 12 - AI Visibility Report redesign).
//
// Thin read-only endpoints that assemble the hero/rankings/gap-matrix/
// entity-strength views from existing Phase-1 tables. No new schema.
//
// Included:
//   GET /api/dashboard/hero/:brandId            - hero row numbers
//   GET /api/dashboard/rankings/:brandId        - per-platform rollup + snippets
//   GET /api/dashboard/gap-matrix/:brandId      - competitor × query-type cells

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { AI_PLATFORMS_CORE, VISIBILITY_CHECKLIST_TOTAL } from "@shared/constants";
import type { BrandPrompt, GeoRanking, Competitor } from "@shared/schema";
import { getRecommendations, type RecommendationState } from "../lib/recommendationsEngine";
import { citationRatePct, computeVisibilityScore } from "../lib/visibilityMetrics";
import {
  parseRobotsTxt,
  evaluateCrawlers,
  fetchRobots,
  fetchDiscovery,
  AI_CRAWLERS,
} from "../lib/crawlerAccess";
import { logger } from "../lib/logger";
import { db } from "../db";
import { sql, desc, eq } from "drizzle-orm";
import { brandFactScrapePages, brandPerceptionRuns } from "@shared/schema";
import { aiLimitMiddleware } from "../lib/routesShared";
import { runPerceptionScoring } from "../lib/perceptionRun";
import { detectPlatform } from "../lib/platformDetect";
import { discoverSitemapUrls } from "../lib/factAgent/v2/sitemapDiscovery";
import { safeFetchText } from "../lib/ssrf";
import { withOriginLimit } from "../lib/originConcurrency";
import { scanPagesForFindings } from "../lib/siteHealthContentScan";
import type { SiteHealthFinding } from "@shared/siteHealthFindings";

// Platforms we surface on the dashboard. Only platforms in this list
// are rendered as rows - matches the set we actually query via
// citationChecker. Adding a platform here requires adding it to the
// citation runner too.
const CORE_PLATFORMS = AI_PLATFORMS_CORE;

// Strip the citation-delimiter markers from a stored citationContext.
// Rows are persisted as "{statusLine}\n\n||| RAW_RESPONSE |||\n{body}"
// (or the older "--- RAW RESPONSE ---"). For dashboard display we only
// want the body text - the status line is redundant with the Cited/Not
// cited pill the UI already renders.
function extractResponseBody(ctx: string | null | undefined): string | null {
  if (!ctx) return null;
  const markers = ["\n\n||| RAW_RESPONSE |||\n", "\n\n--- RAW RESPONSE ---\n"];
  for (const m of markers) {
    const idx = ctx.indexOf(m);
    if (idx !== -1) {
      const body = ctx.slice(idx + m.length).trim();
      return body.length > 0 ? body : null;
    }
  }
  // No delimiter - treat whole string as body, unless it starts with the
  // obvious "Cited" / "Not cited" status lines, in which case skip it.
  const trimmed = ctx.trim();
  if (/^(Cited|Not cited|Check failed)/i.test(trimmed)) return null;
  return trimmed || null;
}

async function requireOwnedBrand(req: any) {
  const user = requireUser(req);
  const brand = await storage.getBrandById(req.params.brandId);
  if (!brand || brand.userId !== user.id) return null;
  return brand;
}

// ---------------------------------------------------------------------------
// Shared loader - brand prompts + cited/uncited rankings.
//
// Wave 9.2: accepts an optional `since` Date overriding the default
// 30-day window. Used by Citations to scope dashboard reads to "rankings
// from the active run only" while a fresh run is in flight - without
// this, completed-cells from the new run mix with un-rechecked-cells
// from the old run for the entire run duration. When `since` is null
// (no active run), behavior is unchanged: 30-day rolling window.
async function loadRankingsContext(
  brandId: string,
  opts: { windowDays?: number; since?: Date | null } = {},
) {
  const since =
    opts.since instanceof Date && !isNaN(opts.since.getTime())
      ? opts.since
      : new Date(Date.now() - (opts.windowDays ?? 30) * 24 * 60 * 60 * 1000);
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  const promptIds = prompts.map((p) => p.id);
  const rankings =
    promptIds.length > 0 ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since) : [];
  return { prompts, promptIds, rankings, since };
}

// Wave 9.2: parse the optional ?since=<ISO> query param. Returns null
// when missing or malformed - the loader then falls back to the default
// 30-day window. Defensive against junk input (clients only ever pass
// what useActiveCitationRuns surfaced, but we guard anyway).
function parseSinceQuery(req: { query: Record<string, unknown> }): Date | null {
  const raw = typeof req.query.since === "string" ? req.query.since : null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function toCitedArr(rankings: GeoRanking[]) {
  return rankings.filter((r) => r.isCited === 1);
}

function lastScanAt(rankings: GeoRanking[]): Date | null {
  if (rankings.length === 0) return null;
  let latest = rankings[0].checkedAt;
  for (const r of rankings) {
    if (r.checkedAt > latest) latest = r.checkedAt;
  }
  return latest;
}

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
// Minimum gap between perception scoring runs for one brand. Evidence only
// changes when a new citation check lands, so re-scoring sooner spends an LLM
// call to recompute the same answer.
export const PERCEPTION_COOLDOWN_MS = 60 * 60 * 1000;
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
// Citation-readiness scoring - pure function, unit-tested in
// tests/unit/siteHealth.test.ts. Weights below are the full spec; keep them
// in sync with that file's expectations.
//
//   discovery (35 pts):      robots.txt = 10, sitemap.xml = 15, llms.txt = 10
//   crawler access (35 pts): round(allowed / total * 35)
//   crawl success (30 pts):  round(pagesFetched / (pagesFetched + pagesFailed) * 30)
//                            EXCLUDED entirely when no crawl run exists - a
//                            brand that's never been crawled is UNMEASURED,
//                            not penalised, so the score rescales over the
//                            70 points that were actually measurable.
//
//   Final score = round(earned / attainable * 100).
//   null when: website is null AND there's no crawl run (nothing at all to
//   measure), OR `pending` is true (the compute hasn't finished within the
//   deadline - a timeout is not a measurement and must never be scored).
//
//   Each discovery flag is `boolean | null`: null means UNKNOWN (the probe
//   timed out, hit a 429, or errored - see fetchDiscovery in
//   server/lib/crawlerAccess.ts), NOT "confirmed absent". An unmeasured file
//   is EXCLUDED from both earned and attainable - same rescale pattern as
//   the never-crawled case above - so a site with 2 confirmed-present files
//   and 3 unknown ones scores identically to a site with only those same 2
//   files ever probed, not as "3 missing".
// ---------------------------------------------------------------------------
const DISCOVERY_WEIGHTS = { robotsTxt: 10, sitemapXml: 15, llmsTxt: 10 } as const;

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

// ---------------------------------------------------------------------------
// Per-page severity for the Site Health detail page - SAME rules as the
// issue aggregate in the SQL above (GET /api/dashboard/site-health/:brandId),
// just evaluated in JS over individual rows instead of a grouped count.
// Keep these two in sync; a page landing in "high" here must land in the
// same bucket the aggregate counted it in.
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

export function setupDashboardRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/dashboard/hero/:brandId
  // ==========================================================================
  app.get(
    "/api/dashboard/hero/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });
        const totalChecks = rankings.length;
        const cited = toCitedArr(rankings);
        const citedChecks = cited.length;
        // Average authority across cited rows (rows with authority_score set).
        const authScores = cited
          .map((r) => r.authorityScore)
          .filter((s): s is number => typeof s === "number");
        // null (not 0) when NO cited row carries an authority score, so the
        // scorer treats authority as UNMEASURED and drops its 30-pt weight
        // instead of capping a perfect brand at 70.
        const avgAuthorityScore =
          authScores.length > 0 ? authScores.reduce((a, b) => a + b, 0) / authScores.length : null;

        // Average rank across cited rows - lower is better.
        const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
        const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

        // Canonical visibility score (server/lib/visibilityMetrics.ts) -
        // the single definition now shared by /geo-analytics, /rankings
        // and /entity-strength, so the number is identical across screens.
        // This call is byte-for-byte the prior hero formula (unit-tested).
        const visibilityScore = computeVisibilityScore(
          citedChecks,
          totalChecks,
          avgRank,
          avgAuthorityScore,
        );

        // Trend delta. The stored "visibility_score" series holds the run
        // CITATION RATE (see metricsSnapshot.ts - and weekly_catchup diffs it
        // as a rate too). So the delta MUST be rate-vs-rate: comparing the
        // composite visibilityScore against a stored rate produced a permanent
        // phantom trend (e.g. a flat brand always showing "+15"). The headline
        // number stays the composite; the arrow honestly tracks rate change.
        const history = await storage.getMetricsHistory(brand.id, "visibility_score", 90);
        let visibilityDelta = 0;
        if (history.length >= 2) {
          const prior = Number(history[history.length - 2].metricValue);
          const currentRate = citationRatePct(citedChecks, totalChecks);
          if (!Number.isNaN(prior)) visibilityDelta = currentRate - prior;
        }

        // The hero exposes only metrics we can actually compute. The former
        // missed-visits / revenue-impact / category-query / industry-average
        // fields were removed entirely: they need category-query volume and
        // per-industry benchmark data we don't have, and shipping null/
        // placeholder fields just invited fabricated numbers downstream.
        res.json({
          success: true,
          data: {
            visibilityScore,
            visibilityDelta,
            citedChecks,
            totalChecks,
            citationRate: citationRatePct(citedChecks, totalChecks),
            lastScanAt: lastScanAt(rankings),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load dashboard hero");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/rankings/:brandId
  // ==========================================================================
  app.get(
    "/api/dashboard/rankings/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });

        // Group rows by canonical platform label (case-insensitive match).
        // Only the exact platform names the citation runner writes are honored
        // - no legacy aliases. Platforms not in CORE_PLATFORMS are ignored
        // so deprecated/unsupported engines don't leak into the dashboard.
        const canon = new Map<string, string>();
        for (const p of CORE_PLATFORMS) canon.set(p.toLowerCase(), p);

        const byPlatform = new Map<string, GeoRanking[]>();
        for (const r of rankings) {
          const label = canon.get(r.aiPlatform.toLowerCase());
          if (!label) continue; // skip platforms outside the tracked set
          const arr = byPlatform.get(label) ?? [];
          arr.push(r);
          byPlatform.set(label, arr);
        }

        const platforms = CORE_PLATFORMS.map((label) => {
          const rows = byPlatform.get(label) ?? [];
          // Skip platforms that have no data at all - no empty cards.
          if (rows.length === 0) return null;

          const cited = rows.filter((r) => r.isCited === 1);
          const citedCount = cited.length;
          const totalCount = rows.length;
          const ranks = cited.map((r) => r.rank).filter((r): r is number => typeof r === "number");
          const avgRank =
            ranks.length > 0 ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;

          // Canonical 0..100 score - same scale as the hero and
          // /api/geo-analytics's platformBreakdown (one number, one
          // meaning across every screen that shows a per-platform score;
          // this used to be divided by 10 here only, which made Overview
          // and Report disagree for the same platform). Authority is null
          // (not 0) when NO cited row carries a score, so the scorer
          // drops its weight instead of capping - same as the hero.
          const authScores = cited
            .map((r) => r.authorityScore)
            .filter((s): s is number => typeof s === "number");
          const avgAuth =
            authScores.length > 0
              ? authScores.reduce((a, b) => a + b, 0) / authScores.length
              : null;
          const score = computeVisibilityScore(citedCount, totalCount, avgRank ?? 0, avgAuth);

          const strengthLabel: "Weak" | "Moderate" | "Strong" =
            score >= 70 ? "Strong" : score >= 40 ? "Moderate" : "Weak";

          // Snippet preference: show a cited response if this platform has any
          // cited rows, otherwise fall back to the most recent non-cited response.
          // Callers render it green (cited) or red (not cited) via the
          // isCitedSnippet flag. The verbatim-responses card filters these
          // client-side so non-cited snippets never reach "What AI Says".
          const pickLatest = (arr: GeoRanking[]) =>
            [...arr]
              .filter((r) => r.citationContext)
              .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
          const citedSnippetRow = pickLatest(cited);
          const fallbackSnippetRow = citedSnippetRow ?? pickLatest(rows);
          const snippetRow = fallbackSnippetRow ?? null;
          const rawBody = snippetRow ? extractResponseBody(snippetRow.citationContext) : null;
          const latestSnippet = rawBody ? rawBody.slice(0, 600) : null;
          const latestSnippetPrompt = snippetRow?.prompt ?? null;
          const isCitedSnippet = citedSnippetRow ? true : false;

          return {
            aiPlatform: label,
            isLive: true,
            rank: avgRank,
            citedCount,
            totalCount,
            visibilityScore: score,
            strengthLabel,
            latestSnippet,
            latestSnippetPrompt,
            isCitedSnippet,
          };
        }).filter((p): p is NonNullable<typeof p> => p !== null);

        res.json({ success: true, data: { platforms } });
      } catch (error) {
        sendError(res, error, "Failed to load platform rankings");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/cited-urls/:brandId
  //
  // Flat list of every URL an AI engine cited, drawn from the already-stored
  // geo_rankings.cited_urls[] array (with citing_outlet_url as a fallback when
  // the array is empty but the row is cited). Powers the Citations table on the
  // Monitor Overview + Reports so users can see exactly which pages show up,
  // without drilling into individual prompt responses. Read-only, no new schema.
  // ==========================================================================
  app.get(
    "/api/dashboard/cited-urls/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { rankings } = await loadRankingsContext(brand.id, { since: parseSinceQuery(req) });

        // One entry per (platform, prompt, url). Dedupe identical URLs that
        // recur across runs, keeping the most recent citedAt.
        const seen = new Map<
          string,
          { platform: string; prompt: string; url: string; citedAt: Date }
        >();
        for (const r of toCitedArr(rankings)) {
          // `citingOutletUrl` ONLY - the matcher-derived source that actually
          // referenced the brand.
          //
          // This used to prefer `citedUrls`, which the schema defines as
          // "list of all URLs the LLM cited in its response" - every link in
          // the answer, most of which have nothing to do with the brand. On
          // the Apple brand that turned 117 attributed sources into 962 raw
          // URLs (226 after dedupe), so "cited URLs" counted the whole
          // bibliography of every answer we appeared in and "Top sources"
          // ranked outlets that never mentioned the brand at all.
          //
          // A cited ranking with no citingOutletUrl contributes nothing: the
          // response cited us but we could not attribute it to a source, and
          // listing its unrelated links would be a guess.
          const urls = r.citingOutletUrl ? [r.citingOutletUrl] : [];
          for (const rawUrl of urls) {
            const url = (rawUrl ?? "").trim();
            if (!url) continue;
            const key = `${r.aiPlatform}|${r.prompt}|${url}`;
            const existing = seen.get(key);
            if (!existing || r.checkedAt.getTime() > existing.citedAt.getTime()) {
              seen.set(key, {
                platform: r.aiPlatform,
                prompt: r.prompt,
                url,
                citedAt: r.checkedAt,
              });
            }
          }
        }

        // Cap the payload. After dedupe this is almost always well under the
        // limit, but a brand with a very large prompt portfolio could otherwise
        // return thousands of rows; the UI only shows the most recent anyway.
        const MAX_ITEMS = 500;
        const all = Array.from(seen.values()).sort(
          (a, b) => b.citedAt.getTime() - a.citedAt.getTime(),
        );
        const items = all.slice(0, MAX_ITEMS);

        res.json({
          success: true,
          data: { items, total: all.length, truncated: all.length > MAX_ITEMS },
        });
      } catch (error) {
        sendError(res, error, "Failed to load cited URLs");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/gap-matrix/:brandId
  // ==========================================================================
  app.get(
    "/api/dashboard/gap-matrix/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const { prompts, rankings } = await loadRankingsContext(brand.id, {
          since: parseSinceQuery(req),
        });

        // Category set = non-null distinct category values on tracked prompts.
        // Fall back to a generic "General" bucket when the prompt has none.
        const promptIdToCategory = new Map<string, string>();
        const categorySet = new Set<string>();
        for (const p of prompts as BrandPrompt[]) {
          const cat = p.category?.trim() || "General";
          promptIdToCategory.set(p.id, cat);
          categorySet.add(cat);
        }
        const categories = Array.from(categorySet).sort();

        // Brand row - mark "yes" for any category with >=1 cited ranking.
        const brandCellCounts: Record<string, { cited: number; total: number }> = {};
        for (const c of categories) brandCellCounts[c] = { cited: 0, total: 0 };
        for (const r of rankings) {
          const cat = r.brandPromptId
            ? (promptIdToCategory.get(r.brandPromptId) ?? "General")
            : "General";
          const bucket = brandCellCounts[cat];
          if (!bucket) continue;
          bucket.total += 1;
          if (r.isCited === 1) bucket.cited += 1;
        }
        const brandCells: Record<string, "yes" | "no" | "partial" | "unknown"> = {};
        for (const c of categories) {
          const b = brandCellCounts[c];
          brandCells[c] =
            b.total === 0
              ? "unknown"
              : b.cited === 0
                ? "no"
                : b.cited === b.total
                  ? "yes"
                  : "partial";
        }

        // Competitor rows from competitor_geo_rankings. Core only - the gap
        // matrix compares the brand against rival COMPANIES, and an
        // unfiltered read takes the first 6 rows of the citation-mined pool,
        // which is mostly product names and publishers.
        const competitors = (await storage.getCompetitors(brand.id, {
          tier: "core",
        })) as Competitor[];
        const topCompetitors = competitors.slice(0, 6);

        const competitorRows = await Promise.all(
          topCompetitors.map(async (comp) => {
            const cgr = await storage
              .getCompetitorGeoRankings(comp.id, { since: new Date(Date.now() - 30 * 86400000) })
              .catch(() => [] as Awaited<ReturnType<typeof storage.getCompetitorGeoRankings>>);
            const cellCounts: Record<string, { cited: number; total: number }> = {};
            for (const c of categories) cellCounts[c] = { cited: 0, total: 0 };
            for (const r of cgr) {
              const cat = (r.brandPromptId && promptIdToCategory.get(r.brandPromptId)) || "General";
              const bucket = cellCounts[cat];
              if (!bucket) continue;
              bucket.total += 1;
              if (r.isCited === 1) bucket.cited += 1;
            }
            const cells: Record<string, "yes" | "no" | "partial" | "unknown"> = {};
            const cellDiffs: Record<string, number> = {};
            let totalMentions = 0;
            let gapCount = 0;
            // Gap threshold - only call a category a "gap" when the competitor
            // has at least this many more citations than the brand. Prevents
            // "competitor cited once, brand cited zero" from registering as
            // dominance. Tune per-product as the citation volume grows.
            const GAP_THRESHOLD = 2;
            for (const c of categories) {
              const b = cellCounts[c];
              const state =
                b.total === 0
                  ? "unknown"
                  : b.cited === 0
                    ? "no"
                    : b.cited === b.total
                      ? "yes"
                      : "partial";
              cells[c] = state;
              totalMentions += b.cited;
              // Magnitude gap: competitor cited count minus brand cited count
              // in the same category. Positive = competitor ahead.
              const brandBucket = brandCellCounts[c] ?? { cited: 0, total: 0 };
              const diff = b.cited - brandBucket.cited;
              cellDiffs[c] = diff;
              if (diff >= GAP_THRESHOLD) gapCount += 1;
            }
            return {
              entityType: "competitor" as const,
              entityId: comp.id,
              name: comp.name,
              totalMentions,
              cells,
              cellDiffs,
              gapCount,
            };
          }),
        );

        // Brand row always last (highlighted in UI).
        const brandTotal = Object.values(brandCellCounts).reduce((a, b) => a + b.cited, 0);
        const rows = [
          ...competitorRows,
          {
            entityType: "brand" as const,
            entityId: brand.id,
            name: brand.name,
            totalMentions: brandTotal,
            cells: brandCells,
            gapCount: 0,
          },
        ];

        res.json({ success: true, data: { categories, rows } });
      } catch (error) {
        sendError(res, error, "Failed to load gap matrix");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/citation-trend/:brandId
  // Weekly citation-rate buckets over the last 8 weeks, computed directly
  // from geo_rankings. Replaces the old metrics_history-powered "Score
  // History" chart which depended on snapshots that are rarely populated.
  // ==========================================================================
  app.get(
    "/api/dashboard/citation-trend/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const WEEKS = 8;
        const since = new Date(Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000);
        const prompts = await storage.getBrandPromptsByBrandId(brand.id);
        const promptIds = prompts.map((p) => p.id);
        const rankings =
          promptIds.length > 0
            ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since)
            : [];

        // Monday-anchored weeks, labelled by the week's start date.
        const weekStartOf = (d: Date) => {
          const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          const day = dt.getUTCDay(); // 0=Sun..6=Sat
          const diff = (day + 6) % 7; // days since Monday
          dt.setUTCDate(dt.getUTCDate() - diff);
          return dt;
        };

        type Bucket = { cited: number; total: number };
        const buckets = new Map<string, Bucket>();
        // Seed all 8 weeks so empty weeks still render as zero-height bars.
        const nowWeek = weekStartOf(new Date());
        for (let i = WEEKS - 1; i >= 0; i--) {
          const d = new Date(nowWeek);
          d.setUTCDate(d.getUTCDate() - i * 7);
          buckets.set(d.toISOString().slice(0, 10), { cited: 0, total: 0 });
        }
        for (const r of rankings) {
          const key = weekStartOf(r.checkedAt).toISOString().slice(0, 10);
          const b = buckets.get(key);
          if (!b) continue;
          b.total += 1;
          if (r.isCited === 1) b.cited += 1;
        }

        const series = Array.from(buckets.entries()).map(([weekStart, b]) => ({
          weekStart,
          cited: b.cited,
          total: b.total,
          citationRate: b.total > 0 ? Math.round((b.cited / b.total) * 100) : 0,
        }));

        res.json({ success: true, data: { weeks: series } });
      } catch (error) {
        sendError(res, error, "Failed to load citation trend");
      }
    }),
  );

  // ==========================================================================
  // GET /api/brands/:brandId/recommendations
  // Phase 4: deterministic "do this next" rules engine. Loads brand state
  // via parallel storage queries, calls the pure engine in
  // server/lib/recommendationsEngine.ts, and returns up to 5 prioritised
  // recommendations. Sub-200ms target - no LLM call, just count queries.
  // ==========================================================================
  app.get(
    "/api/brands/:brandId/recommendations",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const user = requireUser(req);
        const brandId = brand.id;

        // Parallel-load all the count/state queries the engine needs.
        // 2026-05-28: replaced getLastGeoSignalRunAt (timestamp-only)
        // with getLastGeoSignalSummary (timestamp + overall score) so
        // the engine can fork the Signals rec on staleness vs result
        // quality. One query instead of two.
        const [
          articles,
          prompts,
          citationRuns,
          competitors,
          communityPosts,
          faqItems,
          visibilityRows,
          lastSignalsSummary,
        ] = await Promise.all([
          storage.getArticlesByUserIdWithStatus(user.id, { brandId, limit: 100, offset: 0 }),
          storage.getBrandPromptsByBrandId(brandId),
          storage.getCitationRunsByBrandId(brandId, 100),
          storage.getCompetitors(brandId),
          storage.getCommunityPosts(brandId),
          storage.getFaqItems(brandId),
          storage.getVisibilityProgress(brandId),
          storage.getLastGeoSignalSummary(brandId),
        ]);

        // Citation rate from the most recent COMPLETED run. Null if no runs
        // have completed yet. citation_runs orders newest-first per the
        // storage method's contract.
        const latestCompletedRun = citationRuns.find(
          (r) => r.status === "completed" || r.status === "succeeded",
        );
        const citationRate =
          latestCompletedRun && (latestCompletedRun.totalChecks ?? 0) > 0
            ? (latestCompletedRun.totalCited ?? 0) / (latestCompletedRun.totalChecks ?? 1)
            : null;

        const state: RecommendationState = {
          brand,
          articleCount: articles.length,
          promptCount: prompts.length,
          citationRunCount: citationRuns.length,
          citationRate,
          lastSignalsScanAt: lastSignalsSummary?.ranAt ?? null,
          lastSignalsScore: lastSignalsSummary?.overallScore ?? null,
          visibilityChecklistCompleted: visibilityRows.length,
          visibilityChecklistTotal: VISIBILITY_CHECKLIST_TOTAL,
          competitorCount: competitors.length,
          communityPostCount: communityPosts.length,
          faqCount: faqItems.length,
        };

        const recommendations = getRecommendations(state);
        res.json({ success: true, data: recommendations });
      } catch (error) {
        sendError(res, error, "Failed to load recommendations");
      }
    }),
  );

  // ==========================================================================
  // GET /api/brands/:brandId/alerts
  // Phase 8: run-change alerts persisted by server/lib/runChangeAlerts.ts at
  // the end of each citation run. Powers the Command Center "What changed"
  // widget so the alert rows are a live surface, not write-only data.
  // ==========================================================================
  app.get(
    "/api/brands/:brandId/alerts",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const limitRaw = Number((req.query.limit as string) ?? 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;
        const alerts = await storage.getAlertHistory(brand.id, limit);
        res.json({ success: true, data: alerts });
      } catch (error) {
        sendError(res, error, "Failed to load alerts");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId
  // Robots.txt-based AI crawler access score + latest fact-scrape run stats.
  // Robots.txt evaluation is cached in-module per brandId (6h TTL) so this
  // never hits the network on every dashboard load. Deliberately NOT behind
  // aiLimitMiddleware - it doesn't call any LLM and shouldn't consume quota.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

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

        res.json({
          success: true,
          data: {
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
              lastCrawlAt: latestRun
                ? (latestRun.completedAt ?? latestRun.startedAt).toISOString()
                : null,
            },
            issues,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load site health");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId/pages
  // Per-page rows of the LATEST completed scrape run, for the Site Health
  // detail page's issue lists. Read-only, no LLM, capped at 200 rows.
  // Empty array (never 404/500) when the brand has no crawl run yet.
  // ==========================================================================
  app.get(
    "/api/dashboard/site-health/:brandId/pages",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const latestRun = await storage.getLatestCompletedScrapeRun(brand.id).catch(() => null);
        if (!latestRun) {
          return res.json({ success: true, data: { runId: null, pages: [] } });
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
        }));

        res.json({ success: true, data: { runId: latestRun.id, pages } });
      } catch (error) {
        sendError(res, error, "Failed to load site health pages");
      }
    }),
  );

  // ==========================================================================
  // GET /api/dashboard/site-health/:brandId/content-findings
  // Per-page CONTENT findings (meta tags, OG tags, heading structure,
  // readability, structured answer formats, FAQ content, content density).
  // These require re-fetching each page's HTML (excerpt is never persisted -
  // brand_fact_scrape_pages.excerpt is a dead column), so this is a SIBLING
  // endpoint, never inlined into the hot /site-health path or its 4s
  // deadline. Cached per brand with a 6h TTL + in-flight coalescing, same
  // shape as getSiteHealthCached above, so concurrent dashboard loads don't
  // each re-fetch the brand's whole page set.
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

  app.get(
    "/api/dashboard/site-health/:brandId/content-findings",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        const latestRun = await storage.getLatestCompletedScrapeRun(brand.id).catch(() => null);
        if (!latestRun) {
          return res.json({ success: true, data: { findings: [] } });
        }

        const MAX_ROWS = 50;
        const rows = await db
          .select({ url: brandFactScrapePages.url })
          .from(brandFactScrapePages)
          .where(sql`${brandFactScrapePages.runId} = ${latestRun.id}`)
          .limit(MAX_ROWS);
        const urls = rows.map((r) => r.url).filter((u): u is string => !!u);

        const { findings } = await getContentFindingsCached(brand.id, urls);
        res.json({ success: true, data: { findings } });
      } catch (error) {
        sendError(res, error, "Failed to load site health content findings");
      }
    }),
  );

  // ==========================================================================
  // Brand perception scoring - five axes (trust/quality/value/market/
  // innovation) judged from what AI models actually said about the brand
  // (server/lib/perceptionScorer.ts). Runs are persisted so the dashboard
  // reads the newest one instead of paying an LLM call on every render.
  // ==========================================================================

  // Drizzle returns `numeric` columns as strings, so trust/quality/value/
  // market/innovation/overall arrive as e.g. "66.6" - convert to number
  // before serialising so the JSON contract stays numeric. Null stays
  // null (never NaN, never 0).
  function numericOrNull(v: string | number | null): number | null {
    if (v === null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function serializePerceptionRun(row: typeof brandPerceptionRuns.$inferSelect) {
    return {
      trust: numericOrNull(row.trust),
      quality: numericOrNull(row.quality),
      value: numericOrNull(row.value),
      market: numericOrNull(row.market),
      innovation: numericOrNull(row.innovation),
      overall: numericOrNull(row.overall),
      praised: row.praised,
      questioned: row.questioned,
      evidenceCount: row.evidenceCount,
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // GET /api/dashboard/perception/:brandId - read only, no LLM, cheap.
  app.get(
    "/api/dashboard/perception/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        // Single query: last up-to-7 runs, newest first. Feeds both the
        // "latest" card (row 0) and the sparkline "history" (reversed to
        // oldest-first below) - no second round-trip / N+1.
        const recentRuns = await db
          .select({
            overall: brandPerceptionRuns.overall,
            createdAt: brandPerceptionRuns.createdAt,
          })
          .from(brandPerceptionRuns)
          .where(eq(brandPerceptionRuns.brandId, brand.id))
          .orderBy(desc(brandPerceptionRuns.createdAt))
          .limit(7);

        const [latest] = await db
          .select()
          .from(brandPerceptionRuns)
          .where(eq(brandPerceptionRuns.brandId, brand.id))
          .orderBy(desc(brandPerceptionRuns.createdAt))
          .limit(1);

        // Oldest first; nulls excluded; newest run's own overall is last.
        const history = recentRuns
          .map((r) => numericOrNull(r.overall))
          .filter((v): v is number => v !== null)
          .reverse();

        res.json({
          success: true,
          data: latest ? { ...serializePerceptionRun(latest), history } : null,
        });
      } catch (error) {
        sendError(res, error, "Failed to load brand perception");
      }
    }),
  );

  // POST /api/dashboard/perception/:brandId/run - computes and persists one
  // run. Behind aiLimitMiddleware because it calls an LLM (unlike the
  // read-only GET above and unlike site-health).
  app.post(
    "/api/dashboard/perception/:brandId/run",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const brand = await requireOwnedBrand(req);
        if (!brand) return res.status(404).json({ success: false, error: "Brand not found" });

        // COST SAFEGUARD. Every run spends an LLM call over up to 40 excerpts,
        // and nothing about the underlying evidence changes minute to minute -
        // it only moves when a new citation check lands. `aiLimitMiddleware`
        // caps a USER's overall AI usage, but says nothing about one brand
        // being re-scored in a loop, so this adds a per-brand cooldown.
        //
        // Enforced from brand_perception_runs.created_at rather than an
        // in-memory counter: that survives a restart and is correct across
        // multiple instances, where a per-process Map would let N instances
        // each allow a run.
        const [recent] = await db
          .select({ createdAt: brandPerceptionRuns.createdAt })
          .from(brandPerceptionRuns)
          .where(eq(brandPerceptionRuns.brandId, brand.id))
          .orderBy(desc(brandPerceptionRuns.createdAt))
          .limit(1);

        if (recent?.createdAt) {
          const ageMs = Date.now() - new Date(recent.createdAt).getTime();
          if (ageMs < PERCEPTION_COOLDOWN_MS) {
            const retryAfterSec = Math.ceil((PERCEPTION_COOLDOWN_MS - ageMs) / 1000);
            res.setHeader("Retry-After", String(retryAfterSec));
            return res.status(429).json({
              success: false,
              error: "Perception was scored recently. Try again later.",
              retryAfterSeconds: retryAfterSec,
            });
          }
        }

        // The scoring itself lives in lib/perceptionRun.ts so the weekly
        // brand-activation job runs the exact same code. It always writes a
        // row now, even with zero evidence (every axis NULL) - that record
        // is how the UI tells "scored, nothing to say yet" apart from
        // "never scored".
        const inserted = await runPerceptionScoring(brand);
        res.json({ success: true, data: serializePerceptionRun(inserted) });
      } catch (error) {
        sendError(res, error, "Failed to run brand perception scoring");
      }
    }),
  );
}
