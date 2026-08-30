# V8 production release decision

Audit date: 2026-08-31.

This report reconciles V0 through V7. V0 wins where it measured production.

## Decision

**SHIP AFTER LISTED FIXES.** Do not deploy this branch before the outbox-claim fix, citation-completion fix, `TIMESTAMPTZ` schema correction, and migration-test isolation fix land. The production data proves that `0122` fits every stored value. The current application pool bypasses the new RLS policies. The merge-only Supabase mirror conflict has a deterministic repair. The production outbox drain cannot claim its two handled kinds. A process restart can still charge for duplicate onboarding citation runs after a terminal citation write. The automatic run cap limits the cost. Both application defects spend money or prevent work from completing.

Required changes before the merge step are:

1. Bind `claimKinds` as one PostgreSQL array parameter in both clauses of `server/outbox/outboxRepository.ts`. Use `sql.param(claimKinds)` or `inArray()`. Keep the real Postgres claim test.
2. Persist `autopilot_status = 'completed'` and `autopilot_step = 3` before `populateBrandDashboard()`. Use a write that fails the autopilot call on failure. Do not use the current best-effort `setAutopilot()` helper for this boundary. Delete the later duplicate completion write.
3. Change `shared/schema/citations.ts` to declare `last_advance_started_at` with `withTimezone: true`.
4. Make the migration tests restore every required role membership, including the `SET` membership for `venturecite_outbox_worker`. The fresh integration run must not change its own role state.
5. Add a focused restart-boundary test. The test must complete a citation run, stop before dashboard work, invoke resume, and prove that no new `auto_onboarding` run starts.

## Reconciled conflicts

### `numeric(12,6)` range

V1 and V3 correctly identified a source-level failure mode. V0 measured the live table. It has 21,394 rows, a minimum of 0, a maximum of 10, and zero values at or above 1,000,000. The cast therefore cannot overflow or lose stored precision. This is refuted as a release blocker. The rewrite lock remains real, but V0 measured an 8,216 kB table. Run the migration outside a traffic spike and monitor for a lock wait.

### `job_leases` RLS

V5 stated the correct conditional rule, but it could not see the live role. V0 measured the pool connection as `postgres` with `rolbypassrls = true`. That role owns all 11 target tables. Neither table forces RLS. `job_leases` grants exist only for bypass roles. Enabling RLS with no policy cannot stop the scheduler. The migration adds no current tenant protection. It prepares a future role change and remains dormant now.

### Removed alert-setting methods

V4 correctly found that five methods disappeared. V0 checked `origin/main` callers and found none outside their own implementation. No route, client path, or test can call them. The predicted production `TypeError` is refuted. V4-02 still stands. The storage gate baseline was rewritten after the removal, so it cannot prove that this decomposition kept every earlier method.

### Migration `0122` on main

V6-01 is wrong. This branch did not replace `0122_signup_grants_beta.sql`. It is two commits behind `origin/main`. Commit `09077cc` added the signup migration and contains no application code. The root migration runner keys on filename, not the numeric prefix. Merge `origin/main` first. Then regenerate the Supabase mirror. The source mirror files use ordinal versions, so the merge shifts the last three names. This is a merge blocker. It is not a production database failure.

### Generation request precedence

F1 is an accidental extraction change. Commit `12bfa29` removed the route-level status check while its message promised preserved behavior. The client has one caller at `client/src/pages/content.tsx:447-454`. That caller sends a non-empty keyword string, an industry, a type, and a valid content style. The UI does not expose Generate for `ready` articles. It shows only Cancel for `generating` articles. The form appears only for `draft` and `failed` articles. A normal client caller cannot send an invalid body for a disallowed article status. An external API caller can still observe 400 instead of 409. Record F1 and leave it unfixed for this release.

## Citation restart flaw

`advanceCitationRun()` can make the citation row terminal. The autopilot then waits up to 120 seconds in `populateBrandDashboard()` before it writes `completed`. A process failure in that window leaves the brand at `running_citations`. On the next resume, `getActiveCitationRuns()` ignores terminal rows. The `else` branch starts a new `auto_onboarding` citation run.

