# Why there is only one active citation run per brand

A citation run checks a brand's tracked prompts against every configured AI
platform and writes the results to `geo_rankings`. VentureCite enforces, at
the database level, that a brand can have at most one `pending` or `running`
row in `citation_runs` at a time:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS citation_runs_one_active_per_brand
  ON citation_runs(brand_id)
  WHERE status IN ('pending', 'running');
```

## The failure this prevents

The client's UI disables the "Run Check" button while a run is already
active, but that is a best-effort courtesy, not a guarantee: a user can open
the same brand in two tabs, and `useActiveCitationRuns` polls the server
only every 8 seconds. A click in a second tab, inside that window, would
otherwise be free to start a second run for the same brand.

Two runs racing against the same brand do not just waste a provider call.
They interleave writes to `geo_rankings` for the same prompts and platforms,
which duplicates the cost of every checked prompt and leaves the run's
aggregate statistics (citation counts, rankings) built from an inconsistent
mix of two runs' rows. A user reading a citation-rate chart afterward has no
way to tell it came from two overlapping runs instead of one.

## Why a database constraint, not just application logic

The migration that introduces this index also reconciles pre-existing
duplicates before creating it — proof that the double-run problem was
already happening in production data, not a hypothetical. An
application-level check (query for an active run, then insert if none
exists) has a race condition of its own: two requests can both pass the
query before either has inserted. A unique index closes that race
unconditionally, at the one layer that can actually enforce it atomically:
the second `INSERT` fails with Postgres error `23505`
(`unique_violation`), and the application catches that specific error to
tell the user a run is already in progress.

## The cost of the guarantee

Enforcing "at most one active run" at the database level means an
abandoned run — one that crashed mid-flight, or was killed by a serverless
function's timeout — pins that brand's row indefinitely: every later
automatic attempt collides on insert and never gets a `runId` to resume.
The constraint is correct; what a run creation path does when it meets an
already-active row is a separate design question. See [why citation run
staleness is judged by last progress, not elapsed
time](./citation-run-staleness.md) for how a genuinely abandoned run is told
apart from one that is still legitimately in progress, and [why the cadence
gate sits where a run is created](./cadence-gate-placement.md) for where
that check had to move to actually catch every caller.
