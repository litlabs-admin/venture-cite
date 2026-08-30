# B7-19: cron/scheduler parity test made behavioural, cron.ts extraction finished

## What the old test protected

`tests/unit/schedulerOrchestratorParity.test.ts` guarded one real invariant:
every job the in-process scheduler (`server/scheduler.ts`'s `initScheduler()`)
registers via `cronCrashGuard(name, fn)` must also exist as an
`orch.run(name, fn)` step in the daily orchestrator
(`server/routes/cron.ts`'s `/api/cron/daily-orchestrator`). If it didn't, that
job would silently stop running the day `DISABLE_IN_PROCESS_SCHEDULER` /
`EXTERNAL_CRON_ORCHESTRATOR_ENABLED` flip to hand scheduling to an external
trigger, with no error, no failed step, no log line - just a job that used to
run and now doesn't. A second check guarded that every orchestrator step has
a budget cap in `STEP_CAPS_MS`, because a missing cap makes the step's
deadline `NaN`.

The old implementation `readFileSync`'d both `server/scheduler.ts` and
`server/routes/cron.ts` and regexed for the literal strings
`cronCrashGuard("name"` and `orch.run("name"`, plus a slice of the
`STEP_CAPS_MS` block. As documented in
`.audit/B7/B7-17-onboarding-cron-account-extraction.md`, this broke on a
comment that merely contained the substring `orch.run("step-name"` while
_explaining_ the constraint - a false positive with no runtime meaning. It
also forced `cron.ts` to keep the `Orchestrator` class, `STEP_CAPS_MS`, and
every literal `orch.run(...)` call site in the route file specifically so the
regexes would keep matching, blocking the rest of the B7 extraction.

## How the new test protects it

Rewrote `tests/unit/schedulerOrchestratorParity.test.ts` to assert over real
data and real behaviour, with no source-text reads at all:

- **Scheduler side** - new leaf module `server/lib/schedulerJobRegistry.ts`
  exports `SCHEDULER_JOB_NAMES`, a plain object of the 10 job-name string
  constants. `server/scheduler.ts`'s 10 `cronCrashGuard(...)` call sites were
  changed to reference these constants directly (e.g.
  `cronCrashGuard(SCHEDULER_JOB_NAMES.accountPurge, runAccountPurgeJob)`)
  instead of inline string literals, so the registry is the actual data
  driving registration, not a copy kept in sync by hand. It's a dependency-free
  module (no DB/Supabase/Resend imports), so the test can import it without
  paying `scheduler.ts`'s module-load cost - the same reason the old test gave
  for reading source text in the first place.
- **Orchestrator side** - the test drives the real
  `POST /api/cron/daily-orchestrator` HTTP handler (via the same
  Express-shim-and-mock pattern already used in
  `tests/unit/cronOrchestrator.test.ts`, with all job functions stubbed to
  resolve instantly) and reads which steps ran from the real JSON response
  body (`results[].step`) - the same array a production caller sees. The
  system clock is pinned with `vi.setSystemTime` to one confirmed Monday
  (2026-08-31) and one confirmed Sunday (2026-08-30) so both day-of-week-gated
  branches (`v2-weekly-summary`, `weekly-catchup-kickoff`,
  `weekly-report-legacy`) execute across the two runs, and `STRIPE_SECRET_KEY`
  is set so `stripe-products-setup` runs too. A sanity assertion
  (`expect(new Date(MONDAY).getUTCDay()).toBe(1)` etc.) fails loudly if those
  fixture dates ever stop landing on the days the test relies on, instead of
  silently under-covering.
- **Cap check** - checked against the steps that _actually ran_ in the above
  (real behaviour), not against `STEP_CAPS_MS`'s own keys - checking a table
  against itself would be tautological and blind to a stale cap entry left
  behind after its `orch.run(...)` call site was deleted. `STEP_CAPS_MS` is
  now exported as real data from the new `server/services/cronOrchestrator.ts`
  module.
- Both checks read genuine exported/observed data. A comment containing a
  step-name-shaped string cannot add a phantom entry or hide a real one, in
  either direction.

## Remove-a-step fail-then-pass evidence

Temporarily deleted the `orch.run("tour-events-cleanup", ...)` line from
`server/routes/cron.ts` (simulating a step dropped from the orchestrator while
the scheduler still runs it) and reran the test:

```
FAIL  tests/unit/schedulerOrchestratorParity.test.ts > scheduler ↔ orchestrator job parity > registers every in-process cron job as an orchestrator step
AssertionError: scheduler-only jobs never run when DISABLE_IN_PROCESS_SCHEDULER is set: expected [ 'tour-events-cleanup' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "tour-events-cleanup",
+ ]
```

Restored the line and reran: `4 passed (4)`. The new test catches the exact
scenario the old one was written for, with no source-text dependency.

## What was extracted (Step 3)

Moved out of `server/routes/cron.ts` into a new
`server/services/cronOrchestrator.ts`, **verbatim**:

- The `Orchestrator` class (unchanged: `budgetUntilMs`, `results`,
  `remainingMs()`, `outOfBudget()`, `run<T>()` with its exact
  `deadlineMs = Math.min(this.budgetUntilMs, Date.now() + cap)` computation).
- `STEP_CAPS_MS` (all 30 entries, same numbers, same comments) and the
  `StepName` / `StepResult` types.
- `getOrchestratorBudget()` / `ORCHESTRATOR_BUDGET_MS` (same env var name,
  same `10_000`-`3_600_000` bounds, same `CRON_TOTAL_BUDGET_MS` fallback).

`cron.ts` now imports `{ Orchestrator, ORCHESTRATOR_BUDGET_MS }` from that
module. Everything from `export function setupCronRoutes` onward - the full
sequence of `orch.run("step-name", fn)` calls, the day-of-week/env gates, the
comments explaining ordering - is **byte-for-byte unchanged** (confirmed via
`git diff`, which shows only the import-block replacement; no lines changed
inside the handler body). This is deliberate: which steps run, in what order,
under what gate, is this route's orchestration policy, not extractable
business logic - matching the reasoning B7-17 already used to justify keeping
`chatbot-prune`'s inline body and the day-of-week gates in the route.

Also updated the now-stale header comments in `server/routes/cron.ts`,
`server/services/cronMaintenance.ts`, `server/services/cronRetention.ts`, and
`server/services/cronFactVerification.ts` that referenced the old
"the parity test reads this file's source text, so the call site must stay
here" constraint - they now describe the real reason (orchestration policy
lives in the route) instead of a testing artifact.

`cron.ts` shrank from 429 to 293 lines; no route-file logic remains to
extract beyond what B7-17 already pulled into `server/services/cron*.ts`.

## Confirmations

- **Per-step deadline math and `cronStepBudget`**: untouched. `Orchestrator.run()`'s
  `deadlineMs = Math.min(this.budgetUntilMs, Date.now() + cap)` moved
  character-for-character into `cronOrchestrator.ts`. Every step's deadline
  threading in `cron.ts` (`(deadline) => resumeInFlightAutopilots(deadline)`,
  `(deadlineMs) => runContentCostOutboxDrain({..., deadlineMs, ...})`, etc.) is
  unchanged - the handler body was not edited beyond the import block.
  `tests/unit/cronOrchestrator.test.ts` (18 tests, unchanged, still passing)
  continues to exercise the full HTTP path including the
  orchestrator-deadline assertion on `content-cost-outbox-drain`.
- **`CRON_SECRET` self-authentication and `PUBLIC_API_ROUTES`**: neither
  `server/services/cronAuth.ts` (the `isCronAuthorized` check) nor
  `server/auth.ts`'s `PUBLIC_API_ROUTES` set was touched -
  `git diff --stat server/auth.ts` is empty. `tests/unit/requireAuthForApi.test.ts`
  (left alone, as instructed - it legitimately snapshots the allowlist as
  text) still passes.
- **`EXTERNAL_CRON_ORCHESTRATOR_ENABLED` stays `"false"` in `render.yaml`,
  and `schedulerMode.ts` still throws without it**: `render.yaml` and
  `server/lib/schedulerMode.ts` were not touched (`git diff --stat` empty for
  both). `tests/unit/schedulerMode.test.ts` (unchanged, still passing)
  continues to assert the throw behaviour and the `render.yaml` values.

## Files changed

- `server/lib/schedulerJobRegistry.ts` (new) - the scheduler job-name registry.
- `server/services/cronOrchestrator.ts` (new) - `Orchestrator`, `STEP_CAPS_MS`,
  budget calc, extracted verbatim from `cron.ts`.
- `server/scheduler.ts` - 10 `cronCrashGuard("literal", ...)` call sites now
  reference `SCHEDULER_JOB_NAMES.*` instead of inline strings; no other logic
  changed.
- `server/routes/cron.ts` - `Orchestrator`/`STEP_CAPS_MS`/budget code removed
  and replaced with an import; header comment updated; handler body
  unchanged.
- `server/services/cronMaintenance.ts`, `cronRetention.ts`,
  `cronFactVerification.ts` - header comments updated to drop the stale
  "parity test reads source text" rationale.
- `tests/unit/schedulerOrchestratorParity.test.ts` - rewritten as described
  above.

## Verification run

Ran only the scheduler/cron-related suites (per instructions, not the full
test run):

```
tests/unit/schedulerOrchestratorParity.test.ts
tests/unit/cronOrchestrator.test.ts
tests/unit/schedulerMode.test.ts
tests/unit/cronAuthService.test.ts
tests/unit/cronMaintenanceService.test.ts
tests/unit/cronRetentionService.test.ts
tests/unit/cronFactVerificationService.test.ts
tests/unit/requireAuthForApi.test.ts
tests/unit/autopilotRetry.test.ts
tests/unit/citationCronUnconditional.test.ts
tests/unit/jobDebounce.test.ts
tests/unit/mentionScanDeadline.test.ts
tests/unit/schedulerConcurrencyGuards.test.ts
```

Result: 13 files, 108 tests, all passing. `npx tsc --noEmit -p .` shows no
errors in any changed file. `npx eslint` on the changed files: 0 errors (6
`no-explicit-any` warnings in the new test file, matching the identical
pre-existing pattern in `tests/unit/cronOrchestrator.test.ts`, which has 8 of
the same warning). `npx prettier --check` clean on all changed files.

## Note for follow-up (not addressed here, out of scope)

Two unrelated existing source-text tests -
`tests/unit/citationCronUnconditional.test.ts` and
`tests/unit/stripeWebhookCoverage.test.ts` - have header comments citing "the
same reasoning as tests/unit/schedulerOrchestratorParity.test.ts" to justify
their own source-text approach. That cross-reference is now stale for the
orchestrator side specifically (which is behavioural), though both files
remain legitimate source-text checks in their own right (a raw SQL WHERE
clause and a Stripe webhook switch, neither of which a mocked DB/Stripe
client can actually prove). Left untouched since neither file was in scope
for this task and the comment is cosmetic, not a testing defect.
