// Direct, no-HTTP tests for server/services/cronRetention.ts (B7 service
// extraction). HTTP-level behavior for the orchestrator that calls these
// steps is already covered by tests/unit/cronOrchestrator.test.ts; this
// file proves the extracted retention/pruning functions work when called
// directly, including the ones that dynamically import "../db" and
// "drizzle-orm" internally (unchanged from the original inline step body).

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  deleteOldFactScrapePages: vi.fn(),
  deleteOldFactScrapeRuns: vi.fn(),
  deleteOldFactScrapeLogs: vi.fn(),
  deleteExpiredFactScrapeCache: vi.fn(),
  deleteExpiredLlmConcurrencySlots: vi.fn(),
  dbExecute: vi.fn(),
  drainPendingLlmJobs: vi.fn(),
  pruneExpiredLlmJobs: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    deleteOldFactScrapePages: stubs.deleteOldFactScrapePages,
    deleteOldFactScrapeRuns: stubs.deleteOldFactScrapeRuns,
    deleteOldFactScrapeLogs: stubs.deleteOldFactScrapeLogs,
    deleteExpiredFactScrapeCache: stubs.deleteExpiredFactScrapeCache,
    deleteExpiredLlmConcurrencySlots: stubs.deleteExpiredLlmConcurrencySlots,
  },
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));

vi.mock("../../server/lib/llmJobs", () => ({
  drainPendingLlmJobs: stubs.drainPendingLlmJobs,
  pruneExpiredLlmJobs: stubs.pruneExpiredLlmJobs,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  runV2LifecycleCleanup,
  runSignalsRetentionPrune,
  runFactScrapeEventsPrune,
  runLlmJobsDrainStep,
  runLlmJobsPruneStep,
} = await import("../../server/services/cronRetention");

beforeEach(() => {
  for (const s of Object.values(stubs)) s.mockReset();
  stubs.dbExecute.mockResolvedValue({ rowCount: 0 });
});

describe("runV2LifecycleCleanup", () => {
  it("prunes every fact-scrape retention table with its own window", async () => {
    await runV2LifecycleCleanup();

    expect(stubs.deleteOldFactScrapePages).toHaveBeenCalledWith(7);
    expect(stubs.deleteOldFactScrapeRuns).toHaveBeenCalledWith(30);
    expect(stubs.deleteOldFactScrapeLogs).toHaveBeenCalledWith(90);
    expect(stubs.deleteExpiredFactScrapeCache).toHaveBeenCalledWith();
    expect(stubs.deleteExpiredLlmConcurrencySlots).toHaveBeenCalledWith();
  });
});

describe("runSignalsRetentionPrune", () => {
  it("issues all four retention deletes", async () => {
    await runSignalsRetentionPrune();
    expect(stubs.dbExecute).toHaveBeenCalledTimes(4);
  });
});

describe("runFactScrapeEventsPrune", () => {
  it("deletes stale fact_scrape_events rows once", async () => {
    stubs.dbExecute.mockResolvedValue({ rowCount: 7 });
    await runFactScrapeEventsPrune();
    expect(stubs.dbExecute).toHaveBeenCalledTimes(1);
  });
});

describe("runLlmJobsDrainStep", () => {
  it("drains pending llm jobs with the given step deadline", async () => {
    stubs.drainPendingLlmJobs.mockResolvedValue({
      attempted: 1,
      finalized: 1,
      stillRunning: 0,
      failed: 0,
    });

    await runLlmJobsDrainStep(12345);

    expect(stubs.drainPendingLlmJobs).toHaveBeenCalledWith(12345);
  });
});

describe("runLlmJobsPruneStep", () => {
  it("prunes expired llm jobs", async () => {
    stubs.pruneExpiredLlmJobs.mockResolvedValue(2);
    await runLlmJobsPruneStep();
    expect(stubs.pruneExpiredLlmJobs).toHaveBeenCalledWith();
  });
});
