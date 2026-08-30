// Direct, no-HTTP tests for server/services/dashboardSiteHealth.ts.
//
// HTTP-level behavior for GET /api/dashboard/site-health/:brandId is already
// covered by tests/unit/dashboardSiteHealthPerception.test.ts; this file
// proves the extracted service functions themselves - including the ones
// with no route-level coverage at all (finding-status CRUD, content
// findings, pageSeverity, warmSiteHealth) - can be called directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getLatestCompletedScrapeRun: vi.fn(),
  getSystemState: vi.fn(),
  setSystemState: vi.fn(),
}));
vi.mock("../../server/storage", () => ({ storage: { ...storageStubs } }));

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  deleteMock: vi.fn(),
}));

function makeChain(result: unknown) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
  };
  return chain;
}
dbState.selectMock.mockImplementation(() => makeChain(dbState.selectQueue.shift() ?? []));
dbState.insertMock.mockImplementation(() => makeChain(undefined));
dbState.deleteMock.mockImplementation(() => makeChain(undefined));

vi.mock("../../server/db", () => ({
  db: { select: dbState.selectMock, insert: dbState.insertMock, delete: dbState.deleteMock },
  pool: {},
}));

function queueSelect(result: unknown) {
  dbState.selectQueue.push(result);
}

const crawlerStubs = vi.hoisted(() => ({
  fetchRobots: vi.fn(),
  fetchDiscovery: vi.fn(),
  parseRobotsTxt: vi.fn(),
  evaluateCrawlers: vi.fn(),
}));
const FAKE_AI_CRAWLERS = vi.hoisted(() =>
  Array.from({ length: 10 }, (_, i) => ({ platform: `Bot${i}`, userAgent: `Bot${i}Agent` })),
);
vi.mock("../../server/lib/crawlerAccess", () => ({
  fetchRobots: crawlerStubs.fetchRobots,
  fetchDiscovery: crawlerStubs.fetchDiscovery,
  parseRobotsTxt: crawlerStubs.parseRobotsTxt,
  evaluateCrawlers: crawlerStubs.evaluateCrawlers,
  AI_CRAWLERS: FAKE_AI_CRAWLERS,
}));

const platformStubs = vi.hoisted(() => ({ detectPlatform: vi.fn() }));
vi.mock("../../server/lib/platformDetect", () => ({
  detectPlatform: platformStubs.detectPlatform,
}));

vi.mock("../../server/lib/ssrf", () => ({
  safeFetchText: vi.fn(async () => ({ status: 404, text: "" })),
}));

