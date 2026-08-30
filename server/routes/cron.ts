// Daily cron orchestrator (Vercel migration).
//
// Vercel Hobby allows a single daily cron entry. All previously-discrete
// scheduler jobs (account purge, brand purge, auto-citation, brand activation,
// fact-sheet refresh, weekly digest fallback, weekly catchup kickoff, legacy
// weekly report) collapse into this one endpoint.
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
//
// The step BODIES (drain/reap workers, retention prunes, the fact
// reverification batch, the auth check) live in server/services/cron*.ts -
// extracted as part of the B7 service-layer split. The orchestrator itself
// (the Orchestrator class, the STEP_CAPS_MS budget table, and every
// orch.run step-registration call below) stays here:
// tests/unit/schedulerOrchestratorParity.test.ts reads this file's source
// text directly and requires both the step names and their budget caps to
// be declared in this file.

import type { Express, Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  runAccountPurgeJob,
  runBrandPurgeJob,
  runAutoCitationJob,
  runWeeklyCatchupKickoff,
  runWeeklyDigestAggregator,
  runWeeklyReportJob,
  detectFactScrapeFailureRate,
} from "../scheduler";
import { runTourEventsCleanupJob } from "../lib/tourCleanup";
import { runBrandActivationSweep } from "../lib/brandActivation";
import { runFactScrapeBackstop } from "../lib/factAgent/v2/factScrapeBackstop";
import { runFactSheetRefresh } from "../lib/factAgent/v2/runFactSheetRefresh";
import { runWeeklySummary } from "../lib/factAgent/v2/weeklySummary";
import { reconcileOrphanCitationRuns } from "../lib/citationReconciliation";
import { resumeInFlightAutopilots } from "../lib/onboardingAutopilot";
import { storage } from "../storage";
import { setupStripeProducts } from "../setupProducts";
import { asyncHandler } from "../lib/asyncHandler";
import { runContentCostOutboxDrain } from "../outbox/contentCostOutboxDrain";
import { isCronAuthorized } from "../services/cronAuth";
import {
  drainPendingContentJobs,
  drainPendingCitationRuns,
  drainPendingPerceptionProbeRuns,
  failStuckContentJobsForOrchestrator,
  failStaleScanJobsForOrchestrator,
} from "../services/cronMaintenance";
import {
  runV2LifecycleCleanup,
  runSignalsRetentionPrune,
  runFactScrapeEventsPrune,
  runLlmJobsDrainStep,
  runLlmJobsPruneStep,
} from "../services/cronRetention";
import { runFactReverificationBatchStep } from "../services/cronFactVerification";

import { captureAndFlush } from "../lib/sentryReport";
import { CRON_TOTAL_BUDGET_MS } from "../lib/factAgent/v2/vercelBudget";
// Total wall-clock budget for the orchestrator.
//
// Defaults to CRON_TOTAL_BUDGET_MS, derived from VERCEL_FUNCTION_BUDGET_MS so
// a Hobby (10s) vs Pro (60s) deploy inherits the right budget without code
// changes. CRON_ORCHESTRATOR_BUDGET_MS overrides it for deployments that are
// NOT serverless - the Render node-server target has no function timeout at
// all, so inheriting a 58s Vercel budget there is pure loss.
//
// It matters because the per-step caps below are ADVISORY: a step that checks
// its deadline only between units of work sails straight past its cap.
// Measured against the production database on this deploy:
// fact-reverification-batch took 244s against a 30s cap, and
// v2-fact-sheet-refresh 82s against 50s - for ONE brand. With a 58s total,
// the first such step consumes everything and every step behind it is skipped,
// every tick, silently. Ordering (cheap and gated first, open-ended last)
// limits the blast radius; a budget that matches the platform removes it.
function getOrchestratorBudget(): number {
  const raw = process.env.CRON_ORCHESTRATOR_BUDGET_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  // Upper bound keeps a runaway value from pinning a worker indefinitely.
  if (Number.isFinite(n) && n >= 10_000 && n <= 3_600_000) return n;
  return CRON_TOTAL_BUDGET_MS;
}
const ORCHESTRATOR_BUDGET_MS = getOrchestratorBudget();

