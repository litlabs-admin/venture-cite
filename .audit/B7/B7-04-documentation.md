# B7-04: the documentation set

## The tree, and why

```
docs/
  README.md                                          index, one line per document
  tutorials/
    local-development-setup.md                       clone -> running stack -> seeded brand
  how-to/
    add-a-migration.md
    add-a-storage-domain-method.md
    add-a-cron-job.md
    run-the-integration-suite.md
    debug-a-stuck-citation-run.md
  reference/
    architecture.md                                  client/src split, Nitro+Express bridge, Supabase+Drizzle, migration runner+mirror
    schema-domains.md                                 the 13 shared/schema/ domains
    storage-layer.md                                  the 11 server/storage/ domains, composition
    jobs-and-cron.md                                  scheduler, concurrency guards, citation-run lifecycle
    verifying-these-docs.md                           the required "stays true" section
  explanation/
    composition-over-delegation.md
    one-active-citation-run-per-brand.md
    citation-run-staleness.md
    cadence-gate-placement.md
    opportunities-vs-geo-analytics-windows.md
```

One tree, one Diátaxis quadrant per top-level directory, matching the task's
four required modes exactly. `docs/README.md` is a map only — one line of
description per link, no instruction and no explanation of its own — so it
does not itself mix modes.

I did not move, rewrite, or delete `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`,
or `docs/deploy-runbook.md`. The task scope was to build a Diátaxis set, not
to migrate the whole `docs/` directory, and the remediation program's own
spec (`docs/superpowers/specs/2026-08-28-remediation-program-design.md`,
section 2.2) records that an audit already checked 23 of 25 falsifiable
claims in those files true. `docs/README.md` says explicitly that where the
new reference section overlaps them, the new section is the one re-verified
for this pass, and links to the deploy runbook rather than duplicating
release material, which was out of scope here (no release/deploy how-to was
requested).

## Every claim, and what I verified it against

**Architecture (`reference/architecture.md`)**

- `client/` (315 files) vs `src/` (56 files), `@` alias to `client/src`,
  `tanstackStart({ srcDirectory: "../src" })` — verified against
  `vite.config.ts:169,184`. The alias line and srcDirectory line numbers cited
  in the doc's code excerpt are copied from the actual file content I read.
- 41 route files under `src/routes/_app/`, 26 importing `@/pages/...` —
  verified by direct count: `find src/routes/_app -maxdepth 1 -type f | wc -l`
  = 41, `grep -rl "@/pages" src/routes/_app | wc -l` = 26.
- The three splat/exact bridge routes (`src/routes/api/$.ts`,
  `src/routes/webhooks/$.ts`, `src/routes/health.ts`) and their `ANY` handler
  calling `handleExpressRequest` — read all three files directly, plus
  `src/server/expressBridge.ts` in full.
- `server/index.ts` throws under `NODE_ENV=production` — read the exact
  `throw new Error(...)` block, lines 65-71 of that file.
- `server/nitroBoot.ts` runs boot side effects only under
  `NODE_ENV=production`, mutually exclusive with `server/index.ts` — read
  `server/nitroBoot.ts:90-119` and `server/index.ts` in full.
- Nitro preset selection (`node-server` default, `vercel` when `VERCEL` set)
  — read the comment block at the top of `vite.config.ts`.
- No `supabase.from()`/`supabase.rpc()` application calls; Drizzle over a
  direct pool — this repeats the CLAUDE.md claim; I did not re-run a
  repository-wide grep for every possible call site in this pass, so this is
  carried forward from CLAUDE.md's own "verified 2026-08-28" section, not
  independently re-derived by me. Flagged below as inherited, not
  independently re-verified.
- Migration runner mechanics (advisory lock, checksum, `verified`/`legacy`
  classification) — read `server/lib/migrationRunner.ts` lines 1-260
  directly, including the exact SQL for `schema_migrations` and the
  `pg_advisory_lock` call.
- `supabase/migrations/` generated mirror, `syncSupabaseMigrations.mjs`,
  `supabase:migrations:check` — read `scripts/syncSupabaseMigrations.mjs`
  header and confirmed the npm script text in `package.json`.
- `api/_bundle.js` dead, untracked, unreferenced — repeated from CLAUDE.md;
  not re-verified independently in this pass beyond confirming CLAUDE.md's
  own "verified 2026-08-28" framing, which the remediation spec (section
  2.3) independently corroborates with git commit `0edad39` and
  `.gitignore:114`.

