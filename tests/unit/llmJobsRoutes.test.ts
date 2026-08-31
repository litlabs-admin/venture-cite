// HTTP-level contract tests for server/routes/llmJobs.ts.
//
// Ownership here is bespoke: the handler queries db directly (not via
// requireBrand) to gate on the job's own userId before calling pollLlmJob,
// because pollLlmJob finalizes the job and persists side effects. A caller
// must not be able to force-finalize a job they don't own just by knowing
// its id, so the db check must run and reject BEFORE pollLlmJob is invoked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const { dbMock, llmJobsService } = vi.hoisted(() => {
  const limitFn = vi.fn();
  const whereFn = vi.fn(() => ({ limit: limitFn }));
  const fromFn = vi.fn(() => ({ where: whereFn }));
  const selectFn = vi.fn(() => ({ from: fromFn }));
  return {
    dbMock: { select: selectFn, _whereFn: whereFn, _limitFn: limitFn },
    llmJobsService: {
      pollLlmJob: vi.fn(),
      listRecentLlmJobsForUser: vi.fn(),
    },
  };
});

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as any).user = (req as any).user ?? user;
    next();
  },
}));
vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("@shared/schema", () => ({ llmJobs: { id: "id", userId: "userId", brandId: "brandId" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((a, b) => ({ a, b })) }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: express.Request) => (req as any).user ?? user,
  sendOwnershipError: (res: express.Response, err: any) =>
    res.status(err.status).json({ success: false, error: err.message }),
  OwnershipError: class TestOwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, _e: unknown, fallback: string, status = 500) =>
    res.status(status).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/llmJobs", () => llmJobsService);
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { setupLlmJobsRoutes } = await import("../../server/routes/llmJobs");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupLlmJobsRoutes(app);
  return app;
}

describe("GET /api/llm-jobs/:jobId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 400 for a too-short job id, never touching the db", async () => {
    const response = await request(makeApp()).get("/api/llm-jobs/short");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Invalid job id" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(llmJobsService.pollLlmJob).not.toHaveBeenCalled();
  });

  it("answers 404, not 403/500, when the job does not exist", async () => {
    dbMock._limitFn.mockResolvedValue([]);

    const response = await request(makeApp()).get("/api/llm-jobs/job-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Job not found" });
    expect(llmJobsService.pollLlmJob).not.toHaveBeenCalled();
  });

  it("answers 404 when the job belongs to another user, and never finalizes it", async () => {
    dbMock._limitFn.mockResolvedValue([{ userId: "someone-else", brandId: null }]);

    const response = await request(makeApp()).get("/api/llm-jobs/job-owned-by-other-user");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Job not found" });
    expect(llmJobsService.pollLlmJob).not.toHaveBeenCalled();
  });

  it("answers 404 for a cron-spawned job (userId null) when the caller is not admin", async () => {
    dbMock._limitFn.mockResolvedValue([{ userId: null, brandId: null }]);

    const response = await request(makeApp()).get("/api/llm-jobs/cron-spawned-job-id");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Job not found" });
    expect(llmJobsService.pollLlmJob).not.toHaveBeenCalled();
  });

  it("polls a cron-spawned job for an admin caller", async () => {
    dbMock._limitFn.mockResolvedValue([{ userId: null, brandId: null }]);
    llmJobsService.pollLlmJob.mockResolvedValue({
      status: "succeeded",
      jobId: "cron-job-admin",
      result: { ok: true },
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { ...user, isAdmin: 1 };
      next();
    });
    setupLlmJobsRoutes(app);

    const response = await request(app).get("/api/llm-jobs/cron-job-admin");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      status: "succeeded",
      jobId: "cron-job-admin",
      result: { ok: true },
    });
  });

  it("answers 404 when the job row exists but pollLlmJob reports it gone", async () => {
    dbMock._limitFn.mockResolvedValue([{ userId: user.id, brandId: null }]);
    llmJobsService.pollLlmJob.mockResolvedValue(null);

    const response = await request(makeApp()).get("/api/llm-jobs/owned-job-id");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Job not found" });
  });

  it("returns the poll result and a no-store cache header for an owned pending job", async () => {
    dbMock._limitFn.mockResolvedValue([{ userId: user.id, brandId: null }]);
    llmJobsService.pollLlmJob.mockResolvedValue({ status: "pending", jobId: "owned-job-id" });

    const response = await request(makeApp()).get("/api/llm-jobs/owned-job-id");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, status: "pending", jobId: "owned-job-id" });
    expect(response.headers["cache-control"]).toBe("no-store, no-cache, must-revalidate");
  });

  it("returns a succeeded job's result for its owner", async () => {
    dbMock._limitFn.mockResolvedValue([{ userId: user.id, brandId: "brand-1" }]);
    llmJobsService.pollLlmJob.mockResolvedValue({
      status: "succeeded",
      jobId: "owned-job-id",
      result: { answer: 42 },
    });

    const response = await request(makeApp()).get("/api/llm-jobs/owned-job-id");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      status: "succeeded",
      jobId: "owned-job-id",
      result: { answer: 42 },
    });
  });
});

describe("GET /api/llm-jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the caller's recent jobs, defaulting to limit 20, without the result blob", async () => {
    llmJobsService.listRecentLlmJobsForUser.mockResolvedValue([
      {
        id: "job-1",
        kind: "keyword-research",
        status: "succeeded",
        createdAt: "2026-08-01T00:00:00.000Z",
        completedAt: "2026-08-01T00:01:00.000Z",
        errorKind: null,
        errorMessage: null,
        result: { huge: "blob" },
      },
    ]);

    const response = await request(makeApp()).get("/api/llm-jobs");

    expect(response.status).toBe(200);
    expect(llmJobsService.listRecentLlmJobsForUser).toHaveBeenCalledWith(user.id, 20);
    expect(response.body).toEqual({
      success: true,
      jobs: [
        {
          jobId: "job-1",
          kind: "keyword-research",
          status: "succeeded",
          createdAt: "2026-08-01T00:00:00.000Z",
          completedAt: "2026-08-01T00:01:00.000Z",
          errorKind: null,
          errorMessage: null,
        },
      ],
    });
    expect(response.body.jobs[0].result).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("clamps an out-of-range limit query param into [1, 50]", async () => {
    llmJobsService.listRecentLlmJobsForUser.mockResolvedValue([]);

    const response = await request(makeApp()).get("/api/llm-jobs?limit=9001");

    expect(response.status).toBe(200);
    expect(llmJobsService.listRecentLlmJobsForUser).toHaveBeenCalledWith(user.id, 50);
  });
});
