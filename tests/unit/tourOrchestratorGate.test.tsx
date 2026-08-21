// @vitest-environment happy-dom
//
// REGRESSION GUARD for the bug that made the guided tour reappear on every
// page load: TourOrchestrator evaluated eligibility before /api/tours/state
// had resolved. useTourState yields `{}` until then, and an empty state is
// indistinguishable from "this user has never seen any tour".
//
// A production incident showed repeated tour starts after the user skipped
// the tour. The PATCH succeeded, but the next eligibility check ran before
// the application loaded the stored state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { TourState } from "@/tours/types";

const runTour = vi.fn(() => ({ cancel: vi.fn() }));
const tourState = vi.fn();

vi.mock("@/tours/engine/shepherdAdapter", () => ({ runTour }));
vi.mock("@/hooks/useTourState", () => ({
  useTourState: () => tourState(),
  useTourStatePatch: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u-1", isAdmin: 0 } }),
}));
vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "b-1", selectedBrand: { name: "Acme" } }),
}));
vi.mock("@/tours/engine/featureFlag", () => ({ isTourEngineEnabled: () => true }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/dashboard",
}));
// One brand, so global-welcome is actually eligible. Its trigger now requires
// counts.brands >= 1 - FirstRunGate's own condition for not redirecting to
// /welcome - and with no data at all the tour is correctly suppressed, which
// would make this file pass for the wrong reason. The subject here is the
// STATE gate (does a tour fire before persisted state has loaded), not
// eligibility, so the fixture has to clear eligibility first.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { data: [{ id: "b-1" }] } }),
}));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

const { TourOrchestrator } = await import("@/tours/engine/TourOrchestrator");

// The exact production row.
const dismissed: TourState = { global: { v: 2, skippedAt: "2026-07-29T19:18:01.391Z" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TourOrchestrator waits for persisted state before firing", () => {
  it("fires nothing while /api/tours/state is still in flight", () => {
    tourState.mockReturnValue({ state: {}, isLoading: true, isReady: false });
    render(<TourOrchestrator />);
    // Before the fix this fired global-welcome immediately: `state` is `{}`
    // and the intro step has no DOM target, so it painted at once.
    expect(runTour).not.toHaveBeenCalled();
  });

  it("fires nothing when the state query FAILED (isLoading false, no data)", () => {
    // A 401 on a lapsed session or an offline reload settles the query with
    // no data. `!isLoading` would read as authoritative here; isReady does not.
    tourState.mockReturnValue({ state: {}, isLoading: false, isReady: false });
    render(<TourOrchestrator />);
    expect(runTour).not.toHaveBeenCalled();
  });

  it("does not re-fire a tour the user already dismissed", () => {
    tourState.mockReturnValue({ state: dismissed, isLoading: false, isReady: true });
    render(<TourOrchestrator />);
    const fired = runTour.mock.calls.map(
      ([o]) => (o as unknown as { config: { id: string } }).config.id,
    );
    expect(fired).not.toContain("global-welcome");
  });

  it("still fires a genuinely unseen tour once state has loaded", () => {
    tourState.mockReturnValue({ state: {}, isLoading: false, isReady: true });
    render(<TourOrchestrator />);
    const fired = runTour.mock.calls.map(
      ([o]) => (o as unknown as { config: { id: string } }).config.id,
    );
    expect(fired).toContain("global-welcome");
  });
});
