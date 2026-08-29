# B6a-04: consolidate hand-rolled citation-rate copies onto `citationRatePct`

## Verification that each site was genuinely the canonical formula

All eleven assigned sites, plus one additional site found during the sweep
(`server/lib/workflows/weeklyCatchup.ts`, see "Extra site" below), were read
in full before editing and matched `total > 0 ? Math.round((cited / total) *
100) : 0` character-for-character (modulo variable names). None used
`Math.floor`, omitted the zero guard, or diverged in any other way, so every
replacement below is behavior-preserving.

## Shared-location decision

`shared/visibilityMetrics.ts` (moved from `server/lib/visibilityMetrics.ts`).

Reasoning: the file was read in full before moving. It has **zero imports** -
`citationRateFraction`, `citationRatePct`, and `computeVisibilityScore` are
pure functions with no server-only dependencies (no `storage`, no `db`, no
`@shared/schema` even). Per the task's decision rule ("check what
`computeVisibilityScore` depends on before moving it; if it pulls in
server-only imports, move only the rate functions"), there was nothing
server-only to leave behind, so the whole file moved intact. This also avoids
creating a second, drifting copy of `computeVisibilityScore` - the exact
defect this file exists to prevent (per its own header comment).

`shared/money.ts` was precedent for the alias (`@shared/*`, wired in both
`vite.config.ts` for the client and `tsconfig.json` for the server/`tsx`
runtime). `server/citationChecker.ts` and `server/db.ts` already import other
`@shared/*` modules at runtime under `tsx`, confirming the alias resolves
server-side too, not just for the client bundler.

The matching test file, `tests/unit/visibilityMetrics.test.ts`, was **not**
moved - `tests/unit/money.test.ts` is precedent for keeping shared-module
tests flat in `tests/unit/` rather than mirroring `shared/` as a subfolder.
Only its import path was updated.

## Sites changed (11 assigned + 1 extra)

All replacements are `citationRatePct(cited, total)`, importing it from
`@shared/visibilityMetrics`.

| #     | File                                       | Before                                                                                             | After                                                                                                                                |
| ----- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `server/emailService.ts:151`               | `p.checks > 0 ? Math.round((p.cited / p.checks) * 100) : 0`                                        | `citationRatePct(p.cited, p.checks)`                                                                                                 |
| 2     | `server/routes.ts:398`                     | `totalChecks > 0 ? Math.round((totalCitations / totalChecks) * 100) : 0`                           | `citationRatePct(totalCitations, totalChecks)`                                                                                       |
| 3     | `server/scheduler.ts:149`                  | `totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0`                               | `citationRatePct(totalCited, totalChecks)`                                                                                           |
| 4     | `server/routes/dashboard.ts:1051`          | `b.total > 0 ? Math.round((b.cited / b.total) * 100) : 0`                                          | `citationRatePct(b.cited, b.total)` (file already imported `citationRatePct` for another call site; only the usage needed to change) |
| 5     | `server/routes/prompts.ts:1820`            | `p.checks > 0 ? Math.round((p.cited / p.checks) * 100) : 0`                                        | `citationRatePct(p.cited, p.checks)`                                                                                                 |
| 6     | `server/routes/prompts.ts:1824`            | `totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0`                               | `citationRatePct(totalCited, totalChecks)`                                                                                           |
| 7     | `server/lib/agentTaskExecutor.ts:132`      | `runResult.totalChecks > 0 ? Math.round((runResult.totalCited / runResult.totalChecks) * 100) : 0` | `citationRatePct(runResult.totalCited, runResult.totalChecks)`                                                                       |
| 8     | `server/lib/promptScoreHistory.ts:123`     | `b.checks > 0 ? Math.round((b.cited / b.checks) * 100) : 0`                                        | `citationRatePct(b.cited, b.checks)`                                                                                                 |
| 9     | `server/storage/citationsStorage.ts:324`   | `totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0`                               | `citationRatePct(totalCited, totalChecks)`                                                                                           |
| 10    | `server/storage/citationsStorage.ts:336`   | `s.checks > 0 ? Math.round((s.cited / s.checks) * 100) : 0`                                        | `citationRatePct(s.cited, s.checks)`                                                                                                 |
| 11    | `client/src/pages/report.tsx:280`          | `p.mentions > 0 ? Math.round((p.citations / p.mentions) * 100) : 0`                                | `citationRatePct(p.citations, p.mentions)`                                                                                           |
| extra | `server/lib/workflows/weeklyCatchup.ts:76` | `totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0`                               | `citationRatePct(totalCited, totalChecks)`                                                                                           |

