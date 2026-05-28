// Unit tests for the JSON-LD structured-data fact extractor. These
// cover the four main schema.org node shapes we encounter in the
// wild:
//
//   1. Top-level Organization
//   2. @graph wrapper (Yoast / WordPress)
//   3. Multiple @type per node (Organization + LocalBusiness)
//   4. Nested PostalAddress + ContactPoint
//
// All inputs are abbreviated real-world examples sanitised down to
// the minimum that exercises the code path.

import { describe, it, expect } from "vitest";
import { extractStructuredFacts } from "../../server/lib/factAgent/v2/structuredDataExtractor";

function wrap(jsonLd: object): string {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

describe("extractStructuredFacts", () => {
  it("returns empty array when no JSON-LD blocks are present", () => {
    const html = "<html><body><p>nothing here</p></body></html>";
    expect(extractStructuredFacts(html, "https://example.com/")).toEqual([]);
  });

  it("silently skips malformed JSON-LD blocks", () => {
    const html = `<script type="application/ld+json">{not json</script>`;
    expect(extractStructuredFacts(html, "https://example.com/")).toEqual([]);
  });

  it("extracts Organization basics: name + legalName + url + logo", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Adyen",
      legalName: "Adyen N.V.",
      url: "https://adyen.com",
      logo: "https://adyen.com/logo.png",
    });
    const facts = extractStructuredFacts(html, "https://adyen.com/");
    const byKey = (k: string) => facts.find((f) => `${f.domain}.${f.factKey}` === k);
    expect(byKey("identity.name")?.factValue).toBe("Adyen");
    expect(byKey("identity.legalName")?.factValue).toBe("Adyen N.V.");
    expect(byKey("identity.website")?.factValue).toBe("https://adyen.com");
    expect(byKey("identity.logoUrl")?.factValue).toBe("https://adyen.com/logo.png");
  });

  it("parses foundingDate down to the year", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Adyen",
      foundingDate: "2006-01-15",
    });
    const facts = extractStructuredFacts(html, "https://adyen.com/");
    const founded = facts.find((f) => f.factKey === "foundedYear");
    expect(founded?.factValue).toBe("2006");
  });

  it("unwraps PostalAddress into address + city + country", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Adyen",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Simon Carmiggeltstraat 6-50",
        addressLocality: "Amsterdam",
        postalCode: "1011 DJ",
        addressCountry: "NL",
      },
    });
    const facts = extractStructuredFacts(html, "https://adyen.com/");
    const hq = facts.find((f) => f.factKey === "headquarters");
    const city = facts.find((f) => f.factKey === "city");
    const country = facts.find((f) => f.factKey === "country");
    expect(hq?.factValue).toContain("Simon Carmiggeltstraat 6-50");
    expect(hq?.factValue).toContain("Amsterdam");
    expect(city?.factValue).toBe("Amsterdam");
    expect(country?.factValue).toBe("NL");
  });

  it("walks @graph wrapper to find nested Organization", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", url: "https://example.com" },
        { "@type": "Organization", name: "Example Co", legalName: "Example Co. Ltd." },
      ],
    });
    const facts = extractStructuredFacts(html, "https://example.com/");
    const name = facts.find((f) => f.factKey === "name");
    expect(name?.factValue).toBe("Example Co");
  });

  it("handles multiple @type per node (Organization + LocalBusiness)", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": ["Organization", "LocalBusiness"],
      name: "Patagonia",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Ventura",
        addressRegion: "CA",
      },
    });
    const facts = extractStructuredFacts(html, "https://patagonia.com/");
    expect(facts.find((f) => f.factKey === "name")?.factValue).toBe("Patagonia");
    expect(facts.find((f) => f.factKey === "city")?.factValue).toBe("Ventura");
  });

  it("classifies ContactPoint by contactType (sales/support/generic)", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme",
      contactPoint: [
        { "@type": "ContactPoint", email: "sales@acme.com", contactType: "Sales" },
        {
          "@type": "ContactPoint",
          email: "support@acme.com",
          contactType: "Customer Service",
        },
        { "@type": "ContactPoint", telephone: "+1-555-0000" },
      ],
    });
    const facts = extractStructuredFacts(html, "https://acme.com/");
    expect(facts.find((f) => f.factKey === "salesEmail")?.factValue).toBe("sales@acme.com");
    expect(facts.find((f) => f.factKey === "supportEmail")?.factValue).toBe("support@acme.com");
    expect(facts.find((f) => f.factKey === "telephone")?.factValue).toBe("+1-555-0000");
  });

  it("extracts sameAs as a socialLinks array fact", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Stripe",
      sameAs: [
        "https://twitter.com/stripe",
        "https://linkedin.com/company/stripe",
        "https://github.com/stripe",
      ],
    });
    const facts = extractStructuredFacts(html, "https://stripe.com/");
    const social = facts.find((f) => f.factKey === "socialLinks");
    expect(social?.valueType).toBe("array");
    expect((social?.valuePayload as { items: string[] })?.items).toHaveLength(3);
  });

  it("dedupes facts seen via multiple paths (same value, same key)", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Notion", url: "https://notion.com" },
        { "@type": "WebSite", name: "Notion", url: "https://notion.com" },
      ],
    });
    const facts = extractStructuredFacts(html, "https://notion.com/");
    const names = facts.filter((f) => f.factKey === "name");
    expect(names).toHaveLength(1);
  });

  it("emits confidence 1.0 for all structured-data facts", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Test",
      description: "A test company",
    });
    const facts = extractStructuredFacts(html, "https://test.com/");
    for (const f of facts) {
      expect(f.confidence).toBe(1.0);
    }
  });

  it("extracts tickerSymbol as publicTradingSymbol", () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Corporation",
      name: "Shopify",
      tickerSymbol: "SHOP",
    });
    const facts = extractStructuredFacts(html, "https://shopify.com/");
    expect(facts.find((f) => f.factKey === "publicTradingSymbol")?.factValue).toBe("SHOP");
  });
});
