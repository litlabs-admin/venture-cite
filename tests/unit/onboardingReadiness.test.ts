// Direct tests for server/onboardingSession/readiness.ts. Network (robots.txt,
// llms.txt, sitemap.xml) is mocked at server/lib/ssrf.ts's safeFetchText, the
// same seam server/lib/crawlerAccess.ts itself fetches through, so the real
// robots.txt parser/evaluator and JSON-LD extractor run unmocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

const ssrfStubs = vi.hoisted(() => ({
  safeFetchText: vi.fn(),
}));

vi.mock("../../server/lib/ssrf", () => ({
  safeFetchText: ssrfStubs.safeFetchText,
}));

const { readReadiness } = await import("../../server/onboardingSession/readiness");

function textResponse(status: number, text: string) {
  return { status, text, contentType: "text/plain", finalUrl: "" };
}

beforeEach(() => {
  ssrfStubs.safeFetchText.mockReset();
});

/** Route robots.txt / llms.txt / sitemap.xml calls by URL suffix. */
function mockFetches(opts: {
  robots?: { status: number; text: string } | Error;
  llmsTxt?: { status: number; text: string } | Error;
  sitemapXml?: { status: number; text: string } | Error;
}) {
  ssrfStubs.safeFetchText.mockImplementation(async (url: string) => {
    const pick = (
      v: { status: number; text: string } | Error | undefined,
      fallback: { status: number; text: string },
    ) => {
      const chosen = v ?? fallback;
      if (chosen instanceof Error) throw chosen;
      return textResponse(chosen.status, chosen.text);
    };
    if (url.endsWith("/robots.txt")) return pick(opts.robots, { status: 404, text: "" });
    if (url.endsWith("/llms.txt")) return pick(opts.llmsTxt, { status: 404, text: "" });
    if (url.endsWith("/sitemap.xml")) return pick(opts.sitemapXml, { status: 404, text: "" });
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("readReadiness", () => {
  it("marks every crawler allowed when robots.txt is missing", async () => {
    mockFetches({ robots: { status: 404, text: "" } });

    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });

    expect(result.crawlers.every((c) => c.allowed)).toBe(true);
    expect(result.crawlers.map((c) => c.bot).sort()).toEqual(
      ["CCBot", "ClaudeBot", "GPTBot", "Google-Extended", "PerplexityBot"].sort(),
    );
  });

  it("blocks only the crawler named in a specific Disallow: / block", async () => {
    mockFetches({
      robots: {
        status: 200,
        text: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n",
      },
    });

    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });

    const byBot = new Map(result.crawlers.map((c) => [c.bot, c.allowed]));
    expect(byBot.get("GPTBot")).toBe(false);
    expect(byBot.get("ClaudeBot")).toBe(true);
    expect(byBot.get("PerplexityBot")).toBe(true);
  });

  it("falls back to the `*` wildcard block when no crawler-specific block exists", async () => {
    mockFetches({
      robots: { status: 200, text: "User-agent: *\nDisallow: /\n" },
    });

    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });

    expect(result.crawlers.every((c) => c.allowed === false)).toBe(true);
  });

  it("treats a narrower Disallow (not `/`) under a specific block as allowed", async () => {
    mockFetches({
      robots: {
        status: 200,
        text: "User-agent: ClaudeBot\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n",
      },
    });

    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    const byBot = new Map(result.crawlers.map((c) => [c.bot, c.allowed]));
    // ClaudeBot has its own block that doesn't disallow "/", so the wildcard
    // block (which does) must not apply to it.
    expect(byBot.get("ClaudeBot")).toBe(true);
    expect(byBot.get("GPTBot")).toBe(false);
  });

  it("reads llmsTxt true only on a 200 with a non-empty body", async () => {
    mockFetches({
      robots: { status: 404, text: "" },
      llmsTxt: { status: 200, text: "# llms.txt\nSome content" },
    });
    const withContent = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    expect(withContent.llmsTxt).toBe(true);

    mockFetches({
      robots: { status: 404, text: "" },
      llmsTxt: { status: 200, text: "   " },
    });
    const empty = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    expect(empty.llmsTxt).toBe(false);

    mockFetches({
      robots: { status: 404, text: "" },
      llmsTxt: { status: 404, text: "" },
    });
    const missing = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    expect(missing.llmsTxt).toBe(false);
  });

  it("finds a sitemap via a Sitemap: line in robots.txt even when sitemap.xml 404s", async () => {
    mockFetches({
      robots: {
        status: 200,
        text: "User-agent: *\nAllow: /\nSitemap: https://acme.com/sitemap-index.xml\n",
      },
      sitemapXml: { status: 404, text: "" },
    });

    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    expect(result.sitemap).toBe(true);
  });

  it("finds a sitemap via a 200 on /sitemap.xml even with no robots.txt", async () => {
    mockFetches({
      robots: { status: 404, text: "" },
      sitemapXml: { status: 200, text: "<urlset></urlset>" },
    });

    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    expect(result.sitemap).toBe(true);
  });

  it("reports sitemap false when neither signal is present", async () => {
    mockFetches({ robots: { status: 404, text: "" }, sitemapXml: { status: 404, text: "" } });
    const result = await readReadiness({ domain: "acme.com", html: "<html></html>" });
    expect(result.sitemap).toBe(false);
  });

  it("extracts JSON-LD @type values, including inside @graph and arrays, deduped and in order", async () => {
    mockFetches({ robots: { status: 404, text: "" } });

    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[
            {"@type":"Organization","name":"Acme"},
            {"@type":["Article","NewsArticle"],"headline":"x"},
            {"@type":"Organization","name":"Acme again"}
          ]}
        </script>
      </head><body></body></html>
    `;

    const result = await readReadiness({ domain: "acme.com", html });
    expect(result.schemaTypes).toEqual(["Organization", "Article", "NewsArticle"]);
  });

  // An unreadable robots.txt says nothing about crawler access. Reporting
  // "allowed" here would show a measured-looking result we never measured.
  it("throws when robots.txt cannot be read, instead of reporting crawlers as allowed", async () => {
    ssrfStubs.safeFetchText.mockRejectedValue(new Error("network down"));

    const html = '<script type="application/ld+json">{"@type":"WebPage","name":"x"}</script>';
    await expect(readReadiness({ domain: "acme.com", html })).rejects.toThrow(
      /Could not read robots\.txt for acme\.com/,
    );
  });
});
