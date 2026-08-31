// Ops alert email delivery.
//
// WHY: server/lib/opsHealthCheck.ts detects real operational conditions
// (runaway spend, a stuck outbox, an overdue job, a stalled citation run)
// but only reports them through logger.warn/error and captureAndFlush
// (Sentry). Nobody watches either path day to day, and SENTRY_DSN is unset
// in this deployment, so captureAndFlush is presently a no-op (see
// server/instrument.ts - Sentry.init only runs when dsn is truthy). This
// module is the missing last mile: it turns a firing OpsAlert into an email
// a human actually receives, through the Resend integration that already
// exists (server/emailService.ts / server/lib/billingEmails.ts), and
// nothing else - no new provider, no new table.
//
// SEND PATH: mirrors server/lib/billingEmails.ts exactly (the closest
// existing analog - a system-triggered, non-user-facing email, not a
// customer-preference-gated one like the weekly report). It calls
// sendOutreachEmailViaResend and, on failure, logs + captureAndFlush -
// there is no per-recipient DLQ row for this because OPS_ALERT_EMAIL is an
// operator address, not a customer row in `users`/`email_failures`.
//
// DEDUPE: the check runs every 15 minutes (OPS_HEALTH_CHECK_CRON). Without
// a cooldown, one ongoing incident sends 96 emails a day. Each condition
// gets its own cooldown key in system_state (the same key/value store
// jobDebounce.ts already uses for `job:<name>:lastRanAt` - no new table),
// so one firing condition doesn't suppress an unrelated one, and each
// tracked scheduled job is kept separate too (job A being overdue
// shouldn't silence job B going overdue five minutes later).
//
// COOLDOWN LENGTH: 60 minutes. Reasoning:
//   - It bounds the worst case to 24 emails/day per condition instead of
//     96 - a 4x reduction that still leaves an ongoing incident visible
//     roughly hourly, not silenced for a full day.
//   - It matches the granularity already baked into this system: the spend
//     check itself uses a 1-hour rolling window (SPEND_WINDOW_MS in
//     opsHealthCheck.ts), and the outbox "stuck pending" bound is 2 hours -
//     an hourly re-notify is finer than the coarsest existing threshold and
//     coarser than the finest, i.e. it doesn't invent a new unit of time.
//   - It is long enough that a human has time to act on the first email
//     before a second one for the same condition arrives, short enough
//     that forgetting about page #1 doesn't mean silence until tomorrow.

import { storage } from "../storage";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";
import { sendOutreachEmailViaResend } from "../emailService";
import type { OpsAlert } from "./opsHealthCheck";

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour - see module header for reasoning.

interface OpsAlertEmailDeps {
  getSystemState: (key: string) => Promise<unknown | null>;
  setSystemState: (key: string, value: unknown) => Promise<void>;
  now: () => number;
  send: (params: { to: string; subject: string; html: string }) => Promise<{
    messageId: string | null;
  }>;
}

const defaultDeps: OpsAlertEmailDeps = {
  getSystemState: (key) => storage.getSystemState(key),
  setSystemState: (key, value) => storage.setSystemState(key, value),
  now: () => Date.now(),
  send: sendOutreachEmailViaResend,
};

/** Distinguishes independent instances of the same alert kind - currently
 *  only scheduled_job_overdue fires more than once per run, one per
 *  tracked job, and those must not share a cooldown clock. */
function dedupeSuffix(alert: OpsAlert): string {
  if (alert.kind === "scheduled_job_overdue" && typeof alert.measured.job === "string") {
    return `:${alert.measured.job}`;
  }
  return "";
}

function cooldownKey(alert: OpsAlert): string {
  return `ops_alert:${alert.kind}${dedupeSuffix(alert)}:lastSentAt`;
}

// A sub-check that throws usually keeps throwing every 15 minutes until someone
// intervenes, so it gets a longer cooldown than a firing condition: still loud
// enough to notice, quiet enough not to bury the mailbox that carries the real
// conditions.
const CHECK_FAILED_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

function cooldownFor(alert: OpsAlert): number {
  return alert.kind === "check_failed" ? CHECK_FAILED_COOLDOWN_MS : COOLDOWN_MS;
}

