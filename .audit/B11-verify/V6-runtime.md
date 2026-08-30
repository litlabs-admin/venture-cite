# V6 runtime and startup crash surface audit

Audit basis: `HEAD` at `8d87c3c44784ee6e46f757952556bc87c2a631d6`, compared with `origin/main` at `569f746395fc8e4f48c6fe3da2ccf42403cc4b4b`.

This audit used source inspection only, except for two local library checks.
It did not start the server, a database, Docker, or the test suite.

## Production boot: verified import graph

`package.json:14-15` builds with Vite and starts `dist/server/index.mjs` with `NODE_ENV=production`.

`vite.config.ts:70-153` configures Nitro with the repository root, the `server/nitroBoot.ts` plugin, and `dist` output for non-Vercel builds.

`src/routes/api/$.ts:18-25`, `src/routes/health.ts:6-14`, and `src/routes/webhooks/$.ts:12-21` forward requests to `src/server/expressBridge.ts:18-36`.

The bridge imports `server/app.ts`, starts the cached `prepareApp()` promise, and awaits it before every forwarded request.
`server/app.ts:19-37` loads dotenv, validates the environment, loads Sentry, and creates the Express app.
`server/app.ts:329-334` registers the route table once.

`server/index.ts:64-72` is development-only because it throws under production.
The package start command does not import that file.
The production graph does not import `server/vite.ts` or `server/index.ts`.

Nitro generates plugin imports from `nitro.options.plugins`.
The installed Nitro source calls each generated plugin with `plugin(app)` at `node_modules/nitro/dist/_build/common.mjs:21183-21187`.
The Node server starts after `useNitroApp()` initializes those plugins at `node_modules/nitro/dist/presets/node/runtime/node-server.mjs:15-24`.

`server/nitroBoot.ts:67-74` starts its asynchronous `run()` function with `void run()`.
`server/nitroBoot.ts:78-116` then reconciles citation runs, configures Stripe, and registers the scheduler.
`server/nitroBoot.ts:116` starts autopilot resume without awaiting it.

I inspected 43 added service files, 13 added schema files, and 11 added storage-domain files.
The new modules define functions, schemas, caches, and client adapters at module scope.
I found no new top-level database query, network request, timer, listener, scheduler registration, or process exit.
The OpenRouter client is conditional at `server/services/factSheetV2Sources.ts:60-71`.

The expected import-time guards remain active.
`server/env.ts:40-106` requires `APP_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`.
`server/env.ts:194-200` throws before normal application use when validation fails.
`server/db.ts:17-22` also rejects a missing database URL.
These checks fail fast when production configuration is missing.

The boot graph is present and has no branch-added import failure that I could prove from source.
The asynchronous Nitro boot work creates a startup race, recorded as F-V6-05 below.

## Scheduler job names: before vs after

The registry has ten entries.
The ten `cronCrashGuard` calls in `server/scheduler.ts:797-937` use those entries.
The before values came from the ten string literals in `origin/main:server/scheduler.ts`.

| Job                           | Before                        | After                         | Persisted key or effect           |
| ----------------------------- | ----------------------------- | ----------------------------- | --------------------------------- |
| Resume in-flight autopilots   | `resume-in-flight-autopilots` | `resume-in-flight-autopilots` | Crash tags and scheduler logs.    |
| Content cost outbox drain     | `content-cost-outbox-drain`   | `content-cost-outbox-drain`   | Crash tags and scheduler logs.    |
| Account purge                 | `account-purge`               | `account-purge`               | Crash tags and scheduler logs.    |
| Brand purge                   | `brand-purge`                 | `brand-purge`                 | Crash tags and scheduler logs.    |
| Tour events cleanup           | `tour-events-cleanup`         | `tour-events-cleanup`         | Crash tags and scheduler logs.    |
| Automatic citation            | `auto-citation`               | `auto-citation`               | `jobDebounce` key and crash tags. |
| Brand activation              | `brand-activation`            | `brand-activation`            | Crash tags and scheduler logs.    |
| Fact scrape failure detection | `detect-fact-scrape-failure`  | `detect-fact-scrape-failure`  | Crash tags and scheduler logs.    |
| Weekly catchup kickoff        | `weekly-catchup-kickoff`      | `weekly-catchup-kickoff`      | Crash tags and scheduler logs.    |
| Weekly report                 | `weekly-report`               | `weekly-report`               | `jobDebounce` key and crash tags. |

