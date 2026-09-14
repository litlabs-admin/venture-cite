// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiState: {
  error?: Error;
  getResponse?: unknown;
  postResponse?: { status: number; body: unknown };
  postCalls: Array<{ url: string; body: unknown }>;
} = { postCalls: [] };

class MockApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`${status}: mock error`);
    this.status = status;
    this.body = body;
  }
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children?: React.ReactNode; to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: async (method: string, url: string, body?: unknown) => {
    if (apiState.error) throw apiState.error;
    if (method === "POST") {
      apiState.postCalls.push({ url, body });
      const result = apiState.postResponse ?? { status: 200, body: { success: true, data: {} } };
      if (result.status >= 400) throw new MockApiError(result.status, result.body);
      return { json: async () => result.body };
    }
    if (apiState.getResponse === undefined) throw new Error("Missing mocked GET response");
    return { json: async () => apiState.getResponse };
  },
  isApiError: (err: unknown): err is MockApiError => err instanceof MockApiError,
}));

const { Board38Screen } = await import("@/v2/screens/b38-competitor-gap/Screen");
const { board38Fixture } = await import("@/v2/screens/b38-competitor-gap/fixture");
const { useBoard38Data } = await import("@/v2/screens/b38-competitor-gap/data");

function renderScreen(data: typeof board38Fixture = board38Fixture) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Board38Screen data={data} />
    </QueryClientProvider>,
  );
}

function renderAdapter() {
  function AdapterProbe() {
    const result = useBoard38Data();
    return (
      <div>
        <output data-testid="adapter-state">{result.state.kind}</output>
        {result.data ? (
          <>
            <output data-testid="adapter-brand">{result.data.brandName.kind}</output>
            <output data-testid="adapter-measurements">{result.data.measurements.length}</output>
            <output data-testid="adapter-competitors">{result.data.competitors.length}</output>
          </>
        ) : null}
      </div>
    );
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdapterProbe />
    </QueryClientProvider>,
  );
}

describe("Board 38 competitor gap screen", () => {
  it("renders the diagnostics tab strip with Competitor gap active", () => {
    renderScreen();
    const tab = screen.getByRole("tab", { name: "Competitor gap" });
    expect(tab.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("tab", { name: "Site health" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "GEO signals" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Perception" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Prompt diagnosis" })).toBeTruthy();
  });

  it("renders the performance table with the brand and every tracked competitor", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "Compare evidence across the same buyer questions" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PR performance comparison" })).toBeTruthy();
    const performancePanel = screen.getByTestId("b38-performance-panel");
    expect(within(performancePanel).getByText("VenturePR")).toBeTruthy();
    for (const name of ["Edelman", "Weber Shandwick", "Value 360", "Avian WE", "PR Newswire"]) {
      expect(within(performancePanel).getByText(name)).toBeTruthy();
    }
    // Recommendation rate is never in this backend's schema - every row
    // must show the honest state, never a fabricated percentage.
    expect(within(performancePanel).getAllByText("Not measured").length).toBeGreaterThanOrEqual(6);
  });

  it("renders gap rows with competitors cited, VenturePR absent, and a real evidence link", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Key question gaps" })).toBeTruthy();
    const question = screen.getByText("What are the best startup PR services in India?");
    const row = question.closest("tr");
    if (!row) throw new Error("Gap row not found");
    expect(within(row).getByText("Not cited")).toBeTruthy();
    expect(within(row).getByText("Edelman, Weber Shandwick")).toBeTruthy();
    const link = within(row).getByRole("link", { name: /View \d source/ });
    expect(link.getAttribute("href")).toBe(
      "/v2/visibility/questions/p1?brandId=brand-venture-pr&mode=expert",
    );
  });

  it("does not show a gap row for a question the brand already won", () => {
    renderScreen();
    expect(screen.queryByText("How do I measure PR ROI as a startup?")).toBeNull();
  });

  it("shows the excluded-question count for a tracked question with no measurements", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Excluded data" })).toBeTruthy();
    expect(
      screen.getByText(/1 tracked question had no successful answer in this scope/),
    ).toBeTruthy();
  });

  it("re-filters the gap table when the window scope control narrows", async () => {
    renderScreen();
    // Gap rows are clickable (onRowClick), so DataTable gives each one
    // role="button" rather than "row" - count those. Radix's Tabs only
    // activates on a full pointer sequence (userEvent), not a bare click.
    const gapPanel = screen.getByTestId("b38-gap-panel");
    const before = within(gapPanel).getAllByRole("button").length;
    await userEvent.click(screen.getByRole("tab", { name: "7D" }));
    const after = within(gapPanel).getAllByRole("button").length;
    expect(after).toBeLessThan(before);
  });

  it("creates a gap task for the top gap and shows the result", async () => {
    apiState.postCalls = [];
    apiState.postResponse = {
      status: 200,
      body: {
        success: true,
        data: { created: true, task: { title: 'Close the competitor gap on "p3"' } },
      },
    };
    renderScreen();

    const button = screen.getByRole("button", { name: "Create gap task" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/Created "/)).toBeTruthy());
    expect(apiState.postCalls).toHaveLength(1);
    expect(apiState.postCalls[0].url).toBe("/api/v2/competitor-gap/brand-venture-pr/tasks");
    expect(apiState.postCalls[0].body).toEqual({ brandPromptId: "p3" });
  });

  it("shows the server's honest message when no gap evidence exists for the frozen scope", async () => {
    apiState.postResponse = {
      status: 422,
      body: { success: false, error: "no_gap_evidence", message: "No competitor evidence exists." },
    };
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Create gap task" }));
    await waitFor(() => expect(screen.getByText("No competitor evidence exists.")).toBeTruthy());
  });
});

