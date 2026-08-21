// REGRESSION GUARD: a tour must never be evaluated against a not-yet-loaded
// tour state.
//
// A production incident showed that stored skipped state did not prevent
// repeated tour starts. The writes succeeded. The orchestrator called
// `shouldAutoFire` before `/api/tours/state` resolved. `useTourState` returns
// `{}` until the request completes.
//
// An empty state is indistinguishable from "never seen it", which is the
// whole bug: these assertions document that shouldAutoFire CANNOT tell the
// difference, so the caller is the one that must wait.

import { describe, it, expect } from "vitest";
import { shouldAutoFire } from "@/tours/engine/eligibility";
import { globalWelcomeTour } from "@/tours/global-welcome.tour";
import type { TourContext, TourState } from "@/tours/types";

const ctx: TourContext = {
  userId: "u-1",
  brandId: "b-1",
  isAdmin: false,
  counts: { brands: 1, mentions: 0, citations: 0, articles: 0, prompts: 0 },
};

// The exact production row that kept re-firing.
const skipped: TourState = {
  global: { v: 2, skippedAt: "2026-07-29T19:18:01.391Z" },
};

describe("shouldAutoFire cannot distinguish 'loading' from 'never seen'", () => {
  it("suppresses the tour once the real state has loaded", () => {
    expect(shouldAutoFire(globalWelcomeTour, skipped, ctx, "/dashboard")).toBe(false);
  });

  it("fires on an empty state - which is what an in-flight query looks like", () => {
    // NOT a bug in this function: with no record there is genuinely nothing
    // to suppress on. It is the reason TourOrchestrator must gate on
    // `isLoading` before calling it at all.
    expect(shouldAutoFire(globalWelcomeTour, {}, ctx, "/dashboard")).toBe(true);
  });

  it("honours a completion the same way as a skip", () => {
    const completed: TourState = { global: { v: 2, completedAt: "2026-07-29T19:18:01.391Z" } };
    expect(shouldAutoFire(globalWelcomeTour, completed, ctx, "/dashboard")).toBe(false);
  });

  it("re-fires only when the tour's version is bumped past the stored one", () => {
    const stale: TourState = { global: { v: 1, completedAt: "2026-05-19T05:28:59.982Z" } };
    expect(globalWelcomeTour.version).toBeGreaterThan(1);
    expect(shouldAutoFire(globalWelcomeTour, stale, ctx, "/dashboard")).toBe(true);
  });
});
