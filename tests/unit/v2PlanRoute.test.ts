import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// --- hoisted mocks (these refs are available at vi.mock() factory time) ---
const { reqBrand, storageMock, discoverSitemapUrlsMock } = vi.hoisted(() => {
  return {
    reqBrand: vi.fn(),
    storageMock: {
      getScrapeRunById: vi.fn(),
      getScrapePageById: vi.fn(),
      getInFlightScrapeRun: vi.fn().mockResolvedValue(null),
      getLastCompletedScrapeRunAt: vi.fn().mockResolvedValue(null),
      getMonthlyCostCap: vi.fn().mockResolvedValue(null),
      createScrapeRun: vi.fn(),
      createScrapePage: vi.fn(),
      insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
      getFactScrapeCache: vi.fn(),
      upsertFactScrapeCache: vi.fn(),
    },
    discoverSitemapUrlsMock: vi
      .fn()
      .mockResolvedValue([
        "https://example.com/about",
        "https://example.com/pricing",
        "https://example.com/blog/foo",
      ]),
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

// db.ts throws at import time without DATABASE_URL; stub it before any import touches it.
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: (...args: unknown[]) => discoverSitemapUrlsMock(...args),
}));

// llmConcurrency imports db.ts which requires DATABASE_URL; stub it out entirely.
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: (_provider: unknown, _runId: unknown, fn: () => Promise<unknown>) => fn(),
}));

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

describe("POST /api/brand-fact-sheet/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      website: "https://example.com",
      factScrapeEnabled: true,
    });
    storageMock.getInFlightScrapeRun.mockResolvedValue(null);
    storageMock.getLastCompletedScrapeRunAt.mockResolvedValue(null);
    storageMock.getMonthlyCostCap.mockResolvedValue(null);
    storageMock.createScrapeRun.mockResolvedValue({ id: "run-new" });
    storageMock.createScrapePage.mockImplementation(async (p: Record<string, unknown>) => ({
      id: `p-${Math.random()}`,
      ...p,
    }));
    discoverSitemapUrlsMock.mockResolvedValue([
      "https://example.com/about",
      "https://example.com/pricing",
      "https://example.com/blog/foo",
    ]);
  });

  it("400 when brandId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/plan").send({});
    expect(res.status).toBe(400);
  });

  it("409 already_running when an in-flight run exists", async () => {
    storageMock.getInFlightScrapeRun.mockResolvedValue({ id: "existing-run" });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("already_running");
    expect(res.body.runId).toBe("existing-run");
  });

  it("409 cooldown when last completed < 10 min ago", async () => {
    storageMock.getLastCompletedScrapeRunAt.mockResolvedValue(new Date(Date.now() - 60_000));
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("cooldown");
  });

  it("happy path: 200 with runId + pages list", async () => {
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.runId).toBe("run-new");
    expect(Array.isArray(res.body.pages)).toBe(true);
    expect(res.body.pages.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pages.some((p: { url: string }) => p.url === "https://example.com/")).toBe(
      true,
    );
    expect(res.body.pages.every((p: { url: string }) => !p.url.includes("/blog/foo"))).toBe(true);
  });

  it("normalizes http:// to https:// before discovery", async () => {
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      website: "http://example.com",
      factScrapeEnabled: true,
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(200);
    expect(res.body.pages[0].url).toBe("https://example.com/");
  });
});
