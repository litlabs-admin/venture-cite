import { describe, it, expect, vi, beforeEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: vi.fn(async (_p: string, _r: string | undefined, fn: () => Promise<unknown>) => fn()),
  PROVIDER_LIMITS: { openai: 20, anthropic: 20, perplexity: 10, gemini: 30 },
}));

vi.mock("openai", () => ({
  // vitest 4 calls this with `new` (the OpenAI client is instantiated via
  // `new`), so the implementation must be a real function — arrow
  // functions cannot be constructor-called and would throw.
  default: vi.fn().mockImplementation(function () {
    return {
      chat: { completions: { create: createMock } },
    };
  }),
}));

// openaiMock surface used in tests
const openaiMock = { chat: { completions: { create: createMock } } };

import {
  runUserEnrichSource,
  restoreSpacesFromSources,
} from "../../server/lib/factAgent/v2/sourceUserEnrich";

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

describe("restoreSpacesFromSources", () => {
  const desc =
    "VenturePR specializes in providing strategic public relations services for disruptive companies, particularly in the tech sector.";
  const sources = ["VenturePR", desc, "Public Relations", "Tech founders"];

  it("restores spaces a model deleted from a verbatim-echoed source", () => {
    const mangled = desc.replace(/\s+/g, ""); // "VenturePRspecializesin…"
    expect(restoreSpacesFromSources(mangled, sources)).toBe(desc);
  });

  it("is a no-op when the value already has its spaces", () => {
    expect(restoreSpacesFromSources(desc, sources)).toBe(desc);
  });

  it("leaves a genuinely paraphrased value untouched (no despaced match)", () => {
    const paraphrase = "A PR firm for tech startups.";
    expect(restoreSpacesFromSources(paraphrase, sources)).toBe(paraphrase);
  });

  it("requires an exact despaced match — a prefix of a source is not restored", () => {
    // despace("venture") is a prefix of despace(desc) but not equal, so the
    // long description must NOT be substituted in.
    expect(restoreSpacesFromSources("venture", sources)).toBe("venture");
  });

  it("does not touch a single-word value that only differs by case (no spaces lost)", () => {
    // "venturepr" despaces-equal to source "VenturePR" but is the same length,
    // so there are no deleted spaces to restore; left as-is.
    expect(restoreSpacesFromSources("venturepr", sources)).toBe("venturepr");
  });

  it("handles empty / spaceless-source edge cases without throwing", () => {
    expect(restoreSpacesFromSources("", sources)).toBe("");
    expect(restoreSpacesFromSources("anything", [])).toBe("anything");
  });
});

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
    // deterministicFallback emits the controlled-vocab key "productLine"
    // (not "products") for the offerings domain — see sourceUserEnrich.ts.
    expect(out.facts.some((f) => f.factKey === "productLine")).toBe(true);
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
