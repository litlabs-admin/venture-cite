// HTTP-level contract tests for server/routes/geoSignals.ts.
//
// POST /api/geo-signals/optimize-chunks already has dedicated coverage in
// tests/unit/geoSignalsOptimizeChunksRoute.test.ts (the anti-enumeration
// ownership fix). This file covers the other four registrations:
//   POST /api/geo-signals/analyze
//   POST /api/geo-signals/chunk-analysis
//   POST /api/geo-signals/schema-audit
//   POST /api/geo-signals/pipeline-simulation
//
// Priority per endpoint: ownership (404, never 403/500, service not called)
// > validation (exact status + body) > success shape > conflict/limit paths.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

class TestOwnershipError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = "OwnershipError";
    this.status = status;
  }
}

const { ownership, services } = vi.hoisted(() => ({
  ownership: { requireBrand: vi.fn() },
  services: {
    optimizeContentChunks: vi.fn(),
    analyzeGeoSignals: vi.fn(),
    simulatePipeline: vi.fn(),
  },
}));

const computeChunksMock = vi.hoisted(() => vi.fn());
const runSchemaAuditMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: ownership.requireBrand,
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  MAX_CONTENT_LENGTH: 100000,
  sendError: (res: express.Response, _e: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/services/geoSignals", () => services);
vi.mock("../../server/services/geoContentScoring", () => ({ computeChunks: computeChunksMock }));
vi.mock("../../server/services/schemaAudit", () => ({
  runSchemaAudit: runSchemaAuditMock,
  UnreachableUrlError: class UnreachableUrlError extends Error {},
}));
vi.mock("../../server/lib/jsonLdExtract", () => ({ collectSchemaNodes: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupGeoSignalsRoutes } = await import("../../server/routes/geoSignals");
const { UnreachableUrlError } = await import("../../server/services/schemaAudit");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupGeoSignalsRoutes(app);
  return app;
}

describe("POST /api/geo-signals/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s for a brand the caller does not own, without calling the service", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "some content", targetQuery: "some query", brandId: "not-mine" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(services.analyzeGeoSignals).not.toHaveBeenCalled();
  });

  it("400s when content is missing", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ targetQuery: "some query" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content and target query required" });
  });

  it("400s when targetQuery is whitespace-only", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "some content", targetQuery: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content and target query required" });
  });

  it("413s when content exceeds the max length", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "a".repeat(100001), targetQuery: "some query" });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: "Content exceeds 100000 characters",
    });
  });

  it("413s when targetQuery exceeds the max length", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "some content", targetQuery: "a".repeat(501) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: "Target query exceeds 500 characters",
    });
  });

  it("returns the shaped scorecard on success without a brandId", async () => {
    services.analyzeGeoSignals.mockResolvedValue({
      signals: { a: 1 },
      overallScore: 80,
      termCoverageRatio: 0.5,
      questionHeadingFraction: 0.2,
      wordCount: 120,
      extraInternalField: "must not leak",
    });

    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "some content", targetQuery: "some query" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        signals: { a: 1 },
        overallScore: 80,
        termCoverageRatio: 0.5,
        questionHeadingFraction: 0.2,
        wordCount: 120,
      },
    });
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("resolves the brand and passes it through when brandId is owned", async () => {
    const brand = { id: "brand-1", userId: user.id };
    ownership.requireBrand.mockResolvedValue(brand);
    services.analyzeGeoSignals.mockResolvedValue({
      signals: {},
      overallScore: 50,
      termCoverageRatio: 0.1,
      questionHeadingFraction: 0.1,
      wordCount: 10,
    });

    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "some content", targetQuery: "some query", brandId: "brand-1" });

    expect(response.status).toBe(200);
    expect(ownership.requireBrand).toHaveBeenCalledWith("brand-1", user.id);
    expect(services.analyzeGeoSignals).toHaveBeenCalledWith(
      expect.objectContaining({ brand, content: "some content", targetQuery: "some query" }),
    );
  });

  it("500s when the service throws a non-ownership error", async () => {
    services.analyzeGeoSignals.mockRejectedValue(new Error("boom"));

    const response = await request(makeApp())
      .post("/api/geo-signals/analyze")
      .send({ content: "some content", targetQuery: "some query" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: "Failed to analyze signals" });
  });
});

