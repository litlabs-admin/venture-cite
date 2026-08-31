// HTTP-level route contracts for server/routes/articles.ts.

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

const {
  ownership,
  contentRequestDataMock,
  requestDataMock,
  articles,
  revisions,
  distributions,
  geoRankings,
  bufferPost,
} = vi.hoisted(() => {
  const articles = {
    get: vi.fn(),
    list: vi.fn(),
    createReady: vi.fn(),
    createDraft: vi.fn(),
    update: vi.fn(),
    updateIfVersion: vi.fn(),
    delete: vi.fn(),
  };
  const revisions = { list: vi.fn(), get: vi.fn(), restore: vi.fn() };
  const distributions = { createMany: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn() };
  return {
    ownership: {
      requireBrand: vi.fn(),
      requireArticle: vi.fn(),
      getUserBrandIds: vi.fn(),
    },
    articles,
    revisions,
    distributions,
    contentRequestDataMock: {
      forActor: vi.fn(() => ({ articles, revisions, distributions })),
    },
    requestDataMock: {
      forActor: vi.fn(() => ({ brands: { get: vi.fn() } })),
    },
    geoRankings: {
      createGeoRankingObservation: vi.fn(),
      listGeoRankingsForArticle: vi.fn(),
      listGeoRankingsForOwner: vi.fn(),
      listGeoRankingsByPlatformForOwner: vi.fn(),
    },
    bufferPost: { postToBuffer: vi.fn() },
  };
});

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: ownership.requireBrand,
  requireArticle: ownership.requireArticle,
  getUserBrandIds: ownership.getUserBrandIds,
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, err: unknown, fallback: string) => {
    if (err instanceof TestOwnershipError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: fallback });
  },
}));
vi.mock("../../server/lib/pagination", () => ({
  parsePagination: (req: any) => ({
    limit: Number(req.query.limit) || 100,
    offset: Number(req.query.offset) || 0,
  }),
}));
vi.mock("../../server/lib/bufferPost", () => bufferPost);
vi.mock("../../server/lib/requestActor", () => ({
  createRequestActor: (id: string) => ({ userId: id }),
}));
vi.mock("../../server/data/contentRequestData", () => ({
  contentRequestData: contentRequestDataMock,
}));
vi.mock("../../server/data/requestData", () => ({ requestData: requestDataMock }));
vi.mock("../../server/services/articleDistribution", () => ({
  metadataWithContent: (metadata: unknown, content: string) => ({
    ...(metadata as Record<string, unknown>),
    content,
  }),
  distributeArticleToPlatforms: vi.fn(),
}));
vi.mock("../../server/services/geoRankings", () => geoRankings);
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupArticlesRoutes } = await import("../../server/routes/articles");
const { distributeArticleToPlatforms } = await import("../../server/services/articleDistribution");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupArticlesRoutes(app);
  return app;
}

describe("POST /api/articles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 400 for a body missing required fields", async () => {
    const response = await request(makeApp()).post("/api/articles").send({ title: "x" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Invalid article input" });
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("answers 404 for a brand the caller does not own, without creating the article", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/articles")
      .send({ brandId: "brand-owned-by-someone-else", title: "Title", content: "Body" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(articles.createReady).not.toHaveBeenCalled();
  });

  it("answers 404 for a soft-deleted brand", async () => {
    ownership.requireBrand.mockResolvedValue({
      id: "brand-1",
      userId: user.id,
      deletedAt: new Date(),
    });

    const response = await request(makeApp())
      .post("/api/articles")
      .send({ brandId: "brand-1", title: "Title", content: "Body" });

    expect(response.status).toBe(404);
    expect(articles.createReady).not.toHaveBeenCalled();
  });

  it("creates a ready article for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id, deletedAt: null });
    const created = { id: "article-1", brandId: "brand-1", status: "ready" };
    articles.createReady.mockResolvedValue(created);

    const response = await request(makeApp())
      .post("/api/articles")
      .send({ brandId: "brand-1", title: "Title", content: "Body" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, article: created });
  });
});

describe("POST /api/articles/draft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers 404 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/articles/draft")
      .send({ brandId: "brand-owned-by-someone-else" });

    expect(response.status).toBe(404);
    expect(articles.createDraft).not.toHaveBeenCalled();
  });

  it("creates a draft for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id, deletedAt: null });
    articles.createDraft.mockResolvedValue({ id: "article-1", status: "draft" });

    const response = await request(makeApp())
      .post("/api/articles/draft")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: "article-1", status: "draft" } });
  });
});

