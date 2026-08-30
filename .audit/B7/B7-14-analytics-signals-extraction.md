# B7-14: service-layer extraction for geoSignals.ts and analytics.ts

Scope: extract business logic out of `server/routes/geoSignals.ts` (was 1,162
lines) and `server/routes/analytics.ts` (was 1,006 lines) into
`server/services/`, per the pattern in the task brief (handler does parse +
ownership + one service call + response shaping; service takes explicit
params, returns plain data or throws, no Express types).

`server/services/` did not exist when this run started. Other concurrent
agents have since added their own files there (`bofuContent.ts`,
`dashboardSiteHealth.ts`, `faqs.ts`, `keywordResearch.ts`, etc.) - this
report covers only the six files this task added.

## Handler inventory (before)

### server/routes/geoSignals.ts (1,162 lines before -> 268 after)

| Handler                                     | Lines | What it did beyond parse/ownership/shape                                                                                                                    |
| ------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/geo-signals/analyze`             | ~170  | Cross-brand article-id integrity check, schema-completeness DB lookup (hash + cache read), `computeSignals` call, best-effort `geo_signal_runs` persistence |
| `POST /api/geo-signals/chunk-analysis`      | ~27   | Just called module-level `computeChunks` - already nearly a pure service call                                                                               |
| `POST /api/geo-signals/optimize-chunks`     | ~80   | Brand-context sanitisation, OpenAI chat completion call, empty-response detection                                                                           |
| `POST /api/geo-signals/schema-audit`        | ~190  | Cache read (7-day TTL), SSRF-safe fetch, content-type/status branching, JSON-LD parse + per-type completeness scoring, cache upsert                         |
| `POST /api/geo-signals/pipeline-simulation` | ~145  | `computeSignals` + `computeChunks` calls, four-stage (Prepare/Retrieve/Signal/Serve) score computation                                                      |

Plus ~410 lines of module-level pure functions that were already
service-shaped but lived in the route file: `computeSignals`, `computeChunks`,
`measureSchemaCompleteness`, `isFieldPopulated`, `normaliseUrl`, `urlHashOf`,
`SCHEMA_FIELD_REQUIREMENTS`.

### server/routes/analytics.ts (1,006 lines before -> 245 after)

| Handler                                     | Lines | What it did beyond parse/ownership/shape                                                                                                   |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/check-crawler-permissions`       | ~165  | Domain parsing, robots.txt fetch/parse, crawler evaluation, multi-branch recommendation + robots.txt-snippet generation                    |
| `GET /api/geo-analytics/:brandId`           | ~245  | Article/prompt resolution, indexed ranking reads, per-platform visibility scoring, leaderboard-based Share of Voice, sentiment rollup      |
| `POST /api/analyze-sentiment`               | ~65   | API-key precondition, OpenAI sentiment classification call, JSON parse fallback                                                            |
| `POST /api/geo-analytics/:brandId/snapshot` | ~25   | Field defaulting before `storage.createBrandVisibilitySnapshot`                                                                            |
| `GET /api/geo-analytics/:brandId/history`   | ~15   | Trivial `storage.getBrandVisibilitySnapshots` delegation                                                                                   |
| `GET /api/geo-opportunities/:brandId`       | ~185  | Citation-share aggregation by domain (Reddit/own-site/third-party), content-idea generation, per-platform breakdown from real ranking data |
| `GET /api/geo-opportunities`                | ~35   | Static industry/platform lookup                                                                                                            |

Plus ~155 lines of module-level static data (`GEO_PLATFORMS`,
`INDUSTRY_SUBREDDITS`) that fed both opportunity-finder handlers.

## Service modules and grouping rationale

Six files, grouped by cohesion rather than one-per-route:

- **`server/services/geoContentScoring.ts`** - the 6-signal scorecard
  (`computeSignals`) and chunk/extractability analysis (`computeChunks`).
  Pure functions, no DB, no Express. Used by three geoSignals.ts routes
  (`analyze`, `chunk-analysis`, `pipeline-simulation` via the orchestration
  layer below).
- **`server/services/schemaAudit.ts`** - JSON-LD schema.org auditing:
  `normaliseUrl`, `urlHashOf`, `measureSchemaCompleteness`,
  `resolveSchemaCompletenessForArticle` (the analyze-route completeness
  lookup), `runSchemaAudit` (the full cache/fetch/parse/upsert flow), and
  `UnreachableUrlError`. Kept separate from content scoring because it's a
  distinct domain (schema.org markup, not content signals) with its own DB
  table and its own callers (the schema-audit route AND the analyze route's
  completeness lookup).
