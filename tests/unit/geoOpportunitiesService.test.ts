// Direct, no-HTTP tests for server/services/geoOpportunities.ts.
//
// HTTP-level behavior (including the indexed-rankings-read regression
// test) is covered by tests/unit/geoOpportunitiesRankings.test.ts; this
// file proves the extracted computeGeoOpportunitiesForBrand and
// computeGenericGeoOpportunities functions work when called directly.

import { describe, it, expect, vi, beforeEach } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getArticles: vi.fn(),
  getGeoRankingsByArticleIds: vi.fn(),
}));
vi.mock("../../server/storage", () => ({ storage: { ...storageStubs } }));

const { computeGeoOpportunitiesForBrand, computeGenericGeoOpportunities } =
  await import("../../server/services/geoOpportunities");

const BRAND = {
  id: "brand-1",
  name: "Acme",
  industry: "Technology",
  website: "https://acme.com",
  products: ["Widget"],
  uniqueSellingPoints: ["Fast support"],
} as any;

beforeEach(() => {
  for (const fn of Object.values(storageStubs)) fn.mockReset();
  storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
  storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  storageStubs.getArticles.mockResolvedValue([]);
  storageStubs.getGeoRankingsByArticleIds.mockResolvedValue([]);
});

describe("computeGeoOpportunitiesForBrand", () => {
  it("surfaces zeroed key stats when there is no citation data yet", async () => {
    const data = await computeGeoOpportunitiesForBrand(BRAND);

    expect(data.keyStats).toEqual({
      thirdPartyCitationShare: 0,
      redditCitationShare: 0,
      brandWebsiteCitationShare: 0,
    });
    expect(data.totalCitedRankings).toBe(0);
    expect(data.subreddits).toBe(
      (await import("../../server/services/geoOpportunities")).INDUSTRY_SUBREDDITS["Technology"],
    );
  });

  it("buckets cited rankings into reddit / own-site / third-party shares", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "bp-1" }]);
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      { isCited: 1, citingOutletUrl: "https://reddit.com/r/saas/comments/1" },
      { isCited: 1, citingOutletUrl: "https://acme.com/blog" },
      { isCited: 0, citingOutletUrl: "https://reddit.com/r/saas/comments/2" },
    ]);
    storageStubs.getArticles.mockResolvedValue([{ id: "a1", brandId: BRAND.id }]);
    storageStubs.getGeoRankingsByArticleIds.mockResolvedValue([
      { isCited: 1, citingOutletUrl: "https://news.ycombinator.com/item?id=1" },
    ]);

    const data = await computeGeoOpportunitiesForBrand(BRAND);

    expect(data.totalCitedRankings).toBe(3);
    expect(data.keyStats).toEqual({
      thirdPartyCitationShare: Math.round(((1 + 1) / 3) * 1000) / 10,
      redditCitationShare: Math.round((1 / 3) * 1000) / 10,
      brandWebsiteCitationShare: Math.round((1 / 3) * 1000) / 10,
    });
    expect(storageStubs.getGeoRankingsByArticleIds).toHaveBeenCalledWith(["a1"]);
  });

  it("includes brand-derived content ideas when products/USPs are present", async () => {
    const data = await computeGeoOpportunitiesForBrand(BRAND);

    expect(data.contentIdeas.some((idea) => idea.title.includes("Widget"))).toBe(true);
    expect(data.contentIdeas.some((idea) => idea.title.includes("Fast support"))).toBe(true);
  });
});

describe("computeGenericGeoOpportunities", () => {
  it("returns industry-specific subreddits and static key stats", () => {
    const data = computeGenericGeoOpportunities("Finance");

    expect(data.subreddits.some((s) => s.subreddit === "r/finance")).toBe(true);
    expect(data.keyStats).toEqual({
      thirdPartyCitationShare: 91,
      redditCitationShare: 21,
      brandWebsiteCitationShare: 9,
    });
    expect(data.industries).not.toContain("default");
  });

  it("falls back to default subreddits for an unknown industry", () => {
    const data = computeGenericGeoOpportunities("Aerospace");
    expect(data.subreddits.some((s) => s.subreddit === "r/Entrepreneur")).toBe(true);
  });
});
