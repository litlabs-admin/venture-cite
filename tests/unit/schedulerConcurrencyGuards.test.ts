// runAutoCitationJob and runWeeklyReportJob both compose:
//
//   withJobDebounce(job, window, () => withAdvisoryLock(key, label, impl))
//
// Every existing test for these two jobs (autoCitationDeadline.test.ts,
// mentionScanDeadline.test.ts, citationRunGuards.test.ts) mocks both guards
// as unconditional pass-throughs - `(k, w, fn) => fn()` and
// `async (k, n, fn) => ({ ran: true, result: await fn() })` - because the
// guards need a live database and those files exist to test the job BODY's
// own logic. That is a reasonable choice for those files, but it means none
// of them can tell "the guards ran and allowed the body" apart from "the
// guards were deleted and the body ran anyway": deleting
//
//   await withJobDebounce("auto-citation", DEBOUNCE_WINDOWS["auto-citation"], () =>
//     withAdvisoryLock(schedulerLockKeys.autoCitation, "auto-citation-job", () =>
//       runAutoCitationJobImpl(deadlineMs),
//     ),
//   );
//
// entirely, replacing it with `await runAutoCitationJobImpl(deadlineMs);`,
// left all 18 tests across those three files green
// (.audit/B6/B6b-02-mutation-concurrency.md, 5a). runWeeklyReportJob's
// identical composition had zero coverage of any kind (5c).
//
// This file makes the composition itself the thing under test: both guards
// are mocked as controllable vi.fn()s that this file inspects and can
// toggle to "deny", instead of bare pass-through functions nobody can spy
// on. Removing the wrapper makes "was withJobDebounce/withAdvisoryLock even
// called" assertions fail with zero calls - and setting a guard to deny
// proves the job body genuinely does not run without it, not just that the
// return value happens to look right.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OPENAI_API_KEY ||= "test-key";
process.env.OPENROUTER_API_KEY ||= "test-key";
process.env.RESEND_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  debounceShouldRun: true,
  lockAcquired: true,
  brands: [] as unknown[],
  users: [] as unknown[],
  loggerInfo: vi.fn(),
}));

const withJobDebounceMock = vi.hoisted(() =>
  vi.fn(async (_job: string, _windowMs: number, fn: () => Promise<unknown>) => {
    if (!stubs.debounceShouldRun) return { ran: false, lastRanAt: null };
    return { ran: true, result: await fn() };
  }),
);
const withAdvisoryLockMock = vi.hoisted(() =>
  vi.fn(async (_key: number, _label: string, fn: () => Promise<unknown>) => {
    if (!stubs.lockAcquired) return { ran: false };
    return { ran: true, result: await fn() };
  }),
);

vi.mock("../../server/citationChecker", () => ({
  runBrandPrompts: vi.fn(),
  advanceCitationRun: vi.fn(),
}));
vi.mock("../../server/lib/suggestionGenerator", () => ({
  generateSuggestedPrompts: vi.fn(async () => ({ error: null })),
}));
vi.mock("../../server/storage", () => ({
  storage: { getBrandPromptsByBrandId: vi.fn(async () => []) },
}));
vi.mock("../../server/lib/jobDebounce", () => ({
  withJobDebounce: withJobDebounceMock,
  shouldRunJob: vi.fn(async () => ({ shouldRun: true, lastRanAt: null })),
  markJobRan: vi.fn(async () => undefined),
  DEBOUNCE_WINDOWS: {
    "auto-citation": 2_700_000,
    "weekly-report": 72_000_000,
    "mention-scan": 72_000_000,
  },
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: withAdvisoryLockMock,
  lockKeys: {
    competitorDiscovery: 1,
    factRefresh: 2,
    mentionScan: 3,
    listicleScan: 4,
    metricsSnapshot: 5,
    automationEvaluator: 6,
    factScrapeFailureDetect: 7,
  },
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: stubs.loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/db", () => ({
  db: {
    execute: async () => ({ rows: stubs.brands }),
    select: () => ({ from: () => ({ where: async () => stubs.users }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
  pool: {},
}));

const { runAutoCitationJob, runWeeklyReportJob } = await import("../../server/scheduler");

beforeEach(() => {
  withJobDebounceMock.mockClear();
  withAdvisoryLockMock.mockClear();
  stubs.loggerInfo.mockClear();
  stubs.debounceShouldRun = true;
  stubs.lockAcquired = true;
  stubs.brands = [];
  stubs.users = [];
});

describe("runAutoCitationJob concurrency composition", () => {
  it("wraps the job body in the debounce and the advisory lock", async () => {
    await runAutoCitationJob();

    expect(withJobDebounceMock).toHaveBeenCalledTimes(1);
    expect(withJobDebounceMock.mock.calls[0]?.[0]).toBe("auto-citation");
    expect(withAdvisoryLockMock).toHaveBeenCalledTimes(1);
    // Proves the lock call happened FROM INSIDE the debounce's callback
    // (the body actually ran), not merely that both mocks were invoked
    // independently of one another.
    expect(stubs.loggerInfo).toHaveBeenCalledWith("auto-citation job starting");
  });

  it("does not run the job body when the debounce denies the run", async () => {
    stubs.debounceShouldRun = false;

    await runAutoCitationJob();

    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
    expect(stubs.loggerInfo).not.toHaveBeenCalledWith("auto-citation job starting");
  });

  it("does not run the job body when another runner holds the advisory lock", async () => {
    stubs.lockAcquired = false;

    await runAutoCitationJob();

    expect(stubs.loggerInfo).not.toHaveBeenCalledWith("auto-citation job starting");
  });
});

describe("runWeeklyReportJob concurrency composition", () => {
  it("wraps the job body in the debounce and the advisory lock", async () => {
    await expect(runWeeklyReportJob()).resolves.toEqual({ sent: 0, skipped: 0 });

    expect(withJobDebounceMock).toHaveBeenCalledTimes(1);
    expect(withJobDebounceMock.mock.calls[0]?.[0]).toBe("weekly-report");
    expect(withAdvisoryLockMock).toHaveBeenCalledTimes(1);
  });

  it("returns the zeroed result without running the body when the debounce denies the run", async () => {
    stubs.debounceShouldRun = false;

    await expect(runWeeklyReportJob()).resolves.toEqual({ sent: 0, skipped: 0 });
    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
  });

  it("returns the zeroed result without running the body when another runner holds the lock", async () => {
    stubs.lockAcquired = false;

    await expect(runWeeklyReportJob()).resolves.toEqual({ sent: 0, skipped: 0 });
  });
});
