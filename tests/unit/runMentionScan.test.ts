// Tests for server/lib/runMentionScan.ts (Task 14 — Mentions Rebuild).
//
// Strategy: vi.mock storage and scanBrandMentions. Tests verify orchestration
// logic: idempotency guards, status transitions, error handling, and logging.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted stubs ────────────────────────────────────────────────────────────

const stubs = vi.hoisted(() => ({
  // storage
  getScanJob: vi.fn(),
  updateScanJob: vi.fn(),
  // mentionScanner
  scanBrandMentions: vi.fn(),
  // logger
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  // sentry
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getScanJob: stubs.getScanJob,
    updateScanJob: stubs.updateScanJob,
  },
}));

vi.mock("../../server/lib/mentionScanner", () => ({
  scanBrandMentions: stubs.scanBrandMentions,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: {
    info: stubs.loggerInfo,
    warn: stubs.loggerWarn,
    error: stubs.loggerError,
  },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

// Import AFTER mocks are registered.
import { runMentionScan } from "../../server/lib/runMentionScan";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCAN_ID = "scan-uuid-1";
const BRAND_ID = "brand-uuid-1";

function makeScanJob(status: string) {
  return {
    id: SCAN_ID,
    brandId: BRAND_ID,
    userId: "user-uuid-1",
    trigger: "manual" as const,
    status,
    perSource: {},
    totals: {},
    startedAt: null,
    completedAt: null,
    error: null,
    createdAt: new Date("2026-05-05T10:00:00Z"),
  };
}

function makeReport() {
  return {
    perSource: {
      reddit: { found: 2, inserted: 2, duplicates: 0, failed: false },
      hackernews: { found: 1, inserted: 1, duplicates: 0, failed: false },
    },
    totals: { found: 3, inserted: 3, duplicates: 0, failedSources: 0 },
    inserted: 3,
  };
}

// ── beforeEach: reset stubs ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stubs.updateScanJob.mockResolvedValue(undefined);
  stubs.scanBrandMentions.mockResolvedValue(makeReport());
});

// ── Test 1: Job not found → returns silently ──────────────────────────────────

describe("job not found", () => {
  it("returns without calling updateScanJob when getScanJob returns undefined", async () => {
    stubs.getScanJob.mockResolvedValue(undefined);

    await runMentionScan(SCAN_ID);

    expect(stubs.updateScanJob).not.toHaveBeenCalled();
    expect(stubs.scanBrandMentions).not.toHaveBeenCalled();
    expect(stubs.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: SCAN_ID }),
      expect.any(String),
    );
  });
});

// ── Test 2: Job already complete → idempotent, no storage update ──────────────

describe("already complete", () => {
  it("returns early without touching storage when status is 'complete'", async () => {
    stubs.getScanJob.mockResolvedValue(makeScanJob("complete"));

    await runMentionScan(SCAN_ID);

    expect(stubs.updateScanJob).not.toHaveBeenCalled();
    expect(stubs.scanBrandMentions).not.toHaveBeenCalled();
  });

  it("returns early without touching storage when status is 'failed'", async () => {
    stubs.getScanJob.mockResolvedValue(makeScanJob("failed"));

    await runMentionScan(SCAN_ID);

    expect(stubs.updateScanJob).not.toHaveBeenCalled();
    expect(stubs.scanBrandMentions).not.toHaveBeenCalled();
  });
});

// ── Test 3: Happy path → running then complete ────────────────────────────────

describe("happy path", () => {
  it("transitions to running then complete, updating storage with report data", async () => {
    stubs.getScanJob.mockResolvedValue(makeScanJob("queued"));
    const report = makeReport();
    stubs.scanBrandMentions.mockResolvedValue(report);

    await runMentionScan(SCAN_ID);

    // First update: set running
    expect(stubs.updateScanJob).toHaveBeenNthCalledWith(
      1,
      SCAN_ID,
      expect.objectContaining({ status: "running", startedAt: expect.any(Date) }),
    );

    // scanBrandMentions called with brandId and scanId
    expect(stubs.scanBrandMentions).toHaveBeenCalledWith(BRAND_ID, SCAN_ID);

    // Second update: set complete with report data
    expect(stubs.updateScanJob).toHaveBeenNthCalledWith(
      2,
      SCAN_ID,
      expect.objectContaining({
        status: "complete",
        completedAt: expect.any(Date),
        perSource: report.perSource,
        totals: report.totals,
      }),
    );
  });
});

// ── Test 4: scanBrandMentions throws → failed + captureAndFlush ───────────────

describe("scanner throws", () => {
  it("updates status to failed, captures exception, logs error, does not re-throw", async () => {
    stubs.getScanJob.mockResolvedValue(makeScanJob("queued"));
    const boom = new Error("reddit exploded");
    stubs.scanBrandMentions.mockRejectedValue(boom);

    // Should NOT throw
    await expect(runMentionScan(SCAN_ID)).resolves.toBeUndefined();

    // updateScanJob called with failed status + error message
    expect(stubs.updateScanJob).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({
        status: "failed",
        completedAt: expect.any(Date),
        error: expect.stringContaining("reddit exploded"),
      }),
    );

    // captureAndFlush called with the error and correct tags
    expect(stubs.captureAndFlush).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        tags: { source: "runMentionScan" },
        extra: expect.objectContaining({ scanId: SCAN_ID, brandId: BRAND_ID }),
      }),
    );

    // logger.error called
    expect(stubs.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: SCAN_ID }),
      expect.stringContaining("scan.run.failed"),
    );
  });

  it("truncates error messages longer than 500 chars", async () => {
    stubs.getScanJob.mockResolvedValue(makeScanJob("queued"));
    const longMsg = "x".repeat(600);
    stubs.scanBrandMentions.mockRejectedValue(new Error(longMsg));

    await runMentionScan(SCAN_ID);

    const [, patch] = stubs.updateScanJob.mock.calls.find(
      ([, p]: [string, Record<string, unknown>]) => p.status === "failed",
    ) as [string, Record<string, unknown>];

    expect(typeof patch.error).toBe("string");
    expect((patch.error as string).length).toBeLessThanOrEqual(500);
  });
});

// ── Test 5: duration logged on scan.run.complete ──────────────────────────────

describe("duration logging", () => {
  it("includes durationMs in the scan.run.complete log", async () => {
    stubs.getScanJob.mockResolvedValue(makeScanJob("queued"));

    await runMentionScan(SCAN_ID);

    expect(stubs.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        scanId: SCAN_ID,
        brandId: BRAND_ID,
        durationMs: expect.any(Number),
        totals: expect.any(Object),
      }),
      "scan.run.complete",
    );
  });
});
