// Vercel migration: tests for the Responses API-based content slice.
// Mocks openai.responses.{create,retrieve}, the storage layer, and the
// Sentry instrumentation. Verifies state transitions across /advance
// calls without hitting OpenAI or the database.

import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
  responsesRetrieve: vi.fn(),
  getJob: vi.fn(),
  updateJob: vi.fn(async () => undefined),
  setResponseId: vi.fn(async () => undefined),
  setArticleReady: vi.fn(async () => undefined),
  setArticleFailed: vi.fn(async () => undefined),
  setArticleDraft: vi.fn(async () => undefined),
  setArticleGeneratingFromDraft: vi.fn(async () => undefined),
  createRevision: vi.fn(async () => undefined),
  getUser: vi.fn(async () => ({ accessTier: "free" })),
  getBrandById: vi.fn(async () => null),
  refundQuota: vi.fn(async () => undefined),
  assertWithinBudget: vi.fn(async () => undefined),
  recordSpend: vi.fn(async () => undefined),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = {
      create: stubs.responsesCreate,
      retrieve: stubs.responsesRetrieve,
    };
    chat = { completions: { create: vi.fn() } };
  },
}));
vi.mock("../../server/storage", () => ({
  storage: {
    getContentJobByIdAdmin: stubs.getJob,
    updateContentJob: stubs.updateJob,
    updateContentJobResponseId: stubs.setResponseId,
    setArticleReady: stubs.setArticleReady,
    setArticleFailed: stubs.setArticleFailed,
    setArticleDraft: stubs.setArticleDraft,
    setArticleGeneratingFromDraft: stubs.setArticleGeneratingFromDraft,
    createRevision: stubs.createRevision,
    getUser: stubs.getUser,
    getBrandById: stubs.getBrandById,
    appendStreamBuffer: vi.fn(),
  },
}));
vi.mock("../../server/lib/usageLimit", () => ({
  refundArticleQuota: stubs.refundQuota,
}));
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: stubs.assertWithinBudget,
  recordSpend: stubs.recordSpend,
  isBudgetExceededError: () => false,
}));
vi.mock("../../server/lib/circuitBreaker", () => ({
  openaiBreaker: { run: async (fn: () => Promise<unknown>) => fn() },
  isCircuitOpenError: () => false,
}));
vi.mock("../../server/lib/aiLogger", () => ({
  attachAiLogger: () => undefined,
}));
vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { contentGeneration: "gpt-4o-mini" },
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn() },
}));
vi.mock("../../server/db", () => ({
  db: {},
  pool: {},
}));

const { runArticleSlice } = await import("../../server/contentGenerationWorker");

beforeEach(() => {
  for (const fn of Object.values(stubs)) {
    if (typeof (fn as { mockClear?: () => void }).mockClear === "function") {
      (fn as { mockClear: () => void }).mockClear();
    }
  }
});

