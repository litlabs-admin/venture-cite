// Every job the in-process scheduler registers MUST also exist as a step in
// the daily orchestrator.
//
// An external-owner deployment sets DISABLE_IN_PROCESS_SCHEDULER and makes
// POST /api/cron/daily-orchestrator the only trigger for scheduled work.
// Render keeps that flag false until an authenticated external trigger passes
// release verification. Any job registered ONLY in the scheduler would then
// stop running with no error, failed step, or log line.
//
// This check prevents a scheduler-only job from disappearing when an
// external-owner deployment becomes active.
//
// Behavioural, not source-text: this drives the real
// POST /api/cron/daily-orchestrator handler (server/routes/cron.ts) with its
// job functions stubbed, and reads which steps actually ran from the real
// JSON response - the same `results` array a production caller sees. The
// scheduler side of the comparison comes from server/lib/schedulerJobRegistry
// - the literal object server/scheduler.ts's cronCrashGuard(...) calls
// reference, so it cannot drift from what actually gets registered. Neither
// side is read as text: an explanatory comment containing a step-name-shaped
// string cannot make this test see a step that never ran, and cannot make it
// blind to one that did.
//
// The budget-cap check is similarly grounded in the real STEP_CAPS_MS table
// (server/services/cronOrchestrator.ts) checked against the steps that
// actually ran, not against the table's own keys - a step whose orch.run(...)
// call site was deleted without removing its cap entry would still be caught
// by the scheduler-parity check above, and a step invoked with a name outside
// STEP_CAPS_MS is a TypeScript compile error (Orchestrator.run's `step`
// parameter is typed `keyof typeof STEP_CAPS_MS`), so this test's job is to
// guard the runtime shape of that contract, not to re-derive it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { SCHEDULER_JOB_NAMES } from "../../server/lib/schedulerJobRegistry";
import { STEP_CAPS_MS } from "../../server/services/cronOrchestrator";

const stubs = vi.hoisted(() => ({
  runAccountPurgeJob: vi.fn(async () => ({ purged: 0, failed: 0 })),
  runBrandPurgeJob: vi.fn(async () => ({ purged: 0, failed: 0 })),
  runAutoCitationJob: vi.fn(async () => undefined),
  runCompetitorDiscoveryJob: vi.fn(async () => undefined),
  runMentionScanJob: vi.fn(async () => undefined),
  runListicleScanJob: vi.fn(async () => undefined),
  runFactScrapeBackstop: vi.fn(async () => ({ advanced: 0, failed: 0 })),
  runFactSheetRefresh: vi.fn(async () => ({ processed: 0 })),
  runWeeklySummary: vi.fn(async () => undefined),
  runWeeklyCatchupKickoff: vi.fn(async () => ({ started: 0, skipped: 0, failed: 0 })),
  runWeeklyDigestAggregator: vi.fn(async () => ({ sent: 0, pending: 0 })),
  runWeeklyReportJob: vi.fn(async () => ({ sent: 0, skipped: 0 })),
  reconcileOrphanCitationRuns: vi.fn(async () => undefined),
  resumeInFlightAutopilots: vi.fn(async () => undefined),
  runArticleSlice: vi.fn(async () => ({ done: true, status: "succeeded" as const })),
  setupStripeProducts: vi.fn(async () => undefined),
  advanceCitationRun: vi.fn(async () => ({ done: true, status: "succeeded" })),
  failStuckContentJobs: vi.fn(async () => []),
  failStaleScanJobs: vi.fn(async () => 0),
  setArticleFailed: vi.fn(async () => undefined),
  refundArticleQuota: vi.fn(async () => undefined),
  listAdvanceablePendingJobs: vi.fn(async () => []),
  claimContentJobForSlice: vi.fn(async () => undefined),
  pruneChatbotMessages: vi.fn(async () => ({ deletedByAge: 0, deletedByCap: 0 })),
  deleteOldFactScrapePages: vi.fn(async () => 0),
  deleteOldFactScrapeRuns: vi.fn(async () => 0),
  deleteOldFactScrapeLogs: vi.fn(async () => 0),
  deleteExpiredFactScrapeCache: vi.fn(async () => 0),
  deleteExpiredLlmConcurrencySlots: vi.fn(async () => 0),
  deleteOldTourEvents: vi.fn(async () => 0),
  detectFactScrapeFailureRate: vi.fn(async () => ({ alerted: 0 })),
  runBrandActivationSweep: vi.fn(async () => ({ processed: 0, total: 0 })),
  runContentCostOutboxDrain: vi.fn(async () => ({
    claimed: 0,
    succeeded: 0,
    rescheduled: 0,
    deadLettered: 0,
    cancelled: 0,
    lostLease: 0,
    stopReason: "idle" as const,
  })),
  dbSelect: vi.fn(),
}));

