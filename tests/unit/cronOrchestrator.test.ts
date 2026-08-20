// Coverage for the daily cron orchestrator's auth gate and step
// scheduling. The Orchestrator class budgets time across steps and
// skips remaining work when the wall-clock budget is exhausted; we
// verify that contract here without exercising the underlying jobs.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

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
  // Both used to be scheduler-only jobs with no orchestrator step, so they
  // never needed stubbing here. They are orchestrator steps now - without
  // DISABLE_IN_PROCESS_SCHEDULER they would otherwise never run at all.
  deleteOldTourEvents: vi.fn(async () => 0),
  detectFactScrapeFailureRate: vi.fn(async () => ({ alerted: 0 })),
  runBrandActivationSweep: vi.fn(async () => ({ processed: 0, total: 0 })),
  dbSelect: vi.fn(),
}));

// Stubbed for the same reason as the modules below, plus one of its own: it
// imports competitorDiscovery, which constructs an OpenAI client at module
// scope. Without this the whole suite fails to import, before any
// beforeEach could set OPENAI_API_KEY.
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
// The reverification + events-prune steps were added 2026-05-28. Their
// imports happen at runtime inside the orchestrator (via `await
// import(...)`) so vitest's auto-resolver picks the real module. Stub
// each so we don't need a live DATABASE_URL during the unit test.
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
// llm_jobs drain/prune steps (added 2026-05-28). Same pattern as
// reverify - orchestrator dynamically imports llmJobs at runtime.
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
    // events-prune step calls db.execute(sql`DELETE ...`) directly.
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
  url = "/api/cron/daily-orchestrator",
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url,
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
  // The fact-reverification-batch step constructs an inline OpenAI
  // client which requires this env var, even though we mock the
  // batch fn itself (the constructor still runs).
  if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = "sk-test";
});

describe("cron orchestrator", () => {
  it("rejects requests without CRON_SECRET when none is configured", async () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const app = buildApp();
    const { status, body } = await callOrchestrator(app);
    expect(status).toBe(401);
    expect(body).toMatchObject({ success: false });
    process.env.CRON_SECRET = prev;
  });

  it("rejects requests with the wrong bearer", async () => {
    process.env.CRON_SECRET = "right";
    const app = buildApp();
    const { status } = await callOrchestrator(app, { authorization: "Bearer wrong" });
    expect(status).toBe(401);
  });

  it("accepts the Vercel-style Authorization: Bearer header", async () => {
    process.env.CRON_SECRET = "secret";
    const app = buildApp();
    const { status, body } = await callOrchestrator(app, {
      authorization: "Bearer secret",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, results: expect.any(Array) });
    expect(stubs.runAccountPurgeJob).toHaveBeenCalled();
    expect(stubs.runAutoCitationJob).toHaveBeenCalled();
  });

  it("accepts the x-cron-secret header for manual triggers", async () => {
    process.env.CRON_SECRET = "secret";
    const app = buildApp();
    const { status } = await callOrchestrator(app, { "x-cron-secret": "secret" });
    expect(status).toBe(200);
  });

  it("accepts the cron secret on the fact scrape backstop", async () => {
    process.env.CRON_SECRET = "secret";
    const app = buildApp();
    const { status } = await callOrchestrator(
      app,
      { authorization: "Bearer secret" },
      "/api/cron/fact-scrape-backstop",
    );

    expect(status).toBe(200);
    expect(stubs.runFactScrapeBackstop).toHaveBeenCalledOnce();
  });

  it("rejects the wrong secret on the fact scrape backstop", async () => {
    process.env.CRON_SECRET = "secret";
    const app = buildApp();
    const { status } = await callOrchestrator(
      app,
      { authorization: "Bearer wrong" },
      "/api/cron/fact-scrape-backstop",
    );

    expect(status).toBe(401);
    expect(stubs.runFactScrapeBackstop).not.toHaveBeenCalled();
  });

  it("includes per-step results with ok/error fields", async () => {
    process.env.CRON_SECRET = "secret";
    stubs.runAutoCitationJob.mockRejectedValueOnce(new Error("boom"));
    const app = buildApp();
    const { body } = await callOrchestrator(app, { authorization: "Bearer secret" });
    const autoStep = body.results.find((r: any) => r.step === "auto-citation");
    expect(autoStep).toMatchObject({ ok: false, error: expect.stringContaining("boom") });
    // Other steps still ran despite the failure.
    const purgeStep = body.results.find((r: any) => r.step === "account-purge");
    expect(purgeStep.ok).toBe(true);
  });
});
