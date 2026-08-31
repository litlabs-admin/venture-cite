// HTTP-level contract for POST /api/geo-signals/optimize-chunks.
//
// The anti-enumeration rule for this codebase is that a brand the caller does
// not own answers 404, exactly as a brand that does not exist does. Before the
// fix in a533fb1 this handler had no OwnershipError branch, so requireBrand's
// throw fell through to the generic catch: a cross-tenant brandId answered 500
// while a nonexistent one answered 404. That difference is itself the leak -
// a 500 confirms the brand exists and belongs to someone else.
//
// Asserted through express rather than against the service, because the defect
// was in the handler's catch ordering. optimizeContentChunks never ran.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

class TestOwnershipError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = "OwnershipError";
    this.status = status;
  }
}

const { ownership, services } = vi.hoisted(() => ({
  ownership: { requireBrand: vi.fn() },
  services: {
    optimizeContentChunks: vi.fn(),
    analyzeGeoSignals: vi.fn(),
    simulatePipeline: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: ownership.requireBrand,
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  MAX_CONTENT_LENGTH: 100000,
  sendError: (res: express.Response, _e: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/services/geoSignals", () => services);
vi.mock("../../server/services/geoContentScoring", () => ({ computeChunks: vi.fn() }));
vi.mock("../../server/services/schemaAudit", () => ({
  runSchemaAudit: vi.fn(),
  UnreachableUrlError: class extends Error {},
}));
vi.mock("../../server/lib/jsonLdExtract", () => ({ collectSchemaNodes: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupGeoSignalsRoutes } = await import("../../server/routes/geoSignals");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupGeoSignalsRoutes(app);
  return app;
}

describe("POST /api/geo-signals/optimize-chunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 404, not 500, for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/geo-signals/optimize-chunks")
      .send({ content: "some text", brandId: "brand-owned-by-someone-else" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    // The leak was doing the work anyway and failing later; it must not run.
    expect(services.optimizeContentChunks).not.toHaveBeenCalled();
  });

  it("answers 400 when content is missing", async () => {
    const response = await request(makeApp())
      .post("/api/geo-signals/optimize-chunks")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Content required" });
  });

  it("answers 502 when the model returns nothing", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    services.optimizeContentChunks.mockResolvedValue(null);

    const response = await request(makeApp())
      .post("/api/geo-signals/optimize-chunks")
      .send({ content: "some text", brandId: "brand-1" });

    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
  });

  it("returns the optimised content for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    services.optimizeContentChunks.mockResolvedValue("rewritten");

    const response = await request(makeApp())
      .post("/api/geo-signals/optimize-chunks")
      .send({ content: "some text", brandId: "brand-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { optimizedContent: "rewritten" } });
  });
});
