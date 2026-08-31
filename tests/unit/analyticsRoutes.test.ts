// HTTP-level route contracts for server/routes/analytics.ts.
//
// Unlike most brandId routes in this codebase, these handlers do NOT call
// requireBrand/requireUser themselves for the :brandId endpoints - the
// comments in analytics.ts say ownership is "checked via app.param before
// this handler runs" (server/routes.ts wires
// app.param("brandId", brandIdParamHandler), see server/auth.ts). That
// param handler is registered on the real app, not by setupAnalyticsRoutes,
// so it is out of scope for this file's own HTTP contract - these tests
// pin what setupAnalyticsRoutes itself does: a plain existence check via
// storage.getBrandById, not an ownership check.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const { storageMock, crawlerMock, geoAnalyticsMock, geoOpportunitiesMock } = vi.hoisted(() => ({
  storageMock: { getBrandById: vi.fn() },
  crawlerMock: { checkCrawlerPermissions: vi.fn() },
  geoAnalyticsMock: {
    computeGeoAnalytics: vi.fn(),
    recordVisibilitySnapshot: vi.fn(),
    getVisibilityHistory: vi.fn(),
    analyzeSentimentText: vi.fn(),
  },
  geoOpportunitiesMock: {
    computeGeoOpportunitiesForBrand: vi.fn(),
    computeGenericGeoOpportunities: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/ownership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/ownership")>();
  return { ...actual, requireUser: () => user };
});
vi.mock("../../server/lib/crawlerAccess", () => ({
  DisallowedUrlError: class DisallowedUrlError extends Error {},
}));
vi.mock("../../server/services/crawlerPermissions", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/crawlerPermissions")>(
    "../../server/services/crawlerPermissions",
  );
  return { ...actual, checkCrawlerPermissions: crawlerMock.checkCrawlerPermissions };
});
vi.mock("../../server/services/geoAnalytics", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/geoAnalytics")>(
    "../../server/services/geoAnalytics",
  );
  return { ...actual, ...geoAnalyticsMock };
});
vi.mock("../../server/services/geoOpportunities", () => geoOpportunitiesMock);
vi.mock("../../server/lib/routesShared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/routesShared")>();
  return {
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    asyncHandler: (handler: unknown) => handler,
    MAX_CONTENT_LENGTH: actual.MAX_CONTENT_LENGTH,
    sendError: (res: express.Response, _err: unknown, fallback: string) =>
      res.status(500).json({ success: false, error: fallback }),
  };
});
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupAnalyticsRoutes } = await import("../../server/routes/analytics");
const { InvalidUrlFormatError } = await import("../../server/services/crawlerPermissions");
const { DisallowedUrlError } = await import("../../server/lib/crawlerAccess");
const { SentimentUnavailableError } = await import("../../server/services/geoAnalytics");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupAnalyticsRoutes(app);
  return app;
}

