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
    getBrandFactById: vi.fn(),
    acceptFact: vi.fn(),
    dismissFact: vi.fn(),
    getBrandFactSheetConflicts: vi.fn(),
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

describe("POST /api/brand-fact-sheet/facts/:factId/accept and /dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1" });
  });

  it("accept: success without dismissOtherSide", async () => {
    storageMock.getBrandFactById.mockResolvedValue({
      id: "fact-1",
      brandId: "brand-1",
      domain: "positioning",
      subcategory: "core",
      factKey: "tagline",
    });
    storageMock.acceptFact.mockResolvedValue({ id: "fact-1", acceptedAt: "now" });
    const res = await request(makeApp()).post("/api/brand-fact-sheet/facts/fact-1/accept").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("fact-1", { dismissOtherSide: false });
  });

  it("accept: with dismissOtherSide=true forwards flag", async () => {
    storageMock.getBrandFactById.mockResolvedValue({
      id: "fact-2",
      brandId: "brand-1",
    });
    storageMock.acceptFact.mockResolvedValue({ id: "fact-2" });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/fact-2/accept")
      .send({ dismissOtherSide: true });
    expect(res.status).toBe(200);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("fact-2", { dismissOtherSide: true });
  });

  it("dismiss: success", async () => {
    storageMock.getBrandFactById.mockResolvedValue({
      id: "fact-3",
      brandId: "brand-1",
    });
    storageMock.dismissFact.mockResolvedValue({ id: "fact-3", dismissedAt: "now" });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/fact-3/dismiss")
      .send({});
    expect(res.status).toBe(200);
    expect(storageMock.dismissFact).toHaveBeenCalledWith("fact-3");
  });

  it("accept: cross-tenant returns 404", async () => {
    storageMock.getBrandFactById.mockResolvedValue({
      id: "fact-4",
      brandId: "brand-other",
    });
    const { OwnershipError } = await import("../../server/lib/ownership");
    reqBrand.mockRejectedValue(new (OwnershipError as any)(404, "Brand not found"));
    const res = await request(makeApp()).post("/api/brand-fact-sheet/facts/fact-4/accept").send({});
    expect(res.status).toBe(404);
  });

  it("accept: not-found returns 404", async () => {
    storageMock.getBrandFactById.mockResolvedValue(undefined);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/missing/accept")
      .send({});
    expect(res.status).toBe(404);
    expect(storageMock.acceptFact).not.toHaveBeenCalled();
  });

  it("bulk-accept side=user, no domain: all conflicts resolved keeping user side", async () => {
    storageMock.getBrandFactSheetConflicts.mockResolvedValue([
      {
        userFact: { id: "u1", domain: "positioning" },
        scrapedFact: { id: "s1", domain: "positioning" },
      },
      { userFact: { id: "u2", domain: "pricing" }, scrapedFact: { id: "s2", domain: "pricing" } },
    ]);
    storageMock.acceptFact.mockResolvedValue({});
    storageMock.dismissFact.mockResolvedValue({});
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/bulk-accept")
      .send({ brandId: "brand-1", side: "user" });
    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("u1", { dismissOtherSide: false });
    expect(storageMock.acceptFact).toHaveBeenCalledWith("u2", { dismissOtherSide: false });
    expect(storageMock.dismissFact).toHaveBeenCalledWith("s1");
    expect(storageMock.dismissFact).toHaveBeenCalledWith("s2");
  });

  it("bulk-accept side=scraped, domain=positioning: only positioning conflicts affected", async () => {
    storageMock.getBrandFactSheetConflicts.mockResolvedValue([
      {
        userFact: { id: "u1", domain: "positioning" },
        scrapedFact: { id: "s1", domain: "positioning" },
      },
      { userFact: { id: "u2", domain: "pricing" }, scrapedFact: { id: "s2", domain: "pricing" } },
    ]);
    storageMock.acceptFact.mockResolvedValue({});
    storageMock.dismissFact.mockResolvedValue({});
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/bulk-accept")
      .send({ brandId: "brand-1", side: "scraped", domain: "positioning" });
    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(1);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("s1", { dismissOtherSide: false });
    expect(storageMock.dismissFact).toHaveBeenCalledWith("u1");
    expect(storageMock.acceptFact).not.toHaveBeenCalledWith("s2", expect.anything());
  });
});
