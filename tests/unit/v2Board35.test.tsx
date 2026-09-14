// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board35Route } from "@/v2/screens/b35-question-portfolio/Route";
import { Board35Screen } from "@/v2/screens/b35-question-portfolio/Screen";
import { board35Fixture } from "@/v2/screens/b35-question-portfolio/fixture";

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
      <Board35Route />
    </QueryClientProvider>,
  );
}

describe("Board 35 buyer question portfolio", () => {
  it("renders every major region from the approved fixture", () => {
    render(<Board35Screen data={board35Fixture} />);

    expect(screen.getByRole("heading", { name: "Buyer questions" })).toBeInTheDocument();
    expect(
      screen.getByText("What PR services support early-stage founders in India?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Is VenturePR a good choice for Series A startups?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs work")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Set health" })).toBeInTheDocument();
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Balance gaps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Allowance" })).toBeInTheDocument();
    expect(screen.getByText("8 of 10")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search questions, keywords or audiences…"),
    ).toBeInTheDocument();
  });

  it("filters rows by search text without touching the server", () => {
    render(<Board35Screen data={board35Fixture} />);

    const search = screen.getByPlaceholderText("Search questions, keywords or audiences…");
    fireEvent.change(search, { target: { value: "Series A" } });

    expect(
      screen.getByText("Is VenturePR a good choice for Series A startups?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("What PR services support early-stage founders in India?"),
    ).not.toBeInTheDocument();
  });

  it("shows the honest not-measured state when no set-health audit has run", () => {
    const data = {
      ...board35Fixture,
      setHealth: {
        kind: "not-measured" as const,
        reason: "No set-health audit has run for this brand yet.",
      },
    };
    render(<Board35Screen data={data} />);
    expect(screen.getByText("Not measured")).toBeInTheDocument();
    expect(screen.getByText("No set-health audit has run for this brand yet.")).toBeInTheDocument();
  });

  it("maps the real portfolio endpoint into the live screen", async () => {
    const fetchMock = vi.fn(async () => {
      const data = {
        questions: [
          {
            id: "p1",
            text: "What services should I look for in a public relations firm?",
            journeyStage: "Awareness",
            category: "public relations",
            region: "global",
            audienceNames: [],
            status: "tracked",
            paused: false,
            activeEngineCount: 2,
            latestVisibilityCount: 1,
            latestVisibilityDenominator: 2,
            citationRate: 50,
            change30d: null,
            createdAt: "2026-07-23T00:00:00.000Z",
          },
        ],
        setHealth: null,
        allowance: { used: 1, limit: 10 },
      };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(
      await screen.findByText("What services should I look for in a public relations firm?"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 10")).toBeInTheDocument();
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
