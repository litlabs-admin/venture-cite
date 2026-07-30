// Fetches a bounded set of a brand's crawled URLs and aggregates the
// per-page content analysis (server/lib/pageContentAnalysis.ts) into
// SiteHealthFinding rows. Page HTML is never persisted (brand_fact_scrape_
// pages.excerpt is a dead column, never written), so this re-fetches.
//
// Never throws: a failed page is skipped, not fatal. Bounded concurrency
// mirrors the worker-pool pattern already used by runFullScrape.ts
// (PER_PAGE_CONCURRENCY workers pulling from a shared queue) — there is
// no p-limit dependency in this repo, and this module does not add one.

import { safeFetchTextWithLockedIp } from "./ssrf";
import { PAGE_FETCH_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";
import { analysePageHtml, type PageContentFlags } from "./pageContentAnalysis";
import { logger } from "./logger";
import type { SiteHealthFinding } from "@shared/siteHealthFindings";

const MAX_URLS = 50;
const CONCURRENCY = 3;
const MAX_BYTES = 1_000_000; // 1MB

async function fetchAndAnalyse(url: string): Promise<PageContentFlags | null> {
  try {
    const { status, text } = await safeFetchTextWithLockedIp(url, {
      maxBytes: MAX_BYTES,
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
      truncateOnLimit: true,
    });
    if (status < 200 || status >= 300 || !text) return null;
    return analysePageHtml(text, url);
  } catch (err) {
    logger.warn({ err, url }, "siteHealthContentScan: page fetch/analyse failed, skipping");
    return null;
  }
}

/** Bounded-concurrency fetch of every URL, mirroring runFullScrape.ts's
 *  queue+worker-pool pattern. Never throws. */
async function scanAll(urls: string[]): Promise<PageContentFlags[]> {
  const queue = [...urls];
  const results: PageContentFlags[] = [];

  const next = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      const flags = await fetchAndAnalyse(url);
      if (flags) results.push(flags);
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(next());
  await Promise.all(workers);
  return results;
}

interface FindingDef {
  id: string;
  category: SiteHealthFinding["category"];
  title: string;
  description: string;
  test: (f: PageContentFlags) => boolean;
}

// All 0-pt / advisory: these are per-page CONTENT observations that carry
// no weight in scoreSiteHealth() — they must never be summed into a fake
// score. See shared/siteHealthFindings.ts's own advisory findings
// (mcp.json/security.txt) for the same treatment.
const FINDING_DEFS: FindingDef[] = [
  {
    id: "content-meta-tags",
    category: "CONTENT STRUCTURE",
    title: "Fix Meta Tags",
    description:
      "Some pages are missing a <title>/meta description, or have one that's too short or too long to be a useful snippet for an AI system to quote.",
    test: (f) =>
      f.metaTitleMissing ||
      f.metaTitleTooShort ||
      f.metaTitleTooLong ||
      f.metaDescriptionMissing ||
      f.metaDescriptionTooShort ||
      f.metaDescriptionTooLong,
  },
  {
    id: "content-open-graph",
    category: "CONTENT STRUCTURE",
    title: "Add Open Graph Tags",
    description:
      "Pages without og:title or og:image give AI systems and social previews nothing structured to summarise the page with.",
    test: (f) => f.ogMissing,
  },
  {
    id: "content-heading-structure",
    category: "CONTENT STRUCTURE",
    title: "Fix Heading Structure",
    description:
      "Pages with no H1, multiple H1s, or a skipped heading level (e.g. H2 straight to H4) make it harder for an AI system to infer the page's outline.",
    test: (f) => f.headingNoH1 || f.headingMultipleH1 || f.headingSkippedLevel,
  },
  {
    id: "content-readability",
    category: "CONTENT QUALITY",
    title: "Improve Readability",
    description:
      "Some pages score below 50 on the Flesch Reading Ease scale — dense, hard-to-parse prose that's less likely to be lifted cleanly into an AI answer.",
    test: (f) => f.hardToRead,
  },
  {
    id: "content-answer-formats",
    category: "CONTENT STRUCTURE",
    title: "Add Structured Answer Formats",
    description:
      "No FAQPage, HowTo, or QAPage JSON-LD found — these schema types are what AI systems most directly lift into direct-answer results.",
    test: (f) => f.jsonLdAnswerFormatMissing,
  },
  {
    id: "content-faq",
    category: "CONTENT QUALITY",
    title: "Add FAQ Content",
    description:
      "No visible question-and-answer pattern detected (definition lists, Q:/A: markers, or question-style headings) — a common source of AI-citable snippets.",
    test: (f) => f.faqContentMissing,
  },
  {
    id: "content-density",
    category: "CONTENT QUALITY",
    title: "Improve Content Density",
    description:
      "Little visible text was found in the raw HTML we fetched (under 300 characters, or a very low text-to-markup ratio). This describes the raw fetch only — it does not mean the content is JavaScript-rendered; see docs/optimize-perception-reference.md.",
    test: (f) => f.thinContent || f.lowTextRatio,
  },
];

export async function scanPagesForFindings(urls: string[]): Promise<SiteHealthFinding[]> {
  const bounded = urls.slice(0, MAX_URLS);
  if (bounded.length === 0) return [];

  const perPage = await scanAll(bounded);
  if (perPage.length === 0) return [];

  const findings: SiteHealthFinding[] = [];
  for (const def of FINDING_DEFS) {
    const affectedUrls = perPage.filter((f) => def.test(f)).map((f) => f.url);
    if (affectedUrls.length === 0) continue;
    findings.push({
      id: def.id,
      category: def.category,
      title: def.title,
      description: def.description,
      points: 0,
      affectedUrls,
      advisory: true,
    });
  }
  return findings;
}
