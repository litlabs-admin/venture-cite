// Operational health check.
//
// WHY THIS EXISTS: there is no operational alerting on this system today.
// `alert_settings` is a product feature aimed at end users and holds 0 rows
// in production - nothing pages the owner. Two incidents went unnoticed as a
// direct result:
//
//   1. A runaway onboarding loop ran 114 full citation sweeps in 34 hours
//      and burned roughly $65 of provider spend. A human noticed the bill,
//      not the system.
//   2. The outbox stopped draining on 2026-08-23 because claimNext threw on
//      every call. Three commands sat pending with attempt_count = 0 for
//      eight days. Nothing noticed.
//
// This module is deliberately small: it evaluates a handful of concrete,
// measurable conditions against tables that already exist and reports
// through the reporting paths that already exist (structured logger +
// Sentry via captureAndFlush). No new table, no new notification channel.
//
// CONTRACT: read-only against the database, and must never throw into its
// caller - a failing health check must not take down the scheduler that
// runs it. Every DB read and every sub-check is individually guarded; a
// blown condition is reported as a "checkFailed" finding instead of an
// exception.

import { pool } from "../db";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";
import { storage } from "../storage";
import { isRunStaleSinceLastProgress } from "./citationReconciliation";

export type OpsAlertKind =
  | "provider_spend_over_threshold"
  | "outbox_commands_stuck"
  | "scheduled_job_overdue"
  | "citation_runs_stuck_running"
  | "check_failed";

export interface OpsAlert {
  kind: OpsAlertKind;
  message: string;
  // The measured value, the threshold it was judged against, and pointers
  // to what to look at - so an alert never just says "something is wrong".
  measured: Record<string, unknown>;
  threshold: Record<string, unknown>;
  lookAt: string;
}

export interface OpsHealthCheckResult {
  ranAt: string;
  alerts: OpsAlert[];
}

// ─── Thresholds ─────────────────────────────────────────────────────────
//
// PROVIDER SPEND: the runaway incident burned ~6500 cents (est_cost_cents)
// over 34 hours, i.e. ~191 cents/hour sustained, concentrated into 114
// sweeps rather than spread evenly - so most of that spend landed inside a
// handful of hours, not smoothly across all 34. Production's entire
// all-time total is ~11,314 cents across 21,394 rows (migration 0122
// changed est_cost_cents to numeric(12,6), so this already reflects
// fractional-cent rows). A single hour of steady-state traffic is nowhere
// close to even a small fraction of that all-time total. A 1-hour rolling
// window with a 1,000-cent ($10) threshold is comfortably above any
// legitimate single-hour burst seen in the full production history, and
// would have fired inside the first few hours of the 2026 runaway loop.
const SPEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SPEND_THRESHOLD_CENTS = 1000; // $10/hour

// OUTBOX: the drain cron (CONTENT_COST_OUTBOX_CRON) runs every 5 minutes by
// default. A command that is still `pending` with attempt_count = 0 after
// 3 drain intervals (15 minutes) was never claimed at all - the drain loop
// itself is broken (this is exactly the claimNext-threw-on-every-call
// incident, where commands sat pending for 8 days). A separate, longer
// bound (2 hours) catches a command that WAS claimed and retried a few
// times but is still not resolved - broader than "never claimed", so it
// gets a longer window before it counts as stuck.
const OUTBOX_DRAIN_INTERVAL_MS =
  Number(process.env.CONTENT_COST_OUTBOX_DRAIN_INTERVAL_MINUTES) > 0
    ? Number(process.env.CONTENT_COST_OUTBOX_DRAIN_INTERVAL_MINUTES) * 60 * 1000
    : 5 * 60 * 1000;
const OUTBOX_NEVER_CLAIMED_THRESHOLD_MS = OUTBOX_DRAIN_INTERVAL_MS * 3; // 15 min
const OUTBOX_STUCK_PENDING_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// SCHEDULED JOBS: reuse the same lastRanAt bookkeeping jobDebounce.ts
// already keeps in system_state (job:<name>:lastRanAt, written by
// markJobRan only on success) - no new table. The threshold for each job is
// 2x its real cron cadence, which absorbs exactly one missed tick (a
// deploy, a transient DB blip) before paging.
//
//   auto-citation:  cron fires hourly (AUTO_CITATION_CRON, default hourly)
//   weekly-report:  cron fires weekly (WEEKLY_REPORT_CRON, default Sun 08:00)
const OPS_TRACKED_JOBS: Array<{ job: string; expectedIntervalMs: number }> = [
  { job: "auto-citation", expectedIntervalMs: 60 * 60 * 1000 },
  { job: "weekly-report", expectedIntervalMs: 7 * 24 * 60 * 60 * 1000 },
];
const JOB_OVERDUE_MULTIPLIER = 2;

