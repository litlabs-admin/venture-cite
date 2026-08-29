# B6a-10: Citation-run creation guards (bound + reap)

Fixes the two defects named in the task, both recorded but left unfixed by
`569f746` and by `.audit/B6/B6a-08-why-nothing-caught-it.md` /
`.audit/B6/B6a-06-slice-driver-audit-jobs.md`:

- **Defect A** - `isBrandDueForCitation` (`server/scheduler.ts`) gates only the
  scheduler's own decision to call `runBrandPrompts`. Only the scheduler
  stamps `brands.lastAutoCitationAt`; `server/lib/onboardingAutopilot.ts`
  never does. So a run started by the onboarding autopilot is invisible to
  that gate - it bypasses it completely, not just "sometimes".
- **Defect B** - `citation_runs_one_active_per_brand` (migration 0035) allows
  one `pending`/`running` row per brand. Run creation happens before any
  provider call, so a run abandoned mid-flight (crash, killed serverless
  function, a stuck slice) pins that row forever. Every later automatic
  attempt has no `runId` to reuse, so it always tries to `INSERT`, always
  collides (`23505`), and the brand silently never completes another
  automatic run.

Both are fixed in one place: `runBrandPrompts` in `server/citationChecker.ts`,
at the exact point a new `citation_runs` row is created (`options.runId` not
supplied). This is deliberate, per the task's own framing - a bound built at
the scheduling layer (`scheduler.ts`) is what already failed once (the
autopilot never went through it); a second scheduling-layer check fails the
same way the moment a third caller appears. Enforcing it where the row is
actually written means every current and future caller inherits it for free.

## Files changed

- `server/citationChecker.ts` - the guard itself, in `runBrandPrompts`'s
  run-creation branch.
- `server/lib/citationReconciliation.ts` - exported the existing 5-minute
  orphan threshold as `ORPHAN_THRESHOLD_MS` so the new inline reap reuses the
  exact same number as the boot-time/daily sweep, instead of a second magic
  constant.
- `server/storage.ts` / `server/storage/citationsStorage.ts` - one new method,
  `countAutomaticCitationRunsSince(brandId, since)`, counting `citation_runs`
  rows with `triggeredBy IN ('cron', 'auto_onboarding')` since a timestamp.
- `tests/unit/citationRunGuards.test.ts` - new, 7 tests.

`server/lib/factAgent/v2/runFactSheetRefresh.ts` and
`server/lib/onboardingAutopilot.ts` were not touched, per the task's
constraint - both were verified already fixed.

## Defect A: the bound chosen

`AUTOMATIC_RUN_WINDOW_MS = 60 * 60_000` (1 hour), `AUTOMATIC_RUN_MAX_PER_WINDOW
= 3`, counted per brand from `citation_runs` rows with `triggeredBy IN
('cron', 'auto_onboarding')` and `startedAt` inside the window. Only applies
when `triggeredBy` is `"cron"` or `"auto_onboarding"` - `"manual"` never
calls `countAutomaticCitationRunsSince` at all (see the "manual never even
asks" test below), so a human clicking the button is never affected by this
counter, including its cost: the query isn't even issued.

Reasoning, from what the product actually does rather than a round number:

- **Cron cadence**: `AUTO_CITATION_CRON` fires hourly
  (`"0 * * * *"`, `server/scheduler.ts`), but `isBrandDueForCitation` only
  lets a brand through once `daysSinceLast >= 6`. So cron alone produces at
  most one automatic run per brand per rolling hour (and normally at most one
  per ~6 days).
- **Onboarding autopilot cadence** (already fixed, read for context only):
  a stranded brand is retried at most `AUTOPILOT_MAX_ATTEMPTS` (5) times,
  each attempt backed off `AUTOPILOT_RETRY_BACKOFF_MINUTES` (60) from the
  last, and each attempt creates at most one new `citation_runs` row (the
  fixed code only calls `runBrandPrompts` fresh when
  `getActiveCitationRuns` is empty; otherwise it resumes the existing row).
  So onboarding alone also produces at most one new automatic run per brand
  per rolling hour under normal operation.
- Together, a brand can legitimately see up to ~2 automatic run creations in
  the same rolling hour (a cron tick and an onboarding retry landing close
  together). A cap of 3 leaves headroom above that for clock/backoff jitter
  without opening the door back up to a loop.
- The incident produced one run roughly every 18 minutes - over 3 per hour.
  A cap of 3 refuses it on the very next attempt once the window fills,
  instead of at run 114.

A refusal returns `{ totalChecks: 0, totalCited: 0, rankings: [], runId:
null, done: false }` and does not insert anything. `done: false` was chosen
deliberately over `done: true`: `scheduler.ts`'s cron path and
`onboardingAutopilot.ts`'s (unmodified) auto_onboarding path both treat
`done: false` as "slice incomplete, resume next tick" and, critically,
neither advances a brand's real progress state on that basis - `scheduler.ts`
just skips stamping `lastAutoCitationAt` and moves to the next brand;
`onboardingAutopilot.ts` just returns and stays in `running_citations`. Had a
refusal instead returned `done: true` with zero checks, `onboardingAutopilot`
would read that as "the citation phase finished" and advance the brand to
step 3 having done no actual work - a worse defect than the one being fixed.
`done: false` costs nothing extra: the refusal is a fast no-op (no DB insert,
no provider call), and the guard's own `logger.warn` on every refusal is the
visibility the task asked for, independent of whatever the caller logs about
"incomplete".

## Defect B: the reaping threshold and why

Threshold: 5 minutes, taken directly from
`server/lib/citationReconciliation.ts`'s existing `ORPHAN_THRESHOLD` (now
also exported as `ORPHAN_THRESHOLD_MS`) rather than inventing a second
number. That file's own comment is the justification and still holds: "a
genuine in-progress run completes in well under 5 minutes; anything past
that... is almost certainly a lambda-killed orphan." `citation_runs` has no
`updated_at`/last-progress column - `startedAt` is the only timestamp
available for staleness, which is the same constraint that file and
`server/routes/cron.ts`'s `drainPendingCitationRuns` already work under (the
latter uses a much shorter 30s "might still be actively polled" threshold for
a different purpose - deciding whether to nudge a slice forward, not whether
to declare it dead).

