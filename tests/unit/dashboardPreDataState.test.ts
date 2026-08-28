// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { HeroData } from "@/components/dashboard-panels/useDashboardData";

const queryState = vi.hoisted(() => ({
  hero: undefined as { success: boolean; data: HeroData } | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => ({
    data: options.queryKey[0] === "/api/dashboard/hero/brand-1" ? queryState.hero : undefined,
    isLoading: false,
  }),
}));

const { useDashboardData } = await import("@/components/dashboard-panels/useDashboardData");

describe("useDashboardData measurement state", () => {
  it("reports a completed citation scan as measured", () => {
    queryState.hero = {
      success: true,
      data: {
        visibilityScore: 40,
        visibilityDelta: null,
        citedChecks: 4,
        totalChecks: 10,
        citationRate: 40,
        lastScanAt: "2026-05-12T00:00:00.000Z",
      },
    };

    const { result } = renderHook(() => useDashboardData("brand-1"));

    expect(result.current.hasMeasured).toBe(true);
  });
});
