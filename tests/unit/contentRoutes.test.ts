// HTTP-level route contracts for server/routes/content.ts.
//
// POST /api/articles/:id/generate is already covered by
// tests/unit/contentGenerateRouteContract.test.ts and
// tests/unit/contentGenerateStatusConflict.test.ts - this file does not
// duplicate those cases. Everything else registered by setupContentRoutes
// is covered here: job polling/advance/cancel, auto-improve, keyword
// suggestions, popular topics, and the keyword-research CRUD endpoints.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const {
  articles,
  jobs,
  keywords,
  contentRequestDataMock,
  services,
  keywordResearchMock,
  ownershipMocks,
} = vi.hoisted(() => {
  const articles = { get: vi.fn() };
  const jobs = {
    get: vi.fn(),
    getActive: vi.fn(),
    getRecentCompleted: vi.fn(),
    enqueueGeneration: vi.fn(),
    cancel: vi.fn(),
    cancelForArticle: vi.fn(),
  };
  const keywords = {
    list: vi.fn(),
    listTopOpportunities: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    articles,
    jobs,
    keywords,
    contentRequestDataMock: {
      forActor: vi.fn(() => ({ articles, jobs, keywords, revisions: {} })),
    },
    services: {
      driveArticleGenerationInBackground: vi.fn(),
      advanceContentJobSlice: vi.fn(),
      autoImproveArticle: vi.fn(),
      computeJobStatePayload: vi.fn(),
      contentLengthForResponse: vi.fn(),
    },
    keywordResearchMock: {
      keywordDiscoveryFinalize: vi.fn(),
      suggestKeywords: vi.fn(),
      getPopularTopics: vi.fn(),
      discoverBrandKeywords: vi.fn(),
    },
    ownershipMocks: { requireBrand: vi.fn() },
  };
});

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/data/contentRequestData", () => ({
  contentRequestData: contentRequestDataMock,
}));
vi.mock("../../server/lib/ownership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/ownership")>();
  return {
    ...actual,
    requireUser: () => user,
    requireBrand: ownershipMocks.requireBrand,
  };
});
vi.mock("../../server/lib/routesShared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/routesShared")>();
  const { sendOwnershipError } = await import("../../server/lib/ownership");
  return {
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    asyncHandler: (handler: unknown) => handler,
    MAX_CONTENT_LENGTH: actual.MAX_CONTENT_LENGTH,
    sendError: (res: express.Response, err: unknown, fallback: string) => {
      if (sendOwnershipError(res, err)) return;
      res.status(500).json({ success: false, error: fallback });
    },
  };
});
vi.mock("../../server/services/contentGeneration", () => services);
vi.mock("../../server/services/keywordResearch", () => keywordResearchMock);
vi.mock("../../server/contentGenerationWorker", () => ({}));
vi.mock("../../server/lib/rateLimitBuckets", () => ({
  enforceFeatureCooldownOr429: vi.fn(() => false),
}));
vi.mock("../../server/lib/brandProfileCompleteness", () => ({
  hasEnoughBrandProfile: vi.fn(() => true),
}));
vi.mock("../../server/lib/llmJobs", () => ({ registerLlmJobHandler: vi.fn() }));
vi.mock("../../server/lib/requestActor", () => ({
  createRequestActor: (id: string) => ({ userId: id }),
}));
vi.mock("../../server/lib/localFlowSafety", () => ({ liveOpenAIEnabled: vi.fn(() => true) }));
vi.mock("../../server/lib/contentGenerationProvider", () => ({
  usesFakeContentGenerationProvider: vi.fn(() => false),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

const { setupContentRoutes } = await import("../../server/routes/content");
const { hasEnoughBrandProfile } = await import("../../server/lib/brandProfileCompleteness");
const { enforceFeatureCooldownOr429 } = await import("../../server/lib/rateLimitBuckets");
const { liveOpenAIEnabled } = await import("../../server/lib/localFlowSafety");
const { OwnershipError } = await import("../../server/lib/ownership");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupContentRoutes(app);
  return app;
}

describe("content routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.CONTENT_GENERATION_PROVIDER;
    (hasEnoughBrandProfile as any).mockReturnValue(true);
    (enforceFeatureCooldownOr429 as any).mockResolvedValue(false);
    (liveOpenAIEnabled as any).mockReturnValue(true);
  });

  describe("GET /api/content-jobs/active", () => {
    it("returns the active job tagged type: active", async () => {
      jobs.getActive.mockResolvedValue({ id: "job-1", status: "running" });

      const response = await request(makeApp()).get("/api/content-jobs/active");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { id: "job-1", status: "running", type: "active" },
      });
      expect(jobs.getRecentCompleted).not.toHaveBeenCalled();
    });

    it("falls back to the most recent completed job tagged type: completed", async () => {
      jobs.getActive.mockResolvedValue(undefined);
      jobs.getRecentCompleted.mockResolvedValue({ id: "job-2", status: "ready" });

      const response = await request(makeApp()).get("/api/content-jobs/active");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { id: "job-2", status: "ready", type: "completed" },
      });
    });

    it("returns null data when there is neither an active nor a recent job", async () => {
      jobs.getActive.mockResolvedValue(undefined);
      jobs.getRecentCompleted.mockResolvedValue(undefined);

      const response = await request(makeApp()).get("/api/content-jobs/active");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
    });
  });

  describe("GET /api/content-jobs/:jobId", () => {
    it("answers 404 when the job cannot be found for this caller", async () => {
      jobs.get.mockResolvedValue(undefined);

      const response = await request(makeApp()).get("/api/content-jobs/job-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Job not found" });
    });

    it("shapes the job fields on success", async () => {
      jobs.get.mockResolvedValue({
        id: "job-1",
        status: "running",
        articleId: "article-1",
        errorMessage: null,
        requestPayload: { keywords: "seo" },
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: null,
      });

      const response = await request(makeApp()).get("/api/content-jobs/job-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          id: "job-1",
          status: "running",
          articleId: "article-1",
          errorMessage: null,
          errorKind: null,
          requestPayload: { keywords: "seo" },
          createdAt: "2026-01-01T00:00:00.000Z",
          completedAt: null,
        },
      });
    });
  });

  describe("GET /api/content-jobs/:jobId/state", () => {
    it("answers 404 for a job the caller cannot see", async () => {
      jobs.get.mockResolvedValue(undefined);

      const response = await request(makeApp()).get("/api/content-jobs/job-1/state");

      expect(response.status).toBe(404);
      expect(services.computeJobStatePayload).not.toHaveBeenCalled();
    });

    it("returns the computed state payload on success", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "running" });
      services.computeJobStatePayload.mockReturnValue({ phase: "writing", elapsedMs: 1200 });

      const response = await request(makeApp()).get("/api/content-jobs/job-1/state");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { phase: "writing", elapsedMs: 1200 },
      });
    });
  });

  describe("POST /api/content-jobs/:jobId/advance", () => {
    it("answers 404 for an unknown job", async () => {
      jobs.get.mockResolvedValue(undefined);

      const response = await request(makeApp()).post("/api/content-jobs/job-1/advance");

      expect(response.status).toBe(404);
      expect(services.advanceContentJobSlice).not.toHaveBeenCalled();
    });

    it("short-circuits to done:true for an already-terminal job without calling the slice driver", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "ready" });

      const response = await request(makeApp()).post("/api/content-jobs/job-1/advance");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { status: "ready", done: true } });
      expect(services.advanceContentJobSlice).not.toHaveBeenCalled();
    });

    it("reports busy:true without failing when another caller holds the slice lock", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "running" });
      services.advanceContentJobSlice.mockResolvedValue({ kind: "busy", status: "running" });

      const response = await request(makeApp()).post("/api/content-jobs/job-1/advance");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { status: "running", done: false, busy: true },
      });
    });

    it("shapes a successful slice outcome", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "running" });
      services.advanceContentJobSlice.mockResolvedValue({
        outcome: { status: "ready", done: true },
        updatedArticle: { id: "article-1", content: "x".repeat(50) },
      });
      services.contentLengthForResponse.mockReturnValue(50);

      const response = await request(makeApp()).post("/api/content-jobs/job-1/advance");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          status: "ready",
          done: true,
          contentLength: 50,
          errorKind: null,
          errorMessage: null,
        },
      });
    });

    it("marks the response unsuccessful when the slice outcome failed", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "running" });
      services.advanceContentJobSlice.mockResolvedValue({
        outcome: { status: "failed", done: true, errorKind: "timeout", message: "too slow" },
        updatedArticle: { id: "article-1", content: "" },
      });
      services.contentLengthForResponse.mockReturnValue(0);

      const response = await request(makeApp()).post("/api/content-jobs/job-1/advance");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: false,
        data: {
          status: "failed",
          done: true,
          contentLength: 0,
          errorKind: "timeout",
          errorMessage: "too slow",
        },
      });
    });
  });

  describe("POST /api/content-jobs/:jobId/cancel", () => {
    it("answers 404 for an unknown job", async () => {
      jobs.get.mockResolvedValue(undefined);

      const response = await request(makeApp()).post("/api/content-jobs/job-1/cancel");

      expect(response.status).toBe(404);
      expect(jobs.cancel).not.toHaveBeenCalled();
    });

    it("reports alreadyTerminal without calling cancel when the job is already done", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "ready" });

      const response = await request(makeApp()).post("/api/content-jobs/job-1/cancel");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { status: "ready", alreadyTerminal: true },
      });
      expect(jobs.cancel).not.toHaveBeenCalled();
    });

    it("cancels a pending job", async () => {
      jobs.get.mockResolvedValue({ id: "job-1", status: "pending" });
      jobs.cancel.mockResolvedValue({ kind: "ok", status: "cancelled" });

      const response = await request(makeApp()).post("/api/content-jobs/job-1/cancel");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { status: "cancelled" } });
      expect(jobs.cancel).toHaveBeenCalledWith("job-1");
    });
  });

  describe("POST /api/content/:articleId/cancel", () => {
    it("answers 404 when the caller does not own the article", async () => {
      jobs.cancelForArticle.mockResolvedValue({ kind: "not_found" });

      const response = await request(makeApp()).post("/api/content/article-1/cancel");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Article not found" });
    });

    it("reports noActiveJob when the article has nothing running", async () => {
      jobs.cancelForArticle.mockResolvedValue({ kind: "no_active_job", status: "draft" });

      const response = await request(makeApp()).post("/api/content/article-1/cancel");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { status: "draft", noActiveJob: true },
      });
    });

    it("cancels the article's active job", async () => {
      jobs.cancelForArticle.mockResolvedValue({ kind: "ok", status: "cancelled" });

      const response = await request(makeApp()).post("/api/content/article-1/cancel");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { status: "cancelled" } });
    });
  });

  describe("POST /api/articles/:id/improve", () => {
    it("answers 400 for a body with unrecognized fields (schema is .strict())", async () => {
      const response = await request(makeApp())
        .post("/api/articles/article-1/improve")
        .send({ notAField: true });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "Invalid improve input" });
      expect(articles.get).not.toHaveBeenCalled();
    });

    it("answers 404 when the article cannot be found for this caller", async () => {
      articles.get.mockResolvedValue(undefined);

      const response = await request(makeApp()).post("/api/articles/article-1/improve").send({});

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Article not found" });
    });

    it.each([
      [
        "no_content",
        400,
        { success: false, error: "Cannot improve an article with no content yet." },
      ],
      ["too_long", 413, { success: false, error: "Article exceeds 40000 characters." }],
      [
        "unavailable",
        503,
        {
          success: false,
          error: "Auto-Improve is not available. OpenAI API key is not configured.",
        },
      ],
      [
        "empty_response",
        502,
        { success: false, error: "AI returned an empty response. Please try again." },
      ],
      ["not_found", 404, { success: false, error: "Article not found" }],
    ])("maps result.kind=%s to %i", async (kind, status, body) => {
      articles.get.mockResolvedValue({ id: "article-1" });
      services.autoImproveArticle.mockResolvedValue({ kind });

      const response = await request(makeApp()).post("/api/articles/article-1/improve").send({});

      expect(response.status).toBe(status);
      expect(response.body).toEqual(body);
    });

    it("answers 409 with the current version on a version conflict", async () => {
      articles.get.mockResolvedValue({ id: "article-1" });
      services.autoImproveArticle.mockResolvedValue({
        kind: "version_conflict",
        current: { id: "article-1", version: 3 },
      });

      const response = await request(makeApp()).post("/api/articles/article-1/improve").send({});

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error:
          "Article changed since you started editing. Refresh to see the latest content, then re-apply your changes.",
        code: "version_conflict",
        current: { id: "article-1", version: 3 },
      });
    });

    it("returns the improved article on success", async () => {
      articles.get.mockResolvedValue({ id: "article-1" });
      services.autoImproveArticle.mockResolvedValue({
        kind: "ok",
        article: { id: "article-1", version: 2 },
        improvedContent: "better content",
      });

      const response = await request(makeApp())
        .post("/api/articles/article-1/improve")
        .send({ instructions: "make it punchier" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        article: { id: "article-1", version: 2 },
        improvedContent: "better content",
      });
      expect(services.autoImproveArticle).toHaveBeenCalledWith(
        expect.objectContaining({ instructions: "make it punchier", expectedVersion: undefined }),
      );
    });
  });

  describe("POST /api/keyword-suggestions", () => {
    it("returns an empty suggestion list without calling the AI for short input", async () => {
      const response = await request(makeApp())
        .post("/api/keyword-suggestions")
        .send({ input: "a" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, suggestions: [] });
      expect(keywordResearchMock.suggestKeywords).not.toHaveBeenCalled();
    });

    it("answers 503 when the fake content generation provider is forced", async () => {
      process.env.CONTENT_GENERATION_PROVIDER = "fake";

      const response = await request(makeApp())
        .post("/api/keyword-suggestions")
        .send({ input: "seo tools" });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });

    it("returns suggestions from the service on success", async () => {
      keywordResearchMock.suggestKeywords.mockResolvedValue({
        kind: "ok",
        suggestions: ["ai seo", "geo content"],
      });

      const response = await request(makeApp())
        .post("/api/keyword-suggestions")
        .send({ input: "seo tools", industry: "software" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        suggestions: ["ai seo", "geo content"],
      });
      expect(keywordResearchMock.suggestKeywords).toHaveBeenCalledWith("seo tools", "software");
    });

    it("answers 500 when the service reports an error", async () => {
      keywordResearchMock.suggestKeywords.mockResolvedValue({
        kind: "error",
        message: "openai down",
      });

      const response = await request(makeApp())
        .post("/api/keyword-suggestions")
        .send({ input: "seo tools" });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("openai down");
    });
  });

  describe("GET /api/popular-topics", () => {
    it("answers 503 when OpenAI is disabled and the fake provider is off", async () => {
      (liveOpenAIEnabled as any).mockReturnValue(false);

      const response = await request(makeApp()).get("/api/popular-topics");

      expect(response.status).toBe(503);
    });

    it("returns the deterministic fallback when OpenAI is disabled but the fake provider is on", async () => {
      (liveOpenAIEnabled as any).mockReturnValue(false);
      process.env.CONTENT_GENERATION_PROVIDER = "fake";

      const response = await request(makeApp()).get("/api/popular-topics");

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBe(true);
      expect(response.body.topics).toHaveLength(1);
    });

    it("returns service topics when the service succeeds", async () => {
      keywordResearchMock.getPopularTopics.mockResolvedValue({
        kind: "ok",
        topics: [{ topic: "AI SEO" }],
      });

      const response = await request(makeApp()).get("/api/popular-topics?industry=software");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, topics: [{ topic: "AI SEO" }] });
    });

    it("degrades to a fallback list (still 200) when the service errors", async () => {
      keywordResearchMock.getPopularTopics.mockResolvedValue({
        kind: "error",
        topics: [{ topic: "generic" }],
      });

      const response = await request(makeApp()).get("/api/popular-topics");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        topics: [{ topic: "generic" }],
        fallback: true,
      });
    });
  });

  describe("POST /api/keyword-research/discover", () => {
    it("answers 400 when brandId is missing", async () => {
      const response = await request(makeApp()).post("/api/keyword-research/discover").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "Brand ID is required" });
    });

    it("answers 404 for a brand the caller does not own, never calling the AI", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp())
        .post("/api/keyword-research/discover")
        .send({ brandId: "brand-1" });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Brand not found" });
      expect(keywordResearchMock.discoverBrandKeywords).not.toHaveBeenCalled();
    });

    it("answers 400 when the brand profile is too thin to anchor discovery", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      (hasEnoughBrandProfile as any).mockReturnValue(false);

      const response = await request(makeApp())
        .post("/api/keyword-research/discover")
        .send({ brandId: "brand-1" });

      expect(response.status).toBe(400);
      expect(keywordResearchMock.discoverBrandKeywords).not.toHaveBeenCalled();
    });

    it("answers 429 on cooldown without reaching the discovery service", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      (enforceFeatureCooldownOr429 as any).mockImplementation((res: express.Response) => {
        res.status(429).json({ success: false, error: "Try again later" });
        return true;
      });

      const response = await request(makeApp())
        .post("/api/keyword-research/discover")
        .send({ brandId: "brand-1" });

      expect(response.status).toBe(429);
      expect(keywordResearchMock.discoverBrandKeywords).not.toHaveBeenCalled();
    });

    it("relays an ai_error result's status and body verbatim", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      keywordResearchMock.discoverBrandKeywords.mockResolvedValue({
        kind: "ai_error",
        status: 422,
        body: { success: false, error: "bad prompt" },
      });

      const response = await request(makeApp())
        .post("/api/keyword-research/discover")
        .send({ brandId: "brand-1" });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ success: false, error: "bad prompt" });
    });

    it("enqueues a background job and answers 202 on success", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      keywordResearchMock.discoverBrandKeywords.mockResolvedValue({
        kind: "ok",
        jobId: "job-9",
        status: "pending",
      });

      const response = await request(makeApp())
        .post("/api/keyword-research/discover")
        .send({ brandId: "brand-1" });

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        success: true,
        jobId: "job-9",
        status: "pending",
        pollUrl: "/api/llm-jobs/job-9",
      });
    });
  });

  describe("GET /api/keyword-research/:brandId", () => {
    it("answers 404 for a brand the caller does not own", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp()).get("/api/keyword-research/brand-1");

      expect(response.status).toBe(404);
      expect(keywords.list).not.toHaveBeenCalled();
    });

    it("passes through status/category filters for an owned brand", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      keywords.list.mockResolvedValue([{ id: "kw-1" }]);

      const response = await request(makeApp()).get(
        "/api/keyword-research/brand-1?status=discovered&category=blog",
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [{ id: "kw-1" }] });
      expect(keywords.list).toHaveBeenCalledWith("brand-1", {
        status: "discovered",
        category: "blog",
      });
    });
  });

  describe("GET /api/keyword-research/:brandId/opportunities", () => {
    it("answers 404 for an unowned brand", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp()).get("/api/keyword-research/brand-1/opportunities");

      expect(response.status).toBe(404);
      expect(keywords.listTopOpportunities).not.toHaveBeenCalled();
    });

    it("defaults the limit to 10 when ?limit is absent", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      keywords.listTopOpportunities.mockResolvedValue([]);

      const response = await request(makeApp()).get("/api/keyword-research/brand-1/opportunities");

      expect(response.status).toBe(200);
      expect(keywords.listTopOpportunities).toHaveBeenCalledWith("brand-1", 10);
    });
  });

  describe("PATCH /api/keyword-research/:id", () => {
    it("answers 404 when the keyword row does not exist for this caller", async () => {
      keywords.get.mockResolvedValue(undefined);

      const response = await request(makeApp())
        .patch("/api/keyword-research/kw-1")
        .send({ keyword: "new" });

      expect(response.status).toBe(404);
      expect(keywords.update).not.toHaveBeenCalled();
    });

    it("answers 400 for an update with no recognized fields", async () => {
      keywords.get.mockResolvedValue({ id: "kw-1" });

      const response = await request(makeApp()).patch("/api/keyword-research/kw-1").send({});

      expect(response.status).toBe(400);
      expect(keywords.update).not.toHaveBeenCalled();
    });

    it("answers 404 when the update races a delete", async () => {
      keywords.get.mockResolvedValue({ id: "kw-1" });
      keywords.update.mockResolvedValue(undefined);

      const response = await request(makeApp())
        .patch("/api/keyword-research/kw-1")
        .send({ keyword: "renamed" });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Keyword not found" });
    });

    it("updates on success", async () => {
      keywords.get.mockResolvedValue({ id: "kw-1" });
      keywords.update.mockResolvedValue({ id: "kw-1", keyword: "renamed" });

      const response = await request(makeApp())
        .patch("/api/keyword-research/kw-1")
        .send({ keyword: "renamed" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: "kw-1", keyword: "renamed" } });
    });
  });

  describe("DELETE /api/keyword-research/:id", () => {
    it("answers 404 when the keyword row does not exist for this caller", async () => {
      keywords.get.mockResolvedValue(undefined);

      const response = await request(makeApp()).delete("/api/keyword-research/kw-1");

      expect(response.status).toBe(404);
      expect(keywords.delete).not.toHaveBeenCalled();
    });

    it("deletes on success", async () => {
      keywords.get.mockResolvedValue({ id: "kw-1" });
      keywords.delete.mockResolvedValue(true);

      const response = await request(makeApp()).delete("/api/keyword-research/kw-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, deleted: true });
    });
  });
});
