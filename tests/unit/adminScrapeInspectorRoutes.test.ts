// HTTP-level contract tests for server/routes/adminScrapeInspector.ts.
//
// This surface is admin-only diagnostics (internal LLM error messages, page
// guard outcomes). It is gated by two chained middlewares from server/auth.ts:
//   isAuthenticated - 401 { success: false, error: "Not authenticated" } when
//     req.user is unset.
//   isAdmin - 401 (same body) when req.user is unset, 403
//     { success: false, error: "Admin only" } when req.user.isAdmin !== 1,
//     otherwise next().
//
// The mock below reimplements that exact branching (rather than stubbing it
// out to always pass) so these tests assert the real gate, driven by a
// request-scoped user set through a fixture middleware ahead of the routes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

type FakeUser = { id: string; isAdmin: number } | undefined;

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
}));
const reverifyFactMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("@shared/schema", () => ({
  brandFactScrapeRuns: { id: "id", brandId: "brandId", startedAt: "startedAt" },
  brands: { id: "id", name: "name", website: "website", industry: "industry" },
  brandFactScrapePages: { id: "id", runId: "runId" },
  factScrapeLogs: { runId: "runId", createdAt: "createdAt" },
  factScrapeEvents: { runId: "runId", createdAt: "createdAt" },
  brandFactSheet: { brandId: "brandId" },
}));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: Request, res: Response, next: NextFunction) => {
    const user = (req as unknown as { user?: FakeUser }).user;
    if (!user) return res.status(401).json({ success: false, error: "Not authenticated" });
    next();
  },
  isAdmin: (req: Request, res: Response, next: NextFunction) => {
    const user = (req as unknown as { user?: FakeUser }).user;
    if (!user) return res.status(401).json({ success: false, error: "Not authenticated" });
    if (user.isAdmin !== 1) return res.status(403).json({ success: false, error: "Admin only" });
    next();
  },
}));
vi.mock("../../server/lib/asyncHandler", () => ({
  asyncHandler:
    (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve(handler(req, res, next)).catch(next),
}));
vi.mock("../../server/lib/factAgent/v2/reverifyFact", () => ({
  reverifyFact: reverifyFactMock,
}));
vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({ LLM_CALL_TIMEOUT_MS: 5000 }));
vi.mock("../../server/lib/modelConfig", () => ({ MODELS: { misc: "gpt-test" } }));
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

const { setupAdminScrapeInspectorRoutes } =
  await import("../../server/routes/adminScrapeInspector");

const ADMIN_USER = { id: "admin-1", isAdmin: 1 };
const NON_ADMIN_USER = { id: "user-1", isAdmin: 0 };

function makeApp(user: FakeUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: FakeUser }).user = user;
    next();
  });
  setupAdminScrapeInspectorRoutes(app);
  return app;
}

// Chainable query builder: db.select(...).from(...).where(...).limit(...) and
// .orderBy(...) both need to resolve to the row array for the table being
// queried. Route order is: runs, brands, pages, logs, events, facts.
function queueSelectResults(results: unknown[][]) {
  let call = 0;
  dbMock.select.mockImplementation(() => {
    const rows = results[call] ?? [];
    call += 1;
    // Some call sites await the query directly after .where() (facts), others
    // chain .orderBy() or .limit() first. Make the builder itself thenable so
    // both patterns resolve to the same row array.
    const builder: Record<string, unknown> = {
      from: () => builder,
      where: () => builder,
      // orderBy() is a terminal call in some routes (pages/logs/events) and
      // chains into .limit() in others (runs/recent) - make it both
      // thenable and further chainable.
      orderBy: () => builder,
      limit: () => Promise.resolve(rows),
      then: (resolve: (v: unknown) => void) => resolve(rows),
    };
    return builder;
  });
}

