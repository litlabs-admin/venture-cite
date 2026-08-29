// Regression tests for the citation-run staleness defect recorded in
// .audit/B6/B6a-12-citation-run-staleness.md.
//
// ORPHAN_THRESHOLD_MINUTES (5) was documented as "how old is definitely-dead"
// but compared against citation_runs.started_at, which measures TOTAL run
// age, not staleness. citation_runs is deliberately slice-based
// (server/citationChecker.ts): a genuinely healthy run stays 'running' for
// its entire multi-minute duration. Measured against 449 production runs
// that completed successfully, 38.5% took longer than 5 minutes. This was
// latent while only the boot-time/daily sweep used the threshold; B6a-10
// added an inline reap on every automatic run creation, so it now fires far
// more often and can kill a healthy in-flight run.
//
// The fix: both reap sites now key off citation_runs.last_advance_started_at
// (migration 0123), stamped at row creation and on every mid-slice progress
// bump, and both call the SAME exported predicate
// (isRunStaleSinceLastProgress, server/lib/citationReconciliation.ts) so
// they cannot silently drift apart.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Part 1: the shared predicate itself - server/lib/citationReconciliation.ts
// ---------------------------------------------------------------------

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

import {
  isRunStaleSinceLastProgress,
  STALE_SINCE_LAST_PROGRESS_MS,
  reconcileOrphanCitationRuns,
} from "../../server/lib/citationReconciliation";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60_000);
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);

beforeEach(() => {
  queryMock.mockReset();
});

describe("isRunStaleSinceLastProgress (shared by both reap sites)", () => {
  it("does NOT flag a run as stale when last progress is recent, even though startedAt is hours old - the exact regression", () => {
    const run = {
      startedAt: hoursAgo(5), // 5 hours old total run age
      lastAdvanceStartedAt: minutesAgo(1), // progressed 1 minute ago
    };
    expect(isRunStaleSinceLastProgress(run, NOW)).toBe(false);
  });

  it("flags a genuinely abandoned run as stale (no progress for longer than the threshold)", () => {
    const run = {
      startedAt: hoursAgo(6),
      lastAdvanceStartedAt: hoursAgo(5), // last progress 5h ago, threshold is 4h
    };
    expect(isRunStaleSinceLastProgress(run, NOW)).toBe(true);
  });

  it("falls back to startedAt when lastAdvanceStartedAt is NULL, and is NOT stale inside the threshold", () => {
    const run = {
      startedAt: minutesAgo(30), // well inside the 240-minute threshold
      lastAdvanceStartedAt: null,
    };
    expect(isRunStaleSinceLastProgress(run, NOW)).toBe(false);
  });

  it("falls back to startedAt when lastAdvanceStartedAt is NULL, and IS stale past the threshold", () => {
    const run = {
      startedAt: hoursAgo(5), // past the 240-minute (4h) threshold
      lastAdvanceStartedAt: null,
    };
    expect(isRunStaleSinceLastProgress(run, NOW)).toBe(true);
  });

  it("sits exactly at the documented threshold", () => {
    const run = {
      startedAt: hoursAgo(10),
      lastAdvanceStartedAt: new Date(NOW - STALE_SINCE_LAST_PROGRESS_MS),
    };
    // >= threshold counts as stale (ageMs >= STALE_SINCE_LAST_PROGRESS_MS).
    expect(isRunStaleSinceLastProgress(run, NOW)).toBe(true);
    const justUnder = {
      startedAt: hoursAgo(10),
      lastAdvanceStartedAt: new Date(NOW - STALE_SINCE_LAST_PROGRESS_MS + 1),
    };
    expect(isRunStaleSinceLastProgress(justUnder, NOW)).toBe(false);
  });
});

