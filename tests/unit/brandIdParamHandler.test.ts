// HTTP-level contract tests for server/auth.ts's brandIdParamHandler.
//
// server/routes.ts wires this via app.param("brandId", brandIdParamHandler) -
// it is the ONLY ownership check for every :brandId route in the codebase.
// server/routes/analytics.ts, for instance, does no ownership check of its
// own for its :brandId endpoints and relies entirely on this param handler
// (see tests/unit/analyticsRoutes.test.ts's header comment). A regression
// here silently reopens cross-tenant access to every such route, so this
// file drives it through a real express app wired the same way routes.ts
// wires it, not a unit call to the handler function in isolation.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

vi.mock("../../server/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("../../server/lib/supabaseAuth", () => ({ supabaseAuth: {} }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: unknown) => p }));
vi.mock("../../server/lib/workflowEngine", () => ({
  maybeTickActiveRunsForUser: async () => {},
}));
vi.mock("../../server/lib/welcomeEmail", () => ({ sendWelcomeEmail: async () => {} }));
vi.mock("../../server/instrument", () => ({ Sentry: { setUser: () => {} } }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: () => {} }));

const { brandsTable, selectMock } = vi.hoisted(() => {
  const brandsTable = { id: "brands.id", userId: "brands.userId" };
  return {
    brandsTable,
    // db.select({...}).from(brands).where(...).limit(1) - chain returns a
    // thenable at the end via .limit(); mock the whole chain to resolve to
    // whatever selectMock.rows is currently set to.
    selectMock: { rows: [] as Array<{ id: string }> },
  };
});

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectMock.rows,
        }),
      }),
    }),
  },
}));

vi.mock("@shared/schema", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, brands: brandsTable };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, and: (...args: unknown[]) => args, eq: (a: unknown, b: unknown) => [a, b] };
});

const { brandIdParamHandler } = await import("../../server/auth");

// Wires the param handler exactly the way server/routes.ts does (app.param
// before any :brandId route is registered), plus a dummy authenticated-user
// middleware controlled per-test so we can exercise the unauthenticated case.
function makeApp(user: { id: string } | null) {
  const app = express();
  app.use((req, _res, next) => {
    if (user) (req as any).user = user;
    next();
  });
  app.param("brandId", brandIdParamHandler);

  const handlerSpy = vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, brandId: req.params.brandId });
  });

  app.get("/api/test-brands/:brandId", handlerSpy);
  return { app, handlerSpy };
}

beforeEach(() => {
  selectMock.rows = [];
});

describe("brandIdParamHandler (server/auth.ts, wired via app.param as in routes.ts)", () => {
  it("answers 401 for an unauthenticated caller and never runs the route handler", async () => {
    const { app, handlerSpy } = makeApp(null);

    const response = await request(app).get("/api/test-brands/brand-1");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, error: "Not authenticated" });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("answers 404 for a brand the caller does not own, matching checkBrandOwnership's real behavior, and never runs the route handler", async () => {
    // checkBrandOwnership queries `brands` scoped by (id, userId) and 404s
    // when the row set comes back empty - this is what "not owned" produces
    // in the real function, not a 403 or a generic error.
    selectMock.rows = [];
    const { app, handlerSpy } = makeApp({ id: "user-1" });

    const response = await request(app).get("/api/test-brands/brand-other");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("lets the owner through and runs the route handler with the matched brandId", async () => {
    selectMock.rows = [{ id: "brand-1" }];
    const { app, handlerSpy } = makeApp({ id: "user-1" });

    const response = await request(app).get("/api/test-brands/brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, brandId: "brand-1" });
    expect(handlerSpy).toHaveBeenCalledTimes(1);
  });

  it("404s a malformed/nonexistent brandId the same way as any other non-owned id, per the code's own logic", async () => {
    // checkBrandOwnership has no special-casing for shape - any brandId that
    // doesn't match a (id, userId) row, malformed or not, produces the same
    // 404 "Brand not found" the not-owned case does. It only short-circuits
    // to `true` (pass-through) when brandId is falsy or not a string, which
    // app.param can't produce for a matched :brandId segment.
    selectMock.rows = [];
    const { app, handlerSpy } = makeApp({ id: "user-1" });

    const response = await request(app).get(
      "/api/test-brands/" + encodeURIComponent("not-a-real-uuid;drop table"),
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("runs the guard before the route handler, not after: the handler mutates the response but the guard's response wins for a non-owned brand", async () => {
    selectMock.rows = [];
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: "user-1" };
      next();
    });
    app.param("brandId", brandIdParamHandler);

    let handlerRan = false;
    app.get("/api/test-brands/:brandId", (req, res) => {
      handlerRan = true;
      res.status(200).json({ success: true, shouldNeverBeSeen: true });
    });

    const response = await request(app).get("/api/test-brands/brand-other");

    // If the handler ran first (or at all), the response would be the 200
    // it sends. The guard fired first and already ended the response, so
    // Express never re-enters the route handler with next().
    expect(handlerRan).toBe(false);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
  });
});
