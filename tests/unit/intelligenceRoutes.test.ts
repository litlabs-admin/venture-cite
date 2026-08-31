// HTTP-level route contracts for server/routes/intelligence.ts.

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

const { ownership, storageMock } = vi.hoisted(() => ({
  ownership: {
    requireBrand: vi.fn(),
    requireHallucination: vi.fn(),
    requireBrandFact: vi.fn(),
    requireCitationQuality: vi.fn(),
    getUserBrandIds: vi.fn(),
  },
  storageMock: {
    getCitationQualities: vi.fn(),
    getCitationQualityStats: vi.fn(),
    createCitationQuality: vi.fn(),
    updateCitationQuality: vi.fn(),
    deleteCitationQuality: vi.fn(),
    getBrandHallucinations: vi.fn(),
    getHallucinationStats: vi.fn(),
    createBrandHallucination: vi.fn(),
    updateBrandHallucination: vi.fn(),
    resolveBrandHallucination: vi.fn(),
    deleteBrandHallucination: vi.fn(),
    getBrandFacts: vi.fn(),
    createBrandFact: vi.fn(),
    updateBrandFact: vi.fn(),
    deleteBrandFact: vi.fn(),
    getMetricsHistory: vi.fn(),
    recordCurrentMetrics: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: ownership.requireBrand,
  requireHallucination: ownership.requireHallucination,
  requireBrandFact: ownership.requireBrandFact,
  requireCitationQuality: ownership.requireCitationQuality,
  getUserBrandIds: ownership.getUserBrandIds,
  pickFields: (body: any, allowed: readonly string[]) => {
    if (!body || typeof body !== "object") return {};
    const out: Record<string, unknown> = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
    }
    return out;
  },
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, err: unknown, fallback: string) => {
    if (err instanceof TestOwnershipError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: fallback });
  },
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupIntelligenceRoutes } = await import("../../server/routes/intelligence");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupIntelligenceRoutes(app);
  return app;
}

describe("citation quality routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/citation-quality scopes the global read to the caller's brand ids", async () => {
    ownership.getUserBrandIds.mockResolvedValue(new Set(["brand-1"]));
    storageMock.getCitationQualities.mockResolvedValue([
      { id: "q-1", brandId: "brand-1" },
      { id: "q-2", brandId: "brand-owned-by-another" },
    ]);

    const response = await request(makeApp()).get("/api/citation-quality");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [{ id: "q-1", brandId: "brand-1" }] });
  });

  it("GET /api/citation-quality/stats/:brandId answers 404 for an unowned brand", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get(
      "/api/citation-quality/stats/brand-owned-by-another",
    );

    expect(response.status).toBe(404);
    expect(storageMock.getCitationQualityStats).not.toHaveBeenCalled();
  });

  it("POST /api/citation-quality answers 400 when brandId is missing", async () => {
    const response = await request(makeApp()).post("/api/citation-quality").send({});

    expect(response.status).toBe(400);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("POST /api/citation-quality answers 404 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/citation-quality")
      .send({ brandId: "brand-owned-by-another" });

    expect(response.status).toBe(404);
    expect(storageMock.createCitationQuality).not.toHaveBeenCalled();
  });

  it("GET /api/citation-quality/stats/:brandId returns stats for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    storageMock.getCitationQualityStats.mockResolvedValue({ average: 80 });

    const response = await request(makeApp()).get("/api/citation-quality/stats/brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { average: 80 } });
  });

  it("PATCH /api/citation-quality/:id answers 404 for an entry the caller cannot see", async () => {
    ownership.requireCitationQuality.mockRejectedValue(
      new TestOwnershipError("Citation quality entry not found", 404),
    );

    const response = await request(makeApp())
      .patch("/api/citation-quality/entry-owned-by-another")
      .send({ authorityScore: 10 });

    expect(response.status).toBe(404);
    expect(storageMock.updateCitationQuality).not.toHaveBeenCalled();
  });

  it("PATCH /api/citation-quality/:id re-checks brand ownership when brandId is being moved", async () => {
    ownership.requireCitationQuality.mockResolvedValue({ id: "q-1", brandId: "brand-1" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .patch("/api/citation-quality/q-1")
      .send({ brandId: "brand-owned-by-another" });

    expect(response.status).toBe(404);
    expect(storageMock.updateCitationQuality).not.toHaveBeenCalled();
  });

  it("DELETE /api/citation-quality/:id answers 404 for an entry the caller cannot see", async () => {
    ownership.requireCitationQuality.mockRejectedValue(
      new TestOwnershipError("Citation quality entry not found", 404),
    );

    const response = await request(makeApp()).delete(
      "/api/citation-quality/entry-owned-by-another",
    );

    expect(response.status).toBe(404);
    expect(storageMock.deleteCitationQuality).not.toHaveBeenCalled();
  });
});

