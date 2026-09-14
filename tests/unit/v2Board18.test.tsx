// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Board18Screen, type Board18Data } from "@/v2/screens/b18-site-health/Screen";
import { board18Fixture } from "@/v2/screens/b18-site-health/fixture";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr", name: "VenturePR" }],
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const { apiRequest } = await import("@/lib/queryClient");
const { useBoard18Data } = await import("@/v2/screens/b18-site-health/data");

const apiRequestMock = vi.mocked(apiRequest);

function queryWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

function liveHealth(overrides: Record<string, unknown> = {}) {
  const checkedAt = new Date().toISOString();
  return {
    success: true,
    data: {
      website: "https://venturepr.example",
      checkedAt,
      score: 81,
      pending: false,
      platform: "Next.js",
      discovery: {
        robotsTxt: true,
        sitemapXml: true,
        llmsTxt: false,
        mcpJson: null,
        securityTxt: null,
      },
      crawlers: {
        total: 7,
        allowed: 4,
        blocked: 2,
        unknown: 1,
        blockedCrawlers: ["GPTBot", "ClaudeBot"],
      },
      crawl: {
        pagesCrawled: 4,
        pagesFailed: 1,
        sitemapUrlCount: 7,
        lastCrawlAt: checkedAt,
      },
      issues: { critical: 1, high: 0, medium: 1, low: 0, total: 2 },
      ...overrides,
    },
  };
}

function liveHistory() {
  return {
    success: true,
    data: {
      scans: [
        {
          id: "scan-2",
          runId: "run-2",
          score: 81,
          pagesCrawled: 4,
          pagesFailed: 1,
          issues: { critical: 1, high: 0, medium: 1, low: 0 },
          createdAt: "2026-09-15T10:24:00.000Z",
        },
        {
          id: "scan-1",
          runId: "run-1",
          score: 70,
          pagesCrawled: 3,
          pagesFailed: 2,
          issues: { critical: 0, high: 1, medium: 0, low: 0 },
          createdAt: "2026-09-08T10:24:00.000Z",
        },
      ],
    },
  };
}

function livePages() {
  return {
    success: true,
    data: {
      runId: "run-2",
      pages: [
        {
          url: "https://venturepr.example/pricing/",
          statusCode: null,
          status: "failed",
          errorKind: "robots_disallowed",
          contentType: "text/html",
          factCount: 0,
          severity: "critical",
          findingIds: ["failed-pages"],
        },
      ],
    },
  };
}

function mockLiveApi(
  health: unknown = liveHealth(),
  history: unknown = liveHistory(),
  pages: unknown = livePages(),
) {
  apiRequestMock.mockImplementation(async (_method, url) => {
    if (url.includes("/history")) return jsonResponse(history);
    if (url.includes("/pages")) return jsonResponse(pages);
    return jsonResponse(health);
  });
}

describe("Board 18 screen", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("renders the approved site-health regions and values", () => {
    render(<Board18Screen data={board18Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Find the cause. Choose a useful fix." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Verify how AI crawlers see your site, fix what's blocking visibility, and track progress over time.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("b18-score")).toHaveTextContent("72");
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Site health" })).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("Pricing page blocks AI crawlers")).toBeInTheDocument();
    expect(screen.getByText("/pricing/robots.txt")).toBeInTheDocument();
    expect(screen.getByText(/VenturePR/)).toBeInTheDocument();
    expect(screen.getByText("Site health checks")).toBeInTheDocument();
    expect(screen.getByText("148")).toBeInTheDocument();
    expect(screen.getByText("September 16, 2026")).toBeInTheDocument();
    expect(screen.getByText("Crawl completed")).toBeInTheDocument();
    expect(screen.getByText("Site health guide for AI visibility")).toBeInTheDocument();
  });

  it("renders a label for every unavailable value variant", () => {
    const data: Board18Data = {
      ...board18Fixture,
      health: {
        ...board18Fixture.health,
        score: { kind: "not-measured", reason: "No scored crawl exists." },
      },
      evidence: {
        ...board18Fixture.evidence,
        observed: { kind: "failed", reason: "The evidence read failed." },
        unknown: { kind: "stale", reason: "The evidence is old.", asOf: "2026-09-09" },
      },
    };

    render(<Board18Screen data={data} />);

    expect(within(screen.getByTestId("b18-score")).getByText("Not measured")).toBeInTheDocument();
    expect(within(screen.getByTestId("b18-observed")).getByText("Failed")).toBeInTheDocument();
    expect(within(screen.getByTestId("b18-unknown")).getByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText("148")).not.toBeInTheDocument();
    expect(screen.queryByText("27")).not.toBeInTheDocument();
  });
});

describe("Board 18 live adapter", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    brandStub.value.selectedBrandId = "brand-venture-pr";
  });

  it("maps site-health, history, and page evidence responses", async () => {
    mockLiveApi();

    const { result } = renderHook(() => useBoard18Data(), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    if (result.current.data === undefined) throw new Error("Expected Board 18 data.");

    expect(result.current.data.health.score).toEqual({ kind: "measured", value: 81 });
    expect(result.current.data.health.status).toEqual({ kind: "measured", value: "Healthy" });
    expect(result.current.data.health.history).toMatchObject({ kind: "measured" });
    expect(result.current.data.healthChecks[0]?.verified).toEqual({ kind: "measured", value: 4 });
    expect(result.current.data.priorityIssue.title).toEqual({
      kind: "measured",
      value: "1 page failed to crawl",
    });
    expect(result.current.data.priorityIssue.businessImpact.kind).toBe("not-measured");
  });

  it("returns not-measured when the API has no valid crawl", async () => {
    mockLiveApi(
      liveHealth({
        score: null,
        crawl: { pagesCrawled: null, pagesFailed: null, sitemapUrlCount: null, lastCrawlAt: null },
      }),
      { success: true, data: { scans: [] } },
      { success: true, data: { runId: null, pages: [] } },
    );

    const { result } = renderHook(() => useBoard18Data(), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.state.kind).toBe("not-measured"));
    expect(result.current.data).toBeUndefined();
  });

  it("returns loading while the API is pending", () => {
    apiRequestMock.mockImplementation(() => new Promise<Response>(() => undefined));

    const { result } = renderHook(() => useBoard18Data(), { wrapper: queryWrapper });

    expect(result.current.state.kind).toBe("loading");
  });

  it("returns error when an API read fails", async () => {
    apiRequestMock.mockRejectedValue(new Error("network unavailable"));

    const { result } = renderHook(() => useBoard18Data(), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.data).toBeUndefined();
  });

  it("returns stale with the crawl timestamp for an old measurement", async () => {
    mockLiveApi(
      liveHealth({
        checkedAt: "2026-09-09T10:24:00.000Z",
        crawl: {
          pagesCrawled: 4,
          pagesFailed: 1,
          sitemapUrlCount: 7,
          lastCrawlAt: "2026-09-09T10:24:00.000Z",
        },
      }),
    );

    const { result } = renderHook(() => useBoard18Data(), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.state.kind).toBe("stale"));
    expect(result.current.state.kind === "stale" ? result.current.state.asOf : "").toBe(
      "2026-09-09T10:24:00.000Z",
    );
    expect(result.current.data).toBeDefined();
  });
});
