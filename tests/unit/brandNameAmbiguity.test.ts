import { describe, it, expect } from "vitest";
import { brandNameAmbiguityScore, brandNameWarning } from "../../server/lib/brandNameAmbiguity";

describe("brandNameAmbiguityScore", () => {
  it("flags common-word brand names", () => {
    expect(brandNameAmbiguityScore("Apple")).toBeGreaterThanOrEqual(2);
    expect(brandNameAmbiguityScore("apple")).toBeGreaterThanOrEqual(2);
    expect(brandNameAmbiguityScore("Match")).toBeGreaterThanOrEqual(2);
    expect(brandNameAmbiguityScore("Square")).toBeGreaterThanOrEqual(2);
  });

  it("flags very short single-word names as mildly ambiguous", () => {
    expect(brandNameAmbiguityScore("xyz")).toBeGreaterThanOrEqual(1);
  });

  it("does not flag ordinary multi-word brand names", () => {
    expect(brandNameAmbiguityScore("Acme Corp")).toBe(0);
    expect(brandNameAmbiguityScore("VentureCite")).toBe(0);
  });

  it("handles null/empty defensively", () => {
    expect(brandNameAmbiguityScore(null)).toBe(0);
    expect(brandNameAmbiguityScore(undefined)).toBe(0);
    expect(brandNameAmbiguityScore("")).toBe(0);
    expect(brandNameAmbiguityScore("   ")).toBe(0);
  });
});

describe("brandNameWarning", () => {
  it("returns null for non-ambiguous names", () => {
    expect(brandNameWarning("VentureCite")).toBeNull();
  });

  it("returns a non-empty advisory for ambiguous names", () => {
    const w = brandNameWarning("Apple");
    expect(typeof w).toBe("string");
    expect(w!.length).toBeGreaterThan(20);
    expect(w!.toLowerCase()).toContain("variations");
  });
});
