# V0 — Orchestrator findings (verified against the live production database)

These are findings I established directly, not delegated. Every claim below was
checked against `glaljfmdulqeijirsyxs` (the project `.env` actually points at) or
against code, on 2026-08-31.

## Ground truth established

| Fact                                   | Value                                                                                                                               | How verified                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Project the app targets                | `glaljfmdulqeijirsyxs` ("venturecite", ACTIVE_HEALTHY, PG 17.6.1.104)                                                               | `.env` host matches `list_projects`                                           |
| `api_costs.est_cost_cents`             | still `integer`, default 0, NOT NULL                                                                                                | `information_schema.columns`                                                  |
| Policies on `api_costs`                | `api_costs_outbox_worker_insert` (INSERT), `api_costs_outbox_worker_select_key` (SELECT), both for role `venturecite_outbox_worker` | `pg_policy`                                                                   |
| Other dependencies on `est_cost_cents` | **none** — no index, view, constraint, or trigger                                                                                   | `pg_index` / `pg_constraint` / `pg_trigger` / `pg_depend` query returned `[]` |
| Migrations 0122/0123/0124 applied?     | **No.** Highest applied is `0122_signup_grants_beta.sql` @ 2026-08-28 05:35:41                                                      | `public.schema_migrations`                                                    |
| Production Supabase ledger             | one row, `remote_schema`                                                                                                            | `supabase_migrations.schema_migrations`                                       |

## F-V0-01 | none (confirmation) | migrations/0122_api_costs_cost_precision.sql

The policy 0122 recreates is equivalent to the one production holds. I diffed the
recreated `WITH CHECK` against the live `pg_policy.polwithcheck`:

production: `((user_id)::text = NULLIF((SELECT current_setting('venturecite.outbox_user_id', true)), ''::text)) AND (service <> ''::text) AND (tokens_in >= 0) AND (tokens_out >= 0) AND (est_cost_cents >= 0) AND (idempotency_key IS NOT NULL)`

0122 recreates the same six conjuncts, same role, same command (INSERT / `polcmd='a'`).
No drift. The `(select current_setting(...))` InitPlan wrapper from 0113 is preserved.

Additionally: nothing else in the database depends on `est_cost_cents`, so
dropping the one policy is sufficient to unblock `ALTER COLUMN ... TYPE`, and
no index or view will be silently dropped by the rewrite. This is the specific
failure that broke the earlier version of 0122; it is now settled against the
real schema rather than against a throwaway database.

## F-V0-02 | none (confirmation) | server/lib/onboardingAutopilot.ts

`git diff origin/main HEAD -- server/lib/onboardingAutopilot.ts` is **empty**.
The autopilot hotfix that is live in production (`569f746`) is byte-identical to
what this branch carries. Merging the branch cannot regress the fix that stopped
the runaway citation loop. I checked this specifically because the branch
predates that hotfix and an independent fix to the same file was the obvious
regression risk.

## F-V0-03 | none (confirmation) | scripts/migrationRelease.ts:17-23

Production migrations run `npm run db:migrate:release`, which sets
`NODE_ENV=production` and `--release`, which selects `ledgerMode:
"application-only"`, which **skips** `reconcileSupabaseMigrationLedger`.

This matters: production's `supabase_migrations.schema_migrations` holds a single
`remote_schema` row, so if the reconcile path ever ran against production it
would report every one of the 130+ root migrations as `missing:` and throw before
applying anything. It cannot run there. The release path also requires
`CONFIRM_PRODUCTION_MIGRATIONS=venturecite-production`.

`npm start` and `npm run build` do not run migrations. There is no
`postinstall`/`prestart` hook that touches the database.

## F-V0-04 | high | supabase/migrations/ (three files) — MERGE BLOCKER, not a production risk

`origin/main` is **2 commits ahead** of this branch. One of them (`09077cc`) added
`migrations/0122_signup_grants_beta.sql`, which is already applied in production.
This branch independently created `migrations/0122_api_costs_cost_precision.sql`.

The duplicate root number `0122` is **not** the problem — root numbers are
already non-unique by design (0094-0100 each carry two files) and the application
runner keys `public.schema_migrations` on filename, which stays unique.
`scripts/syncSupabaseMigrations.mjs:60-66` derives the Supabase mirror version
from **ordinal position**, precisely to tolerate this.

The problem is that ordinal positions shift when the two branches combine. I
computed the post-merge sorted list (133 files):

