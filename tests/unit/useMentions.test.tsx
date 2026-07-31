// @vitest-environment happy-dom
//
// Tests for useMentions hook.
// All 7 required scenarios from the Task 18 spec are covered:
//   1. mentions returns rows from mocked API
//   2. setFilter updates URL
//   3. loadMore calls fetchNextPage
//   4. updateStatus is optimistic (UI updates before mutation resolves)
//   5. deleteMention removes row optimistically + shows undo toast
//   6. startScan invalidates active-scans on success
//   7. manualAdd POSTs correct body

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mock TanStack Router's navigation hooks so we control search params.
//
// Partial mock via importOriginal: the module also exports createFileRoute and
// the route-tree machinery, and replacing the whole module would break any
// import chain that touches it.
//
// useSearch now returns a parsed OBJECT (src/router.tsx pins the router to
// string-in/string-out search params), where the old wouter shim returned a
// raw query STRING.
// ---------------------------------------------------------------------------

let _search: Record<string, string> = {};
const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigateMock,
  useSearch: () => _search,
}));

// ---------------------------------------------------------------------------
// Mock apiRequest
// ---------------------------------------------------------------------------

const apiRequestMock = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  isApiError: (err: unknown) => err instanceof Error && "status" in err,
}));

// ---------------------------------------------------------------------------
// Mock useToast
// ---------------------------------------------------------------------------

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ---------------------------------------------------------------------------
// Mock ToastAction (Radix UI won't render in happy-dom without a provider)
// ---------------------------------------------------------------------------

