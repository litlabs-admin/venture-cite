# Parallel Execution Plan

Companion to `2026-08-27-backend-remediation.md` (the tasks) and
`2026-08-27-codex-orchestration.md` (the dispatch contract).

**Goal:** cut wall-clock from nine sequential dispatches to a critical path of three, without
letting two writers touch the same region of the same file.

---

## 1. The constraint that shapes everything

`server/databaseStorage.ts` is **5,139 lines and is touched by six of the nine tasks** (1, 3, 4, 5,
6, 7). `server/routes/dashboard.ts` is touched by two (5, 6). `migrations/` is touched by two
(2, 8). Naive "one agent per task, all at once" would have six writers in one file.

Two mechanisms make parallelism safe:

1. **Git worktrees** — each writer gets its own checkout and branch, so there is no shared working
   tree to corrupt. Merge conflicts become a controlled, sequential problem instead of a
   simultaneous one.
2. **Pre-assigned anchors** — every writer is told the exact line region to edit, so distant hunks
   auto-merge and no two agents append to the same place.

### Verified anchors in `server/databaseStorage.ts`

| Line      | Symbol                                       | Owner                                                    |
| --------- | -------------------------------------------- | -------------------------------------------------------- |
| 614       | `createGeoRanking`                           | Task 1                                                   |
| 666       | `getGeoRankingsByBrandPromptIds`             | Task 4 (aggregates go **immediately after**)             |
| 2126      | `createCompetitorGeoRanking`                 | Task 1, then Task 3's batch method **immediately after** |
| 2163      | `getCompetitorGeoRankings`                   | Task 6 (batched read goes **immediately after**)         |
| 3846–3859 | `tryAcquireScrapeLock` / `releaseScrapeLock` | Task 7 (deletes both)                                    |

> **Task 3 and Task 6 are ~40 lines apart.** That is the one genuinely tight pair. They are placed
> in the same lane so they never run concurrently.

### Migration numbering — corrected

Highest existing migration is **0116**, not 0124. The remediation plan's example filenames
(`0125_…`, `0126_…`) are wrong. Pre-assign to prevent two agents both claiming "the next number":

- Task 2 → `migrations/0117_geo_rankings_checked_at_indexes.sql`
- Task 8 → `migrations/0118_retention_and_constraints.sql`

---

## 2. Lanes

Four lanes run concurrently. Only Lane A is a chain; the rest are single dispatches.

| Lane                  | Contents                            | Model                                    | Files owned                                                                                  | Depends on    |
| --------------------- | ----------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| **A** (critical path) | T1 → T3 → **[T4+T5+T6 batched]**    | luna/high, then terra/high for the batch | `databaseStorage.ts`, `citationChecker.ts`, `metricsSnapshot.ts`, `dashboard.ts`             | T1 in flight  |
| **B**                 | T2 — indexes + schema declarations  | luna/low                                 | `migrations/0117_*`, `shared/schema.ts`                                                      | none          |
| **C**                 | T8 — retention, CHECKs, FK indexes  | luna/high                                | `migrations/0118_*`, `routes/cron.ts`                                                        | none          |
| **D**                 | T7 — advisory locks                 | terra/max                                | `advisoryLock.ts`, `workflowEngine.ts`, `migrationRunner.ts`, `databaseStorage.ts:3846-3859` | none          |
| **E**                 | T9 — runtime-role staging procedure | terra/max, **read-only first**           | `.env.example`, `docs/deploy-runbook.md`                                                     | merges of A–D |

**Why T4+T5+T6 batch into one dispatch.** They are the same shape — add an aggregate SQL method,
delete a JavaScript reduction, keep the response identical. T5 and T6 both edit `dashboard.ts`, and
all three edit `databaseStorage.ts`. The subagent-driven-development guidance is explicit: batch
small same-shape work into one dispatch and review the diff as one unit. Splitting them buys three
review seats and a three-way merge for no benefit.

