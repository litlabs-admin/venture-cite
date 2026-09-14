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
import { Board01Screen } from "@/v2/screens/b01-today/Screen";
import { board01Fixture } from "@/v2/screens/b01-today/fixture";
import { useBoard01Data, mapBoard01Data } from "@/v2/screens/b01-today/data";

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
    title: "Correct the service description",
    desiredResult: "The public page agrees with the approved facts.",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Your approved service region is India.",
    reason: "Your services page says worldwide.",
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

const weeks = [
  { weekStart: "2026-08-26", cited: 12, measured: 40, failed: 0, mentionRate: 30 },
  { weekStart: "2026-08-27", cited: 12, measured: 40, failed: 0, mentionRate: 30 },
  { weekStart: "2026-08-28", cited: 14, measured: 40, failed: 0, mentionRate: 36 },
  { weekStart: "2026-08-29", cited: 15, measured: 40, failed: 0, mentionRate: 37 },
  { weekStart: "2026-08-30", cited: 15, measured: 40, failed: 0, mentionRate: 37 },
  { weekStart: "2026-08-31", cited: 18, measured: 40, failed: 0, mentionRate: 45 },
  { weekStart: "2026-09-01", cited: 18, measured: 40, failed: 0, mentionRate: 46 },
  { weekStart: "2026-09-02", cited: 18, measured: 40, failed: 0, mentionRate: 44 },
  { weekStart: "2026-09-03", cited: 18, measured: 40, failed: 0, mentionRate: 46 },
  { weekStart: "2026-09-04", cited: 17, measured: 40, failed: 0, mentionRate: 42 },
  { weekStart: "2026-09-05", cited: 15, measured: 40, failed: 0, mentionRate: 38 },
  { weekStart: "2026-09-06", cited: 14, measured: 40, failed: 0, mentionRate: 36 },
  { weekStart: "2026-09-07", cited: 16, measured: 40, failed: 0, mentionRate: 40 },
  { weekStart: "2026-09-08", cited: 18, measured: 40, failed: 2, mentionRate: 45 },
] satisfies VisibilityMentionRate["weeks"];

const trend: VisibilityMentionRate = {
  measured: 560,
  cited: 231,
  failed: 2,
  observed: 562,
  mentionRate: 41,
  weeks,
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
        task({ id: "task-3", title: "Review recent results", points: 10 }),
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

describe("Board 01 Today render", () => {
  it("renders every approved Today region and its key values", () => {
    render(<Board01Screen data={board01Fixture} />);

    expect(screen.getByRole("heading", { name: "Your next useful step" })).toBeInTheDocument();
    expect(
      screen.getByText("Goal: Help buyers find accurate information about VenturePR"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Correct the service description" }),
    ).toBeInTheDocument();
    expect(screen.getByText("40 work points")).toBeInTheDocument();
    expect(screen.getByText("Confirmed fact conflict")).toBeInTheDocument();
    expect(screen.getByText("About 15 minutes")).toBeInTheDocument();
    expect(screen.getByText("Your services page says worldwide.")).toBeInTheDocument();
    expect(screen.getByText("Your approved service region is India.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review evidence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Why this task?" })).toBeInTheDocument();
    expect(screen.getByText("Improve your buyer guide")).toBeInTheDocument();
    expect(screen.getByText("Review recent results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Observed visibility" })).toBeInTheDocument();
    expect(screen.getByText("Aug 26 – Sep 8, 2026")).toBeInTheDocument();
    expect(screen.getByTestId("board01-visibility")).toHaveTextContent(
      "Brand mentioned in 18 of 40 successful test answers · 45%",
    );
    expect(
      screen.getByText("Latest sample: 40 successful answers · 2 failed attempts"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getByText("Level 2 · Ready")).toBeInTheDocument();
    expect(screen.getByText("120 / 160 work points")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("To reach Level 3 · Improve")).toBeInTheDocument();
    expect(screen.getByText("Earn 40 more points")).toBeInTheDocument();
    expect(screen.getByText("Verify 1 more change")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 changes verified")).toBeInTheDocument();
    expect(screen.getByText("Waiting for observation")).toBeInTheDocument();
    expect(screen.getByText("Crawler access repaired")).toBeInTheDocument();
    expect(screen.getByText("Work points do not measure visibility.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Observed visibility over time" })).toBeInTheDocument();
  });

  it("carries the current brand and mode on in-screen links", () => {
    render(<Board01Screen data={board01Fixture} />);

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(JSON.parse(link.getAttribute("data-search") ?? "{}")).toMatchObject({
        brandId: "brand-venture-pr",
        mode: "guided",
      });
    }
  });

  it("labels an unavailable visibility value without printing a number", () => {
    const data = {
      ...board01Fixture,
      visibility: { kind: "not-measured", reason: "No valid observation exists yet." } as const,
    };
    render(<Board01Screen data={data} />);

    const visibility = screen.getByTestId("board01-visibility");
    expect(within(visibility).getAllByText("Not measured")).not.toHaveLength(0);
    expect(visibility.querySelector('[data-state="not-measured"]')).toBeInTheDocument();
    expect(visibility.textContent).not.toContain("45%");
    expect(
      within(visibility).queryByRole("img", { name: "Observed visibility over time" }),
    ).toBeNull();
  });
});

describe("Board 01 live adapter", () => {
  it("maps the work and visibility projections into the screen contract", () => {
    const data = mapBoard01Data(
      summary(),
      {
        items: [
          task(),
          task({ id: "task-2", title: "Improve your buyer guide" }),
          task({ id: "task-3", title: "Review recent results", points: 10 }),
        ],
        nextCursor: null,
      },
      trend,
      "VenturePR",
    );

    expect(data.brand.name).toBe("VenturePR");
    expect(data.priorityTask.title.value).toBe("Correct the service description");
    expect(data.progress.workPoints.value).toBe(120);
    expect(data.progress.nextLevelPoints.value).toBe(160);
    expect(data.visibility.kind).toBe("measured");
    if (data.visibility.kind === "measured") {
      expect(data.visibility.mentioned).toBe(18);
      expect(data.visibility.measured).toBe(40);
      expect(data.visibility.failed).toBe(2);
    }
  });

  it("returns loading, error, stale, and not-measured states honestly", () => {
    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isPending: true }),
    );
    expect(useBoard01Data().state.kind).toBe("loading");

    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isError: true }),
    );
    expect(useBoard01Data().state.kind).toBe("error");

    mockedUseWorkSummary.mockReturnValue(
      queryResult(summary(), {
        isStale: true,
        dataUpdatedAt: Date.parse("2026-09-07T10:24:00.000Z"),
      }),
    );
    const stale = useBoard01Data();
    expect(stale.state.kind).toBe("stale");
    if (stale.state.kind === "stale") expect(stale.state.asOf).toBe("2026-09-07T10:24:00.000Z");

    mockedUseVisibilityMentionRate.mockReturnValue(
      queryResult({ ...trend, weeks: [] }, { data: { ...trend, weeks: [] } }),
    );
    const notMeasured = useBoard01Data();
    expect(notMeasured.data?.visibility.kind).toBe("not-measured");
  });
});
