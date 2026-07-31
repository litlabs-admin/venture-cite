// HTTP-level integration tests for two dashboard endpoints that previously
// had ZERO endpoint coverage (only their pure helpers were tested):
//   GET  /api/dashboard/site-health/:brandId
//   GET  /api/dashboard/perception/:brandId
//   POST /api/dashboard/perception/:brandId/run
//
// Mock pattern copied from tests/unit/dashboardRecommendationInputs.test.ts:
// mount the real `setupDashboardRoutes(app)` against an express app, mock
// storage/db/routesShared/logger so nothing touches a live DATABASE_URL or
// OPENAI_API_KEY. Additionally mocks crawlerAccess / platformDetect /
// perceptionScorer, which do real network / LLM work.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const USER_ID = "user-1";
let brandCounter = 0;
function freshBrandId(): string {
  brandCounter += 1;
  return `brand-${brandCounter}`;
}

// ---------------------------------------------------------------------------
// storage mock
// ---------------------------------------------------------------------------
const storageStubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getLatestCompletedScrapeRun: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: storageStubs.getBrandById,
    getLatestCompletedScrapeRun: storageStubs.getLatestCompletedScrapeRun,
  },
}));

// ---------------------------------------------------------------------------
// db mock - chainable query-builder stand-in. Each call to db.select()/
// db.insert() pops the next queued result off a FIFO so tests can script
// exactly what each sequential query in a handler returns.
// ---------------------------------------------------------------------------
const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  insertQueue: [] as unknown[],
  selectMock: vi.fn(),
  insertMock: vi.fn(),
}));

dbState.selectMock.mockImplementation(() => {
  const result = dbState.selectQueue.shift() ?? [];
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
  };
  return chain;
});

dbState.insertMock.mockImplementation(() => {
  const result = dbState.insertQueue.shift() ?? [];
  const chain: any = {
    values: () => chain,
    returning: () => Promise.resolve(result),
  };
  return chain;
});

vi.mock("../../server/db", () => ({
  db: { select: dbState.selectMock, insert: dbState.insertMock },
  pool: {},
}));

function queueSelect(result: unknown) {
  dbState.selectQueue.push(result);
}
function queueInsert(result: unknown) {
  dbState.insertQueue.push(result);
}

// ---------------------------------------------------------------------------
// crawlerAccess / platformDetect / perceptionScorer mocks - these do real
// network / LLM work in production and must never run in tests.
// ---------------------------------------------------------------------------
const crawlerStubs = vi.hoisted(() => ({
  fetchRobots: vi.fn(),
  fetchDiscovery: vi.fn(),
  parseRobotsTxt: vi.fn(),
  evaluateCrawlers: vi.fn(),
}));

const FAKE_AI_CRAWLERS = vi.hoisted(() =>
  Array.from({ length: 18 }, (_, i) => ({
    platform: `Bot${i}`,
    userAgent: `Bot${i}Agent`,
  })),
);

vi.mock("../../server/lib/crawlerAccess", () => ({
  fetchRobots: crawlerStubs.fetchRobots,
  fetchDiscovery: crawlerStubs.fetchDiscovery,
  parseRobotsTxt: crawlerStubs.parseRobotsTxt,
  evaluateCrawlers: crawlerStubs.evaluateCrawlers,
  AI_CRAWLERS: FAKE_AI_CRAWLERS,
}));

const platformStubs = vi.hoisted(() => ({
  detectPlatform: vi.fn(),
}));

vi.mock("../../server/lib/platformDetect", () => ({
  detectPlatform: platformStubs.detectPlatform,
}));

const perceptionStubs = vi.hoisted(() => ({
  gatherEvidence: vi.fn(),
  scoreBrandPerception: vi.fn(),
}));

vi.mock("../../server/lib/perceptionScorer", () => ({
  gatherEvidence: perceptionStubs.gatherEvidence,
  scoreBrandPerception: perceptionStubs.scoreBrandPerception,
}));

vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    sendError: (res: express.Response, _err: unknown, msg: string) => {
      res.status(500).json({ success: false, error: msg });
    },
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

const { setupDashboardRoutes, PERCEPTION_COOLDOWN_MS } =
  await import("../../server/routes/dashboard");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID };
    next();
  });
  setupDashboardRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: string,
  url: string,
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const req = {
      method,
      url,
      params: {},
      query: {},
      headers: { host: "localhost", "content-type": "application/json" },
      body: {},
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        resolve({ status: statusCode, body: payload, headers });
        return res;
      },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = String(value);
        return res;
      },
      end() {
        if (payload === null) resolve({ status: statusCode, body: null, headers });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve({ status: statusCode, body: payload, headers });
      });
    } catch (e) {
      reject(e);
    }
  });
}

