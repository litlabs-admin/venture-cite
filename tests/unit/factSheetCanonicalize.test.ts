import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "../../server/lib/factAgent/canonicalize";

describe("canonicalizeUrl", () => {
  it("lowercases the host", () => {
    expect(canonicalizeUrl("https://Example.COM/about")).toBe("https://example.com/about");
  });

  it("strips a single trailing slash from non-root paths", () => {
    expect(canonicalizeUrl("https://example.com/about/")).toBe("https://example.com/about");
  });

  it("keeps the trailing slash on the root path", () => {
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("drops utm_* / ref / fbclid / gclid params", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/p?utm_source=x&utm_campaign=y&ref=z&fbclid=a&gclid=b&keep=1",
      ),
    ).toBe("https://example.com/p?keep=1");
  });

  it("normalizes www. to apex", () => {
    expect(canonicalizeUrl("https://www.example.com/about")).toBe("https://example.com/about");
  });

  it("preserves apex (no www to strip)", () => {
    expect(canonicalizeUrl("https://example.com/about")).toBe("https://example.com/about");
  });

  it("sorts query params for stable dedup", () => {
    expect(canonicalizeUrl("https://example.com/p?b=2&a=1")).toBe("https://example.com/p?a=1&b=2");
  });

  it("returns the input unchanged when URL is unparseable", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });

  it("drops hash fragments", () => {
    expect(canonicalizeUrl("https://example.com/about#team")).toBe("https://example.com/about");
  });
});
