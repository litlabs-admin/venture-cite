// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock getAccessToken before the hook is imported.
vi.mock("../../client/src/lib/authStore", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as never;

import { useSSEProgress } from "../../client/src/hooks/useSSEProgress";

describe("useSSEProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return a non-ok response so the hook exits cleanly.
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
  });

  it("calls fetch with Bearer auth header and correct stream URL when runId is provided", async () => {
    renderHook(() => useSSEProgress("run-1"));
    // Give the async IIFE a tick to fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/brand-fact-sheet/runs/run-1/stream"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("does not call fetch when runId is null", async () => {
    renderHook(() => useSSEProgress(null));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