Shape chosen: mark-stale-as-terminal (same shape as
`reconcileOrphanCitationRuns`), not `factScrapeBackstop.ts`'s
retry-counter/resume shape. Both were read, per the task's suggestion.
`factScrapeBackstop.ts` fits its own table because `brand_fact_scrape_runs`
already had `retry_count` and `last_advance_at` columns and a resumable
`runAggregate`, all built for exactly this purpose. `citation_runs` has
neither an attempt counter nor a designed "advance from where it left off"
entry point (the closest equivalent, `advanceCitationRun`, already exists as
a _separate_ mechanism the cron drain calls to nudge stuck-but-not-yet-stale
runs, on a 30s threshold) - and this codebase had already committed to the
mark-as-`failed`-and-let-the-brand-start-fresh shape for this exact table
(`reconcileOrphanCitationRuns`), including the field values it writes
(`status: 'failed'`, `errorMessage`, `completedAt`, `progressPct: 100`). This
fix reuses that same shape and those same field values so a reaped row looks
identical in the UI and history regardless of which of the two mechanisms
caught it. It does not touch, widen, or drop
`citation_runs_one_active_per_brand` - the invariant (one active run per
brand) is correct; the fix makes the run-creation path itself capable of
clearing a dead one instead of colliding with it (23505) on every attempt,
forever.

Placement: inline, inside `runBrandPrompts`'s automatic-trigger branch,
_before_ the rate-bound check above and before `createCitationRun`. This
matters for two of the required test cases: a stale row is reaped and the
_same call_ is then allowed to proceed to create its replacement (not just
"reaped, try again next time"); a genuinely fresh (non-stale) active row is
left untouched and the call is refused rather than racing a real in-flight
run.

## Fail-then-pass evidence

New file: `tests/unit/citationRunGuards.test.ts`, 7 tests - 4 target the two
defects directly, 3 pin down behavior that must stay unchanged (manual is
never bound, a fresh brand is allowed, manual never even queries active
runs).

Verification: `git stash push -- server/citationChecker.ts server/storage.ts
server/storage/citationsStorage.ts server/lib/citationReconciliation.ts` put
the working tree back on the pre-fix versions of all four touched files, ran
the new test file, then `git stash pop` to restore the fix.

**Against the OLD logic**, 4 of 7 failed - exactly the ones exercising the two
defects, with the actual failure being "the run proceeded instead of being
refused/reaped":