describe("analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/check-crawler-permissions", () => {
    it("answers 400 when url is missing", async () => {
      const response = await request(makeApp()).post("/api/check-crawler-permissions").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "URL is required" });
      expect(crawlerMock.checkCrawlerPermissions).not.toHaveBeenCalled();
    });

    it("answers 400 for an invalid URL format", async () => {
      crawlerMock.checkCrawlerPermissions.mockRejectedValue(new InvalidUrlFormatError("bad url"));

      const response = await request(makeApp())
        .post("/api/check-crawler-permissions")
        .send({ url: "not a url" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "Invalid URL format" });
    });

    it("answers 400 for a disallowed (SSRF-guarded) URL", async () => {
      crawlerMock.checkCrawlerPermissions.mockRejectedValue(new DisallowedUrlError("blocked"));

      const response = await request(makeApp())
        .post("/api/check-crawler-permissions")
        .send({ url: "http://169.254.169.254/" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "This URL is not allowed" });
    });

    it("returns the crawler report on success", async () => {
      crawlerMock.checkCrawlerPermissions.mockResolvedValue({ gptbot: true, ccbot: false });

      const response = await request(makeApp())
        .post("/api/check-crawler-permissions")
        .send({ url: "https://example.com" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { gptbot: true, ccbot: false } });
    });
  });

  describe("GET /api/geo-analytics/:brandId", () => {
    it("answers 404 for a brand that does not exist", async () => {
      storageMock.getBrandById.mockResolvedValue(undefined);

      const response = await request(makeApp()).get("/api/geo-analytics/brand-1");

      expect(response.status).toBe(404);
      expect(geoAnalyticsMock.computeGeoAnalytics).not.toHaveBeenCalled();
    });

    it("parses a well-formed ?since into a Date filter", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1" });
      geoAnalyticsMock.computeGeoAnalytics.mockResolvedValue({ sov: 0.4 });

      const response = await request(makeApp()).get(
        "/api/geo-analytics/brand-1?since=2026-01-01T00:00:00.000Z",
      );

      expect(response.status).toBe(200);
      const [, sinceArg] = geoAnalyticsMock.computeGeoAnalytics.mock.calls[0];
      expect(sinceArg).toBeInstanceOf(Date);
    });

    it("treats ?since=all the same as an absent filter", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1" });
      geoAnalyticsMock.computeGeoAnalytics.mockResolvedValue({ sov: 0.4 });

      const response = await request(makeApp()).get("/api/geo-analytics/brand-1?since=all");

      expect(response.status).toBe(200);
      expect(geoAnalyticsMock.computeGeoAnalytics).toHaveBeenCalledWith(
        { id: "brand-1" },
        undefined,
      );
    });
  });

  describe("POST /api/analyze-sentiment", () => {
    it("answers 400 when text is missing", async () => {
      const response = await request(makeApp()).post("/api/analyze-sentiment").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "Text is required" });
    });

    it("answers 413 when text exceeds the max content length", async () => {
      const response = await request(makeApp())
        .post("/api/analyze-sentiment")
        .send({ text: "x".repeat(40_001) });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        success: false,
        error: "Text exceeds 40000 characters",
      });
      expect(geoAnalyticsMock.analyzeSentimentText).not.toHaveBeenCalled();
    });

    it("answers 503 when sentiment analysis is unavailable", async () => {
      geoAnalyticsMock.analyzeSentimentText.mockRejectedValue(
        new SentimentUnavailableError("not configured"),
      );

      const response = await request(makeApp())
        .post("/api/analyze-sentiment")
        .send({ text: "great product" });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        success: false,
        error: "not configured",
        message: "Please contact support to enable sentiment analysis.",
      });
    });

    it("truncates context to 500 chars before calling the service", async () => {
      geoAnalyticsMock.analyzeSentimentText.mockResolvedValue({ sentiment: "positive" });
      const longContext = "y".repeat(600);

      const response = await request(makeApp())
        .post("/api/analyze-sentiment")
        .send({ text: "great product", context: longContext });

      expect(response.status).toBe(200);
      expect(geoAnalyticsMock.analyzeSentimentText).toHaveBeenCalledWith(
        "great product",
        "y".repeat(500),
      );
    });
  });

  describe("POST /api/geo-analytics/:brandId/snapshot", () => {
    it("answers 404 for a brand that does not exist", async () => {
      storageMock.getBrandById.mockResolvedValue(undefined);

      const response = await request(makeApp())
        .post("/api/geo-analytics/brand-1/snapshot")
        .send({});

      expect(response.status).toBe(404);
      expect(geoAnalyticsMock.recordVisibilitySnapshot).not.toHaveBeenCalled();
    });

    it("persists the snapshot on success", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1" });
      geoAnalyticsMock.recordVisibilitySnapshot.mockResolvedValue({ id: "snap-1" });

      const response = await request(makeApp())
        .post("/api/geo-analytics/brand-1/snapshot")
        .send({ score: 88 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: "snap-1" } });
      expect(geoAnalyticsMock.recordVisibilitySnapshot).toHaveBeenCalledWith("brand-1", {
        score: 88,
      });
    });
  });

  describe("GET /api/geo-analytics/:brandId/history", () => {
    it("answers 404 for a brand that does not exist", async () => {
      storageMock.getBrandById.mockResolvedValue(undefined);

      const response = await request(makeApp()).get("/api/geo-analytics/brand-1/history");

      expect(response.status).toBe(404);
      expect(geoAnalyticsMock.getVisibilityHistory).not.toHaveBeenCalled();
    });

    it("defaults ?limit to 30 and wraps the brand summary", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1", name: "Acme" });
      geoAnalyticsMock.getVisibilityHistory.mockResolvedValue([{ score: 1 }]);

      const response = await request(makeApp()).get("/api/geo-analytics/brand-1/history");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { brand: { id: "brand-1", name: "Acme" }, snapshots: [{ score: 1 }] },
      });
      expect(geoAnalyticsMock.getVisibilityHistory).toHaveBeenCalledWith("brand-1", 30);
    });
  });

  describe("GET /api/geo-opportunities/:brandId", () => {
    it("answers 404 for a brand that does not exist", async () => {
      storageMock.getBrandById.mockResolvedValue(undefined);

      const response = await request(makeApp()).get("/api/geo-opportunities/brand-1");

      expect(response.status).toBe(404);
      expect(geoOpportunitiesMock.computeGeoOpportunitiesForBrand).not.toHaveBeenCalled();
    });

    it("returns opportunities for an existing brand", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1" });
      geoOpportunitiesMock.computeGeoOpportunitiesForBrand.mockResolvedValue([{ id: "opp-1" }]);

      const response = await request(makeApp()).get("/api/geo-opportunities/brand-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [{ id: "opp-1" }] });
    });
  });

  describe("GET /api/geo-opportunities", () => {
    it("defaults industry to 'default'", async () => {
      geoOpportunitiesMock.computeGenericGeoOpportunities.mockReturnValue([{ id: "generic-1" }]);

      const response = await request(makeApp()).get("/api/geo-opportunities");

      expect(response.status).toBe(200);
      expect(geoOpportunitiesMock.computeGenericGeoOpportunities).toHaveBeenCalledWith("default");
      expect(response.body).toEqual({ success: true, data: [{ id: "generic-1" }] });
    });

    it("passes through a supplied ?industry", async () => {
      geoOpportunitiesMock.computeGenericGeoOpportunities.mockReturnValue([]);

      await request(makeApp()).get("/api/geo-opportunities?industry=fintech");

      expect(geoOpportunitiesMock.computeGenericGeoOpportunities).toHaveBeenCalledWith("fintech");
    });
  });
});
