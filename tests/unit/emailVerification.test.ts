// Coverage for Plan 4 Task 3: email verification flow + welcome email.
//
//   1. POST /api/auth/register no longer issues a session; instead it
//      returns { success: true, requiresVerification: true } so the
//      client can route to the /verify-email screen.
//   2. POST /api/auth/resend-verification is rate-limited (60s min gap
//      per IP+email enforced in-process on top of the 3/hour cap from
//      express-rate-limit). The second call inside the gap returns 429.
//   3. The welcome email fires exactly once on the user's first
//      successful login (detected via lastLoginAt === null) and does NOT
//      fire on subsequent logins.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.VITE_SUPABASE_ANON_KEY ??= "anon-test";

const USER_ID = "22222222-2222-4222-8222-222222222222";

const stubs = vi.hoisted(() => ({
  createUser: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  // Drizzle chain state: the login handler does select().from().where().limit()
  // (loadPublicUser) and update().set().where(). We make both work off a
  // mutable user row.
  dbUser: null as null | {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    timezone: string | null;
    accessTier: string;
    profileImageUrl: string | null;
    isAdmin: number;
    deletedAt: Date | null;
    lastLoginAt: Date | null;
    welcomedAt: Date | null;
    emailVerified: number;
  },
  sendWelcomeEmail: vi.fn(),
  // Plan 4 audit: tests now exercise the waitUntil dispatch path.
  // Collect promises so the test can await them deterministically
  // instead of relying on a setImmediate microtask flush.
  waitUntilPromises: [] as Promise<unknown>[],
}));

vi.mock("../../server/db", () => {
  const selectChain: any = {
    from: () => selectChain,
    where: () => selectChain,
    limit: () => Promise.resolve(stubs.dbUser ? [stubs.dbUser] : []),
  };
  // Drizzle chain: update().set(vals).where(cond).returning() — the
  // Plan 4 fix to BUG #1 uses a conditional UPDATE...RETURNING to
  // detect the race winner. Simulate that by inspecting whether the
  // gated column is currently null on the in-memory row.
  function makeUpdateChain() {
    let pendingVals: Record<string, unknown> | null = null;
    let gateField: "welcomedAt" | null = null;
    const chain: any = {
      set(vals: Record<string, unknown>) {
        pendingVals = vals;
        return chain;
      },
      where(cond: any) {
        // Sniff the condition for an isNull(users.welcomedAt) clause.
        // Drizzle's `and(eq(...), isNull(...))` builds an object; we
        // can't reliably introspect it, so we use a side-channel:
        // any UPDATE that sets welcomedAt is treated as the conditional
        // first-login UPDATE.
        if (pendingVals && Object.prototype.hasOwnProperty.call(pendingVals, "welcomedAt")) {
          gateField = "welcomedAt";
        }
        const applyMutation = () => {
          if (!stubs.dbUser || !pendingVals) return;
          if (gateField === "welcomedAt") {
            // Only mutate (and "return" a row) when the gate is NULL.
            if (stubs.dbUser.welcomedAt === null) {
              Object.assign(stubs.dbUser, pendingVals);
            } else {
              // Race loser — set nothing, return zero rows.
              pendingVals = null;
            }
          } else {
            Object.assign(stubs.dbUser, pendingVals);
          }
        };
        // Promise-shaped (no .returning) — resolve directly.
        const thenable: any = {
          then(onF: any, onR: any) {
            applyMutation();
            return Promise.resolve(undefined).then(onF, onR);
          },
          returning() {
            applyMutation();
            const rows =
              gateField === "welcomedAt"
                ? pendingVals === null
                  ? []
                  : [{ id: stubs.dbUser?.id }]
                : [{ id: stubs.dbUser?.id }];
            return Promise.resolve(rows);
          },
        };
        return thenable;
      },
    };
    return chain;
  }
  return {
    db: {
      select: () => selectChain,
      update: () => makeUpdateChain(),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
      delete: () => ({ where: () => Promise.resolve(undefined) }),
    },
    pool: {},
  };
});

