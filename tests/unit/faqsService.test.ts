// Direct, no-HTTP tests for server/services/faqs.ts (phase B7-13 service
// extraction).

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  findSimilarFaqQuestion: vi.fn(),
  createFaqItem: vi.fn(),
  updateFaqItem: vi.fn(),
  getFaqItemById: vi.fn(),
  getBrandById: vi.fn(),
  loadBrandGenerationContext: vi.fn(),
  openaiCreate: vi.fn(),
  enqueueLlmJob: vi.fn(),
  classifyAiEnqueueError: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    findSimilarFaqQuestion: stubs.findSimilarFaqQuestion,
    createFaqItem: stubs.createFaqItem,
    updateFaqItem: stubs.updateFaqItem,
    getFaqItemById: stubs.getFaqItemById,
    getBrandById: stubs.getBrandById,
  },
}));

vi.mock("../../server/lib/brandGenerationContext", () => ({
  loadBrandGenerationContext: stubs.loadBrandGenerationContext,
  renderFactsBlock: () => "",
}));

vi.mock("../../server/lib/llmJobs", () => ({
  enqueueLlmJob: stubs.enqueueLlmJob,
  classifyAiEnqueueError: stubs.classifyAiEnqueueError,
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { misc: "gpt-4o-mini" },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: { chat: { completions: { create: stubs.openaiCreate } } },
  };
});

const { faqGenerationFinalize, optimizeFaq, generateFaqs, recomputeAiSurfaceScoreForEdit } =
  await import("../../server/services/faqs");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.findSimilarFaqQuestion.mockResolvedValue(null);
  stubs.createFaqItem.mockImplementation(async (row: any) => ({ id: "faq-1", ...row }));
});

describe("faqGenerationFinalize", () => {
  const brandCtx = { brand: { id: "brand-1", name: "Acme", nameVariations: [] } };

  it("persists valid FAQs and reports the dedup/invalid counts", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce(brandCtx);
    stubs.findSimilarFaqQuestion
      .mockResolvedValueOnce(null) // first FAQ: not a dup
      .mockResolvedValueOnce({ id: "existing" }); // second FAQ: dup

    const result = await faqGenerationFinalize({
      payload: { brandId: "brand-1", brandName: "Acme", faqCount: 3 },
      structuredOutput: {
        faqs: [
          { question: "What is Acme?", answer: "Acme is a widget maker with great support." },
          { question: "Dup question?", answer: "Dup answer." },
          { answer: "Invalid - missing question" } as any,
        ],
      },
      outputText: "{}",
    });

    expect(stubs.createFaqItem).toHaveBeenCalledTimes(1);
    expect(result.report).toEqual({
      requested: 3,
      generated: 3,
      inserted: 1,
      mergedDuplicates: 1,
      invalid: 1,
    });
  });

  it("throws when the model returns no faqs", async () => {
    await expect(
      faqGenerationFinalize({
        payload: { brandId: "brand-1", brandName: "Acme", faqCount: 3 },
        structuredOutput: [],
        outputText: "",
      }),
    ).rejects.toThrow("AI returned an empty response.");
  });

  it("throws when the brand no longer exists at finalize time", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce(null);

    await expect(
      faqGenerationFinalize({
        payload: { brandId: "brand-1", brandName: "Acme", faqCount: 1 },
        structuredOutput: { faqs: [{ question: "Q?", answer: "A." }] },
        outputText: "{}",
      }),
    ).rejects.toThrow("Brand not found at finalize time");
  });
});

describe("optimizeFaq", () => {
  const faq = { id: "faq-1", brandId: "brand-1", question: "Old Q?", answer: "Old A." };

  it("returns parse_error when the model output isn't valid JSON", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce(null);
    stubs.openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] });

    const result = await optimizeFaq(faq);
    expect(result).toEqual({ kind: "parse_error" });
  });

  it("saves the optimized question/answer with a deterministic score", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce({
      brand: { name: "Acme", industry: "SaaS", products: [], nameVariations: [] },
      facts: [],
    });
    stubs.openaiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              question: "What makes Acme different?",
              answer:
                "Acme combines fast onboarding with a dedicated support team, giving customers a reliable path from signup to daily use without friction.",
              optimizationTips: ["Be concise"],
            }),
          },
        },
      ],
    });
    stubs.updateFaqItem.mockResolvedValueOnce({ id: "faq-1", isOptimized: 1 });

    const result = await optimizeFaq(faq);

    expect(result.kind).toBe("ok");
    expect(stubs.updateFaqItem).toHaveBeenCalledWith(
      "faq-1",
      expect.objectContaining({
        question: "What makes Acme different?",
        isOptimized: 1,
        aiSurfaceScore: expect.any(Number),
      }),
    );
  });
});

describe("generateFaqs", () => {
  const brand = { id: "brand-1", name: "Acme", industry: "SaaS", description: "", products: [] };

  it("enqueues a background job with a clamped faqCount", async () => {
    stubs.enqueueLlmJob.mockResolvedValueOnce({ jobId: "job-1", status: "pending" });

    const result = await generateFaqs({
      brand,
      facts: [],
      topic: "pricing",
      count: 999,
      userId: "user-1",
    });

    expect(result).toEqual({ kind: "enqueued", jobId: "job-1", status: "pending" });
    expect(stubs.enqueueLlmJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "faq_generation",
        payload: expect.objectContaining({ faqCount: 20 }),
      }),
    );
  });

  it("maps a classified AI-enqueue error", async () => {
    stubs.enqueueLlmJob.mockRejectedValueOnce({ status: 401 });
    stubs.classifyAiEnqueueError.mockReturnValueOnce({ status: 401, body: { success: false } });

    const result = await generateFaqs({
      brand,
      facts: [],
      topic: "pricing",
      count: 5,
      userId: "user-1",
    });

    expect(result).toEqual({ kind: "ai_error", status: 401, body: { success: false } });
  });

  it("returns service_error for anything unclassified (no AbortError branch here)", async () => {
    stubs.enqueueLlmJob.mockRejectedValueOnce({ name: "TimeoutError" });
    stubs.classifyAiEnqueueError.mockReturnValueOnce(null);

    const result = await generateFaqs({
      brand,
      facts: [],
      topic: "pricing",
      count: 5,
      userId: "user-1",
    });

    // Unlike discoverBrandKeywords, FAQ generation deliberately has no
    // separate AbortError/TimeoutError branch (see commit 708aa72).
    expect(result).toEqual({ kind: "service_error" });
  });
});

describe("recomputeAiSurfaceScoreForEdit", () => {
  it("returns undefined when the FAQ can't be found", async () => {
    stubs.getFaqItemById.mockResolvedValueOnce(undefined);

    const score = await recomputeAiSurfaceScoreForEdit("faq-missing", { question: "New Q?" });
    expect(score).toBeUndefined();
  });

  it("recomputes the score from the merged question/answer and brand", async () => {
    stubs.getFaqItemById.mockResolvedValueOnce({
      id: "faq-1",
      brandId: "brand-1",
      question: "Old Q?",
      answer: "Old A.",
    });
    stubs.getBrandById.mockResolvedValueOnce({ name: "Acme", nameVariations: [] });

    const score = await recomputeAiSurfaceScoreForEdit("faq-1", {
      answer:
        "Acme ships a guided setup wizard and 24/7 chat support so new customers reach value within their first session.",
    });

    expect(typeof score).toBe("number");
  });
});
