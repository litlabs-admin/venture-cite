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
    getScrapeRunById: vi.fn(),
    listScrapePagesForRun: vi.fn(),
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

describe("GET /api/brand-fact-sheet/runs/:runId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1" });
  });

  it("returns 200 + run + pages on success", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({
      id: "run-1",
      brandId: "brand-1",
      status: "pending",
    });
    storageMock.listScrapePagesForRun.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await request(makeApp()).get("/api/brand-fact-sheet/runs/run-1");
    expect(res.status).toBe(200);
    expect(res.body.run.id).toBe("run-1");
    expect(res.body.pages).toHaveLength(2);
  });

  it("returns 404 (anti-enumeration) on cross-tenant", async () => {
    const { OwnershipError } = await import("../../server/lib/ownership");
    storageMock.getScrapeRunById.mockResolvedValue({
      id: "run-1",
      brandId: "brand-other",
      status: "pending",
    });
    reqBrand.mockRejectedValue(new (OwnershipError as any)(404, "Brand not found"));
    const res = await request(makeApp()).get("/api/brand-fact-sheet/runs/run-1");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Run not found");
  });

  it("returns 404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp()).get("/api/brand-fact-sheet/runs/no-such");
    expect(res.status).toBe(404);
  });
});
