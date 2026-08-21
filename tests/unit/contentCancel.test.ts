// Test POST /api/content/:articleId/cancel. The route marks the active job as
// cancelled, and returns 404 (not 403) for non-owned articles per the
// anti-enumeration ownership convention.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

// Required by server modules eagerly loaded through setupContentRoutes.
process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ARTICLE_ID = "33333333-3333-4333-8333-333333333333";
const FOREIGN_ARTICLE_ID = "44444444-4444-4444-8444-444444444444";
const JOB_ID = "55555555-5555-4555-8555-555555555555";

const stubs = vi.hoisted(() => ({
  getJob: vi.fn(),
  getArticle: vi.fn(),
  cancelJob: vi.fn(async () => undefined),
  cancelForArticle: vi.fn(),
  forActor: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = { id: USER_ID };
    next();
  },
}));

// requireArticle: 404 OwnershipError if article doesn't belong to user.
vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<any>("../../server/lib/ownership");
  return {
    ...actual,
    requireUser: (req: express.Request) => ({ id: (req as any).user.id }),
    requireArticle: vi.fn(async (id: string, userId: string) => {
      if (id === ARTICLE_ID && userId === USER_ID) {
        return { id: ARTICLE_ID, userId, brandId: "brand-x", status: "generating", jobId: JOB_ID };
      }
      // Foreign or unknown → ownership 404
      throw new actual.OwnershipError(404, "Article not found");
    }),
  };
});

vi.mock("../../server/storage", () => ({
  storage: {
    // Not used by cancel but referenced via the setupContentRoutes import surface
    getRecentCompletedContentJob: vi.fn(async () => undefined),
    enqueueContentJob: vi.fn(),
    getContentJobByIdAdmin: vi.fn(),
    claimContentJobForSlice: vi.fn(),
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
  // by sibling routes in setupContentRoutes. The cancel route itself
  // doesn't touch db directly.
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
    jobs: {
      get: stubs.getJob,
      cancel: stubs.cancelJob,
      cancelForArticle: stubs.cancelForArticle,
    },
  });
  stubs.cancelForArticle.mockReset();
  stubs.cancelForArticle.mockResolvedValue({ kind: "cancelled", status: "cancelled" });
  stubs.getArticle.mockReset();
  stubs.getArticle.mockImplementation(async (id: string) =>
    id === ARTICLE_ID
      ? { id: ARTICLE_ID, brandId: "brand-x", status: "generating", jobId: JOB_ID }
      : undefined,
  );
  stubs.getJob.mockReset();
  stubs.cancelJob.mockReset();
  stubs.cancelJob.mockResolvedValue({ kind: "cancelled", status: "cancelled" });
});

describe("POST /api/content/:articleId/cancel", () => {
  it("marks the active job as cancelled and returns 200", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", `/api/content/${ARTICLE_ID}/cancel`);
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.data).toEqual({ status: "cancelled" });
    expect(stubs.forActor).toHaveBeenCalledWith({ userId: USER_ID });
    expect(stubs.cancelForArticle).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it("returns 404 for an article owned by another user (anti-enumeration)", async () => {
    stubs.cancelForArticle.mockResolvedValueOnce({ kind: "not_found" });
    const app = buildApp();
    const { status } = await call(app, "POST", `/api/content/${FOREIGN_ARTICLE_ID}/cancel`);
    expect(status).toBe(404);
    expect(stubs.cancelForArticle).toHaveBeenCalledWith(FOREIGN_ARTICLE_ID);
  });

  it("returns the terminal state when completion wins the cancel race", async () => {
    stubs.cancelForArticle.mockResolvedValueOnce({
      kind: "already_terminal",
      status: "succeeded",
    });

    const app = buildApp();
    const { status, body } = await call(app, "POST", `/api/content/${ARTICLE_ID}/cancel`);

    expect(status).toBe(200);
    expect(body).toMatchObject({ data: { status: "succeeded", alreadyTerminal: true } });
  });
});

describe("POST /api/content-jobs/:jobId/cancel", () => {
  it("maps a successful actor-bound cancellation command", async () => {
    stubs.getJob.mockResolvedValue({ id: JOB_ID, status: "running" });
    stubs.cancelJob.mockResolvedValue({ kind: "cancelled", status: "cancelled" });

    const app = buildApp();
    const { status, body } = await call(app, "POST", `/api/content-jobs/${JOB_ID}/cancel`);

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { status: "cancelled" } });
    expect(stubs.cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it("maps a command race that loses ownership to 404", async () => {
    stubs.getJob.mockResolvedValue({ id: JOB_ID, status: "running" });
    stubs.cancelJob.mockResolvedValue({ kind: "not_found" });

    const app = buildApp();
    const { status, body } = await call(app, "POST", `/api/content-jobs/${JOB_ID}/cancel`);

    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: "Job not found" });
  });
});
