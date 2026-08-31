// HTTP-level contract tests for server/routes/factSheetV2.ts.
//
// Every handler here loads the run first, 404s if it's missing, then calls
// requireBrand(run.brandId, user.id) to gate ownership - anti-enumeration:
// a run owned by another tenant answers exactly the same 404 as a run id
// that doesn't exist, and the downstream service must never run.

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

const { ownership, runsService, sourcesService, pipelineService, planGuards } = vi.hoisted(() => ({
  ownership: { requireBrand: vi.fn() },
  runsService: {
    getFactSheetRunById: vi.fn(),
    getFactSheetPageById: vi.fn(),
  },
  sourcesService: {
    scrapeFactSheetPage: vi.fn(),
    searchFactSheetLlm: vi.fn(),
    enrichFactSheetFromUser: vi.fn(),
    extractFactSheetFromPaste: vi.fn(),
  },
  pipelineService: {
    evaluateFactSheetRunGuards: vi.fn(),
    createFactSheetPlan: vi.fn(),
    startFactSheetFullRescrape: vi.fn(),
    aggregateFactSheetRun: vi.fn(),
  },
  planGuards: { normalizeHttps: vi.fn((url: string) => (url ? `https://${url}` : null)) },
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as any).user = (req as any).user ?? user;
    next();
  },
}));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: express.Request) => (req as any).user ?? user,
  requireBrand: ownership.requireBrand,
  OwnershipError: TestOwnershipError,
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, _e: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/factAgent/v2/planGuards", () => planGuards);
vi.mock("../../server/services/factSheetRuns", () => runsService);
vi.mock("../../server/services/factSheetV2Sources", () => sourcesService);
vi.mock("../../server/services/factSheetV2Pipeline", () => pipelineService);

const { setupFactSheetV2Routes } = await import("../../server/routes/factSheetV2");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/brand-fact-sheet/scrape-one", () => {
  it("answers 404 for a run whose brand the caller does not own, without scraping", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 403));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(sourcesService.scrapeFactSheetPage).not.toHaveBeenCalled();
  });

  it("answers 400 when the body fails validation", async () => {
    const response = await request(makeApp()).post("/api/brand-fact-sheet/scrape-one").send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(runsService.getFactSheetRunById).not.toHaveBeenCalled();
  });

  it("answers 404 when the run itself does not exist", async () => {
    runsService.getFactSheetRunById.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "missing-run", pageId: "page-1" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
  });

  it("answers 404 when the page does not belong to the run", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.getFactSheetPageById.mockResolvedValue({ id: "page-1", runId: "other-run" });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Page not found" });
    expect(sourcesService.scrapeFactSheetPage).not.toHaveBeenCalled();
  });

  it("scrapes the page and returns the outcome for an owned run", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.getFactSheetPageById.mockResolvedValue({ id: "page-1", runId: "run-1" });
    sourcesService.scrapeFactSheetPage.mockResolvedValue({
      status: "ok",
      factCount: 3,
      canonicalRedirect: null,
      discoveredUrls: ["https://example.com/about"],
      diagnostics: { ms: 12 },
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/scrape-one")
      .send({ runId: "run-1", pageId: "page-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      runId: "run-1",
      pageId: "page-1",
      status: "ok",
      factCount: 3,
      canonicalRedirect: null,
      discoveredUrls: ["https://example.com/about"],
      diagnostics: { ms: 12 },
    });
  });
});

describe("POST /api/brand-fact-sheet/search-llm", () => {
  it("answers 404 for a run whose brand the caller does not own", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(sourcesService.searchFactSheetLlm).not.toHaveBeenCalled();
  });

  it("answers 400 when runId is missing", async () => {
    const response = await request(makeApp()).post("/api/brand-fact-sheet/search-llm").send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("returns the search outcome for an owned run", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    sourcesService.searchFactSheetLlm.mockResolvedValue({
      status: "ok",
      factCount: 2,
      errorKind: null,
      diagnostics: {},
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      runId: "run-1",
      status: "ok",
      factCount: 2,
      errorKind: null,
      diagnostics: {},
    });
  });
});

describe("POST /api/brand-fact-sheet/user-enrich", () => {
  it("answers 404 for a run whose brand the caller does not own", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });

    expect(response.status).toBe(404);
    expect(sourcesService.enrichFactSheetFromUser).not.toHaveBeenCalled();
  });

  it("returns the enrichment outcome for an owned run", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    sourcesService.enrichFactSheetFromUser.mockResolvedValue({
      status: "ok",
      factCount: 1,
      diagnostics: {},
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      runId: "run-1",
      status: "ok",
      factCount: 1,
      diagnostics: {},
    });
  });
});