Also updated the three pre-existing imports that pointed at the old
`server/lib/visibilityMetrics` path (`server/citationChecker.ts`,
`server/routes/analytics.ts`, `server/routes/dashboard.ts`) to
`@shared/visibilityMetrics`, since the file moved.

### Extra site found during the sweep: `server/lib/workflows/weeklyCatchup.ts:76`

Not in the assigned list of eleven. Found via
`grep -rn "Math.round((.*\/.*)\s*\*\s*100)"` across `server/`, `client/`,
`shared/` after finishing the eleven, done to check for other copies of the
same defect (per the repo's standing rule to fix the general defect, not just
the reported instances). Read in full: `currentScore = totalChecks > 0 ?
Math.round((totalCited / totalChecks) * 100) : 0` inside the `delta_calc`
step of the weekly-catchup workflow - character-for-character the same
formula, same zero guard, so replacing it is equally behavior-preserving.
Included in the consolidation and listed separately here rather than silently
folded into the "11" so the extra scope is visible.

## Site refused: `server/routes/assistant.ts:263`

Found by the same grep sweep. **Left alone** - it is not behavior-equivalent
to the canonical helper:

```ts
const rate =
  latest && (latest.totalChecks ?? 0) > 0
    ? Math.round(((latest.totalCited ?? 0) / latest.totalChecks!) * 100)
    : null;
```

The guard here returns `null`, not `0`, when there is no completed run or
`totalChecks` is `0`, and that `null` is load-bearing: it drives the assistant
context text down a different branch ("no completed runs yet" vs. a `%`
figure). `citationRatePct` always returns `0` in that case. Replacing this
would silently change the assistant's context block from "no completed runs
yet" to "Latest citation rate: 0%" whenever a completed run exists with zero
checks. Left as-is and reported per the task's instruction to not replace
formulas that differ even in the zero-guard's return value.

## Sites confirmed as different metrics and left untouched (per the assigned "leave alone" list)

Re-verified each of these still computes something other than the citation
rate before leaving them:

- `server/routes/analytics.ts:194` - `Math.round((allowedCount / AI_CRAWLERS.length) * 100)`, crawler allow-count score, not cited/total.
- `server/routes/analytics.ts:456,460,464` - sentiment percentages (`overallSentiment.positive|neutral|negative / totalSentimentCount`).
- `server/lib/llmBudget.ts:58` - `Math.round((used / cap) * 100)`, token budget percent.
- `client/src/components/dashboard-panels/PromptsRow.tsx:350` - `total === 0 ? 0 : Math.round((n / total) * 100)`, a generic percent helper parameterized over an arbitrary numerator, not citation-specific.
- `client/src/pages/internal/Dashboard.tsx:154` - `Math.round((kpis.activeBrands / kpis.totalUsers) * 100) / 100`, brands-per-user ratio (also divides by 100 again - a different shape entirely).
- `client/src/pages/ai-visibility.tsx:917,928` - `total > 0 ? Math.round((completed / total) * 100) : 0`, job/step progress percentage, not citations.

Also inspected but not in either list, and correctly out of scope (different
metrics, not citation rate):

