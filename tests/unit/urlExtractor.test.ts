import { describe, it, expect } from "vitest";
import { extractCitedUrls } from "../../server/lib/urlExtractor";

describe("extractCitedUrls", () => {
  it("extracts URLs from markdown link syntax", () => {
    const text =
      "Stripe is great. See [Stripe docs](https://stripe.com/docs) and [their pricing](https://stripe.com/pricing) for more.";
    const urls = extractCitedUrls(text);
    expect(urls).toContain("https://stripe.com/docs");
    expect(urls).toContain("https://stripe.com/pricing");
    expect(urls).toHaveLength(2);
  });

  it("extracts plain URLs and strips trailing punctuation", () => {
    const text =
      "Visit https://stripe.com. Also see https://docs.stripe.com/api, plus https://example.com/path?q=1.";
    const urls = extractCitedUrls(text);
    expect(urls).toContain("https://stripe.com");
    expect(urls).toContain("https://docs.stripe.com/api");
    expect(urls).toContain("https://example.com/path?q=1");
    // Trailing periods/commas removed.
    expect(urls).not.toContain("https://stripe.com.");
    expect(urls).not.toContain("https://docs.stripe.com/api,");
  });

  it("dedupes case-insensitive on hostname, exact on path", () => {
    const text = "https://stripe.com/docs and https://STRIPE.COM/docs and https://stripe.com/Docs";
    const urls = extractCitedUrls(text);
    // Hostname dedupe (case-insensitive): stripe.com == STRIPE.COM
    // Path dedupe (exact): /docs and /Docs are different
    expect(urls).toHaveLength(2);
  });

  it("rejects non-http(s) schemes", () => {
    const text =
      "Visit javascript:alert(1) or file:///etc/passwd or data:text/plain;base64,YWJj — but https://stripe.com is fine.";
    const urls = extractCitedUrls(text);
    expect(urls).toEqual(["https://stripe.com"]);
  });

  it("rejects URLs without a dot in hostname (localhost, intranet)", () => {
    const text =
      "http://localhost:3000 and http://internal-server are not valid; https://stripe.com is.";
    const urls = extractCitedUrls(text);
    expect(urls).toEqual(["https://stripe.com"]);
  });

  it("caps at 20 URLs per response", () => {
    const text = Array.from({ length: 50 }, (_, i) => `https://site${i}.com`).join(" ");
    const urls = extractCitedUrls(text);
    expect(urls).toHaveLength(20);
    expect(urls[0]).toBe("https://site0.com");
    expect(urls[19]).toBe("https://site19.com");
  });

  it("returns empty array for empty input", () => {
    expect(extractCitedUrls("")).toEqual([]);
    expect(extractCitedUrls("No URLs here, just text.")).toEqual([]);
  });

  it("truncates URLs longer than 2 KB", () => {
    const longPath = "x".repeat(3000);
    const text = `Visit https://example.com/${longPath} for details.`;
    const urls = extractCitedUrls(text);
    expect(urls).toHaveLength(1);
    expect(urls[0].length).toBeLessThanOrEqual(2048);
  });
});