const app = buildApp();

function makeBrand(
  overrides: Partial<{ id: string; userId: string; website: string | null }> = {},
) {
  return {
    id: overrides.id ?? freshBrandId(),
    userId: overrides.userId ?? USER_ID,
    name: "Acme",
    website: overrides.website === undefined ? "https://acme.example.com" : overrides.website,
  };
}

/** Sensible defaults so a site-health call degrades gracefully unless a test overrides. */
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
      status: i < 10 ? "allowed" : i < 15 ? "blocked" : "unknown",
    })),
  );
  platformStubs.detectPlatform.mockResolvedValue("Shopify");
  storageStubs.getLatestCompletedScrapeRun.mockResolvedValue(null);
}

beforeEach(() => {
  for (const fn of Object.values(storageStubs)) fn.mockReset();
  for (const fn of Object.values(crawlerStubs)) fn.mockReset();
  for (const fn of Object.values(platformStubs)) fn.mockReset();
  for (const fn of Object.values(perceptionStubs)) fn.mockReset();
  dbState.selectMock.mockClear();
  dbState.insertMock.mockClear();
  dbState.selectQueue.length = 0;
  dbState.insertQueue.length = 0;
  applySiteHealthDefaults();
});

// =============================================================================
// GET /api/dashboard/site-health/:brandId
// =============================================================================
describe("GET /api/dashboard/site-health/:brandId", () => {
  it("404s when the brand does not exist or belongs to another user", async () => {
    storageStubs.getBrandById.mockResolvedValue(null);
    const r1 = await call(app, "GET", `/api/dashboard/site-health/${freshBrandId()}`);
    expect(r1.status).toBe(404);
    expect(r1.body).toEqual({ success: false, error: "Brand not found" });

    storageStubs.getBrandById.mockResolvedValue(makeBrand({ userId: "someone-else" }));
    const r2 = await call(app, "GET", `/api/dashboard/site-health/${freshBrandId()}`);
    expect(r2.status).toBe(404);
    expect(r2.body).toEqual({ success: false, error: "Brand not found" });
  });

  it("returns 200 with the full contract shape on the happy path", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue({
      id: "run-1",
      pagesFetched: 8,
      pagesFailed: 2,
      completedAt: new Date("2026-07-01T00:00:00Z"),
      startedAt: new Date("2026-06-30T23:00:00Z"),
    });
    queueSelect([{ critical: 1, high: 2, medium: 3, low: 4 }]);

    const r = await call(app, "GET", `/api/dashboard/site-health/${brand.id}`);

    expect(r.status).toBe(200);
    const data = r.body.data;
    expect(data).toHaveProperty("website");
    expect(data).toHaveProperty("checkedAt");
    expect(data).toHaveProperty("score");
    expect(data.discovery).toEqual(
      expect.objectContaining({
        robotsTxt: expect.any(Boolean),
        sitemapXml: expect.any(Boolean),
        llmsTxt: expect.any(Boolean),
      }),
    );
    expect(data.crawlers).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        allowed: expect.any(Number),
        blocked: expect.any(Number),
        unknown: expect.any(Number),
        blockedCrawlers: expect.any(Array),
      }),
    );
    expect(data.crawl).toEqual(
      expect.objectContaining({
        pagesCrawled: expect.any(Number),
        pagesFailed: expect.any(Number),
        lastCrawlAt: expect.any(String),
      }),
    );
    expect(data).toHaveProperty("platform");
    expect(data.issues).toEqual({ critical: 1, high: 2, medium: 3, low: 4, total: 10 });
  });

  it("degrades to null score / null platform / zero counts (never 500) when website is null", async () => {
    const brand = makeBrand({ website: null });
    storageStubs.getBrandById.mockResolvedValue(brand);

    const r = await call(app, "GET", `/api/dashboard/site-health/${brand.id}`);

    expect(r.status).toBe(200);
    expect(r.body.data.website).toBeNull();
    expect(r.body.data.score).toBeNull();
    expect(r.body.data.platform).toBeNull();
    expect(r.body.data.crawlers).toEqual({
      total: 0,
      allowed: 0,
      blocked: 0,
      unknown: 0,
      blockedCrawlers: [],
    });
    // Network probes must not even be attempted for a brand with no website.
    expect(crawlerStubs.fetchRobots).not.toHaveBeenCalled();
  });

  it("never 500s when robots/discovery/platform detection all reject", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    crawlerStubs.fetchRobots.mockRejectedValue(new Error("network down"));
    crawlerStubs.fetchDiscovery.mockRejectedValue(new Error("network down"));
    platformStubs.detectPlatform.mockRejectedValue(new Error("network down"));

    const r = await call(app, "GET", `/api/dashboard/site-health/${brand.id}`);

    expect(r.status).toBe(200);
    // All FIVE discovery files the reference checks. mcp.json and
    // security.txt were added later; asserting the whole object (rather than
    // individual keys) is deliberate - it fails loudly if a file is added to
    // the probe but never surfaced in the response.
    //
    // Tri-state shape: a rejected probe is UNKNOWN (null), not "confirmed
    // absent" (false) - that conflation is exactly the bug this endpoint
    // used to have (a network failure reading the same as a real 404).
    expect(r.body.data.discovery).toEqual({
      robotsTxt: null,
      sitemapXml: null,
      llmsTxt: null,
      mcpJson: null,
      securityTxt: null,
    });
    expect(r.body.data.platform).toBeNull();
    expect(r.body.data.crawlers.total).toBe(0);
  });

  it("caches the robots computation: fetchRobots is called once across two sequential requests", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);

    const r1 = await call(app, "GET", `/api/dashboard/site-health/${brand.id}`);
    const r2 = await call(app, "GET", `/api/dashboard/site-health/${brand.id}`);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(crawlerStubs.fetchRobots).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cold-cache requests for the same brand: fetchRobots called once", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    // Introduce a delay so all 10 concurrent requests land while the first
    // compute is still in flight - this is what exercises the coalescing map.
    crawlerStubs.fetchRobots.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                origin: "https://acme.example.com",
                robotsTxtExists: true,
                content: "",
                fetchError: "",
              }),
            30,
          ),
        ),
    );

    const requests = Array.from({ length: 10 }, () =>
      call(app, "GET", `/api/dashboard/site-health/${brand.id}`),
    );
    const results = await Promise.all(requests);

    for (const r of results) expect(r.status).toBe(200);
    expect(crawlerStubs.fetchRobots).toHaveBeenCalledTimes(1);
  });

  it("surfaces the mocked db issue aggregate, with total === critical+high+medium+low", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    storageStubs.getLatestCompletedScrapeRun.mockResolvedValue({
      id: "run-2",
      pagesFetched: 5,
      pagesFailed: 1,
      completedAt: new Date("2026-07-01T00:00:00Z"),
      startedAt: new Date("2026-06-30T23:00:00Z"),
    });
    queueSelect([{ critical: 2, high: 3, medium: 5, low: 7 }]);

    const r = await call(app, "GET", `/api/dashboard/site-health/${brand.id}`);

    expect(r.status).toBe(200);
    expect(r.body.data.issues).toEqual({ critical: 2, high: 3, medium: 5, low: 7, total: 17 });
  });
});

