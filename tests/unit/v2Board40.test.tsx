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

const { Board40Screen } = await import("@/v2/screens/b40-earned-media/Screen");
const { board40Fixture } = await import("@/v2/screens/b40-earned-media/fixture");
const { useBoard40Data } = await import("@/v2/screens/b40-earned-media/data");

function renderScreen(data = board40Fixture) {
  return render(<Board40Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderHook(() => useBoard40Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function stubEarnedMediaFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return Promise.resolve(new Response(JSON.stringify({ error: "failed" }), { status: 500 }));
    }
    const url = String(input);
    if (url.includes("/api/v2/opportunities/earned-media/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              counts: { all: 1, listicle: 1, community: 0, mention: 0, citation: 0 },
              outreachCounts: { notStarted: 1, inProgress: 0, completed: 0, notFit: 0 },
              opportunities: [
                {
                  id: "listicle:l1",
                  sourceType: "listicle",
                  sourceTypeLabel: "Listicle mention",
                  sourceName: "TechCrunch",
                  sourceUrl: "https://techcrunch.test/best-pr",
                  topicMatch: "High",
                  affectedQuestionCount: 3,
                  relationship: "No contact",
                  evidenceType: "Citation gap",
                  effort: "Medium",
                  confidence: "High",
                  status: "Not started",
                  canUpdateStatus: true,
                  taskKey: "v2earned:listicle:l1",
                  detail: {
                    headline: '"Best PR agencies" does not include the brand.',
                    quote: null,
                    quoteAttribution: null,
                    observedAt: "2026-09-01T00:00:00.000Z",
                  },
                },
              ],
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

describe("Board 40 screen", () => {
  it("renders the source table, filters and the selected opportunity detail", () => {
    renderScreen();

    expect(screen.getByText("Earn evidence from relevant sources")).toBeInTheDocument();
    expect(screen.getAllByText("TechCrunch").length).toBeGreaterThan(0);
    expect(screen.getByText("r/startups (reddit)")).toBeInTheDocument();
    expect(screen.getByText("G2 review thread")).toBeInTheDocument();
    expect(screen.getByText("saastr.test")).toBeInTheDocument();
    expect(screen.getByText("How opportunities are qualified")).toBeInTheDocument();
    expect(screen.getByText("Why this is a good opportunity")).toBeInTheDocument();
    expect(screen.getByText("Safe outreach brief (do not send yet)")).toBeInTheDocument();
  });

  it("shows an honest empty state when no opportunities exist", () => {
    renderScreen({
      ...board40Fixture,
      counts: { ...board40Fixture.counts, all: 0 },
      opportunities: [],
    });

    expect(
      screen.getByText(
        "No evidence-backed opportunities exist yet. They appear once listicles, community posts, mentions or AI citations are tracked.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Board 40 live adapter", () => {
  it("maps the real opportunities response", async () => {
    stubEarnedMediaFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.opportunities[0].sourceName).toBe("TechCrunch");
    expect(result.current.data?.counts.all).toBe(1);
  });

  it("reports loading while the request is pending", () => {
    stubEarnedMediaFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when the request fails", async () => {
    stubEarnedMediaFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
