// Direct, no-HTTP tests for server/services/cronMaintenance.ts (B7 service
// extraction). HTTP-level behavior for the orchestrator that calls these
// steps is already covered by tests/unit/cronOrchestrator.test.ts; this
// file proves the extracted drain/reap functions work when called directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  listAdvanceablePendingJobs: vi.fn(),
  claimContentJobForSlice: vi.fn(),
  runArticleSlice: vi.fn(),
  failStuckContentJobs: vi.fn(),
  setArticleFailed: vi.fn(),
  failStaleScanJobs: vi.fn(),
  getBrandById: vi.fn(),
  refundArticleQuota: vi.fn(),
  advanceCitationRun: vi.fn(),
  advancePerceptionProbeRun: vi.fn(),
}));

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  selectMock: vi.fn(),
}));

function makeSelectChain(result: unknown) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}
dbState.selectMock.mockImplementation(() => makeSelectChain(dbState.selectQueue.shift() ?? []));

function queueSelect(result: unknown) {
  dbState.selectQueue.push(result);
}

vi.mock("../../server/db", () => ({
  db: { select: dbState.selectMock },
  pool: {},
}));

vi.mock("../../server/storage", () => ({
  storage: {
    listAdvanceablePendingJobs: stubs.listAdvanceablePendingJobs,
    claimContentJobForSlice: stubs.claimContentJobForSlice,
    failStuckContentJobs: stubs.failStuckContentJobs,
    setArticleFailed: stubs.setArticleFailed,
    failStaleScanJobs: stubs.failStaleScanJobs,
    getBrandById: stubs.getBrandById,
  },
}));

vi.mock("../../server/contentGenerationWorker", () => ({
  runArticleSlice: stubs.runArticleSlice,
}));

vi.mock("../../server/lib/usageLimit", () => ({
  refundArticleQuota: stubs.refundArticleQuota,
}));

vi.mock("../../server/citationChecker", () => ({
  advanceCitationRun: stubs.advanceCitationRun,
}));

vi.mock("../../server/lib/perceptionProbes", () => ({
  advancePerceptionProbeRun: stubs.advancePerceptionProbeRun,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  drainPendingContentJobs,
  drainPendingCitationRuns,
  drainPendingPerceptionProbeRuns,
  failStuckContentJobsForOrchestrator,
  failStaleScanJobsForOrchestrator,
} = await import("../../server/services/cronMaintenance");

beforeEach(() => {
  for (const s of Object.values(stubs)) s.mockReset();
  dbState.selectQueue.length = 0;
  dbState.selectMock.mockClear();
});

describe("drainPendingContentJobs", () => {
  it("claims and advances one job, counting a successful completion", async () => {
    stubs.listAdvanceablePendingJobs.mockResolvedValue([{ id: "job-1" }]);
    stubs.claimContentJobForSlice.mockResolvedValue({ advanceToken: "tok" });
    stubs.runArticleSlice.mockResolvedValue({ done: true, status: "succeeded" });

    const result = await drainPendingContentJobs(Date.now() + 10_000);

    expect(result).toEqual({ progressed: 1, completed: 1 });
    expect(stubs.claimContentJobForSlice).toHaveBeenCalledWith("job-1", 30);
  });

  it("does not count progress when the slice lock can't be claimed", async () => {
    stubs.listAdvanceablePendingJobs.mockResolvedValue([{ id: "job-1" }]);
    stubs.claimContentJobForSlice.mockResolvedValue(undefined);

    const result = await drainPendingContentJobs(Date.now() + 10_000);

    expect(result).toEqual({ progressed: 0, completed: 0 });
    expect(stubs.runArticleSlice).not.toHaveBeenCalled();
  });

  it("does not start work once the deadline has already passed", async () => {
    stubs.listAdvanceablePendingJobs.mockResolvedValue([{ id: "job-1" }]);

    const result = await drainPendingContentJobs(Date.now() - 1_000);

    expect(result).toEqual({ progressed: 0, completed: 0 });
    expect(stubs.claimContentJobForSlice).not.toHaveBeenCalled();
  });
});

describe("drainPendingCitationRuns", () => {
  it("returns progressed:false when there is no stale run", async () => {
    queueSelect([]);
    const result = await drainPendingCitationRuns(Date.now() + 10_000);
    expect(result).toEqual({ progressed: false });
    expect(stubs.advanceCitationRun).not.toHaveBeenCalled();
  });

  it("advances the oldest stale run", async () => {
    queueSelect([{ id: "run-1" }]);
    stubs.advanceCitationRun.mockResolvedValue({ status: "running" });

    const result = await drainPendingCitationRuns(Date.now() + 10_000);

    expect(result).toEqual({ progressed: true, runId: "run-1", status: "running" });
    expect(stubs.advanceCitationRun).toHaveBeenCalledWith("run-1", expect.any(Number));
  });
});

describe("drainPendingPerceptionProbeRuns", () => {
  it("returns progressed:false when there is no stale run", async () => {
    queueSelect([]);
    const result = await drainPendingPerceptionProbeRuns(Date.now() + 10_000);
    expect(result).toEqual({ progressed: false });
  });

  it("returns progressed:false when the brand behind the run no longer exists", async () => {
    queueSelect([{ id: "run-1", brandId: "brand-1" }]);
    stubs.getBrandById.mockResolvedValue(undefined);

    const result = await drainPendingPerceptionProbeRuns(Date.now() + 10_000);

    expect(result).toEqual({ progressed: false });
    expect(stubs.advancePerceptionProbeRun).not.toHaveBeenCalled();
  });

  it("advances the run when the brand exists", async () => {
    queueSelect([{ id: "run-1", brandId: "brand-1" }]);
    stubs.getBrandById.mockResolvedValue({ id: "brand-1", userId: "user-1" });
    stubs.advancePerceptionProbeRun.mockResolvedValue({ status: "running" });

    const result = await drainPendingPerceptionProbeRuns(Date.now() + 10_000);

    expect(result).toEqual({ progressed: true, runId: "run-1", status: "running" });
    expect(stubs.advancePerceptionProbeRun).toHaveBeenCalledWith(
      { id: "brand-1", userId: "user-1" },
      "run-1",
      expect.any(Number),
      "user-1",
    );
  });
});

describe("failStuckContentJobsForOrchestrator", () => {
  it("fails the article and refunds quota for each stuck job", async () => {
    stubs.failStuckContentJobs.mockResolvedValue([
      { id: "job-1", userId: "user-1", articleId: "art-1" },
    ]);

    const result = await failStuckContentJobsForOrchestrator();

    expect(result).toEqual({ failed: 1 });
    expect(stubs.setArticleFailed).toHaveBeenCalledWith("art-1");
    expect(stubs.refundArticleQuota).toHaveBeenCalledWith("user-1", "job-1", "timeout");
  });

  it("skips the article-failed call when the job has no articleId", async () => {
    stubs.failStuckContentJobs.mockResolvedValue([
      { id: "job-1", userId: "user-1", articleId: null },
    ]);

    await failStuckContentJobsForOrchestrator();

    expect(stubs.setArticleFailed).not.toHaveBeenCalled();
    expect(stubs.refundArticleQuota).toHaveBeenCalledWith("user-1", "job-1", "timeout");
  });
});

describe("failStaleScanJobsForOrchestrator", () => {
  it("returns the failed count reported by storage", async () => {
    stubs.failStaleScanJobs.mockResolvedValue(3);
    const result = await failStaleScanJobsForOrchestrator();
    expect(result).toEqual({ failed: 3 });
    expect(stubs.failStaleScanJobs).toHaveBeenCalledWith(30);
  });
});