describe("hallucination routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/hallucinations answers 400 when brandId query param is missing", async () => {
    const response = await request(makeApp()).get("/api/hallucinations");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "brandId query param is required",
    });
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("GET /api/hallucinations answers 404 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get(
      "/api/hallucinations?brandId=brand-owned-by-another",
    );

    expect(response.status).toBe(404);
    expect(storageMock.getBrandHallucinations).not.toHaveBeenCalled();
  });

  it("GET /api/hallucinations/stats/:brandId answers 404 for an unowned brand", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get(
      "/api/hallucinations/stats/brand-owned-by-another",
    );

    expect(response.status).toBe(404);
    expect(storageMock.getHallucinationStats).not.toHaveBeenCalled();
  });

  it("GET /api/hallucinations/stats/:brandId returns stats for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    storageMock.getHallucinationStats.mockResolvedValue({ total: 3 });

    const response = await request(makeApp()).get("/api/hallucinations/stats/brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { total: 3 } });
  });

  it("POST /api/hallucinations answers 400 when brandId is missing", async () => {
    const response = await request(makeApp()).post("/api/hallucinations").send({});

    expect(response.status).toBe(400);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("POST /api/hallucinations answers 404 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/hallucinations")
      .send({ brandId: "brand-owned-by-another" });

    expect(response.status).toBe(404);
    expect(storageMock.createBrandHallucination).not.toHaveBeenCalled();
  });

  it("POST /api/hallucinations creates an entry for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    storageMock.createBrandHallucination.mockResolvedValue({ id: "h-1" });

    const response = await request(makeApp())
      .post("/api/hallucinations")
      .send({ brandId: "brand-1", claimedStatement: "false claim" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: "h-1" } });
  });

  it("GET /api/hallucinations returns rows for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    storageMock.getBrandHallucinations.mockResolvedValue([{ id: "h-1" }]);

    const response = await request(makeApp()).get("/api/hallucinations?brandId=brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [{ id: "h-1" }] });
  });

  it("PATCH /api/hallucinations/:id answers 400 for an unrecognised field (strict schema)", async () => {
    ownership.requireHallucination.mockResolvedValue({
      id: "h-1",
      brandId: "brand-1",
      remediationStatus: "pending",
    });

    const response = await request(makeApp())
      .patch("/api/hallucinations/h-1")
      .send({ notAField: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid update");
    expect(storageMock.updateBrandHallucination).not.toHaveBeenCalled();
  });

  it("PATCH /api/hallucinations/:id answers 404 for an entry the caller cannot see", async () => {
    ownership.requireHallucination.mockRejectedValue(
      new TestOwnershipError("Hallucination not found", 404),
    );

    const response = await request(makeApp())
      .patch("/api/hallucinations/owned-by-another")
      .send({ severity: "high" });

    expect(response.status).toBe(404);
    expect(storageMock.updateBrandHallucination).not.toHaveBeenCalled();
  });

  it("PATCH /api/hallucinations/:id answers 409 for an illegal remediation transition", async () => {
    ownership.requireHallucination.mockResolvedValue({
      id: "h-1",
      brandId: "brand-1",
      remediationStatus: "dismissed",
    });

    const response = await request(makeApp())
      .patch("/api/hallucinations/h-1")
      .send({ remediationStatus: "resolved" });

    expect(response.status).toBe(409);
    expect(storageMock.updateBrandHallucination).not.toHaveBeenCalled();
  });

  it("PATCH /api/hallucinations/:id allows a legal remediation transition", async () => {
    ownership.requireHallucination.mockResolvedValue({
      id: "h-1",
      brandId: "brand-1",
      remediationStatus: "pending",
    });
    const updated = { id: "h-1", remediationStatus: "resolved" };
    storageMock.updateBrandHallucination.mockResolvedValue(updated);

    const response = await request(makeApp())
      .patch("/api/hallucinations/h-1")
      .send({ remediationStatus: "resolved" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: updated });
  });

  it("POST /api/hallucinations/:id/resolve answers 409 for an already-resolved row", async () => {
    ownership.requireHallucination.mockResolvedValue({
      id: "h-1",
      brandId: "brand-1",
      remediationStatus: "dismissed",
    });

    const response = await request(makeApp()).post("/api/hallucinations/h-1/resolve");

    expect(response.status).toBe(409);
    expect(storageMock.resolveBrandHallucination).not.toHaveBeenCalled();
  });

  it("POST /api/hallucinations/:id/resolve answers 404 for a hidden entry", async () => {
    ownership.requireHallucination.mockRejectedValue(
      new TestOwnershipError("Hallucination not found", 404),
    );

    const response = await request(makeApp()).post("/api/hallucinations/owned-by-another/resolve");

    expect(response.status).toBe(404);
    expect(storageMock.resolveBrandHallucination).not.toHaveBeenCalled();
  });

  it("POST /api/hallucinations/:id/resolve resolves a pending row", async () => {
    ownership.requireHallucination.mockResolvedValue({
      id: "h-1",
      brandId: "brand-1",
      remediationStatus: "pending",
    });
    const resolved = { id: "h-1", remediationStatus: "resolved" };
    storageMock.resolveBrandHallucination.mockResolvedValue(resolved);

    const response = await request(makeApp()).post("/api/hallucinations/h-1/resolve");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: resolved });
  });

  it("DELETE /api/hallucinations/:id answers 404 for a hidden entry", async () => {
    ownership.requireHallucination.mockRejectedValue(
      new TestOwnershipError("Hallucination not found", 404),
    );

    const response = await request(makeApp()).delete("/api/hallucinations/owned-by-another");

    expect(response.status).toBe(404);
    expect(storageMock.deleteBrandHallucination).not.toHaveBeenCalled();
  });
});

