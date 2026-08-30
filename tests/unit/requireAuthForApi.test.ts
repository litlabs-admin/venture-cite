// server/auth.ts:requireAuthForApi is the single global gate for every
// /api/* route (mounted at server/routes.ts:89). tests/unit/cronPublicAuth.test.ts
// covers only the permissive direction - that the two cron routes stay
// public - and never asserts that a NON-public route is actually rejected.
// The B6b-01 mutation audit (.audit/B6/B6b-01-mutation-auth-ownership.md,
// Target 2) proved that with an unconditional `return next()` inside
// requireAuthForApi, the entire suite (1734/1734) still passes. This file
// covers the untested direction: private routes stay private.
//
// Mounts the REAL requireAuthForApi on a bare Express app, same pattern as
// cronPublicAuth.test.ts, so these tests exercise the actual middleware
// rather than a mock of it.

import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { mockGetUser, mockLimit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("../../server/supabase", () => ({
  supabaseAdmin: { auth: { getUser: mockGetUser } },
}));
vi.mock("../../server/lib/supabaseAuth", () => ({ supabaseAuth: {} }));
vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
  },
}));
vi.mock("../../server/instrument", () => ({ Sentry: { setUser: vi.fn() } }));
vi.mock("../../server/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  requestContext: { getStore: vi.fn(() => undefined) },
}));
vi.mock("../../server/lib/leakedPassword", () => ({ isPasswordLeaked: vi.fn() }));
vi.mock("../../server/lib/workflowEngine", () => ({
  maybeTickActiveRunsForUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/lib/welcomeEmail", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { requireAuthForApi } = await import("../../server/auth");

// A route deliberately absent from PUBLIC_API_ROUTES - not a real endpoint,
// just a stand-in for "any protected /api/* route".
const PROTECTED_PATH = "/api/brands";

function makeApp(handler: express.RequestHandler) {
  const app = express();
  app.use(requireAuthForApi);
  app.get(PROTECTED_PATH, handler);
  app.post("/api/auth/login", handler);
  // Shares the "/api/auth/login" prefix but is NOT the allowlisted exact
  // string "POST /api/auth/login" - see test 4.
  app.post("/api/auth/loginextra", handler);
  app.get("/health", handler);
  return app;
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockLimit.mockReset();
});

describe("requireAuthForApi - gated route, no token", () => {
  it("rejects with 401 and never invokes the route handler", async () => {
    const handler = vi.fn((_req, res) => res.status(200).json({ ok: true }));

    const response = await request(makeApp(handler)).get(PROTECTED_PATH);

    expect(response.status).toBe(401);
    // The critical assertion: a handler that runs and then the response
    // happens to be 401 is a different (and worse) bug than one that never
    // runs at all. Bare status alone would not catch that.
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("requireAuthForApi - gated route, valid Bearer token", () => {
  it("verifies the token, loads the user, and reaches the handler", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockLimit.mockResolvedValue([
      {
        id: "user-1",
        email: "user@example.com",
        deletedAt: null,
        isAdmin: 0,
      },
    ]);
    const handler = vi.fn((_req, res) => res.status(200).json({ ok: true }));

    const response = await request(makeApp(handler))
      .get(PROTECTED_PATH)
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledWith("valid-token");
  });
});

describe("requireAuthForApi - non-/api/ path", () => {
  it("is left untouched by the middleware, with no Authorization header", async () => {
    const handler = vi.fn((_req, res) => res.status(200).json({ ok: true }));

    const response = await request(makeApp(handler)).get("/health");

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("requireAuthForApi - allowlist matching is exact, not prefix", () => {
  it("public route POST /api/auth/login passes through unauthenticated", async () => {
    const handler = vi.fn((_req, res) => res.status(204).end());

    const response = await request(makeApp(handler)).post("/api/auth/login");

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("POST /api/auth/loginextra shares the allowlisted prefix but is NOT itself allowlisted, and stays gated", async () => {
    // The B6b-01 audit (Target 2c) found that changing
    // `PUBLIC_API_ROUTES.has(key)` to a `startsWith` prefix check on
    // req.path (ignoring the method) survives the whole existing suite.
    // This route is chosen specifically to share the "/api/auth/login"
    // prefix with the allowlisted "POST /api/auth/login" entry, so a
    // prefix-based check would wrongly treat it as public.
    const handler = vi.fn((_req, res) => res.status(200).json({ ok: true }));

    const response = await request(makeApp(handler)).post("/api/auth/loginextra");

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("requireAuthForApi - PUBLIC_API_ROUTES is a bounded, pinned set", () => {
  // PUBLIC_API_ROUTES is not exported (and this task must not add an export
  // to server/auth.ts - see the acceptance rule requiring a clean diff on
  // that file), so the actual set is recovered from the source text itself,
  // the same technique tests/unit/citationCronUnconditional.test.ts uses for
  // a different invariant that can only be checked by reading the source.
  //
  // Every string below is a route the internet can reach without a Bearer
  // token. Adding a line here is a deliberate, reviewable act of exposing a
  // new endpoint - not something that should be possible by accident, and
  // not something a mutation should be able to slip past unnoticed (the
  // B6b-01 audit found that a fake "GET /api/admin/users" entry could be
  // added to the real allowlist and no existing test noticed).
  const EXPECTED_PUBLIC_API_ROUTES = [
    "POST /api/auth/register",
    "POST /api/auth/login",
    "POST /api/auth/logout",
    "POST /api/auth/forgot-password",
    "POST /api/auth/reset-password",
    "POST /api/auth/resend-verification",
    "POST /api/waitlist",
    "POST /api/stripe/webhook",
    "POST /api/webhooks/resend",
    "POST /api/unsubscribe",
    "GET /api/unsubscribe",
    "GET /api/logo-proxy",
    "GET /api/cron/daily-orchestrator",
    "POST /api/cron/daily-orchestrator",
    "GET /api/cron/fact-scrape-backstop",
    "POST /api/cron/fact-scrape-backstop",
    "GET /api/stripe/products",
    "GET /api/stripe/publishable-key",
    "POST /api/enterprise-inquiry",
    "GET /api/board",
    "PUT /api/board",
    "GET /api/board/engineering",
    "PUT /api/board/engineering",
    "GET /api/board/marketing",
    "PUT /api/board/marketing",
    "GET /api/board/content",
    "PUT /api/board/content",
    "GET /api/board/aeo",
    "PUT /api/board/aeo",
    "GET /api/board/ben",
    "PUT /api/board/ben",
    "GET /api/internal/kpis",
  ].sort();

  it("matches the exact route set defined in server/auth.ts, sorted", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../server/auth.ts", import.meta.url)),
      "utf8",
    );
    const setBodyStart = source.indexOf("const PUBLIC_API_ROUTES = new Set<string>([");
    expect(setBodyStart).toBeGreaterThan(-1);
    const setBodyEnd = source.indexOf("]);", setBodyStart);
    expect(setBodyEnd).toBeGreaterThan(setBodyStart);
    const setBody = source.slice(setBodyStart, setBodyEnd);

    const matches = [...setBody.matchAll(/"((?:GET|POST|PUT|DELETE|PATCH) \/api\/[^"]*)"/g)].map(
      (m) => m[1],
    );
    // The real Set dedups; PUBLIC_API_ROUTES intentionally lists
    // "POST /api/cron/daily-orchestrator" twice in the source, so dedup
    // here the same way `new Set(...)` would at runtime.
    const actual = [...new Set(matches)].sort();

    expect(actual).toEqual(EXPECTED_PUBLIC_API_ROUTES);
  });
});
