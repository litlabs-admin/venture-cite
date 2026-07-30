// @vitest-environment happy-dom
//
// REGRESSION GUARD: the Mentions KPI tile must not report "0" for a brand
// nobody has scanned.
//
// The mention scan is opt-in — `brands.monitor_mentions` gates the weekly cron
// (scheduler.ts: listBrandsWithMentionMonitoring) and otherwise it runs on
// demand from Monitor › Mentions. So "never scanned" is the normal starting
// state for a brand, not an edge case. Measured on the live database: 265
// mentions exist across 6 brands, but every brand carrying them has
// monitor_mentions = false — they were populated by manual scans (67 completed
// manual scan jobs vs 12 cron ones).
//
// The list endpoint returns `rows: []` both for "scanned, found nothing" and
// "never looked", so the tile rendered a confident `0 · last 7 days` for a
// measurement that had never been taken — the "a dash is never a zero" rule
// inverted.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { KpiStrip } from "@/components/dashboard-panels/KpiStrip";

const base = {
  visibility: 45,
  visibilityDelta: 1,
  citationsThisWeek: 55,
  loading: false,
  ownRank: 1,
  trackedBrands: 14,
  leaderboardLoading: false,
  hallucinations: null,
  hallucinationsLoading: false,
  listicles: null,
  listiclesLoading: false,
  mentionsTruncated: false,
  mentionsScanLoading: false,
};

describe("Mentions KPI tile", () => {
  it("shows a dash and names the missing step when no scan has ever run", () => {
    render(<KpiStrip {...base} mentions7d={null} mentionsScanned={false} />);

    expect(screen.getByText("run a scan")).toBeTruthy();
    // The tile must not claim a count.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows 0 only once a scan has completed and genuinely found nothing", () => {
    render(<KpiStrip {...base} mentions7d={0} mentionsScanned />);

    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("last 7 days")).toBeTruthy();
    expect(screen.queryByText("run a scan")).toBeNull();
  });

  it("renders a real count after a scan", () => {
    render(<KpiStrip {...base} mentions7d={12} mentionsScanned />);

    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("last 7 days")).toBeTruthy();
  });

  it("marks a capped count as approximate rather than exact", () => {
    render(<KpiStrip {...base} mentions7d={200} mentionsScanned mentionsTruncated />);

    // "200+" — a capped count is never shown as a precise number.
    expect(
      screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "200+"),
    ).toBeTruthy();
  });
});