describe("admin scrape inspector routes gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s GET /api/admin/scrape/:runId for an unauthenticated caller", async () => {
    const response = await request(makeApp(undefined)).get("/api/admin/scrape/run-1");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, error: "Not authenticated" });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("403s GET /api/admin/scrape/:runId for an authenticated non-admin caller", async () => {
    const response = await request(makeApp(NON_ADMIN_USER)).get("/api/admin/scrape/run-1");
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "Admin only" });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("401s POST /api/admin/scrape/fact/:factId/reverify for an unauthenticated caller", async () => {
    const response = await request(makeApp(undefined)).post(
      "/api/admin/scrape/fact/fact-1/reverify",
    );
    expect(response.status).toBe(401);
    expect(reverifyFactMock).not.toHaveBeenCalled();
  });

  it("403s POST /api/admin/scrape/fact/:factId/reverify for a non-admin caller", async () => {
    const response = await request(makeApp(NON_ADMIN_USER)).post(
      "/api/admin/scrape/fact/fact-1/reverify",
    );
    expect(response.status).toBe(403);
    expect(reverifyFactMock).not.toHaveBeenCalled();
  });

  it("401s GET /api/admin/scrape/runs/recent for an unauthenticated caller", async () => {
    const response = await request(makeApp(undefined)).get("/api/admin/scrape/runs/recent");
    expect(response.status).toBe(401);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("403s GET /api/admin/scrape/runs/recent for a non-admin caller", async () => {
    const response = await request(makeApp(NON_ADMIN_USER)).get("/api/admin/scrape/runs/recent");
    expect(response.status).toBe(403);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/scrape/:runId (admin caller)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the run does not exist", async () => {
    queueSelectResults([[]]);

    const response = await request(makeApp(ADMIN_USER)).get("/api/admin/scrape/missing-run");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
  });

  it("returns the run, brand, pages, logs, events, facts and totals on success", async () => {
    const run = { id: "run-1", brandId: "brand-1", status: "completed" };
    const brand = { id: "brand-1", name: "Acme", website: "https://acme.test", industry: "saas" };
    const pages = [
      { id: "p1", status: "done" },
      { id: "p2", status: "skipped_robots" },
      { id: "p3", status: "failed" },
    ];
    const logs = [{ id: "l1" }];
    const events = [
      { id: "e1", outcome: "ok" },
      { id: "e2", outcome: "failed" },
    ];
    const facts = [
      { id: "f1", source: "scraped" },
      { id: "f2", source: "user" },
      { id: "f3", source: "user_manual" },
    ];
    queueSelectResults([[run], [brand], pages, logs, events, facts]);

    const response = await request(makeApp(ADMIN_USER)).get("/api/admin/scrape/run-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        run,
        brand,
        pages,
        logs,
        events,
        facts,
        totals: {
          pages: 3,
          pagesOk: 1,
          pagesSkipped: 1,
          pagesFailed: 1,
          events: 2,
          eventsFailed: 1,
          facts: 3,
          factsScraped: 1,
          factsUser: 2,
        },
      },
    });
  });

  it("returns brand: null when the run's brand row is missing", async () => {
    const run = { id: "run-1", brandId: "gone-brand" };
    queueSelectResults([[run], [], [], [], [], []]);

    const response = await request(makeApp(ADMIN_USER)).get("/api/admin/scrape/run-1");

    expect(response.status).toBe(200);
    expect(response.body.data.brand).toBeNull();
  });
});

describe("POST /api/admin/scrape/fact/:factId/reverify (admin caller)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the reverify result on success", async () => {
    reverifyFactMock.mockResolvedValue({ factId: "fact-1", outcome: "confirmed" });

    const response = await request(makeApp(ADMIN_USER)).post(
      "/api/admin/scrape/fact/fact-1/reverify",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { factId: "fact-1", outcome: "confirmed" },
    });
    expect(reverifyFactMock).toHaveBeenCalledWith(
      expect.objectContaining({ factId: "fact-1", llm: expect.any(Function) }),
    );
  });

  it("forwards a thrown error to the error handler instead of crashing (500 default)", async () => {
    reverifyFactMock.mockRejectedValue(new Error("reverify boom"));

    const app = makeApp(ADMIN_USER);
    // No global error handler is installed in this bare app; Express's
    // built-in default renders a 500 for an error forwarded via next(err).
    const response = await request(app).post("/api/admin/scrape/fact/fact-1/reverify");

    expect(response.status).toBe(500);
  });
});

describe("GET /api/admin/scrape/runs/recent (admin caller)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the recent runs list", async () => {
    const recent = [{ id: "run-1", status: "completed" }];
    queueSelectResults([recent]);

    const response = await request(makeApp(ADMIN_USER)).get("/api/admin/scrape/runs/recent");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: recent });
  });
});
