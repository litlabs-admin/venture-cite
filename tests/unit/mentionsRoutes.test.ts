// Coverage for the mentions REST endpoints (Mentions Rebuild — Task 15).
//
// Verifies ownership scoping (C13/C14 regression), Zod validation,
// URL host whitelist + javascript: rejection, status-PATCH transition
// validation, idempotent scan-start, 4h cooldown, and cross-tenant
// scan-status scoping.
//
// Storage, ownership helpers, runMentionScan, safeFetchText, and
// judgeSentimentBatch are all stubbed — no DB or network I/O.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";
const BRAND_UUID = "33333333-3333-4333-8333-333333333333";
const SCAN_UUID = "44444444-4444-4444-8444-444444444444";

const stubs = vi.hoisted(() => ({
  // storage stubs
  listMentionsForBrand: vi.fn(async () => ({ rows: [], nextCursor: null })),
  getMentionStatsForBrand: vi.fn(async () => ({
    total: 0,
    byPlatform: {},
    bySentiment: { positive: 0, neutral: 0, negative: 0 },
    byStatus: {},
  })),
  getBrandById: vi.fn(async () => ({
    id: BRAND_UUID,
    userId: "user-1",
    name: "Acme",
    nameVariations: [],
  })),
  tryInsertBrandMention: vi.fn(async () => ({ id: VALID_UUID, brandId: BRAND_UUID })),
  updateBrandMentionStatus: vi.fn(async () => undefined),
  deleteBrandMention: vi.fn(async () => undefined),
  getOwnedMentionIds: vi.fn(async () => [VALID_UUID]),
  deleteManyBrandMentions: vi.fn(async () => 1),
  deleteAllMentionsForBrand: vi.fn(async () => 5),
  getActiveScanJobForBrand: vi.fn(async () => undefined),
  getMostRecentManualScanForBrand: vi.fn(async () => undefined),
  createScanJob: vi.fn(async () => ({ id: SCAN_UUID })),
  getScanJob: vi.fn(async () => ({
    id: SCAN_UUID,
    userId: "user-1",
    brandId: BRAND_UUID,
    status: "running",
    perSource: {},
    totals: {},
  })),
  getActiveScanJobsForUser: vi.fn(async () => []),
  getLastCompletedScanForBrand: vi.fn(async () => undefined),
  setBrandMonitorMentions: vi.fn(async () => undefined),

  // ownership stubs
  requireBrand: vi.fn(async () => ({ id: BRAND_UUID, name: "Acme" })),
  requireMentionOwnership: vi.fn(async () => ({
    id: VALID_UUID,
    brandId: BRAND_UUID,
    status: "new",
  })),

  // safeFetchText stub
  safeFetchText: vi.fn(async () => ({
    status: 200,
    text: "Acme is a great product for teams",
    contentType: "text/html",
  })),

  // judgeSentimentBatch stub
  judgeSentimentBatch: vi.fn(async () => ({
    x: { sentiment: "positive", sentimentScore: 0.9, source: "llm" },
  })),

  // runMentionScan stub
  runMentionScan: vi.fn(async () => undefined),

  // captureAndFlush stub
  captureAndFlush: vi.fn(),

  // rateLimitBuckets stub
  acquireOrWait: vi.fn(async () => true),
}));

// Mock isAuthenticated — always passes, sets req.user = { id: "user-1" }
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = { id: "user-1" };
    next();
  },
}));

vi.mock("../../server/lib/ownership", () => ({
  requireBrand: stubs.requireBrand,
  requireMentionOwnership: stubs.requireMentionOwnership,
}));

