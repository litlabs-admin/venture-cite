# VentureCite remediation program design

Date: 2026-08-28
Branch: `remediation-program-2026-08-28`
Status: approved

## 1. Why this document exists

This document records what we verified about the repository, the decisions the
owner took, and the work we will do. Every claim below carries evidence. We
verified claims against code, git history, and configuration. We did not accept
any Markdown file or code comment as evidence.

Read section 2 before you dispute a premise. Several widely held beliefs about
this repository turned out to be false, and the plan depends on the corrected
facts.

## 2. Verified baseline

### 2.1 Repository size

| Directory     | Files | Lines  | Role                                     |
| ------------- | ----- | ------ | ---------------------------------------- |
| `server/`     | 227   | 57,953 | Express API, business logic, data access |
| `client/`     | 315   | 59,875 | React UI. Pages, components, hooks       |
| `src/`        | 56    | 2,560  | TanStack Start route layer               |
| `api/`        | 1     | 23,643 | Dead build artifact                      |
| `shared/`     | 10    | 3,796  | Drizzle schema and shared types          |
| `scripts/`    | 18    | 2,570  | Operations and CLI scripts               |
| `tests/`      | 258   | 38,313 | Vitest and Playwright                    |
| `supabase/`   | 131   | 8,125  | Generated migration mirror               |
| `migrations/` | 129   | 6,955  | SQL migration source of truth            |

### 2.2 Beliefs that the evidence contradicts

Correcting these matters. Each one would have sent work in the wrong direction.

**"Many pages have no link in the dashboard."** Three pages are orphaned, not
many. `/internal-page` has zero inbound links anywhere in `client/`. The pair
`/admin/scrape` and `/admin/scrape/$runId` link only to each other. Pages that
look orphaned by name, such as geo-signals, citations, and competitors, are
alive as tabs inside the six-item workflow spine defined in
`client/src/components/Sidebar.tsx:112-166`, or they are deliberate
`SpineRedirect` shims that preserve old bookmarks. `tests/e2e/legacy-redirects.spec.ts`
covers the shims.

**"`client/` and `src/` are duplicated."** They are not. `vite.config.ts:39-40`
aliases `@` to `client/src`, and `tanstackStart({ srcDirectory: "../src" })`
makes `src/` the route-definition directory. Of the 41 route files in
`src/routes/_app/`, 26 import directly from `@/pages/...`. Neither directory is
dead. The split does cost a new reader real effort, and we treat it as a
problem, but no deletion applies.

**"Deployment setups conflict and some are abandoned."** One hybrid architecture
serves both hosts. Nitro and TanStack Start render pages. `srvx` bridges the
existing Express app into Nitro through `src/server/expressBridge.ts`. Nitro
selects the `node-server` preset for Render and the `vercel` preset when
`VERCEL` is set. `server/index.ts:65-71` throws if started with
`NODE_ENV=production`, which proves it serves development only.

**"Migrations are hard to track."** The mechanism is sound.
`server/lib/migrationRunner.ts` reads ordered SQL from `migrations/`, records
each filename and SHA-256 checksum in `public.schema_migrations`, holds a
Postgres advisory lock `0x564d4944` to prevent concurrent releases, and
reconciles a second Supabase ledger. `scripts/syncSupabaseMigrations.mjs`
generates `supabase/migrations/` as a byte-identical mirror, verified across ten
sampled pairs. CI checks it for drift.

**"Documentation and comments are all stale."** An audit checked 25 specific
falsifiable claims in `AGENTS.md`, `README.md`, `PRODUCT.md`,
`docs/ARCHITECTURE.md`, and `docs/OPERATIONS.md` against code. 23 verified true.
Git history explains why the belief felt true. Commits `b11a61d`, `99ac86a`, and
`d185836` reconciled the documentation within the last two weeks.

### 2.3 Problems the evidence confirms

