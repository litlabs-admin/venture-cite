// HTTP-level contract tests for server/routes/onboarding.ts.
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
  constructor(status: number, message: string) {
    super(message);
    this.name = "OwnershipError";
    this.status = status;
  }
}

const { ownership, onboardingState, onboardingScrape, onboardingActivation, domain, sentry } =
  vi.hoisted(() => {
    const ownership = {
      requireBrand: vi.fn(),
    };
    const onboardingState = {
      applyOnboardingStatePatch: vi.fn(),
    };
    const onboardingScrape = {
      runOnboardingBrandScrape: vi.fn(),
    };
    const onboardingActivation = {
      confirmOnboardingBrand: vi.fn(),
      retryOnboardingAutopilot: vi.fn(),
      advanceOnboardingAutopilot: vi.fn(),
      getOnboardingAutopilotStatus: vi.fn(),
    };
    const domain = { validateDomain: vi.fn() };
    const sentry = { captureAndFlush: vi.fn() };
    return { ownership, onboardingState, onboardingScrape, onboardingActivation, domain, sentry };
  });

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("@shared/schema", () => ({ resolveTier: () => "free" }));
vi.mock("@shared/validateDomain", () => domain);
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => {
    const u = req.user;
    if (!u) {
      const err = new TestOwnershipError(401, "Not authenticated");
      err.name = "OwnershipError";
      throw err;
    }
    return u;
  },
  requireBrand: ownership.requireBrand,
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, err: unknown, fallback: string) => {
    if (err && (err as any).name === "OwnershipError") {
      res.status((err as any).status).json({ success: false, error: (err as any).message });
      return;
    }
    res.status(500).json({ success: false, error: fallback });
  },
}));
vi.mock("../../server/services/onboardingState", () => onboardingState);
vi.mock("../../server/services/onboardingScrape", () => onboardingScrape);
vi.mock("../../server/services/onboardingActivation", () => onboardingActivation);
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => sentry);

const { setupOnboardingRoutes } = await import("../../server/routes/onboarding");

function makeApp(withUser = true) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (withUser) req.user = user;
    next();
  });
  setupOnboardingRoutes(app);
  return app;
}

const BRAND_ID = "brand-1";
const brand = { id: BRAND_ID, userId: user.id };
const notOwned = new TestOwnershipError(404, "Brand not found");

