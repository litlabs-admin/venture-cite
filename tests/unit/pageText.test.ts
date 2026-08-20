import { describe, it, expect } from "vitest";
import {
  decodeEntities,
  extractHeadMetadata,
  extractBodyText,
  extractPageContent,
} from "../../server/lib/pageText";

// The real humanarc.io homepage, trimmed. A Vite/Lovable single-page app:
// the body is one empty div, and everything describing the product lives in
// the head. Fetching this and stripping tags used to yield ~0 characters,
// which is why the onboarding scrape returned a favicon and nothing else.
const SPA_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Humanarc — FuturePath: Find your future in 10 minutes</title>
    <meta name="description" content="FuturePath by Humanarc blends real labor market data with your skills and interests to show you where you could go next." />
    <link rel="icon" href="/favicon.png" type="image/png" />
    <meta property="og:title" content="FuturePath by Humanarc — Find your future." />
    <meta property="og:description" content="Real labor market data plus your skills and interests." />
    <meta name="twitter:title" content="FuturePath by Humanarc — Find your future." />
    <script type="module" crossorigin src="/assets/index.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("decodeEntities", () => {
  it("decodes the named entities real pages use", () => {
    expect(decodeEntities("competitor&#x27;s name")).toBe("competitor's name");
    expect(decodeEntities("&quot;daily trainer&quot;")).toBe('"daily trainer"');
    expect(decodeEntities("A&amp;B &lt;tag&gt;")).toBe("A&B <tag>");
    expect(decodeEntities("caf&eacute;")).toBe("caf&eacute;"); // unknown: left alone
  });

  it("decodes numeric forms in both bases", () => {
    expect(decodeEntities("&#8212;")).toBe("—");
    expect(decodeEntities("&#x2014;")).toBe("—");
  });

  it("leaves malformed or dangerous code points untouched", () => {
    expect(decodeEntities("&#0;")).toBe("&#0;");
    expect(decodeEntities("&#x110000;")).toBe("&#x110000;");
    expect(decodeEntities("&#xD800;")).toBe("&#xD800;"); // lone surrogate
    expect(decodeEntities("100 & 200")).toBe("100 & 200");
  });
});

describe("extractHeadMetadata", () => {
  it("recovers a full product description from an SPA that has no body", () => {
    const meta = extractHeadMetadata(SPA_HTML);
    expect(meta).toContain("Humanarc");
    expect(meta).toContain("labor market data");
    expect(meta.length).toBeGreaterThan(200);
  });

  it("does not repeat the same sentence across og: and twitter:", () => {
    const meta = extractHeadMetadata(SPA_HTML);
    const dupe = "FuturePath by Humanarc — Find your future.";
    expect(meta.split(dupe).length - 1).toBe(1);
  });

  it("reads content= on either side of name=", () => {
    expect(extractHeadMetadata(`<meta content="Reversed order" name="description">`)).toBe(
      "Reversed order",
    );
  });

  it("returns empty for a head with nothing to say", () => {
    expect(extractHeadMetadata("<html><head></head><body>hi</body></html>")).toBe("");
  });
});

describe("extractBodyText", () => {
  it("drops scripts, styles, comments and noscript", () => {
    const html = `<body>Real<script>var x = "fake";</script><style>.a{color:red}</style>
      <!-- hidden --><noscript>enable js</noscript> text</body>`;
    const out = extractBodyText(html);
    expect(out).toBe("Real text");
  });

  it("decodes entities in the body", () => {
    expect(extractBodyText("<p>your competitor&#x27;s name</p>")).toBe("your competitor's name");
  });
});

describe("extractPageContent", () => {
  it("gives an SPA real content to send instead of nothing", () => {
    const { text, bodyText, isClientRendered } = extractPageContent(SPA_HTML);
    // This is the regression: the old pipeline produced under 200 chars here,
    // so the onboarding route skipped the LLM call entirely.
    expect(bodyText.length).toBeLessThan(200);
    expect(isClientRendered).toBe(true);
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain("labor market data");
  });

  it("puts metadata first so a truncated page still identifies the brand", () => {
    const html = `<head><title>Acme</title></head><body>${"filler ".repeat(3000)}</body>`;
    const { text } = extractPageContent(html, 500);
    expect(text.startsWith("Acme")).toBe(true);
    expect(text.length).toBe(500);
  });

  it("does not flag a server-rendered page as client-rendered", () => {
    const html = `<head><title>Acme</title></head><body>${"real words ".repeat(50)}</body>`;
    const { isClientRendered, bodyText } = extractPageContent(html);
    expect(bodyText.length).toBeGreaterThan(200);
    expect(isClientRendered).toBe(false);
  });

  it("reports an empty page honestly rather than inventing content", () => {
    const { text, metadata, isClientRendered } = extractPageContent(
      "<html><head></head><body></body></html>",
    );
    expect(text).toBe("");
    expect(metadata).toBe("");
    expect(isClientRendered).toBe(false);
  });
});
