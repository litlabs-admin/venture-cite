// HTTP-level contract tests for server/routes/unsubscribe.ts.
//
// This route is deliberately unauthenticated (HMAC-token-authenticated
// instead of session-authenticated) - see PUBLIC_API_ROUTES in
// server/auth.ts, which lists "POST /api/unsubscribe" and
// "GET /api/unsubscribe" explicitly. These tests build the bare route
// module with NO auth middleware at all, mirroring how requireAuthForApi
// treats it in the real app, and assert:
//   - both verbs work with no Authorization header/session
//   - the response for a valid token never differs based on whether the
//     underlying DB update "succeeds" for an existing vs different user,
//     i.e. no enumeration signal leaks through status code or body

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const { dbMock, tokenMock } = vi.hoisted(() => ({
  dbMock: {
    update: vi.fn(),
  },
  tokenMock: {
    verifyUnsubscribeToken: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("@shared/schema", () => ({
  users: { id: "id", weeklyReportEnabled: "weeklyReportEnabled" },
}));
vi.mock("drizzle-orm", () => ({ eq: (...args: unknown[]) => ({ __eq: args }) }));
vi.mock("../../server/lib/unsubscribeToken", () => tokenMock);
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupUnsubscribeRoutes } = await import("../../server/routes/unsubscribe");

function makeApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  // Deliberately NO auth middleware registered at all - this app has no
  // concept of req.user, matching how the real app routes this endpoint
  // (it's in PUBLIC_API_ROUTES and bypasses requireAuthForApi entirely).
  setupUnsubscribeRoutes(app);
  return app;
}

function chainableUpdate() {
  const chain = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(undefined)),
  };
  return chain;
}

describe("public auth requirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST succeeds with no Authorization header and no session at all", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue({
      userId: "11111111-1111-4111-8111-111111111111",
      list: "weekly_report",
    });
    dbMock.update.mockReturnValue(chainableUpdate());

    const response = await request(makeApp())
      .post("/api/unsubscribe")
      .query({ token: "valid-token" });

    // No 401 anywhere in this flow - the route never checks for a user.
    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
  });

  it("GET succeeds with no Authorization header and no session at all", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue({
      userId: "11111111-1111-4111-8111-111111111111",
      list: "weekly_report",
    });

    const response = await request(makeApp())
      .get("/api/unsubscribe")
      .query({ token: "valid-token" });

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
  });
});

describe("POST /api/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 400 html for an invalid/expired token", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue(null);

    const response = await request(makeApp()).post("/api/unsubscribe").query({ token: "garbage" });

    expect(response.status).toBe(400);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain("Invalid link");
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("applies the unsubscribe and returns the same 200 html for one user...", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue({
      userId: "11111111-1111-4111-8111-111111111111",
      list: "weekly_report",
    });
    dbMock.update.mockReturnValue(chainableUpdate());

    const response = await request(makeApp())
      .post("/api/unsubscribe")
      .query({ token: "user-a-token" });

    expect(response.status).toBe(200);
    expect(response.text).toContain("You're unsubscribed");
  });

  it("...as for a different, unrelated user - no enumeration signal in status or body", async () => {
    dbMock.update.mockReturnValue(chainableUpdate());

    tokenMock.verifyUnsubscribeToken.mockReturnValueOnce({
      userId: "11111111-1111-4111-8111-111111111111",
      list: "weekly_report",
    });
    const responseA = await request(makeApp())
      .post("/api/unsubscribe")
      .query({ token: "user-a-token" });

    tokenMock.verifyUnsubscribeToken.mockReturnValueOnce({
      userId: "99999999-9999-4999-8999-999999999999",
      list: "weekly_report",
    });
    const responseB = await request(makeApp())
      .post("/api/unsubscribe")
      .query({ token: "user-b-token" });

    // Same shape regardless of which (or whether an existing) user the
    // token decodes to - the handler never branches on DB row existence.
    expect(responseB.status).toBe(responseA.status);
    expect(responseB.text).toBe(responseA.text);
  });

  it("answers 500 html when the update throws", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue({
      userId: "11111111-1111-4111-8111-111111111111",
      list: "weekly_report",
    });
    dbMock.update.mockImplementation(() => {
      throw new Error("db down");
    });

    const response = await request(makeApp())
      .post("/api/unsubscribe")
      .query({ token: "valid-token" });

    expect(response.status).toBe(500);
    expect(response.text).toContain("Something went wrong");
  });
});

describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 400 html for an invalid/expired token", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue(null);

    const response = await request(makeApp()).get("/api/unsubscribe").query({ token: "garbage" });

    expect(response.status).toBe(400);
    expect(response.text).toContain("Invalid link");
  });

  it("renders a confirmation page without mutating anything", async () => {
    tokenMock.verifyUnsubscribeToken.mockReturnValue({
      userId: "11111111-1111-4111-8111-111111111111",
      list: "weekly_report",
    });

    const response = await request(makeApp())
      .get("/api/unsubscribe")
      .query({ token: "valid-token" });

    expect(response.status).toBe(200);
    expect(response.text).toContain("Confirm unsubscribe");
    expect(response.text).toContain('method="POST"');
    // GET must never touch the DB - only the POST handler mutates.
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
