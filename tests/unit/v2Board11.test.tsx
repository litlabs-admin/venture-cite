// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Board11Screen } from "@/v2/screens/b11-prompt-diagnosis/Screen";
import { board11Fixture } from "@/v2/screens/b11-prompt-diagnosis/fixture";
import { useBoard11Data } from "@/v2/screens/b11-prompt-diagnosis/data";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "VenturePR" },
    brands: [{ id: "brand-1" }],
    isLoading: false,
  },
}));

const api = vi.hoisted(() => ({ handlers: new Map<string, () => unknown>() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children?: ReactNode; to?: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({ useBrandSelection: () => brandStub.value }));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: async (_method: string, url: string) => {
    for (const [fragment, handler] of api.handlers) {
      if (url.includes(fragment)) {
        const value = handler();
        if (value instanceof Error) throw value;
        return { json: async () => value };
      }
    }
    throw new Error(`unstubbed request: ${url}`);
  },
}));

describe("Board 11 prompt diagnosis", () => {
  it("renders the approved prompt diagnosis regions", () => {
    render(<Board11Screen data={board11Fixture} />);

    expect(screen.getByText("Find the cause. Choose a useful fix.")).toBeInTheDocument();
    expect(
      screen.getByText("Which PR service supports early-stage founders in India?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Brand omitted")).toBeInTheDocument();
    expect(screen.getByText("Services page retrieved")).toBeInTheDocument();
    expect(screen.getByText("Startup specialization unclear")).toBeInTheDocument();
    expect(screen.getByText("Approved buyer question · Comparison intent")).toBeInTheDocument();
    expect(screen.getByText("Hypothesis — needs testing")).toBeInTheDocument();
    expect(
      screen.getByText("Public relations services for growing businesses."),
    ).toBeInTheDocument();
    expect(screen.getByText("Source excerpt")).toBeInTheDocument();
    expect(screen.getByText("Recommended experiment")).toBeInTheDocument();
    expect(screen.getByText("Clarify who your service supports")).toBeInTheDocument();
    expect(screen.getByText("40 work points")).toBeInTheDocument();
    expect(screen.getByText("Failed (excluded)")).toBeInTheDocument();
    expect(screen.getByText("Sample answer records")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Perplexity")).toBeInTheDocument();
    expect(screen.getByText("Evidence boundaries")).toBeInTheDocument();
    expect(screen.getByText("No fault confirmed")).toBeInTheDocument();
  });

  it("renders state labels instead of unavailable values", () => {
    render(
      <Board11Screen
        data={{
          ...board11Fixture,
          source: {
            path: { kind: "not-measured", reason: "No source path was recorded." },
            excerpt: { kind: "failed", reason: "The source excerpt request failed." },
          },
          experiment: {
            title: { kind: "stale", value: "Old experiment", asOf: "2026-09-01" },
            points: { kind: "not-measured", reason: "No point award exists." },
            timing: { kind: "not-measured", reason: "No experiment timing exists." },
            action: { kind: "not-measured", reason: "Task creation is not available." },
          },
        }}
      />,
    );

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText("40 work points")).not.toBeInTheDocument();
    expect(screen.queryByText("/services")).not.toBeInTheDocument();
  });

  it("maps prompt and result responses through the live adapter", async () => {
    api.handlers.clear();
    api.handlers.set("/results", () => ({
      success: true,
      data: {
        byPrompt: [
          {
            promptId: "prompt-1",
            prompt: "Which PR service supports early-stage founders in India?",
            rationale: null,
            reportCount: 1,
            lastCheckedAt: "2026-09-08T10:00:00.000Z",
            platforms: [
              {
                platform: "ChatGPT",
                isCited: false,
                rank: null,
                snippet: "Recommended multiple PR agencies for startups in India.",
                fullResponse: "Recommended multiple PR agencies for startups in India.",
                checkedAt: "2026-09-08T10:00:00.000Z",
                reDetectedAt: null,
                citingOutletUrl: null,
                citingOutletName: null,
                citedUrls: ["https://venturepr.example/services"],
                sourceType: "first_party",
              },
            ],
          },
        ],
        byPlatform: [],
        totalChecks: 1,
        totalCited: 0,
        citationRate: 0,
        brandDomain: "venturepr.example",
      },
    }));
    api.handlers.set("/api/brand-facts/", () => ({ success: true, data: [] }));
    api.handlers.set("/work/tasks", () => ({
      success: true,
      data: { items: [], nextCursor: null },
    }));
    api.handlers.set("/api/brand-prompts/", () => ({
      success: true,
      data: [
        {
          id: "prompt-1",
          brandId: "brand-1",
          prompt: "Which PR service supports early-stage founders in India?",
          rationale: null,
          orderIndex: 0,
          status: "tracked",
          category: "Comparison",
          funnelStage: "bofu",
          paused: false,
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ],
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveProbe />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("v2-board11-live-ready")).toBeInTheDocument();
    expect(screen.getByTestId("v2-board11-live-ready")).toHaveTextContent(
      "Which PR service supports",
    );
    expect(screen.getByTestId("v2-board11-live-ready")).toHaveTextContent("Not measured");
    expect(screen.getByTestId("v2-board11-live-ready")).toHaveTextContent(
      "Recommended multiple PR agencies for startups in India.",
    );
  });

  it("returns loading while a required read is pending", () => {
    api.handlers.clear();
    api.handlers.set("/results", () => new Promise(() => {}));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveProbe />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("v2-board11-live-state")).toHaveTextContent("loading");
  });

  it("returns an error when an answer read fails", async () => {
    api.handlers.clear();
    api.handlers.set("/results", () => new Error("answer service failed"));
    api.handlers.set("/api/brand-facts/", () => ({ success: true, data: [] }));
    api.handlers.set("/work/tasks", () => ({
      success: true,
      data: { items: [], nextCursor: null },
    }));
    api.handlers.set("/api/brand-prompts/", () => ({ success: true, data: [] }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("v2-board11-live-state")).toHaveTextContent("error");
    });
  });

  it("switches evidence tabs and opens a full answer record", async () => {
    const user = userEvent.setup();
    render(<Board11Screen data={board11Fixture} />);

    await user.click(screen.getByRole("tab", { name: "Source URLs" }));
    expect(screen.getByTestId("v2-board11-source-urls")).toHaveTextContent(
      "No successful answer recorded a source URL",
    );
    await user.click(screen.getByRole("tab", { name: "Raw answers" }));
    await user.click(screen.getByText("ChatGPT"));
    expect(screen.getByTestId("v2-board11-full-answer")).toHaveTextContent("ChatGPT full answer");
  });
});

function LiveProbe() {
  const result = useBoard11Data();
  if (result.data) {
    const answer = result.data.answerRecords[0];
    return (
      <div data-testid="v2-board11-live-ready">
        {result.data.buyerQuestion.text}
        {result.data.experiment.title.kind === "not-measured" ? " Not measured" : ""}
        {answer?.fullResponse.kind === "measured" ? ` ${answer.fullResponse.value}` : ""}
      </div>
    );
  }
  return <div data-testid="v2-board11-live-state">{result.state.kind}</div>;
}
