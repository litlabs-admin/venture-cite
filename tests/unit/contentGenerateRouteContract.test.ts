// HTTP-level contract for POST /api/articles/:id/generate, for requests whose
// body fails validation.
//
// B6a-01 deliberately removed this route's unconditional article-status
// pre-check: it read the article outside the enqueue transaction, so it could
// only ever be stale relative to the atomic check inside
// private.request_enqueue_content_generation. That reasoning holds, and the
// well-formed path still goes straight to the atomic check -
// tests/unit/contentGenerateStatusConflict.test.ts owns that case and asserts
// enqueueGeneration is actually reached.
//
// What it did not account for is an invalid body. With no status check on this
// branch, an article already 'generating' answered 400 "keywords are required",
// which names the wrong problem. It is reachable from the UI:
// client/src/pages/content.tsx always posts `keywords: keywords.join(", ")`,
// an empty string when no keyword is set, so a user pressing Generate on an
// in-flight article with no keywords got the misleading error and the client
// lost the `code: "invalid_status"` it branches on.
//
// These assertions pin the ORDER within the invalid-body branch. Driving the
// endpoint through express is the point: the behaviour lives in the route's
// sequencing, and a service-level test cannot see it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const { articles, contentRequestDataMock, services } = vi.hoisted(() => {
  const articles = { get: vi.fn() };
  return {
    articles,
    contentRequestDataMock: { forActor: vi.fn(() => ({ articles, jobs: {} })) },
    services: {
      driveArticleGenerationInBackground: vi.fn(),
      advanceContentJobSlice: vi.fn(),
      autoImproveArticle: vi.fn(),
      computeJobStatePayload: vi.fn(),
      contentLengthForResponse: vi.fn(),
    },
  };
});

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/data/contentRequestData", () => ({
  contentRequestData: contentRequestDataMock,
}));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: vi.fn(),
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  MAX_CONTENT_LENGTH: 100000,
  sendError: (res: express.Response, _error: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/services/contentGeneration", () => services);
vi.mock("../../server/services/keywordResearch", () => ({
  keywordDiscoveryFinalize: vi.fn(),
  suggestKeywords: vi.fn(),
  getPopularTopics: vi.fn(),
  discoverBrandKeywords: vi.fn(),
}));
vi.mock("../../server/contentGenerationWorker", () => ({}));
vi.mock("../../server/lib/rateLimitBuckets", () => ({ enforceFeatureCooldownOr429: vi.fn() }));
vi.mock("../../server/lib/brandProfileCompleteness", () => ({
  hasEnoughBrandProfile: vi.fn(() => true),
}));
vi.mock("../../server/lib/llmJobs", () => ({ registerLlmJobHandler: vi.fn() }));
vi.mock("../../server/lib/requestActor", () => ({
  createRequestActor: (id: string) => ({ userId: id }),
}));
vi.mock("../../server/lib/localFlowSafety", () => ({ liveOpenAIEnabled: () => true }));
vi.mock("../../server/lib/contentGenerationProvider", () => ({
  usesFakeContentGenerationProvider: () => true,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

const { setupContentRoutes } = await import("../../server/routes/content");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupContentRoutes(app);
  return app;
}

const VALID_BODY = { keywords: "seo, geo", industry: "software" };

describe("POST /api/articles/:id/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 404 when the actor cannot read the article", async () => {
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/articles/article-1/generate")
      .send(VALID_BODY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Article not found" });
  });

  // The regression. Both the status and the body are wrong; status must win,
  // because that is the order the client's error handling was written against.
  it("answers 409 invalid_status for a non-draft article even when the body is invalid", async () => {
    articles.get.mockResolvedValue({ id: "article-1", brandId: "brand-1", status: "generating" });

    const response = await request(makeApp())
      .post("/api/articles/article-1/generate")
      .send({ keywords: "", industry: "" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: "Cannot generate - article is in status 'generating'.",
      code: "invalid_status",
    });
  });

  it("answers 409 for a 'ready' article whose body is also invalid", async () => {
    articles.get.mockResolvedValue({ id: "article-1", brandId: "brand-1", status: "ready" });

    const response = await request(makeApp())
      .post("/api/articles/article-1/generate")
      .send({ keywords: "" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("invalid_status");
  });

  // Body validation still runs, and still reports the specific field, once the
  // article is in a state that could actually be generated.
  it("answers 400 keywords are required for a draft article with empty keywords", async () => {
    articles.get.mockResolvedValue({ id: "article-1", brandId: "brand-1", status: "draft" });

    const response = await request(makeApp())
      .post("/api/articles/article-1/generate")
      .send({ keywords: "", industry: "software" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "keywords are required" });
  });

  it("answers 400 industry is required for a failed article missing industry", async () => {
    articles.get.mockResolvedValue({ id: "article-1", brandId: "brand-1", status: "failed" });

    const response = await request(makeApp())
      .post("/api/articles/article-1/generate")
      .send({ keywords: "seo", industry: "" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "industry is required" });
  });
});