**CI never runs the integration tests. This is the most serious finding.**
`.github/workflows/ci.yml` runs `npm test` without setting `DATABASE_URL` or
`TEST_DATABASE_URL`. Every integration test passes through
`tests/helpers/destructiveDatabaseTest.ts:56-59`, which returns
`{ kind: "skip" }` when no test database URL exists. All 16 files in
`tests/integration/` therefore skip on every CI run with no failure signal. The
skipped set includes RLS policy tests, migration application tests, and outbox
idempotency tests.

This single gap explains the repeated production regressions in the owner's
session history.

**Modularity is genuinely poor, and concentrated.**

| File                               | Lines | Problem                                             |
| ---------------------------------- | ----- | --------------------------------------------------- |
| `server/databaseStorage.ts`        | 5,251 | One class implements the whole `IStorage` interface |
| `shared/schema.ts`                 | 2,607 | 71 tables in one file                               |
| `server/routes/prompts.ts`         | 1,838 | 46 route registrations, business logic inline       |
| `server/routes/dashboard.ts`       | 1,820 | 19 route registrations                              |
| `client/src/pages/geo-signals.tsx` | 1,832 | Largest client page                                 |

The repository has 261 Express route registrations. A repository layer exists
(`server/storage.ts` defines `IStorage`). A de facto service layer exists
(`server/lib/`, 160 files). The layering is present but not enforced. Route
handlers still make business decisions, for example `server/routes/prompts.ts:53-58`.

**Confirmed dead code.** `api/_bundle.js` is an esbuild bundle of
`server/vercelEntry.ts`, a file deleted in commit `0edad39`. Git does not track
it. `.gitignore:114` matches it. No script or config references it. Deleting it
removes 23,643 lines, about 12 percent of the reported codebase size.

**Confirmed fake test.** `tests/component/PreviewParam.test.tsx` defines its own
local copy of `isAdmin()` and tests that copy. It imports nothing from the
application. It would pass if the real gate were deleted.

**Two real defects.**

1. `client/src/hooks/use-brand-selection.ts:7` and three other files use a `vc_`
   localStorage prefix. `client/src/lib/clientStorage.ts:15` clears only the
   `venturecite-` prefix at logout. Brand selection survives logout on a shared
   browser.
2. `server/lib/aiLogger.ts:29,41` prints unredacted AI prompt and response
   bodies to stdout. It is attached in 13 or more files. The Pino logger in
   `server/lib/logger.ts` redacts sensitive keys. This path does not.

### 2.4 The unmerged branch

`supabase-backend-refactor` and `codex/project-reset-setup` are the same commit,
`0daf4954`. The branch does not move the backend to Supabase. It contains no
`supabase/functions/` directory and introduces no `supabase.from()` or
`supabase.rpc()` call. Its own migration file
`supabase/migrations/20260421000081_0081_enable_rls_all_public_tables.sql`
states that the client uses Supabase only for authentication, and that all table
input and output goes through Drizzle over a direct Postgres pool whose role
owns the tables and bypasses RLS.

`git merge-tree` reports 44 conflicts against current `main`: 21 content, 19
add/add, and 4 modify/delete. Its `vite.config.ts` predates
`server/nitroBoot.ts` and would regress current behaviour.

The work is careful and well tested. It answers a different question.

### 2.5 Agent tooling state

Skills exist in four locations with 17 colliding names. Across 16 sessions the
owner's history records 9,474 assistant turns, 2,048 Bash calls, and 16 Skill
invocations. `verification-before-completion` was invoked zero times.

`~/.codex/hooks.json` registers the same hook 11 times under `PostToolUse` and
11 times under `Stop`.

`~/.codex/config.toml` pins `model_reasoning_effort = "low"`. Luna and Terra both
default to `medium`. The configuration runs the cheapest model below its own
default reasoning level.

## 3. Decisions taken

