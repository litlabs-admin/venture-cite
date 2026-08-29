# B6a-05: Regression tests for the autopilot resume-loop defects

New file: `tests/unit/onboardingAutopilotResumeLoop.test.ts` (15 tests total across
this file, `tests/unit/autopilotRetry.test.ts`, and
`tests/unit/onboardingAutopilotClaim.test.ts` - all green against the current
`server/lib/onboardingAutopilot.ts`).

No production code was modified. `git diff --stat` shows `server/lib/onboardingAutopilot.ts`
with its pre-existing fix (85 insertions / 31 deletions, already present in the
working tree before this task started - confirmed byte-identical before and
after by diffing against a saved copy) and the only new path is the untracked
test file itself.

## What each test asserts

### Defect 1 - finishing an in-flight citation run must not start a new one

All three tests seed the brand at `autopilotStatus: "running_citations"`, which
skips Phase 0 (fact scrape) and Step 1 (prompt generation) and lands directly on
the step-2 citation-run branch under test.

1. **"does NOT call runBrandPrompts and advances to step 3 when the active run
   finishes"** - one active run, `advanceCitationRun` resolves `{ done: true }`.
   Asserts `runBrandPrompts` is never called, and that `storage.updateBrand` is
   eventually called with `{ autopilotStatus: "completed", autopilotStep: 3 }`.
2. **"returns early and does NOT call runBrandPrompts when the active run is not
   yet done"** - same setup but `advanceCitationRun` resolves `{ done: false }`.
   Asserts `runBrandPrompts` is never called, `populateBrandDashboard` is never
   reached, and no `"completed"` status is ever written. (This is the
   complementary case that must keep passing - the fix only changed the `done:
true` path.)
3. **"calls runBrandPrompts exactly once when there is no active run"** -
   `getActiveCitationRuns` resolves `[]`. Asserts `advanceCitationRun` is never
   called and `runBrandPrompts` is called exactly once, with the brand id as its
   first argument.

### Defect 2 - `resumeInFlightAutopilots` bounds in-flight retries with a stall demotion

Uses a small duck-typed `flattenSql()` helper that walks a drizzle-orm `sql`
tagged-template value's `queryChunks` (SQL objects), joins `StringChunk.value`
arrays, and stringifies any other interpolated value (e.g. a plain error-message
string). This turns the object passed to the mocked `db.execute` into approximate
query text so the tests can assert on meaningful fragments without pinning exact
whitespace or requiring a real Postgres dialect.

1. **"issues the demotion UPDATE before the resume scan, targeting only the four
   in-flight statuses older than the stall threshold, and logs it"** - asserts
   `db.execute` is called exactly twice; call 1's flattened text contains
   `"UPDATE brands"`, `"SET autopilot_status = 'failed'"`, the exact four-status
   `IN (...)` list (and does _not_ contain `'idle'`), and
   `"autopilot_started_at < now() - interval '6 hours'"` (`AUTOPILOT_STALL_HOURS`);
   call 2's flattened text contains `"SELECT id, user_id FROM brands"` (the resume
   scan), proving order. Also asserts `logger.warn` was called with
   `{ count: 1, brandIds: ["brand-stalled"] }` and a message containing "demoted
   stalled in-flight brands".
2. **"does not demote or log when every in-flight brand is still inside the
   stall window"** - the mocked UPDATE returns `{ rows: [] }` (simulating that no
   row is old enough to match the real Postgres predicate). Asserts `logger.warn`
   is never called with the demotion message, and that the resume scan
   (`db.execute` call 2) still runs regardless.

## Fail-then-pass evidence

Per-test verification: saved the current (fixed) `server/lib/onboardingAutopilot.ts`
to a scratch copy, then `git stash push -- server/lib/onboardingAutopilot.ts` to
put the working tree back on the pre-fix version (confirmed via `grep` that the
file had neither the `if/else` split around `activeRuns.length > 0` nor
`AUTOPILOT_STALL_HOURS`), ran the new test file, then `git stash pop` to restore
the fix and diffed byte-for-byte against the scratch copy to confirm no residual
change.

**Against the OLD logic**, 3 of 5 tests failed (the 2 complementary/unchanged-behavior
tests correctly still passed):

```
× does NOT call runBrandPrompts and advances to step 3 when the active run finishes
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
  1st vi.fn() call:
    Array [
      "brand-1",
      undefined,
      Object {
        "deadlineMs": 1787983650807,
        "onProgress": [Function onProgress],
        "resume": true,
        "triggeredBy": "auto_onboarding",
      },
    ]
 ❯ tests/unit/onboardingAutopilotResumeLoop.test.ts:139:44
    expect(phaseStubs.runBrandPrompts).not.toHaveBeenCalled();

× issues the demotion UPDATE before the resume scan, targeting only the four in-flight
  statuses older than the stall threshold, and logs it
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 ❯ tests/unit/onboardingAutopilotResumeLoop.test.ts:196:29
    expect(dbStubs.execute).toHaveBeenCalledTimes(2);

× does not demote or log when every in-flight brand is still inside the stall window
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 ❯ tests/unit/onboardingAutopilotResumeLoop.test.ts:246:29
    expect(dbStubs.execute).toHaveBeenCalledTimes(2);

Test Files  1 failed (1)
     Tests  3 failed | 2 passed (5)
```

This is exactly the shape expected: the old code has no `if/else` guard (a
finished slice fell through into `runBrandPrompts`, which the first failure
catches directly), and the old `resumeInFlightAutopilots` issued only the single
sweep `SELECT` with no demotion `UPDATE` at all, so `db.execute` was called once
instead of twice (the second and third failures).

**Against the FIXED logic** (restored via `git stash pop`, verified
byte-identical to the pre-stash copy):

```
 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  11:37:09
   Duration  2.70s
```

All 15 tests pass, run together with the two existing sibling suites
(`autopilotRetry.test.ts`, `onboardingAutopilotClaim.test.ts`), confirming no
interference between the mock setups.

## Command run

```
npx vitest run tests/unit/onboardingAutopilotResumeLoop.test.ts tests/unit/autopilotRetry.test.ts tests/unit/onboardingAutopilotClaim.test.ts
```

`npx prettier --write tests/unit/onboardingAutopilotResumeLoop.test.ts` was run
on the final file.

## Things noticed but not changed

- `resumeInFlightAutopilots`'s stall-demotion `UPDATE` does not also reset
  `autopilot_attempts` or bump `autopilot_last_attempt_at`. Once demoted to
  `'failed'`, the row falls onto the `idle`/`failed` bounded path, which is
  gated on `autopilot_attempts < AUTOPILOT_MAX_ATTEMPTS` and
  `autopilot_last_attempt_at`. If a brand was already at or near the attempt cap
  from earlier `idle`/`failed` cycles before it somehow re-entered an in-flight
  state, the demotion would immediately make it ineligible for further retries
  under the current WHERE clause - which may be intended (fail closed rather
  than re-arm silently) but is worth a second look against actual production
  data shapes. Not in scope for this task since it's a design question about the
  fix, not something the two named defects called for changing.
- The onboarding-autopilot file the task pointed at already carries a large
  amount of pre-existing, uncommitted local diff unrelated to these two defects
  (confirmed via `git status`/`git diff --stat` before touching anything - files
  like `server/citationChecker.ts`, `server/routes.ts`,
  `shared/visibilityMetrics.ts`, etc. were already modified in the working tree
  at session start). None of that was touched or is part of this change.
