import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// `GET /api/dashboard/citation-trend/:brandId` - eight Monday-anchored weekly
// buckets computed from geo_rankings (`dashboardVisibility.ts`). Read here,
// never modified: the live dashboard reads the same endpoint through its own
// key, and this one is namespaced `["v2", ...]` so the two caches stay apart.
//
// `citationRate` is `citationRatePct`, which returns **0 when `total` is 0**.
// That zero means "nothing was observed", not "observed and never mentioned",
// so every reader here must branch on `total` before it shows a percentage.
// Rendering the raw rate would print a measured-looking 0% for a brand that
// has never been measured.

export type VisibilityWeek = {
  weekStart: string;
  cited: number;
  total: number;
  citationRate: number;
};

export function useVisibilityTrend(brandId: string) {
  return useQuery<{ weeks: VisibilityWeek[] }>({
    queryKey: ["v2", "visibility", "trend", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/dashboard/citation-trend/${encodeURIComponent(brandId)}`,
      );
      const payload = (await response.json()) as {
        success: boolean;
        data: { weeks: VisibilityWeek[] };
      };
      return payload.data;
    },
  });
}

/** True when no answer was ever collected - the "Not measured" case. */
export function hasNoObservations(weeks: VisibilityWeek[] | undefined): boolean {
  return !weeks || weeks.every((week) => week.total === 0);
}

/** The most recent week that actually holds answers, or null. */
export function latestObservedWeek(weeks: VisibilityWeek[] | undefined): VisibilityWeek | null {
  if (!weeks) return null;
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    if (weeks[index].total > 0) return weeks[index];
  }
  return null;
}