No in-process scheduler name changed.
The registry check ran against the real TypeScript module and returned ten names.

The daily orchestrator uses `weekly-report-legacy` at `server/routes/cron.ts:206-208`.
The function calls the same `runWeeklyReportJob()` function and therefore uses the same `weekly-report` debounce key at `server/scheduler.ts:41-55`.
The alias changes step names in orchestrator metrics and crash reports.
It does not stop weekly report execution.
This mismatch is F-V6-04.

`server/lib/advisoryLock.ts:59-123` replaces an expired lease, renews it every third of the TTL, and deletes it with the holder token.
The TTL is 60 seconds at `server/lib/advisoryLock.ts:9`.
A process crash leaves a lease until expiry.
An expired lease does not block the job forever.

The cron route retains the same ordered work sequence as `origin/main`.
`server/routes/cron.ts:96-247` runs maintenance, reconciliation, autopilot resume, queue drains, retention work, billing setup, citation work, activation, weekly work, and fact work in the same order.
The branch moved bodies into services and preserved the call list.

## New or changed environment variables

| Variable          | Read                         | Documented                                            | Unset behavior                                                                                         | Production effect                                   |
| ----------------- | ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `AI_LOG_PAYLOADS` | `server/lib/aiLogger.ts:7-8` | No entry in `.env.example`, `render.yaml`, or `docs/` | The comparison is false. Request and response payload logs stay disabled. Failure metadata still logs. | Safe default. The missing documentation is F-V6-06. |

All other environment names found in the changed application code also exist on `origin/main`.
`EXTERNAL_CRON_ORCHESTRATOR_ENABLED` and `DISABLE_IN_PROCESS_SCHEDULER` remain validated by `server/env.ts:132-141`.
Render keeps both values false in `render.yaml:64-81`.

## Dependency and script changes

| Area         | Change                                                                                                                    | Production effect                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Dependencies | None in `package.json` or lockfiles.                                                                                      | No dependency graph change.                       |
| Scripts      | Added skills, migration assertion, schema surface, storage surface, and integration-test scripts at `package.json:27-41`. | These scripts do not change `build` or `start`.   |
| Build        | Unchanged at `package.json:14`.                                                                                           | Still emits the Vite and Nitro production output. |
| Start        | Unchanged at `package.json:15`.                                                                                           | Still starts `dist/server/index.mjs`.             |

## Changed limits, budgets, and intervals

| Setting                            |                                                                Before |                                                       After | Production effect                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------: | ----------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic citation creation window |                                                                  None |                                                      1 hour | New automatic runs stop after three creations per brand in the rolling hour at `server/citationChecker.ts:43-44`, `server/citationChecker.ts:571-594`.      |
| Automatic citation creation cap    |                                                                  None |                                                           3 | Limits repeated provider spend. It can leave autopilot incomplete until the window expires.                                                                 |
| Citation orphan threshold          | 5 minutes at `origin/main:server/lib/citationReconciliation.ts:12-14` | 240 minutes at `server/lib/citationReconciliation.ts:42-44` | A dead active run can block new work for up to four hours before the next reconciliation. This is F-V6-07.                                                  |
| Autopilot stall threshold          |                                                                  None |                                                     6 hours | The resume sweep demotes old in-flight brands at `server/lib/onboardingAutopilot.ts:424-433`. Its timestamp choice can demote active work. This is F-V6-03. |
| Fact scrape retry policy           |                                                                  None |                             Three failures, 24-hour backoff | `server/lib/factAgent/v2/runFactSheetRefresh.ts:48-57` stops repeated failed scrapes. It can defer a brand for 24 hours after a failure.                    |
| AI payload string limit            |                          2,000 characters per serialized AI log entry |                        2,000 characters per AI string field | `server/lib/logger.ts:42`, `server/lib/logger.ts:78-87` bounds each enabled payload field after sanitization.                                               |

The site health cache, perception cooldown, activation slice budget, and dashboard item limits keep their origin values.
The service extraction moved those values without changing them.

## Findings

### F-V6-01 | high | migrations/0122_api_costs_cost_precision.sql:1; server/lib/migrationRunner.ts:106-127; server/lib/migrationChecksums.ts:7-15

