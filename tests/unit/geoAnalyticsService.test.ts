// Direct, no-HTTP tests for server/services/geoAnalytics.ts.
//
// HTTP-level behavior for the /api/geo-analytics/* and /api/analyze-sentiment
// routes is covered by the route wiring; this file proves the extracted
// computeGeoAnalytics/recordVisibilitySnapshot/getVisibilityHistory/
// analyzeSentimentText functions work when called directly.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getArticles: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getGeoRankingsByArticleIds: vi.fn(),
  getCompetitors: vi.fn(),
  getCompetitorLeaderboard: vi.fn(),
  getBrandMentions: vi.fn(),
  createBrandVisibilitySnapshot: vi.fn(),
  getBrandVisibilitySnapshots: vi.fn(),
}));
vi.mock("../../server/storage", () => ({ storage: { ...storageStubs } }));

const openaiStub = vi.hoisted(() => ({ chat: { completions: { create: vi.fn() } } }));
const safeParseJsonStub = vi.hoisted(() => vi.fn((s: string) => JSON.parse(s)));
vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    openai: openaiStub,
    safeParseJson: safeParseJsonStub,
    MAX_CONTENT_LENGTH: 40_000,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    sendError: vi.fn(),
  };
});
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

const {
  computeGeoAnalytics,
  recordVisibilitySnapshot,
  getVisibilityHistory,
  analyzeSentimentText,
  SentimentUnavailableError,
} = await import("../../server/services/geoAnalytics");

const BRAND = { id: "brand-1", name: "Acme", industry: "SaaS" } as any;

beforeEach(() => {
  for (const fn of Object.values(storageStubs)) fn.mockReset();
  openaiStub.chat.completions.create.mockReset();
  safeParseJsonStub.mockClear();
  storageStubs.getArticles.mockResolvedValue([]);
  storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
  storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  storageStubs.getGeoRankingsByArticleIds.mockResolvedValue([]);
  storageStubs.getCompetitors.mockResolvedValue([]);
  storageStubs.getCompetitorLeaderboard.mockResolvedValue([]);
  storageStubs.getBrandMentions.mockResolvedValue([]);
});

describe("computeGeoAnalytics", () => {
  it("returns zeroed overview when the brand has no rankings at all", async () => {
    const data = await computeGeoAnalytics(BRAND, undefined);

    expect(data.overview).toEqual({
      aiVisibilityScore: 0,
      shareOfVoice: 0,
      totalCitations: 0,
      totalMentions: 0,
      marketSize: 0,
      competitorCount: 0,
    });
    expect(data.brand).toEqual({ id: "brand-1", name: "Acme", industry: "SaaS" });
  });

  it("computes citations, sentiment, and share of voice from ranking rows", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "bp-1" }]);
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        aiPlatform: "ChatGPT",
        isCited: 1,
        rank: 1,
        sentiment: "positive",
        authorityScore: 80,
      },
      { aiPlatform: "ChatGPT", isCited: 0, rank: null, sentiment: null, authorityScore: null },
    ]);
    storageStubs.getCompetitorLeaderboard.mockResolvedValue([
      {
        name: "Acme",
        domain: "acme.com",
        isOwn: true,
        totalCitations: 1,
        platformBreakdown: {},
        shareOfVoice: 50,
      },
      {
        name: "Rival",
        domain: "rival.com",
        isOwn: false,
        totalCitations: 1,
        platformBreakdown: {},
        shareOfVoice: 50,
      },
    ]);

    const data = await computeGeoAnalytics(BRAND, undefined);

    expect(data.overview.totalCitations).toBe(1);
    expect(data.overview.shareOfVoice).toBe(50);
    expect(data.sentiment.breakdown.positive).toBe(1);
    expect(data.sentiment.label).toBe("Positive");
    expect(data.platformBreakdown["ChatGPT"].citations).toBe(1);
    expect(data.platformBreakdown["ChatGPT"].visibilityScore).toBeGreaterThan(0);
  });

  it("passes the since filter through to the indexed ranking reads", async () => {
    const since = new Date("2026-08-01T00:00:00Z");
    storageStubs.getArticles.mockResolvedValue([{ id: "a1", brandId: BRAND.id }]);

    await computeGeoAnalytics(BRAND, since);

    expect(storageStubs.getGeoRankingsByArticleIds).toHaveBeenCalledWith(["a1"], since);
  });
});

describe("recordVisibilitySnapshot", () => {
  it("defaults missing fields before delegating to storage", async () => {
    storageStubs.createBrandVisibilitySnapshot.mockResolvedValue({ id: "snap-1" });

    await recordVisibilitySnapshot("brand-1", {});

    expect(storageStubs.createBrandVisibilitySnapshot).toHaveBeenCalledWith({
      brandId: "brand-1",
      aiPlatform: "All",
      mentionCount: 0,
      citationCount: 0,
      shareOfVoice: "0",
      visibilityScore: 0,
      sentimentPositive: 0,
      sentimentNeutral: 0,
      sentimentNegative: 0,
      avgSentimentScore: "0",
      metadata: null,
    });
  });

  it("passes through provided values", async () => {
    storageStubs.createBrandVisibilitySnapshot.mockResolvedValue({ id: "snap-1" });

    await recordVisibilitySnapshot("brand-1", {
      aiPlatform: "ChatGPT",
      mentionCount: 5,
      shareOfVoice: 12.5,
    });

    expect(storageStubs.createBrandVisibilitySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ aiPlatform: "ChatGPT", mentionCount: 5, shareOfVoice: "12.5" }),
    );
  });
});

describe("getVisibilityHistory", () => {
  it("delegates to storage.getBrandVisibilitySnapshots", async () => {
    storageStubs.getBrandVisibilitySnapshots.mockResolvedValue([{ id: "snap-1" }]);

    const result = await getVisibilityHistory("brand-1", 10);

    expect(storageStubs.getBrandVisibilitySnapshots).toHaveBeenCalledWith("brand-1", 10);
    expect(result).toEqual([{ id: "snap-1" }]);
  });
});

describe("analyzeSentimentText", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it("throws SentimentUnavailableError when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(analyzeSentimentText("Great product!", "")).rejects.toBeInstanceOf(
      SentimentUnavailableError,
    );
  });

  it("returns the parsed sentiment result", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    openaiStub.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sentiment: "positive",
              score: 0.8,
              confidence: 0.9,
              reasoning: "Praises the product",
            }),
          },
        },
      ],
    });

    const result = await analyzeSentimentText("Great product!", "review");

    expect(result).toEqual({
      sentiment: "positive",
      score: 0.8,
      confidence: 0.9,
      reasoning: "Praises the product",
    });
    process.env.OPENAI_API_KEY = originalKey;
  });

  it("falls back to a neutral result when the model response can't be parsed", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    safeParseJsonStub.mockReturnValueOnce(null);
    openaiStub.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
    });

    const result = await analyzeSentimentText("Great product!", "");

    expect(result).toEqual({
      sentiment: "neutral",
      score: 0,
      confidence: 0,
      reasoning: "Could not parse sentiment response",
    });
    process.env.OPENAI_API_KEY = originalKey;
  });
});
