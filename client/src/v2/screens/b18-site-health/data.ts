// Live: score, crawl timestamps, crawler counts, history, and page-derived findings.
// Pending backend work: check groups beyond crawl access, evidence boundaries, activity, and schedule.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import { computeSiteHealthFindings } from "@shared/siteHealthFindings";
import type { Board18Data, Board18HealthCheck, Board18PriorityIssue, Board18Value } from "./Screen";

const isoDate = z.string().datetime({ offset: true });

const siteHealthSchema = z.object({
  website: z.string().nullable(),
  checkedAt: isoDate,
  score: z.number().int().nullable(),
  pending: z.boolean(),
  platform: z.string().nullable(),
  discovery: z.object({
    robotsTxt: z.boolean().nullable(),
    sitemapXml: z.boolean().nullable(),
    llmsTxt: z.boolean().nullable(),
    mcpJson: z.boolean().nullable(),
    securityTxt: z.boolean().nullable(),
  }),
  crawlers: z.object({
    total: z.number().int(),
    allowed: z.number().int(),
    blocked: z.number().int(),
    unknown: z.number().int(),
    blockedCrawlers: z.array(z.string()),
  }),
  crawl: z.object({
    pagesCrawled: z.number().int().nullable(),
    pagesFailed: z.number().int().nullable(),
    sitemapUrlCount: z.number().int().nullable(),
    lastCrawlAt: isoDate.nullable(),
  }),
  issues: z.object({
    critical: z.number().int(),
    high: z.number().int(),
    medium: z.number().int(),
    low: z.number().int(),
    total: z.number().int(),
  }),
});

const historySchema = z.object({
  scans: z.array(
    z.object({
      id: z.string(),
      runId: z.string().nullable(),
      score: z.number().int().nullable(),
      pagesCrawled: z.number().int().nullable(),
      pagesFailed: z.number().int().nullable(),
      issues: z.object({
        critical: z.number().int(),
        high: z.number().int(),
        medium: z.number().int(),
        low: z.number().int(),
      }),
      createdAt: isoDate,
    }),
  ),
});

const pagesSchema = z.object({
  runId: z.string().nullable(),
  pages: z.array(
    z.object({
      url: z.string(),
      statusCode: z.number().int().nullable(),
      status: z.string(),
      errorKind: z.string().nullable(),
      contentType: z.string().nullable(),
      factCount: z.number().int(),
      severity: z.enum(["critical", "high", "medium", "low", "ok"]),
      findingIds: z.array(z.string()),
    }),
  ),
});

const siteHealthEnvelope = z.object({ success: z.literal(true), data: siteHealthSchema });
const historyEnvelope = z.object({ success: z.literal(true), data: historySchema });
const pagesEnvelope = z.object({ success: z.literal(true), data: pagesSchema });

type SiteHealthResponse = z.infer<typeof siteHealthSchema>;
type HistoryResponse = z.infer<typeof historySchema>;
type PagesResponse = z.infer<typeof pagesSchema>;

function notMeasured<T>(reason: string): Board18Value<T> {
  return { kind: "not-measured", reason };
}

function measured<T>(value: T): Board18Value<T> {
  return { kind: "measured", value };
}

async function readSiteHealth(brandId: string): Promise<SiteHealthResponse> {
  const response = await apiRequest(
    "GET",
    `/api/dashboard/site-health/${encodeURIComponent(brandId)}`,
  );
  const parsed = siteHealthEnvelope.safeParse(await response.json());
  if (!parsed.success) throw new Error("The site-health response has an invalid shape.");
  return parsed.data.data;
}

async function readHistory(brandId: string): Promise<HistoryResponse> {
  const response = await apiRequest(
    "GET",
    `/api/dashboard/site-health/${encodeURIComponent(brandId)}/history`,
  );
  const parsed = historyEnvelope.safeParse(await response.json());
  if (!parsed.success) throw new Error("The site-health history response has an invalid shape.");
  return parsed.data.data;
}

async function readPages(brandId: string): Promise<PagesResponse> {
  const response = await apiRequest(
    "GET",
    `/api/dashboard/site-health/${encodeURIComponent(brandId)}/pages`,
  );
  const parsed = pagesEnvelope.safeParse(await response.json());
  if (!parsed.success) throw new Error("The site-health pages response has an invalid shape.");
  return parsed.data.data;
}

function makeUnavailableCheck(
  name: string,
  question: string,
  icon: Board18HealthCheck["icon"],
): Board18HealthCheck {
  const reason = "The site-health API does not return this check group yet.";
  return {
    name,
    question,
    icon,
    verified: notMeasured(reason),
    needsReview: notMeasured(reason),
    userConfirmation: notMeasured(reason),
  };
}

function mapHealthChecks(health: SiteHealthResponse): Board18HealthCheck[] {
  const unavailable = [
    makeUnavailableCheck("Indexability", "Which pages are discoverable and canonical?", "srch"),
    makeUnavailableCheck(
      "Structured data",
      "Is your content marked up for AI understanding?",
      "diag",
    ),
    makeUnavailableCheck(
      "Answer-ready content",
      "Do key pages directly answer common questions?",
      "doc",
    ),
    makeUnavailableCheck(
      "Entity clarity",
      "Is your brand, product and leadership information clear?",
      "scale",
    ),
  ];
  const crawlerReason = "The crawler response did not include a fixed engine set.";
  const crawlAccess: Board18HealthCheck = {
    name: "Crawl access",
    question: "Can AI crawlers access your important pages?",
    icon: "doc",
    verified:
      health.crawlers.total > 0 ? measured(health.crawlers.allowed) : notMeasured(crawlerReason),
    needsReview:
      health.crawlers.total > 0 ? measured(health.crawlers.blocked) : notMeasured(crawlerReason),
    userConfirmation:
      health.crawlers.total > 0 ? measured(health.crawlers.unknown) : notMeasured(crawlerReason),
  };
  return [crawlAccess, ...unavailable];
}

