// Daily cron orchestrator scaffolding, extracted from server/routes/cron.ts
// as the last piece of the B7 service-layer split for that file.
//
// This module owns the budget-tracking mechanics - the Orchestrator class,
// the per-step deadline math, and the STEP_CAPS_MS budget table. It does NOT
// own step sequencing (which steps run, in what order, gated on which
// day-of-week or env var): that is orchestration policy specific to the
// /api/cron/daily-orchestrator route and stays in server/routes/cron.ts,
// which imports Orchestrator and ORCHESTRATOR_BUDGET_MS from here and calls
// `orch.run("step-name", fn)` once per step, in sequence.
//
// tests/unit/schedulerOrchestratorParity.test.ts imports STEP_CAPS_MS
// directly (real data, not a source-text scrape) to check that the daily
// orchestrator has a budget cap for every step it actually runs, and drives
// the real HTTP route to observe which steps that is.

import { logger } from "../lib/logger";
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
export const ORCHESTRATOR_BUDGET_MS = getOrchestratorBudget();

// Per-step soft caps. The step runs against a deadline = min(stepCap,
// remaining-orchestrator-budget). Heavy iterations honour the deadline
// internally and bail mid-loop.
export const STEP_CAPS_MS = {
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
  // Ops health check: a handful of cheap, indexed reads (api_costs,
  // outbox_commands, system_state, citation_runs). Same order of magnitude
  // as the other cheap housekeeping steps above.
  "ops-health-check": 5_000,
} as const;

export type StepName = keyof typeof STEP_CAPS_MS;

export type StepResult = {
  step: string;
  ok: boolean;
  durationMs: number;
  skipped?: boolean;
  error?: string;
  detail?: unknown;
};

export class Orchestrator {
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
