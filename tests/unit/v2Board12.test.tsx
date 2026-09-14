// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board12Data } from "@/v2/screens/b12-geo-signals/Screen";
import { Board12Screen } from "@/v2/screens/b12-geo-signals/Screen";
import { board12Fixture } from "@/v2/screens/b12-geo-signals/fixture";
import { useBoard12Data } from "@/v2/screens/b12-geo-signals/data";

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

function renderScreen(data: Board12Data = board12Fixture) {
  return render(<Board12Screen data={data} />);
}

function renderDataProbe() {
  function Probe() {
    const result = useBoard12Data();
    return (
      <output data-testid="board12-data-state">
        {result.state.kind}
        {result.state.kind === "not-measured" ? `:${result.state.reason}` : ""}
      </output>
    );
  }

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

function notMeasured<T>(reason: string) {
  return { kind: "not-measured" as const, reason };
}

describe("Board 12 fixture", () => {
  it("renders the title, tabs, score, chart labels, source rows, opportunity, and rail", () => {
    renderScreen();

    expect(
      screen.getByRole("heading", { name: "Find the cause. Choose a useful fix." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Where engines find and trust VenturePR")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "GEO signals" })).toBeInTheDocument();
    expect(screen.getByText("Verified signal coverage")).toBeInTheDocument();
    expect(screen.getAllByText("64")).toHaveLength(2);
    expect(screen.getByText("+6")).toBeInTheDocument();
    expect(screen.getByText("Signal coverage by source")).toBeInTheDocument();
    expect(screen.getAllByText("First-party website")).toHaveLength(2);
    expect(screen.getByText("248")).toBeInTheDocument();
    expect(screen.getAllByText("User confirmation")).toHaveLength(2);
    expect(screen.getByText("Top opportunity from diagnostics")).toBeInTheDocument();
    expect(
      screen.getByText("Strengthen founder credentials on trusted profiles"),
    ).toBeInTheDocument();
    expect(screen.getByText("View all opportunities")).toBeInTheDocument();
    expect(screen.getByText("Source mix")).toBeInTheDocument();
    expect(screen.getAllByText("186")).toHaveLength(2);
    expect(screen.getByText("Missing evidence")).toBeInTheDocument();
    expect(screen.getByText("Next verification")).toBeInTheDocument();
    expect(screen.getByText("Estimated effort")).toBeInTheDocument();
  });

  it("renders all source rows and their status words", () => {
    renderScreen();

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getAllByText("Detected").length).toBeGreaterThan(1);
    expect(within(table).getAllByText("Verified").length).toBeGreaterThan(1);
    expect(within(table).getByText("Stale")).toBeInTheDocument();
    expect(within(table).getAllByText("User confirmation")).toHaveLength(2);
    expect(within(table).getByText("+22%")).toBeInTheDocument();
  });

  it("uses the fixture’s source mix shares and verification copy", () => {
    renderScreen();

    expect(screen.getByRole("img", { name: /Donut chart/i })).toBeInTheDocument();
    expect(screen.getAllByText("First-party website")).toHaveLength(2);
    expect(screen.getByText("36%")).toBeInTheDocument();
    expect(screen.getByText("Third-party mentions")).toBeInTheDocument();
    expect(screen.getByText("Verify Crunchbase founder profile")).toBeInTheDocument();
    expect(screen.getByText("10 work points")).toBeInTheDocument();
  });

  it("shows Not measured for unavailable values instead of a number", () => {
    const data: Board12Data = {
      ...board12Fixture,
      signalCoverage: {
        ...board12Fixture.signalCoverage,
        score: notMeasured("No GEO signal score exists."),
      },
      sourceSignals: board12Fixture.sourceSignals.map((row, index) =>
        index === 0
          ? {
              ...row,
              detected: notMeasured("No source count exists."),
              verified: notMeasured("No verified source count exists."),
            }
          : row,
      ),
      sourceMix: {
        ...board12Fixture.sourceMix,
        verifiedTotal: notMeasured("No verified total exists."),
      },
      opportunity: {
        ...board12Fixture.opportunity,
        points: notMeasured("No opportunity record exists."),
      },
    };

    renderScreen(data);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("64")).not.toBeInTheDocument();
    expect(screen.queryByText("248")).not.toBeInTheDocument();
    expect(screen.queryByText("186")).not.toBeInTheDocument();
    expect(screen.queryByText("40 work points")).not.toBeInTheDocument();
  });
});

describe("Board 12 live adapter", () => {
  beforeEach(() => {
    brandStub.value = {
      selectedBrandId: "brand-venture-pr",
      selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
      brands: [{ id: "brand-venture-pr", name: "VenturePR" }],
      isLoading: false,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries the real recommendations projection and does not use fixture values", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDataProbe();

    await waitFor(() =>
      expect(screen.getByTestId("board12-data-state")).toHaveTextContent("not-measured"),
    );
    expect(screen.getByTestId("board12-data-state")).toHaveTextContent(
      "GEO signal source categories and opportunity records are not available from the current API.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/brands/brand-venture-pr/recommendations",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns loading while the backend request is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderDataProbe();

    expect(screen.getByTestId("board12-data-state")).toHaveTextContent("loading");
  });

  it("returns error when the backend request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, error: "boom" }), { status: 500 }),
      ),
    );

    renderDataProbe();

    await waitFor(() =>
      expect(screen.getByTestId("board12-data-state")).toHaveTextContent("error"),
    );
  });

  it("returns not-measured when no brand is selected", () => {
    brandStub.value = {
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: false,
    };

    renderDataProbe();

    expect(screen.getByTestId("board12-data-state")).toHaveTextContent("not-measured");
  });
});
