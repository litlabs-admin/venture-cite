// Direct, no-HTTP tests for server/services/citationRuns.ts.
// See promptPortfolioService.test.ts for why these exist.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, name: "Acme" } as any;

const storageStubs = vi.hoisted(() => ({
  getBrandPromptsByBrandId: vi.fn(),
  getActiveCitationRuns: vi.fn(),
  getCitationRunLiveState: vi.fn(),
  getRecentRankingsForRun: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const kickoffBrandPromptsRunMock = vi.hoisted(() => vi.fn());
const advanceCitationRunMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/citationChecker", () => ({
  kickoffBrandPromptsRun: kickoffBrandPromptsRunMock,
  advanceCitationRun: advanceCitationRunMock,
  DEFAULT_CITATION_PLATFORMS: ["chatgpt", "perplexity"],
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

const { startBrandCitationRun, buildCitationRunStateSnapshot } =
  await import("../../server/services/citationRuns");

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
});

describe("startBrandCitationRun", () => {
  it("refuses when AI citation checks aren't configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await startBrandCitationRun(BRAND, undefined);
    expect(result).toEqual({ outcome: "not_configured" });
  });

  it("refuses when the brand has no prompts", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    const result = await startBrandCitationRun(BRAND, undefined);
    expect(result).toEqual({ outcome: "no_prompts" });
  });

  it("refuses an explicit empty platforms array", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
    const result = await startBrandCitationRun(BRAND, []);
    expect(result).toEqual({ outcome: "no_platforms_selected" });
    expect(kickoffBrandPromptsRunMock).not.toHaveBeenCalled();
  });

  it("reports already_running with the existing run id", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
    kickoffBrandPromptsRunMock.mockResolvedValue({
      ok: false,
      reason: "already_running",
      runId: "run-existing",
    });
    const result = await startBrandCitationRun(BRAND, undefined);
    expect(result).toEqual({ outcome: "already_running", runId: "run-existing" });
  });

  it("defaults to every platform and starts the run", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
    kickoffBrandPromptsRunMock.mockResolvedValue({ ok: true, runId: "run-1" });
    const result = await startBrandCitationRun(BRAND, undefined);
    expect(result).toEqual({ outcome: "started", runId: "run-1" });
    expect(kickoffBrandPromptsRunMock).toHaveBeenCalledWith(BRAND_ID, ["chatgpt", "perplexity"], {
      triggeredBy: "manual",
    });
  });
});

describe("buildCitationRunStateSnapshot", () => {
  it("returns an empty snapshot with no active runs", async () => {
    storageStubs.getActiveCitationRuns.mockResolvedValue([]);
    const snapshot = await buildCitationRunStateSnapshot(BRAND_ID, 1000);
    expect(snapshot).toEqual({ runs: [], since: 1000, hasActive: false });
  });

  it("advances `since` to the newest ranking's checkedAt and marks a finished run done", async () => {
    storageStubs.getActiveCitationRuns.mockResolvedValue([{ id: "run-1" }]);
    storageStubs.getCitationRunLiveState.mockResolvedValue({
      status: "completed",
      progressPct: 100,
      totalChecks: 10,
      totalCited: 4,
      citationRate: 40,
    });
    const checkedAt = new Date(5000);
    storageStubs.getRecentRankingsForRun.mockResolvedValue([
      { id: "r1", aiPlatform: "chatgpt", isCited: 1, checkedAt },
    ]);

    const snapshot = await buildCitationRunStateSnapshot(BRAND_ID, 1000);
    expect(snapshot.since).toBe(5000);
    expect(snapshot.hasActive).toBe(true);
    expect(snapshot.runs).toEqual([
      {
        runId: "run-1",
        status: "completed",
        progressPct: 100,
        totalChecks: 10,
        totalCited: 4,
        citationRate: 40,
        rankings: [
          { id: "r1", aiPlatform: "chatgpt", isCited: true, checkedAt: checkedAt.toISOString() },
        ],
        done: true,
      },
    ]);
  });
});