| ordinal | correct version post-merge | file                                 | branch/main currently ships               |
| ------- | -------------------------- | ------------------------------------ | ----------------------------------------- |
| 130     | `20260421000130`           | `0122_api_costs_cost_precision.sql`  | `20260421000130` — correct                |
| 131     | `20260421000131`           | `0122_signup_grants_beta.sql`        | main ships `20260421000130` — **wrong**   |
| 132     | `20260421000132`           | `0123_citation_run_last_advance.sql` | branch ships `20260421000131` — **wrong** |
| 133     | `20260421000133`           | `0124_rls_defence_in_depth.sql`      | branch ships `20260421000132` — **wrong** |

Git will report **no conflict** on merge, because the filenames differ. The
mirror is simply wrong afterwards, and two files would share version
`20260421000130`.

Failure mode is loud, not silent, and that is the saving grace:

- CI runs `npm run supabase:migrations:check` (.github/workflows/ci.yml:47-48),
  which regenerates and diffs. It fails.
- `assertUniqueDestinationVersions` (syncSupabaseMigrations.mjs:73-95) fails on
  the duplicate version independently.
- Locally, `supabase start` / `supabase db reset` would die with
  `duplicate key value violates unique constraint schema_migrations_pkey`.

**No production impact.** Production's Supabase ledger holds only `remote_schema`
and never references these version numbers; the application runner never reads
`supabase/migrations/`.

**Fix:** merge or rebase `origin/main` into the branch first, then run
`npm run supabase:migrations:sync`, and commit the three renamed mirror files.
Do not hand-edit the names.

Verified: `npm run supabase:migrations:check` exits **0** on the branch as it
stands today, so this only bites at merge time.

## Gates run by the orchestrator

| Gate                                | Result                                                      |
| ----------------------------------- | ----------------------------------------------------------- |
| `npm run check`                     | exit 0 (tsc + tour-target verification, 22 targets present) |
| `npm run supabase:migrations:check` | exit 0                                                      |

## F-V0-05 | REFUTES V1's blocker | api_costs data profile

V1 returned `NOT SAFE`, blocking on: "0122 can fail on legal existing integer
values outside the `numeric(12,6)` range. The repository has no production
min/max proof." That is the correct question and it cannot be answered from
source. I answered it from production:

| measure                                          | value    |
| ------------------------------------------------ | -------- |
| rows                                             | 21,394   |
| min(est_cost_cents)                              | 0        |
| max(est_cost_cents)                              | 10       |
| rows >= 1,000,000 (would overflow numeric(12,6)) | **0**    |
| rows recording 0                                 | 16,670   |
| pg_total_relation_size                           | 8,216 kB |

`numeric(12,6)` holds up to 999999.999999. The largest value present is 10. The
`USING est_cost_cents::numeric(12,6)` cast cannot fail and cannot lose
precision on any stored value. V1's blocker does not survive contact with the
data.

V1's related "needs a controlled lock window" (finding 15, high) is also
overstated at this size: the rewrite takes `ACCESS EXCLUSIVE` on an 8 MB table,
which completes in well under a second. The lock is real and should still be
taken outside a traffic spike, but this is not a maintenance-window change.

Correction to the brief: I told all seven agents api_costs held "roughly 3,500
historical rows". The real figure is 21,394 rows, 16,670 of them zero. The
premise was wrong; the conclusion is unaffected because the table is still small
and the maximum is still 10.

## F-V0-06 | REFUTES V5's outage risk | RLS cannot restrict the application

V5 returned `SAFE WITH CONDITIONS`, naming "the concrete outage risk is
`job_leases` with RLS enabled and no policy" and correctly marking the
application's effective role `UNSETTLED-NEEDS-DB`. Settled from production:

