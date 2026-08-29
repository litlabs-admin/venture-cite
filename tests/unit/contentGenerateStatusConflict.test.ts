// Test POST /api/articles/:id/generate's 409 invalid_status response.
//
// The route used to pre-check article.status itself before calling
// jobs.enqueueGeneration, duplicating the atomic status check that
// private.request_enqueue_content_generation already performs (and
// returns as a typed {kind: "conflict", status} result - see
// contentRequestJobRepository.ts). That route-level check was removed
// (B6a-01) because it read the article outside the transaction that
// enqueues the job, so it could only ever be stale relative to the
// atomic check, never more correct.
//
// This test drives the route with an article whose status the atomic
// enqueue rejects, and asserts the byte-identical 409/invalid_status
// response still comes back - i.e. the atomic path alone covers this
// case now that the redundant pre-check is gone.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

// Required by server modules eagerly loaded through setupContentRoutes.
process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ARTICLE_ID = "33333333-3333-4333-8333-333333333333";

const stubs = vi.hoisted(() => ({
  getArticle: vi.fn(),
  enqueueGeneration: vi.fn(),
  forActor: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = { id: USER_ID };
    next();
  },
}));

vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<any>("../../server/lib/ownership");
  return {
    ...actual,
    requireUser: (req: express.Request) => ({ id: (req as any).user.id }),
  };
});

// Bypass the real rate limiter - it needs a live HTTP request (req.ip,
// res.setHeader wiring) that the lightweight fake req/res below doesn't
// provide. Every other route behavior comes from the real module.
vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});

vi.mock("../../server/storage", () => ({
  storage: {
    getRecentCompletedContentJob: vi.fn(async () => undefined),
    enqueueContentJob: vi.fn(),
    getContentJobByIdAdmin: vi.fn(),
    claimContentJobForSlice: vi.fn(async () => null),
    setArticleReady: vi.fn(),
    setArticleFailed: vi.fn(),
    createRevision: vi.fn(),
    createDraftArticle: vi.fn(),
  },
}));

vi.mock("../../server/data/contentRequestData", () => ({
  contentRequestData: {
    forActor: stubs.forActor,
  },
}));

vi.mock("../../server/lib/usageLimit", () => ({
  withArticleQuota: vi.fn(),
  isUsageLimitError: () => false,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/db", () => {
  // Minimal chainable stub for drizzle calls used at module-load time and
  // by sibling routes in setupContentRoutes. This test's route path
  // doesn't touch db directly - it goes through contentRequestData.
  const chain: any = {};
  chain.set = () => chain;
  chain.where = () => chain;
  chain.from = () => chain;
  chain.limit = () => Promise.resolve([]);
  chain.values = () => ({ returning: async () => [] });
  return {
    db: {
      select: () => chain,
      update: () => chain,
      insert: () => chain,
      delete: () => chain,
    },
    pool: {},
  };
});

vi.mock("../../server/contentGenerationWorker", () => ({
  runArticleSlice: vi.fn(),
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { contentGeneration: "gpt-4o-mini" },
}));

const { setupContentRoutes } = await import("../../server/routes/content");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupContentRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body: body ?? {},
      user: { id: USER_ID },
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
        else resolve({ status: statusCode, body: payload });
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  stubs.forActor.mockReset();
  stubs.forActor.mockReturnValue({
    articles: { get: stubs.getArticle },
    jobs: { enqueueGeneration: stubs.enqueueGeneration },
  });
  stubs.getArticle.mockReset();
  stubs.getArticle.mockImplementation(async (id: string) =>
    id === ARTICLE_ID ? { id: ARTICLE_ID, brandId: "brand-x", status: "generating" } : undefined,
  );
  stubs.enqueueGeneration.mockReset();
  // The atomic enqueue command re-reads the article's status inside its own
  // transaction and rejects it the same way the deleted route-level check
  // used to - this is the source of truth this test exercises.
  stubs.enqueueGeneration.mockResolvedValue({ kind: "conflict", status: "generating" });
});

describe("POST /api/articles/:id/generate", () => {
  it("returns 409 invalid_status when the atomic enqueue rejects a non-draft/failed article", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", `/api/articles/${ARTICLE_ID}/generate`, {
      keywords: "test keyword",
      industry: "software",
    });

    expect(status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: "Cannot generate - article is in status 'generating'.",
      code: "invalid_status",
    });
    expect(stubs.enqueueGeneration).toHaveBeenCalledTimes(1);
  });
});
