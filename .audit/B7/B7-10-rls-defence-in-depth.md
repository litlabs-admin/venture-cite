# B7-10 — RLS defence-in-depth

Scope: phase B7, RLS as a second, independent layer under the
application-level ownership checks covered in
[`.audit/B7/B7-01-tenant-isolation-tests.md`](B7-01-tenant-isolation-tests.md).

## 1. The carried-forward segfault finding is stale

Claim under test: "a PostgreSQL 17.6 segfault on `GRANT <role> TO
current_user` (signal 11) blocks 24 RLS tests."

**Verdict: stale. Already fixed before this task started, in a prior commit.
Refuted by running the 24 tests to a clean pass.**

Evidence:

- The segfault is real and is still documented at
  `tests/integration/contentRequestRls.test.ts:136`, but the fix sits right
  next to the comment: the grantee is read with `select current_user as
grantee` first, then interpolated as a quoted **literal identifier** into
  `grant ... to "${grantee}" with inherit false, set false, admin true` -
  never the literal SQL form `grant ... to current_user`, which is the form
  that crashes. `server/lib/requestRoleMembership.ts` and
  `migrations/0112_transitional_request_role_set_option.sql` use the same
  literal-identifier shape, and `tests/unit/requestRlsMigrationShape.test.ts`
  asserts `expect(migration).not.toMatch(/TO current_user/i)` against 0112.
  A repo-wide search (`rg "to current_user"` across `*.ts` and `*.sql`)
  found no remaining literal use anywhere.
- `git log` on the test file shows the fix landed in commit `2ead1eed`
  ("test: model direct role grants locally", Aug 21), before this session
  and before the finding was carried forward.
- Ran it for real: fresh `npx supabase start -x
studio,imgproxy,edge-runtime,logflare,vector,supavisor`, then
  `LOCAL_SUPABASE_TEST=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
npx vitest run --no-file-parallelism tests/integration/contentRequestRls.test.ts`:

  ```
  Test Files  1 passed (1)
       Tests  24 passed (24)
  ```

  All 24, the exact count the finding named, pass clean. No recovery-mode
  crash, no skipped tests.

No workaround was needed because one was already in place. This matches the
task brief's own expectation: five of six carried-forward findings in this
program turned out to be already fixed or wrong.

## 2. Full RLS state before this task's changes

Read every migration matching `rg -l 'POLICY' migrations/` (`0098`, `0099`,
`0102`, `0104`, `0105`, `0113`, `0118`, `0122`) plus every `ENABLE ROW LEVEL
SECURITY` statement, and cross-checked against the live database
(`pg_class.relrowsecurity`, `pg_class.relforcerowsecurity`, `pg_policies`) on
a freshly migrated instance - migration text describes intent, the catalog
is what actually holds.

**73 tables in `public`. Before this task: 72 had RLS enabled, 1
(`job_leases`) did not. Of the 72, 12 had at least one policy; 60 had RLS
enabled with zero policies.**

- `0081_enable_rls_all_public_tables.sql` turned on RLS for every table that
  existed at that point, with **zero policies**, specifically so
  anon/authenticated (the PostgREST/Supabase Data API roles) get
  default-deny. Every later `CREATE TABLE` migration (`0087`, `0088`,
  `0094`-`0099`, `0102`, `0116`) repeats `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` inline as an established habit - except `0119_job_leases.sql`,
  which didn't.
- `0120_revoke_data_api_grants.sql` separately revokes all privileges from
  `anon`/`authenticated` on every table, current and future (`ALTER DEFAULT
PRIVILEGES`). This means the "RLS enabled, zero policies" tables are
  doubly closed to the Data API path: no privilege _and_ no policy.
- The 12 tables that already had real policies fall into two groups:
  - `venturecite_request` (general request role, established in `0096`):
    `brands` (select/insert/update), `users` (select/update).
  - `venturecite_content_request` (content-generation slice, established in
    `0097`, deliberately locked to exactly `{brands, articles,
article_revisions, distributions, keyword_research,
content_generation_jobs}` - `0097` raises `'venturecite_content_request
has privileges outside the content slice'` if that set is ever widened,
    verified by actually tripping it, see §3): `articles` (4),
    `distributions` (3), `keyword_research` (3), `article_revisions` (2),
    `brand_prompts` (1, read-only, brand-deletion preview), `citation_runs`
    (1, same), `content_generation_jobs` (1, read-only - writes go through
    `private.request_enqueue_content_generation`, a SECURITY DEFINER
    function, not raw table grants).
  - `venturecite_outbox_worker`: `api_costs` (2), `llm_jobs` (2),
    `outbox_commands` (1, the only table with `FORCE ROW LEVEL SECURITY`).
