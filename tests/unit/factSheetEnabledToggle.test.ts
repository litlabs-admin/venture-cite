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
  storageMock: { setBrandFactScrapeEnabled: vi.fn() },
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

describe("PATCH /api/brands/:brandId/fact-scrape-enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1" });
    storageMock.setBrandFactScrapeEnabled.mockResolvedValue(undefined);
  });

  it("enable then disable success", async () => {
    let res = await request(makeApp())
      .patch("/api/brands/brand-1/fact-scrape-enabled")
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(storageMock.setBrandFactScrapeEnabled).toHaveBeenCalledWith("brand-1", true);

    res = await request(makeApp())
      .patch("/api/brands/brand-1/fact-scrape-enabled")
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(storageMock.setBrandFactScrapeEnabled).toHaveBeenCalledWith("brand-1", false);
  });

  it("returns 404 on cross-tenant brand", async () => {
    const { OwnershipError } = await import("../../server/lib/ownership");
    reqBrand.mockRejectedValue(new (OwnershipError as any)(404, "Brand not found"));
    const res = await request(makeApp())
      .patch("/api/brands/brand-other/fact-scrape-enabled")
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });
});
