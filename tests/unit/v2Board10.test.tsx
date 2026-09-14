// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board10Route } from "@/v2/screens/b10-results-review/Route";
import { Board10Screen } from "@/v2/screens/b10-results-review/Screen";
import { board10Fixture } from "@/v2/screens/b10-results-review/fixture";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Board10Route />
    </QueryClientProvider>,
  );
}

describe("Board 10 results review", () => {
  it("renders every major region from the approved review", () => {
    render(<Board10Screen data={board10Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Review the work and the result" }),
    ).toBeInTheDocument();
    expect(screen.getByText("26 Aug")).toBeInTheDocument();
    expect(screen.getByText("8 Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("Work completed")).toBeInTheDocument();
    expect(screen.getByText("2 verified changes")).toBeInTheDocument();
    expect(screen.getByText("18 / 40 mentions")).toBeInTheDocument();
    expect(screen.getByText("Business results")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What did you learn?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "The evidence is not yet conclusive" })).toBeChecked();
    expect(
      screen.getByDisplayValue(
        "Keep the updated services page. Review another comparable answer set before making further changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save results review" })).toBeInTheDocument();
    expect(screen.getByText("10 work points")).toBeInTheDocument();
    expect(screen.getByText(/Once per review period/)).toBeInTheDocument();
    expect(screen.getByText("View matching answers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Private brand progress" })).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Improve")).toBeInTheDocument();
    expect(screen.getByText("160 / 320 points")).toBeInTheDocument();
    expect(screen.getByText("Award history")).toBeInTheDocument();
    expect(screen.getByText("Essential facts approved")).toBeInTheDocument();
    expect(screen.getByText("Measurement limits")).toBeInTheDocument();
    expect(screen.getByText("Level 3 capability")).toBeInTheDocument();
  });

  it("renders an unavailable metric as Not measured instead of a number", () => {
    const data = {
      ...board10Fixture,
      review: {
        ...board10Fixture.review,
        mentions: { kind: "not-measured" },
        successfulAnswers: { kind: "not-measured" },
      },
    };

    render(<Board10Screen data={data} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("18 / 40 mentions")).not.toBeInTheDocument();
  });

  it("maps the real v2 response projections into the live screen", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let data: unknown;
      if (url.includes("mention-rate")) {
        data = {
          measured: 40,
          cited: 18,
          failed: 2,
          observed: 42,
          mentionRate: 45,
          weeks: [{ weekStart: "2026-09-07", cited: 18, measured: 40, failed: 2, mentionRate: 45 }],
        };
      } else if (url.includes("work/summary")) {
        data = {
          brandId: "brand-venture-pr",
          points: 160,
          pendingCount: 1,
          milestones: ["baseline_ready"],
          currentLevel: { level: 3, name: "Improve", points: 160 },
          nextThreshold: { level: 4, name: "Learn", points: 320 },
          goal: null,
          nextTask: null,
          waitingTasks: [],
          mode: "guided",
        };
      } else if (url.includes("taskType=approve_buyer_question_set")) {
        data = { items: [], nextCursor: null };
      } else if (url.includes("taskType=review_results_and_record_decision")) {
        data = { items: [], nextCursor: null };
      } else {
        data = { items: [], nextCursor: null };
      }
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(
      await screen.findByRole("heading", { name: "Review the work and the result" }),
    ).toBeInTheDocument();
    expect(screen.getByText("18 / 40 mentions")).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Improve")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns loading and error states through the route", async () => {
    const pending = vi.fn(async () => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", pending);
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
