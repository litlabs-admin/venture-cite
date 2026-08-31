// HTTP-level route contracts for server/routes/dashboard.ts.
//
// All of these endpoints share the same requireOwnedBrand() shape: they load
// storage.getBrandById(:brandId) and answer 404 (not 403/500) unless
// brand.userId === the authenticated user. That anti-enumeration guard is the
// thing worth pinning at the HTTP layer - a service-level test never sees the
// route's ownership check because it calls the service directly.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const { storageMock, visibility, recommendations, siteHealth, perception } = vi.hoisted(() => ({
  storageMock: {
    getBrandById: vi.fn(),
    getAlertHistory: vi.fn(),
  },
  visibility: {
    getDashboardHero: vi.fn(),
    getDashboardRankings: vi.fn(),
    getDashboardCitedUrls: vi.fn(),
    getDashboardGapMatrix: vi.fn(),
    getDashboardCitationTrend: vi.fn(),
  },
  recommendations: {
    getDashboardRecommendations: vi.fn(),
  },
  siteHealth: {
    getSiteHealthDashboard: vi.fn(),
    getSiteHealthPages: vi.fn(),
    getSiteHealthFindingStatuses: vi.fn(),
    setSiteHealthFindingStatus: vi.fn(),
    clearSiteHealthFindingStatus: vi.fn(),
    getSiteHealthContentFindings: vi.fn(),
    warmSiteHealth: vi.fn(),
    pageSeverity: vi.fn(),
  },
  perception: {
    getBrandPerception: vi.fn(),
    runBrandPerceptionScoring: vi.fn(),
    getPerceptionProbes: vi.fn(),
    startOrGetActivePerceptionProbeRun: vi.fn(),
    advanceOwnedPerceptionProbeRun: vi.fn(),
    PERCEPTION_COOLDOWN_MS: 60 * 60 * 1000,
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/ownership", () => ({ requireUser: () => user }));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, _error: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/siteHealthHistory", () => ({
  listSiteHealthScanHistory: vi.fn(),
}));
vi.mock("../../server/services/dashboardVisibility", () => visibility);
vi.mock("../../server/services/dashboardRecommendations", () => recommendations);
vi.mock("../../server/services/dashboardSiteHealth", () => siteHealth);
vi.mock("../../server/lib/scoreSiteHealth", () => ({ scoreSiteHealth: vi.fn() }));
vi.mock("../../server/services/dashboardPerception", () => perception);
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupDashboardRoutes } = await import("../../server/routes/dashboard");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupDashboardRoutes(app);
  return app;
}

const ownedBrand = { id: "brand-1", userId: user.id };

