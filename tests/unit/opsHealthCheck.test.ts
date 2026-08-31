// Operational health check: provider spend, outbox staleness, overdue
// scheduled jobs, stuck citation runs. See server/lib/opsHealthCheck.ts for
// the incident history and threshold reasoning behind each condition.
//
// The module takes its DB/state dependencies as an injectable `deps`
// parameter (defaulting to the real pool/storage), so these tests drive it
// directly rather than mocking module-level imports - matching how
// citationReconciliation.test.ts mocks pool.query, but keeping the query
// results scoped per-test via the deps override instead of module mocks.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { loggerMock, captureAndFlushMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  captureAndFlushMock: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock("../../server/lib/logger", () => ({ logger: loggerMock }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: captureAndFlushMock }));
vi.mock("../../server/storage", () => ({
  storage: { getSystemState: vi.fn(async () => null) },
}));

import { runOpsHealthCheck } from "../../server/lib/opsHealthCheck";

const NOW = new Date("2026-08-31T12:00:00Z").getTime();

/** A query mock that returns empty/zero rows for every table this module reads. */
function quietDb() {
  return {
    query: vi.fn(async (text: string) => {
      if (text.includes("api_costs")) return { rows: [{ total_cents: 0, row_count: 0 }] };
      if (text.includes("outbox_commands")) {
        return {
          rows: [
            {
              never_claimed_count: 0,
              never_claimed_oldest: null,
              stuck_pending_count: 0,
              stuck_pending_oldest: null,
            },
          ],
        };
      }
      if (text.includes("citation_runs")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

function baseDeps(overrides: Partial<Parameters<typeof runOpsHealthCheck>[0]> = {}) {
  return {
    db: quietDb(),
    getSystemState: vi.fn(async (key: string) => {
      // Both tracked jobs "just ran" by default so the overdue check is quiet.
      if (key.startsWith("job:")) return { lastRanAt: new Date(NOW - 60_000).toISOString() };
      return null;
    }),
    now: () => NOW,
    ...overrides,
  };
}

beforeEach(() => {
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
  captureAndFlushMock.mockClear();
});

describe("runOpsHealthCheck", () => {
  it("reports no alerts when every condition is healthy", async () => {
    const result = await runOpsHealthCheck(baseDeps());
    expect(result.alerts).toEqual([]);
    expect(captureAndFlushMock).not.toHaveBeenCalled();
  });

  describe("provider spend", () => {
    it("does not fire at or under the threshold", async () => {
      const db = quietDb();
      db.query = vi.fn(async (text: string) => {
        if (text.includes("api_costs")) return { rows: [{ total_cents: 1000, row_count: 5 }] };
        return { rows: [] };
      });
      const result = await runOpsHealthCheck(baseDeps({ db }));
      expect(result.alerts.filter((a) => a.kind === "provider_spend_over_threshold")).toEqual([]);
    });

    it("fires when 1-hour spend exceeds the threshold", async () => {
      const db = quietDb();
      db.query = vi.fn(async (text: string) => {
        if (text.includes("api_costs")) return { rows: [{ total_cents: 1500, row_count: 12 }] };
        if (text.includes("outbox_commands")) {
          return {
            rows: [
              {
                never_claimed_count: 0,
                never_claimed_oldest: null,
                stuck_pending_count: 0,
                stuck_pending_oldest: null,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const result = await runOpsHealthCheck(baseDeps({ db }));
      const alert = result.alerts.find((a) => a.kind === "provider_spend_over_threshold");
      expect(alert).toBeDefined();
      expect(alert!.measured.totalCents).toBe(1500);
      expect(alert!.threshold.thresholdCents).toBe(1000);
      expect(captureAndFlushMock).toHaveBeenCalled();
    });
  });

  describe("outbox commands stuck", () => {
    it("does not fire when nothing is stuck", async () => {
      const result = await runOpsHealthCheck(baseDeps());
      expect(result.alerts.filter((a) => a.kind === "outbox_commands_stuck")).toEqual([]);
    });

    it("fires when commands sat pending with attempt_count = 0 past the never-claimed threshold", async () => {
      const db = quietDb();
      db.query = vi.fn(async (text: string) => {
        if (text.includes("api_costs")) return { rows: [{ total_cents: 0, row_count: 0 }] };
        if (text.includes("outbox_commands")) {
          return {
            rows: [
              {
                never_claimed_count: 3,
                never_claimed_oldest: new Date(NOW - 8 * 24 * 60 * 60 * 1000),
                stuck_pending_count: 3,
                stuck_pending_oldest: new Date(NOW - 8 * 24 * 60 * 60 * 1000),
              },
            ],
          };
        }
        return { rows: [] };
      });
      const result = await runOpsHealthCheck(baseDeps({ db }));
      const alert = result.alerts.find((a) => a.kind === "outbox_commands_stuck");
      expect(alert).toBeDefined();
      expect(alert!.measured.neverClaimedCount).toBe(3);
    });
  });

  describe("overdue scheduled jobs", () => {
    it("does not fire when the job ran recently", async () => {
      const result = await runOpsHealthCheck(baseDeps());
      expect(result.alerts.filter((a) => a.kind === "scheduled_job_overdue")).toEqual([]);
    });

    it("fires when auto-citation has not completed within 2x its hourly interval", async () => {
      const getSystemState = vi.fn(async (key: string) => {
        if (key === "job:auto-citation:lastRanAt") {
          return { lastRanAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() }; // 3h ago
        }
        if (key === "job:weekly-report:lastRanAt") {
          return { lastRanAt: new Date(NOW - 60_000).toISOString() };
        }
        return null;
      });
      const result = await runOpsHealthCheck(baseDeps({ getSystemState }));
      const alert = result.alerts.find(
        (a) => a.kind === "scheduled_job_overdue" && a.measured.job === "auto-citation",
      );
      expect(alert).toBeDefined();
    });

    it("fires when a tracked job has never recorded a completion", async () => {
      const getSystemState = vi.fn(async () => null);
      const result = await runOpsHealthCheck(baseDeps({ getSystemState }));
      const jobs = result.alerts
        .filter((a) => a.kind === "scheduled_job_overdue")
        .map((a) => a.measured.job);
      expect(jobs).toContain("auto-citation");
      expect(jobs).toContain("weekly-report");
    });
  });

  describe("stuck citation runs", () => {
    it("does not fire for a running run inside the staleness window", async () => {
      const db = quietDb();
      db.query = vi.fn(async (text: string) => {
        if (text.includes("citation_runs")) {
          return {
            rows: [
              {
                id: "run-fresh",
                brand_id: "brand-1",
                started_at: new Date(NOW - 10 * 60 * 1000),
                last_advance_started_at: new Date(NOW - 5 * 60 * 1000),
              },
            ],
          };
        }
        if (text.includes("api_costs")) return { rows: [{ total_cents: 0, row_count: 0 }] };
        if (text.includes("outbox_commands")) {
          return {
            rows: [
              {
                never_claimed_count: 0,
                never_claimed_oldest: null,
                stuck_pending_count: 0,
                stuck_pending_oldest: null,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const result = await runOpsHealthCheck(baseDeps({ db }));
      expect(result.alerts.filter((a) => a.kind === "citation_runs_stuck_running")).toEqual([]);
    });

    it("fires for a run stuck past the shared staleness window (240 min)", async () => {
      const db = quietDb();
      db.query = vi.fn(async (text: string) => {
        if (text.includes("citation_runs")) {
          return {
            rows: [
              {
                id: "run-stuck",
                brand_id: "brand-2",
                started_at: new Date(NOW - 5 * 60 * 60 * 1000),
                last_advance_started_at: new Date(NOW - 5 * 60 * 60 * 1000), // 300 min
              },
            ],
          };
        }
        if (text.includes("api_costs")) return { rows: [{ total_cents: 0, row_count: 0 }] };
        if (text.includes("outbox_commands")) {
          return {
            rows: [
              {
                never_claimed_count: 0,
                never_claimed_oldest: null,
                stuck_pending_count: 0,
                stuck_pending_oldest: null,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const result = await runOpsHealthCheck(baseDeps({ db }));
      const alert = result.alerts.find((a) => a.kind === "citation_runs_stuck_running");
      expect(alert).toBeDefined();
      expect(alert!.measured.ids).toEqual(["run-stuck"]);
    });
  });

  describe("containment", () => {
    it("never throws when a DB read rejects, and reports a check_failed alert instead", async () => {
      const db = { query: vi.fn(async () => Promise.reject(new Error("connection refused"))) };
      await expect(runOpsHealthCheck(baseDeps({ db }))).resolves.toBeDefined();
      const result = await runOpsHealthCheck(baseDeps({ db }));
      const failed = result.alerts.filter((a) => a.kind === "check_failed");
      expect(failed.length).toBeGreaterThan(0);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it("never throws when getSystemState rejects", async () => {
      const getSystemState = vi.fn(async () => Promise.reject(new Error("state store down")));
      await expect(runOpsHealthCheck(baseDeps({ getSystemState }))).resolves.toBeDefined();
    });
  });
});