// Per-step soft caps. The step runs against a deadline = min(stepCap,
// remaining-orchestrator-budget). Heavy iterations honour the deadline
// internally and bail mid-loop.
const STEP_CAPS_MS = {
  "fail-stuck-content-jobs": 5_000,
  "fail-stale-scan-jobs": 5_000,
  "reconcile-orphan-citation-runs": 5_000,
  "resume-in-flight-autopilots": 10_000,
  "drain-pending-content-jobs": 8_000,
  "drain-pending-citation-runs": 10_000,
  // One engine of a probe run is 5 grounded calls plus a judge call, and the
  // slice runner only checks the clock between engines - so the cap has to fit
  // at least one whole engine or the step can never make progress.
  "drain-pending-perception-probe-runs": 10_000,
  "content-cost-outbox-drain": 20_000,
  "account-purge": 5_000,
  "brand-purge": 5_000,
  "chatbot-prune": 5_000,
  "stripe-products-setup": 5_000,
  "auto-citation": 30_000,
  // Replaces the separate competitor-discovery / mention-scan / listicle-scan
  // steps. Those three ran behind a global Monday gate and had no per-brand
  // staleness check, so they could not simply be moved onto the hourly tick -
  // they would have re-run every brand every hour. The sweep gates each
  // sub-job, per brand, on its own weekly ledger instead. The budget is
  // generous because it now covers five producers, not one.
  "brand-activation": 45_000,
  "weekly-catchup-kickoff": 5_000,
  "weekly-digest-aggregator": 10_000,
  "weekly-report-legacy": 20_000,
  "fact-scrape-backstop": 30_000,
  "v2-lifecycle-cleanup": 30_000,
  "v2-fact-sheet-refresh": 50_000,
  "v2-weekly-summary": 20_000,
  // Phase 4 (2026-05-28): per-fact re-verification - cheaper than a
  // full re-scrape. Processes up to ~20 stale facts per tick.
  "fact-reverification-batch": 30_000,
  // Phase 1: events table retention. 90-day rolling window prevents
  // unbounded growth.
  "fact-scrape-events-prune": 5_000,
  // Vercel-Hobby substrate (2026-05-28): drain pending OpenAI
  // Responses background jobs whose clients haven't polled, and prune
  // 24h-expired job rows so the table doesn't grow unbounded.
  "llm-jobs-drain": 20_000,
  "llm-jobs-prune": 3_000,
  // Signals page retention (2026-05-28): geo_signal_runs is append-only
  // (every Analyze click writes a row) and schema_audits accumulates
  // one row per unique URL. Without these the tables grow unboundedly.
  "signals-retention-prune": 5_000,
  // Both of these run only in the in-process node-cron scheduler.
  // Keep that scheduler active until an external trigger covers these steps.
  // Otherwise tour_events grows without bound and the failure alert stops.
  "tour-events-cleanup": 5_000,
  "detect-fact-scrape-failure": 5_000,
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

export function setupCronRoutes(app: Express): void {
  app.all(
    "/api/cron/daily-orchestrator",
    asyncHandler(async (req: Request, res: Response) => {
      if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
      }

      if (!isCronAuthorized(req.headers.authorization, req.headers["x-cron-secret"])) {
        return res.status(401).json({ success: false, error: "Not authorized" });
      }

      const today = new Date();
      const dow = today.getUTCDay();
      const dom = today.getUTCDate();
      const isMonday = dow === 1;
      const isSunday = dow === 0;

      const orch = new Orchestrator(ORCHESTRATOR_BUDGET_MS);

      // Cheap maintenance first - these are millisecond-scale and run
      // unconditionally so orphans get reconciled even on a fully-loaded
      // cron tick.
      await orch.run("fail-stuck-content-jobs", () => failStuckContentJobsForOrchestrator());
      await orch.run("fail-stale-scan-jobs", () => failStaleScanJobsForOrchestrator());
      await orch.run("reconcile-orphan-citation-runs", () => reconcileOrphanCitationRuns());
      await orch.run("resume-in-flight-autopilots", (deadline) =>
        resumeInFlightAutopilots(deadline),
      );
      await orch.run("drain-pending-content-jobs", (deadline) => drainPendingContentJobs(deadline));
      await orch.run("drain-pending-citation-runs", (deadline) =>
        drainPendingCitationRuns(deadline),
      );
      await orch.run("drain-pending-perception-probe-runs", (deadline) =>
        drainPendingPerceptionProbeRuns(deadline),
      );
      await orch.run("content-cost-outbox-drain", (deadlineMs) =>
        runContentCostOutboxDrain({ maxCommands: 25, deadlineMs, leaseSeconds: 60 }),
      );

      // Both are millisecond-scale daily housekeeping, and both used to live
      // only in the in-process scheduler. They sit in the CHEAP block rather
      // than with the other daily housekeeping further down because the steps
      // below can legitimately consume the whole budget on a busy tick, and a
      // retention prune that is skipped every day never runs at all.
      await orch.run("tour-events-cleanup", () => runTourEventsCleanupJob());
      await orch.run("detect-fact-scrape-failure", () => detectFactScrapeFailureRate());

      // v2 backstop: completes any run abandoned by the client. Runs once a day
      // here (Hobby cron limit); when on Pro we'll also have a dedicated
      // every-5-min cron at /api/cron/fact-scrape-backstop.
      await orch.run("fact-scrape-backstop", () => runFactScrapeBackstop());

      // v2 lifecycle cleanup: prune stale fact-scrape rows to keep table sizes
      // in check. Retention windows: pages=7d, runs=30d, logs=90d; cache and
      // concurrency slots expire by their own TTL columns.
      await orch.run("v2-lifecycle-cleanup", () => runV2LifecycleCleanup());

      // NOTE: v2-fact-sheet-refresh used to run here. It now runs LAST - see
      // the comment on it at the bottom of this function for why.

      // NOTE: fact-reverification-batch used to run here too. Both fact steps
      // now run at the very end - see the comments on them there.

      // Vercel-Hobby LLM-jobs substrate. The mutation routes (keyword
      // discovery, FAQ generation, etc.) enqueue an llm_jobs row whose
      // OpenAI Responses run executes in background mode. The client
      // polls /api/llm-jobs/:id. If the client never comes back (closed
      // tab, mobile sleep), the cron drains the row so the user sees the
      // result on next visit. Bounded by step cap.
      await orch.run("llm-jobs-drain", (deadline) => runLlmJobsDrainStep(deadline));

      // Prune expired llm_jobs rows (24h default). Keeps the table small.
      await orch.run("llm-jobs-prune", () => runLlmJobsPruneStep());

      // Signals page retention. Two tables, two policies:
      //   - geo_signal_runs: cap to 100 rows per brand (keep the most
      //     recent 100 ran_at per brand_id; delete older). Plus a
      //     90-day hard floor so single-brand abandoned accounts
      //     don't accumulate forever.
      //   - schema_audits: drop rows older than 30 days. The route's
      //     7-day cache TTL already covers freshness; anything past
      //     that point is dead weight (one row per unique URL).
      await orch.run("signals-retention-prune", () => runSignalsRetentionPrune());

      // Phase 1 retention: 90-day rolling window on fact_scrape_events.
      // Prevents unbounded growth. Keeping recent events is cheap
      // (~100 events/run × 50 runs/day × 90 days ≈ 450K rows).
      await orch.run("fact-scrape-events-prune", () => runFactScrapeEventsPrune());

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

      // Stripe product setup - was on boot, moved here so first Vercel
      // deploy doesn't need a manual sync. setupStripeProducts is
      // idempotent (skips existing products).
      if (process.env.STRIPE_SECRET_KEY) {
        await orch.run("stripe-products-setup", () => setupStripeProducts());
      }

      // Heavy iterations - pass the per-step deadline so they bail out of
      // their per-brand loop when budget runs low. Brands not processed
      // today carry their old `lastXxxAt` timestamps and get picked up on
      // the next cron tick.
      await orch.run("auto-citation", (deadline) => runAutoCitationJob(deadline));

      // Everything the citation run does not populate: site health, mention
      // scan, listicle scan, perception scoring, competitor discovery. Runs on
      // EVERY tick and gates per brand per sub-job on a weekly ledger, so each
      // brand refreshes on the anniversary of its own creation rather than on
      // a global Monday. A brand created on a Tuesday no longer waits six days
      // for its first mention and listicle scan.
      await orch.run("brand-activation", (deadline) => runBrandActivationSweep(deadline));

      if (isMonday) {
        await orch.run("weekly-catchup-kickoff", () => runWeeklyCatchupKickoff());
      }

      // Lazy-eval covers the per-user case; sweep catches lambda-killed
      // weekly_catchup completions whose post-hook didn't fire.
      await orch.run("weekly-digest-aggregator", () => runWeeklyDigestAggregator());

      if (isSunday) {
        await orch.run("weekly-report-legacy", () => runWeeklyReportJob());
      }

      // ── Open-ended fact steps, last on purpose ──────────────────────────
      // Both walk a work queue and check their deadline only between items,
      // so both routinely overrun their caps (measured: 244s against 30s, and
      // 82s against 50s). Everything above is either cheap or per-brand gated
      // and finishes in seconds, so running these last means an overrun costs
      // only the other open-ended step - not auto-citation, not
      // brand-activation, not the day's housekeeping. Both are self-healing:
      // whatever they don't reach, they reach on the next tick.

      // Per-fact re-verification: cheaper than a full re-scrape. Hits each
      // stale fact's source URL, re-extracts ONLY that fact, and either marks
      // it verified or records drift.
      await orch.run("fact-reverification-batch", () => runFactReverificationBatchStep());

      // Weekly fact refresh: brands not re-scraped in 7+ days, full v2
      // pipeline, up to MAX_BRANDS_PER_TICK. Weekly rather than monthly
      // because hallucination detection is skipped outright for a brand with
      // no fact sheet, so a stale one empties that dashboard panel.
      //
      // RUNS LAST, DELIBERATELY. This is the most expensive step in the
      // orchestrator and the only one that reliably overruns its own cap: the
      // deadline is checked BETWEEN brands, so a single slow site blows
      // straight through it. Measured at 81.7s against a 50s cap for ONE
      // brand.
      //
      // While it sat earlier in this function it consumed the entire
      // orchestrator budget on the first tick and every step behind it -
      // auto-citation and brand-activation included - was skipped. Weekly
      // refresh made that permanent rather than occasional: at 30 days most
      // ticks found nothing stale and returned instantly, at 7 days it finds
      // work nearly every tick.
      //
      // Ordering is the fix rather than a smaller cap, because the cap is
      // advisory. Everything above is either cheap or per-brand gated, so it
      // completes in seconds and leaves the remainder to this step; and if
      // this one is starved instead, nothing breaks - it is self-healing and
      // simply refreshes the same brand on the next tick.
      await orch.run("v2-fact-sheet-refresh", (deadline) => runFactSheetRefresh(deadline));

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
      if (!isCronAuthorized(req.headers.authorization, req.headers["x-cron-secret"])) {
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
