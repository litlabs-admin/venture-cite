import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Polls /api/brands/:brandId/citation-runs/active. Used as a status gate by
// every dependent page — when `hasActive` is true, those pages bump their
// dependent queries onto a 6 s refetch interval (via useCitationLiveRefresh).
//
// Wave 9 idle-aware backoff: a brand that's not running anything still mounts
// this hook on every dependent page. With ~6 dependent hooks on screen, a
// fixed 8 s poll = 45 req/min/user of pure overhead. We back off after
// consecutive empty polls and pause completely when the tab is hidden.
//
//   First 5 empty polls   → 8 s
//   Next 5 empty polls    → 30 s
//   Beyond that           → 60 s
//   First non-empty poll  → reset to 8 s
//   Tab hidden            → paused
//
// TanStack dedupes by query key, so all pages on the same brand share one
// underlying poll regardless of how many hooks call this.
//
// Wave 9.2: empty-streak counter is module-scoped, keyed by brandId. Was
// per-component (`useRef`); the home page calls this hook 7+ times via
// useDashboardQueries observers, each with its own ref → each maintaining
// its own backoff schedule. TanStack dedupes the *fetch* but the polling
// cadence is decided per-observer, so one fast hook (just-mounted,
// streak=0) keeps every other observer fast too. Module-scope sharing
// aligns the cadence and roughly halves idle poll volume on pages with
// multiple consumers.

export type ActiveCitationRun = {
  id: string;
  startedAt: string; // ISO
  progressPct: number;
  status: "pending" | "running";
};

const POLL_FAST_MS = 8_000;
const POLL_MED_MS = 30_000;
const POLL_SLOW_MS = 60_000;

const emptyStreaks = new Map<string, number>();

export function useActiveCitationRuns(brandId: string | null) {
  const query = useQuery<{ success: boolean; data: { runs: ActiveCitationRun[] } }>({
    queryKey: ["/api/brands", brandId, "citation-runs/active"],
    queryFn: async () => {
      if (!brandId) throw new Error("no brandId");
      const r = await apiRequest("GET", `/api/brands/${brandId}/citation-runs/active`);
      const json = (await r.json()) as { success: boolean; data: { runs: ActiveCitationRun[] } };
      const runs = json.data?.runs ?? [];
      // Update the module-scoped streak for this brand. All hook
      // instances on the same brand share the count, so cadence is
      // consistent across the page's observers.
      if (runs.length === 0) {
        emptyStreaks.set(brandId, (emptyStreaks.get(brandId) ?? 0) + 1);
      } else {
        emptyStreaks.set(brandId, 0);
      }
      return json;
    },
    enabled: !!brandId,
    refetchInterval: () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      const streak = brandId ? (emptyStreaks.get(brandId) ?? 0) : 0;
      if (streak >= 10) return POLL_SLOW_MS;
      if (streak >= 5) return POLL_MED_MS;
      return POLL_FAST_MS;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const runs = query.data?.data.runs ?? [];
  return {
    ...query,
    runs,
    hasActive: runs.length > 0,
  };
}
