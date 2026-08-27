import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const BRAND_ID = "88888888-8888-4888-8888-888888888888";
const USER_ID = "user-1";

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getWeeklyCitationTrend: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    ...stubs,
    getArticlesByUserIdWithStatus: vi.fn(),
    getCitationRunsByBrandId: vi.fn(),
    getCompetitors: vi.fn(),
    getCommunityPosts: vi.fn(),
    getFaqItems: vi.fn(),
    getVisibilityProgress: vi.fn(),
    getLastGeoSignalSummary: vi.fn(),
    getMetricsHistory: vi.fn(),
    getCompetitorGeoRankings: vi.fn(),
  },
}));
vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    sendError: (res: express.Response, _error: unknown, message: string) => {
      res.status(500).json({ success: false, error: message });
    },
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

const { setupDashboardRoutes } = await import("../../server/routes/dashboard");

function call(url: string): Promise<{ status: number; body: any }> {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID };
    next();
  });
  setupDashboardRoutes(app);
  return new Promise((resolve, reject) => {
    const req = {
      method: "GET",
      url,
      params: {},
      query: {},
      headers: { host: "localhost" },
      body: {},
    } as unknown as express.Request;
    let statusCode = 200;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(body: any) {
        resolve({ status: statusCode, body });
        return res;
      },
      setHeader: () => res,
      end: () => resolve({ status: statusCode, body: null }),
      on: () => res,
    } as unknown as express.Response;
    (app as any).handle(req, res, (error: unknown) => (error ? reject(error) : undefined));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.getBrandById.mockResolvedValue({ id: BRAND_ID, userId: USER_ID, name: "Acme" });
  stubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "prompt-1" }]);
  stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/dashboard/citation-trend/:brandId", () => {
  it("keeps zero-filled weeks between aggregate rows", async () => {
    stubs.getWeeklyCitationTrend.mockResolvedValue([
      { weekStart: "2026-07-27", total: 3, cited: 1 },
      { weekStart: "2026-08-10", total: 2, cited: 2 },
      { weekStart: "2026-08-24", total: 1, cited: 0 },
    ]);

    const response = await call(`/api/dashboard/citation-trend/${BRAND_ID}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        weeks: [
          { weekStart: "2026-07-06", cited: 0, total: 0, citationRate: 0 },
          { weekStart: "2026-07-13", cited: 0, total: 0, citationRate: 0 },
          { weekStart: "2026-07-20", cited: 0, total: 0, citationRate: 0 },
          { weekStart: "2026-07-27", cited: 1, total: 3, citationRate: 33 },
          { weekStart: "2026-08-03", cited: 0, total: 0, citationRate: 0 },
          { weekStart: "2026-08-10", cited: 2, total: 2, citationRate: 100 },
          { weekStart: "2026-08-17", cited: 0, total: 0, citationRate: 0 },
          { weekStart: "2026-08-24", cited: 0, total: 1, citationRate: 0 },
        ],
      },
    });
  });
});
