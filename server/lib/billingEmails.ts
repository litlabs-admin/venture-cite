import { sendOutreachEmailViaResend } from "../emailService";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";

// ─── Billing lifecycle emails ────────────────────────────────────────────────
// Involuntary churn - cards expiring, banks declining, 3DS prompts nobody saw -
// is 20-40% of SaaS churn, and expired cards alone account for roughly 42% of
// it. Before this, a failed payment produced one log line and no contact with
// the customer at all: they found out when the paywall appeared, days later,
// with no idea why.
//
// Every send here is BEST EFFORT and never throws. These are called from
// Stripe webhook handlers, where an exception means a non-2xx, which means
// Stripe retries the whole event - re-running the billing side effects just to
// retry an email is the wrong trade. Failures are logged and reported instead.

const APP_URL = process.env.APP_URL || "https://venturecite.com";

function shell(heading: string, body: string, cta?: { href: string; label: string }): string {
  return [
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px">`,
    `<h2 style="font-size:18px;margin:0 0 12px">${heading}</h2>`,
    body,
    cta
      ? `<p style="margin:20px 0"><a href="${cta.href}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${cta.label}</a></p>`
      : "",
    `<p style="color:#6b7280;font-size:13px;margin-top:24px">VentureCite</p>`,
    `</div>`,
  ].join("");
}

async function send(to: string, subject: string, html: string, kind: string): Promise<void> {
  try {
    await sendOutreachEmailViaResend({ to, subject, html });
    logger.info({ kind }, "billing email sent");
  } catch (err) {
    logger.error({ err, kind }, "billing email failed");
    captureAndFlush(err, { tags: { source: "billing-email" }, extra: { kind } });
  }
}

/**
 * The card was declined. Stripe's Smart Retries keep trying for the configured
 * window, so this is a nudge to fix the payment method - NOT a cancellation
 * notice. Saying "your subscription has ended" here would be false and would
 * push a recoverable customer out the door.
 */
export async function sendPaymentFailedEmail(
  to: string,
  opts: { amountDue?: number | null; currency?: string | null; hostedInvoiceUrl?: string | null },
): Promise<void> {
  const amount =
    opts.amountDue != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: (opts.currency || "usd").toUpperCase(),
        }).format(opts.amountDue / 100)
      : null;

  await send(
    to,
    "Your payment didn't go through",
    shell(
      "We couldn't take your payment",
      [
        `<p>Your bank declined the${amount ? ` ${amount}` : ""} payment for your VentureCite subscription.</p>`,
        `<p>We'll try again automatically over the next few days. To fix it now, update your payment method - your account stays active in the meantime.</p>`,
      ].join(""),
      { href: opts.hostedInvoiceUrl || `${APP_URL}/settings`, label: "Update payment method" },
    ),
    "payment_failed",
  );
}

/**
 * SCA / 3D Secure. The card is fine - the bank wants the cardholder to
 * authenticate, and the charge sits unpaid until they do. Telling this customer
 * to "update your card" (the payment_failed message) would be actively wrong
 * and would leave them stuck, which is exactly why Stripe fires a separate
 * event for it.
 */
export async function sendPaymentActionRequiredEmail(
  to: string,
  opts: { hostedInvoiceUrl?: string | null },
): Promise<void> {
  await send(
    to,
    "Confirm your payment to continue",
    shell(
      "Your bank needs you to confirm this payment",
      [
        `<p>Your card is fine - your bank just needs you to approve the charge before it can go through.</p>`,
        `<p>It takes a few seconds, and your subscription starts as soon as it's done.</p>`,
      ].join(""),
      { href: opts.hostedInvoiceUrl || `${APP_URL}/settings`, label: "Confirm payment" },
    ),
    "payment_action_required",
  );
}

/**
 * Stripe fires customer.subscription.trial_will_end 3 days before the trial
 * converts. Research puts ~40% of trial conversions in the final days, so this
 * is the highest-leverage message in the whole funnel - and it is also simple
 * honesty: nobody should be charged without warning.
 */
export async function sendTrialEndingEmail(
  to: string,
  opts: { daysLeft: number; planName?: string | null; amount?: string | null },
): Promise<void> {
  const when = opts.daysLeft === 1 ? "tomorrow" : `in ${opts.daysLeft} days`;
  await send(
    to,
    `Your free trial ends ${when}`,
    shell(
      `Your trial ends ${when}`,
      [
        `<p>Your VentureCite trial ends ${when}${
          opts.amount ? `, and your card will be charged ${opts.amount}` : ""
        }.</p>`,
        `<p>Nothing to do if you want to carry on. If it's not for you, cancel before then and you won't be charged.</p>`,
      ].join(""),
      { href: `${APP_URL}/settings`, label: "Manage your plan" },
    ),
    "trial_will_end",
  );
}
