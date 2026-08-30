# B6b-03 — Mutation testing: metrics, scoring, alerting

Method: for each target, applied one semantic mutation directly to the source
file, ran only the test file(s) that claim to cover it, recorded pass/fail,
then restored the file to its original text and diffed against a pre-audit
backup to confirm the restore was exact. No test file was ever edited. The
full suite was never run; only the files named below were run, once per
mutation.

Targets and their test files:

| Target                             | Test file(s)                            |
| ---------------------------------- | --------------------------------------- |
| `shared/visibilityMetrics.ts`      | `tests/unit/visibilityMetrics.test.ts`  |
| `server/lib/llmPricing.ts`         | `tests/unit/llmBudget.test.ts`          |
| `server/lib/scoreSiteHealth.ts`    | `tests/unit/siteHealth.test.ts`         |
| `server/lib/promptScoreHistory.ts` | `tests/unit/promptScoreHistory.test.ts` |
| `server/lib/runChangeAlerts.ts`    | **none exist**                          |

Read the reference commit first: `git show 0eac2a3 -- tests/unit/llmBudget.test.ts`.
That commit is the archetype — a test asserted `estimateCostCents("gpt-4o-mini", 10_000, 5_000)` should be `0` (`0.45c` rounded away), which was the bug, not the spec. Re-injecting that exact defect now (`CENTS_PRECISION = 0`, restoring whole-cent rounding) produces **8 test failures** in `llmBudget.test.ts` — that file is now one of the best-guarded in the audit. That result is the baseline everything else here is measured against.

---

## 1. SURVIVING MUTATIONS

### 1.1 `server/lib/runChangeAlerts.ts` — zero test coverage (most severe finding)

No test file in the repository imports `detectRunChangeAlerts`, `recordRunChangeAlerts`, or anything from `server/lib/runChangeAlerts.ts`. Confirmed by:

```
grep -rl "runChangeAlerts\|detectRunChangeAlerts\|recordRunChangeAlerts" --include="*.ts" --include="*.tsx" .
  ./server/citationChecker.ts   (production caller)
  ./server/lib/runChangeAlerts.ts
  ./server/routes/dashboard.ts  (production caller)
grep -ril "alertHistory\|alert_history\|AlertHistory" tests/
  (no output)
```

This means every mutation applied to this file trivially "survives" — there is
no command to run that would ever fail. Concretely, none of the following
defects would be caught by CI today:

- `VISIBILITY_DROP_PTS` threshold: `delta <= -VISIBILITY_DROP_PTS` flipped to
  `delta < -VISIBILITY_DROP_PTS` (off-by-one on the alert boundary).
- `was.cited > 0 && cur.cited === 0` (prompts_lost detection) inverted or
  changed to `cur.cited < was.cited` (would fire on any decline, not just
  total loss).
- `added > 0` (new_hallucinations) changed to `added >= 0` (would alert on
  every run, even with zero new hallucinations) or the subtraction
  `liveUnresolved - thisRunSnapshot` swapped to
  `thisRunSnapshot - liveUnresolved` (delta sign flip — would alert on
  hallucinations being _resolved_, or never alert on real ones).
- `vis.length < 2` guard removed (would crash or compare a run against
  itself on the very first run for a brand).

