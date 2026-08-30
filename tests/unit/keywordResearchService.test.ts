// Direct, no-HTTP tests for server/services/keywordResearch.ts (phase
// B7-13 service extraction). HTTP-level behavior for the routes that call
// these functions is already covered by tests/unit/keywordResearchProvenance.test.ts;
// this file proves the extracted service functions themselves can be
// called without an Express app, request, or response.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  getKeywordResearch: vi.fn(),
  createKeywordResearch: vi.fn(),
  getCompetitors: vi.fn(),
  openaiCreate: vi.fn(),
  enqueueLlmJob: vi.fn(),
  classifyAiEnqueueError: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getKeywordResearch: stubs.getKeywordResearch,
    createKeywordResearch: stubs.createKeywordResearch,
    getCompetitors: stubs.getCompetitors,
  },
}));

vi.mock("../../server/lib/llmJobs", () => ({
  enqueueLlmJob: stubs.enqueueLlmJob,
  classifyAiEnqueueError: stubs.classifyAiEnqueueError,
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: {
    keywordSuggestions: "gpt-4o-mini",
    popularTopics: "gpt-4o-mini",
    keywordResearch: "gpt-4o-mini",
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: { chat: { completions: { create: stubs.openaiCreate } } },
  };
});

const { keywordDiscoveryFinalize, suggestKeywords, getPopularTopics, discoverBrandKeywords } =
  await import("../../server/services/keywordResearch");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.getKeywordResearch.mockResolvedValue([]);
  stubs.createKeywordResearch.mockImplementation(async (row: any) => ({ id: "kr-1", ...row }));
  stubs.getCompetitors.mockResolvedValue([]);
});

describe("keywordDiscoveryFinalize", () => {
  it("persists new keywords tagged with ai-estimate provenance", async () => {
    const result = await keywordDiscoveryFinalize({
      payload: { brandId: "brand-1" },
      structuredOutput: { keywords: [{ keyword: "best crm" }] },
      outputText: "{}",
    });

    expect(stubs.createKeywordResearch).toHaveBeenCalledTimes(1);
    expect(stubs.createKeywordResearch.mock.calls[0][0]).toMatchObject({
      brandId: "brand-1",
      keyword: "best crm",
      provenance: "ai-estimate",
    });
    expect(result.count).toBe(1);
  });

  it("dedups against existing rows and returns a soft-empty message", async () => {
    stubs.getKeywordResearch.mockResolvedValueOnce([{ keyword: "Best CRM" }]);

    const result = await keywordDiscoveryFinalize({
      payload: { brandId: "brand-1" },
      structuredOutput: { keywords: [{ keyword: "best crm" }] },
      outputText: "{}",
    });

    expect(stubs.createKeywordResearch).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [],
      count: 0,
      message:
        "No new keywords found - try completing your brand profile (description, products, target audience) for better results.",
    });
  });

  it("throws when the model returns no keywords", async () => {
    await expect(
      keywordDiscoveryFinalize({
        payload: { brandId: "brand-1" },
        structuredOutput: [],
        outputText: "",
      }),
    ).rejects.toThrow("AI returned an empty response.");
  });
});

describe("suggestKeywords", () => {
  it("returns suggestions parsed from the model", async () => {
    stubs.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ suggestions: ["a", "b", "c"] }) } }],
    });

    const result = await suggestKeywords("crm", "saas");
    expect(result).toEqual({ kind: "ok", suggestions: ["a", "b", "c"] });
  });

  it("returns an error result instead of throwing when the model call fails", async () => {
    stubs.openaiCreate.mockRejectedValueOnce(new Error("rate limited"));

    const result = await suggestKeywords("crm", "saas");
    expect(result).toEqual({ kind: "error", message: "rate limited" });
  });
});

describe("getPopularTopics", () => {
  it("returns topics parsed from the model", async () => {
    stubs.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ topics: [{ topic: "AI search" }] }) } }],
    });

    const result = await getPopularTopics("saas");
    expect(result).toEqual({ kind: "ok", topics: [{ topic: "AI search" }] });
  });

  it("falls back to a generic topic when the model call fails", async () => {
    stubs.openaiCreate.mockRejectedValueOnce(new Error("down"));

    const result = await getPopularTopics("saas");
    expect(result.kind).toBe("error");
    expect(result.topics).toEqual([
      { topic: "Industry Innovation", description: "Latest trends", category: "General" },
    ]);
  });
});

describe("discoverBrandKeywords", () => {
  const brand = {
    id: "brand-1",
    name: "Acme",
    companyName: "Acme Co",
    industry: "SaaS",
    description: "desc",
    products: ["p1"],
    targetAudience: "devs",
  };

  it("enqueues a background job and returns its id/status", async () => {
    stubs.enqueueLlmJob.mockResolvedValueOnce({ jobId: "job-1", status: "pending" });

    const result = await discoverBrandKeywords(brand, "user-1");

    expect(result).toEqual({ kind: "enqueued", jobId: "job-1", status: "pending" });
    expect(stubs.enqueueLlmJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "keyword_discovery", brandId: "brand-1", userId: "user-1" }),
    );
  });

  it("maps a classified AI-enqueue error", async () => {
    stubs.enqueueLlmJob.mockRejectedValueOnce({ status: 429 });
    stubs.classifyAiEnqueueError.mockReturnValueOnce({ status: 429, body: { success: false } });

    const result = await discoverBrandKeywords(brand, "user-1");
    expect(result).toEqual({ kind: "ai_error", status: 429, body: { success: false } });
  });

  it("returns timeout for an unclassified AbortError/TimeoutError", async () => {
    stubs.enqueueLlmJob.mockRejectedValueOnce({ name: "TimeoutError" });
    stubs.classifyAiEnqueueError.mockReturnValueOnce(null);

    const result = await discoverBrandKeywords(brand, "user-1");
    expect(result).toEqual({ kind: "timeout" });
  });

  it("returns service_error for anything else", async () => {
    stubs.enqueueLlmJob.mockRejectedValueOnce(new Error("boom"));
    stubs.classifyAiEnqueueError.mockReturnValueOnce(null);

    const result = await discoverBrandKeywords(brand, "user-1");
    expect(result).toEqual({ kind: "service_error" });
  });
});