describe("runArticleSlice (Responses API)", () => {
  it("returns done:true status:failed when job is not found", async () => {
    stubs.getJob.mockResolvedValueOnce(undefined);
    const out = await runArticleSlice("missing-id", Date.now() + 1000);
    expect(out).toMatchObject({ done: true, status: "failed" });
  });

  it("creates an OpenAI Responses run on first /advance and returns done:false", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-1",
      userId: "user-1",
      brandId: "brand-1",
      articleId: "article-1",
      status: "pending",
      streamBuffer: "",
      openaiResponseId: null,
      requestPayload: {
        keywords: "crm comparison",
        industry: "saas",
        type: "Article",
        articleId: "article-1",
      },
    });
    stubs.responsesCreate.mockResolvedValueOnce({ id: "resp-abc", status: "queued" });

    const out = await runArticleSlice("job-1", Date.now() + 1000);

    expect(stubs.responsesCreate).toHaveBeenCalledTimes(1);
    expect(stubs.responsesCreate.mock.calls[0][0]).toMatchObject({
      background: true,
      store: true,
    });
    expect(stubs.setResponseId).toHaveBeenCalledWith("job-1", "resp-abc");
    expect(out).toEqual({ done: false, status: "running" });
    expect(stubs.responsesRetrieve).not.toHaveBeenCalled();
  });

  it("polls openai.responses.retrieve on subsequent /advance and returns done:false while in_progress", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-2",
      userId: "user-1",
      brandId: null,
      articleId: "article-2",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-xyz",
      requestPayload: { keywords: "x", industry: "y", type: "Article", articleId: "article-2" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({ id: "resp-xyz", status: "in_progress" });

    const out = await runArticleSlice("job-2", Date.now() + 1000);

    expect(stubs.responsesRetrieve).toHaveBeenCalledWith("resp-xyz");
    expect(stubs.responsesCreate).not.toHaveBeenCalled();
    expect(stubs.setResponseId).not.toHaveBeenCalled();
    expect(out).toEqual({ done: false, status: "running" });
  });

  it("on completed status, persists content to article and returns done:true", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-3",
      userId: "user-1",
      brandId: null,
      articleId: "article-3",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-done",
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-3" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({
      id: "resp-done",
      status: "completed",
      output_text: "# My Article\n\nFull content here.",
      usage: { input_tokens: 100, output_tokens: 500 },
    });

    const out = await runArticleSlice("job-3", Date.now() + 1000);

    expect(stubs.setArticleReady).toHaveBeenCalledWith(
      "article-3",
      expect.stringContaining("# My Article"),
      expect.any(String),
    );
    expect(stubs.createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: "article-3",
        source: "generated",
      }),
    );
    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-3",
      expect.objectContaining({ status: "succeeded" }),
    );
    expect(out).toEqual({ done: true, status: "succeeded" });
  });

  it("on failed status, marks job failed and refunds quota", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-4",
      userId: "user-1",
      brandId: null,
      articleId: "article-4",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-fail",
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-4" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({
      id: "resp-fail",
      status: "failed",
      error: { message: "Model overloaded" },
    });

    const out = await runArticleSlice("job-4", Date.now() + 1000);

    // The Responses API path must retrieve the response status before marking failed.
    expect(stubs.responsesRetrieve).toHaveBeenCalledWith("resp-fail");
    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-4",
      expect.objectContaining({ status: "failed" }),
    );
    expect(stubs.setArticleFailed).toHaveBeenCalledWith("article-4");
    expect(stubs.refundQuota).toHaveBeenCalled();
    expect(out).toMatchObject({ done: true, status: "failed" });
  });

  it("on cancelled status, marks job cancelled and resets article to draft", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-5",
      userId: "user-1",
      brandId: null,
      articleId: "article-5",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-cancel",
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-5" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({
      id: "resp-cancel",
      status: "cancelled",
    });

    const out = await runArticleSlice("job-5", Date.now() + 1000);

    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-5",
      expect.objectContaining({ status: "cancelled" }),
    );
    expect(stubs.setArticleDraft).toHaveBeenCalledWith("article-5");
    expect(out).toEqual({ done: true, status: "cancelled" });
  });

  it("legacy in-flight job (streamBuffer populated, no response_id) is marked failed without calling OpenAI", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-legacy",
      userId: "user-1",
      brandId: null,
      articleId: "article-legacy",
      status: "running",
      streamBuffer: "Partial content from old code path...",
      openaiResponseId: null,
      requestPayload: {
        keywords: "k",
        industry: "i",
        type: "Article",
        articleId: "article-legacy",
      },
    });

    const out = await runArticleSlice("job-legacy", Date.now() + 1000);

    expect(stubs.responsesCreate).not.toHaveBeenCalled();
    expect(stubs.responsesRetrieve).not.toHaveBeenCalled();
    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-legacy",
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("legacy"),
      }),
    );
    expect(stubs.setArticleFailed).toHaveBeenCalledWith("article-legacy");
    expect(stubs.refundQuota).toHaveBeenCalled();
    expect(out).toMatchObject({ done: true, status: "failed" });
  });
});

describe("/state response shape", () => {
  it("returns phase and elapsedMs when job is in_progress", async () => {
    const { computeJobStatePayload } = await import("../../server/routes/content");
    const startedAt = new Date(Date.now() - 12_000); // 12s ago
    const payload = computeJobStatePayload({
      status: "running",
      streamBuffer: "",
      errorMessage: null,
      openaiResponseId: "resp-123",
      startedAt,
    } as never);
    expect(payload.done).toBe(false);
    expect(payload.status).toBe("running");
    expect(payload.elapsedMs).toBeGreaterThanOrEqual(11_000);
    expect(payload.phase).toMatch(/Brainstorming|Drafting|Writing|Polishing/);
  });

  it("returns done:true when job is succeeded", async () => {
    const { computeJobStatePayload } = await import("../../server/routes/content");
    const payload = computeJobStatePayload({
      status: "succeeded",
      streamBuffer: "",
      errorMessage: null,
      openaiResponseId: "resp-done",
      startedAt: new Date(Date.now() - 30_000),
    } as never);
    expect(payload.done).toBe(true);
    expect(payload.status).toBe("succeeded");
  });

  it("returns errorMessage when job failed", async () => {
    const { computeJobStatePayload } = await import("../../server/routes/content");
    const payload = computeJobStatePayload({
      status: "failed",
      streamBuffer: "",
      errorMessage: "OpenAI overloaded",
      openaiResponseId: "resp-fail",
      startedAt: new Date(Date.now() - 5_000),
    } as never);
    expect(payload.done).toBe(true);
    expect(payload.status).toBe("failed");
    expect(payload.errorMessage).toBe("OpenAI overloaded");
  });
});
