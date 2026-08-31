// HTTP-level contract tests for server/routes/contentTypes.ts.
//
// A service-level test passes whether or not the route actually calls the
// service, checks ownership, or maps outcomes to the right status code. These
// tests drive every registration through express + supertest so the wiring
// itself is what's asserted, not the service internals (which are mocked).
//
// Priority per endpoint: ownership (404, never 403/500, and the service must
// not run) > validation > success shape > conflict/limit paths.

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

const { ownership, storageMock, services, rateLimitBuckets, brandProfileCompleteness } = vi.hoisted(
  () => {
    const ownership = {
      requireBrand: vi.fn(),
      requireArticle: vi.fn(),
      requireFaq: vi.fn(),
      requireListicle: vi.fn(),
      requireBofuContent: vi.fn(),
      getUserBrandIds: vi.fn(async () => new Set<string>()),
      pickFields: (body: any, allowed: readonly string[]) => {
        const out: Record<string, unknown> = {};
        if (!body || typeof body !== "object") return out;
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
        }
        return out;
      },
      sendOwnershipError: (res: any, err: any) => {
        if (err && err.name === "OwnershipError") {
          res.status(err.status).json({ success: false, error: err.message });
          return true;
        }
        return false;
      },
    };
    const storageMock = {
      getListicles: vi.fn(),
      tryInsertListicle: vi.fn(),
      updateListicle: vi.fn(),
      deleteListicle: vi.fn(),
      getBrandById: vi.fn(),
      getWikipediaMentions: vi.fn(),
      tryInsertWikipediaMention: vi.fn(),
      getBofuContent: vi.fn(),
      createBofuContent: vi.fn(),
      updateBofuContent: vi.fn(),
      deleteBofuContent: vi.fn(),
      deleteTrackedContentUrlBySource: vi.fn(async () => {}),
      getFaqItems: vi.fn(),
      createFaqItem: vi.fn(),
      updateFaqItem: vi.fn(),
      deleteFaqItem: vi.fn(),
      getGeoToolsSummary: vi.fn(),
    };
    const services = {
      syncTrackedContentUrl: vi.fn(),
      discoverBrandListicles: vi.fn(),
      scanBrandWikipediaMentions: vi.fn(),
      draftWikipediaMention: vi.fn(),
      generateBofuContent: vi.fn(),
      faqGenerationFinalize: vi.fn(),
      optimizeFaq: vi.fn(),
      generateFaqs: vi.fn(),
      recomputeAiSurfaceScoreForEdit: vi.fn(),
    };
    const rateLimitBuckets = { enforceFeatureCooldownOr429: vi.fn(async () => false) };
    const brandProfileCompleteness = { hasEnoughBrandProfile: vi.fn(() => true) };
    return { ownership, storageMock, services, rateLimitBuckets, brandProfileCompleteness };
  },
);

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: ownership.requireBrand,
  requireArticle: ownership.requireArticle,
  requireFaq: ownership.requireFaq,
  requireListicle: ownership.requireListicle,
  requireBofuContent: ownership.requireBofuContent,
  getUserBrandIds: ownership.getUserBrandIds,
  pickFields: ownership.pickFields,
  sendOwnershipError: ownership.sendOwnershipError,
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, err: unknown, fallback: string) => {
    if (ownership.sendOwnershipError(res, err)) return;
    res.status(500).json({ success: false, error: fallback });
  },
}));
vi.mock("../../server/lib/rateLimitBuckets", () => ({
  enforceFeatureCooldownOr429: rateLimitBuckets.enforceFeatureCooldownOr429,
}));
vi.mock("../../server/lib/brandProfileCompleteness", () => ({
  hasEnoughBrandProfile: brandProfileCompleteness.hasEnoughBrandProfile,
}));
vi.mock("../../server/lib/brandGenerationContext", () => ({
  loadBrandGenerationContext: vi.fn(async () => null),
}));
vi.mock("../../server/lib/llmJobs", () => ({ registerLlmJobHandler: vi.fn() }));
vi.mock("../../server/services/trackedContentSync", () => ({
  syncTrackedContentUrl: services.syncTrackedContentUrl,
}));
vi.mock("../../server/services/listicles", () => ({
  discoverBrandListicles: services.discoverBrandListicles,
}));
vi.mock("../../server/services/wikipedia", () => ({
  scanBrandWikipediaMentions: services.scanBrandWikipediaMentions,
  draftWikipediaMention: services.draftWikipediaMention,
}));
vi.mock("../../server/services/bofuContent", () => ({
  generateBofuContent: services.generateBofuContent,
}));
vi.mock("../../server/services/faqs", () => ({
  faqGenerationFinalize: services.faqGenerationFinalize,
  optimizeFaq: services.optimizeFaq,
  generateFaqs: services.generateFaqs,
  recomputeAiSurfaceScoreForEdit: services.recomputeAiSurfaceScoreForEdit,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupContentTypesRoutes } = await import("../../server/routes/contentTypes");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupContentTypesRoutes(app);
  return app;
}

const BRAND_ID = "brand-1";
const brand = { id: BRAND_ID, userId: user.id, name: "Acme" };
const notOwned = new TestOwnershipError("Brand not found", 404);

describe("content-types routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownership.requireBrand.mockResolvedValue(brand);
    ownership.getUserBrandIds.mockResolvedValue(new Set([BRAND_ID]));
    rateLimitBuckets.enforceFeatureCooldownOr429.mockResolvedValue(false);
    brandProfileCompleteness.hasEnoughBrandProfile.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  });

  // ========== LISTICLES ==========

  describe("GET /api/listicles/:brandId", () => {
    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/listicles/other-brand`);
      expect(res.status).toBe(404);
      expect(storageMock.getListicles).not.toHaveBeenCalled();
    });

    it("returns listicles for the brand", async () => {
      storageMock.getListicles.mockResolvedValue([{ id: "l1" }]);
      const res = await request(makeApp()).get(`/api/listicles/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "l1" }] });
      expect(storageMock.getListicles).toHaveBeenCalledWith(BRAND_ID);
    });
  });

  describe("GET /api/listicles", () => {
    it("filters by an owned brandId query param", async () => {
      storageMock.getListicles.mockResolvedValue([{ id: "l1" }]);
      const res = await request(makeApp()).get(`/api/listicles?brandId=${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "l1" }] });
    });

    it("404s for an unowned brandId query param", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/listicles?brandId=other-brand`);
      expect(res.status).toBe(404);
    });

    it("without brandId, only returns listicles for the caller's brands", async () => {
      ownership.getUserBrandIds.mockResolvedValue(new Set(["brand-mine"]));
      storageMock.getListicles.mockResolvedValue([
        { id: "l1", brandId: "brand-mine" },
        { id: "l2", brandId: "brand-not-mine" },
      ]);
      const res = await request(makeApp()).get(`/api/listicles`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: "l1", brandId: "brand-mine" }]);
    });
  });

  describe("POST /api/listicles", () => {
    it("400s when brandId is missing", async () => {
      const res = await request(makeApp()).post(`/api/listicles`).send({ title: "t", url: "u" });
      expect(res.status).toBe(400);
      expect(ownership.requireBrand).not.toHaveBeenCalled();
    });

    it("404s for a brandId the caller does not own", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp())
        .post(`/api/listicles`)
        .send({ brandId: "other-brand", title: "t", url: "u" });
      expect(res.status).toBe(404);
      expect(storageMock.tryInsertListicle).not.toHaveBeenCalled();
    });

    it("400s when title or url is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/listicles`)
        .send({ brandId: BRAND_ID, title: "t" });
      expect(res.status).toBe(400);
    });

    it("409s when the URL is already tracked", async () => {
      storageMock.tryInsertListicle.mockResolvedValue(undefined);
      const res = await request(makeApp())
        .post(`/api/listicles`)
        .send({ brandId: BRAND_ID, title: "t", url: "u" });
      expect(res.status).toBe(409);
    });

    it("creates the listicle", async () => {
      storageMock.tryInsertListicle.mockResolvedValue({ id: "l1" });
      const res = await request(makeApp())
        .post(`/api/listicles`)
        .send({ brandId: BRAND_ID, title: "t", url: "u" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "l1" } });
    });
  });

  describe("PATCH /api/listicles/:id", () => {
    it("404s when the listicle isn't owned", async () => {
      ownership.requireListicle.mockRejectedValue(new TestOwnershipError("Listicle not found"));
      const res = await request(makeApp()).patch(`/api/listicles/l1`).send({ title: "New" });
      expect(res.status).toBe(404);
      expect(storageMock.updateListicle).not.toHaveBeenCalled();
    });

    it("400s for an invalid outreachStatus", async () => {
      ownership.requireListicle.mockResolvedValue({ id: "l1", brandId: BRAND_ID });
      const res = await request(makeApp())
        .patch(`/api/listicles/l1`)
        .send({ outreachStatus: "bogus" });
      expect(res.status).toBe(400);
      expect(storageMock.updateListicle).not.toHaveBeenCalled();
    });

    it("404s when the update target no longer exists", async () => {
      ownership.requireListicle.mockResolvedValue({ id: "l1", brandId: BRAND_ID });
      storageMock.updateListicle.mockResolvedValue(undefined);
      const res = await request(makeApp()).patch(`/api/listicles/l1`).send({ title: "New" });
      expect(res.status).toBe(404);
    });

    it("updates the listicle", async () => {
      ownership.requireListicle.mockResolvedValue({ id: "l1", brandId: BRAND_ID });
      storageMock.updateListicle.mockResolvedValue({ id: "l1", title: "New" });
      const res = await request(makeApp())
        .patch(`/api/listicles/l1`)
        .send({ title: "New", outreachStatus: "contacted" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "l1", title: "New" } });
    });
  });

  describe("DELETE /api/listicles/:id", () => {
    it("404s when the listicle isn't owned", async () => {
      ownership.requireListicle.mockRejectedValue(new TestOwnershipError("Listicle not found"));
      const res = await request(makeApp()).delete(`/api/listicles/l1`);
      expect(res.status).toBe(404);
      expect(storageMock.deleteListicle).not.toHaveBeenCalled();
    });

    it("deletes the listicle", async () => {
      ownership.requireListicle.mockResolvedValue({ id: "l1", brandId: BRAND_ID });
      storageMock.deleteListicle.mockResolvedValue(true);
      const res = await request(makeApp()).delete(`/api/listicles/l1`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe("POST /api/listicles/discover/:brandId", () => {
    it("404s when the brand doesn't belong to the caller", async () => {
      storageMock.getBrandById.mockResolvedValue({ id: "b1", userId: "someone-else" });
      const res = await request(makeApp()).post(`/api/listicles/discover/b1`);
      expect(res.status).toBe(404);
      expect(services.discoverBrandListicles).not.toHaveBeenCalled();
    });

    it("503s when OPENROUTER_API_KEY is unset", async () => {
      delete process.env.OPENROUTER_API_KEY;
      storageMock.getBrandById.mockResolvedValue(brand);
      const res = await request(makeApp()).post(`/api/listicles/discover/${BRAND_ID}`);
      expect(res.status).toBe(503);
      expect(services.discoverBrandListicles).not.toHaveBeenCalled();
    });

    it("400s when the brand profile is too thin", async () => {
      storageMock.getBrandById.mockResolvedValue(brand);
      brandProfileCompleteness.hasEnoughBrandProfile.mockReturnValue(false);
      const res = await request(makeApp()).post(`/api/listicles/discover/${BRAND_ID}`);
      expect(res.status).toBe(400);
      expect(services.discoverBrandListicles).not.toHaveBeenCalled();
    });

    it("returns 429 via the cooldown gate without discovering", async () => {
      storageMock.getBrandById.mockResolvedValue(brand);
      rateLimitBuckets.enforceFeatureCooldownOr429.mockImplementation(async (res: any) => {
        res.status(429).json({ success: false, error: "cooldown" });
        return true;
      });
      const res = await request(makeApp()).post(`/api/listicles/discover/${BRAND_ID}`);
      expect(res.status).toBe(429);
      expect(services.discoverBrandListicles).not.toHaveBeenCalled();
    });

    it("discovers listicles on success", async () => {
      storageMock.getBrandById.mockResolvedValue(brand);
      services.discoverBrandListicles.mockResolvedValue([{ id: "l1" }]);
      const res = await request(makeApp()).post(`/api/listicles/discover/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "l1" }] });
      expect(services.discoverBrandListicles).toHaveBeenCalledWith(BRAND_ID, brand.name);
    });
  });

  // ========== WIKIPEDIA ==========

  describe("GET /api/wikipedia/:brandId", () => {
    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/wikipedia/other-brand`);
      expect(res.status).toBe(404);
    });

    it("returns mentions", async () => {
      storageMock.getWikipediaMentions.mockResolvedValue([{ id: "m1" }]);
      const res = await request(makeApp()).get(`/api/wikipedia/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "m1" }] });
    });
  });

  describe("POST /api/wikipedia", () => {
    it("400s when brandId is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/wikipedia`)
        .send({ pageTitle: "t", pageUrl: "u" });
      expect(res.status).toBe(400);
    });

    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp())
        .post(`/api/wikipedia`)
        .send({ brandId: "other-brand", pageTitle: "t", pageUrl: "u" });
      expect(res.status).toBe(404);
      expect(storageMock.tryInsertWikipediaMention).not.toHaveBeenCalled();
    });

    it("400s when pageTitle or pageUrl is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/wikipedia`)
        .send({ brandId: BRAND_ID, pageTitle: "t" });
      expect(res.status).toBe(400);
    });

    it("409s when the mention already exists", async () => {
      storageMock.tryInsertWikipediaMention.mockResolvedValue(undefined);
      const res = await request(makeApp())
        .post(`/api/wikipedia`)
        .send({ brandId: BRAND_ID, pageTitle: "t", pageUrl: "u" });
      expect(res.status).toBe(409);
    });

    it("creates the mention", async () => {
      storageMock.tryInsertWikipediaMention.mockResolvedValue({ id: "m1" });
      const res = await request(makeApp())
        .post(`/api/wikipedia`)
        .send({ brandId: BRAND_ID, pageTitle: "t", pageUrl: "u" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "m1" } });
    });
  });

  describe("POST /api/wikipedia/scan/:brandId", () => {
    it("404s for an unowned brand, without scanning", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/wikipedia/scan/other-brand`);
      expect(res.status).toBe(404);
      expect(services.scanBrandWikipediaMentions).not.toHaveBeenCalled();
    });

    it("404s when the brand record itself is missing", async () => {
      storageMock.getBrandById.mockResolvedValue(undefined);
      const res = await request(makeApp()).post(`/api/wikipedia/scan/${BRAND_ID}`);
      expect(res.status).toBe(404);
    });

    it("503s when OPENAI_API_KEY is unset", async () => {
      storageMock.getBrandById.mockResolvedValue(brand);
      const original = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const res = await request(makeApp()).post(`/api/wikipedia/scan/${BRAND_ID}`);
      process.env.OPENAI_API_KEY = original;
      expect(res.status).toBe(503);
      expect(services.scanBrandWikipediaMentions).not.toHaveBeenCalled();
    });

    it("400s when the brand profile is too thin", async () => {
      storageMock.getBrandById.mockResolvedValue(brand);
      brandProfileCompleteness.hasEnoughBrandProfile.mockReturnValue(false);
      const res = await request(makeApp()).post(`/api/wikipedia/scan/${BRAND_ID}`);
      expect(res.status).toBe(400);
    });

    it("scans on success", async () => {
      storageMock.getBrandById.mockResolvedValue(brand);
      services.scanBrandWikipediaMentions.mockResolvedValue([{ id: "m1" }]);
      const res = await request(makeApp()).post(`/api/wikipedia/scan/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "m1" }] });
    });
  });

  // ========== BOFU CONTENT ==========

  describe("GET /api/bofu-content/:brandId", () => {
    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/bofu-content/other-brand`);
      expect(res.status).toBe(404);
    });

    it("returns content", async () => {
      storageMock.getBofuContent.mockResolvedValue([{ id: "b1" }]);
      const res = await request(makeApp()).get(`/api/bofu-content/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "b1" }] });
    });
  });

  describe("GET /api/bofu-content", () => {
    it("filters by an owned brandId query param", async () => {
      storageMock.getBofuContent.mockResolvedValue([{ id: "b1" }]);
      const res = await request(makeApp()).get(`/api/bofu-content?brandId=${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "b1" }] });
    });

    it("404s for an unowned brandId query param", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/bofu-content?brandId=other-brand`);
      expect(res.status).toBe(404);
    });

    it("without brandId, only returns the caller's own content", async () => {
      ownership.getUserBrandIds.mockResolvedValue(new Set(["brand-mine"]));
      storageMock.getBofuContent.mockResolvedValue([
        { id: "b1", brandId: "brand-mine" },
        { id: "b2", brandId: "brand-not-mine" },
      ]);
      const res = await request(makeApp()).get(`/api/bofu-content`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: "b1", brandId: "brand-mine" }]);
    });
  });

  describe("POST /api/bofu-content", () => {
    it("400s when brandId is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/bofu-content`)
        .send({ contentType: "x", title: "t", content: "c" });
      expect(res.status).toBe(400);
    });

    it("404s for a brandId the caller does not own", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp())
        .post(`/api/bofu-content`)
        .send({ brandId: "other-brand", contentType: "x", title: "t", content: "c" });
      expect(res.status).toBe(404);
      expect(storageMock.createBofuContent).not.toHaveBeenCalled();
    });

    it("400s when required fields are missing", async () => {
      const res = await request(makeApp())
        .post(`/api/bofu-content`)
        .send({ brandId: BRAND_ID, contentType: "x" });
      expect(res.status).toBe(400);
    });

    it("creates content", async () => {
      storageMock.createBofuContent.mockResolvedValue({ id: "b1" });
      const res = await request(makeApp())
        .post(`/api/bofu-content`)
        .send({ brandId: BRAND_ID, contentType: "x", title: "t", content: "c" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "b1" } });
    });
  });

  describe("PATCH /api/bofu-content/:id", () => {
    it("404s when the content isn't owned", async () => {
      ownership.requireBofuContent.mockRejectedValue(new TestOwnershipError("Content not found"));
      const res = await request(makeApp()).patch(`/api/bofu-content/b1`).send({ title: "New" });
      expect(res.status).toBe(404);
      expect(storageMock.updateBofuContent).not.toHaveBeenCalled();
    });

    it("404s when the update target no longer exists", async () => {
      ownership.requireBofuContent.mockResolvedValue({ id: "b1", brandId: BRAND_ID });
      storageMock.updateBofuContent.mockResolvedValue(undefined);
      const res = await request(makeApp()).patch(`/api/bofu-content/b1`).send({ title: "New" });
      expect(res.status).toBe(404);
    });

    it("syncs the tracked content URL when publishedUrl is touched", async () => {
      ownership.requireBofuContent.mockResolvedValue({ id: "b1", brandId: BRAND_ID });
      storageMock.updateBofuContent.mockResolvedValue({
        id: "b1",
        brandId: BRAND_ID,
        publishedUrl: "https://example.com",
      });
      const res = await request(makeApp())
        .patch(`/api/bofu-content/b1`)
        .send({ publishedUrl: "https://example.com" });
      expect(res.status).toBe(200);
      expect(services.syncTrackedContentUrl).toHaveBeenCalledWith(
        "bofu",
        "b1",
        BRAND_ID,
        "https://example.com",
      );
    });

    it("does not sync when publishedUrl isn't in the update", async () => {
      ownership.requireBofuContent.mockResolvedValue({ id: "b1", brandId: BRAND_ID });
      storageMock.updateBofuContent.mockResolvedValue({ id: "b1", brandId: BRAND_ID });
      const res = await request(makeApp()).patch(`/api/bofu-content/b1`).send({ title: "New" });
      expect(res.status).toBe(200);
      expect(services.syncTrackedContentUrl).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/bofu-content/:id", () => {
    it("404s when the content isn't owned", async () => {
      ownership.requireBofuContent.mockRejectedValue(new TestOwnershipError("Content not found"));
      const res = await request(makeApp()).delete(`/api/bofu-content/b1`);
      expect(res.status).toBe(404);
      expect(storageMock.deleteBofuContent).not.toHaveBeenCalled();
    });

    it("deletes and clears the tracked content registry entry", async () => {
      ownership.requireBofuContent.mockResolvedValue({ id: "b1", brandId: BRAND_ID });
      storageMock.deleteBofuContent.mockResolvedValue(true);
      const res = await request(makeApp()).delete(`/api/bofu-content/b1`);
      expect(res.status).toBe(200);
      expect(storageMock.deleteTrackedContentUrlBySource).toHaveBeenCalledWith("bofu", "b1");
    });
  });

  describe("POST /api/bofu-content/generate", () => {
    it("400s when brandId is missing", async () => {
      const res = await request(makeApp()).post(`/api/bofu-content/generate`).send({});
      expect(res.status).toBe(400);
      expect(services.generateBofuContent).not.toHaveBeenCalled();
    });

    it("404s for a brandId the caller does not own", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp())
        .post(`/api/bofu-content/generate`)
        .send({ brandId: "other-brand" });
      expect(res.status).toBe(404);
      expect(services.generateBofuContent).not.toHaveBeenCalled();
    });

    it("404s when the service reports the brand isn't found", async () => {
      services.generateBofuContent.mockResolvedValue({ kind: "not_found" });
      const res = await request(makeApp())
        .post(`/api/bofu-content/generate`)
        .send({ brandId: BRAND_ID });
      expect(res.status).toBe(404);
    });

    it("400s for an invalid content type", async () => {
      services.generateBofuContent.mockResolvedValue({ kind: "invalid_type" });
      const res = await request(makeApp())
        .post(`/api/bofu-content/generate`)
        .send({ brandId: BRAND_ID, contentType: "bogus" });
      expect(res.status).toBe(400);
    });

    it("returns generated content with tips", async () => {
      services.generateBofuContent.mockResolvedValue({
        kind: "ok",
        data: { id: "b1" },
        tips: ["tip1"],
      });
      const res = await request(makeApp())
        .post(`/api/bofu-content/generate`)
        .send({ brandId: BRAND_ID, contentType: "comparison" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "b1" }, tips: ["tip1"] });
    });
  });

  // ========== FAQs ==========

  describe("GET /api/faqs/:brandId", () => {
    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/faqs/other-brand`);
      expect(res.status).toBe(404);
    });

    it("returns FAQs", async () => {
      storageMock.getFaqItems.mockResolvedValue([{ id: "f1" }]);
      const res = await request(makeApp()).get(`/api/faqs/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "f1" }] });
    });
  });

  describe("GET /api/faqs", () => {
    it("filters by an owned brandId query param", async () => {
      storageMock.getFaqItems.mockResolvedValue([{ id: "f1" }]);
      const res = await request(makeApp()).get(`/api/faqs?brandId=${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "f1" }] });
    });

    it("without brandId, only returns the caller's own FAQs", async () => {
      ownership.getUserBrandIds.mockResolvedValue(new Set(["brand-mine"]));
      storageMock.getFaqItems.mockResolvedValue([
        { id: "f1", brandId: "brand-mine" },
        { id: "f2", brandId: "brand-not-mine" },
      ]);
      const res = await request(makeApp()).get(`/api/faqs`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: "f1", brandId: "brand-mine" }]);
    });
  });

  describe("POST /api/faqs", () => {
    it("400s when brandId is missing", async () => {
      const res = await request(makeApp()).post(`/api/faqs`).send({ question: "q", answer: "a" });
      expect(res.status).toBe(400);
    });

    it("404s for a brandId the caller does not own", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp())
        .post(`/api/faqs`)
        .send({ brandId: "other-brand", question: "q", answer: "a" });
      expect(res.status).toBe(404);
      expect(storageMock.createFaqItem).not.toHaveBeenCalled();
    });

    it("404s when articleId doesn't belong to the caller", async () => {
      ownership.requireArticle.mockRejectedValue(new TestOwnershipError("Article not found"));
      const res = await request(makeApp())
        .post(`/api/faqs`)
        .send({ brandId: BRAND_ID, articleId: "article-not-mine", question: "q", answer: "a" });
      expect(res.status).toBe(404);
      expect(storageMock.createFaqItem).not.toHaveBeenCalled();
    });

    it("400s when question or answer is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/faqs`)
        .send({ brandId: BRAND_ID, question: "q" });
      expect(res.status).toBe(400);
    });

    it("creates the FAQ", async () => {
      storageMock.createFaqItem.mockResolvedValue({ id: "f1" });
      const res = await request(makeApp())
        .post(`/api/faqs`)
        .send({ brandId: BRAND_ID, question: "q", answer: "a" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "f1" } });
    });
  });

  describe("PATCH /api/faqs/:id", () => {
    it("404s when the FAQ isn't owned", async () => {
      ownership.requireFaq.mockRejectedValue(new TestOwnershipError("FAQ not found"));
      const res = await request(makeApp()).patch(`/api/faqs/f1`).send({ question: "New" });
      expect(res.status).toBe(404);
      expect(storageMock.updateFaqItem).not.toHaveBeenCalled();
    });

    it("404s when the update target no longer exists", async () => {
      ownership.requireFaq.mockResolvedValue({ id: "f1", brandId: BRAND_ID });
      storageMock.updateFaqItem.mockResolvedValue(undefined);
      const res = await request(makeApp()).patch(`/api/faqs/f1`).send({ question: "New" });
      expect(res.status).toBe(404);
    });

    it("recomputes aiSurfaceScore when the question changes", async () => {
      ownership.requireFaq.mockResolvedValue({ id: "f1", brandId: BRAND_ID });
      services.recomputeAiSurfaceScoreForEdit.mockResolvedValue(77);
      storageMock.updateFaqItem.mockResolvedValue({ id: "f1", aiSurfaceScore: 77 });
      const res = await request(makeApp()).patch(`/api/faqs/f1`).send({ question: "New q" });
      expect(res.status).toBe(200);
      expect(storageMock.updateFaqItem).toHaveBeenCalledWith(
        "f1",
        expect.objectContaining({ question: "New q", aiSurfaceScore: 77 }),
      );
    });

    it("syncs tracked content when publishedUrl is touched", async () => {
      ownership.requireFaq.mockResolvedValue({ id: "f1", brandId: BRAND_ID });
      storageMock.updateFaqItem.mockResolvedValue({
        id: "f1",
        brandId: BRAND_ID,
        publishedUrl: "https://x.com",
      });
      const res = await request(makeApp())
        .patch(`/api/faqs/f1`)
        .send({ publishedUrl: "https://x.com" });
      expect(res.status).toBe(200);
      expect(services.syncTrackedContentUrl).toHaveBeenCalledWith(
        "faq",
        "f1",
        BRAND_ID,
        "https://x.com",
      );
    });
  });

  describe("DELETE /api/faqs/:id", () => {
    it("404s when the FAQ isn't owned", async () => {
      ownership.requireFaq.mockRejectedValue(new TestOwnershipError("FAQ not found"));
      const res = await request(makeApp()).delete(`/api/faqs/f1`);
      expect(res.status).toBe(404);
      expect(storageMock.deleteFaqItem).not.toHaveBeenCalled();
    });

    it("deletes and clears the tracked content registry entry", async () => {
      ownership.requireFaq.mockResolvedValue({ id: "f1", brandId: BRAND_ID });
      storageMock.deleteFaqItem.mockResolvedValue(true);
      const res = await request(makeApp()).delete(`/api/faqs/f1`);
      expect(res.status).toBe(200);
      expect(storageMock.deleteTrackedContentUrlBySource).toHaveBeenCalledWith("faq", "f1");
    });
  });

  describe("POST /api/faqs/:id/optimize", () => {
    it("404s when the FAQ isn't owned, without optimizing", async () => {
      ownership.requireFaq.mockRejectedValue(new TestOwnershipError("FAQ not found"));
      const res = await request(makeApp()).post(`/api/faqs/f1/optimize`);
      expect(res.status).toBe(404);
      expect(services.optimizeFaq).not.toHaveBeenCalled();
    });

    it("502s when the model output can't be parsed", async () => {
      ownership.requireFaq.mockResolvedValue({ id: "f1", brandId: BRAND_ID });
      services.optimizeFaq.mockResolvedValue({ kind: "parse_error" });
      const res = await request(makeApp()).post(`/api/faqs/f1/optimize`);
      expect(res.status).toBe(502);
    });

    it("returns the optimized FAQ", async () => {
      ownership.requireFaq.mockResolvedValue({ id: "f1", brandId: BRAND_ID });
      services.optimizeFaq.mockResolvedValue({ kind: "ok", faq: { id: "f1", isOptimized: true } });
      const res = await request(makeApp()).post(`/api/faqs/f1/optimize`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "f1", isOptimized: true } });
    });
  });

  describe("POST /api/faqs/generate/:brandId", () => {
    it("404s for an unowned brand, without generating", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/faqs/generate/other-brand`);
      expect(res.status).toBe(404);
      expect(services.generateFaqs).not.toHaveBeenCalled();
    });

    it("404s when the generation context can't be loaded", async () => {
      const { loadBrandGenerationContext } =
        await import("../../server/lib/brandGenerationContext");
      vi.mocked(loadBrandGenerationContext).mockResolvedValue(null as any);
      const res = await request(makeApp()).post(`/api/faqs/generate/${BRAND_ID}`).send({});
      expect(res.status).toBe(404);
      expect(services.generateFaqs).not.toHaveBeenCalled();
    });

    it("429s via the cooldown gate without generating", async () => {
      const { loadBrandGenerationContext } =
        await import("../../server/lib/brandGenerationContext");
      vi.mocked(loadBrandGenerationContext).mockResolvedValue({ brand, facts: [] } as any);
      rateLimitBuckets.enforceFeatureCooldownOr429.mockImplementation(async (res: any) => {
        res.status(429).json({ success: false, error: "cooldown" });
        return true;
      });
      const res = await request(makeApp()).post(`/api/faqs/generate/${BRAND_ID}`).send({});
      expect(res.status).toBe(429);
      expect(services.generateFaqs).not.toHaveBeenCalled();
    });

    it("relays an ai_error status/body from the service", async () => {
      const { loadBrandGenerationContext } =
        await import("../../server/lib/brandGenerationContext");
      vi.mocked(loadBrandGenerationContext).mockResolvedValue({ brand, facts: [] } as any);
      services.generateFaqs.mockResolvedValue({
        kind: "ai_error",
        status: 503,
        body: { success: false, error: "AI unavailable" },
      });
      const res = await request(makeApp()).post(`/api/faqs/generate/${BRAND_ID}`).send({});
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ success: false, error: "AI unavailable" });
    });

    it("502s on a service_error", async () => {
      const { loadBrandGenerationContext } =
        await import("../../server/lib/brandGenerationContext");
      vi.mocked(loadBrandGenerationContext).mockResolvedValue({ brand, facts: [] } as any);
      services.generateFaqs.mockResolvedValue({ kind: "service_error" });
      const res = await request(makeApp()).post(`/api/faqs/generate/${BRAND_ID}`).send({});
      expect(res.status).toBe(502);
    });

    it("202s with a pollUrl on successful kickoff", async () => {
      const { loadBrandGenerationContext } =
        await import("../../server/lib/brandGenerationContext");
      vi.mocked(loadBrandGenerationContext).mockResolvedValue({ brand, facts: [] } as any);
      services.generateFaqs.mockResolvedValue({
        kind: "ok",
        jobId: "job-1",
        status: "pending",
      });
      const res = await request(makeApp()).post(`/api/faqs/generate/${BRAND_ID}`).send({});
      expect(res.status).toBe(202);
      expect(res.body).toEqual({
        success: true,
        jobId: "job-1",
        status: "pending",
        pollUrl: "/api/llm-jobs/job-1",
        message: "Generating FAQs - usually 10-25s.",
      });
    });
  });

  // ========== MISC ==========

  describe("GET /api/geo-tools/summary/:brandId", () => {
    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/geo-tools/summary/other-brand`);
      expect(res.status).toBe(404);
      expect(storageMock.getGeoToolsSummary).not.toHaveBeenCalled();
    });

    it("returns the summary", async () => {
      storageMock.getGeoToolsSummary.mockResolvedValue({ score: 10 });
      const res = await request(makeApp()).get(`/api/geo-tools/summary/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { score: 10 } });
    });
  });

  describe("POST /api/wikipedia/draft/:mentionId", () => {
    it("404s when the mention doesn't exist", async () => {
      storageMock.getWikipediaMentions.mockResolvedValue([]);
      const res = await request(makeApp()).post(`/api/wikipedia/draft/mention-1`);
      expect(res.status).toBe(404);
      expect(services.draftWikipediaMention).not.toHaveBeenCalled();
    });

    it("404s when the mention's brand isn't owned by the caller", async () => {
      storageMock.getWikipediaMentions.mockResolvedValue([
        { id: "mention-1", brandId: "other-brand" },
      ]);
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/wikipedia/draft/mention-1`);
      expect(res.status).toBe(404);
      expect(services.draftWikipediaMention).not.toHaveBeenCalled();
    });

    it("404s when the service can't find the brand", async () => {
      storageMock.getWikipediaMentions.mockResolvedValue([{ id: "mention-1", brandId: BRAND_ID }]);
      services.draftWikipediaMention.mockResolvedValue(null);
      const res = await request(makeApp()).post(`/api/wikipedia/draft/mention-1`);
      expect(res.status).toBe(404);
    });

    it("returns the drafted text", async () => {
      storageMock.getWikipediaMentions.mockResolvedValue([{ id: "mention-1", brandId: BRAND_ID }]);
      services.draftWikipediaMention.mockResolvedValue({ text: "drafted text" });
      const res = await request(makeApp()).post(`/api/wikipedia/draft/mention-1`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { text: "drafted text" } });
    });
  });
});