// Same mock set as tests/unit/cronOrchestrator.test.ts - both files drive the
// same real HTTP route and need the same transitive dependencies stubbed out
// (DB, Supabase, OpenAI-constructing modules) to run fast and offline.
vi.mock("../../server/lib/brandActivation", () => ({
  runBrandActivationSweep: stubs.runBrandActivationSweep,
  populateBrandDashboard: vi.fn(async () => ({ ran: [], skipped: [] })),
}));

vi.mock("../../server/scheduler", () => ({
  runAccountPurgeJob: stubs.runAccountPurgeJob,
  runBrandPurgeJob: stubs.runBrandPurgeJob,
  runAutoCitationJob: stubs.runAutoCitationJob,
  runCompetitorDiscoveryJob: stubs.runCompetitorDiscoveryJob,
  runMentionScanJob: stubs.runMentionScanJob,
  runListicleScanJob: stubs.runListicleScanJob,
  runWeeklyCatchupKickoff: stubs.runWeeklyCatchupKickoff,
  runWeeklyDigestAggregator: stubs.runWeeklyDigestAggregator,
  runWeeklyReportJob: stubs.runWeeklyReportJob,
  detectFactScrapeFailureRate: stubs.detectFactScrapeFailureRate,
}));
vi.mock("../../server/lib/citationReconciliation", () => ({
  reconcileOrphanCitationRuns: stubs.reconcileOrphanCitationRuns,
}));
vi.mock("../../server/lib/factAgent/v2/factScrapeBackstop", () => ({
  runFactScrapeBackstop: stubs.runFactScrapeBackstop,
}));
vi.mock("../../server/lib/factAgent/v2/runFactSheetRefresh", () => ({
  runFactSheetRefresh: stubs.runFactSheetRefresh,
}));
vi.mock("../../server/lib/factAgent/v2/weeklySummary", () => ({
  runWeeklySummary: stubs.runWeeklySummary,
}));
vi.mock("../../server/lib/factAgent/v2/reverifyFact", () => ({
  runReverificationBatch: vi.fn(async () => ({
    attempted: 0,
    verified: 0,
    drift: 0,
    unreachable: 0,
  })),
}));
vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({
  CRON_TOTAL_BUDGET_MS: 55_000,
  LLM_CALL_TIMEOUT_MS: 20_000,
  cronStepBudget: (w: number = 1) => Math.floor(55_000 * w),
}));
vi.mock("../../server/lib/llmJobs", () => ({
  drainPendingLlmJobs: vi.fn(async () => ({
    attempted: 0,
    finalized: 0,
    stillRunning: 0,
    failed: 0,
  })),
  pruneExpiredLlmJobs: vi.fn(async () => 0),
  enqueueLlmJob: vi.fn(),
  pollLlmJob: vi.fn(),
  registerLlmJobHandler: vi.fn(),
}));
vi.mock("../../server/lib/onboardingAutopilot", () => ({
  resumeInFlightAutopilots: stubs.resumeInFlightAutopilots,
  runOnboardingAutopilot: vi.fn(),
}));
vi.mock("../../server/contentGenerationWorker", () => ({
  runArticleSlice: stubs.runArticleSlice,
}));
vi.mock("../../server/outbox/contentCostOutboxDrain", () => ({
  runContentCostOutboxDrain: stubs.runContentCostOutboxDrain,
}));
vi.mock("../../server/setupProducts", () => ({
  setupStripeProducts: stubs.setupStripeProducts,
}));
vi.mock("../../server/citationChecker", () => ({
  advanceCitationRun: stubs.advanceCitationRun,
}));
vi.mock("../../server/lib/usageLimit", () => ({
  refundArticleQuota: stubs.refundArticleQuota,
  isUsageLimitError: () => false,
  withArticleQuota: vi.fn(),
  withBrandQuota: vi.fn(),
}));
vi.mock("../../server/storage", () => ({
  storage: {
    failStuckContentJobs: stubs.failStuckContentJobs,
    failStaleScanJobs: stubs.failStaleScanJobs,
    setArticleFailed: stubs.setArticleFailed,
    listAdvanceablePendingJobs: stubs.listAdvanceablePendingJobs,
    claimContentJobForSlice: stubs.claimContentJobForSlice,
    pruneChatbotMessages: stubs.pruneChatbotMessages,
    deleteOldFactScrapePages: stubs.deleteOldFactScrapePages,
    deleteOldFactScrapeRuns: stubs.deleteOldFactScrapeRuns,
    deleteOldFactScrapeLogs: stubs.deleteOldFactScrapeLogs,
    deleteExpiredFactScrapeCache: stubs.deleteExpiredFactScrapeCache,
    deleteExpiredLlmConcurrencySlots: stubs.deleteExpiredLlmConcurrencySlots,
    deleteOldTourEvents: stubs.deleteOldTourEvents,
  },
}));
vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: stubs.dbSelect,
        }),
      }),
    }),
    execute: vi.fn(async () => ({ rowCount: 0 })),
  },
  pool: {},
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

const { setupCronRoutes } = await import("../../server/routes/cron");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  setupCronRoutes(app);
  return app;
}

