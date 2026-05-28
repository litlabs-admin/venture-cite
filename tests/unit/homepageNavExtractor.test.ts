import { describe, it, expect } from "vitest";
import { extractHomepageNavLinks } from "../../server/lib/factAgent/v2/homepageNavExtractor";

describe("extractHomepageNavLinks", () => {
  const HOMEPAGE = "https://example.com/";

  it("returns empty array when no nav-region elements", () => {
    const html = `<html><body><p>nothing</p></body></html>`;
    expect(extractHomepageNavLinks(html, HOMEPAGE)).toEqual([]);
  });

  it("extracts anchors from <nav>", () => {
    const html = `<nav><a href="/about">About Us</a><a href="/pricing">Pricing</a></nav>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.map((l) => l.url)).toEqual([
      "https://example.com/about",
      "https://example.com/pricing",
    ]);
    expect(out[0].label).toBe("about us");
    expect(out[0].region).toBe("nav");
  });

  it("extracts from <footer> and tags region correctly", () => {
    const html = `<footer><a href="/privacy">Privacy</a><a href="/careers">Careers</a></footer>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.every((l) => l.region === "footer")).toBe(true);
  });

  it("dedupes URLs across regions", () => {
    const html = `<nav><a href="/about">About</a></nav><footer><a href="/about">About</a></footer>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.filter((l) => l.url.endsWith("/about"))).toHaveLength(1);
  });

  it("filters off-domain URLs", () => {
    const html = `<nav><a href="/about">About</a><a href="https://other.com/about">Other</a></nav>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.map((l) => l.url)).toEqual(["https://example.com/about"]);
  });

  it("filters file extensions", () => {
    const html = `<nav><a href="/about">About</a><a href="/sitemap.xml">Sitemap</a><a href="/logo.png">Logo</a></nav>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.map((l) => l.url)).toEqual(["https://example.com/about"]);
  });

  it("filters hash, mailto, tel, javascript:", () => {
    const html = `<nav><a href="#top">Top</a><a href="mailto:a@b.co">Mail</a><a href="tel:+1">Tel</a><a href="javascript:void(0)">JS</a><a href="/about">About</a></nav>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.map((l) => l.url)).toEqual(["https://example.com/about"]);
  });

  it("respects MAX_PATH_DEPTH (drops deep URLs)", () => {
    const html = `<nav><a href="/about">A</a><a href="/blog/2024/01/some-post">B</a></nav>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.map((l) => l.url)).toEqual(["https://example.com/about"]);
  });

  it("picks up class-based menu containers", () => {
    const html = `<ul class="navigation"><li><a href="/about">About</a></li><li><a href="/products">Products</a></li></ul>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out.map((l) => l.url).sort()).toEqual([
      "https://example.com/about",
      "https://example.com/products",
    ]);
  });

  it("uses aria-label when anchor has no inner text", () => {
    const html = `<nav><a href="/about" aria-label="About the company"></a></nav>`;
    const out = extractHomepageNavLinks(html, HOMEPAGE);
    expect(out[0].label).toBe("about the company");
  });
});
