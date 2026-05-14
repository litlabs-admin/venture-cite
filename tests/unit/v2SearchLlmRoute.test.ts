import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// --- hoisted mocks (refs available at vi.mock() factory time) ---
const { reqBrand, storageMock, runSearchSourceMock } = vi.hoisted(() => {
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
    runSearchSourceMock: vi.fn(),
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

// persistUserFacts imports db.ts which requires DATABASE_URL; stub it out.
vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

// persistPasteFacts imports db.ts which requires DATABASE_URL; stub it out.
vi.mock("../../server/lib/factAgent/v2/persistPasteFacts", () => ({
  persistPasteFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

vi.mock("../../server/lib/factAgent/v2/sourceSearch", () => ({
  runSearchSource: (...args: unknown[]) => runSearchSourceMock(...args),
}));

// llmConcurrency imports db.ts which requires DATABASE_URL; stub it out entirely.
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: (_provider: unknown, _runId: unknown, fn: () => Promise<unknown>) => fn(),
}));

// sourceUserEnrich.ts instantiates `new OpenAI()` at module load time (standalone
// client). Mock the SDK default export so the constructor doesn't throw on a
// missing OPENAI_API_KEY in this unit-test context.
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

describe("POST /api/brand-fact-sheet/search-llm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.insertFactScrapeLog.mockResolvedValue(undefined);
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      website: "https://example.com",
      name: "Example",
      industry: "saas",
    });
  });

  it("400 when runId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/search-llm").send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200, facts persisted, log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runSearchSourceMock.mockResolvedValue({
      status: "done",
      facts: [
        {
          domain: "identity",
          subcategory: "x",
          factKey: "y",
          factValue: "z",
          valueType: "string",
          confidence: 0.9,
          sourceExcerpt: "",
          sourceUrl: "https://example.com/about",
        },
      ],
      errorKind: null,
      errorMessage: null,
      diagnostics: { cacheHit: false, provider: "perplexity" },
    });

    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        source: "search_llm",
        status: "done",
        factCount: 1,
      }),
    );
  });

  it("returns provider error info on failure", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runSearchSourceMock.mockResolvedValue({
      status: "failed",
      facts: [],
      errorKind: "llm_unavailable",
      errorMessage: "Service unavailable",
      diagnostics: { cacheHit: false, provider: "perplexity" },
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(0);
    expect(res.body.errorKind).toBe("llm_unavailable");
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "search_llm", status: "failed" }),
    );
  });
});