vi.mock("@/components/ui/toast", () => ({
  ToastAction: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    React.createElement("button", { onClick }, children),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRAND_ID = "brand-111";

function makeMention(id: string, status = "new") {
  return {
    id,
    brandId: BRAND_ID,
    platform: "reddit",
    sourceUrl: `https://reddit.com/r/test/comments/${id}`,
    sourceTitle: `Post ${id}`,
    mentionContext: "Sample context",
    sentiment: "neutral",
    sentimentScore: "0.50",
    engagementScore: null,
    authorUsername: null,
    isVerified: 0,
    status,
    mentionedAt: null,
    discoveredAt: new Date().toISOString(),
    metadata: null,
    mentionLocation: "post",
    linkStatus: "unknown",
    lastVerifiedAt: null,
    matchedVariation: null,
    matchedField: null,
    source: "scanner",
    scannerVersion: 2,
    sentimentSource: "llm",
    engagementNormalized: null,
  };
}

const DEFAULT_STATS = {
  total: 2,
  byPlatform: { reddit: 2 },
  bySentiment: { positive: 0, neutral: 2, negative: 0 },
  byStatus: { new: 2 },
};

function makePage(rows: ReturnType<typeof makeMention>[], nextCursor: string | null = null) {
  return { rows, nextCursor, stats: DEFAULT_STATS };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);

  return { wrapper, qc };
}

// ---------------------------------------------------------------------------
// Import hook after mocks are set up
// ---------------------------------------------------------------------------

import { useMentions } from "@/hooks/useMentions";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMentions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _search = {};

    // Default: GET /api/brand-mentions/{brandId} returns page 1
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes(`/api/brand-mentions/${BRAND_ID}`)) {
        return jsonResponse(makePage([makeMention("m1"), makeMention("m2")]));
      }
      if (method === "GET" && url.includes("/api/brand-mentions/scans/active")) {
        return jsonResponse({ rows: [] });
      }
      throw new Error(`Unexpected apiRequest: ${method} ${url}`);
    });
  });

  // -------------------------------------------------------------------------
  // 1. mentions returns rows from mocked API
  // -------------------------------------------------------------------------
  it("returns mentions rows from the list API", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.mentions).toHaveLength(2);
    expect(result.current.mentions[0].id).toBe("m1");
    expect(result.current.mentions[1].id).toBe("m2");
    expect(result.current.stats?.total).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 2. setFilter updates the URL
  // -------------------------------------------------------------------------
  it("setFilter updates URL query param", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setFilter("status", "new");
    });

    // Assert on the real navigate() call. setFilter passes `search` as an
    // UPDATER function (so unrelated params like brandId survive), which is
    // why this invokes the updater and checks what it actually produces -
    // a shallow toHaveBeenCalledWith could not see through the closure.
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true, search: expect.any(Function) }),
    );
    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({})).toEqual({ status: "new" });
    // Unrelated params must be preserved, not clobbered - dropping brandId
    // here would silently reset the user's brand selection.
    expect(call.search({ brandId: "b1" })).toEqual({ brandId: "b1", status: "new" });
  });

  // -------------------------------------------------------------------------
  // 3. loadMore calls fetchNextPage
  // -------------------------------------------------------------------------
  it("loadMore fetches the next page when there is one", async () => {
    // First call returns page 1 with a cursor
    let callCount = 0;
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes(`/api/brand-mentions/${BRAND_ID}`)) {
        callCount++;
        if (callCount === 1) {
          return jsonResponse(makePage([makeMention("m1")], "cursor-2"));
        }
        return jsonResponse(makePage([makeMention("m2")]));
      }
      if (method === "GET" && url.includes("/api/brand-mentions/scans/active")) {
        return jsonResponse({ rows: [] });
      }
      throw new Error(`Unexpected: ${method} ${url}`);
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.mentions).toHaveLength(2));
    expect(callCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 4. updateStatus is optimistic
  // -------------------------------------------------------------------------
  it("updateStatus updates UI optimistically before server responds", async () => {
    let patchResolve: () => void;
    const patchPromise = new Promise<void>((res) => {
      patchResolve = res;
    });

    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes(`/api/brand-mentions/${BRAND_ID}`)) {
        return jsonResponse(makePage([makeMention("m1", "new"), makeMention("m2", "new")]));
      }
      if (method === "GET" && url.includes("/api/brand-mentions/scans/active")) {
        return jsonResponse({ rows: [] });
      }
      if (method === "PATCH" && url.includes("/api/brand-mentions/m1")) {
        // Delay the server response
        await patchPromise;
        return jsonResponse({ success: true });
      }
      throw new Error(`Unexpected: ${method} ${url}`);
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.mentions).toHaveLength(2));

    act(() => {
      result.current.updateStatus("m1", "acknowledged");
    });

    // Optimistic update should appear immediately, before patchPromise resolves
    await waitFor(() => {
      const m1 = result.current.mentions.find((m) => m.id === "m1");
      expect(m1?.status).toBe("acknowledged");
    });

    // Resolve the server call
    patchResolve!();
  });

  // -------------------------------------------------------------------------
  // 5. deleteMention removes row optimistically + shows undo toast
  // -------------------------------------------------------------------------
  it("deleteMention removes the row optimistically and shows an undo toast", async () => {
    // Hold the DELETE response so we can verify optimistic state mid-flight,
    // then return a list without m1 from the subsequent GET refetch.
    let deleteResolve!: () => void;
    const deleteHeld = new Promise<void>((res) => {
      deleteResolve = res;
    });
    let listCallCount = 0;

    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes(`/api/brand-mentions/${BRAND_ID}`)) {
        listCallCount++;
        // First fetch: both rows. Subsequent fetches (post-delete): only m2.
        const rows =
          listCallCount === 1 ? [makeMention("m1"), makeMention("m2")] : [makeMention("m2")];
        return jsonResponse(makePage(rows));
      }
      if (method === "GET" && url.includes("/api/brand-mentions/scans/active")) {
        return jsonResponse({ rows: [] });
      }
      if (method === "DELETE" && url.includes("/api/brand-mentions/m1")) {
        await deleteHeld; // hold until we've verified the optimistic state
        return jsonResponse({ success: true });
      }
      throw new Error(`Unexpected: ${method} ${url}`);
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.mentions).toHaveLength(2));

    // Trigger delete (does NOT await - we want to inspect mid-flight)
    act(() => {
      result.current.deleteMention("m1");
    });

    // Optimistic removal should be visible immediately (before server responds)
    await waitFor(() => {
      expect(result.current.mentions.find((m) => m.id === "m1")).toBeUndefined();
    });

    // Now let the DELETE resolve so onSuccess / onSettled runs
    deleteResolve();

    // Undo toast fired (onSuccess)
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    const toastCall = toastMock.mock.calls[0][0];
    expect(toastCall.title).toBe("Mention deleted");
    // action element exists (undo)
    expect(toastCall.action).toBeDefined();
    expect(toastCall.duration).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // 6. startScan invalidates active-scans on success
  // -------------------------------------------------------------------------
  it("startScan invalidates the active-scans query on success", async () => {
    let activeScansCallCount = 0;

    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes(`/api/brand-mentions/${BRAND_ID}`)) {
        return jsonResponse(makePage([]));
      }
      if (method === "GET" && url.includes("/api/brand-mentions/scans/active")) {
        activeScansCallCount++;
        return jsonResponse({ rows: [] });
      }
      if (method === "POST" && url.includes("/api/brand-mentions/scans/")) {
        return jsonResponse({ scanId: "scan-123" });
      }
      throw new Error(`Unexpected: ${method} ${url}`);
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = activeScansCallCount;

    await act(async () => {
      result.current.startScan();
    });

    // After success, active-scans should be refetched (invalidated)
    await waitFor(() => expect(activeScansCallCount).toBeGreaterThan(callsBefore));

    expect(apiRequestMock).toHaveBeenCalledWith("POST", `/api/brand-mentions/scans/${BRAND_ID}`);
  });

  // -------------------------------------------------------------------------
  // 7. manualAdd POSTs correct body
  // -------------------------------------------------------------------------
  it("manualAdd sends POST with brandId, platform, and sourceUrl", async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes(`/api/brand-mentions/${BRAND_ID}`)) {
        return jsonResponse(makePage([]));
      }
      if (method === "GET" && url.includes("/api/brand-mentions/scans/active")) {
        return jsonResponse({ rows: [] });
      }
      if (method === "POST" && url === "/api/brand-mentions") {
        return jsonResponse({ success: true });
      }
      throw new Error(`Unexpected: ${method} ${url}`);
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentions(BRAND_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.manualAdd({
        platform: "hackernews",
        sourceUrl: "https://news.ycombinator.com/item?id=12345",
      });
    });

    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/brand-mentions", {
      brandId: BRAND_ID,
      platform: "hackernews",
      sourceUrl: "https://news.ycombinator.com/item?id=12345",
    });
  });
});
