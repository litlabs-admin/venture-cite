# B7-17: onboarding.ts, cron.ts, userAccount.ts service extraction

Phase B6b/B7 extraction of business logic from three route files into
`server/services/`, matching the pattern established by the first 25
modules (flat files, domain-prefixed names, no `Service` suffix, no
Express types/req/res inside a service function).

## Handler inventory: before and after

| Route file                     | Before | After |
| ------------------------------ | -----: | ----: |
| `server/routes/onboarding.ts`  |    662 |   262 |
| `server/routes/cron.ts`        |    627 |   429 |
| `server/routes/userAccount.ts` |    527 |   340 |

New service modules (1,227 lines total):

| File                                      | Lines | Covers                                                                                                                            |
| ----------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------- |
| `server/services/onboardingState.ts`      |    60 | `PATCH /api/onboarding/state`                                                                                                     |
| `server/services/onboardingScrape.ts`     |   293 | `POST /api/onboarding/scrape-stream`                                                                                              |
| `server/services/onboardingActivation.ts` |   258 | `confirm`, `autopilot-retry`, `autopilot-advance/:brandId`, `autopilot-status/:brandId`                                           |
| `server/services/cronAuth.ts`             |    21 | Cron secret check (both cron endpoints)                                                                                           |
| `server/services/cronMaintenance.ts`      |   132 | Drain/reap steps: pending content jobs, pending citation runs, pending perception-probe runs, stuck content jobs, stale scan jobs |
| `server/services/cronRetention.ts`        |    97 | v2 lifecycle cleanup, signals retention prune, fact-scrape-events prune, llm-jobs drain/prune                                     |
| `server/services/cronFactVerification.ts` |    54 | `fact-reverification-batch` step body (LLM callable + batch call)                                                                 |
| `server/services/userGdpr.ts`             |   175 | `buildUserExport`/`sanitizeUserRow` (Art. 20), `scheduleAccountDeletion` (Art. 17)                                                |
| `server/services/userSettings.ts`         |   137 | `applyProfileUpdate`, `changeUserPassword`                                                                                        |

New tests (1,370 lines, one file per service module, calling every
extracted function directly with no HTTP layer):
`tests/unit/{cronAuthService,cronMaintenanceService,cronRetentionService,
cronFactVerificationService,onboardingStateService,onboardingScrapeService,
onboardingActivationService,userGdprService,userSettingsService}.test.ts`.

## Grouping rationale

- **onboarding.ts** split by endpoint cohesion: state-patch allowlist logic
  (`onboardingState`), the SSE scrape pipeline (`onboardingScrape`), and the
  four activation-pipeline endpoints that all decide when to call
  `runOnboardingAutopilot` (`onboardingActivation`).
- **cron.ts** split by what the orchestrator step actually _does_:
  drain/reap workers (`cronMaintenance`), retention/pruning sweeps
  (`cronRetention`), the fact-reverification batch (`cronFactVerification`,
  kept separate because of its distinct LLM-callable wiring), and the
  auth check (`cronAuth`). Steps that were already one-line delegations to
  an existing module (`runAccountPurgeJob`, `runAutoCitationJob`,
  `storage.pruneChatbotMessages()`, etc.) were left untouched - there was
  no route-local logic to extract.
- **userAccount.ts** split along the file's own stated grouping: GDPR
  self-service (`userGdpr`: export + deletion) versus account settings
  (`userSettings`: profile + password). Notification-preference endpoints
  were left as-is - they already delegate fully to
  `server/lib/notificationPrefs.ts` and have no route-local logic.

## cron.ts: partial extraction, and why (read this before touching cron.ts again)

`tests/unit/schedulerOrchestratorParity.test.ts` does not test behavior -
it `readFileSync`s `server/routes/cron.ts` as **text** and asserts on
literal substrings:

- `orchestratorSteps()` regexes for every literal `orch.run("step-name", ...)`
  call site in that file's source.
