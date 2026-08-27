// @vitest-environment happy-dom
//
// Regression test for "I have to reload the page to see generated prompts".
//
// Prompt generation is SYNCHRONOUS - the endpoint returns the saved rows - so
// there is no polling involved. The bug was purely a React Query cache-key
// mismatch: useGeneratePrompts wrote its result into promptKeys.list, but the
// tables on both surfaces (citations/PromptsTab and prompts/PromptsPageBody)
// render promptKeys.listAll. The `listAll` entry therefore kept serving its
// pre-generation (empty) value until a manual reload.
//
// These tests pin the cache contract rather than the implementation: after a
// successful generate, the key the TABLE reads must no longer be stale. That
// holds whether the fix invalidates or writes through.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const apiRequestMock = vi.fn();
const invalidateSpy = vi.fn();
const setQueryDataSpy = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  isApiError: (err: unknown) => err instanceof Error && "status" in err,
  queryClient: {
    invalidateQueries: (...args: unknown[]) => invalidateSpy(...args),
    setQueryData: (...args: unknown[]) => setQueryDataSpy(...args),
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

const { useGeneratePrompts, promptKeys } = await import("@/hooks/usePrompts");

const BRAND_ID = "brand-abc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Did any invalidateQueries / setQueryData call target this exact key? */
function touched(key: readonly unknown[]): boolean {
  const target = JSON.stringify(key);
  const fromInvalidate = invalidateSpy.mock.calls.some(
    (c) => JSON.stringify((c[0] as any)?.queryKey) === target,
  );
  const fromSet = setQueryDataSpy.mock.calls.some((c) => JSON.stringify(c[0]) === target);
  return fromInvalidate || fromSet;
}

describe("useGeneratePrompts cache invalidation", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    invalidateSpy.mockReset();
    setQueryDataSpy.mockReset();
    apiRequestMock.mockResolvedValue({
      json: async () => ({ success: true, data: [{ id: "p1", prompt: "best X for Y" }] }),
    });
  });

  it("refreshes the listAll key the tables actually render", async () => {
    // THE REGRESSION. Before the fix this key was never touched, so the table
    // kept showing its pre-generation state until the user hit reload.
    const { result } = renderHook(() => useGeneratePrompts(BRAND_ID), { wrapper });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(touched(promptKeys.listAll(BRAND_ID))).toBe(true);
  });

  it("also refreshes the plain list key", async () => {
    const { result } = renderHook(() => useGeneratePrompts(BRAND_ID), { wrapper });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(touched(promptKeys.list(BRAND_ID))).toBe(true);
  });

  it("refreshes suggestions too, since generating changes the suggested set", async () => {
    const { result } = renderHook(() => useGeneratePrompts(BRAND_ID), { wrapper });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(touched(promptKeys.suggestions(BRAND_ID))).toBe(true);
  });

  it("touches no cache keys when the server reports failure", async () => {
    // A failed generate must not blow away good cached data.
    apiRequestMock.mockResolvedValue({
      json: async () => ({ success: false, error: "generation failed" }),
    });
    const { result } = renderHook(() => useGeneratePrompts(BRAND_ID), { wrapper });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });
});
