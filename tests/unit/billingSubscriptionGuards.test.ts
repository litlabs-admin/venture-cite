// Guards on the billing routes, as source-text checks.
//
// These are facts about the code that cost real money when they regress, and
// each one here is a bug that actually shipped and was caught by walking the
// user journeys rather than by reading the code:
//
//   1. the duplicate-subscription guard listed only status:"active", so every
//      TRIALING customer who upgraded got a second subscription - and since
//      most upgrades happen during a trial, the guard missed the common case
//   2. current_period_end was read off the subscription, but Stripe moved it
//      onto the subscription ITEM, so the cancellation notice rendered
//      "Cancels on period end" with no date
//   3. the subscription lookup expanded 5 levels deep, which Stripe rejects
//      outright, so the whole billing panel silently showed no subscription

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const billing = readFileSync(
  fileURLToPath(new URL("../../server/routes/billing.ts", import.meta.url)),
  "utf8",
);

/** The checkout handler, isolated from the rest of the file. */
function checkoutBody(): string {
  const start = billing.indexOf('"/api/stripe/checkout"');
  expect(start, "checkout route not found").toBeGreaterThan(-1);
  const end = billing.indexOf('"/api/billing/subscription"', start);
  const body = billing.slice(start, end > start ? end : undefined);
  expect(body.length).toBeGreaterThan(200);
  return body;
}

describe("duplicate-subscription guard", () => {
  it("treats a trialing subscription as existing, not just an active one", () => {
    const body = checkoutBody();
    expect(body).toContain('status: "all"');
    expect(body).toContain('x.status === "trialing"');
    // The original bug: filtering the LIST call down to active only.
    expect(body).not.toContain('status: "active",\n            limit: 10,');
  });

  it("swaps the price instead of opening a second checkout", () => {
    const body = checkoutBody();
    expect(body).toContain("subscriptions.update");
    expect(body).toContain("proration_behavior");
  });

  it("keeps an idempotency key on session creation", () => {
    expect(checkoutBody()).toContain("idempotencyKey");
  });
});

describe("period end", () => {
  it("reads current_period_end from the subscription ITEM", () => {
    // Stripe moved this off the subscription. Reading only the top level
    // returns undefined on the current API version, and the cancellation
    // notice loses the one date it needs.
    const helper = billing.slice(
      billing.indexOf("function periodEnd"),
      billing.indexOf("export function setupBillingRoutes"),
    );
    expect(helper).toContain("sub.items?.data?.[0]");
    expect(helper).toContain("current_period_end");
  });

  it("is used by both the subscription view and the cancel response", () => {
    // Two call sites; an earlier patch updated only one of them and the panel
    // kept rendering a dateless "period end".
    const uses = billing.match(/periodEnd\(/g) ?? [];
    // definition + two call sites
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });
});

describe("subscription lookup", () => {
  it("stays within Stripe's 4-level expand limit", () => {
    // "data.items.data.price.product" is 5 and 400s the entire request.
    expect(billing).not.toContain("data.items.data.price.product");
    expect(billing).toContain('expand: ["data.items.data.price"]');
  });
});

describe("cancellation", () => {
  it("defers to period end rather than deleting immediately", () => {
    // An immediate cancel takes away time already paid for and is terminal -
    // the subscription cannot be revived, only replaced.
    expect(billing).toContain("cancel_at_period_end: true");
    expect(billing).not.toContain("subscriptions.cancel(");
  });

  it("offers a way back before the period actually ends", () => {
    expect(billing).toContain('"/api/billing/resume"');
    expect(billing).toContain("cancel_at_period_end: false");
  });

  it("does not touch the tier - Stripe's own event does that", () => {
    const cancelBody = billing.slice(
      billing.indexOf('"/api/billing/cancel"'),
      billing.indexOf('"/api/billing/resume"'),
    );
    expect(cancelBody).not.toContain("accessTier");
  });
});
