// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board37Route } from "@/v2/screens/b37-citation-explorer/Route";
import { Board37Screen } from "@/v2/screens/b37-citation-explorer/Screen";
import { board37Fixture } from "@/v2/screens/b37-citation-explorer/fixture";

const brandState = vi.hoisted(() => ({
  selectedBrandId: "brand-venture-pr",
  selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
  brands: [{ id: "brand-venture-pr" }],
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandState,
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Board37Route />
    </QueryClientProvider>,
  );
}

describe("Board 37 citation explorer", () => {
  it("renders every major region from the approved fixture", () => {
    render(<Board37Screen data={board37Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Where answers cite information" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mentions")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getAllByText("Citations").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("11").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Failures")).toBeInTheDocument();
    expect(screen.getByText("What is VenturePR and what does it do?")).toBeInTheDocument();
    expect(screen.getByText("Cited")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Source mix" })).toBeInTheDocument();
    expect(screen.getAllByText("Company site").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("heading", { name: "First-party vs third-party coverage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("45% First-party")).toBeInTheDocument();
  });

  it("expands a row to show its excerpt and source", () => {
    render(<Board37Screen data={board37Fixture} />);

    expect(screen.queryByText(/strategic communications firm/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /What is VenturePR and what does it do\?/ }),
    );

    expect(screen.getByText(/strategic communications firm/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /venturepr\.com/ })).toBeInTheDocument();
  });

  it("shows the honest not-measured state when no citation carries a source type", () => {
    const data = { ...board37Fixture, sourceMix: [], firstPartyShare: null, thirdPartyShare: null };
    render(<Board37Screen data={data} />);
    expect(screen.getAllByText("Not measured").length).toBe(2);
  });

  it("maps the real citation-explorer endpoint into the live screen", async () => {
    const fetchMock = vi.fn(async () => {
      const data = {
        captureDate: "2026-09-15",
        summary: { mentions: 3, citations: 1, failures: 1, attempts: 5 },
        records: [
          {
            id: "row-1",
            questionId: "p1",
            question:
              "What should I consider when choosing a public relations firm for my startup?",
            engine: "DeepSeek",
            state: "cited",
            brandMentioned: true,
            brandCited: true,
            sourceDomain: "venturepr.com",
            sourceType: null,
            sourceUrl: "https://venturepr.com",
            capturedAt: "2026-08-31T02:39:51.841Z",
            excerpt: "VenturePR helps startups build a media presence.",
          },
        ],
        sourceMix: [],
        firstPartyShare: 100,
        thirdPartyShare: 0,
      };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(
      await screen.findByText(
        "What should I consider when choosing a public relations firm for my startup?",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns loading and error states through the route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Promise<Response>(() => undefined)),
    );
    renderRoute();
    expect(screen.getByTestId("v2-state-loading")).toBeInTheDocument();
    vi.unstubAllGlobals();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 500 })),
    );
    renderRoute();
    expect(await screen.findByTestId("v2-state-error")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