describe("onboarding routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownership.requireBrand.mockResolvedValue(brand);
  });

  describe("PATCH /api/onboarding/state", () => {
    it("401s when the caller isn't authenticated", async () => {
      const res = await request(makeApp(false)).patch("/api/onboarding/state").send({ a: 1 });
      expect(res.status).toBe(401);
      expect(onboardingState.applyOnboardingStatePatch).not.toHaveBeenCalled();
    });

    it("400s when the body isn't a JSON object", async () => {
      const res = await request(makeApp()).patch("/api/onboarding/state").send([1, 2]);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "Body must be a JSON object." });
    });

    it("400s when no recognized fields are present", async () => {
      onboardingState.applyOnboardingStatePatch.mockResolvedValue({
        kind: "no_fields",
        allowedFields: ["a", "b"],
      });
      const res = await request(makeApp()).patch("/api/onboarding/state").send({ bogus: true });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: "No recognized onboarding fields in body.",
        allowedFields: ["a", "b"],
      });
    });

    it("saves and returns the updated onboarding state", async () => {
      onboardingState.applyOnboardingStatePatch.mockResolvedValue({
        kind: "ok",
        onboardingState: { welcomed: true },
      });
      const res = await request(makeApp()).patch("/api/onboarding/state").send({ welcomed: true });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, onboardingState: { welcomed: true } });
      expect(onboardingState.applyOnboardingStatePatch).toHaveBeenCalledWith(user.id, {
        welcomed: true,
      });
    });
  });

  describe("POST /api/onboarding/scrape-stream", () => {
    it("401s when the caller isn't authenticated", async () => {
      const res = await request(makeApp(false))
        .post("/api/onboarding/scrape-stream")
        .send({ domain: "example.com" });
      expect(res.status).toBe(401);
    });

    it("streams a domain-validation error without running the scrape", async () => {
      domain.validateDomain.mockReturnValue({ valid: false, reason: "Domain is required" });
      const res = await request(makeApp()).post("/api/onboarding/scrape-stream").send({});
      expect(res.status).toBe(200);
      expect(res.text).toContain('"reason":"Domain is required"');
      expect(onboardingScrape.runOnboardingBrandScrape).not.toHaveBeenCalled();
    });

    it("streams a result on success", async () => {
      domain.validateDomain.mockReturnValue({ valid: true, normalized: "example.com" });
      onboardingScrape.runOnboardingBrandScrape.mockResolvedValue({
        kind: "ok",
        data: { brandName: "Example" },
      });
      const res = await request(makeApp())
        .post("/api/onboarding/scrape-stream")
        .send({ domain: "example.com" });
      expect(res.status).toBe(200);
      expect(res.text).toContain('"type":"result"');
      expect(res.text).toContain('"brandName":"Example"');
      expect(onboardingScrape.runOnboardingBrandScrape).toHaveBeenCalledWith(
        "example.com",
        "https://example.com",
        expect.any(Function),
      );
    });

    it("streams an unreachable error", async () => {
      domain.validateDomain.mockReturnValue({ valid: true, normalized: "example.com" });
      onboardingScrape.runOnboardingBrandScrape.mockResolvedValue({
        kind: "unreachable",
        domain: "example.com",
      });
      const res = await request(makeApp())
        .post("/api/onboarding/scrape-stream")
        .send({ domain: "example.com" });
      expect(res.status).toBe(200);
      expect(res.text).toContain("We could not reach example.com");
    });
  });

  describe("POST /api/onboarding/confirm", () => {
    const validBody = {
      brandData: { brandName: "Acme", website: "acme.com" },
      competitors: [],
    };

    it("400s when brandName is missing", async () => {
      const res = await request(makeApp())
        .post("/api/onboarding/confirm")
        .send({ brandData: { website: "acme.com" } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "brandName is required" });
      expect(onboardingActivation.confirmOnboardingBrand).not.toHaveBeenCalled();
    });

    it("400s when website is missing", async () => {
      const res = await request(makeApp())
        .post("/api/onboarding/confirm")
        .send({ brandData: { brandName: "Acme" } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "website is required" });
    });

    it("403s when the brand quota is exceeded", async () => {
      onboardingActivation.confirmOnboardingBrand.mockResolvedValue({
        kind: "quota_exceeded",
        message: "Brand limit reached",
      });
      const res = await request(makeApp()).post("/api/onboarding/confirm").send(validBody);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        success: false,
        error: "Brand limit reached",
        limitReached: true,
      });
    });

    it("confirms and returns the new brandId", async () => {
      onboardingActivation.confirmOnboardingBrand.mockResolvedValue({
        kind: "ok",
        brandId: "new-brand",
      });
      const res = await request(makeApp()).post("/api/onboarding/confirm").send(validBody);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, brandId: "new-brand" });
      expect(onboardingActivation.confirmOnboardingBrand).toHaveBeenCalledWith({
        userId: user.id,
        tier: "free",
        brandName: "Acme",
        website: "acme.com",
        brandData: validBody.brandData,
        competitors: [],
      });
    });
  });

  describe("POST /api/onboarding/autopilot-retry", () => {
    it("400s when brandId is missing", async () => {
      const res = await request(makeApp()).post("/api/onboarding/autopilot-retry").send({});
      expect(res.status).toBe(400);
      expect(ownership.requireBrand).not.toHaveBeenCalled();
    });

    it("404s for a brand the caller does not own, without retrying", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp())
        .post("/api/onboarding/autopilot-retry")
        .send({ brandId: "other-brand" });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Brand not found" });
      expect(onboardingActivation.retryOnboardingAutopilot).not.toHaveBeenCalled();
    });

    it("409s when autopilot isn't in a failed state", async () => {
      onboardingActivation.retryOnboardingAutopilot.mockResolvedValue({ kind: "not_failed" });
      const res = await request(makeApp())
        .post("/api/onboarding/autopilot-retry")
        .send({ brandId: BRAND_ID });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        success: false,
        error: "Autopilot is not in a failed state",
      });
    });

    it("retries on success", async () => {
      onboardingActivation.retryOnboardingAutopilot.mockResolvedValue({ kind: "retrying" });
      const res = await request(makeApp())
        .post("/api/onboarding/autopilot-retry")
        .send({ brandId: BRAND_ID });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(onboardingActivation.retryOnboardingAutopilot).toHaveBeenCalledWith(brand, user.id);
    });
  });

  describe("POST /api/onboarding/autopilot-advance/:brandId", () => {
    it("404s when the brand isn't found", async () => {
      onboardingActivation.advanceOnboardingAutopilot.mockResolvedValue({ kind: "not_found" });
      const res = await request(makeApp()).post("/api/onboarding/autopilot-advance/missing-brand");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Brand not found" });
    });

    it("returns advanced:false when idle", async () => {
      onboardingActivation.advanceOnboardingAutopilot.mockResolvedValue({
        kind: "idle",
        status: "idle",
      });
      const res = await request(makeApp()).post(`/api/onboarding/autopilot-advance/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: "idle", advanced: false },
      });
    });

    it("returns advanced:true with step/progress on success", async () => {
      onboardingActivation.advanceOnboardingAutopilot.mockResolvedValue({
        kind: "advanced",
        status: "running",
        step: "scrape",
        progress: 50,
        error: null,
      });
      const res = await request(makeApp()).post(`/api/onboarding/autopilot-advance/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          status: "running",
          step: "scrape",
          progress: 50,
          error: null,
          advanced: true,
        },
      });
    });
  });

  describe("GET /api/onboarding/autopilot-status/:brandId", () => {
    it("404s when the brand isn't found (or not owned)", async () => {
      onboardingActivation.getOnboardingAutopilotStatus.mockResolvedValue(null);
      const res = await request(makeApp()).get("/api/onboarding/autopilot-status/other-brand");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Brand not found" });
    });

    it("returns the autopilot status", async () => {
      onboardingActivation.getOnboardingAutopilotStatus.mockResolvedValue({
        status: "running",
        step: "scrape",
      });
      const res = await request(makeApp()).get(`/api/onboarding/autopilot-status/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: "running", step: "scrape" },
      });
      expect(onboardingActivation.getOnboardingAutopilotStatus).toHaveBeenCalledWith(
        BRAND_ID,
        user.id,
      );
    });
  });
});
