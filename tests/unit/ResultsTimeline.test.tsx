// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ResultsTimeline from "@/components/dashboard/ResultsTimeline";

function renderWithBrands(brands: { createdAt: string }[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  qc.setQueryData(["/api/brands"], { success: true, data: brands });
  return render(
    <QueryClientProvider client={qc}>
      <ResultsTimeline />
    </QueryClientProvider>,
  );
}

describe("ResultsTimeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("highlights the correct milestone based on oldest brand age", () => {
    // Brand created 16 days ago → should be in "Week 2-3" milestone (>=14 days).
    const sixteenDaysAgo = new Date("2026-04-18T00:00:00Z").toISOString();
    renderWithBrands([{ createdAt: sixteenDaysAgo }]);
    // The 4 milestones all render.
    expect(screen.getByText(/day 0/i)).toBeInTheDocument();
    expect(screen.getByText(/week 1/i)).toBeInTheDocument();
    // "Week 2–3" uses an en-dash; match loosely.
    expect(screen.getByText(/week 2/i)).toBeInTheDocument();
    expect(screen.getByText(/week 4/i)).toBeInTheDocument();
    // Current-week indicator highlights Week 2-3.
    expect(screen.getByTestId("current-week")).toHaveTextContent(/week 2/i);
  });

  it("renders Day 0 when brand is brand-new (less than 7 days old)", () => {
    const justNow = new Date("2026-05-04T00:00:00Z").toISOString();
    renderWithBrands([{ createdAt: justNow }]);
    expect(screen.getByTestId("current-week")).toHaveTextContent(/day 0/i);
  });

  it("uses the OLDEST brand when multiple exist", () => {
    const recent = new Date("2026-05-01T00:00:00Z").toISOString(); // 3 days ago
    const old = new Date("2026-04-04T00:00:00Z").toISOString(); // 30 days ago
    renderWithBrands([{ createdAt: recent }, { createdAt: old }]);
    // 30 days ≈ Week 4+ (>=28 days threshold).
    expect(screen.getByTestId("current-week")).toHaveTextContent(/week 4/i);
  });
});
