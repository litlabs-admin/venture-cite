// GET /api/geo-opportunities/:brandId used to load its article-tied
// rankings via storage.getGeoRankings() - every geo_ranking row in the
// table, across every brand - then filter in memory down to this brand's
// articles. That is a full-table scan on every request.
//
// The sibling route (/api/geo-analytics/:brandId) was already fixed to use
// the indexed storage.getGeoRankingsByArticleIds(ids, since) read instead.
// This test locks in the equivalent fix here: same rows back, but via the
// indexed read, and it proves the regression can't come back quietly by
// asserting the global scan is never called.
//
// Mock pattern mirrors tests/unit/dashboardGapMatrix.test.ts: stub storage,
// mount the route on a bare Express app, drive it through (app as any).handle.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const BRAND_ID = "88888888-8888-4888-8888-888888888888";

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getArticles: vi.fn(),
  getGeoRankingsByArticleIds: vi.fn(),
  getGeoRankings: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { ...stubs },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    sendError: (res: express.Response, _error: unknown, message: string) => {
      res.status(500).json({ success: false, error: message });
    },
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    safeParseJson: (s: string) => JSON.parse(s),
    MAX_CONTENT_LENGTH: 40_000,
    openai: {},
  };
});
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

const { setupAnalyticsRoutes } = await import("../../server/routes/analytics");

function call(url: string): Promise<{ status: number; body: any }> {
  const app = express();
  setupAnalyticsRoutes(app);
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

describe("GET /api/geo-opportunities/:brandId rankings read", () => {
  beforeEach(() => {
    for (const stub of Object.values(stubs)) stub.mockReset();

    stubs.getBrandById.mockResolvedValue({
      id: BRAND_ID,
      name: "Acme",
      industry: "saas",
      website: "https://acme.com",
      products: [],
      uniqueSellingPoints: [],
    });
    stubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "prompt-1" }]);
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      { id: "r1", isCited: 1, citingOutletUrl: "https://reddit.com/r/x", articleId: null },
      { id: "r2", isCited: 0, citingOutletUrl: null, articleId: null },
    ]);
    // Two articles exist system-wide; only a1 belongs to this brand. The
    // route must only ask the indexed read for a1, never fetch every row
    // in geo_rankings.
    stubs.getArticles.mockResolvedValue([
      { id: "a1", brandId: BRAND_ID },
      { id: "a2", brandId: "some-other-brand" },
    ]);
    stubs.getGeoRankingsByArticleIds.mockResolvedValue([
      { id: "r3", isCited: 1, citingOutletUrl: "https://acme.com/blog/post", articleId: "a1" },
    ]);
    // If the route ever falls back to the global scan again, make that
    // obvious in a failure rather than silently passing: return a row
    // that would corrupt the count if it leaked in unfiltered.
    stubs.getGeoRankings.mockResolvedValue([
      { id: "r1", isCited: 1, citingOutletUrl: "https://reddit.com/r/x", articleId: null },
      { id: "r2", isCited: 0, citingOutletUrl: null, articleId: null },
      { id: "r3", isCited: 1, citingOutletUrl: "https://acme.com/blog/post", articleId: "a1" },
      {
        id: "r4-other-brand",
        isCited: 1,
        citingOutletUrl: "https://evil.example",
        articleId: "a2",
      },
    ]);
  });

  it("returns the same rankings-derived stats via the indexed read", async () => {
    const { status, body } = await call(`/api/geo-opportunities/${BRAND_ID}`);

    expect(status).toBe(200);
    // cited = [r1 (reddit), r3 (own site)]; r2 dropped (not cited), r4
    // dropped (belongs to a different brand's article).
    expect(body.data.totalCitedRankings).toBe(2);
    expect(body.data.keyStats).toEqual({
      thirdPartyCitationShare: 50,
      redditCitationShare: 50,
      brandWebsiteCitationShare: 50,
    });
  });

  it("uses the indexed article-scoped read, not the global geo_rankings scan", async () => {
    await call(`/api/geo-opportunities/${BRAND_ID}`);

    expect(stubs.getGeoRankingsByArticleIds).toHaveBeenCalledTimes(1);
    expect(stubs.getGeoRankingsByArticleIds).toHaveBeenCalledWith(["a1"]);

    // The whole point of the fix: no full-table scan, ever.
    expect(stubs.getGeoRankings).not.toHaveBeenCalled();
  });

  it("skips the indexed read entirely when the brand has no articles", async () => {
    stubs.getArticles.mockResolvedValue([{ id: "a2", brandId: "some-other-brand" }]);

    const { status, body } = await call(`/api/geo-opportunities/${BRAND_ID}`);

    expect(status).toBe(200);
    expect(stubs.getGeoRankingsByArticleIds).not.toHaveBeenCalled();
    expect(stubs.getGeoRankings).not.toHaveBeenCalled();
    // Only the brand-prompt-tied ranking (r1) remains cited.
    expect(body.data.totalCitedRankings).toBe(1);
  });
});