The current per-brand lease prevents overlap. It does not preserve the completion decision across a process failure. A crashed lease expires after 60 seconds.

| caller                             | production status                 | cadence                                                                                                |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `server/nitroBoot.ts:116`          | Active on Render production       | One call per process start.                                                                            |
| `server/scheduler.ts:793-801`      | Active on Render production       | Every minute by default.                                                                               |
| `server/routes/cron.ts:99-101`     | Callable by an authorized request | No runtime flag guards this endpoint.                                                                  |
| `.github/workflows/cron.yml:28-34` | Source-only evidence              | The workflow schedules an hourly request. No audit proves that its secrets currently reach production. |
| `server/index.ts:55-56`            | Development only                  | One local startup call when local safety permits it.                                                   |

`render.yaml:69-74` selects the in-process scheduler. Therefore the confirmed production cadence is one boot call plus one scheduler call each minute. The hourly workflow can add calls if its secrets work. It cannot increase the number of acquired per-brand runs beyond the lease and creation bounds.

The cost arithmetic is:

1. The scheduler offers 60 resume opportunities per hour.
2. The crashed per-brand lease limits new acquisitions to one each 60 seconds.
3. `runBrandPrompts()` counts both `cron` and `auto_onboarding` rows. It permits only three automatic creations per rolling hour.
4. A just-completed onboarding run already consumes one of those three creations.
5. The same 60-minute window therefore permits at most two duplicate paid runs.
6. One six-hour in-flight period permits at most 18 automatic creations. The first creation is the legitimate onboarding run. The remaining 17 creations are duplicate paid runs.
7. The initial `pending` onboarding run does not increment `autopilot_attempts`. The five failed-state recoveries do increment it. The automatic path therefore has six six-hour periods: the initial period and five recoveries.
8. The six periods permit at most `6 x 18 = 108` automatic creations. One creation is legitimate. The worst case is 107 duplicate paid runs over 36 hours. It requires a process failure in every completion window.

V6-02 is correct that the duplicate exists. It overstates the count when it omits the independent three-per-hour creation cap at `server/citationChecker.ts:43-44` and `:571-594`. The cap limits damage. It does not restore correctness.

The cheapest correct fix is to make the citation completion state durable before supplementary dashboard work. Write `completed` and step 3 before `populateBrandDashboard()`. Make that write fail the enclosing autopilot operation when it fails. The later dashboard work already does not define successful citation completion. Its own comment says that the weekly sweep can finish any missing supplementary data. This change can show a completed onboarding state before Mentions, Listicles, Perception, or Site Health finish. That visible timing change is acceptable because citation results already exist and the alternative charges the same user again.

Do not use a recent-terminal lookup in the `else` branch. It adds a timing rule and a cycle definition. It can also suppress an intended later run. Do not hold a transaction across citation providers and a 120-second dashboard operation. That transaction would increase lock time and still does not protect the prior terminal write.

This is a release blocker. The fix needs no migration and has a narrow testable boundary.

## Safety fact and proof

The release is safe from the `0122` numeric-overflow failure because every live value fits `numeric(12,6)`. V0 reached execution proof against production. Its measured maximum is 10. The type allows 999999.999999.

The restart-boundary fix is not yet proven at step 4. This task forbids server startup, database access, and test execution. The source proof reaches step 3. `advanceCitationRun()` returns done after a terminal run. `getActiveCitationRuns()` selects only `pending` and `running`. The current no-active branch calls `runBrandPrompts()`. The required focused test is the cheapest step-4 proof before merge.

## Consolidated findings

