// Plan 6 Task 2: POST /api/onboarding/autopilot-retry.
//
// Verifies the retry route only re-fires the autopilot when the caller owns
// the brand AND the brand is in the "failed" state. 404 (not 403) on
// cross-tenant per anti-enumeration policy; 409 when the brand isn't failed
// (so we never re-fire a running autopilot).
//
// Mock pattern mirrors tests/unit/geoSignalsAnalyzePersistence.test.ts:
// stub storage + ownership helpers + the autopilot launcher, mount the
// route on a bare Express app, drive it through (app as any).handle.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const BRAND_ID = "55555555-5555-4555-8555-555555555555";

const stubs = vi.hoisted(() => ({
  requireBrand: vi.fn(),
  runOnboardingAutopilot: vi.fn(),
  captureAndFlush: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/ownership")>(
    "../../server/lib/ownership",
  );
  return {
    ...actual,
    requireBrand: stubs.requireBrand,
  };
});

vi.mock("../../server/lib/onboardingAutopilot", () => ({
  runOnboardingAutopilot: stubs.runOnboardingAutopilot,
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

vi.mock("@vercel/functions", () => ({
  // Default no-op so test doesn't depend on real Vercel shim; we still
  // capture invocations so we can assert the route fired the kickoff.
  waitUntil: (p: Promise<unknown>) => {
    stubs.waitUntil(p);
    // Swallow rejections so vitest doesn't flag unhandled.
    if (p && typeof (p as Promise<unknown>).then === "function") {
      (p as Promise<unknown>).catch(() => {});
    }
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    MAX_CONTENT_LENGTH: 40_000,
    openai: { chat: { completions: { create: vi.fn() } } },
    aiLimitMiddleware: (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => next(),
    sendError: (res: express.Response, _err: unknown, fallback: string, status = 500) => {
      res.status(status).json({ success: false, error: fallback });
    },
    safeParseJson: vi.fn(),
  };
});

vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
  pool: {},
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

// storage is referenced by other onboarding routes during setup; provide
// no-op stubs for the methods touched by the retry route's siblings.
const storageStubs = vi.hoisted(() => ({
  transitionAutopilotFromFailedToPending: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getBrandByIdForUser: vi.fn(),
    createCompetitor: vi.fn(),
    transitionAutopilotFromFailedToPending: storageStubs.transitionAutopilotFromFailedToPending,
  },
}));

// Side-effecty modules pulled in transitively by onboarding.ts.
vi.mock("../../server/lib/ssrf", () => ({
  safeFetchText: vi.fn(),
}));

vi.mock("../../server/lib/logoScraper", () => ({
  scrapeLogoUrl: vi.fn(),
}));

vi.mock("../../server/lib/logoStorage", () => ({
  downloadAndStoreLogo: vi.fn(),
}));

vi.mock("../../server/lib/usageLimit", () => ({
  withBrandQuota: vi.fn(),
  isUsageLimitError: vi.fn(() => false),
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { brandAutofill: "test-model" },
}));

const { setupOnboardingRoutes } = await import("../../server/routes/onboarding");
const { OwnershipError } = await import("../../server/lib/ownership");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupOnboardingRoutes(app);
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

const app = buildApp();

beforeEach(() => {
  stubs.requireBrand.mockReset();
  stubs.runOnboardingAutopilot.mockReset();
  stubs.runOnboardingAutopilot.mockResolvedValue(undefined);
  stubs.captureAndFlush.mockReset();
  stubs.waitUntil.mockReset();
  storageStubs.transitionAutopilotFromFailedToPending.mockReset();
  storageStubs.transitionAutopilotFromFailedToPending.mockResolvedValue(true);
});

describe("POST /api/onboarding/autopilot-retry", () => {
  it("re-fires autopilot and returns 200 when user owns brand and autopilotStatus is failed", async () => {
    stubs.requireBrand.mockResolvedValue({
      id: BRAND_ID,
      userId: "user-1",
      autopilotStatus: "failed",
    });

    const r = await call(app, "POST", "/api/onboarding/autopilot-retry", { brandId: BRAND_ID });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true });
    expect(stubs.requireBrand).toHaveBeenCalledWith(BRAND_ID, "user-1");
    expect(storageStubs.transitionAutopilotFromFailedToPending).toHaveBeenCalledWith(BRAND_ID);
    expect(stubs.runOnboardingAutopilot).toHaveBeenCalledTimes(1);
    expect(stubs.waitUntil).toHaveBeenCalledTimes(1);
    const args = stubs.runOnboardingAutopilot.mock.calls[0];
    expect(args[0]).toBe(BRAND_ID);
    expect(args[1]).toBe("user-1");
    expect(args[2]).toEqual(expect.objectContaining({ deadlineMs: expect.any(Number) }));
    expect(args[2].deadlineMs).toBeGreaterThan(Date.now());
  });

  it("returns 404 with no kickoff when brand belongs to a different user (anti-enumeration)", async () => {
    stubs.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

    const r = await call(app, "POST", "/api/onboarding/autopilot-retry", {
      brandId: "foreign-brand-id",
    });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ success: false });
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });

  it("returns 409 with no kickoff when CAS loses the race (status not failed)", async () => {
    stubs.requireBrand.mockResolvedValue({
      id: BRAND_ID,
      userId: "user-1",
      autopilotStatus: "running_citations",
    });
    // CAS returns false — another caller already won, or status isn't "failed".
    storageStubs.transitionAutopilotFromFailedToPending.mockResolvedValue(false);

    const r = await call(app, "POST", "/api/onboarding/autopilot-retry", { brandId: BRAND_ID });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false });
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });

  it("returns 400 when brandId is missing", async () => {
    const r = await call(app, "POST", "/api/onboarding/autopilot-retry", {});
    expect(r.status).toBe(400);
    expect(stubs.requireBrand).not.toHaveBeenCalled();
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });
});
