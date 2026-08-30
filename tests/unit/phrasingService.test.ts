// Direct, no-HTTP tests for server/services/promptPhrasing.ts.
// See promptPortfolioService.test.ts for why these exist.

import { beforeEach, describe, expect, it, vi } from "vitest";

const BRAND_ID = "brand-1";
const BRAND = {
  id: BRAND_ID,
  name: "Acme",
  nameVariations: ["Acme Inc"],
  website: "https://acme.com",
} as any;

const storageStubs = vi.hoisted(() => ({
  createPhrasingTest: vi.fn(),
  setPhrasingTestResults: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const generatePhrasingsMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/phrasingGenerator", () => ({
  generatePhrasings: generatePhrasingsMock,
}));

const runPlatformCitationCheckMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/citationChecker", () => ({
  DEFAULT_CITATION_PLATFORMS: ["chatgpt", "perplexity"],
  runPlatformCitationCheck: runPlatformCitationCheckMock,
}));

const { generatePhrasingsForPrompt, analyzePhrasing } =
  await import("../../server/services/promptPhrasing");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generatePhrasingsForPrompt", () => {
  const prompt = { id: "p1", brandId: BRAND_ID, prompt: "what is acme" } as any;

  it("reports an upstream error when the model returns nothing usable", async () => {
    generatePhrasingsMock.mockResolvedValue([]);
    const result = await generatePhrasingsForPrompt(BRAND, prompt);
    expect(result).toEqual({ outcome: "upstream_error" });
    expect(storageStubs.createPhrasingTest).not.toHaveBeenCalled();
  });

  it("persists every generated phrasing against the prompt", async () => {
    generatePhrasingsMock.mockResolvedValue([
      { text: "who is acme", rationale: "formality" },
      { text: "acme reviews", rationale: "specificity" },
    ]);
    storageStubs.createPhrasingTest.mockImplementation((t: any) =>
      Promise.resolve({ id: `test-${t.phrasing}`, ...t }),
    );
    const result = await generatePhrasingsForPrompt(BRAND, prompt);
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data).toHaveLength(2);
    }
    expect(storageStubs.createPhrasingTest).toHaveBeenCalledWith({
      brandPromptId: "p1",
      phrasing: "who is acme",
      rationale: "formality",
    });
  });
});

describe("analyzePhrasing", () => {
  it("runs one citation check per platform and persists the combined results", async () => {
    const test = { id: "t1", brandPromptId: "p1", phrasing: "who is acme" } as any;
    runPlatformCitationCheckMock.mockImplementation((platform: string) =>
      Promise.resolve({
        isCited: platform === "chatgpt",
        rank: platform === "chatgpt" ? 1 : null,
        relevance: null,
      }),
    );
    storageStubs.setPhrasingTestResults.mockImplementation((id: string, results: unknown) =>
      Promise.resolve({ id, results }),
    );

    await analyzePhrasing(BRAND, "user-1", test);

    expect(runPlatformCitationCheckMock).toHaveBeenCalledTimes(2);
    expect(runPlatformCitationCheckMock).toHaveBeenCalledWith(
      "chatgpt",
      "who is acme",
      BRAND,
      BRAND.name,
      BRAND.nameVariations,
      BRAND.website,
      "user-1",
    );
    const [, results] = storageStubs.setPhrasingTestResults.mock.calls[0];
    expect(results).toEqual([
      { platform: "chatgpt", isCited: true, rank: 1, relevance: null },
      { platform: "perplexity", isCited: false, rank: null, relevance: null },
    ]);
  });

  it("records a per-platform failure instead of throwing", async () => {
    const test = { id: "t1", brandPromptId: "p1", phrasing: "who is acme" } as any;
    runPlatformCitationCheckMock.mockRejectedValue(new Error("timeout"));
    storageStubs.setPhrasingTestResults.mockResolvedValue({ id: "t1" });

    await analyzePhrasing(BRAND, "user-1", test);

    const [, results] = storageStubs.setPhrasingTestResults.mock.calls[0];
    expect(results).toEqual([
      { platform: "chatgpt", isCited: false, rank: null, relevance: null, error: "timeout" },
      { platform: "perplexity", isCited: false, rank: null, relevance: null, error: "timeout" },
    ]);
  });
});
