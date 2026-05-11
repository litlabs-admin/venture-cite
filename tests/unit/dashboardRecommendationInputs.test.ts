// Plan 5 Task 3: dashboard recommendations input plumbing.
//
// Verifies the `GET /api/brands/:brandId/recommendations` handler:
//   - Plumbs `storage.getLastGeoSignalRunAt(brandId)` -> state.lastSignalsScanAt.
//   - Plumbs `storage.getVisibilityProgress(brandId).length` -> state.visibilityChecklistCompleted.
//   - Plumbs the shared VISIBILITY_CHECKLIST_TOTAL constant as the denominator.
//   - As a behavioural consequence, P1 rules #8 (rerun-geo-signals) and
//     #9 (complete-visibility-checklist) drop out of the response when
//     their inputs say "recent scan" / "checklist mostly done".
//
// Mock pattern follows tests/unit/geoSignalsAnalyzePersistence.test.ts.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const BRAND_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "user-1";

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getArticlesByUserIdWithStatus: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getCitationRunsByBrandId: vi.fn(),
  getCompetitors: vi.fn(),
  getCommunityPosts: vi.fn(),
  getFaqItems: vi.fn(),
  getVisibilityProgress: vi.fn(),
  getLastGeoSignalRunAt: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: stubs.getBrandById,
    getArticlesByUserIdWithStatus: stubs.getArticlesByUserIdWithStatus,
    getBrandPromptsByBrandId: stubs.getBrandPromptsByBrandId,
    getCitationRunsByBrandId: stubs.getCitationRunsByBrandId,
    getCompetitors: stubs.getCompetitors,
    getCommunityPosts: stubs.getCommunityPosts,
    getFaqItems: stubs.getFaqItems,
    getVisibilityProgress: stubs.getVisibilityProgress,
    getLastGeoSignalRunAt: stubs.getLastGeoSignalRunAt,
    // Unused-but-imported by the dashboard module — stub permissively
    // so module init doesn't blow up.
    getMetricsHistory: vi.fn(),
    getGeoRankingsByBrandPromptIds: vi.fn(),
    getCompetitorGeoRankings: vi.fn(),
  },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    sendError: (res: express.Response, _err: unknown, msg: string) => {
      res.status(500).json({ success: false, error: msg });
    },
  };
});

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/db", () => ({
  db: {},
  pool: {},
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

const { setupDashboardRoutes } = await import("../../server/routes/dashboard");
const { VISIBILITY_CHECKLIST_TOTAL } = await import("@shared/constants");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID };
    next();
  });
  setupDashboardRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: string,
  url: string,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      params: {},
      query: {},
      headers: { host: "localhost", "content-type": "application/json" },
      body: {},
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        resolve({ status: statusCode, body: payload });
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        if (payload === null) resolve({ status: statusCode, body: null });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve({ status: statusCode, body: payload });
      });
    } catch (e) {
      reject(e);
    }
  });
}

const app = buildApp();

/**
 * Apply a baseline "all P0s satisfied" mock state so P1 rules can surface.
 * Individual tests can override specific stubs after this is called.
 *
 * Baseline: brand has industry, 5 articles, 10 prompts, 1 completed citation
 * run at 50% citation rate (>= LOW_CITATION_RATE 0.2), 1 FAQ (so rule #7
 * stays off), no competitors / community posts (P2 rules — won't crowd P1).
 */
function applyBaselineMocks() {
  stubs.getBrandById.mockResolvedValue({
    id: BRAND_ID,
    userId: USER_ID,
    name: "Acme",
    industry: "SaaS",
  });
  stubs.getArticlesByUserIdWithStatus.mockResolvedValue(
    Array.from({ length: 5 }, (_, i) => ({ id: `a-${i}` })),
  );
  stubs.getBrandPromptsByBrandId.mockResolvedValue(
    Array.from({ length: 10 }, (_, i) => ({ id: `p-${i}` })),
  );
  stubs.getCitationRunsByBrandId.mockResolvedValue([
    { id: "r-1", status: "completed", totalChecks: 10, totalCited: 5 },
  ]);
  stubs.getCompetitors.mockResolvedValue([]);
  stubs.getCommunityPosts.mockResolvedValue([]);
  stubs.getFaqItems.mockResolvedValue([{ id: "f-1" }]);
  stubs.getVisibilityProgress.mockResolvedValue([]);
  stubs.getLastGeoSignalRunAt.mockResolvedValue(null);
}

