// Daily cron orchestrator (Vercel migration).
//
// Vercel Hobby allows a single daily cron entry. All previously-discrete
// scheduler jobs (account purge, brand purge, auto-citation, weekly scans,
// monthly fact refresh, weekly digest fallback, weekly catchup kickoff,
// legacy weekly report) collapse into this one endpoint.
//
// Function timeout is 60s on Hobby (configured in vercel.json). The
// orchestrator tracks a wall-clock budget and:
//   - skips remaining steps when the budget is gone
//   - propagates a per-step deadline into the heavy steps so they can
//     bail out cleanly mid-iteration without orphaning state
// Jobs that didn't complete today retain their per-brand "lastXxxAt"
// timestamps and naturally roll forward to the next cron tick.
//
// Auth: either an Authorization: Bearer <CRON_SECRET> header (Vercel cron
// auto-injects this) OR an x-cron-secret header (manual / external trigger).

import type { Express, Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  runAccountPurgeJob,
  runBrandPurgeJob,
  runAutoCitationJob,
  runCompetitorDiscoveryJob,
  runMentionScanJob,
  runListicleScanJob,
  runWeeklyCatchupKickoff,
  runWeeklyDigestAggregator,
  runWeeklyReportJob,
} from "../scheduler";
import { runFactScrapeBackstop } from "../lib/factAgent/v2/factScrapeBackstop";
import { runMonthlyFactRefresh } from "../lib/factAgent/v2/runMonthlyRefresh";
import { runWeeklySummary } from "../lib/factAgent/v2/weeklySummary";
import { reconcileOrphanCitationRuns } from "../lib/citationReconciliation";
import { resumeInFlightAutopilots } from "../lib/onboardingAutopilot";
import { storage } from "../storage";
import { refundArticleQuota } from "../lib/usageLimit";
import { runArticleSlice } from "../contentGenerationWorker";
import { setupStripeProducts } from "../setupProducts";
import { advanceCitationRun } from "../citationChecker";
import { db } from "../db";
import * as schema from "@shared/schema";
import { and, inArray, lt } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";

import { captureAndFlush } from "../lib/sentryReport";
// Total wall-clock budget for the orchestrator. Function timeout is 60s
// on Hobby; we leave 5s of headroom so the response can finalize.
const ORCHESTRATOR_BUDGET_MS = 55_000;

// Per-step soft caps. The step runs against a deadline = min(stepCap,
// remaining-orchestrator-budget). Heavy iterations honour the deadline
// internally and bail mid-loop.
const STEP_CAPS_MS = {
  "fail-stuck-content-jobs": 5_000,
  "reconcile-orphan-citation-runs": 5_000,
  "resume-in-flight-autopilots": 10_000,
  "drain-pending-content-jobs": 8_000,
  "drain-pending-citation-runs": 10_000,
  "account-purge": 5_000,
  "brand-purge": 5_000,
  "chatbot-prune": 5_000,
  "stripe-products-setup": 5_000,
  "auto-citation": 30_000,
  "competitor-discovery": 30_000,
  "mention-scan": 30_000,
  "listicle-scan": 30_000,
  "weekly-catchup-kickoff": 5_000,
  "weekly-digest-aggregator": 10_000,
  "weekly-report-legacy": 20_000,
  "fact-scrape-backstop": 30_000,
  "v2-lifecycle-cleanup": 30_000,
  "v2-monthly-fact-refresh": 50_000,
  "v2-weekly-summary": 20_000,
} as const;

type StepName = keyof typeof STEP_CAPS_MS;

type StepResult = {
  step: string;
  ok: boolean;
  durationMs: number;
  skipped?: boolean;
  error?: string;
  detail?: unknown;
};

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    if (authHeader.slice(7) === secret) return true;
  }
  const customHeader = req.headers["x-cron-secret"];
  if (typeof customHeader === "string" && customHeader === secret) return true;
  return false;
}

class Orchestrator {
  readonly budgetUntilMs: number;
  readonly results: StepResult[] = [];
  constructor(budgetMs: number) {
    this.budgetUntilMs = Date.now() + budgetMs;
  }
  remainingMs(): number {
    return Math.max(0, this.budgetUntilMs - Date.now());
  }
  outOfBudget(): boolean {
    // Stop scheduling new steps once we have less than 1s left.
    return this.remainingMs() < 1_000;
  }
  async run<T>(step: StepName, fn: (deadlineMs: number) => Promise<T>): Promise<void> {
    if (this.outOfBudget()) {
      this.results.push({
        step,
        ok: true,
        durationMs: 0,
        skipped: true,
      });
      return;
    }
    const cap = STEP_CAPS_MS[step];
    const deadlineMs = Math.min(this.budgetUntilMs, Date.now() + cap);
    const start = Date.now();
    try {
      const detail = await fn(deadlineMs);
      this.results.push({
        step,
        ok: true,
        durationMs: Date.now() - start,
        detail,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, step }, "cron.orchestrator: step failed");
      captureAndFlush(err, { tags: { source: "cron.orchestrator", step } });
      this.results.push({
        step,
        ok: false,
        durationMs: Date.now() - start,
        error: message.slice(0, 500),
      });
    }
  }
}

