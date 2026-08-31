// HTTP-level contract tests for server/routes/factSheet.ts.
//
// Every non-stream handler here follows the same anti-enumeration shape: load
// the entity (run/fact/brand), 404 if missing, then requireBrand/requireBrand-
// via-entity to gate ownership - a cross-tenant id must answer the identical
// 404 a nonexistent id would, and the downstream service must never run.
//
// The GET /runs/:runId/stream SSE endpoint's steady-state polling loop (page/
// fact/source-update events across multiple ticks, abort handling, the slice
// budget) is covered separately in tests/unit/factSheetSseStream.test.ts using
// a raw http client, because that behavior never resolves the response for a
// non-terminal run and doesn't fit supertest's .send()/expect() shape.
//
// The pre-flush ownership/404 branch and the terminal-run happy path DO
// resolve a response (the handler calls res.end() once it writes "done"), so
// those are covered here with supertest like every other route in this file -
// which is also what makes scripts/routeHttpCoverage.mjs count this route as
// having an HTTP-level test.

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

const { ownership, runsService, factsService, streamService } = vi.hoisted(() => ({
  ownership: { requireBrand: vi.fn() },
  runsService: {
    FACT_SHEET_TERMINAL_STATUSES: ["completed", "failed", "cancelled"],
    listFactSheetRuns: vi.fn(),
    getLatestCompletedFactSheetRun: vi.fn(),
    getFactSheetRunById: vi.fn(),
    listFactSheetRunPages: vi.fn(),
    cancelFactSheetRun: vi.fn(),
    getFactSheetCostStatus: vi.fn(),
    setFactSheetScrapeEnabled: vi.fn(),
  },
  factsService: {
    getFactSheetFactById: vi.fn(),
    acceptFactSheetFact: vi.fn(),
    dismissFactSheetFact: vi.fn(),
    bulkAcceptFactSheetConflicts: vi.fn(),
    getFactSheetDiff: vi.fn(),
  },
  streamService: {
    parseLastEventId: vi.fn(() => ({ lastPageId: null, lastFactId: null })),
    getNewFactSheetPages: vi.fn(),
    getNewFactSheetFacts: vi.fn(),
    getFactSheetSourceUpdateEvents: vi.fn(),
  },
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
  sendError: (res: express.Response, _e: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({ SSE_SLICE_BUDGET_MS: 8000 }));
vi.mock("../../server/services/factSheetRuns", () => runsService);
vi.mock("../../server/services/factSheetFacts", () => factsService);
vi.mock("../../server/services/factSheetStream", () => streamService);

const { setupFactSheetRoutes } = await import("../../server/routes/factSheet");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/brand-fact-sheet/runs", () => {
  it("answers 400 when brandId is missing", async () => {
    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("answers 404/403 for a brand the caller does not own, without listing runs", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs?brandId=brand-other");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
    expect(runsService.listFactSheetRuns).not.toHaveBeenCalled();
  });

  it("lists runs for an owned brand with the default limit", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.listFactSheetRuns.mockResolvedValue([{ id: "run-1" }]);

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs?brandId=brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, runs: [{ id: "run-1" }] });
    expect(runsService.listFactSheetRuns).toHaveBeenCalledWith("brand-1", 10);
  });
});

describe("GET /api/brand-fact-sheet/runs/latest-completed", () => {
  it("answers 404/403 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get(
      "/api/brand-fact-sheet/runs/latest-completed?brandId=brand-other",
    );

    expect(response.status).toBe(404);
    expect(runsService.getLatestCompletedFactSheetRun).not.toHaveBeenCalled();
  });

  it("returns null when there is no completed run yet", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.getLatestCompletedFactSheetRun.mockResolvedValue(undefined);

    const response = await request(makeApp()).get(
      "/api/brand-fact-sheet/runs/latest-completed?brandId=brand-1",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, run: null });
  });

  it("returns the latest completed run for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.getLatestCompletedFactSheetRun.mockResolvedValue({
      id: "run-1",
      status: "completed",
    });

    const response = await request(makeApp()).get(
      "/api/brand-fact-sheet/runs/latest-completed?brandId=brand-1",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, run: { id: "run-1", status: "completed" } });
  });
});

