// @vitest-environment happy-dom
//
// B9 UI/UX audit: useDashboardData fanned out to ~13 endpoints and only ever
// read `.data` from each - never `.isError`. A failed request (5xx, network
// error) produced the exact same `[]`/`null` shape as "brand genuinely has
// nothing yet", so every one of the ~10 dashboard panels this hook feeds
// silently showed "no data" instead of "couldn't load" on a real backend
// failure. That is the same zero-vs-error dishonesty the hook's own header
// comment says must never happen - it just wasn't wired through to this
// layer. See client/src/pages/home.tsx for the banner that now reads
// `hasError`/`retryFailed`.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const queryState = vi.hoisted(() => ({
  erroring: new Set<string>(),
  refetchCalls: [] as string[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    const isError = queryState.erroring.has(key);
    return {
      data: undefined,
      isLoading: false,
      isError,
      refetch: () => {
        queryState.refetchCalls.push(key);
      },
    };
  },
}));

const { useDashboardData } = await import("@/components/dashboard-panels/useDashboardData");

describe("useDashboardData - hasError / retryFailed", () => {
  it("reports hasError: false when every query succeeds (even with no data yet)", () => {
    queryState.erroring.clear();
    const { result } = renderHook(() => useDashboardData("brand-1"));
    expect(result.current.hasError).toBe(false);
  });

  it("reports hasError: true when any one underlying query fails", () => {
    queryState.erroring = new Set(["/api/dashboard/gap-matrix/brand-1"]);
    const { result } = renderHook(() => useDashboardData("brand-1"));
    expect(result.current.hasError).toBe(true);
    // The failure must not be laundered into an empty-but-fine gap matrix -
    // this is the exact fallback the bug hid behind.
    expect(result.current.gapRows).toEqual([]);
  });

  it("retryFailed() refetches only the queries that are currently erroring", () => {
    queryState.erroring = new Set([
      "/api/dashboard/hero/brand-1",
      "/api/hallucinations/stats/brand-1",
    ]);
    queryState.refetchCalls = [];
    const { result } = renderHook(() => useDashboardData("brand-1"));

    result.current.retryFailed();

    expect(queryState.refetchCalls).toContain("/api/dashboard/hero/brand-1");
    expect(queryState.refetchCalls).toContain("/api/hallucinations/stats/brand-1");
    // Nothing that wasn't failing should be refetched.
    expect(queryState.refetchCalls).not.toContain("/api/dashboard/rankings/brand-1");
  });
});