- These restricted roles are **only** assumed where
  `server/data/restrictedRequestTransaction.ts`'s `setRestrictedRequestContext`
  or an equivalent `set local role` is called - traced to exactly seven
  repositories (`contentRequestArticleRepository`,
  `contentRequestDistributionRepository`, `contentRequestJobRepository`,
  `contentRequestKeywordRepository`, `contentRequestRevisionRepository`,
  `requestBrandRepository`, `requestUserRepository`) plus the outbox
  adapters. Every table those seven touch already had exactly the right
  policy for exactly the right command before this task - no gap inside the
  already-migrated slice.
  - `docs/OPERATIONS.md` confirms this is deliberate and incomplete by
    design: "Do not replace the production `DATABASE_URL` with the
    dedicated runtime login yet. Legacy routes and system workers still
    require the current application-owner connection." The
    owner-equivalent connection is not subject to RLS (not `FORCE ROW LEVEL
SECURITY`, and it isn't a member of any restricted role by default in
    production). So for every route that does **not** call
    `setRestrictedRequestContext`, RLS has zero effect today - it neither
    helps nor hurts. That is the honest starting point for what "gap" means
    here: not "RLS disabled," but "RLS present with no policy, and no route
    connects under a role that would need one yet."
- `server/lib/ownership.ts`'s `loadEntityThroughBrand` (the function
  B7-01 exercised for real, no mocks) backs 11 entity types. Two
  (`articles`, `keyword_research`) are inside the migrated content slice
  above. The other nine - `competitors`, `faq_items`, `listicles`,
  `bofu_content`, `brand_hallucinations`, `brand_fact_sheet`,
  `brand_mentions`, `community_posts`, `citation_quality` - had RLS enabled
  since `0081` with **zero** policies for any restricted role, and none of
  their routes assume a restricted role today. This is the gap this task
  closes.
- `job_leases` (`0119`) is the one table that never got `ENABLE ROW LEVEL
SECURITY` at all. It is a distributed-lock table (`lease_key`,
  `holder_token`, `acquired_at`, `expires_at`, `heartbeat_at`) with no
  user/brand column - not tenant data - but it broke the "every public
  table has RLS" invariant that `0081`'s design (and the Supabase Security
  Advisor's `rls_disabled_in_public` lint) otherwise holds everywhere else.

## 3. Gaps closed - `migrations/0124_rls_defence_in_depth.sql`

Mirrored with `node scripts/syncSupabaseMigrations.mjs` (not hand-written) to
`supabase/migrations/20260421000132_0124_rls_defence_in_depth.sql`; `node
scripts/syncSupabaseMigrations.mjs --check` passes.

### 3a. `job_leases` - enable RLS, no policy

`ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;` with no policy.
Justification: not tenant data, so there's no "legitimate access" to carve a
policy for; the only writer is the owner-equivalent connection, which RLS
does not restrict regardless of policy count; and `0120` already revoked all
anon/authenticated grants on this table. This is the same default-deny shape
`0081` used for every other table at the time, applied to the one table that
missed it. No outage risk: nothing that currently reads or writes this table
loses access.

### 3b. Nine `loadEntityThroughBrand` tables - a new role, not a reused one

**First attempt was wrong, caught by the codebase's own safety net.**
The obvious move was to grant these nine tables to the existing
`venturecite_content_request` role. Doing that and replaying `0097`
(exactly what `tests/integration/contentRequestRls.test.ts`'s `beforeAll`
does on every run) threw:

```
error: venturecite_content_request has privileges outside the content slice
```

`0097`'s own self-check exists precisely to keep that role's reach fixed at
six tables. Widening it would have been exactly the kind of scope creep
`0122`'s near-miss (see §5) shows this schema can't tolerate silently. So
`0124` instead creates a new role, `venturecite_entity_request`, with the
same defensive shape `0096`/`0097` use for theirs:

- Safe attributes (`NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS`), tracked by a managed-by-migration role
  comment so a future migration can tell it apart from a hand-created role.
- A privilege allow-list self-check, scoped to exactly these nine tables,
  so a _future_ migration cannot silently widen this role's reach either -
  the same protection `0097` already gave `venturecite_content_request`.