describe("POST /api/geo-signals/chunk-analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400s when content is missing", async () => {
    const response = await request(makeApp()).post("/api/geo-signals/chunk-analysis").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content required" });
  });

  it("400s when content is whitespace-only", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/chunk-analysis")
      .send({ content: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content required" });
  });

  it("413s when content exceeds the max length", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/chunk-analysis")
      .send({ content: "a".repeat(100001) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: "Content exceeds 100000 characters",
    });
    expect(computeChunksMock).not.toHaveBeenCalled();
  });

  it("returns chunk analysis on success", async () => {
    computeChunksMock.mockReturnValue({ chunks: [{ id: "c1" }], stats: { total: 1 } });

    const response = await request(makeApp())
      .post("/api/geo-signals/chunk-analysis")
      .send({ content: "some content" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { chunks: [{ id: "c1" }], stats: { total: 1 } },
    });
    expect(computeChunksMock).toHaveBeenCalledWith("some content");
  });

  it("500s when computeChunks throws", async () => {
    computeChunksMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const response = await request(makeApp())
      .post("/api/geo-signals/chunk-analysis")
      .send({ content: "some content" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: "Failed to analyze chunks" });
  });
});

describe("POST /api/geo-signals/schema-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400s when url is missing", async () => {
    const response = await request(makeApp()).post("/api/geo-signals/schema-audit").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "URL required" });
    expect(runSchemaAuditMock).not.toHaveBeenCalled();
  });

  it("400s when the URL is unreachable", async () => {
    runSchemaAuditMock.mockRejectedValue(new UnreachableUrlError("could not reach example.com"));

    const response = await request(makeApp())
      .post("/api/geo-signals/schema-audit")
      .send({ url: "https://example.com" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "could not reach example.com",
    });
  });

  it("returns the audit on success", async () => {
    runSchemaAuditMock.mockResolvedValue({ completenessByType: { Article: 1 } });

    const response = await request(makeApp())
      .post("/api/geo-signals/schema-audit")
      .send({ url: "https://example.com", force: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { completenessByType: { Article: 1 } },
    });
    expect(runSchemaAuditMock).toHaveBeenCalledWith("https://example.com", true);
  });

  it("500s with the underlying error message for an unexpected error", async () => {
    runSchemaAuditMock.mockRejectedValue(new Error("db unavailable"));

    const response = await request(makeApp())
      .post("/api/geo-signals/schema-audit")
      .send({ url: "https://example.com" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: "db unavailable" });
  });
});

describe("POST /api/geo-signals/pipeline-simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400s when content is missing", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/pipeline-simulation")
      .send({ query: "some query" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content and query required" });
  });

  it("400s when query is whitespace-only", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/pipeline-simulation")
      .send({ content: "some content", query: "  " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content and query required" });
  });

  it("413s when content exceeds the max length", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/pipeline-simulation")
      .send({ content: "a".repeat(100001), query: "some query" });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: "Content exceeds 100000 characters",
    });
  });

  it("413s when query exceeds the max length", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/pipeline-simulation")
      .send({ content: "some content", query: "a".repeat(501) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: "Query exceeds 500 characters",
    });
  });

  it("returns simulated stages on success", async () => {
    services.simulatePipeline.mockResolvedValue({
      stages: [{ name: "stage1" }],
      query: "resolved query",
    });

    const response = await request(makeApp())
      .post("/api/geo-signals/pipeline-simulation")
      .send({ content: "some content", query: "some query" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { stages: [{ name: "stage1" }], query: "resolved query" },
    });
    expect(services.simulatePipeline).toHaveBeenCalledWith(
      "some content",
      "some query",
      undefined,
      undefined,
    );
  });

  it("500s when the service throws", async () => {
    services.simulatePipeline.mockRejectedValue(new Error("boom"));

    const response = await request(makeApp())
      .post("/api/geo-signals/pipeline-simulation")
      .send({ content: "some content", query: "some query" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: "Failed to simulate pipeline" });
  });
});
