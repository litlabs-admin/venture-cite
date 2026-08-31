// HTTP-level contract tests for server/routes/prompts.ts.
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

const { ownership, storageMock, services, citationChecker } = vi.hoisted(() => {
  const ownership = {
    requireBrand: vi.fn(),
    requireCitationRun: vi.fn(),
    sendOwnershipError: (res: any, err: any) => {
      if (err && err.name === "OwnershipError") {
        res.status(err.status).json({ success: false, error: err.message });
        return true;
      }
      return false;
    },
  };
  const storageMock = {
    getBrandPromptsByBrandId: vi.fn(),
    getBrandPromptById: vi.fn(),
    archiveBrandPrompt: vi.fn(),
    reorderBrandPrompts: vi.fn(),
    setBrandPromptPaused: vi.fn(),
    getTagIdsByPromptId: vi.fn(),
    getPromptTagsMapByBrandId: vi.fn(),
    getPromptTagsByBrandId: vi.fn(),
    updatePromptTag: vi.fn(),
    deletePromptTag: vi.fn(),
    attachPromptTag: vi.fn(),
    detachPromptTag: vi.fn(),
    getPromptAudienceMapByBrandId: vi.fn(),
    getPromptAudiencesByBrandId: vi.fn(),
    deletePromptAudience: vi.fn(),
    attachPromptAudience: vi.fn(),
    detachPromptAudience: vi.fn(),
    getLatestSetHealthRun: vi.fn(),
    getPhrasingTestsByPromptId: vi.fn(),
    getPhrasingTestById: vi.fn(),
    getGeoRankingsByBrandPromptIds: vi.fn(),
    getVisibilityProgress: vi.fn(),
    setVisibilityStep: vi.fn(),
    unsetVisibilityStep: vi.fn(),
    getCitationRunsByBrandId: vi.fn(),
    getActiveCitationRuns: vi.fn(),
    getPromptGenerationsByBrandId: vi.fn(),
  };
  const services = {
    generateInitialPrompts: vi.fn(),
    resetTrackedPrompts: vi.fn(),
    acceptPromptSuggestion: vi.fn(),
    createTrackedPrompt: vi.fn(),
    updateTrackedPrompt: vi.fn(),
    archiveTrackedPrompt: vi.fn(),
    createPromptTag: vi.fn(),
    listPromptTagsWithCounts: vi.fn(),
    listPromptAudiencesWithScores: vi.fn(),
    generatePromptAudiencesForBrand: vi.fn(),
    createPromptAudience: vi.fn(),
    runSetHealthAuditForBrand: vi.fn(),
    generatePhrasingsForPrompt: vi.fn(),
    analyzePhrasing: vi.fn(),
    startBrandCitationRun: vi.fn(),
    buildCitationRunStateSnapshot: vi.fn(),
    buildRunDetails: vi.fn(),
    buildBrandPromptResults: vi.fn(),
    generateSuggestedPrompts: vi.fn(),
    diagnosePrompt: vi.fn(),
  };
  const citationChecker = { advanceCitationRun: vi.fn() };
  return { ownership, storageMock, services, citationChecker };
});

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: ownership.requireBrand,
  requireCitationRun: ownership.requireCitationRun,
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
vi.mock("../../server/citationChecker", () => citationChecker);
vi.mock("../../server/lib/suggestionGenerator", () => ({
  generateSuggestedPrompts: services.generateSuggestedPrompts,
}));
vi.mock("../../server/lib/promptDiagnose", () => ({ diagnosePrompt: services.diagnosePrompt }));
vi.mock("../../server/lib/promptScoreHistory", () => ({
  buildPromptScoreHistory: vi.fn(() => ({ history: "built" })),
  resolvePoints: vi.fn(() => 7),
}));
vi.mock("../../server/services/promptPortfolio", () => ({
  generateInitialPrompts: services.generateInitialPrompts,
  resetTrackedPrompts: services.resetTrackedPrompts,
  acceptPromptSuggestion: services.acceptPromptSuggestion,
  createTrackedPrompt: services.createTrackedPrompt,
  updateTrackedPrompt: services.updateTrackedPrompt,
  archiveTrackedPrompt: services.archiveTrackedPrompt,
}));
vi.mock("../../server/services/promptTags", () => ({
  createPromptTag: services.createPromptTag,
  listPromptTagsWithCounts: services.listPromptTagsWithCounts,
}));
vi.mock("../../server/services/promptAudiences", () => ({
  listPromptAudiencesWithScores: services.listPromptAudiencesWithScores,
  generatePromptAudiencesForBrand: services.generatePromptAudiencesForBrand,
  createPromptAudience: services.createPromptAudience,
}));
vi.mock("../../server/services/promptSetHealth", () => ({
  runSetHealthAuditForBrand: services.runSetHealthAuditForBrand,
}));
vi.mock("../../server/services/promptPhrasing", () => ({
  generatePhrasingsForPrompt: services.generatePhrasingsForPrompt,
  analyzePhrasing: services.analyzePhrasing,
}));
vi.mock("../../server/services/citationRuns", () => ({
  startBrandCitationRun: services.startBrandCitationRun,
  buildCitationRunStateSnapshot: services.buildCitationRunStateSnapshot,
}));
vi.mock("../../server/services/citationResults", () => ({
  buildRunDetails: services.buildRunDetails,
  buildBrandPromptResults: services.buildBrandPromptResults,
}));
vi.mock("../../server/services/reDetect", () => ({
  reDetectAllForBrand: vi.fn(async () => ({ outcome: "ok", data: { redetected: true } })),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupPromptsRoutes } = await import("../../server/routes/prompts");
const { reDetectAllForBrand } = await import("../../server/services/reDetect");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupPromptsRoutes(app);
  return app;
}

const BRAND_ID = "brand-1";
const brand = { id: BRAND_ID, userId: user.id };
const notOwned = new TestOwnershipError("Brand not found", 404);

describe("prompts routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownership.requireBrand.mockResolvedValue(brand);
  });

  describe("POST /api/brand-prompts/:brandId/generate", () => {
    it("404s for a brand the caller does not own, without calling the service", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/brand-prompts/other-brand/generate`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Brand not found" });
      expect(services.generateInitialPrompts).not.toHaveBeenCalled();
    });

    it("409s when prompts are already tracked", async () => {
      services.generateInitialPrompts.mockResolvedValue({ outcome: "already_tracked" });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/generate`);
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it("502s on upstream error", async () => {
      services.generateInitialPrompts.mockResolvedValue({
        outcome: "upstream_error",
        error: "model down",
      });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/generate`);
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ success: false, error: "model down" });
    });

    it("returns generated data on success", async () => {
      services.generateInitialPrompts.mockResolvedValue({ outcome: "ok", data: [{ id: "p1" }] });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/generate`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "p1" }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/reset", () => {
    it("400s without confirm: true, and never calls the service", async () => {
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/reset`).send({});
      expect(res.status).toBe(400);
      expect(services.resetTrackedPrompts).not.toHaveBeenCalled();
    });

    it("resets on success", async () => {
      services.resetTrackedPrompts.mockResolvedValue({ outcome: "ok", data: [{ id: "p1" }] });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/reset`)
        .send({ confirm: true });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "p1" }] });
    });
  });

  describe("GET /api/brand-prompts/:brandId/suggestions", () => {
    it("404s for an unowned brand", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/brand-prompts/x/suggestions`);
      expect(res.status).toBe(404);
    });

    it("returns suggested prompts", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([{ id: "s1", status: "suggested" }]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/suggestions`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "s1", status: "suggested" }] });
      expect(storageMock.getBrandPromptsByBrandId).toHaveBeenCalledWith(BRAND_ID, {
        status: "suggested",
      });
    });
  });

  describe("POST /api/brand-prompts/:brandId/suggestions/refresh", () => {
    it("502s when refresh fails entirely", async () => {
      services.generateSuggestedPrompts.mockResolvedValue({ saved: [], error: "boom" });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/suggestions/refresh`,
      );
      expect(res.status).toBe(502);
    });

    it("returns saved suggestions", async () => {
      services.generateSuggestedPrompts.mockResolvedValue({ saved: [{ id: "s1" }] });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/suggestions/refresh`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "s1" }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/suggestions/:suggestionId/accept", () => {
    it("404s for an unowned brand without calling the service", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/brand-prompts/x/suggestions/s1/accept`);
      expect(res.status).toBe(404);
      expect(services.acceptPromptSuggestion).not.toHaveBeenCalled();
    });

    it("404s when suggestion not found", async () => {
      services.acceptPromptSuggestion.mockResolvedValue({ outcome: "not_found" });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/suggestions/s1/accept`,
      );
      expect(res.status).toBe(404);
    });

    it("409s when the tracked set is full", async () => {
      services.acceptPromptSuggestion.mockResolvedValue({
        outcome: "tracked_set_full",
        trackedCount: 10,
        cap: 10,
      });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/suggestions/s1/accept`,
      );
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        success: false,
        error: "tracked_set_full",
        data: { trackedCount: 10, cap: 10 },
      });
    });

    it("returns mode:added on success", async () => {
      services.acceptPromptSuggestion.mockResolvedValue({ outcome: "added" });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/suggestions/s1/accept`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { mode: "added" } });
    });
  });

  describe("DELETE /api/brand-prompts/:brandId/suggestions/:suggestionId", () => {
    it("404s when the suggestion isn't in the brand's suggested list", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([]);
      const res = await request(makeApp()).delete(
        `/api/brand-prompts/${BRAND_ID}/suggestions/missing`,
      );
      expect(res.status).toBe(404);
      expect(storageMock.archiveBrandPrompt).not.toHaveBeenCalled();
    });

    it("archives the suggestion", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([{ id: "s1", status: "suggested" }]);
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/suggestions/s1`);
      expect(res.status).toBe(200);
      expect(storageMock.archiveBrandPrompt).toHaveBeenCalledWith("s1");
    });
  });

  describe("POST /api/brand-prompts/:brandId/prompts", () => {
    it("400s for empty prompt text", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts`)
        .send({ prompt: "  " });
      expect(res.status).toBe(400);
      expect(services.createTrackedPrompt).not.toHaveBeenCalled();
    });

    it("400s for prompt text over 500 chars", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts`)
        .send({ prompt: "a".repeat(501) });
      expect(res.status).toBe(400);
    });

    it("409s for a duplicate prompt", async () => {
      services.createTrackedPrompt.mockResolvedValue({ outcome: "duplicate" });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts`)
        .send({ prompt: "new prompt" });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ success: false, error: "duplicate_prompt" });
    });

    it("creates and returns 201", async () => {
      services.createTrackedPrompt.mockResolvedValue({ outcome: "ok", data: { id: "p1" } });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts`)
        .send({ prompt: "new prompt" });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, data: { id: "p1" } });
    });
  });

  describe("POST /api/brand-prompts/:brandId/prompts/reorder", () => {
    it("400s when ids isn't a string array", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/reorder`)
        .send({ ids: [1, 2] });
      expect(res.status).toBe(400);
    });

    it("400s when an id doesn't belong to the brand", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/reorder`)
        .send({ ids: ["p1", "not-mine"] });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "unknown prompt id" });
      expect(storageMock.reorderBrandPrompts).not.toHaveBeenCalled();
    });

    it("reorders and returns the updated list", async () => {
      storageMock.getBrandPromptsByBrandId
        .mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }])
        .mockResolvedValueOnce([{ id: "p2" }, { id: "p1" }]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/reorder`)
        .send({ ids: ["p2", "p1"] });
      expect(res.status).toBe(200);
      expect(storageMock.reorderBrandPrompts).toHaveBeenCalledWith(BRAND_ID, ["p2", "p1"]);
      expect(res.body).toEqual({ success: true, data: [{ id: "p2" }, { id: "p1" }] });
    });
  });

  describe("PATCH /api/brand-prompts/:brandId/prompts/:promptId", () => {
    it("400s when neither prompt text nor status is present", async () => {
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1`)
        .send({});
      expect(res.status).toBe(400);
      expect(services.updateTrackedPrompt).not.toHaveBeenCalled();
    });

    it("404s when the prompt isn't found", async () => {
      services.updateTrackedPrompt.mockResolvedValue({ outcome: "not_found" });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1`)
        .send({ prompt: "edited" });
      expect(res.status).toBe(404);
    });

    it("400s must_keep_one_tracked", async () => {
      services.updateTrackedPrompt.mockResolvedValue({ outcome: "must_keep_one_tracked" });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1`)
        .send({ status: "archived" });
      expect(res.status).toBe(400);
    });

    it("409s tracked_set_full", async () => {
      services.updateTrackedPrompt.mockResolvedValue({
        outcome: "tracked_set_full",
        trackedCount: 10,
        cap: 10,
      });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1`)
        .send({ status: "tracked" });
      expect(res.status).toBe(409);
    });

    it("updates on success", async () => {
      services.updateTrackedPrompt.mockResolvedValue({ outcome: "ok", data: { id: "p1" } });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1`)
        .send({ prompt: "edited" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "p1" } });
    });
  });

  describe("PATCH /api/brand-prompts/:brandId/prompts/:promptId/pause", () => {
    it("400s when paused isn't boolean", async () => {
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1/pause`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("404s when the prompt isn't tracked in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({
        id: "p1",
        brandId: "other-brand",
        status: "tracked",
      });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1/pause`)
        .send({ paused: true });
      expect(res.status).toBe(404);
      expect(storageMock.setBrandPromptPaused).not.toHaveBeenCalled();
    });

    it("pauses the prompt on success", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({
        id: "p1",
        brandId: BRAND_ID,
        status: "tracked",
      });
      storageMock.setBrandPromptPaused.mockResolvedValue({ id: "p1", paused: true });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/prompts/p1/pause`)
        .send({ paused: true });
      expect(res.status).toBe(200);
      expect(storageMock.setBrandPromptPaused).toHaveBeenCalledWith("p1", true);
    });
  });

  describe("GET /api/brand-prompts/:brandId/prompts/:promptId/diagnose", () => {
    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue(undefined);
      const res = await request(makeApp()).get(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/diagnose`,
      );
      expect(res.status).toBe(404);
      expect(services.diagnosePrompt).not.toHaveBeenCalled();
    });

    it("returns diagnosis data", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      services.diagnosePrompt.mockResolvedValue({ verdict: "ok" });
      const res = await request(makeApp()).get(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/diagnose`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { verdict: "ok" } });
    });
  });

  describe("GET /api/brand-prompts/:brandId/prompts/:promptId", () => {
    it("404s when the prompt belongs to a different brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: "other" });
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/prompts/p1`);
      expect(res.status).toBe(404);
    });

    it("returns the prompt with tagIds", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      storageMock.getTagIdsByPromptId.mockResolvedValue(["t1"]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/prompts/p1`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { id: "p1", brandId: BRAND_ID, tagIds: ["t1"] },
      });
    });
  });

  describe("GET /api/brand-prompts/:brandId/prompt-tags", () => {
    it("returns the tag map", async () => {
      storageMock.getPromptTagsMapByBrandId.mockResolvedValue({ p1: ["t1"] });
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/prompt-tags`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { p1: ["t1"] } });
    });
  });

  describe("GET /api/brand-prompts/:brandId/tags", () => {
    it("returns tags with counts", async () => {
      services.listPromptTagsWithCounts.mockResolvedValue([{ id: "t1", count: 2 }]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/tags`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "t1", count: 2 }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/tags", () => {
    it("400s for empty name", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/tags`)
        .send({ name: "" });
      expect(res.status).toBe(400);
    });

    it("400s for a name over 40 chars", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/tags`)
        .send({ name: "a".repeat(41) });
      expect(res.status).toBe(400);
    });

    it("409s duplicate_tag", async () => {
      services.createPromptTag.mockResolvedValue({ outcome: "duplicate" });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/tags`)
        .send({ name: "Launch" });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ success: false, error: "duplicate_tag" });
    });

    it("creates a tag", async () => {
      services.createPromptTag.mockResolvedValue({ outcome: "ok", data: { id: "t1" } });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/tags`)
        .send({ name: "Launch" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "t1" } });
    });
  });

  describe("PATCH /api/brand-prompts/:brandId/tags/:tagId", () => {
    it("404s when the tag doesn't belong to the brand", async () => {
      storageMock.getPromptTagsByBrandId.mockResolvedValue([]);
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/tags/t1`)
        .send({ name: "New" });
      expect(res.status).toBe(404);
      expect(storageMock.updatePromptTag).not.toHaveBeenCalled();
    });

    it("updates the tag", async () => {
      storageMock.getPromptTagsByBrandId.mockResolvedValue([{ id: "t1" }]);
      storageMock.updatePromptTag.mockResolvedValue({ id: "t1", name: "New" });
      const res = await request(makeApp())
        .patch(`/api/brand-prompts/${BRAND_ID}/tags/t1`)
        .send({ name: "New" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "t1", name: "New" } });
    });
  });

  describe("DELETE /api/brand-prompts/:brandId/tags/:tagId", () => {
    it("404s when the tag doesn't belong to the brand", async () => {
      storageMock.getPromptTagsByBrandId.mockResolvedValue([]);
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/tags/t1`);
      expect(res.status).toBe(404);
      expect(storageMock.deletePromptTag).not.toHaveBeenCalled();
    });

    it("deletes the tag", async () => {
      storageMock.getPromptTagsByBrandId.mockResolvedValue([{ id: "t1" }]);
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/tags/t1`);
      expect(res.status).toBe(200);
      expect(storageMock.deletePromptTag).toHaveBeenCalledWith("t1");
    });
  });

  describe("POST /api/brand-prompts/:brandId/prompts/:promptId/tags", () => {
    it("400s when tagId is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/tags`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: "other" });
      storageMock.getPromptTagsByBrandId.mockResolvedValue([{ id: "t1" }]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/tags`)
        .send({ tagId: "t1" });
      expect(res.status).toBe(404);
      expect(storageMock.attachPromptTag).not.toHaveBeenCalled();
    });

    it("404s when the tag doesn't belong to the brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      storageMock.getPromptTagsByBrandId.mockResolvedValue([]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/tags`)
        .send({ tagId: "t1" });
      expect(res.status).toBe(404);
    });

    it("attaches the tag", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      storageMock.getPromptTagsByBrandId.mockResolvedValue([{ id: "t1" }]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/tags`)
        .send({ tagId: "t1" });
      expect(res.status).toBe(200);
      expect(storageMock.attachPromptTag).toHaveBeenCalledWith("p1", "t1");
    });
  });

  describe("DELETE /api/brand-prompts/:brandId/prompts/:promptId/tags/:tagId", () => {
    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: "other" });
      const res = await request(makeApp()).delete(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/tags/t1`,
      );
      expect(res.status).toBe(404);
      expect(storageMock.detachPromptTag).not.toHaveBeenCalled();
    });

    it("detaches the tag", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      const res = await request(makeApp()).delete(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/tags/t1`,
      );
      expect(res.status).toBe(200);
      expect(storageMock.detachPromptTag).toHaveBeenCalledWith("p1", "t1");
    });
  });

  describe("GET /api/brand-prompts/:brandId/prompt-audiences", () => {
    it("returns the audience map", async () => {
      storageMock.getPromptAudienceMapByBrandId.mockResolvedValue({ p1: ["a1"] });
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/prompt-audiences`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { p1: ["a1"] } });
    });
  });

  describe("GET /api/brand-prompts/:brandId/audiences", () => {
    it("returns audiences with scores", async () => {
      services.listPromptAudiencesWithScores.mockResolvedValue([{ id: "a1" }]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/audiences`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "a1" }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/audiences/generate", () => {
    it("429s on cooldown with Retry-After", async () => {
      services.generatePromptAudiencesForBrand.mockResolvedValue({
        outcome: "cooldown",
        retryAfterSeconds: 30,
      });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/audiences/generate`,
      );
      expect(res.status).toBe(429);
      expect(res.headers["retry-after"]).toBe("30");
      expect(res.body.retryAfterSeconds).toBe(30);
    });

    it("502s on upstream error", async () => {
      services.generatePromptAudiencesForBrand.mockResolvedValue({
        outcome: "upstream_error",
        error: "down",
      });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/audiences/generate`,
      );
      expect(res.status).toBe(502);
    });

    it("returns generated audiences", async () => {
      services.generatePromptAudiencesForBrand.mockResolvedValue({
        outcome: "ok",
        data: [{ id: "a1" }],
      });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/audiences/generate`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "a1" }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/audiences", () => {
    it("400s for empty name", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/audiences`)
        .send({ name: "" });
      expect(res.status).toBe(400);
    });

    it("400s for a name over 60 chars", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/audiences`)
        .send({ name: "a".repeat(61) });
      expect(res.status).toBe(400);
    });

    it("409s duplicate_audience", async () => {
      services.createPromptAudience.mockResolvedValue({ outcome: "duplicate" });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/audiences`)
        .send({ name: "Devs" });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ success: false, error: "duplicate_audience" });
    });

    it("creates the audience, normalizing an invalid funnelStage to null", async () => {
      services.createPromptAudience.mockResolvedValue({ outcome: "ok", data: { id: "a1" } });
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/audiences`)
        .send({ name: "Devs", funnelStage: "NOT_REAL" });
      expect(res.status).toBe(200);
      expect(services.createPromptAudience).toHaveBeenCalledWith(brand, {
        name: "Devs",
        description: null,
        funnelStage: null,
      });
    });
  });

  describe("DELETE /api/brand-prompts/:brandId/audiences/:audienceId", () => {
    it("404s when the audience doesn't belong to the brand", async () => {
      storageMock.getPromptAudiencesByBrandId.mockResolvedValue([]);
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/audiences/a1`);
      expect(res.status).toBe(404);
      expect(storageMock.deletePromptAudience).not.toHaveBeenCalled();
    });

    it("deletes the audience", async () => {
      storageMock.getPromptAudiencesByBrandId.mockResolvedValue([{ id: "a1" }]);
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/audiences/a1`);
      expect(res.status).toBe(200);
      expect(storageMock.deletePromptAudience).toHaveBeenCalledWith("a1");
    });
  });

  describe("POST /api/brand-prompts/:brandId/prompts/:promptId/audiences", () => {
    it("400s when audienceId is missing", async () => {
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/audiences`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: "other" });
      storageMock.getPromptAudiencesByBrandId.mockResolvedValue([{ id: "a1" }]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/audiences`)
        .send({ audienceId: "a1" });
      expect(res.status).toBe(404);
    });

    it("attaches the audience", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      storageMock.getPromptAudiencesByBrandId.mockResolvedValue([{ id: "a1" }]);
      const res = await request(makeApp())
        .post(`/api/brand-prompts/${BRAND_ID}/prompts/p1/audiences`)
        .send({ audienceId: "a1" });
      expect(res.status).toBe(200);
      expect(storageMock.attachPromptAudience).toHaveBeenCalledWith("p1", "a1");
    });
  });

  describe("DELETE /api/brand-prompts/:brandId/prompts/:promptId/audiences/:audienceId", () => {
    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: "other" });
      const res = await request(makeApp()).delete(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/audiences/a1`,
      );
      expect(res.status).toBe(404);
      expect(storageMock.detachPromptAudience).not.toHaveBeenCalled();
    });

    it("detaches the audience", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      const res = await request(makeApp()).delete(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/audiences/a1`,
      );
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/brand-prompts/:brandId/set-health", () => {
    it("returns null when no run exists", async () => {
      storageMock.getLatestSetHealthRun.mockResolvedValue(undefined);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/set-health`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: null });
    });
  });

  describe("POST /api/brand-prompts/:brandId/set-health/run", () => {
    it("429s on cooldown", async () => {
      services.runSetHealthAuditForBrand.mockResolvedValue({
        outcome: "cooldown",
        retryAfterSeconds: 60,
      });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/set-health/run`);
      expect(res.status).toBe(429);
      expect(res.headers["retry-after"]).toBe("60");
    });

    it("returns run data on success", async () => {
      services.runSetHealthAuditForBrand.mockResolvedValue({ outcome: "ok", data: { score: 9 } });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/set-health/run`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { score: 9 } });
    });
  });

  describe("GET /api/brand-prompts/:brandId/prompts/:promptId/phrasings", () => {
    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue(undefined);
      const res = await request(makeApp()).get(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/phrasings`,
      );
      expect(res.status).toBe(404);
    });

    it("returns phrasing tests", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      storageMock.getPhrasingTestsByPromptId.mockResolvedValue([{ id: "t1" }]);
      const res = await request(makeApp()).get(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/phrasings`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "t1" }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/prompts/:promptId/phrasings/generate", () => {
    it("404s when the prompt isn't in this brand", async () => {
      storageMock.getBrandPromptById.mockResolvedValue(undefined);
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/phrasings/generate`,
      );
      expect(res.status).toBe(404);
      expect(services.generatePhrasingsForPrompt).not.toHaveBeenCalled();
    });

    it("502s on upstream error", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      services.generatePhrasingsForPrompt.mockResolvedValue({ outcome: "upstream_error" });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/phrasings/generate`,
      );
      expect(res.status).toBe(502);
    });

    it("returns generated phrasings", async () => {
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      services.generatePhrasingsForPrompt.mockResolvedValue({
        outcome: "ok",
        data: [{ id: "ph1" }],
      });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/prompts/p1/phrasings/generate`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "ph1" }] });
    });
  });

  describe("POST /api/brand-prompts/:brandId/phrasings/:phrasingId/analyze", () => {
    it("404s when the phrasing test doesn't exist", async () => {
      storageMock.getPhrasingTestById.mockResolvedValue(undefined);
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/phrasings/ph1/analyze`,
      );
      expect(res.status).toBe(404);
      expect(services.analyzePhrasing).not.toHaveBeenCalled();
    });

    it("404s when the phrasing's prompt is on a different brand", async () => {
      storageMock.getPhrasingTestById.mockResolvedValue({ id: "ph1", brandPromptId: "p1" });
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: "other" });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/phrasings/ph1/analyze`,
      );
      expect(res.status).toBe(404);
      expect(services.analyzePhrasing).not.toHaveBeenCalled();
    });

    it("returns the analyzed phrasing", async () => {
      storageMock.getPhrasingTestById.mockResolvedValue({ id: "ph1", brandPromptId: "p1" });
      storageMock.getBrandPromptById.mockResolvedValue({ id: "p1", brandId: BRAND_ID });
      services.analyzePhrasing.mockResolvedValue({ id: "ph1", analyzed: true });
      const res = await request(makeApp()).post(
        `/api/brand-prompts/${BRAND_ID}/phrasings/ph1/analyze`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: "ph1", analyzed: true } });
    });
  });

  describe("DELETE /api/brand-prompts/:brandId/prompts/:promptId", () => {
    it("404s when not found", async () => {
      services.archiveTrackedPrompt.mockResolvedValue({ outcome: "not_found" });
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/prompts/p1`);
      expect(res.status).toBe(404);
    });

    it("400s must_keep_one_tracked", async () => {
      services.archiveTrackedPrompt.mockResolvedValue({ outcome: "must_keep_one_tracked" });
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/prompts/p1`);
      expect(res.status).toBe(400);
    });

    it("archives on success", async () => {
      services.archiveTrackedPrompt.mockResolvedValue({ outcome: "ok" });
      const res = await request(makeApp()).delete(`/api/brand-prompts/${BRAND_ID}/prompts/p1`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe("GET /api/brand-prompts/:brandId/prompt-history", () => {
    it("builds history from tracked+archived prompts", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
      storageMock.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/prompt-history`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { history: "built" } });
    });
  });

  describe("GET /api/brand-prompts/:brandId", () => {
    it("returns tracked-only by default, excluding suggestions from status=all filtering N/A", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1", status: "tracked" }]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(storageMock.getBrandPromptsByBrandId).toHaveBeenCalledWith(BRAND_ID, {
        status: "tracked",
      });
    });

    it("status=all filters out suggested rows", async () => {
      storageMock.getBrandPromptsByBrandId.mockResolvedValue([
        { id: "p1", status: "tracked" },
        { id: "p2", status: "suggested" },
        { id: "p3", status: "archived" },
      ]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}?status=all`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.id)).toEqual(["p1", "p3"]);
    });
  });

  describe("GET /api/visibility-progress/:brandId", () => {
    it("groups rows by engineId", async () => {
      storageMock.getVisibilityProgress.mockResolvedValue([
        { engineId: "chatgpt", stepId: "step1" },
        { engineId: "chatgpt", stepId: "step2" },
        { engineId: "gemini", stepId: "step1" },
      ]);
      const res = await request(makeApp()).get(`/api/visibility-progress/${BRAND_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { chatgpt: ["step1", "step2"], gemini: ["step1"] },
      });
    });
  });

  describe("POST /api/visibility-progress/:brandId", () => {
    it("400s when engineId/stepId are missing", async () => {
      const res = await request(makeApp()).post(`/api/visibility-progress/${BRAND_ID}`).send({});
      expect(res.status).toBe(400);
      expect(storageMock.setVisibilityStep).not.toHaveBeenCalled();
    });

    it("saves progress", async () => {
      const res = await request(makeApp())
        .post(`/api/visibility-progress/${BRAND_ID}`)
        .send({ engineId: "chatgpt", stepId: "step1" });
      expect(res.status).toBe(200);
      expect(storageMock.setVisibilityStep).toHaveBeenCalledWith(BRAND_ID, "chatgpt", "step1");
    });
  });

  describe("DELETE /api/visibility-progress/:brandId", () => {
    it("400s when engineId/stepId are missing", async () => {
      const res = await request(makeApp()).delete(`/api/visibility-progress/${BRAND_ID}`).send({});
      expect(res.status).toBe(400);
    });

    it("clears progress", async () => {
      const res = await request(makeApp())
        .delete(`/api/visibility-progress/${BRAND_ID}`)
        .send({ engineId: "chatgpt", stepId: "step1" });
      expect(res.status).toBe(200);
      expect(storageMock.unsetVisibilityStep).toHaveBeenCalledWith(BRAND_ID, "chatgpt", "step1");
    });
  });

  describe("POST /api/brand-prompts/:brandId/run", () => {
    it("503s when checks aren't configured", async () => {
      services.startBrandCitationRun.mockResolvedValue({ outcome: "not_configured" });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/run`);
      expect(res.status).toBe(503);
    });

    it("400s when there are no prompts", async () => {
      services.startBrandCitationRun.mockResolvedValue({ outcome: "no_prompts" });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/run`);
      expect(res.status).toBe(400);
    });

    it("400s when no platforms are selected", async () => {
      services.startBrandCitationRun.mockResolvedValue({ outcome: "no_platforms_selected" });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/run`);
      expect(res.status).toBe(400);
    });

    it("409s already_running with the runId", async () => {
      services.startBrandCitationRun.mockResolvedValue({
        outcome: "already_running",
        runId: "run-1",
      });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/run`);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        success: false,
        error: "already_running",
        data: { runId: "run-1" },
      });
    });

    it("500s when the run couldn't start", async () => {
      services.startBrandCitationRun.mockResolvedValue({ outcome: "start_failed" });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/run`);
      expect(res.status).toBe(500);
    });

    it("starts a run", async () => {
      services.startBrandCitationRun.mockResolvedValue({ outcome: "ok", runId: "run-1" });
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/run`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { runId: "run-1", status: "running" },
      });
    });
  });

  describe("GET /api/brand-prompts/:brandId/history", () => {
    it("caps the limit at 200", async () => {
      storageMock.getCitationRunsByBrandId.mockResolvedValue([]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/history?limit=999`);
      expect(res.status).toBe(200);
      expect(storageMock.getCitationRunsByBrandId).toHaveBeenCalledWith(BRAND_ID, 200);
    });
  });

  describe("GET /api/brands/:brandId/citation-runs/active", () => {
    it("returns active runs", async () => {
      storageMock.getActiveCitationRuns.mockResolvedValue([{ id: "run-1" }]);
      const res = await request(makeApp()).get(`/api/brands/${BRAND_ID}/citation-runs/active`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { runs: [{ id: "run-1" }] } });
    });
  });

  describe("GET /api/brands/:brandId/citation-runs/state", () => {
    it("404s for a brand the caller does not own", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/brands/x/citation-runs/state`);
      expect(res.status).toBe(404);
      expect(services.buildCitationRunStateSnapshot).not.toHaveBeenCalled();
    });

    it("returns the snapshot", async () => {
      services.buildCitationRunStateSnapshot.mockResolvedValue({ runs: [] });
      const res = await request(makeApp()).get(`/api/brands/${BRAND_ID}/citation-runs/state`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { runs: [] } });
    });
  });

  describe("POST /api/brands/:brandId/citation-runs/:runId/advance", () => {
    it("404s for a brand the caller does not own, without advancing", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/brands/x/citation-runs/run-1/advance`);
      expect(res.status).toBe(404);
      expect(citationChecker.advanceCitationRun).not.toHaveBeenCalled();
    });

    it("404s when the run belongs to a different brand than the one in the path", async () => {
      ownership.requireCitationRun.mockResolvedValue({ id: "run-1", brandId: "other-brand" });
      const res = await request(makeApp()).post(
        `/api/brands/${BRAND_ID}/citation-runs/run-1/advance`,
      );
      expect(res.status).toBe(404);
      expect(citationChecker.advanceCitationRun).not.toHaveBeenCalled();
    });

    it("advances the run", async () => {
      ownership.requireCitationRun.mockResolvedValue({ id: "run-1", brandId: BRAND_ID });
      citationChecker.advanceCitationRun.mockResolvedValue({ done: true, status: "completed" });
      const res = await request(makeApp()).post(
        `/api/brands/${BRAND_ID}/citation-runs/run-1/advance`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { runId: "run-1", done: true, status: "completed" },
      });
    });
  });

  describe("GET /api/brand-prompts/:brandId/run/:runId/details", () => {
    it("404s when the run belongs to a different brand", async () => {
      ownership.requireCitationRun.mockResolvedValue({ id: "run-1", brandId: "other-brand" });
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/run/run-1/details`);
      expect(res.status).toBe(404);
      expect(services.buildRunDetails).not.toHaveBeenCalled();
    });

    it("returns run details", async () => {
      ownership.requireCitationRun.mockResolvedValue({ id: "run-1", brandId: BRAND_ID });
      services.buildRunDetails.mockResolvedValue({ rows: [] });
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/run/run-1/details`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { rows: [] } });
    });
  });

  describe("POST /api/brand-prompts/:brandId/re-detect-all", () => {
    it("429s on cooldown", async () => {
      vi.mocked(reDetectAllForBrand).mockResolvedValue({
        outcome: "cooldown",
        retryAfterSeconds: 15,
      } as any);
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/re-detect-all`);
      expect(res.status).toBe(429);
      expect(res.headers["retry-after"]).toBe("15");
    });

    it("returns data on success", async () => {
      vi.mocked(reDetectAllForBrand).mockResolvedValue({
        outcome: "ok",
        data: { redetected: true },
      } as any);
      const res = await request(makeApp()).post(`/api/brand-prompts/${BRAND_ID}/re-detect-all`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { redetected: true } });
    });
  });

  describe("GET /api/brand-prompts/:brandId/generations", () => {
    it("returns generation history", async () => {
      storageMock.getPromptGenerationsByBrandId.mockResolvedValue([{ id: "g1" }]);
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/generations`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [{ id: "g1" }] });
    });
  });

  describe("GET /api/brand-prompts/:brandId/results", () => {
    it("404s for a brand the caller does not own", async () => {
      ownership.requireBrand.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/brand-prompts/x/results`);
      expect(res.status).toBe(404);
      expect(services.buildBrandPromptResults).not.toHaveBeenCalled();
    });

    it("returns results", async () => {
      services.buildBrandPromptResults.mockResolvedValue({ prompts: [] });
      const res = await request(makeApp()).get(`/api/brand-prompts/${BRAND_ID}/results`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { prompts: [] } });
    });
  });
});