Policies: SELECT-only (matches what `loadEntityThroughBrand` does - it never
writes), one per table, each an `EXISTS` join to `brands` on `brand_id`,
scoped by `brands.user_id = (select current_setting('venturecite.user_id',
true))` and `brands.deleted_at IS NULL` - the exact shape `0099` and `0113`
established for `keyword_research`, including the `(select
current_setting(...))` wrapper that makes it an InitPlan instead of a
per-row re-evaluation. Column grants are full-row (`GRANT SELECT ON
<table>`, no column list), because `loadEntityThroughBrand` does `select()`
with no projection - a narrower grant would not actually mirror the check it
replicates.

**Second bug, also caught by running it, not by inspection:** the policies'
`EXISTS` subquery reads `public.brands`, but `venturecite_entity_request` had
no privilege on `brands` and `brands` has RLS enabled with no policy for
that role - so the join would have silently returned zero rows for
_everyone_, making every one of the nine policies fail closed
unconditionally. Fixed by granting `SELECT (id, user_id, deleted_at) ON
public.brands` (the same three columns `0097` grants
`venturecite_content_request` for the identical reason) and adding
`brands_entity_request_select`, mirroring `brands_content_select`.

**Honesty about what this does and doesn't defend today:** these nine
policies are dormant on the application's current connection, exactly the
way `0096` shipped `venturecite_request` "unused" ("Do not connect
application routes until the production role audit passes"). No route
currently does `set local role venturecite_entity_request`, so this is not
yet a live second layer for the nine routes that still call
`server/lib/ownership.ts`'s `loadEntityThroughBrand` - it is the SQL made
ready for when/if that route migration happens, following the exact
precedent this codebase already used once. Migrating those nine routes to
an actor-bound repository is out of scope for this task and is not implied
to be done. The migration file and this report both say so.

## 4. Proof

New file: `tests/integration/rlsDefenceInDepth.test.ts` (22 tests, gated
the same way as `contentRequestRls.test.ts` - `LOCAL_SUPABASE_TEST=1` +
`TEST_DATABASE_URL`).

- `job_leases`: RLS enabled, zero policies (matches design).
- Each of the nine tables: RLS enabled, exactly one SELECT policy for
  `venturecite_entity_request`.
- Seeded two users/brands and one row per table per brand. Connecting as
  `venturecite_entity_request` with `venturecite.user_id` set to user A
  returns only A's row; set to user B, only B's row; unset, nothing.
- The owner-equivalent connection (`ownerPool`, no role switch) still reads
  both tenants' rows unfiltered after the migration - proof this did not
  turn a security gap into an outage for the only connection that currently
  matters.
- **Drop-and-fail proof, all nine, actual failure text captured:** for each
  policy, drop it, then run the same "user A reads its own row" query. In
  every case the query didn't error - it silently returned zero rows for
  the row's own owner:

  ```
  AssertionError: expected [] to deeply equal [ 'competitors' row id ]
  ```

  i.e. dropping the _only_ policy on a table that has RLS enabled makes
  Postgres RLS fail closed for that role/command, not open - the row's own
  tenant loses access too. That is the actual, verified behavior (not an
  assumption): a table with RLS enabled and no matching policy denies
  everyone except the RLS-exempt owner connection. Restored immediately
  after each drop (`finally` block re-runs the migration file, which is
  itself idempotent - verified by applying it twice in `beforeAll`), and
  confirmed access returned before moving to the next table.

- One pre-existing test needed updating, not because it was wrong but
  because reality changed under it:
  `tests/integration/requestRlsFoundation.test.ts`'s exhaustive policy-name
  assertion for `brands`/`users` matches on `policyname like '%_request_%'`,
  which now also (correctly) catches the new
  `brands_entity_request_select`. Added it to the expected list with a
  comment explaining why a second, unrelated role's policy shows up in a
  query that was written before that role existed.

Full battery, run together against one fresh database so ordering/locking
interference would show up if it existed:

```
$ LOCAL_SUPABASE_TEST=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  npx vitest run --no-file-parallelism \
  tests/integration/rlsDefenceInDepth.test.ts \
  tests/integration/contentRequestRls.test.ts \
  tests/integration/ownershipTenantIsolation.test.ts \
  tests/integration/requestRlsFoundation.test.ts \
  tests/unit/requestRlsMigrationShape.test.ts

 Test Files  5 passed (5)
      Tests  107 passed (107)
```

`npx tsc --noEmit -p .` clean; `npx eslint
tests/integration/rlsDefenceInDepth.test.ts
tests/integration/requestRlsFoundation.test.ts` exit 0; `npx prettier --check`
on both, clean. Per this task's own scoping rule, only these files' checks
were run, not the full suite or the full lint/typecheck-adjacent test run of
unrelated files other agents are mid-edit on.

## 5. Fresh-volume replay (Step 4)

`0122_api_costs_cost_precision.sql`'s own guard against the exact failure
mode B7-01 hit (`ALTER COLUMN` on a column a policy depends on, without
dropping the policy first) is still in place and was exercised for real:
this task's fresh-volume replay applies `0099` (creates
`api_costs_outbox_worker_insert`, `WITH CHECK` referencing
`est_cost_cents`), then `0113` (rewrites it with the InitPlan wrapper), then
`0122`, which does `DROP POLICY IF EXISTS
api_costs_outbox_worker_insert ... ALTER COLUMN est_cost_cents TYPE
numeric(12,6) ... CREATE POLICY api_costs_outbox_worker_insert` (recreating
0113's shape, not 0099's older one) - every run below applied it without
error, confirming that fix (already committed before this task) still
holds and this task's own migration doesn't disturb it.