describe("reconcileOrphanCitationRuns SQL", () => {
  it("filters on COALESCE(last_advance_started_at, started_at) against the shared threshold, not started_at alone", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await reconcileOrphanCitationRuns();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/UPDATE citation_runs/i);
    expect(sql).toMatch(/status\s+IN\s+\('pending',\s*'running'\)/i);
    expect(sql).toMatch(/COALESCE\(\s*last_advance_started_at\s*,\s*started_at\s*\)/i);
    const expectedMinutes = STALE_SINCE_LAST_PROGRESS_MS / 60_000;
    expect(sql).toMatch(new RegExp(`INTERVAL\\s+'${expectedMinutes} minutes'`, "i"));
    expect(sql).toMatch(/error_message\s*=\s*'orphaned by restart'/i);
  });

  it("does not throw if the DB query rejects", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(reconcileOrphanCitationRuns()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// Part 2: the inline reap in runBrandPrompts (server/citationChecker.ts)
// - same predicate, driven through storage mocks the way
//   tests/unit/citationRunGuards.test.ts already does.
// ---------------------------------------------------------------------

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getBrandById: vi.fn(),
    getUser: vi.fn(),
    getBrandPromptsByBrandId: vi.fn(),
    createCitationRun: vi.fn(),
    updateCitationRun: vi.fn(),
    getCitationRunById: vi.fn(),
    getActiveCitationRuns: vi.fn(),
    countAutomaticCitationRunsSince: vi.fn(),
    getGeoRankingsByBrandPromptIds: vi.fn(),
    getCompetitors: vi.fn(),
    getTrackedContentUrlsByBrandId: vi.fn(),
    addBrandNameVariation: vi.fn(),
    addCompetitorNameVariation: vi.fn(),
    createGeoRanking: vi.fn(),
    createCompetitorGeoRanking: vi.fn(),
    createCompetitorGeoRankings: vi.fn(),
    createCompetitorCitationSnapshot: vi.fn(),
  },
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }));
vi.mock("../../server/citationJudge", () => ({ judgeCitation: vi.fn() }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
// NOTE: server/lib/logger is already mocked once, above, as `loggerMock` -
// citationReconciliation.ts and citationChecker.ts both import the exact
// same module, and vi.mock only takes effect once per specifier per file.
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/lib/circuitBreaker", () => ({
  openaiBreaker: { run: (fn: () => unknown) => fn() },
  openrouterBreaker: { run: (fn: () => unknown) => fn() },
}));
vi.mock("../../server/lib/responseAnalyzer", () => ({
  analyzeResponse: vi.fn().mockResolvedValue({ brands: [], tracked: {}, untracked: [] }),
  deriveSentiment: vi.fn(() => "positive"),
}));
vi.mock("../../server/lib/brandMatcher", () => ({
  detectBrandAndCompetitors: vi.fn(() => ({
    brand: { matched: false, hitVariants: [], positions: [] },
    competitors: [],
  })),
  matchEntity: vi.fn(() => ({ matched: false, hitVariants: [], positions: [] })),
}));
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "Acme is a fine tool." } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      },
    };
  },
}));

import { runBrandPrompts } from "../../server/citationChecker";

const BRAND = {
  id: "brand-1",
  name: "Acme",
  companyName: null,
  nameVariations: [],
  website: null,
  userId: null,
  industry: null,
  description: null,
};

const PROMPT = { id: "prompt-1", brandId: "brand-1", prompt: "Which tools should I use?" };

function configureFullRun() {
  storageMock.getBrandById.mockResolvedValue(BRAND);
  storageMock.getBrandPromptsByBrandId.mockResolvedValue([PROMPT]);
  storageMock.createCitationRun.mockResolvedValue({ id: "run-new" });
  storageMock.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  storageMock.getCompetitors.mockResolvedValue([]);
  storageMock.getTrackedContentUrlsByBrandId.mockResolvedValue([]);
  storageMock.createGeoRanking.mockResolvedValue({
    id: "ranking-1",
    brandPromptId: PROMPT.id,
    aiPlatform: "ChatGPT",
    isCited: 0,
  });
  storageMock.updateCitationRun.mockResolvedValue(undefined);
  storageMock.getActiveCitationRuns.mockResolvedValue([]);
  storageMock.countAutomaticCitationRunsSince.mockResolvedValue(0);
}

beforeEach(() => {
  Object.values(storageMock).forEach((fn) => fn.mockReset());
  Object.values(loggerMock).forEach((fn) => fn.mockReset());
  configureFullRun();
});

