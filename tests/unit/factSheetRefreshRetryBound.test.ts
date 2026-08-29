// Regression tests for the unbounded-retry defect in findStaleBrands
// (server/lib/factAgent/v2/runFactSheetRefresh.ts, .audit/B6/B6a-07): a brand
// whose site is permanently unreachable never produces a 'completed' run, so
// the old staleness query ("no completed run, or last one is stale") stayed
// true for it forever and it was re-selected - and given a full six-source
// re-scrape - on every single tick, without end.
//
// The fix mirrors AUTOPILOT_MAX_ATTEMPTS / AUTOPILOT_RETRY_BACKOFF_MINUTES in
// onboardingAutopilot.ts: a small cap on consecutive terminal-'failed' runs,
// plus a backoff between attempts below that cap, computed from the
// `recent_runs` history the query now attaches to each candidate row.
//
// isRetryEligible is pure and covers the decision logic directly. The
// findStaleBrands tests below (mocked db.execute, following the pattern in
// tests/unit/v2FactSheetRefresh.test.ts and
// tests/unit/onboardingAutopilotResumeLoop.test.ts) cover the wiring: that
// rows are actually filtered by the gate, that the cap exclusion is logged,
// and that MAX_BRANDS_PER_TICK is still honoured after filtering.

import { describe, it, expect, vi, beforeEach } from "vitest";

const stubs = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: stubs.loggerInfo, warn: stubs.loggerWarn, error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/factAgent/v2/runFullScrape", () => ({
  runFullScrapeForBrand: vi.fn(),
}));

vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({
  cronStepBudget: () => 30_000,
}));

import {
  findStaleBrands,
  isRetryEligible,
  FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES,
  FACT_SCRAPE_RETRY_BACKOFF_HOURS,
  type RecentRunSummary,
} from "../../server/lib/factAgent/v2/runFactSheetRefresh";

function brandRow(id: string, recentRuns: RecentRunSummary[] | null) {
  return {
    id,
    name: `brand-${id}`,
    website: "https://example.com",
    industry: null,
    description: null,
    products_raw: [],
    target_audience: null,
    unique_selling_points_raw: [],
    key_values_raw: null,
    brand_voice: null,
    tone: null,
    recent_runs: recentRuns
      ? recentRuns.map((r) => ({ status: r.status, hours_since_started: r.hoursSinceStarted }))
      : null,
  };
}

describe("isRetryEligible (pure gate logic)", () => {
  it("excludes a brand whose most recent runs are all failures at the cap", () => {
    // Cap is FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES consecutive 'failed' runs,
    // most-recent-first. All failed, however long ago, still hits the cap -
    // the cap is a hard stop, not something a backoff window clears.
    const recentRuns: RecentRunSummary[] = Array.from(
      { length: FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES },
      () => ({ status: "failed", hoursSinceStarted: 1000 }),
    );

    const gate = isRetryEligible(recentRuns);

    expect(gate.eligible).toBe(false);
    expect(gate.reason).toBe("cap");
  });

  it("includes a brand with no run history at all (never attempted)", () => {
    const gate = isRetryEligible([]);

    expect(gate.eligible).toBe(true);
  });

  it("excludes a brand below the cap whose last failure is still inside the backoff window", () => {
    const recentRuns: RecentRunSummary[] = [
      { status: "failed", hoursSinceStarted: FACT_SCRAPE_RETRY_BACKOFF_HOURS / 2 },
    ];

    const gate = isRetryEligible(recentRuns);

    expect(gate.eligible).toBe(false);
    expect(gate.reason).toBe("backoff");
  });

  it("is unaffected when the most recent run succeeded, even after prior failures", () => {
    const recentRuns: RecentRunSummary[] = [
      { status: "completed", hoursSinceStarted: 0.5 },
      { status: "failed", hoursSinceStarted: 10 },
      { status: "failed", hoursSinceStarted: 20 },
    ];

    const gate = isRetryEligible(recentRuns);

    expect(gate.eligible).toBe(true);
  });

  it("allows a retry once the backoff window has fully elapsed, below the cap", () => {
    const recentRuns: RecentRunSummary[] = [
      { status: "failed", hoursSinceStarted: FACT_SCRAPE_RETRY_BACKOFF_HOURS + 1 },
    ];

    const gate = isRetryEligible(recentRuns);

    expect(gate.eligible).toBe(true);
  });
});

describe("findStaleBrands (wiring: query rows through the retry gate)", () => {
  beforeEach(() => {
    stubs.dbExecute.mockReset();
    stubs.loggerWarn.mockReset();
    stubs.loggerInfo.mockReset();
  });

  it("excludes a brand past the consecutive-failure cap and logs it", async () => {
    const capped = brandRow(
      "brand-capped",
      Array.from({ length: FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES }, () => ({
        status: "failed",
        hoursSinceStarted: 500,
      })),
    );
    const healthy = brandRow("brand-never-attempted", []);
    stubs.dbExecute.mockResolvedValueOnce({ rows: [capped, healthy] });

    const result = await findStaleBrands(3);

    expect(result.map((b) => b.id)).toEqual(["brand-never-attempted"]);
    expect(stubs.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ brandIds: ["brand-capped"] }),
      expect.stringContaining("excluded from cron refresh"),
    );
  });

  it("includes a brand that has never been attempted", async () => {
    const neverAttempted = brandRow("brand-fresh", []);
    stubs.dbExecute.mockResolvedValueOnce({ rows: [neverAttempted] });

    const result = await findStaleBrands(3);

    expect(result.map((b) => b.id)).toEqual(["brand-fresh"]);
    expect(stubs.loggerWarn).not.toHaveBeenCalled();
  });

  it("excludes a brand inside the backoff window without logging it as a cap exclusion", async () => {
    const inBackoff = brandRow("brand-backoff", [{ status: "failed", hoursSinceStarted: 1 }]);
    stubs.dbExecute.mockResolvedValueOnce({ rows: [inBackoff] });

    const result = await findStaleBrands(3);

    expect(result).toEqual([]);
    // Backoff exclusions are the ordinary, expected wait between retries -
    // only cap exclusions (which stop automatic retries entirely) are logged.
    expect(stubs.loggerWarn).not.toHaveBeenCalled();
  });

  it("keeps a brand whose last run succeeded, unaffected by its scrape history", async () => {
    const healthyBrand = brandRow("brand-healthy", [{ status: "completed", hoursSinceStarted: 2 }]);
    stubs.dbExecute.mockResolvedValueOnce({ rows: [healthyBrand] });

    const result = await findStaleBrands(3);

    expect(result.map((b) => b.id)).toEqual(["brand-healthy"]);
  });

  it("still trims to the requested limit after filtering", async () => {
    const rows = [
      brandRow("brand-a", []),
      brandRow("brand-b", []),
      brandRow("brand-c", []),
      brandRow("brand-d", []),
    ];
    stubs.dbExecute.mockResolvedValueOnce({ rows });

    const result = await findStaleBrands(2);

    expect(result.map((b) => b.id)).toEqual(["brand-a", "brand-b"]);
  });
});