describe("GET /api/brand-fact-sheet/runs/:runId", () => {
  it("answers 404 for a run that does not exist", async () => {
    runsService.getFactSheetRunById.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs/missing-run");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
  });

  it("answers 404, not 403/500, for a run whose brand the caller does not own", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 403));

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs/run-1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
    expect(runsService.listFactSheetRunPages).not.toHaveBeenCalled();
  });

  it("returns the run and its pages for an owned brand", async () => {
    const run = { id: "run-1", brandId: "brand-1", status: "running" };
    runsService.getFactSheetRunById.mockResolvedValue(run);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.listFactSheetRunPages.mockResolvedValue([{ id: "page-1" }]);

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs/run-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, run, pages: [{ id: "page-1" }] });
  });
});

describe("GET /api/brand-fact-sheet/runs/:runId/stream", () => {
  it("answers 404 for a run that does not exist, before any streaming begins", async () => {
    runsService.getFactSheetRunById.mockResolvedValue(undefined);

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs/missing-run/stream");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(streamService.getNewFactSheetPages).not.toHaveBeenCalled();
  });

  it("answers 404 for a run whose brand the caller does not own, before any streaming begins", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 403));

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs/run-1/stream");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Run not found" });
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(streamService.getNewFactSheetPages).not.toHaveBeenCalled();
  });

  it("streams SSE headers and a done frame for a run that is already terminal", async () => {
    const run = {
      id: "run-1",
      brandId: "brand-1",
      status: "completed",
      pagesFetched: 2,
      factsExtracted: 5,
      llmCostCents: 3,
    };
    runsService.getFactSheetRunById.mockResolvedValue(run);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    streamService.getNewFactSheetPages.mockResolvedValue({ events: [], lastPageId: "" });
    streamService.getNewFactSheetFacts.mockResolvedValue({ events: [], lastFactId: "" });
    streamService.getFactSheetSourceUpdateEvents.mockResolvedValue([]);

    const response = await request(makeApp()).get("/api/brand-fact-sheet/runs/run-1/stream");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(response.headers["cache-control"]).toMatch(/no-cache/);
    expect(response.text).toContain("data:");
    expect(response.text).toContain('"status":"completed"');
    expect(response.text).toContain("event: done");
  });
});

describe("POST /api/brand-fact-sheet/runs/:runId/cancel", () => {
  it("answers 404 for a run that does not exist", async () => {
    runsService.getFactSheetRunById.mockResolvedValue(undefined);

    const response = await request(makeApp()).post("/api/brand-fact-sheet/runs/missing-run/cancel");

    expect(response.status).toBe(404);
    expect(runsService.cancelFactSheetRun).not.toHaveBeenCalled();
  });

  it("answers 404 for a run whose brand the caller does not own, without cancelling", async () => {
    runsService.getFactSheetRunById.mockResolvedValue({ id: "run-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).post("/api/brand-fact-sheet/runs/run-1/cancel");

    expect(response.status).toBe(404);
    expect(runsService.cancelFactSheetRun).not.toHaveBeenCalled();
  });

  it("answers 409 already_terminal when the run is already done", async () => {
    const run = { id: "run-1", brandId: "brand-1", status: "completed" };
    runsService.getFactSheetRunById.mockResolvedValue(run);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.cancelFactSheetRun.mockResolvedValue({
      outcome: "already_terminal",
      status: "completed",
    });

    const response = await request(makeApp()).post("/api/brand-fact-sheet/runs/run-1/cancel");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      code: "already_terminal",
      status: "completed",
      error: "Run is already in a terminal state.",
    });
  });

  it("answers 409 status_changed on a lost CAS race", async () => {
    const run = { id: "run-1", brandId: "brand-1", status: "running" };
    runsService.getFactSheetRunById.mockResolvedValue(run);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.cancelFactSheetRun.mockResolvedValue({ outcome: "status_changed" });

    const response = await request(makeApp()).post("/api/brand-fact-sheet/runs/run-1/cancel");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      code: "status_changed",
      error: "Run status changed before cancel could apply.",
    });
  });

  it("cancels a running, owned run", async () => {
    const run = { id: "run-1", brandId: "brand-1", status: "running" };
    runsService.getFactSheetRunById.mockResolvedValue(run);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.cancelFactSheetRun.mockResolvedValue({ outcome: "cancelled" });

    const response = await request(makeApp()).post("/api/brand-fact-sheet/runs/run-1/cancel");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});