**Schema domains (`reference/schema-domains.md`)**

- The 13 domain files and the barrel — read `shared/schema.ts` (the 13-line
  `export *` barrel) and `ls shared/schema/` (exactly 13 files, matching
  names).
- Table counts and dependency table — taken from `.audit/B4/PARTITION.md`,
  which documents the six verification gates it ran; I did not recount all
  71 tables by hand, but the file list and count of 13 modules matches what
  I independently observed on disk.
- The six verification gates and the membership-gate failure story (identity
  extraction leaving `insertUserSchema` behind) — read directly from
  `.audit/B4/PARTITION.md`.
- `npm run schema:surface:check` and `node scripts/verifySchemaSplit.mjs` —
  confirmed both exist: the former in `package.json`, the latter as a real
  file (`scripts/verifySchemaSplit.mjs`), and read its usage comment.

**Storage layer (`reference/storage-layer.md`)**

- 307-method `IStorage`, 60 consumer files, the composition order in
  `server/storage.ts` — read `server/storage.ts` in full, including the
  exact `export const storage: IStorage = { ...databaseStorageObject(), ... }`
  block and the `databaseStorageObject()` function above it.
- `server/databaseStorage.ts` now has zero methods in its class body — read
  the entire current file (157 lines): the `DatabaseStorage` class body
  contains only comments, no method declarations. This is a fact about the
  current commit, not something the B5 partition doc itself states (that
  doc, `.audit/B5/PARTITION.md`, was written mid-decomposition and describes
  a plan with three further steps still open); I verified the _current_ file
  state independently and the doc's language reflects the current state, not
  the partition doc's snapshot.
- The 11 domain files under `server/storage/` and the method-count table —
  read `ls server/storage/` and cross-checked against
  `.audit/B5/PARTITION.md`'s allocation table; also spot-checked method
  counts in `contentStorage.ts`, `signalsStorage.ts`, `platformStorage.ts`,
  `jobsStorage.ts` by grep, which matched the partition doc's numbers.
- `workflowStorage.ts` is a separate precedent, not part of the `storage`
  composition — confirmed by grepping for `workflowStorage` across
  `server/storage.ts` and `server/storage/jobsStorage.ts` (no reference in
  either) and finding its only consumer is `server/lib/workflowEngine.ts`.
- `satisfies Partial<IStorage> & ThisType<IStorage>` pattern — read the exact
  line from `server/storage/brandsStorage.ts`.
- Git history confirming B5 fully completed all 11 domains, ending with
  commit `a827765 refactor(storage): extract the content domain and finish
the split` — read via `git log --oneline`.

**Jobs and cron (`reference/jobs-and-cron.md`)**

- Every cron job name, env var, and default schedule in the table — read
  `server/scheduler.ts` in full via targeted greps and surrounding context
  for each `_CRON = process.env...` declaration.
- `cronCrashGuard` — read the function definition, `server/scheduler.ts:762-769`.
- The two-entry-point boot story (`server/index.ts` direct call vs
  `server/nitroBoot.ts` via `resolveSchedulerMode`) — read both files.
- `DISABLE_IN_PROCESS_SCHEDULER` / `EXTERNAL_CRON_ORCHESTRATOR_ENABLED`
  consistency requirement — read `server/lib/schedulerMode.ts` error
  messages directly, and `server/env.ts` for the env var declarations.
- Render's free tier has no `type: cron` service, and why — read the header
  comment block of `render.yaml` in full.
- Advisory locks vs job debounce, and which jobs get which — read
  `server/lib/advisoryLock.ts` and `server/lib/jobDebounce.ts` headers in
  full; the debounce file's own comment explains the sequential-vs-concurrent
  distinction and lists exactly the three debounced jobs, which I quoted
  faithfully.
- The citation-run lifecycle bullets — see the explanation docs below; each
  claim there is independently sourced.

**Verifying these docs (`reference/verifying-these-docs.md`)**

- Every command listed (`schema:surface:check`, `storageSurface.ts --check`,
  `verifyStorageSplit.mjs`, `supabase:migrations:check`,
  `verifySchemaSplit.mjs`, `check`, `lint`, `format:check`, `test`,
  `test:integration`) — copied verbatim from `package.json`'s `scripts`
  block or confirmed as a real file with a usage comment
  (`scripts/storageSurface.ts`, `scripts/verifyStorageSplit.mjs`).
