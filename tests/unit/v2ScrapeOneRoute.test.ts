import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// --- hoisted mocks (these refs are available at vi.mock() factory time) ---
const { reqBrand, storageMock, runStaticSourceMock } = vi.hoisted(() => {
  return {
    reqBrand: vi.fn(),
    storageMock: {
      getScrapeRunById: vi.fn(),
      getScrapePageById: vi.fn(),
      updateScrapePageStatus: vi.fn(),
      incrementScrapeRunCounters: vi.fn(),
      insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
    },
    runStaticSourceMock: vi.fn(),
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

vi.mock("../../server/lib/factAgent/v2/sourceStatic", () => ({
  runStaticSource: (...args: unknown[]) => runStaticSourceMock(...args),
}));

// persistUserFacts imports db.ts which requires DATABASE_URL; stub it out.
vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

// persistPasteFacts imports db.ts which requires DATABASE_URL; stub it out.
vi.mock("../../server/lib/factAgent/v2/persistPasteFacts", () => ({
  persistPasteFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

// sourceUserEnrich.ts instantiates `new OpenAI()` at module load time.
vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

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

describe("POST /api/brand-fact-sheet/scrape-one", () => {
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

  it("400 when runId or pageId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/scrape-one").send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });
    expect(res.status).toBe(404);
  });

  it("404 when page does not belong to the run", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    storageMock.getScrapePageById.mockResolvedValue({
      id: "page-1",
      runId: "other-run",
      url: "https://x.com",
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200 + facts in response + persistFacts + log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    storageMock.getScrapePageById.mockResolvedValue({
      id: "page-1",
      runId: "run-1",
      url: "https://example.com/about",
      canonicalUrl: "https://example.com/about",
    });
    storageMock.updateScrapePageStatus.mockResolvedValue(null);
    storageMock.incrementScrapeRunCounters.mockResolvedValue(undefined);
    runStaticSourceMock.mockResolvedValue({
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
        },
      ],
      statusCode: 200,
      bytes: 1234,
      errorKind: null,
      errorMessage: null,
      canonicalRedirect: null,
      discoveredUrls: [],
      diagnostics: {
        lang: "en",
        hadRsc: false,
        hadHydration: false,
        hasStructuredData: true,
        bodyTextLength: 500,
      },
    });

    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        source: "static_pages",
        status: "done",
        factCount: 1,
      }),
    );
    expect(storageMock.updateScrapePageStatus).toHaveBeenCalledWith(
      "page-1",
      "done",
      expect.objectContaining({ factCount: 1 }),
    );
  });

  it("returns the canonicalRedirect for the orchestrator to queue", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    storageMock.getScrapePageById.mockResolvedValue({
      id: "page-1",
      runId: "run-1",
      url: "https://example.com/p",
      canonicalUrl: "https://example.com/p",
    });
    storageMock.updateScrapePageStatus.mockResolvedValue(null);
    storageMock.incrementScrapeRunCounters.mockResolvedValue(undefined);
    runStaticSourceMock.mockResolvedValue({
      status: "skipped_canonical",
      facts: [],
      statusCode: 200,
      bytes: 100,
      errorKind: null,
      errorMessage: null,
      canonicalRedirect: "https://example.com/canonical-target",
      discoveredUrls: [],
      diagnostics: {
        lang: null,
        hadRsc: false,
        hadHydration: false,
        hasStructuredData: false,
        bodyTextLength: 0,
      },
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });
    expect(res.status).toBe(200);
    expect(res.body.canonicalRedirect).toBe("https://example.com/canonical-target");
  });
});
