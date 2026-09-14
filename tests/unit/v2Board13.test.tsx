// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiState: { error?: Error; responses: Record<string, unknown> } = { responses: {} };

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
  apiRequest: async (_method: string, url: string) => {
    if (apiState.error) throw apiState.error;
    const key = url.includes("/probes/") ? "probes" : "perception";
    const payload = apiState.responses[key];
    if (payload === undefined) throw new Error(`Missing mocked response for ${key}`);
    return { json: async () => payload };
  },
}));

const { Board13Screen } = await import("@/v2/screens/b13-perception/Screen");
const { board13Fixture } = await import("@/v2/screens/b13-perception/fixture");
const { useBoard13Data } = await import("@/v2/screens/b13-perception/data");

function renderScreen(data: typeof board13Fixture = board13Fixture) {
  return render(<Board13Screen data={data} />);
}

function renderAdapter() {
  function AdapterProbe() {
    const result = useBoard13Data();
    const firstAnswer =
      result.data?.answers.kind === "measured" ? result.data.answers.value[0] : undefined;
    return (
      <div>
        <output data-testid="adapter-state">{result.state.kind}</output>
        {result.data ? (
          <>
            <output data-testid="adapter-brand">{result.data.brandName.kind}</output>
            <output data-testid="adapter-summary">{result.data.summary.kind}</output>
            {firstAnswer?.snippet.kind === "measured" ? (
              <output data-testid="adapter-answer">{firstAnswer.snippet.value}</output>
            ) : null}
            {firstAnswer?.sourceUrl.kind === "measured" ? (
              <output data-testid="adapter-source">{firstAnswer.sourceUrl.value}</output>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdapterProbe />
    </QueryClientProvider>,
  );
}

const perceptionPayload = {
  success: true,
  data: {
    trust: 70,
    quality: 72,
    value: null,
    market: 65,
    innovation: null,
    overall: 69,
    praised: ["Public relations"],
    questioned: ["Startup specialization"],
    evidenceCount: 4,
    model: "gpt-4o-mini",
    evidence: null,
    evidencePlatforms: null,
    axisNotes: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    history: [65, 69],
  },
};

const probesPayload = {
  success: true,
  data: {
    runId: "run-1",
    status: "succeeded",
    probesDone: 4,
    probesTotal: 4,
    startedAt: "2026-09-09T00:00:00.000Z",
    completedAt: "2026-09-09T00:00:00.000Z",
    errorMessage: null,
    probes: [
      {
        platform: "ChatGPT",
        axis: "trust",
        question: "How is VenturePR described?",
        status: "scored",
        answer: "VenturePR helps startups with media relations.",
        sources: [{ url: "https://chat.openai.com/" }],
        score: 75,
        noInformation: false,
        note: null,
        errorMessage: null,
      },
      {
        platform: "Gemini",
        axis: "trust",
        question: "How is VenturePR described?",
        status: "scored",
        answer: "VenturePR is based in India and works with startups.",
        sources: [{ url: "https://gemini.google.com/" }],
        score: 70,
        noInformation: false,
        note: null,
        errorMessage: null,
      },
      {
        platform: "Claude",
        axis: "trust",
        question: "How is VenturePR described?",
        status: "scored",
        answer: "VenturePR helps businesses with public relations.",
        sources: [{ url: "https://claude.ai/" }],
        score: 66,
        noInformation: false,
        note: null,
        errorMessage: null,
      },
      {
        platform: "Perplexity",
        axis: "trust",
        question: "How is VenturePR described?",
        status: "scored",
        answer: "VenturePR provides public relations for growing businesses.",
        sources: [{ url: "https://www.perplexity.ai/" }],
        score: 68,
        noInformation: false,
        note: null,
        errorMessage: null,
      },
    ],
  },
};

describe("Board 13 perception screen", () => {
  it("renders the fixture across the summary, evidence table, answer table, and rail", () => {
    renderScreen();

    expect(
      screen.getByRole("heading", { name: "Find the cause. Choose a useful fix." }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How AI answers describe VenturePR" })).toBeTruthy();
    expect(
      screen.getByText("Compare what AI says about your brand with your approved brand facts."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Perception summary" })).toBeTruthy();
    expect(screen.getByText("Accurate themes")).toBeTruthy();
    expect(screen.getByTestId("v2-b13-metric-accurateThemes")).toHaveTextContent("3");
    expect(screen.getByTestId("v2-b13-metric-missingThemes")).toHaveTextContent("2");
    expect(screen.getByText("Observed themes and evidence")).toBeTruthy();
    expect(screen.getByText("Startup specialization")).toBeTruthy();
    expect(screen.getByText("Focus on startups and high-growth companies.")).toBeTruthy();
    const selectedTheme = screen.getByText("Startup specialization").closest("tr");
    if (!selectedTheme) throw new Error("The selected theme row is missing.");
    expect(within(selectedTheme).getByText("Low", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Prioritize")).toBeTruthy();
    expect(screen.getByText("Raw answer evidence")).toBeTruthy();
    expect(screen.getByText("ChatGPT", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("https://chat.openai.com/…")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Evidence boundaries" })).toBeTruthy();
    expect(screen.getByText("Brand mentioned in 3 of 4 successful answers")).toBeTruthy();
    expect(screen.getByText("Why each model omitted or varied the brand")).toBeTruthy();
    expect(
      screen.getByText("Repeat the same question set after the next content change"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No causal claim" })).toBeTruthy();
    expect(screen.getByText("We avoid blame and focus on useful experiments.")).toBeTruthy();
  });

  it("renders an unavailable metric as Not measured instead of a number", () => {
    const data = structuredClone(board13Fixture);
    data.accurateThemes = { kind: "not-measured", reason: "No classification is stored." };

    renderScreen(data);

    const metric = screen.getByTestId("v2-b13-metric-accurateThemes");
    expect(within(metric).getByText("Not measured")).toBeTruthy();
    expect(within(metric).queryByText("3")).toBeNull();
  });

  it("renders a failed metric as Failed instead of a number", () => {
    const data = structuredClone(board13Fixture);
    data.conflictingClaims = { kind: "failed", reason: "The synthesis request failed." };

    renderScreen(data);

    const metric = screen.getByTestId("v2-b13-metric-conflictingClaims");
    expect(within(metric).getByText("Failed")).toBeTruthy();
    expect(within(metric).queryByText("1")).toBeNull();
  });
});

describe("Board 13 live adapter", () => {
  beforeEach(() => {
    apiState.error = undefined;
    apiState.responses = { perception: perceptionPayload, probes: probesPayload };
  });

  it("maps the real perception and probe response envelopes", async () => {
    renderAdapter();

    expect(screen.getByTestId("adapter-state")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("ready"));
    expect(screen.getByTestId("adapter-brand")).toHaveTextContent("measured");
    expect(screen.getByTestId("adapter-summary")).toHaveTextContent("not-measured");
    expect(screen.getByTestId("adapter-answer")).toHaveTextContent(
      "VenturePR helps startups with media relations.",
    );
    expect(screen.getByTestId("adapter-source")).toHaveTextContent("https://chat.openai.com/…");
  });

  it("returns an honest not-measured state when both endpoints have no run", async () => {
    apiState.responses = {
      perception: { success: true, data: null },
      probes: { success: true, data: null },
    };
    renderAdapter();

    await waitFor(() =>
      expect(screen.getByTestId("adapter-state")).toHaveTextContent("not-measured"),
    );
  });

  it("returns an error state when an endpoint fails", async () => {
    apiState.error = new Error("perception unavailable");
    renderAdapter();

    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("error"));
  });
});
