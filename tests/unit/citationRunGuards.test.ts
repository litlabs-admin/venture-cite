// Regression tests for two citation-run lifecycle defects recorded in
// .audit/B6/B6a-08-why-nothing-caught-it.md and
// .audit/B6/B6a-06-slice-driver-audit-jobs.md (the incident fixed in
// 569f746 left both unaddressed):
//
//   Defect A: isBrandDueForCitation only ever gates the scheduler's OWN
//   decision to call runBrandPrompts. Nothing bounded how many automatic
//   (cron / auto_onboarding) runs a brand could actually get CREATED
//   with - the onboarding autopilot path never stamps lastAutoCitationAt,
//   so it bypassed that gate entirely. Fixed by a per-brand, per-window cap
//   enforced at run creation in citationChecker.ts's runBrandPrompts,
//   independent of which caller is asking.
//
//   Defect B: citation_runs carries a partial unique index allowing one
//   active ('pending'/'running') row per brand. Run creation happens
//   BEFORE any provider call, so a run abandoned mid-flight pins that row
//   forever; every later automatic attempt has no runId to reuse, always
//   tries to INSERT, always collides (23505), and the brand silently never
//   completes another automatic run. Fixed by reaping a stale active run
//   inline at creation time, before the bound check above runs. Staleness
//   here is judged by last-progress
//   (server/lib/citationReconciliation.ts's isRunStaleSinceLastProgress /
//   STALE_SINCE_LAST_PROGRESS_MS), not by how long ago the row was
//   created - see tests/unit/citationRunStaleness.test.ts and
//   .audit/B6/B6a-12-citation-run-staleness.md for why startedAt alone was
//   wrong.
//
// Mock pattern mirrors tests/unit/citationCheckerBatchInsert.test.ts
// (full-run exercise) and tests/unit/citationChecker.kickoff.test.ts
// (creation-path only, no LLM calls needed).

import { describe, it, expect, vi, beforeEach } from "vitest";

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

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }));
vi.mock("../../server/citationJudge", () => ({ judgeCitation: vi.fn() }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({ logger: loggerMock }));
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

describe("Defect A: bound on automatic citation run creation", () => {
  it("refuses an automatic (cron) run once the per-brand window is full, and logs brandId + reason", async () => {
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(3); // at the cap

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "cron" });

    expect(result).toEqual({
      totalChecks: 0,
      totalCited: 0,
      rankings: [],
      runId: null,
      done: false,
    });
    expect(storageMock.createCitationRun).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        triggeredBy: "cron",
        reason: "automatic_rate_bound",
      }),
      "citation.run.automatic_refused",
    );
  });

  it("refuses an automatic (auto_onboarding) run once the per-brand window is full", async () => {
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(5); // well past the cap

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], {
      triggeredBy: "auto_onboarding",
    });

    expect(result.done).toBe(false);
    expect(result.runId).toBeNull();
    expect(storageMock.createCitationRun).not.toHaveBeenCalled();
  });

  it("allows a manual run past the exact same count - a human click is never bound", async () => {
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(50); // absurdly over any cap

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "manual" });

    expect(result.done).toBe(true);
    expect(storageMock.createCitationRun).toHaveBeenCalledOnce();
    // Manual never even needs to ask - it must not consult the automatic
    // counter at all, so a slow/erroring count query can never affect it.
    expect(storageMock.countAutomaticCitationRunsSince).not.toHaveBeenCalled();
  });

  it("allows a fresh brand with no run history through, on an automatic trigger", async () => {
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(0);
    storageMock.getActiveCitationRuns.mockResolvedValue([]);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "cron" });

    expect(result.done).toBe(true);
    expect(storageMock.createCitationRun).toHaveBeenCalledOnce();
    expect(storageMock.createCitationRun.mock.calls[0][0]).toMatchObject({
      brandId: "brand-1",
      triggeredBy: "cron",
    });
  });
});

describe("Defect B: a stale active run must not block automatic runs forever", () => {
  it("reaps a run with no progress for longer than the shared staleness threshold and permits the next automatic run", async () => {
    // 5 hours since last progress - past STALE_SINCE_LAST_PROGRESS_MS (4h).
    // startedAt is further back still, to make clear staleness is judged
    // by last progress, not row age - see citationRunStaleness.test.ts.
    const staleLastProgressAt = new Date(Date.now() - 5 * 60 * 60_000);
    storageMock.getActiveCitationRuns.mockResolvedValue([
      {
        id: "run-stale",
        startedAt: new Date(Date.now() - 6 * 60 * 60_000),
        lastAdvanceStartedAt: staleLastProgressAt,
        progressPct: 40,
        status: "running",
      },
    ]);
    storageMock.countAutomaticCitationRunsSince.mockResolvedValue(0);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "cron" });

    // The stale row was marked terminal before the new one was created.
    expect(storageMock.updateCitationRun).toHaveBeenCalledWith(
      "run-stale",
      expect.objectContaining({ status: "failed" }),
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: "brand-1", reapedRunId: "run-stale" }),
      "citation.run.stale_active_reaped",
    );
    // ...and the brand was allowed to proceed, not refused.
    expect(storageMock.createCitationRun).toHaveBeenCalledOnce();
    expect(result.done).toBe(true);
  });

  it("does NOT reap a run that is genuinely still in progress, and refuses the automatic attempt instead", async () => {
    const freshStartedAt = new Date(Date.now() - 30_000); // 30s old - well inside the window
    storageMock.getActiveCitationRuns.mockResolvedValue([
      { id: "run-live", startedAt: freshStartedAt, progressPct: 40, status: "running" },
    ]);

    const result = await runBrandPrompts("brand-1", ["ChatGPT"], {
      triggeredBy: "auto_onboarding",
    });

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
      expect.objectContaining({
        brandId: "brand-1",
        triggeredBy: "auto_onboarding",
        reason: "active_run_in_progress",
      }),
      "citation.run.automatic_refused",
    );
  });

  it("never even looks at active runs for a manual run - kickoff's own dedup handles that path", async () => {
    await runBrandPrompts("brand-1", ["ChatGPT"], { triggeredBy: "manual" });

    expect(storageMock.getActiveCitationRuns).not.toHaveBeenCalled();
  });
});
