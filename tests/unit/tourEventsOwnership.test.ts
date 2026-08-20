import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("OPENAI_API_KEY", "sk-test");

const storageMock = vi.hoisted(() => ({
  getBrandByIdForUser: vi.fn(),
  patchTourState: vi.fn(),
  recordTourEvents: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("../../server/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupTourRoutes } = await import("../../server/routes/tours");

const OWNED_BRAND_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BRAND_ID = "22222222-2222-4222-8222-222222222222";

function eventFor(brandId?: string) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    tourId: "global-welcome",
    tourVersion: 1,
    eventType: "tour_completed",
    brandId,
    occurredAt: "2026-08-20T00:00:00.000Z",
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: { id: string } }).user = { id: "user-1" };
    next();
  });
  setupTourRoutes(app);
  return app;
}

describe("tour event brand ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.recordTourEvents.mockResolvedValue(1);
    storageMock.patchTourState.mockResolvedValue({});
    storageMock.getBrandByIdForUser.mockImplementation(async (brandId: string) =>
      brandId === OWNED_BRAND_ID ? { id: brandId, userId: "user-1" } : undefined,
    );
  });

  it("rejects an event for another user's brand", async () => {
    const response = await request(makeApp())
      .post("/api/tours/events")
      .send({ events: [eventFor(OTHER_BRAND_ID)] });

    expect(response.status).toBe(404);
    expect(storageMock.recordTourEvents).not.toHaveBeenCalled();
  });

  it("records an event for the user's brand", async () => {
    const response = await request(makeApp())
      .post("/api/tours/events")
      .send({ events: [eventFor(OWNED_BRAND_ID)] });

    expect(response.status).toBe(200);
    expect(storageMock.recordTourEvents).toHaveBeenCalledOnce();
  });

  it("records a global event without a brand lookup", async () => {
    const response = await request(makeApp())
      .post("/api/tours/events")
      .send({ events: [eventFor()] });

    expect(response.status).toBe(200);
    expect(storageMock.getBrandByIdForUser).not.toHaveBeenCalled();
    expect(storageMock.recordTourEvents).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "markCompleted",
      body: {
        op: "markCompleted",
        tourId: "global-welcome",
        version: 1,
        brandId: OTHER_BRAND_ID,
      },
    },
    {
      name: "markSkipped",
      body: {
        op: "markSkipped",
        tourId: "global-welcome",
        version: 1,
        brandId: OTHER_BRAND_ID,
      },
    },
    {
      name: "clearBrand",
      body: { op: "clearBrand", brandId: OTHER_BRAND_ID },
    },
  ])("rejects $name for another user's brand", async ({ body }) => {
    const response = await request(makeApp()).patch("/api/tours/state").send(body);

    expect(response.status).toBe(404);
    expect(storageMock.patchTourState).not.toHaveBeenCalled();
  });

  it("patches tour state for the user's brand", async () => {
    const response = await request(makeApp()).patch("/api/tours/state").send({
      op: "markCompleted",
      tourId: "global-welcome",
      version: 1,
      brandId: OWNED_BRAND_ID,
    });

    expect(response.status).toBe(200);
    expect(storageMock.patchTourState).toHaveBeenCalledOnce();
  });

  it("patches global tour state without a brand lookup", async () => {
    const response = await request(makeApp()).patch("/api/tours/state").send({
      op: "markCompleted",
      tourId: "global-welcome",
      version: 1,
      brandId: null,
    });

    expect(response.status).toBe(200);
    expect(storageMock.getBrandByIdForUser).not.toHaveBeenCalled();
    expect(storageMock.patchTourState).toHaveBeenCalledOnce();
  });
});
