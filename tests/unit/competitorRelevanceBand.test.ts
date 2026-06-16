import { describe, it, expect } from "vitest";
import { relevanceForRank } from "../../server/lib/competitorRelevance";

// Phase 6: discovery assigns a relevance score by rank so the "All discovered"
// tab can be ranked, and so AI-direct competitors (core band) always outrank
// citation-mined ones (discovered band) when both land in the same pool.
describe("relevanceForRank", () => {
  it("scores AI-inferred competitors in the core band (60-100)", () => {
    for (let i = 0; i < 12; i++) {
      const score = relevanceForRank("ai", i);
      expect(score).toBeGreaterThanOrEqual(60);
      expect(score).toBeLessThanOrEqual(100);
    }
    expect(relevanceForRank("ai", 0)).toBe(100);
  });

  it("scores citation-mined competitors in the discovered band (25-55)", () => {
    for (let i = 0; i < 12; i++) {
      const score = relevanceForRank("citation_mining", i);
      expect(score).toBeGreaterThanOrEqual(25);
      expect(score).toBeLessThanOrEqual(55);
    }
    expect(relevanceForRank("citation_mining", 0)).toBe(55);
  });

  it("never lets a mined competitor outrank an AI-inferred one (bands don't overlap)", () => {
    const worstAi = Math.min(...Array.from({ length: 20 }, (_, i) => relevanceForRank("ai", i)));
    const bestMined = relevanceForRank("citation_mining", 0);
    expect(worstAi).toBeGreaterThan(bestMined);
  });

  it("is monotonically non-increasing with rank within a source", () => {
    for (const source of ["ai", "citation_mining"] as const) {
      for (let i = 1; i < 20; i++) {
        expect(relevanceForRank(source, i)).toBeLessThanOrEqual(relevanceForRank(source, i - 1));
      }
    }
  });
});
