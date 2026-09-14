// HTTP-level contract tests for server/routes/v2BrandFacts.ts.
//
// This is the user-facing twin of the admin-only
// `POST /api/admin/scrape/fact/:factId/reverify` (covered by
// adminScrapeInspectorRoutes.test.ts): same `reverifyFact()` call, but gated
// on brand ownership (`requireBrand`) instead of `isAdmin`, so a brand owner
// can recheck their own fact sheet without an admin flag. The mocks below
// mirror `factSheetFactsAcceptDismiss.test.ts`'s pattern for the same
// ownership seam.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

type FakeUser = { id: string } | undefined;

const reverifyFactMock = vi.hoisted(() => vi.fn());
const { reqBrand } = vi.hoisted(() => ({ reqBrand: vi.fn() }));
const { factsStore } = vi.hoisted(() => ({ factsStore: vi.fn() }));
const { OwnershipError } = vi.hoisted(() => {
  class OwnershipErrorImpl extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { OwnershipError: OwnershipErrorImpl };
});

vi.mock("../../server/lib/ownership", () => ({
  OwnershipError,
  requireUser: (req: any) => {
    const user = (req as { user?: FakeUser }).user;
    if (!user) throw new OwnershipError(401, "Not authenticated");
    return user;
  },
  requireBrand: (id: string, userId: string) => reqBrand(id, userId),
  sendOwnershipError: (res: any, err: unknown) => {
    if (err instanceof OwnershipError) {
      res.status(err.status).json({ success: false, error: err.message });
      return true;
    }
    return false;
  },
}));

vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler:
    (handler: (req: any, res: any, next: any) => unknown) => (req: any, res: any, next: any) =>
      Promise.resolve(handler(req, res, next)).catch(next),
  sendError: (res: any, err: unknown, fallback: string) => {
    if (err instanceof OwnershipError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: fallback });
  },
}));

vi.mock("../../server/services/factSheetFacts", () => ({
  getFactSheetFactById: (...args: unknown[]) => factsStore(...args),
}));

vi.mock("../../server/lib/factAgent/v2/reverifyFact", () => ({
  reverifyFact: reverifyFactMock,
}));
vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({ LLM_CALL_TIMEOUT_MS: 5000 }));
vi.mock("../../server/lib/modelConfig", () => ({ MODELS: { misc: "gpt-test" } }));
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

const { setupV2BrandFactsRoutes } = await import("../../server/routes/v2BrandFacts");

function makeApp(user: FakeUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: FakeUser }).user = user;
    next();
  });
  setupV2BrandFactsRoutes(app);
  return app;
}

const OWNER = { id: "owner-1" };

describe("POST /api/v2/brand-facts/:factId/recheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s an unauthenticated caller before touching the fact or the brand", async () => {
    const response = await request(makeApp(undefined)).post("/api/v2/brand-facts/fact-1/recheck");
    expect(response.status).toBe(401);
    expect(factsStore).not.toHaveBeenCalled();
    expect(reverifyFactMock).not.toHaveBeenCalled();
  });

  it("404s when the fact does not exist", async () => {
    factsStore.mockResolvedValueOnce(undefined);
    const response = await request(makeApp(OWNER)).post("/api/v2/brand-facts/missing/recheck");
    expect(response.status).toBe(404);
    expect(reqBrand).not.toHaveBeenCalled();
    expect(reverifyFactMock).not.toHaveBeenCalled();
  });

  it("404s a fact that belongs to another user's brand, without leaking that it exists", async () => {
    factsStore.mockResolvedValueOnce({ id: "fact-1", brandId: "someone-elses-brand" });
    reqBrand.mockRejectedValueOnce(new OwnershipError(404, "Brand not found"));

    const response = await request(makeApp(OWNER)).post("/api/v2/brand-facts/fact-1/recheck");
    expect(response.status).toBe(404);
    expect(reverifyFactMock).not.toHaveBeenCalled();
  });

  it("reverifies the fact and returns the outcome with the re-read row", async () => {
    factsStore.mockResolvedValueOnce({ id: "fact-1", brandId: "brand-1" }).mockResolvedValueOnce({
      id: "fact-1",
      brandId: "brand-1",
      factValue: "India",
      verificationStatus: "verified",
      lastVerified: "2026-09-15T00:00:00.000Z",
    });
    reqBrand.mockResolvedValueOnce({ id: "brand-1", userId: "owner-1" });
    reverifyFactMock.mockResolvedValueOnce({
      outcome: "verified",
      durationMs: 12,
      details: {},
    });

    const response = await request(makeApp(OWNER)).post("/api/v2/brand-facts/fact-1/recheck");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        outcome: "verified",
        fact: {
          id: "fact-1",
          brandId: "brand-1",
          factValue: "India",
          verificationStatus: "verified",
          lastVerified: "2026-09-15T00:00:00.000Z",
        },
      },
    });
    expect(reverifyFactMock).toHaveBeenCalledWith(
      expect.objectContaining({ factId: "fact-1", llm: expect.any(Function) }),
    );
    expect(factsStore).toHaveBeenCalledTimes(2);
  });

  it("reports a failed reverify through the shared error handler instead of crashing", async () => {
    factsStore.mockResolvedValueOnce({ id: "fact-1", brandId: "brand-1" });
    reqBrand.mockResolvedValueOnce({ id: "brand-1", userId: "owner-1" });
    reverifyFactMock.mockRejectedValueOnce(new Error("source fetch exploded"));

    const response = await request(makeApp(OWNER)).post("/api/v2/brand-facts/fact-1/recheck");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});