- **`server/services/geoSignals.ts`** - per-route orchestration that is
  specific to how the three AI-calling geoSignals.ts routes compose the
  above two: `analyzeGeoSignals` (article resolution + schema-completeness
  resolution + persistence), `optimizeContentChunks` (the OpenAI rewrite),
  `simulatePipeline` (the four-stage builder). This is intentionally a thin
  orchestration layer over `geoContentScoring.ts` and `schemaAudit.ts`
  rather than folded into either, because it has route-specific concerns
  (persistence, OpenAI prompt construction) that don't belong in the pure
  scoring/audit modules.
- **`server/services/crawlerPermissions.ts`** - `checkCrawlerPermissions`
  and `InvalidUrlFormatError`. Single-purpose, wraps `lib/crawlerAccess`.
- **`server/services/geoAnalytics.ts`** - the Share-of-Voice/visibility/
  sentiment domain: `computeGeoAnalytics`, `recordVisibilitySnapshot`,
  `getVisibilityHistory`, and the sentiment classifier
  (`analyzeSentimentText` + `SentimentUnavailableError`). The sentiment
  classifier is grouped here rather than split out because in this codebase
  it exists only to serve the analytics domain (brand-mention sentiment),
  not as a general-purpose utility.
- **`server/services/geoOpportunities.ts`** - the opportunity finder:
  `GEO_PLATFORMS`, `INDUSTRY_SUBREDDITS`, `computeGeoOpportunitiesForBrand`,
  `computeGenericGeoOpportunities`. Separate from `geoAnalytics.ts` because
  it's a materially different feature (content/platform recommendations vs.
  visibility measurement) even though both live under `/api/geo-*`.

`computeVisibilityScore` and the citation-rate helpers are imported from
`@shared/visibilityMetrics` and used as-is inside `geoAnalytics.ts` - no
reimplementation.

## Preserved behavior - explicit confirmation

- **`/api/geo-opportunities/:brandId` windowing**: `computeGeoOpportunitiesForBrand`
  in `server/services/geoOpportunities.ts` calls
  `storage.getGeoRankingsByBrandPromptIds(ids)` and
  `storage.getGeoRankingsByArticleIds(articleIds)` with **no `since` argument**,
  exactly as before. The original comment block explaining this is a
  confirmed 2026-08-29 product decision (not a bug) was moved verbatim and is
  still attached to the same call site. `/api/geo-analytics/:brandId`
  (`computeGeoAnalytics` in `geoAnalytics.ts`) still passes `sinceFilter`
  through to the same two storage methods. The two routes' windows were not
  aligned.
- **Indexed ranking read**: both `computeGeoAnalytics` and
  `computeGeoOpportunitiesForBrand` call
  `storage.getGeoRankingsByArticleIds(articleIds[, since])` - the indexed,
  article-scoped read - never a global `getGeoRankings()` scan. Verified by
  the existing `tests/unit/geoOpportunitiesRankings.test.ts`, run unchanged
  and passing, which asserts `getGeoRankings` is never called.
- **`computeVisibilityScore`**: only ever imported and called, never
  reimplemented.

## Defects spotted and left alone (not fixed, per instructions)

1. **`optimize-chunks` ownership-error handling gap** (pre-existing, in
   `server/routes/geoSignals.ts` both before and after this change): if
   `brandId` is supplied but belongs to another user, `requireBrand` throws
   `OwnershipError(404, ...)`. Every other handler in these two files checks
   `err instanceof OwnershipError` and returns the correct 404/401. This one
   handler's catch block does not, so a cross-tenant `brandId` on
   `/optimize-chunks` returns a generic 500 "Failed to optimize chunks"
   instead of 404. Reproduced byte-for-byte from the original file; not
   fixed, since fixing it would change response behavior.
2. **Stale Sentry tag line numbers**: `captureAndFlush(error, { tags: {
source: "analytics.ts:539" } })` and similar (`:790`, `:1087`, `:1111`,
   `:1505`, `:1542`) reference line numbers from the pre-split monolith,
   already stale before this extraction and now more so (the file is 245
   lines, not 1,500+). Left verbatim - these are just Sentry filter tags,
   changing them would be a values-only edit unrelated to the extraction and
   would touch code paths this task should leave alone.
3. **`server/services/geoOpportunities.ts` `strategyTips` duplication**: the
   brand-specific and generic opportunity endpoints both return an identical
   six-item array literal. This was already duplicated in the source file
   (two separate inline arrays) and is reproduced as-is rather than factored
   into a shared constant, per the "move verbatim, don't simplify" rule.

No other defects found in the extracted code paths.

## Tests

