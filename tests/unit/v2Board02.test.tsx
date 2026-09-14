// @vitest-environment happy-dom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkSummaryView, WorkTaskSummaryView } from "@/v2/data/workSummary";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children?: React.ReactNode;
    to?: string;
    search?: Record<string, unknown>;
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? {})} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: vi.fn(),
}));

vi.mock("@/v2/data/workSummary", async () => {
  const actual =
    await vi.importActual<typeof import("@/v2/data/workSummary")>("@/v2/data/workSummary");
  return {
    ...actual,
    useWorkSummary: vi.fn(),
    useAssignedTasks: vi.fn(),
  };
});

vi.mock("@/v2/data/visibilityTrend", async () => {
  const actual = await vi.importActual<typeof import("@/v2/data/visibilityTrend")>(
    "@/v2/data/visibilityTrend",
  );
  return {
    ...actual,
    useVisibilityMentionRate: vi.fn(),
  };
});

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useAssignedTasks, useWorkSummary } from "@/v2/data/workSummary";
import { useVisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { Board02Screen } from "@/v2/screens/b02-today-earlier/Screen";
import { board02Fixture } from "@/v2/screens/b02-today-earlier/fixture";
import { mapBoard02Data, useBoard02Data } from "@/v2/screens/b02-today-earlier/data";

const mockedUseBrandSelection = vi.mocked(useBrandSelection);
const mockedUseWorkSummary = vi.mocked(useWorkSummary);
const mockedUseAssignedTasks = vi.mocked(useAssignedTasks);
const mockedUseVisibilityMentionRate = vi.mocked(useVisibilityMentionRate);

function task(overrides: Partial<WorkTaskSummaryView> = {}): WorkTaskSummaryView {
  return {
    id: "task-1",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "repair-service-region",
    taskVersion: 1,
    type: "repair_confirmed_access_or_factual_fault",
    state: "suggested",
    revision: 0,
    title: "Correct the outdated service description",
    desiredResult: "The public page agrees with the approved facts.",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Publish the approved service region.",
    reason: "Your approved facts and the published page disagree.",
    confidence: 0.9,
    effort: 15,
    points: 40,
    nextCheckAt: null,
    ownerId: null,
    ownerName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-venture-pr",
    points: 120,
    pendingCount: 2,
    milestones: ["goal_selected_and_queue_reviewed", "baseline_ready"],
    currentLevel: { level: 2, name: "Ready", points: 60 },
    nextThreshold: { level: 3, name: "Improve", points: 160 },
    goal: {
      title: "Accurate information",
      statement: "Help buyers find accurate information about VenturePR",
    },
    nextTask: task(),
    waitingTasks: [
      task({ id: "task-w", title: "Crawler access repaired", state: "waiting_for_observation" }),
    ],
    mode: "guided",
    ...overrides,
  };
}

const trend: VisibilityMentionRate = {
  measured: 40,
  cited: 18,
  failed: 2,
  observed: 42,
  mentionRate: 45,
  weeks: [{ weekStart: "2026-08-26", cited: 18, measured: 40, failed: 2, mentionRate: 45 }],
};

function queryResult<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    isStale: false,
    dataUpdatedAt: Date.parse("2026-09-08T10:24:00.000Z"),
    ...overrides,
  } as never;
}

function setReadyQueries() {
  mockedUseBrandSelection.mockReturnValue({
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr", name: "VenturePR" }],
    isLoading: false,
  });
  mockedUseWorkSummary.mockReturnValue(queryResult(summary()));
  mockedUseAssignedTasks.mockReturnValue(
    queryResult({
      items: [
        task(),
        task({ id: "task-2", title: "Improve your buyer guide" }),
        task({ id: "task-3", title: "Review the latest results", points: 10 }),
      ],
      nextCursor: null,
    }),
  );
  mockedUseVisibilityMentionRate.mockReturnValue(queryResult(trend));
}

