// HTTP-level route contracts for server/routes/publications.ts (competitor
// tracking, discovery, and leaderboard endpoints).

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const { storageMock, ownershipMocks, discoverCompetitorsMock } = vi.hoisted(() => ({
  storageMock: {
    getBrandById: vi.fn(),
    getCompetitors: vi.fn(),
    getCompetitorLeaderboard: vi.fn(),
    getBrandsByUserId: vi.fn(),
    createCompetitor: vi.fn(),
    updateCompetitor: vi.fn(),
    deleteCompetitor: vi.fn(),
    ignoreCompetitor: vi.fn(),
    getCompetitorLatestCitations: vi.fn(),
  },
  ownershipMocks: {
    requireBrand: vi.fn(),
    requireCompetitor: vi.fn(),
    getUserBrandIds: vi.fn(),
  },
  discoverCompetitorsMock: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/competitorDiscovery", () => ({
  discoverCompetitors: discoverCompetitorsMock,
}));
vi.mock("../../server/lib/ownership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/ownership")>();
  return {
    ...actual,
    requireUser: () => user,
    requireBrand: ownershipMocks.requireBrand,
    requireCompetitor: ownershipMocks.requireCompetitor,
    getUserBrandIds: ownershipMocks.getUserBrandIds,
  };
});
vi.mock("../../server/lib/routesShared", async (importOriginal) => {
  const { sendOwnershipError } = await import("../../server/lib/ownership");
  return {
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    asyncHandler: (handler: unknown) => handler,
    sendError: (res: express.Response, err: unknown, fallback: string) => {
      if (sendOwnershipError(res, err)) return;
      res.status(500).json({ success: false, error: fallback });
    },
  };
});
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupPublicationsRoutes } = await import("../../server/routes/publications");
const { OwnershipError } = await import("../../server/lib/ownership");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupPublicationsRoutes(app);
  return app;
}

