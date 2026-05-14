import { describe, it, expect, vi, beforeEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: vi.fn(async (_p: string, _r: string | undefined, fn: () => Promise<unknown>) => fn()),
  PROVIDER_LIMITS: { openai: 20, anthropic: 20, perplexity: 10, gemini: 30 },
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

// openaiMock surface used in tests
const openaiMock = { chat: { completions: { create: createMock } } };

import { runUserEnrichSource } from "../../server/lib/factAgent/v2/sourceUserEnrich";

const baseBrand = {
  id: "brand-1",
  name: "Acme",
  description: "We build AI for SMBs.",
  industry: "saas",
  website: "https://example.com",
  products: ["AI Assistant", "AI Analytics"],
  targetAudience: "SMB founders",
  uniqueSellingPoints: ["Fast setup", "No-code"],
  keyValues: "Customer obsession",
  brandVoice: "Friendly + technical",
  tone: "Casual",
};

describe("runUserEnrichSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns LLM-reshaped facts on happy path", async () => {
    openaiMock.chat.completions.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                {
                  domain: "identity",
                  subcategory: "description",
                  factKey: "description",
                  factValue: "We build AI for SMBs.",
                  valueType: "string",
                  confidence: 1.0,
                  sourceExcerpt: "",
                },
                {
                  domain: "offerings",
                  subcategory: "products",
                  factKey: "products",
                  factValue: "AI Assistant, AI Analytics",
                  valueType: "array",
                  valuePayload: { items: ["AI Assistant", "AI Analytics"] },
                  confidence: 1.0,
                  sourceExcerpt: "",
                },
              ],
            }),
          },
        },
      ],
    });
    const out = await runUserEnrichSource({ brand: baseBrand, runId: "run-1" });
    expect(out.status).toBe("done");
    expect(out.facts.length).toBeGreaterThanOrEqual(2);
    expect(out.facts.every((f) => f.confidence === 1.0)).toBe(true);
    expect(out.diagnostics.usedFallback).toBe(false);
  });

  it("falls back to deterministic mapping when LLM throws", async () => {
    openaiMock.chat.completions.create.mockRejectedValueOnce(
      Object.assign(new Error("openai down"), { status: 503 }),
    );
    const out = await runUserEnrichSource({ brand: baseBrand, runId: "run-1" });
    expect(out.status).toBe("done");
    expect(out.diagnostics.usedFallback).toBe(true);
    expect(
      out.facts.some((f) => f.factKey === "description" && f.factValue.includes("AI for SMBs")),
    ).toBe(true);
    expect(out.facts.some((f) => f.factKey === "products")).toBe(true);
  });

  it("returns empty facts when the brand record is entirely blank", async () => {
    const blank = {
      id: "brand-2",
      name: "",
      description: null,
      industry: null,
      website: "",
      products: null,
      targetAudience: null,
      uniqueSellingPoints: null,
      keyValues: null,
      brandVoice: null,
      tone: null,
    };
    openaiMock.chat.completions.create.mockRejectedValueOnce(new Error("simulate"));
    const out = await runUserEnrichSource({ brand: blank as never, runId: "run-1" });
    expect(out.status).toBe("done");
    expect(out.facts).toEqual([]);
    expect(out.diagnostics.usedFallback).toBe(true);
  });
});
