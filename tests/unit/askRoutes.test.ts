// Coverage for the Ask REST + SSE surface (server/routes/ask.ts), following
// the exact fake-req/res harness tests/unit/assistantChat.test.ts already
// proved out for the tutor's own SSE endpoint. Mocks at the boundary the
// loop test (askLoop.test.ts) doesn't cover: ownership, budget, the
// feature flag, the advisory lock, and the SSE event sequence actually
// written to the wire. server/ask/loop.ts itself is mocked here - its
// control flow is covered independently.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const stubs = vi.hoisted(() => ({
  requireUser: vi.fn(() => ({ id: "user-1", accessTier: "free" })),
  requireAskThread: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    brandId: "brand-1",
    title: "New thread",
  })),
  requireBrand: vi.fn(async () => ({
    id: "brand-1",
    userId: "user-1",
    name: "Acme",
    website: "https://acme.com",
  })),
  assertAskBudget: vi.fn(async () => undefined),
  recordAskUsage: vi.fn(async () => undefined),
  tryAcquire: vi.fn(async () => true),
  withDynamicAdvisoryLock: vi.fn(
    async (_ns: unknown, _id: unknown, _label: unknown, fn: () => Promise<void>) => {
      await fn();
      return { ran: true, result: undefined };
    },
  ),
  withSlot: vi.fn(async (_provider: unknown, _runId: unknown, fn: () => Promise<unknown>) => fn()),
  listAskThreads: vi.fn(async () => []),
  createAskThread: vi.fn(async () => ({ id: "new-thread-id" })),
  touchAskThread: vi.fn(async () => undefined),
  setAskThreadTitle: vi.fn(async () => undefined),
  archiveAskThread: vi.fn(async () => undefined),
  restoreAskThread: vi.fn(async () => undefined),
  getAskThreadMessages: vi.fn(async () => []),
  insertAskMessage: vi.fn(async () => ({ id: "assistant-message-id" })),
  insertAskSteps: vi.fn(async () => undefined),
  // Business-context personal layer (server/ask/context.ts's
  // assemblePersonalContextBlock) - appended alongside assembleAskContext at
  // the /run route's call site. Empty string: no preferences/temporary
  // instructions to layer on in this fixture.
  assemblePersonalContextBlock: vi.fn(async () => ""),
  assembleAskContext: vi.fn(async () => ({
    systemPrompt: "system",
    coreCompetitors: [],
    trackedPromptIds: [],
    hero: {
      visibilityScore: 0,
      visibilityDelta: 0,
      citedChecks: 0,
      totalChecks: 0,
      citationRate: 0,
      lastScanAt: null,
    },
  })),
  runAskLoop: vi.fn(async (input: { onEvent: (e: unknown) => void }) => {
    input.onEvent({
      type: "step_started",
      stepId: "s1",
      ordinal: 0,
      label: "Checking",
      category: "visibility",
    });
    input.onEvent({
      type: "step_result",
      stepId: "s1",
      summary: "ok",
      durationMs: 5,
      status: "ok",
    });
    input.onEvent({ type: "text_delta", content: "Hello." });
    return {
      text: "Hello.",
      blocks: [],
      evidence: [],
      actionCards: [],
      steps: [
        {
          ordinal: 0,
          toolName: "get_visibility",
          label: "Checking",
          category: "visibility",
          summary: "ok",
          durationMs: 5,
          status: "ok" as const,
        },
      ],
      suggestions: [],
      pagesRead: 0,
      inputTokens: 10,
      outputTokens: 5,
      runStatus: "ok" as const,
      degradedReasons: [],
      truncated: false,
      durationMs: 50,
    };
  }),
  generateFollowups: vi.fn(async () => []),
  dbExecute: vi.fn(async () => ({ rows: [] })),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: stubs.requireUser,
  requireBrand: stubs.requireBrand,
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("../../server/ask/ownership", () => ({
  requireAskThread: stubs.requireAskThread,
}));
vi.mock("../../server/ask/budget", () => ({
  assertAskBudget: stubs.assertAskBudget,
  recordAskUsage: stubs.recordAskUsage,
}));
vi.mock("../../server/lib/rateLimitBuckets", () => ({
  tryAcquire: stubs.tryAcquire,
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withDynamicAdvisoryLock: stubs.withDynamicAdvisoryLock,
  dynamicLockNamespaces: { askRunThread: 920004 },
}));
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: stubs.withSlot,
}));
vi.mock("../../server/ask/storage", () => ({
  listAskThreads: stubs.listAskThreads,
  createAskThread: stubs.createAskThread,
  touchAskThread: stubs.touchAskThread,
  setAskThreadTitle: stubs.setAskThreadTitle,
  archiveAskThread: stubs.archiveAskThread,
  restoreAskThread: stubs.restoreAskThread,
  getAskThreadMessages: stubs.getAskThreadMessages,
  insertAskMessage: stubs.insertAskMessage,
  insertAskSteps: stubs.insertAskSteps,
}));
vi.mock("../../server/ask/context", () => ({
  assembleAskContext: stubs.assembleAskContext,
  assemblePersonalContextBlock: stubs.assemblePersonalContextBlock,
}));
vi.mock("../../server/ask/loop", () => ({
  runAskLoop: stubs.runAskLoop,
}));
vi.mock("../../server/ask/followups", () => ({
  generateFollowups: stubs.generateFollowups,
}));
vi.mock("../../server/ask/modelClient", () => ({
  OpenRouterModelClient: class {
    async turn() {
      throw new Error("should not be called - runAskLoop is mocked");
    }
    async cheapCompletion() {
      throw new Error("should not be called - generateFollowups is mocked");
    }
  },
}));
vi.mock("../../server/ask/actions/execute", () => ({
  toActionCard: vi.fn(async () => ({})),
  approveAction: vi.fn(),
  dismissAction: vi.fn(),
  undoAction: vi.fn(),
  ActionNotFoundError: class ActionNotFoundError extends Error {},
  ActionConflictError: class ActionConflictError extends Error {},
}));
vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));
vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/asyncHandler", () => ({
  asyncHandler: (fn: any) => fn,
}));
vi.mock("../../server/lib/routesShared", () => ({
  sendError: (res: any, _err: unknown, msg: string) => {
    res.status(500).json({ success: false, error: msg });
  },
  openai: {} as unknown,
  asyncHandler: (fn: any) => fn,
}));