vi.mock("../../server/supabase", () => ({
  supabaseAdmin: {
    auth: {
      admin: { createUser: stubs.createUser },
      signInWithPassword: stubs.signInWithPassword,
      resend: stubs.resend,
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  requestContext: { getStore: () => undefined },
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { setUser: vi.fn(), captureException: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/lib/workflowEngine", () => ({
  maybeTickActiveRunsForUser: vi.fn(async () => undefined),
}));

vi.mock("../../server/lib/welcomeEmail", () => ({
  sendWelcomeEmail: stubs.sendWelcomeEmail,
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => {
    // Capture the promise so tests can await it deterministically.
    if (p && typeof (p as any).then === "function") {
      stubs.waitUntilPromises.push(p);
    }
  },
}));

const { setupAuth, __resetResendVerificationStateForTests } = await import("../../server/auth");

function buildApp(): express.Express {
  const app = express();
  app.set("trust proxy", false);
  app.use(express.json({ limit: "1mb" }));
  setupAuth(app);
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
      ip: "127.0.0.1",
      headers: {
        host: "localhost",
        "content-type": "application/json",
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
      getHeader() {
        return undefined;
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

function makeDbUser(overrides: Partial<NonNullable<typeof stubs.dbUser>> = {}) {
  return {
    id: USER_ID,
    email: "new@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    timezone: null,
    accessTier: "free",
    profileImageUrl: null,
    isAdmin: 0,
    deletedAt: null,
    lastLoginAt: null,
    welcomedAt: null,
    emailVerified: 1,
    ...overrides,
  };
}

async function flushWaitUntil() {
  // Resolve any promises captured by the waitUntil mock so assertions
  // run after the detached work completes. Loop in case a captured
  // promise itself enqueues more work.
  while (stubs.waitUntilPromises.length > 0) {
    const pending = stubs.waitUntilPromises.splice(0);
    await Promise.allSettled(pending);
  }
}

beforeEach(() => {
  stubs.createUser.mockReset();
  stubs.signInWithPassword.mockReset();
  stubs.resend.mockReset();
  stubs.sendWelcomeEmail.mockReset();
  stubs.sendWelcomeEmail.mockResolvedValue(true);
  stubs.dbUser = null;
  stubs.waitUntilPromises.length = 0;
  __resetResendVerificationStateForTests();
});

describe("POST /api/auth/register (requires verification)", () => {
  it("returns { success: true, requiresVerification: true } and does not issue a session", async () => {
    stubs.createUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "new@example.com" } },
      error: null,
    });
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/auth/register", {
      email: "New@Example.com",
      password: "averylongpassword",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.requiresVerification).toBe(true);
    expect(body?.access_token).toBeUndefined();
    expect(body?.refresh_token).toBeUndefined();
    // Supabase createUser was called with email_confirm: false so the
    // confirmation email is actually sent.
    expect(stubs.createUser).toHaveBeenCalledTimes(1);
    const args = stubs.createUser.mock.calls[0]![0] as { email_confirm: boolean; email: string };
    expect(args.email_confirm).toBe(false);
    expect(args.email).toBe("new@example.com");
    // Crucially: we did NOT auto-login the freshly created account.
    expect(stubs.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("rate-limits a second call within 60 seconds", async () => {
    stubs.resend.mockResolvedValue({ data: null, error: null });
    const app = buildApp();
    const first = await call(app, "POST", "/api/auth/resend-verification", {
      email: "pending@example.com",
    });
    expect(first.status).toBe(200);
    expect(first.body?.success).toBe(true);
    expect(stubs.resend).toHaveBeenCalledTimes(1);

    const second = await call(app, "POST", "/api/auth/resend-verification", {
      email: "pending@example.com",
    });
    expect(second.status).toBe(429);
    // The second call must not reach Supabase.
    expect(stubs.resend).toHaveBeenCalledTimes(1);
  });
});

describe("welcome email on first login", () => {
  it("fires sendWelcomeEmail exactly once on first verified login", async () => {
    stubs.dbUser = makeDbUser({ welcomedAt: null, lastLoginAt: null });
    stubs.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email: "new@example.com",
          email_confirmed_at: new Date().toISOString(),
        },
        session: {
          access_token: "at",
          refresh_token: "rt",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/auth/login", {
      email: "new@example.com",
      password: "averylongpassword",
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    // Welcome email is dispatched via waitUntil — flush captured
    // promises so assertions run after the detached work resolves.
    await flushWaitUntil();
    expect(stubs.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    const args = stubs.sendWelcomeEmail.mock.calls[0]!;
    expect(args[0]).toBe("new@example.com");
    expect(args[1]).toBe("Ada");
    // welcomedAt + lastLoginAt are stamped on the db row by the
    // conditional UPDATE in the login handler.
    expect(stubs.dbUser!.welcomedAt).not.toBeNull();
    expect(stubs.dbUser!.lastLoginAt).not.toBeNull();
  });

  it("does NOT fire on a subsequent login (welcomedAt already set)", async () => {
    stubs.dbUser = makeDbUser({
      welcomedAt: new Date("2024-01-01T00:00:00Z"),
      lastLoginAt: new Date("2024-01-01T00:00:00Z"),
    });
    stubs.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email: "new@example.com",
          email_confirmed_at: new Date().toISOString(),
        },
        session: {
          access_token: "at",
          refresh_token: "rt",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    const app = buildApp();
    const { status } = await call(app, "POST", "/api/auth/login", {
      email: "new@example.com",
      password: "averylongpassword",
    });
    expect(status).toBe(200);
    await flushWaitUntil();
    expect(stubs.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
