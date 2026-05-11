// Coverage for POST /api/user/password — Settings page password
// change with re-auth + Supabase Admin update (Foundations Plan 3,
// Task 2).

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.VITE_SUPABASE_ANON_KEY ??= "anon-test";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const stubs = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUserById: vi.fn(),
  signOut: vi.fn(),
  user: undefined as { id: string; email: string | null } | undefined,
}));

vi.mock("../../server/db", () => {
  const chain: any = {
    set: () => chain,
    where: () => Promise.resolve(undefined),
    from: () => chain,
    limit: () => Promise.resolve([]),
    values: () => ({ returning: async () => [] }),
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
      // Re-auth path now uses supabaseAdmin.auth.signInWithPassword
      // (matches the login route in server/auth.ts).
      signInWithPassword: stubs.signInWithPassword,
      admin: { updateUserById: stubs.updateUserById, signOut: stubs.signOut },
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
      headers: {
        host: "localhost",
        "content-type": "application/json",
        authorization: "Bearer test-jwt-token",
      },
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
  stubs.signInWithPassword.mockReset();
  stubs.updateUserById.mockReset();
  stubs.signOut.mockReset();
  stubs.signOut.mockResolvedValue({ data: null, error: null });
  stubs.user = { id: USER_ID, email: "u@example.com" };
});

describe("POST /api/user/password", () => {
  it("updates the password with valid currentPassword + newPassword", async () => {
    stubs.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    stubs.updateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/user/password", {
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    expect(stubs.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(stubs.updateUserById).toHaveBeenCalledTimes(1);
    const args = stubs.updateUserById.mock.calls[0] as unknown as [string, { password: string }];
    expect(args[0]).toBe(USER_ID);
    expect(args[1].password).toBe("newpassword123");
    // Other sessions are revoked after a successful password update.
    expect(stubs.signOut).toHaveBeenCalledTimes(1);
    const signOutArgs = stubs.signOut.mock.calls[0] as unknown as [string, string];
    expect(signOutArgs[0]).toBe("test-jwt-token");
    expect(signOutArgs[1]).toBe("others");
  });

  it("still returns success when revoking other sessions fails", async () => {
    stubs.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    stubs.updateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    stubs.signOut.mockRejectedValue(new Error("revoke boom"));
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/user/password", {
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    expect(stubs.signOut).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when the currentPassword is wrong", async () => {
    stubs.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });
    const app = buildApp();
    const { status } = await call(app, "POST", "/api/user/password", {
      currentPassword: "wrong",
      newPassword: "newpassword123",
    });
    expect(status).toBe(401);
    expect(stubs.updateUserById).not.toHaveBeenCalled();
  });

  it("returns 400 when newPassword is shorter than 8 chars", async () => {
    const app = buildApp();
    const { status } = await call(app, "POST", "/api/user/password", {
      currentPassword: "oldpassword",
      newPassword: "short",
    });
    expect(status).toBe(400);
    expect(stubs.signInWithPassword).not.toHaveBeenCalled();
    expect(stubs.updateUserById).not.toHaveBeenCalled();
  });
});