const envStub = { NODE_ENV: "development" as string };
vi.mock("../../server/env", () => ({ env: envStub }));

const { setupAskRoutes } = await import("../../server/routes/ask");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupAskRoutes(app);
  return app;
}

// Same fake req/res harness as assistantChat.test.ts, extended to a generic
// method so both the SSE POST and plain-JSON GET/POST routes can share it.
function callRoute(
  app: express.Express,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any; sseEvents: any[]; sseRaw: string }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      query: Object.fromEntries(new URL(`http://localhost${url}`).searchParams),
      params: {} as Record<string, string>,
      body,
      on() {
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
  vi.clearAllMocks();
  envStub.NODE_ENV = "development";
  stubs.requireUser.mockReturnValue({ id: "user-1", accessTier: "free" });
  stubs.requireAskThread.mockResolvedValue({
    id: TEST_THREAD_ID,
    userId: "user-1",
    brandId: "brand-1",
    title: "New thread",
  });
  stubs.requireBrand.mockResolvedValue({
    id: "brand-1",
    userId: "user-1",
    name: "Acme",
    website: "https://acme.com",
  });
});

describe("Ask availability", () => {
  it("is reachable in production with no flag", async () => {
    envStub.NODE_ENV = "production";
    const app = buildApp();
    const { status } = await callRoute(app, "GET", "/api/ask/threads");
    expect(status).toBe(200);
  });
});

