// HTTP-level contract tests for server/routes/v2Learn.ts.
//
// Mirrors tests/unit/toursRoutes.test.ts's approach for the table this route
// shares with the tour engine: mock server/db and the ownership/storage
// helpers, drive the route through supertest, assert on the HTTP contract.
// No TEST_DATABASE_URL needed.

import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111" };

const { dbMock, recordTourEventsMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
  recordTourEventsMock: vi.fn(),
}));

// db.select().from(...).where(...) - a minimal chainable fake, since the
// route only ever runs that one shape of query.
function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) };
}

// recordTourEvents(events) is called with ONE argument - an array of
// events - so `mock.calls[callIndex]` is `[eventsArray]`; this unwraps both
// levels to the single event this route always sends.
function recordedEvent(callIndex: number): Record<string, unknown> {
  const [eventsArray] = recordTourEventsMock.mock.calls[callIndex] as [unknown[]];
  return eventsArray[0] as Record<string, unknown>;
}

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/storage/platformStorage", () => ({
  platformStorage: { recordTourEvents: recordTourEventsMock },
}));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: { status: (n: number) => { json: (b: unknown) => void } }, err: unknown) => {
    const status = (err as { status?: number } | undefined)?.status ?? 500;
    const message = (err as { message?: string } | undefined)?.message ?? "error";
    res.status(status).json({ success: false, error: message });
  },
}));

const { setupV2LearnRoutes } = await import("../../server/routes/v2Learn");

function makeApp(authedUser: typeof user | null = user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (authedUser) (req as any).user = { ...authedUser };
    next();
  });
  setupV2LearnRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.select.mockReturnValue(selectChain([]));
  recordTourEventsMock.mockResolvedValue(1);
});

describe("GET /api/v2/learn/progress", () => {
  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null)).get("/api/v2/learn/progress");
    expect(response.status).toBe(401);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("returns an empty completion list when nothing is recorded", async () => {
    dbMock.select.mockReturnValue(selectChain([]));

    const response = await request(makeApp()).get("/api/v2/learn/progress");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { completions: [] } });
  });

  it("maps recorded rows and drops any row for an id outside the six-lesson catalog", async () => {
    const occurredAt = new Date("2026-09-10T12:00:00.000Z");
    dbMock.select.mockReturnValue(
      selectChain([
        { lessonId: "ai-answer-visibility", completedAt: occurredAt, brandId: "brand-1" },
        { lessonId: "not-a-real-lesson", completedAt: occurredAt, brandId: "brand-1" },
      ]),
    );

    const response = await request(makeApp()).get("/api/v2/learn/progress");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        completions: [
          {
            lessonId: "ai-answer-visibility",
            completedAt: "2026-09-10T12:00:00.000Z",
            brandId: "brand-1",
          },
        ],
      },
    });
  });
});

describe("POST /api/v2/learn/complete", () => {
  it("answers 401 when not authenticated", async () => {
    const response = await request(makeApp(null))
      .post("/api/v2/learn/complete")
      .send({ lessonId: "ai-answer-visibility" });
    expect(response.status).toBe(401);
    expect(recordTourEventsMock).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown lessonId", async () => {
    const response = await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "not-a-real-lesson" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(recordTourEventsMock).not.toHaveBeenCalled();
  });

  it("records the completion with the constant tour_id/event_type and a deterministic id", async () => {
    const response = await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "ai-answer-visibility", brandId: null });

    expect(response.status).toBe(200);
    expect(recordTourEventsMock).toHaveBeenCalledTimes(1);
    const event = recordedEvent(0);
    expect(event).toMatchObject({
      userId: user.id,
      brandId: null,
      tourId: "v2-learn",
      eventType: "v2_learn_lesson_completed",
      stepId: "ai-answer-visibility",
    });
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("derives the same event id for the same user and lesson every time (idempotent)", async () => {
    await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "ai-answer-visibility" });
    await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "ai-answer-visibility" });

    expect(recordedEvent(0).id).toBe(recordedEvent(1).id);
  });

  it("derives a different event id for a different lesson", async () => {
    await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "ai-answer-visibility" });
    await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "citations-and-source-trust" });

    expect(recordedEvent(0).id).not.toBe(recordedEvent(1).id);
  });

  it("answers 500 when persistence fails", async () => {
    recordTourEventsMock.mockRejectedValue(new Error("db down"));

    const response = await request(makeApp())
      .post("/api/v2/learn/complete")
      .send({ lessonId: "ai-answer-visibility" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: "db down" });
  });
});
