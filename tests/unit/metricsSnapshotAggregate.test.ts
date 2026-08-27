import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createMetricsSnapshot: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getPromptCitationCounts: vi.fn(),
  getCitedRelevanceStats: vi.fn(),
  getBrandHallucinations: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: stubs,
}));

const { recordCurrentMetrics } = await import("../../server/lib/metricsSnapshot");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.createMetricsSnapshot.mockResolvedValue(undefined);
  stubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "prompt-a" }, { id: "prompt-b" }]);
  stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  stubs.getBrandHallucinations.mockResolvedValue([
    { isResolved: 0 },
    { isResolved: 0 },
    { isResolved: 1 },
  ]);
});

describe("recordCurrentMetrics aggregate reads", () => {
  it("writes the current metric snapshots from prompt and relevance aggregates", async () => {
    stubs.getPromptCitationCounts.mockResolvedValue([
      { brandPromptId: "prompt-a", checks: 3, cited: 2 },
      { brandPromptId: "prompt-b", checks: 2, cited: 0 },
    ]);
    stubs.getCitedRelevanceStats.mockResolvedValue({ cited: 3, scored: 2, avgRelevance: 2.5 });

    await recordCurrentMetrics("brand-1", { citationRate: 40, totalChecks: 5, totalCited: 2 });

    expect(stubs.createMetricsSnapshot.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      {
        brandId: "brand-1",
        metricType: "citation_rate",
        metricValue: "40.00",
        metricDetails: { totalChecks: 5, totalCited: 2 },
      },
      {
        brandId: "brand-1",
        metricType: "share_of_answer",
        metricValue: "40.00",
        metricDetails: { totalChecks: 5, totalCited: 2 },
      },
      {
        brandId: "brand-1",
        metricType: "visibility_score",
        metricValue: "40.00",
        metricDetails: {
          totalChecks: 5,
          totalCited: 2,
          byPrompt: [
            { promptId: "prompt-a", checks: 3, cited: 2 },
            { promptId: "prompt-b", checks: 2, cited: 0 },
          ],
        },
      },
      {
        brandId: "brand-1",
        metricType: "citation_quality",
        metricValue: "2.50",
        metricDetails: { cited: 3, scored: 2 },
      },
      {
        brandId: "brand-1",
        metricType: "hallucinations",
        metricValue: "2",
        metricDetails: { total: 3, unresolved: 2 },
      },
      {
        brandId: "brand-1",
        metricType: "hallucinations_unresolved",
        metricValue: "2",
        metricDetails: { total: 3, unresolved: 2 },
      },
    ]);
  });

  it("does not write citation quality when no cited row has a relevance score", async () => {
    stubs.getPromptCitationCounts.mockResolvedValue([]);
    stubs.getCitedRelevanceStats.mockResolvedValue({ cited: 4, scored: 0, avgRelevance: null });

    await recordCurrentMetrics("brand-1", { citationRate: 0, totalChecks: 4, totalCited: 0 });

    expect(
      stubs.createMetricsSnapshot.mock.calls.map(([snapshot]) => snapshot.metricType),
    ).not.toContain("citation_quality");
  });
});
