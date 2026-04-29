import { describe, it, expect } from "vitest";
import { normalizeUrl, findSelfCitationsInText } from "../../server/lib/trackedContentMatcher";
import type { TrackedContentUrl } from "../../shared/schema";

describe("normalizeUrl", () => {
  it("strips scheme, www, query, fragment, trailing slash", () => {
    expect(normalizeUrl("https://www.acme.com/blog/x/?utm=foo#section")).toBe("acme.com/blog/x");
  });

  it("lowercases host and path", () => {
    expect(normalizeUrl("https://Acme.COM/Blog/X")).toBe("acme.com/blog/x");
  });

  it("accepts bare host", () => {
    expect(normalizeUrl("acme.com/x")).toBe("acme.com/x");
  });

  it("treats http and https as equivalent", () => {
    expect(normalizeUrl("http://acme.com/x")).toBe(normalizeUrl("https://acme.com/x"));
  });

  it("returns null for unparseable input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    // Whitespace-containing strings can't be coerced into a valid URL.
    expect(normalizeUrl("not a url at all just words")).toBeNull();
  });

  it("returns just host when path is empty", () => {
    expect(normalizeUrl("https://acme.com")).toBe("acme.com");
    expect(normalizeUrl("https://acme.com/")).toBe("acme.com");
  });
});

const tracked = (id: string, url: string): TrackedContentUrl => ({
  id,
  brandId: "b1",
  sourceType: "bofu",
  sourceId: `s-${id}`,
  url,
  normalizedUrl: normalizeUrl(url) ?? "",
  createdAt: new Date(),
});

describe("findSelfCitationsInText", () => {
  const t1 = tracked("t1", "https://acme.com/compare/salesforce");
  const t2 = tracked("t2", "https://acme.com/faq/pricing");

  it("matches a citation in plain text", () => {
    const hits = findSelfCitationsInText("See https://acme.com/compare/salesforce for more.", [
      t1,
      t2,
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("t1");
  });

  it("matches across host casing and trailing slash", () => {
    const hits = findSelfCitationsInText(
      "Read more at HTTPS://Acme.com/Compare/Salesforce/ — it's helpful.",
      [t1],
    );
    expect(hits).toHaveLength(1);
  });

  it("dedupes per-call (one hit per tracked URL)", () => {
    const hits = findSelfCitationsInText(
      "acme.com/compare/salesforce and acme.com/compare/salesforce again",
      [t1],
    );
    expect(hits).toHaveLength(1);
  });

  it("matches multiple distinct tracked URLs", () => {
    const hits = findSelfCitationsInText("acme.com/compare/salesforce or acme.com/faq/pricing", [
      t1,
      t2,
    ]);
    expect(hits.map((h) => h.id).sort()).toEqual(["t1", "t2"]);
  });

  it("returns empty when no tracked URLs match", () => {
    expect(findSelfCitationsInText("nothing here", [t1, t2])).toEqual([]);
  });

  it("returns empty for empty inputs", () => {
    expect(findSelfCitationsInText("", [t1])).toEqual([]);
    expect(findSelfCitationsInText("text", [])).toEqual([]);
  });
});
