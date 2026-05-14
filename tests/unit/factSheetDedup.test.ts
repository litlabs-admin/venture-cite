import { describe, it, expect } from "vitest";
import { dedupWithinRun } from "../../server/lib/factAgent/dedup";
import type { ExtractedFact } from "../../server/lib/factAgent/types";

const f = (factValue: string, confidence: number): ExtractedFact => ({
  domain: "identity",
  subcategory: "description",
  factKey: "primary",
  factValue,
  valueType: "string",
  valuePayload: null,
  confidence,
  sourceExcerpt: "",
  sourceUrl: "https://x.com/" + factValue,
});

describe("dedupWithinRun", () => {
  it("returns single fact unchanged", () => {
    const out = dedupWithinRun([f("A", 0.9)]);
    expect(out).toHaveLength(1);
    expect(out[0].factValue).toBe("A");
  });

  it("keeps highest-confidence per tuple", () => {
    const out = dedupWithinRun([f("A", 0.5), f("B", 0.9), f("C", 0.7)]);
    expect(out).toHaveLength(1);
    expect(out[0].factValue).toBe("B");
  });

  it("attaches losers to valuePayload.alternatives", () => {
    const out = dedupWithinRun([f("A", 0.5), f("B", 0.9), f("C", 0.7)]);
    const alts = (out[0].valuePayload as { alternatives: unknown[] }).alternatives;
    expect(alts).toHaveLength(2);
  });

  it("preserves tuples that don't conflict", () => {
    const a = f("A", 0.9);
    const b: ExtractedFact = { ...f("X", 0.8), factKey: "tagline" };
    const out = dedupWithinRun([a, b]);
    expect(out).toHaveLength(2);
  });
});
