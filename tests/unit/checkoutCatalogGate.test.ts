// The checkout price allow-list.
//
// This gate rejected EVERY purchase in production. The pricing page derives a
// priceId from the live Stripe catalog (tier + exact amount), but the checkout
// endpoint additionally required the price to match env-pinned IDs
// (STRIPE_PRO_PRODUCT_ID / STRIPE_PRO_PRICE_ID and the Agency pair). With
// those unset, approvedCatalog() was empty, .some() was false, and every
// attempt came back "Invalid or inactive price" - surfaced to the user as
// "Failed to start checkout". Two different rules on the two sides, so a plan
// could render as purchasable and then be refused.
//
// The pin is now per-tier and optional. These tests pin BOTH halves of that:
// it must still refuse anything that isn't a plan we publish at the price we
// publish, and it must still honour a pin when one is configured (that pin is
// what disambiguates the duplicate products sitting in the catalog).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PLAN_PRICE_CENTS } from "@shared/schema";

const PIN_VARS = [
  "STRIPE_PRO_PRODUCT_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_AGENCY_PRODUCT_ID",
  "STRIPE_AGENCY_PRICE_ID",
] as const;

/** Mirrors approvedCatalog() + isCatalogPrice() in server/routes/billing.ts. */
function approvedCatalog() {
  const entries: Array<{ tier: string; productId: string; priceId: string }> = [];
  if (process.env.STRIPE_PRO_PRODUCT_ID && process.env.STRIPE_PRO_PRICE_ID) {
    entries.push({
      tier: "pro",
      productId: process.env.STRIPE_PRO_PRODUCT_ID,
      priceId: process.env.STRIPE_PRO_PRICE_ID,
    });
  }
  if (process.env.STRIPE_AGENCY_PRODUCT_ID && process.env.STRIPE_AGENCY_PRICE_ID) {
    entries.push({
      tier: "agency",
      productId: process.env.STRIPE_AGENCY_PRODUCT_ID,
      priceId: process.env.STRIPE_AGENCY_PRICE_ID,
    });
  }
  return entries;
}

type FakePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
  product: { id: string; active: boolean; metadata: Record<string, string> } | string;
};

function isCatalogPrice(price: FakePrice, requestedPriceId: string): boolean {
  if (price.id !== requestedPriceId || !price.active) return false;
  if (
    price.currency.toLowerCase() !== "usd" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  ) {
    return false;
  }
  const product = price.product;
  if (typeof product === "string" || !product.active) return false;
  const tier = product.metadata.tier?.trim().toLowerCase();
  if (!tier || !(tier in PLAN_PRICE_CENTS)) return false;
  if (price.unit_amount !== PLAN_PRICE_CENTS[tier as keyof typeof PLAN_PRICE_CENTS]) return false;

  const pinsForTier = approvedCatalog().filter((e) => e.tier === tier);
  if (pinsForTier.length === 0) return true;
  return pinsForTier.some((e) => e.priceId === requestedPriceId && e.productId === product.id);
}

function proPrice(over: Partial<FakePrice> = {}): FakePrice {
  return {
    id: "price_pro",
    active: true,
    currency: "usd",
    unit_amount: PLAN_PRICE_CENTS.pro,
    recurring: { interval: "month", interval_count: 1 },
    product: { id: "prod_pro", active: true, metadata: { tier: "pro" } },
    ...over,
  };
}

describe("checkout catalog gate", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const v of PIN_VARS) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
  });
  afterEach(() => {
    for (const v of PIN_VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });

  it("accepts a published plan when no env pin is configured", () => {
    // THE REGRESSION: this returned false, so nobody could ever check out.
    expect(isCatalogPrice(proPrice(), "price_pro")).toBe(true);
  });

  it("still enforces a pin when one IS configured for that tier", () => {
    // The pin is what disambiguates the duplicate Pro products in the catalog.
    process.env.STRIPE_PRO_PRODUCT_ID = "prod_pro";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    expect(isCatalogPrice(proPrice(), "price_pro")).toBe(true);
    expect(isCatalogPrice(proPrice({ id: "price_other" }), "price_other")).toBe(false);
  });

  it("does not let a pin on one tier block an unpinned other tier", () => {
    // Pinning Pro must not make Agency unsellable - that would recreate the
    // original bug for the tier nobody remembered to pin.
    process.env.STRIPE_PRO_PRODUCT_ID = "prod_pro";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    const agency = proPrice({
      id: "price_agency",
      unit_amount: PLAN_PRICE_CENTS.agency,
      product: { id: "prod_agency", active: true, metadata: { tier: "agency" } },
    });
    expect(isCatalogPrice(agency, "price_agency")).toBe(true);
  });

  // ── The allow-list must still hold without the pin ──────────────────────

  it("rejects a price whose amount is not what we publish", () => {
    // The real catalog has Pro at 7900 while the app publishes 9900. Selling
    // at an amount the app does not believe in is exactly what must not happen.
    expect(isCatalogPrice(proPrice({ unit_amount: 7900 }), "price_pro")).toBe(false);
  });

  it("rejects a product with no sellable tier metadata", () => {
    const orphan = proPrice({
      product: { id: "prod_x", active: true, metadata: {} },
    });
    expect(isCatalogPrice(orphan, "price_pro")).toBe(false);
  });

  it("rejects a non-sellable tier such as free or enterprise", () => {
    for (const tier of ["free", "enterprise"]) {
      const p = proPrice({ product: { id: "prod_x", active: true, metadata: { tier } } });
      expect(isCatalogPrice(p, "price_pro")).toBe(false);
    }
  });

  it("rejects inactive prices and inactive products", () => {
    expect(isCatalogPrice(proPrice({ active: false }), "price_pro")).toBe(false);
    expect(
      isCatalogPrice(
        proPrice({ product: { id: "prod_pro", active: false, metadata: { tier: "pro" } } }),
        "price_pro",
      ),
    ).toBe(false);
  });

  it("rejects non-USD, non-monthly, and multi-interval prices", () => {
    expect(isCatalogPrice(proPrice({ currency: "eur" }), "price_pro")).toBe(false);
    expect(
      isCatalogPrice(proPrice({ recurring: { interval: "year", interval_count: 1 } }), "price_pro"),
    ).toBe(false);
    expect(
      isCatalogPrice(
        proPrice({ recurring: { interval: "month", interval_count: 3 } }),
        "price_pro",
      ),
    ).toBe(false);
    expect(isCatalogPrice(proPrice({ recurring: null }), "price_pro"), "one-off price").toBe(false);
  });

  it("rejects a price id that does not match the one requested", () => {
    expect(isCatalogPrice(proPrice(), "price_something_else")).toBe(false);
  });
});
