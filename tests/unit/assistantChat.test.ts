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
  getChatbotThreadMessages: vi.fn(async () => [] as Array<{ role: string; content: string }>),
  setChatbotThreadTitle: vi.fn(async () => undefined),
  touchChatbotThread: vi.fn(async () => undefined),
  getBrandById: vi.fn(async (_id: string) => undefined as any),
  getArticlesByUserIdWithStatus: vi.fn(async () => [] as any[]),
  getCitationRunsByBrandId: vi.fn(async () => [] as any[]),
  assertChatbotBudget: vi.fn(async () => undefined),
  recordChatbotUsage: vi.fn(async () => undefined),
  dbExecute: vi.fn(async () => ({ rows: [] })),
  completionsCreate: vi.fn(),
  requireUser: vi.fn(() => ({ id: "user-1", accessTier: "free" })),
  requireChatbotThread: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    title: "New chat",
    brandId: null,
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
    insertChatbotMessage: stubs.insertChatbotMessage,
    getChatbotThreadMessages: stubs.getChatbotThreadMessages,
    setChatbotThreadTitle: stubs.setChatbotThreadTitle,
    touchChatbotThread: stubs.touchChatbotThread,
    getBrandById: stubs.getBrandById,
    getArticlesByUserIdWithStatus: stubs.getArticlesByUserIdWithStatus,
    getCitationRunsByBrandId: stubs.getCitationRunsByBrandId,
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
vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: any, _err: unknown, msg: string) => {
    res.status(500).json({ success: false, error: msg });
  },
  openai: {} as unknown,
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (fn: any) => fn,
}));
vi.mock("../../server/lib/asyncHandler", () => ({
  asyncHandler: (fn: any) => fn,
}));
vi.mock("../../server/lib/chatbotKnowledge", () => ({
  SYSTEM_PROMPT: "you are a helpful tutor",
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
): Promise<{ status: number; body: any; sseEvents: any[]; sseRaw: string }> {
  return new Promise((resolve, reject) => {
    const reqHandlers: Record<string, Array<(...a: any[]) => void>> = {};
    const req = {
      method: "POST",
      url: "/api/assistant/chat",
      headers: { host: "localhost", "content-type": "application/json" },
      body,
      on(event: string, handler: (...a: any[]) => void) {
        (reqHandlers[event] ||= []).push(handler);
        return req;
      },
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
    let headersSent = false;
    let sseRaw = "";
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      const events: any[] = [];
      for (const block of sseRaw.split("\n\n")) {
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          events.push(JSON.parse(dataLine.slice(6)));
        } catch {
          // ignore
        }
      }
      resolve({ status: statusCode, body: payload, sseEvents: events, sseRaw });
    };
    const res = {
      get headersSent() {
        return headersSent;
      },
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        finish();
        return res;
      },
      setHeader() {
        return res;
      },
      flushHeaders() {
        headersSent = true;
        return res;
      },
      write(chunk: string) {
        sseRaw += chunk;
        return true;
      },
      end() {
        finish();
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    void reqHandlers; // expose for future cancellation tests
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

const TEST_THREAD_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  stubs.insertChatbotMessage.mockClear();
  stubs.getChatbotThreadMessages.mockClear();
  stubs.getChatbotThreadMessages.mockResolvedValue([]);
  stubs.setChatbotThreadTitle.mockClear();
  stubs.touchChatbotThread.mockClear();
  stubs.assertChatbotBudget.mockClear();
  stubs.recordChatbotUsage.mockClear();
  stubs.dbExecute.mockClear();
  stubs.dbExecute.mockResolvedValue({ rows: [] });
  stubs.completionsCreate.mockReset();
  stubs.getBrandById.mockReset();
  stubs.getBrandById.mockResolvedValue(undefined as any);
  stubs.getArticlesByUserIdWithStatus.mockReset();
  stubs.getArticlesByUserIdWithStatus.mockResolvedValue([] as any[]);
  stubs.getCitationRunsByBrandId.mockReset();
  stubs.getCitationRunsByBrandId.mockResolvedValue([] as any[]);
  stubs.requireUser.mockReturnValue({ id: "user-1", accessTier: "free" });
  stubs.requireChatbotThread.mockReset();
  stubs.requireChatbotThread.mockResolvedValue({
    id: TEST_THREAD_ID,
    userId: "user-1",
    title: "New chat",
    brandId: null,
  } as any);
});

describe("POST /api/assistant/chat", () => {
  it("returns 400 when messages array is empty", async () => {
    const app = buildApp();
    const { status, body } = await callChat(app, {
      threadId: TEST_THREAD_ID,
      messages: [],
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false });
  });

  it("returns 400 when the last message is not from the user", async () => {
    const app = buildApp();
    const { status, body } = await callChat(app, {
      threadId: TEST_THREAD_ID,
      messages: [{ role: "assistant", content: "hi" }],
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/user/i);
  });

  it("returns 400 when the user message exceeds 2 KB", async () => {
    const app = buildApp();
    const big = "a".repeat(2_001);
    const { status, body } = await callChat(app, {
      threadId: TEST_THREAD_ID,
      messages: [{ role: "user", content: big }],
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/too long|2,000/i);
  });

  it("returns 429 budget_exceeded when assertChatbotBudget throws BudgetExceededError", async () => {
    const { BudgetExceededError } = await import("../../server/lib/llmPricing");
    stubs.assertChatbotBudget.mockRejectedValueOnce(
      new BudgetExceededError("free", 15_000, 15_000),
    );
    const app = buildApp();
    const { status, body } = await callChat(app, {
      threadId: TEST_THREAD_ID,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(status).toBe(429);
    expect(body).toEqual({
      success: false,
      code: "budget_exceeded",
      error: "Daily AI tutor budget reached. Resets at midnight UTC.",
    });
    expect(stubs.insertChatbotMessage).not.toHaveBeenCalled();
    expect(stubs.completionsCreate).not.toHaveBeenCalled();
  });

  it("happy path (SSE): streams deltas, persists assistant msg, increments usage, emits done", async () => {
    async function* streamGen() {
      yield { choices: [{ delta: { content: "Hello " } }] };
      yield { choices: [{ delta: { content: "there!" } }] };
      yield {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 42, completion_tokens: 17 },
      };
    }
    stubs.completionsCreate.mockResolvedValueOnce(streamGen());
    const app = buildApp();
    const { sseEvents } = await callChat(app, {
      threadId: TEST_THREAD_ID,
      messages: [{ role: "user", content: "Hi" }],
    });

    // SSE events
    const deltas = sseEvents.filter((e) => e.type === "delta").map((e) => e.content);
    expect(deltas.join("")).toBe("Hello there!");
    const done = sseEvents.find((e) => e.type === "done");
    expect(done).toMatchObject({ type: "done", inputTokens: 42, outputTokens: 17 });

    // user persisted before the call, assistant persisted after with accumulated content.
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

  it("injects brand context as a second system message when brandId belongs to user", async () => {
    stubs.getBrandById.mockResolvedValueOnce({
      id: "brand-1",
      userId: "user-1",
      name: "Acme",
      industry: "B2B SaaS",
    } as any);
    stubs.getArticlesByUserIdWithStatus.mockResolvedValueOnce([
      { id: "a1" },
      { id: "a2" },
      { id: "a3" },
    ] as any[]);
    const now = Date.now();
    stubs.getCitationRunsByBrandId.mockResolvedValueOnce([
      {
        id: "r1",
        startedAt: new Date(now - 1000 * 60 * 60).toISOString(),
        status: "completed",
        totalChecks: 10,
        totalCited: 2,
      },
      {
        id: "r2",
        startedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
        status: "running",
        totalChecks: 0,
        totalCited: 0,
      },
    ] as any[]);

    async function* streamGen() {
      yield { choices: [{ delta: { content: "ok" } }] };
      yield {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      };
    }
    stubs.completionsCreate.mockResolvedValueOnce(streamGen());

    const app = buildApp();
    await callChat(app, {
      threadId: TEST_THREAD_ID,
      brandId: "brand-1",
      messages: [{ role: "user", content: "what should I do next?" }],
    });

    expect(stubs.completionsCreate).toHaveBeenCalledTimes(1);
    const callArg = stubs.completionsCreate.mock.calls[0][0];
    const sentMessages = callArg.messages;
    expect(sentMessages[0].role).toBe("system");
    expect(sentMessages[1].role).toBe("system");
    const brandContent = sentMessages[1].content as string;
    expect(brandContent).toContain("Acme");
    expect(brandContent).toContain("B2B SaaS");
    expect(brandContent).toContain("Latest citation rate: 20%");
  });
});