| ID                         | severity | area                        | one-line statement                                                                                     | status (CONFIRMED / REFUTED / DELIBERATE) | source report(s)                    |
| -------------------------- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------- |
| V0-10                      | blocker  | production outbox           | `claimNext()` passes handled kinds as a PostgreSQL record, so no cost or LLM outbox row is claimed.    | CONFIRMED                                 | V0 F-V0-10                          |
| V6-02                      | high     | onboarding citations        | A restart can create another paid onboarding citation run after the terminal run.                      | CONFIRMED                                 | V6 F-V6-02                          |
| V0-04, V1-14, V6-01        | high     | migration mirror            | Merging main requires regenerated Supabase mirror versions, but root filenames remain valid.           | CONFIRMED                                 | V0 F-V0-04, V1-14, V6 F-V6-01       |
| V1-12                      | high     | release order               | Fractional-cost writers require `0122` before the application deployment.                              | CONFIRMED                                 | V1-12                               |
| V3-001                     | high     | manual schema command       | `npm run db:push` can remove production objects outside the Drizzle schema.                            | CONFIRMED                                 | V3-001                              |
| V3-002                     | high     | E2E fixture                 | A loopback production database can pass the E2E cleanup guard.                                         | CONFIRMED                                 | V3-002                              |
| V0-11                      | high     | migration test isolation    | A migration test can remove the outbox worker `SET` grant and make later tests fail falsely.           | CONFIRMED                                 | V0 F-V0-11                          |
| V7-01                      | high     | route tests                 | 130 changed route registrations have no HTTP-level test.                                               | CONFIRMED                                 | V7 F-01                             |
| V7-02                      | high     | database tests              | A green normal suite can omit migrations, RLS, and tenant-isolation tests.                             | CONFIRMED                                 | V7 F-02                             |
| V0-09                      | medium   | test reliability            | The full suite can time out under CPU contention.                                                      | CONFIRMED                                 | V0 F-V0-09                          |
| V0-14                      | medium   | migration verification      | `db:assert-migrations` checks the ledger but cannot detect a stale database object.                    | CONFIRMED                                 | V0 F-V0-14                          |
| V1-11                      | medium   | schema declaration          | The shared citation timestamp lacks `withTimezone: true` while migration `0123` creates `TIMESTAMPTZ`. | CONFIRMED                                 | V1-11                               |
| V6-03, V3-003              | medium   | autopilot stall state       | The global six-hour sweep can falsely mark a healthy long citation run as failed.                      | CONFIRMED                                 | V6 F-V6-03, V3-003                  |
| V0-06, V5-01, V5-02, V1-04 | medium   | current RLS                 | The pool bypasses RLS, so `0124` neither protects current reads nor blocks `job_leases`.               | CONFIRMED                                 | V0 F-V0-06, V5 F-01, V5 F-02, V1-04 |
| V5-03                      | medium   | future entity role          | The new entity role intentionally permits reads and denies all writes.                                 | DELIBERATE                                | V5 F-03                             |
| V5-04                      | medium   | future RLS performance      | The future entity read path lacks a dedicated `brands(user_id)` index.                                 | CONFIRMED                                 | V5 F-04                             |
| V1-13, V5-05               | medium   | entity role validation      | `0124` does not validate memberships for a pre-existing entity role.                                   | CONFIRMED                                 | V1-13, V5 F-05                      |
| V0-12                      | medium   | entity role activation      | The migration grants no `SET` membership for `venturecite_entity_request`.                             | CONFIRMED                                 | V0 F-V0-12                          |
| V3-005                     | medium   | manual backfill             | `backfillMentionedBrands.ts` overwrites eligible rankings without a production guard.                  | CONFIRMED                                 | V3-005                              |
| V6-07                      | medium   | citation recovery           | The four-hour orphan threshold delays recovery of a dead active citation run.                          | DELIBERATE                                | V6 F-V6-07                          |
| V6-04                      | medium   | job observability           | The orchestrator reports `weekly-report-legacy` while the scheduler reports `weekly-report`.           | CONFIRMED                                 | V6 F-V6-04                          |
| V6-05                      | medium   | Nitro startup               | Nitro can accept traffic before asynchronous boot work completes.                                      | CONFIRMED                                 | V6 F-V6-05                          |
| V7-03                      | medium   | storage tests               | No test proves that every storage domain object is spread into `storage`.                              | CONFIRMED                                 | V7 F-03                             |
| V4-02                      | medium   | storage gate                | The current storage gate cannot detect the earlier five-method removal.                                | CONFIRMED                                 | V4-02                               |
| V7-04                      | medium   | foreign-key tests           | No test checks the four new Drizzle foreign-key declarations.                                          | CONFIRMED                                 | V7 F-04                             |
| V7-05                      | medium   | schema tests                | No test checks shared-schema `.notNull()` metadata.                                                    | CONFIRMED                                 | V7 F-05                             |
| V7-06                      | medium   | dashboard tests             | The replacement dashboard test omits the old negative pre-data cases.                                  | CONFIRMED                                 | V7 F-06                             |
| V7-08                      | medium   | browser tests               | `npm test` excludes browser journeys.                                                                  | CONFIRMED                                 | V7 F-08                             |
| V1-07, V1-08               | low      | migration locks             | `0122` rewrites a small table and `0123` or `0124` take DDL locks.                                     | CONFIRMED                                 | V1-07, V1-08                        |
| V1-15                      | low      | `0122` rollback             | An integer rollback loses post-migration fractional costs.                                             | CONFIRMED                                 | V1-15                               |
| V1-16                      | low      | `0123` rollback             | Dropping the progress column loses timestamps written after migration.                                 | CONFIRMED                                 | V1-16                               |
| V1-17                      | low      | `0124` rollback             | Dropping a pre-existing entity role has no safe universal rollback.                                    | CONFIRMED                                 | V1-17                               |
| V0-07                      | low      | RLS comment                 | The `job_leases` Security Advisor rationale does not match current advisor output.                     | CONFIRMED                                 | V0 F-V0-07                          |
| V6-06                      | low      | operations documentation    | `AI_LOG_PAYLOADS` has no deployment documentation.                                                     | CONFIRMED                                 | V6 F-V6-06                          |
| V7-07                      | low      | selector test               | Citation selector coverage remains source-text based.                                                  | CONFIRMED                                 | V7 F-07                             |
| V4-01                      | info     | removed dead methods        | No caller can reach the removed alert-setting methods, so the predicted outage cannot occur.           | REFUTED                                   | V4-01, V0 F-V0-08                   |
| V0-05, V1-01, V3-004       | info     | `0122` data range           | Live data fits `numeric(12,6)`, so the proposed overflow blocker cannot occur.                         | REFUTED                                   | V1-01, V3-004, V0 F-V0-05           |
| V2-F1                      | info     | content generation          | Invalid body parsing now precedes a status conflict for external API callers only.                     | CONFIRMED                                 | V2 F1                               |
| V2-F2                      | info     | geo signals                 | An ownership miss now returns 404 rather than 500.                                                     | DELIBERATE                                | V2 F2                               |
| V2-F3                      | info     | re-detect cooldown          | The cooldown is durable and returns `Retry-After`.                                                     | DELIBERATE                                | V2 F3                               |
| V1-02                      | info     | `0122` row conversion       | In-range integer costs retain their numeric values through the conversion.                             | CONFIRMED                                 | V1-02                               |
| V1-03                      | info     | `0123` additive column      | Existing citation rows receive a readable null progress timestamp.                                     | CONFIRMED                                 | V1-03                               |
| V1-05, V0-01               | info     | `0122` policy               | The recreated outbox insert policy matches production.                                                 | CONFIRMED                                 | V1-05, V0 F-V0-01                   |
| V1-06                      | info     | migration order             | The three root files sort after their required earlier objects.                                        | CONFIRMED                                 | V1-06                               |
| V1-09                      | info     | migration replay            | The release runner rolls back a failed transactional migration file.                                   | CONFIRMED                                 | V1-09                               |
| V1-10                      | info     | column grant                | `ALTER COLUMN TYPE` preserves the outbox worker column grant.                                          | CONFIRMED                                 | V1-10                               |
| V5-06                      | info     | RLS InitPlan                | The policy GUC wrapper follows the proven InitPlan pattern.                                            | REFUTED                                   | V5 F-06                             |
| V0-13                      | info     | migration application       | Fresh PostgreSQL applies all three migrations with their expected objects and policy.                  | CONFIRMED                                 | V0 F-V0-13                          |
| V0-02                      | info     | autopilot hotfix            | The branch already matches main's earlier citation-loop hotfix.                                        | CONFIRMED                                 | V0 F-V0-02                          |
| V0-03                      | info     | production migration runner | The release command uses only `public.schema_migrations`, not the Supabase mirror ledger.              | CONFIRMED                                 | V0 F-V0-03                          |

