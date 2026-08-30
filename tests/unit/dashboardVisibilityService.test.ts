// Direct, no-HTTP tests for server/services/dashboardVisibility.ts.
//
// These call the extracted service functions directly - proof the
// extraction from server/routes/dashboard.ts is genuinely decoupled from
// Express (no req/res, no app, no supertest-style handle() call).
//
// HTTP-level behavior for these same endpoints is already covered by
// tests/unit/dashboardGapMatrix.test.ts, dashboardCitationTrend.test.ts, and
// dashboardCitedUrls.test.ts - this file exists to prove the service layer
// itself, not to duplicate that coverage.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeVisibilityScore } from "@shared/visibilityMetrics";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, userId: "user-1", name: "Acme" } as any;

const stubs = vi.hoisted(() => ({
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getMetricsHistory: vi.fn(),
  getWeeklyCitationTrend: vi.fn(),
  getCompetitors: vi.fn(),
  getCompetitorGeoRankingsForCompetitors: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { ...stubs },
}));

const {
  loadRankingsContext,
  getDashboardHero,
  getDashboardRankings,
  getDashboardCitedUrls,
  getDashboardGapMatrix,
  getDashboardCitationTrend,
} = await import("../../server/services/dashboardVisibility");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1", category: "Growth" }]);
  stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  stubs.getMetricsHistory.mockResolvedValue([]);
  stubs.getCompetitors.mockResolvedValue([]);
  stubs.getCompetitorGeoRankingsForCompetitors.mockResolvedValue([]);
});

describe("loadRankingsContext", () => {
  it("defaults to a 30-day window when no since is given", async () => {
    await loadRankingsContext(BRAND_ID);
    const sinceArg = stubs.getGeoRankingsByBrandPromptIds.mock.calls[0]?.[1] as Date | undefined;
    // getGeoRankingsByBrandPromptIds isn't called at all when there are
    // prompts (there is one seeded prompt above), so assert the window
    // passed matches ~30 days.
    expect(sinceArg).toBeInstanceOf(Date);
    const ageMs = Date.now() - (sinceArg as Date).getTime();
    expect(ageMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
  });

  it("honors an explicit `since` override instead of the 30-day default", async () => {
    const since = new Date("2020-01-01T00:00:00Z");
    const ctx = await loadRankingsContext(BRAND_ID, { since });
    expect(ctx.since).toBe(since);
    expect(stubs.getGeoRankingsByBrandPromptIds).toHaveBeenCalledWith(["p1"], since);
  });
});

describe("getDashboardHero", () => {
  it("computes the same visibility score as the canonical formula and a rate-based delta", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        isCited: 1,
        authorityScore: 80,
        rank: 1,
        checkedAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        isCited: 0,
        authorityScore: null,
        rank: null,
        checkedAt: new Date("2026-08-02T00:00:00Z"),
      },
    ]);
    stubs.getMetricsHistory.mockResolvedValue([{ metricValue: "10" }, { metricValue: "20" }]);

    const hero = await getDashboardHero(BRAND, null);

    expect(hero.totalChecks).toBe(2);
    expect(hero.citedChecks).toBe(1);
    expect(hero.citationRate).toBe(50);
    expect(hero.visibilityScore).toBe(computeVisibilityScore(1, 2, 1, 80));
    // prior = history[history.length - 2].metricValue = "10"; currentRate = 50
    expect(hero.visibilityDelta).toBe(40);
    expect(hero.lastScanAt).toEqual(new Date("2026-08-02T00:00:00Z"));
  });
});

describe("getDashboardRankings", () => {
  it("groups rows by platform, drops platforms outside the tracked set, and skips empty platforms", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        aiPlatform: "ChatGPT",
        isCited: 1,
        authorityScore: 90,
        rank: 2,
        checkedAt: new Date("2026-08-01T00:00:00Z"),
        citationContext: null,
        prompt: "best widgets",
      },
      {
        aiPlatform: "SomeUnsupportedEngine",
        isCited: 1,
        authorityScore: 90,
        rank: 1,
        checkedAt: new Date("2026-08-01T00:00:00Z"),
        citationContext: null,
        prompt: "best widgets",
      },
    ]);

    const { platforms } = await getDashboardRankings(BRAND, null);

    expect(platforms).toHaveLength(1);
    expect(platforms[0]).toMatchObject({
      aiPlatform: "ChatGPT",
      citedCount: 1,
      totalCount: 1,
      rank: 2,
    });
  });
});

describe("getDashboardCitedUrls", () => {
  it("dedupes by (platform, prompt, url) and keeps the most recent citedAt", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        isCited: 1,
        aiPlatform: "ChatGPT",
        prompt: "best widgets",
        citingOutletUrl: "https://example.com/a",
        checkedAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        isCited: 1,
        aiPlatform: "ChatGPT",
        prompt: "best widgets",
        citingOutletUrl: "https://example.com/a",
        checkedAt: new Date("2026-08-05T00:00:00Z"),
      },
      // Cited but with no attributed outlet - contributes nothing.
      {
        isCited: 1,
        aiPlatform: "ChatGPT",
        prompt: "best widgets",
        citingOutletUrl: null,
        checkedAt: new Date("2026-08-06T00:00:00Z"),
      },
    ]);

    const result = await getDashboardCitedUrls(BRAND, null);

    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        url: "https://example.com/a",
        citedAt: new Date("2026-08-05T00:00:00Z"),
      }),
    ]);
  });
});

describe("getDashboardGapMatrix", () => {
  it("marks the brand row partial when only some rankings in a category are cited", async () => {
    stubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      { brandPromptId: "p1", isCited: 1 },
      { brandPromptId: "p1", isCited: 0 },
    ]);

    const { categories, rows } = await getDashboardGapMatrix(BRAND, null);

    expect(categories).toEqual(["Growth"]);
    const brandRow = rows.find((r) => r.entityType === "brand");
    expect(brandRow?.cells).toEqual({ Growth: "partial" });
  });
});

describe("getDashboardCitationTrend", () => {
  it("zero-fills weeks that have no data and computes citationRate per week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));
    stubs.getWeeklyCitationTrend.mockResolvedValue([
      { weekStart: "2026-08-24", total: 4, cited: 2 },
    ]);

    const { weeks } = await getDashboardCitationTrend(BRAND_ID);

    expect(weeks).toHaveLength(8);
    const lastWeek = weeks[weeks.length - 1];
    expect(lastWeek).toEqual({
      weekStart: "2026-08-24",
      cited: 2,
      total: 4,
      citationRate: 50,
    });
    expect(weeks[0]).toEqual({ weekStart: "2026-07-06", cited: 0, total: 0, citationRate: 0 });
    vi.useRealTimers();
  });
});
