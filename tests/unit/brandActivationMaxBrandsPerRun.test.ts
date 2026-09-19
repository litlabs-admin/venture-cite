// BRAND_ACTIVATION_MAX_BRANDS_PER_RUN caps how many brands one tick of the
// brand activation sweep processes. The sweep's query selects every paying
// brand unconditionally (per-job "is it due" is decided per brand inside
// populateBrandDashboard's ledger) - a brand that has never run any job has
// all five producers due at once, each spending model calls, so an unbounded
// tick bursts that spend across however many such brands exist. The query is
// already ordered by created_at ASC, so the cap just takes the
// oldest-created brands first; the rest are left for the next hourly tick.
//
// The env parsing itself (default 5, invalid falls back to 5) is covered by
// tests/unit/envNumber.test.ts against the shared positiveIntEnv helper,
// without needing to import this module's dependency graph.

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.BRAND_ACTIVATION_MAX_BRANDS_PER_RUN = "5";

const stubs = vi.hoisted(() => ({
  execute: vi.fn(),
  getBrandById: vi.fn(async () => null),
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.execute },
  pool: {},
}));
vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: stubs.getBrandById,
    getSystemState: vi.fn(async () => null),
    setSystemState: vi.fn(async () => undefined),
    createScanJob: vi.fn(async () => ({ id: "scan-1" })),
  },
}));
vi.mock("../../server/lib/runMentionScan", () => ({
  runMentionScan: vi.fn(async () => undefined),
}));
vi.mock("../../server/lib/listicleScanner", () => ({
  scanBrandListicles: vi.fn(async () => ({})),
}));
vi.mock("../../server/lib/perceptionRun", () => ({
  runPerceptionScoring: vi.fn(async () => null),
  getLastPerceptionRunAt: vi.fn(async () => null),
}));
vi.mock("../../server/lib/competitorDiscovery", () => ({
  discoverCompetitors: vi.fn(async () => 0),
}));
vi.mock("../../server/routes/dashboard", () => ({ warmSiteHealth: vi.fn(async () => undefined) }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { runBrandActivationSweep } = await import("../../server/lib/brandActivation");

function brandRow(id: string) {
  return { id };
}

beforeEach(() => {
  stubs.execute.mockReset();
  stubs.getBrandById.mockClear();
  // populateBrandDashboard bails out early (brand not found) for every
  // brand id - this test only needs to see WHICH brands runBrandActivation-
  // Sweep attempts, not what each producer does.
  stubs.getBrandById.mockImplementation(async () => null);
});

describe("BRAND_ACTIVATION_MAX_BRANDS_PER_RUN", () => {
  it("processes only the cap, in query order, and defers the rest", async () => {
    // The query is already ORDER BY created_at ASC, so rows arrive in that
    // order - 12 due brands, cap 5 (set above).
    const rows = Array.from({ length: 12 }, (_, i) => brandRow(`b${i}`));
    stubs.execute.mockResolvedValue({ rows });

    const result = await runBrandActivationSweep();

    expect(stubs.getBrandById.mock.calls.map((call) => call[0])).toEqual([
      "b0",
      "b1",
      "b2",
      "b3",
      "b4",
    ]);
    expect(result).toEqual({ processed: 5, total: 5 });
  });
});
