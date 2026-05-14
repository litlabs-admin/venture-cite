import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const storageMock = vi.hoisted(() => ({
  getScrapeRunById: vi.fn(),
  getScrapePageById: vi.fn(),
  getInFlightScrapeRun: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
  getMonthlyCostCap: vi.fn(),
  createScrapeRun: vi.fn(),
  createScrapePage: vi.fn(),
  insertFactScrapeLog: vi.fn(),
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
}));

const reqBrand = vi.hoisted(() => vi.fn());
const runAggregateMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: { user: unknown }, _res: unknown, next: () => void) => {
    (req as any).user = { id: "user-1" };
    next();
  },
}));

vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => req.user,
  requireBrand: (...args: unknown[]) => reqBrand(...args),
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));

// db.ts throws at import time without DATABASE_URL; stub it before any import touches it.
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

// llmConcurrency imports db.ts which requires DATABASE_URL; stub it out entirely.
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: (_provider: unknown, _runId: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../../server/lib/factAgent/v2/aggregate", () => ({
  runAggregate: (...args: unknown[]) => runAggregateMock(...args),
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/aggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1" });
  });

  it("400 when runId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/aggregate").send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId: "x" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200 with terminal status", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runAggregateMock.mockResolvedValue({
      status: "completed",
      errorKind: null,
      totalFacts: 5,
      disagreementsIncremented: 1,
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.totalFacts).toBe(5);
  });
});
