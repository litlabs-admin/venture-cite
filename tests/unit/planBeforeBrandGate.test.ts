// The order of the two first-run gates, and where checkout lets go.
//
// Both of these are journey bugs, not logic bugs - every individual piece
// worked, they were just wired in the wrong order, so the customer met them
// back to front:
//
//   1. a brand-less account went to /welcome regardless of plan. usageLimits
//      gives an unsubscribed account 0 brands, so that form CANNOT succeed -
//      it scraped their site, ran an LLM over it, and only then returned 403.
//   2. checkout dropped them back on /pricing with a green tick, the page they
//      had just left, instead of moving them forward into the product.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveTier, usageLimits } from "../../shared/schema";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("plan comes before brand", () => {
  const gates = read("src/routes/-shared/routeGates.tsx");

  it("sends a brand-less account with no plan to pricing, not to the brand form", () => {
    const gate = gates.slice(gates.indexOf("export function FirstRunGate"));
    expect(gate).toContain("canCreateBrand");
    expect(gate).toContain('"/pricing"');
    // The brand form stays the destination for everyone who CAN use it.
    expect(gate).toContain('"/welcome"');
  });

  it("decides from usageLimits rather than a hardcoded tier list", () => {
    // Naming tiers here rots the moment a tier is added; maxBrands is the
    // thing that actually decides whether the next page can work.
    const gate = gates.slice(gates.indexOf("export function FirstRunGate"));
    expect(gate).toContain("usageLimits[resolveTier(user)].maxBrands");
  });

  it("agrees with the entitlements it is reading", () => {
    // The gate is only correct if these really are 0 - otherwise it sends
    // people who could create a brand to pricing instead.
    expect(usageLimits[resolveTier({ accessTier: "pending" })].maxBrands).toBe(0);
    expect(usageLimits[resolveTier({ accessTier: "readonly" })].maxBrands).toBe(0);
    // ...and paying accounts must NOT be diverted.
    expect(usageLimits[resolveTier({ accessTier: "pro" })].maxBrands).toBeGreaterThan(0);
    expect(usageLimits[resolveTier({ accessTier: "agency" })].maxBrands).toBeGreaterThan(0);
  });
});

describe("checkout hands off forwards", () => {
  const billing = read("server/routes/billing.ts");

  it("returns from Stripe into onboarding, not back onto the pricing page", () => {
    expect(billing).toContain("/welcome?checkout=success");
    expect(billing).not.toContain("/pricing?success=true");
  });

  it("still returns a cancelled checkout to pricing", () => {
    // Cancelling means "not this plan", so the plan picker is the right place
    // to land - the opposite of the success case.
    expect(billing).toContain("/pricing?canceled=true");
  });

  it("refreshes the cached user on the way in", () => {
    // The tier is granted by a webhook while the customer is still on Stripe's
    // domain, so the /api/auth/me cached here predates their plan.
    const welcome = read("client/src/pages/welcome.tsx");
    expect(welcome).toContain('has("checkout")');
    expect(welcome).toContain('queryKey: ["/api/auth/me"]');
  });
});
