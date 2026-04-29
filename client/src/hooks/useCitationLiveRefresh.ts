import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useActiveCitationRuns } from "./useActiveCitationRuns";

// Wave 9 fix: TanStack Query merges `refetchInterval` defaults at observer
// creation time, not on already-mounted observers. The previous incarnation
// of this hook called `queryClient.setQueryDefaults(...)` after a run started
// — which silently did nothing for any page already on screen, so dependent
// dashboards never auto-refreshed during a run.
//
// New contract: this hook returns the polling cadence the caller threads
// directly into each `useQuery({ refetchInterval })`. While `hasActive` is
// true, dependent queries refetch every 6 s. When it flips back to false
// we fire one invalidation per provided key so the page picks up the final
// post-run aggregates immediately. Brand-switch mid-run also fires the
// invalidate (the previous hook missed this case).

const REFETCH_MS_WHILE_ACTIVE = 6_000;

export function useCitationLiveRefresh(
  brandId: string | null,
  queryKeys: QueryKey[],
): { hasActive: boolean; refetchInterval: number | false } {
  const { hasActive } = useActiveCitationRuns(brandId);
  const queryClient = useQueryClient();
  const prevRef = useRef<{ hasActive: boolean; brandId: string | null }>({
    hasActive: false,
    brandId: null,
  });
  const keysJson = JSON.stringify(queryKeys);

  useEffect(() => {
    const keys: QueryKey[] = JSON.parse(keysJson);
    const prev = prevRef.current;
    // active → idle, OR brand changed while a run was active: invalidate once.
    const wentIdle = prev.hasActive && !hasActive;
    const brandSwitchedDuringRun = prev.hasActive && prev.brandId !== brandId;
    if (wentIdle || brandSwitchedDuringRun) {
      for (const k of keys) queryClient.invalidateQueries({ queryKey: k });
    }
    prevRef.current = { hasActive, brandId };
  }, [hasActive, brandId, keysJson, queryClient]);

  return {
    hasActive,
    refetchInterval: hasActive ? REFETCH_MS_WHILE_ACTIVE : false,
  };
}
