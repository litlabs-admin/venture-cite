// @vitest-environment happy-dom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkSummaryView } from "@/v2/data/workSummary";

const { writeLevelSeenMock } = vi.hoisted(() => ({ writeLevelSeenMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({ useBrandSelection: vi.fn() }));
vi.mock("@/v2/shell/useV2Mode", () => ({ useV2Mode: vi.fn() }));

vi.mock("@/v2/data/workSummary", async () => {
  const actual =
    await vi.importActual<typeof import("@/v2/data/workSummary")>("@/v2/data/workSummary");
  return { ...actual, useWorkSummary: vi.fn() };
});

vi.mock("@/v2/today/levelSeen", () => ({ writeLevelSeen: writeLevelSeenMock }));

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { useWorkSummary } from "@/v2/data/workSummary";
import { Board47Screen } from "@/v2/screens/b47-level-completion/Screen";
import { board47Fixture } from "@/v2/screens/b47-level-completion/fixture";
import { useBoard47Data } from "@/v2/screens/b47-level-completion/data";

const mockedUseBrandSelection = vi.mocked(useBrandSelection);
const mockedUseV2Mode = vi.mocked(useV2Mode);
const mockedUseWorkSummary = vi.mocked(useWorkSummary);

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-1",
    points: 320,
    pendingCount: 0,
    milestones: ["goal_selected_and_queue_reviewed", "baseline_ready"],
    currentLevel: { level: 3, name: "Improve", points: 320 },
    nextThreshold: { level: 4, name: "Decide", points: 480 },
    goal: { title: "g", statement: "s" },
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

function queryResult<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isPending: false, isError: false, ...overrides } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseBrandSelection.mockReturnValue({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "VenturePR" },
    brands: [{ id: "brand-1", name: "VenturePR" }],
    isLoading: false,
  } as never);
  mockedUseV2Mode.mockReturnValue({ mode: "guided", setMode: vi.fn() });
  mockedUseWorkSummary.mockReturnValue(queryResult(summary()));
});

describe("Board 47 level completion render", () => {
  it("confirms the real completed level and verified work points", () => {
    render(<Board47Screen data={board47Fixture} />);

    expect(screen.getByRole("heading", { name: "Level 3 complete" })).toBeInTheDocument();
    expect(screen.getByTestId("board47-metrics")).toHaveTextContent("320");
    expect(screen.getByTestId("board47-metrics")).toHaveTextContent("verified work points");
  });

  it("lists the real milestones achieved instead of an invented award ledger", () => {
    render(<Board47Screen data={board47Fixture} />);

    const list = screen.getByTestId("board47-milestone-list");
    for (const label of board47Fixture.completion.milestoneLabels) {
      expect(list).toHaveTextContent(label);
    }
  });

  it("names the real next level and links to Learn and My work", () => {
    render(<Board47Screen data={board47Fixture} />);

    expect(screen.getByText(/Level 4 · Decide unlocked/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to Level 4" })).toHaveAttribute(
      "href",
      "/v2/learn",
    );
    expect(screen.getByRole("link", { name: "Review completed work" })).toHaveAttribute(
      "href",
      "/v2/my-work",
    );
  });

  it("states plainly that completion carries no visibility reward", () => {
    render(<Board47Screen data={board47Fixture} />);

    expect(screen.getByText(/does not provide a visibility reward/)).toBeInTheDocument();
  });
});

describe("Board 47 live adapter", () => {
  // The hook's `writeLevelSeen` side effect only fires through React's real
  // effect scheduler, so this renders a tiny host component rather than
  // calling the hook as a plain function.
  function Host({ onResult }: { onResult: (r: ReturnType<typeof useBoard47Data>) => void }) {
    const result = useBoard47Data();
    onResult(result);
    return null;
  }

  it("maps the real level, points and milestones", () => {
    let captured: ReturnType<typeof useBoard47Data> | undefined;
    render(<Host onResult={(r) => (captured = r)} />);

    expect(captured?.state.kind).toBe("ready");
    expect(captured?.data?.completion.level).toBe(3);
    expect(captured?.data?.completion.verifiedWorkPoints).toBe(320);
    expect(captured?.data?.completion.milestoneLabels).toEqual([
      "Goal chosen and queue reviewed",
      "Measurement baseline recorded",
    ]);
    expect(captured?.data?.nextLevel).toEqual({ level: 4, name: "Decide" });
  });

  it("records the level as seen so a repeat visit does not re-show completion", () => {
    render(<Host onResult={() => {}} />);

    expect(writeLevelSeenMock).toHaveBeenCalledWith("brand-1", 3);
  });

  it("reports loading and error honestly", () => {
    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isPending: true }),
    );
    let captured: ReturnType<typeof useBoard47Data> | undefined;
    const { rerender } = render(<Host onResult={(r) => (captured = r)} />);
    expect(captured?.state.kind).toBe("loading");

    mockedUseWorkSummary.mockReturnValue(
      queryResult(undefined, { data: undefined, isError: true }),
    );
    rerender(<Host onResult={(r) => (captured = r)} />);
    expect(captured?.state.kind).toBe("error");
  });
});