beforeEach(() => {
  vi.clearAllMocks();
  setReadyQueries();
});

describe("Board 02 Today earlier render", () => {
  it("renders the earlier task wording, waiting copy, and measured sample", () => {
    render(<Board02Screen data={board02Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Make your next improvement count" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Goal: Help buyers find accurate information about VenturePR"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Correct the outdated service description" }),
    ).toBeInTheDocument();
    expect(screen.getByText("40 work points")).toBeInTheDocument();
    expect(screen.getByText("Confirmed factual conflict")).toBeInTheDocument();
    expect(screen.getByText("15 min estimated effort")).toBeInTheDocument();
    expect(
      screen.getByText("Your approved facts and the published page disagree."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review evidence" })).toBeInTheDocument();
    expect(screen.getByText("Improve your buyer guide")).toBeInTheDocument();
    expect(screen.getByText("Review the latest results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Observed visibility" })).toBeInTheDocument();
    // Board02's range control always says "Last 14 days" on both its options
    // (a fixed label, not a week count), so this is deliberately AllBy: two
    // <option>s legitimately carry the same text.
    expect(screen.getAllByText("Last 14 days").length).toBeGreaterThan(0);
    expect(screen.getByTestId("board02-visibility")).toHaveTextContent(
      "Brand mentioned in 18 of 40 successful test answers · 45%",
    );
    expect(
      screen.getByText("4 engines · 10 questions · 2 failed answers excluded"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getByText("Level 2 · Ready")).toBeInTheDocument();
    expect(screen.getByText("120 work points")).toBeInTheDocument();
    expect(screen.getByText("Next: Level 3 · Improve")).toBeInTheDocument();
    expect(screen.getByTestId("board02-progress-rail")).toHaveTextContent(
      "40 points and 2 verified changes required",
    );
    expect(screen.getByText("1 of 2 changes verified")).toBeInTheDocument();
    expect(
      screen.getByText("Visibility impact is measured after the next observation window."),
    ).toBeInTheDocument();
    expect(screen.getByText("Visibility impact is not yet measured.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Observed visibility over time" })).toBeInTheDocument();
  });

  it("labels an unavailable visibility value without printing the fixture rate", () => {
    const data = {
      ...board02Fixture,
      visibility: { kind: "not-measured", reason: "A measurement has not completed." } as const,
    };
    render(<Board02Screen data={data} />);

    const visibility = screen.getByTestId("board02-visibility");
    expect(within(visibility).getByText("Not measured")).toBeInTheDocument();
    expect(visibility.textContent).not.toContain("45%");
  });

  it("carries the current brand and mode on in-screen links", () => {
    render(<Board02Screen data={board02Fixture} />);

    for (const link of screen.getAllByRole("link")) {
      expect(JSON.parse(link.getAttribute("data-search") ?? "{}")).toMatchObject({
        brandId: "brand-venture-pr",
        mode: "guided",
      });
    }
  });
});

describe("Board 02 live adapter", () => {
  it("maps the shared API projections into the earlier fixture shape", () => {
    const data = mapBoard02Data(
      summary(),
      {
        items: [
          task(),
          task({ id: "task-2", title: "Improve your buyer guide" }),
          task({ id: "task-3", title: "Review the latest results", points: 10 }),
        ],
        nextCursor: null,
      },
      trend,
      "VenturePR",
    );

    expect(data.variant).toBe("board02");
    expect(data.priorityTask.title.value).toBe("Correct the outdated service description");
    expect(data.visibility.kind).toBe("measured");
    expect(data.progress.workPoints.value).toBe(120);
    expect(data.progress.verifiedChanges.kind).toBe("not-measured");
  });

  it("returns loading and error states from the work queries", () => {
    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isPending: true }),
    );
    expect(useBoard02Data().state.kind).toBe("loading");

    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isError: true }),
    );
    expect(useBoard02Data().state.kind).toBe("error");
  });
});
