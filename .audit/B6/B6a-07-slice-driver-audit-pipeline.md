# Slice/driver audit — brand-pipeline files

Scope: hunt for the two defect signatures fixed in `server/lib/onboardingAutopilot.ts`
(commit `569f746`) in four other brand-pipeline files.

Files read in full:

- `server/lib/onboardingAutopilot.ts` (reference — the fixed file)
- `server/lib/brandActivation.ts` (233 lines, full)
- `server/lib/perceptionProbes.ts` (429 lines, full)
- `server/lib/factAgent/v2/runFullScrape.ts` (760 lines, full)
- `server/lib/factAgent/v2/runFactSheetRefresh.ts` (128 lines, full)

Read in support, as instructed / as needed to trace callers:

- `server/citationChecker.ts` — `runBrandPrompts` (lines 409–~900, the resume-skip
  logic), `advanceCitationRun` (lines 1441–1487)
- `server/lib/factAgent/v2/factScrapeBackstop.ts` (95 lines, full — the existing
  bounded backstop that `runFullScrape.ts`'s own comments reference)
- `server/routes/cron.ts` (orchestrator wiring, step budgets, `drainPendingPerceptionProbeRuns`,
  `drainPendingCitationRuns`)
- `server/routes/dashboard.ts` (perception-probe HTTP routes, "refuse to stack runs" guard)
- `server/scheduler.ts` (`detectFactScrapeFailureRate`, in-process cron registrations)
- `render.yaml` (actual production trigger cadence for the orchestrator)
- `git log -1 --format=%B 569f746` (the fix write-up)

---

## 1. `server/lib/brandActivation.ts` — SAFE

**Signature 1 (fall-through on done).** `populateBrandDashboard` loops over a fixed
`JOBS` array. For each job it checks `isDue(ledger, job)` (skip if not due), then
checks the deadline (skip, ledger untouched, if out of budget), then runs the job
in a try/catch, then **unconditionally** stamps `ledger[job] = now()` — on success
_and_ on failure (lines 108–127). There is no branch that says "if not done,
return; else start new work": each job is independent, self-contained, and either
runs-and-stamps or doesn't-run-because-not-due/out-of-budget. No completed-vs-fresh
ambiguity exists because there is no partial/slice state per job at all — a job
either ran (and is now stamped for a week) or didn't.

**Signature 2 (unbounded resume).** Each job is gated by `isDue`, which requires
`Date.now() - lastStampedAt >= WEEK_MS`. Because the ledger is stamped on _attempt_
regardless of outcome (comment at lines 117–121 states this explicitly: "Stamped on
ATTEMPT, not on success... otherwise be retried on every hourly tick for a week"),
a permanently-broken job (e.g., a brand whose site is down) gets retried at most
once per calendar week, forever — not unbounded, but a named, deliberate,
long-period bound. This is the correct shape: the same "attempt, not slice" idea
`AUTOPILOT_MAX_ATTEMPTS` describes, expressed as a time bound instead of a count.

Minor (not a CONFIRMED finding, noted for completeness): if `storage.setSystemState`
itself throws when writing the stamp (line 123–126), the ledger update is lost and
the job stays "due" going into the next tick — but this requires the ledger _write
path_ itself to be down, not the job's own work, and is logged as a warning. This
is a narrow persistence-failure edge case, not the pattern under audit; I flag it
rather than counting it as a finding.

`runBrandActivationSweep` (lines 194–233) walks brands ordered by `created_at ASC`
and calls `populateBrandDashboard` per brand with a shared deadline; it breaks out
of the loop (not a specific brand) once the deadline is hit, deferring the
remainder to next tick — bounded by the same per-job weekly ledger once it resumes.

**Verdict: SAFE.** Bound named: weekly ledger stamped on every attempt, not on
success only.

---

## 2. `server/lib/perceptionProbes.ts` — SAFE

**Signature 1.** `advancePerceptionProbeRun` (lines 341–429) is the slice driver.
Its loop (`for (;;)`, lines 367–397) selects `pending` probes for the run, processes
one engine's worth at a time via `processEngine`, and checks the deadline only
_between_ engines (comment at 393–396 explains why: mid-engine abandonment would
leave answers stored with no score). When `pending.length === 0` it `break`s — this
is the "done" exit — and falls through to computing final counts and writing the
run's terminal status (`succeeded`/`partial`/`failed`). There is no code path after
the loop that starts a _new_ run or re-does finished work; the done path and the
budget-exhausted path both fall into the same "compute counts, write status"
tail, which is idempotent (re-selects by `status`, so a second call after
completion just finds `pending.length === 0` immediately and reports the already-
terminal status via the early return at lines 353–360).

**Signature 2.** Each probe row transitions `pending → asked → scored` or
`pending → failed` and is never re-selected once it leaves `pending`
(`processEngine`'s ask phase and score phase both write a terminal per-probe status
on every path, including the outer catch in `advancePerceptionProbeRun`, lines
380–392, which marks the _whole platform's_ probes failed on an unexpected throw —
regardless of their current status). So a single run's probes are each attempted
**at most once** within that run; a failing engine does not get retried inside the
run at all, let alone unboundedly.

The cron backstop that resumes stalled runs (`drainPendingPerceptionProbeRuns` in
`server/routes/cron.ts`, lines 261–291) selects **one** run whose `status` is
`pending`/`running` and whose `startedAt` is >120s old, and calls
`advancePerceptionProbeRun` on it. Because that function only touches still-`pending`
probes, repeated resumes cost work proportional to what's left, not to the whole
30-probe matrix — this is the "skip already-done items" resume shape the task asked
to distinguish, and it is the cheap kind. The HTTP route that _starts_ a new run
(`server/routes/dashboard.ts` lines 1746–1779) explicitly refuses to stack a second
run while one is `pending`/`running` (lines 1754–1771), so nothing outside this
file can spawn a competing fresh run for the same brand either.

**Verdict: SAFE.** Bound named: per-probe terminal status transition (`asked/failed`
then `scored/failed`) makes every unit of work single-attempt within a run; resume
only ever touches remaining `pending` rows.

---

## 3. `server/lib/factAgent/v2/runFullScrape.ts` — SAFE (in isolation)

This file has a different shape from the citation-run slice model: `runFullScrapeForBrand`
does not "advance an existing run." Every call inserts a **brand-new**
`brand_fact_scrape_runs` row (lines 248–256) and runs the whole pipeline
(sitemap discovery → page fetch → wikidata → search-LLM → user-enrich → aggregate)
against it, respecting `deadlineMs` only to decide how many _pages_ to fetch
(line 478: `while (queue.length > 0 && Date.now() < deadlineMs)`), never to skip the
aggregate/terminal-status step.

**Signature 1.** There is no "if not done, return; else fall through to new work"
branch here, because there is no partial/slice concept to complete in the first
place. The function's own internal contract (explicit in the "2026-05-28 SAFETY NET"
comments at lines 163–169 and 618–624) is: every path through the locked callback
either reaches `runAggregate`'s terminal write, or the two enclosing catch blocks
(the inner one at 628–667 for `runAggregate` throwing, the outer one at 696–732 for
anything else) force-write `status: 'failed'` before the function returns. A
`deadlineMs` cutoff does not leave this run non-terminal — it just means fewer pages
got scraped before aggregation ran. So there is no "done" branch that reaches
"start fresh work" — each call _is_ the fresh work, and it always finishes.

**Signature 2, within this file.** Concurrent access is serialized by a per-brand
advisory lock (`withDynamicAdvisoryLock`, lines 159–162); a caller that can't get
the lock gets `{ran:false}` and does nothing further — it does not spin or retry
inside this function. There is a separate, genuinely bounded backstop for runs that
get stuck mid-flight rather than reaching a terminal write:
`server/lib/factAgent/v2/factScrapeBackstop.ts` selects runs with
`status NOT IN (completed, failed, timeout, cancelled)` and `last_advance_at` stale
for 60s, re-drives `runAggregate` on them, and caps at
`COALESCE(retry_count, 0) < 10` (lines 41-51), incrementing `retry_count` on the
**only** path that touches a given row (line 67-72) — then force-fails anything
that reaches the cap (lines 84-91). That is a correctly-shaped bound: single
increment path, hard ceiling, terminal fallback.

**Verdict: SAFE**, as a self-contained function. Bound named: every call reaches a
terminal write (safety-net catches); stuck-run retries are capped at 10 via
`factScrapeBackstop.ts`'s `retry_count`, incremented on the only path that runs it.

The defect below lives one layer up, in the _caller_ that decides which brands are
eligible for a **new** call to this function.

---

## 4. `server/lib/factAgent/v2/runFactSheetRefresh.ts` — CONFIRMED (Signature 2)

**Signature 1** does not apply — there is no slice/done branching here either;
`refreshOneBrand` just calls `runFullScrapeForBrand` once per selected brand
(always a fresh, always-terminating call, per file 3 above).

**Signature 2 — confirmed.** `findStaleBrands` (lines 50–82) is the selection
query that decides which brands get a new, full-cost scrape this tick:

```sql
WHERE b.deleted_at IS NULL
  AND b.fact_scrape_enabled = true
  AND b.website IS NOT NULL AND b.website <> ''
  AND NOT EXISTS ( -- no run currently in flight
    SELECT 1 FROM brand_fact_scrape_runs r
    WHERE r.brand_id = b.id AND r.status NOT IN ('completed','failed','timeout','cancelled')
  )
  AND (
    NOT EXISTS ( -- never had a run reach 'completed'
      SELECT 1 FROM brand_fact_scrape_runs r2
      WHERE r2.brand_id = b.id AND r2.status = 'completed'
    )
    OR ( -- or its last completed run is stale
      SELECT max(completed_at) FROM brand_fact_scrape_runs r3
      WHERE r3.brand_id = b.id AND r3.status = 'completed'
    ) < now() - '7 days'::interval
  )
ORDER BY b.created_at ASC
LIMIT ${limit}   -- MAX_BRANDS_PER_TICK = 3
```

The eligibility test is "no run currently active, AND no run has ever reached
`completed`." A brand whose site is permanently unreachable (dead domain, robots
blocking everything, DNS failure — anything that makes `aggregate()` conclude
`status: 'failed'` every time, which file 3 confirmed it always eventually does)
**never accumulates a `completed` run**. The `NOT EXISTS (... status = 'completed')`
clause is therefore permanently `TRUE` for that brand, forever. Nothing in this
query, or anywhere else in the file, counts prior attempts or backs off.

