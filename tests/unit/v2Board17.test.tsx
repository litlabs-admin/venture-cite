// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { WorkTaskSummaryView } from "@/v2/data/workSummary";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { Board17Route } from "@/v2/screens/b17-experiment/Route";
import { Board17Screen, type Board17Data } from "@/v2/screens/b17-experiment/Screen";
import { board17Fixture } from "@/v2/screens/b17-experiment/fixture";
import { mapBoard17Data } from "@/v2/screens/b17-experiment/data";

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

function task(overrides: Partial<WorkTaskSummaryView> = {}): WorkTaskSummaryView {
  return {
    id: "task-experiment",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "experiment:bofu:services",
    taskVersion: 1,
    type: "complete_visibility_experiment",
    state: "waiting_for_observation",
    revision: 1,
    title: "Run a visibility experiment on the published page",
    desiredResult: "Compare the successful citation runs before and after publication.",
    buyerNeed: null,
    recommendedChange: "Compare the successful citation runs before and after publication.",
    reason: "A published page sits between two completed citation runs.",
    confidence: null,
    effort: 15,
    points: 50,
    nextCheckAt: "2026-09-16T00:00:00.000Z",
    ownerId: null,
    ownerName: null,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

const reviewTask = task({
  id: "task-review",
  taskKey: "review:results",
  type: "review_results_and_record_decision",
  state: "suggested",
  points: 10,
  title: "Review the next measurement",
});

const mentionRate: VisibilityMentionRate = {
  measured: 42,
  cited: 21,
  failed: 2,
  observed: 44,
  mentionRate: 50,
  weeks: [
    {
      weekStart: "2026-08-29",
      cited: 18,
      measured: 40,
      failed: 1,
      mentionRate: 45,
    },
    {
      weekStart: "2026-09-05",
      cited: 21,
      measured: 42,
      failed: 1,
      mentionRate: 50,
    },
  ],
};

function renderScreen(data: Board17Data = board17Fixture) {
  return render(
    <div className="v2-mono">
      <Board17Screen data={data} />
    </div>,
  );
}

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <Board17Route />
      </QueryClientProvider>,
    ),
  };
}

function stubFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return new Response(
        JSON.stringify({ success: false, error: "Experiment data unavailable" }),
        {
          status: 503,
        },
      );
    }

    const url = String(input);
    const body = url.includes("/work/tasks")
      ? url.includes("review_results_and_record_decision")
        ? { items: [reviewTask], nextCursor: null }
        : { items: [task()], nextCursor: null }
      : { success: true, data: mentionRate };
    return new Response(
      JSON.stringify(url.includes("/work/tasks") ? { success: true, data: body } : body),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board17Screen", () => {
  it("renders every experiment region from the approved fixture", () => {
    renderScreen();

    expect(
      screen.getByRole("heading", {
        name: "Test whether clearer service evidence improves answers",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1. Baseline complete")).toBeInTheDocument();
    expect(screen.getByText("2. Change verified")).toBeInTheDocument();
    expect(screen.getByText("3. Observation active")).toBeInTheDocument();
    expect(screen.getByText("Experiment details")).toBeInTheDocument();
    expect(screen.getByText("40 questions (customer, product, comparison)")).toBeInTheDocument();
    expect(screen.getByText("Visibility comparison")).toBeInTheDocument();
    expect(screen.getByTestId("b17-current-mentions")).toHaveTextContent("21 / 40");
    expect(screen.getByTestId("b17-baseline-mentions")).toHaveTextContent("18 / 40");
    expect(screen.getByText("Too early to conclude")).toBeInTheDocument();
    expect(screen.getByText("Experiment log")).toBeInTheDocument();
    expect(screen.getByText("Evidence limits")).toBeInTheDocument();
    expect(screen.getByText("Confounding changes")).toBeInTheDocument();
    expect(screen.getByText("Review next measurement")).toBeDisabled();
  });

  it("renders an unavailable value as its state label instead of a number", () => {
    const data: Board17Data = {
      ...board17Fixture,
      experiment: {
        ...board17Fixture.experiment,
        currentMentions: { kind: "not-measured", reason: "No experiment result exists." },
      },
    };

    renderScreen(data);

    expect(screen.getByTestId("b17-current-mentions")).toHaveTextContent("Not measured");
    expect(screen.getByTestId("b17-current-mentions")).not.toHaveTextContent("21 / 40");
  });

  it("maps the real task and mention-rate projections without inventing experiment fields", () => {
    const data = mapBoard17Data({
      brandId: "brand-venture-pr",
      brandName: "VenturePR",
      tasks: [task()],
      reviewTask,
      mentionRate,
    });

    expect(data.brand.name).toEqual({ kind: "measured", value: "VenturePR" });
    expect(data.nextMeasurement.workPoints).toEqual({ kind: "measured", value: 10 });
    expect(data.sourceObservation).toEqual({ kind: "measured", value: mentionRate });
    expect(data.experiment.currentMentions.kind).toBe("not-measured");
    expect(data.experiment.baselineMentions.kind).toBe("not-measured");
  });
});

describe("Board17Route live states", () => {
  it("shows loading while the board requests are pending", () => {
    stubFetch({ pending: true });
    renderRoute();

    expect(screen.getByTestId("v2-state-loading")).toBeInTheDocument();
  });

  it("shows an error state when the board request fails", async () => {
    stubFetch({ fail: true });
    renderRoute();

    expect(await screen.findByTestId("v2-state-error")).toBeInTheDocument();
    expect(screen.getByText("Experiment data unavailable")).toBeInTheDocument();
  });

  it("renders the live brand and point value after the projections load", async () => {
    stubFetch();
    renderRoute();

    expect(await screen.findByTestId("b17-brand-name")).toHaveTextContent("VenturePR");
    expect(screen.getByTestId("b17-work-points")).toHaveTextContent("10 points");
    expect(screen.getByTestId("b17-current-mentions")).toHaveTextContent("Not measured");
  });
});
