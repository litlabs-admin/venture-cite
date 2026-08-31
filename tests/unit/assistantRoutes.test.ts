// HTTP-level contract tests for server/routes/assistant.ts.
//
// Priority per endpoint: ownership (404, never 403/500, and the service must
// not run) > validation > success shape > conflict/limit paths.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

class TestOwnershipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OwnershipError";
    this.status = status;
  }
}

const { ownership, storageMock, budget, openrouter, sentry } = vi.hoisted(() => {
  const ownership = {
    requireChatbotThread: vi.fn(),
  };
  const storageMock = {
    listChatbotThreads: vi.fn(),
    createChatbotThread: vi.fn(),
    getChatbotThreadMessages: vi.fn(),
    archiveChatbotThread: vi.fn(),
    restoreChatbotThread: vi.fn(),
    insertChatbotMessage: vi.fn(),
    setChatbotThreadTitle: vi.fn(),
    touchChatbotThread: vi.fn(),
    getBrandById: vi.fn(),
    getArticlesByUserIdWithStatus: vi.fn(),
    getCitationRunsByBrandId: vi.fn(),
  };
  const budget = {
    assertChatbotBudget: vi.fn(),
    recordChatbotUsage: vi.fn(),
  };
  const openrouter = {
    getOpenRouterClient: vi.fn(),
  };
  const sentry = { captureAndFlush: vi.fn() };
  return { ownership, storageMock, budget, openrouter, sentry };
});

vi.mock("../../server/db", () => ({ db: { execute: vi.fn() }, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: () => void) => {
    req.user = user;
    next();
  },
}));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => req.user,
  requireChatbotThread: ownership.requireChatbotThread,
}));
vi.mock("../../server/lib/asyncHandler", () => ({
  asyncHandler: (handler: unknown) => handler,
}));
vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: express.Response, err: unknown, fallback: string) => {
    if (err && (err as any).name === "OwnershipError") {
      res.status((err as any).status).json({ success: false, error: (err as any).message });
      return;
    }
    res.status(500).json({ success: false, error: fallback });
  },
}));
vi.mock("../../server/lib/chatbotBudget", () => budget);
vi.mock("../../server/lib/llmPricing", async () => {
  class BudgetExceededError extends Error {}
  return {
    BudgetExceededError,
    estimateCostCents: vi.fn(() => 1),
  };
});
vi.mock("../../server/lib/openrouterClient", () => ({
  getOpenRouterClient: openrouter.getOpenRouterClient,
  CHATBOT_MODEL: "test-model",
}));
vi.mock("@shared/visibilityMetrics", () => ({ citationRatePct: vi.fn(() => 50) }));
vi.mock("../../server/lib/chatbotKnowledge", () => ({ SYSTEM_PROMPT: "system prompt" }));
vi.mock("@shared/schema", () => ({ resolveTier: () => "free" }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => sentry);

const { setupAssistantRoutes } = await import("../../server/routes/assistant");
const { BudgetExceededError } = await import("../../server/lib/llmPricing");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupAssistantRoutes(app);
  return app;
}

const THREAD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const thread = { id: THREAD_ID, userId: user.id, title: "Existing chat" };
const notOwned = new TestOwnershipError(404, "Conversation not found");

async function fakeStream(chunks: Array<{ delta?: string; usage?: boolean }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        yield {
          choices: [{ delta: { content: c.delta } }],
          usage: c.usage ? { prompt_tokens: 5, completion_tokens: 7 } : undefined,
        };
      }
    },
  };
}

