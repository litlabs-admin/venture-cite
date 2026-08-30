// @vitest-environment happy-dom
//
// B9 UI/UX audit root cause: client/src/lib/queryClient.ts had a MutationCache
// with a global onError toast, but no equivalent for queries. getQueryFn/
// apiRequest throw on every non-2xx response, yet nothing ever surfaced that
// throw for a plain useQuery call - the failure just sat in `isError`, unread,
// at every call site that didn't happen to check it (see
// client/src/components/dashboard-panels/useDashboardData.ts, which fed ~35
// dashboard panels straight from `.data` with no error branch at all).
//
// Fix: a QueryCache with the same onError shape as the existing
// MutationCache - fires a toast unless the query opts out via
// `meta.suppressErrorToast` (for a page that already renders its own inline
// ErrorState), and stays silent on 401 (session loss, handled by redirect).
//
// This test exercises the real queryClient against a query that always
// rejects, and asserts: the toast fires by default, and the opt-out meta
// suppresses it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

import { toast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

describe("queryClient - global query error toast", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
    queryClient.clear();
  });

  it("toasts when a query fails and no opt-out is set", async () => {
    await queryClient
      .fetchQuery({
        queryKey: ["test-query-fails"],
        queryFn: () => Promise.reject(new Error("boom")),
        retry: false,
      })
      .catch(() => {});

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Couldn't load the latest data",
      }),
    );
  });

  it("does not toast when the query opts out via meta.suppressErrorToast", async () => {
    await queryClient
      .fetchQuery({
        queryKey: ["test-query-fails-suppressed"],
        queryFn: () => Promise.reject(new Error("boom")),
        retry: false,
        meta: { suppressErrorToast: true },
      })
      .catch(() => {});

    expect(toast).not.toHaveBeenCalled();
  });

  it("does not toast on a 401 (session loss is handled by redirect, not a toast)", async () => {
    const err = Object.assign(new Error("401: unauthorized"), { status: 401 });
    await queryClient
      .fetchQuery({
        queryKey: ["test-query-401"],
        queryFn: () => Promise.reject(err),
        retry: false,
      })
      .catch(() => {});

    expect(toast).not.toHaveBeenCalled();
  });
});