describe("brand fact sheet routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/brand-facts/:brandId answers 404 for an unowned brand", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get("/api/brand-facts/brand-owned-by-another");

    expect(response.status).toBe(404);
    expect(storageMock.getBrandFacts).not.toHaveBeenCalled();
  });

  it("POST /api/brand-facts answers 400 when brandId is missing", async () => {
    const response = await request(makeApp()).post("/api/brand-facts").send({ subcategory: "x" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "brandId is required" });
  });

  it("POST /api/brand-facts answers 400 when subcategory/factCategory is missing", async () => {
    const response = await request(makeApp()).post("/api/brand-facts").send({ brandId: "brand-1" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "subcategory (or legacy factCategory) is required",
    });
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("POST /api/brand-facts answers 404 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-facts")
      .send({ brandId: "brand-owned-by-another", subcategory: "pricing" });

    expect(response.status).toBe(404);
    expect(storageMock.createBrandFact).not.toHaveBeenCalled();
  });

  it("POST /api/brand-facts maps legacy factCategory onto subcategory and tags as user_manual", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    storageMock.createBrandFact.mockResolvedValue({ id: "fact-1" });

    const response = await request(makeApp())
      .post("/api/brand-facts")
      .send({ brandId: "brand-1", factCategory: "pricing", factKey: "tier", factValue: "pro" });

    expect(response.status).toBe(200);
    expect(storageMock.createBrandFact).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        subcategory: "pricing",
        source: "user_manual",
        userOverridden: true,
      }),
    );
    const [payload] = storageMock.createBrandFact.mock.calls[0];
    expect(payload.factCategory).toBeUndefined();
  });

  it("PATCH /api/brand-facts/:id answers 404 for a fact the caller cannot see", async () => {
    ownership.requireBrandFact.mockRejectedValue(
      new TestOwnershipError("Brand fact not found", 404),
    );

    const response = await request(makeApp())
      .patch("/api/brand-facts/owned-by-another")
      .send({ factValue: "x" });

    expect(response.status).toBe(404);
    expect(storageMock.updateBrandFact).not.toHaveBeenCalled();
  });

  it("PATCH /api/brand-facts/:id re-checks ownership when brandId is being moved", async () => {
    ownership.requireBrandFact.mockResolvedValue({ id: "fact-1", brandId: "brand-1" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .patch("/api/brand-facts/fact-1")
      .send({ brandId: "brand-owned-by-another" });

    expect(response.status).toBe(404);
    expect(storageMock.updateBrandFact).not.toHaveBeenCalled();
  });

  it("DELETE /api/brand-facts/:id answers 404 for a fact the caller cannot see", async () => {
    ownership.requireBrandFact.mockRejectedValue(
      new TestOwnershipError("Brand fact not found", 404),
    );

    const response = await request(makeApp()).delete("/api/brand-facts/owned-by-another");

    expect(response.status).toBe(404);
    expect(storageMock.deleteBrandFact).not.toHaveBeenCalled();
  });
});

describe("metrics history routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/metrics-history/:brandId answers 404 for an unowned brand", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get("/api/metrics-history/brand-owned-by-another");

    expect(response.status).toBe(404);
    expect(storageMock.getMetricsHistory).not.toHaveBeenCalled();
  });

  it("GET /api/metrics-history/:brandId defaults days to 30", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    storageMock.getMetricsHistory.mockResolvedValue([]);

    await request(makeApp()).get("/api/metrics-history/brand-1");

    expect(storageMock.getMetricsHistory).toHaveBeenCalledWith("brand-1", undefined, 30);
  });

  it("POST /api/metrics-history/record/:brandId answers 404 for an unowned brand", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).post(
      "/api/metrics-history/record/brand-owned-by-another",
    );

    expect(response.status).toBe(404);
    expect(storageMock.recordCurrentMetrics).not.toHaveBeenCalled();
  });

  it("POST /api/metrics-history/record/:brandId records a snapshot for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });

    const response = await request(makeApp()).post("/api/metrics-history/record/brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "Metrics snapshot recorded" });
    expect(storageMock.recordCurrentMetrics).toHaveBeenCalledWith("brand-1");
  });
});
