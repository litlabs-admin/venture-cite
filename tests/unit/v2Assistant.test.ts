// Coverage for server/routes/v2Assistant.ts: the GEO assistant's context
// stats endpoint and its grounded SSE chat endpoint. Mirrors
// tests/unit/assistantChat.test.ts's mocking style so both chat transports
// are exercised the same way, without touching a real database or
// OpenRouter.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(async (_id: string) => undefined as any),
  getBrandPromptsByBrandId: vi.fn(async () => [] as any[]),
  getCompetitors: vi.fn(async () => [] as any[]),
  listChatbotThreads: vi.fn(async () => [] as any[]),
  insertChatbotMessage: vi.fn(async () => undefined),
  setChatbotThreadTitle: vi.fn(async () => undefined),
  touchChatbotThread: vi.fn(async () => undefined),
  getChatbotThreadMessages: vi.fn(async () => [] as Array<{ role: string; content: string }>),
  assertChatbotBudget: vi.fn(async () => undefined),
  recordChatbotUsage: vi.fn(async () => undefined),
  dbExecute: vi.fn(async () => ({ rows: [] })),
  completionsCreate: vi.fn(),
  requireUser: vi.fn(() => ({ id: "user-1", accessTier: "free" })),
  requireChatbotThread: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    title: "New chat",
    brandId: "brand-1",
  })),
  getV2MentionRate: vi.fn(async () => ({
    measured: 40,
    cited: 18,
    failed: 2,
    observed: 42,
    mentionRate: 45,
    weeks: [
      { weekStart: "2026-08-26", cited: 3, measured: 10, failed: 0, mentionRate: 30 },
      { weekStart: "2026-09-08", cited: 18, measured: 40, failed: 2, mentionRate: 45 },
    ],
  })),
  getDashboardCitedUrls: vi.fn(async () => ({
    total: 3,
    truncated: false,
    items: [
      {
        platform: "ChatGPT",
        prompt: "best PR for startups",
        url: "https://techcrunch.com/article",
        citedAt: "2026-09-08T10:21:00.000Z",
      },
    ],
  })),
}));

const BRAND = {
  id: "brand-1",
  userId: "user-1",
  name: "VenturePR",
  website: "https://venturepr.com",
  industry: "PR",
};

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
}));
vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: stubs.getBrandById,
    getBrandPromptsByBrandId: stubs.getBrandPromptsByBrandId,
    getCompetitors: stubs.getCompetitors,
    listChatbotThreads: stubs.listChatbotThreads,
    insertChatbotMessage: stubs.insertChatbotMessage,
    setChatbotThreadTitle: stubs.setChatbotThreadTitle,
    touchChatbotThread: stubs.touchChatbotThread,
    getChatbotThreadMessages: stubs.getChatbotThreadMessages,
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
vi.mock("../../server/lib/chatbotKnowledge", () => ({
  SYSTEM_PROMPT: "you are the GEO assistant",
}));
vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: any, _err: unknown, msg: string) => {
    res.status(500).json({ success: false, error: msg });
  },
  asyncHandler: (fn: any) => fn,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));
vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));
vi.mock("../../server/services/v2Visibility", () => ({
  getV2MentionRate: stubs.getV2MentionRate,
}));
vi.mock("../../server/services/dashboardVisibility", () => ({
  getDashboardCitedUrls: stubs.getDashboardCitedUrls,
}));

const { setupV2AssistantRoutes } = await import("../../server/routes/v2Assistant");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupV2AssistantRoutes(app);
  return app;
}

async function callJson(
  app: express.Express,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body,
      params: {},
      on() {
        return req;
      },
    } as unknown as express.Request;
    let statusCode = 200;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(payload: any) {
        resolve({ status: statusCode, body: payload });
        return res;
      },
      setHeader() {
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

async function callChat(
  app: express.Express,
  body: unknown,
): Promise<{ status: number; body: any; sseEvents: any[] }> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: "/api/v2/geo-assistant/chat",
      headers: { host: "localhost", "content-type": "application/json" },
      body,
      on() {
        return req;
      },
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
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
      resolve({ status: statusCode, body: payload, sseEvents: events });
    };
    const res = {
      get headersSent() {
        return sseRaw.length > 0 || payload !== null;
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
  stubs.getBrandById.mockReset();
  stubs.getBrandById.mockResolvedValue(BRAND as any);
  stubs.getBrandPromptsByBrandId.mockReset();
  stubs.getBrandPromptsByBrandId.mockResolvedValue(new Array(40).fill({ id: "p" }) as any[]);
  stubs.getCompetitors.mockReset();
  stubs.getCompetitors.mockResolvedValue([{ name: "Nike" }, { name: "Adidas" }] as any[]);
  stubs.listChatbotThreads.mockReset();
  stubs.listChatbotThreads.mockResolvedValue([
    { id: "t-1", title: "Improve visibility", brandId: "brand-1", updatedAt: "2026-09-08" },
    { id: "t-2", title: "Unrelated brand chat", brandId: "brand-other", updatedAt: "2026-09-07" },
  ] as any[]);
  stubs.insertChatbotMessage.mockClear();
  stubs.setChatbotThreadTitle.mockClear();
  stubs.touchChatbotThread.mockClear();
  stubs.getChatbotThreadMessages.mockClear();
  stubs.getChatbotThreadMessages.mockResolvedValue([]);
  stubs.assertChatbotBudget.mockClear();
  stubs.recordChatbotUsage.mockClear();
  stubs.dbExecute.mockClear();
  stubs.dbExecute.mockResolvedValue({ rows: [] });
  stubs.completionsCreate.mockReset();
  stubs.requireUser.mockReturnValue({ id: "user-1", accessTier: "free" });
  stubs.requireChatbotThread.mockReset();
  stubs.requireChatbotThread.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    title: "New chat",
    brandId: "brand-1",
  } as any);
});

