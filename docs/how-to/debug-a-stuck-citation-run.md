# How to debug a stuck citation run

Use this guide when a brand's citation run appears frozen: progress stops
advancing, or a user reports they cannot start a new check. Read [Jobs and
cron architecture](../reference/jobs-and-cron.md#citation-runs) first for how
a run's lifecycle is supposed to work.

## Check the run's real state

Query the run directly rather than trusting the UI, which polls
`GET /api/brands/:brandId/citation-runs/active` on a backoff schedule (8s,
then 30s, then 60s after repeated empty polls) and can lag:

```sql
select id, status, started_at, last_advance_started_at, progress_pct, triggered_by
from citation_runs
where brand_id = '<brand-id>'
order by started_at desc
limit 5;
```

- `status` of `pending` or `running` with a recent `last_advance_started_at`
  is a healthy, in-progress run. Citation runs are sliced work; a run can
  legitimately sit `running` for its whole multi-minute duration (median
  3.77 minutes, p95 14.25 minutes across a sample of 449 completed runs).
- `status` of `running` with `last_advance_started_at` more than 240 minutes
  in the past (or, for a row from before that column existed, `started_at`
  more than 240 minutes in the past) is stale. See [Why citation run
  staleness is judged by last progress, not elapsed
  time](../explanation/citation-run-staleness.md) for where 240 minutes
  comes from.

## Understand what should already be unsticking it

Three independent mechanisms can advance or reap a stuck run. Check whether
each one is actually reaching this brand before assuming the mechanism is
broken:

1. **Client-driven advance.** A user with the page open polls
   `useActiveCitationRuns`, which drives the run's next slice forward. If
   nobody has the page open, this does not fire.
2. **The cron drain.** `server/routes/cron.ts`'s `drainPendingCitationRuns`,
   called from `POST /api/cron/daily-orchestrator`, calls
   `advanceCitationRun` for any run that has gone quiet for at least 30
   seconds — a much shorter threshold than the 240-minute staleness check,
   because its job is to nudge a slice forward, not to declare a run dead.
   Confirm this endpoint is actually being invoked: check whether
   `DISABLE_IN_PROCESS_SCHEDULER` and `EXTERNAL_CRON_ORCHESTRATOR_ENABLED`
   are set the way [Jobs and cron
   architecture](../reference/jobs-and-cron.md) describes for this
   environment.
3. **The periodic sweep and the inline reap.**
   `reconcileOrphanCitationRuns` runs on process boot and marks any run past
   the 240-minute staleness threshold as `failed`. Separately,
   `runBrandPrompts`'s automatic-trigger branch reaps a stale run inline,
   immediately before it would otherwise collide with the
   `citation_runs_one_active_per_brand` unique index on the next scheduled
   attempt. Neither mechanism fires for a **manual** run — a user's own
   click surfaces a stuck row as a `409 already_running` response instead of
   silently reaping it.

## If a run is genuinely stale and none of the above has reaped it yet

Mark it failed directly, matching the same field values the automated
reap mechanisms use, so the row reads the same way in the UI and history
regardless of which path caught it:

```sql
update citation_runs
set status = 'failed',
    error_message = 'manually reaped: stuck run',
    completed_at = coalesce(completed_at, now()),
    progress_pct = 100
where id = '<run-id>' and status in ('pending', 'running');
```

This clears the unique index so the brand's next automatic or manual attempt
can create a new run.

## Check for the rate bound before assuming a run "never starts"

If a brand never gets an automatic run at all, check whether it has hit
`AUTOMATIC_RUN_MAX_PER_WINDOW` (3 per rolling hour, counted across `cron` and
`auto_onboarding` triggers combined):

```sql
select count(*) from citation_runs
where brand_id = '<brand-id>'
  and triggered_by in ('cron', 'auto_onboarding')
  and started_at > now() - interval '1 hour';
```

A manual run, triggered by a user clicking the button in the product, never
consults this bound.

## Verify

After any manual database change, confirm the brand's next automatic or
manual run proceeds normally, and check `server/lib/citationReconciliation.ts`
and `server/citationChecker.ts` if the same brand gets stuck repeatedly — a
recurring stall on one brand, rather than an isolated incident, points at a
provider-side failure in that brand's specific prompts rather than at the
run-lifecycle mechanisms described here.
