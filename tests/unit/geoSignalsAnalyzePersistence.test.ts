// Plan 5 Task 2: POST /api/geo-signals/analyze persistence.
//
// Verifies that the analyze handler persists a `geo_signal_runs` row only
// when the caller passes a brandId they actually own, and 404s (not 403)
// on cross-tenant per anti-enumeration policy. Ad-hoc usage without a
// brandId stays 200 with no insert (back-compat for the un-scoped flow).
//
// Mock pattern mirrors tests/unit/mentionsRoutes.test.ts: stub storage,
// ownership helpers, and side-effecty modules; mount the route on a bare
// Express app; drive it through (app as any).handle.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const ARTICLE_ID = "44444444-4444-4444-8444-444444444444";

const stubs = vi.hoisted(() => ({
  requireBrand: vi.fn(),
  recordGeoSignalRun: vi.fn(),
  computeSignals: vi.fn(),
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/ownership")>(
    "../../server/lib/ownership",
  );
  return {
    ...actual,
    requireBrand: stubs.requireBrand,
    // Keep requireUser real — it just reads req.user.
  };
});

const getArticleByIdStub = vi.hoisted(() => vi.fn());

vi.mock("../../server/storage", () => ({
  storage: {
    recordGeoSignalRun: stubs.recordGeoSignalRun,
    getArticleById: getArticleByIdStub,
  },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Keep routesShared light — the route only uses asyncHandler + MAX_CONTENT_LENGTH
// + openai (unused on this path). Mock the openai construction so it doesn't
// require an API key at import time.
vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    MAX_CONTENT_LENGTH: 40_000,
    openai: { chat: { completions: { create: vi.fn() } } },
    aiLimitMiddleware: (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => next(),
    sendError: vi.fn(),
    safeParseJson: vi.fn(),
  };
});

// computeSignals lives in the route file itself — intercept by stubbing the
// scoring deps it uses so it returns deterministic numbers without OpenAI.
vi.mock("../../server/lib/geoSignalsScoring", () => ({
  embedBatch: vi.fn(async () => [
    [1, 0, 0],
    [1, 0, 0],
  ]),
  cosineSimilarity: vi.fn(() => 1),
  stopwordFilterQuery: vi.fn((q: string) => q.split(/\s+/).filter(Boolean)),
  detectBylines: vi.fn(() => []),
  detectCitations: vi.fn(() => []),
  detectFactualClaims: vi.fn(() => []),
  countContentWords: vi.fn(() => 1200),
  detectHeadings: vi.fn(() => ({ hasHierarchy: true, h2: ["## What?"], h3: [] })),
  STOPWORDS: new Set<string>(),
}));

// db — analyze handler itself doesn't touch db directly, but importing the
// route file pulls in the module graph (schema, etc). Stub minimally.
vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
  pool: {},
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

const { setupGeoSignalsRoutes } = await import("../../server/routes/geoSignals");
const { OwnershipError } = await import("../../server/lib/ownership");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupGeoSignalsRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body: body ?? {},
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
        resolve({ status: statusCode, body: payload });
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        if (payload === null) resolve({ status: statusCode, body: null });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve({ status: statusCode, body: payload });
      });
    } catch (e) {
      reject(e);
    }
  });
}

const app = buildApp();

beforeEach(() => {
  stubs.requireBrand.mockReset();
  stubs.recordGeoSignalRun.mockReset();
  stubs.captureAndFlush.mockReset();
  getArticleByIdStub.mockReset();
  getArticleByIdStub.mockResolvedValue({ id: ARTICLE_ID, brandId: BRAND_ID });
  stubs.requireBrand.mockResolvedValue({ id: BRAND_ID, userId: "user-1", name: "Acme" });
  stubs.recordGeoSignalRun.mockResolvedValue({
    id: "run-1",
    brandId: BRAND_ID,
    articleId: ARTICLE_ID,
    ranAt: new Date(),
    overallScore: 80,
    payload: {},
  });
});

describe("POST /api/geo-signals/analyze persistence", () => {
  it("inserts a geo_signal_runs row when brandId is provided and user owns the brand", async () => {
    const r = await call(app, "POST", "/api/geo-signals/analyze", {
      content: "Some article content with enough words to score.",
      targetQuery: "geo signals",
      brandId: BRAND_ID,
      articleId: ARTICLE_ID,
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true });
    expect(stubs.requireBrand).toHaveBeenCalledWith(BRAND_ID, "user-1");
    expect(stubs.recordGeoSignalRun).toHaveBeenCalledTimes(1);
    const payload = stubs.recordGeoSignalRun.mock.calls[0][0];
    expect(payload).toMatchObject({
      brandId: BRAND_ID,
      articleId: ARTICLE_ID,
    });
    expect(typeof payload.overallScore === "number" || payload.overallScore === null).toBe(true);
    expect(payload.payload).toBeDefined();
    expect(payload.payload).toHaveProperty("signals");
    expect(payload.payload).toHaveProperty("wordCount");
  });

  it("does NOT insert when brandId is omitted (back-compat for ad-hoc usage)", async () => {
    const r = await call(app, "POST", "/api/geo-signals/analyze", {
      content: "Some article content with enough words to score.",
      targetQuery: "geo signals",
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true });
    expect(stubs.requireBrand).not.toHaveBeenCalled();
    expect(stubs.recordGeoSignalRun).not.toHaveBeenCalled();
  });

  it("returns 404 with no insert when brandId belongs to a different user", async () => {
    stubs.requireBrand.mockRejectedValueOnce(new OwnershipError(404, "Brand not found"));

    const r = await call(app, "POST", "/api/geo-signals/analyze", {
      content: "Some article content with enough words to score.",
      targetQuery: "geo signals",
      brandId: "foreign-brand-id",
    });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ success: false });
    expect(stubs.recordGeoSignalRun).not.toHaveBeenCalled();
  });
});
