// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { shouldAutoFire } from "../../client/src/tours/engine/eligibility";
import { suppressedMentionsTourState, wildcardSuppressedTourState } from "../fixtures/tourState";
import type { TourConfig, TourContext } from "../../client/src/tours/types";

const ctx: TourContext = {
  userId: "u1",
  brandId: "b1",
  isAdmin: false,
  counts: { brands: 1, mentions: 1, citations: 0, articles: 0, prompts: 0 },
};

const nudge: TourConfig = {
  id: "first-scan-complete",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "predicate", evaluate: () => true },
  steps: [{ id: "x", content: "x" }],
};

describe("suppression flow", () => {
  it("suppressing a tour blocks auto-fire", () => {
    expect(shouldAutoFire(nudge, suppressedMentionsTourState, ctx, "/geo-tools")).toBe(false);
  });

  it("wildcard suppress blocks every auto-fire", () => {
    expect(shouldAutoFire(nudge, wildcardSuppressedTourState, ctx, "/geo-tools")).toBe(false);
  });
});
