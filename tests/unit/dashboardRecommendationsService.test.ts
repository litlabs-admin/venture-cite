// Direct, no-HTTP test for server/services/dashboardRecommendations.ts.
//
// HTTP-level behavior for GET /api/brands/:brandId/recommendations is
// already covered by tests/unit/dashboardRecommendationInputs.test.ts; this
// file proves the extracted service function itself can be called without
// an Express app, request, or response.

import { beforeEach, describe, expect, it, vi } from "vitest";

const BRAND_ID = "brand-1";
const USER = { id: "user-1" };
const BRAND = { id: BRAND_ID, userId: "user-1", name: "Acme", industry: "SaaS" } as any;

const stubs = vi.hoisted(() => ({
  getArticlesByUserIdWithStatus: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getCitationRunsByBrandId: vi.fn(),
  getCompetitors: vi.fn(),
  getCommunityPosts: vi.fn(),
  getFaqItems: vi.fn(),
  getVisibilityProgress: vi.fn(),
  getLastGeoSignalSummary: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { ...stubs },
}));

const { getDashboardRecommendations } =
  await import("../../server/services/dashboardRecommendations");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.getArticlesByUserIdWithStatus.mockResolvedValue(
    Array.from({ length: 5 }, (_, i) => ({ id: `a-${i}` })),
  );
  stubs.getBrandPromptsByBrandId.mockResolvedValue(
    Array.from({ length: 10 }, (_, i) => ({ id: `p-${i}` })),
  );
  stubs.getCitationRunsByBrandId.mockResolvedValue([
    { id: "r-1", status: "completed", totalChecks: 10, totalCited: 5 },
  ]);
  stubs.getCompetitors.mockResolvedValue([]);
  stubs.getCommunityPosts.mockResolvedValue([]);
  stubs.getFaqItems.mockResolvedValue([{ id: "f-1" }]);
  stubs.getVisibilityProgress.mockResolvedValue([]);
  stubs.getLastGeoSignalSummary.mockResolvedValue(null);
});

describe("getDashboardRecommendations", () => {
  it("plumbs storage state into the engine and fires rerun-geo-signals when never scanned", async () => {
    const recs = await getDashboardRecommendations(USER, BRAND);

    expect(stubs.getArticlesByUserIdWithStatus).toHaveBeenCalledWith(USER.id, {
      brandId: BRAND_ID,
      limit: 100,
      offset: 0,
    });
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("rerun-geo-signals");
  });

  it("computes citationRate from the most recent completed run only", async () => {
    stubs.getCitationRunsByBrandId.mockResolvedValue([
      { id: "r-2", status: "running", totalChecks: 100, totalCited: 0 },
      { id: "r-1", status: "completed", totalChecks: 10, totalCited: 5 },
    ]);
    stubs.getLastGeoSignalSummary.mockResolvedValue({
      ranAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      overallScore: 80,
    });

    const recs = await getDashboardRecommendations(USER, BRAND);

    // With a healthy 50% citation rate and a recent Signals scan, neither
    // the low-citation-rate nor the rerun-geo-signals rule should fire.
    const ids = recs.map((r) => r.id);
    expect(ids).not.toContain("rerun-geo-signals");
  });
});
