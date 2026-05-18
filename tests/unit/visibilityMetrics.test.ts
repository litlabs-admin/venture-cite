import { describe, it, expect } from "vitest";

import {
  citationRateFraction,
  citationRatePct,
  computeVisibilityScore,
} from "../../server/lib/visibilityMetrics";

describe("visibilityMetrics — canonical citation rate", () => {
  describe("citationRateFraction", () => {
    it("returns 0 when there were no checks (no division by zero)", () => {
      expect(citationRateFraction(0, 0)).toBe(0);
      expect(citationRateFraction(5, 0)).toBe(0);
    });

    it("returns the raw 0..1 fraction otherwise", () => {
      expect(citationRateFraction(0, 10)).toBe(0);
      expect(citationRateFraction(10, 10)).toBe(1);
      expect(citationRateFraction(1, 4)).toBe(0.25);
      expect(citationRateFraction(1, 3)).toBeCloseTo(0.3333, 4);
    });
  });

  describe("citationRatePct", () => {
    it("returns 0 when there were no checks", () => {
      expect(citationRatePct(0, 0)).toBe(0);
      expect(citationRatePct(3, 0)).toBe(0);
    });

    it("returns an integer 0..100 with half-up rounding", () => {
      expect(citationRatePct(0, 10)).toBe(0);
      expect(citationRatePct(10, 10)).toBe(100);
      expect(citationRatePct(1, 3)).toBe(33);
      expect(citationRatePct(2, 3)).toBe(67);
      expect(citationRatePct(1, 8)).toBe(13); // 12.5 → 13 (Math.round)
    });

    it("is exactly Math.round(fraction * 100) — behaviour-preserving for migrated call sites", () => {
      for (const [c, t] of [
        [0, 0],
        [7, 0],
        [0, 20],
        [13, 20],
        [20, 20],
        [1, 7],
        [5, 9],
      ] as const) {
        const expected = t > 0 ? Math.round((c / t) * 100) : 0;
        expect(citationRatePct(c, t)).toBe(expected);
      }
    });
  });

  describe("computeVisibilityScore", () => {
    it("returns 0 when there are no citations (no theater)", () => {
      expect(computeVisibilityScore(0, 0, 0, 0)).toBe(0);
      expect(computeVisibilityScore(0, 50, 3, 80)).toBe(0);
    });

    it("clamps to 0..100 and rounds to an integer", () => {
      const v = computeVisibilityScore(10, 10, 1, 100);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      // Perfect: 100% rate, rank 1 (factor 1), authority 100 → 70 + 30.
      expect(v).toBe(100);
    });

    it("treats avgRank <= 0 as 'no rank data' (neutral factor 1)", () => {
      // rate 1, authority 0: 70 * 1 * ((1+1)/2) + 0 = 70
      expect(computeVisibilityScore(4, 4, 0, 0)).toBe(70);
      expect(computeVisibilityScore(4, 4, -5, 0)).toBe(70);
    });

    it("is exactly the legacy dashboard-hero formula (behaviour-preserving canonicalisation)", () => {
      // Mirror of the pre-unification hero expression so the refactor is
      // provably a no-op for the hero surface.
      const legacyHero = (
        cited: number,
        total: number,
        avgRank: number,
        avgAuth: number,
      ): number => {
        if (cited === 0) return 0;
        const rate = total > 0 ? cited / total : 0;
        const rankFactor = avgRank > 0 ? Math.max(0, 1 - (avgRank - 1) / 10) : 1;
        const raw = 70 * rate * ((1 + rankFactor) / 2) + 30 * (avgAuth / 100);
        return Math.min(100, Math.max(0, Math.round(raw)));
      };
      for (const [c, t, r, a] of [
        [0, 0, 0, 0],
        [3, 10, 2, 55],
        [10, 10, 1, 100],
        [1, 9, 7, 0],
        [5, 8, 0, 40],
        [12, 40, 4.5, 73],
        [40, 40, 10, 100],
      ] as const) {
        expect(computeVisibilityScore(c, t, r, a)).toBe(legacyHero(c, t, r, a));
      }
    });
  });
});