Repeating sequence, traced end to end:

- **Tick 1:** orchestrator calls `runFactSheetRefresh(deadline)` →
  `findStaleBrands(3)` selects brand X (never had a completed run) among its
  ≤3 slots → `refreshOneBrand(X, deadline)` → `runFullScrapeForBrand` does a full
  sitemap-discovery + page-fetch + wikidata + search-LLM + user-enrich pass,
  `runAggregate` concludes `status: 'failed'` (site unreachable) → run row is
  terminal-`failed`, real LLM/network spend incurred.
- **Tick 2 (whenever the orchestrator next fires):** `findStaleBrands(3)` runs the
  identical query. Brand X still has zero `completed` rows (its only row is
  `failed`, which is terminal so it doesn't block re-selection via the
  `NOT EXISTS ... NOT IN (completed,...)` guard either) → X is selected again,
  competing for one of the 3 slots → full re-scrape → `failed` again.
- **Tick N:** identical to tick 2, indefinitely. Nothing in the row, the query, or
  the caller changes between tick 2 and tick N — there is no counter to increment,
  no column that flips, no backoff window checked.

The one thing that _does_ fire on repeated failure —
`detectFactScrapeFailureRate` (`server/scheduler.ts` lines 478–527, cron
`0 11 * * *`) — only reads history (3 consecutive `cron_refresh` failures) to log
a warning and call `captureAndFlush` (Sentry). It does not write to
`fact_scrape_enabled`, does not touch `brand_fact_scrape_runs`, and does not
influence `findStaleBrands` in any way. `fact_scrape_enabled` is a user-facing
manual toggle (`server/routes/factSheet.ts`, `server/storage/factAgentStorage.ts`)
— nothing in this pipeline flips it automatically. So the alert is pure
observability; it doesn't stop the loop.