- `server/lib/scoreSiteHealth.ts:53` - `Math.round((earned / attainable) * 100)`, site-health score.
- `server/storage/platformStorage.ts:56` - `Math.round((recentArticles.length / Math.max(allArticles.length, 1)) * 100)`, article recency ratio.
- `client/src/components/dashboard-panels/useDashboardData.ts:253` - `Math.round(((positive + neutral * 0.5) / total) * 100)`, a weighted sentiment score, not a plain rate.

## Test added

`tests/unit/visibilityMetrics.test.ts` already covered zero-total, zero-cited,
and a 1/3 rounding case. Added the missing exact-half boundary:

```ts
expect(citationRatePct(5, 10)).toBe(50); // exact half
```

Also updated its import from `../../server/lib/visibilityMetrics` to
`../../shared/visibilityMetrics` to follow the file move.

## Verification run

```
npx tsc --noEmit
```

Clean, no errors (confirms every new `@shared/visibilityMetrics` import and
the removed `server/lib/visibilityMetrics` path resolve correctly across
both the client and server TypeScript projects).

```
npx vitest run tests/unit/articlesAIGenerated.test.ts tests/unit/authRateKey.test.ts \
  tests/unit/autoCitationDeadline.test.ts tests/unit/citationChecker.kickoff.test.ts \
  tests/unit/citationChecker.matcherAuthority.test.ts tests/unit/citationCheckerBatchInsert.test.ts \
  tests/unit/citationCronUnconditional.test.ts tests/unit/citationReconciliation.test.ts \
  tests/unit/contentGenerateStatusConflict.test.ts tests/unit/dashboardCitationTrend.test.ts \
  tests/unit/dashboardCitedUrls.test.ts tests/unit/dashboardGapMatrix.test.ts \
  tests/unit/dashboardPreDataState.test.ts tests/unit/dashboardRecommendationInputs.test.ts \
  tests/unit/dashboardSiteHealthPerception.test.ts tests/unit/detectFactScrapeFailureRate.test.ts \
  tests/unit/metricsSnapshotAggregate.test.ts tests/unit/promptDiagnoseRivals.test.ts \
  tests/unit/promptGeneratorCap.test.ts tests/unit/promptScoreHistory.test.ts \
  tests/unit/promptShape.test.ts tests/unit/rateLimitBuckets.test.ts \
  tests/unit/usePromptsGenerateCache.test.tsx tests/unit/v2ExtractionPrompt.test.ts \
  tests/unit/visibilityMetrics.test.ts
```

Result:

```
 Test Files  25 passed (25)
      Tests  132 passed (132)
```

(This is every test file whose name mentions citation, rate, metric, prompt,
or dashboard, plus the canonical-helper test itself. The full suite was not
run, per instructions - the orchestrator runs that once. Integration tests
that need `TEST_DATABASE_URL` were not specifically targeted since none of
the eleven sites are integration-tested by name; the unit coverage above
exercises `promptScoreHistory`, `dashboardCitationTrend`, and
`citationChecker` call paths that use the changed formula.)

## Files touched

- `shared/visibilityMetrics.ts` (moved from `server/lib/visibilityMetrics.ts`, content unchanged)
- `server/citationChecker.ts` (import path only)
- `server/routes/analytics.ts` (import path only)
- `server/routes/dashboard.ts` (import path + one call-site consolidation)
- `server/emailService.ts`
- `server/routes.ts`
- `server/scheduler.ts`
- `server/routes/prompts.ts`
- `server/lib/agentTaskExecutor.ts`
- `server/lib/promptScoreHistory.ts`
- `server/storage/citationsStorage.ts`
- `client/src/pages/report.tsx`
- `server/lib/workflows/weeklyCatchup.ts` (extra site, see above)
- `tests/unit/visibilityMetrics.test.ts` (import path + one added boundary case)

## Not changed

- `server/routes/assistant.ts:263` - different behavior at the zero/undefined boundary (`null` sentinel vs. `0`), see above.
- The six sites named in "Sites to LEAVE ALONE" plus three more found during the sweep (`scoreSiteHealth.ts`, `platformStorage.ts`, `useDashboardData.ts`) - all confirmed to compute a different metric, not the citation rate.
