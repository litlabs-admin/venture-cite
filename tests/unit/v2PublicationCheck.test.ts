import { describe, expect, it } from "vitest";
import { extractCanonicalUrl, hasReadableText } from "../../server/routes/v2PublicationCheckParsing";

// Board 16's "Fetch latest" hits `POST .../publication-check`, which reads a
// live page server-side and reports back what it found. The two things worth
// unit-testing are the parts that read arbitrary, possibly malformed HTML:
// pulling the canonical link out of the head, and deciding whether the page
// actually returned readable text. The route handler itself (auth, brand
// ownership, the outbound fetch) is exercised through the client adapter's
// own tests against a stubbed fetch, not re-mocked here.

describe("extractCanonicalUrl", () => {
  it("reads the canonical href regardless of attribute order", () => {
    const html = '<head><link href="https://example.com/page" rel="canonical"></head>';
    expect(extractCanonicalUrl(html)).toBe("https://example.com/page");
  });

  it("reads the canonical href when rel comes first", () => {
    const html = '<link rel="canonical" href="https://example.com/services">';
    expect(extractCanonicalUrl(html)).toBe("https://example.com/services");
  });

  it("ignores non-canonical link tags", () => {
    const html =
      '<link rel="stylesheet" href="/app.css"><link rel="alternate" href="/feed.xml">';
    expect(extractCanonicalUrl(html)).toBeUndefined();
  });

  it("returns undefined when no canonical link is present", () => {
    expect(extractCanonicalUrl("<html><head></head><body>hi</body></html>")).toBeUndefined();
  });

  it("does not match rel values that merely contain the word canonical", () => {
    const html = '<link rel="noncanonical-thing" href="https://example.com/decoy">';
    expect(extractCanonicalUrl(html)).toBeUndefined();
  });
});

describe("hasReadableText", () => {
  it("is true for a page with real body copy", () => {
    expect(hasReadableText("<html><body><p>Services available in India.</p></body></html>")).toBe(
      true,
    );
  });

  it("is false for markup with no text content", () => {
    expect(hasReadableText('<html><body><img src="a.png"><br/></body></html>')).toBe(false);
  });

  it("is false for an empty response", () => {
    expect(hasReadableText("")).toBe(false);
  });

  it("does not count script or style contents as page text", () => {
    const html =
      "<html><head><style>body{color:red}</style></head>" +
      "<body><script>var x = 'hello world';</script></body></html>";
    expect(hasReadableText(html)).toBe(false);
  });

  it("is true even when the only text sits alongside scripts and styles", () => {
    const html =
      "<html><head><style>body{color:red}</style></head>" +
      "<body><script>var x = 1;</script><p>Real content here.</p></body></html>";
    expect(hasReadableText(html)).toBe(true);
  });
});
