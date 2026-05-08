// tests/unit/tourEligibility.test.ts
import { describe, it, expect } from "vitest";
import { shouldAutoFire } from "../../client/src/tours/engine/eligibility";
import type { TourConfig, TourContext, TourState } from "../../client/src/tours/types";

const ctx: TourContext = {
  userId: "u1",
  brandId: "b1",
  isAdmin: false,
  counts: { brands: 1, mentions: 0, citations: 0, articles: 0, prompts: 0 },
};

const globalTour: TourConfig = {
  id: "global-welcome",
  version: 1,
  scope: "global",
  trigger: { kind: "route", routes: ["/dashboard", "/"] },
  steps: [{ id: "intro", content: "hi" }],
};

const pageTour: TourConfig = {
  id: "citations",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [{ id: "intro", content: "hi" }],
};

const nudge: TourConfig = {
  id: "first-scan-complete",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "predicate", evaluate: (c) => c.counts.mentions === 1 },
  steps: [{ id: "celebrate", content: "🎉" }],
};

describe("shouldAutoFire", () => {
  it("returns false when perUserSuppressed includes tourId", () => {
    const state: TourState = { perUserSuppressed: ["global-welcome"] };
    expect(shouldAutoFire(globalTour, state, ctx, "/dashboard")).toBe(false);
  });

  it("returns false when wildcard '*' suppress is present", () => {
    const state: TourState = { perUserSuppressed: ["*"] };
    expect(shouldAutoFire(globalTour, state, ctx, "/dashboard")).toBe(false);
  });

  it("returns false when global.completedAt exists at current version", () => {
    const state: TourState = { global: { v: 1, completedAt: "2026-01-01" } };
    expect(shouldAutoFire(globalTour, state, ctx, "/dashboard")).toBe(false);
  });

  it("returns true when global.v is older than tour.version", () => {
    const state: TourState = { global: { v: 1, completedAt: "2026-01-01" } };
    const v2 = { ...globalTour, version: 2 };
    expect(shouldAutoFire(v2, state, ctx, "/dashboard")).toBe(true);
  });

  it("returns false when route does not match trigger.routes", () => {
    expect(shouldAutoFire(globalTour, {}, ctx, "/citations")).toBe(false);
  });

  it("returns false for manual-trigger tours (page tours)", () => {
    expect(shouldAutoFire(pageTour, {}, ctx, "/citations")).toBe(false);
  });

  it("returns true when nudge predicate is true and not yet completed for brand", () => {
    const fired = { ...ctx, counts: { ...ctx.counts, mentions: 1 } };
    expect(shouldAutoFire(nudge, {}, fired, "/geo-tools")).toBe(true);
  });

  it("returns false when nudge already completed for current brand", () => {
    const state: TourState = {
      perBrand: {
        b1: { "first-scan-complete": { v: 1, completedAt: "2026-01-01" } },
      },
    };
    const fired = { ...ctx, counts: { ...ctx.counts, mentions: 1 } };
    expect(shouldAutoFire(nudge, state, fired, "/geo-tools")).toBe(false);
  });

  it("returns true when nudge completed at older version (re-fire on version bump)", () => {
    const state: TourState = {
      perBrand: {
        b1: { "first-scan-complete": { v: 1, completedAt: "2026-01-01" } },
      },
    };
    const v2: TourConfig = { ...nudge, version: 2 };
    const fired = { ...ctx, counts: { ...ctx.counts, mentions: 1 } };
    expect(shouldAutoFire(v2, state, fired, "/geo-tools")).toBe(true);
  });

  it("returns false when perBrand tour requires brandId but ctx.brandId is null", () => {
    const noBrand: TourContext = { ...ctx, brandId: null };
    const fired = { ...noBrand, counts: { ...noBrand.counts, mentions: 1 } };
    expect(shouldAutoFire(nudge, {}, fired, "/geo-tools")).toBe(false);
  });
});
