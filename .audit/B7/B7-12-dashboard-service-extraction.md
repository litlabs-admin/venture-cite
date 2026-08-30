# B7-12: server/routes/dashboard.ts service extraction

Part of phase B6b (move business logic out of route handlers). Scope: only
`server/routes/dashboard.ts`. No other route file touched.

## Handler inventory (before)

`server/routes/dashboard.ts` was 1,815 lines and registered 19 routes inside
`setupDashboardRoutes`. Line ranges are from the file at the start of this
task.

| #   | Route                                                    | Lines     | What it did beyond parse/ownership/shape                                                             |
| --- | -------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| 1   | GET `/api/dashboard/hero/:brandId`                       | 604-674   | Citation-rate/authority/rank aggregation, canonical visibility score, rate-based trend delta         |
| 2   | GET `/api/dashboard/rankings/:brandId`                   | 679-771   | Per-platform grouping, scoring, strength label, snippet selection                                    |
| 3   | GET `/api/dashboard/cited-urls/:brandId`                 | 782-846   | Dedup by (platform, prompt, url), cap, sort                                                          |
| 4   | GET `/api/dashboard/gap-matrix/:brandId`                 | 851-994   | Category matrix, competitor gap thresholding                                                         |
| 5   | GET `/api/dashboard/citation-trend/:brandId`             | 1002-1053 | 8-week bucketing, zero-fill, rate calc                                                               |
| 6   | GET `/api/brands/:brandId/recommendations`               | 1062-1129 | Parallel state load, citation-rate derivation, calls rules engine                                    |
| 7   | GET `/api/brands/:brandId/alerts`                        | 1137-1152 | Already thin (limit clamp + one storage call) - **left as-is**                                       |
| 8   | GET `/api/dashboard/site-health/:brandId`                | 1161-1259 | Cross-process cache, robots/discovery/crawler compute, SQL issue aggregate, scoring                  |
| 9   | GET `/api/dashboard/site-health/:brandId/pages`          | 1267-1313 | Per-page fetch, severity classification, finding ids                                                 |
| 10  | GET `/api/dashboard/site-health/:brandId/history`        | 1323-1354 | Already thin (calls `listSiteHealthScanHistory`, an existing `server/lib` function) - **left as-is** |
| 11  | GET `/finding-status`                                    | 1362-1386 | Raw drizzle read, scoped by brand                                                                    |
| 12  | PUT `/finding-status/:findingId`                         | 1390-1420 | Raw drizzle upsert                                                                                   |
| 13  | DELETE `/finding-status/:findingId`                      | 1424-1446 | Raw drizzle delete                                                                                   |
| 14  | GET `/content-findings`                                  | 1515-1541 | Cache + page-scan orchestration                                                                      |
| 15  | GET `/api/dashboard/perception/:brandId`                 | 1583-1624 | Two queries, numeric coercion, history assembly                                                      |
| 16  | POST `/api/dashboard/perception/:brandId/run`            | 1629-1678 | Cooldown check, calls scoring, serializes                                                            |
| 17  | GET `/api/dashboard/perception/probes/:brandId`          | 1687-1738 | Query + serialize probe matrix                                                                       |
| 18  | POST `/api/dashboard/perception/probes/:brandId/run`     | 1741-1773 | Active-run guard, starts run                                                                         |
| 19  | POST `/api/dashboard/perception/probes/:brandId/advance` | 1777-1813 | Ownership-scoped run lookup, advances run                                                            |

Handlers #7 and #10 were already exactly "parse, ownership, one call, shape" -
no extraction changed them.

## Service modules (after)

Created `server/services/` (did not exist before this task started; three
sibling B7 tasks created their own files there concurrently -
`bofuContent.ts`, `faqs.ts`, `geoAnalytics.ts`, `keywordResearch.ts` - so the
directory itself was shared, not duplicated).

Grouped by dashboard sub-feature, not by route, per the required pattern:

- **`server/services/dashboardVisibility.ts`** (455 lines) - hero, rankings,
  cited-urls, gap-matrix, citation-trend. These all share one loader
  (`loadRankingsContext`) and the same citation-rollup domain, so they belong
  in one file rather than five.
- **`server/services/dashboardRecommendations.ts`** (73 lines) - the
  recommendations state-assembly function. Small and single-purpose; kept
  separate from visibility because it's a different consumer (the rules
  engine in `server/lib/recommendationsEngine.ts`), not a citation rollup.
- **`server/services/dashboardSiteHealth.ts`** (729 lines) - the site-health
  cache/compute machinery, `pageSeverity`, the pages/finding-status/
  content-findings functions, and `warmSiteHealth` (called from
  `server/lib/brandActivation.ts`). All one cohesive "site health" concern
  that already shared caching patterns and constants before this change.
- **`server/services/dashboardPerception.ts`** (230 lines) - brand-perception
  scoring plus the probes trio (start/advance/read). One file because both
  halves score the same `brand_perception_runs`/`brand_perception_probes`
  domain and share `numericOrNull`/`serializePerceptionRun`.

`server/routes/dashboard.ts` is now 504 lines: 19 `app.get/post/put/delete`
registrations that each parse/validate, call `requireOwnedBrand`, call one
service function, and shape the response. `requireOwnedBrand` and
`parseSinceQuery` stayed in the route file because both touch `req`.

