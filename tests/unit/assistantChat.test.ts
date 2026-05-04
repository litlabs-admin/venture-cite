// Coverage for POST /api/assistant/chat (Phase 5 — A1).
//
// Express app is built with the assistant router only; auth and
// ownership are mocked to inject a fake user. Storage, budget,
// db.execute and the OpenRouter client are all stubbed so no
// network or database is touched. Verifies the validation gates
// (empty messages, wrong role, oversize message) and the happy
// path: persists user msg, calls OpenRouter, persists assistant
// msg, increments usage, returns the standard envelope.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const stubs = vi.hoisted(() => ({
  insertChatbotMessage: vi.fn(async () => undefined),
  getChatbotHistory: vi.fn(async () => [] as Array<{ role: string; content: string }>),
  assertChatbotBudget: vi.fn(async () => undefined),
  recordChatbotUsage: vi.fn(async () => undefined),
  dbExecute: vi.fn(async () => ({ rows: [] })),
  completionsCreate: vi.fn(),
  requireUser: vi.fn(() => ({ id: "user-1", accessTier: "free" })),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: stubs.requireUser,
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
    insertChatbotMessage: stubs.insertChatbotMessage,
    getChatbotHistory: stubs.getChatbotHistory,
  },
}));
vi.mock("../../server/lib/chatbotBudget", () => ({
  assertChatbotBudget: stubs.assertChatbotBudget,
  recordChatbotUsage: stubs.recordChatbotUsage,
}));
vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));
vi.mock("../../server/lib/openrouterClient", () => ({
  getOpenRouterClient: () => ({
    chat: { completions: { create: stubs.completionsCreate } },
  }),
  CHATBOT_MODEL: "anthropic/claude-sonnet-4.5",
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));
vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));
vi.mock("../../server/lib/aiLogger", () => ({
  attachAiLogger: () => undefined,
}));

const { setupAssistantRoutes } = await import("../../server/routes/assistant");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupAssistantRoutes(app);
  return app;
}

async function callChat(
  app: express.Express,
  body: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: "/api/assistant/chat",
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
  stubs.insertChatbotMessage.mockClear();
  stubs.getChatbotHistory.mockClear();
  stubs.getChatbotHistory.mockResolvedValue([]);
  stubs.assertChatbotBudget.mockClear();
  stubs.recordChatbotUsage.mockClear();
  stubs.dbExecute.mockClear();
  stubs.dbExecute.mockResolvedValue({ rows: [] });
  stubs.completionsCreate.mockReset();
  stubs.requireUser.mockReturnValue({ id: "user-1", accessTier: "free" });
});

describe("POST /api/assistant/chat", () => {
  it("returns 400 when messages array is empty", async () => {
    const app = buildApp();
    const { status, body } = await callChat(app, { messages: [] });
    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false });
  });

  it("returns 400 when the last message is not from the user", async () => {
    const app = buildApp();
    const { status, body } = await callChat(app, {
      messages: [{ role: "assistant", content: "hi" }],
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/user/i);
  });

  it("returns 400 when the user message exceeds 2 KB", async () => {
    const app = buildApp();
    const big = "a".repeat(2_001);
    const { status, body } = await callChat(app, {
      messages: [{ role: "user", content: big }],
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/too long|2,000/i);
  });

  it("happy path: persists user msg, calls OpenRouter, persists assistant msg, increments usage", async () => {
    stubs.completionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hello there!" } }],
      usage: { prompt_tokens: 42, completion_tokens: 17 },
    });
    const app = buildApp();
    const { status, body } = await callChat(app, {
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { content: "Hello there!", inputTokens: 42, outputTokens: 17 },
    });

    // user persisted before the call, assistant persisted after.
    expect(stubs.insertChatbotMessage).toHaveBeenCalledTimes(2);
    expect(stubs.insertChatbotMessage.mock.calls[0][0]).toMatchObject({
      userId: "user-1",
      role: "user",
      content: "Hi",
    });
    expect(stubs.insertChatbotMessage.mock.calls[1][0]).toMatchObject({
      userId: "user-1",
      role: "assistant",
      content: "Hello there!",
      inputTokens: 42,
      outputTokens: 17,
    });

    expect(stubs.completionsCreate).toHaveBeenCalledTimes(1);
    expect(stubs.recordChatbotUsage).toHaveBeenCalledWith("user-1", 42, 17);
  });
});