| #   | Decision                                                                                                       | Rationale                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Supabase stays authentication and hosted Postgres. Keep the Nitro and Express API. Add RLS as defense in depth | A Supabase-native rewrite is a security redesign, not a port. All 130 migrations assume a Drizzle-owned database whose role bypasses RLS |
| D2  | Deduplicate skills inside this project only. Leave user-level skills untouched                                 | Other projects share `~/.claude/skills` and `~/.agents/skills`                                                                           |
| D3  | Rewrite the documentation in full to Diataxis structure and Google developer style                             | Owner decision, taken against the recommendation to patch instead                                                                        |
| D4  | Ignore the unmerged branch. Re-derive two pieces by hand                                                       | 44 conflicts, and `main` already grew its own versions of most of it                                                                     |
| D5  | Use Luna for bulk reading, Terra for design judgement, Sonnet for cross-file synthesis                         | Verified pricing and effort ladders. See section 6                                                                                       |

## 4. Program A: agent tooling

Program A changes no application code.

| ID  | Change                                                                                                                                            | Acceptance                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Make `.agents/skills/` the single project source. Symlink the curated set into `.claude/skills/` so project skills shadow user-level ones by name | The skill listing shows one entry per name           |
| A2  | Add missing curated skills, pinned to an upstream revision with a `SOURCE.md`                                                                     | Every skill directory has `SOURCE.md`                |
| A3  | Remove `disable-model-invocation: true` from skills that must fire automatically                                                                  | Those skills trigger without being typed             |
| A4  | Write `CLAUDE.md`                                                                                                                                 | The file exists and states the routing rules         |
| A5  | Deduplicate `~/.codex/hooks.json`. Raise `model_reasoning_effort`                                                                                 | One entry per hook. Effort is at least `medium`      |
| A6  | Add enforcement hooks                                                                                                                             | Each hook blocks or warns on a real recorded failure |
| A7  | Stop ignoring `.claude/` in git                                                                                                                   | Setup is reproducible from a clone                   |

### 4.1 Enforcement hooks

Instructions alone did not work. 16 skill invocations across 9,474 assistant
turns proves it. These hooks encode the owner's repeated corrections as
structure.

- `PreToolUse` on `git commit` and `git push`. Block unless the owner asked in
  the current turn. The owner restated this rule in at least five sessions.
- `PostToolUse` on writes under `server/`. Flag a newly added `console.log`.
- `Stop`. Refuse a completion claim when `npm run check` has not run since the
  last edit.

## 5. Program B: codebase remediation

Phases run in order. Each phase must pass its gate before the next begins.

| Phase | Work                                                                      | Gate                                                    |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| B0    | Create the branch. Delete the two fully merged branches                   | Clean tree                                              |
| B1    | Wire local Supabase into CI so the 16 integration tests run               | RLS, migration, and outbox tests execute and pass in CI |
| B1p   | Read every file word for word. Record findings in a register              | Every file read. No sampling                            |
| B2    | Delete `api/_bundle.js`. Replace `PreviewParam.test.tsx` with a real test | The build stays green                                   |
| B3    | Fix the `vc_` localStorage defect and the unredacted AI payload logging   | A failing test exists first for each                    |
| B4    | Re-derive the `shared/schema.ts` split into seven domain modules          | No consumer import changes                              |
| B5    | Decompose `server/databaseStorage.ts`                                     | `IStorage` unchanged                                    |
| B6    | Move business logic out of route handlers                                 | B1 tests stay green                                     |
| B7    | Add RLS as defense in depth                                               | Policy tests run in CI                                  |
| B8    | Link or delete `/internal-page` and the `/admin/scrape` pair              | No orphans                                              |
| B9    | UI and UX pass                                                            | Per screen                                              |
| B10   | Write the documentation set                                               | Section 7                                               |

B1 is the keystone. Work after it is unverifiable without it.

## 6. Model routing and dispatch protocol

### 6.1 Verified model facts

|                               | Sol                                  | Terra       | Luna                                    |
| ----------------------------- | ------------------------------------ | ----------- | --------------------------------------- |
| Price per 1M input and output | $5 / $30                             | $2.50 / $15 | $1 / $6                                 |
| Default effort                | low                                  | medium      | medium                                  |
| Effort ladder                 | low, medium, high, xhigh, max, ultra | same        | low, medium, high, xhigh, max. No ultra |
| Context                       | 272k, 872k maximum                   | same        | same                                    |

`ultra` means maximum reasoning with automatic task delegation. Luna cannot run
it. Project policy excludes Sol.

