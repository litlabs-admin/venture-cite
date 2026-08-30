// New signups must land inside the app, not on a paywall.
//
// The paywall was never a separate feature - it was one column value.
// handle_new_user stamped access_tier = 'pending', the zero-entitlement tier,
// and two independent gates key off exactly that:
//
//   TrialGate       lets a user through only when resolveTier() !== "pending"
//   routeGates      sends a brandless user to /welcome only when their tier
//                   permits a brand at all; on 0 it sends them to /pricing
//
// So this test pins the PROPERTIES the signup tier has to satisfy, rather than
// the string "beta". If someone later changes the granted tier, this fails
// only if the new tier would put users back behind the wall - which is the
// thing we actually care about.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { usageLimits, resolveTier, PAYING_TIERS } from "@shared/schema";

/** The tier the signup trigger grants, read from the migration itself. */
function grantedTier(): string {
  const sql = readFileSync(
    join(process.cwd(), "migrations", "0122_signup_grants_beta.sql"),
    "utf8",
  );
  // The INSERT's access_tier value - the only quoted tier in the values list.
  const m = sql.match(/case when new\.email_confirmed_at[\s\S]*?\n\s*'([a-z]+)',/);
  if (!m) throw new Error("could not find the granted tier in migration 0122");
  return m[1];
}

describe("signup grants usable access", () => {
  it("does not grant the zero-entitlement pending tier", () => {
    // THE REGRESSION: 'pending' is what put every new signup on /pricing.
    expect(grantedTier()).not.toBe("pending");
  });

  it("grants a tier that clears the plan gate", () => {
    // TrialGate's rule, restated: anything other than "pending" passes.
    expect(resolveTier({ accessTier: grantedTier() })).not.toBe("pending");
  });

  it("grants a tier that can actually create a brand", () => {
    // routeGates sends a brandless user to /welcome only when maxBrands !== 0.
    // Without this the user would reach the app and then be bounced to
    // pricing anyway - a paywall one redirect further along.
    const limits = usageLimits[grantedTier() as keyof typeof usageLimits];
    expect(limits).toBeDefined();
    expect(limits.maxBrands).not.toBe(0);
  });

  it("grants a tier treated as having a plan, so no second trial is offered", () => {
    // PAYING_TIERS drives the trial-vs-switch copy on pricing. A tier outside
    // it would be offered a "free trial" it is already effectively on.
    expect(PAYING_TIERS).toContain(grantedTier());
  });

  it("resolves to a known tier rather than falling back", () => {
    // resolveTier is deliberately closed - an unrecognised value silently
    // becomes 'pending', which would restore the paywall without any error.
    expect(grantedTier() in usageLimits).toBe(true);
  });

  it("leaves existing accounts alone", () => {
    // The ON CONFLICT branch must not write access_tier: it also fires on
    // re-confirmation and on the email-reclaim path, where rewriting the tier
    // would downgrade a paying customer.
    const sql = readFileSync(
      join(process.cwd(), "migrations", "0122_signup_grants_beta.sql"),
      "utf8",
    );
    const onConflict = sql.slice(sql.indexOf("on conflict"));
    expect(onConflict).not.toMatch(/access_tier\s*=/);
  });

  it("re-applies the EXECUTE revoke that CREATE OR REPLACE resets", () => {
    // Migration 0111 locked this SECURITY DEFINER function down. Replacing the
    // function re-grants the owner default, so a replacement that forgets this
    // silently widens who may call it.
    const sql = readFileSync(
      join(process.cwd(), "migrations", "0122_signup_grants_beta.sql"),
      "utf8",
    );
    expect(sql.toLowerCase()).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+from\s+public,\s*anon,\s*authenticated/,
    );
  });
});