describe("GET /api/articles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers 404 when filtering by a brandId the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get("/api/articles?brandId=brand-owned-by-another");

    expect(response.status).toBe(404);
    expect(articles.list).not.toHaveBeenCalled();
  });

  it("defaults status to 'ready' and returns the list with pagination echoed back", async () => {
    articles.list.mockResolvedValue([{ id: "article-1" }]);

    const response = await request(makeApp()).get("/api/articles");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ id: "article-1" }],
      pagination: { limit: 100, offset: 0 },
    });
    expect(articles.list).toHaveBeenCalledWith({
      status: "ready",
      brandId: undefined,
      limit: 100,
      offset: 0,
    });
  });

  it("splits a comma-separated status filter into an array", async () => {
    articles.list.mockResolvedValue([]);

    await request(makeApp()).get("/api/articles?status=draft,generating,failed");

    expect(articles.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: ["draft", "generating", "failed"] }),
    );
  });

  it("treats status=all as no filter", async () => {
    articles.list.mockResolvedValue([]);

    await request(makeApp()).get("/api/articles?status=all");

    expect(articles.list).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });
});

describe("GET /api/articles/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers 404 when the actor cannot read the article", async () => {
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/articles/article-owned-by-another");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Article not found" });
  });

  it("returns the article for the owning actor", async () => {
    const article = { id: "article-1", brandId: "brand-1" };
    articles.get.mockResolvedValue(article);

    const response = await request(makeApp()).get("/api/articles/article-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, article });
  });
});

describe("PUT /api/articles/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers 400 for a body with no article fields", async () => {
    const response = await request(makeApp()).put("/api/articles/article-1").send({});

    expect(response.status).toBe(400);
    expect(articles.update).not.toHaveBeenCalled();
    expect(articles.updateIfVersion).not.toHaveBeenCalled();
  });

  it("answers 404 when updating an article the actor cannot see (no version)", async () => {
    articles.update.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .put("/api/articles/article-owned-by-another")
      .send({ title: "New title" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Article not found" });
  });

  it("returns 409 version_conflict with the current row when a versioned update conflicts", async () => {
    const current = { id: "article-1", version: 5, title: "Current" };
    articles.updateIfVersion.mockResolvedValue(undefined);
    articles.get.mockResolvedValue(current);

    const response = await request(makeApp())
      .put("/api/articles/article-1")
      .send({ title: "Changed", expectedVersion: 4 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, code: "version_conflict", current });
  });

  it("returns 404 when a versioned update target has disappeared entirely", async () => {
    articles.updateIfVersion.mockResolvedValue(undefined);
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .put("/api/articles/article-1")
      .send({ title: "Changed", expectedVersion: 4 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Article not found" });
  });

  it("updates successfully with a matching version", async () => {
    const updated = { id: "article-1", version: 5, title: "Changed" };
    articles.updateIfVersion.mockResolvedValue(updated);

    const response = await request(makeApp())
      .put("/api/articles/article-1")
      .send({ title: "Changed", expectedVersion: 4 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, article: updated });
  });
});

describe("DELETE /api/articles/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers 404 for an article the actor cannot delete", async () => {
    articles.delete.mockResolvedValue(false);

    const response = await request(makeApp()).delete("/api/articles/article-owned-by-another");

    expect(response.status).toBe(404);
  });

  it("deletes an owned article", async () => {
    articles.delete.mockResolvedValue(true);

    const response = await request(makeApp()).delete("/api/articles/article-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});

describe("article revisions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET revisions answers 404 when the article is not visible to the actor", async () => {
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp()).get(
      "/api/articles/article-owned-by-another/revisions",
    );

    expect(response.status).toBe(404);
    expect(revisions.list).not.toHaveBeenCalled();
  });

  it("GET revisions clamps limit to 200", async () => {
    articles.get.mockResolvedValue({ id: "article-1" });
    revisions.list.mockResolvedValue([]);

    await request(makeApp()).get("/api/articles/article-1/revisions?limit=9999");

    expect(revisions.list).toHaveBeenCalledWith("article-1", 200);
  });

  it("GET one revision answers 404 when the revision belongs to a different article", async () => {
    articles.get.mockResolvedValue({ id: "article-1" });
    revisions.get.mockResolvedValue({ id: "rev-1", articleId: "article-2" });

    const response = await request(makeApp()).get("/api/articles/article-1/revisions/rev-1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Revision not found" });
  });

  it("POST restore answers 409 version_conflict with the current article", async () => {
    articles.get.mockResolvedValue({ id: "article-1" });
    const current = { id: "article-1", version: 3 };
    revisions.restore.mockResolvedValue({ kind: "conflict", current });

    const response = await request(makeApp())
      .post("/api/articles/article-1/revisions/rev-1/restore")
      .send({ expectedVersion: 2 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "version_conflict", current });
  });

  it("POST restore answers 400 for empty revision content", async () => {
    revisions.restore.mockResolvedValue({ kind: "invalid_content" });

    const response = await request(makeApp())
      .post("/api/articles/article-1/revisions/rev-1/restore")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Revision content is empty" });
  });

  it("POST restore returns the restored article on success", async () => {
    const restored = { id: "article-1", content: "restored content" };
    revisions.restore.mockResolvedValue({ kind: "ok", article: restored });

    const response = await request(makeApp())
      .post("/api/articles/article-1/revisions/rev-1/restore")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, article: restored });
  });
});

