// readiness.ts — robots.txt / llms.txt / sitemap / JSON-LD checks for the
// anonymous onboarding flow. No LLM. Spec:
// docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
//
// Reuses the existing robots.txt parser and evaluator
// (server/lib/crawlerAccess.ts, itself extracted from
// server/routes/analytics.ts and already exercised by
// server/services/crawlerPermissions.ts / check_crawler_access), and the
// existing JSON-LD @type extractor (server/lib/jsonLdExtract.ts, already
// used by server/services/schemaAudit.ts) instead of writing new ones.
import { fetchRobots, parseRobotsTxt, evaluateCrawlers } from "../lib/crawlerAccess";
import { safeFetchText } from "../lib/ssrf";
import { parseJsonLdFromHtml } from "../lib/jsonLdExtract";
import { CRAWLER_BOTS } from "@shared/onboarding/session";
import type { Readiness } from "@shared/onboarding/session";
import type { ReadReadiness } from "./contracts";

// Short timeouts: readiness runs while the user is still on the Who/Brand
// steps and must never be the thing that makes the session feel stuck.
const DISCOVERY_TIMEOUT_MS = 6_000;
const DISCOVERY_MAX_BYTES = 256 * 1024;

async function checkLlmsTxt(origin: string): Promise<boolean> {
  try {
    const { status, text } = await safeFetchText(`${origin}/llms.txt`, {
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      maxBytes: DISCOVERY_MAX_BYTES,
    });
    return status >= 200 && status < 300 && text.trim().length > 0;
  } catch {
    return false;
  }
}

async function checkSitemapXml(origin: string): Promise<boolean> {
  try {
    const { status } = await safeFetchText(`${origin}/sitemap.xml`, {
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      maxBytes: DISCOVERY_MAX_BYTES,
    });
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
}

/** True when robots.txt itself declares a `Sitemap:` directive (RFC 9309 §2.6). */
function hasSitemapDirective(robotsTxtContent: string): boolean {
  return /^\s*sitemap:/im.test(robotsTxtContent);
}

export const readReadiness: ReadReadiness = async ({ domain, html }) => {
  const origin = `https://${domain}`;

  const [robotsSettled, llmsTxtSettled, sitemapXmlSettled] = await Promise.allSettled([
    fetchRobots(origin),
    checkLlmsTxt(origin),
    checkSitemapXml(origin),
  ]);

  // A 404 robots.txt means every crawler is allowed (fetchRobots reports it as
  // robotsTxtExists=false with no fetchError). A robots.txt we could not read
  // (network error, SSRF block, 5xx) tells us nothing, so throw: the pipeline
  // turns that into a step_error and the UI says "unavailable" instead of
  // claiming the site is open to crawlers.
  if (robotsSettled.status === "rejected" || robotsSettled.value.fetchError) {
    const reason =
      robotsSettled.status === "rejected"
        ? String(robotsSettled.reason)
        : robotsSettled.value.fetchError;
    throw new Error(`Could not read robots.txt for ${domain}: ${reason}`);
  }
  const robots = robotsSettled.value;
  const blocks = robots.robotsTxtExists ? parseRobotsTxt(robots.content) : [];
  const evaluated = evaluateCrawlers({
    blocks,
    robotsTxtExists: robots.robotsTxtExists,
    fetchError: "",
  });
  const byAgent = new Map(evaluated.map((c) => [c.agent, c]));
  const crawlers: Readiness["crawlers"] = CRAWLER_BOTS.map((bot) => ({
    bot,
    allowed: byAgent.get(bot)?.status === "allowed",
  }));

  const sitemapInRobots = robots.robotsTxtExists ? hasSitemapDirective(robots.content) : false;
  const sitemapXml = sitemapXmlSettled.status === "fulfilled" ? sitemapXmlSettled.value : false;
  const llmsTxt = llmsTxtSettled.status === "fulfilled" ? llmsTxtSettled.value : false;

  const schemaTypes = Array.from(parseJsonLdFromHtml(html).keys());

  return {
    crawlers,
    llmsTxt,
    sitemap: sitemapInRobots || sitemapXml,
    schemaTypes,
  };
};
