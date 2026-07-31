// runMentionScanJob must respect the deadline the cron orchestrator passes it.
//
// It used to open with `void deadlineMs` — the parameter was accepted and
// thrown away, so the job walked every brand with mention monitoring on no
// matter how little budget was left. The orchestrator gives it a 30s cap out
// of a ~57s total, and every step queued behind it (weekly-digest-aggregator,
// and on Sundays the weekly report) was skipped when it overran.
//
// Bailing out is only half the fix. The job is Monday-gated and debounced for
// 20h, so recording a PARTIAL pass as "ran" would strand the unscanned brands
// until the following Monday. Completion is therefore recorded only when every
// brand was scanned, and the brand list is ordered least-recently-scanned
// first so the next tick resumes rather than repeating.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "test-key";
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  process.env.SUPABASE_JWT_SECRET ??= "test-jwt-secret";
});

const stubs = vi.hoisted(() => ({
  listBrands: vi.fn(),
  createScanJob: vi.fn(),
  runMentionScan: vi.fn(),
  shouldRunJob: vi.fn(),
  markJobRan: vi.fn(),
  lockAcquired: true,
}));

vi.mock("../../server/db", () => ({ db: { execute: vi.fn() }, pool: {} }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k: number, _n: string, fn: () => Promise<unknown>) =>
    stubs.lockAcquired ? { ran: true, result: await fn() } : { ran: false },
  lockKeys: { mentionScan: 42, competitorDiscovery: 43, listicleScan: 44 },
}));
vi.mock("../../server/lib/jobDebounce", () => ({
  shouldRunJob: stubs.shouldRunJob,
  markJobRan: stubs.markJobRan,
  withJobDebounce: async (_j: string, _w: number, fn: () => Promise<unknown>) => ({
    ran: true,
    result: await fn(),
  }),
  DEBOUNCE_WINDOWS: { "mention-scan": 72_000_000, "weekly-report": 72_000_000 },
}));
vi.mock("../../server/storage", () => ({
  storage: {
    listBrandsWithMentionMonitoring: stubs.listBrands,
    createScanJob: stubs.createScanJob,
  },
}));
vi.mock("../../server/lib/runMentionScan", () => ({ runMentionScan: stubs.runMentionScan }));

import { runMentionScanJob } from "../../server/scheduler";

const brands = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `brand-${i}`, userId: `user-${i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  stubs.lockAcquired = true;
  stubs.shouldRunJob.mockResolvedValue({ shouldRun: true, lastRanAt: null });
  stubs.createScanJob.mockImplementation(async (j: { brandId: string }) => ({
    id: `job-${j.brandId}`,
  }));
  stubs.runMentionScan.mockResolvedValue(undefined);
});

describe("runMentionScanJob deadline", () => {
  it("scans every brand and records completion when the deadline is generous", async () => {
    stubs.listBrands.mockResolvedValue(brands(4));

    await runMentionScanJob(Date.now() + 60_000);

    expect(stubs.runMentionScan).toHaveBeenCalledTimes(4);
    expect(stubs.markJobRan).toHaveBeenCalledWith("mention-scan");
  });

  it("stops scanning once the deadline has passed", async () => {
    // Each brand burns 40ms of a 100ms budget, so it gets through roughly two
    // or three of the ten and must not attempt all of them.
    stubs.listBrands.mockResolvedValue(brands(10));
    stubs.runMentionScan.mockImplementation(
      () => new Promise((r) => setTimeout(r, 40)) as Promise<void>,
    );

    await runMentionScanJob(Date.now() + 100);

    expect(stubs.runMentionScan.mock.calls.length).toBeLessThan(10);
    expect(stubs.runMentionScan.mock.calls.length).toBeGreaterThan(0);
  });

  it("does NOT record completion after bailing early", async () => {
    // The heart of it: a partial pass left recorded would block the retry for
    // the whole 20h window, and the next Monday-gated chance is a week away.
    stubs.listBrands.mockResolvedValue(brands(10));
    stubs.runMentionScan.mockImplementation(
      () => new Promise((r) => setTimeout(r, 40)) as Promise<void>,
    );

    await runMentionScanJob(Date.now() + 100);

    expect(stubs.markJobRan).not.toHaveBeenCalled();
  });

  it("scans nothing when a deadline is already in the past", async () => {
    stubs.listBrands.mockResolvedValue(brands(3));

    await runMentionScanJob(Date.now() - 1);

    expect(stubs.runMentionScan).not.toHaveBeenCalled();
    expect(stubs.markJobRan).not.toHaveBeenCalled();
  });

  it("scans every brand when no deadline is given (in-process cron path)", async () => {
    stubs.listBrands.mockResolvedValue(brands(5));

    await runMentionScanJob();

    expect(stubs.runMentionScan).toHaveBeenCalledTimes(5);
    expect(stubs.markJobRan).toHaveBeenCalledWith("mention-scan");
  });

  it("counts a brand that throws as attempted and carries on", async () => {
    stubs.listBrands.mockResolvedValue(brands(3));
    stubs.runMentionScan.mockRejectedValueOnce(new Error("scan blew up"));

    await runMentionScanJob(Date.now() + 60_000);

    expect(stubs.runMentionScan).toHaveBeenCalledTimes(3);
    // The schedule succeeded even though one brand's scan did not — retrying
    // it every tick for 20h would crowd out the brands behind it.
    expect(stubs.markJobRan).toHaveBeenCalledWith("mention-scan");
  });
});

describe("runMentionScanJob debounce gate", () => {
  it("does not scan at all when the debounce says it ran recently", async () => {
    stubs.shouldRunJob.mockResolvedValue({ shouldRun: false, lastRanAt: new Date() });
    stubs.listBrands.mockResolvedValue(brands(3));

    await runMentionScanJob(Date.now() + 60_000);

    expect(stubs.listBrands).not.toHaveBeenCalled();
    expect(stubs.markJobRan).not.toHaveBeenCalled();
  });

  it("does not record completion when another runner holds the lock", async () => {
    // That runner owns this pass and will record it. Recording here too would
    // let a lock-loser suppress the winner's retry.
    stubs.lockAcquired = false;
    stubs.listBrands.mockResolvedValue(brands(3));

    await runMentionScanJob(Date.now() + 60_000);

    expect(stubs.markJobRan).not.toHaveBeenCalled();
  });
});