describe("distributions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/distributions answers 400 when the body fails validation", async () => {
    const response = await request(makeApp()).post("/api/distributions").send({ articleId: "a" });

    expect(response.status).toBe(400);
    expect(articles.get).not.toHaveBeenCalled();
  });

  it("POST /api/distributions answers 404 when the article is not visible to the actor", async () => {
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/distributions")
      .send({ articleId: "article-owned-by-another", platforms: ["twitter"] });

    expect(response.status).toBe(404);
    expect(distributions.createMany).not.toHaveBeenCalled();
  });

  it("POST /api/distributions caps platforms at 10", async () => {
    articles.get.mockResolvedValue({ id: "article-1" });
    distributions.createMany.mockResolvedValue([]);
    const platforms = Array.from({ length: 15 }, (_, i) => `platform-${i}`);

    await request(makeApp()).post("/api/distributions").send({ articleId: "article-1", platforms });

    const [rows] = distributions.createMany.mock.calls[0];
    expect(rows).toHaveLength(10);
  });

  it("GET /api/distributions/:articleId answers 404 when the article is hidden from the actor", async () => {
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/distributions/article-owned-by-another");

    expect(response.status).toBe(404);
    expect(distributions.list).not.toHaveBeenCalled();
  });

  it("PATCH distribute/entry answers 400 when content is missing", async () => {
    const response = await request(makeApp()).patch("/api/distribute/entry/dist-1").send({});

    expect(response.status).toBe(400);
    expect(distributions.get).not.toHaveBeenCalled();
  });

  it("PATCH distribute/entry answers 404 for a distribution the actor cannot see", async () => {
    distributions.get.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .patch("/api/distribute/entry/dist-owned-by-another")
      .send({ content: "new copy" });

    expect(response.status).toBe(404);
    expect(distributions.update).not.toHaveBeenCalled();
  });

  it("POST /api/distribute/:articleId answers 404 when the article is hidden from the actor", async () => {
    articles.get.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/distribute/article-owned-by-another")
      .send({ platforms: ["twitter"] });

    expect(response.status).toBe(404);
    expect(distributeArticleToPlatforms).not.toHaveBeenCalled();
  });

  it("POST /api/distribute/:articleId answers 400 when platforms is missing/empty", async () => {
    articles.get.mockResolvedValue({ id: "article-1", brandId: "brand-1" });

    const response = await request(makeApp())
      .post("/api/distribute/article-1")
      .send({ platforms: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "platforms array is required" });
  });

  it("POST /api/distribute/:articleId answers 503 when OPENAI_API_KEY is unset", async () => {
    articles.get.mockResolvedValue({ id: "article-1", brandId: "brand-1" });
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const response = await request(makeApp())
        .post("/api/distribute/article-1")
        .send({ platforms: ["twitter"] });

      expect(response.status).toBe(503);
      expect(distributeArticleToPlatforms).not.toHaveBeenCalled();
    } finally {
      process.env.OPENAI_API_KEY = original;
    }
  });

  it("POST /api/distributions/:distributionId/buffer-post answers 404 for a hidden distribution", async () => {
    distributions.get.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/distributions/dist-owned-by-another/buffer-post")
      .send({ channelId: "channel-1" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "not_found" });
    expect(bufferPost.postToBuffer).not.toHaveBeenCalled();
  });

  it("POST buffer-post answers 400 when channelId is missing", async () => {
    distributions.get.mockResolvedValue({ id: "dist-1", metadata: { content: "hi" } });

    const response = await request(makeApp())
      .post("/api/distributions/dist-1/buffer-post")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "channelId is required" });
  });

  it("POST buffer-post answers 400 no_content when the saved copy is empty", async () => {
    distributions.get.mockResolvedValue({ id: "dist-1", metadata: { content: "   " } });

    const response = await request(makeApp())
      .post("/api/distributions/dist-1/buffer-post")
      .send({ channelId: "channel-1" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "no_content" });
  });

  it("POST buffer-post answers 403 not_connected when Buffer isn't linked", async () => {
    distributions.get.mockResolvedValue({ id: "dist-1", metadata: { content: "hi" } });
    bufferPost.postToBuffer.mockResolvedValue({ ok: false, code: "not_connected" });

    const response = await request(makeApp())
      .post("/api/distributions/dist-1/buffer-post")
      .send({ channelId: "channel-1" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "not_connected" });
  });

  it("POST buffer-post answers 502 rejected with Buffer's message", async () => {
    distributions.get.mockResolvedValue({ id: "dist-1", metadata: { content: "hi" } });
    bufferPost.postToBuffer.mockResolvedValue({
      ok: false,
      code: "rejected",
      message: "duplicate content",
    });

    const response = await request(makeApp())
      .post("/api/distributions/dist-1/buffer-post")
      .send({ channelId: "channel-1" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ success: false, error: "duplicate content" });
  });

  it("POST buffer-post succeeds and persists the platform post id", async () => {
    const distribution = { id: "dist-1", metadata: { content: "hi" } };
    distributions.get.mockResolvedValue(distribution);
    bufferPost.postToBuffer.mockResolvedValue({ ok: true, postId: "post-123" });
    distributions.update.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/distributions/dist-1/buffer-post")
      .send({ channelId: "channel-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { platformPostId: "post-123" } });
    expect(distributions.update).toHaveBeenCalledWith(
      "dist-1",
      expect.objectContaining({ platformPostId: "post-123", status: "scheduled" }),
    );
  });
});