describe("POST /api/brand-fact-sheet/facts/:factId/accept", () => {
  it("answers 400 for an invalid body", async () => {
    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/fact-1/accept")
      .send({ dismissOtherSide: "not-a-boolean" });

    expect(response.status).toBe(400);
    expect(factsService.getFactSheetFactById).not.toHaveBeenCalled();
  });

  it("answers 404 for a fact that does not exist", async () => {
    factsService.getFactSheetFactById.mockResolvedValue(undefined);

    const response = await request(makeApp()).post(
      "/api/brand-fact-sheet/facts/missing-fact/accept",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Fact not found" });
  });

  it("answers 404 for a fact whose brand the caller does not own, without accepting", async () => {
    factsService.getFactSheetFactById.mockResolvedValue({ id: "fact-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 403));

    const response = await request(makeApp()).post("/api/brand-fact-sheet/facts/fact-1/accept");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Fact not found" });
    expect(factsService.acceptFactSheetFact).not.toHaveBeenCalled();
  });

  it("accepts an owned fact, defaulting dismissOtherSide to false", async () => {
    const fact = { id: "fact-1", brandId: "brand-1" };
    factsService.getFactSheetFactById.mockResolvedValue(fact);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    factsService.acceptFactSheetFact.mockResolvedValue({ ...fact, status: "accepted" });

    const response = await request(makeApp()).post("/api/brand-fact-sheet/facts/fact-1/accept");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, fact: { ...fact, status: "accepted" } });
    expect(factsService.acceptFactSheetFact).toHaveBeenCalledWith(fact, false);
  });
});

describe("POST /api/brand-fact-sheet/facts/:factId/dismiss", () => {
  it("answers 404 for a fact that does not exist", async () => {
    factsService.getFactSheetFactById.mockResolvedValue(undefined);

    const response = await request(makeApp()).post(
      "/api/brand-fact-sheet/facts/missing-fact/dismiss",
    );

    expect(response.status).toBe(404);
    expect(factsService.dismissFactSheetFact).not.toHaveBeenCalled();
  });

  it("answers 404 for a fact whose brand the caller does not own", async () => {
    factsService.getFactSheetFactById.mockResolvedValue({ id: "fact-1", brandId: "brand-other" });
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).post("/api/brand-fact-sheet/facts/fact-1/dismiss");

    expect(response.status).toBe(404);
    expect(factsService.dismissFactSheetFact).not.toHaveBeenCalled();
  });

  it("dismisses an owned fact", async () => {
    const fact = { id: "fact-1", brandId: "brand-1" };
    factsService.getFactSheetFactById.mockResolvedValue(fact);
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    factsService.dismissFactSheetFact.mockResolvedValue({ ...fact, status: "dismissed" });

    const response = await request(makeApp()).post("/api/brand-fact-sheet/facts/fact-1/dismiss");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, fact: { ...fact, status: "dismissed" } });
  });
});