Every moved function body is verbatim from the original file, including
comments. No renamed variables, no reformatted logic, no behavior changes.
The one deliberate exception is the perception-run 429/cooldown path, which
had to change _shape_ (not logic) to cross a function boundary without
touching `res`: `runBrandPerceptionScoring` returns a discriminated
`{ kind: "cooldown", retryAfterSeconds } | { kind: "scored", data }` instead
of writing the response directly, and the route handler does the
`res.setHeader`/`res.status(429)` itself. The cooldown threshold, retry-after
math, and response body/headers are byte-for-byte identical - verified by
`tests/unit/dashboardSiteHealthPerception.test.ts`'s existing 429 test, which
passes unchanged.

`loadRankingsContext`'s 30-day-window-with-`since`-override behavior was
preserved exactly, including its comment, per the explicit instruction that
this is confirmed intended behavior and not a defect.

### Backward-compatible re-exports

Three things outside this file's own routes depend on named exports from
`server/routes/dashboard`, so `dashboard.ts` re-exports them from their new
homes instead of defining them locally:

- `scoreSiteHealth` - `tests/unit/siteHealth.test.ts` imports it from
  `routes/dashboard` (it was already a re-export of `server/lib/scoreSiteHealth.ts`
  before this change; unchanged).
- `warmSiteHealth` - `server/lib/brandActivation.ts:149` does
  `await import("../routes/dashboard")` to get it at runtime. This is a real
  production code path, not just a test. Now defined in
  `server/services/dashboardSiteHealth.ts` and re-exported.
- `pageSeverity`, `PERCEPTION_COOLDOWN_MS` - not imported elsewhere today, but
  were part of the module's public surface before this change, so kept
  re-exported to avoid a silent API removal.

## Defects spotted and deliberately left alone

1. **Dead code**: `discoverSitemapUrls` (imported from
   `server/lib/factAgent/v2/sitemapDiscovery`) and the module-scope
   `sitemapFetcher` adapter it was presumably meant to support are both
   unused - no call site anywhere in the original file. `sitemapFetcher`
   moved verbatim into `dashboardSiteHealth.ts` (it's conceptually part of
   that domain); the unused `discoverSitemapUrls` import was dropped because
   nothing in the moved code ever referenced it. `eslint`'s
   `@typescript-eslint/no-unused-vars` is `warn`, not `error`, in this repo,
   which is why this shipped silently. Not fixed - flagging per instructions.
2. The file header comment (lines 1-9) only documents 3 of the module's 19
   routes. Pre-existing, left unchanged.
3. `requireOwnedBrand(req: any)` uses `any` for the request parameter -
   pre-existing, left unchanged (shows up as a lint warning both before and
   after this change).

No other defects found. The heavy in-module caching (site-health,
content-findings) and the cross-instance `system_state` persistence are
intentional, well-commented designs, not bugs - preserved exactly.

## Tests

### Existing tests - unchanged, all passing

Ran only the files covering `server/routes/dashboard.ts`, not the full suite:

```
tests/unit/dashboardGapMatrix.test.ts
tests/unit/dashboardCitationTrend.test.ts
tests/unit/dashboardRecommendationInputs.test.ts
tests/unit/dashboardSiteHealthPerception.test.ts
tests/unit/dashboardCitedUrls.test.ts
tests/unit/siteHealth.test.ts
tests/unit/brandActivation.test.ts
```

Result: 7 files, 47 tests, all passing. No test file was edited.

### New service tests - direct calls, no HTTP

One test file per service module, calling the exported functions directly
(no Express app, no `app.handle()`, no supertest-style request/response
mocks):

```
tests/unit/dashboardVisibilityService.test.ts     (7 tests)
tests/unit/dashboardRecommendationsService.test.ts (2 tests)
tests/unit/dashboardSiteHealthService.test.ts     (15 tests)
tests/unit/dashboardPerceptionService.test.ts     (10 tests)
```

These cover every exported function in all four service modules, including
three code paths that had **no prior test coverage at any level**:
finding-status CRUD (`getSiteHealthFindingStatuses`/`setSiteHealthFindingStatus`/
`clearSiteHealthFindingStatus`), content-findings orchestration
(`getSiteHealthContentFindings`), and the perception-probes trio
(`getPerceptionProbes`/`startOrGetActivePerceptionProbeRun`/
`advanceOwnedPerceptionProbeRun`).

Combined result for this task's scope: 11 files, 81 tests, all passing.

## Gate output

```
$ npm run check
> tsc && npm run verify:tours
Tour-target verification OK (22 targets, all present).
(exit 0, no errors)

$ npx eslint server/routes/dashboard.ts server/services/dashboard*.ts tests/unit/dashboard*Service.test.ts
15 problems (0 errors, 15 warnings)   # all pre-existing-pattern `any`/dead-code warnings, see Defects section

$ npx prettier --check <same files>
All matched files use Prettier code style!

$ npx vitest run <7 pre-existing files> <4 new service test files>
Test Files  11 passed (11)
     Tests  81 passed (81)
```

Full-suite `npm test`, `npm run lint`, and `npm run format:check` were not run
here per instructions - the orchestrator runs those once across all
concurrent B7 work.
