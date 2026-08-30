// Direct, no-HTTP tests for server/services/geoRankings.ts
// (phase B7-15 service extraction).

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  createGeoRanking: vi.fn(),
  getGeoRankings: vi.fn(),
  getArticles: vi.fn(),
  getGeoRankingsByPlatform: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    createGeoRanking: stubs.createGeoRanking,
    getGeoRankings: stubs.getGeoRankings,
    getArticles: stubs.getArticles,
    getGeoRankingsByPlatform: stubs.getGeoRankingsByPlatform,
  },
}));

const {
  createGeoRankingObservation,
  listGeoRankingsForArticle,
  listGeoRankingsForOwner,
  listGeoRankingsByPlatformForOwner,
} = await import("../../server/services/geoRankings");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
});

describe("createGeoRankingObservation", () => {
  it("normalizes isCited to 1/0 and defaults rank/citationContext to null", async () => {
    stubs.createGeoRanking.mockResolvedValueOnce({ id: "ranking-1" });

    const result = await createGeoRankingObservation({
      articleId: "article-1",
      brandId: "brand-1",
      aiPlatform: "ChatGPT",
      prompt: "best tool",
      rank: undefined,
      isCited: true,
      citationContext: undefined,
    });

    expect(stubs.createGeoRanking).toHaveBeenCalledWith({
      articleId: "article-1",
      brandId: "brand-1",
      aiPlatform: "ChatGPT",
      prompt: "best tool",
      rank: null,
      isCited: 1,
      citationContext: null,
    });
    expect(result).toEqual({ id: "ranking-1" });
  });

  it("treats a falsy isCited as 0", async () => {
    stubs.createGeoRanking.mockResolvedValueOnce({ id: "ranking-2" });

    await createGeoRankingObservation({
      articleId: "article-1",
      brandId: null,
      aiPlatform: "Claude",
      prompt: "p",
      rank: 3,
      isCited: false,
      citationContext: "context",
    });

    expect(stubs.createGeoRanking).toHaveBeenCalledWith(
      expect.objectContaining({ isCited: 0, rank: 3, citationContext: "context" }),
    );
  });
});

describe("listGeoRankingsForArticle", () => {
  it("passes the articleId straight through to storage", async () => {
    stubs.getGeoRankings.mockResolvedValueOnce([{ id: "r-1" }]);
    const result = await listGeoRankingsForArticle("article-1");
    expect(stubs.getGeoRankings).toHaveBeenCalledWith("article-1");
    expect(result).toEqual([{ id: "r-1" }]);
  });
});

describe("listGeoRankingsForOwner", () => {
  it("filters rankings down to articles owned by the caller's brands", async () => {
    stubs.getArticles.mockResolvedValueOnce([
      { id: "art-owned", brandId: "brand-mine" },
      { id: "art-other", brandId: "brand-other" },
      { id: "art-orphan", brandId: null },
    ]);
    stubs.getGeoRankings.mockResolvedValueOnce([
      { id: "r-1", articleId: "art-owned" },
      { id: "r-2", articleId: "art-other" },
      { id: "r-3", articleId: null },
    ]);

    const result = await listGeoRankingsForOwner(new Set(["brand-mine"]));

    expect(result).toEqual([{ id: "r-1", articleId: "art-owned" }]);
  });
});

describe("listGeoRankingsByPlatformForOwner", () => {
  it("filters platform rankings down to the caller's own articles", async () => {
    stubs.getArticles.mockResolvedValueOnce([{ id: "art-owned", brandId: "brand-mine" }]);
    stubs.getGeoRankingsByPlatform.mockResolvedValueOnce([
      { id: "r-1", articleId: "art-owned" },
      { id: "r-2", articleId: "art-not-mine" },
    ]);

    const result = await listGeoRankingsByPlatformForOwner("ChatGPT", new Set(["brand-mine"]));

    expect(stubs.getGeoRankingsByPlatform).toHaveBeenCalledWith("ChatGPT");
    expect(result).toEqual([{ id: "r-1", articleId: "art-owned" }]);
  });
});
