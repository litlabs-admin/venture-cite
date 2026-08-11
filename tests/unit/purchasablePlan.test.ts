// The rule that decides whether Stripe is carrying a plan we can actually
// sell. Two things depend on it and they must never disagree:
//
//   the pricing page  refuses to offer checkout on a price mismatch
//   the signup gate   refuses to block anyone when nothing is buyable
//
// This exists because the live Stripe account still carries a "Pro" product
// from the previous pricing at $79, with tier metadata identical to ours.
// Matching on metadata alone would treat that as sellable: the gate would lock
// every new signup out, and send them to a page whose only button is disabled.

import { describe, it, expect } from "vitest";
import { hasPurchasablePlan, PLAN_PRICE_CENTS, SELLABLE_TIERS } from "@shared/schema";

const product = (tier: string, amount: number, currency = "usd") => ({
  metadata: { tier },
  prices: [{ unit_amount: amount, currency }],
});

describe("hasPurchasablePlan", () => {
  it("accepts a correctly priced plan", () => {
    expect(hasPurchasablePlan([product("pro", PLAN_PRICE_CENTS.pro)])).toBe(true);
    expect(hasPurchasablePlan([product("agency", PLAN_PRICE_CENTS.agency)])).toBe(true);
  });

  it("rejects the legacy $79 Pro still live in the Stripe account", () => {
    // Same tier metadata, wrong money. This is the exact row that would
    // otherwise brick signup.
    expect(hasPurchasablePlan([product("pro", 7900)])).toBe(false);
  });

  it("rejects tiers we do not sell, whatever they cost", () => {
    expect(hasPurchasablePlan([product("free", 0)])).toBe(false);
    expect(hasPurchasablePlan([product("enterprise", 24900)])).toBe(false);
    expect(hasPurchasablePlan([product("readonly", PLAN_PRICE_CENTS.pro)])).toBe(false);
  });

  it("rejects the right amount in the wrong currency", () => {
    expect(hasPurchasablePlan([product("pro", PLAN_PRICE_CENTS.pro, "eur")])).toBe(false);
  });

  it("rejects an empty or malformed catalogue rather than throwing", () => {
    expect(hasPurchasablePlan([])).toBe(false);
    expect(hasPurchasablePlan([{ metadata: null, prices: null }])).toBe(false);
    expect(hasPurchasablePlan([{}])).toBe(false);
    expect(hasPurchasablePlan([{ metadata: { tier: "pro" }, prices: [] }])).toBe(false);
  });

  it("accepts a mixed catalogue as long as one real plan is present", () => {
    // The realistic post-sync state: new plans alongside un-archived legacy
    // products.
    expect(
      hasPurchasablePlan([
        product("free", 0),
        product("pro", 7900), // legacy
        product("pro", PLAN_PRICE_CENTS.pro), // the real one
      ]),
    ).toBe(true);
  });

  it("prices every sellable tier, so none can be silently unbuyable", () => {
    for (const tier of SELLABLE_TIERS) {
      expect(PLAN_PRICE_CENTS[tier], `${tier} has no expected price`).toBeGreaterThan(0);
    }
  });
});
