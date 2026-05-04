// tests/unit/distributionBufferPost.test.ts
//
// Coverage for POST /api/distributions/:distributionId/buffer-post.
// Validates the success path (Buffer mutation succeeds, distribution
// row gets the real post id stamped on) and every error branch
// (not_connected, no_content, not_found, Buffer rejection, network).
//
// Same Express-shim pattern as tests/unit/bufferConnect.test.ts so
// vitest's module mocks behave with the dynamic import.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const stubs = vi.hoisted(() => ({
  getDistributionById: vi.fn(),
  updateDistribution: vi.fn(),
  requireArticle: vi.fn(),
  postToBuffer: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getDistributionById: stubs.getDistributionById,
    updateDistribution: stubs.updateDistribution,
  },
}));

vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => req.user,
  requireArticle: stubs.requireArticle,
  requireBrand: vi.fn(),
  getUserBrandIds: vi.fn(),
  pickFields: <T>(obj: T) => obj,
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("../../server/db", () => ({
  db: {},
  pool: {},
}));

vi.mock("../../server/lib/pagination", () => ({
  parsePagination: () => ({ limit: 50, offset: 0 }),
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { distribution: "gpt-4o-mini" },
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
}));

vi.mock("../../server/lib/bufferPost", () => ({
  postToBuffer: stubs.postToBuffer,
}));

vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: any, _err: unknown, msg: string) => {
    res.status(500).json({ success: false, error: msg });
  },
  // The articles route uses these but only the buffer-post handler is
  // exercised by these tests, so an OpenAI stub is enough.
  openai: {} as unknown,
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  // Pass-through wrapper — production version forwards thrown errors
  // to next(); tests don't exercise the unhandled-rejection path.
  asyncHandler: (fn: any) => fn,
}));

const { setupArticlesRoutes } = await import("../../server/routes/articles");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupArticlesRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  url: string,
  body: unknown = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body,
      params: {},
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        resolve({ status: statusCode, body: payload });
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        if (payload === null) resolve({ status: statusCode, body: null });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  for (const fn of Object.values(stubs)) (fn as any).mockReset?.();
});

describe("POST /api/distributions/:distributionId/buffer-post", () => {
  it("posts to Buffer and stamps the real post id on the distribution row", async () => {
    stubs.getDistributionById.mockResolvedValueOnce({
      id: "dist-1",
      articleId: "article-1",
      platform: "LinkedIn",
      metadata: { content: "Hello world" },
    });
    stubs.requireArticle.mockResolvedValueOnce({ id: "article-1", userId: "user-1" });
    stubs.postToBuffer.mockResolvedValueOnce({ ok: true, postId: "buffer-post-abc" });

    const app = buildApp();
    const { status, body } = await call(app, "/api/distributions/dist-1/buffer-post", {
      channelId: "ch-123",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { platformPostId: "buffer-post-abc" } });
    expect(stubs.postToBuffer).toHaveBeenCalledWith("user-1", "ch-123", "Hello world");
    expect(stubs.updateDistribution).toHaveBeenCalledWith(
      "dist-1",
      expect.objectContaining({
        platformPostId: "buffer-post-abc",
        status: "scheduled",
      }),
    );
  });

  it("returns 403 not_connected when the user has no Buffer key", async () => {
    stubs.getDistributionById.mockResolvedValueOnce({
      id: "dist-1",
      articleId: "article-1",
      metadata: { content: "Hello" },
    });
    stubs.requireArticle.mockResolvedValueOnce({ id: "article-1", userId: "user-1" });
    stubs.postToBuffer.mockResolvedValueOnce({ ok: false, code: "not_connected" });

    const app = buildApp();
    const { status, body } = await call(app, "/api/distributions/dist-1/buffer-post", {
      channelId: "ch-123",
    });

    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: "not_connected" });
    expect(stubs.updateDistribution).not.toHaveBeenCalled();
  });

  it("returns 400 no_content when the distribution has no saved content", async () => {
    stubs.getDistributionById.mockResolvedValueOnce({
      id: "dist-1",
      articleId: "article-1",
      metadata: null,
    });
    stubs.requireArticle.mockResolvedValueOnce({ id: "article-1", userId: "user-1" });

    const app = buildApp();
    const { status, body } = await call(app, "/api/distributions/dist-1/buffer-post", {
      channelId: "ch-123",
    });

    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "no_content" });
    expect(stubs.postToBuffer).not.toHaveBeenCalled();
    expect(stubs.updateDistribution).not.toHaveBeenCalled();
  });

  it("returns 404 not_found when the distribution belongs to another user", async () => {
    stubs.getDistributionById.mockResolvedValueOnce({
      id: "dist-1",
      articleId: "article-2",
      metadata: { content: "Hello" },
    });
    stubs.requireArticle.mockRejectedValueOnce(new Error("not owned"));

    const app = buildApp();
    const { status, body } = await call(app, "/api/distributions/dist-1/buffer-post", {
      channelId: "ch-123",
    });

    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: "not_found" });
    expect(stubs.postToBuffer).not.toHaveBeenCalled();
  });

  it("returns 502 with the Buffer message when Buffer rejects the post", async () => {
    stubs.getDistributionById.mockResolvedValueOnce({
      id: "dist-1",
      articleId: "article-1",
      metadata: { content: "x".repeat(500) },
    });
    stubs.requireArticle.mockResolvedValueOnce({ id: "article-1", userId: "user-1" });
    stubs.postToBuffer.mockResolvedValueOnce({
      ok: false,
      code: "rejected",
      message: "Tweet too long.",
    });

    const app = buildApp();
    const { status, body } = await call(app, "/api/distributions/dist-1/buffer-post", {
      channelId: "ch-123",
    });

    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "Tweet too long." });
    expect(stubs.updateDistribution).not.toHaveBeenCalled();
  });

  it("returns 502 buffer_unreachable on network failure", async () => {
    stubs.getDistributionById.mockResolvedValueOnce({
      id: "dist-1",
      articleId: "article-1",
      metadata: { content: "Hello" },
    });
    stubs.requireArticle.mockResolvedValueOnce({ id: "article-1", userId: "user-1" });
    stubs.postToBuffer.mockResolvedValueOnce({ ok: false, code: "unreachable" });

    const app = buildApp();
    const { status, body } = await call(app, "/api/distributions/dist-1/buffer-post", {
      channelId: "ch-123",
    });

    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "buffer_unreachable" });
    expect(stubs.updateDistribution).not.toHaveBeenCalled();
  });
});
