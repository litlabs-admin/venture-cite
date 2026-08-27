import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const BRAND_ID = "88888888-8888-4888-8888-888888888888";
const USER_ID = "user-1";
const COMPETITORS = ["c1", "c2", "c3", "c4", "c5", "c6"];

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getCompetitors: vi.fn(),
  getCompetitorGeoRankings: vi.fn(),
  getCompetitorGeoRankingsForCompetitors: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    ...stubs,
    getArticlesByUserIdWithStatus: vi.fn(),
    getCitationRunsByBrandId: vi.fn(),
    getCommunityPosts: vi.fn(),
    getFaqItems: vi.fn(),
    getVisibilityProgress: vi.fn(),
    getLastGeoSignalSummary: vi.fn(),
    getMetricsHistory: vi.fn(),
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
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.getBrandById.mockResolvedValue({ id: BRAND_ID, userId: USER_ID, name: "Acme" });
  stubs.getBrandPromptsByBrandId.mockResolvedValue([
    { id: "prompt-growth", category: "Growth" },
    { id: "prompt-retention", category: "Retention" },
  ]);
  stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
    { brandPromptId: "prompt-growth", isCited: 1 },
    { brandPromptId: "prompt-growth", isCited: 0 },
  ]);
  stubs.getCompetitors.mockResolvedValue(
    COMPETITORS.map((id) => ({ id, name: `Competitor ${id}` })),
  );
  stubs.getCompetitorGeoRankings.mockResolvedValue([]);
});

describe("GET /api/dashboard/gap-matrix/:brandId", () => {
  it("keeps the matrix response while reading six competitors with one query", async () => {
    stubs.getCompetitorGeoRankingsForCompetitors.mockResolvedValue([
      { competitorId: "c1", brandPromptId: "prompt-growth", isCited: 1 },
      { competitorId: "c1", brandPromptId: "prompt-growth", isCited: 1 },
      { competitorId: "c1", brandPromptId: "prompt-retention", isCited: 1 },
      { competitorId: "c2", brandPromptId: "prompt-growth", isCited: 0 },
      { competitorId: "c2", brandPromptId: "prompt-retention", isCited: 1 },
      { competitorId: "c2", brandPromptId: "prompt-retention", isCited: 1 },
      { competitorId: "c4", brandPromptId: "prompt-growth", isCited: 1 },
      { competitorId: "c4", brandPromptId: "prompt-growth", isCited: 0 },
      { competitorId: "c4", brandPromptId: "prompt-retention", isCited: 0 },
    ]);

    const response = await call(`/api/dashboard/gap-matrix/${BRAND_ID}`);

    expect(stubs.getCompetitorGeoRankingsForCompetitors).toHaveBeenCalledTimes(1);
    expect(stubs.getCompetitorGeoRankings).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        categories: ["Growth", "Retention"],
        rows: [
          {
            entityType: "competitor",
            entityId: "c1",
            name: "Competitor c1",
            totalMentions: 3,
            cells: { Growth: "yes", Retention: "yes" },
            cellDiffs: { Growth: 1, Retention: 1 },
            gapCount: 0,
          },
          {
            entityType: "competitor",
            entityId: "c2",
            name: "Competitor c2",
            totalMentions: 2,
            cells: { Growth: "no", Retention: "yes" },
            cellDiffs: { Growth: -1, Retention: 2 },
            gapCount: 1,
          },
          {
            entityType: "competitor",
            entityId: "c3",
            name: "Competitor c3",
            totalMentions: 0,
            cells: { Growth: "unknown", Retention: "unknown" },
            cellDiffs: { Growth: -1, Retention: 0 },
            gapCount: 0,
          },
          {
            entityType: "competitor",
            entityId: "c4",
            name: "Competitor c4",
            totalMentions: 1,
            cells: { Growth: "partial", Retention: "no" },
            cellDiffs: { Growth: 0, Retention: 0 },
            gapCount: 0,
          },
          {
            entityType: "competitor",
            entityId: "c5",
            name: "Competitor c5",
            totalMentions: 0,
            cells: { Growth: "unknown", Retention: "unknown" },
            cellDiffs: { Growth: -1, Retention: 0 },
            gapCount: 0,
          },
          {
            entityType: "competitor",
            entityId: "c6",
            name: "Competitor c6",
            totalMentions: 0,
            cells: { Growth: "unknown", Retention: "unknown" },
            cellDiffs: { Growth: -1, Retention: 0 },
            gapCount: 0,
          },
          {
            entityType: "brand",
            entityId: BRAND_ID,
            name: "Acme",
            totalMentions: 1,
            cells: { Growth: "partial", Retention: "unknown" },
            gapCount: 0,
          },
        ],
      },
    });
  });
});
