import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// --- hoisted mocks (available at vi.mock() factory time) ---
const { reqBrand, storageMock, persistPasteFactsMock, callWithFailoverMock } = vi.hoisted(() => {
  return {
    reqBrand: vi.fn(),
    storageMock: {
      getScrapeRunById: vi.fn(),
      getScrapePageById: vi.fn(),
      getInFlightScrapeRun: vi.fn(),
      getLastCompletedScrapeRunAt: vi.fn(),
      getMonthlyCostCap: vi.fn(),
      createScrapeRun: vi.fn(),
      createScrapePage: vi.fn(),
      insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
      getFactScrapeCache: vi.fn(),
      upsertFactScrapeCache: vi.fn(),
    },
    persistPasteFactsMock: vi.fn().mockResolvedValue({ inserted: 1 }),
    callWithFailoverMock: vi.fn(),
  };
});

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
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

vi.mock("../../server/lib/factAgent/v2/persistPasteFacts", () => ({
  persistPasteFacts: persistPasteFactsMock,
}));

vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: callWithFailoverMock,
}));

vi.mock("../../server/lib/factAgent/persistFacts", () => ({
  persistFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

// persistUserFacts imports db.ts which requires DATABASE_URL; stub it out.
vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

// llmConcurrency imports db.ts which requires DATABASE_URL; stub it out entirely.
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: (_provider: unknown, _runId: unknown, fn: () => Promise<unknown>) => fn(),
}));

// sourceUserEnrich.ts instantiates `new OpenAI()` at module load time.
// Mock the SDK default export so the constructor doesn't throw on missing key.
vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

// Stub routesShared entirely so tests don't need OPENAI_API_KEY or rate-limit code.
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler:
    (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
    (req: unknown, res: unknown, next: unknown) =>
      fn(req, res, next),
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  openai: { chat: { completions: { create: vi.fn() } } },
  sendError: (res: any, _err: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/runs/:runId/paste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.insertFactScrapeLog.mockResolvedValue(undefined);
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      website: "https://example.com",
      name: "Acme",
      industry: "saas",
    });
  });

  it("400 when text missing", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    const res = await request(makeApp()).post("/api/brand-fact-sheet/runs/run-1/paste").send({});
    expect(res.status).toBe(400);
  });

  it("400 when text exceeds 50_000 chars", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    const text = "a".repeat(50_001);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text });
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "About: We build AI." });
    expect(res.status).toBe(404);
  });

  it("happy path: 200, persists with source=paste, log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    callWithFailoverMock.mockResolvedValue(
      JSON.stringify({
        facts: [
          {
            domain: "identity",
            subcategory: "description",
            factKey: "tagline",
            factValue: "We build AI.",
            valueType: "string",
            confidence: 0.95,
            sourceExcerpt: "We build AI.",
          },
        ],
      }),
    );
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "About: We build AI for everyone." });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    expect(persistPasteFactsMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ brandId: "brand-1", runId: "run-1" }),
    );
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "paste", status: "done", factCount: 1 }),
    );
  });
});
