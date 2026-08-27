// @vitest-environment happy-dom
//
// The dashboard needs to distinguish "we are still building this brand" from
// "this brand is finished and genuinely has no data". Those render identically
// today (dashes and "not scanned yet"), which is why a brand created minutes
// ago looks broken.
//
// The risk in this hook is not what it displays - it is the polling contract:
//   - a finished brand must STOP polling, or every open dashboard tab polls
//     forever for a run that ended
//   - only genuinely in-flight statuses count as activating, or the banner
//     lies in one direction or the other
//   - a failed status must NOT read as "still working", because the user needs
//     to know the dashboard is not going to fill itself in

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const apiRequestMock = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  isApiError: () => false,
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

const { useBrandActivation, activationPhaseLabel } = await import("@/hooks/useBrandActivation");

const BRAND = "brand-1";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function mockStatus(status: string, progress: Record<string, unknown> = {}) {
  apiRequestMock.mockResolvedValue({
    json: async () => ({
      success: true,
      data: { status, step: 0, progress, error: null, startedAt: null, completedAt: null },
    }),
  });
}

async function renderFor(status: string) {
  mockStatus(status);
  const { result } = renderHook(() => useBrandActivation(BRAND), { wrapper });
  await waitFor(() => expect(result.current.status).toBe(status));
  return result;
}

describe("useBrandActivation", () => {
  beforeEach(() => apiRequestMock.mockReset());

  it.each(["pending", "scraping_facts", "generating_prompts", "running_citations"])(
    "treats %s as still activating",
    async (status) => {
      const result = await renderFor(status);
      expect(result.current.isActivating).toBe(true);
      expect(result.current.hasFailed).toBe(false);
    },
  );

  it("does not treat a completed brand as activating", async () => {
    // The banner must disappear once the pipeline is done - the dashboard's
    // ordinary empty states are correct and truthful from then on.
    const result = await renderFor("completed");
    expect(result.current.isActivating).toBe(false);
    expect(result.current.hasFailed).toBe(false);
  });

  it("reports failure distinctly rather than as ongoing work", async () => {
    // "Still working" and "stopped early" need opposite user responses.
    const result = await renderFor("failed");
    expect(result.current.isActivating).toBe(false);
    expect(result.current.hasFailed).toBe(true);
  });

  it("does not treat an idle brand as activating", async () => {
    const result = await renderFor("idle");
    expect(result.current.isActivating).toBe(false);
  });

  it("makes no request without a brandId", () => {
    renderHook(() => useBrandActivation(null), { wrapper });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("calls the same endpoint welcome.tsx already polls", async () => {
    // A path typo here is a silent 404 that shows up only as a banner that
    // never appears.
    await renderFor("running_citations");
    expect(apiRequestMock).toHaveBeenCalledWith("GET", `/api/onboarding/autopilot-status/${BRAND}`);
  });

  it("labels every in-flight phase with distinct human copy", () => {
    const labels = ["pending", "scraping_facts", "generating_prompts", "running_citations"].map(
      (s) => activationPhaseLabel(s as never),
    );
    expect(new Set(labels).size).toBe(labels.length);
    labels.forEach((l) => expect(l.length).toBeGreaterThan(0));
  });
});
