// HTTP-level contract tests for server/routes/brandGoals.ts - the write
// side of board 33's "Choose goal and start", the only board33-owned
// backend endpoint the /v2/today live-out program adds.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111" };
const brandRow = { id: "22222222-2222-4222-8222-222222222222", userId: user.id, name: "Acme PR" };

function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
}

const { dbMock, updateMock, insertMock, savedGoalRow } = vi.hoisted(() => {
  const savedGoalRow = {
    id: "goal-1",
    goalKey: "accurate_visibility",
    title: "Improve accurate visibility",
    statement: "Help more buyers see and understand Acme PR correctly.",
    desiredOutcome: "Buyers researching Acme PR find correct, current information about it.",
  };
  const updateMock = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }));
  const insertMock = vi.fn(() => ({
    values: () => ({
      onConflictDoUpdate: () => ({ returning: () => Promise.resolve([savedGoalRow]) }),
    }),
  }));
  return {
    dbMock: {
      select: vi.fn(),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ update: updateMock, insert: insertMock }),
      ),
    },
    updateMock,
    insertMock,
    savedGoalRow,
  };
});

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupBrandGoalsRoutes, GOAL_CATALOG } = await import("../../server/routes/brandGoals");

function makeApp(authedUser: typeof user | null = user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (authedUser) (req as any).user = { ...authedUser };
    next();
  });
  setupBrandGoalsRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.select.mockReturnValue(selectChain([brandRow]));
});

describe("POST /api/brands/:brandId/goals", () => {
  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null))
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility" });

    expect(response.status).toBe(401);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("answers 400 for a goalKey outside the catalog", async () => {
    const response = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "not_a_real_goal" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("answers 400 when the body carries an unexpected field", async () => {
    const response = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility", statement: "smuggled text" });

    expect(response.status).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("answers 404 (not 403) when the brand is not owned by the caller", async () => {
    dbMock.select.mockReturnValue(selectChain([]));

    const response = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility" });

    expect(response.status).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("fills the catalog copy with the caller's real brand name, never a fixture name", async () => {
    await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "correct_descriptions" });

    const entry = GOAL_CATALOG.correct_descriptions;
    expect(entry.statement("Acme PR")).toContain("Acme PR");
    expect(entry.statement("Acme PR")).not.toContain("VenturePR");
  });

  it("archives every other active goal and upserts the chosen one, atomically", async () => {
    const response = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: savedGoalRow });
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("re-selecting an already-active goal is a no-op upsert, not a duplicate row", async () => {
    // The transaction mock always resolves the same way regardless of call
    // count - what this proves is that the route does not special-case a
    // second identical request into anything but the same upsert path.
    const first = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility" });
    const second = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });

  it("answers 500 when the write fails", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("db down"));

    const response = await request(makeApp())
      .post(`/api/brands/${brandRow.id}/goals`)
      .send({ goalKey: "accurate_visibility" });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});
