// HTTP-level contract tests for server/routes/buffer.ts.
//
// Buffer routes are user-scoped (no separate brand-ownership check), so the
// "ownership" case here is the auth gate: an unauthenticated caller must get
// requireUser's 401, and the underlying db/service calls must never run.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111" };

class TestOwnershipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OwnershipError";
    this.status = status;
  }
}

const { authState, dbMock, tokenCipher, bufferPost, fetchMock } = vi.hoisted(() => {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) }));
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    authState: { user: undefined as undefined | { id: string } },
    dbMock: { select, from, where, limit, update, updateWhere },
    tokenCipher: {
      encryptToken: vi.fn((t: string) => `enc:${t}`),
      decryptToken: vi.fn((t: string) => t.replace(/^enc:/, "")),
    },
    bufferPost: { postToBuffer: vi.fn() },
    fetchMock: vi.fn(),
  };
});

vi.mock("../../server/db", () => ({ db: dbMock, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => {
    const u = (req as any).user ?? authState.user;
    if (!u) throw new TestOwnershipError(401, "Not authenticated");
    return u;
  },
}));
vi.mock("../../server/lib/tokenCipher", () => tokenCipher);
vi.mock("../../server/lib/bufferPost", () => bufferPost);
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, err: unknown, fallback: string) => {
    if (err instanceof TestOwnershipError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: fallback });
  },
}));

const { setupBufferRoutes } = await import("../../server/routes/buffer");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = authState.user;
    next();
  });
  setupBufferRoutes(app);
  return app;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("buffer routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = user;
    global.fetch = fetchMock as unknown as typeof fetch;
    dbMock.limit.mockReset();
    dbMock.updateWhere.mockReset().mockResolvedValue(undefined);
  });

  describe("POST /api/buffer/connect", () => {
    it("401s when not authenticated, without validating a token", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "tok" });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("400s missing_token when accessToken is blank", async () => {
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "  " });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "missing_token" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("502s buffer_unreachable when the fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "tok" });
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ success: false, error: "buffer_unreachable" });
    });

    it("400s invalid_token on a 401 from Buffer", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 401));
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "bad" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "invalid_token" });
    });

    it("400s invalid_token on an UNAUTHORIZED GraphQL error", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ errors: [{ message: "nope", extensions: { code: "UNAUTHORIZED" } }] }, 200),
      );
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "bad" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "invalid_token" });
    });

    it("502s buffer_unreachable when account.id is missing", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: { account: null } }, 200));
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "tok" });
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ success: false, error: "buffer_unreachable" });
    });

    it("persists the encrypted token and returns success", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: { account: { id: "acct-1" } } }, 200));
      const res = await request(makeApp()).post("/api/buffer/connect").send({ accessToken: "tok" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(tokenCipher.encryptToken).toHaveBeenCalledWith("tok");
      expect(dbMock.update).toHaveBeenCalled();
    });
  });

  describe("GET /api/buffer/profiles", () => {
    it("401s when not authenticated, without touching the db", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).get("/api/buffer/profiles");
      expect(res.status).toBe(401);
      expect(dbMock.select).not.toHaveBeenCalled();
    });

    it("returns connected:false when no token is stored", async () => {
      dbMock.limit.mockResolvedValue([]);
      const res = await request(makeApp()).get("/api/buffer/profiles");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, connected: false, data: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("502s when the orgs fetch fails", async () => {
      dbMock.limit.mockResolvedValue([{ token: "enc:tok" }]);
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const res = await request(makeApp()).get("/api/buffer/profiles");
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ success: false, error: "Failed to fetch Buffer profiles" });
    });

    it("returns flattened channels across organizations", async () => {
      dbMock.limit.mockResolvedValue([{ token: "enc:tok" }]);
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ data: { account: { organizations: [{ id: "org-1" }] } } }, 200),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              data: {
                channels: [
                  { id: "ch-1", name: "My Page", service: "google_business", avatar: "a.png" },
                ],
              },
            },
            200,
          ),
        );
      const res = await request(makeApp()).get("/api/buffer/profiles");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        connected: true,
        data: [
          {
            id: "ch-1",
            service: "google_business",
            formattedService: "Google Business",
            username: "My Page",
            avatar: "a.png",
          },
        ],
      });
      expect(tokenCipher.decryptToken).toHaveBeenCalledWith("enc:tok");
    });
  });

  describe("POST /api/buffer/post", () => {
    it("401s when not authenticated, without posting", async () => {
      authState.user = undefined;
      const res = await request(makeApp())
        .post("/api/buffer/post")
        .send({ text: "hi", channelId: "ch-1" });
      expect(res.status).toBe(401);
      expect(bufferPost.postToBuffer).not.toHaveBeenCalled();
    });

    it("400s when text is missing", async () => {
      const res = await request(makeApp()).post("/api/buffer/post").send({ channelId: "ch-1" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "text is required" });
      expect(bufferPost.postToBuffer).not.toHaveBeenCalled();
    });

    it("400s when channelId is missing", async () => {
      const res = await request(makeApp()).post("/api/buffer/post").send({ text: "hi" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "channelId is required" });
    });

    it("403s not_connected", async () => {
      bufferPost.postToBuffer.mockResolvedValue({ ok: false, code: "not_connected" });
      const res = await request(makeApp())
        .post("/api/buffer/post")
        .send({ text: "hi", channelId: "ch-1" });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        success: false,
        error: "Buffer is not connected. Connect it first.",
      });
    });

    it("502s rejected with the upstream message", async () => {
      bufferPost.postToBuffer.mockResolvedValue({
        ok: false,
        code: "rejected",
        message: "duplicate content",
      });
      const res = await request(makeApp())
        .post("/api/buffer/post")
        .send({ text: "hi", channelId: "ch-1" });
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ success: false, error: "duplicate content" });
    });

    it("posts and returns the postId on success", async () => {
      bufferPost.postToBuffer.mockResolvedValue({ ok: true, postId: "post-1" });
      const res = await request(makeApp())
        .post("/api/buffer/post")
        .send({ text: "hi", channelId: "ch-1", scheduledAt: "2026-09-01T00:00:00.000Z" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { postId: "post-1" } });
      expect(bufferPost.postToBuffer).toHaveBeenCalledWith(
        user.id,
        "ch-1",
        "hi",
        "2026-09-01T00:00:00.000Z",
      );
    });
  });

  describe("GET /api/buffer/status", () => {
    it("401s when not authenticated, without touching the db", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).get("/api/buffer/status");
      expect(res.status).toBe(401);
      expect(dbMock.select).not.toHaveBeenCalled();
    });

    it("returns connected:false when no token row exists", async () => {
      dbMock.limit.mockResolvedValue([]);
      const res = await request(makeApp()).get("/api/buffer/status");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, connected: false });
    });

    it("returns connected:true when a token row exists", async () => {
      dbMock.limit.mockResolvedValue([{ token: "enc:tok" }]);
      const res = await request(makeApp()).get("/api/buffer/status");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, connected: true });
    });
  });

  describe("DELETE /api/buffer/connection", () => {
    it("401s when not authenticated, without touching the db", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).delete("/api/buffer/connection");
      expect(res.status).toBe(401);
      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it("clears the stored token", async () => {
      const res = await request(makeApp()).delete("/api/buffer/connection");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(dbMock.update).toHaveBeenCalled();
    });
  });
});
