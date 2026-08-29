import { describe, it, expect } from "vitest";

import {
  citationRateFraction,
  citationRatePct,
  computeVisibilityScore,
} from "../../shared/visibilityMetrics";

describe("visibilityMetrics - canonical citation rate", () => {
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
      expect(citationRatePct(5, 10)).toBe(50); // exact half
      expect(citationRatePct(1, 3)).toBe(33);
      expect(citationRatePct(2, 3)).toBe(67);
      expect(citationRatePct(1, 8)).toBe(13); // 12.5 → 13 (Math.round)
    });

    it("is exactly Math.round(fraction * 100) - behaviour-preserving for migrated call sites", () => {
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

    it("treats avgRank <= 0 as 'no rank data' → NEUTRAL blend (factor 0.5), not best-case", () => {
      // rate 1, authority measured 0, no rank data: 70 * 1 * ((1+0.5)/2) + 0
      // = 70 * 0.75 = 52.5 → 53. (Was 70 under the old best-case factor 1 -
      // the bug where a brand with NO rank data outscored one cited at rank 5.)
      expect(computeVisibilityScore(4, 4, 0, 0)).toBe(53);
      expect(computeVisibilityScore(4, 4, -5, 0)).toBe(53);
    });

    it("drops the authority weight when authority is UNMEASURED (null), not capping at 70", () => {
      // rate 1, rank 1, authority null → renormalise to 100: 100 * 1 * 1 = 100.
      // (Was capped at 70 when unmeasured authority was scored as a genuine 0.)
      expect(computeVisibilityScore(4, 4, 1, null)).toBe(100);
      // rate 1, no rank data, authority null → 100 * 1 * 0.75 = 75.
      expect(computeVisibilityScore(4, 4, 0, null)).toBe(75);
      // A genuine measured 0 authority STILL costs the 30 pts: 70 * 1 * 1 = 70.
      expect(computeVisibilityScore(4, 4, 1, 0)).toBe(70);
    });

    it("matches the documented composite formula (measured + unmeasured authority)", () => {
      const formula = (
        cited: number,
        total: number,
        avgRank: number,
        avgAuth: number | null,
      ): number => {
        if (cited <= 0) return 0;
        const rate = total > 0 ? cited / total : 0;
        const rankFactor = avgRank > 0 ? Math.max(0, 1 - (avgRank - 1) / 10) : 0.5;
        const rankBlend = (1 + rankFactor) / 2;
        const raw =
          avgAuth === null
            ? 100 * rate * rankBlend
            : 70 * rate * rankBlend + 30 * (Math.max(0, avgAuth) / 100);
        return Math.min(100, Math.max(0, Math.round(raw)));
      };
      const cases: Array<[number, number, number, number | null]> = [
        [0, 0, 0, 0],
        [3, 10, 2, 55],
        [10, 10, 1, 100],
        [1, 9, 7, 0],
        [5, 8, 0, 40],
        [12, 40, 4.5, 73],
        [40, 40, 10, 100],
        [4, 4, 1, null],
        [4, 4, 0, null],
        [8, 10, 3, null],
      ];
      for (const [c, t, r, a] of cases) {
        expect(computeVisibilityScore(c, t, r, a)).toBe(formula(c, t, r, a));
      }
    });
  });
});
