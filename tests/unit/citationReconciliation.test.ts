// Wave 9: orphan-run reconciliation runs once on boot to mark stale
// `running` rows as failed. Without it, a server crash mid-run leaves
// the row pinned forever — every dependent page polls indefinitely and
// the partial unique index from migration 0035 blocks new runs for
// that brand.

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted to the top of the file, so any helpers
// they close over must come from vi.hoisted() — top-level let/const isn't
// available yet when the factory runs.
const { queryMock, loggerMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({
  db: {},
  pool: { query: queryMock },
}));
vi.mock("../../server/lib/logger", () => ({
  logger: loggerMock,
}));

import { reconcileOrphanCitationRuns } from "../../server/lib/citationReconciliation";

beforeEach(() => {
  queryMock.mockReset();
});

describe("reconcileOrphanCitationRuns", () => {
  it("issues an UPDATE that filters by status + 5-minute age threshold", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await reconcileOrphanCitationRuns();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/UPDATE citation_runs/i);
    expect(sql).toMatch(/status\s+IN\s+\('pending',\s*'running'\)/i);
    // Vercel migration: tightened from 15 min to 5 min so lambda-killed
    // runs are picked up faster (see citationReconciliation.ts).
    expect(sql).toMatch(/INTERVAL\s+'5 minutes'/i);
    expect(sql).toMatch(/error_message\s*=\s*'orphaned by restart'/i);
  });

  it("does not throw if the DB query rejects", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    // The function swallows DB errors so a transient blip on boot
    // doesn't prevent the rest of init from running.
    await expect(reconcileOrphanCitationRuns()).resolves.toBeUndefined();
  });

  it("logs a warning when one or more orphaned rows are reconciled", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { id: "run-a", brand_id: "brand-1" },
        { id: "run-b", brand_id: "brand-2" },
      ],
    });
    loggerMock.warn.mockClear();
    await reconcileOrphanCitationRuns();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2, ids: ["run-a", "run-b"] }),
      "citation.runs.orphaned_reconciled",
    );
  });
});