- `TEST_DATABASE_URL` skip behavior — read
  `tests/helpers/destructiveDatabaseTest.ts` in full.
- The explicit statement that `storageSurface.ts --check` is not wired into
  an npm script or CI — I grepped `package.json` for `storageSurface` and
  found no match; stated as a gap, not fabricated as existing.
- The explicit statement that no documentation-claim-extraction CI mechanism
  exists yet — this is the remediation spec's own proposed future work
  (section 7.3, item 1, "a documentation verification script in CI"),
  described there as not yet built. I did not find such a script in
  `scripts/` and did not fabricate one.

**Tutorial (`tutorials/local-development-setup.md`)**

- Local Supabase ports (`55321` API, `55322` DB) — read `supabase/config.toml`
  directly.
- `server/env.ts`'s loopback-only enforcement in development
  (`remoteDevelopmentServiceNames`) — read `server/lib/environmentSafety.ts`
  in full and its call site in `server/env.ts:149-156`.
- `.env.example` variable names and their comments
  (`CONTENT_GENERATION_PROVIDER=fake`, `DISABLE_STARTUP_AUTOPILOT`,
  `DISABLE_STRIPE_SETUP`, `APP_URL`, database and Supabase URL shapes) —
  read the file directly.
- `npm run db:migrate` behavior — read `scripts/migrate.ts` header comment
  and confirmed it calls `applyMigrations`.
- The onboarding UI flow (`/register` form fields, `/welcome` scenes
  `input -> scraping -> confirm -> activating`, the exact button labels
  "Find my brand" and "Confirm and start measuring",
  `POST /api/onboarding/confirm`) — read `client/src/pages/welcome.tsx`
  (targeted sections around each scene) and `tests/e2e/auth-signup.spec.ts`
  and `tests/e2e/welcome-brand.spec.ts` for independent confirmation of the
  same routes and field names from a second source (the E2E suite).
