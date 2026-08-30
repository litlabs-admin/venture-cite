# B7-03 — Metrics and scoring coverage gaps closed

Source material: `.audit/B6/B6b-03-mutation-metrics.md` (surviving mutations)
and `.audit/B1p/verified.json` entries `F-S28-004` / `F-S28-005`. That
analysis was not re-derived; the gaps below are exactly the ones it named.

Method for every gap: apply the named mutation to the implementation file (or,
for gap D, to the test's own fake), run only the relevant test file, capture
the failure, restore the file from an untouched copy, diff the restore against
that copy (empty), then re-run to confirm green. No implementation file was
left modified. No full suite or `tests/unit` directory run was performed at
any point — only the specific files below, one at a time.

---

## A. `server/lib/runChangeAlerts.ts` — zero coverage before this change

New file: `tests/unit/runChangeAlerts.test.ts` (14 tests). Faked `storage`
(`getMetricsHistory`, `getBrandHallucinations`, `createAlertHistory`) and
`logger` via `vi.mock`; no database.

Key finding while writing the tests: `detectRunChangeAlerts` returns `[]`
immediately when `vis.length < 2` (fewer than 2 `visibility_score` snapshots),
_before_ ever reaching the `prompts_lost` or `new_hallucinations` checks. Any
test isolating those two alert types has to supply a stable (non-dropping,
non-losing) 2-entry `visibility_score` history just to get past that guard —
otherwise the hallucination/prompts tests silently pass for the wrong reason
(early return, not "no alert condition met").

| Mutation (from audit 1.1)                                                           | New assertion                                                                                                                              | Why the input distinguishes                                                                                                                                                                           | Failure captured                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `delta <= -VISIBILITY_DROP_PTS` → `delta < -VISIBILITY_DROP_PTS`                    | "fires exactly AT the -10pt boundary (delta === -10)" expects a `visibility_drop` alert for prior=80, current=70                           | -10 is the exact boundary: `<=` fires, `<` does not. A test using -20 would pass under either operator.                                                                                               | `AssertionError: expected undefined to be defined` at `drop).toBeDefined()`                                                         |
| `was.cited > 0 && cur.cited === 0` → `cur.cited < was.cited`                        | "does NOT flag a prompt that merely declined (3 cited -> 1 cited, not zero)" expects no `prompts_lost` alert                               | A decline to zero and a decline to nonzero are the one shape where the real guard and the broadened guard disagree; both fire on a full loss, so a full-loss-only test wouldn't catch the broadening. | `AssertionError: expected { alertType: 'prompts_lost', ... } to be undefined`                                                       |
| `added > 0` → `added >= 0`                                                          | "does not alert when live count equals the snapshot (added === 0)" + "ordering regression" test, both expect no `new_hallucinations` alert | `added === 0` is the exact value where `>` and `>=` disagree.                                                                                                                                         | 2 failures: both `expect(...find(...)).toBeUndefined()` received a populated alert object                                           |
| `liveUnresolved - thisRunSnapshot` → `thisRunSnapshot - liveUnresolved` (sign flip) | "alerts for the delta..." (expects `added:3`) + "can raise all three alert types" (expects `new_hallucinations` present)                   | A positive real delta (3) becomes negative under the flip, so `added > 0` never fires — directly opposite outcomes, not a coincidental match.                                                         | 2 failures: `expected undefined to be defined`, and the 3-alert-types array missing `new_hallucinations`                            |
| `vis.length < 2` guard removed (mutated to `< 0`)                                   | "returns [] with fewer than 2 visibility snapshots" + "writes nothing and returns [] when there is nothing to report"                      | With 1 or 0 snapshots, `vis[vis.length - 2]` is `undefined`; reading `.metricValue` off it throws instead of returning `[]` cleanly.                                                                  | `TypeError: Cannot read properties of undefined (reading 'metricValue')` — the exact crash the audit predicted for a first-ever run |

Also covered (not audit-named, but load-bearing per the module's own comment):
the ordering invariant that `recordCurrentMetrics` must snapshot
`hallucinations` **before** `detectHallucinationsForRun` runs. A dedicated
test ("ordering regression: a snapshot taken AFTER detection... hides real new
hallucinations") sets `thisRunSnapshot === liveUnresolved` (as it would be if
the snapshot were taken post-detection) and asserts no alert fires — even
though real new hallucinations existed. This documents the load-bearing
ordering with an executable case rather than only a comment.

`recordRunChangeAlerts` also gained 3 tests: persists one `alert_history` row
per detected alert with the right shape, still returns detected alerts when
`createAlertHistory` rejects (best-effort persistence, per the module
comment), and writes/returns nothing when there's nothing to report.

All 5 mutations reproduced and restored; `git diff --stat -- server/lib/runChangeAlerts.ts` is empty.

---

## B. `server/lib/scoreSiteHealth.ts` — 5 surviving mutations

Extended `tests/unit/siteHealth.test.ts` with 7 new tests. Every existing
test in the file used exact 0%/100% ratios; the new tests use ratios and
weight distributions chosen to make round vs. floor, one weighting vs.
another, and a zero denominator all produce different, checkable numbers.

| Mutation (audit §)                                   | New test / assertion                                                                                                                                             | Why the input distinguishes                                                                                                                                                                                                                                                                                                                                                          | Failure captured                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawler-access `Math.round`→`Math.floor` (1.2)       | 7/10 allowed → ratio×35 = 24.5 (the exact halfway point). Discovery full (exact 35), crawl omitted. Expect score `86`.                                           | round(24.5)=25→earned 60→score round(85.71)=**86**; floor(24.5)=24→earned 59→score round(84.28)=**84**. Also independently proves the _outer_ round isn't floor (floor(85.71)=85≠86).                                                                                                                                                                                                | `expected 84 to be 86`                                                                                                                                                                                           |
| Crawl-success `Math.round`→`Math.floor` (1.2)        | 3/4 pages fetched → ratio×30 = 22.5. Discovery + crawler-access both full and exact (attainable=100 exactly, so the outer round is identity). Expect score `93`. | round(22.5)=23→earned 93; floor(22.5)=22→earned 92.                                                                                                                                                                                                                                                                                                                                  | `expected 92 to be 93`                                                                                                                                                                                           |
| Final `Math.round`→`Math.floor` (1.2)                | Same two tests above (86 and 77, below) also catch this — 85.71 and 76.92 both land where floor differs from round.                                              | See derivations above/below.                                                                                                                                                                                                                                                                                                                                                         | `expected 85 to be 86`, `expected 76 to be 77`                                                                                                                                                                   |
| 35/30 crawler/crawl split re-weighted to 45/20 (1.3) | Discovery excluded (all null). Crawler ratio=1 (full), crawl ratio=0.5 (exact, no rounding noise). Expect score `77`.                                            | original: 35×1+round(0.5×30)=50, /65 → round(76.92)=**77**. mutated: 45×1+round(0.5×20)=55, /65 → round(84.61)=**85**. The two terms have different ratios (1 vs 0.5), so redistributing weight between them changes the total nontrivially.                                                                                                                                         | `expected 76 to be 77` (mutated) — 6 of the 13 tests in the file failed under this mutation, including this dedicated one                                                                                        |
| `DISCOVERY_WEIGHTS` 10/15/10 → 15/10/10 (1.3)        | robotsTxt=true, sitemapXml=false, llmsTxt=null (excluded); crawler ratio=1 (full, clean); crawl=null. Expect score `75`.                                         | attainable is invariant (10+15=15+10=25) but earned isn't: original 10(robots)+35(crawler)=45→round(45/60×100)=**75**; mutated 15(robots)+35=50→round(50/60×100)=**83**.                                                                                                                                                                                                             | `expected 17 to be 40` in the first draft of this test (crawlers.total=0 was accidentally still counted toward attainable — see note below); corrected input gave `expected 83 to be 75` under the real mutation |
| `crawlers.total > 0` guard removed (1.5)             | website known, discovery full, crawlers `{total:0, allowed:0}`, crawl null. Expect score `50`.                                                                   | `attainable += 35` for the crawler slot happens **unconditionally** (unlike discovery's null-exclusion) — this was confirmed empirically while writing the test (first draft assumed total=0 excluded the slot from attainable; it does not). With the guard, earned=35(discovery)+0(guarded)=35, attainable=70, score=**50**. Without the guard, `0/0`=NaN poisons the whole score. | `NaN` in place of `50` (guard-removed run); score is not a number, caught by `Number.isNaN(score)` as well as the exact-value assertion                                                                          |
| `denom > 0` guard removed (1.4)                      | website known, discovery full, crawlers full, crawl `{pagesFetched:0, pagesFailed:0}` (a crawl that ran but touched 0 pages). Expect score `70`.                 | `attainable += 30` happens unconditionally once `crawl` is non-null. With the guard: earned=35+35+0=70, attainable=100, score=**70**. Without it: `0/0`=NaN.                                                                                                                                                                                                                         | `AssertionError` / NaN in place of `70`                                                                                                                                                                          |

Note on process: my first draft of the discovery-weights test set
`crawlers: { total: 0, allowed: 0 }` assuming that excluded the crawler-access
term from `attainable` the same way a `null` discovery flag does. Running it
against the _real_ (unmutated) implementation immediately failed
(`expected 17 to be 40`), which is exactly the kind of self-check
`principle-prove-it-works` asks for — it revealed my assumption was wrong
(the crawler slot's `attainable += 35` is unconditional; only `earned` is
guarded), not a code defect. Fixed the test to use a clean ratio=1 crawler
setup instead of total=0, confirmed it passes against the real function, then
proceeded with mutation testing as normal.

All 7 mutations (3 rounding, 2 weighting, 2 zero-guard) reproduced and
restored; `git diff --stat -- server/lib/scoreSiteHealth.ts` is empty.

---

## C. `server/lib/promptScoreHistory.ts` — 3 surviving mutations (incl. F-S28-004 territory)

Extended `tests/unit/promptScoreHistory.test.ts` with 5 new tests (2 in the
existing "mean rank" block, 1 new "byPlatform" describe block with 1 test
making 6 assertions).

| Mutation (audit §)                                                                    | New test / assertion                                                                                                                                                        | Why the input distinguishes                                                                                                                                                                                                                                                                                      | Failure captured                                                                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meanRank`'s `Math.round`→`Math.floor` (1.6)                                          | Ranks `[1,2,2]` → mean 1.6666..., ×10=16.666... Expect `entry.rank === 1.7`.                                                                                                | round(16.67)=17→1.7; floor(16.67)=16→1.6. Every existing test's ranks average to a whole number, where round/floor agree.                                                                                                                                                                                        | `expected 1.6 to be 1.7`                                                                                                                                  |
| `r.rank > 0` → `r.rank >= 0` (1.7), the exact line named in the audit diff (line 85)  | Rows with rank 4 (real) and rank 0 (should be excluded). Expect `entry.rank === 4`.                                                                                         | Guard intact: sum=4,count=1→mean **4**. Guard widened: sum=4+0=4,count=2→mean **2**. Not a coincidental match — the two are materially different.                                                                                                                                                                | `expected 2 to be 4`                                                                                                                                      |
| `byPlatform`'s `rankDelta` sign flip + `isNew` negation, applied simultaneously (1.8) | New test asserts, per platform: sorted order `[anthropic, openai]`, `openai.rankDelta === 4` (rank slipped 2→6), `anthropic.isNew === true` (ranked only in the latest run) | Chosen so each field breaks in a _different_, non-cancelling way: an asymmetric delta (2→6, not e.g. 4→4) makes a sign flip visible; a platform new-in-latest-only (not new-in-prior-only) makes a negated `isNew` visible. Verified both sub-mutations fail independently (sign flip alone, and both together). | Combined mutation: `expected false to be true` on `isNew`. Sign-flip-only mutation (isolated re-run): same test still fails on the `rankDelta` assertion. |

`byPlatform` previously had zero assertions in the whole file (`grep -n
"byPlatform" tests/unit/promptScoreHistory.test.ts` returned nothing before
this change) — this closes that alongside F-S28-004's "no derivation" theme by
giving the field its own documented, distinguishing test case.

All 3 mutations (the exact single-line diffs from the audit, not a
broader `sed -g`) reproduced and restored; `git diff --stat -- server/lib/promptScoreHistory.ts` is empty.

Note: F-S28-004 itself (slice(-maxPoints) vs slice(0, maxPoints)) already has
a passing assertion in the existing test "keeps only the most recent
`maxPoints` runs, oldest first" — `entry.series` uses the newest 3 of 10 runs
and checks chronological order via a sort-equality assertion. That existing
test already distinguishes the two slice directions (a `slice(0,3)` mutation
would keep the _oldest_ 3 runs, whose timestamps do not match "most recent 3,
oldest-first" the test asserts). No further change was needed there; the
audit register entry's own text says the current test checks "only the
retained length and chronological order," which — checked against the code —
does already catch the `slice(0, maxPoints)` regression because the retained
timestamps would differ. Gap D below is the one this task's brief explicitly
asked to fix.

---

## D. `tests/unit/rateLimitBuckets.test.ts` — F-S28-005 (concurrency test coverage)

Register finding: "The fake client stores rows in a shared map... does not
model transaction isolation, and no test starts concurrent acquisitions...
Two concurrent callers can both read one token and return `true`, but this
suite cannot detect that double acquisition."

Fix, entirely inside the test file (no production file touched — the real
implementation's `SELECT ... FOR UPDATE` already provides real Postgres row
locking; only the **fake** lacked isolation modeling):

1. Added a per-`(provider, scopeId)` mutex (`locksTail` + `acquireRowLock`)
   that the fake's `SELECT ... FOR UPDATE` handler awaits before reading the
   row, mirroring a real row lock held for the transaction's lifetime.
2. The lock releases on `COMMIT`/`ROLLBACK` (only for the `FOR UPDATE`
   variant — the plain read used by `secondsUntilAvailable` is a one-off
   client that never commits, so locking it would leak the lock forever;
   this matches real Postgres, where a lock-free `SELECT` doesn't block on
   another transaction's row lock either).
3. `_resetBuckets`'s `DELETE FROM rate_limit_buckets` handler now also
   clears `locksTail` between tests.
4. Added a `describe("concurrent acquisition (F-S28-005)")` block with 2
   tests that actually fire concurrent `tryAcquire` calls via `Promise.all`.

| Test                                                              | Input chosen                                                                                               | Why it distinguishes                                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "does not let two concurrent callers both take the last token"    | Drain to exactly 1 token left (9 sequential acquires), then race 2 concurrent acquires for that last token | A race lets both succeed (2), correct behavior allows exactly 1 — a hard equality (`toBe(1)`), not a range check, so the double-acquisition bug can't slip through as "close enough" |
| "a concurrent burst never grants more than the bucket's capacity" | 15 concurrent callers against a fresh 10-capacity bucket                                                   | Without the lock, every caller reads the same pre-decrement state and all 15 succeed — a 50% overshoot, not a fuzzy off-by-one                                                       |

**Mutation proof** (proving the lock fix itself is load-bearing, since this
gap is test-only): temporarily removed the `if (text.includes("FOR
UPDATE")) { releaseRowLock = await acquireRowLock(key); }` line from the fake
and re-ran:

```
× does not let two concurrent callers both take the last token
  AssertionError: expected 2 to be 1
× a concurrent burst never grants more than the bucket's capacity
  AssertionError: expected 15 to be 10
```

Both failures are exactly the double-acquisition / overshoot the register
entry describes. Restored the lock modeling; `npx vitest run
tests/unit/rateLimitBuckets.test.ts` → 13 passed (13). `git diff --stat --
server/lib/rateLimitBuckets.ts` is empty (implementation was never touched
for this gap).

---

## E. `tests/unit/llmBudget.test.ts` — undocumented `it.each` pin

Added a derivation comment above the `it.each` cost table (5 models × 50/500
tokens), matching the style of the sibling test 3 lines above it. Each row now
carries its own inline arithmetic (rate table values, then the
`50/1000*in + 500/1000*out` computation), plus a header comment explaining
that these are pinned expected values (not re-derived from the pricing table
at test time) and that a legitimate price update requires updating the
matching row here — a price change, not a regression.

**No numeric values were changed.** `npx vitest run tests/unit/llmBudget.test.ts`
→ 16 passed (16), same as before the comment was added.

---

## Final verification

```
$ npx vitest run tests/unit/runChangeAlerts.test.ts tests/unit/siteHealth.test.ts \
    tests/unit/promptScoreHistory.test.ts tests/unit/rateLimitBuckets.test.ts \
    tests/unit/llmBudget.test.ts
 Test Files  5 passed (5)
      Tests  70 passed (70)

$ git diff --stat -- server/lib/runChangeAlerts.ts server/lib/scoreSiteHealth.ts \
    server/lib/promptScoreHistory.ts server/lib/rateLimitBuckets.ts server/lib/llmPricing.ts
(empty)

$ git status --porcelain
 M .audit/B6/B6a-08-why-nothing-caught-it.md          <- other concurrent agent
 M tests/unit/MentionsTab.test.tsx                     <- other concurrent agent
 M tests/unit/brandFactScrapePagesStorage.test.ts      <- other concurrent agent
 M tests/unit/brandFactScrapeRunsStorage.test.ts       <- other concurrent agent
 M tests/unit/jobLease.test.ts                         <- other concurrent agent
 M tests/unit/llmBudget.test.ts                        <- this task (E)
 M tests/unit/outboxRepository.test.ts                 <- other concurrent agent
 M tests/unit/outboxWorker.test.ts                     <- other concurrent agent
 M tests/unit/promptGeneratorCap.test.ts               <- other concurrent agent
 M tests/unit/promptScoreHistory.test.ts               <- this task (C)
 M tests/unit/rateLimitBuckets.test.ts                 <- this task (D)
 M tests/unit/requestRepositories.test.ts              <- other concurrent agent
 M tests/unit/resendWebhook.test.ts                    <- other concurrent agent
 M tests/unit/siteHealth.test.ts                       <- this task (B)
?? .audit/B6/B6b-0{1,2,4,5}-*.md                       <- other concurrent agents
?? .audit/B7/                                          <- this report + a sibling agent's B7-04
?? docs/                                               <- other concurrent agent
?? tests/integration/ownershipTenantIsolation.test.ts  <- other concurrent agent
?? tests/unit/requireAuthForApi.test.ts                <- other concurrent agent
?? tests/unit/runChangeAlerts.test.ts                  <- this task (A, new file)
```

No implementation file (`server/lib/*.ts`) shows a diff. Only test files this
task was scoped to touch were modified; every other listed change belongs to
a concurrently running agent in the same shared working tree, per the task's
own warning that this happens during the remediation program.
