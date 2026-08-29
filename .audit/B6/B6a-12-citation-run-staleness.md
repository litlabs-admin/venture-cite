# B6a-12: citation-run staleness threshold, corrected to key off last progress

Fixes the defect described in the task: `ORPHAN_THRESHOLD_MINUTES = 5` in
`server/lib/citationReconciliation.ts` was documented as "how old is
definitely-dead" but compared against `citation_runs.started_at`, which
measures total run age, not staleness. `citation_runs` is deliberately
slice-based (`server/citationChecker.ts`): a healthy run legitimately stays
`running` for its whole multi-minute duration. Measured against 449
production runs that completed successfully: median 3.77m, mean 6.15m, p95
14.25m, max 175.58m, and 173 of 449 (38.5%) took longer than 5 minutes. This
was latent while only the boot-time/daily sweep
(`reconcileOrphanCitationRuns`) used the threshold; `.audit/B6/B6a-10` added
an inline reap on every automatic run creation, so it now fires far more
often and can kill a healthy in-flight run.

## The column added

Migration `0123_citation_run_last_advance.sql` adds
`citation_runs.last_advance_started_at timestamptz`, following the naming
and shape of the existing precedent for exactly this problem in this
schema - `content_generation_jobs.last_advance_started_at` (migration
0044). Mirrored into `supabase/migrations/` via
`node scripts/syncSupabaseMigrations.mjs` (not hand-written) as
`20260421000131_0123_citation_run_last_advance.sql`; `npm run
supabase:migrations:check` passes.

Unlike the content-jobs column (stamped once, at slice-claim time, as a
concurrency lock), this column is stamped:

- At row creation (`server/storage/citationsStorage.ts`'s
  `createCitationRun` - unconditionally, regardless of what the caller
  passes in).
- On every mid-slice progress bump (`bumpCitationRunProgress`, called from
  `server/citationChecker.ts`'s worker loop every `PROGRESS_BUMP_EVERY` (5)
  tasks or `PROGRESS_BUMP_INTERVAL_MS` (1500ms), whichever comes first).

So it refreshes repeatedly **during** a live slice, not only at slice
start/end - satisfying the task's requirement that it not be a boundary-only
stamp.

## How NULL is handled, and why

Existing rows get NULL - no backfill UPDATE. Both reap sites compute
`COALESCE(last_advance_started_at, started_at)` (SQL side) /
`lastAdvanceStartedAt ?? startedAt` (JS side via the shared predicate, see
below) and judge staleness against that. This is safe and requires no
backfill because:

- The reap queries only ever touch `status IN ('pending', 'running')`.
  Every completed row (the overwhelming majority of history) is excluded
  regardless of what this column holds.
- A row still `pending`/`running` at the moment this migration runs is
  judged by `started_at` - exactly the pre-migration behavior for that row
  - until its next progress bump gives it a real `last_advance_started_at`,
    or it ages out under the same (now much larger) threshold anyway.
- Every row created by this deploy's code always gets a non-NULL value
  immediately, since `createCitationRun` stamps it unconditionally at
  insert time. NULL can only ever describe a transitional, pre-migration
  row.

## The threshold: derivation

Chose **240 minutes (4 hours)**, replacing the old 5-minute constant
(renamed `ORPHAN_THRESHOLD_MS` → `STALE_SINCE_LAST_PROGRESS_MS`, still a
single exported constant from `server/lib/citationReconciliation.ts`).

Cadence measured, not assumed:

- `AUTO_CITATION_CRON` (`server/scheduler.ts`) defaults to `"0 * * * *"` -
  **hourly**. A run that is only waiting for its next scheduled slice - not
  dead - can legitimately sit `running` with no progress for up to that
  full 60-minute tick interval by design.
- `cronStepBudget` (`server/lib/factAgent/v2/vercelBudget.ts`) derives
  per-step slice budgets from `VERCEL_FUNCTION_BUDGET_MS` (default 60s);
  even its largest documented ceiling is far under an hour.
- `render.yaml` sets `CRON_ORCHESTRATOR_BUDGET_MS=900000` (15 minutes) as
  the external daily-orchestrator's total per-tick wall-clock budget (that
  route is currently inactive on Render -
  `EXTERNAL_CRON_ORCHESTRATOR_ENABLED=false`, `DISABLE_IN_PROCESS_SCHEDULER=false`
  - but it is the ceiling the codebase's own cron design commits to).