What happens: The branch replaces the origin migration filename `0122_signup_grants_beta.sql` with `0122_api_costs_cost_precision.sql`.

Why it breaks in production but not in tests: A production database that has the origin migration ledger row for `0122_signup_grants_beta.sql` does not have the branch filename.
The release runner does not match migration meaning by number.
It compares each filename and checksum.

Concrete sequence: `npm start` does not run migrations.
If a release step runs `db:migrate:release`, the runner sees a changed `0122` filename or checksum and can fail before applying later migrations.
If the release step is skipped, `citation_runs.last_advance_started_at` from migration `0123` is absent.
`server/lib/citationReconciliation.ts:68-76` catches its query failure, but `server/storage/citationsStorage.ts:343-355` then fails active-run reads during autopilot work.
The process can serve requests while scheduled autopilot and citation work fails.

Confidence: high for a database that contains the origin `0122` row and has not received the branch migrations.

### F-V6-02 | high | server/lib/onboardingAutopilot.ts:316-330; server/lib/onboardingAutopilot.ts:393-399

What happens: A process restart between citation completion and the brand completion update can start a second automatic citation run.

Why it breaks in production but not in tests: `advanceCitationRun()` can mark the citation row terminal before `runOnboardingAutopilot()` writes `autopilot_status = 'completed'`.
The unit test covers both operations inside one uninterrupted call.
It does not stop the process between them.

Concrete sequence: The brand remains `running_citations` after `advanceCitationRun()` returns `done`.
The process stops before line 393.
The next resume sees no active run because `getActiveCitationRuns()` selects only `pending` and `running` rows at `server/storage/citationsStorage.ts:343-356`.
The `else` branch at line 329 calls `runBrandPrompts()` and creates a new automatic row.
The partial unique index at `migrations/0035_citation_runs_dedup.sql:24-26` does not block it because the earlier row is terminal.
The brand can repeat paid citation work after every restart in this gap.

Confidence: high.

### F-V6-03 | medium | server/lib/onboardingAutopilot.ts:424-433; server/storage/citationsStorage.ts:382-395

What happens: The six-hour demotion can mark a healthy citation run as failed.

Why it breaks in production but not in tests: The demotion checks `brands.autopilot_started_at`.
The citation worker updates `citation_runs.last_advance_started_at` during progress.
The test checks only the generated SQL string.
It does not model an active citation row with recent progress and an older autopilot timestamp.

Concrete sequence: A brand enters `running_citations` and sets `autopilot_started_at`.
The citation run continues across slices and updates `last_advance_started_at`.
After six hours, the resume sweep updates the brand to `failed` because line 431 ignores citation progress.
The active citation row remains `running` and still occupies the partial unique index.
Later resume calls see inconsistent brand and run state.

Confidence: high.

### F-V6-04 | medium | server/routes/cron.ts:206-208; server/lib/schedulerJobRegistry.ts:24

What happens: The daily orchestrator reports `weekly-report-legacy`, while the scheduler registry reports `weekly-report`.

Why it breaks in production but not in tests: The parity test explicitly allows this alias at `tests/unit/schedulerOrchestratorParity.test.ts:322-325`.
The different names therefore pass the test.

Concrete sequence: The Sunday orchestrator records results under `weekly-report-legacy`.
The in-process scheduler records crashes and registry checks under `weekly-report`.
The function and debounce key remain shared, so the report still runs.
Operational metrics and failure searches split across two names.

Confidence: high for observability impact.

### F-V6-05 | medium, pre-existing | server/nitroBoot.ts:67-78; node_modules/nitro/dist/_build/common.mjs:21183-21187

What happens: Nitro starts the listener while asynchronous boot work is still running.

Why it breaks in production but not in tests: Nitro calls a synchronous plugin function.
`nitroBoot()` launches `run()` with `void`.
No test starts the generated Nitro server and sends traffic during reconciliation.

Concrete sequence: Nitro calls the plugin.
The plugin starts `reconcileOrphanCitationRuns()` and returns immediately.
The Node server starts listening.
Requests can arrive before `initScheduler()` at line 114 and before autopilot resume at line 116.
This finding exists on `origin/main` as the same Nitro boot design and is not a new branch regression.