- All five originally-covering test files pass unchanged, with no edits:
  `tests/unit/geoOpportunitiesRankings.test.ts`,
  `tests/unit/geoSignalRuns.test.ts`,
  `tests/unit/geoSignalsAnalyzePersistence.test.ts`,
  `tests/unit/autopilotRetry.test.ts`,
  `tests/unit/dashboardRecommendationInputs.test.ts` (the latter two touch
  shared code paths near these routes; confirmed still relevant and green).
- Added one direct (no-HTTP) test file per new service module:
  - `tests/unit/geoContentScoringService.test.ts` (9 tests) - `computeSignals`,
    `computeChunks`, real scoring logic with only the OpenAI-backed
    `embedBatch` stubbed.
  - `tests/unit/schemaAuditService.test.ts` (13 tests) - `normaliseUrl`,
    `urlHashOf`, `resolveSchemaCompletenessForArticle`, `runSchemaAudit`
    (cache hit/miss/force, JSON-LD parse, 404 fetchError,
    `UnreachableUrlError`).
  - `tests/unit/geoSignalsService.test.ts` (8 tests) - `analyzeGeoSignals`
    (persistence, article cross-brand drop, schema-completeness resolution,
    persistence-failure resilience), `optimizeContentChunks`,
    `simulatePipeline`.
  - `tests/unit/crawlerPermissionsService.test.ts` (4 tests) -
    `checkCrawlerPermissions` including both 400 error paths
    (`InvalidUrlFormatError`, `DisallowedUrlError`).
  - `tests/unit/geoAnalyticsService.test.ts` (9 tests) - `computeGeoAnalytics`,
    `recordVisibilitySnapshot`, `getVisibilityHistory`, `analyzeSentimentText`
    (including the `SentimentUnavailableError` and parse-failure-fallback
    paths).
  - `tests/unit/geoOpportunitiesService.test.ts` (5 tests) -
    `computeGeoOpportunitiesForBrand` (zero-citation state, domain bucketing,
    content-idea generation), `computeGenericGeoOpportunities`.
- Total new tests: 48, all passing. Combined with the five pre-existing
  files: 11 files / 67 tests, all green.

Per instructions, only these test files were run - the orchestrator runs the
full suite separately. Integration tests were not touched or run (none
existed for these two route files).

## Gate output

```
$ npx tsc --noEmit -p .
(no output, exit 0)

$ npx eslint .
✖ 996 problems (0 errors, 996 warnings)
(exit 0 - all pre-existing `any`-usage style warnings across the repo,
 including a handful of new ones in this change that match the existing
 project convention: e.g. `safeParseJson<any>`, `body: any` on
 recordVisibilitySnapshot, `catch(() => [] as any[])`)

$ npx prettier --check <8 changed source files> <6 new test files>
All matched files use Prettier code style!

$ npx vitest run \
    tests/unit/geoOpportunitiesRankings.test.ts \
    tests/unit/geoSignalRuns.test.ts \
    tests/unit/geoSignalsAnalyzePersistence.test.ts \
    tests/unit/autopilotRetry.test.ts \
    tests/unit/dashboardRecommendationInputs.test.ts \
    tests/unit/geoContentScoringService.test.ts \
    tests/unit/schemaAuditService.test.ts \
    tests/unit/geoSignalsService.test.ts \
    tests/unit/crawlerPermissionsService.test.ts \
    tests/unit/geoAnalyticsService.test.ts \
    tests/unit/geoOpportunitiesService.test.ts

 Test Files  11 passed (11)
      Tests  67 passed (67)
```

## Files touched

- `server/routes/geoSignals.ts` (rewritten, 1,162 -> 268 lines)
- `server/routes/analytics.ts` (rewritten, 1,006 -> 245 lines)
- `server/services/geoContentScoring.ts` (new, 391 lines)
- `server/services/schemaAudit.ts` (new, 359 lines)
- `server/services/geoSignals.ts` (new, 296 lines)
- `server/services/crawlerPermissions.ts` (new, 167 lines)
- `server/services/geoAnalytics.ts` (new, 320 lines)
- `server/services/geoOpportunities.ts` (new, 356 lines)
- `tests/unit/geoContentScoringService.test.ts` (new)
- `tests/unit/schemaAuditService.test.ts` (new)
- `tests/unit/geoSignalsService.test.ts` (new)
- `tests/unit/crawlerPermissionsService.test.ts` (new)
- `tests/unit/geoAnalyticsService.test.ts` (new)
- `tests/unit/geoOpportunitiesService.test.ts` (new)

Not touched: `server/routes/prompts.ts`, `server/routes/dashboard.ts`,
`server/routes/content.ts`, `server/routes/contentTypes.ts`, `migrations/`,
`client/`. No database or container was started.
