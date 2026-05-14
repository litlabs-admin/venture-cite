import { describe, it, expect } from "vitest";
import { scoreUrl, selectTopUrls } from "../../server/lib/factAgent/v2/urlTierScoring";

describe("scoreUrl", () => {
  it("Tier 1 (always): homepage, about, pricing, team, product", () => {
    expect(scoreUrl("https://x.com/")).toBe(1);
    expect(scoreUrl("https://x.com/about")).toBe(1);
    expect(scoreUrl("https://x.com/about-us")).toBe(1);
    expect(scoreUrl("https://x.com/company")).toBe(1);
    expect(scoreUrl("https://x.com/pricing")).toBe(1);
    expect(scoreUrl("https://x.com/team")).toBe(1);
    expect(scoreUrl("https://x.com/product")).toBe(1);
    expect(scoreUrl("https://x.com/products")).toBe(1);
  });

  it("Tier 2: features, platform, contact, customers, security", () => {
    expect(scoreUrl("https://x.com/features")).toBe(2);
    expect(scoreUrl("https://x.com/platform")).toBe(2);
    expect(scoreUrl("https://x.com/contact")).toBe(2);
    expect(scoreUrl("https://x.com/contact-us")).toBe(2);
    expect(scoreUrl("https://x.com/customers")).toBe(2);
    expect(scoreUrl("https://x.com/security")).toBe(2);
  });

  it("Tier 3 (drop): blog/*, author/*, tag/*, category/*, legal/*, privacy*, terms*, cookie*, integrations/*, /p/*", () => {
    expect(scoreUrl("https://x.com/blog/article-1")).toBe(3);
    expect(scoreUrl("https://x.com/author/alice")).toBe(3);
    expect(scoreUrl("https://x.com/tag/marketing")).toBe(3);
    expect(scoreUrl("https://x.com/category/news")).toBe(3);
    expect(scoreUrl("https://x.com/legal/dpa")).toBe(3);
    expect(scoreUrl("https://x.com/privacy")).toBe(3);
    expect(scoreUrl("https://x.com/privacy-policy")).toBe(3);
    expect(scoreUrl("https://x.com/terms")).toBe(3);
    expect(scoreUrl("https://x.com/cookie-policy")).toBe(3);
    expect(scoreUrl("https://x.com/integrations/slack")).toBe(3);
    expect(scoreUrl("https://x.com/p/some-slug")).toBe(3);
  });

  it("untiered (default): everything else", () => {
    expect(scoreUrl("https://x.com/some-random-page")).toBe(0);
    expect(scoreUrl("https://x.com/api")).toBe(0);
  });
});

describe("selectTopUrls", () => {
  it("always includes homepage at position 0", () => {
    const out = selectTopUrls("https://example.com", ["https://example.com/random"]);
    expect(out[0]).toBe("https://example.com/");
  });

  it("includes all Tier 1 URLs", () => {
    const urls = [
      "https://example.com/about",
      "https://example.com/pricing",
      "https://example.com/team",
      "https://example.com/blog/x",
    ];
    const out = selectTopUrls("https://example.com", urls);
    expect(out).toContain("https://example.com/about");
    expect(out).toContain("https://example.com/pricing");
    expect(out).toContain("https://example.com/team");
    expect(out).not.toContain("https://example.com/blog/x");
  });

  it("includes Tier 2 URLs after Tier 1 if room remains", () => {
    const urls = ["https://example.com/about", "https://example.com/features"];
    const out = selectTopUrls("https://example.com", urls);
    const aboutIdx = out.indexOf("https://example.com/about");
    const featuresIdx = out.indexOf("https://example.com/features");
    expect(aboutIdx).toBeGreaterThanOrEqual(0);
    expect(featuresIdx).toBeGreaterThanOrEqual(0);
    expect(aboutIdx).toBeLessThan(featuresIdx);
  });

  it("caps at MAX URLs (10)", () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/p${i}`);
    const out = selectTopUrls("https://example.com", urls);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0]).toBe("https://example.com/");
  });

  it("dedupes", () => {
    const urls = [
      "https://example.com/about",
      "https://example.com/about",
      "https://example.com/about/",
    ];
    const out = selectTopUrls("https://example.com", urls);
    expect(out.filter((u) => u.includes("/about")).length).toBe(1);
  });
});