So 60 minutes is already the longest legitimate gap anywhere in this
codebase's cron design. **240 minutes gives that a 4x margin**, and also
clears the slowest of the 449 measured successful runs (175.58 minutes
total elapsed) with margin to spare - relevant because a row whose
`last_advance_started_at` is NULL falls back to `started_at`, and that
fallback must not misjudge even the worst historical case as dead.

## Both reap sites, one shared decision

Rather than duplicating "which timestamp, what fallback, what threshold" in
two places (which is exactly how the original defect - a threshold compared
against the wrong timestamp - was able to exist unnoticed), the comparison
is now a single exported pure function:

```ts
// server/lib/citationReconciliation.ts
export function isRunStaleSinceLastProgress(
  run: { startedAt: Date | string; lastAdvanceStartedAt: Date | string | null },
  now: number = Date.now(),
): boolean {
  const lastProgressAt = run.lastAdvanceStartedAt ?? run.startedAt;
  const ageMs = now - new Date(lastProgressAt).getTime();
  return ageMs >= STALE_SINCE_LAST_PROGRESS_MS;
}
```

- `reconcileOrphanCitationRuns`'s SQL uses the same
  `STALE_SINCE_LAST_PROGRESS_MS` (as a `'240 minutes'` interval) against
  `COALESCE(last_advance_started_at, started_at)`.
- `server/citationChecker.ts`'s inline reap (added by B6a-10, in
  `runBrandPrompts`'s automatic-trigger branch) now calls
  `isRunStaleSinceLastProgress(run)` directly instead of computing its own
  age comparison against `startedAt`.

Neither the bound on automatic run creation
(`AUTOMATIC_RUN_WINDOW_MS`/`AUTOMATIC_RUN_MAX_PER_WINDOW`) nor the
`citation_runs_one_active_per_brand` invariant was touched.

## Fail-then-pass evidence

New file: `tests/unit/citationRunStaleness.test.ts`, 12 tests, covering:

- The exact regression: a run whose last progress is recent is NOT stale
  even when `startedAt` is hours old.
- A genuinely abandoned run (no progress for longer than the threshold) IS
  stale.
- NULL `lastAdvanceStartedAt` falls back to `startedAt`, both for the
  not-stale-yet case and the stale case.
- The exact boundary (`>=` threshold is stale, one ms under is not).
- `reconcileOrphanCitationRuns`'s SQL text uses the new column/threshold.
- `runBrandPrompts`'s inline reap: does not reap a recently-progressed run
  (refuses instead), reaps a genuinely stale one, and both NULL-fallback
  sub-cases, mirrored at the `citationChecker.ts` call site.
- Both reap sites agree at the shared threshold's exact boundary.

Verification: `git stash push -- server/citationChecker.ts
server/lib/citationReconciliation.ts server/storage/citationsStorage.ts
server/storage.ts shared/schema/citations.ts` reverted the working tree to
the pre-fix versions of every touched source file, then ran the new test
file alone, then `git stash pop` to restore the fix.

**Against the OLD logic**, 11 of 12 failed:

```
 ❯ tests/unit/citationRunStaleness.test.ts (12 tests | 11 failed)
```