// =============================================================================
// GET /api/dashboard/perception/:brandId
// =============================================================================
describe("GET /api/dashboard/perception/:brandId", () => {
  it("404s for a brand the user does not own", async () => {
    storageStubs.getBrandById.mockResolvedValue(makeBrand({ userId: "someone-else" }));

    const r = await call(app, "GET", `/api/dashboard/perception/${freshBrandId()}`);

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: "Brand not found" });
  });

  it("returns 200 with data: null when the brand has never been scored", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    queueSelect([]); // recentRuns
    queueSelect([]); // latest

    const r = await call(app, "GET", `/api/dashboard/perception/${brand.id}`);

    expect(r.status).toBe(200);
    expect(r.body.data).toBeNull();
  });

  it("converts numeric-string axes to numbers, preserving one decimal precision", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    queueSelect([{ overall: "66.6", createdAt: new Date("2026-07-01T00:00:00Z") }]); // recentRuns
    queueSelect([
      {
        trust: "66.6",
        quality: "70",
        value: "50.0",
        market: null,
        innovation: "80",
        overall: "66.6",
        praised: ["fast support"],
        questioned: ["pricing"],
        evidenceCount: 5,
        model: "gpt-4o",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]); // latest

    const r = await call(app, "GET", `/api/dashboard/perception/${brand.id}`);

    expect(r.status).toBe(200);
    expect(typeof r.body.data.trust).toBe("number");
    expect(r.body.data.trust).toBe(66.6);
    expect(r.body.data.trust).not.toBe(67);
    // A null axis stays null, never 0 or NaN.
    expect(r.body.data.market).toBeNull();
  });

  it("returns history as an array of numbers, oldest-first", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    // Simulate the real query's ordering: newest-first as it comes back
    // from `orderBy(desc(createdAt))`.
    queueSelect([
      { overall: "50", createdAt: new Date("2026-07-03T00:00:00Z") },
      { overall: "40", createdAt: new Date("2026-07-02T00:00:00Z") },
      { overall: "30", createdAt: new Date("2026-07-01T00:00:00Z") },
    ]); // recentRuns
    queueSelect([
      {
        trust: "10",
        quality: "10",
        value: "10",
        market: "10",
        innovation: "10",
        overall: "50",
        praised: [],
        questioned: [],
        evidenceCount: 1,
        model: "gpt-4o",
        createdAt: new Date("2026-07-03T00:00:00Z"),
      },
    ]); // latest

    const r = await call(app, "GET", `/api/dashboard/perception/${brand.id}`);

    expect(r.status).toBe(200);
    expect(r.body.data.history).toEqual([30, 40, 50]);
    for (const v of r.body.data.history) expect(typeof v).toBe("number");
  });
});