## Production deployment sequence

Run every step in an authorized clean release checkout. Do not use the current audit worktree as the release checkout.

1. Apply the five required fixes and add their focused tests.

   ```sh
   npm run test:integration -- --maxWorkers=1
   npx vitest run tests/unit/onboardingAutopilotCompletionBoundary.test.ts tests/unit/citationRunGuards.test.ts --maxWorkers=1
   ```

   Precondition: a fresh isolated PostgreSQL test database exists. The outbox test exercises both claim clauses. The migration test repeats its role setup. The restart test simulates a terminal citation row and a process stop before dashboard work.

   Observable: every test passes. The outbox test claims an eligible row. The repeated migration test retains the outbox worker `SET` grant. The restart test records zero `runBrandPrompts()` calls after resume.

   Rollback: revert the unmerged fix commit. Do not start release work.

2. Merge main into the release branch. This does not affect production.

   ```sh
   git fetch origin --prune
   git merge --no-ff origin/main
   git merge-base --is-ancestor origin/main HEAD
   ```

   Precondition: the release checkout has no local changes. The fix commit is present.

   Observable: the final command exits 0. Both root `0122` files exist.

   Rollback: if Git reports conflicts, run `git merge --abort`. If the merge was committed, create a revert commit. Do not reset shared history.