| fact                            | value                                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL` user             | `postgres.glaljfmdulqeijirsyxs` (the `postgres` role via the pooler) |
| `postgres.rolbypassrls`         | **true**                                                             |
| owner of all 11 target tables   | `postgres`                                                           |
| `relforcerowsecurity` on all 11 | **false**                                                            |
| grants on `job_leases`          | `postgres`, `service_role` only — both have `rolbypassrls = true`    |

The application connection bypasses RLS unconditionally. Enabling RLS on
`job_leases` with zero policies cannot block the scheduler, because no role that
touches the table is subject to RLS. The nine `SELECT` policies are dormant:
`venturecite_entity_request` is referenced by no server code, and
`server/data/restrictedRequestTransaction.ts` allows only `venturecite_request`
and `venturecite_content_request`.

State this plainly rather than as a win: 0124 adds **no protection today**. It is
scaffolding for a future role migration that has not happened. It is safe, and
it is currently inert.

`venturecite_runtime` exists with `rolcanlogin = true` and
`rolbypassrls = false`. Nothing references it. If the connection string is ever
switched to that role, RLS becomes live everywhere at once and these dormant
policies — plus roughly 60 tables that have RLS enabled with zero policies —
start denying queries. That is a future trap worth recording.

## F-V0-07 | low (advisor rationale) | migrations/0124_rls_defence_in_depth.sql:1-15

0124's header justifies enabling RLS on `job_leases` by citing the Supabase
Security Advisor lint `rls_disabled_in_public`. I ran the advisor against
production: it reports ~60 `rls_enabled_no_policy` INFO lints and one auth
warning, and **no** `rls_disabled_in_public` entry for `job_leases`.

So the stated rationale does not match what the advisor currently reports, and
the change's net effect on the advisor is to add one new `rls_enabled_no_policy`
INFO for `job_leases` while removing nine (the tables that gain policies). Not a
defect in the SQL — the migration is still safe — but the comment asserts a
motivation the tool does not currently support.

## F-V0-08 | informational, downgraded from V4's "high" | five alert-setting methods

V4 reported as `high` that `createAlertSetting`, `getAlertSettings`,
`getAlertSettingById`, `updateAlertSetting`, and `deleteAlertSetting` were
dropped from `IStorage`. The removal is real and I confirmed it. The severity is
not.

I searched every `.ts`/`.tsx` file on `origin/main` for callers: the only file
outside `server/storage.ts` that mentions any of the five is
`server/databaseStorage.ts` — the implementation itself. There is no route, no
client call, and no test. They were already dead on `main`. Deleting them
removes dead code and cannot produce the `TypeError` V4 describes, because
nothing calls them.

V4-02 stands and is the finding that matters: the storage surface gate compares
against a branch-local baseline that was rewritten during the decomposition, so
it cannot detect a method lost _during_ that work. It would pass on a real loss.

## F-V0-09 | medium | test suite is timing-sensitive under CPU contention

Running the full suite while seven Codex agents were active produced 4 failures
across 3 files, all with 5-10 second durations characteristic of timeouts:

- `tests/unit/communityEngagementSaveAndDelete.test.tsx`
- `tests/unit/onboardingActivationService.test.ts`
- `tests/unit/stripeTestModeBanner.test.ts` (2 cases)

Re-running those three files in isolation: **21 passed, exit 0**. The failures
were load-induced, caused by me, not by the code. Recorded because the same
contention exists on a busy CI runner.

Also corrected: `vitest run` exited **1** on the loaded run, as it should. An
earlier reading of "exit 0" was the trailing `grep` in my own compound command,
not the test runner. There is no exit-code-swallowing defect.

## F-V0-10 | BLOCKER (live production defect, pre-existing) | server/outbox/outboxRepository.ts:107,112

`claimNext` is broken for every possible input, and the production outbox queue
has been stalled since at least 2026-08-23 as a result.

### The defect

The claim query binds its kind list like this:

```
where kind = any(${claimKinds}::text[])
```

Drizzle interpolates a JavaScript array into a `sql` template as a
comma-separated parameter list, not as one array parameter. The rendered SQL is
`any($1, $2::text[])` — a record — rather than `any($1::text[])`.

I reproduced both cases against a real Postgres, with role grants intact:

| `kinds` length             | result                                           |
| -------------------------- | ------------------------------------------------ |
| 1                          | `malformed array literal: "content_cost.record"` |
| 2 (**production's shape**) | `cannot cast type record to text[]`              |

The scheduled `content-cost-outbox-drain` registers exactly two handlers
(`server/outbox/contentCostOutboxDrain.ts:41-43`), so `handledKinds()` returns a
two-element array and the drain throws on **every** run.

### Production evidence

`public.outbox_commands` on the live database:

| kind                   | status  | attempt_count | created_at       |
| ---------------------- | ------- | ------------- | ---------------- |
| `openai.start_llm_job` | pending | 0             | 2026-08-25 15:34 |
| `openai.start_llm_job` | pending | 0             | 2026-08-24 13:53 |
| `content_cost.record`  | pending | 0             | 2026-08-23 15:20 |

Three rows, all `pending`, all `attempt_count = 0`, all `available_at` days in
the past, `max_attempts = 25`, no `last_error_code`. There are no `succeeded`,
`processing`, or `dead_letter` rows at all, and no code deletes outbox rows, so
this is the complete history, not a retention artifact.

`attempt_count = 0` is the proof: a worker that claimed and failed would have
incremented it. Nothing has ever been claimed. Both stranded kinds are exactly
the two the scheduled drain handles.

### Scope

- `content_cost.record` — cost ledger entries are not being recorded through the
  outbox path.
- `openai.start_llm_job` — LLM jobs are not being started through the outbox
  path.

### Not caused by this branch

`git diff origin/main HEAD -- server/outbox/outboxRepository.ts` is **empty**.
This code is exactly what production runs today. The branch did not introduce
it — the branch's new test
`tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts` (added in
`b642c87`, absent from `origin/main`) is what exposed it. That is the test
earning its keep.

### Proven fix

Bind the array as a single parameter. Verified against the same database:

| form                               | result                                     |
| ---------------------------------- | ------------------------------------------ |
| `any(${kinds}::text[])`            | FAIL — `cannot cast type record to text[]` |
| `any(${sql.param(kinds)}::text[])` | **OK**                                     |

Drizzle's `inArray()` would also work. Both call sites need it
(`outboxRepository.ts:107` and `:112`).

## F-V0-11 | high | test isolation: a migrations test destroys role grants mid-run

The integration suite is order-dependent in a way that changes its own results.

Observed sequence:

1. `npx supabase db reset` → `postgres` holds **two** membership rows for
   `venturecite_outbox_worker`: `(admin_option=t, set_option=f)` and
   `(admin_option=f, set_option=t)`. This matches production exactly.
2. Run the integration suite → 2 failures.
3. Inspect grants again → the `set_option = t` row is **gone**.
4. Re-run → 4 failures, now failing earlier with
   `permission denied to set role "venturecite_outbox_worker"` (SQLSTATE 42501).

Something under `tests/migrations` drops and recreates the roles without
restoring the `SET` grant. Later tests that need `SET LOCAL ROLE` then fail for a
reason that has nothing to do with what they assert, and the failure count
changes between runs of the same code.

This also explains the earlier confusion in this audit: the same suite produced
4 failures, then 2, then 4, with no source change.

Related: `migrations/0112_transitional_request_role_set_option.sql:55-60` grants
`SET TRUE` to `current_user` — whoever runs the migration. That makes the grant
depend on which role applies migrations rather than on a named application role.

## F-V0-12 | medium | 0124 creates a role that cannot be SET into

Migration 0124's stated purpose is to let a future route do
`SET LOCAL ROLE venturecite_entity_request` and read through the nine new
policies. After a fresh local build, the memberships are:

| role                          | admin_option | set_option |
| ----------------------------- | ------------ | ---------- |
| `venturecite_request`         | t / f        | f / **t**  |
| `venturecite_content_request` | t / f        | f / **t**  |
| `venturecite_outbox_worker`   | t / f        | f / **t**  |
| `venturecite_entity_request`  | t            | **f only** |

0112 covers only the three original roles, so the new role never receives the
`SET` grant. Any route that tries to use it will fail with SQLSTATE 42501, the
same error seen above.

Not a break today — nothing sets that role — but the migration does not deliver
the capability its own header describes.

## F-V0-13 | confirmation | the three migrations apply and take effect

Applied and verified against a real Postgres 17 (fresh local Supabase, all 133
migrations):

| migration | verified state                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| 0122      | `est_cost_cents = numeric(12,6)` **and both policies present**, including `api_costs_outbox_worker_insert`           |
| 0123      | `citation_runs.last_advance_started_at` exists                                                                       |
| 0124      | `job_leases.relrowsecurity = true`; 10 `*_entity_request_select` policies; role `venturecite_entity_request` created |

The surviving `api_costs_outbox_worker_insert` policy is the important one: it
proves the drop → alter → recreate sequence completes, which is exactly the
failure that broke the earlier version of 0122.

## F-V0-14 | medium | `db:assert-migrations` cannot detect a stale volume

`npm run db:assert-migrations` reported "All 133 migrations are applied" against
a database whose actual role grants were stale — the ledger was complete while
the schema state was not. The check compares ledger rows to files and never
inspects the objects the migrations create.

The CI comment at `.github/workflows/ci.yml:112-115` claims this check "turns a
silent partial schema into a clear failure". It does so only for a missing
ledger row, not for a database whose ledger is complete but whose state has
drifted.

## Gates, re-run cleanly

| Gate                                            | Result                                           |
| ----------------------------------------------- | ------------------------------------------------ |
| `npm run check`                                 | exit 0                                           |
| `npm run lint`                                  | exit 0 (0 errors, 1034 warnings)                 |
| `npm run format:check`                          | exit 0                                           |
| `npm run supabase:migrations:check`             | exit 0                                           |
| `npm test` (unit, machine loaded)               | exit 1 — 4 timeouts; **21/21 pass in isolation** |
| integration + migrations (fresh local Supabase) | exit 1 — 154/156; the 2 failures are F-V0-10     |
