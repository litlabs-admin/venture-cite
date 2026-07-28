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

  it("Tier 3 (drop): blog/*, author/*, tag/*, category/*, legal/*, privacy*, terms*, cookie*, /p/*", () => {
    expect(scoreUrl("https://x.com/blog/article-1")).toBe(3);
    expect(scoreUrl("https://x.com/author/alice")).toBe(3);
    expect(scoreUrl("https://x.com/tag/marketing")).toBe(3);
    expect(scoreUrl("https://x.com/category/news")).toBe(3);
    expect(scoreUrl("https://x.com/legal/dpa")).toBe(3);
    expect(scoreUrl("https://x.com/privacy")).toBe(3);
    expect(scoreUrl("https://x.com/privacy-policy")).toBe(3);
    expect(scoreUrl("https://x.com/terms")).toBe(3);
    expect(scoreUrl("https://x.com/cookie-policy")).toBe(3);
    expect(scoreUrl("https://x.com/p/some-slug")).toBe(3);
  });

  // urlTierScoring.ts (2026-05-28 revision) deliberately moved
  // individual /integrations/<vendor> pages OUT of tier 3: "for some
  // brands (Zapier, Make) integrations ARE the product" (see the
  // TIER_3 comment block). Verified: scoreUrl("/integrations/slack")
  // === 0 (untiered, included if room remains), matching that
  // documented intent — this used to be asserted as tier 3 above,
  // which was stale.
  it("Tier 0: individual /integrations/<vendor> pages are untiered, not dropped", () => {
    expect(scoreUrl("https://x.com/integrations/slack")).toBe(0);
  });

  it("untiered (default): everything else", () => {
    expect(scoreUrl("https://x.com/some-random-page")).toBe(0);
    expect(scoreUrl("https://x.com/api")).toBe(0);
  });

  // Regression: LOCALE_PREFIX used to match any 2-3 letter segment, so short
  // paths parsed as language codes, got stripped to "/", and "/" matches
  // TIER_1's empty alternative — scoring them as the HOMEPAGE. That gave
  // /api, /faq, /seo and friends top scraping priority and pushed real
  // brand-identity pages out of the 10-URL budget. The language subtag is
  // now validated against the ISO 639-1 set.
  describe("short non-locale paths are not mistaken for the homepage", () => {
    for (const path of ["/api", "/faq", "/seo", "/dev", "/pro", "/biz"]) {
      it(`${path} is untiered, not tier 1`, () => {
        expect(scoreUrl(`https://x.com${path}`)).toBe(0);
      });
    }

    it("a non-locale prefix does not let a sub-path impersonate a tier-1 page", () => {
      // The nastiest form of the bug: /api/pricing stripped to /pricing and
      // scored 1, so API reference pages outranked the real pricing page.
      expect(scoreUrl("https://x.com/api/pricing")).toBe(0);
      expect(scoreUrl("https://x.com/faq/about")).toBe(0);
    });
  });

  // The counterpart to the above — the fix must not break real locales.
  describe("real locale prefixes still strip", () => {
    it("bare ISO 639-1 code is the locale homepage", () => {
      expect(scoreUrl("https://x.com/en")).toBe(1);
      expect(scoreUrl("https://x.com/fr")).toBe(1);
    });

    it("locale-prefixed paths resolve to their underlying tier", () => {
      expect(scoreUrl("https://x.com/en/about")).toBe(1);
      expect(scoreUrl("https://x.com/fr/pricing")).toBe(1);
      expect(scoreUrl("https://x.com/de/features")).toBe(2);
      expect(scoreUrl("https://x.com/es/blog/post")).toBe(3);
    });

    it("region and script subtags are handled", () => {
      expect(scoreUrl("https://x.com/en_US/team")).toBe(1);
      expect(scoreUrl("https://x.com/zh-hans/about")).toBe(1);
    });

    it("non-ISO bucket prefixes still strip", () => {
      expect(scoreUrl("https://x.com/global/about")).toBe(1);
      expect(scoreUrl("https://x.com/international/pricing")).toBe(1);
    });
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
