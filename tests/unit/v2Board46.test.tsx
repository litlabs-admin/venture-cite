// @vitest-environment happy-dom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({ useBrandSelection: vi.fn() }));
vi.mock("@/v2/shell/useV2Mode", () => ({ useV2Mode: vi.fn() }));

vi.mock("@/v2/data/visibilityTrend", async () => {
  const actual = await vi.importActual<typeof import("@/v2/data/visibilityTrend")>(
    "@/v2/data/visibilityTrend",
  );
  return { ...actual, useVisibilityMentionRate: vi.fn() };
});

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { useVisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { Board46Screen } from "@/v2/screens/b46-measurement-failure/Screen";
import { board46Fixture } from "@/v2/screens/b46-measurement-failure/fixture";
import { useBoard46Data } from "@/v2/screens/b46-measurement-failure/data";

const mockedUseBrandSelection = vi.mocked(useBrandSelection);
const mockedUseV2Mode = vi.mocked(useV2Mode);
const mockedUseVisibilityMentionRate = vi.mocked(useVisibilityMentionRate);

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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Board 46 measurement failure render", () => {
  it("shows the real failed-attempt count and the honest engine-detail gap", () => {
    render(<Board46Screen data={board46Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Some results need attention" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/4 of 42 attempts in the current window did not return an answer/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Which engine failed and why isn't recorded yet/)).toBeInTheDocument();
  });

  it("shows the last verified report with a Stale label when the data is stale", () => {
    render(<Board46Screen data={board46Fixture} />);

    expect(screen.getByText("Your last verified report")).toBeInTheDocument();
    expect(
      screen.getByTestId("board46-measurement-failure").querySelector('[data-state="stale"]'),
    ).toBeInTheDocument();
    expect(screen.getByText(/18 of 40 successful/)).toBeInTheDocument();
  });

  it("does not show a Stale label when the last observation is fresh", () => {
    const data = { ...board46Fixture, alert: { ...board46Fixture.alert, isStale: false } };
    render(<Board46Screen data={data} />);

    expect(
      screen.getByTestId("board46-measurement-failure").querySelector('[data-state="stale"]'),
    ).toBeNull();
  });

  it("links to real destinations, not a dead retry button", () => {
    render(<Board46Screen data={board46Fixture} />);

    expect(screen.getByRole("link", { name: "Review visibility results" })).toHaveAttribute(
      "href",
      "/v2/visibility/results",
    );
    expect(screen.getByRole("link", { name: "Review site health" })).toHaveAttribute(
      "href",
      "/v2/diagnostics/site-health",
    );
  });
});

describe("Board 46 live adapter", () => {
  it("derives staleness from the real latest observation date, not the query cache", () => {
    const weeks = [
      { weekStart: "2026-08-31", cited: 5, measured: 60, failed: 0, mentionRate: 8 },
    ] satisfies VisibilityMentionRate["weeks"];
    const trend: VisibilityMentionRate = {
      measured: 60,
      cited: 5,
      failed: 10,
      observed: 70,
      mentionRate: 8,
      weeks,
    };
    mockedUseVisibilityMentionRate.mockReturnValue(queryResult(trend));

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T00:00:00.000Z")); // 25 days after Aug 31
    const stale = useBoard46Data();
    expect(stale.data?.alert.isStale).toBe(true);

    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z")); // 2 days after Aug 31
    const fresh = useBoard46Data();
    expect(fresh.data?.alert.isStale).toBe(false);
    // isStale changed purely from the clock, not from a re-mocked query -
    // proof this does not come from React Query's own isStale flag.
    expect(mockedUseVisibilityMentionRate).toHaveBeenCalled();
  });

  it("reports the real aggregate failed and observed counts", () => {
    const trend: VisibilityMentionRate = {
      measured: 100,
      cited: 10,
      failed: 12,
      observed: 112,
      mentionRate: 10,
      weeks: [{ weekStart: "2026-09-01", cited: 10, measured: 100, failed: 12, mentionRate: 10 }],
    };
    mockedUseVisibilityMentionRate.mockReturnValue(queryResult(trend));

    const result = useBoard46Data();
    expect(result.data?.alert.failedCount).toBe(12);
    expect(result.data?.alert.observedCount).toBe(112);
  });

  it("reports loading and error honestly", () => {
    mockedUseVisibilityMentionRate.mockReturnValue(
      queryResult(undefined, { data: undefined, isPending: true }),
    );
    expect(useBoard46Data().state.kind).toBe("loading");

    mockedUseVisibilityMentionRate.mockReturnValue(
      queryResult(undefined, { data: undefined, isError: true }),
    );
    expect(useBoard46Data().state.kind).toBe("error");
  });
});
