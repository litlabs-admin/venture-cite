# B6b-02 — Mutation testing: concurrency, leasing, job drain

Scope (per task): `server/lib/jobDebounce.ts`, `server/lib/advisoryLock.ts`
(the real "jobLeases" file — no `jobLeases.ts` exists; `withJobLease`,
`withAdvisoryLock`, `withDynamicAdvisoryLock` all live here),
`server/outbox/` (`outboxRepository.ts` claim/reschedule, `outboxWorker.ts`
backoff/dead-letter dispatch), `server/lib/llmJobs.ts`
(`drainPendingLlmJobs` / `pruneExpiredLlmJobs`), `server/scheduler.ts`
(`withAdvisoryLock` / `withJobDebounce` call sites).

`.audit/B6/B6a-06-slice-driver-audit-jobs.md` was read first, per
instructions. It confirms (by reading) that the outbox claim path has an
`attempt_count < max_attempts` bound, exponential backoff, and a
`dead_letter` terminal state, and that `llmJobs.ts` has no attempt-count
column and relies on a 24h `expiresAt` + `pruneExpiredLlmJobs`. This report
does not re-derive those bounds; it asks whether a test would notice if
each one were cut.

Method: for each mutation, the implementation was edited directly, only the
test file(s) claiming coverage of that behavior were run (never the full
suite / `tests/unit`), the result was recorded, and the file was reverted
before moving to the next mutation via the same `Edit` tool that made the
change (not `git checkout`, which this repo's `guardGitWrite` hook blocks).
Every mutation below was reverted individually.

## Overall verdict

The debounce module (`jobDebounce.ts`) and the lease _acquisition_ path in
`advisoryLock.ts` are genuinely well tested — every mutation tried against
them was caught. Three areas are not:

1. **`advisoryLock.ts`'s lease-loss detection during renewal** is
   completely unexercised — no test ever makes a renewal call return
   "lost," so the code path that stops a runaway job when its lease
   expires mid-run has no test at all.
2. **`outboxRepository.ts`'s claim-path attempt cap and its `reschedule`
   dead-letter transition** are both invisible to every test that claims
   to cover them, because the unit test mocks `db.execute` to return a
   canned row (it never evaluates the SQL), and the one "integration" test
   that looks like it covers dead-lettering and concurrent claiming
   hand-writes its own simplified SQL directly against the schema instead
   of calling `createOutboxRepository()` — the real production code in
   `outboxRepository.ts` is never executed against a live database
   anywhere in this repository's test suite, unit or integration.
3. **`scheduler.ts`'s own use of `withJobDebounce`/`withAdvisoryLock`** for
   auto-citation is untested as a composition: the two tests that exist
   for this job body mock both guards as unconditional pass-throughs, so
   removing the debounce+lock wrapper entirely from `runAutoCitationJob`
   does not fail a single test. `runWeeklyReportJob`'s composition has no
   test coverage of any kind, not even a pass-through mock.

The mention-scan job body is the one scheduler.ts caller that _is_ tested
correctly — it exercises both the "debounce says no" and "lock says no"
branches with controllable stub outcomes, and mutating either branch's
handling is caught.

---

## Target 1 — `server/lib/jobDebounce.ts` (the debounce window)

Baseline: `npx vitest run tests/unit/jobDebounce.test.ts` → 1 file passed,
14 tests passed.

### 1a. Make the debounce window always allow (`shouldRunJob`)

```diff
-    return { shouldRun: elapsed >= minIntervalMs, lastRanAt };
+    return { shouldRun: true, lastRanAt };
```

Command: `npx vitest run tests/unit/jobDebounce.test.ts`

Result: 2 tests failed — `"blocks a second run inside the window"` (expects
`shouldRun` false, got true) and `"does NOT invoke the body when inside the
window"` (body called once, expected zero).

**Verdict: HEALTHY.**

### 1b. Make `withJobDebounce` ignore `shouldRun` and always run the body

```diff
   const { shouldRun, lastRanAt } = await shouldRunJob(job, minIntervalMs);
-  if (!shouldRun) {
+  if (false) {
```

Command: `npx vitest run tests/unit/jobDebounce.test.ts`

Result: 1 test failed — `"does NOT invoke the body when inside the window"`
(`expect(body).not.toHaveBeenCalled()` fails, called once).

**Verdict: HEALTHY.**

---

## Target 2 — `server/lib/advisoryLock.ts` (lease acquisition, expiry, heartbeat)

There is no `server/lib/jobLeases.ts`. The real file is
`server/lib/advisoryLock.ts`; it exports `withJobLease` (the actual
Postgres `job_leases` table lease primitive), and `withAdvisoryLock` /
`withDynamicAdvisoryLock` (thin wrappers that log "busy" on `null`). The
covering test is `tests/unit/jobLease.test.ts`.

Baseline: `npx vitest run tests/unit/jobLease.test.ts` → 1 file passed, 6
tests passed.

### 2a. Make the advisory lock always report acquired

```diff
-  if (rows.length === 0) return null;
+  if (false) return null;
```

Command: `npx vitest run tests/unit/jobLease.test.ts`

Result: 1 test failed — `"returns null without running the callback when
another holder owns the lease"` — the callback ran and returned
`"should not run"` instead of the call resolving to `null`.

**Verdict: HEALTHY.**

### 2b. Let a lease be claimed while still held and unexpired (drop the WHERE guard)

```diff
     on conflict (lease_key) do update
       set holder_token = excluded.holder_token,
           acquired_at = now(),
           heartbeat_at = now(),
           expires_at = excluded.expires_at
-      where job_leases.expires_at < now()
     returning holder_token`,
```

Command: `npx vitest run tests/unit/jobLease.test.ts`

Result: 1 test failed — `"takes over an expired lease with the atomic
conflict update"` — asserts the acquire SQL matches
`/where job_leases\.expires_at < now\(\)/i`.

**Verdict: HEALTHY** — but worth flagging precisely what this test proves:
it string-matches the SQL text sent to a _mocked_ `pool.query`. It does not
run this SQL against a real Postgres, so it cannot verify the `ON CONFLICT
... DO UPDATE ... WHERE` clause actually behaves atomically under a real
concurrent acquire (that a losing acquirer really gets zero rows back,
rather than winning a race on the `WHERE` evaluation). It does, however,
reliably catch someone deleting or editing that clause, which is the
mutation asked for here.

### 2c. Disable the lease renewal heartbeat entirely

```diff
   const renew = async () => {
+    return;
     if (stopped || renewalPending) return;
```

Command: `npx vitest run tests/unit/jobLease.test.ts`

Result: 1 test failed — `"clears the renewal timer when the callback
finishes"` — expects `queryMock` called twice (acquire + one renewal) after
advancing fake timers 3s; got 1.

**Verdict: HEALTHY.**

### 2d. Ignore a lost lease during renewal (SURVIVES)

```diff
       if (result.rowCount !== 1) {
+      if (false) {
         stopped = true;
         clearInterval(renewalTimer);
         logger.warn({ leaseKey }, "job-lease: lease lost while renewing");
       }
```

This is the actual "let a lease be claimed while still held" mutation
applied to the _renewal_ side rather than acquisition: if another process
takes over an expired lease, the current holder's periodic `UPDATE ...
WHERE lease_key = $1 AND holder_token = $2` renewal will affect 0 rows.
Real code stops the renewal timer and lets the holder know it lost
ownership (via the `stopped` flag — the caller has no programmatic signal,
but subsequent work should be considered unsafe). Disabling that check
means the loser keeps "renewing" forever (each renewal is a no-op UPDATE
matching zero rows, silently) and never logs the loss.

Command: `npx vitest run tests/unit/jobLease.test.ts`

Result: `1 file passed (1), 6 tests passed (6)` — no change from baseline.

**Verdict: SURVIVES.**

Confirmed by grep: `"job-lease: lease lost while renewing"` (the only
observable side effect on this path) appears nowhere in any test file.
`tests/unit/jobLease.test.ts`'s renewal test
(`"clears the renewal timer when the callback finishes"`, lines 105–129)
only exercises the happy path — it mocks the renewal query to return
`{ rowCount: 1, rows: [] }` (a successful renewal) and never simulates
`rowCount !== 1`. No other test file imports `withJobLease`. This means: if
this lease-loss detection regresses, nothing observes it until a real
double-run happens in production, which is exactly the failure mode this
mechanism exists to prevent (it is the TTL/heartbeat equivalent of "lease
claimed while still held").

---

## Target 3 — `server/outbox/` (claim path, backoff, dead-letter)

Baseline: `npx vitest run tests/unit/outboxRepository.test.ts
tests/unit/outboxWorker.test.ts tests/unit/contentCostOutboxDrain.test.ts`
→ 3 files passed, 21 tests passed.

### 3a. Stop incrementing `attempt_count` on claim

```diff
-            started_at = coalesce(started_at, now()), attempt_count = attempt_count + 1
+            started_at = coalesce(started_at, now()), attempt_count = attempt_count
```

Command: `npx vitest run tests/unit/outboxRepository.test.ts
tests/unit/outboxWorker.test.ts`

Result: 1 test failed — `"claims one ready or expired command with skip
locked"` asserts the claim SQL text contains
`"attempt_count = attempt_count + 1"`.

**Verdict: HEALTHY** (again a literal string-match against a mocked
`db.execute`, not a live-DB check — see the structural note below).

### 3b. Drop `FOR UPDATE SKIP LOCKED` from the claim query

```diff
-          order by available_at, created_at for update skip locked limit 1
+          order by available_at, created_at limit 1
```

Command: `npx vitest run tests/unit/outboxRepository.test.ts
tests/unit/outboxWorker.test.ts`

Result: 1 test failed — same test asserts the SQL text contains `"for
update skip locked"`.

**Verdict: HEALTHY** (same string-match caveat).

### 3c. Remove the attempt cap from the claim's candidate CTE (SURVIVES)

```diff
           select id from public.outbox_commands
           where kind = any(${claimKinds}::text[])
-            and ((status = 'pending' and cancellation_requested_at is null and available_at <= now() and attempt_count < max_attempts)
-             or (status = 'processing' and cancellation_requested_at is null and lease_expires_at < now() and attempt_count < max_attempts)
+            and ((status = 'pending' and cancellation_requested_at is null and available_at <= now())
+             or (status = 'processing' and cancellation_requested_at is null and lease_expires_at < now())
             )
```

This is distinct from 3a: `attempt_count` still increments correctly on
claim, but a row whose attempts are exhausted is no longer excluded from
being claimed again — the exact "max-attempts bound never trips" mutation
the task asks for, applied at the one clause the B6a-06 audit named as the
actual bound ("`attempt_count < max_attempts` enforced at the only claim
path").

Command: `npx vitest run tests/unit/outboxRepository.test.ts
tests/unit/outboxWorker.test.ts tests/unit/contentCostOutboxDrain.test.ts`

Result: `3 files passed (3), 21 tests passed (21)` — no change from
baseline.

**Verdict: SURVIVES.**

Why: `"claims one ready or expired command with skip locked"` (the only
test that inspects this query's text) checks exactly four substrings —
`"for update skip locked"`, `"status = 'pending'"`, `"lease_expires_at <
now()"`, `"attempt_count = attempt_count + 1"`, `"kind = any"` — and never
checks for `"attempt_count < max_attempts"` anywhere. Grepped every other
test file for `claimNext`/`outboxRepository` usage
(`contentCostOutboxAdapter.test.ts`, `openAiLlmJobAdapter.test.ts`): both
only import the `ClaimedOutboxCommand` _type_, never call `claimNext`. No
test — unit or integration — would notice a poisoned row (one that has
already exhausted `max_attempts` and is sitting in `dead_letter`-eligible
`processing`/expired state) being re-claimed and retried forever.

### 3d. Disable the dead-letter transition in `reschedule` (SURVIVES)

```diff
-        set status = case when cancellation_requested_at is not null or attempt_count >= max_attempts then 'dead_letter' else 'pending' end,
+        set status = case when false and (cancellation_requested_at is not null or attempt_count >= max_attempts) then 'dead_letter' else 'pending' end,
```

(Left the other three `attempt_count >= max_attempts` occurrences in the
same query — `available_at`, `payload`, `dead_lettered_at` — untouched, to
test whether a substring check elsewhere in the query would incidentally
catch a break in the _status_ transition specifically, which is the one
that actually stops a poisoned row from retrying.)

Command: `npx vitest run tests/unit/outboxRepository.test.ts
tests/unit/outboxWorker.test.ts`

Result: `2 files passed (2), 19 tests passed (19)` — no change from
baseline.

**Verdict: SURVIVES.**

Why: the test `"dead-letters when a claimed command has exhausted its
retry budget"` (`tests/unit/outboxRepository.test.ts`) does this:

```ts
stubs.execute.mockResolvedValue({ rows: [{ status: "dead_letter" }] });
...
await expect(repository.reschedule({...})).resolves.toEqual({ kind: "dead_letter" });
expect(executedSql().some((text) => text.includes("attempt_count >= max_attempts"))).toBe(true);
```

`stubs.execute` is mocked to return `{status: "dead_letter"}` **regardless
of what SQL is sent** — the mock never evaluates the query. So the
`resolves.toEqual({kind:"dead_letter"})` assertion only checks that
`reschedule`'s JS-side row-to-result mapping is correct (`row.status ===
"dead_letter" → {kind:"dead_letter"}`), which has nothing to do with
whether the SQL's `CASE WHEN` actually decides that correctly against a
real row. The `executedSql().some(...includes(...))` check is a substring
scan across the _whole_ query text; because three other `attempt_count >=
max_attempts` occurrences remain in the same query (for `available_at`,
`payload`, `dead_lettered_at`), the substring is still found even though
the one that actually matters — the `status` assignment — was disabled.

**This also means the "integration" test does not save it.**
`tests/integration/localOutboxMigration.test.ts` has a test named
`"terminalizes a retry when cancellation was requested"` (lines 479–507)
that looks like it covers this exact case, but it never imports
`server/outbox/outboxRepository.ts` or calls
`createOutboxRepository().reschedule(...)`. It hand-writes its own copy of
the `UPDATE ... CASE WHEN ...` SQL directly against `pool.query`. Grepped
the whole file: `createOutboxRepository` is imported **nowhere** in
`tests/`, only in `tests/unit/outboxRepository.test.ts` (which mocks
`db.execute`). The same is true of the concurrent-claim test in that file
(`"allows only one concurrent claim and rejects a stale token"`, line 155) — its `claim()` helper (line 694) is a simplified hand-rolled
`UPDATE ... WHERE status = 'pending'` with no CTE, no `for update skip
locked`, and no `attempt_count < max_attempts` clause at all, so it proves
nothing about the real `claimNext` query either.

**Net structural finding: the real SQL inside `server/outbox/outboxRepository.ts`
— `claimNext`, `reschedule`, `renewLease`, `markSucceeded`, `moveToDeadLetter`
— is never executed against a live Postgres anywhere in this test suite.**
The unit test mocks the database and checks SQL-text substrings; the one
integration test file that could exercise the real module against a real
database instead re-implements the SQL by hand and never imports the
module. This is worse than "the covering test is skipped in this
environment" (3d/3c are not gated by `TEST_DATABASE_URL` — they simply
never call the real code, in any environment).

### 3e. Remove the exponential backoff in `outboxWorker.ts`'s `retryAt` (SURVIVES)

```diff
 function retryAt(attemptCount: number): Date {
-  return new Date(Date.now() + Math.min(3_600, 2 ** Math.max(0, attemptCount - 1)) * 1_000);
+  void attemptCount;
+  return new Date(Date.now());
 }
```

Command: `npx vitest run tests/unit/outboxWorker.test.ts
tests/unit/outboxRepository.test.ts tests/unit/contentCostOutboxDrain.test.ts`

Result: `3 files passed (3), 21 tests passed (21)` — no change from
baseline.

**Verdict: SURVIVES.**

Why: `retryAt` is a private, unexported function; the only place its
output is observable is the `nextAvailableAt` argument
`runOutboxWorkerOnce` passes to `outbox.reschedule(...)`.
`"reschedules a retryable handler failure"` (`tests/unit/outboxWorker.test.ts`)
asserts `expect(outbox.reschedule).toHaveBeenCalledWith(expect.objectContaining({
id, leaseToken, errorCode }))` — `objectContaining` deliberately does not
check `nextAvailableAt`. Grepped every test file for `retryAt` and
`nextAvailableAt`: the only two hits are hardcoded literal dates passed
_into_ `outboxRepository.reschedule` directly in
`tests/unit/outboxRepository.test.ts`, not the computed value from
`retryAt`. No test anywhere would notice every failed outbox command being
retried immediately in a tight loop instead of backing off.

---

## Target 4 — `server/lib/llmJobs.ts` (`drainPendingLlmJobs`, `pruneExpiredLlmJobs`)

This target is a **missing-coverage finding, not a mutation-survives
finding** — no test file anywhere claims to cover these two functions'
actual behavior, so no mutation was applied.

Evidence:

```
grep -rn "drainPendingLlmJobs|pruneExpiredLlmJobs" tests/
tests/unit/cronOrchestrator.test.ts:109:  drainPendingLlmJobs: vi.fn(async () => ({...})),
tests/unit/cronOrchestrator.test.ts:115:  pruneExpiredLlmJobs: vi.fn(async () => 0),
```

That is the **only** appearance of either name in `tests/`, and it is a
`vi.mock("../../server/lib/llmJobs", ...)` replacement, not a call to the
real function. `tests/unit/cronOrchestrator.test.ts`'s own file header
says: _"Coverage for the daily cron orchestrator's auth gate and step
scheduling... we verify that contract here without exercising the
underlying jobs."_ — it explicitly disclaims covering the job bodies.

`tests/unit/llmJobsOutbox.test.ts` and `tests/unit/keywordResearchProvenance.test.ts`
both import the real `server/lib/llmJobs.ts` module, but only exercise
`enqueueLlmJob` and `pollLlmJob`/`applyResponseToRow` (the client-poll
path) — neither calls `drainPendingLlmJobs` or `pruneExpiredLlmJobs`.

So: the `batchSize` bound, the `Date.now() >= deadlineMs - 500` per-tick
break, and the unconditional `lt(expiresAt, now())` prune delete in
`pruneExpiredLlmJobs` — the exact wall-clock bound the B6a-06 audit relied
on to call this file SAFE — have zero test exercising the real
implementation. Per the task's instructions this is reported as **missing
coverage**, distinct from "survives": there is no test to defeat.

---

## Target 5 — `server/scheduler.ts` (`withAdvisoryLock` / `withJobDebounce` usage)

### 5a. Auto-citation: remove the entire debounce+lock wrapper (SURVIVES)

Baseline: `npx vitest run tests/unit/autoCitationDeadline.test.ts
tests/unit/mentionScanDeadline.test.ts tests/unit/citationRunGuards.test.ts`
→ 3 files passed, 18 tests passed.

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

Command: `npx vitest run tests/unit/autoCitationDeadline.test.ts
tests/unit/mentionScanDeadline.test.ts tests/unit/citationRunGuards.test.ts`

Result: `3 files passed (3), 18 tests passed (18)` — no change from
baseline.

**Verdict: SURVIVES.**

Why: `tests/unit/autoCitationDeadline.test.ts` mocks both dependencies as
unconditional pass-throughs:

```ts
vi.mock("../../server/lib/jobDebounce", () => ({
  withJobDebounce: (_k, _w, fn) => fn(),
  ...
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k, _n, fn) => ({ ran: true, result: await fn() }),
  ...
}));
```

The file's own comment even says why: _"The debounce and advisory lock
both need a live database; run the body."_ That is a reasonable choice for
testing `runAutoCitationJobImpl`'s own `done`/deadline logic in isolation,
but it means literally nothing in this file (or `citationRunGuards.test.ts`,
which doesn't touch these two modules at all) can tell the difference
between "the lock and debounce are wired correctly" and "they were deleted
entirely." Removing the concurrency guard this whole audit is about — the
exact double-run / concurrent-citation-sweep scenario `jobDebounce.ts`'s
own module comment describes as the reason it exists — produces zero test
failures.

### 5b. Mention-scan: ignore a lock-not-acquired outcome (HEALTHY, for contrast)

```diff
-  return outcome.ran ? outcome.result : false;
+  return outcome.ran ? outcome.result : true;
```

(`runMentionScanJobLocked`'s tail — treats "lock busy" the same as "scan
completed," which would record `lastRanAt` even though another runner, not
this one, owns the pass.)

Command: `npx vitest run tests/unit/mentionScanDeadline.test.ts`

Result: 1 test failed — `"does not record completion when another runner
holds the lock"` — `stubs.markJobRan` was called once, expected zero.

**Verdict: HEALTHY.**

This is the one scheduler.ts caller with real coverage of the
lock-outcome-handling logic: `mentionScanDeadline.test.ts` drives
`stubs.lockAcquired = false` and separately `stubs.shouldRunJob` returning
`{shouldRun:false}`, and asserts `markJobRan` is not called in either case
— it tests what the job body _does_ with the guard's result, not just
whether the guard runs. Contrast with 5a: auto-citation has no equivalent
"lock is busy" test case at all, and its guards can't fail toward
"busy" in the mock regardless.

### 5c. Weekly-report: no coverage of any kind (missing-coverage note)

`runWeeklyReportJob` (the third `withJobDebounce(withAdvisoryLock(...))`
composition in this file, lines 40–56) has no test exercising it at any
level — not a real-database integration test, not a pass-through-mocked
unit test like 5a, not even a lock-outcome test like 5b.
`tests/unit/schedulerOrchestratorParity.test.ts` only regex-matches that
the string `"weekly-report"` appears registered in both `scheduler.ts` and
`server/routes/cron.ts` (a naming/registration check, not a behavior
check). `tests/unit/cronOrchestrator.test.ts` mocks
`runWeeklyReportJob` away entirely. No mutation was applied here since no
test claims to cover the behavior; recorded as missing coverage.

---

## Summary table

| #   | Target              | Mutation                                     | Command                                                                        | Caught?                    | Verdict                                                |
| --- | ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------ |
| 1a  | jobDebounce.ts      | window always allows                         | jobDebounce.test.ts                                                            | yes (2 tests)              | HEALTHY                                                |
| 1b  | jobDebounce.ts      | bypass shouldRun check                       | jobDebounce.test.ts                                                            | yes (1 test)               | HEALTHY                                                |
| 2a  | advisoryLock.ts     | lock always "acquired"                       | jobLease.test.ts                                                               | yes (1 test)               | HEALTHY                                                |
| 2b  | advisoryLock.ts     | drop expiry WHERE clause                     | jobLease.test.ts                                                               | yes (1 test, string-match) | HEALTHY                                                |
| 2c  | advisoryLock.ts     | disable renewal heartbeat                    | jobLease.test.ts                                                               | yes (1 test)               | HEALTHY                                                |
| 2d  | advisoryLock.ts     | ignore lost lease on renew                   | jobLease.test.ts                                                               | no                         | **SURVIVES**                                           |
| 3a  | outboxRepository.ts | stop incrementing attempt_count              | outboxRepository.test.ts                                                       | yes (1 test, string-match) | HEALTHY                                                |
| 3b  | outboxRepository.ts | drop FOR UPDATE SKIP LOCKED                  | outboxRepository.test.ts                                                       | yes (1 test, string-match) | HEALTHY                                                |
| 3c  | outboxRepository.ts | drop attempt cap from claim CTE              | outboxRepository.test.ts, outboxWorker.test.ts, contentCostOutboxDrain.test.ts | no                         | **SURVIVES**                                           |
| 3d  | outboxRepository.ts | disable dead-letter transition               | outboxRepository.test.ts, outboxWorker.test.ts                                 | no                         | **SURVIVES**                                           |
| 3e  | outboxWorker.ts     | remove exponential backoff                   | outboxWorker.test.ts, outboxRepository.test.ts, contentCostOutboxDrain.test.ts | no                         | **SURVIVES**                                           |
| 4   | llmJobs.ts          | (none applied)                               | —                                                                              | n/a                        | **MISSING COVERAGE** — no test calls the real function |
| 5a  | scheduler.ts        | remove debounce+lock wrapper (auto-citation) | autoCitationDeadline/mentionScanDeadline/citationRunGuards.test.ts             | no                         | **SURVIVES**                                           |
| 5b  | scheduler.ts        | ignore lock-busy outcome (mention-scan)      | mentionScanDeadline.test.ts                                                    | yes (1 test)               | HEALTHY                                                |
| 5c  | scheduler.ts        | (none applied, weekly-report)                | —                                                                              | n/a                        | **MISSING COVERAGE** — no test at any level            |

## Additional structural finding

The real SQL in `server/outbox/outboxRepository.ts` (`claimNext`,
`reschedule`, `renewLease`, `markSucceeded`, `moveToDeadLetter`,
`cancelClaimed`) is not executed against a live Postgres database anywhere
in this repository's test suite, in any environment. The unit test
(`tests/unit/outboxRepository.test.ts`) mocks `db.execute` entirely and
checks the generated SQL as text. The integration test file that appears
to cover the same ground (`tests/integration/localOutboxMigration.test.ts`,
gated on `LOCAL_SUPABASE_TEST=1` plus a reachable database — not run here
per instructions) never imports `createOutboxRepository`; every claim/
reschedule/dead-letter assertion in that file is against a hand-written,
independently-drifting copy of the SQL. This is stronger than "the
covering test is skipped in this environment" — even with a database
available, no test in the repository calls the production claim/reschedule
code path. This is reported as a structural finding rather than folded
into 3c/3d's SURVIVES verdicts because it explains _why_ those two mutations
survive in every environment, not just this one.

---

## Clean-tree proof

```
$ git status --porcelain
 M .audit/B6/B6a-08-why-nothing-caught-it.md
 M server/storage/jobsStorage.ts
 M tests/unit/brandFactScrapeRunsStorage.test.ts
 M tests/unit/requestRepositories.test.ts
?? .audit/B6/B6b-01-mutation-auth-ownership.md
?? .audit/B6/B6b-03-mutation-metrics.md

$ git diff --stat
 .audit/B6/B6a-08-why-nothing-caught-it.md     |  56 +++++++++---
 server/storage/jobsStorage.ts                 |  19 ++---
 tests/unit/brandFactScrapeRunsStorage.test.ts | 117 ++++++++++++++++++--------
 tests/unit/requestRepositories.test.ts        |  18 +++-
 4 files changed, 153 insertions(+), 57 deletions(-)
```

None of the four modified files, and neither untracked `.audit` file, were
touched by this task — they predate this run (other B6b slices / prior
session work in the same remediation program running against this
worktree). Confirmed with a targeted diff against every file this task
edited:

```
$ git diff --stat -- server/lib/advisoryLock.ts server/lib/jobDebounce.ts \
    server/outbox/outboxRepository.ts server/outbox/outboxWorker.ts \
    server/lib/llmJobs.ts server/scheduler.ts
(no output — zero diff)
```

Every mutation applied in this report was reverted before the next one was
applied, and the tree is clean for all six target files.
