// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The page renders router links via dashboard-panel primitives (CCLink) and
// reads brand selection from a hook - stub both so this test is about
// payload handling and rendering, not navigation or brand-list plumbing.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "Acme Corp" },
    brands: [{ id: "brand-1", name: "Acme Corp" }],
    isLoading: false,
  }),
}));

import SiteHealthDetailPage, { type SiteHealthPage } from "@/pages/site-health";

const HEALTH_KEY = "/api/dashboard/site-health/brand-1";
const PAGES_KEY = "/api/dashboard/site-health/brand-1/pages";
const CONTENT_FINDINGS_KEY = "/api/dashboard/site-health/brand-1/content-findings";
const FINDING_STATUS_KEY = "/api/dashboard/site-health/brand-1/finding-status";

function renderWithData(healthData: unknown, pagesData?: unknown, contentFindingsData?: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData([HEALTH_KEY], { success: true, data: healthData });
  qc.setQueryData(
    [PAGES_KEY],
    pagesData !== undefined
      ? { success: true, data: pagesData }
      : { success: true, data: { runId: null, pages: [] } },
  );
  qc.setQueryData(
    [CONTENT_FINDINGS_KEY],
    contentFindingsData !== undefined
      ? { success: true, data: contentFindingsData }
      : { success: true, data: { findings: [] } },
  );
  qc.setQueryData([FINDING_STATUS_KEY], { success: true, data: [] });
  return render(
    <QueryClientProvider client={qc}>
      <SiteHealthDetailPage />
    </QueryClientProvider>,
  );
}

const fullHealth = {
  website: "https://example.com",
  checkedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  score: 74,
  discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: false },
  crawlers: { total: 18, allowed: 16, blocked: 2, unknown: 0, blockedCrawlers: ["GPTBot"] },
  crawl: {
    pagesCrawled: 10,
    pagesFailed: 1,
    sitemapUrlCount: 53,
    lastCrawlAt: new Date().toISOString(),
  },
  platform: "Next.js",
  issues: { critical: 0, high: 1, medium: 3, low: 2, total: 6 },
};

const pageRows: SiteHealthPage[] = [
  {
    url: "https://example.com/broken",
    statusCode: 500,
    status: "failed",
    errorKind: null,
    contentType: null,
    factCount: 0,
    severity: "critical",
    findingIds: ["failed-pages"],
  },
  {
    url: "https://example.com/missing",
    statusCode: 404,
    status: "completed",
    errorKind: null,
    contentType: "text/html",
    factCount: 0,
    severity: "high",
    findingIds: ["failed-pages"],
  },
];

describe("SiteHealthDetailPage - full data", () => {
  it("renders the score and meta rows", () => {
    renderWithData(fullHealth, { runId: "run-1", pages: pageRows });

    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy();
    // "Pages" stat shows the sitemap's URL count (site size, 53), not the
    // audited sample (10) - the audited count appears as the stat's caption.
    expect(screen.getByText("53")).toBeTruthy();
    expect(screen.getByText("10 audited")).toBeTruthy();
  });

  // Full parity rebuild: raw page URLs are no longer listed inline on the
  // Findings tab (that was the removed IssueGroup component) - they live
  // behind the checks table's finding drawer now, GROUPED by path prefix
  // (matching the reference product's own "Where it shows up" pattern),
  // not as a flat URL list. Opening a row's drawer is the real assertion
  // that affected-URL data still reaches the UI.
  it("shows affected pages grouped by path prefix inside the finding drawer, not inline", () => {
    renderWithData(fullHealth, { runId: "run-1", pages: pageRows });

    expect(screen.queryByText("https://example.com/broken")).toBeNull();
    expect(screen.queryByText("/broken/*")).toBeNull();
    const failedRowButton = screen
      .getAllByText(/failed to crawl/i)
      .map((el) => el.closest("button"))
      .find((btn): btn is HTMLButtonElement => !!btn);
    fireEvent.click(failedRowButton!);
    // pageRows has one page under /broken and one under /missing - two
    // distinct top-level segments, so two separate path groups, each 1 page.
    expect(screen.getByText("/broken/*")).toBeTruthy();
    expect(screen.getByText("/missing/*")).toBeTruthy();
  });

  // The Open Issues and Platform tiles stay removed - Open Issues restated
  // the findings list's own count as a metric, and there's still no Platform
  // tile anywhere on this page. The tab strip is BACK (Findings/Pages/History,
  // full parity rebuild) - this now asserts presence, not absence.
  it("still has no Open Issues or Platform tile, and now has the Findings/Pages/History tab strip", () => {
    renderWithData(fullHealth, { runId: "run-1", pages: pageRows });

    expect(screen.queryByText("Open Issues")).toBeNull();
    expect(screen.queryByText("Platform")).toBeNull();
    expect(screen.queryByText("Next.js")).toBeNull();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Findings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Pages" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "History" })).toBeTruthy();
  });
});

