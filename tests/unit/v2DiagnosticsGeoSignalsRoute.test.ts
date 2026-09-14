// HTTP-level contract for GET /api/v2/diagnostics/geo-signals/:brandId
// (server/routes/v2Diagnostics.ts) - the endpoint board 12 (GEO signals) reads.
//
// Pins two things a service-level test can't see: the ownership guard answers
// 404 (never 403/500) for a brand the caller doesn't own, and the response
// carries real counts read straight off `geo_signal_runs` and `geo_rankings`
// rows rather than anything invented.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// server/lib/routesShared.ts constructs a real OpenAI client at import time.
// This route never calls it, but the module graph still runs that
// constructor, so the key must exist before anything imports the route.
process.env.OPENAI_API_KEY ??= "test-key";

type Row = Record<string, unknown>;

// A minimal thenable chain: `.select().from().where()...` all return the
// same chain object, and `await`-ing it resolves to the next queued result.
// Matches the pattern `tests/unit/workRepository.test.ts` uses for the same
// drizzle query-builder shape.
//
// `dbState.db` is one stable object for the whole file - the mock factory
// below captures it once, so each test sets `dbState.db.select` in place
// rather than reassigning `dbState.db` itself, which a fresh object would not
// propagate through the already-evaluated `vi.mock` factory.
function queueSelect(resultQueue: Row[][]) {
  const queue = [...resultQueue];
  function chain(): any {
    const self: any = {
      from: () => self,
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(queue.shift() ?? []).then(resolve, reject),
    };
    return self;
  }
  return () => chain();
}

const dbState = vi.hoisted(() => ({ db: { select: (): any => ({}) } }));
const reqBrand = vi.hoisted(() => vi.fn());

vi.mock("../../server/db", () => ({ db: dbState.db }));

class OwnershipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => {
    if (!req.user) throw new OwnershipError(401, "Not authenticated");
    return req.user;
  },
  requireBrand: (...args: unknown[]) => reqBrand(...args),
  OwnershipError,
}));

vi.mock("../../server/services/schemaAudit", () => ({
  normaliseUrl: (url: string) => url,
  urlHashOf: (url: string) => `hash-${url}`,
}));

const { setupV2DiagnosticsRoutes } = await import("../../server/routes/v2Diagnostics");

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupV2DiagnosticsRoutes(app);
  return app;
}

describe("GET /api/v2/diagnostics/geo-signals/:brandId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 404 for a brand the caller does not own", async () => {
    reqBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

    const response = await request(makeApp()).get("/api/v2/diagnostics/geo-signals/brand-1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Brand not found" });
  });

  it("maps real run scores and citation source-type counts, with no website to audit", async () => {
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1", website: null, name: "Acme" });
    dbState.db.select = queueSelect([
      // recentRuns (trailing 30 days), newest first
      [
        { ranAt: new Date("2026-09-10T00:00:00.000Z"), overallScore: 71 },
        { ranAt: new Date("2026-08-20T00:00:00.000Z"), overallScore: 60 },
      ],
      // citationRows
      [
        { sourceType: "web", isCited: 1, citedUrls: ["https://a.test"] },
        { sourceType: "web", isCited: 0, citedUrls: [] },
        { sourceType: "community", isCited: 1, citedUrls: ["https://b.test"] },
        { sourceType: null, isCited: 0, citedUrls: [] },
      ],
    ]);

    const response = await request(makeApp()).get("/api/v2/diagnostics/geo-signals/brand-1");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.brandName).toBe("Acme");
    expect(response.body.data.score).toBe(71);
    expect(response.body.data.previousScore).toBe(60);
    expect(response.body.data.history).toEqual([
      { date: "2026-08-20T00:00:00.000Z", score: 60 },
      { date: "2026-09-10T00:00:00.000Z", score: 71 },
    ]);
    expect(response.body.data.sourceMix).toEqual(
      expect.arrayContaining([
        { sourceType: "web", detected: 2, verified: 1 },
        { sourceType: "community", detected: 1, verified: 1 },
      ]),
    );
    expect(response.body.data.citedUrlCount).toBe(2);
    expect(response.body.data.schemaAudit).toBeNull();
  });

  it("falls back to the two most recent runs when nothing ran in the trailing 30 days", async () => {
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1", website: null, name: "Acme" });
    dbState.db.select = queueSelect([
      [], // recentRuns: nothing in the last 30 days
      [
        { ranAt: new Date("2026-06-01T00:00:00.000Z"), overallScore: 40 },
        { ranAt: new Date("2026-05-01T00:00:00.000Z"), overallScore: 35 },
      ], // latestRuns fallback
      [], // citationRows
    ]);

    const response = await request(makeApp()).get("/api/v2/diagnostics/geo-signals/brand-1");

    expect(response.status).toBe(200);
    expect(response.body.data.score).toBe(40);
    expect(response.body.data.previousScore).toBe(35);
    // The fallback query is never a trailing-30-day window, so the chart
    // history - built only from `recentRuns` - stays empty rather than
    // implying these two old runs form a continuous trend.
    expect(response.body.data.history).toEqual([]);
  });
});
