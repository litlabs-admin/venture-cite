// The pricing page must identify the plan the user is already paying for.
//
// It previously read the user's tier exactly once, to choose trial-vs-switch
// wording for EVERY card at the same time. Nothing compared a card against the
// user's own tier, so a Pro subscriber saw "Switch to this plan" on the Pro
// card, still clickable, which sent them to Checkout for the plan they already
// had. The server already special-cased that response - the UI just never
// prevented it.
//
// This pins the matching RULE rather than the rendered markup: the rule is the
// part that silently rots (a renamed tier literal, a new card, an anonymous
// visitor accidentally matching), and it is pure logic, so it can be tested
// without mounting Stripe or the router.

import { describe, it, expect } from "vitest";
import { resolveTier, PAYING_TIERS } from "@shared/schema";

/** The exact rule pricing.tsx applies per card. */
function isCurrentPlan(
  planTier: string,
  user: { accessTier?: string | null } | null | undefined,
): boolean {
  const signedIn = !!user;
  return signedIn && planTier === resolveTier(user!);
}

describe("pricing page current-plan matching", () => {
  it("marks the card matching the subscriber's tier", () => {
    expect(isCurrentPlan("pro", { accessTier: "pro" })).toBe(true);
    expect(isCurrentPlan("agency", { accessTier: "agency" })).toBe(true);
  });

  it("does not mark the other plans", () => {
    // The regression: every card, including the user's own, read "Switch".
    expect(isCurrentPlan("agency", { accessTier: "pro" })).toBe(false);
    expect(isCurrentPlan("pro", { accessTier: "agency" })).toBe(false);
  });

  it("never marks a card for a signed-out visitor", () => {
    // The marketing page is public. An anonymous visitor must not be told
    // they are on a plan - and resolveTier(undefined-ish) returns "pending",
    // which must not be allowed to match a card by accident.
    expect(isCurrentPlan("pro", null)).toBe(false);
    expect(isCurrentPlan("pro", undefined)).toBe(false);
    expect(isCurrentPlan("pending", null)).toBe(false);
  });

  it("marks nothing for account states that are not a purchasable plan", () => {
    // free / beta / readonly / pending are real account states but none of
    // them is one of the cards on this page, so no card should claim them.
    for (const tier of ["free", "beta", "readonly", "pending", "admin"]) {
      expect(isCurrentPlan("pro", { accessTier: tier })).toBe(false);
      expect(isCurrentPlan("agency", { accessTier: tier })).toBe(false);
    }
  });

  it("falls back to pending for an unrecognised tier rather than matching a card", () => {
    // resolveTier is deliberately closed: an unknown value must not inherit a
    // real grant. A card must never match it either.
    expect(resolveTier({ accessTier: "totally-made-up" })).toBe("pending");
    expect(isCurrentPlan("pro", { accessTier: "totally-made-up" })).toBe(false);
  });

  it("keeps the card tiers and the user tiers in the same vocabulary", () => {
    // The whole fix relies on plan.tier and resolveTier() sharing literals.
    // If someone renames one side, this fails loudly instead of silently
    // never matching again - which is exactly how the original bug read.
    for (const cardTier of ["pro", "agency"]) {
      expect(PAYING_TIERS).toContain(cardTier);
      expect(resolveTier({ accessTier: cardTier })).toBe(cardTier);
    }
  });
});