describe("GET /api/v2/geo-assistant/context/:brandId", () => {
  it("returns 404 when the brand does not belong to the user", async () => {
    stubs.getBrandById.mockResolvedValueOnce({ ...BRAND, userId: "someone-else" } as any);
    const app = buildApp();
    const { status, body } = await callJson(app, "GET", "/api/v2/geo-assistant/context/brand-1");
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("computes real counts and filters saved conversations to this brand", async () => {
    const app = buildApp();
    const { status, body } = await callJson(app, "GET", "/api/v2/geo-assistant/context/brand-1");

    expect(status).toBe(200);
    expect(body.data.brand).toEqual({ name: "VenturePR", domain: "venturepr.com" });
    expect(body.data.dataAvailable.trackedQuestions).toBe(40);
    expect(body.data.dataAvailable.window).toEqual({ start: "2026-08-26", end: "2026-09-08" });
    expect(body.data.dataAvailable.citedSourceCount).toBe(3);
    expect(body.data.dataAvailable.competitorCount).toBe(2);
    expect(body.data.savedConversations).toEqual([
      { id: "t-1", title: "Improve visibility", updatedAt: "2026-09-08" },
    ]);
  });
});

describe("POST /api/v2/geo-assistant/chat", () => {
  it("returns 400 when the thread has no brand attached", async () => {
    stubs.requireChatbotThread.mockResolvedValueOnce({
      id: "t-x",
      userId: "user-1",
      title: "New chat",
      brandId: null,
    } as any);
    const app = buildApp();
    const { status, body } = await callChat(app, {
      threadId: "00000000-0000-4000-8000-000000000001",
      message: "hi",
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 429 budget_exceeded without calling the model", async () => {
    const { BudgetExceededError } = await import("../../server/lib/llmPricing");
    stubs.assertChatbotBudget.mockRejectedValueOnce(new BudgetExceededError("free", 15_000, 15_000));
    const app = buildApp();
    const { status, body } = await callChat(app, {
      threadId: "00000000-0000-4000-8000-000000000001",
      message: "Why is my brand missing?",
    });
    expect(status).toBe(429);
    expect(body).toMatchObject({ success: false, code: "budget_exceeded" });
    expect(stubs.completionsCreate).not.toHaveBeenCalled();
  });

  it("streams deltas grounded in the real context block and persists both messages", async () => {
    async function* streamGen() {
      yield { choices: [{ delta: { content: "You are cited in 45% " } }] };
      yield { choices: [{ delta: { content: "of answers." } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 30, completion_tokens: 12 } };
    }
    stubs.completionsCreate.mockResolvedValueOnce(streamGen());

    const app = buildApp();
    const { sseEvents } = await callChat(app, {
      threadId: "00000000-0000-4000-8000-000000000001",
      message: "How am I doing?",
    });

    const deltas = sseEvents.filter((e) => e.type === "delta").map((e) => e.content);
    expect(deltas.join("")).toBe("You are cited in 45% of answers.");
    expect(sseEvents.find((e) => e.type === "done")).toMatchObject({
      inputTokens: 30,
      outputTokens: 12,
    });

    expect(stubs.insertChatbotMessage).toHaveBeenCalledTimes(2);
    expect(stubs.insertChatbotMessage.mock.calls[0][0]).toMatchObject({
      role: "user",
      content: "How am I doing?",
      brandId: "brand-1",
    });
    expect(stubs.insertChatbotMessage.mock.calls[1][0]).toMatchObject({
      role: "assistant",
      content: "You are cited in 45% of answers.",
    });

    // The system context passed to the model carries the real computed
    // numbers, not a placeholder.
    const call = stubs.completionsCreate.mock.calls[0][0];
    const contextMessage = call.messages[1].content as string;
    expect(contextMessage).toContain("45% (18 of 40 collected answers cited the brand)");
    expect(contextMessage).toContain("Tracked questions in the active query set: 40");
    expect(contextMessage).toContain("Cited source count (all time): 3");
    expect(contextMessage).toContain("Tracked competitors: 2");
  });
});