Representative failures:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 'run-stale', ObjectContaining{…} ]
Received:
  1st vi.fn() call:
  [
-   "run-stale",
-   ObjectContaining { "status": "failed", ... },
+   "run-new",
+   { "status": "succeeded", "totalChecks": 1, ... },
  ]
  (the "genuinely abandoned" run was never reaped, and a second run was
  created and completed alongside it - because the old code judged
  staleness by startedAt, and this fixture's startedAt was made "further
  back but not what the old code checked" deliberately wrong for the old
  code's own logic)

TypeError: isRunStaleSinceLastProgress is not a function
  (the shared predicate does not exist in the pre-fix module at all)
```

**Against the FIXED logic** (restored via `git stash pop`):

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Two pre-existing test files encoded the old 5-minute/`startedAt`-only
assumptions and needed updating to match the corrected (not weakened)
behavior, not left broken:

- `tests/unit/citationReconciliation.test.ts` - the SQL-text assertion now
  checks for `COALESCE(last_advance_started_at, started_at)` and
  `INTERVAL '240 minutes'` instead of `started_at` / `'5 minutes'`.
- `tests/unit/citationRunGuards.test.ts` - its Defect-B "reap" fixture now
  uses a `lastAdvanceStartedAt` 5 hours in the past (genuinely past the new
  240-minute threshold) instead of a `startedAt` 10 minutes in the past
  (which the new, correct logic would no longer consider stale).

Run together (new file plus every existing test whose name mentions
`citation` or `reconcil`, per the task's instruction - not the full unit
directory):

```
npx vitest run tests/unit/autoCitationDeadline.test.ts tests/unit/citationChecker.kickoff.test.ts \
  tests/unit/citationChecker.matcherAuthority.test.ts tests/unit/citationCheckerBatchInsert.test.ts \
  tests/unit/citationCronUnconditional.test.ts tests/unit/citationReconciliation.test.ts \
  tests/unit/citationRunGuards.test.ts tests/unit/citationRunStaleness.test.ts \
  tests/unit/dashboardCitationTrend.test.ts

 Test Files  9 passed (9)
      Tests  42 passed (42)
```

`npx tsc --noEmit -p tsconfig.json` is clean on the whole project.
`npx eslint` on every touched source and test file: 0 errors, only
pre-existing `no-explicit-any` warnings (none newly introduced).
`npx prettier --check` passes on every touched `.ts`/`.tsx` file (the
migration `.sql` file has no Prettier parser registered for it, same as
every other file in `migrations/`).

## Migration: actually applied, through the real runner

Started a scratch Postgres 16 container (`docker run ... postgres:16-alpine`,
port 55432) since verifying `applyMigrations()` needed a database. Seeding
the full historical migration chain from an empty database is not viable in
isolation - `migrations/` assumes a pre-existing Supabase baseline schema
(confirmed: replaying from `0000_phase2_schema.sql` on a bare Postgres
instance fails immediately with `relation "brands" does not exist"`, and an
earlier migration also requires the Supabase `anon` role to exist). Instead:

1. Created the roles Supabase provides in production (`anon`,
   `authenticated`, `service_role`, `supabase_auth_admin`,
   `authenticator`) and a minimal `brands` + `citation_runs` table matching
   the schema shape from before this change (no `last_advance_started_at`).
2. Seeded `public.schema_migrations` with a `checksum = NULL` ("legacy")
   row for every migration filename except `0123_citation_run_last_advance.sql`
   - the real runner's own `classifyMigrationChecksum` treats a `NULL`
     checksum as `"legacy"` and skips re-executing that file's SQL, exactly
     the ledger state a real, already-migrated database would be in.
3. Ran `DATABASE_URL=postgres://postgres:postgres@localhost:55432/venturecite_test
npx tsx scripts/migrate.ts` - the actual project migration entrypoint,
   calling the real `applyMigrations()` in `server/lib/migrationRunner.ts`.

Result: every pre-existing filename was classified `legacy` and skipped;
`0123_citation_run_last_advance.sql` was the only file with `applyMigrations:
applied` logged. Confirmed with `\d citation_runs`:

```
last_advance_started_at | timestamp with time zone
```

Re-ran `scripts/migrate.ts` a second time (checksum now `verified`, no
re-execution logged - `migrate: complete` with nothing applied) and
separately piped the raw migration SQL into `psql` a second time directly:

```
NOTICE:  column "last_advance_started_at" of relation "citation_runs" already exists, skipping
ALTER TABLE
```

Both confirm the migration is idempotent on replay, at both the
ledger-checksum layer and the raw-SQL layer. The container
(`vc-pg-test`) was removed immediately afterward (`docker rm -f
vc-pg-test`), and the Docker Desktop service (which was not running before
this session and was started only for this verification) was stopped
afterward too.

## Constraints honored

- `citation_runs_one_active_per_brand` untouched.
- `AUTOMATIC_RUN_WINDOW_MS` / `AUTOMATIC_RUN_MAX_PER_WINDOW` (the B6a-10
  rate bound) untouched.
- `server/lib/factAgent/v2/runFactSheetRefresh.ts`,
  `server/lib/onboardingAutopilot.ts`, and `server/lib/llmPricing.ts` were
  not modified (the latter two already carried unrelated uncommitted
  changes from other work in this branch, pre-existing before this task
  started).
