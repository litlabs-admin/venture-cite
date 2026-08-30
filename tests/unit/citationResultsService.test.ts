// Direct, no-HTTP tests for server/services/citationResults.ts.
// See promptPortfolioService.test.ts for why these exist.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAW_RESPONSE_DELIMITER } from "../../server/lib/citationContextFormat";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, name: "Acme", website: "https://acme.com" } as any;

const storageStubs = vi.hoisted(() => ({
  getGeoRankingsByRunId: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const { buildRunDetails, buildBrandPromptResults } =
  await import("../../server/services/citationResults");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildRunDetails", () => {
  it("groups rankings by prompt text, ordered by the prompt's orderIndex", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      { prompt: "second question", orderIndex: 1 },
      { prompt: "first question", orderIndex: 0 },
    ]);
    storageStubs.getGeoRankingsByRunId.mockResolvedValue([
      {
        prompt: "second question",
        aiPlatform: "chatgpt",
        isCited: 1,
        citationContext: `snippet${RAW_RESPONSE_DELIMITER}\nfull text`,
        checkedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        prompt: "first question",
        aiPlatform: "perplexity",
        isCited: 0,
        citationContext: null,
        checkedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const result = await buildRunDetails(BRAND, "run-1");
    expect(result.byPrompt.map((p) => p.prompt)).toEqual(["first question", "second question"]);
    const second = result.byPrompt[1];
    expect(second.platforms[0]).toMatchObject({
      platform: "chatgpt",
      isCited: true,
      snippet: "snippet",
      fullResponse: "full text",
    });
  });
});

describe("buildBrandPromptResults", () => {
  it("returns a zeroed shape when the brand has no prompts", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    const data = await buildBrandPromptResults(BRAND, undefined);
    expect(data).toEqual({
      byPlatform: [],
      byPrompt: [],
      totalChecks: 0,
      totalCited: 0,
      citationRate: 0,
    });
  });

  it("keeps only the latest ranking per (prompt, platform) and aggregates citation rate", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      { id: "p1", prompt: "what is acme", rationale: null },
    ]);
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        brandPromptId: "p1",
        aiPlatform: "chatgpt",
        isCited: 0,
        rank: null,
        checkedAt: new Date("2026-01-01T00:00:00Z"),
        citationContext: null,
        runId: "run-old",
      },
      {
        brandPromptId: "p1",
        aiPlatform: "chatgpt",
        isCited: 1,
        rank: 2,
        checkedAt: new Date("2026-02-01T00:00:00Z"),
        citationContext: null,
        runId: "run-new",
        mentionedBrands: [{ name: "Acme", cited: true, rank: 1 }],
      },
    ]);

    const data = await buildBrandPromptResults(BRAND, undefined);
    expect(data.totalChecks).toBe(1);
    expect(data.totalCited).toBe(1);
    expect(data.citationRate).toBe(100);
    expect(data.byPlatform).toEqual([
      {
        platform: "chatgpt",
        cited: 1,
        checks: 1,
        lastRun: new Date("2026-02-01T00:00:00Z"),
        citationRate: 100,
      },
    ]);
    expect(data.byPrompt[0].reportCount).toBe(2);
    expect(data.byPrompt[0].platforms[0]).toMatchObject({
      platform: "chatgpt",
      isCited: true,
      rank: 2,
      topAnswers: [{ name: "Acme", isBrand: true }],
    });
    expect(data.brandDomain).toBe("acme.com");
  });
});
