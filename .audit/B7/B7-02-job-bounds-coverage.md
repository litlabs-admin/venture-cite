# B7-02 — Closing the job/concurrency coverage gaps

Scope: the five confirmed mutation-survivors and the two missing-coverage
items named in `.audit/B6/B6b-02-mutation-concurrency.md`. That report's
analysis was read first and is not re-derived here; this report only closes
the gaps it found and records the proof.

Method for every gap below: apply the exact mutation, run only the specific
test file(s) touched, capture the actual failure text, revert the mutation
with `Edit` (never `git checkout`), re-run, confirm green. All five
production files are back to a zero-diff state - see the clean-tree proof at
the end.

---

## Gap 1 — `outboxRepository.ts` claim CTE loses its attempt cap

**File**: `tests/unit/outboxRepository.test.ts` (new test: "excludes a row
that has exhausted its retry budget from both claim branches").

The prior test ("claims one ready or expired command with skip locked")
checked four substrings across the whole claim query and never checked for
`attempt_count < max_attempts` anywhere, so deleting that bound from both
arms of the candidate CTE left it green. The new test slices the rendered
SQL at `candidate as (` and then at each arm's `status = '...'` boundary (the
first `status = 'processing'` in the query belongs to the unrelated
`expired_final` dead-letter-on-expiry branch, not the candidate CTE - the
slice starts after `candidate as (` specifically to skip it) and asserts
`attempt_count < max_attempts` is present in **each** arm individually.

**Mutation applied** (exact diff from the report):

```diff
-            and ((status = 'pending' and cancellation_requested_at is null and available_at <= now() and attempt_count < max_attempts)
-             or (status = 'processing' and cancellation_requested_at is null and lease_expires_at < now() and attempt_count < max_attempts)
+            and ((status = 'pending' and cancellation_requested_at is null and available_at <= now())
+             or (status = 'processing' and cancellation_requested_at is null and lease_expires_at < now())
```

**Command**: `npx vitest run tests/unit/outboxRepository.test.ts`

**Failure observed**:

```
AssertionError: expected 'status = \'pending\' and cancellation…' to contain 'attempt_count < max_attempts'

Expected: "attempt_count < max_attempts"
Received: "status = 'pending' and cancellation_requested_at is null and available_at <= now()) or ("
 ❯ tests/unit/outboxRepository.test.ts:66:24
```

**Restored**: `git diff --stat -- server/outbox/outboxRepository.ts` → empty.
**Pass after restore**: `10 passed (10)`.

