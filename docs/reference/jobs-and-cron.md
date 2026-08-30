# Jobs and cron architecture

VentureCite runs scheduled and background work through an in-process
`node-cron` scheduler, with one alternate mode for hosts where an in-process
scheduler does not fit.

## Where jobs are registered

`server/scheduler.ts` exports `initScheduler()`, which registers every cron
job with `node-cron`. Each job:

1. Reads its schedule from an environment variable with a hardcoded default,
   for example `const AUTO_CITATION_CRON = process.env.AUTO_CITATION_CRON ||
"0 * * * *"`.
2. Validates the expression with `cron.validate(...)` before registering it.
3. Wraps its body in `cronCrashGuard(jobName, fn)`, which catches a rejected
   promise, logs it, and reports it to Sentry, so one crashing tick cannot
   take down the scheduler process.

| Job                          | Env var                           | Default       |
| ---------------------------- | --------------------------------- | ------------- |
| Autopilot resume tick        | `AUTOPILOT_RESUME_CRON`           | `* * * * *`   |
| Content-cost outbox drain    | `CONTENT_COST_OUTBOX_CRON`        | `*/5 * * * *` |
| Tour events cleanup          | `TOUR_EVENTS_CLEANUP_CRON`        | `0 2 * * *`   |
| Auto-citation                | `AUTO_CITATION_CRON`              | `0 * * * *`   |
| Brand activation sweep       | `BRAND_ACTIVATION_CRON`           | `0 * * * *`   |
| Fact-scrape failure detector | `DETECT_FACT_SCRAPE_FAILURE_CRON` | `0 11 * * *`  |
| Weekly catch-up kickoff      | `WEEKLY_CATCHUP_CRON`             | `0 6 * * 1`   |
| Account purge                | `ACCOUNT_PURGE_CRON`              | `0 3 * * *`   |
| Brand purge                  | `BRAND_PURGE_CRON`                | `30 3 * * *`  |
| Weekly report                | `WEEKLY_REPORT_CRON`              | `0 8 * * 0`   |

## Two ways a job can start, and how each is booted

`initScheduler()` runs from two places, and only one of them runs in a given
process:

- **Development**: `server/index.ts` calls `initScheduler()` directly at
  startup, unless `DISABLE_IN_PROCESS_SCHEDULER=true`.
- **Production**: `server/nitroBoot.ts`, registered as a Nitro startup
  plugin, calls `resolveSchedulerMode(...)` and then either calls
  `initScheduler()` (in-process mode) or logs that scheduled work must come
  from `POST /api/cron/daily-orchestrator` (external mode). `nitroBoot.ts`
  only runs any of this when `NODE_ENV=production`, so it cannot run
  alongside `server/index.ts`'s development boot in the same process.

`server/lib/schedulerMode.ts` refuses to start in either mode inconsistently:
production external-cron mode requires `DISABLE_IN_PROCESS_SCHEDULER=true`
together with `EXTERNAL_CRON_ORCHESTRATOR_ENABLED=true`. Render currently
keeps both variables `false`, so Render runs the in-process scheduler and
`render.yaml` deliberately declares no `type: cron` service (Render's free
tier does not support one).

## Preventing a job from running twice

Two mechanisms guard against duplicate execution, and they guard against
different failures:

- **Postgres advisory locks** (`server/lib/advisoryLock.ts`,
  `lockKeys` in the 910001+ range plus `schedulerLockKeys` in
  `server/scheduler.ts`) stop two _concurrent_ runners from executing the
  same job body at the same instant — for example, two scheduler processes
  overlapping during a deploy.
- **Job debounce** (`server/lib/jobDebounce.ts`, backed by the
  `system_state` key/value table) stops the same job from running twice in
  _sequence_ within a window, which an advisory lock cannot prevent: an
  in-process tick can finish and release its lock minutes before an external
  trigger fires the same job again. Debounce is applied only to jobs whose
  second run has a real cost: weekly report (duplicate emails), mention scan
  (duplicate LLM spend), and auto-citation (duplicate LLM spend). The daily
  purge jobs are not debounced, because a second pass over already-purged
  data finds nothing to do.

## Citation runs

A citation run (`citation_runs` table) checks a brand's prompts against
configured AI platforms. Its lifecycle spans several mechanisms:

- **Creation is bounded per brand.** `runBrandPrompts`
  (`server/citationChecker.ts`) counts automatic run creations
  (`triggeredBy` of `cron` or `auto_onboarding`) in the last hour
  (`AUTOMATIC_RUN_WINDOW_MS`) and refuses a new one past
  `AUTOMATIC_RUN_MAX_PER_WINDOW` (3). Manual runs, triggered by a user
  clicking a button, never consult this bound.
- **One active run per brand is enforced by a unique index**,
  `citation_runs_one_active_per_brand` (migration `0035`), on
  `citation_runs(brand_id) WHERE status IN ('pending', 'running')`. See
  [Why one active citation run per
  brand](../explanation/one-active-citation-run-per-brand.md).
- **A stuck run is reaped, not resumed, before it can block a new one.**
  `runBrandPrompts`'s automatic-trigger branch checks whether the brand's
  existing active run is stale (see below) and, if so, marks it `failed`
  before creating a replacement. `server/lib/citationReconciliation.ts`'s
  `reconcileOrphanCitationRuns` runs the same check as a periodic sweep, for
  a brand that is not due for another automatic attempt for days.
- **Staleness is judged by last progress, not run age.** See [Why citation
  run staleness is judged by last progress, not elapsed
  time](../explanation/citation-run-staleness.md).
- **The scheduler's own cadence gate can be bypassed by other callers.**
  `isBrandDueForCitation` in `server/scheduler.ts` only governs the
  scheduler's own decision to call `runBrandPrompts`; `server/lib/onboardingAutopilot.ts`
  calls it directly and never consults that gate. See [Why the cadence gate
  sits where a run is
  created](../explanation/cadence-gate-placement.md).

## See also

- [Adding a cron job](../how-to/add-a-cron-job.md)
- [Debugging a stuck citation run](../how-to/debug-a-stuck-citation-run.md)