This is structurally the same defect the fix commit describes for
`resumeInFlightAutopilots`: "an unbounded resume of expensive work... justified
[implicitly, by omission] on the reasoning that... is already paid for. It is not
— each resume re-runs the full [pipeline]." Here it's not a mid-flight resume of
one run but a fresh full run created every tick for a brand that can never satisfy
the eligibility query's exit condition — same shape (a row that never advances to
the state the sweep is looking for gets re-driven forever), different literal
mechanism (freshness-of-last-`completed`-run instead of an in-progress status
column).

Two things keep this from being _worse_ than it is, worth naming precisely so the
severity is accurate:

- `MAX_BRANDS_PER_TICK = 3` caps the damage **per tick**, not per brand — a
  permanently-broken brand can consume up to all 3 slots on every tick forever,
  starving brands that would otherwise legitimately be due, but it cannot spawn
  concurrent/overlapping work for itself (the advisory lock in `runFullScrape.ts`
  still applies; back-to-back ticks are also naturally spaced since this is only
  reachable via the orchestrator's own cadence).
- Every individual run _does_ terminate (file 3's safety net), so this does not
  wedge a run in a non-terminal state the way the original autopilot bug did —
  the cost is repeated _successful-looking failures_, not a stuck run.

**Current production exposure.** Per `render.yaml`, this code path is only reached
through `POST /api/cron/daily-orchestrator`, and `EXTERNAL_CRON_ORCHESTRATOR_ENABLED`
is currently `"false"` there with the comment "no authenticated external trigger has
passed its release gate" — so as deployed today on Render, nothing may be calling
this endpoint on a recurring schedule yet. The `CRON_ORCHESTRATOR_BUDGET_MS=900000`
setting and its comment ("15 minutes against an hourly trigger") show the intended
production cadence is hourly once that trigger is wired up. The defect is real and
fully traceable in code independent of today's trigger status: the moment the
documented hourly external trigger is enabled (which `render.yaml` frames as
imminent, not hypothetical), a single permanently-unreachable brand website starts
costing a full six-source fact-scrape every hour, forever, with only a Sentry log
line at 72-hour intervals (3 consecutive daily-11-UTC-window failures) to show for
it.

**Verdict: CONFIRMED.** No bound exists on how many times `findStaleBrands` may
re-select a brand whose scrapes always end in `failed` — no attempt counter, no
backoff window, no automatic disable. `detectFactScrapeFailureRate` alerts but does
not gate. Fix shape should mirror `AUTOPILOT_MAX_ATTEMPTS` /
`AUTOPILOT_RETRY_BACKOFF_MINUTES`: cap consecutive terminal-`failed` attempts (or
elapsed time since the first one) per brand, and stop selecting past the cap until
manual/backoff intervention, the same way `onboardingAutopilot.ts` now treats
`idle`/`failed` brands.

---

## Summary

| File                     | Signature 1 (fall-through on done)                                                       | Signature 2 (unbounded resume)                                                                                                                   | Verdict                 |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `brandActivation.ts`     | Not applicable — no slice/done branch                                                    | Bounded: weekly ledger stamped on every attempt                                                                                                  | **SAFE**                |
| `perceptionProbes.ts`    | Done path and budget-exhausted path share one idempotent terminal-write tail; no restart | Bounded: per-probe terminal status makes each unit single-attempt; resume only touches `pending` rows                                            | **SAFE**                |
| `runFullScrape.ts`       | Not applicable — no slice/done branch; every call is a fresh, always-terminating run     | Bounded (for stuck runs) via `factScrapeBackstop.ts`'s `retry_count < 10`, single increment path                                                 | **SAFE** (in isolation) |
| `runFactSheetRefresh.ts` | Not applicable                                                                           | **No bound**: `findStaleBrands` re-selects any brand with zero `completed` runs, forever; `detectFactScrapeFailureRate` only alerts, never gates | **CONFIRMED**           |
