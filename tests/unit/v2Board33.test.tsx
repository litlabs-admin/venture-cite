// @vitest-environment happy-dom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/use-brand-selection", () => ({ useBrandSelection: vi.fn() }));
vi.mock("@/v2/shell/useV2Mode", () => ({ useV2Mode: vi.fn() }));

vi.mock("@/v2/data/workSummary", async () => {
  const actual =
    await vi.importActual<typeof import("@/v2/data/workSummary")>("@/v2/data/workSummary");
  return { ...actual, useWorkSummary: vi.fn() };
});

vi.mock("@/v2/data/visibilityTrend", async () => {
  const actual = await vi.importActual<typeof import("@/v2/data/visibilityTrend")>(
    "@/v2/data/visibilityTrend",
  );
  return { ...actual, useVisibilityMentionRate: vi.fn() };
});

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { useWorkSummary } from "@/v2/data/workSummary";
import { useVisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { Board33Screen } from "@/v2/screens/b33-baseline-review/Screen";
import { board33Fixture } from "@/v2/screens/b33-baseline-review/fixture";
import { useBoard33Data } from "@/v2/screens/b33-baseline-review/data";
import { GOAL_CATALOG } from "@/v2/screens/b33-baseline-review/goalCatalog";

const mockedUseBrandSelection = vi.mocked(useBrandSelection);
const mockedUseV2Mode = vi.mocked(useV2Mode);
const mockedUseWorkSummary = vi.mocked(useWorkSummary);
const mockedUseVisibilityMentionRate = vi.mocked(useVisibilityMentionRate);

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-1",
    points: 0,
    pendingCount: 1,
    milestones: ["baseline_ready"],
    currentLevel: { level: 1, name: "Start", points: 0 },
    nextThreshold: { level: 2, name: "Ready", points: 160 },
    goal: null,
    nextTask: {
      id: "task-1",
      brandId: "brand-1",
      goalId: null,
      taskKey: "repair-1",
      taskVersion: 1,
      type: "repair_confirmed_access_or_factual_fault",
      state: "suggested",
      revision: 0,
      title: "Correct the service description",
      desiredResult: "The public page agrees with the approved facts.",
      buyerNeed: null,
      recommendedChange: "Your approved service region is India.",
      reason: "Most engines mention the brand, but citations are low.",
      confidence: null,
      effort: 15,
      points: 40,
      nextCheckAt: null,
      ownerId: null,
      ownerName: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    },
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

const weeks = [
  { weekStart: "2026-09-05", cited: 18, measured: 40, failed: 6, mentionRate: 45 },
] satisfies VisibilityMentionRate["weeks"];

const trend: VisibilityMentionRate = {
  measured: 40,
  cited: 18,
  failed: 6,
  observed: 46,
  mentionRate: 45,
  weeks,
};

function queryResult<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isPending: false, isError: false, ...overrides } as never;
}

function setReadyQueries() {
  mockedUseBrandSelection.mockReturnValue({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "VenturePR" },
    brands: [{ id: "brand-1", name: "VenturePR" }],
    isLoading: false,
  } as never);
  mockedUseV2Mode.mockReturnValue({ mode: "guided", setMode: vi.fn() });
  mockedUseWorkSummary.mockReturnValue(queryResult(summary()));
  mockedUseVisibilityMentionRate.mockReturnValue(queryResult(trend));
}

beforeEach(() => {
  vi.clearAllMocks();
  setReadyQueries();
});

describe("Board 33 baseline review render", () => {
  it("renders all four goal cards and requires a selection before starting", () => {
    render(<Board33Screen data={board33Fixture} />);

    const cards = screen.getAllByTestId("board33-goal-card");
    expect(cards).toHaveLength(GOAL_CATALOG.length);
    for (const entry of GOAL_CATALOG) {
      expect(screen.getByText(entry.title)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Choose goal and start" })).toBeDisabled();
  });

  it("saves the goal the viewer selected when they press start", async () => {
    const onChooseGoal = vi.fn();
    render(<Board33Screen data={board33Fixture} onChooseGoal={onChooseGoal} />);

    const secondGoal = GOAL_CATALOG[1];
    const card = screen.getByText(secondGoal.title).closest("button");
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    const startButton = screen.getByRole("button", { name: "Choose goal and start" });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);

    expect(onChooseGoal).toHaveBeenCalledWith(secondGoal.key);
  });

  it("labels missing engine and buyer-journey breakdowns honestly instead of a zeroed chart", () => {
    render(<Board33Screen data={board33Fixture} />);

    expect(screen.getByText(/Per-engine and buyer-journey-stage results/)).toBeInTheDocument();
  });

  it("shows a saving state and a real error message when the write fails", () => {
    render(<Board33Screen data={board33Fixture} isSavingGoal saveGoalError="try again" />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
    expect(screen.getByText("try again")).toBeInTheDocument();
  });
});

describe("Board 33 live adapter", () => {
  it("maps the real baseline totals and recommended task", () => {
    const result = useBoard33Data();

    expect(result.state.kind).toBe("ready");
    expect(result.data?.baseline.mentionCount).toEqual({ kind: "measured", value: 18 });
    expect(result.data?.baseline.mentionDenominator).toEqual({ kind: "measured", value: 40 });
    expect(result.data?.baseline.failedCount).toEqual({ kind: "measured", value: 6 });
    expect(result.data?.recommendedTask?.title).toEqual({
      kind: "measured",
      value: "Correct the service description",
    });
    expect(result.data?.progress.level).toBe(1);
    expect(result.data?.progress.nextLevelPoints).toBe(160);
  });

  it("reports loading and error honestly", () => {
    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isPending: true }),
    );
    expect(useBoard33Data().state.kind).toBe("loading");

    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isError: true }),
    );
    expect(useBoard33Data().state.kind).toBe("error");
  });
});
