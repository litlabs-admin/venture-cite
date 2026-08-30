// Direct, no-HTTP tests for server/services/contentGeneration.ts (phase
// B7-13 service extraction). HTTP-level behavior for the routes that call
// these functions is already covered by tests/unit/contentCancel.test.ts,
// contentGenerateStatusConflict.test.ts, and contentGenerationResponses.test.ts;
// this file proves the extracted service functions themselves can be
// called without an Express app, request, or response.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  claimContentJobForSlice: vi.fn(),
  runArticleSlice: vi.fn(),
  waitUntil: vi.fn(),
  captureAndFlush: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { claimContentJobForSlice: stubs.claimContentJobForSlice },
}));

vi.mock("../../server/contentGenerationWorker", () => ({
  runArticleSlice: stubs.runArticleSlice,
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: stubs.waitUntil,
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { contentHumanize: "gpt-4o-mini" },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: { chat: { completions: { create: stubs.openaiCreate } } },
  };
});

const {
  computeJobStatePayload,
  contentLengthForResponse,
  driveArticleGenerationInBackground,
  advanceContentJobSlice,
  autoImproveArticle,
} = await import("../../server/services/contentGeneration");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
});

describe("computeJobStatePayload", () => {
  it("returns elapsedSeconds while the job is running", () => {
    const startedAt = new Date(Date.now() - 12_000);
    const payload = computeJobStatePayload({ status: "running", errorMessage: null, startedAt });
    expect(payload.done).toBe(false);
    expect(payload.elapsedSeconds).toBeGreaterThanOrEqual(11);
  });

  it("marks terminal statuses done without elapsedSeconds", () => {
    const payload = computeJobStatePayload({
      status: "failed",
      errorMessage: "boom",
      startedAt: new Date(),
    });
    expect(payload).toEqual({ status: "failed", done: true, errorMessage: "boom" });
  });
});

describe("contentLengthForResponse", () => {
  it("returns the article's content length", () => {
    expect(contentLengthForResponse({ content: "hello" })).toBe(5);
  });

  it("returns 0 for a missing article or null content", () => {
    expect(contentLengthForResponse(undefined)).toBe(0);
    expect(contentLengthForResponse({ content: null })).toBe(0);
  });
});

describe("driveArticleGenerationInBackground", () => {
  it("hands waitUntil a promise that claims and runs slices until done", async () => {
    stubs.claimContentJobForSlice.mockResolvedValueOnce({ advanceToken: "tok-1" });
    stubs.runArticleSlice.mockResolvedValueOnce({ done: true, status: "succeeded" });

    driveArticleGenerationInBackground("job-1");

    expect(stubs.waitUntil).toHaveBeenCalledTimes(1);
    const driven = stubs.waitUntil.mock.calls[0][0] as Promise<unknown>;
    await driven;

    expect(stubs.claimContentJobForSlice).toHaveBeenCalledWith("job-1", 12);
    expect(stubs.runArticleSlice).toHaveBeenCalledWith("job-1", expect.any(Number), "tok-1");
  });

  it("reports unexpected errors to Sentry instead of throwing", async () => {
    stubs.claimContentJobForSlice.mockRejectedValueOnce(new Error("db down"));

    driveArticleGenerationInBackground("job-2");
    const driven = stubs.waitUntil.mock.calls[0][0] as Promise<unknown>;
    await driven;

    expect(stubs.captureAndFlush).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "content.generate.serverDrive" } }),
    );
  });
});