describe("POST /api/brand-fact-sheet/facts/bulk-accept", () => {
  it("answers 400 for an invalid body", async () => {
    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/bulk-accept")
      .send({ brandId: "brand-1", side: "not-a-side" });

    expect(response.status).toBe(400);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("answers 404/403 for a brand the caller does not own, without bulk-accepting", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/bulk-accept")
      .send({ brandId: "brand-other", side: "scraped" });

    expect(response.status).toBe(404);
    expect(factsService.bulkAcceptFactSheetConflicts).not.toHaveBeenCalled();
  });

  it("bulk-accepts conflicts for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    factsService.bulkAcceptFactSheetConflicts.mockResolvedValue(7);

    const response = await request(makeApp())
      .post("/api/brand-fact-sheet/facts/bulk-accept")
      .send({ brandId: "brand-1", side: "scraped" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, affected: 7 });
    expect(factsService.bulkAcceptFactSheetConflicts).toHaveBeenCalledWith({
      brandId: "brand-1",
      side: "scraped",
      domain: undefined,
      runId: undefined,
    });
  });
});

describe("GET /api/brand-fact-sheet/diff", () => {
  it("answers 400 when brandId is missing", async () => {
    const response = await request(makeApp()).get("/api/brand-fact-sheet/diff");

    expect(response.status).toBe(400);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("answers 404/403 for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp()).get("/api/brand-fact-sheet/diff?brandId=brand-other");

    expect(response.status).toBe(404);
    expect(factsService.getFactSheetDiff).not.toHaveBeenCalled();
  });

  it("returns the conflict diff for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    factsService.getFactSheetDiff.mockResolvedValue([{ field: "name" }]);

    const response = await request(makeApp()).get("/api/brand-fact-sheet/diff?brandId=brand-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, conflicts: [{ field: "name" }] });
  });
});

describe("GET /api/brand-fact-sheet/cost-status", () => {
  it("answers 400 when brandId is missing", async () => {
    const response = await request(makeApp()).get("/api/brand-fact-sheet/cost-status");

    expect(response.status).toBe(400);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("answers 404 with brand_not_found for a brand the caller does not own", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 403));

    const response = await request(makeApp()).get(
      "/api/brand-fact-sheet/cost-status?brandId=brand-other",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "brand_not_found" });
    expect(runsService.getFactSheetCostStatus).not.toHaveBeenCalled();
  });

  it("returns the cost status for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.getFactSheetCostStatus.mockResolvedValue({
      capCents: 500,
      spentCents: 120,
      remainingCents: 380,
    });

    const response = await request(makeApp()).get(
      "/api/brand-fact-sheet/cost-status?brandId=brand-1",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ capCents: 500, spentCents: 120, remainingCents: 380 });
  });
});

describe("PATCH /api/brands/:brandId/fact-scrape-enabled", () => {
  it("answers 400 for an invalid body", async () => {
    const response = await request(makeApp())
      .patch("/api/brands/brand-1/fact-scrape-enabled")
      .send({ enabled: "yes" });

    expect(response.status).toBe(400);
    expect(ownership.requireBrand).not.toHaveBeenCalled();
  });

  it("answers 404/403 for a brand the caller does not own, without toggling", async () => {
    ownership.requireBrand.mockRejectedValue(new TestOwnershipError("Brand not found", 404));

    const response = await request(makeApp())
      .patch("/api/brands/brand-other/fact-scrape-enabled")
      .send({ enabled: true });

    expect(response.status).toBe(404);
    expect(runsService.setFactSheetScrapeEnabled).not.toHaveBeenCalled();
  });

  it("toggles the flag for an owned brand", async () => {
    ownership.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
    runsService.setFactSheetScrapeEnabled.mockResolvedValue(true);

    const response = await request(makeApp())
      .patch("/api/brands/brand-1/fact-scrape-enabled")
      .send({ enabled: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, factScrapeEnabled: true });
    expect(runsService.setFactSheetScrapeEnabled).toHaveBeenCalledWith("brand-1", true);
  });
});