describe("SiteHealthDetailPage - sitemap unavailable", () => {
  it("falls back to the audited page count and names the missing source", () => {
    renderWithData(
      { ...fullHealth, crawl: { ...fullHealth.crawl, sitemapUrlCount: null } },
      { runId: "run-1", pages: pageRows },
    );
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText(/Sitemap unavailable/)).toBeTruthy();
  });
});

describe("SiteHealthDetailPage - no crawl run", () => {
  it("renders a Not crawled yet state with an empty pages array, without throwing", () => {
    expect(() =>
      renderWithData(
        { ...fullHealth, crawl: { pagesCrawled: null, pagesFailed: null, lastCrawlAt: null } },
        { runId: null, pages: [] },
      ),
    ).not.toThrow();
    expect(screen.getByText(/Not crawled yet/)).toBeTruthy();
  });
});

describe("SiteHealthDetailPage - missing nested objects", () => {
  it("renders without throwing when discovery/crawlers/crawl/issues are absent", () => {
    const bare = { website: "https://example.com", checkedAt: "", score: null } as never;
    expect(() => renderWithData(bare, { runId: null, pages: [] })).not.toThrow();
  });

  it("renders without throwing when health is entirely missing", () => {
    expect(() => renderWithData(undefined, { runId: null, pages: [] })).not.toThrow();
  });
});

describe("SiteHealthDetailPage - content findings (advisory, 0 pts)", () => {
  it("appends content findings to What To Fix Next as advisory, never a +N pts badge", () => {
    renderWithData(
      fullHealth,
      { runId: "run-1", pages: pageRows },
      {
        findings: [
          {
            id: "content-meta-tags",
            category: "CONTENT STRUCTURE",
            title: "Fix Meta Tags",
            description: "Some pages are missing a title or meta description.",
            points: 0,
            affectedUrls: ["https://example.com/broken"],
            advisory: true,
          },
        ],
      },
    );

    expect(screen.getByText("Fix Meta Tags")).toBeTruthy();
    expect(screen.getAllByText("advisory").length).toBeGreaterThan(0);
  });
});

describe("SiteHealthDetailPage - pending (deadline-timeout placeholder)", () => {
  it("shows a Measuring… state, never a score, when pending is true", () => {
    renderWithData({ ...fullHealth, score: null, pending: true }, { runId: null, pages: [] });
    expect(screen.getByText("Measuring…")).toBeTruthy();
    expect(screen.queryByText("74")).toBeNull();
  });
});

describe("SiteHealthDetailPage - crawl to cite rate", () => {
  // The tile is gone. It had no data source at all and rendered a permanent
  // dash, so the honesty rule it used to enforce ("never a 0 for something we
  // cannot measure") now has nothing to apply to. What still matters is that
  // removing it did not leave a 0 behind in its place.
  it("no longer renders the crawl-to-cite-rate stat at all", () => {
    renderWithData(fullHealth, { runId: "run-1", pages: pageRows });

    expect(screen.queryByText(/No data source yet/)).toBeNull();
    // Scoped to this stat's own label. A bare /Crawl/ also matches the header's
    // "Crawler access" link and the CRAWLERS meta tile, both of which stay.
    expect(screen.queryByText(/Crawl → Cite/i)).toBeNull();
    // The CRAWLERS tile still renders a legitimate "0 blocked", so a bare
    // queryByText("0") would find that instead - assert on the stat grid's
    // metric text size, which only the stat tiles use.
    expect(document.querySelector(".text-metric")?.textContent).not.toBe("0");
  });
});