// Drain pending content_generation_jobs whose /advance lock has expired.
// Runs ONE slice for the oldest available job per cron tick — multiple
// jobs in serial would blow the budget and the next cron tick picks up
// any remaining stragglers.
async function drainPendingContentJobs(
  deadlineMs: number,
): Promise<{ progressed: number; completed: number }> {
  const jobs = await storage.listAdvanceablePendingJobs(1);
  let progressed = 0;
  let completed = 0;
  for (const j of jobs) {
    if (Date.now() >= deadlineMs - 500) break;
    try {
      const claimed = await storage.claimContentJobForSlice(j.id, 30);
      if (!claimed) continue;
      const sliceDeadline = Math.min(deadlineMs - 500, Date.now() + 7000);
      const outcome = await runArticleSlice(j.id, sliceDeadline);
      progressed += 1;
      if (outcome.done && outcome.status === "succeeded") completed += 1;
    } catch (err) {
      logger.warn({ err, jobId: j.id }, "cron: drain content job slice failed");
    }
  }
  return { progressed, completed };
}

// Drain in-progress citation runs that no longer have a browser polling
// /advance. Picks the oldest still-active run with a stale started_at and
// drives one slice. Bounded to a single run per cron tick.
async function drainPendingCitationRuns(
  deadlineMs: number,
): Promise<{ progressed: boolean; runId?: string; status?: string }> {
  // citation_runs has no updated_at column, but startedAt is set on
  // creation. Anything still active 30s after startedAt is a candidate
  // for the drain step (typical full sweep is ~30-60s; the orphan
  // reconciler picks up runs older than 5 minutes as failed).
  const stale = await db
    .select({ id: schema.citationRuns.id })
    .from(schema.citationRuns)
    .where(
      and(
        inArray(schema.citationRuns.status, ["pending", "running"]),
        lt(schema.citationRuns.startedAt, new Date(Date.now() - 30_000)),
      ),
    )
    .limit(1);

  if (stale.length === 0) return { progressed: false };
  const runId = stale[0].id;
  const sliceDeadline = Math.min(deadlineMs - 500, Date.now() + 8000);
  const result = await advanceCitationRun(runId, sliceDeadline);
  return { progressed: true, runId, status: result.status };
}

async function failStuckContentJobsForOrchestrator(): Promise<{ failed: number }> {
  const stale = await storage.failStuckContentJobs(60);
  for (const j of stale) {
    try {
      if (j.articleId) await storage.setArticleFailed(j.articleId);
      await refundArticleQuota(j.userId, j.id, "timeout");
    } catch (err) {
      logger.warn({ err, jobId: j.id }, "cron: stuck-job refund/reset failed");
    }
  }
  return { failed: stale.length };
}

