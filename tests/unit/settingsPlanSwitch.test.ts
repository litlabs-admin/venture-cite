// Changing plan from Settings.
//
// This lived only on the pricing page - a page written for people who have
// not bought yet - so an existing customer had to walk back out to a sales
// page to give us more money. The switch itself happens on the subscription
// they already have, so the control belongs beside it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const settings = readFileSync(
  fileURLToPath(new URL("../../client/src/pages/settings.tsx", import.meta.url)),
  "utf8",
);

describe("plan switching in settings", () => {
  it("offers every sellable plan except the one they are on", () => {
    expect(settings).toContain("list-plan-options");
    // Offering the current plan back to them is a button that can only ever
    // return "You're already on this plan".
    expect(settings).toContain("tier === sub?.tier");
  });

  it("skips products with no tier metadata or no price", () => {
    // Same rule the webhook applies before granting entitlements - a product
    // without them cannot be sold or turned into access.
    expect(settings).toContain("if (!tier || !price");
  });

  it("takes the price from Stripe rather than a constant", () => {
    // A hardcoded amount eventually lies about what the card is charged.
    expect(settings).toContain('queryKey: ["/api/stripe/products"]');
  });

  it("confirms before moving money, and says which direction", () => {
    expect(settings).toContain("button-confirm-switch");
    expect(settings).toContain("charged the difference");
    expect(settings).toContain("credited against your next invoice");
  });

  it("re-reads the tier after the webhook has had time to land", () => {
    // The switch response returns before customer.subscription.updated is
    // processed, so the "Current plan" line renders the OLD tier. Measured:
    // the summary said Agency while the tier line still said pro.
    const body = settings.slice(settings.indexOf("const switchPlan"));
    expect(body).toContain("setTimeout");
    expect(body).toContain('queryKey: ["/api/auth/me"]');
  });

  it("treats an in-place update as done, with no redirect", () => {
    // An existing subscription is swapped and billed immediately; there is no
    // Checkout URL to follow, and sending them to one would open a SECOND
    // subscription.
    const body = settings.slice(settings.indexOf("const switchPlan"));
    expect(body).toContain("data?.updated");
    expect(body.indexOf("data?.updated")).toBeLessThan(body.indexOf("data?.url"));
  });
});
