import { describe, it, expect } from "vitest";
import {
  getRecommendations,
  type RecommendationState,
} from "../../server/lib/recommendationsEngine";

// Helper: builds a minimal RecommendationState with sensible defaults
// that the test can override per-case. Defaults represent a brand-new
// user with NO data anywhere.
function state(overrides: Partial<RecommendationState> = {}): RecommendationState {
  return {
    brand: null,
    articleCount: 0,
    promptCount: 0,
    citationRunCount: 0,
    citationRate: null,
    lastSignalsScanAt: null,
    visibilityChecklistCompleted: 0,
    visibilityChecklistTotal: 4,
    competitorCount: 0,
    communityPostCount: 0,
    faqCount: 0,
    unresolvedHallucinationCount: 0,
    autoDiscoveredCompetitorCount: 0,
    ...overrides,
  };
}

describe("getRecommendations", () => {
  it("empty state (no brand) returns only P0 #1: create brand", () => {
    const recs = getRecommendations(state());
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("create-brand");
    expect(recs[0].priority).toBe("P0");
    expect(recs[0].dismissible).toBe(false);
  });

  it("brand created without industry returns only P0 #2: add industry", () => {
    const recs = getRecommendations(state({ brand: { id: "b-1", industry: null } as any }));
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("add-brand-industry");
    expect(recs[0].priority).toBe("P0");
  });

  it("full setup (brand + industry + 5 articles + 3 prompts + 2 runs) at 0% citation rate returns P1 fact-sheet + FAQ", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 5,
        promptCount: 3,
        citationRunCount: 2,
        citationRate: 0,
        faqCount: 0,
        lastSignalsScanAt: new Date(), // not stale → rule #8 doesn't fire
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
      }),
    );
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("add-brand-fact-sheet");
    expect(ids).toContain("optimize-faq");
    // No P0 should fire because all setup is done.
    expect(recs.every((r) => r.priority !== "P0")).toBe(true);
  });

  it("all P0/P1 done at 30% citation rate returns only P2 growth recommendations", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 10,
        promptCount: 5,
        citationRunCount: 3,
        citationRate: 0.3,
        faqCount: 5,
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
        competitorCount: 0,
        communityPostCount: 0,
      }),
    );
    expect(recs.every((r) => r.priority === "P2")).toBe(true);
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("add-competitors");
    expect(ids).toContain("try-community-outreach");
  });

  it("output is capped at 5 items, P0 first", () => {
    // Construct a state where many rules fire simultaneously.
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: null } as any, // P0 #2
        articleCount: 0, // P0 #3
        promptCount: 0, // P0 #4
        citationRunCount: 0, // P0 #5
        citationRate: 0.1, // P1 #6 + #7 (faqCount=0)
        lastSignalsScanAt: null, // P1 #8
        visibilityChecklistCompleted: 1,
        visibilityChecklistTotal: 4, // P1 #9
        competitorCount: 0, // P2 #10
        communityPostCount: 0, // P2 #11
      }),
    );
    expect(recs.length).toBeLessThanOrEqual(5);
    // First items are P0.
    const priorities = recs.map((r) => r.priority);
    const firstP1Index = priorities.indexOf("P1");
    if (firstP1Index >= 0) {
      // No P0 should appear after the first P1.
      expect(priorities.slice(firstP1Index).every((p) => p !== "P0")).toBe(true);
    }
  });

  it("unresolved hallucinations surface a dismissible P1 'correct-hallucinations' deep-linking to Diagnose", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 5,
        promptCount: 3,
        citationRunCount: 2,
        citationRate: 0.5, // healthy → no other P1 citation recs
        faqCount: 5,
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
        unresolvedHallucinationCount: 3,
      }),
    );
    const hit = recs.find((r) => r.id === "correct-hallucinations");
    expect(hit).toBeDefined();
    expect(hit!.priority).toBe("P1");
    expect(hit!.dismissible).toBe(true);
    expect(hit!.title).toContain("3");
    expect(hit!.ctaHref).toBe("/diagnose?tab=hallucinations&brandId=b-1");
  });

  it("zero unresolved hallucinations → no 'correct-hallucinations' rec", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 5,
        promptCount: 3,
        citationRunCount: 2,
        citationRate: 0.5,
        faqCount: 5,
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
        unresolvedHallucinationCount: 0,
      }),
    );
    expect(recs.some((r) => r.id === "correct-hallucinations")).toBe(false);
  });

  it("auto-discovered competitors surface a dismissible P2 'review-discovered-competitors' deep-linking to Monitor", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 10,
        promptCount: 5,
        citationRunCount: 3,
        citationRate: 0.5,
        faqCount: 5,
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
        competitorCount: 4, // already tracking some → "add-competitors" won't fire
        autoDiscoveredCompetitorCount: 2,
      }),
    );
    const hit = recs.find((r) => r.id === "review-discovered-competitors");
    expect(hit).toBeDefined();
    expect(hit!.priority).toBe("P2");
    expect(hit!.category).toBe("growth");
    expect(hit!.dismissible).toBe(true);
    expect(hit!.title).toContain("2");
    expect(hit!.ctaHref).toBe("/monitor?tab=competitors&brandId=b-1");
  });

  it("zero auto-discovered competitors → no 'review-discovered-competitors' rec", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 10,
        promptCount: 5,
        citationRunCount: 3,
        citationRate: 0.5,
        faqCount: 5,
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
        competitorCount: 4,
        autoDiscoveredCompetitorCount: 0,
      }),
    );
    expect(recs.some((r) => r.id === "review-discovered-competitors")).toBe(false);
  });

  it("each recommendation includes a deep-link CTA href", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 0,
      }),
    );
    expect(recs[0].ctaHref).toMatch(/^\//); // starts with /
    expect(recs[0].ctaLabel).toBeTruthy();
    expect(recs[0].why).toBeTruthy();
  });

  it("P0 recommendations are NOT dismissible; P1 and P2 ARE", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 5,
        promptCount: 3,
        citationRunCount: 2,
        citationRate: 0.1, // triggers P1
        competitorCount: 0, // triggers P2
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
      }),
    );
    for (const r of recs) {
      if (r.priority === "P0") {
        expect(r.dismissible).toBe(false);
      } else {
        expect(r.dismissible).toBe(true);
      }
    }
  });
});