describe("advanceContentJobSlice", () => {
  it("reports busy when the slice lock can't be claimed", async () => {
    stubs.claimContentJobForSlice.mockResolvedValueOnce(null);
    const articles = { get: vi.fn() };

    const result = await advanceContentJobSlice(
      { id: "job-1", articleId: "article-1", status: "running" },
      articles as any,
    );

    expect(result).toEqual({ kind: "busy", status: "running" });
    expect(articles.get).not.toHaveBeenCalled();
  });

  it("runs a slice and returns the updated article on success", async () => {
    stubs.claimContentJobForSlice.mockResolvedValueOnce({ advanceToken: "tok-2" });
    stubs.runArticleSlice.mockResolvedValueOnce({ done: true, status: "succeeded" });
    const articles = { get: vi.fn().mockResolvedValue({ content: "abcde" }) };

    const result = await advanceContentJobSlice(
      { id: "job-1", articleId: "article-1", status: "running" },
      articles as any,
    );

    expect(result.kind).toBe("advanced");
    if (result.kind === "advanced") {
      expect(result.outcome).toEqual({ done: true, status: "succeeded" });
      expect(result.updatedArticle).toEqual({ content: "abcde" });
    }
    expect(articles.get).toHaveBeenCalledWith("article-1");
  });

  it("skips the article fetch when the job has no articleId", async () => {
    stubs.claimContentJobForSlice.mockResolvedValueOnce({ advanceToken: "tok-3" });
    stubs.runArticleSlice.mockResolvedValueOnce({ done: false, status: "running" });
    const articles = { get: vi.fn() };

    const result = await advanceContentJobSlice(
      { id: "job-1", articleId: null, status: "running" },
      articles as any,
    );

    expect(result.kind).toBe("advanced");
    if (result.kind === "advanced") {
      expect(result.updatedArticle).toBeUndefined();
    }
    expect(articles.get).not.toHaveBeenCalled();
  });
});

describe("autoImproveArticle", () => {
  const baseArticle = { id: "article-1", content: "Original content", version: 1 } as any;
  const articles = () => ({
    updateIfVersion: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
  });
  const revisions = () => ({ create: vi.fn() });

  it("returns no_content when the article has no content yet", async () => {
    const result = await autoImproveArticle({
      article: { ...baseArticle, content: null },
      instructions: null,
      expectedVersion: undefined,
      articles: articles() as any,
      revisions: revisions() as any,
    });
    expect(result).toEqual({ kind: "no_content" });
  });

  it("returns too_long when content exceeds MAX_CONTENT_LENGTH", async () => {
    const result = await autoImproveArticle({
      article: { ...baseArticle, content: "x".repeat(40_001) },
      instructions: null,
      expectedVersion: undefined,
      articles: articles() as any,
      revisions: revisions() as any,
    });
    expect(result).toEqual({ kind: "too_long" });
  });

  it("returns empty_response when the model returns nothing usable", async () => {
    stubs.openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: "   " } }] });
    const result = await autoImproveArticle({
      article: baseArticle,
      instructions: null,
      expectedVersion: undefined,
      articles: articles() as any,
      revisions: revisions() as any,
    });
    expect(result).toEqual({ kind: "empty_response" });
  });

  it("writes the rewrite and both revisions on success (unversioned update)", async () => {
    stubs.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Rewritten content" } }],
    });
    const articleRepo = articles();
    articleRepo.update.mockResolvedValue({ ...baseArticle, content: "Rewritten content" });
    const revisionRepo = revisions();

    const result = await autoImproveArticle({
      article: baseArticle,
      instructions: "Make it punchier",
      expectedVersion: undefined,
      articles: articleRepo as any,
      revisions: revisionRepo as any,
    });

    expect(result.kind).toBe("success");
    expect(articleRepo.update).toHaveBeenCalledWith("article-1", { content: "Rewritten content" });
    expect(revisionRepo.create).toHaveBeenCalledTimes(2);
    expect(revisionRepo.create).toHaveBeenNthCalledWith(1, {
      articleId: "article-1",
      content: "Original content",
      source: "manual_edit",
    });
    expect(revisionRepo.create).toHaveBeenNthCalledWith(2, {
      articleId: "article-1",
      content: "Rewritten content",
      source: "auto_improve",
    });
  });

  it("returns version_conflict when the optimistic lock loses the race", async () => {
    stubs.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Rewritten content" } }],
    });
    const articleRepo = articles();
    articleRepo.updateIfVersion.mockResolvedValue(undefined);
    articleRepo.get.mockResolvedValue({ ...baseArticle, version: 2 });

    const result = await autoImproveArticle({
      article: baseArticle,
      instructions: null,
      expectedVersion: 1,
      articles: articleRepo as any,
      revisions: revisions() as any,
    });

    expect(result).toEqual({ kind: "version_conflict", current: { ...baseArticle, version: 2 } });
  });
});