describe("assistant routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownership.requireChatbotThread.mockResolvedValue(thread);
    budget.assertChatbotBudget.mockResolvedValue(undefined);
    budget.recordChatbotUsage.mockResolvedValue(undefined);
    storageMock.insertChatbotMessage.mockResolvedValue(undefined);
  });

  describe("GET /api/assistant/threads", () => {
    it("returns the caller's threads, mapped", async () => {
      storageMock.listChatbotThreads.mockResolvedValue([
        {
          id: THREAD_ID,
          title: "Existing chat",
          brandId: null,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-02",
          messageCount: 3,
        },
      ]);
      const res = await request(makeApp()).get("/api/assistant/threads");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          threads: [
            {
              id: THREAD_ID,
              title: "Existing chat",
              brandId: null,
              createdAt: "2026-01-01",
              updatedAt: "2026-01-02",
              messageCount: 3,
            },
          ],
        },
      });
      expect(storageMock.listChatbotThreads).toHaveBeenCalledWith(user.id, 50);
    });
  });

  describe("POST /api/assistant/threads", () => {
    it("400s on an invalid body", async () => {
      const res = await request(makeApp()).post("/api/assistant/threads").send({ brandId: 42 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "Invalid request" });
      expect(storageMock.createChatbotThread).not.toHaveBeenCalled();
    });

    it("creates a thread on success", async () => {
      storageMock.createChatbotThread.mockResolvedValue({ id: THREAD_ID, title: "New chat" });
      const res = await request(makeApp())
        .post("/api/assistant/threads")
        .send({ brandId: "brand-1" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { thread: { id: THREAD_ID, title: "New chat" } },
      });
      expect(storageMock.createChatbotThread).toHaveBeenCalledWith(user.id, "brand-1");
    });
  });

  describe("GET /api/assistant/threads/:threadId/messages", () => {
    it("404s on a non-uuid threadId, without calling ownership", async () => {
      const res = await request(makeApp()).get("/api/assistant/threads/not-a-uuid/messages");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Conversation not found" });
      expect(ownership.requireChatbotThread).not.toHaveBeenCalled();
    });

    it("404s for a thread the caller does not own", async () => {
      ownership.requireChatbotThread.mockRejectedValue(notOwned);
      const res = await request(makeApp()).get(`/api/assistant/threads/${THREAD_ID}/messages`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Conversation not found" });
      expect(storageMock.getChatbotThreadMessages).not.toHaveBeenCalled();
    });

    it("returns the thread transcript", async () => {
      storageMock.getChatbotThreadMessages.mockResolvedValue([
        { role: "user", content: "hi", createdAt: "2026-01-01" },
      ]);
      const res = await request(makeApp()).get(`/api/assistant/threads/${THREAD_ID}/messages`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { messages: [{ role: "user", content: "hi", createdAt: "2026-01-01" }] },
      });
      expect(storageMock.getChatbotThreadMessages).toHaveBeenCalledWith(THREAD_ID, 200);
    });
  });

  describe("DELETE /api/assistant/threads/:threadId", () => {
    it("404s on a non-uuid threadId", async () => {
      const res = await request(makeApp()).delete("/api/assistant/threads/not-a-uuid");
      expect(res.status).toBe(404);
      expect(ownership.requireChatbotThread).not.toHaveBeenCalled();
    });

    it("404s for a thread the caller does not own, without archiving", async () => {
      ownership.requireChatbotThread.mockRejectedValue(notOwned);
      const res = await request(makeApp()).delete(`/api/assistant/threads/${THREAD_ID}`);
      expect(res.status).toBe(404);
      expect(storageMock.archiveChatbotThread).not.toHaveBeenCalled();
    });

    it("archives the thread on success", async () => {
      const res = await request(makeApp()).delete(`/api/assistant/threads/${THREAD_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(storageMock.archiveChatbotThread).toHaveBeenCalledWith(THREAD_ID);
    });
  });

  describe("POST /api/assistant/threads/:threadId/restore", () => {
    it("404s on a non-uuid threadId", async () => {
      const res = await request(makeApp()).post("/api/assistant/threads/not-a-uuid/restore");
      expect(res.status).toBe(404);
      expect(ownership.requireChatbotThread).not.toHaveBeenCalled();
    });

    it("404s for a thread the caller does not own, without restoring", async () => {
      ownership.requireChatbotThread.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post(`/api/assistant/threads/${THREAD_ID}/restore`);
      expect(res.status).toBe(404);
      expect(storageMock.restoreChatbotThread).not.toHaveBeenCalled();
    });

    it("restores the thread on success", async () => {
      const res = await request(makeApp()).post(`/api/assistant/threads/${THREAD_ID}/restore`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(storageMock.restoreChatbotThread).toHaveBeenCalledWith(THREAD_ID);
    });
  });

  describe("POST /api/assistant/chat", () => {
    const validBody = {
      threadId: THREAD_ID,
      messages: [{ role: "user", content: "hello there" }],
    };

    it("400s on an invalid body, without touching ownership", async () => {
      const res = await request(makeApp())
        .post("/api/assistant/chat")
        .send({ threadId: "not-a-uuid", messages: [] });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(ownership.requireChatbotThread).not.toHaveBeenCalled();
    });

    it("404s for a thread the caller does not own, without inserting a message", async () => {
      ownership.requireChatbotThread.mockRejectedValue(notOwned);
      const res = await request(makeApp()).post("/api/assistant/chat").send(validBody);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Conversation not found" });
      expect(storageMock.insertChatbotMessage).not.toHaveBeenCalled();
    });

    it("400s when the last message isn't from the user", async () => {
      const res = await request(makeApp())
        .post("/api/assistant/chat")
        .send({ threadId: THREAD_ID, messages: [{ role: "assistant", content: "hi" }] });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "Last message must be from user" });
    });

    it("400s when the last message is too long", async () => {
      const res = await request(makeApp())
        .post("/api/assistant/chat")
        .send({ threadId: THREAD_ID, messages: [{ role: "user", content: "a".repeat(2001) }] });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: "Message too long (max 2,000 characters)",
      });
    });

    it("429s when the daily budget is exceeded, without inserting a message", async () => {
      budget.assertChatbotBudget.mockRejectedValue(new BudgetExceededError("over budget"));
      const res = await request(makeApp()).post("/api/assistant/chat").send(validBody);
      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        success: false,
        code: "budget_exceeded",
        error: "Daily AI tutor budget reached. Resets at midnight UTC.",
      });
      expect(storageMock.insertChatbotMessage).not.toHaveBeenCalled();
    });

    it("streams a successful reply and persists it", async () => {
      storageMock.getChatbotThreadMessages.mockResolvedValue([
        { role: "user", content: "hello there" },
      ]);
      openrouter.getOpenRouterClient.mockReturnValue({
        chat: {
          completions: {
            create: vi.fn(async () =>
              fakeStream([{ delta: "Hi" }, { delta: " there", usage: true }]),
            ),
          },
        },
      });

      const res = await request(makeApp()).post("/api/assistant/chat").send(validBody);

      expect(res.status).toBe(200);
      expect(res.text).toContain('"type":"delta"');
      expect(res.text).toContain('"type":"done"');
      expect(storageMock.insertChatbotMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "user", content: "hello there" }),
      );
      expect(storageMock.insertChatbotMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "assistant", content: "Hi there" }),
      );
      expect(budget.recordChatbotUsage).toHaveBeenCalledWith(user.id, 5, 7);
    });
  });
});