```
 ❯ tests/unit/citationRunGuards.test.ts (7 tests | 4 failed)
     × refuses an automatic (cron) run once the per-brand window is full, and logs brandId + reason
     × refuses an automatic (auto_onboarding) run once the per-brand window is full
     × reaps a run stuck 'running' for over 5 minutes and permits the next automatic run
     × does NOT reap a run that is genuinely still in progress, and refuses the automatic attempt instead

AssertionError: expected { Object (totalChecks, totalCited, ...) } to deeply equal { totalChecks: +0, …(4) }
- Expected
+ Received
  {
-   "done": false, "rankings": [], "runId": null, "totalChecks": 0,
+   "done": true, "rankings": [ { "aiPlatform": "ChatGPT", ... } ], "runId": "run-new", "totalChecks": 1,
    "totalCited": 0,
  }
  (bound test: the run was created and completed instead of refused)

AssertionError: expected "vi.fn()" to be called with arguments: [ 'run-stale', ObjectContaining{…} ]
Received: 1st vi.fn() call: [ "run-new", { status: "succeeded", ... } ]
  (reap test: updateCitationRun was called to finalize the NEW run, never to
  fail the stale one - the stale row was never touched)

AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
  (in-progress test: updateCitationRun WAS called - the code created and
  completed a second run alongside the genuinely active one instead of
  refusing)

 Test Files  1 failed (1)
      Tests  4 failed | 3 passed (7)
```

The 3 that passed even pre-fix are the ones that assert pre-existing, already
correct behavior (fresh brand allowed, manual allowed, manual doesn't touch
`getActiveCitationRuns`) - confirming the test file isn't accidentally
asserting something the old code already did.

**Against the FIXED logic** (restored via `git stash pop`):

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Run together with every other test file in `tests/unit/` whose name mentions
citation, scheduler, autopilot, or cron (17 files):

```
npx vitest run tests/unit/autoCitationDeadline.test.ts tests/unit/autopilotRetry.test.ts \
  tests/unit/citationChecker.kickoff.test.ts tests/unit/citationChecker.matcherAuthority.test.ts \
  tests/unit/citationCheckerBatchInsert.test.ts tests/unit/citationCronUnconditional.test.ts \
  tests/unit/citationReconciliation.test.ts tests/unit/citationRunGuards.test.ts \
  tests/unit/cronOrchestrator.test.ts tests/unit/cronPublicAuth.test.ts \
  tests/unit/dashboardCitationTrend.test.ts tests/unit/nitroBootScheduler.test.ts \
  tests/unit/onboardingAutopilotClaim.test.ts tests/unit/onboardingAutopilotResumeLoop.test.ts \
  tests/unit/schedulerEnvironment.test.ts tests/unit/schedulerMode.test.ts \
  tests/unit/schedulerOrchestratorParity.test.ts

 Test Files  17 passed (17)
      Tests  93 passed (93)
```

`npx tsc --noEmit -p tsconfig.json` is clean on the whole project.
`npx eslint` on the four changed source files plus the new test file: 0
errors, 13 pre-existing `no-explicit-any` warnings (none introduced by this
change - the new code uses `as never`, matching the existing cast style one
line above it). `npx prettier --check` passes on all five files.

## Flows deliberately left unguarded

- **Manual runs** (`triggeredBy: "manual"`), whether via the HTTP route's
  `kickoffBrandPromptsRun` or the rarer direct call in
  `server/lib/agentTaskExecutor.ts`, never consult the rate bound and never
  trigger the reap. The task requires this ("must NOT block a user-initiated
  manual run"); a stale row blocking a manual click is handled by the
  pre-existing, separate `kickoffBrandPromptsRun` 23505 branch, which surfaces
  it to the user as a `409 already_running` with the existing run's id -
  a human being told "one is already running" and can decide what to do next
  is a better outcome for an intentional click than a silent server-side
  reap.
- **`server/routes/cron.ts`'s `drainPendingCitationRuns`** (the "no browser
  polling /advance" backstop, 30s-stale threshold) is untouched - it calls
  `advanceCitationRun` with an explicit `runId`, which goes through the
  `options.runId` branch of `runBrandPrompts`, not the creation branch this
  fix guards. It resumes a run in place; it never creates one, so neither
  defect applies to it.
- **`server/lib/citationReconciliation.ts`'s boot-time/daily
  `reconcileOrphanCitationRuns`** is untouched and still runs - it remains
  the backstop for a stale run on a brand that never attempts another
  automatic run at all (e.g. a brand past its 6-day cadence gate whose next
  legitimate attempt is still days away). This fix's inline reap only fires
  at the moment a new automatic attempt is actually being made; it does not
  replace the periodic sweep, it removes the sweep's dependency from being on
  the only path that unsticks a brand.