One real finding during this step: `npx supabase stop --no-backup` followed
immediately by `npx supabase start` does **not** guarantee a fresh volume by
itself in this environment - the named Docker volume
(`supabase_db_venturecite`) can survive the stop, and `start` then replays
every migration file on top of whatever state that volume already held
(harmless for idempotent migrations, but it let a stale generated mirror
file mask a real bug - see below). `docker volume ls | grep venturecite`
after `stop` is the actual check; when it lists the volume, `docker volume
rm supabase_db_venturecite supabase_storage_venturecite` before `start`
forces genuine re-initialization. This is worth carrying forward as a
correction to the stop/start recipe used across this program, not treated
as a one-off.

That volume-reuse behavior is also what surfaced a second real bug in this
task's own work, not a pre-existing one: after fixing the
`venturecite_content_request` scope violation in §3b by rewriting
`migrations/0124...sql`, I forgot to regenerate
`supabase/migrations/20260421000132_...sql` - the file `supabase start`
actually reads. It still held the old, wrong grants. `node
scripts/syncSupabaseMigrations.mjs` refuses to silently overwrite an
already-generated mirror file ("immutable file differs"), which is the
correct policy for a _released_ migration; for this brand-new,
never-shipped file the fix was to delete it and regenerate
(`rm supabase/migrations/20260421000132_...sql && node
scripts/syncSupabaseMigrations.mjs`). `--check` passes now, and every run
after that point applied the corrected migration.

Final, confirmed-fresh run, immediately followed by shutdown:

```
$ npx supabase stop --no-backup
$ docker volume ls | grep venturecite   # (no output - confirmed clean)
$ npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
# ... all 133 migration files applied, in order, zero errors,
#     including "Applying migration 20260421000132_0124_rls_defence_in_depth.sql..."
$ LOCAL_SUPABASE_TEST=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  npx vitest run --no-file-parallelism \
  tests/integration/rlsDefenceInDepth.test.ts tests/integration/contentRequestRls.test.ts \
  tests/integration/ownershipTenantIsolation.test.ts tests/integration/requestRlsFoundation.test.ts \
  tests/unit/requestRlsMigrationShape.test.ts
 Test Files  5 passed (5)
      Tests  107 passed (107)
$ npx supabase stop --no-backup
{"message":"Stopped supabase local development setup."}
$ docker ps
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
# (zero rows)
```

**Container discipline:** Docker was already running at task start. Local
Supabase was started and stopped five times total during this task (initial
verification, first buggy-migration iteration, mirror-desync diagnosis, the
fix, and the final confirmed-fresh run) - each time stopped again before
moving to the next step, per "start containers only when a phase needs
them, stop them immediately after." Confirmed stopped with `docker ps`
(zero rows) at the end of this task.

## Files changed

- `migrations/0124_rls_defence_in_depth.sql` (new)
- `supabase/migrations/20260421000132_0124_rls_defence_in_depth.sql`
  (new, generated - do not hand-edit)
- `tests/integration/rlsDefenceInDepth.test.ts` (new, 22 tests)
- `tests/integration/requestRlsFoundation.test.ts` (updated: one exhaustive
  policy-list assertion now includes the new `brands_entity_request_select`)

No other files were touched.
`server/routes/prompts.ts`, `server/routes/dashboard.ts`, and `client/` were
not touched, per this task's boundary. Everything else showing in `git
status --porcelain` (`client/*`, `server/routes/*` other than the two named
above, `server/services/`, other `.audit/B7/*.md`, other `tests/unit/*`)
belongs to other agents' concurrent work in this shared worktree and was
left alone.