describe("dashboard routes - ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/dashboard/hero/:brandId answers 404 for a brand the caller does not own", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/hero/brand-1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(visibility.getDashboardHero).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/hero/:brandId answers 404 for a nonexistent brand", async () => {
    storageMock.getBrandById.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/dashboard/hero/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
  });

  it("GET /api/dashboard/hero/:brandId returns hero data for an owned brand, parsing ?since", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    visibility.getDashboardHero.mockResolvedValue({ score: 42 });

    const response = await request(makeApp()).get(
      "/api/dashboard/hero/brand-1?since=2026-01-01T00:00:00.000Z",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { score: 42 } });
    const [, sinceArg] = visibility.getDashboardHero.mock.calls[0];
    expect(sinceArg).toBeInstanceOf(Date);
    expect((sinceArg as Date).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("GET /api/dashboard/hero/:brandId treats a malformed ?since as absent (null)", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    visibility.getDashboardHero.mockResolvedValue({ score: 1 });

    const response = await request(makeApp()).get("/api/dashboard/hero/brand-1?since=not-a-date");

    expect(response.status).toBe(200);
    expect(visibility.getDashboardHero).toHaveBeenCalledWith(ownedBrand, null);
  });

  it("GET /api/dashboard/rankings/:brandId answers 404 for an unowned brand and skips the service", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/rankings/brand-1");

    expect(response.status).toBe(404);
    expect(visibility.getDashboardRankings).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/rankings/:brandId returns rankings for an owned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    visibility.getDashboardRankings.mockResolvedValue([{ platform: "chatgpt" }]);

    const response = await request(makeApp()).get("/api/dashboard/rankings/brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [{ platform: "chatgpt" }] });
  });

  it("GET /api/dashboard/cited-urls/:brandId answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/dashboard/cited-urls/brand-1");

    expect(response.status).toBe(404);
    expect(visibility.getDashboardCitedUrls).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/gap-matrix/:brandId answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/gap-matrix/brand-1");

    expect(response.status).toBe(404);
    expect(visibility.getDashboardGapMatrix).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/gap-matrix/:brandId returns matrix data for an owned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    visibility.getDashboardGapMatrix.mockResolvedValue({ cells: [] });

    const response = await request(makeApp()).get("/api/dashboard/gap-matrix/brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { cells: [] } });
  });

  it("GET /api/dashboard/citation-trend/:brandId answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/citation-trend/brand-1");

    expect(response.status).toBe(404);
    expect(visibility.getDashboardCitationTrend).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/citation-trend/:brandId calls the service with the brand id", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    visibility.getDashboardCitationTrend.mockResolvedValue([{ week: 1 }]);

    const response = await request(makeApp()).get("/api/dashboard/citation-trend/brand-1");

    expect(response.status).toBe(200);
    expect(visibility.getDashboardCitationTrend).toHaveBeenCalledWith("brand-1");
  });

  it("GET /api/brands/:brandId/recommendations answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/brands/brand-1/recommendations");

    expect(response.status).toBe(404);
    expect(recommendations.getDashboardRecommendations).not.toHaveBeenCalled();
  });

  it("GET /api/brands/:brandId/recommendations returns recommendations for an owned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    recommendations.getDashboardRecommendations.mockResolvedValue([{ id: "rec-1" }]);

    const response = await request(makeApp()).get("/api/brands/brand-1/recommendations");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [{ id: "rec-1" }] });
  });

  it("GET /api/brands/:brandId/alerts answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/brands/brand-1/alerts");

    expect(response.status).toBe(404);
    expect(storageMock.getAlertHistory).not.toHaveBeenCalled();
  });

  it("GET /api/brands/:brandId/alerts clamps ?limit into [1,50]", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    storageMock.getAlertHistory.mockResolvedValue([]);

    const response = await request(makeApp()).get("/api/brands/brand-1/alerts?limit=999");

    expect(response.status).toBe(200);
    expect(storageMock.getAlertHistory).toHaveBeenCalledWith("brand-1", 50);
  });

  it("GET /api/dashboard/site-health/:brandId answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/site-health/brand-1");

    expect(response.status).toBe(404);
    expect(siteHealth.getSiteHealthDashboard).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/site-health/:brandId/history answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/site-health/brand-1/history");

    expect(response.status).toBe(404);
  });

  it("GET /api/dashboard/site-health/:brandId/pages answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/dashboard/site-health/brand-1/pages");

    expect(response.status).toBe(404);
    expect(siteHealth.getSiteHealthPages).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/site-health/:brandId/finding-status answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get(
      "/api/dashboard/site-health/brand-1/finding-status",
    );

    expect(response.status).toBe(404);
    expect(siteHealth.getSiteHealthFindingStatuses).not.toHaveBeenCalled();
  });

  it("PUT finding-status answers 400 for an invalid status value", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);

    const response = await request(makeApp())
      .put("/api/dashboard/site-health/brand-1/finding-status/finding-1")
      .send({ status: "bogus" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "status must be one of: in_progress, ignored, fixed",
    });
    expect(siteHealth.setSiteHealthFindingStatus).not.toHaveBeenCalled();
  });

  it("PUT finding-status answers 404 for an unowned brand before validating the body", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp())
      .put("/api/dashboard/site-health/brand-1/finding-status/finding-1")
      .send({ status: "fixed" });

    expect(response.status).toBe(404);
    expect(siteHealth.setSiteHealthFindingStatus).not.toHaveBeenCalled();
  });

  it("PUT finding-status accepts a valid status for an owned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);

    const response = await request(makeApp())
      .put("/api/dashboard/site-health/brand-1/finding-status/finding-1")
      .send({ status: "ignored" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(siteHealth.setSiteHealthFindingStatus).toHaveBeenCalledWith(
      "brand-1",
      "finding-1",
      "ignored",
      user.id,
    );
  });

  it("DELETE finding-status answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(undefined);

    const response = await request(makeApp()).delete(
      "/api/dashboard/site-health/brand-1/finding-status/finding-1",
    );

    expect(response.status).toBe(404);
    expect(siteHealth.clearSiteHealthFindingStatus).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/site-health/:brandId/content-findings answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get(
      "/api/dashboard/site-health/brand-1/content-findings",
    );

    expect(response.status).toBe(404);
    expect(siteHealth.getSiteHealthContentFindings).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard/perception/:brandId answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).get("/api/dashboard/perception/brand-1");

    expect(response.status).toBe(404);
    expect(perception.getBrandPerception).not.toHaveBeenCalled();
  });

  it("POST /api/dashboard/perception/:brandId/run answers 404 for an unowned brand, never scoring it", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).post("/api/dashboard/perception/brand-1/run");

    expect(response.status).toBe(404);
    expect(perception.runBrandPerceptionScoring).not.toHaveBeenCalled();
  });

  it("POST /api/dashboard/perception/:brandId/run answers 429 with Retry-After on cooldown", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    perception.runBrandPerceptionScoring.mockResolvedValue({
      kind: "cooldown",
      retryAfterSeconds: 900,
    });

    const response = await request(makeApp()).post("/api/dashboard/perception/brand-1/run");

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("900");
    expect(response.body).toEqual({
      success: false,
      error: "Perception was scored recently. Try again later.",
      retryAfterSeconds: 900,
    });
  });

  it("POST /api/dashboard/perception/:brandId/run returns scored data on success", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    perception.runBrandPerceptionScoring.mockResolvedValue({
      kind: "scored",
      data: { trust: 80 },
    });

    const response = await request(makeApp()).post("/api/dashboard/perception/brand-1/run");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { trust: 80 } });
  });

  it("GET /api/dashboard/perception/probes/:brandId answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/dashboard/perception/probes/brand-1");

    expect(response.status).toBe(404);
    expect(perception.getPerceptionProbes).not.toHaveBeenCalled();
  });

  it("POST /api/dashboard/perception/probes/:brandId/run answers 404 for an unowned brand", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp()).post("/api/dashboard/perception/probes/brand-1/run");

    expect(response.status).toBe(404);
    expect(perception.startOrGetActivePerceptionProbeRun).not.toHaveBeenCalled();
  });

  it("POST /api/dashboard/perception/probes/:brandId/advance answers 400 when runId is missing", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);

    const response = await request(makeApp())
      .post("/api/dashboard/perception/probes/brand-1/advance")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "runId is required" });
    expect(perception.advanceOwnedPerceptionProbeRun).not.toHaveBeenCalled();
  });

  it("POST /api/dashboard/perception/probes/:brandId/advance answers 404 for an unowned brand before checking runId", async () => {
    storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

    const response = await request(makeApp())
      .post("/api/dashboard/perception/probes/brand-1/advance")
      .send({});

    expect(response.status).toBe(404);
    expect(perception.advanceOwnedPerceptionProbeRun).not.toHaveBeenCalled();
  });

  it("POST /api/dashboard/perception/probes/:brandId/advance answers 404 when the run does not exist", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    perception.advanceOwnedPerceptionProbeRun.mockResolvedValue(null);

    const response = await request(makeApp())
      .post("/api/dashboard/perception/probes/brand-1/advance")
      .send({ runId: "run-1" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
  });

  it("POST /api/dashboard/perception/probes/:brandId/advance returns the slice result on success", async () => {
    storageMock.getBrandById.mockResolvedValue(ownedBrand);
    perception.advanceOwnedPerceptionProbeRun.mockResolvedValue({ done: false, progress: 0.5 });

    const response = await request(makeApp())
      .post("/api/dashboard/perception/probes/brand-1/advance")
      .send({ runId: "run-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { done: false, progress: 0.5 } });
    expect(perception.advanceOwnedPerceptionProbeRun).toHaveBeenCalledWith(ownedBrand, "run-1");
  });
});