const contentScanStubs = vi.hoisted(() => ({ scanPagesForFindings: vi.fn() }));
vi.mock("../../server/lib/siteHealthContentScan", () => ({
  scanPagesForFindings: contentScanStubs.scanPagesForFindings,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  pageSeverity,
  getSiteHealthDashboard,
  getSiteHealthPages,
  getSiteHealthFindingStatuses,
  setSiteHealthFindingStatus,
  clearSiteHealthFindingStatus,
  getSiteHealthContentFindings,
  warmSiteHealth,
} = await import("../../server/services/dashboardSiteHealth");

// getSiteHealthDashboard caches per brandId (6h TTL, in-module Map) - a
// fixed id across tests would let an earlier test's cached entry leak into
// a later one, so every test that exercises the cache gets its own brand id.
let brandCounter = 0;
function makeBrand(overrides: Partial<{ website: string | null }> = {}) {
  brandCounter += 1;
  return {
    id: `brand-${brandCounter}`,
    userId: "user-1",
    name: "Acme",
    website: overrides.website === undefined ? "https://acme.example.com" : overrides.website,
  } as any;
}
const BRAND = makeBrand();

function applySiteHealthDefaults() {
  crawlerStubs.fetchRobots.mockResolvedValue({
    origin: "https://acme.example.com",
    robotsTxtExists: true,
    content: "",
    fetchError: "",
  });
  crawlerStubs.fetchDiscovery.mockResolvedValue({
    robotsTxt: true,
    sitemapXml: true,
    llmsTxt: false,
  });
  crawlerStubs.parseRobotsTxt.mockReturnValue([]);
  crawlerStubs.evaluateCrawlers.mockReturnValue(
    FAKE_AI_CRAWLERS.map((c, i) => ({
      platform: c.platform,
      status: i < 8 ? "allowed" : "blocked",
    })),
  );
  platformStubs.detectPlatform.mockResolvedValue("Shopify");
  storageStubs.getLatestCompletedScrapeRun.mockResolvedValue(null);
}

beforeEach(() => {
  for (const fn of Object.values(storageStubs)) fn.mockReset();
  for (const fn of Object.values(crawlerStubs)) fn.mockReset();
  for (const fn of Object.values(platformStubs)) fn.mockReset();
  for (const fn of Object.values(contentScanStubs)) fn.mockReset();
  dbState.selectMock.mockClear();
  dbState.insertMock.mockClear();
  dbState.deleteMock.mockClear();
  dbState.selectQueue.length = 0;
  applySiteHealthDefaults();
});

describe("pageSeverity", () => {
  it("classifies a 5xx or unstatused-failed page as critical", () => {
    expect(
      pageSeverity({
        statusCode: 503,
        status: "ok",
        errorKind: null,
        contentType: null,
        factCount: 0,
      }),
    ).toBe("critical");
    expect(
      pageSeverity({
        statusCode: null,
        status: "failed",
        errorKind: null,
        contentType: null,
        factCount: 0,
      }),
    ).toBe("critical");
  });

  it("classifies a 4xx page as high", () => {
    expect(
      pageSeverity({
        statusCode: 404,
        status: "ok",
        errorKind: null,
        contentType: "text/html",
        factCount: 0,
      }),
    ).toBe("high");
  });

  it("classifies a 2xx html page with zero facts as medium", () => {
    expect(
      pageSeverity({
        statusCode: 200,
        status: "ok",
        errorKind: null,
        contentType: "text/html",
        factCount: 0,
      }),
    ).toBe("medium");
  });

  it("classifies a 2xx non-html page as low, and a healthy page as ok", () => {
    expect(
      pageSeverity({
        statusCode: 200,
        status: "ok",
        errorKind: null,
        contentType: "application/pdf",
        factCount: 0,
      }),
    ).toBe("low");
    expect(
      pageSeverity({
        statusCode: 200,
        status: "ok",
        errorKind: null,
        contentType: "text/html",
        factCount: 3,
      }),
    ).toBe("ok");
  });
});

describe("getSiteHealthDashboard", () => {
  it("returns a full contract shape with a summed issue aggregate", async () => {
    const brand = makeBrand();
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue({
      id: "run-1",
      pagesFetched: 8,
      pagesFailed: 2,
      completedAt: new Date("2026-07-01T00:00:00Z"),
      startedAt: new Date("2026-06-30T23:00:00Z"),
    });
    queueSelect([{ critical: 1, high: 2, medium: 3, low: 4 }]);

    const data = await getSiteHealthDashboard(brand);

    expect(data.website).toBe("https://acme.example.com");
    expect(data.issues).toEqual({ critical: 1, high: 2, medium: 3, low: 4, total: 10 });
    expect(data.crawl.pagesCrawled).toBe(8);
    expect(data.pending).toBe(false);
  });

  it("degrades to null score / zero counts, never throwing, when there is no website", async () => {
    const data = await getSiteHealthDashboard(makeBrand({ website: null }));
    expect(data.website).toBeNull();
    expect(data.score).toBeNull();
    expect(crawlerStubs.fetchRobots).not.toHaveBeenCalled();
  });
});

describe("getSiteHealthPages", () => {
  it("returns an empty page list (never throws) when there is no completed run", async () => {
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue(null);
    const result = await getSiteHealthPages(BRAND.id);
    expect(result).toEqual({ runId: null, pages: [] });
  });

  it("attaches severity and findingIds to each returned page", async () => {
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue({ id: "run-9" });
    queueSelect([
      {
        url: "https://acme.example.com/a",
        statusCode: 200,
        status: "ok",
        errorKind: null,
        contentType: "text/html",
        factCount: 0,
      },
    ]);

    const result = await getSiteHealthPages(BRAND.id);

    expect(result.runId).toBe("run-9");
    expect(result.pages[0]).toMatchObject({
      url: "https://acme.example.com/a",
      severity: "medium",
    });
    expect(result.pages[0].findingIds).toBeInstanceOf(Array);
  });
});

describe("site health finding status CRUD", () => {
  it("reads finding-status rows scoped to the brand", async () => {
    queueSelect([
      { findingId: "f1", status: "fixed", updatedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const rows = await getSiteHealthFindingStatuses(BRAND.id);
    expect(rows).toEqual([
      { findingId: "f1", status: "fixed", updatedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
  });

  it("upserts a finding status without throwing", async () => {
    await expect(
      setSiteHealthFindingStatus(BRAND.id, "f1", "in_progress", "user-1"),
    ).resolves.toBeUndefined();
    expect(dbState.insertMock).toHaveBeenCalledTimes(1);
  });

  it("clears a finding status without throwing", async () => {
    await expect(clearSiteHealthFindingStatus(BRAND.id, "f1")).resolves.toBeUndefined();
    expect(dbState.deleteMock).toHaveBeenCalledTimes(1);
  });
});

describe("getSiteHealthContentFindings", () => {
  it("returns an empty findings list when there is no completed scrape run", async () => {
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue(null);
    const result = await getSiteHealthContentFindings(BRAND.id);
    expect(result).toEqual({ findings: [] });
    expect(contentScanStubs.scanPagesForFindings).not.toHaveBeenCalled();
  });

  it("scans the latest run's page urls and returns the findings", async () => {
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue({ id: "run-1" });
    queueSelect([{ url: "https://acme.example.com/a" }, { url: null }]);
    contentScanStubs.scanPagesForFindings.mockResolvedValue([
      { id: "missing-meta-description", pageUrl: "https://acme.example.com/a" },
    ]);

    const result = await getSiteHealthContentFindings(BRAND.id);

    expect(contentScanStubs.scanPagesForFindings).toHaveBeenCalledWith([
      "https://acme.example.com/a",
    ]);
    expect(result.findings).toHaveLength(1);
  });
});

describe("warmSiteHealth", () => {
  it("computes and persists a site health entry without throwing", async () => {
    await expect(warmSiteHealth(BRAND.id, BRAND.website)).resolves.toBeUndefined();
    expect(storageStubs.setSystemState).toHaveBeenCalledWith(
      `site_health:${BRAND.id}`,
      expect.objectContaining({ website: BRAND.website }),
    );
  });

  it("never throws even when the underlying compute rejects", async () => {
    crawlerStubs.fetchRobots.mockRejectedValue(new Error("network down"));
    crawlerStubs.fetchDiscovery.mockRejectedValue(new Error("network down"));
    platformStubs.detectPlatform.mockRejectedValue(new Error("network down"));
    await expect(warmSiteHealth(BRAND.id, BRAND.website)).resolves.toBeUndefined();
  });
});
