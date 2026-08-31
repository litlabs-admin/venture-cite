// HTTP-level contract tests for server/routes/tours.ts.
//
// Covers all four registrations:
//   GET   /api/tours/state
//   PATCH /api/tours/state
//   POST  /api/tours/events
//   GET   /api/admin/tours/metrics

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111" };

const { storageMock, dbMock } = vi.hoisted(() => ({
  storageMock: {
    getTourState: vi.fn(),
    getBrandByIdForUser: vi.fn(),
    patchTourState: vi.fn(),
    recordTourEvents: vi.fn(),
  },
  dbMock: {
    execute: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupTourRoutes } = await import("../../server/routes/tours");

function makeApp(authedUser: typeof user | null = user, isAdmin = false) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (authedUser) {
      (req as any).user = { ...authedUser, isAdmin: isAdmin ? 1 : 0 };
    }
    next();
  });
  setupTourRoutes(app);
  return app;
}

describe("GET /api/tours/state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null)).get("/api/tours/state");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, error: "Not authenticated" });
    expect(storageMock.getTourState).not.toHaveBeenCalled();
  });

  it("returns the tours sub-tree as-is when global is already present", async () => {
    storageMock.getTourState.mockResolvedValue({ global: { v: 1, completedAt: "2026-01-01" } });

    const response = await request(makeApp()).get("/api/tours/state");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { global: { v: 1, completedAt: "2026-01-01" } },
    });
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("synthesizes global from the legacy guidedSeen flag without persisting", async () => {
    storageMock.getTourState.mockResolvedValue({});
    dbMock.execute.mockResolvedValue({
      rows: [{ guided_seen: "true", created_at: "2025-06-01T00:00:00.000Z" }],
    });

    const response = await request(makeApp()).get("/api/tours/state");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { global: { v: 1, completedAt: "2025-06-01T00:00:00.000Z" } },
    });
    // Read-only synthesis: no write helper on storage was invoked.
    expect(storageMock.patchTourState).not.toHaveBeenCalled();
  });

  it("returns the bare tours tree when guidedSeen is not set", async () => {
    storageMock.getTourState.mockResolvedValue({});
    dbMock.execute.mockResolvedValue({ rows: [{ guided_seen: null, created_at: null }] });

    const response = await request(makeApp()).get("/api/tours/state");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: {} });
  });
});

describe("PATCH /api/tours/state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null))
      .patch("/api/tours/state")
      .send({ op: "suppress", tourId: "*" });

    expect(response.status).toBe(401);
    expect(storageMock.patchTourState).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown op", async () => {
    const response = await request(makeApp()).patch("/api/tours/state").send({ op: "bogus" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Invalid PATCH body.");
    expect(storageMock.patchTourState).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown tourId", async () => {
    const response = await request(makeApp())
      .patch("/api/tours/state")
      .send({ op: "markCompleted", tourId: "not-a-real-tour", version: 1 });

    expect(response.status).toBe(400);
    expect(storageMock.patchTourState).not.toHaveBeenCalled();
  });

  it("answers 404 when the referenced brandId is not owned by the caller", async () => {
    storageMock.getBrandByIdForUser.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .patch("/api/tours/state")
      .send({ op: "markCompleted", tourId: "dashboard", version: 1, brandId: "brand-not-mine" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(storageMock.patchTourState).not.toHaveBeenCalled();
  });

  it("applies a whitelisted op and returns the resulting state", async () => {
    storageMock.patchTourState.mockResolvedValue({ dashboard: { v: 1 } });

    const response = await request(makeApp())
      .patch("/api/tours/state")
      .send({ op: "suppress", tourId: "dashboard" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { dashboard: { v: 1 } } });
    expect(storageMock.patchTourState).toHaveBeenCalledWith(
      user.id,
      "suppress",
      expect.objectContaining({ tourId: "dashboard" }),
    );
  });
});

describe("POST /api/tours/events", () => {
  const validEvent = {
    id: "22222222-2222-4222-8222-222222222222",
    tourId: "dashboard",
    tourVersion: 1,
    eventType: "tour_completed",
    occurredAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null))
      .post("/api/tours/events")
      .send({ events: [validEvent] });

    expect(response.status).toBe(401);
    expect(storageMock.recordTourEvents).not.toHaveBeenCalled();
  });

  it("answers 400 for an empty events batch", async () => {
    const response = await request(makeApp()).post("/api/tours/events").send({ events: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid events batch.");
    expect(storageMock.recordTourEvents).not.toHaveBeenCalled();
  });

  it("answers 404 when an event references a brand the caller does not own", async () => {
    storageMock.getBrandByIdForUser.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/tours/events")
      .send({ events: [{ ...validEvent, brandId: "brand-not-mine" }] });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(storageMock.recordTourEvents).not.toHaveBeenCalled();
  });

  it("persists a valid batch and returns the count", async () => {
    storageMock.recordTourEvents.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/tours/events")
      .send({ events: [validEvent] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, count: 1 });
    expect(storageMock.recordTourEvents).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when persistence fails", async () => {
    storageMock.recordTourEvents.mockRejectedValue(new Error("db down"));

    const response = await request(makeApp())
      .post("/api/tours/events")
      .send({ events: [validEvent] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: "Failed to persist events." });
  });
});

describe("GET /api/admin/tours/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null)).get("/api/admin/tours/metrics");

    expect(response.status).toBe(401);
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("answers 404 (not 403) for a non-admin caller", async () => {
    const response = await request(makeApp(user, false)).get("/api/admin/tours/metrics");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Not found" });
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("returns funnel rows for an admin caller", async () => {
    dbMock.execute.mockResolvedValue({ rows: [{ tour_id: "dashboard", auto_fired: 5 }] });

    const response = await request(makeApp(user, true)).get("/api/admin/tours/metrics");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ tour_id: "dashboard", auto_fired: 5 }],
    });
  });
});