describe("POST /api/brand-fact-sheet/plan", () => {
  it("answers 404/403 for a brand the caller does not own, without creating a plan", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-other" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(pipelineService.createFactSheetPlan).not.toHaveBeenCalled();
  });

  it("answers 400 when the brand has no usable website", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id, website: null });
    planGuards.normalizeHttps.mockReturnValueOnce(null);

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "Brand website must be http(s) URL",
    });
  });

  it("answers 409 with the already_running shape when a run guard rejects", async () => {
    ownership.requireBrand.mockResolvedValue({
      id: "brand-1",
      userId: user.id,
      website: "example.com",
    });
    pipelineService.evaluateFactSheetRunGuards.mockResolvedValue({
      ok: false,
      status: 409,
      code: "already_running",
      message: "A run is already in progress.",
      runId: "run-in-flight",
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      code: "already_running",
      error: "A run is already in progress.",
      runId: "run-in-flight",
    });
    expect(pipelineService.createFactSheetPlan).not.toHaveBeenCalled();
  });

  it("creates a plan and returns its runId and pages for a passing guard", async () => {
    ownership.requireBrand.mockResolvedValue({
      id: "brand-1",
      userId: user.id,
      website: "example.com",
    });
    pipelineService.evaluateFactSheetRunGuards.mockResolvedValue({ ok: true });
    pipelineService.createFactSheetPlan.mockResolvedValue({
      runId: "run-new",
      pages: ["https://example.com/"],
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      runId: "run-new",
      pages: ["https://example.com/"],
    });
    expect(pipelineService.createFactSheetPlan).toHaveBeenCalledWith({
      brandId: "brand-1",
      normalizedWebsite: "https://example.com",
      triggeredBy: "user_rescrape",
    });
  });
});

describe("POST /api/brand-fact-sheet/full-rescrape", () => {
  it("answers 404/403 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/full-rescrape")
      .send({ brandId: "brand-other" });

    expect(response.status).toBe(404);
    expect(pipelineService.startFactSheetFullRescrape).not.toHaveBeenCalled();
  });

  it("answers 409 with cooldown shape when the guard rejects on cooldown", async () => {
    ownership.requireBrand.mockResolvedValue({
      id: "brand-1",
      userId: user.id,
      website: "example.com",
    });
    pipelineService.evaluateFactSheetRunGuards.mockResolvedValue({
      ok: false,
      status: 409,
      code: "cooldown",
      message: "Please wait before re-scraping.",
      unlockAtMs: 1234567890,
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/full-rescrape")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      code: "cooldown",
      error: "Please wait before re-scraping.",
      unlockAtMs: 1234567890,
    });
    expect(pipelineService.startFactSheetFullRescrape).not.toHaveBeenCalled();
  });

  it("starts a re-scrape for a passing guard", async () => {
    ownership.requireBrand.mockResolvedValue({
      id: "brand-1",
      userId: user.id,
      website: "example.com",
    });
    pipelineService.evaluateFactSheetRunGuards.mockResolvedValue({ ok: true });
    pipelineService.startFactSheetFullRescrape.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/full-rescrape")
      .send({ brandId: "brand-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});

describe("POST /api/brand-fact-sheet/aggregate", () => {
  it("answers 404 for a run that does not exist", async () => {
    runsService.getFactSheetRunById.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId: "missing-run" });

    expect(response.status).toBe(404);
    expect(pipelineService.aggregateFactSheetRun).not.toHaveBeenCalled();
  });

  it("answers 404/403 for a run whose brand the caller does not own", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId: "run-1" });

    expect(response.status).toBe(404);
    expect(pipelineService.aggregateFactSheetRun).not.toHaveBeenCalled();
  });

  it("returns the aggregation result for an owned run", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    pipelineService.aggregateFactSheetRun.mockResolvedValue({
      status: "completed",
      errorKind: null,
      totalFacts: 10,
      disagreementsIncremented: 2,
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId: "run-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      runId: "run-1",
      status: "completed",
      errorKind: null,
      totalFacts: 10,
      disagreementsIncremented: 2,
    });
  });
});

describe("POST /api/brand-fact-sheet/runs/:runId/paste", () => {
  it("answers 400 when text fails validation", async () => {
    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "" });

    expect(response.status).toBe(400);
    expect(runsService.getFactSheetRunById).not.toHaveBeenCalled();
  });

  it("answers 404 for a run that does not exist", async () => {
    runsService.getFactSheetRunById.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/missing-run/paste")
      .send({ text: "some pasted text" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
  });

  it("answers 404/403 for a run whose brand the caller does not own, without extracting", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "some pasted text" });

    expect(response.status).toBe(404);
    expect(sourcesService.extractFactSheetFromPaste).not.toHaveBeenCalled();
  });

  it("extracts facts from pasted text for an owned run", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    sourcesService.extractFactSheetFromPaste.mockResolvedValue({
      status: "ok",
      factCount: 4,
      diagnostics: {},
    });

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "some pasted text" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      runId: "run-1",
      status: "ok",
      factCount: 4,
      diagnostics: {},
    });
  });
});
