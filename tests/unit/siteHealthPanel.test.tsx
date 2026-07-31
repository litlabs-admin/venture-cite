// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The panel renders router Links (via CCLink/PanelLink), which need a live
// router context. These tests are about payload handling, not navigation, so
// stub Link to a plain anchor rather than standing up a whole RouterProvider.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { SiteHealthPanel } from "@/components/dashboard-panels/PromptsRow";

// REGRESSION GUARD. This panel once read `health.discovery[k]` and
// `health.crawl.pagesCrawled` straight off the API payload. When the server
// returned an older/partial shape it threw
//   "Cannot read properties of undefined (reading 'robotsTxt')"
// and, because the panel renders inside the dashboard tree, the error boundary
// swallowed the ENTIRE dashboard — the user could not open the page at all.
//
// A single panel must never be able to do that. These tests feed it payloads
// that are wrong in the ways a real deploy can be wrong, and assert only that
// it renders something rather than throwing.

// Deliberately not typed as SiteHealth — the whole point is that these are
// shapes TypeScript would reject but a running server can still send.
const legacyShape = {
  website: "https://example.com",
  robotsTxtExists: true,
  score: 88,
  total: 18,
  allowed: 16,
  blocked: 2,
  unknown: 0,
  blockedCrawlers: ["GPTBot"],
  pagesCrawled: 53,
  pagesFailed: 1,
  lastCrawlAt: new Date().toISOString(),
  checkedAt: new Date().toISOString(),
} as never;

describe("SiteHealthPanel payload resilience", () => {
  it("renders the legacy flat payload (the exact shape that crashed) instead of throwing", () => {
    expect(() => render(<SiteHealthPanel health={legacyShape} loading={false} />)).not.toThrow();
    expect(screen.getByText("Site Health")).toBeTruthy();
  });

  it("renders when every nested object is missing", () => {
    const bare = { website: null, score: 50, checkedAt: "" } as never;
    expect(() => render(<SiteHealthPanel health={bare} loading={false} />)).not.toThrow();
  });

  it("renders when health is null (brand never measured)", () => {
    expect(() => render(<SiteHealthPanel health={null} loading={false} />)).not.toThrow();
  });

  it("renders the loading skeleton", () => {
    expect(() => render(<SiteHealthPanel health={null} loading={true} />)).not.toThrow();
  });

  it("renders a complete, well-formed payload and shows the score", () => {
    const full = {
      website: "https://example.com",
      checkedAt: new Date().toISOString(),
      score: 74,
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: false },
      crawlers: { total: 18, allowed: 16, blocked: 2, unknown: 0, blockedCrawlers: ["GPTBot"] },
      crawl: {
        pagesCrawled: 53,
        pagesFailed: 1,
        // A clear 1 day + 1 hour back, so this asserts the "Nd ago" branch of
        // relDays() rather than its "today" branch.
        lastCrawlAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
      platform: "Next.js",
      issues: { critical: 0, high: 1, medium: 3, low: 2, total: 6 },
    };
    const { container } = render(<SiteHealthPanel health={full} loading={false} />);
    expect(screen.getByText("74")).toBeTruthy();
    // Discovery counts the two present out of the FIVE files probed.
    expect(screen.getByText(/2\/5 discovery/)).toBeTruthy();

    // Measured reference spec: four severity tiers, each with an 8×8 swatch,
    // and a three-chip meta row (pages / discovery / recency).
    ["crit", "high", "med", "low"].forEach((t) => expect(screen.getByText(t)).toBeTruthy());
    expect(container.querySelectorAll("span.h-2.w-2").length).toBe(4);
    expect(screen.getByText("53 pages")).toBeTruthy();
    expect(screen.getByText("Next.js")).toBeTruthy();
    expect(screen.getByText("1d ago")).toBeTruthy();

    // Critical stays red; the quiet tiers stay neutral, per the blue-safe ramp.
    //
    // Asserted as TOKENS, not hex. These were literal #a8a29e / #d6d3d1, which
    // pinned the swatches to light mode — a literal here renders identically
    // under `.dark` and the ramp disappears against the dark canvas. Every
    // colour on this surface now resolves through a theme variable.
    const swatches = [...container.querySelectorAll<HTMLElement>("span.h-2.w-2")];
    expect(swatches[0].style.backgroundColor).toContain("--negative");
    expect(swatches[2].style.backgroundColor).toContain("--fg-disabled");
    expect(swatches[3].style.backgroundColor).toContain("--border-strong");
  });
});

