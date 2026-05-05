import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted before top-level const declarations, so we
// must use vi.hoisted() to share the mock handles with the factories.
const { storageMock, openaiMock } = vi.hoisted(() => ({
  storageMock: {
    getCachedSentiment: vi.fn(),
    upsertCachedSentiment: vi.fn(),
  },
  openaiMock: { chat: { completions: { create: vi.fn() } } },
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("openai", () => ({ default: vi.fn().mockImplementation(() => openaiMock) }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));

import { judgeSentimentBatch } from "../../server/lib/sentimentBatcher";

describe("judgeSentimentBatch", () => {
  beforeEach(() => {
    storageMock.getCachedSentiment.mockReset();
    storageMock.upsertCachedSentiment.mockReset();
    openaiMock.chat.completions.create.mockReset();
  });

  it("returns cached sentiment without calling OpenAI", async () => {
    storageMock.getCachedSentiment.mockResolvedValue({
      sentiment: "positive",
      sentimentScore: "0.80",
    });
    const out = await judgeSentimentBatch("Linear", [{ key: "k1", text: "I love Linear" }]);
    expect(out["k1"]).toEqual({ sentiment: "positive", sentimentScore: 0.8, source: "llm" });
    expect(openaiMock.chat.completions.create).not.toHaveBeenCalled();
  });

  it("batches uncached entries 10/call", async () => {
    storageMock.getCachedSentiment.mockResolvedValue(undefined);
    openaiMock.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdicts: Array.from({ length: 10 }, (_, i) => ({
                key: `k${i}`,
                sentiment: "neutral",
                sentimentScore: 0,
              })),
            }),
          },
        },
      ],
    });
    const inputs = Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, text: `text ${i}` }));
    await judgeSentimentBatch("Linear", inputs);
    expect(openaiMock.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it("returns neutral fallback on OpenAI error", async () => {
    storageMock.getCachedSentiment.mockResolvedValue(undefined);
    openaiMock.chat.completions.create.mockRejectedValue(new Error("boom"));
    const out = await judgeSentimentBatch("Linear", [{ key: "k1", text: "hi" }]);
    expect(out["k1"]).toEqual({ sentiment: "neutral", sentimentScore: 0, source: "fallback" });
  });

  it("respects daily cap — over-cap entries get source 'capped'", async () => {
    storageMock.getCachedSentiment.mockResolvedValue(undefined);
    const inputs = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, text: `t${i}` }));
    // remaining=2 means only 2 of 5 should go to OpenAI
    openaiMock.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdicts: [
                { key: "k0", sentiment: "neutral", sentimentScore: 0 },
                { key: "k1", sentiment: "neutral", sentimentScore: 0 },
              ],
            }),
          },
        },
      ],
    });
    const out = await judgeSentimentBatch("Linear", inputs, { remainingBudget: 2 });
    expect(out["k0"].source).toBe("llm");
    expect(out["k1"].source).toBe("llm");
    expect(out["k2"].source).toBe("capped");
    expect(out["k3"].source).toBe("capped");
    expect(out["k4"].source).toBe("capped");
  });
});