async function isInCooldown(alert: OpsAlert, deps: OpsAlertEmailDeps): Promise<boolean> {
  const raw = (await deps.getSystemState(cooldownKey(alert))) as { lastSentAt?: string } | null;
  const iso = raw?.lastSentAt;
  if (!iso) return false;
  const lastSentAt = new Date(iso).getTime();
  if (Number.isNaN(lastSentAt)) return false;
  const elapsed = deps.now() - lastSentAt;
  if (elapsed < 0) return false; // clock skew / restored backup - don't block forever
  return elapsed < cooldownFor(alert);
}

async function markSent(alert: OpsAlert, deps: OpsAlertEmailDeps): Promise<void> {
  await deps.setSystemState(cooldownKey(alert), { lastSentAt: new Date(deps.now()).toISOString() });
}

function formatBody(alert: OpsAlert): string {
  const lines = [
    `Condition: ${alert.kind}`,
    "",
    alert.message,
    "",
    `Measured: ${JSON.stringify(alert.measured, null, 2)}`,
    "",
    `Threshold: ${JSON.stringify(alert.threshold, null, 2)}`,
    "",
    `Look at: ${alert.lookAt}`,
  ];
  return lines.join("\n");
}

function subjectFor(alert: OpsAlert): string {
  return `[VentureCite ops] ${alert.kind}`;
}

/**
 * Email every alert that is not already inside its per-condition cooldown.
 * Never throws: a missing recipient, a send failure, or a state-store
 * failure is logged (and, for a real send failure, reported to Sentry) and
 * otherwise swallowed - the caller (runOpsHealthCheck) must keep running
 * regardless, and the scheduler above that must never see an exception.
 */
export async function sendOpsAlertEmails(
  alerts: OpsAlert[],
  deps: OpsAlertEmailDeps = defaultDeps,
): Promise<void> {
  // check_failed is emailed too, on its own longer cooldown.
  //
  // It was excluded at first, on the reasoning that "the check itself broke" is
  // already covered by logger.error plus captureAndFlush and that keeping it out
  // preserves a meaningful mailbox. That reasoning depends on Sentry working,
  // and it does not: SENTRY_DSN is unset, and server/instrument.ts only calls
  // Sentry.init() when a DSN is truthy, so captureAndFlush is Sentry's own no-op
  // stub in this deployment.
  //
  // With email as the only channel that reaches anyone, excluding check_failed
  // means a broken health check is silent - the monitor stops watching and
  // nothing says so. That is the worst alert to drop, not the safest: every
  // other condition here depends on the check running at all.
  const actionable = alerts;
  if (actionable.length === 0) return;

  const recipient = process.env.OPS_ALERT_EMAIL?.trim();
  if (!recipient) {
    logger.info(
      { event: "ops_alert_email_skipped", reason: "OPS_ALERT_EMAIL not set" },
      "opsAlertEmail: no recipient configured, skipping email delivery",
    );
    return;
  }

  for (const alert of actionable) {
    try {
      if (await isInCooldown(alert, deps)) {
        logger.info(
          { event: "ops_alert_email_cooldown", kind: alert.kind },
          "opsAlertEmail: alert is within its cooldown window, skipping email",
        );
        continue;
      }

      await deps.send({
        to: recipient,
        subject: subjectFor(alert),
        html: `<pre style="font-family:monospace;white-space:pre-wrap">${formatBody(alert)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</pre>`,
      });

      // Record the send BEFORE anything else can throw, so a downstream
      // hiccup can't cause the same alert to resend forever. If this write
      // itself fails, the catch below just logs - a duplicate email next
      // tick is a far smaller problem than crashing the health check.
      await markSent(alert, deps);

      logger.info({ event: "ops_alert_email_sent", kind: alert.kind }, "opsAlertEmail: sent");
    } catch (err) {
      logger.error({ err, kind: alert.kind }, "opsAlertEmail: failed to send ops alert email");
      captureAndFlush(err, { tags: { source: "opsAlertEmail" }, extra: { kind: alert.kind } });
    }
  }
}
