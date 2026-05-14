import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// --- hoisted mocks (refs available at vi.mock() factory time) ---
const { reqBrand, storageMock, runUserEnrichMock, persistUserFactsMock } = vi.hoisted(() => {
  return {
    reqBrand: vi.fn(),
    storageMock: {
      getScrapeRunById: vi.fn(),
      getScrapePageById: vi.fn(),
      updateScrapePageStatus: vi.fn(),
      incrementScrapeRunCounters: vi.fn(),
      insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
      getFactScrapeCache: vi.fn(),
      upsertFactScrapeCache: vi.fn(),
    },
    runUserEnrichMock: vi.fn(),
    persistUserFactsMock: vi.fn().mockResolvedValue({ inserted: 2 }),
  };
});

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

vi.mock("../../server/lib/factAgent/persistFacts", () => ({
  persistFacts: vi.fn().mockResolvedValue({ inserted: 1 }),
}));

vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: persistUserFactsMock,
}));

// persistPasteFacts imports db.ts which requires DATABASE_URL; stub it out.
vi.mock("../../server/lib/factAgent/v2/persistPasteFacts", () => ({
  persistPasteFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

vi.mock("../../server/lib/factAgent/v2/sourceUserEnrich", () => ({
  runUserEnrichSource: (...args: unknown[]) => runUserEnrichMock(...args),
}));

// llmConcurrency imports db.ts which requires DATABASE_URL; stub it out entirely.
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: (_provider: unknown, _runId: unknown, fn: () => Promise<unknown>) => fn(),
}));

// Stub routesShared entirely so tests don't need OPENAI_API_KEY or rate-limit code.
vi.mock("../../server/lib/routesShared", () => {
  return {
    asyncHandler:
      (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
      (req: unknown, res: unknown, next: unknown) =>
        fn(req, res, next),
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
    sendError: (res: any, _err: unknown, fallback: string) =>
      res.status(500).json({ success: false, error: fallback }),
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/user-enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.insertFactScrapeLog.mockResolvedValue(undefined);
    persistUserFactsMock.mockResolvedValue({ inserted: 2 });
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      name: "Acme",
      description: "We build.",
      industry: "saas",
      website: "https://example.com",
      products: ["X"],
      targetAudience: null,
      uniqueSellingPoints: null,
      keyValues: null,
      brandVoice: null,
      tone: null,
    });
  });

  it("400 when runId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/user-enrich").send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200, persistUserFacts called, log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runUserEnrichMock.mockResolvedValue({
      status: "done",
      facts: [
        {
          domain: "identity",
          subcategory: "description",
          factKey: "description",
          factValue: "We build.",
          valueType: "string",
          confidence: 1.0,
          sourceExcerpt: "",
        },
      ],
      errorKind: null,
      errorMessage: null,
      diagnostics: { usedFallback: false },
    });

    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    const persistCall = persistUserFactsMock.mock.calls[0];
    expect(persistCall[1]).toEqual(expect.objectContaining({ brandId: "brand-1", runId: "run-1" }));
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        source: "user_enrich",
        status: "done",
        factCount: 1,
      }),
    );
  });

  it("returns the fallback flag in diagnostics", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runUserEnrichMock.mockResolvedValue({
      status: "done",
      facts: [],
      errorKind: null,
      errorMessage: null,
      diagnostics: { usedFallback: true },
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.diagnostics.usedFallback).toBe(true);
  });
});
