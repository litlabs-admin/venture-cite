// The weekly gate on brand activation.
//
// The behaviour that matters here is not "does it call the scanners" - it is
// WHEN it declines to, because every one of these producers spends money. A
// gate that fails open re-runs five LLM jobs per brand on every hourly tick.

import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  getSystemState: vi.fn(),
  setSystemState: vi.fn(async () => undefined),
  createScanJob: vi.fn(async () => ({ id: "scan-1" })),
  runMentionScan: vi.fn(async () => undefined),
  scanBrandListicles: vi.fn(async () => ({})),
  runPerceptionScoring: vi.fn(async () => null),
  discoverCompetitors: vi.fn(async () => 0),
  warmSiteHealth: vi.fn(async () => undefined),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: stubs.getBrandById,
    getSystemState: stubs.getSystemState,
    setSystemState: stubs.setSystemState,
    createScanJob: stubs.createScanJob,
  },
}));
vi.mock("../../server/db", () => ({
  db: { execute: vi.fn(async () => ({ rows: [] })) },
  pool: {},
}));
vi.mock("../../server/lib/runMentionScan", () => ({ runMentionScan: stubs.runMentionScan }));
vi.mock("../../server/lib/listicleScanner", () => ({
  scanBrandListicles: stubs.scanBrandListicles,
}));
vi.mock("../../server/lib/perceptionRun", () => ({
  runPerceptionScoring: stubs.runPerceptionScoring,
  getLastPerceptionRunAt: vi.fn(async () => null),
}));
vi.mock("../../server/lib/competitorDiscovery", () => ({
  discoverCompetitors: stubs.discoverCompetitors,
}));
vi.mock("../../server/routes/dashboard", () => ({ warmSiteHealth: stubs.warmSiteHealth }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { populateBrandDashboard } = await import("../../server/lib/brandActivation");

const BRAND = { id: "b1", name: "Acme", website: "https://acme.com", userId: "u1" };
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  for (const fn of Object.values(stubs)) fn.mockClear();
  stubs.getBrandById.mockResolvedValue(BRAND);
  stubs.getSystemState.mockResolvedValue(null);
});

describe("populateBrandDashboard", () => {
  it("runs every producer for a brand with no ledger", async () => {
    const { ran } = await populateBrandDashboard("b1");

    expect(ran).toEqual(["siteHealth", "mentionScan", "listicleScan", "perception", "competitors"]);
    expect(stubs.warmSiteHealth).toHaveBeenCalledWith("b1", "https://acme.com");
    expect(stubs.runMentionScan).toHaveBeenCalledWith("scan-1");
    expect(stubs.scanBrandListicles).toHaveBeenCalledWith("b1");
    expect(stubs.runPerceptionScoring).toHaveBeenCalled();
    expect(stubs.discoverCompetitors).toHaveBeenCalledWith("b1");
  });

  it("runs nothing when every producer ran in the last week", async () => {
    const yesterday = new Date(Date.now() - DAY_MS).toISOString();
    stubs.getSystemState.mockResolvedValue({
      siteHealth: yesterday,
      mentionScan: yesterday,
      listicleScan: yesterday,
      perception: yesterday,
      competitors: yesterday,
    });

    const { ran } = await populateBrandDashboard("b1");

    expect(ran).toEqual([]);
    expect(stubs.runPerceptionScoring).not.toHaveBeenCalled();
    expect(stubs.discoverCompetitors).not.toHaveBeenCalled();
    // Nothing ran, so nothing should have been re-stamped either.
    expect(stubs.setSystemState).not.toHaveBeenCalled();
  });

  it("runs only the producers that have aged past a week", async () => {
    const yesterday = new Date(Date.now() - DAY_MS).toISOString();
    const lastMonth = new Date(Date.now() - 30 * DAY_MS).toISOString();
    stubs.getSystemState.mockResolvedValue({
      siteHealth: yesterday,
      mentionScan: lastMonth,
      listicleScan: yesterday,
      perception: lastMonth,
      competitors: yesterday,
    });

    const { ran } = await populateBrandDashboard("b1");

    expect(ran).toEqual(["mentionScan", "perception"]);
  });

  it("stamps a failing producer so it backs off for a week instead of retrying hourly", async () => {
    stubs.scanBrandListicles.mockRejectedValueOnce(new Error("openrouter down"));

    const { ran } = await populateBrandDashboard("b1");

    // The failure is absorbed - the other producers still ran.
    expect(ran).toContain("perception");
    expect(ran).not.toContain("listicleScan");
    // ...but the ledger records the ATTEMPT, which is what prevents an hourly
    // retry loop against a producer that is failing for a reason an hour will
    // not change.
    const written = stubs.setSystemState.mock.calls.at(-1)?.[1] as Record<string, string>;
    expect(written.listicleScan).toBeTruthy();
  });

  it("leaves undone producers unstamped when the deadline expires", async () => {
    // Already past: nothing should run, and crucially nothing should be
    // stamped, or the skipped work would not be due again for a week.
    const { ran, skipped } = await populateBrandDashboard("b1", { deadlineMs: Date.now() - 1 });

    expect(ran).toEqual([]);
    expect(skipped).toHaveLength(5);
    expect(stubs.setSystemState).not.toHaveBeenCalled();
  });

  it("does not throw when the brand is gone", async () => {
    stubs.getBrandById.mockResolvedValue(undefined);
    await expect(populateBrandDashboard("missing")).resolves.toEqual({ ran: [], skipped: [] });
  });
});
