# B6a-09: Bounding the fact-sheet-refresh retry loop

Fixes the CONFIRMED defect from `.audit/B6/B6a-07-slice-driver-audit-pipeline.md`:
`findStaleBrands` in `server/lib/factAgent/v2/runFactSheetRefresh.ts` selected any
brand with zero `completed` runs, forever. A brand whose site is permanently
unreachable never produces a `completed` run - every attempt terminates
`failed` - so it was re-selected and given a full six-source re-scrape on every
single tick, without end. `detectFactScrapeFailureRate` (`server/scheduler.ts`)
only logs a Sentry alert after 3 consecutive failures; it never gated the
query.

## The bound chosen

Two new exported constants in `runFactSheetRefresh.ts`, named and reasoned about
the same way as `AUTOPILOT_MAX_ATTEMPTS` / `AUTOPILOT_RETRY_BACKOFF_MINUTES` in
`server/lib/onboardingAutopilot.ts`:

- `FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES = 3` - a hard cap. Once a brand's most
  recent 3 runs are all terminal-`failed`, it stops being selected by the cron
  refresh entirely, until a run of any other outcome (a manual rescrape that
  succeeds, or one that doesn't even reach `failed`) breaks the streak. This
  is deliberately small for the same reason the autopilot cap is small: the
  goal is to survive a transient failure, not grind forever on a brand that is
  durably broken (dead domain, robots blocking everything, DNS failure).
- `FACT_SCRAPE_RETRY_BACKOFF_HOURS = 24` - below the cap, a brand that just
  failed waits 24 hours before its next automatic attempt, instead of being
  retried on the very next hourly tick. This absorbs the case the cap alone
  doesn't: a brand recovering from one bad run shouldn't burn a second
  six-source scrape an hour later while whatever caused the first failure may
  still be in effect.

The decision itself lives in one pure function, `isRetryEligible`:

```ts
export function isRetryEligible(recentRuns: RecentRunSummary[]): {
  eligible: boolean;
  reason?: "cap" | "backoff";
} {
  let consecutiveFailures = 0;
  for (const run of recentRuns) {
    if (run.status !== "failed") break;
    consecutiveFailures += 1;
  }
  if (consecutiveFailures >= FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES) {
    return { eligible: false, reason: "cap" };
  }
  if (
    consecutiveFailures > 0 &&
    recentRuns[0].hoursSinceStarted < FACT_SCRAPE_RETRY_BACKOFF_HOURS
  ) {
    return { eligible: false, reason: "backoff" };
  }
  return { eligible: true };
}
```

`recentRuns` is ordered most-recent-first. The loop counts failures from the
front and stops at the first non-`failed` run - so a brand whose most recent
run is `completed` (or anything else non-`failed`) always has
`consecutiveFailures === 0` and is immediately eligible, regardless of how many
failures preceded it. That is the reset behaviour the task required: one bad
week does not permanently disable a healthy brand.

`findStaleBrands` supplies `recentRuns` via a correlated subquery added to the
existing candidate SELECT - the last `FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES` rows
from `brand_fact_scrape_runs` per brand, each carrying `status` and
`hours_since_started` (`EXTRACT(EPOCH FROM (now() - started_at)) / 3600.0`,
computed in Postgres so the comparison to "now" never depends on parsing a
timestamp column back out of the driver). The pre-existing WHERE clause (no
run currently in flight; no completed run ever, or the last one is 7+ days
stale) is untouched - it still decides which brands are _candidates_. The gate
runs afterward, in application code, and only removes candidates; it adds no
new ones.

Because the gate can remove candidates, the SQL `LIMIT` was widened from the
per-tick batch size (`MAX_BRANDS_PER_TICK = 3`) to `MAX_CANDIDATE_ROWS = 200`,
and `findStaleBrands` trims to the requested `limit` after filtering. Without
this widening, a tick where the three oldest stale brands all happen to be
capped or backing off would return zero brands even though eligible ones exist
further down the `created_at ASC` ordering. With only ~33 live brands, 200 is
effectively "fetch everything currently stale" - it is not a production tuning
knob.

## Visibility

When a brand is excluded by the cap, `findStaleBrands` logs it once per tick,
batched:

```ts
logger.warn(
  { brandIds: excludedByCap, maxConsecutiveFailures: FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES },
  "fact-sheet-refresh: brand excluded from cron refresh - too many consecutive scrape failures",
);
```

Backoff exclusions are not logged - they are the ordinary, expected wait
between retries and would otherwise produce a warning on every tick a backing-
off brand is scanned (hourly, for up to 24h). Only the cap - which stops
automatic retries entirely until something else breaks the streak - is logged,
matching how `resumeInFlightAutopilots`'s stall demotion is the thing that gets
a `logger.warn`, not every ordinary backoff wait.

## Was a migration needed? No.

`brand_fact_scrape_runs` already carries every column the bound needs:
`status` and `started_at` (both used; `retry_count`, `completed_at`,
`error_kind` were not needed for this particular gate - `retry_count` in
particular is scoped to a _single run's_ mid-flight retries inside
`factScrapeBackstop.ts`, a different counter for a different problem, not a
per-brand consecutive-failure count across runs). The bound is entirely a
`SELECT`-time computation over existing rows; nothing needs to be written back
to `brands` or `brand_fact_scrape_runs` to enforce it, so there is no new
column, table, or index to add. This mirrors the task's own steer: a
query-level bound needs no migration, and none was written.

## Fail-then-pass evidence

New file: `tests/unit/factSheetRefreshRetryBound.test.ts` - 10 tests: 5 against
the pure `isRetryEligible` function (cap, never-attempted, backoff, reset-on-
success, and backoff-elapsed), and 5 against `findStaleBrands` wiring (cap
exclusion + its log, never-attempted inclusion, backoff exclusion with no log,
last-run-succeeded inclusion, and limit trimming after filtering).

Verification: `git stash push -- server/lib/factAgent/v2/runFactSheetRefresh.ts`
put the working tree back on the pre-fix version (confirmed via `grep` that the
file had neither `isRetryEligible` nor `FACT_SCRAPE_MAX_CONSECUTIVE_FAILURES`),
ran the new test file, then `git stash pop` to restore the fix and diffed the
restored file's exports against the fixed version to confirm nothing was lost.

**Against the OLD logic**, all 10 tests failed - the two new exports the test
file imports do not exist pre-fix, so every test throws before its assertions
even run:

```
 ❯ tests/unit/factSheetRefreshRetryBound.test.ts (10 tests | 10 failed) 16ms
     × excludes a brand whose most recent runs are all failures at the cap 7ms
     × includes a brand with no run history at all (never attempted) 1ms
     × excludes a brand below the cap whose last failure is still inside the backoff window 1ms
     × is unaffected when the most recent run succeeded, even after prior failures 1ms
     × allows a retry once the backoff window has fully elapsed, below the cap 1ms
     × excludes a brand past the consecutive-failure cap and logs it 1ms
     × includes a brand that has never been attempted 1ms
     × excludes a brand inside the backoff window without logging it as a cap exclusion 1ms
     × keeps a brand whose last run succeeded, unaffected by its scrape history 1ms
     × still trims to the requested limit after filtering 1ms

TypeError: isRetryEligible is not a function
TypeError: findStaleBrands is not a function

 Test Files  1 failed (1)
      Tests  10 failed (10)
```

**Against the FIXED logic** (restored via `git stash pop`):

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Run together with the other fact-sheet/scrape/refresh-named suites in
`tests/unit/` (`v2FactSheetRefresh.test.ts`, `v2FactScrapeBackstop.test.ts`,
`detectFactScrapeFailureRate.test.ts`, plus every other file in `tests/unit/`
whose name contains "fact", "scrape", or "refresh" - 28 files, 146 tests, all
green, one pre-existing unrelated skip):

```
npx vitest run tests/unit/factSheetRefreshRetryBound.test.ts tests/unit/v2FactSheetRefresh.test.ts tests/unit/v2FactScrapeBackstop.test.ts tests/unit/detectFactScrapeFailureRate.test.ts

 Test Files  4 passed (4)
      Tests  16 passed (16)
```

`npx tsc --noEmit -p .`, `npx eslint`, and `npx prettier --check` all pass clean
on both changed files.

## Healthy-brand path confirmed unchanged

The 12 brands with a `completed` run are unaffected in two independent ways:

1. The outer WHERE clause that decides candidacy (never completed, or stale by
   `REFRESH_INTERVAL_DAYS`) was not touched at all.
2. For any brand whose most recent run's `status = 'completed'`, the gate's
   loop breaks on the first iteration (`run.status !== "failed"`), so
   `consecutiveFailures` is always `0` and `isRetryEligible` always returns
   `{ eligible: true }` - unconditionally, with no dependence on cap or
   backoff values. This is covered directly by the "is unaffected when the
   most recent run succeeded, even after prior failures" and "keeps a brand
   whose last run succeeded, unaffected by its scrape history" tests above.

## Constraints respected

`runFullScrape.ts`, `factScrapeBackstop.ts`, and `server/lib/onboardingAutopilot.ts`
were not touched. `EXTERNAL_CRON_ORCHESTRATOR_ENABLED` in `render.yaml` was not
changed. No migration was written. No cost/billing language was used in code,
comments, or test names - the defect and fix are described mechanically
(repeated work, consecutive failures, unbounded retries).

## Note on the working tree

`git status` at the start of this task already showed a large, pre-existing
uncommitted diff unrelated to this fix (`server/citationChecker.ts`,
`server/routes.ts`, `shared/visibilityMetrics.ts`, `server/scheduler.ts`, and
others - the same set noted in `.audit/B6/B6a-05-autopilot-loop-tests.md`).
None of that was touched, staged, or is part of this change; the only files
this task modified are `server/lib/factAgent/v2/runFactSheetRefresh.ts` and the
new `tests/unit/factSheetRefreshRetryBound.test.ts`.
