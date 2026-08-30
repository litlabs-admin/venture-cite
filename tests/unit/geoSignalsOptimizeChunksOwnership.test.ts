// POST /api/geo-signals/optimize-chunks must answer 404, not 500, when the
// caller passes a brandId they do not own.
//
// The handler wraps its body in try/catch and returned a blanket 500. Its
// sibling /analyze translates OwnershipError first; this one did not. The
// difference is the whole point of the anti-enumeration policy: a
// nonexistent brand answered 404 while someone else's brand answered 500,
// so the status code confirmed the brand existed.
//
// Mock pattern mirrors tests/unit/geoSignalsAnalyzePersistence.test.ts.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const OTHER_BRAND_ID = "55555555-5555-4555-8555-555555555555";

const stubs = vi.hoisted(() => ({
  requireBrand: vi.fn(),
  optimizeContentChunks: vi.fn(),
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/ownership")>(
    "../../server/lib/ownership",
  );
  return { ...actual, requireBrand: stubs.requireBrand };
});

vi.mock("../../server/services/geoSignals", () => ({
  analyzeGeoSignals: vi.fn(),
  optimizeContentChunks: stubs.optimizeContentChunks,
  simulatePipeline: vi.fn(),
}));

vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: stubs.captureAndFlush }));
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
    sendError: vi.fn(),
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

const { setupGeoSignalsRoutes } = await import("../../server/routes/geoSignals");
const { OwnershipError } = await import("../../server/lib/ownership");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupGeoSignalsRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  url: string,
  body: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body,
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
  stubs.optimizeContentChunks.mockReset();
  stubs.captureAndFlush.mockReset();
});

describe("POST /api/geo-signals/optimize-chunks ownership translation", () => {
  it("answers 404 for a brand the caller does not own", async () => {
    stubs.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

    const res = await call(app, "/api/geo-signals/optimize-chunks", {
      content: "Some article content to optimise.",
      brandId: OTHER_BRAND_ID,
    });

    // 500 here is the defect: it distinguishes "exists but not yours" from
    // "does not exist", which is what anti-enumeration forbids.
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Brand not found" });
    // An ownership refusal is not an application fault; it must not page anyone.
    expect(stubs.captureAndFlush).not.toHaveBeenCalled();
    // And it must refuse before spending anything on the model.
    expect(stubs.optimizeContentChunks).not.toHaveBeenCalled();
  });

  it("still answers 500 for a genuine failure", async () => {
    stubs.requireBrand.mockResolvedValue({ id: OTHER_BRAND_ID, userId: "user-1", name: "Acme" });
    stubs.optimizeContentChunks.mockRejectedValue(new Error("model exploded"));

    const res = await call(app, "/api/geo-signals/optimize-chunks", {
      content: "Some article content to optimise.",
      brandId: OTHER_BRAND_ID,
    });

    expect(res.status).toBe(500);
    expect(stubs.captureAndFlush).toHaveBeenCalled();
  });

  it("optimises normally when the caller owns the brand", async () => {
    stubs.requireBrand.mockResolvedValue({ id: OTHER_BRAND_ID, userId: "user-1", name: "Acme" });
    stubs.optimizeContentChunks.mockResolvedValue("optimised text");

    const res = await call(app, "/api/geo-signals/optimize-chunks", {
      content: "Some article content to optimise.",
      brandId: OTHER_BRAND_ID,
    });

    expect(res.status).toBe(200);
    expect(stubs.optimizeContentChunks).toHaveBeenCalled();
  });
});