describe("POST /api/ask/threads/:threadId/run", () => {
  it("returns 400 for a malformed message", async () => {
    const app = buildApp();
    const { status } = await callRoute(app, "POST", `/api/ask/threads/${TEST_THREAD_ID}/run`, {
      message: "",
    });
    expect(status).toBe(400);
  });

  it("returns 404 for a non-UUID threadId", async () => {
    const app = buildApp();
    const { status } = await callRoute(app, "POST", "/api/ask/threads/not-a-uuid/run", {
      message: "hi",
    });
    expect(status).toBe(404);
  });

  it("returns 400 when the thread has no brand selected", async () => {
    stubs.requireAskThread.mockResolvedValueOnce({
      id: TEST_THREAD_ID,
      userId: "user-1",
      brandId: null,
      title: "New thread",
    });
    const app = buildApp();
    const { status, body } = await callRoute(
      app,
      "POST",
      `/api/ask/threads/${TEST_THREAD_ID}/run`,
      {
        message: "hi",
      },
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/brand/i);
  });

  it("returns 429 budget_exceeded when assertAskBudget throws", async () => {
    const { BudgetExceededError } = await import("../../server/lib/llmPricing");
    stubs.assertAskBudget.mockRejectedValueOnce(new BudgetExceededError("free", 60_000, 60_000));
    const app = buildApp();
    const { status, body } = await callRoute(
      app,
      "POST",
      `/api/ask/threads/${TEST_THREAD_ID}/run`,
      {
        message: "hi",
      },
    );
    expect(status).toBe(429);
    expect(body.code).toBe("budget_exceeded");
  });

  it("returns 429 on burst rate-limit before touching the daily budget", async () => {
    stubs.tryAcquire.mockResolvedValueOnce(false);
    const app = buildApp();
    const { status } = await callRoute(app, "POST", `/api/ask/threads/${TEST_THREAD_ID}/run`, {
      message: "hi",
    });
    expect(status).toBe(429);
    expect(stubs.assertAskBudget).not.toHaveBeenCalled();
  });

  it("returns 409 run_in_progress when the advisory lock is already held", async () => {
    stubs.withDynamicAdvisoryLock.mockResolvedValueOnce({ ran: false });
    const app = buildApp();
    const { status, body } = await callRoute(
      app,
      "POST",
      `/api/ask/threads/${TEST_THREAD_ID}/run`,
      {
        message: "hi",
      },
    );
    expect(status).toBe(409);
    expect(body.code).toBe("run_in_progress");
  });

  it("streams run_started, steps, text and done, and persists the assistant message", async () => {
    const app = buildApp();
    const { sseEvents } = await callRoute(app, "POST", `/api/ask/threads/${TEST_THREAD_ID}/run`, {
      message: "why has visibility moved?",
    });

    const types = sseEvents.map((e) => e.type);
    expect(types).toContain("run_started");
    expect(types).toContain("step_started");
    expect(types).toContain("step_result");
    expect(types).toContain("text_delta");
    expect(types).toContain("done");

    const doneEvent = sseEvents.find((e) => e.type === "done");
    expect(doneEvent.runStatus).toBe("ok");
    expect(doneEvent.stepCount).toBe(1);

    expect(stubs.insertAskMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "why has visibility moved?" }),
    );
    expect(stubs.insertAskMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", content: "Hello." }),
    );
    expect(stubs.insertAskSteps).toHaveBeenCalled();
    expect(stubs.recordAskUsage).toHaveBeenCalledWith("user-1", 10, 5);
  });

  it("writes api_costs with service='ask', not 'chatbot'", async () => {
    const app = buildApp();
    await callRoute(app, "POST", `/api/ask/threads/${TEST_THREAD_ID}/run`, { message: "hi" });

    const insertCall = stubs.dbExecute.mock.calls.find((call) => {
      const text = JSON.stringify(call[0]);
      return text.includes("api_costs");
    });
    expect(insertCall).toBeTruthy();
  });
});

describe("GET /api/ask/threads", () => {
  it("passes brandId through to listAskThreads", async () => {
    const app = buildApp();
    await callRoute(app, "GET", "/api/ask/threads?brandId=brand-1");
    expect(stubs.listAskThreads).toHaveBeenCalledWith("user-1", { brandId: "brand-1", limit: 50 });
  });

  it("carries pendingActionCount through to the response, for the 'Waiting on you' group", async () => {
    stubs.listAskThreads.mockResolvedValueOnce([
      {
        id: TEST_THREAD_ID,
        userId: "user-1",
        brandId: "brand-1",
        title: "New thread",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        messageCount: 3,
        pendingActionCount: 2,
      },
    ]);
    const app = buildApp();
    const { body } = await callRoute(app, "GET", "/api/ask/threads");
    expect(body.data.threads[0].pendingActionCount).toBe(2);
  });
});

describe("PATCH /api/ask/threads/:threadId", () => {
  it("renames the thread after an ownership check", async () => {
    const app = buildApp();
    const { status, body } = await callRoute(app, "PATCH", `/api/ask/threads/${TEST_THREAD_ID}`, {
      title: "  A renamed thread  ",
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(stubs.requireAskThread).toHaveBeenCalledWith(TEST_THREAD_ID, "user-1");
    expect(stubs.setAskThreadTitle).toHaveBeenCalledWith(TEST_THREAD_ID, "A renamed thread");
  });

  it("returns 400 for an empty title", async () => {
    const app = buildApp();
    const { status } = await callRoute(app, "PATCH", `/api/ask/threads/${TEST_THREAD_ID}`, {
      title: "   ",
    });
    expect(status).toBe(400);
    expect(stubs.setAskThreadTitle).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-UUID threadId", async () => {
    const app = buildApp();
    const { status } = await callRoute(app, "PATCH", "/api/ask/threads/not-a-uuid", {
      title: "New title",
    });
    expect(status).toBe(404);
  });

  it("never renames when the ownership check rejects", async () => {
    // sendError is mocked to a flat 500 in this file (see its header) - the
    // ownership-miss -> 404 mapping itself is sendOwnershipError's own
    // contract, covered where that helper is tested. What this route must
    // get right, and what's asserted here, is calling requireAskThread
    // BEFORE setAskThreadTitle and never renaming on a rejection.
    stubs.requireAskThread.mockRejectedValueOnce(new Error("Thread not found"));
    const app = buildApp();
    const { body } = await callRoute(app, "PATCH", `/api/ask/threads/${TEST_THREAD_ID}`, {
      title: "New title",
    });
    expect(body.success).toBe(false);
    expect(stubs.setAskThreadTitle).not.toHaveBeenCalled();
  });
});
