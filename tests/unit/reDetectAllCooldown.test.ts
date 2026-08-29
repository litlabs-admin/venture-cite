// Regression test for the re-detect-all cooldown
// (POST /api/brand-prompts/:brandId/re-detect-all, server/routes/prompts.ts).
//
// The cooldown used to live in a `Map` declared inside setupPromptsRoutes's
// closure. That state resets every time the module/function is re-run - i.e.
// every redeploy, and it isn't shared across instances either. The fix reads
// storage.getReDetectAllLastRunAt/setReDetectAllLastRunAt, which is backed by
// the system_state table (see server/storage/promptsStorage.ts), so the
// cooldown is durable and shared.
//
// This test proves that property directly: it calls setupPromptsRoutes
// TWICE, against two separate express apps, each getting its own fresh
// closure - simulating two separate process lifetimes (a redeploy, or two
// instances behind a load balancer). Both apps share the SAME storage mock,
// standing in for the one real database both processes would talk to. If the
// cooldown were still living in a per-closure Map, the second app would have
// an empty map and the second request would incorrectly succeed.
//
// Mock pattern copied from tests/unit/boardRoutes.test.ts and
// tests/unit/dashboardSiteHealthPerception.test.ts: mount the real
// setupPromptsRoutes(app) against an express app, mock storage/db/
// routesShared/logger and the AI-generation modules prompts.ts imports (but
// never calls from this route) so nothing touches a live DATABASE_URL,
// OPENAI_API_KEY, or OPENROUTER_API_KEY.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const USER_ID = "user-1";
const BRAND_ID = "brand-1";

const brandRow = {
  id: BRAND_ID,
  userId: USER_ID,
  name: "Acme",
  companyName: "Acme Inc",
  industry: "software",
  nameVariations: [] as string[],
  website: null as string | null,
};

// ---------------------------------------------------------------------------
// db mock - only requireBrand (server/lib/ownership.ts) touches `db` on this
// route.
// ---------------------------------------------------------------------------
const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: dbMock, pool: {} }));

// ---------------------------------------------------------------------------
// storage mock - the cooldown itself, plus the handful of calls the
// re-detect-all body makes when it actually runs (kept empty so the
// per-surface loops are no-ops).
// ---------------------------------------------------------------------------
const storageStubs = vi.hoisted(() => ({
  getReDetectAllLastRunAt: vi.fn(),
  setReDetectAllLastRunAt: vi.fn(),
  getCompetitors: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getListicles: vi.fn(),
  getWikipediaMentions: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: any) => (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next),
  sendError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ success: false, error: message }),
  aiLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// These are imported by server/routes/prompts.ts for OTHER routes in the
// same file (generate, suggestions, audiences/generate, set-health/run,
// phrasings, diagnose). re-detect-all calls none of them, but the module
// import must still resolve without constructing a real OpenAI/OpenRouter
// client.
vi.mock("../../server/citationChecker", () => ({
  kickoffBrandPromptsRun: vi.fn(),
  advanceCitationRun: vi.fn(),
  runPlatformCitationCheck: vi.fn(),
  DEFAULT_CITATION_PLATFORMS: ["chatgpt"],
}));
vi.mock("../../server/lib/promptGenerator", () => ({ generateBrandPrompts: vi.fn() }));
vi.mock("../../server/lib/suggestionGenerator", () => ({ generateSuggestedPrompts: vi.fn() }));
vi.mock("../../server/lib/audienceGenerator", () => ({ generatePromptAudiences: vi.fn() }));
vi.mock("../../server/lib/promptSetHealthAuditor", () => ({ runPromptSetHealthAudit: vi.fn() }));
vi.mock("../../server/lib/phrasingGenerator", () => ({ generatePhrasings: vi.fn() }));
vi.mock("../../server/lib/promptDiagnose", () => ({ diagnosePrompt: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

import { setupPromptsRoutes } from "../../server/routes/prompts";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID };
    next();
  });
  // Each call gets its own fresh closure - standing in for a fresh process.
  setupPromptsRoutes(app);
  return app;
}

function queueBrandLookup() {
  dbMock.select.mockReturnValueOnce({
    from: () => ({
      where: () => ({ limit: async () => [brandRow] }),
    }),
  });
}

describe("POST /api/brand-prompts/:brandId/re-detect-all cooldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStubs.getCompetitors.mockResolvedValue([]);
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    storageStubs.getListicles.mockResolvedValue([]);
    storageStubs.getWikipediaMentions.mockResolvedValue([]);
    storageStubs.setReDetectAllLastRunAt.mockResolvedValue(undefined);
  });

  it("holds the cooldown across a simulated process restart (does not depend on module state)", async () => {
    // storage stands in for the real database: a run landed 5s ago, well
    // inside the 60s window. Both "processes" below read this same value.
    storageStubs.getReDetectAllLastRunAt.mockResolvedValue(new Date(Date.now() - 5_000));

    // "Process A" - first app instance.
    queueBrandLookup();
    const appA = makeApp();
    const resA = await request(appA).post(`/api/brand-prompts/${BRAND_ID}/re-detect-all`).send();
    expect(resA.status).toBe(429);
    expect(resA.body.success).toBe(false);
    expect(resA.headers["retry-after"]).toBeDefined();
    expect(Number(resA.headers["retry-after"])).toBeGreaterThan(0);
    expect(resA.body.retryAfterSeconds).toBeGreaterThan(0);

    // "Process B" - a brand-new call to setupPromptsRoutes, i.e. a brand-new
    // closure with no memory of process A. A Map-backed cooldown would be
    // empty here and let this request through; the database-backed cooldown
    // must still block it because the same recent timestamp is still there.
    queueBrandLookup();
    const appB = makeApp();
    const resB = await request(appB).post(`/api/brand-prompts/${BRAND_ID}/re-detect-all`).send();
    expect(resB.status).toBe(429);
    expect(resB.body.success).toBe(false);

    // Neither blocked call should have recorded a new run.
    expect(storageStubs.setReDetectAllLastRunAt).not.toHaveBeenCalled();
  });

  it("allows the call once the cooldown window has elapsed, and records the new run durably", async () => {
    storageStubs.getReDetectAllLastRunAt.mockResolvedValue(new Date(Date.now() - 61_000));
    queueBrandLookup();

    const app = makeApp();
    const res = await request(app).post(`/api/brand-prompts/${BRAND_ID}/re-detect-all`).send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storageStubs.setReDetectAllLastRunAt).toHaveBeenCalledTimes(1);
    expect(storageStubs.setReDetectAllLastRunAt).toHaveBeenCalledWith(BRAND_ID, expect.any(Date));
  });

  it("allows the very first call for a brand that has never run re-detect-all", async () => {
    storageStubs.getReDetectAllLastRunAt.mockResolvedValue(null);
    queueBrandLookup();

    const app = makeApp();
    const res = await request(app).post(`/api/brand-prompts/${BRAND_ID}/re-detect-all`).send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storageStubs.setReDetectAllLastRunAt).toHaveBeenCalledTimes(1);
  });
});