Confidence: high.

### F-V6-06 | low | server/lib/aiLogger.ts:7-8

What happens: `AI_LOG_PAYLOADS` is a new production setting without documentation.

Why it breaks in production but not in tests: Tests do not check deployment environment documentation.
The code safely treats an unset value as false.

Concrete sequence: A deployment omits the variable.
AI request and response payloads do not log.
AI failure name and duration still log through Pino.
An operator who expects the old always-on payload logs receives less diagnostic data.

Confidence: high.

### F-V6-07 | medium | server/lib/citationReconciliation.ts:42-76

What happens: The orphan threshold changed from five minutes to four hours.

Why it breaks in production but not in tests: The current tests cover the timestamp helper and SQL shape.
They do not wait through a real restart interval or exercise a dead active row against the partial unique index.

Concrete sequence: A process dies while a citation row remains `running`.
The next boot and daily sweep leave it active until `COALESCE(last_advance_started_at, started_at)` is at least four hours old.
Manual or automatic creation can then encounter the active-row guard or refuse work.
The longer threshold protects slow healthy slices, but it increases the stale-work outage window.

Confidence: medium.

### Type checking is not evidence

The Drizzle schema now includes `citationRuns.lastAdvanceStartedAt` at `shared/schema/citations.ts:137`.
TypeScript can therefore accept the new storage projection while an untouched database still lacks the column.
The runtime failure in F-V6-01 proves that the type declaration does not prove the deployed schema.

The branch also uses boundary casts in `server/citationChecker.ts:597-605`, `server/lib/onboardingAutopilot.ts:165-171`, and `server/services/factSheetV2Sources.ts:42-49`.
I found no separate confirmed production failure from those casts during this read-only audit.

## Cleared checks

The if/else structure at `server/lib/onboardingAutopilot.ts:316-361` cannot call `runBrandPrompts()` when `activeRuns.length > 0` during the same invocation.
An unfinished active slice returns at line 327.
A finished active slice skips the `else` branch and proceeds to step 3.

The partial unique index matches the active states used by `getActiveCitationRuns()` and `createCitationRun()`.
An active run causes the autopilot path to advance that run instead of inserting another row.
The restart replay finding occurs after the previous row reaches a terminal state.

The demotion query scopes rows to `deleted_at IS NULL` and the four in-flight statuses.
It has no tenant input because the resume sweep intentionally scans all brands.
It does not update another tenant through a supplied user or brand identifier.

The QueryCache handler does not swallow query errors.
TanStack Query calls the cache handler after its retryer reaches the final error at `node_modules/@tanstack/query-core/build/modern/query.js:290-332`, then rethrows the error.
The branch did not change retry policy values at `client/src/lib/queryClient.ts:170-197`.

For twelve distinct 401 query keys, the real installed Query Core produced twelve cache callbacks and twelve request attempts.
The project handler returns before the toast for status 401 at `client/src/lib/queryClient.ts:159-162`, so session expiry produces zero query error toasts.
For twelve distinct 500 query keys, the same local check produced 36 request attempts and twelve final cache callbacks.
This is one callback and one toast per distinct failed query, not one callback per retry or observer.

The job lease expires after 60 seconds and renews while the callback runs.
A crashed process cannot hold the lease forever.

## Proof run

The registry import check used the real module:

```text
{"count":10,"names":["resume-in-flight-autopilots","content-cost-outbox-drain","account-purge","brand-purge","tour-events-cleanup","auto-citation","brand-activation","detect-fact-scrape-failure","weekly-catchup-kickoff","weekly-report"]}
```

The Query Core check used the installed package with twelve failing query keys:

```text
401: {"distinctQueries":12,"attempts":12,"queryCacheOnErrorCallbacks":12}
500: {"distinctQueries":12,"attempts":36,"queryCacheOnErrorCallbacks":12}
```

These checks prove library callback behavior and registry contents.
They do not prove a deployed server, database schema, external cron, or provider response.

## Verdict

WOULD BOOT WITH DEGRADED JOBS. The Nitro production graph exists, and the process can start with valid production environment values. Autopilot can repeat paid citation work after a restart, and the new stall check can demote healthy citation work; an unchanged origin migration filename can also leave scheduled work incompatible with an untouched database.
