import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

vi.mock("@vercel/functions", () => ({ waitUntil: (p: any) => p }));

const { reqBrand } = vi.hoisted(() => ({ reqBrand: vi.fn() }));
vi.mock("../../server/lib/ownership", () => {
  class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    OwnershipError,
    requireUser: (req: any) => {
      if (!req.user) throw new OwnershipError(401, "Not authenticated");
      return req.user;
    },
    requireBrand: (id: string, userId: string) => reqBrand(id, userId),
  };
});

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    listScrapeRunsForBrand: vi.fn(),
  },
}));
vi.mock("../../server/storage", () => ({ storage: storageMock }));

vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: any, _res: any, next: any) => next(),
  sendError: (res: any, _err: any, fallback: string, status = 500) =>
    res.status(status).json({ success: false, error: fallback }),
}));

import { setupFactSheetRoutes } from "../../server/routes/factSheet";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetRoutes(app);
  return app;
}

describe("GET /api/brand-fact-sheet/runs (list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1" });
  });

  it("returns runs in storage order with default limit 10", async () => {
    const runs = [
      { id: "run-3", startedAt: "2026-05-12T03:00:00Z" },
      { id: "run-2", startedAt: "2026-05-12T02:00:00Z" },
      { id: "run-1", startedAt: "2026-05-12T01:00:00Z" },
    ];
    storageMock.listScrapeRunsForBrand.mockResolvedValue(runs);
    const res = await request(makeApp()).get("/api/brand-fact-sheet/runs?brandId=brand-1");
    expect(res.status).toBe(200);
    expect(res.body.runs).toEqual(runs);
    expect(storageMock.listScrapeRunsForBrand).toHaveBeenCalledWith("brand-1", 10);
  });

  it("returns 404 on cross-tenant brand", async () => {
    const { OwnershipError } = await import("../../server/lib/ownership");
    reqBrand.mockRejectedValue(new (OwnershipError as any)(404, "Brand not found"));
    const res = await request(makeApp()).get("/api/brand-fact-sheet/runs?brandId=brand-other");
    expect(res.status).toBe(404);
  });
});
