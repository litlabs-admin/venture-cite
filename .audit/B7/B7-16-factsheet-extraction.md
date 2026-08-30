# B7-16: factSheet.ts / factSheetV2.ts service extraction

Extracted business logic from `server/routes/factSheet.ts` (692 lines) and
`server/routes/factSheetV2.ts` (713 lines) into `server/services/`, matching
the pattern from `contentGeneration.ts` / `dashboardSiteHealth.ts` / the
B7-15 report: flat, domain-prefixed service modules with no `Service`
suffix, no Express types, explicit params in / plain data or throw out.

## V1 vs V2: both are live, not a supersession

`factSheet.ts` (v1, "Spec 2 redesign") owns run lifecycle, the SSE progress
stream, and fact accept/dismiss/diff. `factSheetV2.ts` owns the actual
extraction pipeline steps (`scrape-one`, `search-llm`, `user-enrich`,
`plan`, `full-rescrape`, `aggregate`, `paste`) that a v1 run's pages/facts
get populated by. These are not two generations of the same surface where
one supersedes the other — v1's run/page/fact rows are the data model that
v2's pipeline steps write into and v1's SSE stream reads back out of. Both
files are registered in `server/routes.ts` and both are live. I did not
unify them.

The one place they share a literal operation is `storage.getScrapeRunById`
— called identically by v1 (list-detail/cancel/stream) and every v2 source
route (scrape-one/search-llm/user-enrich/aggregate/paste), 8 call sites
total. That's a trivial passthrough with no divergent meaning between v1
and v2, so I centralized it as `getFactSheetRunById` in
`server/services/factSheetRuns.ts` and imported it into both route files.
Same treatment for `getFactSheetPageById`.

