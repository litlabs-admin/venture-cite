import { describe, it, expect } from "vitest";
import { buildTone } from "../../client/src/components/dashboard-panels/useDashboardData";

// The Perception panel's whole claim to honesty rests on these cases: a dash
// and a zero must never be the same thing.

describe("buildTone", () => {
  it("returns null when the endpoint sent no sentiment stats at all", () => {
    expect(buildTone(undefined)).toBeNull();
  });

  it("scores nothing-judged as null, not 0", () => {
    const t = buildTone({ positive: 0, neutral: 0, negative: 0 })!;
    expect(t.total).toBe(0);
    // 0 would be indistinguishable from "every mention was negative" below.
    expect(t.score).toBeNull();
  });

  it("scores all-negative as 0 — a real, measured floor", () => {
    const t = buildTone({ positive: 0, neutral: 0, negative: 5 })!;
    expect(t.total).toBe(5);
    expect(t.score).toBe(0);
  });

  it("scores all-positive as 100", () => {
    expect(buildTone({ positive: 4, neutral: 0, negative: 0 })!.score).toBe(100);
  });

  it("counts neutrals at half weight, so all-neutral lands mid-scale", () => {
    expect(buildTone({ positive: 0, neutral: 6, negative: 0 })!.score).toBe(50);
  });

  it("mixes the three buckets and rounds", () => {
    // (3 + 2*0.5) / 8 = 0.5 -> 50
    const t = buildTone({ positive: 3, neutral: 2, negative: 3 })!;
    expect(t.total).toBe(8);
    expect(t.score).toBe(50);
  });

  it("treats missing buckets as zero rather than NaN", () => {
    const t = buildTone({ positive: 2 })!;
    expect(t.neutral).toBe(0);
    expect(t.negative).toBe(0);
    expect(t.score).toBe(100);
  });
});
