import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import { createFactOpportunitySource } from "../../server/services/work/sources/factOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-facts-a" as BrandId;
const OTHER_BRAND_ID = "brand-facts-b" as BrandId;
const ACTOR = createRequestActor(USER_ID);

// This normalized projection joins fact, scrape page, and scrape run records.
type FactOpportunityRecord = {
  id: string;
  brandId: BrandId;
  domain: string;
  subcategory: string;
  factKey: string;
  factValue: string;
  essential: boolean;
  acceptedAt: string | null;
  dismissedAt: string | null;
  isActive: boolean;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  scrapePageId: string | null;
  retrievedAt: string | null;
  sourceExcerpt: string | null;
  conflictStatus?: "none" | "conflicting";
};

function fact(overrides: Partial<FactOpportunityRecord> = {}): FactOpportunityRecord {
  return {
    id: "fact-sourced-1",
    brandId: BRAND_ID,
    domain: "product",
    subcategory: "pricing",
    factKey: "pricing_model",
    factValue: "Usage-based pricing",
    essential: true,
    acceptedAt: null,
    dismissedAt: null,
    isActive: true,
    source: "scraped",
    sourceUrl: "https://docs.acme.test/pricing",
    canonicalUrl: "https://docs.acme.test/pricing",
    scrapePageId: "page-pricing-1",
    retrievedAt: "2026-09-08T00:59:00.000Z",
    sourceExcerpt: "The pricing page documents usage-based pricing.",
    ...overrides,
  };
}

function sourceForFacts(facts: FactOpportunityRecord[]) {
  const readFacts = vi.fn(
    async (input: { actor: RequestActor; brandId: BrandId }): Promise<FactOpportunityRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return facts.filter((item) => item.brandId === input.brandId);
    },
  );

  return { source: createFactOpportunitySource({ readFacts }), readFacts };
}

describe("fact work opportunities", () => {
  it("does not create an approval task for an accepted fact", async () => {
    const { source } = sourceForFacts([fact({ acceptedAt: "2026-09-08T01:00:00.000Z" })]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toEqual([]);
  });

  it("creates a namespaced approval task for an active unaccepted sourced fact", async () => {
    const { source, readFacts } = sourceForFacts([
      fact(),
      fact({ id: "foreign-fact", brandId: OTHER_BRAND_ID }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readFacts).toHaveBeenCalledTimes(1);
    expect(source.sourceKey).toBe("facts");
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "facts:fact-sourced-1",
      taskType: "approve_essential_brand_facts",
      completionRule: { required: ["source", "confirmation"] },
    });
    expect(opportunities[0]?.evidence).toEqual([
      {
        kind: "source",
        label: "Authoritative source for the essential fact.",
        sourceUrl: "https://docs.acme.test/pricing",
        canonicalUrl: "https://docs.acme.test/pricing",
        factId: "fact-sourced-1",
        scrapePageId: "page-pricing-1",
        retrievedAt: "2026-09-08T00:59:00.000Z",
        excerpt: "The pricing page documents usage-based pricing.",
      },
    ]);
  });

  it("creates an actionable add-source task for an unsourced essential fact", async () => {
    const { source } = sourceForFacts([
      fact({
        id: "fact-unsourced",
        sourceUrl: null,
        canonicalUrl: null,
        scrapePageId: null,
        retrievedAt: null,
        sourceExcerpt: null,
      }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "facts:fact-unsourced",
      taskType: "approve_essential_brand_facts",
      completionRule: { required: ["source", "confirmation"] },
    });
    const actionCopy = (
      String(opportunities[0]?.title) +
      " " +
      String(opportunities[0]?.reason)
    ).toLowerCase();
    expect(actionCopy).toMatch(/add|source|confirm/);
    expect(opportunities[0]?.evidence).toEqual([
      {
        kind: "artifact",
        label: "Internal fact record requiring a source.",
        artifactId: "fact-record:fact-unsourced",
        version: 1,
        coverage: "fact-unsourced",
        duplicateCheck: "fact-unsourced",
      },
    ]);
  });

  it("creates human-review language for conflicts without a definitive claim", async () => {
    const { source } = sourceForFacts([
      fact({ id: "fact-conflict-a", source: "user", factValue: "Usage-based pricing" }),
      fact({ id: "fact-conflict-b", source: "scraped", factValue: "Seat-based pricing" }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "facts:conflict:product:pricing:pricing_model",
      taskType: "approve_essential_brand_facts",
      completionRule: { required: ["source", "confirmation"] },
    });
    const copy = String(opportunities[0]?.title) + " " + String(opportunities[0]?.reason);
    expect(copy.toLowerCase()).toContain("review");
    expect(copy.toLowerCase()).not.toContain("usage-based pricing");
    expect(copy.toLowerCase()).not.toContain("seat-based pricing");
    expect(opportunities[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "source", factId: "fact-conflict-a" }),
        expect.objectContaining({ kind: "source", factId: "fact-conflict-b" }),
      ]),
    );
  });

  it("does not create an opportunity for a dismissed fact", async () => {
    const { source } = sourceForFacts([
      fact({ id: "fact-dismissed", dismissedAt: "2026-09-08T02:00:00.000Z" }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toEqual([]);
  });
});