Two duplicates found and folded, both **within** a single original file
(not across v1/v2, so no risk of the "two rules that looked like one
duplicate" trap called out in the task):

- `factSheet.ts` declared the identical terminal-status array twice under
  two names: `TERMINAL_STATUSES` (used by cancel) and `TERMINAL_FOR_STREAM`
  (used by the SSE loop). Folded into one export,
  `FACT_SHEET_TERMINAL_STATUSES`, in `factSheetRuns.ts`.
- `factSheetV2.ts`'s `/plan` and `/full-rescrape` handlers ran the exact
  same guard sequence (in-flight run, cooldown, cost cap) independently,
  byte-for-byte identical except for which `brand` variable was in scope.
  Folded into `evaluateFactSheetRunGuards(brand)` in
  `factSheetV2Pipeline.ts`, called from both handlers.

## Before/after line counts

| File                                              | Before | After |
| ------------------------------------------------- | ------ | ----- |
| `server/routes/factSheet.ts`                      | 692    | 590   |
| `server/routes/factSheetV2.ts`                    | 713    | 392   |
| **New:** `server/services/factSheetRuns.ts`       | —      | 115   |
| **New:** `server/services/factSheetFacts.ts`      | —      | 92    |
| **New:** `server/services/factSheetStream.ts`     | —      | 160   |
| **New:** `server/services/factSheetV2Sources.ts`  | —      | 324   |
| **New:** `server/services/factSheetV2Pipeline.ts` | —      | 143   |

`factSheet.ts` shrank less than `factSheetV2.ts` proportionally because its
SSE stream handler (Task 6) keeps its framing — headers, heartbeat
interval, `req.on("close")` abort tracking, the slice-budget deadline,
`res.write`/`res.end` — in the route by necessity (see below); only the
per-tick data-fetch-and-shape logic moved out.

## Handler inventory (factSheet.ts)

| Route                                                | Before    | Non-parse/ownership/shaping logic found                                                           | Extracted to                                                                                                         |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /api/brand-fact-sheet/runs`                     | 25 lines  | None (passthrough query)                                                                          | `factSheetRuns.listFactSheetRuns`                                                                                    |
| `GET /api/brand-fact-sheet/runs/latest-completed`    | 30 lines  | None (passthrough query)                                                                          | `factSheetRuns.getLatestCompletedFactSheetRun`                                                                       |
| `GET /api/brand-fact-sheet/runs/:runId`              | 24 lines  | None (passthrough query x2)                                                                       | `factSheetRuns.getFactSheetRunById`, `factSheetRuns.listFactSheetRunPages`                                           |
| `POST /api/brand-fact-sheet/runs/:runId/cancel`      | 40 lines  | Terminal-state check + CAS transition + success log                                               | `factSheetRuns.cancelFactSheetRun`                                                                                   |
| `GET /api/brand-fact-sheet/runs/:runId/stream` (SSE) | 210 lines | Per-tick delta fetch + cursor advance + source-status mapping (framing/timing stays in the route) | `factSheetStream.getNewFactSheetPages`, `getNewFactSheetFacts`, `getFactSheetSourceUpdateEvents`, `parseLastEventId` |
| `POST /api/brand-fact-sheet/facts/:factId/accept`    | 40 lines  | Accept + structured log                                                                           | `factSheetFacts.acceptFactSheetFact`                                                                                 |
| `POST /api/brand-fact-sheet/facts/:factId/dismiss`   | 32 lines  | Dismiss + structured log                                                                          | `factSheetFacts.dismissFactSheetFact`                                                                                |
| `POST /api/brand-fact-sheet/facts/bulk-accept`       | 38 lines  | Conflict loop with domain/runId scoping                                                           | `factSheetFacts.bulkAcceptFactSheetConflicts`                                                                        |
| `GET /api/brand-fact-sheet/diff`                     | 37 lines  | Flat-to-domain-grouped transform                                                                  | `factSheetFacts.getFactSheetDiff`                                                                                    |
| `GET /api/brand-fact-sheet/cost-status`              | 33 lines  | Month-key derive + default-fill                                                                   | `factSheetRuns.getFactSheetCostStatus`                                                                               |
| `PATCH /api/brands/:brandId/fact-scrape-enabled`     | 31 lines  | Toggle + log                                                                                      | `factSheetRuns.setFactSheetScrapeEnabled`                                                                            |

## Handler inventory (factSheetV2.ts)

| Route                                          | Before    | Non-parse/ownership/shaping logic found                                           | Extracted to                                                                   |
| ---------------------------------------------- | --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /api/brand-fact-sheet/scrape-one`        | 110 lines | LLM-failover setup + robots cache + static-source call + persist + counters + log | `factSheetV2Sources.scrapeFactSheetPage`                                       |
| `POST /api/brand-fact-sheet/search-llm`        | 65 lines  | Search-source call + persist + log                                                | `factSheetV2Sources.searchFactSheetLlm`                                        |
| `POST /api/brand-fact-sheet/user-enrich`       | 71 lines  | Brand-shape mapping (incl. `keyValues` array-join) + enrich call + persist + log  | `factSheetV2Sources.enrichFactSheetFromUser`                                   |
| `POST /api/brand-fact-sheet/plan`              | 100 lines | Guard evaluation + sitemap discovery + URL scoring + run/page creation            | `factSheetV2Pipeline.evaluateFactSheetRunGuards`, `createFactSheetPlan`        |
| `POST /api/brand-fact-sheet/full-rescrape`     | 101 lines | Guard evaluation + lazy pipeline import + background kickoff                      | `factSheetV2Pipeline.evaluateFactSheetRunGuards`, `startFactSheetFullRescrape` |
| `POST /api/brand-fact-sheet/aggregate`         | 37 lines  | Aggregate call + response shaping                                                 | `factSheetV2Pipeline.aggregateFactSheetRun`                                    |
| `POST /api/brand-fact-sheet/runs/:runId/paste` | 69 lines  | LLM-failover setup + extraction prompt + parse-with-repair + tag + persist + log  | `factSheetV2Sources.extractFactSheetFromPaste`                                 |

## Service modules and grouping rationale

- `factSheetRuns.ts` — v1 run/page/settings admin: list, latest-completed,
  get-by-id, cancel (CAS + terminal check), cost status, scrape-enabled
  toggle. Also owns `FACT_SHEET_TERMINAL_STATUSES` and the shared
  `getFactSheetRunById`/`getFactSheetPageById` lookups used by v2 too.
- `factSheetFacts.ts` — v1 fact-conflict resolution: accept, dismiss,
  bulk-accept, diff. Grouped separately from runs because it operates on
  `brand_fact_sheet` rows, not `brand_fact_scrape_runs`/`_pages` rows.
- `factSheetStream.ts` — the SSE stream's per-tick decision logic only
  (cursor parsing, new-page/new-fact delta fetch + wire-shape mapping,
  source-status translation). The stream handler itself stays in the
  route: SSE is not a request/response round-trip, it's an open connection
  the route owns for its lifetime (headers, 15s heartbeat, abort tracking,
  slice-budget deadline, the `res.write`/`res.end` calls). A service
  function that "must not touch req or res" cannot own that; what moved is
  everything upstream of the actual write.
- `factSheetV2Sources.ts` — the four "run one extraction step against a
  run" functions (scrape-one/search-llm/user-enrich/paste), plus the
  `openaiProvider`/`openrouterClaudeProvider` LLM-failover setup that
  scrape-one and paste both need. Grouped because all four follow the same
  shape (call an extraction outcome → persist → log → return response
  fields) and three of the four literally consume the same source-status
  vocabulary the SSE stream reads back.
- `factSheetV2Pipeline.ts` — run-lifecycle orchestration for v2: guard
  evaluation (shared by plan + full-rescrape), plan creation (sitemap
  discovery + run/page rows), full-rescrape kickoff (background pipeline
  trigger), aggregate. Grouped because these three routes create or
  advance a run's lifecycle rather than extract facts from one page.

## A behavior-preserving detail worth flagging

`startFactSheetFullRescrape`'s dynamic `await import("../lib/factAgent/v2/runFullScrape")`
had to stay _awaited in the synchronous call path_, not deferred inside the
`waitUntil`'d promise. The original route awaited the import directly (so a
module-load failure would hit the route's own try/catch → `sendError`),
then called `waitUntil(runFullScrapeForBrand(...).catch(...))` (so a
pipeline failure is swallowed and reported to Sentry without affecting the
response). Moving the import inside the `waitUntil`'d async block would
have silently changed both behaviors — I kept the exact original
sequencing in `factSheetV2Pipeline.ts` and added a comment explaining why,
plus a test (`factSheetV2PipelineService.test.ts`) asserting the promise
handed to `waitUntil` carries the rejection.

## Defects found and left alone

- None found beyond what B6a already flagged (`runFactSheetRefresh`'s retry
  bound, `factScrapeBackstop`'s 10-run cap) — this extraction calls into
  both unchanged, per the task's "don't duplicate that logic" instruction.
- `factSheetV2.ts`'s original `/plan` and `/full-rescrape` both re-derive
  `monthKey` and re-fetch `getMonthlyCostCap`/`getInFlightScrapeRun`/
  `getLastCompletedScrapeRunAt` independently rather than sharing a single
  read across the two possible call paths in one request — not a defect
  introduced here, this is the exact duplicate logic I consolidated into
  `evaluateFactSheetRunGuards`, so it's fixed as a byproduct of a pure
  duplicate-fold rather than a deliberate defect fix.
- `runFullScrapeForBrand` itself calls `normalizeHttps(brand.website ?? "")`
  a second time internally, redundant with the route's own check before
  calling `startFactSheetFullRescrape`. Pre-existing (in a module outside
  this task's scope), left untouched.

## Verification

- `npx tsc --noEmit -p .` — clean, no errors. (One transient error
  appeared in `server/routes/userAccount.ts` / `server/services/userGdpr.ts`
  during a concurrent run — those are owned by a different agent working
  the same worktree per the task's shared-worktree note; a follow-up
  `tsc` run after their edit settled was clean, and neither file is in
  this task's scope.)
- `npx eslint` on all 7 touched/new source files plus the 5 new test
  files — 0 errors, 48 `no-explicit-any` warnings, all pre-existing style
  (confirmed by linting the pre-extraction `factSheet.ts` from `HEAD`,
  which already had 42 of the same warning on the exact lines that moved).
- `npx prettier --check` — clean after one `--write` pass restricted to
  the files this task owns.
- Existing tests, run unmodified and green (13 files, 53 tests):
  `factSheetDiff.test.ts`, `factSheetEnabledToggle.test.ts`,
  `factSheetFactsAcceptDismiss.test.ts`, `factSheetRunsCancel.test.ts`,
  `factSheetRunsGet.test.ts`, `factSheetRunsList.test.ts`,
  `factSheetSseStream.test.ts`, `v2AggregateRoute.test.ts`,
  `v2PasteRoute.test.ts`, `v2PlanRoute.test.ts`, `v2ScrapeOneRoute.test.ts`,
  `v2SearchLlmRoute.test.ts`, `v2UserEnrichRoute.test.ts`.
- New direct (no-HTTP) service tests, one file per service module, all
  green (5 files, 40 tests): `factSheetRunsService.test.ts`,
  `factSheetFactsService.test.ts`, `factSheetStreamService.test.ts`,
  `factSheetV2SourcesService.test.ts`, `factSheetV2PipelineService.test.ts`.
  These call every extracted function directly against mocked `storage`/
  pipeline modules, with no Express app, request, or response involved.
- No test required editing to go green. No database or container was
  started. `server/routes/articles.ts`, `billing.ts`, `onboarding.ts`,
  `cron.ts`, `userAccount.ts`, `migrations/`, and `client/` were not
  touched.
