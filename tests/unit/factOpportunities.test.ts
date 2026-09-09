import { describe, expect, it } from "vitest";
import { createRequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import {
  createFactOpportunitySource,
  type FactOpportunityRecord,
} from "../../server/services/work/sources/factOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-facts-a" as BrandId;
const ACTOR = createRequestActor(USER_ID);

function fact(overrides: Partial<FactOpportunityRecord> = {}): FactOpportunityRecord {
  return {
    id: "fact-1",
    brandId: BRAND_ID,
    domain: "identity",
    subcategory: "Brand name",
    factKey: "name",
    factValue: "Acme",
    essential: true,
    source: "scraped",
    acceptedAt: null,
    dismissedAt: null,
    isActive: true,
    sourceUrl: "https://acme.test/about",
    canonicalUrl: "https://acme.test/about",
    scrapePageId: "page-1",
    retrievedAt: "2026-09-01T00:00:00.000Z",
    sourceExcerpt: "Acme is a company.",
    ...overrides,
  };
}

/**
 * Two active rows sharing domain/subcategory/factKey but disagreeing on value
 * are a conflict, which is the only path that emits a conflict opportunity.
 */
function conflictingPair(): FactOpportunityRecord[] {
  return [
    fact({ id: "fact-1", source: "scraped", factValue: "Acme" }),
    fact({ id: "fact-2", source: "user", factValue: "Acme Corporation" }),
  ];
}

function sourceOf(records: readonly FactOpportunityRecord[]) {
  return createFactOpportunitySource({ readFacts: async () => records });
}

describe("createFactOpportunitySource", () => {
  it("emits a conflict opportunity when two sources disagree", async () => {
    const collected = await sourceOf(conflictingPair()).collect({
      actor: ACTOR,
      brandId: BRAND_ID,
    });
    const conflict = collected.find((o) => o.taskType === "approve_essential_brand_facts");
    expect(conflict).toBeDefined();
  });

  /**
   * Regression. The in-memory grouping key joins its parts with U+0000, and
   * that key used to be copied into the persisted completion rule. Postgres
   * rejects a NUL byte in text and jsonb, so a single conflicting fact failed
   * the INSERT and took the brand's whole reconcile down with it - two of
   * seven real brands could not reconcile at all. Nothing reads conflictKey;
   * it only has to be stable and storable.
   */
  it("never puts a NUL byte in a persisted completion rule", async () => {
    const collected = await sourceOf(conflictingPair()).collect({
      actor: ACTOR,
      brandId: BRAND_ID,
    });

    expect(collected.length).toBeGreaterThan(0);
    for (const opportunity of collected) {
      const serialised = JSON.stringify(opportunity.completionRule);
      expect(serialised).not.toContain(String.fromCharCode(0));
      expect(serialised).not.toContain("\\u0000");
    }
  });

  it("keeps the conflict key stable across repeated reads", async () => {
    const read = async () =>
      (await sourceOf(conflictingPair()).collect({ actor: ACTOR, brandId: BRAND_ID }))
        .filter((o) => o.taskType === "approve_essential_brand_facts")
        .map((o) => (o.completionRule as { conflictKey?: string }).conflictKey);

    expect(await read()).toEqual(await read());
  });

  it("distinguishes two different fact tuples", async () => {
    const collected = await sourceOf([
      ...conflictingPair(),
      fact({ id: "fact-3", factKey: "website", factValue: "https://acme.test", source: "scraped" }),
      fact({ id: "fact-4", factKey: "website", factValue: "https://acme.example", source: "user" }),
    ]).collect({ actor: ACTOR, brandId: BRAND_ID });

    const keys = collected
      .filter((o) => o.taskType === "approve_essential_brand_facts")
      .map((o) => (o.completionRule as { conflictKey?: string }).conflictKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