export function setupCronRoutes(app: Express): void {
  app.post(
    "/api/cron/daily-orchestrator",
    asyncHandler(async (req: Request, res: Response) => {
      if (!isCronAuthorized(req)) {
        return res.status(401).json({ success: false, error: "Not authorized" });
      }

      const today = new Date();
      const dow = today.getUTCDay();
      const dom = today.getUTCDate();
      const isMonday = dow === 1;
      const isSunday = dow === 0;

      const orch = new Orchestrator(ORCHESTRATOR_BUDGET_MS);

      // Cheap maintenance first — these are millisecond-scale and run
      // unconditionally so orphans get reconciled even on a fully-loaded
      // cron tick.
      await orch.run("fail-stuck-content-jobs", () => failStuckContentJobsForOrchestrator());
      await orch.run("reconcile-orphan-citation-runs", () => reconcileOrphanCitationRuns());
      await orch.run("resume-in-flight-autopilots", (deadline) =>
        resumeInFlightAutopilots(deadline),
      );
      await orch.run("drain-pending-content-jobs", (deadline) => drainPendingContentJobs(deadline));
      await orch.run("drain-pending-citation-runs", (deadline) =>
        drainPendingCitationRuns(deadline),
      );

      // v2 backstop: completes any run abandoned by the client. Runs once a day
      // here (Hobby cron limit); when on Pro we'll also have a dedicated
      // every-5-min cron at /api/cron/fact-scrape-backstop.
      await orch.run("fact-scrape-backstop", () => runFactScrapeBackstop());

      // v2 lifecycle cleanup: prune stale fact-scrape rows to keep table sizes
      // in check. Retention windows: pages=7d, runs=30d, logs=90d; cache and
      // concurrency slots expire by their own TTL columns.
      await orch.run("v2-lifecycle-cleanup", async () => {
        const pages = await storage.deleteOldFactScrapePages(7);
        const runs = await storage.deleteOldFactScrapeRuns(30);
        const logs = await storage.deleteOldFactScrapeLogs(90);
        const cache = await storage.deleteExpiredFactScrapeCache();
        const slots = await storage.deleteExpiredLlmConcurrencySlots();
        logger.info({ pages, runs, logs, cache, slots }, "v2-lifecycle-cleanup: deleted rows");
      });

      // Monthly fact refresh: finds brands that haven't been re-scraped in
      // 30+ days and runs the full v2 pipeline for up to MAX_BRANDS_PER_TICK.
      // Subsequent ticks pick up the next batch automatically.
      await orch.run("v2-monthly-fact-refresh", (deadline) => runMonthlyFactRefresh(deadline));

      // Weekly: run on Mondays only (UTC).
      if (new Date().getUTCDay() === 1) {
        await orch.run("v2-weekly-summary", async () => {
          await runWeeklySummary();
        });
      }

      // Daily housekeeping (cheap).
      await orch.run("account-purge", () => runAccountPurgeJob());
      await orch.run("brand-purge", () => runBrandPurgeJob());
      await orch.run("chatbot-prune", async () => {
        return await storage.pruneChatbotMessages();
      });

      // Stripe product setup — was on boot, moved here so first Vercel
      // deploy doesn't need a manual sync. setupStripeProducts is
      // idempotent (skips existing products).
      if (process.env.STRIPE_SECRET_KEY) {
        await orch.run("stripe-products-setup", () => setupStripeProducts());
      }

      // Heavy iterations — pass the per-step deadline so they bail out of
      // their per-brand loop when budget runs low. Brands not processed
      // today carry their old `lastXxxAt` timestamps and get picked up on
      // the next cron tick.
      await orch.run("auto-citation", (deadline) => runAutoCitationJob(deadline));

      if (isMonday) {
        await orch.run("competitor-discovery", (deadline) => runCompetitorDiscoveryJob(deadline));
        await orch.run("mention-scan", (deadline) => runMentionScanJob(deadline));
        await orch.run("listicle-scan", (deadline) => runListicleScanJob(deadline));
        await orch.run("weekly-catchup-kickoff", () => runWeeklyCatchupKickoff());
      }

      // Lazy-eval covers the per-user case; sweep catches lambda-killed
      // weekly_catchup completions whose post-hook didn't fire.
      await orch.run("weekly-digest-aggregator", () => runWeeklyDigestAggregator());

      if (isSunday) {
        await orch.run("weekly-report-legacy", () => runWeeklyReportJob());
      }

      const failedSteps = orch.results.filter((r) => !r.ok).map((r) => r.step);
      const skippedSteps = orch.results.filter((r) => r.skipped).map((r) => r.step);
      logger.info(
        {
          steps: orch.results.length,
          failed: failedSteps.length,
          skipped: skippedSteps.length,
          dow,
          dom,
          durationMs: ORCHESTRATOR_BUDGET_MS - orch.remainingMs(),
        },
        "cron.orchestrator complete",
      );

      res.json({
        success: failedSteps.length === 0,
        ranAt: today.toISOString(),
        dow,
        dom,
        skippedDueToBudget: skippedSteps,
        results: orch.results,
      });
    }),
  );

  // Standalone 5-min backstop. Vercel Hobby may reject this schedule at deploy
  // time (Hobby allows only daily crons). When that happens, the
  // daily-orchestrator already calls runFactScrapeBackstop as a fallback;
  // this endpoint is here for when the project upgrades to Pro.
  app.all(
    "/api/cron/fact-scrape-backstop",
    asyncHandler(async (req: Request, res: Response) => {
      if (!isCronAuthorized(req)) {
        return res.status(401).json({ success: false, error: "Not authorized" });
      }
      try {
        const result = await runFactScrapeBackstop();
        return res.status(200).json({ success: true, ...result });
      } catch (err) {
        logger.error({ err }, "fact-scrape-backstop cron failed");
        return res.status(500).json({ success: false, error: (err as Error).message });
      }
    }),
  );
}