function mapHistory(
  history: HistoryResponse,
): Board18Value<readonly { date: string; score: number }[]> {
  const points = [...history.scans]
    .reverse()
    .flatMap((scan) => (scan.score === null ? [] : [{ date: scan.createdAt, score: scan.score }]));
  return points.length > 0
    ? measured(points)
    : notMeasured("No scored site-health scans exist yet.");
}

function mapPriorityIssue(health: SiteHealthResponse, pages: PagesResponse): Board18PriorityIssue {
  const findings = computeSiteHealthFindings(
    {
      crawl: {
        pagesCrawled: health.crawl.pagesCrawled,
        pagesFailed: health.crawl.pagesFailed,
      },
      discovery: health.discovery,
      crawlers: {
        total: health.crawlers.total,
        allowed: health.crawlers.allowed,
        blocked: health.crawlers.blocked,
        blockedCrawlers: health.crawlers.blockedCrawlers,
      },
    },
    pages.pages,
  );
  const finding = findings[0];
  if (!finding) {
    const reason = "The site-health API did not return a priority finding.";
    return {
      title: notMeasured(reason),
      description: notMeasured(reason),
      evidencePath: notMeasured(reason),
      businessImpact: notMeasured("The site-health API does not return business impact yet."),
    };
  }
  return {
    title: measured(finding.title),
    description: measured(finding.description),
    evidencePath:
      finding.affectedUrls[0] !== undefined
        ? measured(finding.affectedUrls[0])
        : notMeasured("The priority finding has no affected URL."),
    businessImpact: notMeasured("The site-health API does not return business impact yet."),
  };
}

function mapData(
  brandId: string,
  brandName: string | undefined,
  health: SiteHealthResponse,
  history: HistoryResponse,
  pages: PagesResponse,
): Board18Data {
  const score = health.score;
  if (score === null) throw new Error("A ready site-health response must include a score.");
  const status = score < 80 ? "Needs attention" : "Healthy";
  const lastVerifiedAt = health.crawl.lastCrawlAt;
  if (lastVerifiedAt === null)
    throw new Error("A ready site-health response must include a crawl.");

  return {
    navigation: { brandId, mode: "expert" },
    brand: {
      name:
        brandName !== undefined
          ? measured(brandName)
          : notMeasured("The selected brand name is unavailable."),
    },
    header: { lastUpdatedAt: measured(health.checkedAt) },
    health: {
      score: measured(score),
      status: measured(status),
      lastVerifiedAt: measured(lastVerifiedAt),
      history: mapHistory(history),
      range: "30D",
    },
    priorityIssue: mapPriorityIssue(health, pages),
    healthChecks: mapHealthChecks(health),
    evidence: {
      observed: notMeasured("The current API does not return an observed evidence count."),
      unknown: notMeasured("The current API does not return an unknown evidence count."),
      nextCheckAt: notMeasured("The current API does not return a next-check date."),
    },
    crawlSchedule: notMeasured("The current API does not return a crawl schedule."),
    verificationActivity: notMeasured(
      "The current API does not return verification activity rows.",
    ),
    resources: [
      {
        title: "Site health guide for AI visibility",
        href: "https://developers.google.com/search/docs/crawling-indexing/overview",
        icon: "learn",
      },
      {
        title: "AI crawler reference (GPTBot, ClaudeBot, etc.)",
        href: "https://platform.openai.com/docs/bots",
        icon: "globe",
      },
      {
        title: "Robots.txt best practices",
        href: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
        icon: "shield",
      },
      {
        title: "Structured data for AI answers",
        href: "https://developers.google.com/search/docs/appearance/structured-data/intro",
        icon: "diag",
      },
    ],
  };
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function useBoard18Data(): V2LiveResult<Board18Data> {
  const { selectedBrand, selectedBrandId } = useBrandSelection();
  const brandId = selectedBrandId;
  const healthQuery = useQuery({
    queryKey: ["v2", "diagnostics", "site-health", brandId, "dashboard"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readSiteHealth(brandId),
  });
  const historyQuery = useQuery({
    queryKey: ["v2", "diagnostics", "site-health", brandId, "history"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readHistory(brandId),
  });
  const pagesQuery = useQuery({
    queryKey: ["v2", "diagnostics", "site-health", brandId, "pages"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readPages(brandId),
  });

  if (!brandId) {
    return { state: { kind: "not-measured", reason: "Select a brand to measure site health." } };
  }
  if (healthQuery.isPending || historyQuery.isPending || pagesQuery.isPending) {
    return { state: { kind: "loading" } };
  }
  if (healthQuery.isError || historyQuery.isError || pagesQuery.isError) {
    return { state: { kind: "error", message: "Unable to load site-health data." } };
  }

  const health = healthQuery.data;
  const history = historyQuery.data;
  const pages = pagesQuery.data;
  if (!health || !history || !pages) {
    return { state: { kind: "not-measured", reason: "Site-health data is not available yet." } };
  }
  if (health.pending || health.score === null || health.crawl.lastCrawlAt === null) {
    return {
      state: {
        kind: "not-measured",
        reason: "A completed crawl is required before site health can be measured.",
      },
    };
  }

  const data = mapData(brandId, selectedBrand?.name, health, history, pages);
  const checkedAt = new Date(health.checkedAt).getTime();
  if (Number.isFinite(checkedAt) && Date.now() - checkedAt > STALE_AFTER_MS) {
    return {
      state: {
        kind: "stale",
        reason: "Site-health data is older than the six-hour cache window.",
        asOf: health.checkedAt,
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
