// Direct, no-HTTP tests for server/services/factSheetV2Pipeline.ts (phase
// B7-16 service extraction). HTTP-level behavior for /plan and /aggregate is
// already covered by tests/unit/v2PlanRoute.test.ts and
// v2AggregateRoute.test.ts (there is no existing route test for
// /full-rescrape); this file proves the extracted orchestration functions
// themselves can be called without an Express app, request, or response.

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getInFlightScrapeRun: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
  getMonthlyCostCap: vi.fn(),
  createScrapeRun: vi.fn(),
  createScrapePage: vi.fn(),
}));
vi.mock("../../server/storage", () => ({ storage: storageMock }));

const discoverSitemapUrlsMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: discoverSitemapUrlsMock,
}));

const runAggregateMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/aggregate", () => ({ runAggregate: runAggregateMock }));

const runFullScrapeForBrandMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/runFullScrape", () => ({
  runFullScrapeForBrand: runFullScrapeForBrandMock,
}));

const waitUntilMock = vi.hoisted(() => vi.fn());
vi.mock("@vercel/functions", () => ({ waitUntil: waitUntilMock }));

const captureAndFlushMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: captureAndFlushMock }));

const brand = {
  id: "brand-1",
  name: "Acme",
  website: "https://example.com",
  industry: "saas",
  description: null,
  products: null,
  targetAudience: null,
  uniqueSellingPoints: null,
  keyValues: null,
  brandVoice: null,
  tone: null,
  factScrapeEnabled: true,
} as any;

const {
  evaluateFactSheetRunGuards,
  createFactSheetPlan,
  startFactSheetFullRescrape,
  aggregateFactSheetRun,
} = await import("../../server/services/factSheetV2Pipeline");

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getInFlightScrapeRun.mockResolvedValue(null);
  storageMock.getLastCompletedScrapeRunAt.mockResolvedValue(null);
  storageMock.getMonthlyCostCap.mockResolvedValue(null);
});

describe("evaluateFactSheetRunGuards", () => {
  it("allows the run when nothing is in flight, cooling down, or over cap", async () => {
    const verdict = await evaluateFactSheetRunGuards(brand);
    expect(verdict).toEqual({ ok: true });
  });

  it("rejects with already_running when a run is in flight", async () => {
    storageMock.getInFlightScrapeRun.mockResolvedValue({ id: "existing-run" });
    const verdict = await evaluateFactSheetRunGuards(brand);
    expect(verdict).toEqual(
      expect.objectContaining({ ok: false, code: "already_running", runId: "existing-run" }),
    );
  });

  it("rejects with paused when the brand disabled fact scraping", async () => {
    const verdict = await evaluateFactSheetRunGuards({ ...brand, factScrapeEnabled: false });
    expect(verdict).toEqual(expect.objectContaining({ ok: false, code: "paused" }));
  });

  it("rejects with cost_cap_reached once monthly spend hits the cap", async () => {
    storageMock.getMonthlyCostCap.mockResolvedValue({ factScrapeCents: 500, monthlyCapCents: 500 });
    const verdict = await evaluateFactSheetRunGuards(brand);
    expect(verdict).toEqual(expect.objectContaining({ ok: false, code: "cost_cap_reached" }));
  });
});

describe("createFactSheetPlan", () => {
  it("creates a run, dedupes canonical URLs, and returns the page list", async () => {
    discoverSitemapUrlsMock.mockResolvedValue([
      "https://example.com/about",
      "https://example.com/about?utm_source=x", // same canonical as /about
      "https://example.com/pricing",
    ]);
    storageMock.createScrapeRun.mockResolvedValue({ id: "run-new" });
    storageMock.createScrapePage.mockImplementation(async (p: Record<string, unknown>) => ({
      id: `page-${(p as any).url}`,
      ...p,
    }));

    const result = await createFactSheetPlan({
      brandId: "brand-1",
      normalizedWebsite: "https://example.com/",
      triggeredBy: "user_rescrape",
    });

    expect(storageMock.createScrapeRun).toHaveBeenCalledWith({
      brandId: "brand-1",
      status: "pending",
      triggeredBy: "user_rescrape",
    });
    expect(result.runId).toBe("run-new");
    // The utm-tagged duplicate is deduped by canonical URL.
    expect(storageMock.createScrapePage).toHaveBeenCalledTimes(result.pages.length);
    expect(result.pages.map((p) => p.url)).not.toContain("https://example.com/about?utm_source=x");
  });
});

describe("startFactSheetFullRescrape", () => {
  it("dynamically imports the pipeline and hands waitUntil the run promise", async () => {
    runFullScrapeForBrandMock.mockResolvedValue({ ran: true, runId: "run-new" });

    await startFactSheetFullRescrape(brand);

    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    expect(runFullScrapeForBrandMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "brand-1", website: "https://example.com" }),
      expect.any(Number),
      "manual_rescrape",
    );
  });

  it("normalizes null array fields to [] and reports pipeline failures to Sentry, not the caller", async () => {
    runFullScrapeForBrandMock.mockRejectedValue(new Error("boom"));

    await expect(
      startFactSheetFullRescrape({ ...brand, products: null, uniqueSellingPoints: null }),
    ).resolves.toBeUndefined();

    expect(runFullScrapeForBrandMock).toHaveBeenCalledWith(
      expect.objectContaining({ products: [], uniqueSellingPoints: [] }),
      expect.any(Number),
      "manual_rescrape",
    );

    // The rejection is attached to the waitUntil'd promise's .catch, not
    // thrown back at startFactSheetFullRescrape's caller.
    const handed = waitUntilMock.mock.calls[0][0] as Promise<unknown>;
    await handed;
    expect(captureAndFlushMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "factSheetV2.full-rescrape" } }),
    );
  });
});

describe("aggregateFactSheetRun", () => {
  it("shapes runAggregate's result for the route", async () => {
    runAggregateMock.mockResolvedValue({
      status: "completed",
      errorKind: null,
      totalFacts: 5,
      disagreementsIncremented: 1,
    });
    const result = await aggregateFactSheetRun({ runId: "run-1", brandId: "brand-1" });
    expect(runAggregateMock).toHaveBeenCalledWith({ runId: "run-1", brandId: "brand-1" });
    expect(result).toEqual({
      status: "completed",
      errorKind: null,
      totalFacts: 5,
      disagreementsIncremented: 1,
    });
  });
});
