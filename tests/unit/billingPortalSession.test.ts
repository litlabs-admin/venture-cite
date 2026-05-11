// Coverage for POST /api/billing/portal-session — Stripe customer
// portal session URL endpoint used by the expanded Settings page
// (Foundations Plan 3, Task 2).

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_xxx";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const stubs = vi.hoisted(() => ({
  getUser: vi.fn(),
  portalCreate: vi.fn(),
  user: undefined as { id: string } | undefined,
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getUser: stubs.getUser,
  },
}));

vi.mock("../../server/stripeClient", () => ({
  getUncachableStripeClient: async () => ({
    billingPortal: {
      sessions: { create: stubs.portalCreate },
    },
  }),
  getStripeClient: () => ({
    billingPortal: { sessions: { create: stubs.portalCreate } },
  }),
  getStripePublishableKey: async () => "pk_test_x",
}));

vi.mock("../../server/db", () => {
  const chain: any = {};
  chain.set = () => chain;
  chain.where = () => chain;
  chain.from = () => chain;
  chain.limit = () => Promise.resolve([]);
  chain.values = () => ({ returning: async () => [] });
  return {
    db: {
      select: () => chain,
      update: () => chain,
      insert: () => chain,
      delete: () => chain,
      execute: async () => ({ rows: [] }),
    },
    pool: {},
  };
});

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!stubs.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    (req as any).user = stubs.user;
    next();
  },
}));

const { setupBillingRoutes } = await import("../../server/routes/billing");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupBillingRoutes(app);
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
  stubs.getUser.mockReset();
  stubs.portalCreate.mockReset();
  stubs.user = { id: USER_ID };
});

describe("POST /api/billing/portal-session", () => {
  it("returns 200 + url for an authenticated user with a stripeCustomerId", async () => {
    stubs.getUser.mockResolvedValue({ id: USER_ID, stripeCustomerId: "cus_123" });
    stubs.portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/billing/portal-session");
    expect(status).toBe(200);
    expect(body?.url).toBe("https://billing.stripe.com/session/abc");
    expect(stubs.portalCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when the user has no stripeCustomerId", async () => {
    stubs.getUser.mockResolvedValue({ id: USER_ID, stripeCustomerId: null });
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/billing/portal-session");
    expect(status).toBe(400);
    expect(typeof body?.error).toBe("string");
    expect(stubs.portalCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    stubs.user = undefined;
    const app = buildApp();
    const { status } = await call(app, "POST", "/api/billing/portal-session");
    expect(status).toBe(401);
    expect(stubs.portalCreate).not.toHaveBeenCalled();
  });
});