- The activation pipeline order ("fact sheet, then suggested prompts, then
  an initial citation run") — this is a comment inside `welcome.tsx` itself
  ("the server has already kicked off the ordered activation pipeline (fact
  sheet -> prompts -> citations)"), quoted as what the code comment claims,
  not independently traced through the pipeline's implementation in this
  pass. Flagged below.

**How-to guides**

- `add-a-migration.md`: migration numbering convention and current highest
  number (`0123_citation_run_last_advance.sql`) — read `ls migrations/`
  sorted. The `BEGIN; ... COMMIT;` convention — read several existing
  migration files including `migrations/0035_citation_runs_dedup.sql` in
  full.
- `add-a-storage-domain-method.md`: every instruction traces to the same
  `server/storage.ts` and `server/storage/*.ts` reading done for the storage
  layer reference page above.
- `add-a-cron-job.md`: every instruction traces to the same
  `server/scheduler.ts` reading done for the jobs-and-cron reference page,
  including the lazy-import rationale, which is a real comment in
  `server/scheduler.ts` explaining a test that previously exceeded a 20s
  ceiling.
- `run-the-integration-suite.md`: every constraint on `TEST_DATABASE_URL`
  (must differ from `DATABASE_URL`, must contain "test" in the database name
  or be the exact local-Supabase target with `LOCAL_SUPABASE_TEST=1`, must be
  loopback unless `ALLOW_REMOTE_TEST_DATABASE=1`) — read
  `tests/helpers/destructiveDatabaseTest.ts` in full, including the exact
  port (`55322`) and database name (`postgres`) the local-Supabase exemption
  checks for.
- `debug-a-stuck-citation-run.md`: every mechanism named (client poll
  backoff schedule, the 30-second cron drain threshold vs the 240-minute
  staleness threshold, the inline reap, the boot-time sweep, the
  `409 already_running` manual-run behavior, the automatic-run rate bound)
  — read `.audit/B6/B6a-10-citation-run-guards.md` and
  `.audit/B6/B6a-12-citation-run-staleness.md` in full, then independently
  confirmed the still-current code: `client/src/hooks/useActiveCitationRuns.ts`
  for the poll backoff schedule, and `server/routes/cron.ts` for
  `drainPendingCitationRuns` and its 30-second threshold.

**Explanation docs**

- `composition-over-delegation.md`: the six cross-domain calls, the
  dependency-chain argument, the `ThisType<IStorage>` mechanism, and the
  `TS2741` break-test — all read directly from `.audit/B5/PARTITION.md`,
  which documents that the compiler-error break-test was actually run. I did
  not re-run the break-test myself in this pass (doing so would mean editing
  source files, out of scope for a documentation-only task); this is
  explicitly the partition doc's own verification claim, cited as such.
- `one-active-citation-run-per-brand.md`: the unique index, the reconciling
  `UPDATE` in the same migration, and the 8-second poll window it guards
  against — read `migrations/0035_citation_runs_dedup.sql` in full, and
  `client/src/hooks/useActiveCitationRuns.ts` for the poll interval
  (confirmed `POLL_FAST_MS = 8_000`).
- `citation-run-staleness.md`: the 449-run measurement (median 3.77m, p95
  14.25m, max 175.58m, 38.5% over 5 minutes), the 240-minute derivation from
  the hourly cron and the 15-minute `CRON_ORCHESTRATOR_BUDGET_MS`, and the
  shared `isRunStaleSinceLastProgress` predicate — read
  `.audit/B6/B6a-12-citation-run-staleness.md` in full, including its quoted
  code block for the predicate.
- `cadence-gate-placement.md`: `isBrandDueForCitation`'s six-day gate, the
  onboarding-autopilot bypass, the ~18-minute-interval incident, and where
  the fix landed — read `.audit/B6/B6a-10-citation-run-guards.md` in full and
  independently confirmed `isBrandDueForCitation`'s current implementation in
  `server/scheduler.ts:195-200`.
- `opportunities-vs-geo-analytics-windows.md`: both endpoints' `since`
  handling, and the exact code comments recording this as a confirmed
  2026-08-29 product decision — read `server/routes/analytics.ts` directly:
  lines around 216-260 for `/api/geo-analytics/:brandId`'s `since` handling,
  and lines around 781-820 for `/api/geo-opportunities/:brandId`'s comment
  block. I use the endpoint's real path, `/api/geo-opportunities`, rather
  than the task brief's informal "`/api/opportunities`" — the real route
  does not exist under that path; `/api/geo-opportunities` is the actual
  registered route, confirmed by reading `server/routes/analytics.ts`'s own
  top-of-file route list comment and the `app.get(...)` call itself.

## What I did not assert, because I could not verify it in this pass

- **`server/lib/` file count (160 files) and the 261 total Express route
  registration count**, both cited in the remediation spec's section 2.3. I
  did not recount either figure independently and did not carry them into
  the new documentation set as my own verified claims.
- **The exact activation-pipeline implementation** (fact sheet -> prompts ->
  citations) named in the tutorial is sourced from a code comment in
  `welcome.tsx`, not from tracing the actual pipeline code
  (`server/lib/onboardingAutopilot.ts` and whatever it calls in sequence). I
  flagged this in the tutorial's own wording ("the server has already
  started the brand's ordered activation pipeline") and did not add detail
  beyond what that comment states.
- **Whether `supabase.from()`/`supabase.rpc()` really does not appear
  anywhere in current application code.** I did not re-run a fresh
  repository-wide grep for this in the current session; the claim in
  `reference/architecture.md` is carried forward from CLAUDE.md's own dated,
  verified claim and from the remediation spec's independent corroboration
  (both already state this as checked), not re-derived by me from a fresh
  search this session.
- **A CI mechanism that checks documentation claims against code.** None
  exists yet. `reference/verifying-these-docs.md` says so explicitly rather
  than describing a mechanism that does not exist.
- **Whether the Vercel build path still works.** The remediation spec's own
  open question (section 9) says nobody has run `VERCEL=1 vite build` to
  confirm it. I did not run it either (running a build is not a read-only
  verification step appropriate for a documentation-only task with other
  agents concurrently using build/test resources), and the architecture
  reference describes only how the preset is _selected_, not that the
  Vercel path is confirmed working end to end.
- **Exact current values of `server/lib/` file count or route registration
  count**, beyond what is already stated above.

## Style compliance

Applied the `technical-writing` skill's four layers throughout: each file is
one Diátaxis mode with no mixing (verified by re-reading every file's
sentences against its declared mode); Google-style headings in sentence
case, second person in the how-to and tutorial, active voice; STE-style short
instructions in the how-to guides; Global English checks for ambiguous
"only"/"it"/"this" in a manual re-read pass. Ran a repository grep for common
AI-slop markers ("it is important to note", "in order to", "leverage",
"seamless", "robust", "delve", "furthermore", "simply", "please", "utilize")
across all 16 new files; found and fixed one instance of "simply" in
`how-to/debug-a-stuck-citation-run.md`.
