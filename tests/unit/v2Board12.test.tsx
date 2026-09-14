// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const api = vi.hoisted(() => ({ handlers: new Map<string, () => unknown>() }));
const apiRequestMock = vi.hoisted(() =>
  vi.fn(async (_method: string, url: string) => {
    for (const [fragment, handler] of api.handlers) {
      if (url.includes(fragment)) {
        const value = handler();
        if (value instanceof Error) throw value;
        return { json: async () => value };
      }
    }
    throw new Error(`unstubbed request: ${url}`);
  }),
);

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/lib/queryClient", () => ({ apiRequest: apiRequestMock }));

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
    api.handlers.clear();
  });

  it("calls the authenticated request helper, not a raw fetch (the 401 bug)", async () => {
    api.handlers.set("geo-signals/brand-venture-pr", () => ({
      success: true,
      data: {
        brandName: "VenturePR",
        score: 64,
        previousScore: 58,
        history: [{ date: "2026-09-01T00:00:00.000Z", score: 58 }],
        sourceMix: [{ sourceType: "web", detected: 10, verified: 4 }],
        citedUrlCount: 4,
        schemaAudit: null,
      },
    }));

    renderDataProbe();

    await waitFor(() =>
      expect(screen.getByTestId("board12-data-state")).toHaveTextContent("ready"),
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      "GET",
      "/api/v2/diagnostics/geo-signals/brand-venture-pr",
    );
  });

  it("maps real score, history, and source-type counts - never fixture values", async () => {
    api.handlers.set("geo-signals/brand-venture-pr", () => ({
      success: true,
      data: {
        brandName: "Real Brand",
        score: 71,
        previousScore: 60,
        history: [
          { date: "2026-08-01T00:00:00.000Z", score: 60 },
          { date: "2026-09-01T00:00:00.000Z", score: 71 },
        ],
        sourceMix: [
          { sourceType: "web", detected: 12, verified: 5 },
          { sourceType: "community", detected: 3, verified: 0 },
        ],
        citedUrlCount: 5,
        schemaAudit: null,
      },
    }));

    function Probe() {
      const result = useBoard12Data();
      if (!result.data) return <output data-testid="board12-shape">{result.state.kind}</output>;
      return (
        <output data-testid="board12-shape">
          {result.data.brand.name.kind === "measured" ? result.data.brand.name.value : "?"}|
          {result.data.signalCoverage.score.kind === "measured"
            ? result.data.signalCoverage.score.value
            : "?"}
          |{result.data.sourceSignals.length}
        </output>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("board12-shape")).toHaveTextContent("Real Brand|71|2"),
    );
  });

  it("returns loading while the backend request is pending", () => {
    api.handlers.set("geo-signals/brand-venture-pr", () => new Promise(() => {}));

    renderDataProbe();

    expect(screen.getByTestId("board12-data-state")).toHaveTextContent("loading");
  });

  it("returns error when the backend request fails", async () => {
    api.handlers.set("geo-signals/brand-venture-pr", () => new Error("boom"));

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