describe("publications routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/competitors/discover/:brandId", () => {
    it("answers 404 for a brand the caller does not own, never running discovery", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: "someone-else" });

      const response = await request(makeApp()).post("/api/competitors/discover/brand-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Brand not found" });
      expect(discoverCompetitorsMock).not.toHaveBeenCalled();
    });

    it("answers 404 for a nonexistent brand", async () => {
      storageMock.getBrandById.mockResolvedValue(undefined);

      const response = await request(makeApp()).post("/api/competitors/discover/brand-1");

      expect(response.status).toBe(404);
    });

    it("runs discovery and returns the inserted count plus the refreshed list", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "brand-1", userId: user.id });
      discoverCompetitorsMock.mockResolvedValue(3);
      storageMock.getCompetitors.mockResolvedValue([{ id: "c-1" }, { id: "c-2" }]);

      const response = await request(makeApp()).post("/api/competitors/discover/brand-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { inserted: 3, competitors: [{ id: "c-1" }, { id: "c-2" }] },
      });
      expect(discoverCompetitorsMock).toHaveBeenCalledWith("brand-1");
    });
  });

  describe("GET /api/competitors/leaderboard", () => {
    it("answers 404 for a brandId the caller does not own", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp()).get("/api/competitors/leaderboard?brandId=brand-1");

      expect(response.status).toBe(404);
      expect(storageMock.getCompetitorLeaderboard).not.toHaveBeenCalled();
    });

    it("returns the leaderboard with totalTracked/withActivity meta for an owned brand", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      storageMock.getCompetitorLeaderboard.mockResolvedValue([
        { isOwn: false, totalCitations: 5 },
        { isOwn: false, totalCitations: 0 },
        { isOwn: true, totalCitations: 9 },
      ]);
      storageMock.getCompetitors.mockResolvedValue([{ id: "c-1" }, { id: "c-2" }, { id: "c-3" }]);

      const response = await request(makeApp()).get("/api/competitors/leaderboard?brandId=brand-1");

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ totalTracked: 3, withActivity: 1 });
    });

    it("aggregates across all of the caller's brands when brandId is omitted", async () => {
      storageMock.getBrandsByUserId.mockResolvedValue([{ id: "brand-1" }, { id: "brand-2" }]);
      storageMock.getCompetitorLeaderboard
        .mockResolvedValueOnce([{ isOwn: false, totalCitations: 1 }])
        .mockResolvedValueOnce([{ isOwn: false, totalCitations: 0 }]);
      storageMock.getCompetitors.mockResolvedValueOnce([{ id: "c-1" }]).mockResolvedValueOnce([]);

      const response = await request(makeApp()).get("/api/competitors/leaderboard");

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ totalTracked: 1, withActivity: 1 });
      expect(ownershipMocks.requireBrand).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/competitors", () => {
    it("answers 404 for a brandId the caller does not own", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp()).get("/api/competitors?brandId=brand-1");

      expect(response.status).toBe(404);
      expect(storageMock.getCompetitors).not.toHaveBeenCalled();
    });

    it("filters to the caller's own brand ids when brandId is omitted", async () => {
      ownershipMocks.getUserBrandIds.mockResolvedValue(new Set(["brand-1"]));
      storageMock.getCompetitors.mockResolvedValue([
        { id: "c-1", brandId: "brand-1" },
        { id: "c-2", brandId: "someone-elses-brand" },
      ]);

      const response = await request(makeApp()).get("/api/competitors");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([{ id: "c-1", brandId: "brand-1" }]);
    });
  });

  describe("POST /api/competitors", () => {
    it("answers 400 when brandId is an empty string (passes zod's string check, fails the explicit one)", async () => {
      const response = await request(makeApp())
        .post("/api/competitors")
        .send({ name: "Acme", domain: "acme.com", brandId: "" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "brandId is required" });
      expect(ownershipMocks.requireBrand).not.toHaveBeenCalled();
    });

    it("answers 400 when name is too long", async () => {
      const response = await request(makeApp())
        .post("/api/competitors")
        .send({ name: "x".repeat(121), domain: "acme.com", brandId: "brand-1" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "name must be 1-120 characters" });
    });

    it("answers 404 for a brandId the caller does not own", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp())
        .post("/api/competitors")
        .send({ name: "Acme", domain: "acme.com", brandId: "brand-1" });

      expect(response.status).toBe(404);
      expect(storageMock.createCompetitor).not.toHaveBeenCalled();
    });

    it("creates the competitor tier-locked to 'core' with no client-supplied relevanceScore", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      storageMock.createCompetitor.mockResolvedValue({ id: "c-1", name: "Acme" });

      const response = await request(makeApp()).post("/api/competitors").send({
        name: "Acme",
        domain: "acme.com",
        brandId: "brand-1",
        relevanceScore: 99,
        tier: "discovered",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: "c-1", name: "Acme" } });
      expect(storageMock.createCompetitor).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "core", relevanceScore: null }),
      );
    });
  });

  describe("PATCH /api/competitors/:id", () => {
    it("answers 404 for a competitor the caller does not own", async () => {
      ownershipMocks.requireCompetitor.mockRejectedValue(
        new OwnershipError(404, "Competitor not found"),
      );

      const response = await request(makeApp())
        .patch("/api/competitors/comp-1")
        .send({ name: "Renamed" });

      expect(response.status).toBe(404);
      expect(storageMock.updateCompetitor).not.toHaveBeenCalled();
    });

    it("answers 400 for an invalid tier value", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });

      const response = await request(makeApp())
        .patch("/api/competitors/comp-1")
        .send({ tier: "bogus" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "tier must be 'core' or 'discovered'",
      });
    });

    it("answers 400 when no editable fields are provided", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });

      const response = await request(makeApp())
        .patch("/api/competitors/comp-1")
        .send({ unknownField: "x" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "no editable fields provided" });
    });

    it("normalizes a comma-separated nameVariations string into a trimmed array", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });
      storageMock.updateCompetitor.mockResolvedValue({ id: "comp-1" });

      const response = await request(makeApp())
        .patch("/api/competitors/comp-1")
        .send({ nameVariations: "Acme Inc, AcmeCo ,  " });

      expect(response.status).toBe(200);
      expect(storageMock.updateCompetitor).toHaveBeenCalledWith("comp-1", {
        nameVariations: ["Acme Inc", "AcmeCo"],
      });
    });
  });

  describe("GET /api/competitors/:id", () => {
    it("answers 404 for a competitor the caller does not own", async () => {
      ownershipMocks.requireCompetitor.mockRejectedValue(
        new OwnershipError(404, "Competitor not found"),
      );

      const response = await request(makeApp()).get("/api/competitors/comp-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Competitor not found" });
    });

    it("returns the competitor for an owned id", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1", name: "Acme" });

      const response = await request(makeApp()).get("/api/competitors/comp-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: "comp-1", name: "Acme" } });
    });
  });

  describe("DELETE /api/competitors/:id", () => {
    it("answers 404 for a competitor the caller does not own", async () => {
      ownershipMocks.requireCompetitor.mockRejectedValue(
        new OwnershipError(404, "Competitor not found"),
      );

      const response = await request(makeApp()).delete("/api/competitors/comp-1");

      expect(response.status).toBe(404);
      expect(storageMock.deleteCompetitor).not.toHaveBeenCalled();
    });

    it("answers 404 when the delete itself finds nothing (already gone)", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });
      storageMock.deleteCompetitor.mockResolvedValue(false);

      const response = await request(makeApp()).delete("/api/competitors/comp-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Competitor not found" });
    });

    it("deletes on success", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });
      storageMock.deleteCompetitor.mockResolvedValue(true);

      const response = await request(makeApp()).delete("/api/competitors/comp-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: "Competitor deleted" });
    });
  });

  describe("POST /api/competitors/:id/ignore", () => {
    it("answers 404 for a competitor the caller does not own", async () => {
      ownershipMocks.requireCompetitor.mockRejectedValue(
        new OwnershipError(404, "Competitor not found"),
      );

      const response = await request(makeApp()).post("/api/competitors/comp-1/ignore");

      expect(response.status).toBe(404);
      expect(storageMock.ignoreCompetitor).not.toHaveBeenCalled();
    });

    it("ignores on success", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });
      storageMock.ignoreCompetitor.mockResolvedValue(true);

      const response = await request(makeApp()).post("/api/competitors/comp-1/ignore");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: "Competitor ignored" });
    });
  });

  describe("GET /api/competitors/:id/latest-citations", () => {
    it("answers 404 for a competitor the caller does not own", async () => {
      ownershipMocks.requireCompetitor.mockRejectedValue(
        new OwnershipError(404, "Competitor not found"),
      );

      const response = await request(makeApp()).get("/api/competitors/comp-1/latest-citations");

      expect(response.status).toBe(404);
      expect(storageMock.getCompetitorLatestCitations).not.toHaveBeenCalled();
    });

    it("returns latest citations for an owned competitor", async () => {
      ownershipMocks.requireCompetitor.mockResolvedValue({ id: "comp-1" });
      storageMock.getCompetitorLatestCitations.mockResolvedValue([{ id: "cite-1" }]);

      const response = await request(makeApp()).get("/api/competitors/comp-1/latest-citations");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [{ id: "cite-1" }] });
    });
  });
});