- The budget-cap test slices out the literal `const STEP_CAPS_MS = {...}`
  block from that same file and checks every step name it found above has
  an entry there.

Because of this, the following **stayed in `server/routes/cron.ts`
verbatim** and were deliberately NOT moved to a service, even though a
"handler should just call one service function" reading would suggest
otherwise:

- The `Orchestrator` class (time-budgeting, `run()` scheduling, skip-on-
  out-of-budget).
- The `STEP_CAPS_MS` table and its type.
- `getOrchestratorBudget()` / `ORCHESTRATOR_BUDGET_MS`.
- Every `orch.run("step-name", ...)` call site inside `setupCronRoutes`,
  including the ones whose bodies were extracted (the call site itself -
  the string literal plus the `orch.run(` syntax - had to remain; only the
  callback passed as the second argument was replaced with a call into the
  new service function).

What I actually moved is the **callback bodies** - the real per-step
work - into `server/services/cron*.ts`, leaving the call site
`orch.run("drain-pending-content-jobs", (deadline) =>
drainPendingContentJobs(deadline))` etc. in place. This is a legitimate
"handler calls one service function" shape and keeps every literal step
name and every cap in `STEP_CAPS_MS` exactly where the parity test reads
them.

One near-miss: my first draft of the file-header comment contained the
literal text `orch.run("step-name", ...)` while _explaining_ this
constraint - which is itself a false-positive match for the parity
regex (it added a phantom `"step-name"` entry with no cap, failing the
budget-cap test). Fixed by rewording the comment to avoid the pattern.
Verified: `schedulerOrchestratorParity.test.ts` passes with the same 3/3
tests as before, same step count found by both regexes.

No handler was fully blocked from extraction the way `billing.ts`'s
checkout handler reportedly was - cron.ts's constraint only pins the
orchestration _scaffolding_ (class, cap table, call sites), not full
handler bodies, so every step's actual logic did move out.

## Deadline threading - confirmed unchanged

- `drainPendingContentJobs(deadlineMs)`, `drainPendingCitationRuns(deadlineMs)`,
  `drainPendingPerceptionProbeRuns(deadlineMs)` moved verbatim into
  `cronMaintenance.ts` with the same `deadlineMs - 500` slice-budget math,
  same `Date.now() >= deadlineMs - 500` bail checks.
- `runLlmJobsDrainStep(deadline)` in `cronRetention.ts` forwards the
  orchestrator-supplied deadline straight into `drainPendingLlmJobs(deadline)`,
  unchanged.
- The orchestrator's own `run<T>(step, fn)` - which computes
  `deadlineMs = Math.min(this.budgetUntilMs, Date.now() + cap)` and passes
  it into every step function - never moved, so the per-step deadline
  calculation itself is byte-for-byte the original code.
- `STEP_CAPS_MS` values are unchanged (same 30 entries, same numbers).
- Verified via `tests/unit/cronOrchestrator.test.ts` (18 tests, all
  passing unchanged) which exercises the full orchestrator HTTP path,
  including the "runs the bounded content cost drain with the orchestrator
  deadline" assertion and the per-step ok/error/skip result shape.

## Autopilot detachment - confirmed unchanged

- `confirmOnboardingBrand` (onboarding confirm) and `retryOnboardingAutopilot`
  (autopilot-retry) both call `waitUntil(runOnboardingAutopilot(...).catch(...))`
  - same `waitUntil` import from `@vercel/functions`, same `.catch` shape
    reporting to `captureAndFlush` with the same tag strings
    (`"onboarding.ts:confirm-kickoff"`, `"onboarding.ts:autopilot-retry"`).
    Neither function `await`s the autopilot call - `waitUntil` fires it and
    the service function returns immediately after.
