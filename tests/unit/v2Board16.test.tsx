// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board16Screen } from "@/v2/screens/b16-publication-check/Screen";
import { board16Fixture } from "@/v2/screens/b16-publication-check/fixture";
import {
  mapBoard16ApiResponse,
  useBoard16Data,
  type Board16ApiResponse,
} from "@/v2/screens/b16-publication-check/data";

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    selectedBrand: { name: "VenturePR" },
    brands: [{ id: "brand-1", name: "VenturePR" }],
    isLoading: false,
  }),
}));

const apiBundle = {
  task: {
    id: "task-1",
    brandId: "brand-1",
    taskKey: "improve-page-services",
    taskVersion: 1,
    type: "improve_page_for_buyer_need",
    state: "submitted",
    revision: 2,
    title: "Correct the service description",
    desiredResult: "The published service page states the approved service description.",
    buyerNeed: "Compare PR services before contacting a provider.",
    recommendedChange: "Replace the service description with the approved wording.",
    reason: "Confirmed fact conflict",
    confidence: 0.9,
    effort: 15,
    points: 40,
    nextCheckAt: "2026-10-09T00:00:00.000Z",
    ownerId: null,
    ownerName: null,
    createdAt: "2026-09-09T10:00:00.000Z",
    updatedAt: "2026-09-09T10:24:00.000Z",
    completionRule: { required: ["content_change"] },
    measurementScope: null,
    evidence: [
      {
        id: "evidence-1",
        taskId: "task-1",
        brandId: "brand-1",
        taskVersion: 1,
        evidenceVersion: 1,
        role: "submission",
        kind: "content_change",
        status: "verified",
        sourceUrl: "https://venturepr.com/services",
        finalUrl: null,
        canonicalUrl: null,
        retrievedAt: "2026-09-09T10:24:00.000Z",
        observedAt: "2026-09-09T10:24:00.000Z",
        excerpt: "Published service page",
        structuredFinding: {
          kind: "content_change",
          label: "Published service page",
          changeId: "change-1",
          pageUrl: "https://venturepr.com/services",
          buyerNeed: "Compare PR services before contacting a provider.",
          publishedAt: "2026-09-09T10:24:00.000Z",
        },
        createdAt: "2026-09-09T10:24:00.000Z",
      },
    ],
  },
  articles: [
    {
      id: "article-1",
      brandId: "brand-1",
      title: "Our services",
      content: "VenturePR helps early-stage startups build credibility.",
      externalUrl: "https://venturepr.com/services",
    },
  ],
  revisions: [
    {
      id: "revision-1",
      articleId: "article-1",
      content: "VenturePR helps early-stage startups build credibility.",
      source: "manual_edit",
      createdBy: "user-1",
      createdAt: "2026-09-09T10:00:00.000Z",
    },
  ],
  pages: {
    runId: "run-1",
    pages: [
      {
        url: "https://venturepr.com/services",
        statusCode: 200,
        status: "success",
        errorKind: null,
        contentType: "text/html",
        factCount: 2,
        severity: "none",
        findingIds: [],
      },
    ],
  },
} satisfies Board16ApiResponse;

function renderScreen(data = board16Fixture) {
  return render(
    <div className="v2-mono">
      <Board16Screen data={data} />
    </div>,
  );
}

function queryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Board 16 publication check", () => {
  it("renders every publication-check region from the fixture", () => {
    renderScreen();

    expect(
      screen.getByRole("heading", { name: "Verify the published change" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Review brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify publication" })).toBeInTheDocument();
    expect(screen.getByText("Published URL")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://venturepr.com/services")).toBeInTheDocument();
    expect(screen.getByText("Page fetched successfully")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page comparison" })).toBeInTheDocument();
    expect(screen.getByText("Approved revision")).toBeInTheDocument();
    expect(screen.getByText("Live page")).toBeInTheDocument();
    expect(screen.getByText("startup storytelling.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Verification checks" })).toBeInTheDocument();
    expect(screen.getByText("URL reachable")).toBeInTheDocument();
    expect(screen.getByText("Changed text detected")).toBeInTheDocument();
    expect(screen.getByText("Approved facts preserved")).toBeInTheDocument();
    expect(screen.getByText("Canonical URL")).toBeInTheDocument();
    expect(screen.getByText("Indexability")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Task brief" })).toBeInTheDocument();
    expect(
      screen.getByText("Compare PR services before contacting a provider."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Verification requirements" })).toBeInTheDocument();
    expect(screen.getByText("Oct 9, 2026")).toBeInTheDocument();
    expect(screen.getByText("40 work points after successful verification")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch latest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify publication" })).toBeInTheDocument();
  });

  it("renders unavailable values as state labels instead of numbers", () => {
    const unavailableData = {
      ...board16Fixture,
      publication: {
        ...board16Fixture.publication,
        expectedCanonicalUrl: {
          kind: "not-measured",
          reason: "The expected canonical URL is not available.",
        },
      },
      checks: {
        ...board16Fixture.checks,
        urlStatusCode: {
          kind: "not-measured",
          reason: "The publication check has not run.",
        },
        changedText: {
          kind: "failed",
          reason: "The page comparison failed.",
        },
      },
    };

    renderScreen(unavailableData);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("200")).not.toBeInTheDocument();
  });

  it("maps the actual work, article, revision, and site-health response shapes", () => {
    const mapped = mapBoard16ApiResponse(apiBundle);

    expect(mapped.publication.url).toEqual({
      kind: "measured",
      value: "https://venturepr.com/services",
    });
    expect(mapped.publication.rewardPoints).toEqual({ kind: "measured", value: 40 });
    expect(mapped.checks.urlStatusCode).toEqual({ kind: "measured", value: 200 });
    expect(mapped.checks.urlReachable).toEqual({ kind: "measured", value: "Verified" });
    expect(mapped.revision.content.kind).toBe("not-measured");
    expect(mapped.livePage.content.kind).toBe("not-measured");
    expect(mapped.checks.canonical.kind).toBe("not-measured");
  });

  it("returns loading while the live publication read is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const { result } = renderHook(() => useBoard16Data(), { wrapper: queryWrapper() });

    expect(result.current.state).toEqual({ kind: "loading" });
  });

  it("returns an error when the live publication read fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { result } = renderHook(() => useBoard16Data(), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.state).toEqual({ kind: "error", message: "network down" });
  });

  it("keeps stale values visible and marks their state", () => {
    const staleData = {
      ...board16Fixture,
      publication: {
        ...board16Fixture.publication,
        fetchedAt: {
          kind: "stale",
          value: "2026-09-09T10:24:00.000Z",
          asOf: "2026-09-10T10:24:00.000Z",
        },
      },
    } satisfies typeof board16Fixture;

    renderScreen(staleData);

    expect(screen.getAllByText("Stale").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("As of 2026-09-10T10:24:00.000Z").length).toBeGreaterThan(0);
  });
});
