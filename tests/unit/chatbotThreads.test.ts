// Coverage for the multi-thread chatbot REST endpoints (Phase 5 v2).
//
// Verifies list/create/get-messages/archive/restore behave correctly,
// enforce ownership via requireChatbotThread, and return user-scoped
// data only. Storage and ownership are stubbed; no DB is touched.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const stubs = vi.hoisted(() => ({
  listChatbotThreads: vi.fn(async () => [] as any[]),
  createChatbotThread: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    title: "New chat",
    brandId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  })),
  getChatbotThreadMessages: vi.fn(async () => [] as any[]),
  archiveChatbotThread: vi.fn(async () => undefined),
  restoreChatbotThread: vi.fn(async () => undefined),
  requireUser: vi.fn(() => ({ id: "user-1", accessTier: "free" })),
  requireChatbotThread: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
  })),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: stubs.requireUser,
  requireChatbotThread: stubs.requireChatbotThread,
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  sendOwnershipError: () => false,
}));
vi.mock("../../server/storage", () => ({
  storage: {
    listChatbotThreads: stubs.listChatbotThreads,
    createChatbotThread: stubs.createChatbotThread,
    getChatbotThreadMessages: stubs.getChatbotThreadMessages,
    archiveChatbotThread: stubs.archiveChatbotThread,
    restoreChatbotThread: stubs.restoreChatbotThread,
  },
}));
vi.mock("../../server/lib/chatbotBudget", () => ({
  assertChatbotBudget: vi.fn(),
  recordChatbotUsage: vi.fn(),
}));
vi.mock("../../server/db", () => ({
  db: { execute: vi.fn() },
  pool: {},
}));
vi.mock("../../server/lib/openrouterClient", () => ({
  getOpenRouterClient: () => ({}),
  CHATBOT_MODEL: "model",
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));
vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));
vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: any, _err: unknown, msg: string) => {
    res.status(500).json({ success: false, error: msg });
  },
}));
vi.mock("../../server/lib/asyncHandler", () => ({
  asyncHandler: (fn: any) => fn,
}));
vi.mock("../../server/lib/chatbotKnowledge", () => ({
  SYSTEM_PROMPT: "you are a tutor",
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { setupAssistantRoutes } = await import("../../server/routes/assistant");

const VALID_ID = "11111111-1111-4111-8111-111111111111";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupAssistantRoutes(app);
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
  stubs.listChatbotThreads.mockResolvedValue([]);
  stubs.requireUser.mockReturnValue({ id: "user-1", accessTier: "free" });
  stubs.requireChatbotThread.mockResolvedValue({
    id: VALID_ID,
    userId: "user-1",
  } as any);
});

describe("chatbot threads REST", () => {
  it("GET /threads returns the user's threads", async () => {
    stubs.listChatbotThreads.mockResolvedValueOnce([
      {
        id: VALID_ID,
        userId: "user-1",
        title: "How do I get started?",
        brandId: null,
        createdAt: new Date("2026-05-01"),
        updatedAt: new Date("2026-05-04"),
        archivedAt: null,
        messageCount: 4,
      },
    ]);
    const app = buildApp();
    const { status, body } = await call(app, "GET", "/api/assistant/threads");
    expect(status).toBe(200);
    expect(body.data.threads).toHaveLength(1);
    expect(body.data.threads[0]).toMatchObject({
      id: VALID_ID,
      title: "How do I get started?",
      messageCount: 4,
    });
    expect(stubs.listChatbotThreads).toHaveBeenCalledWith("user-1", 50);
  });

  it("POST /threads creates and returns a new thread", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/assistant/threads", {
      brandId: "brand-1",
    });
    expect(status).toBe(200);
    expect(body.data.thread.id).toBe(VALID_ID);
    expect(stubs.createChatbotThread).toHaveBeenCalledWith("user-1", "brand-1");
  });

  it("GET /threads/:id/messages enforces ownership and returns transcript", async () => {
    stubs.getChatbotThreadMessages.mockResolvedValueOnce([
      { role: "user", content: "hi", createdAt: new Date() },
      { role: "assistant", content: "hello", createdAt: new Date() },
    ] as any[]);
    const app = buildApp();
    const { status, body } = await call(app, "GET", `/api/assistant/threads/${VALID_ID}/messages`);
    expect(status).toBe(200);
    expect(body.data.messages).toHaveLength(2);
    expect(stubs.requireChatbotThread).toHaveBeenCalledWith(VALID_ID, "user-1");
  });

  it("DELETE /threads/:id soft-archives", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "DELETE", `/api/assistant/threads/${VALID_ID}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true });
    expect(stubs.archiveChatbotThread).toHaveBeenCalledWith(VALID_ID);
  });

  it("POST /threads/:id/restore un-archives", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", `/api/assistant/threads/${VALID_ID}/restore`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true });
    expect(stubs.restoreChatbotThread).toHaveBeenCalledWith(VALID_ID);
  });

  it("returns 404 when thread id is not a UUID", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "GET", "/api/assistant/threads/not-a-uuid/messages");
    expect(status).toBe(404);
    expect(body).toMatchObject({ success: false });
  });
});
