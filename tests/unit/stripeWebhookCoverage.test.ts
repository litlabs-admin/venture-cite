// Guards for the Stripe webhook surface.
//
// Source-text checks rather than runtime ones: importing webhookHandlers pulls
// in the DB, Stripe and Resend clients, and the invariants worth protecting
// here are facts about the code, not about a running process. The same
// reasoning as tests/unit/schedulerOrchestratorParity.test.ts.
//
// Each of these encodes a bug that actually shipped:
//   - a swallowed error let a customer pay and never get their tier
//   - a decline and an SCA prompt were treated as the same thing
//   - a dispute fell into the same bucket as payment_intent.created

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const handlers = read("server/webhookHandlers.ts");

/** Event types with a `case` in the dispatch switch. */
function handledEvents(): string[] {
  return [...handlers.matchAll(/case "([a-z_]+\.[a-z_.]+)":/g)].map((m) => m[1]);
}

describe("stripe webhook coverage", () => {
  it("handles every event the billing lifecycle depends on", () => {
    const handled = new Set(handledEvents());
    // Sanity-check the regex itself, so this cannot pass vacuously.
    expect(handled.size).toBeGreaterThan(4);

    for (const event of [
      "checkout.session.completed", // first payment
      "invoice.paid", // renewals - never pass through Checkout again
      "customer.subscription.updated", // plan changes, past_due, cancellation-pending
      "customer.subscription.deleted", // cancellation
      "invoice.payment_failed", // decline -> dunning
      "invoice.payment_action_required", // SCA/3DS -> a DIFFERENT message
      "charge.dispute.created", // money being taken back, with a deadline
      "invoice.finalization_failed", // invoice never reaches the customer
    ]) {
      expect(handled, `missing handler for ${event}`).toContain(event);
    }
  });

  it("rethrows when the tier lookup fails, so Stripe retries", () => {
    // Swallowing this let execution reach markStripeEventProcessed(), which
    // stamps the event done and stops redelivery - the customer had paid and
    // no event remained that could ever grant their tier.
    const checkoutCase = handlers.slice(
      handlers.indexOf('case "checkout.session.completed"'),
      handlers.indexOf('case "customer.subscription.updated"'),
    );
    expect(checkoutCase).toContain("throw err");
  });

  it("does not revoke access on a single failed payment", () => {
    // Smart Retries keep trying for the configured window and most of these
    // recover. Cutting the customer off on the first decline manufactures the
    // churn the dunning email exists to prevent.
    const failedCase = handlers.slice(
      handlers.indexOf('case "invoice.payment_failed"'),
      handlers.indexOf('case "invoice.payment_action_required"'),
    );
    expect(failedCase).not.toContain("accessTier");
    expect(failedCase).toContain("sendPaymentFailedEmail");
  });

  it("sends a different message for SCA than for a decline", () => {
    // "Update your card" is wrong for 3DS - the card is fine, the bank wants
    // the cardholder to authenticate. Sending the decline copy leaves them
    // stuck with an unpaid invoice and no access.
    const scaCase = handlers.slice(
      handlers.indexOf('case "invoice.payment_action_required"'),
      handlers.indexOf('case "charge.dispute.created"'),
    );
    expect(scaCase).toContain("sendPaymentActionRequiredEmail");
    expect(scaCase).not.toContain("sendPaymentFailedEmail");
  });

  it("never downgrades a payer on unrecognised product metadata", () => {
    // tierFromProduct returns null for a product with no usable metadata.tier.
    // Every caller must treat that as "leave the tier alone" - taking access
    // from someone who just paid is the worst response to our own config error.
    expect(handlers).toContain("tier NOT updated");
  });
});

describe("checkout duplicate-subscription guard", () => {
  const billing = read("server/routes/billing.ts");

  it("updates an existing subscription instead of selling a second one", () => {
    // This endpoint used to create a Checkout Session unconditionally, so a Pro
    // customer clicking Agency got TWO live subscriptions and two charges - and
    // the user row holds only one stripeSubscriptionId, so the orphan billed on
    // invisibly.
    expect(billing).toContain("subscriptions.list");
    expect(billing).toContain("subscriptions.update");
    expect(billing).toContain("proration_behavior");
  });

  it("uses an idempotency key so a double-click cannot create two sessions", () => {
    expect(billing).toContain("idempotencyKey");
  });
});

// ─── Dunning ─────────────────────────────────────────────────────────────────
// Both of these were found by driving real test-mode Stripe rather than by
// reading the code, and both are the kind of bug that only shows up on the
// unhappy path days after signup.

describe("dunning", () => {
  it("keeps a past_due customer entitled while Stripe retries", () => {
    // The first decline used to drop them straight to readonly - while the
    // payment_failed email was telling them their account stays active, and
    // while Smart Retries were still days from giving up.
    const entitled = handlers.slice(
      handlers.indexOf("const entitled ="),
      handlers.indexOf("let newTier"),
    );
    expect(entitled).toContain('sub.status === "past_due"');
    // unpaid is the terminal state, not a retry window.
    expect(entitled).not.toContain('sub.status === "unpaid"');
  });

  it("does not send the decline email when the invoice is only awaiting 3DS", () => {
    // Stripe fires payment_action_required AND payment_failed for the same SCA
    // attempt, a second apart. Sending both tells the customer to confirm the
    // payment and then to replace a card that is working fine.
    expect(handlers).toContain("invoiceAwaitingAuthentication");
    const failed = handlers.slice(
      handlers.indexOf('case "invoice.payment_failed"'),
      handlers.indexOf('case "invoice.payment_action_required"'),
    );
    expect(failed).toContain("if (email && !needsAuth)");
  });

  it("classifies the failure from the payment intent, not the attempt count", () => {
    // attempt_count === 0 correlates with SCA today but is not what the
    // distinction means; requires_action is.
    const helper = handlers.slice(
      handlers.indexOf("async function invoiceAwaitingAuthentication"),
      handlers.indexOf("// Insert the event.id"),
    );
    expect(helper).toContain('"requires_action"');
    // On an error it must fall back to sending: silence on a real decline is
    // worse than a slightly-off message.
    expect(helper).toContain("return false;");
  });
});
