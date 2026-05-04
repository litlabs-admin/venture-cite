// tests/unit/bufferConnect.test.ts
//
// Coverage for POST /api/buffer/connect and DELETE /api/buffer/connection.
// Connect validates against Buffer's GraphQL endpoint
// (https://api.buffer.com) by issuing a `{ account { id } }` query and
// requires both a 200 response AND a non-null `data.account.id` to
// consider the key valid. UNAUTHORIZED extensions codes inside a 200
// response also count as invalid.
//
// Strategy: build a minimal Express app, mount the buffer routes against
// a stub `req.user`, mock the database update + Buffer fetch, and drive
// the route via a manual request/response shim (same pattern used in
// tests/unit/cronOrchestrator.test.ts so vitest's module mocks behave).
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const dbStubs = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    update: (...args: unknown[]) => {
      dbStubs.update(...args);
      return { set: dbStubs.set.mockReturnValue({ where: dbStubs.where }) };
    },
    select: (...args: unknown[]) => {
      dbStubs.select(...args);
      return {
        from: dbStubs.from.mockReturnValue({
          where: dbStubs.where.mockReturnValue({ limit: dbStubs.limit }),
        }),
      };
    },
  },
}));

vi.mock("../../server/lib/tokenCipher", () => ({
  encryptToken: (s: string) => `enc:v1:${s}`,
  decryptToken: (s: string) => s.replace(/^enc:v1:/, ""),
}));

vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: any, _err: unknown, msg: string) => {
    res.status(500).json({ success: false, error: msg });
  },
  // Pass-through wrapper — production version forwards thrown errors
  // to next(); tests don't exercise the unhandled-rejection path.
  asyncHandler: (fn: any) => fn,
}));

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

const { setupBufferRoutes } = await import("../../server/routes/buffer");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupBufferRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: "POST" | "DELETE",
  url: string,
  body: unknown = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
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
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  fetchStub.mockReset();
  for (const fn of Object.values(dbStubs)) (fn as any).mockReset?.();
  dbStubs.limit.mockResolvedValue([]);
});

describe("buffer connect endpoint", () => {
  it("scaffold loads", () => {
    expect(typeof buildApp).toBe("function");
  });

  it("POST /api/buffer/connect persists encrypted token when Buffer validates the token", async () => {
    fetchStub.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { account: { id: "acc_123" } } }),
    } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "buf_abcdef",
    });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    // GraphQL POST to https://api.buffer.com with Bearer auth.
    expect(fetchStub).toHaveBeenCalledWith(
      "https://api.buffer.com",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer buf_abcdef",
          "Content-Type": "application/json",
        }),
      }),
    );
    // The .set() chain receives the encrypted token (our stub prefixes with enc:v1:).
    expect(dbStubs.set).toHaveBeenCalledWith({ bufferAccessToken: "enc:v1:buf_abcdef" });
  });

  it("POST /api/buffer/connect returns 400 missing_token for empty body", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {});
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "missing_token" });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 400 missing_token for whitespace-only token", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "   ",
    });
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "missing_token" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 400 invalid_token when Buffer responds 401", async () => {
    fetchStub.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "bad-token",
    });
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "invalid_token" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 400 invalid_token when GraphQL response carries UNAUTHORIZED", async () => {
    // Buffer's GraphQL API returns HTTP 200 with errors[].extensions.code
    // for credential failures. The route must treat that as invalid_token,
    // not buffer_unreachable.
    fetchStub.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errors: [{ message: "Not authorized", extensions: { code: "UNAUTHORIZED" } }],
      }),
    } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "wrong-key",
    });
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "invalid_token" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 502 buffer_unreachable on Buffer 5xx", async () => {
    fetchStub.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "buf_whatever",
    });
    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "buffer_unreachable" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 502 buffer_unreachable when GraphQL succeeds but data.account is missing", async () => {
    // 200 OK with no data — treat as buffer_unreachable, not silent success.
    fetchStub.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { account: null } }),
    } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "buf_whatever",
    });
    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "buffer_unreachable" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 502 buffer_unreachable on network error", async () => {
    fetchStub.mockRejectedValueOnce(new Error("ECONNRESET"));
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "buf_whatever",
    });
    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "buffer_unreachable" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("DELETE /api/buffer/connection clears the stored token", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "DELETE", "/api/buffer/connection");
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(dbStubs.set).toHaveBeenCalledWith({ bufferAccessToken: null });
  });
});
