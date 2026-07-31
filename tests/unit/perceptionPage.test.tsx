// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The page renders router Links indirectly via dashboard-panel primitives and
// reads brand selection from a hook - stub both so this test is about payload
// handling and rendering, not navigation or brand-list plumbing.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "Acme Corp" },
    brands: [{ id: "brand-1", name: "Acme Corp" }],
    isLoading: false,
  }),
}));

import PerceptionPage from "@/pages/perception";

const QUERY_KEY = "/api/dashboard/perception/brand-1";
const RANKINGS_KEY = "/api/dashboard/rankings/brand-1";

function renderWithData(data: unknown, platforms: unknown[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData([QUERY_KEY], { success: true, data });
  qc.setQueryData([RANKINGS_KEY], { success: true, data: { platforms } });
  return render(
    <QueryClientProvider client={qc}>
      <PerceptionPage />
    </QueryClientProvider>,
  );
}

const fullyScored = {
  trust: 66.6,
  quality: 72.3,
  value: 50.0,
  market: 41.2,
  innovation: 80.9,
  overall: 62.2,
  praised: ["responsive support", "clear pricing"],
  questioned: ["onboarding friction"],
  evidenceCount: 187,
  model: "gpt-test",
  createdAt: new Date().toISOString(),
  history: [40, 50, 55, 62.2],
};

describe("PerceptionPage - fully scored", () => {
  it("renders the headline as an integer and axes with one decimal", () => {
    renderWithData(fullyScored);

    // Headline: Math.round(62.2) = 62, never "62.2". (The trend strip's last
    // bar also labels "62", so scope to the headline's own text class.)
    const headline = document.querySelector(".text-stat");
    expect(headline?.textContent).toBe("62");
    expect(screen.queryByText("62.2")).toBeNull();

    // Axes render with one decimal, matching the reference.
    expect(screen.getByText("66.6")).toBeTruthy();
    expect(screen.getByText("72.3")).toBeTruthy();
    expect(screen.getByText("50.0")).toBeTruthy();
    expect(screen.getByText("41.2")).toBeTruthy();
    expect(screen.getByText("80.9")).toBeTruthy();
  });

  it("shows evidence count and praised/questioned chips", () => {
    renderWithData(fullyScored);
    expect(screen.getByText(/187 excerpts cited/)).toBeTruthy();
    expect(screen.getByText("responsive support")).toBeTruthy();
    expect(screen.getByText("clear pricing")).toBeTruthy();
    expect(screen.getByText("onboarding friction")).toBeTruthy();
  });

  it("renders a 7-day change figure when history has an older point", () => {
    renderWithData(fullyScored);
    // change = 62.2 - 40 = +22.2
    expect(screen.getByText("+22.2")).toBeTruthy();
  });
});

describe("PerceptionPage - null axes", () => {
  it("skips null axes instead of rendering them as 0", () => {
    renderWithData({
      ...fullyScored,
      quality: null,
      market: null,
      overall: 55.0,
    });

    // Scored axes still show.
    expect(screen.getByText("66.6")).toBeTruthy();
    // Null axes must never render as "0.0".
    expect(screen.queryByText("0.0")).toBeNull();
    // And must show the dash primitive instead.
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("never renders a null overall as 0", () => {
    renderWithData({ ...fullyScored, overall: null });
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("PerceptionPage - never scored", () => {
  it("renders the empty state with no error", () => {
    renderWithData(null);
    expect(screen.getByText(/never been scored/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /re-score/i })).toBeTruthy();
  });
});

describe("PerceptionPage - single history point", () => {
  it("shows the tracking-started copy instead of a chart", () => {
    renderWithData({ ...fullyScored, history: [62.2] });
    expect(screen.getByText(/Tracking started/)).toBeTruthy();
    expect(screen.getByText(/your first score is 62.2/)).toBeTruthy();
    // With only one point, 7-day change also cannot be computed.
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("shows the same copy when history is empty", () => {
    renderWithData({ ...fullyScored, history: [] });
    expect(screen.getByText(/Tracking started/)).toBeTruthy();
  });
});

describe("PerceptionPage - hero rank/vs-average", () => {
  it("renders Rank and Vs Average as NoValue with explanatory captions", () => {
    renderWithData(fullyScored);
    expect(screen.getByText("No cross-account ranking data")).toBeTruthy();
    expect(screen.getByText("No benchmark data available")).toBeTruthy();
  });
});

describe("PerceptionPage - AI model breakdown", () => {
  it("shows an empty state with no platform data", () => {
    renderWithData(fullyScored, []);
    expect(screen.getByText(/No platform-level citation data yet/)).toBeTruthy();
  });

  it("renders per-platform citation counts, labelled as citations not perception", () => {
    renderWithData(fullyScored, [
      {
        aiPlatform: "ChatGPT",
        isLive: true,
        rank: null,
        citedCount: 0,
        totalCount: 5,
        visibilityScore: 0,
      },
      {
        aiPlatform: "Gemini",
        isLive: true,
        rank: 1,
        citedCount: 3,
        totalCount: 5,
        visibilityScore: 60,
      },
    ]);
    expect(screen.getByText("1 of 2 recognize you")).toBeTruthy();
    expect(screen.getByText("Doesn't recognize the brand")).toBeTruthy();
    expect(screen.getByText(/of 5 prompts cited/)).toBeTruthy();
  });
});

describe("PerceptionPage - partial payload does not throw", () => {
  it("renders without throwing when praised/questioned/history are missing", () => {
    const partial = {
      trust: 60,
      quality: null,
      value: null,
      market: null,
      innovation: null,
      overall: 60,
      evidenceCount: 5,
      model: null,
      createdAt: new Date().toISOString(),
    } as never;
    expect(() => renderWithData(partial)).not.toThrow();
  });
});
