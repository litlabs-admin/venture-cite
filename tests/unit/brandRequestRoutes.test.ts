import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };
const otherUser = { id: "22222222-2222-4222-8222-222222222222", accessTier: "free" };

const { authState, requestDataMock, repositories } = vi.hoisted(() => {
  const brands = {
    get: vi.fn(),
    deletionPreview: vi.fn(),
    list: vi.fn(),
    createWithQuota: vi.fn(),
    softDelete: vi.fn(),
    update: vi.fn(),
    updateIfVersion: vi.fn(),
  };
  return {
    authState: {
      user: { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" },
    },
    repositories: { brands },
    requestDataMock: {
      forActor: vi.fn(() => ({ brands, users: {} })),
    },
  };
});

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/data/requestData", () => ({ requestData: requestDataMock }));
vi.mock("../../server/lib/ownership", () => ({ requireUser: () => authState.user }));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, _error: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../../server/lib/usageLimit", () => ({
  withBrandQuota: vi.fn(),
  isUsageLimitError: vi.fn(() => false),
}));
vi.mock("../../server/lib/ssrf", () => ({ safeFetchText: vi.fn() }));
vi.mock("../../server/lib/pageText", () => ({ extractPageContent: vi.fn() }));
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({ getOpenrouterClient: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

import { setupBrandRoutes } from "../../server/routes/brands";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupBrandRoutes(app);
  return app;
}

describe("request-scoped brand routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = user;
  });

  it("lists only brands returned for the authenticated actor", async () => {
    repositories.brands.list.mockResolvedValue([{ id: "brand-a", userId: user.id, name: "A" }]);

    const response = await request(makeApp()).get("/api/brands");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ id: "brand-a", userId: user.id, name: "A" }],
    });
    expect(requestDataMock.forActor).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
    );
  });

  it("returns 404 when the authenticated actor cannot read a brand", async () => {
    repositories.brands.get.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/brands/brand-owned-by-another-user");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(otherUser.id).not.toBe(user.id);
  });

  it("returns 404 when a second authenticated actor cannot read the first user's brand", async () => {
    const ownedBrand = { id: "brand-a", userId: user.id, name: "A" };
    repositories.brands.get.mockResolvedValueOnce(ownedBrand).mockResolvedValueOnce(undefined);

    const ownerResponse = await request(makeApp()).get("/api/brands/brand-a");
    authState.user = otherUser;
    const otherUserResponse = await request(makeApp()).get("/api/brands/brand-a");

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body).toEqual({ success: true, data: ownedBrand });
    expect(otherUserResponse.status).toBe(404);
    expect(otherUserResponse.body).toEqual({ success: false, error: "Brand not found" });
    expect(requestDataMock.forActor.mock.calls.map(([actor]) => actor.userId)).toEqual([
      user.id,
      otherUser.id,
    ]);
  });

  it("returns 409 with the current brand when a versioned update conflicts", async () => {
    const existing = { id: "brand-a", userId: user.id, name: "Before conflict", version: 3 };
    const current = { id: "brand-a", userId: user.id, name: "Current", version: 4 };
    repositories.brands.get.mockResolvedValueOnce(existing).mockResolvedValueOnce(current);
    repositories.brands.updateIfVersion.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .put("/api/brands/brand-a")
      .send({ name: "Changed", expectedVersion: 3 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: "version_conflict",
      current,
    });
    expect(repositories.brands.updateIfVersion).toHaveBeenCalledWith("brand-a", 3, {
      name: "Changed",
    });
    expect(repositories.brands.get).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when a brand disappears during a versioned update", async () => {
    const existing = { id: "brand-a", userId: user.id, name: "Before deletion", version: 3 };
    repositories.brands.get.mockResolvedValueOnce(existing).mockResolvedValueOnce(undefined);
    repositories.brands.updateIfVersion.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .put("/api/brands/brand-a")
      .send({ name: "Changed", expectedVersion: 3 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(repositories.brands.get).toHaveBeenCalledTimes(2);
  });

  it("returns an owned brand deletion preview", async () => {
    repositories.brands.deletionPreview.mockResolvedValue({
      articles: 2,
      prompts: 3,
      citationRuns: 4,
    });

    const response = await request(makeApp()).get("/api/brands/brand-a/deletion-preview");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { articles: 2, prompts: 3, citationRuns: 4 },
    });
    expect(repositories.brands.deletionPreview).toHaveBeenCalledWith("brand-a");
  });

  it("returns 404 when an actor cannot read a deletion preview", async () => {
    repositories.brands.deletionPreview.mockResolvedValue(undefined);

    const response = await request(makeApp()).get(
      "/api/brands/brand-owned-by-another-user/deletion-preview",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(repositories.brands.deletionPreview).toHaveBeenCalledWith("brand-owned-by-another-user");
  });

  it("updates an accessible brand without a version", async () => {
    const updated = { id: "brand-a", userId: user.id, name: "Changed", version: 5 };
    repositories.brands.get.mockResolvedValue({ id: "brand-a", userId: user.id, version: 4 });
    repositories.brands.update.mockResolvedValue(updated);

    const response = await request(makeApp()).put("/api/brands/brand-a").send({ name: "Changed" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: updated });
    expect(repositories.brands.update).toHaveBeenCalledWith("brand-a", { name: "Changed" });
  });

  it("creates a brand through the actor-bound repository and quota lock", async () => {
    repositories.brands.list.mockResolvedValue([]);
    const created = { id: "brand-new", userId: user.id, name: "New brand" };
    repositories.brands.createWithQuota.mockResolvedValue(created);

    const response = await request(makeApp()).post("/api/brands").send({
      name: "New brand",
      companyName: "New company",
      industry: "Software",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: created });
    expect(repositories.brands.createWithQuota).toHaveBeenCalledWith(
      {
        name: "New brand",
        companyName: "New company",
        industry: "Software",
        factScrapeEnabled: undefined,
        description: undefined,
        website: undefined,
        tone: undefined,
        targetAudience: undefined,
        products: undefined,
        keyValues: undefined,
        uniqueSellingPoints: undefined,
        brandVoice: undefined,
        sampleContent: undefined,
        nameVariations: undefined,
        logoUrl: undefined,
      },
      1,
    );
  });

  it("returns a limit response when the actor-bound quota check rejects creation", async () => {
    repositories.brands.list.mockResolvedValue([]);
    const { RequestBrandQuotaError } = await import("../../server/data/requestBrandRepository");
    repositories.brands.createWithQuota.mockRejectedValue(new RequestBrandQuotaError(1));

    const response = await request(makeApp()).post("/api/brands").send({
      name: "Over limit",
      companyName: "Over limit company",
      industry: "Software",
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, limitReached: true });
    expect(response.body.error).toContain("free plan allows 1");
  });

  it("soft-deletes an owned brand through the actor-bound repository", async () => {
    const existing = { id: "brand-a", userId: user.id, name: "A" };
    const deleted = {
      ...existing,
      deletedAt: new Date("2026-08-22T00:00:00.000Z"),
      deletionScheduledFor: new Date("2026-08-23T00:00:00.000Z"),
    };
    repositories.brands.get.mockResolvedValue(existing);
    repositories.brands.softDelete.mockResolvedValue(deleted);

    const response = await request(makeApp()).delete("/api/brands/brand-a");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      scheduledFor: "2026-08-23T00:00:00.000Z",
    });
    expect(repositories.brands.softDelete).toHaveBeenCalledWith("brand-a");
  });

  it("does not soft-delete a brand hidden from the actor", async () => {
    repositories.brands.get.mockResolvedValue(undefined);

    const response = await request(makeApp()).delete("/api/brands/brand-owned-by-another-user");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(repositories.brands.softDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when an update target is not visible to the actor", async () => {
    repositories.brands.get.mockResolvedValue(undefined);

    const response = await request(makeApp()).put("/api/brands/brand-owned-by-another-user").send({
      name: "Changed",
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(repositories.brands.update).not.toHaveBeenCalled();
    expect(repositories.brands.updateIfVersion).not.toHaveBeenCalled();
  });
});
