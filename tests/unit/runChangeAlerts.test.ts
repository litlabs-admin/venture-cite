// server/lib/runChangeAlerts.ts had ZERO test coverage before this file
// (see .audit/B6/B6b-03-mutation-metrics.md section 1.1). storage is a pure
// data source here - detectRunChangeAlerts only reads via
// getMetricsHistory / getBrandHallucinations, and recordRunChangeAlerts adds
// one write via createAlertHistory - so a fake storage object is enough;
// no database needed.
//
// Boundary choices throughout this file are deliberate: every value is
// picked so that the mutation named in the audit report changes the
// outcome, not just so the arithmetic is easy.

import { describe, it, expect, vi, beforeEach } from "vitest";

const getMetricsHistory = vi.fn();
const getBrandHallucinations = vi.fn();
const createAlertHistory = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getMetricsHistory: (...args: unknown[]) => getMetricsHistory(...args),
    getBrandHallucinations: (...args: unknown[]) => getBrandHallucinations(...args),
    createAlertHistory: (...args: unknown[]) => createAlertHistory(...args),
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { detectRunChangeAlerts, recordRunChangeAlerts } =
  await import("../../server/lib/runChangeAlerts");

type ByPrompt = { promptId: string; cited: number; checks: number };

function visRow(metricValue: number, byPrompt: ByPrompt[] = []) {
  return { metricValue: String(metricValue), metricDetails: { byPrompt } };
}

function hallRow(metricValue: number) {
  return { metricValue: String(metricValue), metricDetails: null };
}

describe("detectRunChangeAlerts", () => {
  beforeEach(() => {
    getMetricsHistory.mockReset();
    getBrandHallucinations.mockReset();
    createAlertHistory.mockReset();
  });

  describe("visibility_drop", () => {
    it("returns [] with fewer than 2 visibility snapshots (first run for a brand)", async () => {
      getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
        Promise.resolve(metricType === "visibility_score" ? [visRow(80)] : []),
      );
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts).toEqual([]);
    });

    it("fires exactly AT the -10pt boundary (delta === -10)", async () => {
      // Chosen so a `<=` -> `<` mutation on the boundary changes the
      // outcome: -10 must fire under `<=` but would NOT fire under `<`.
      getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
        Promise.resolve(metricType === "visibility_score" ? [visRow(80), visRow(70)] : []),
      );
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      const drop = alerts.find((a) => a.alertType === "visibility_drop");
      expect(drop).toBeDefined();
      expect(drop!.details).toMatchObject({ priorScore: 80, currentScore: 70, delta: -10 });
      expect(drop!.message).toContain("dropped 10 pts");
    });

    it("does NOT fire one point short of the boundary (delta === -9)", async () => {
      // Same boundary, opposite side: if this test used -20 instead, both
      // `<=` and `<` would agree and the mutation would survive.
      getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
        Promise.resolve(metricType === "visibility_score" ? [visRow(80), visRow(71)] : []),
      );
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts.find((a) => a.alertType === "visibility_drop")).toBeUndefined();
    });
  });

  describe("prompts_lost", () => {
    it("flags a prompt that went from cited to fully uncited", async () => {
      const prior = visRow(50, [{ promptId: "p1", cited: 3, checks: 5 }]);
      const current = visRow(50, [{ promptId: "p1", cited: 0, checks: 5 }]);
      getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
        Promise.resolve(metricType === "visibility_score" ? [prior, current] : []),
      );
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      const lost = alerts.find((a) => a.alertType === "prompts_lost");
      expect(lost).toBeDefined();
      expect(lost!.details).toMatchObject({ promptIds: ["p1"], count: 1 });
    });

    it("does NOT flag a prompt that merely declined (3 cited -> 1 cited, not zero)", async () => {
      // Distinguishes the real guard (`was.cited > 0 && cur.cited === 0`)
      // from the named mutation `cur.cited < was.cited`, which would also
      // fire here. A decline to zero and a decline to nonzero must produce
      // different outcomes for this test to mean anything.
      const prior = visRow(50, [{ promptId: "p1", cited: 3, checks: 5 }]);
      const current = visRow(50, [{ promptId: "p1", cited: 1, checks: 5 }]);
      getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
        Promise.resolve(metricType === "visibility_score" ? [prior, current] : []),
      );
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts.find((a) => a.alertType === "prompts_lost")).toBeUndefined();
    });

    it("does not flag a prompt that was never cited to begin with (was.cited === 0)", async () => {
      const prior = visRow(50, [{ promptId: "p1", cited: 0, checks: 5 }]);
      const current = visRow(50, [{ promptId: "p1", cited: 0, checks: 5 }]);
      getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
        Promise.resolve(metricType === "visibility_score" ? [prior, current] : []),
      );
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts.find((a) => a.alertType === "prompts_lost")).toBeUndefined();
    });
  });

  describe("new_hallucinations", () => {
    // A stable, unchanged visibility_score pair (two identical scores, no
    // byPrompt data) so these tests exercise ONLY the hallucination branch.
    // detectRunChangeAlerts returns early with `vis.length < 2`, so every
    // case here still needs 2 visibility snapshots to get past that guard.
    const stableVis = () => Promise.resolve([visRow(50), visRow(50)]);

    it("alerts for the delta between live unresolved count and this run's snapshot", async () => {
      // snapshot=5 (written by recordCurrentMetrics BEFORE detection ran),
      // live=8 (after detection added 3 more) -> added=3. This also rules
      // out the sign-flip mutation (thisRunSnapshot - liveUnresolved would
      // be -3, and `added > 0` would never fire).
      getMetricsHistory.mockImplementation((_b: string, metricType: string) => {
        if (metricType === "visibility_score") return stableVis();
        if (metricType === "hallucinations") return Promise.resolve([hallRow(5)]);
        return Promise.resolve([]);
      });
      getBrandHallucinations.mockResolvedValue(new Array(8).fill({}));

      const alerts = await detectRunChangeAlerts("brand-1");
      const hall = alerts.find((a) => a.alertType === "new_hallucinations");
      expect(hall).toBeDefined();
      expect(hall!.details).toMatchObject({ added: 3, openTotal: 8 });
      expect(hall!.message).toContain("3 new unresolved hallucination");
    });

    it("does not alert when live count equals the snapshot (added === 0)", async () => {
      // Chosen to also catch a widened `added >= 0` mutation, which would
      // fire on this exact-zero case where the real `added > 0` guard must
      // not.
      getMetricsHistory.mockImplementation((_b: string, metricType: string) => {
        if (metricType === "visibility_score") return stableVis();
        if (metricType === "hallucinations") return Promise.resolve([hallRow(8)]);
        return Promise.resolve([]);
      });
      getBrandHallucinations.mockResolvedValue(new Array(8).fill({}));

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts.find((a) => a.alertType === "new_hallucinations")).toBeUndefined();
    });

    it("ordering regression: a snapshot taken AFTER detection (instead of before) hides real new hallucinations", async () => {
      // This documents the load-bearing ordering called out in the module
      // comment: recordCurrentMetrics must snapshot BEFORE
      // detectHallucinationsForRun runs, so `live - snapshot` isolates
      // what THIS run added. If the snapshot were taken after detection
      // (as it would be if that ordering were ever swapped), the snapshot
      // would already include this run's new hallucinations, so
      // live === snapshot and no alert would fire even though 3
      // hallucinations were in fact newly detected this run.
      getMetricsHistory.mockImplementation((_b: string, metricType: string) => {
        if (metricType === "visibility_score") return stableVis();
        if (metricType === "hallucinations") return Promise.resolve([hallRow(8)]);
        return Promise.resolve([]);
      });
      getBrandHallucinations.mockResolvedValue(new Array(8).fill({}));

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts.find((a) => a.alertType === "new_hallucinations")).toBeUndefined();
    });

    it("skips the hallucination check entirely when there is no snapshot yet", async () => {
      getMetricsHistory.mockImplementation((_b: string, metricType: string) => {
        if (metricType === "visibility_score") return stableVis();
        if (metricType === "hallucinations") return Promise.resolve([]);
        return Promise.resolve([]);
      });
      getBrandHallucinations.mockResolvedValue([]);

      const alerts = await detectRunChangeAlerts("brand-1");
      expect(alerts.find((a) => a.alertType === "new_hallucinations")).toBeUndefined();
      expect(getBrandHallucinations).not.toHaveBeenCalled();
    });
  });

  it("can raise all three alert types from a single run", async () => {
    const prior = visRow(80, [{ promptId: "p1", cited: 2, checks: 4 }]);
    const current = visRow(65, [{ promptId: "p1", cited: 0, checks: 4 }]);
    getMetricsHistory.mockImplementation((_b: string, metricType: string) => {
      if (metricType === "visibility_score") return Promise.resolve([prior, current]);
      if (metricType === "hallucinations") return Promise.resolve([hallRow(2)]);
      return Promise.resolve([]);
    });
    getBrandHallucinations.mockResolvedValue(new Array(5).fill({}));

    const alerts = await detectRunChangeAlerts("brand-1");
    const types = alerts.map((a) => a.alertType).sort();
    expect(types).toEqual(["new_hallucinations", "prompts_lost", "visibility_drop"]);
  });
});