3. Regenerate the Supabase mirror. This is a source artifact change. It is not a production migration.

   ```sh
   npm run supabase:migrations:sync
   npm run supabase:migrations:check
   git diff --check
   ```

   Precondition: step 2 completed. The root migration list contains both `0122` filenames.

   Observable: the check exits 0. The mirror assigns unique ordinal versions through `20260421000133`.

   Rollback: do not commit a failed generated set. Discard the release checkout and regenerate from a fresh checkout.

4. Run the release CI gates. This step is reversible and does not change production.

   ```sh
   npm ci
   npm run check
   npm run lint
   npm run format:check
   npm test -- --maxWorkers=1
   npm run supabase:migrations:check
   npm run build
   ```

   Precondition: the mirror check from step 3 passed. No other process consumes the release runner CPU.

   Observable: every command exits 0. Record the exact test result and the build commit.

   Rollback: stop. Fix the reported failure in a new commit, then repeat steps 2 through 4.

5. Run production read-only gates.

   ```powershell
   $env:CONFIRM_DATABASE_METADATA_AUDIT='venturecite-read-only'
   $env:DATABASE_METADATA_AUDIT_TARGET='direct'
   npm run release:preflight
   npm run db:audit:metadata
   ```

   Precondition: the backup restore drill passed. The release shell has the approved direct session connection and CA configuration. The scheduler flags remain `false` and `false`.

   Observable: both commands exit 0. The audit confirms the current pool role, RLS bypass, table ownership, and policy counts that V0 measured. It does not validate a future entity-role path.

   Rollback: stop the release. This step is read-only.

6. Apply the root application migrations. This is the first production-changing step.

   ```powershell
   $env:CONFIRM_PRODUCTION_MIGRATIONS='venturecite-production'
   npm run db:migrate:release
   ```

   Precondition: steps 1 through 5 passed. The application is still on the old binary. The release operator accepts that `0122`, `0123`, and `0124` can be applied only forward without a universal lossless rollback.

   Observable: the runner logs one successful application for each pending root filename. It records their checksums in `public.schema_migrations`.

   Rollback: if a file fails, the runner rolls back that file transaction. Stop after the failure. Do not rerun a partial manual SQL sequence. Earlier successful files remain applied and need a reviewed forward repair or a data-aware rollback.

   This step becomes effectively irreversible after new fractional costs or citation progress values are written.

