// The welcome tour must not appear on the /welcome page.
//
// It used to, and the cause was not a bad route match - reading the config
// alone says it cannot happen, which is exactly why this needs a test rather
// than a comment. It is a race:
//
//   1. a brand-new user lands on /dashboard
//   2. this tour's route trigger matches, and the Shepherd modal opens
//   3. FirstRunGate then sees zero brands and <Navigate to="/welcome">
//   4. TourOrchestrator is mounted in __root.tsx, OUTSIDE the route tree, so
//      the navigation never unmounts it and the open modal rides along
//
// The guard is `brands >= 1` - precisely FirstRunGate's own condition for not
// redirecting - so the tour can never fire on a render that is about to be
// navigated away from.

import { describe, it, expect } from "vitest";
import { shouldAutoFire } from "../../client/src/tours/engine/eligibility";
import { globalWelcomeTour } from "../../client/src/tours/global-welcome.tour";
import type { TourContext, TourState } from "../../client/src/tours/types";

const state: TourState = { v: 1, tours: {} } as TourState;

function ctxWithBrands(brands: number): TourContext {
  return {
    userId: "u1",
    brandId: brands > 0 ? "b1" : null,
    isAdmin: false,
    counts: { brands, mentions: 0, citations: 0, articles: 0, prompts: 0 },
  };
}

describe("global welcome tour", () => {
  it("does NOT fire on the dashboard for a user with no brands", () => {
    // This is the exact render that used to open the modal a beat before
    // FirstRunGate redirected to /welcome.
    expect(shouldAutoFire(globalWelcomeTour, state, ctxWithBrands(0), "/dashboard")).toBe(false);
    expect(shouldAutoFire(globalWelcomeTour, state, ctxWithBrands(0), "/")).toBe(false);
  });

  it("fires on the dashboard once the user has a brand", () => {
    expect(shouldAutoFire(globalWelcomeTour, state, ctxWithBrands(1), "/dashboard")).toBe(true);
    expect(shouldAutoFire(globalWelcomeTour, state, ctxWithBrands(1), "/")).toBe(true);
  });

  it("never fires on /welcome itself, brands or not", () => {
    for (const brands of [0, 1, 5]) {
      expect(shouldAutoFire(globalWelcomeTour, state, ctxWithBrands(brands), "/welcome")).toBe(
        false,
      );
    }
  });

  it("keeps a route gate at all, so it cannot fire app-wide", () => {
    // A predicate trigger with no `routes` skips the route check entirely and
    // fires on every page - the failure mode this config must not drift into.
    expect(globalWelcomeTour.trigger.kind).toBe("predicate");
    const routes = (globalWelcomeTour.trigger as { routes?: string[] }).routes;
    expect(routes).toBeDefined();
    expect(routes).toContain("/dashboard");
  });
});
