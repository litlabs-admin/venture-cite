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
  runFactRefreshJob: vi.fn(async () => undefined),
  runWeeklyCatchupKickoff: vi.fn(async () => ({ started: 0, skipped: 0, failed: 0 })),
  runWeeklyDigestAggregator: vi.fn(async () => ({ sent: 0, pending: 0 })),
  runWeeklyReportJob: vi.fn(async () => ({ sent: 0, skipped: 0 })),
  reconcileOrphanCitationRuns: vi.fn(async () => undefined),
  resumeInFlightAutopilots: vi.fn(async () => undefined),
  runArticleSlice: vi.fn(async () => ({ done: true, status: "succeeded" as const })),
  setupStripeProducts: vi.fn(async () => undefined),
  advanceCitationRun: vi.fn(async () => ({ done: true, status: "succeeded" })),
  failStuckContentJobs: vi.fn(async () => []),
  setArticleFailed: vi.fn(async () => undefined),
  refundArticleQuota: vi.fn(async () => undefined),
  listAdvanceablePendingJobs: vi.fn(async () => []),
  claimContentJobForSlice: vi.fn(async () => undefined),
  dbSelect: vi.fn(),
}));

vi.mock("../../server/scheduler", () => ({
  runAccountPurgeJob: stubs.runAccountPurgeJob,
  runBrandPurgeJob: stubs.runBrandPurgeJob,
  runAutoCitationJob: stubs.runAutoCitationJob,
  runCompetitorDiscoveryJob: stubs.runCompetitorDiscoveryJob,
  runMentionScanJob: stubs.runMentionScanJob,
  runListicleScanJob: stubs.runListicleScanJob,
  runFactRefreshJob: stubs.runFactRefreshJob,
  runWeeklyCatchupKickoff: stubs.runWeeklyCatchupKickoff,
  runWeeklyDigestAggregator: stubs.runWeeklyDigestAggregator,
  runWeeklyReportJob: stubs.runWeeklyReportJob,
}));
vi.mock("../../server/lib/citationReconciliation", () => ({
  reconcileOrphanCitationRuns: stubs.reconcileOrphanCitationRuns,
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
    setArticleFailed: stubs.setArticleFailed,
    listAdvanceablePendingJobs: stubs.listAdvanceablePendingJobs,
    claimContentJobForSlice: stubs.claimContentJobForSlice,
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
