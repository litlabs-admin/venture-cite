import { describe, it, expect } from "vitest";
import {
  isAllowedSourceUrl,
  filterByBrandDomain,
} from "../../server/lib/factAgent/v2/domainAllowlist";
import type { Fact } from "@shared/factAgent/schema";

describe("isAllowedSourceUrl", () => {
  it("allows URLs on the brand's apex domain", () => {
    expect(isAllowedSourceUrl("https://example.com/about", "https://example.com")).toBe("apex");
    expect(isAllowedSourceUrl("https://www.example.com/team", "https://example.com")).toBe("apex");
    expect(isAllowedSourceUrl("https://blog.example.com/p", "https://example.com")).toBe("apex");
  });

  it("allows LinkedIn company pages, Crunchbase orgs, Twitter/X profiles", () => {
    expect(
      isAllowedSourceUrl("https://www.linkedin.com/company/example", "https://example.com"),
    ).toBe("social");
    expect(
      isAllowedSourceUrl("https://www.crunchbase.com/organization/example", "https://example.com"),
    ).toBe("social");
    expect(isAllowedSourceUrl("https://twitter.com/example", "https://example.com")).toBe("social");
    expect(isAllowedSourceUrl("https://x.com/example", "https://example.com")).toBe("social");
  });

  it("rejects unrelated domains", () => {
    expect(isAllowedSourceUrl("https://wikipedia.org/wiki/Example", "https://example.com")).toBe(
      false,
    );
    expect(isAllowedSourceUrl("https://reddit.com/r/example", "https://example.com")).toBe(false);
    expect(isAllowedSourceUrl("https://medium.com/@blogger/example", "https://example.com")).toBe(
      false,
    );
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedSourceUrl("not a url", "https://example.com")).toBe(false);
    expect(isAllowedSourceUrl("", "https://example.com")).toBe(false);
  });
});

describe("filterByBrandDomain", () => {
  const makeFact = (sourceUrl: string, confidence = 0.9): Fact => ({
    domain: "identity",
    subcategory: "x",
    factKey: "y",
    factValue: "z",
    valueType: "string",
    confidence,
    sourceExcerpt: "",
    sourceUrl,
  });

  it("keeps apex-domain facts at their original confidence", () => {
    const out = filterByBrandDomain(
      [makeFact("https://example.com/p", 0.9)],
      "https://example.com",
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0.9);
  });

  it("caps confidence at 0.5 for social-allowlist facts above 0.5", () => {
    const out = filterByBrandDomain(
      [makeFact("https://linkedin.com/company/example", 0.95)],
      "https://example.com",
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0.5);
  });

  it("preserves social-allowlist facts whose confidence is already ≤ 0.5", () => {
    const out = filterByBrandDomain(
      [makeFact("https://linkedin.com/company/example", 0.3)],
      "https://example.com",
    );
    expect(out[0].confidence).toBe(0.3);
  });

  it("drops facts whose sourceUrl is off-allowlist", () => {
    const out = filterByBrandDomain(
      [makeFact("https://example.com/p"), makeFact("https://random-blog.com/p")],
      "https://example.com",
    );
    expect(out).toHaveLength(1);
    expect(out[0].sourceUrl).toBe("https://example.com/p");
  });

  it("drops facts with no sourceUrl (Perplexity wouldn't have grounded)", () => {
    const f: Fact = {
      domain: "identity",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      valueType: "string",
      confidence: 0.9,
      sourceExcerpt: "",
    };
    expect(filterByBrandDomain([f], "https://example.com")).toEqual([]);
  });
});
