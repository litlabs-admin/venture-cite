// Records ONE site_health_scan_history row per COMPLETED fact-scrape run.
//
// Called from the single place a scrape run's terminal "success" status is
// written (server/lib/factAgent/v2/runFullScrape.ts, right after the
// write-back that already runs there) - never from a dashboard page load.
// A cache hit on GET /api/dashboard/site-health/:brandId must never create
// a history point; only a real, newly-completed scan does.
//
// Reads the discovery/crawler snapshot from the SAME durable mirror
// (system_state key `site_health:${brandId}`) that
// server/routes/dashboard.ts already writes on every fresh discovery
// compute, rather than re-running the robots/sitemap/llms.txt probes here -
// this file has no business re-fetching a customer's site, it just needs
// whatever the dashboard already measured most recently.
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { brandFactScrapePages, brandFactScrapeRuns, siteHealthScanHistory } from "@shared/schema";
import { scoreSiteHealth } from "./scoreSiteHealth";
import { logger } from "./logger";

interface SiteHealthSnapshot {
  discovery: { robotsTxt: boolean | null; sitemapXml: boolean | null; llmsTxt: boolean | null };
  total: number;
  allowed: number;
  blocked: number;
  unknown: number;
}

/** Best-effort, never throws - a failed history write must not affect the
 *  scrape run it's recording, which has already terminated by the time
 *  this runs. */
export async function recordSiteHealthScanHistory(brandId: string, runId: string): Promise<void> {
  try {
    const [run] = await db
      .select({
        pagesFetched: brandFactScrapeRuns.pagesFetched,
        pagesFailed: brandFactScrapeRuns.pagesFailed,
      })
      .from(brandFactScrapeRuns)
      .where(eq(brandFactScrapeRuns.id, runId));
    if (!run) return; // run row vanished or id was bogus - nothing to record

    const snapshot = (await storage
      .getSystemState(`site_health:${brandId}`)
      .catch(() => null)) as SiteHealthSnapshot | null;
    const discovery = snapshot?.discovery ?? { robotsTxt: null, sitemapXml: null, llmsTxt: null };
    const crawlers = snapshot
      ? {
          total: snapshot.total,
          allowed: snapshot.allowed,
          blocked: snapshot.blocked,
          unknown: snapshot.unknown,
        }
      : { total: 0, allowed: 0, blocked: 0, unknown: 0 };

    // Same grouped aggregate as GET /api/dashboard/site-health/:brandId -
    // duplicated rather than shared because it is a small, self-contained
    // query and importing the route handler's internals would be the wrong
    // direction of dependency.
    let issues = { critical: 0, high: 0, medium: 0, low: 0 };
    try {
      const [row] = await db
        .select({
          critical: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 500 or (${brandFactScrapePages.statusCode} is null and (${brandFactScrapePages.status} = 'failed' or ${brandFactScrapePages.errorKind} is not null)))::int`,
          high: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 400 and ${brandFactScrapePages.statusCode} < 500)::int`,
          medium: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 200 and ${brandFactScrapePages.statusCode} < 300 and ${brandFactScrapePages.factCount} = 0 and (${brandFactScrapePages.contentType} is null or ${brandFactScrapePages.contentType} ilike '%html%'))::int`,
          low: sql<number>`count(*) filter (where ${brandFactScrapePages.statusCode} >= 200 and ${brandFactScrapePages.statusCode} < 300 and ${brandFactScrapePages.contentType} is not null and ${brandFactScrapePages.contentType} not ilike '%html%')::int`,
        })
        .from(brandFactScrapePages)
        .where(sql`${brandFactScrapePages.runId} = ${runId}`);
      if (row) issues = row;
    } catch (err) {
      logger.warn({ err, brandId, runId }, "site health history: issues aggregate failed");
    }

    const score = scoreSiteHealth({
      website: null, // only affects the !website && !crawl short-circuit; crawl is present below
      discovery,
      crawlers: { total: crawlers.total, allowed: crawlers.allowed },
      crawl: { pagesFetched: run.pagesFetched ?? 0, pagesFailed: run.pagesFailed ?? 0 },
    });

    await db.insert(siteHealthScanHistory).values({
      brandId,
      runId,
      score,
      pagesCrawled: run.pagesFetched,
      pagesFailed: run.pagesFailed,
      issuesCritical: issues.critical,
      issuesHigh: issues.high,
      issuesMedium: issues.medium,
      issuesLow: issues.low,
      discovery,
      crawlers,
    });
  } catch (err) {
    logger.warn({ err, brandId, runId }, "site health history: record failed (non-fatal)");
  }
}

/** Newest-first scan history for the History tab, capped. */
export async function listSiteHealthScanHistory(brandId: string, limit = 50) {
  return db
    .select()
    .from(siteHealthScanHistory)
    .where(eq(siteHealthScanHistory.brandId, brandId))
    .orderBy(sql`${siteHealthScanHistory.createdAt} desc`)
    .limit(limit);
}
