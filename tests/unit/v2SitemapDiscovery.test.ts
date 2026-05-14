import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverSitemapUrls } from "../../server/lib/factAgent/v2/sitemapDiscovery";

describe("discoverSitemapUrls", () => {
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetcher = vi.fn();
  });

  it("returns URLs from /sitemap.xml", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) {
        return {
          status: 200,
          text: `<?xml version="1.0"?>
            <urlset>
              <url><loc>https://example.com/about</loc></url>
              <url><loc>https://example.com/pricing</loc></url>
              <url><loc>https://example.com/team</loc></url>
            </urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/about");
    expect(out).toContain("https://example.com/pricing");
    expect(out).toContain("https://example.com/team");
  });

  it("falls back to /sitemap_index.xml when /sitemap.xml is 404", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) return { status: 404, text: "" };
      if (url.endsWith("/sitemap_index.xml")) {
        return {
          status: 200,
          text: `<urlset><url><loc>https://example.com/from-index</loc></url></urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/from-index");
  });

  it("falls back to robots.txt Sitemap: directive", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) return { status: 404, text: "" };
      if (url.endsWith("/sitemap_index.xml")) return { status: 404, text: "" };
      if (url.endsWith("/robots.txt")) {
        return {
          status: 200,
          text: "User-agent: *\nSitemap: https://example.com/custom-sitemap.xml\n",
        };
      }
      if (url.endsWith("/custom-sitemap.xml")) {
        return {
          status: 200,
          text: `<urlset><url><loc>https://example.com/from-robots</loc></url></urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/from-robots");
  });

  it("returns [] when no sitemap is reachable", async () => {
    fetcher.mockResolvedValue({ status: 404, text: "" });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toEqual([]);
  });

  it("caps to first 200 entries from a large sitemap", async () => {
    const entries = Array.from(
      { length: 500 },
      (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`,
    ).join("");
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) {
        return { status: 200, text: `<urlset>${entries}</urlset>` };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toHaveLength(200);
    expect(out[0]).toBe("https://example.com/p0");
    expect(out[199]).toBe("https://example.com/p199");
  });

  it("only keeps URLs on the same registered domain", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) {
        return {
          status: 200,
          text: `<urlset>
            <url><loc>https://example.com/own</loc></url>
            <url><loc>https://other.com/external</loc></url>
            <url><loc>https://www.example.com/with-www</loc></url>
          </urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/own");
    expect(out).toContain("https://www.example.com/with-www");
    expect(out).not.toContain("https://other.com/external");
  });
});
