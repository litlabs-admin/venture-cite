// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board36Route } from "@/v2/screens/b36-question-detail/Route";
import { Board36Screen } from "@/v2/screens/b36-question-detail/Screen";
import { board36Fixture } from "@/v2/screens/b36-question-detail/fixture";

const brandState = vi.hoisted(() => ({
  selectedBrandId: "brand-venture-pr",
  selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
  brands: [{ id: "brand-venture-pr" }],
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandState,
}));

const paramsState = vi.hoisted(() => ({ questionId: "prompt-1" }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useParams: () => paramsState };
});

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Board36Route />
    </QueryClientProvider>,
  );
}

describe("Board 36 buyer question detail", () => {
  it("renders every major region from the approved fixture", () => {
    render(<Board36Screen data={board36Fixture} />);

    expect(
      screen.getByRole("heading", {
        name: "Which PR service supports early-stage founders in India?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Question ID: Q-1042")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Performance trend" })).toBeInTheDocument();
    expect(screen.getAllByText("Mention rate").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Recommendation rate")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Answer records by engine" })).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top cited URLs" })).toBeInTheDocument();
    expect(screen.getByText("https://venturepr.co/services")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Competitors mentioned" })).toBeInTheDocument();
    expect(screen.getByText("Edelman")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Question health" })).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Diagnose result/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause measurement" })).toBeInTheDocument();
  });

  it("shows not-measured for the recommendation rate, never a fabricated number", () => {
    render(<Board36Screen data={board36Fixture} />);
    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(1);
  });

  it("maps the real question-detail endpoint into the live screen", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v2/visibility/questions/")) {
        const data = {
          question: {
            id: "prompt-1",
            text: "What services should I look for in a public relations firm?",
            status: "tracked",
            paused: false,
            category: "public relations",
            journeyStage: "Awareness",
            region: "global",
            createdAt: "2026-07-23T00:00:00.000Z",
          },
          trend: [{ weekStart: "2026-09-08", mentionRate: 50, citationRate: 25, failureRate: 5 }],
          metrics: { mentionCount: 5, citationCount: 2, failedCount: 1, attemptCount: 10 },
          engineRecords: [
            { engine: "ChatGPT", total: 5, answered: 4, mentioned: 2, cited: 1, failed: 1 },
          ],
          citedUrls: [],
          competitors: [],
        };
        return new Response(JSON.stringify({ success: true, data }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(
      await screen.findByRole("heading", {
        name: "What services should I look for in a public relations firm?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
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