This is a materially worse situation than a bad assertion: there is no
assertion at all. Every alert type named in the task brief —
`visibility_drop`, `prompts_lost`, `new_hallucinations` — is unverified.
Recommend a dedicated `tests/unit/runChangeAlerts.test.ts` against a fake
`storage` (the file already documents itself as "pure-ish detector: reads
snapshots only, no writes", so it is straightforward to fake).

### 1.2 `server/lib/scoreSiteHealth.ts` — rounding mode is untested at every stage

Mutation: `Math.round` → `Math.floor` in the crawler-access term.

```diff
-  earned += crawlers.total > 0 ? Math.round((crawlers.allowed / crawlers.total) * 35) : 0;
+  earned += crawlers.total > 0 ? Math.floor((crawlers.allowed / crawlers.total) * 35) : 0;
```

Command: `npx vitest run tests/unit/siteHealth.test.ts`
Result: **7 passed (7)** — mutation survived.

Test that should have caught it and what it asserts instead:
`tests/unit/siteHealth.test.ts` only exercises `crawlers: { total: 10, allowed: 10 }` (100%) and `crawlers: { total: 10, allowed: 0 }` (0%). Both are exact integers under any rounding mode, so `Math.round` and `Math.floor` are indistinguishable to every existing case. No test uses a ratio like `7/10` (=24.5, where round=25 and floor=24 differ).

The identical gap exists two more times in the same function, each independently confirmed to survive:

```diff
-      earned += Math.round((crawl.pagesFetched / denom) * 30);
+      earned += Math.floor((crawl.pagesFetched / denom) * 30);
```

Command: `npx vitest run tests/unit/siteHealth.test.ts` → **7 passed (7)**.

```diff
-  return Math.round((earned / attainable) * 100);
+  return Math.floor((earned / attainable) * 100);
```

Command: `npx vitest run tests/unit/siteHealth.test.ts` → **7 passed (7)**.

All three rounding calls in this 55-line function are unguarded by any
fractional test case.

### 1.3 `server/lib/scoreSiteHealth.ts` — the weighting itself is unverified

Mutation: re-split the 35/30 point budget between crawler-access and
crawl-success as 45/20 (attainable total unchanged at 100 when both are
present):

```diff
-  attainable += 35;
-  earned += crawlers.total > 0 ? Math.round((crawlers.allowed / crawlers.total) * 35) : 0;
+  attainable += 45;
+  earned += crawlers.total > 0 ? Math.round((crawlers.allowed / crawlers.total) * 45) : 0;
   if (crawl) {
-    attainable += 30;
+    attainable += 20;
     const denom = crawl.pagesFetched + crawl.pagesFailed;
     if (denom > 0) {
-      earned += Math.round((crawl.pagesFetched / denom) * 30);
+      earned += Math.round((crawl.pagesFetched / denom) * 20);
     }
   }
```

Command: `npx vitest run tests/unit/siteHealth.test.ts` → **7 passed (7)**.

Also independently confirmed for the discovery weights (`robotsTxt`/`sitemapXml`
swapped from 10/15 to 15/10, same total):

```diff
-export const DISCOVERY_WEIGHTS = { robotsTxt: 10, sitemapXml: 15, llmsTxt: 10 } as const;
+export const DISCOVERY_WEIGHTS = { robotsTxt: 15, sitemapXml: 10, llmsTxt: 10 } as const;
```

Command: `npx vitest run tests/unit/siteHealth.test.ts` → **7 passed (7)**.

Test that should have caught it: same file, "all present → 100" / "nothing
present → 0" tests. Every test scenario in the file is all-earned or
all-zero, so the score is 100 or 0 regardless of how the 100 points are
split among discovery/crawler/crawl. The task brief explicitly names "the
weighting" as a target; it is currently proven only at its two extremes,
never at a value that would distinguish one weighting scheme from another
(e.g. partial discovery + partial crawler success + no crawl, which would
pin down all three weights at once).

### 1.4 `server/lib/scoreSiteHealth.ts` — zero-guard on crawl denominator

Mutation: remove the `denom > 0` guard around the crawl-success term.

```diff
     const denom = crawl.pagesFetched + crawl.pagesFailed;
-    if (denom > 0) {
-      earned += Math.round((crawl.pagesFetched / denom) * 30);
-    }
+    earned += Math.round((crawl.pagesFetched / denom) * 30);
```

Command: `npx vitest run tests/unit/siteHealth.test.ts` → **7 passed (7)**.

No test in the file passes `crawl: { pagesFetched: 0, pagesFailed: 0 }` (a
crawl that ran but touched zero pages — `denom === 0` → `NaN`). Every test
either omits `crawl` (null) or gives it a nonzero total. `NaN` propagating
through `earned` would make `Math.round((earned/attainable)*100)` return
`NaN` for that scored brand, not a clean number or `null` — this would
render as blank/garbage on the dashboard rather than being caught anywhere.

### 1.5 `server/lib/scoreSiteHealth.ts` — zero-guard on crawler-access denominator

Mutation: remove the `crawlers.total > 0` guard.

```diff
-  earned += crawlers.total > 0 ? Math.round((crawlers.allowed / crawlers.total) * 35) : 0;
+  earned += Math.round((crawlers.allowed / crawlers.total) * 35);
```

Command: `npx vitest run tests/unit/siteHealth.test.ts` → **7 passed (7)**.

The one test with `crawlers: { total: 0, allowed: 0 }` ("website null and no
crawl run → null") short-circuits earlier on `if (!website && !crawl) return null;`, so it never reaches this line with a zero denominator. No test reaches this line with `crawlers.total === 0`.

### 1.6 `server/lib/promptScoreHistory.ts` — mean-rank rounding is untested at the boundary

Mutation: `Math.round` → `Math.floor` in `meanRank`.

```diff
-    b.rankCount > 0 ? Math.round((b.rankSum / b.rankCount) * 10) / 10 : null;
+    b.rankCount > 0 ? Math.floor((b.rankSum / b.rankCount) * 10) / 10 : null;
```

Command: `npx vitest run tests/unit/promptScoreHistory.test.ts` → **11 passed (11)**.

The one test exercising mean rank ("averages real placements only and reports
a slip as positive") uses ranks `[2, 4]` (mean 3, exact) and `[6, 8]` (mean 7,
exact) — both integer means, so `(rankSum/rankCount)*10` lands on a whole
number (30, 70) and `Math.round`/`Math.floor` agree. No test input in the
file produces a mean that is fractional at the tenths digit (e.g. ranks
`[1, 2, 2]` → mean 1.6̄, ×10 = 16.6̄, where round gives 1.7 and floor gives
1.6) — the one shape that would actually distinguish the two rounding modes
is never tried.

### 1.7 `server/lib/promptScoreHistory.ts` — rank-0 is not exercised

Mutation: widen the "real placement" guard from `r.rank > 0` to `r.rank >= 0`.

```diff
-    if (typeof r.rank === "number" && r.rank > 0) {
+    if (typeof r.rank === "number" && r.rank >= 0) {
```

Command: `npx vitest run tests/unit/promptScoreHistory.test.ts` → **11 passed (11)**.

The code comment right above this line says explicitly: "folding [an
uncited check] in as 0 would flatter the average" — this is a documented
invariant with no test enforcing it. Every test uses `rank: null` for an
uncited row, never a literal `rank: 0`. If a caller ever passed `0` instead
of `null` for "no rank" (a very easy off-by-one for an upstream SQL
`COALESCE(rank, 0)`), it would silently pull every mean rank downward and
nothing here would notice.

### 1.8 `server/lib/promptScoreHistory.ts` — `byPlatform` has no assertions at all

`grep -n "byPlatform" tests/unit/promptScoreHistory.test.ts` returns nothing.
Confirmed by inverting both the per-platform rank delta and the `isNew` flag
simultaneously:

```diff
-          rankDelta: latest && prior ? latest.rank! - prior.rank! : null,
+          rankDelta: latest && prior ? prior.rank! - latest.rank! : null,
           // Placed now, never placed before.
-          isNew: !!latest && !prior,
+          isNew: !latest && !!prior,
```

Command: `npx vitest run tests/unit/promptScoreHistory.test.ts` → **11 passed (11)**.

This is a full field of `PromptScoreEntry` (`byPlatform`, feeding the
per-model Δ column mentioned in the file's own module comment) with zero
test coverage — sign of the delta, the "new" placement flag, and the
platform-name sort are all unverified. Same severity class as finding 1.1,
scoped to one field rather than one file.

---

## 2. UNJUSTIFIED PINNED VALUES

These are hardcoded expected numbers checked for whether the test file shows
its derivation (a comment with the arithmetic, or a formula reimplemented
independently) versus a bare "whatever the code produced" assertion.

- **`tests/unit/llmBudget.test.ts`, `it.each` table of representative costs**
  (lines ~59-74): `["google/gemini-3.1-flash-lite", 0.07625]`,
  `["deepseek/deepseek-v4-flash", 0.0147]`, `["perplexity/sonar", 0.055]`,
  `["openai/gpt-5.6-luna", 0.0305]`, `["anthropic/claude-haiku-4.5", 0.255]`
  at `(50 in, 500 out)` tokens. **No inline derivation** — unlike the sibling
  test three lines above it ("28 in + 935 out = 0.0007 + 0.14025 = 0.14095c"),
  these five numbers have no shown arithmetic. Checked independently against
  the pricing table in `server/lib/llmPricing.ts`: e.g. gemini-3.1-flash-lite
  is `{in: 0.025, out: 0.15}` → `50/1000*0.025 + 500/1000*0.15 = 0.00125 +
0.075 = 0.07625`. All five values recompute correctly by hand against the
  current table. **Verdict: pinned value is correct**, but the test is
  fragile — a future edit to any of these five prices in
  `PRICING_PER_1K_TOKENS_CENTS` (which the file's own comments say happens
  routinely, e.g. "Prices below verified 2026-08-13") will fail this test
  for a reason unrelated to a real defect, and whoever fixes it will be
  re-deriving arithmetic the test itself doesn't show. Recommend deriving
  the expected value from the table in the test body (as the neighboring
  test already does) rather than a second hardcoded number.

- **`tests/unit/llmBudget.test.ts`, "leaves an already-non-zero, expensive
  call materially unchanged"**: `estimateCostCents("x-ai/grok-4.3", 200_000,
50_000)` → `37.5`. Derivation is shown in a comment
  ("200,000 in + 50,000 out = 25 + 12.5 = 37.5c") and independently
  recomputes correctly from the table (`{in: 0.125, out: 0.25}`). **Correctly
  justified, not flagged as a finding** — included here only to record that
  it was checked.

- **`tests/unit/visibilityMetrics.test.ts`, "matches the documented composite
  formula" case table** (lines ~99-109): ten `[c, t, r, a] → expected`-style
  tuples such as `[12, 40, 4.5, 73]` and `[5, 8, 0, 40]` carry **no
  derivation comment** for the individual numbers. This is lower-risk than a
  bare pin, though, because the test does not hardcode the _expected score_
  at all — it re-derives `formula(...)` independently inside the test and
  asserts `computeVisibilityScore(...) === formula(...)`, i.e. it pins the
  _shape of the calculation_, not a magic output number. Confirmed this
  reimplementation is exact (mutating `computeVisibilityScore` in any of the
  ways in section 1 above was caught by this very test in the earlier runs).
  **Not flagged as an enshrined-bug risk** — it is a genuine independent
  cross-check, not a copy of whatever the function happened to emit.

- **`tests/unit/siteHealth.test.ts`**: every expected value is `0`, `100`, or
  a relative comparison (`toBeGreaterThan`) — none are opaque mid-range
  magic numbers, so there is nothing here shaped like the `0.45 → 0` pattern.
  The risk in this file is coverage (section 1.2-1.5), not a wrong pinned
  number.

- **`tests/unit/promptScoreHistory.test.ts`**: expected values (`50`, `100`,
  mean rank `3`/`7`, `rankDelta: 4`) are all derived inline in comments next
  to each row (e.g. "run A: 1 of 2 cited → 50", "ranks 2 and 4 → mean 3").
  No unjustified pins found in this file.

---

## Clean-tree proof

All four files that were actually mutated during this audit
(`shared/visibilityMetrics.ts`, `server/lib/llmPricing.ts`,
`server/lib/scoreSiteHealth.ts`, `server/lib/promptScoreHistory.ts`) were
restored from a pre-audit backup after every mutation and diffed byte-for-byte
against that backup with zero output. `server/lib/runChangeAlerts.ts` was
never mutated (there is no test to run against it, which is itself finding
1.1) and was never edited.

```
$ git diff --stat -- shared/visibilityMetrics.ts server/lib/llmPricing.ts \
    server/lib/scoreSiteHealth.ts server/lib/promptScoreHistory.ts \
    server/lib/runChangeAlerts.ts
(empty — no output)
```

Full repo `git status --porcelain` at the end of this audit:

```
 M .audit/B6/B6a-08-why-nothing-caught-it.md
 M server/auth.ts
 M tests/unit/brandFactScrapeRunsStorage.test.ts
 M tests/unit/requestRepositories.test.ts
?? .audit/B6/B6b-01-mutation-auth-ownership.md
?? .audit/B6/B6b-03-mutation-metrics.md
```

Full repo `git diff --stat`:

```
 .audit/B6/B6a-08-why-nothing-caught-it.md     |  56 +++++++++---
 server/auth.ts                                |   1 +
 tests/unit/brandFactScrapeRunsStorage.test.ts | 117 ++++++++++++++++++--------
 tests/unit/requestRepositories.test.ts        |  18 +++-
 4 files changed, 146 insertions(+), 46 deletions(-)
```

None of the four modified files above were touched by this audit, and the
set of them changed shape between the start and end of this session (it was
`server/scheduler.ts` earlier, `server/auth.ts` by the end, and a sibling
`.audit/B6/B6b-01-mutation-auth-ownership.md` report appeared mid-session) —
this is another task running concurrently in the same working tree under
this remediation program, not an artifact of this audit. This audit's own
untracked output is `.audit/B6/B6b-03-mutation-metrics.md`.