**Why T7 gets its own lane despite touching `databaseStorage.ts`.** Its edit is a deletion at
line 3846 — more than 1,600 lines from the nearest other writer. Distant hunks merge cleanly.

### Critical path

```
now:      T1 (in flight)      B: T2      C: T8      D: T7
then:     T3                  ─ done ─   ─ done ─   ─ done ─
then:     T4+T5+T6 batched
then:     E: T9  (needs A–D merged)
```

Three dispatches deep instead of nine. Lanes B, C and D finish while Lane A is still on its first
step.

---

## 3. Worktree setup

One worktree per lane, each on its own branch off the remediation branch. Lane A stays in the
primary tree because Task 1 is already running there.

```bash
git worktree add ../vc-lane-b -b lane-b-indexes      backend-remediation-2026-08-27
git worktree add ../vc-lane-c -b lane-c-retention    backend-remediation-2026-08-27
git worktree add ../vc-lane-d -b lane-d-locks        backend-remediation-2026-08-27
```

Each dispatch then pins its root:

```powershell
codex exec -m gpt-5.6-luna -c model_reasoning_effort="low" -s workspace-write `
  -C "C:\Users\yoges\OneDrive\Desktop\vc-lane-b" `
  --output-schema <repo>\.superpowers\schemas\task-report.json `
  -o <repo>\.superpowers\sdd\backend-remediation\task-2-report.json `
  "Read <brief path> ..."
```

`node_modules` is not copied into a worktree. Each lane needs `npm ci` before it can run tests —
budget that, or restrict lanes B and C to `npm run check` and defer full `npm test` to post-merge.

---

## 4. Merge order and gates

Merge sequentially into `backend-remediation-2026-08-27`, cheapest-to-riskiest, running the suite
after each:

1. **Lane B** (indexes) — schema declarations only, no behaviour change.
2. **Lane C** (retention) — new migration plus a cron step.
3. **Lane D** (locks) — concurrency semantics; the one most likely to surface a real regression.
4. **Lane A** (the read/write path chain) — largest diff, merged last so conflicts resolve against
   an already-verified base.

After each merge:

```
npm run check
npm test          # compare against baseline: 1 failed / 1602 passed / 90 skipped
```

**The baseline is not green.** `tests/unit/requestRlsMigrationShape.test.ts` already fails on
untouched code. A merge is clean when it adds no _new_ failure — not when the suite is all green.

---

## 5. Review parallelism

Reviews are read-only and take no locks, so **every review runs in parallel with everything else**,
including other reviews. A lane's review is dispatched the moment that lane's diff exists; it never
blocks another lane.

| Reviewed           | Model                     | Effort |
| ------------------ | ------------------------- | ------ |
| T1, T2, T8         | luna                      | high   |
| T3, batched T4+5+6 | terra                     | high   |
| T7, T9             | terra (production-safety) | max    |

Diffs are packaged to files first — `git diff -U10 BASE..HEAD > …/task-N.diff` — so no diff ever
enters the controller's context.

---

## 6. Concurrency ceiling

Four concurrent writers plus reviews is the working ceiling. Reasons to stay there rather than
push higher:

- The account is a single ChatGPT session; concurrent `codex exec` processes share its rate limit.
- The old `.codex/config.toml` set `max_concurrent_threads_per_session = 3`, which suggests three
  was the tested comfort level for the in-session multi-agent feature. Four independent OS
  processes is a different mechanism, but the signal is worth respecting.
- Every additional worktree is another `npm ci`.

If dispatches start returning rate-limit errors, drop to two writers and keep reviews serial.

---

## 7. What does not parallelise

- **Task 9's cutover.** It stops at a tested staging procedure and hands off to a human, by design.
- **Merges.** Sequential, with the suite run between each.
- **The `pg_stat_statements` re-measurement.** Done once, by the controller, after Lane A merges —
  it is the only proof the row counts actually fell.