vi.mock("../../server/storage", () => ({
  storage: {
    listMentionsForBrand: stubs.listMentionsForBrand,
    getMentionStatsForBrand: stubs.getMentionStatsForBrand,
    getBrandById: stubs.getBrandById,
    tryInsertBrandMention: stubs.tryInsertBrandMention,
    updateBrandMentionStatus: stubs.updateBrandMentionStatus,
    deleteBrandMention: stubs.deleteBrandMention,
    getOwnedMentionIds: stubs.getOwnedMentionIds,
    deleteManyBrandMentions: stubs.deleteManyBrandMentions,
    deleteAllMentionsForBrand: stubs.deleteAllMentionsForBrand,
    getActiveScanJobForBrand: stubs.getActiveScanJobForBrand,
    getMostRecentManualScanForBrand: stubs.getMostRecentManualScanForBrand,
    createScanJob: stubs.createScanJob,
    getScanJob: stubs.getScanJob,
    getActiveScanJobsForUser: stubs.getActiveScanJobsForUser,
    getLastCompletedScanForBrand: stubs.getLastCompletedScanForBrand,
    setBrandMonitorMentions: stubs.setBrandMonitorMentions,
  },
}));

vi.mock("../../server/lib/ssrf", () => ({
  safeFetchText: stubs.safeFetchText,
}));

vi.mock("../../server/lib/sentimentBatcher", () => ({
  judgeSentimentBatch: stubs.judgeSentimentBatch,
}));

vi.mock("../../server/lib/runMentionScan", () => ({
  runMentionScan: stubs.runMentionScan,
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/brandPresenceGate", () => ({
  passesBrandPresenceGate: vi.fn((_text: any, _variations: string[]) => ({
    matched: true,
    matchedVariation: "Acme",
    matchedField: "selftext",
  })),
}));

vi.mock("../../server/lib/canonicalUrl", () => ({
  canonicalizeMentionUrl: vi.fn((_platform: string, url: string) => url),
}));

vi.mock("../../server/lib/rateLimitBuckets", () => ({
  acquireOrWait: stubs.acquireOrWait,
}));

// Import the router after mocks are set up
const { mentionsRouter } = await import("../../server/routes/mentions");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // Mount at root so test URLs can use bare paths (e.g. "/uuid" → /:brandId).
  // In production, routes.ts mounts at /api/brand-mentions — the router itself
  // is agnostic to the mount point.
  app.use("/", mentionsRouter);
  return app;
}

async function call(
  app: express.Express,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body: body ?? {},
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

beforeEach(() => {
  for (const v of Object.values(stubs)) {
    if (typeof (v as any).mockClear === "function") (v as any).mockClear();
  }
  // Reset defaults
  stubs.requireBrand.mockResolvedValue({ id: BRAND_UUID, name: "Acme" });
  stubs.requireMentionOwnership.mockResolvedValue({
    id: VALID_UUID,
    brandId: BRAND_UUID,
    status: "new",
  });
  stubs.getActiveScanJobForBrand.mockResolvedValue(undefined);
  stubs.getMostRecentManualScanForBrand.mockResolvedValue(undefined);
  stubs.getLastCompletedScanForBrand.mockResolvedValue(undefined);
  stubs.acquireOrWait.mockResolvedValue(true);
  stubs.createScanJob.mockResolvedValue({ id: SCAN_UUID });
  stubs.getScanJob.mockResolvedValue({
    id: SCAN_UUID,
    userId: "user-1",
    brandId: BRAND_UUID,
    status: "running",
    perSource: {},
    totals: {},
  });
  stubs.safeFetchText.mockResolvedValue({
    status: 200,
    text: "Acme is a great product",
    contentType: "text/html",
  });
});

const app = buildApp();

describe("GET /api/brand-mentions/:brandId", () => {
  it("1. returns 404 when caller doesn't own brand (Audit C13 regression)", async () => {
    stubs.requireBrand.mockResolvedValue(null);
    const r = await call(app, "GET", `/${BRAND_UUID}`);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: "not_found" });
  });
});

describe("GET /api/brand-mentions/alerts/:brandId (C14 regression)", () => {
  it("2. returns 404 when caller doesn't own brand (Audit C14 regression)", async () => {
    stubs.requireBrand.mockResolvedValue(null);
    const r = await call(app, "GET", `/alerts/${BRAND_UUID}`);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: "not_found" });
  });
});

