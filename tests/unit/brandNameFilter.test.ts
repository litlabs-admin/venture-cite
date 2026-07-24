// The citation-prompt name guard. A generated prompt that names the brand
// guarantees a fake self-citation, so this predicate must catch every surface
// (name, company, variation, product, domain) while inheriting the matcher's
// ambiguity gate so common-word brands don't over-reject.

import { describe, it, expect } from "vitest";
import { makeBrandNameFilter } from "../../server/lib/brandNameFilter";
import type { Brand } from "@shared/schema";

const acme = {
  id: "b1",
  name: "Acme",
  companyName: "Acme Analytics",
  nameVariations: ["AcmeCo"],
  products: ["WidgetPro"],
  website: "https://acme.com",
} as unknown as Brand;

describe("makeBrandNameFilter", () => {
  const namesBrand = makeBrandNameFilter(acme);

  it("flags the brand name, company, variation, and domain", () => {
    expect(namesBrand("is Acme good for startups?")).toBe(true);
    expect(namesBrand("Acme Analytics pricing tiers")).toBe(true);
    expect(namesBrand("how does AcmeCo compare to rivals?")).toBe(true);
    expect(namesBrand("honest review of acme.com")).toBe(true);
  });

  it("passes clean category questions that never name the brand", () => {
    expect(namesBrand("what's the best analytics tool for a 5-person startup?")).toBe(false);
    expect(namesBrand("how do I choose a product analytics platform?")).toBe(false);
  });

  it("does NOT reject on raw product/category terms (products are excluded by design)", () => {
    // brand.products = ["WidgetPro"] is intentionally ignored — real product
    // arrays hold generic category words that would nuke legitimate prompts.
    expect(namesBrand("best WidgetPro-style tools for teams")).toBe(false);
  });

  it("honours the ambiguity gate for common-word brands", () => {
    const stripe = {
      id: "b2",
      name: "Stripe",
      companyName: "Stripe",
      nameVariations: [],
      products: [],
      website: null,
    } as unknown as Brand;
    const stripeNames = makeBrandNameFilter(stripe);
    // No signal word nearby → treated as the common word, not the brand.
    expect(stripeNames("I saw a stripe painted on the road")).toBe(false);
    // Signal word ("platform") nearby → the brand.
    expect(stripeNames("is Stripe a good payment platform?")).toBe(true);
  });
});
