// Entitlement resolution for the Pro/Agency model with a Stripe-owned trial.
//
// resolveTier() decides what a user may spend our money on, so the failure
// directions are not symmetric:
//
//   fail open    an unknown or lapsed row gets real entitlements -> we give
//                the product away, and keep paying for weekly scans
//   fail closed  a paying customer resolves to nothing -> we lock out someone
//                who is being billed
//
// It used to do date arithmetic against an app-managed trialEndsAt. Stripe
// owns the trial now and drives every transition by webhook, so this is a
// straight lookup and the tests pin the fail-closed default.

import { describe, it, expect } from "vitest";
import {
  resolveTier,
  usageLimits,
  SELLABLE_TIERS,
  PAYING_TIERS,
  isPayingTier,
  TRIAL_DAYS,
} from "@shared/schema";

describe("resolveTier", () => {
  it("returns the stored tier for every tier that exists", () => {
    for (const tier of Object.keys(usageLimits)) {
      expect(resolveTier({ accessTier: tier })).toBe(tier);
    }
  });

  it("fails closed to pending for an unknown or missing tier", () => {
    // `pending` grants nothing. Defaulting to `free` here would hand a real
    // allowance (a brand and 5 articles) to any row we cannot interpret.
    expect(resolveTier({ accessTier: "something-else" })).toBe("pending");
    expect(resolveTier({ accessTier: null })).toBe("pending");
    expect(resolveTier({})).toBe("pending");
  });

  it("does not resurrect the removed app-managed trial tiers", () => {
    // 0093 migrated these away. If either reappears in a row, it must resolve
    // to pending rather than silently granting whatever it used to.
    expect(resolveTier({ accessTier: "trial" })).toBe("pending");
    expect(resolveTier({ accessTier: "expired" })).toBe("pending");
  });
});

describe("usageLimits", () => {
  it("prices the two sellable plans apart on content generation", () => {
    // The $99/$500 split IS the article allowance: Pro is the tracking product
    // and generates none. If this becomes non-zero the plans collapse together.
    expect(usageLimits.pro.articlesPerMonth).toBe(0);
    expect(usageLimits.agency.articlesPerMonth).toBe(40);
    expect(usageLimits.agency.maxBrands).toBeGreaterThan(usageLimits.pro.maxBrands);
  });

  it("grants nothing to an account with no plan and no subscription", () => {
    for (const tier of ["pending", "readonly"] as const) {
      expect(usageLimits[tier].articlesPerMonth).toBe(0);
      expect(usageLimits[tier].maxBrands).toBe(0);
    }
  });

  it("only sells tiers that exist", () => {
    for (const tier of SELLABLE_TIERS) expect(usageLimits[tier]).toBeDefined();
    expect([...SELLABLE_TIERS]).toEqual(["pro", "agency"]);
  });
});

describe("isPayingTier", () => {
  // This gates the schedulers. Getting it wrong in the permissive direction
  // means running weekly citation runs across four AI engines, forever, for
  // accounts that pay nothing - which is exactly the cost that "read-only
  // instead of locked out" was supposed to avoid.
  it("excludes every state that is not entitled to paid work", () => {
    expect(isPayingTier("pending")).toBe(false);
    expect(isPayingTier("readonly")).toBe(false);
    expect(isPayingTier(null)).toBe(false);
    expect(isPayingTier(undefined)).toBe(false);
    expect(isPayingTier("nonsense")).toBe(false);
  });

  it("includes the plans and the grandfathered tiers", () => {
    for (const tier of ["pro", "agency", "enterprise", "beta", "free", "admin"]) {
      expect(isPayingTier(tier), `${tier} should be entitled`).toBe(true);
    }
  });

  it("keeps PAYING_TIERS a subset of the tiers that actually exist", () => {
    for (const tier of PAYING_TIERS) {
      expect(usageLimits[tier as keyof typeof usageLimits], `${tier} has no limits`).toBeDefined();
    }
  });
});

describe("trial length", () => {
  it("is the value handed to Stripe", () => {
    // Passed as subscription_data.trial_period_days in routes/billing.ts and
    // printed on the pricing page. One constant, so the page cannot promise a
    // different trial from the one Stripe runs.
    expect(TRIAL_DAYS).toBe(14);
  });
});
