import { describe, it, expect } from "vitest";
import { discoverSubdomainUrls } from "../../server/lib/factAgent/v2/urlDiscovery";

describe("discoverSubdomainUrls", () => {
  it("returns high-signal subdomain URLs on the same registered domain", () => {
    const html = `
      <a href="https://app.example.com/dashboard">App</a>
      <a href="https://docs.example.com/api">Docs</a>
      <a href="https://blog.example.com/post-1">Blog</a>
      <a href="https://random-other.com/x">External</a>
    `;
    const out = discoverSubdomainUrls(html, "https://example.com/");
    const hosts = out.map((u) => new URL(u).hostname);
    expect(hosts).toContain("app.example.com");
    expect(hosts).toContain("docs.example.com");
    expect(hosts).not.toContain("blog.example.com");
    expect(hosts).not.toContain("random-other.com");
  });

  it("dedupes by canonical URL", () => {
    const html = `
      <a href="https://app.example.com/x">a</a>
      <a href="https://app.example.com/x?utm=z">b</a>
    `;
    expect(discoverSubdomainUrls(html, "https://example.com/")).toHaveLength(1);
  });

  it("returns [] when no <a> tags present", () => {
    expect(discoverSubdomainUrls("<html></html>", "https://x.com/")).toEqual([]);
  });

  it("handles co.uk-style 2-level TLDs", () => {
    const html = `
      <a href="https://app.example.co.uk/">app</a>
      <a href="https://other.co.uk/">other</a>
    `;
    const out = discoverSubdomainUrls(html, "https://example.co.uk/");
    const hosts = out.map((u) => new URL(u).hostname);
    expect(hosts).toContain("app.example.co.uk");
    expect(hosts).not.toContain("other.co.uk");
  });
});
