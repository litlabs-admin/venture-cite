import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// `GET /api/v2/visibility/mention-rate/:brandId` - eight Monday-anchored
// weekly buckets plus the window total, computed from geo_rankings by
// `server/services/v2Visibility.ts`.
//
// THIS IS NOT THE ENDPOINT THE LIVE DASHBOARD READS, and the difference is
// the point. A provider call that never returned an answer still becomes a
// geo_rankings row with `is_cited = 0`, and every denominator on the live
// dashboard is `count(*)`, so those failures are divided into as though an
// engine had answered and declined to mention the brand. Across this database
// 2,604 of 7,302 observations are failed calls. On /v2/ the denominator is
// answers actually collected; the live dashboard's numbers are unchanged.
//
// The fields are named for what they hold. There is deliberately no `total`
// here: a field by that name is what let a failure-inflated denominator read
// as a sample size.
//
// `mentionRate` is `citationRatePct`, which returns **0 when `measured` is
// 0**. That zero means "nothing was observed", not "observed and never
// mentioned", so every reader must branch on `measured` before it shows a
// percentage. Rendering the raw rate would print a measured-looking 0% for a
// brand that has never been measured.

export type VisibilityWeek = {
  weekStart: string;
  /** Of `measured`, the answers that mentioned the brand. */
  cited: number;
  /** Answers actually collected this week. Failed calls are not in here. */
  measured: number;
  /** Calls that returned no answer. A real state, never folded into
   *  `measured` and never shown as a zero-mention week. */
  failed: number;
  mentionRate: number;
};

export type VisibilityMentionRate = {
  measured: number;
  cited: number;
  failed: number;
  /** Every observation, failures included - what the live dashboard divides
   *  by. Carried so a screen can name what it excluded instead of letting the
   *  difference vanish. */
  observed: number;
  mentionRate: number;
  weeks: VisibilityWeek[];
};

/** The one read. The trend and the headline rate come from the same payload,
 *  so a screen cannot show a rate that disagrees with its own chart. */
export function useVisibilityMentionRate(brandId: string) {
  return useQuery<VisibilityMentionRate>({
    queryKey: ["v2", "visibility", "mention-rate", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/v2/visibility/mention-rate/${encodeURIComponent(brandId)}`,
      );
      const payload = (await response.json()) as {
        success: boolean;
        data: VisibilityMentionRate;
      };
      return payload.data;
    },
  });
}

/** True when no answer was ever collected - the "Not measured" case. Weeks
 *  that hold only failed calls are not observations. */
export function hasNoObservations(weeks: VisibilityWeek[] | undefined): boolean {
  return !weeks || weeks.every((week) => week.measured === 0);
}

/**
 * The instant this area's observation window opens, for the dashboard reads
 * that take a `since`.
 *
 * WHY EVERY READ ON THESE SCREENS NEEDS IT. `/api/dashboard/hero`,
 * `/api/dashboard/rankings` and `/api/dashboard/cited-urls` all fall back to a
 * 30-DAY window when no `since` is given (`loadRankingsContext`), while the
 * mention rate covers eight Monday-anchored weeks. Left alone, one panel counts
 * 94 successful answers and the engine list beside it counts 36 of the same
 * observations, and "attributed sources recorded in this window" names a window
 * no other number on the screen uses. Passing the first bucket's start makes
 * every read draw on the sample the trend plots: the engine totals then sum to
 * exactly `observed`.
 *
 * `undefined` until the rate has loaded, which is what holds the dependent
 * reads back rather than letting them fetch the wrong window first. Once it
 * HAS loaded this always answers, including for a brand whose buckets are all
 * empty - a dependent read that could never start would sit on a skeleton for
 * ever instead of reaching one of the four states.
 */
export function observationWindowStart(
  rate: VisibilityMentionRate | undefined,
): string | undefined {
  if (!rate) return undefined;
  const first = rate.weeks[0]?.weekStart;
  if (first) return `${first}T00:00:00.000Z`;
  return new Date(Date.now() - WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000).toISOString();
}

/** The window `server/services/v2Visibility.ts` covers. Restated here only for
 *  the empty-bucket fallback above. */
const WINDOW_WEEKS = 8;

/** The most recent week that actually holds answers, or null. */
export function latestObservedWeek(weeks: VisibilityWeek[] | undefined): VisibilityWeek | null {
  if (!weeks) return null;
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    if (weeks[index].measured > 0) return weeks[index];
  }
  return null;
}
