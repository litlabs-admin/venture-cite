// GET /api/dashboard/cited-urls/:brandId
//
// This endpoint answers "which sources cited my brand?" - it feeds the
// dashboard's Citations panel (headline count + Top sources) and the Report
// page's CitedUrlsCard.
//
// It used to read `citedUrls`, which the schema defines as "list of all URLs
// the LLM cited in its response" - the entire bibliography of every answer the
// brand happened to appear in. `citingOutletUrl` is the matcher-derived source
// that actually referenced the brand. Measured on the live Apple brand: 168
// cited rankings carried 962 raw URLs across `citedUrls` (226 after dedupe)
// but only 117 attributed outlets, 71 distinct. So the panel counted the whole
// bibliography and "Top sources" ranked outlets that never mentioned the brand.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const BRAND_ID = "88888888-8888-4888-8888-888888888888";
const USER_ID = "user-1";

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: stubs.getBrandById,
    getBrandPromptsByBrandId: stubs.getBrandPromptsByBrandId,
    getGeoRankingsByBrandPromptIds: stubs.getGeoRankingsByBrandPromptIds,
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
    sendError: (res: express.Response, _e: unknown, msg: string) => {
      res.status(500).json({ success: false, error: msg });
    },
    aiLimitMiddleware: (_r: unknown, _s: unknown, next: () => void) => next(),
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
      status(c: number) {
        statusCode = c;
        return res;
      },
      json(p: any) {
        resolve({ status: statusCode, body: p });
        return res;
      },
      setHeader: () => res,
      end: () => resolve({ status: statusCode, body: null }),
      on: () => res,
    } as unknown as express.Response;
    (app as any).handle(req, res, (e: unknown) => (e ? reject(e) : undefined));
  });
}

const ranking = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  aiPlatform: "chatgpt",
  prompt: "best smartphones",
  isCited: 1,
  citingOutletUrl: null,
  citedUrls: null,
  checkedAt: new Date("2026-07-29T10:00:00Z"),
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(stubs)) fn.mockReset();
  stubs.getBrandById.mockResolvedValue({ id: BRAND_ID, userId: USER_ID, name: "Acme" });
  stubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p-1" }]);
});

describe("GET /api/dashboard/cited-urls/:brandId", () => {
  it("returns only the source that actually cited the brand", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      ranking({
        citingOutletUrl: "https://cnet.com/best-phones",
        // The rest of that answer's bibliography - unrelated to the brand.
        citedUrls: [
          "https://cnet.com/best-phones",
          "https://youtube.com/watch?v=x",
          "https://reddit.com/r/phones",
        ],
      }),
    ]);

    const r = await call(`/api/dashboard/cited-urls/${BRAND_ID}`);

    expect(r.status).toBe(200);
    expect(r.body.data.items.map((i: any) => i.url)).toEqual(["https://cnet.com/best-phones"]);
    expect(r.body.data.total).toBe(1);
  });

  it("contributes nothing when a cited ranking has no attributed outlet", async () => {
    // The answer cited us but we could not attribute it to a source. Listing
    // its unrelated links would be a guess, so the row is skipped entirely.
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      ranking({
        citingOutletUrl: null,
        citedUrls: ["https://unrelated.com/a", "https://unrelated.com/b"],
      }),
    ]);

    const r = await call(`/api/dashboard/cited-urls/${BRAND_ID}`);

    expect(r.body.data.items).toEqual([]);
    expect(r.body.data.total).toBe(0);
  });

  it("ignores rankings where the brand was not cited at all", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      ranking({ isCited: 0, citingOutletUrl: "https://nope.com/x" }),
      ranking({ isCited: 1, citingOutletUrl: "https://yes.com/x" }),
    ]);

    const r = await call(`/api/dashboard/cited-urls/${BRAND_ID}`);

    expect(r.body.data.items.map((i: any) => i.url)).toEqual(["https://yes.com/x"]);
  });

  it("dedupes the same outlet across runs, keeping the most recent", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      ranking({
        citingOutletUrl: "https://cnet.com/x",
        checkedAt: new Date("2026-07-20T10:00:00Z"),
      }),
      ranking({
        citingOutletUrl: "https://cnet.com/x",
        checkedAt: new Date("2026-07-29T10:00:00Z"),
      }),
    ]);

    const r = await call(`/api/dashboard/cited-urls/${BRAND_ID}`);

    expect(r.body.data.total).toBe(1);
    expect(new Date(r.body.data.items[0].citedAt).toISOString()).toBe("2026-07-29T10:00:00.000Z");
  });

  it("keeps the same outlet separate per platform and prompt", async () => {
    // "cnet cited us on ChatGPT AND on Claude" is two facts, not one.
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      ranking({ aiPlatform: "chatgpt", citingOutletUrl: "https://cnet.com/x" }),
      ranking({ aiPlatform: "claude", citingOutletUrl: "https://cnet.com/x" }),
    ]);

    const r = await call(`/api/dashboard/cited-urls/${BRAND_ID}`);

    expect(r.body.data.total).toBe(2);
  });
});
