import { describe, it, expect } from "vitest";
import {
  extractStructuredData,
  stripToBodyText,
} from "../../server/lib/factAgent/v2/pageExtractors";

describe("extractStructuredData", () => {
  it("pulls title, description, og:*, twitter:*, and JSON-LD", () => {
    const html = `
      <html><head>
        <title>Acme — AI tools</title>
        <meta name="description" content="Acme builds AI." />
        <meta property="og:title" content="Acme OG" />
        <meta property="og:description" content="OG desc" />
        <meta name="twitter:site" content="@acme" />
        <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      </head><body></body></html>`;
    const out = extractStructuredData(html);
    expect(out.text).toContain("Title: Acme — AI tools");
    expect(out.text).toContain("description: Acme builds AI.");
    expect(out.text).toContain("og:title: Acme OG");
    expect(out.text).toContain("twitter:site: @acme");
    expect(out.text).toContain("JSON-LD:");
    expect(out.text).toContain("Acme");
    expect(out.hasStructuredData).toBe(true);
  });

  it("returns hasStructuredData=false on a page with no head markers", () => {
    const html = `<html><body><h1>Hi</h1></body></html>`;
    const out = extractStructuredData(html);
    expect(out.hasStructuredData).toBe(false);
    expect(out.text).toBe("");
  });

  it("drops malformed JSON-LD blocks without throwing", () => {
    const html = `<script type="application/ld+json">{not json</script>`;
    const out = extractStructuredData(html);
    expect(out.hasStructuredData).toBe(false);
  });
});

describe("stripToBodyText", () => {
  it("removes script/style/HTML tags and collapses whitespace", () => {
    const html = `
      <html>
        <head><script>var x = 1;</script><style>body{color:red}</style></head>
        <body>
          <p>Hello   world</p>
          <p>Second line.</p>
        </body>
      </html>`;
    expect(stripToBodyText(html)).toBe("Hello world Second line.");
  });

  it("returns empty string for an empty body", () => {
    expect(stripToBodyText("<html><body></body></html>")).toBe("");
  });
});
