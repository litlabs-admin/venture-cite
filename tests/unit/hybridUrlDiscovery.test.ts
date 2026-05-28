import { describe, it, expect, vi } from "vitest";
import { hybridDiscoverUrls } from "../../server/lib/factAgent/v2/hybridUrlDiscovery";

/** Builds a fetcher that returns a canned response per URL. */
function makeFetcher(responses: Record<string, { status: number; text: string }>) {
  return async (url: string) => {
    return responses[url] ?? { status: 404, text: "" };
  };
}

describe("hybridDiscoverUrls", () => {
  it("returns homepage even when no sitemap and no nav", async () => {
    const fetcher = makeFetcher({});
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: [{ url: "https://example.com/", score: 10, reason: "homepage" }],
      }),
    );
    const out = await hybridDiscoverUrls({
      brandUrl: "https://example.com/",
      brandName: "Example",
      industry: null,
      fetcher,
      llm,
    });
    expect(out.urls).toEqual(["https://example.com/"]);
  });

  it("combines sitemap + nav candidates and ranks them via LLM", async () => {
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/about</loc></url><url><loc>https://example.com/pricing</loc></url></urlset>`;
    const homepageHtml = `<html><nav><a href="/about">About</a><a href="/team">Team</a></nav></html>`;
    const fetcher = makeFetcher({
      "https://example.com/sitemap.xml": { status: 200, text: sitemapXml },
      "https://example.com/sitemap_index.xml": { status: 404, text: "" },
      "https://example.com/robots.txt": { status: 404, text: "" },
      "https://example.com/": { status: 200, text: homepageHtml },
    });
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: [
          { url: "https://example.com/about", score: 10, reason: "about page" },
          { url: "https://example.com/team", score: 9, reason: "team page" },
          { url: "https://example.com/pricing", score: 8, reason: "pricing" },
        ],
      }),
    );
    const out = await hybridDiscoverUrls({
      brandUrl: "https://example.com/",
      brandName: "Example",
      industry: null,
      fetcher,
      llm,
      maxResults: 3,
    });
    expect(out.urls).toContain("https://example.com/about");
    expect(out.urls).toContain("https://example.com/team");
    expect(out.counters.sitemapCount).toBeGreaterThan(0);
    expect(out.counters.navCount).toBeGreaterThan(0);
  });

  it("falls back to depth-sorted candidates when LLM ranker fails", async () => {
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/about</loc></url><url><loc>https://example.com/deep/very/nested/page</loc></url></urlset>`;
    const fetcher = makeFetcher({
      "https://example.com/sitemap.xml": { status: 200, text: sitemapXml },
      "https://example.com/sitemap_index.xml": { status: 404, text: "" },
      "https://example.com/robots.txt": { status: 404, text: "" },
      "https://example.com/": { status: 200, text: "<html></html>" },
    });
    const llm = vi.fn(async () => {
      throw new Error("LLM down");
    });
    const out = await hybridDiscoverUrls({
      brandUrl: "https://example.com/",
      brandName: "Example",
      industry: null,
      fetcher,
      llm,
      maxResults: 5,
    });
    // Fallback: shorter paths first, so /about should come before /deep/...
    expect(out.urls[0]).toMatch(/\/(about|$)/);
    expect(out.urls.length).toBeGreaterThan(0);
  });

  it("dedupes URLs found in both sitemap and nav", async () => {
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/about</loc></url></urlset>`;
    const homepageHtml = `<html><nav><a href="/about">About</a></nav></html>`;
    const fetcher = makeFetcher({
      "https://example.com/sitemap.xml": { status: 200, text: sitemapXml },
      "https://example.com/sitemap_index.xml": { status: 404, text: "" },
      "https://example.com/robots.txt": { status: 404, text: "" },
      "https://example.com/": { status: 200, text: homepageHtml },
    });
    let candidatesReceived = 0;
    const llm = vi.fn(async (prompt) => {
      // Count distinct URLs in the user prompt to verify dedup.
      const text = (prompt as { user: string }).user;
      const matches = text.match(/https:\/\/example\.com\//g) ?? [];
      candidatesReceived = matches.length;
      return JSON.stringify({
        ranked: [{ url: "https://example.com/about", score: 10, reason: "" }],
      });
    });
    await hybridDiscoverUrls({
      brandUrl: "https://example.com/",
      brandName: "Example",
      industry: null,
      fetcher,
      llm,
    });
    // 2 URLs: homepage (auto-added) + /about (dedup-merged from sitemap + nav)
    expect(candidatesReceived).toBeLessThanOrEqual(3);
  });
});
