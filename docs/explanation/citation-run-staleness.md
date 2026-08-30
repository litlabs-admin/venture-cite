# Why citation run staleness is judged by last progress, not elapsed time

A citation run that has been `running` for a while is either doing real
work or dead. Something has to tell the two apart before it is safe to reap
a run and let the brand start a new one. VentureCite makes that judgment
against `citation_runs.last_advance_started_at`, a timestamp updated
repeatedly during a live run, rather than against `started_at`, a timestamp
fixed once at creation.

## The defect this replaced

The original threshold, `ORPHAN_THRESHOLD_MINUTES = 5`, was documented as
"how old is definitely dead" but compared against `started_at` — total run
age, not staleness. That conflates two different things. `citation_runs` is
deliberately sliced work (see `server/citationChecker.ts`): a healthy run is
expected to legitimately stay `running` for its entire multi-minute
duration, not to finish instantly. Measured against 449 completed
production runs, the median total duration was 3.77 minutes, the p95 was
14.25 minutes, and the maximum was 175.58 minutes — 173 of the 449 runs
(38.5%) took longer than 5 minutes to finish normally.

Comparing a 5-minute threshold against total age was survivable only because
the only thing consulting it was a boot-time and daily sweep. Once a
per-run-creation reap was added — checking staleness at the moment a new
automatic run would otherwise collide with an existing one — the same
5-minute-against-`started_at` comparison would have started killing healthy,
still-progressing runs on nearly 4 in 10 completions.

## Why "last progress" instead

The fix adds `last_advance_started_at`, stamped unconditionally when a run
is created and again on every mid-slice progress bump (every 5 completed
tasks, or every 1.5 seconds, whichever comes first, from the worker loop in
`server/citationChecker.ts`). Staleness is then judged as: how long has it
been since this run last _did_ anything, not how long has it existed. A run
that keeps advancing, however long it has been running in total, is never
judged stale by this check. A run that has genuinely stopped advancing —
crashed, killed mid-slice, orphaned — starts accumulating idle time from its
last real progress, which is the actual signal of abandonment.

## Where 240 minutes came from

The new threshold, 240 minutes, was derived from the codebase's own cron
design rather than picked as a round number:

- The automatic citation cron fires hourly. A run legitimately waiting for
  its next scheduled slice can sit with no progress for up to that full
  60-minute interval by design, without being abandoned.
- The largest per-step slice budget derivable from
  `server/lib/factAgent/v2/vercelBudget.ts`'s defaults is far under an hour.
- The external daily cron orchestrator's own total per-tick budget
  (`CRON_ORCHESTRATOR_BUDGET_MS` in `render.yaml`) is 15 minutes.

Sixty minutes is already the longest gap the system's own cron design
commits to anywhere. 240 minutes gives that a 4x margin, and it also clears
the slowest of the 449 measured successful runs (175.58 minutes) — which
matters because a run whose `last_advance_started_at` is still `NULL`
(created before this column existed) falls back to comparing against
`started_at`, and that fallback must not misjudge even the worst historical
case as dead.

## One predicate, both call sites

Before this fix, the boot-time sweep and the per-creation reap each computed
their own staleness comparison. That duplication is exactly how a
threshold-compared-against-the-wrong-timestamp defect went unnoticed in the
first place — a second call site is a second chance to get the comparison
wrong in a slightly different way. Both sites now call one exported
function, `isRunStaleSinceLastProgress`, so there is exactly one place that
knows what "stale" means for a citation run.