7. Deploy the merged application build.

   ```sh
   git push origin HEAD:main
   ```

   Precondition: step 6 applied all three root migrations. The release commit is the sole new commit at the production promotion point. Render is configured to deploy `main`. The service keeps `DISABLE_IN_PROCESS_SCHEDULER=false` and `EXTERNAL_CRON_ORCHESTRATOR_ENABLED=false`.

   Observable: Git accepts the push. Render starts and reports a healthy deployment for the pushed commit.

   Rollback: run `git revert --no-edit HEAD`, then run `git push origin HEAD:main`. Leave the database migrations in place. The previous application binary remains compatible with the additive column and numeric cost column.

8. Run post-deploy checks without creating paid work.

   ```powershell
   Invoke-WebRequest "$env:APP_URL/health" -UseBasicParsing
   ```

   Precondition: the deployment is healthy. Use an approved existing test account and do not start content generation, a citation run, checkout, or email delivery.

   Observable: `/health` returns HTTP 200. Logs show the scheduler selected in-process mode and one autopilot-resume registration. Check the migration ledger, error logs, and Sentry for citation, RLS, and column errors.

   Rollback: if a health, ownership, migration, or citation check fails, deploy the previous binary and stop scheduled work only through the approved scheduler-owner configuration. Do not issue `db:push` or manual DDL.

## What could still delete or corrupt production data

No automatic release command in this sequence deletes production rows. The migration runner reads root SQL files. It does not run Drizzle schema diffing.

Production data can still be deleted or overwritten only under these conditions:

- An operator runs `npm run db:push` against production and accepts or forces Drizzle's destructive diff.
- An operator sets the E2E local variables to a loopback database named `production`, sets `E2E_BASE_URL`, and runs a fixture that deletes its generated user.
- An operator runs `tsx scripts/backfillMentionedBrands.ts` against production without `--dry-run`.
- The existing scheduled retention, account purge, brand purge, and fact replacement jobs receive rows that meet their documented predicates.
- The six-hour autopilot sweep writes `failed` to a healthy long-running brand. This corrupts status metadata, not citation rows.

Do not run `npm run db:push`, `npx supabase db reset --linked`, or a manual `DROP`, `TRUNCATE`, or broad `DELETE` command in production.

## Residual risk accepted

F1 remains. An external caller can receive 400 before 409 for an invalid generation body on a non-draft article. The application client cannot produce that request. The request causes no write.

The six-hour stall sweep remains. A healthy citation run that lasts over six hours can show `failed` and wait for the bounded retry path. The next retry reattaches to an active citation run. It does not create a second active row.

The new RLS policies remain inert because the current owner pool bypasses RLS. This release does not claim a tenant-isolation improvement from `0124`.

The migration grants no `SET` membership for `venturecite_entity_request`. No current code enters that role. Add the membership when a route uses the role.

The existing manual `db:push`, E2E fixture, and backfill hazards remain. They predate this branch. The release runbook excludes them.

## Evidence gaps

| gap                                      | what closes it                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Restart-boundary fix                     | Run the new focused test, then reproduce it against an isolated local database.                          |
| Long healthy autopilot runs              | Query an isolated copy for runs with recent `last_advance_started_at` and an old `autopilot_started_at`. |
| GitHub Actions orchestrator reachability | Inspect the workflow run history and confirm the current secret-backed HTTP results.                     |
| Future entity-role security              | Migrate one read path to the entity role and run two-tenant and missing-GUC tests.                       |
| Future entity-role performance           | Run `EXPLAIN ANALYZE` for the target policies on production-like data.                                   |
| Route extraction behavior                | Add HTTP tests for the 130 uncovered route registrations.                                                |
| Browser behavior                         | Run the local Playwright flows against isolated Supabase.                                                |
| Storage and schema metadata              | Add runtime storage composition and Drizzle metadata assertions.                                         |
| Extra `db:push` drop candidates          | Compare the full production catalog with the Drizzle schema in a read-only audit.                        |