describe("SiteHealthPanel — pending (deadline-timeout placeholder)", () => {
  it("renders 'Measuring…' and no score/number when pending is true", () => {
    render(
      <SiteHealthPanel
        health={{
          website: "https://example.com",
          checkedAt: new Date().toISOString(),
          score: null,
          pending: true,
          discovery: {
            robotsTxt: null,
            sitemapXml: null,
            llmsTxt: null,
            mcpJson: null,
            securityTxt: null,
          },
          crawlers: { total: 0, allowed: 0, blocked: 0, unknown: 0, blockedCrawlers: [] },
          crawl: {
            pagesCrawled: null,
            pagesFailed: null,
            sitemapUrlCount: null,
            lastCrawlAt: null,
          },
          platform: null,
          issues: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        }}
        loading={false}
      />,
    );
    expect(screen.getByText("Measuring…")).toBeTruthy();
    // Never a score of 0 (or any number) while pending.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText(/crit|high|med|low/)).toBeNull();
  });
});

describe("SiteHealthPanel — unknown (unmeasured) discovery entries", () => {
  it("renders the tri-state chip counting only CONFIRMED files, not unknown ones", () => {
    render(
      <SiteHealthPanel
        health={{
          website: "https://example.com",
          checkedAt: new Date().toISOString(),
          score: 74,
          discovery: {
            robotsTxt: true,
            sitemapXml: true,
            llmsTxt: null,
            mcpJson: null,
            securityTxt: false,
          },
          crawlers: { total: 18, allowed: 16, blocked: 2, unknown: 0, blockedCrawlers: ["GPTBot"] },
          crawl: {
            pagesCrawled: 53,
            pagesFailed: 1,
            sitemapUrlCount: null,
            lastCrawlAt: new Date().toISOString(),
          },
          platform: "Next.js",
          issues: { critical: 0, high: 1, medium: 3, low: 2, total: 6 },
        }}
        loading={false}
      />,
    );
    // 2 confirmed present (robots, sitemap) out of 5 — llmsTxt/mcpJson are
    // unknown and must NOT be counted as failures, and the chip says so.
    expect(screen.getByText(/2\/5 discovery/)).toBeTruthy();
    expect(screen.getByText(/2 unknown/)).toBeTruthy();
  });
});

describe("SiteHealthPanel — sitemap URL count vs audited pages", () => {
  const base = {
    website: "https://example.com",
    checkedAt: new Date().toISOString(),
    score: 87,
    discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
    crawlers: { total: 18, allowed: 18, blocked: 0, unknown: 0, blockedCrawlers: [] },
    platform: "Next.js",
    issues: { critical: 0, high: 1, medium: 3, low: 3, total: 7 },
  };

  it("shows the sitemap's URL count (site size), not the audited sample, in the 'N pages' chip", () => {
    render(
      <SiteHealthPanel
        health={{
          ...base,
          crawl: {
            pagesCrawled: 10,
            pagesFailed: 0,
            sitemapUrlCount: 53,
            lastCrawlAt: new Date().toISOString(),
          },
        }}
        loading={false}
      />,
    );
    expect(screen.getByText("53 pages")).toBeTruthy();
    expect(screen.queryByText("10 pages")).toBeNull();
  });

  it("falls back to the audited count when the sitemap could not be fetched", () => {
    render(
      <SiteHealthPanel
        health={{
          ...base,
          crawl: {
            pagesCrawled: 10,
            pagesFailed: 0,
            sitemapUrlCount: null,
            lastCrawlAt: new Date().toISOString(),
          },
        }}
        loading={false}
      />,
    );
    expect(screen.getByText("10 pages")).toBeTruthy();
  });
});

describe("SiteHealthPanel severity row matches the reference", () => {
  const base = {
    website: "https://example.com",
    checkedAt: new Date().toISOString(),
    score: 92,
    discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
    crawlers: { total: 18, allowed: 18, blocked: 0, unknown: 0, blockedCrawlers: [] },
    platform: "Next.js",
  };

  it("shows all four counts for a CRAWLED site even when every count is zero", () => {
    // The reference renders "0 crit · 1 high · …" whenever a crawl exists.
    // Collapsing an all-zero crawl to prose gave a healthy site a different
    // layout from an unhealthy one, and never matched the reference.
    render(
      <SiteHealthPanel
        health={{
          ...base,
          crawl: { pagesCrawled: 53, pagesFailed: 0, lastCrawlAt: new Date().toISOString() },
          issues: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        }}
        loading={false}
      />,
    );
    ["crit", "high", "med", "low"].forEach((t) => expect(screen.getByText(t)).toBeTruthy());
    expect(screen.queryByText(/No issues found/)).toBeNull();
  });

  it("falls back to prose only when the site has NEVER been crawled", () => {
    render(
      <SiteHealthPanel
        health={{
          ...base,
          crawl: { pagesCrawled: null, pagesFailed: null, lastCrawlAt: null },
          issues: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        }}
        loading={false}
      />,
    );
    expect(screen.getByText(/Not crawled yet/)).toBeTruthy();
    expect(screen.queryByText("crit")).toBeNull();
  });
});