interface QueryRunner {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface OpsHealthCheckDeps {
  db: QueryRunner;
  getSystemState: (key: string) => Promise<unknown | null>;
  now: () => number;
}

const defaultDeps: OpsHealthCheckDeps = {
  db: pool,
  getSystemState: (key) => storage.getSystemState(key),
  now: () => Date.now(),
};

async function checkProviderSpend(deps: OpsHealthCheckDeps): Promise<OpsAlert | null> {
  const since = new Date(deps.now() - SPEND_WINDOW_MS);
  const result = await deps.db.query(
    `select coalesce(sum(est_cost_cents), 0) as total_cents, count(*) as row_count
       from api_costs
      where created_at >= $1`,
    [since],
  );
  const row = (result.rows[0] ?? { total_cents: 0, row_count: 0 }) as {
    total_cents: string | number;
    row_count: string | number;
  };
  const totalCents = Number(row.total_cents);
  const rowCount = Number(row.row_count);
  if (!(totalCents > SPEND_THRESHOLD_CENTS)) return null;
  return {
    kind: "provider_spend_over_threshold",
    message: `Provider spend over the last hour (${totalCents.toFixed(2)}¢) exceeds the ${SPEND_THRESHOLD_CENTS}¢ threshold.`,
    measured: { totalCents, rowCount, windowMs: SPEND_WINDOW_MS },
    threshold: { thresholdCents: SPEND_THRESHOLD_CENTS, windowMs: SPEND_WINDOW_MS },
    lookAt: "api_costs, filtered to created_at within the last hour, grouped by user_id/service.",
  };
}

async function checkOutboxStuckCommands(deps: OpsHealthCheckDeps): Promise<OpsAlert | null> {
  const neverClaimedSince = new Date(deps.now() - OUTBOX_NEVER_CLAIMED_THRESHOLD_MS);
  const stuckPendingSince = new Date(deps.now() - OUTBOX_STUCK_PENDING_THRESHOLD_MS);
  const result = await deps.db.query(
    `select
        count(*) filter (
          where status = 'pending' and attempt_count = 0 and created_at < $1
        ) as never_claimed_count,
        min(created_at) filter (
          where status = 'pending' and attempt_count = 0 and created_at < $1
        ) as never_claimed_oldest,
        count(*) filter (
          where status = 'pending' and created_at < $2
        ) as stuck_pending_count,
        min(created_at) filter (
          where status = 'pending' and created_at < $2
        ) as stuck_pending_oldest
       from outbox_commands`,
    [neverClaimedSince, stuckPendingSince],
  );
  const row = (result.rows[0] ?? {}) as {
    never_claimed_count: string | number;
    never_claimed_oldest: Date | string | null;
    stuck_pending_count: string | number;
    stuck_pending_oldest: Date | string | null;
  };
  const neverClaimedCount = Number(row.never_claimed_count ?? 0);
  const stuckPendingCount = Number(row.stuck_pending_count ?? 0);
  if (neverClaimedCount === 0 && stuckPendingCount === 0) return null;
  return {
    kind: "outbox_commands_stuck",
    message:
      `${neverClaimedCount} outbox command(s) have sat pending with attempt_count = 0 for over ` +
      `${Math.round(OUTBOX_NEVER_CLAIMED_THRESHOLD_MS / 60000)} minutes (the drain never claimed them), ` +
      `and ${stuckPendingCount} command(s) have been pending for over ` +
      `${Math.round(OUTBOX_STUCK_PENDING_THRESHOLD_MS / 60000)} minutes overall.`,
    measured: {
      neverClaimedCount,
      neverClaimedOldest: row.never_claimed_oldest,
      stuckPendingCount,
      stuckPendingOldest: row.stuck_pending_oldest,
    },
    threshold: {
      neverClaimedThresholdMs: OUTBOX_NEVER_CLAIMED_THRESHOLD_MS,
      stuckPendingThresholdMs: OUTBOX_STUCK_PENDING_THRESHOLD_MS,
    },
    lookAt:
      "outbox_commands where status = 'pending', ordered by created_at - check the drain " +
      "cron (content-cost-outbox-drain) for a claimNext error.",
  };
}

async function checkOverdueScheduledJobs(deps: OpsHealthCheckDeps): Promise<OpsAlert[]> {
  const alerts: OpsAlert[] = [];
  for (const { job, expectedIntervalMs } of OPS_TRACKED_JOBS) {
    const thresholdMs = expectedIntervalMs * JOB_OVERDUE_MULTIPLIER;
    const raw = (await deps.getSystemState(`job:${job}:lastRanAt`)) as {
      lastRanAt?: string;
    } | null;
    const lastRanAtIso = raw?.lastRanAt;
    const lastRanAt = lastRanAtIso ? new Date(lastRanAtIso) : null;
    const neverRan = !lastRanAt || Number.isNaN(lastRanAt.getTime());
    const ageMs = neverRan ? null : deps.now() - lastRanAt!.getTime();
    if (neverRan || (ageMs !== null && ageMs > thresholdMs)) {
      alerts.push({
        kind: "scheduled_job_overdue",
        message: neverRan
          ? `Scheduled job "${job}" has never recorded a successful completion.`
          : `Scheduled job "${job}" last completed ${Math.round(ageMs! / 60000)} minutes ago, ` +
            `past its ${Math.round(thresholdMs / 60000)}-minute overdue threshold ` +
            `(${JOB_OVERDUE_MULTIPLIER}x its ${Math.round(expectedIntervalMs / 60000)}-minute expected interval).`,
        measured: { job, lastRanAt: lastRanAtIso ?? null, ageMs },
        threshold: { job, expectedIntervalMs, thresholdMs },
        lookAt: `system_state key job:${job}:lastRanAt, and the scheduler logs for "${job} cron crashed".`,
      });
    }
  }
  return alerts;
}

async function checkStuckCitationRuns(deps: OpsHealthCheckDeps): Promise<OpsAlert | null> {
  const result = await deps.db.query(
    `select id, brand_id, started_at, last_advance_started_at
       from citation_runs
      where status = 'running'`,
  );
  const rows = result.rows as Array<{
    id: string;
    brand_id: string;
    started_at: Date | string;
    last_advance_started_at: Date | string | null;
  }>;
  const now = deps.now();
  const stale = rows.filter((row) =>
    isRunStaleSinceLastProgress(
      { startedAt: row.started_at, lastAdvanceStartedAt: row.last_advance_started_at },
      now,
    ),
  );
  if (stale.length === 0) return null;
  return {
    kind: "citation_runs_stuck_running",
    message:
      `${stale.length} citation run(s) are still 'running' past the staleness window ` +
      `already used by the orphan-run reconciler (${"server/lib/citationReconciliation.ts"}).`,
    measured: {
      count: stale.length,
      ids: stale.map((r) => r.id),
      brandIds: stale.map((r) => r.brand_id),
    },
    threshold: { source: "isRunStaleSinceLastProgress (citationReconciliation.ts)" },
    lookAt:
      "citation_runs where status = 'running', ordered by last_advance_started_at - the boot-time " +
      "reconciler should have caught these; if it hasn't, check whether it is running at all.",
  };
}

/**
 * Evaluate every operational health condition and report findings through
 * the existing logger + Sentry paths. Never throws: each sub-check is
 * independently guarded, and a failure inside one is itself reported as a
 * "check_failed" alert rather than aborting the rest or propagating up to
 * the scheduler.
 */
export async function runOpsHealthCheck(
  deps: OpsHealthCheckDeps = defaultDeps,
): Promise<OpsHealthCheckResult> {
  const alerts: OpsAlert[] = [];

  const checks: Array<{ name: string; run: () => Promise<OpsAlert | OpsAlert[] | null> }> = [
    { name: "provider_spend", run: () => checkProviderSpend(deps) },
    { name: "outbox_stuck", run: () => checkOutboxStuckCommands(deps) },
    { name: "overdue_jobs", run: () => checkOverdueScheduledJobs(deps) },
    { name: "stuck_citation_runs", run: () => checkStuckCitationRuns(deps) },
  ];

  for (const check of checks) {
    try {
      const outcome = await check.run();
      if (!outcome) continue;
      if (Array.isArray(outcome)) alerts.push(...outcome);
      else alerts.push(outcome);
    } catch (err) {
      logger.error({ err, check: check.name }, "opsHealthCheck: sub-check failed");
      alerts.push({
        kind: "check_failed",
        message: `Ops health sub-check "${check.name}" threw and could not evaluate its condition.`,
        measured: { check: check.name, error: err instanceof Error ? err.message : String(err) },
        threshold: {},
        lookAt: "server/lib/opsHealthCheck.ts logs around 'opsHealthCheck: sub-check failed'.",
      });
      captureAndFlush(err, { tags: { source: "opsHealthCheck", check: check.name } });
    }
  }

  for (const alert of alerts) {
    if (alert.kind === "check_failed") continue; // already reported above
    logger.warn(
      {
        event: "ops_health_alert",
        kind: alert.kind,
        measured: alert.measured,
        threshold: alert.threshold,
        lookAt: alert.lookAt,
      },
      alert.message,
    );
    captureAndFlush(new Error(alert.message), {
      tags: { source: "opsHealthCheck", kind: alert.kind },
      extra: { measured: alert.measured, threshold: alert.threshold, lookAt: alert.lookAt },
    });
  }

  return { ranAt: new Date().toISOString(), alerts };
}
