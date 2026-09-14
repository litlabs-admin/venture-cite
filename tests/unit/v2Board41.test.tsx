// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

const { Board41Screen } = await import("@/v2/screens/b41-content-opportunities/Screen");
const { board41Fixture } = await import("@/v2/screens/b41-content-opportunities/fixture");
const { useBoard41Data } = await import("@/v2/screens/b41-content-opportunities/data");

function renderScreen(data = board41Fixture) {
  return render(<Board41Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderHook(() => useBoard41Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function stubContentFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return Promise.resolve(new Response(JSON.stringify({ error: "failed" }), { status: 500 }));
    }
    const url = String(input);
    if (url.includes("/api/v2/opportunities/content/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pages: [
                {
                  id: "bofu:pricing",
                  sourceType: "bofu",
                  title: "Pricing",
                  path: "https://venturepr.test/pricing",
                  type: "pricing",
                  questionsCovered: 2,
                  coveredQuestionIds: ["q1", "q2"],
                  visibilityGap: "High",
                  evidenceQuality: "Weak",
                  freshness: "2026-06-10T00:00:00.000Z",
                  recommendedChange: "Add clear program details and examples.",
                  effort: "L",
                  status: "High priority",
                  taskKey: "v2content:bofu:pricing",
                },
              ],
              unmappedQuestions: [{ id: "q-onboarding", prompt: "How does onboarding work?" }],
              coverageGapCount: 1,
              duplicateTopicCount: 0,
              pagesWithoutEvidenceCount: 1,
              prioritizedAction: {
                pageId: "bofu:pricing",
                pageName: "Pricing",
                question: "What does startup PR cost?",
                recommendedChange: "Add clear program details and examples.",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board 41 screen", () => {
  it("renders the page inventory table, tabs and the gap rail", () => {
    renderScreen();

    expect(
      screen.getByText("Improve existing pages before creating new content"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Pricing").length).toBeGreaterThan(0);
    expect(screen.getByText("How does the PR process work?")).toBeInTheDocument();
    expect(screen.getByText("Coverage gaps")).toBeInTheDocument();
    expect(screen.getByText("Top prioritized action")).toBeInTheDocument();
    expect(screen.getByText("Improve Pricing")).toBeInTheDocument();
  });

  it("shows an honest empty state when no published pages are tracked", () => {
    renderScreen({ ...board41Fixture, pages: [] });

    expect(
      screen.getByText(
        "No published pages are tracked yet. Publish BOFU content, FAQs or articles to see them here.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Board 41 live adapter", () => {
  it("maps the real content opportunities response", async () => {
    stubContentFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.pages[0].title).toBe("Pricing");
    expect(result.current.data?.coverageGapCount).toBe(1);
  });

  it("reports loading while the request is pending", () => {
    stubContentFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when the request fails", async () => {
    stubContentFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