describe("runBrandPrompts inline reap: staleness by last progress, not startedAt", () => {
  it("does NOT reap - and refuses the automatic attempt instead - a run whose last progress is recent even though startedAt is hours old", async () => {
    storageMock.getActiveCitationRuns.mockResolvedValue([
      {
        id: "run-live",
        startedAt: new Date(Date.now() - 5 * 60 * 60_000), // 5 hours old
        lastAdvanceStartedAt: new Date(Date.now() - 60_000), // progressed 1 min ago
        progressPct: 40,
        status: "running",
      },
    ]);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "cron" });

    expect(storageMock.updateCitationRun).not.toHaveBeenCalled();
    expect(storageMock.createCitationRun).not.toHaveBeenCalled();
    expect(result).toEqual({
      totalChecks: 0,
      totalCited: 0,
      rankings: [],
      runId: null,
      done: false,
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: "brand-1", reason: "active_run_in_progress" }),
      "citation.run.automatic_refused",
    );
  });

  it("reaps a run whose last progress is older than the threshold and permits the next automatic run", async () => {
    storageMock.getActiveCitationRuns.mockResolvedValue([
      {
        id: "run-stale",
        startedAt: new Date(Date.now() - 6 * 60 * 60_000),
        lastAdvanceStartedAt: new Date(Date.now() - 5 * 60 * 60_000), // 5h since last progress
        progressPct: 10,
        status: "running",
      },
    ]);
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(0);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "cron" });

    expect(storageMock.updateCitationRun).toHaveBeenCalledWith(
      "run-stale",
      expect.objectContaining({ status: "failed" }),
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: "brand-1", reapedRunId: "run-stale" }),
      "citation.run.stale_active_reaped",
    );
    expect(storageMock.createCitationRun).toHaveBeenCalledOnce();
    expect(result.done).toBe(true);
  });

  it("falls back to startedAt when lastAdvanceStartedAt is NULL - not stale inside the threshold", async () => {
    storageMock.getActiveCitationRuns.mockResolvedValue([
      {
        id: "run-legacy",
        startedAt: new Date(Date.now() - 30_000), // 30s old, well inside 240min
        lastAdvanceStartedAt: null,
        progressPct: 0,
        status: "running",
      },
    ]);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], {
      triggeredBy: "auto_onboarding",
    });

    expect(storageMock.updateCitationRun).not.toHaveBeenCalled();
    expect(storageMock.createCitationRun).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
  });

  it("falls back to startedAt when lastAdvanceStartedAt is NULL - stale past the threshold", async () => {
    storageMock.getActiveCitationRuns.mockResolvedValue([
      {
        id: "run-legacy-stale",
        startedAt: new Date(Date.now() - 5 * 60 * 60_000), // 5h old, past 240min
        lastAdvanceStartedAt: null,
        progressPct: 0,
        status: "running",
      },
    ]);
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(0);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], {
      triggeredBy: "auto_onboarding",
    });

    expect(storageMock.updateCitationRun).toHaveBeenCalledWith(
      "run-legacy-stale",
      expect.objectContaining({ status: "failed" }),
    );
    expect(result.done).toBe(true);
  });
});

describe("both reap sites agree on the same input", () => {
  it("citationChecker's inline reap calls the exact same predicate reconcileOrphanCitationRuns's SQL threshold is derived from", async () => {
    // This is the structural guarantee against drift: citationChecker.ts
    // imports and calls isRunStaleSinceLastProgress directly rather than
    // recomputing its own age comparison. Prove it by feeding the same
    // fixture through the real predicate (already exercised in Part 1)
    // and through the inline reap, and confirming they agree at the exact
    // boundary the predicate defines.
    const boundaryRun = {
      id: "run-boundary",
      startedAt: new Date(Date.now() - 10 * 60 * 60_000),
      // 1ms past the shared threshold - the predicate says stale.
      lastAdvanceStartedAt: new Date(Date.now() - STALE_SINCE_LAST_PROGRESS_MS - 1),
      progressPct: 50,
      status: "running",
    };
    expect(isRunStaleSinceLastProgress(boundaryRun)).toBe(true);

    storageMock.getActiveCitationRuns.mockResolvedValue([boundaryRun]);
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(0);
    await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "cron" });

    // The inline reap reached the same verdict as the shared predicate:
    // it reaped the row instead of refusing the call.
    expect(storageMock.updateCitationRun).toHaveBeenCalledWith(
      "run-boundary",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