- `advanceOnboardingAutopilot` (client-driven `/autopilot-advance/:brandId`)
  is the one path that **does** `await runOnboardingAutopilot(...)`
  directly, exactly as the original route did - this is intentional
  (the client is polling and wants the result of this slice, not a
  detached kickoff) and is called out explicitly in both the source
  comment and `onboardingActivationService.test.ts` ("Unlike confirm/retry,
  advance is client-driven and must await the slice directly rather than
  detach it via waitUntil").
- Neither `runOnboardingAutopilot` nor `resumeInFlightAutopilots` was
  reimplemented - both are called into unchanged from
  `server/lib/onboardingAutopilot.ts`.
- Verified via `tests/unit/autopilotRetry.test.ts` (still passing
  unchanged: same 4 tests) and the new
  `onboardingActivationService.test.ts`, which asserts `waitUntil` fires
  exactly once for confirm/retry and never for advance.

## Soft-delete semantics - confirmed unchanged

- `scheduleAccountDeletion` in `userGdpr.ts` sets `deletedAt` /
  `deletionScheduledFor` only (`db.update(users).set({ deletedAt: now,
deletionScheduledFor: scheduledFor })`) - no row is ever hard-deleted.
- `GRACE_PERIOD_DAYS = 30` is unchanged (moved verbatim, same constant
  name and value, same `scheduledFor = now + 30 days` computation).
- The password re-verification (`supabaseAuth.signInWithPassword`) happens
  before any write, exactly as before.
- Global session revocation (`supabaseAdmin.auth.admin.signOut(bearer,
"global")`) still happens after the soft-delete write and is still
  non-fatal (caught, logged, reported to Sentry, does not fail the
  request) - matches the original's explicit comment that "the account is
  already deleted even when Supabase Auth is unavailable."
- One subtlety caught and fixed during extraction (see Defects below):
  the audit-log `before` field distinguishes "no row found" (`null`) from
  "row found with `deletedAt` already null" (`{ deletedAt: null }`) - my
  first draft collapsed these into the same case. Fixed by returning the
  full `previousRow: { deletedAt } | null` shape from the service instead
  of a flattened `Date | null`, so the route's `before: outcome.previousRow`
  reproduces the original `before: previous ? { deletedAt: previous.deletedAt }
: null` exactly.
- Verified via `tests/unit/userPasswordChange.test.ts`'s "POST
  /api/user/delete" block (both tests passing unchanged) plus new
  `userGdprService.test.ts` cases for both the `previousRow: null` and
  `previousRow: { deletedAt: null }` branches, and for revoke-failure
  non-fatality.

## What stayed in each handler, and why

- **All three files**: the outer try/catch → `logger.error` +
  `captureAndFlush` + generic 500 JSON shape. This is response shaping,
  Express-coupled, and matches the pattern in every other route file in
  the codebase.
- **onboarding.ts**: `requireUser`/`requireBrand`/`OwnershipError` checks
  (ownership enforcement, by definition a handler job); `validateDomain`
  and the SSE header/`activeScrapes` concurrency-guard Map for
  scrape-stream (request-lifecycle concurrency control, not business
  logic); `resolveTier(user)` (reads the authenticated user object, kept
  next to the ownership check it's adjacent to in the original code);
  brandName/website presence validation (400s) for confirm.
- **cron.ts**: the entire `Orchestrator`/`STEP_CAPS_MS` scaffolding (see
  above); the `chatbot-prune` step body (`storage.pruneChatbotMessages()`)
  and the `stripe-products-setup` gate (`if (process.env.STRIPE_SECRET_KEY)`)
  - both single-line delegations with nothing to extract; the `isMonday`/
    `isSunday`/day-of-week gating for weekly steps (orchestration policy, not
    a reusable business rule).
- **userAccount.ts**: `logAudit(req, ...)` calls in every handler that
  writes one - `logAudit` takes an Express `Request` (for actor/IP/
  user-agent extraction) and services must not import Express types, so
  this could not move without breaking the "no Express in services" rule.
  Zod schema definition/parsing for profile and password bodies (input
  parsing, a handler's job); the IANA timezone-list check was extracted
  into `applyProfileUpdate` instead, since it is a genuine domain rule
  (what counts as a valid timezone), not merely `zod` shape validation.
- **Rate limiters** (`exportRateLimit`, `deleteAccountRateLimit`,
  `aiLimitMiddleware` usage) are Express middleware and stayed in route
  files everywhere, matching the existing 25-module precedent.

## Defects spotted and left alone (per instructions, not fixed)

1. **`server/services/onboardingActivation.ts` (confirmOnboardingBrand)**:
   the original `onboarding.ts` did `const schema = await import("@shared/schema");`
   inside the confirm handler even though `users`/`resolveTier` were
   already statically imported from the same module at the top of the
   file. This dynamic re-import of an already-partially-imported module
   is redundant. Moved verbatim (not fixed) per "move bodies verbatim."
2. **`server/services/onboardingActivation.ts`**: the competitor-insert
   call still carries `} as any)` casting the competitor payload past
   `storage.createCompetitor`'s parameter type - present in the original
   code, produces one `no-explicit-any` lint warning (not an error), left
   as-is.
3. **`server/services/onboardingScrape.ts`**: inside the sitemap-fallback
   loop, a `const page = await safeFetchText(u, ...)` shadows the outer
   `const page = extractPageContent(html, 8_000)` from earlier in the same
   function. Confusing to read, harmless (correct due to block scoping),
   present in the original code, left unchanged.
4. **`server/routes/cron.ts` (pre-existing, not touched by this
   extraction)**: `runSignalsRetentionPrune` and `runFactScrapeEventsPrune`
   (now in `cronRetention.ts`) both do `const { db } = await import("../db")`
   / `const { sql } = await import("drizzle-orm")` as dynamic imports
   inside the function body, even though nothing prevents a static import
   at module scope (other steps in the same file do use static imports for
   `db`/drizzle helpers). Moved verbatim.

No new defects were introduced by the extraction itself; the above three
were already present in the routes before this change and are called out
per the "if you find a defect, write it down and leave it" instruction.

## Verification

- `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit -p .`
  → exits 0, no errors. (Plain `npx tsc --noEmit -p .` intermittently OOMs
  in this environment on an unrelated V8 GC issue unrelated to this
  change - the same command with a larger heap succeeds cleanly.)
- `npx eslint server/routes/onboarding.ts server/routes/cron.ts
server/routes/userAccount.ts server/services/` → 0 errors. Warnings are
  all pre-existing `no-explicit-any` in files outside this change's scope,
  plus the one pre-existing `any` cast called out in Defect #2 above.
- `npx prettier --check` on every file touched by this change → clean.
- Targeted test run (existing tests covering these three routes, plus all
  nine new service test files - 18 files, 113 tests, all passing):

  ```
  tests/unit/cronAuthService.test.ts
  tests/unit/cronMaintenanceService.test.ts
  tests/unit/cronRetentionService.test.ts
  tests/unit/cronFactVerificationService.test.ts
  tests/unit/onboardingStateService.test.ts
  tests/unit/onboardingScrapeService.test.ts
  tests/unit/onboardingActivationService.test.ts
  tests/unit/userGdprService.test.ts
  tests/unit/userSettingsService.test.ts
  tests/unit/autopilotRetry.test.ts
  tests/unit/cronOrchestrator.test.ts
  tests/unit/cronPublicAuth.test.ts
  tests/unit/schedulerOrchestratorParity.test.ts
  tests/unit/userPasswordChange.test.ts
  tests/unit/userProfileUpdate.test.ts
  tests/unit/onboardingAutopilotResumeLoop.test.ts
  tests/unit/onboardingAutopilotClaim.test.ts
  tests/unit/dashboardPerceptionService.test.ts

  Test Files  18 passed (18)
       Tests  113 passed (113)
  ```

  Every pre-existing test that touches these three routes passed
  **unchanged** - no test file was edited.

- Did not run the full suite, start a database, or start a container, per
  instructions (other agents are extracting concurrently in the same
  worktree).