describe("recordRunChangeAlerts", () => {
  beforeEach(() => {
    getMetricsHistory.mockReset();
    getBrandHallucinations.mockReset();
    createAlertHistory.mockReset();
  });

  it("persists one alert_history row per detected alert and returns them", async () => {
    const prior = visRow(80);
    const current = visRow(65);
    getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
      Promise.resolve(metricType === "visibility_score" ? [prior, current] : []),
    );
    getBrandHallucinations.mockResolvedValue([]);
    createAlertHistory.mockResolvedValue({ id: "alert-1" });

    const alerts = await recordRunChangeAlerts("brand-9");

    expect(alerts).toHaveLength(1);
    expect(createAlertHistory).toHaveBeenCalledTimes(1);
    expect(createAlertHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-9",
        alertType: "visibility_drop",
        sentVia: "in_app",
      }),
    );
  });

  it("still returns the detected alerts even when persisting one fails", async () => {
    const prior = visRow(80);
    const current = visRow(65);
    getMetricsHistory.mockImplementation((_b: string, metricType: string) =>
      Promise.resolve(metricType === "visibility_score" ? [prior, current] : []),
    );
    getBrandHallucinations.mockResolvedValue([]);
    createAlertHistory.mockRejectedValue(new Error("db unavailable"));

    const alerts = await recordRunChangeAlerts("brand-9");

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe("visibility_drop");
  });

  it("writes nothing and returns [] when there is nothing to report", async () => {
    getMetricsHistory.mockResolvedValue([]);
    getBrandHallucinations.mockResolvedValue([]);

    const alerts = await recordRunChangeAlerts("brand-9");

    expect(alerts).toEqual([]);
    expect(createAlertHistory).not.toHaveBeenCalled();
  });
});
