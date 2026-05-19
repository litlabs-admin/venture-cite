// client/src/lib/monitorQueries.ts
//
// One-stop data hook for the Visibility canvas. Wraps useDashboardQueries
// and the active-runs gate so MonitorVisibility's sections can subscribe to
// a single source. Mirrors /act's pattern of having a single composable
// query layer behind the canvas.

import { useDashboardQueries } from "@/hooks/useDashboardQueries";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { useCitationLiveRefresh } from "@/hooks/useCitationLiveRefresh";

export function useVisibilityQueries(brandId: string | null) {
  // `useCitationLiveRefresh` accepts a nullable brandId. The query keys still
  // include the (possibly null) id — they're only used for the one-shot
  // invalidation when a run finishes, and the underlying useQueries all gate
  // on `enabled = !!brandId` so no fetch fires while brandId is null.
  const { refetchInterval } = useCitationLiveRefresh(brandId, [
    [`/api/dashboard/hero/${brandId}`],
    [`/api/dashboard/rankings/${brandId}`],
    [`/api/dashboard/gap-matrix/${brandId}`],
    [`/api/dashboard/entity-strength/${brandId}`],
    [`/api/dashboard/citation-trend/${brandId}`],
    [`/api/competitors/leaderboard?brandId=${brandId}`],
    ["/api/brand-mentions", brandId, { platform: "reddit" }],
  ]);

  const { runs: activeRuns } = useActiveCitationRuns(brandId);
  const since = activeRuns[0]?.startedAt ?? null;

  const queries = useDashboardQueries(brandId ?? "", refetchInterval, since);
  return { ...queries, activeRuns, since };
}
