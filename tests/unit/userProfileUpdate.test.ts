// Coverage for PATCH /api/user/profile — Settings page profile form
// (Foundations Plan 3, Task 2).

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const stubs = vi.hoisted(() => ({
  updateCalls: [] as Array<Record<string, unknown>>,
  user: undefined as { id: string; email: string | null } | undefined,
}));

vi.mock("../../server/db", () => {
  const chain: any = {
    set(values: Record<string, unknown>) {
      stubs.updateCalls.push(values);
      return chain;
    },
    where() {
      return Promise.resolve(undefined);
    },
    from() {
      return chain;
    },
    limit() {
      return Promise.resolve([]);
    },
    values() {
      return { returning: async () => [] };
    },
  };
  return {
    db: {
      select: () => chain,
      update: () => chain,
      insert: () => chain,
      delete: () => chain,
    },
    pool: {},
  };
});

vi.mock("../../server/supabase", () => ({
  supabaseAdmin: {
    auth: {
      signInWithPassword: vi.fn(),
      admin: { updateUserById: vi.fn() },
    },
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

vi.mock("../../server/lib/notificationPrefs", () => ({
  NOTIFICATION_TYPES: [],
  getPreferences: vi.fn(),
  setPreference: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!stubs.user) return res.status(401).json({ success: false, error: "Not authenticated" });
    (req as any).user = stubs.user;
    next();
  },
}));

const { setupUserAccountRoutes } = await import("../../server/routes/userAccount");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupUserAccountRoutes(app);
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
  stubs.updateCalls.length = 0;
  stubs.user = { id: USER_ID, email: "u@example.com" };
});

describe("PATCH /api/user/profile", () => {
  it("updates firstName, lastName, and timezone with valid input", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "PATCH", "/api/user/profile", {
      firstName: "Ada",
      lastName: "Lovelace",
      timezone: "America/New_York",
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    expect(stubs.updateCalls).toHaveLength(1);
    const setPayload = stubs.updateCalls[0]!;
    expect(setPayload.firstName).toBe("Ada");
    expect(setPayload.lastName).toBe("Lovelace");
    expect(setPayload.timezone).toBe("America/New_York");
  });

  it("accepts a partial body (firstName only)", async () => {
    const app = buildApp();
    const { status } = await call(app, "PATCH", "/api/user/profile", { firstName: "Grace" });
    expect(status).toBe(200);
    expect(stubs.updateCalls).toHaveLength(1);
    expect(stubs.updateCalls[0]!.firstName).toBe("Grace");
    expect("lastName" in stubs.updateCalls[0]!).toBe(false);
    expect("timezone" in stubs.updateCalls[0]!).toBe(false);
  });

  it("rejects an invalid timezone with 400", async () => {
    const app = buildApp();
    const { status } = await call(app, "PATCH", "/api/user/profile", {
      timezone: "Not/A_Real_Zone",
    });
    expect(status).toBe(400);
    expect(stubs.updateCalls).toHaveLength(0);
  });
});