This closes the gap for the exact reported mutation (a straight substring
deletion). It would **not** catch a mutation that neutralizes the same
clause without deleting its text (e.g. `false and (...)`) - see the
structural discussion below, which is why gap 2 (the same style of clause,
but the report's actual mutation for it takes that exact neutralizing form)
is closed differently.

---

## Gap 2 — `outboxRepository.ts` `reschedule` dead-letter transition disabled

**Decision: no unit-level text assertion closes this gap. Closed instead by
a new database-backed integration test**,
`tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts`, gated on
`TEST_DATABASE_URL` per the existing `tests/integration/` convention. **Left
unrun this session - no database was started, per the task's instructions.**
Rationale below.

### Why a scoped substring check cannot close this one (verified, not assumed)

The report's exact mutation for this gap is:

```diff
-        set status = case when cancellation_requested_at is not null or attempt_count >= max_attempts then 'dead_letter' else 'pending' end,
+        set status = case when false and (cancellation_requested_at is not null or attempt_count >= max_attempts) then 'dead_letter' else 'pending' end,
```

This is not a text deletion - every word survives, wrapped in a
`false and (...)` that makes it unreachable. Before deciding on the fix, I
built the tightest text assertion I could - not "does the whole query
contain the substring somewhere" (the original, defeated version) but "does
the specific `set status = case when ... then 'dead_letter'` span contain
it", scoped exactly to the one clause that matters and excluding the three
decoy occurrences (`available_at`, `payload`, `dead_lettered_at`) that
follow it in the same query:

```ts
const statusClause = statement.slice(
  statement.indexOf("set status = case when"),
  statement.indexOf("then 'dead_letter'") + "then 'dead_letter'".length,
);
expect(statusClause).toContain("attempt_count >= max_attempts");
```

I applied the mutation above and ran this scoped check as an experiment (not
committed - see the clean diff for `tests/unit/outboxRepository.test.ts`,
which contains only the gap-1 addition). Result: **`11 passed (11)` - the
scoped check still passed with the mutation applied**, because
`"attempt_count >= max_attempts"` is still literally present inside the
dead `false and (...)` clause. No amount of scoping fixes this; the defect
is semantic, not textual, and only evaluating the SQL can tell the
difference. This is exactly the report's own conclusion
(`.audit/B6/B6b-02-mutation-concurrency.md`, "Additional structural
finding"), now independently confirmed by trying and watching it fail to
catch the mutation.

### Options considered

1. **Execute the real repository against a database.** Zero production risk
   - purely additive test code. Fully proves the CASE WHEN's real behavior,
     including the concurrency-relevant guards (`lease_token`, `lease_expires_at
   > now()`) in the same statement. Cost: needs a live Postgres to run; in an
   > environment without one it is written but unverified until then.
2. **Restructure the predicate into a pure, directly callable value** (e.g.
   `resolveRescheduleOutcome({cancellationRequested, attemptCount,
maxAttempts}): "dead_letter" | "pending"`, computed in JS from a prior
   `SELECT`, with the `UPDATE` setting `status = ${outcome}` instead of
   embedding the decision in a `CASE WHEN`). This is real
   Postgres-independent unit coverage, but it changes `reschedule` from one
   atomic guarded `UPDATE` into a `SELECT` then `UPDATE`, which is a bigger
   and riskier production change than "keep the change minimal, only if
   genuinely required" allows for a coverage task - it also does not, by
   itself, get me anything a DB-backed test doesn't already give me, since
   the atomic-UPDATE architecture is not itself defective, only insufficiently
   tested.

**Chosen: option 1.** It closes the actual defect (a claim about SQL
behavior, provable only by running the SQL) with no change to production
code and no new production risk, and it directly matches the pattern this
codebase already uses for the same class of problem
(`tests/integration/competitorGeoRankingUpsert.test.ts`'s header describes
an identical rationale for a different table's `ON CONFLICT ... COALESCE`
logic). Option 2 was rejected because it requires restructuring a
single-statement atomic claim/reschedule primitive into two round trips to
make it independently testable in JS - a larger and riskier change than this
task's "keep it minimal" instruction supports, for a benefit (DB-free
testing) that option 1 achieves without touching production code at all.

### What the new integration test proves, once run

`tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts` imports the
real `createOutboxRepository()` (not a hand-duplicated copy of the SQL, which
is what `tests/integration/localOutboxMigration.test.ts` does today) and:

- Inserts a `processing` row with `attempt_count = max_attempts` and a valid
  lease directly via SQL, calls `repository.reschedule(...)`, and asserts
  against the **real post-call row** (not just the return value): `status =
'dead_letter'`, `dead_lettered_at` set, `lease_token` cleared, `payload =
'{}'`.
- Inserts a `processing` row still under budget, reschedules it, and asserts
  the real row flips back to `pending` with `available_at` set to exactly
  the passed `nextAvailableAt`.
- For gap 1's claim cap: inserts a `pending` row at `attempt_count =
max_attempts` pinned to `available_at = epoch` (sorts first among any real
  data under the claim query's `order by available_at, created_at`, making
  the test deterministic regardless of what else is pending in a shared test
  database) and asserts `claimNext()` never returns that row's id, then
  verifies its DB state is unchanged. A second test inserts a normal
  within-budget row and asserts it **is** claimed and its `attempt_count`
  really increments in the table.

**How to run** (documented in the file's header):

```sh
npx supabase start
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
LOCAL_SUPABASE_TEST=1 npx vitest run tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts
```

**Left unrun this session**: no database or container was started, per the
task's explicit instruction. Verified without a database that the file is
syntactically valid and gates correctly:

```
$ npx vitest run tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts
 Test Files  1 skipped (1)
      Tests  1 skipped (1)
```

`npx tsc --noEmit` over the whole project also passed with this file
present (no type errors).

I did not fabricate a pass and did not weaken the test to make it runnable
without a database - per the task's own instruction for exactly this
situation.

---

## Gap 3 — `outboxWorker.ts` loses exponential backoff

**File**: `tests/unit/outboxWorker.test.ts` (new test: "computes an
exponential backoff for the reschedule's nextAvailableAt").

The existing "reschedules a retryable handler failure" test asserted
`reschedule` was called with `objectContaining({...})`, deliberately not
checking `nextAvailableAt`. The new test uses fake timers pinned to a fixed
instant, sets `attemptCount = 4` (expected backoff `2**(4-1) = 8s`), and
asserts the exact `nextAvailableAt` passed to `outbox.reschedule`.

**Mutation applied** (exact diff from the report):

```diff
 function retryAt(attemptCount: number): Date {
-  return new Date(Date.now() + Math.min(3_600, 2 ** Math.max(0, attemptCount - 1)) * 1_000);
+  void attemptCount;
+  return new Date(Date.now());
 }
```

**Command**: `npx vitest run tests/unit/outboxWorker.test.ts`

**Failure observed**:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
Received:
  [
-   ObjectContaining { "nextAvailableAt": 2026-08-20T00:00:08.000Z, },
+   { ..., "nextAvailableAt": 2026-08-20T00:00:00.000Z, },
  ]
```

**Restored**: `git diff --stat -- server/outbox/outboxWorker.ts` → empty.
**Pass after restore**: `11 passed (11)`.

---

## Gap 4 — `advisoryLock.ts` ignores a lost lease during renewal

**File**: `tests/unit/jobLease.test.ts` (new test: "stops renewing and logs
when a renewal discovers the lease was lost").

Queues a renewal response of `{ rowCount: 0 }` (another holder took over),
advances fake timers past the first renewal tick, and asserts (a)
`logger.warn` fires with the lease-lost message, (b) no further renewal
queries occur even after advancing well past several more intervals (proves
the timer was actually cleared, not just that the log fired once), and (c)
the callback's result still resolves and the unconditional release query
still runs on the way out.

**Mutation applied** (exact diff from the report):

```diff
-      if (result.rowCount !== 1) {
+      if (false) {
         stopped = true;
```

**Command**: `npx vitest run tests/unit/jobLease.test.ts`

**Failure observed**:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ { leaseKey: 'daily-report' }, …(1) ]
Number of calls: 0
 ❯ tests/unit/jobLease.test.ts:157:29
```

**Restored**: `git diff --stat -- server/lib/advisoryLock.ts` → empty.
**Pass after restore**: `7 passed (7)`.

---

## Gap 5 — `scheduler.ts` loses its debounce+lock composition (auto-citation)

**File**: new `tests/unit/schedulerConcurrencyGuards.test.ts`. Every existing
test for `runAutoCitationJob` mocks `withJobDebounce`/`withAdvisoryLock` as
bare pass-through functions, which cannot distinguish "the guards ran and
allowed the body" from "the guards were deleted." This file mocks both as
controllable `vi.fn()`s: a test can assert they were actually invoked (with
the right job name / lock key) and can flip either to "deny" and assert the
job body genuinely does not run (checked via a `logger.info` spy on the
job's own first log line, "auto-citation job starting" - not merely the
return value).

**Mutation applied** (exact diff from the report):

```diff
 export async function runAutoCitationJob(deadlineMs?: number): Promise<void> {
-  await withJobDebounce("auto-citation", DEBOUNCE_WINDOWS["auto-citation"], () =>
-    withAdvisoryLock(schedulerLockKeys.autoCitation, "auto-citation-job", () =>
-      runAutoCitationJobImpl(deadlineMs),
-    ),
-  );
+  await runAutoCitationJobImpl(deadlineMs);
 }
```

**Command**: `npx vitest run tests/unit/schedulerConcurrencyGuards.test.ts`

**Failure observed** (all three auto-citation tests in the file failed):

```
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ ...concurrency composition > wraps the job body in the debounce and the advisory lock

AssertionError: expected "vi.fn()" to not be called with arguments: [ 'auto-citation job starting' ]
Received: ...called with "auto-citation job starting" (the body ran anyway)
 ❯ ...does not run the job body when the debounce denies the run
 ❯ ...does not run the job body when another runner holds the advisory lock
```

**Restored**: `git diff --stat -- server/scheduler.ts` → empty.
**Pass after restore**: `6 passed (6)`.

---

## Missing coverage — `scheduler.ts` `runWeeklyReportJob` composition

Same file, same reasoning as gap 5, applied to the identical composition in
`runWeeklyReportJob` (no test of any kind existed for it before this task).
To confirm the new tests actually detect a regression here too (not just
carry the same intent as the auto-citation tests), I constructed the
analogous mutation and watched it fail:

**Mutation applied** (not from the report - constructed for this item, since
none existed to remove a wrapper from):

```diff
 export async function runWeeklyReportJob(): Promise<{ sent: number; skipped: number }> {
-  const gate = await withJobDebounce(
-    "weekly-report",
-    DEBOUNCE_WINDOWS["weekly-report"],
-    async () => {
-      const outcome = await withAdvisoryLock(
-        schedulerLockKeys.weeklyReport,
-        "weekly-report-job",
-        runWeeklyReportJobImpl,
-      );
-      return outcome.ran ? outcome.result : { sent: 0, skipped: 0 };
-    },
-  );
-  return gate.ran ? gate.result : { sent: 0, skipped: 0 };
+  return runWeeklyReportJobImpl();
```

**Command**: `npx vitest run tests/unit/schedulerConcurrencyGuards.test.ts`

**Failure observed**:

```
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ runWeeklyReportJob concurrency composition > wraps the job body in the debounce and the advisory lock
```

(The two "denies the run" tests for weekly-report happened to still pass
under this specific mutation, because with an empty `eligibleUsers` list the
unwrapped body coincidentally also returns `{sent:0,skipped:0}` - the
"wraps..." test is the one that unambiguously catches the removal, which is
sufficient: at least one test in the set must fail, and did.)

**Restored**: `git diff --stat -- server/scheduler.ts` → empty.
**Pass after restore**: `6 passed (6)`.

---

## Missing coverage — `llmJobs.ts` `drainPendingLlmJobs` / `pruneExpiredLlmJobs`

**File**: new `tests/unit/llmJobsDrainAndPrune.test.ts`. Both functions were
previously only ever replaced via `vi.mock("../../server/lib/llmJobs", ...)`
in `tests/unit/cronOrchestrator.test.ts` (whose own header disclaims
covering job bodies) - never called for real anywhere. The new file mocks
only the true I/O boundary (`server/db`'s query-builder chain and the OpenAI
SDK), the same boundary `tests/unit/llmJobsOutbox.test.ts` already uses for
`enqueueLlmJob`, and calls the real functions.

Three mutations were tried and all three were caught (each individually
applied, run, observed to fail, reverted, re-run to confirm green):

**3a. `batchSize` bound** (`.limit(batchSize)` → `.limit(20)`):

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 7 ]
Received: [ 20 ]
```

**3b. Per-tick deadline check** (`if (Date.now() >= deadlineMs - 500) break;`
→ `if (false) break;`):

```
AssertionError: expected { attempted: 2, ... } to deeply equal { attempted: 0, ... }
```

**3c. `pruneExpiredLlmJobs`'s "now" bound** (`new Date()` → `new Date(0)` -
this specifically defeats a naive "does the SQL say `<`" check, which is why
the test also asserts the _parameter value_ is within 5s of `Date.now()`,
not just the operator):

```
AssertionError: expected 1788050154416 to be less than 5000
```

All three restored to a clean diff on `server/lib/llmJobs.ts` and all 6
tests pass at baseline (`6 passed (6)`).

---

## Clean-tree proof

```
$ git diff --stat -- server/outbox/outboxRepository.ts server/outbox/outboxWorker.ts \
    server/lib/advisoryLock.ts server/scheduler.ts server/lib/llmJobs.ts
(no output - zero diff on every implementation file this task touched)
```

```
$ npx tsc --noEmit
(no output - no type errors introduced by the new/modified test files)
```

New or modified test files (all runnable except the one gated integration
test, which was intentionally left unrun):

- `tests/unit/jobLease.test.ts` (modified - gap 4)
- `tests/unit/outboxRepository.test.ts` (modified - gap 1)
- `tests/unit/outboxWorker.test.ts` (modified - gap 3)
- `tests/unit/schedulerConcurrencyGuards.test.ts` (new - gap 5 + weekly-report
  missing coverage)
- `tests/unit/llmJobsDrainAndPrune.test.ts` (new - llmJobs missing coverage)
- `tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts` (new - gap 2
  structural fix, **gated on `TEST_DATABASE_URL`, left unrun this session -
  no database was started**)

`git status --porcelain` at the time of writing this report additionally
shows changes to files this task did not touch (`server/routes/analytics.ts`,
a `supabase/migrations/` file, several unrelated `tests/unit/*.test.ts`
files, `docs/`, and other files under `.audit/B6/` and `.audit/B7/`) - these
are other agents' concurrent work in the same shared worktree, consistent
with this task's own instruction that other agents are working concurrently
and that no full-suite test run should be triggered.