// =============================================================================
// POST /api/dashboard/perception/:brandId/run
// =============================================================================
describe("POST /api/dashboard/perception/:brandId/run", () => {
  it("404s for an unowned brand", async () => {
    storageStubs.getBrandById.mockResolvedValue(makeBrand({ userId: "someone-else" }));

    const r = await call(app, "POST", `/api/dashboard/perception/${freshBrandId()}/run`);

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: "Brand not found" });
    expect(perceptionStubs.scoreBrandPerception).not.toHaveBeenCalled();
  });

  it("returns data: null and never scores/inserts when there is no evidence", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    queueSelect([]); // cooldown check - no prior run
    queueSelect([]); // geoRankings rows
    perceptionStubs.gatherEvidence.mockReturnValue([]);

    const r = await call(app, "POST", `/api/dashboard/perception/${brand.id}/run`);

    expect(r.status).toBe(200);
    expect(r.body.data).toBeNull();
    expect(perceptionStubs.scoreBrandPerception).not.toHaveBeenCalled();
    expect(dbState.insertMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the newest run is inside the cooldown window", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    const recentCreatedAt = new Date(Date.now() - 1_000); // 1s ago, well inside cooldown
    queueSelect([{ createdAt: recentCreatedAt }]); // cooldown check

    const r = await call(app, "POST", `/api/dashboard/perception/${brand.id}/run`);

    expect(r.status).toBe(429);
    expect(r.headers["retry-after"]).toBeDefined();
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
    expect(r.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.body.success).toBe(false);
    expect(perceptionStubs.scoreBrandPerception).toHaveBeenCalledTimes(0);
  });

  it("proceeds, scores once, inserts once, and returns the serialized run when past the cooldown", async () => {
    const brand = makeBrand();
    storageStubs.getBrandById.mockResolvedValue(brand);
    const oldCreatedAt = new Date(Date.now() - (PERCEPTION_COOLDOWN_MS + 60_000)); // just past cooldown
    queueSelect([{ createdAt: oldCreatedAt }]); // cooldown check
    queueSelect([
      { citationContext: "...||| RAW_RESPONSE |||\nGreat product", aiPlatform: "OpenAI" },
    ]); // geoRankings rows

    perceptionStubs.gatherEvidence.mockReturnValue([{ text: "Great product", platform: "OpenAI" }]);
    perceptionStubs.scoreBrandPerception.mockResolvedValue({
      trust: 66.6,
      quality: 70,
      value: 50,
      market: null,
      innovation: 80,
      overall: 64.2,
      praised: ["support"],
      questioned: ["price"],
      evidenceCount: 1,
      model: "gpt-4o",
    });
    const insertedCreatedAt = new Date("2026-07-29T12:00:00Z");
    queueInsert([
      {
        trust: "66.6",
        quality: "70",
        value: "50",
        market: null,
        innovation: "80",
        overall: "64.2",
        praised: ["support"],
        questioned: ["price"],
        evidenceCount: 1,
        model: "gpt-4o",
        createdAt: insertedCreatedAt,
      },
    ]);

    const r = await call(app, "POST", `/api/dashboard/perception/${brand.id}/run`);

    expect(r.status).toBe(200);
    expect(perceptionStubs.scoreBrandPerception).toHaveBeenCalledTimes(1);
    expect(dbState.insertMock).toHaveBeenCalledTimes(1);
    expect(r.body.data).toEqual({
      trust: 66.6,
      quality: 70,
      value: 50,
      market: null,
      innovation: 80,
      overall: 64.2,
      praised: ["support"],
      questioned: ["price"],
      evidenceCount: 1,
      model: "gpt-4o",
      createdAt: insertedCreatedAt.toISOString(),
    });
  });
});