All three models set `include_skills_usage_instructions: false`. Codex models do
not receive skill usage instructions the way Claude Code does. Each dispatch
must name the skills to load.

### 6.2 Routing

| Work                                            | Model  | Effort         |
| ----------------------------------------------- | ------ | -------------- |
| Read every file and criticise it                | Luna   | high           |
| Mechanical codemods, renames, test scaffolds    | Luna   | medium         |
| Reconcile findings across many files            | Sonnet | not applicable |
| Decompose modules, extract services, design RLS | Terra  | high or xhigh  |
| Work that needs self delegation                 | Terra  | ultra          |
| Orchestrate, review, verify, plan               | Opus   | not applicable |

The operating rule: start with the lowest model and effort pair that produces a
checkable artifact. Escalate only the stage that failed.

### 6.3 Dispatch contract

Every Codex dispatch receives four things.

1. The task brief, with file paths and line numbers.
2. The acceptance test. A command that proves the work, not a description of it.
3. The skills to load, named explicitly.
4. A requirement to append one row per decision to the `show-me-your-work` TSV
   ledger.

The ledger gives the owner a tracked record of every implementation decision. It
lets the reviewer audit a run without reading the full transcript.

## 7. Documentation set

Structure follows Diataxis. Style follows the Google developer documentation
style guide: sentence case headings, second person, active voice, present tense.
Apply the `unslop` skill to every document before it lands.

### 7.1 Tier 1, required

`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`,
`docs/reference/architecture.md`, `docs/reference/data-model.md`,
`docs/reference/environment-variables.md`, `docs/reference/api/`,
`docs/reference/glossary.md`, `docs/how-to/run-tests.md`,
`docs/how-to/add-a-migration.md`, `docs/operations/deploy-runbook.md`,
`docs/operations/release-checklist.md`,
`docs/explanation/auth-and-authorization.md`,
`docs/explanation/migration-strategy.md`, `docs/product/feature-map.md`,
`CLAUDE.md`.

`docs/product/feature-map.md` traces screen to route to API to table. It answers
the complaint that nothing is properly connected.

### 7.2 Tier 2, recommended

Tutorials: `local-setup.md`, `first-brand-walkthrough.md`,
`adding-an-api-route.md`.

How-to guides: `add-a-page-and-route.md`, `add-an-llm-provider.md`,
`debug-a-failed-citation-run.md`, `set-up-stripe.md`, `configure-resend-dns.md`,
`rotate-secrets.md`, `restore-from-backup.md`.

Reference: `cli-scripts.md`, `postgres-roles-and-rls.md`, `error-codes.md`.

Explanation: `why-nitro-express-hybrid.md`, `concurrency-and-idempotency.md`,
`testing-strategy.md`, `llm-orchestration.md`.

Operations: `incident-response.md`, `monitoring-and-alerts.md`,
`backup-and-restore.md`.

Decisions: `docs/adr/`, starting with back-filled records for decisions already
taken.

### 7.3 Preventing a second decay

Writing documents fixes today. It does not stop them going stale again, which is
the real complaint. Three mechanisms prevent that.

1. A documentation verification script in CI. It extracts checkable claims from
   the documents, such as environment variable names, npm script names, route
   paths, table names, and ports. It fails the build when a claim does not match
   the code.
2. `markdownlint` and a style check wired into the existing `lint-staged`
   configuration.
3. The `unslop` skill applied to every document before it lands.

Without the first mechanism this document goes stale too.

## 8. Out of scope

- No commits or pushes unless the owner asks in that turn.
- No merge into `main`.
- No production deployment and no production database access.
- No new branches beyond `remediation-program-2026-08-28`.
- Containers start when a phase needs them and stop immediately afterwards.
- One test run at a time.

## 9. Open questions

- Nobody has executed the Vercel build path. Running `VERCEL=1 vite build` would
  resolve whether that deployment target works. Track this in B1.
- `docs/superpowers/REGISTER.md` records 12 self-corrections from a prior agent
  run. Section 2 treats it as a hint, not as evidence. B1p verifies its open
  findings independently.