beforeEach(() => {
  for (const fn of Object.values(stubs)) fn.mockReset();
  applyBaselineMocks();
});

describe("GET /api/brands/:brandId/recommendations state assembly", () => {
  it("passes the last geo_signal_runs.ran_at as lastSignalsScanAt", async () => {
    const scanAt = new Date("2026-05-10T12:00:00.000Z");
    stubs.getLastGeoSignalRunAt.mockResolvedValue(scanAt);

    const r = await call(app, "GET", `/api/brands/${BRAND_ID}/recommendations`);

    expect(r.status).toBe(200);
    expect(stubs.getLastGeoSignalRunAt).toHaveBeenCalledWith(BRAND_ID);
    // Rule #8 must NOT fire when scan was 2 days ago (< 14-day stale window).
    const ids = (r.body.data as Array<{ id: string }>).map((rec) => rec.id);
    expect(ids).not.toContain("rerun-geo-signals");
  });

  it("treats null lastSignalsScanAt as 'never scanned' (rule #8 fires)", async () => {
    stubs.getLastGeoSignalRunAt.mockResolvedValue(null);

    const r = await call(app, "GET", `/api/brands/${BRAND_ID}/recommendations`);

    expect(r.status).toBe(200);
    const ids = (r.body.data as Array<{ id: string }>).map((rec) => rec.id);
    expect(ids).toContain("rerun-geo-signals");
  });

  it("plumbs visibility_progress row count + VISIBILITY_CHECKLIST_TOTAL into state", async () => {
    // 3 rows -> 3 / 57 = ~5% complete -> rule #9 should fire because
    // 5% < 50% threshold. This proves the count AND the constant are
    // wired through (otherwise the engine's denominator-zero guard kicks
    // in and rule #9 silently drops out).
    stubs.getVisibilityProgress.mockResolvedValue([{ id: "v-1" }, { id: "v-2" }, { id: "v-3" }]);

    const r = await call(app, "GET", `/api/brands/${BRAND_ID}/recommendations`);

    expect(r.status).toBe(200);
    expect(stubs.getVisibilityProgress).toHaveBeenCalledWith(BRAND_ID);
    const rec = (r.body.data as Array<{ id: string; title: string }>).find(
      (x) => x.id === "complete-visibility-checklist",
    );
    expect(rec).toBeDefined();
    // Title surfaces the live numerator/denominator — the cheapest way
    // to assert the constant is actually the one in use.
    expect(rec!.title).toContain(`3/${VISIBILITY_CHECKLIST_TOTAL}`);
  });

  it("rule #8 does NOT fire when last scan was 1 day ago", async () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    stubs.getLastGeoSignalRunAt.mockResolvedValue(oneDayAgo);

    const r = await call(app, "GET", `/api/brands/${BRAND_ID}/recommendations`);

    expect(r.status).toBe(200);
    const ids = (r.body.data as Array<{ id: string }>).map((rec) => rec.id);
    expect(ids).not.toContain("rerun-geo-signals");
  });

  it("rule #9 does NOT fire when > 50% of the checklist is complete", async () => {
    // 30 / 57 > 50% — rule #9 must drop out.
    const completedRows = Array.from({ length: 30 }, (_, i) => ({ id: `v-${i}` }));
    stubs.getVisibilityProgress.mockResolvedValue(completedRows);
    // Keep last-scan recent too so the response isn't dominated by rule #8.
    stubs.getLastGeoSignalRunAt.mockResolvedValue(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const r = await call(app, "GET", `/api/brands/${BRAND_ID}/recommendations`);

    expect(r.status).toBe(200);
    const ids = (r.body.data as Array<{ id: string }>).map((rec) => rec.id);
    expect(ids).not.toContain("complete-visibility-checklist");
  });
});
