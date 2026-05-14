// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useScrapeOrchestration } from "../../client/src/hooks/useScrapeOrchestration";
import React from "react";

// Mock getAccessToken so apiRequest can build the Authorization header.
vi.mock("../../client/src/lib/authStore", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as never;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useScrapeOrchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.endsWith("/plan")) {
        return new Response(
          JSON.stringify({
            success: true,
            runId: "run-1",
            pages: [
              { pageId: "p1", url: "https://example.com/" },
              { pageId: "p2", url: "https://example.com/about" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u.includes("/scrape-one")) {
        return new Response(JSON.stringify({ success: true, factCount: 1, status: "done" }), {
          status: 200,
        });
      }
      if (u.includes("/search-llm")) {
        return new Response(JSON.stringify({ success: true, factCount: 1, status: "done" }), {
          status: 200,
        });
      }
      if (u.includes("/user-enrich")) {
        return new Response(JSON.stringify({ success: true, factCount: 1, status: "done" }), {
          status: 200,
        });
      }
      if (u.endsWith("/aggregate")) {
        return new Response(JSON.stringify({ success: true, status: "completed", totalFacts: 3 }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
  });

  it("fires plan, then scrape-one × N + search-llm + user-enrich in parallel, then aggregate", async () => {
    const { result } = renderHook(() => useScrapeOrchestration(), { wrapper });
    await act(async () => {
      await result.current.start("brand-1");
    });

    const calls = fetchMock.mock.calls.map((c) =>
      typeof c[0] === "string" ? c[0] : c[0]?.toString(),
    );
    expect(calls.some((u) => u?.endsWith("/plan"))).toBe(true);
    expect(calls.filter((u) => u?.includes("/scrape-one")).length).toBe(2);
    expect(calls.some((u) => u?.includes("/search-llm"))).toBe(true);
    expect(calls.some((u) => u?.includes("/user-enrich"))).toBe(true);
    expect(calls.some((u) => u?.endsWith("/aggregate"))).toBe(true);

    const aggregateIdx = calls.findIndex((u) => u?.endsWith("/aggregate"));
    const scrapeOneIdxs = calls
      .map((u, i) => (u?.includes("/scrape-one") ? i : -1))
      .filter((i) => i >= 0);
    expect(Math.max(...scrapeOneIdxs)).toBeLessThan(aggregateIdx);

    await waitFor(() => {
      expect(result.current.status).toBe("completed");
    });
    expect(result.current.totalFacts).toBe(3);
  });

  it("returns plan failure as the orchestration result", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.endsWith("/plan")) {
        return new Response(
          JSON.stringify({
            code: "cooldown",
            error: "cooldown active",
            unlockAtMs: Date.now() + 60_000,
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("unreachable", { status: 500 });
    });
    const { result } = renderHook(() => useScrapeOrchestration(), { wrapper });
    await act(async () => {
      await result.current.start("brand-1");
    });
    expect(result.current.status).toBe("plan_failed");
    expect(result.current.planError?.code).toBe("cooldown");
  });
});
