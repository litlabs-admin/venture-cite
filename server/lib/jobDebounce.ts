import { storage } from "../storage";
import { logger } from "./logger";

// ─── Job debounce ────────────────────────────────────────────────────────────
// "Has this job already run recently, no matter who triggered it?"
//
// WHY THIS EXISTS, and why an advisory lock is not enough:
//
// Six jobs are registered in TWO places - the in-process node-cron scheduler
// (server/scheduler.ts) and the daily orchestrator endpoint
// (POST /api/cron/daily-orchestrator, server/routes/cron.ts): account-purge,
// auto-citation, brand-purge, listicle-scan, mention-scan and weekly-report.
//
// Most job bodies take a Postgres advisory lock (lockKeys, 910001+). That
// prevents CONCURRENT overlap - two runners firing at the same instant, the
// second skips. It does nothing about SEQUENTIAL double-run:
//
//   in-process cron fires 09:00, finishes 09:06, releases the lock
//   external scheduler fires 09:15, lock is free, everything runs AGAIN
//
// The lock was built for container-restart overlap, not for two schedulers.
// This is the guard for two schedulers, and for anything else that can hit
// the endpoint twice: a retry, a manual curl, a Render deploy restarting the
// process mid-window.
//
// SCOPE: applied to the jobs whose second run COSTS something -
//   weekly-report   duplicate emails to real users (no other dedupe exists)
//   mention-scan    duplicate LLM sentiment spend (rows dedupe, calls do not)
//   auto-citation   duplicate LLM spend across every tracked prompt
// The purges are deliberately NOT debounced: a second pass finds nothing left
// to delete, so it is effectively idempotent, and a guard there could delay a
// purge that genuinely needs to run after a failed attempt.
//
// STATE: system_state, which already exists as a key/value store with
// getSystemState/setSystemState - no schema change.

/** system_state key for a job's last successful completion. */
const key = (job: string) => `job:${job}:lastRanAt`;

export interface DebounceResult {
  /** False when the job ran too recently and should be skipped. */
  shouldRun: boolean;
  /** When it last completed, if ever. */
  lastRanAt: Date | null;
}

/**
 * Check whether `job` may run now.
 *
 * `minIntervalMs` should be comfortably SHORTER than the job's real cadence -
 * it is a double-fire guard, not a scheduler. A weekly job with a 20-hour
 * window still runs every week; it just cannot run twice in one morning.
 * Too long a window would swallow a legitimate re-run after a failure.
 */
export async function shouldRunJob(job: string, minIntervalMs: number): Promise<DebounceResult> {
  try {
    const raw = (await storage.getSystemState(key(job))) as { lastRanAt?: string } | null;
    const iso = raw?.lastRanAt;
    if (!iso) return { shouldRun: true, lastRanAt: null };

    const lastRanAt = new Date(iso);
    if (Number.isNaN(lastRanAt.getTime())) return { shouldRun: true, lastRanAt: null };

    const elapsed = Date.now() - lastRanAt.getTime();
    // A clock skew or a restored backup can put the stored timestamp in the
    // future. Treat that as "unknown", not as "blocked forever".
    if (elapsed < 0) return { shouldRun: true, lastRanAt };

    return { shouldRun: elapsed >= minIntervalMs, lastRanAt };
  } catch (err) {
    // FAIL OPEN. If the state read breaks, running a job twice is worse than
    // a missed guard - but never running it at all is worse still. A silent
    // skip here would look exactly like "the scheduler is broken".
    logger.warn({ err, job }, "jobDebounce: state read failed, allowing the run");
    return { shouldRun: true, lastRanAt: null };
  }
}

/** Record a successful completion. Call this only after the work succeeded. */
export async function markJobRan(job: string, at: Date = new Date()): Promise<void> {
  try {
    await storage.setSystemState(key(job), { lastRanAt: at.toISOString() });
  } catch (err) {
    // Non-fatal: the work is already done. Worst case the next trigger inside
    // the window runs it again, which is the behaviour we had before.
    logger.warn({ err, job }, "jobDebounce: failed to record completion");
  }
}

/**
 * Wrap a job body in the debounce. Returns `{ ran: false }` when skipped, so
 * a caller can report "skipped" rather than "succeeded with no work".
 */
export async function withJobDebounce<T>(
  job: string,
  minIntervalMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false; lastRanAt: Date | null }> {
  const { shouldRun, lastRanAt } = await shouldRunJob(job, minIntervalMs);
  if (!shouldRun) {
    logger.info(
      { job, lastRanAt: lastRanAt?.toISOString(), minIntervalMs },
      "jobDebounce: skipped - already ran inside the window",
    );
    return { ran: false, lastRanAt };
  }
  const result = await fn();
  await markJobRan(job);
  return { ran: true, result };
}

/**
 * Debounce windows, in ms. Each is well under its job's real cadence so a
 * legitimate scheduled run is never swallowed - only a second run in the
 * same window is.
 */
export const DEBOUNCE_WINDOWS = {
  /** Weekly (Sun 08:00). Guards duplicate emails - the costliest repeat. */
  "weekly-report": 20 * 60 * 60 * 1000,
  /** Weekly (Mon 09:00). Guards duplicate LLM sentiment spend. */
  "mention-scan": 20 * 60 * 60 * 1000,
  /** Hourly. Guards a double LLM citation sweep; must stay under an hour. */
  "auto-citation": 45 * 60 * 1000,
} as const;