describe("geo-rankings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/geo-rankings answers 400 when articleId is missing", async () => {
    const response = await request(makeApp()).post("/api/geo-rankings").send({});

    expect(response.status).toBe(400);
    expect(ownership.requireArticle).not.toHaveBeenCalled();
  });

  it("POST /api/geo-rankings answers 404 for an article the caller does not own", async () => {
    ownership.requireArticle.mockRejectedValue(new TestOwnershipError("Article not found", 404));

    const response = await request(makeApp())
      .post("/api/geo-rankings")
      .send({ articleId: "article-owned-by-another" });

    expect(response.status).toBe(404);
    expect(geoRankings.createGeoRankingObservation).not.toHaveBeenCalled();
  });

  it("GET /api/geo-rankings?articleId= answers 404 for an unowned article", async () => {
    ownership.requireArticle.mockRejectedValue(new TestOwnershipError("Article not found", 404));

    const response = await request(makeApp()).get(
      "/api/geo-rankings?articleId=article-owned-by-another",
    );

    expect(response.status).toBe(404);
    expect(geoRankings.listGeoRankingsForArticle).not.toHaveBeenCalled();
  });

  it("GET /api/geo-rankings without articleId scopes by the caller's brand ids", async () => {
    ownership.getUserBrandIds.mockResolvedValue(new Set(["brand-1"]));
    geoRankings.listGeoRankingsForOwner.mockResolvedValue([{ id: "ranking-1" }]);

    const response = await request(makeApp()).get("/api/geo-rankings");

    expect(response.status).toBe(200);
    expect(geoRankings.listGeoRankingsForOwner).toHaveBeenCalledWith(new Set(["brand-1"]));
  });

  it("GET /api/geo-rankings/platform/:platform scopes by the caller's brand ids", async () => {
    ownership.getUserBrandIds.mockResolvedValue(new Set(["brand-1"]));
    geoRankings.listGeoRankingsByPlatformForOwner.mockResolvedValue([]);

    const response = await request(makeApp()).get("/api/geo-rankings/platform/chatgpt");

    expect(response.status).toBe(200);
    expect(geoRankings.listGeoRankingsByPlatformForOwner).toHaveBeenCalledWith(
      "chatgpt",
      new Set(["brand-1"]),
    );
  });
});