describe("POST /api/brand-mentions — manual add", () => {
  it("3. rejects javascript: URL with 400 (Audit C5/G1 regression)", async () => {
    const r = await call(app, "POST", "/", {
      brandId: BRAND_UUID,
      platform: "reddit",
      sourceUrl: "javascript:alert(1)",
    });
    expect(r.status).toBe(400);
  });

  it("4. rejects URL whose host doesn't match selected platform", async () => {
    const r = await call(app, "POST", "/", {
      brandId: BRAND_UUID,
      platform: "hackernews",
      sourceUrl: "https://www.reddit.com/r/saas/comments/abc123/title/",
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "url_host_mismatch" });
  });

  it("5. rejects when brand-presence gate fails", async () => {
    const { passesBrandPresenceGate } = await import("../../server/lib/brandPresenceGate");
    (passesBrandPresenceGate as any).mockReturnValueOnce({ matched: false });
    const r = await call(app, "POST", "/", {
      brandId: BRAND_UUID,
      platform: "reddit",
      sourceUrl: "https://www.reddit.com/r/saas/comments/abc123/title/",
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "brand_not_found_in_content" });
  });
});

describe("PATCH /api/brand-mentions/:id", () => {
  it("6. rejects status transition replied → new with 409 (Audit C3 regression)", async () => {
    stubs.requireMentionOwnership.mockResolvedValue({
      id: VALID_UUID,
      brandId: BRAND_UUID,
      status: "replied",
    });
    const r = await call(app, "PATCH", `/${VALID_UUID}`, { status: "new" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "invalid_transition" });
  });

  it("7. enforces ownership — 404 cross-tenant (Audit C13 regression)", async () => {
    stubs.requireMentionOwnership.mockResolvedValue(null);
    const r = await call(app, "PATCH", `/${OTHER_UUID}`, { status: "acknowledged" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: "not_found" });
  });
});

describe("DELETE /api/brand-mentions/:id", () => {
  it("8. returns the deleted row (for undo)", async () => {
    const r = await call(app, "DELETE", `/${VALID_UUID}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("data");
    expect(r.body.data).toMatchObject({ id: VALID_UUID });
  });
});

describe("POST /api/brand-mentions/scans/:brandId", () => {
  it("9. idempotent — second call returns the in-progress scanId (Audit A17 regression)", async () => {
    stubs.getActiveScanJobForBrand.mockResolvedValue({ id: SCAN_UUID, status: "running" });
    const r = await call(app, "POST", `/scans/${BRAND_UUID}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ scanId: SCAN_UUID, attached: true });
    expect(stubs.createScanJob).not.toHaveBeenCalled();
  });

  it("10. cooldown disabled: recent scan does not block a new one", async () => {
    // COOLDOWN_MS is currently 0 in routes/mentions.ts. Even with a recent
    // completed scan, a new scan should be permitted (returns 202).
    const recentCompletedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
    stubs.getMostRecentManualScanForBrand.mockResolvedValue({
      id: SCAN_UUID,
      completedAt: recentCompletedAt,
    });
    stubs.createScanJob.mockResolvedValue({ id: "new-scan-id" });
    const r = await call(app, "POST", `/scans/${BRAND_UUID}`);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ scanId: "new-scan-id" });
    expect(stubs.createScanJob).toHaveBeenCalled();
  });
});

describe("GET /api/brand-mentions/scans/:scanId", () => {
  it("11. returns 404 cross-tenant", async () => {
    stubs.getScanJob.mockResolvedValue({
      id: SCAN_UUID,
      userId: "other-user",
      brandId: BRAND_UUID,
      status: "running",
    });
    const r = await call(app, "GET", `/scans/${SCAN_UUID}`);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: "not_found" });
  });
});