const validGetPayload = {
  success: true,
  data: {
    brand: { id: "brand-venture-pr", name: "VenturePR" },
    generatedAt: new Date().toISOString(),
    scope: { totalTrackedPrompts: 1, windowDaysFetched: 60, defaultWindowDays: 30, market: null },
    prompts: [
      { id: "p1", text: "What are the best startup PR services in India?", category: null },
    ],
    competitors: [{ id: "c-edelman", name: "Edelman", nameVariations: [] }],
    measurements: [
      {
        brandPromptId: "p1",
        aiPlatform: "ChatGPT",
        checkedAt: new Date().toISOString(),
        isCited: false,
        rank: null,
        mentionedBrands: [{ name: "Edelman", cited: true, rank: 1 }],
      },
    ],
    competitorMeasurements: [
      {
        competitorId: "c-edelman",
        brandPromptId: "p1",
        aiPlatform: "ChatGPT",
        checkedAt: new Date().toISOString(),
        isCited: true,
        rank: 1,
        citingOutletUrl: "https://www.edelman.com/insights/startup-pr",
        citationContext: "Edelman is cited.",
      },
    ],
  },
};

describe("Board 38 live adapter", () => {
  beforeEach(() => {
    apiState.error = undefined;
    apiState.getResponse = undefined;
  });

  it("maps the real competitor gap response", async () => {
    apiState.getResponse = validGetPayload;
    renderAdapter();

    expect(screen.getByTestId("adapter-state")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("ready"));
    expect(screen.getByTestId("adapter-brand")).toHaveTextContent("measured");
    expect(screen.getByTestId("adapter-measurements")).toHaveTextContent("1");
    expect(screen.getByTestId("adapter-competitors")).toHaveTextContent("1");
  });

  it("returns an honest empty state when no buyer questions are tracked", async () => {
    apiState.getResponse = {
      success: true,
      data: {
        ...validGetPayload.data,
        prompts: [],
        scope: { ...validGetPayload.data.scope, totalTrackedPrompts: 0 },
      },
    };
    renderAdapter();

    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("empty"));
  });

  it("returns a not-measured state when questions exist but no citation check has run", async () => {
    apiState.getResponse = { success: true, data: { ...validGetPayload.data, measurements: [] } };
    renderAdapter();

    await waitFor(() =>
      expect(screen.getByTestId("adapter-state")).toHaveTextContent("not-measured"),
    );
  });

  it("returns an error state when the request fails", async () => {
    apiState.error = new Error("competitor gap unavailable");
    renderAdapter();

    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("error"));
  });
});
