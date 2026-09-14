/**
 * Shared "is this measurement stale" policy for /v2/today and its dependent
 * boards (b01, b02, b46's dispatch condition).
 *
 * The bug this fixes: the board used to call a measurement "stale" whenever
 * React Query's own cache considered a query's data stale (`query.isStale`).
 * That is a caching implementation detail - it flips true the instant a
 * query's `staleTime` elapses, regardless of whether the underlying
 * measurement is fresh - so the chart displayed "Stale" on data that had
 * just been fetched. What the user actually needs to know is whether the
 * BRAND's last real observation is old, which is a fact about the data, not
 * about the query cache.
 */

/** Calendar days before a brand's latest observation counts as stale. */
export const STALE_OBSERVATION_THRESHOLD_DAYS = 14;

/** Whole days between `dateIso` (a `YYYY-MM-DD` week-start date) and `now`. */
export function daysSince(dateIso: string, now: Date = new Date()): number {
  const then = new Date(`${dateIso}T00:00:00.000Z`).getTime();
  const millisPerDay = 24 * 60 * 60 * 1000;
  return (now.getTime() - then) / millisPerDay;
}

/**
 * True when the latest real observation is older than the freshness window.
 * `undefined` (no observation at all) is never "stale" - that is the
 * "not measured" case, a different fact entirely, and callers must not
 * collapse the two.
 */
export function isObservationStale(
  latestObservationDate: string | undefined,
  now: Date = new Date(),
  thresholdDays: number = STALE_OBSERVATION_THRESHOLD_DAYS,
): boolean {
  if (!latestObservationDate) return false;
  return daysSince(latestObservationDate, now) > thresholdDays;
}