async function callOrchestrator(
  app: express.Express,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: "/api/cron/daily-orchestrator",
      headers: {
        host: "localhost",
        "content-type": "application/json",
        ...headers,
      },
      body: {},
    } as unknown as express.Request;
    let statusCode = 200;
    let body: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(payload: any) {
        body = payload;
        resolve({ status: statusCode, body });
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        if (body === null) resolve({ status: statusCode, body: null });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  for (const fn of Object.values(stubs)) {
    if (typeof (fn as any).mockClear === "function") (fn as any).mockClear();
  }
  stubs.dbSelect.mockResolvedValue([]);
  if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = "sk-test";
  process.env.CRON_SECRET = "secret";
  // Forces the Monday/Sunday-gated steps and the stripe-setup step to run on
  // every tick this file drives, so a single request captures the full set
  // of steps the orchestrator is capable of running, not just today's subset.
  process.env.STRIPE_SECRET_KEY = "sk-test";
});

/**
 * Drives the real /api/cron/daily-orchestrator handler with the system
 * clock pinned to `isoDate`, and returns the step names from the real JSON
 * response - i.e. what the orchestrator actually ran on that tick, not a
 * static list.
 */
async function runOrchestratorOn(isoDate: string): Promise<{
  steps: string[];
  skipped: string[];
}> {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDate));
  try {
    const app = buildApp();
    const { status, body } = await callOrchestrator(app, { authorization: "Bearer secret" });
    expect(status).toBe(200);
    const steps = (body.results as Array<{ step: string; skipped?: boolean }>).map((r) => r.step);
    return { steps, skipped: body.skippedDueToBudget as string[] };
  } finally {
    vi.useRealTimers();
  }
}

describe("scheduler ↔ orchestrator job parity", () => {
  // 2026-08-31 is a Monday (UTC), 2026-08-30 is a Sunday (UTC) - see the
  // date-math check below, which fails loudly if that ever stops being true
  // instead of silently under-covering the Monday/Sunday-gated steps.
  const MONDAY = "2026-08-31T12:00:00Z";
  const SUNDAY = "2026-08-30T12:00:00Z";

  it("sanity: the fixture dates actually land on the days this test relies on", () => {
    expect(new Date(MONDAY).getUTCDay()).toBe(1);
    expect(new Date(SUNDAY).getUTCDay()).toBe(0);
  });

  it("finds jobs on both sides (guards the fixtures themselves)", async () => {
    // If the scheduler registry or the orchestrator route stopped producing
    // real names (e.g. every mock started throwing and every step failed
    // silently) the parity assertion below would pass vacuously. This mirrors
    // the length checks the old source-text version used for the same
    // reason, but counts real registered/executed names instead of regex
    // matches.
    const schedulerJobs = Object.values(SCHEDULER_JOB_NAMES);
    expect(schedulerJobs.length).toBeGreaterThan(5);

    const monday = await runOrchestratorOn(MONDAY);
    expect(monday.skipped).toEqual([]);
    expect(monday.steps.length).toBeGreaterThan(15);
  });

  it("registers every in-process cron job as an orchestrator step", async () => {
    const monday = await runOrchestratorOn(MONDAY);
    const sunday = await runOrchestratorOn(SUNDAY);
    expect(monday.skipped).toEqual([]);
    expect(sunday.skipped).toEqual([]);

    const executedSteps = new Set([...monday.steps, ...sunday.steps]);

    // The legacy weekly report is the one intentional rename: the scheduler
    // calls it "weekly-report", the orchestrator "weekly-report-legacy".
    // Same function (runWeeklyReportJob), same debounce key.
    const alias: Record<string, string> = { "weekly-report": "weekly-report-legacy" };

    const schedulerJobs = Object.values(SCHEDULER_JOB_NAMES);
    const orphaned = schedulerJobs.filter((j) => !executedSteps.has(alias[j] ?? j));

    expect(
      orphaned,
      "scheduler-only jobs never run when DISABLE_IN_PROCESS_SCHEDULER is set",
    ).toEqual([]);
  });

  it("gives every orchestrator step a budget cap", async () => {
    // A step with no STEP_CAPS_MS entry gets `cap === undefined`, so its
    // deadline becomes NaN and Math.min(budget, NaN) is NaN - the step would
    // run with a meaningless deadline. Checked against the steps that
    // ACTUALLY ran (not against STEP_CAPS_MS's own keys, which would make
    // this tautological and blind to a stale cap entry left behind after its
    // orch.run(...) call site was deleted).
    const monday = await runOrchestratorOn(MONDAY);
    const sunday = await runOrchestratorOn(SUNDAY);
    const executedSteps = new Set([...monday.steps, ...sunday.steps]);

    const uncapped = [...executedSteps].filter(
      (step) => !Object.prototype.hasOwnProperty.call(STEP_CAPS_MS, step),
    );
    expect(uncapped).toEqual([]);
  });
});
