# B6a-06 — Slice-driver audit: job/worker files

Scope: audit four job/worker files for the two defect signatures confirmed in
`server/lib/onboardingAutopilot.ts` (fixed in commit `569f746`):

- **Signature 1**: a slice-completion guard shaped `if (!x.done) return` /
  `if (!x.finished) continue`, where the DONE path falls through into code
  that starts new work instead of advancing state.
- **Signature 2**: an unbounded sweep/resume of in-progress rows — no attempt
  cap, no backoff, no wall-clock bound, where a lease/advisory lock alone is
  mistaken for a bound.

Files read in full (not sampled):

- `server/contentGenerationWorker.ts` (489 lines)
- `server/lib/llmJobs.ts` (457 lines)
- `server/outbox/contentCostOutboxDrain.ts` (113 lines)
- `server/scheduler.ts` (929 lines)

Supporting context read to verify bounds referenced by the files above (not
part of the audited set, but necessary to confirm a "SAFE" verdict rather than
assert it): `server/outbox/outboxWorker.ts`, `server/outbox/outboxRepository.ts`
(attempt-cap / backoff / dead-letter mechanics), `shared/schema/jobs.ts`
(`llmJobs` table has no attempt-count column, has `expiresAt` default 24h),
`server/routes/cron.ts` (call sites and cadence for `drainPendingLlmJobs` /
`pruneExpiredLlmJobs`, and `drainPendingContentJobs`'s one-slice-per-tick
shape, confirming it is not part of any of the four audited files' own logic).

---

## 1. `server/contentGenerationWorker.ts` — SAFE

Grepped the whole file for the guard shape (`.done`, `.finished`, `isDone`,
`isFinished`): **zero matches**. There is no slice-completion guard of the
`if (!x.done) return` shape anywhere in this file, so Signature 1 cannot be
present in its literal form. I also traced the actual control flow by hand to
rule out an equivalent-but-differently-worded version of the bug:

- `runArticleSlice` (lines 334–436) re-reads the job row fresh from storage on
  every call (`storage.getContentJobByIdAdmin(jobId)`, line 339) and dispatches
  on `result.kind`: `"completed"` → `completeContentJobSlice` → return
  `{done:true}` (lines 395–416); `"cancelled"` → `finishContentJobSlice` →
  return `{done:true}` (417–431); anything else falls to the bottom, which
  **releases the lease and returns `{done:false}`** (433–435) — it never
  starts new work on that path.
- `runJobToCompletionOrDeadline` (105–253) has the create-vs-poll branch
  guarded by `existingResponseId` (line 160, `160–198` create / `200–252`
  poll). The create branch (which starts the expensive OpenAI Responses run)
  is reachable **only when `existingResponseId` is falsy** — i.e. only on the
  very first slice of a job. Every subsequent slice has `existingResponseId`
  set (persisted via `updateContentJobResponseId`, line 184) and takes the
  poll branch, which never re-creates. There is no path where "the job
  finished" leads back into "create a new response".

**Signature 2 (unbounded resume) does not apply to this file's own code**:
this file contains no sweep/select-by-status logic — it is a per-job slice
function, invoked once per call by an external driver (the `/advance` route
and the daily cron's `drainPendingContentJobs`, both in `server/routes/cron.ts`,
outside the audited set). Within this file, the only "resume" behavior is
polling an already-started OpenAI background response (`contentProvider.retrieve`,
line 202), which is a cheap status check, not a re-execution of the expensive
work — the expensive generation happens once, on OpenAI's infrastructure,
gated by the `existingResponseId` check above. A job stuck `queued`/`in_progress`
forever would be polled repeatedly by whatever external cadence calls
`runArticleSlice`, but each poll costs one fast HTTP call, not "a full six-engine
sweep" or equivalent — this is a materially different situation from the
onboarding bug, where each resume re-ran genuinely expensive provider spend.

Verdict: **SAFE** for both signatures, as read. (The external caller's own
retry cadence for content jobs — `drainPendingContentJobs` in
`server/routes/cron.ts` — is out of scope for this audit and was not verified
for a cap; flagging only for completeness, not as a finding against these
four files.)

---

## 2. `server/lib/llmJobs.ts` — SAFE

Same grep for the guard shape: **zero matches**. No `.done`/`.finished` guard
exists in this file at all, so Signature 1's literal shape is absent. Walked
the two places completion is decided:

- `pollLlmJob` (169–200): terminal rows (`succeeded`/`failed`/`cancelled`) are
  returned immediately without hitting OpenAI again (175–177). A row with no
  `responseId` yet triggers `scheduleImmediateOutboxDrain` and returns —
  it does not itself kick off new expensive work; it just nudges the outbox
  drain, which is bounded (see §3).
- `applyResponseToRow` (289–427): re-checks the row status first (line 309)
  so a concurrently-finalized row short-circuits. `completed` → runs the
  registered handler's `finalize()` once and writes a `succeeded` row
  (guarded by `and(eq(id,...), eq(status,"running"))`, line 364, so a second
  concurrent finalize can't double-apply). `failed`/`cancelled`/`incomplete`
  → written to a terminal status (399–423). None of these paths lead back
  into starting a new OpenAI call.

**Signature 2**: `drainPendingLlmJobs` (215–245) is a sweep — it selects rows
`WHERE status = 'running'` (222–226) and re-drives each one every time it
runs. This is the closest structural match to the pattern named in the
prompt. I checked whether anything bounds how many times a single row can be
re-driven:

- The `llmJobs` table (`shared/schema/jobs.ts` lines 37–66) has **no
  attempt-count column** — there is nothing analogous to
  `autopilot_attempts` to even attempt to cap on.
- The bound instead is wall-clock: `expiresAt` defaults to `NOW() + 24 hours`
  (jobs.ts line 58), and `pruneExpiredLlmJobs` (llmJobs.ts 248–251)
  unconditionally deletes any row past `expiresAt` — this is a real,
  unconditional wall-clock bound, not an attempt counter that only fires on
  one path.
- Critically, what gets re-driven each sweep is `openai.responses.retrieve()`
  (line 234) — a fast status poll (documented as "<1s typical", line 186) —
  not a re-execution of the underlying expensive generation. The expensive
  work runs once on OpenAI's side in background mode; polling it 1000 times
  costs 1000 cheap HTTP calls, not 1000 re-runs of the work. This is the
  same distinction as in `contentGenerationWorker.ts`: the thing being
  "resumed" is status-checking, not the paid work itself.
- Call-site cadence (`server/routes/cron.ts` lines 391–402): `drainPendingLlmJobs`
  and `pruneExpiredLlmJobs` are both `orch.run(...)` steps inside
  `/api/cron/daily-orchestrator`, run once per day, not on a tight per-minute
  loop like `resumeInFlightAutopilots` was. So even in the worst case a given
  row would be polled at most once/day for at most 24h before being pruned —
  nowhere near "114 runs in 34 hours."

Verdict: **SAFE**. Bound named: wall-clock via `expiresAt` (24h default) +
unconditional `pruneExpiredLlmJobs`, combined with the resumed operation being
a cheap poll rather than a re-run of paid work, and a once-daily call cadence.

---

## 3. `server/outbox/contentCostOutboxDrain.ts` — SAFE

Grepped for the guard shape: no `.done`/`.finished` field exists in this
module's types (`ContentCostDrainResult`, `OutboxWorkerOutcome` union has no
`done` boolean) — Signature 1's shape does not apply; this file has no
multi-phase "citation-run-like" completion concept at all, only a single
per-command claim/process/settle cycle.

**Signature 2**: `runDrain` (57–69) is the sweep — a `while` loop that calls
`runOnce` (one `runOutboxWorkerOnce` per iteration) until `idle`,
`options.maxCommands` is hit, or `options.deadlineMs` passes. Within a single
invocation this is fully bounded (`assertOptions`, 95–113, enforces
`maxCommands` ∈ [1,1000] and `leaseSeconds` ∈ [3,900]).

The remaining question is whether the SAME row can be re-selected by
`runOnce` forever across invocations (this file is scheduled every 5 minutes
in `server/scheduler.ts`, line 805). Traced into the dependency it calls
(`outboxWorker.ts` / `outboxRepository.ts`, read as supporting context, not
part of the 4-file scope):

- The claim query only selects rows where `attempt_count < max_attempts`
  (`outboxRepository.ts` lines 113–114), and **increments `attempt_count` in
  the same claim statement** (line 121) — i.e. on the one and only path that
  selects a row for work, not selectively on a success/failure branch. This
  satisfies the prompt's own bar: "An attempt counter that is only
  incremented on one path is not a bound for the other paths" — here there is
  only one path (claim), and it always increments.
  A separate reaper marks `processing` rows whose lease expired and whose
  `attempt_count >= max_attempts` as `dead_letter` (lines 100–108).
- On failure, `retryAt(attemptCount)` (outboxWorker.ts line 179–180) applies
  exponential backoff capped at 3600s, and the repository moves the row to
  `dead_letter` once `attempt_count >= max_attempts` (outboxRepository.ts
  lines 152–156) — a genuine terminal state, not a resettable one.

Verdict: **SAFE**. Bound named: `attempt_count < max_attempts` enforced at
the only claim path, exponential backoff via `retryAt`, and a terminal
`dead_letter` state — this is exactly the kind of bounded retry the prompt
says to recognize as safe, as distinct from a lease alone.

---

## 4. `server/scheduler.ts` — one SUSPECTED finding, rest SAFE

Grepped the whole file for the guard shape: **one match**, line 286
(`if (!runResult.done)`), inside `runAutoCitationJobImpl`.

### 4a. `runAutoCitationJobImpl` (lines 229–342) — guard itself is SAFE for Signature 1

```
const runResult = await runBrandPrompts(brand.id, undefined, {
  triggeredBy: "cron",
  deadlineMs,
});
if (!runResult.done) {                     // line 286
  logger.info(...);
  continue;                                // line 291 — moves to next brand
}
// Step 2: Refresh suggestions for the user to review.
const suggestionResult = await generateSuggestedPrompts(...);  // line 295
...
await db.update(schema.brands).set({ lastAutoCitationAt: new Date(), ... });
```

This is structurally the _correct_ shape, not the broken one: the guard
returns/continues on the **not-done** case, and the code that runs only on
the **done** case (`generateSuggestedPrompts`, then stamping
`lastAutoCitationAt`) is a distinct follow-on action, not a call back into
`runBrandPrompts` that would start a second citation sweep. There is no
fall-through from "finished" into "start new work" here — this is the fixed
pattern from the onboarding commit (guard on the unfinished case only, done
case moves to the next step), applied correctly.

### 4b. `runAutoCitationJobImpl` — SUSPECTED for Signature 2 (could not fully trace; needs `citationChecker.ts`, out of scope)

Concrete repeating sequence, as far as this file's code shows:

- **Tick 1 (hour N)**: `AUTO_CITATION_CRON` fires (default hourly,
  `"0 * * * *"`, line 189/845). `selectBrandsForCitationScan` (205–217)
  returns brand B. `isBrandDueForCitation(B)` (195–201) is true (never run,
  or `lastAutoCitationAt` is ≥6 days old). `runBrandPrompts(B, ..., {deadlineMs})`
  is called and returns `{done:false}` (its own per-tick budget ran out
  before finishing all tracked prompts × platforms). Per lines 286–292, the
  code does **not** stamp `lastAutoCitationAt` and `continue`s to the next
  brand, "so `isBrandDueForCitation` keeps saying yes and the next tick
  resumes" (comment at 280–285).
- **Tick 2 (hour N+1)**: same cron fires again. `isBrandDueForCitation(B)` is
  still true (nothing was stamped). `runBrandPrompts(B, ...)` is invoked
  again with a fresh `deadlineMs`. The comment at lines 272–274 asserts this
  call "is slice-aware and resumable... via the citation_runs existing-rankings
  filter" — i.e. it is claimed to make forward progress rather than restart.
  If that resumption genuinely skips already-checked rankings, this converges
  in a small, bounded number of hourly ticks. **I could not verify this from
  the four audited files** — the resumption mechanism lives in
  `citationChecker.ts` (`runBrandPrompts`/`advanceCitationRun`), which is
  outside the scope of this audit and was not read.
- **No cap, backoff, or wall-clock stall bound exists in `scheduler.ts`
  itself** for this loop: unlike `AUTOPILOT_MAX_ATTEMPTS` /
  `AUTOPILOT_STALL_HOURS` in the fixed `onboardingAutopilot.ts`, there is no
  attempt counter, no exponential backoff, and no "stuck longer than N hours
  → demote to failed" check anywhere in `runAutoCitationJobImpl`. The only
  thing that stops the hourly retry is the brand eventually returning
  `runResult.done === true`, or the brand throwing (which **does** stamp
  `lastAutoCitationAt` with `status: "failed"` in the `catch` block, lines
  317–330, giving that path a natural 6-day backoff via the weekly cadence
  gate). A brand that returns `done:false` every single hour indefinitely —
  without ever throwing and without ever finishing — would be re-invoked
  every hour forever, exactly matching the prompt's description: "a state
  that never advances is retried forever." Whether that scenario is actually
  reachable depends entirely on whether `runBrandPrompts`'s internal
  resumption can stall (e.g. if `citation_runs` gets stuck in a state where
  each hourly `deadlineMs` is consumed by re-establishing context rather than
  progressing, or if a per-brand condition makes every slice fail the same
  way without throwing).

Verdict: **SUSPECTED**, not confirmed. The guard shape at line 286 is safe;
the risk is the absence of any independent cap/backoff/stall-bound around the
hourly re-invocation loop in this file, contingent on a resumption guarantee
made by code outside the four audited files. Resolving this requires reading
`server/citationChecker.ts` (`runBrandPrompts`, `advanceCitationRun`) and
`server/lib/citationReconciliation.ts` (`reconcileOrphanCitationRuns`, imported
in `server/routes/cron.ts` line 35, which suggests a separate orphan-detection
mechanism may already exist for stuck `citation_runs` rows — but this was not
read and is not part of this audit's scope).

### 4c. `runWeeklyReportJobImpl` (lines 60–182) — SAFE, different shape

Calls `runBrandPrompts(brand.id, undefined, { triggeredBy: "cron" })` (114)
with **no deadline** and **no done-check** — it always runs to completion (or
throws, caught per-user at 173–177) once per week
(`WEEKLY_CRON = "0 8 * * 0"`, Sunday, debounced via `withJobDebounce`, line
45–56). This is a plain scheduled recurring job, not a resume-of-in-progress
state — there is no "in-flight" status this job selects on, so Signature 2
does not apply to it.

### 4d. `runForEveryBrand` / `runCompetitorDiscoveryJob` / `runListicleScanJob` / `runMentionScanJobLocked` (363–473) — SAFE

Each iterates **every** non-deleted brand once, checking `deadlineMs` between
brands (378, 436) to bail out for the _current_ invocation only. None of
these select rows by an "in-progress" status column and re-drive them — they
unconditionally process every brand every time the job runs (gated only by
`withJobDebounce`/weekly ledger logic that lives in `brandActivation.ts`,
outside scope). A brand skipped by the deadline this tick is simply picked up
"next cron run" (comments at 355–358, 438–441) at the same unconditional
cadence, not in a tightening resume loop — there is no per-row state that
"never advances," since there's no partial-completion state being tracked
here at all (each `fn(brandId)` call is all-or-nothing, not slice-based).

### 4e. `resumeInFlightAutopilots` invocation (lines 792–803) — not a new instance

`scheduler.ts` only calls the already-fixed `resumeInFlightAutopilots` from
`server/lib/onboardingAutopilot.ts` (imported dynamically, line 797); it adds
no new sweep logic of its own here. Confirmed already fixed (read in full at
the start of this audit): `AUTOPILOT_STALL_HOURS` demotes in-flight brands to
`failed` before the resume scan runs (onboardingAutopilot.ts lines 424–440),
and the `failed`/`idle` retry path is capped by `AUTOPILOT_MAX_ATTEMPTS` +
`AUTOPILOT_RETRY_BACKOFF_MINUTES` (456–470). Not a finding.

### 4f. `content-cost-outbox-drain` cron registration (lines 805–819) — not a new instance

Just schedules `runContentCostOutboxDrain` every 5 minutes with fixed,
bounded parameters (`maxCommands:25, deadlineMs:+20s, leaseSeconds:60`); the
bound itself lives in the outbox module, already covered as SAFE in §3.

---

## Summary table

| File                                      | Signature 1                                                                                              | Signature 2                                                                                                                                                                                                              | Verdict                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `server/contentGenerationWorker.ts`       | Not present (no guard of this shape; traced control flow, no fallthrough)                                | Not applicable (no sweep logic in this file; resumed work is a cheap poll, not paid re-work)                                                                                                                             | **SAFE**                                                                      |
| `server/lib/llmJobs.ts`                   | Not present (no guard of this shape)                                                                     | Sweep exists (`drainPendingLlmJobs`) but bounded by wall-clock `expiresAt` (24h) + unconditional prune, resumed work is a cheap poll, cadence is once/day                                                                | **SAFE**                                                                      |
| `server/outbox/contentCostOutboxDrain.ts` | Not applicable (no multi-phase completion concept)                                                       | Bounded via `attempt_count < max_attempts` incremented on the sole claim path, exponential backoff, terminal `dead_letter`                                                                                               | **SAFE**                                                                      |
| `server/scheduler.ts`                     | One guard found (`runAutoCitationJobImpl`, line 286); shape is the _correct_ pattern, not the broken one | `runAutoCitationJobImpl`'s hourly re-invocation of a not-yet-done brand has no attempt cap/backoff/stall-bound in this file; safety depends on an unverified resumption guarantee in `citationChecker.ts` (out of scope) | **SUSPECTED** (auto-citation loop only); all other jobs in this file **SAFE** |
