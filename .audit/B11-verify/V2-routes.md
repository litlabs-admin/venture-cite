| method | path                                                             | verdict (SAME / DIFFERS) | note                                                     |
| ------ | ---------------------------------------------------------------- | ------------------------ | -------------------------------------------------------- |
| POST   | /api/check-crawler-permissions                                   | SAME                     | Same source contract. Before line 43; after line 50.     |
| GET    | /api/geo-analytics/:brandId                                      | SAME                     | Same source contract. Before line 215; after line 82.    |
| POST   | /api/analyze-sentiment                                           | SAME                     | Same source contract. Before line 481; after line 117.   |
| POST   | /api/geo-analytics/:brandId/snapshot                             | SAME                     | Same source contract. Before line 549; after line 152.   |
| GET    | /api/geo-analytics/:brandId/history                              | SAME                     | Same source contract. Before line 594; after line 173.   |
| GET    | /api/geo-opportunities/:brandId                                  | SAME                     | Same source contract. Before line 782; after line 203.   |
| GET    | /api/geo-opportunities                                           | SAME                     | Same source contract. Before line 956; after line 227.   |
| POST   | /api/distribute/:articleId                                       | SAME                     | Same source contract. Before line 418; after line 416.   |
| POST   | /api/geo-rankings                                                | SAME                     | Same source contract. Before line 654; after line 511.   |
| GET    | /api/geo-rankings                                                | SAME                     | Same source contract. Before line 680; after line 537.   |
| GET    | /api/geo-rankings/platform/:platform                             | SAME                     | Same source contract. Before line 706; after line 558.   |
| POST   | /api/assistant/chat                                              | SAME                     | Same source contract. Before line 173; after line 174.   |
| POST   | /api/billing/portal-session                                      | SAME                     | Same source contract. Before line 140; after line 41.    |
| GET    | /api/stripe/products                                             | SAME                     | Same source contract. Before line 196; after line 95.    |
| POST   | /api/stripe/checkout                                             | SAME                     | Same source contract. Before line 251; after line 114.   |
| GET    | /api/billing/subscription                                        | SAME                     | Same source contract. Before line 479; after line 165.   |
| POST   | /api/billing/cancel                                              | SAME                     | Same source contract. Before line 549; after line 195.   |
| POST   | /api/billing/resume                                              | SAME                     | Same source contract. Before line 591; after line 225.   |
| GET    | /api/billing/invoices                                            | SAME                     | Same source contract. Before line 635; after line 255.   |
| POST   | /api/articles/:id/generate                                       | DIFFERS                  | F1: see the numbered finding below.                      |
| GET    | /api/content-jobs/:jobId/state                                   | SAME                     | Same source contract. Before line 416; after line 273.   |
| POST   | /api/content-jobs/:jobId/advance                                 | SAME                     | Same source contract. Before line 444; after line 302.   |
| POST   | /api/content/:articleId/cancel                                   | SAME                     | Same source contract. Before line 530; after line 381.   |
| POST   | /api/articles/:id/improve                                        | SAME                     | Same source contract. Before line 562; after line 411.   |
| POST   | /api/keyword-suggestions                                         | SAME                     | Same source contract. Before line 675; after line 483.   |
| GET    | /api/popular-topics                                              | SAME                     | Same source contract. Before line 747; after line 526.   |
| POST   | /api/keyword-research/discover                                   | SAME                     | Same source contract. Before line 828; after line 570.   |
| POST   | /api/listicles/discover/:brandId                                 | SAME                     | Same source contract. Before line 310; after line 195.   |
| POST   | /api/wikipedia/scan/:brandId                                     | SAME                     | Same source contract. Before line 444; after line 307.   |
| POST   | /api/bofu-content/generate                                       | SAME                     | Same source contract. Before line 638; after line 479.   |
| PATCH  | /api/faqs/:id                                                    | SAME                     | Same source contract. Before line 865; after line 591.   |
| POST   | /api/faqs/:id/optimize                                           | SAME                     | Same source contract. Before line 924; after line 643.   |
| POST   | /api/faqs/generate/:brandId                                      | SAME                     | Same source contract. Before line 1008; after line 666.  |
| POST   | /api/wikipedia/draft/:mentionId                                  | SAME                     | Same source contract. Before line 1132; after line 733.  |
| ALL    | /api/cron/daily-orchestrator                                     | SAME                     | Same source contract. Before line 315; after line 74.    |
| ALL    | /api/cron/fact-scrape-backstop                                   | SAME                     | Same source contract. Before line 612; after line 278.   |
| GET    | /api/dashboard/hero/:brandId                                     | SAME                     | Same source contract. Before line 610; after line 74.    |
| GET    | /api/dashboard/rankings/:brandId                                 | SAME                     | Same source contract. Before line 685; after line 92.    |
| GET    | /api/dashboard/cited-urls/:brandId                               | SAME                     | Same source contract. Before line 788; after line 116.   |
| GET    | /api/dashboard/gap-matrix/:brandId                               | SAME                     | Same source contract. Before line 857; after line 134.   |
| GET    | /api/dashboard/citation-trend/:brandId                           | SAME                     | Same source contract. Before line 1008; after line 155.  |
| GET    | /api/brands/:brandId/recommendations                             | SAME                     | Same source contract. Before line 1068; after line 174.  |
| GET    | /api/dashboard/site-health/:brandId                              | SAME                     | Same source contract. Before line 1167; after line 220.  |
| GET    | /api/dashboard/site-health/:brandId/pages                        | SAME                     | Same source contract. Before line 1273; after line 241.  |
| GET    | /api/dashboard/site-health/:brandId/finding-status               | SAME                     | Same source contract. Before line 1368; after line 303.  |
| PUT    | /api/dashboard/site-health/:brandId/finding-status/:findingId    | SAME                     | Same source contract. Before line 1396; after line 324.  |
| DELETE | /api/dashboard/site-health/:brandId/finding-status/:findingId    | SAME                     | Same source contract. Before line 1430; after line 352.  |
| GET    | /api/dashboard/site-health/:brandId/content-findings             | SAME                     | Same source contract. Before line 1521; after line 378.  |
| GET    | /api/dashboard/perception/:brandId                               | SAME                     | Same source contract. Before line 1589; after line 401.  |
| POST   | /api/dashboard/perception/:brandId/run                           | SAME                     | Same source contract. Before line 1635; after line 419.  |
| GET    | /api/dashboard/perception/probes/:brandId                        | SAME                     | Same source contract. Before line 1693; after line 450.  |
| POST   | /api/dashboard/perception/probes/:brandId/run                    | SAME                     | Same source contract. Before line 1747; after line 466.  |
| POST   | /api/dashboard/perception/probes/:brandId/advance                | SAME                     | Same source contract. Before line 1783; after line 483.  |
| GET    | /api/brand-fact-sheet/runs                                       | SAME                     | Same source contract. Before line 42; after line 62.     |
| GET    | /api/brand-fact-sheet/runs/latest-completed                      | SAME                     | Same source contract. Before line 86; after line 106.    |
| GET    | /api/brand-fact-sheet/runs/:runId                                | SAME                     | Same source contract. Before line 121; after line 137.   |
| POST   | /api/brand-fact-sheet/runs/:runId/cancel                         | SAME                     | Same source contract. Before line 149; after line 165.   |
| GET    | /api/brand-fact-sheet/runs/:runId/stream                         | SAME                     | Same source contract. Before line 201; after line 214.   |
| POST   | /api/brand-fact-sheet/facts/:factId/accept                       | SAME                     | Same source contract. Before line 420; after line 383.   |
| POST   | /api/brand-fact-sheet/facts/:factId/dismiss                      | SAME                     | Same source contract. Before line 465; after line 416.   |
| POST   | /api/brand-fact-sheet/facts/bulk-accept                          | SAME                     | Same source contract. Before line 508; after line 449.   |
| GET    | /api/brand-fact-sheet/diff                                       | SAME                     | Same source contract. Before line 554; after line 483.   |
| GET    | /api/brand-fact-sheet/cost-status                                | SAME                     | Same source contract. Before line 598; after line 520.   |
| PATCH  | /api/brands/:brandId/fact-scrape-enabled                         | SAME                     | Same source contract. Before line 639; after line 557.   |
| POST   | /api/brand-fact-sheet/scrape-one                                 | SAME                     | Same source contract. Before line 140; after line 57.    |
| POST   | /api/brand-fact-sheet/search-llm                                 | SAME                     | Same source contract. Before line 256; after line 106.   |
| POST   | /api/brand-fact-sheet/user-enrich                                | SAME                     | Same source contract. Before line 322; after line 148.   |
| POST   | /api/brand-fact-sheet/plan                                       | SAME                     | Same source contract. Before line 398; after line 189.   |
| POST   | /api/brand-fact-sheet/full-rescrape                              | SAME                     | Same source contract. Before line 500; after line 249.   |
| POST   | /api/brand-fact-sheet/aggregate                                  | SAME                     | Same source contract. Before line 603; after line 303.   |
| POST   | /api/brand-fact-sheet/runs/:runId/paste                          | SAME                     | Same source contract. Before line 644; after line 344.   |
| POST   | /api/geo-signals/analyze                                         | SAME                     | Same source contract. Before line 542; after line 35.    |
| POST   | /api/geo-signals/optimize-chunks                                 | DIFFERS                  | F2: see the numbered finding below.                      |
| POST   | /api/geo-signals/schema-audit                                    | SAME                     | Same source contract. Before line 822; after line 190.   |
| POST   | /api/geo-signals/pipeline-simulation                             | SAME                     | Same source contract. Before line 1019; after line 232.  |
| PATCH  | /api/onboarding/state                                            | SAME                     | Same source contract. Before line 56; after line 31.     |
| POST   | /api/onboarding/scrape-stream                                    | SAME                     | Same source contract. Before line 118; after line 73.    |
| POST   | /api/onboarding/confirm                                          | SAME                     | Same source contract. Before line 413; after line 147.   |
| POST   | /api/onboarding/autopilot-retry                                  | SAME                     | Same source contract. Before line 521; after line 189.   |
| POST   | /api/onboarding/autopilot-advance/:brandId                       | SAME                     | Same source contract. Before line 591; after line 217.   |
| GET    | /api/onboarding/autopilot-status/:brandId                        | SAME                     | Same source contract. Before line 637; after line 247.   |
| POST   | /api/brand-prompts/:brandId/generate                             | SAME                     | Same source contract. Before line 44; after line 51.     |
| POST   | /api/brand-prompts/:brandId/reset                                | SAME                     | Same source contract. Before line 78; after line 80.     |
| POST   | /api/brand-prompts/:brandId/suggestions/refresh                  | SAME                     | Same source contract. Before line 121; after line 119.   |
| POST   | /api/brand-prompts/:brandId/suggestions/:suggestionId/accept     | SAME                     | Same source contract. Before line 150; after line 142.   |
| DELETE | /api/brand-prompts/:brandId/suggestions/:suggestionId            | SAME                     | Same source contract. Before line 201; after line 185.   |
| POST   | /api/brand-prompts/:brandId/prompts                              | SAME                     | Same source contract. Before line 227; after line 208.   |
| PATCH  | /api/brand-prompts/:brandId/prompts/:promptId                    | SAME                     | Same source contract. Before line 300; after line 269.   |
| GET    | /api/brand-prompts/:brandId/tags                                 | SAME                     | Same source contract. Before line 446; after line 402.   |
| POST   | /api/brand-prompts/:brandId/tags                                 | SAME                     | Same source contract. Before line 466; after line 416.   |
| GET    | /api/brand-prompts/:brandId/audiences                            | SAME                     | Same source contract. Before line 592; after line 541.   |
| POST   | /api/brand-prompts/:brandId/audiences/generate                   | SAME                     | Same source contract. Before line 641; after line 557.   |
| POST   | /api/brand-prompts/:brandId/audiences                            | SAME                     | Same source contract. Before line 674; after line 584.   |
| POST   | /api/brand-prompts/:brandId/set-health/run                       | SAME                     | Same source contract. Before line 789; after line 692.   |
| POST   | /api/brand-prompts/:brandId/prompts/:promptId/phrasings/generate | SAME                     | Same source contract. Before line 842; after line 739.   |
| POST   | /api/brand-prompts/:brandId/phrasings/:phrasingId/analyze        | SAME                     | Same source contract. Before line 874; after line 762.   |
| DELETE | /api/brand-prompts/:brandId/prompts/:promptId                    | SAME                     | Same source contract. Before line 924; after line 785.   |
| DELETE | /api/visibility-progress/:brandId                                | SAME                     | Same source contract. Before line 1044; after line 903.  |
| POST   | /api/brand-prompts/:brandId/run                                  | SAME                     | Same source contract. Before line 1072; after line 929.  |
| GET    | /api/brands/:brandId/citation-runs/active                        | SAME                     | Same source contract. Before line 1198; after line 1010. |
| GET    | /api/brands/:brandId/citation-runs/state                         | SAME                     | Same source contract. Before line 1218; after line 1026. |
| GET    | /api/brand-prompts/:brandId/run/:runId/details                   | SAME                     | Same source contract. Before line 1331; after line 1094. |
| POST   | /api/brand-prompts/:brandId/re-detect-all                        | DIFFERS                  | F3: see the numbered finding below.                      |
| GET    | /api/brand-prompts/:brandId/results                              | SAME                     | Same source contract. Before line 1601; after line 1158. |
| POST   | /api/user/delete                                                 | SAME                     | Same source contract. Before line 165; after line 67.    |
| PATCH  | /api/user/profile                                                | SAME                     | Same source contract. Before line 329; after line 206.   |
| POST   | /api/user/password                                               | SAME                     | Same source contract. Before line 396; after line 249.   |

## Scope and method

I compared the current branch with `origin/main`.

The scope contains 14 changed route files and 43 new service modules.

The table contains 107 route handlers with changed source regions.

I compared method, path, middleware, status, body, error handling, side effects, and early returns.

I did not treat comments or Markdown as proof.

## Findings

### F1 | medium | server/routes/content.ts:246-253 -> server/routes/content.ts:135-151

Old behaviour:

The handler loaded the article and checked its status before it parsed the request body.

For an existing article with status `generating`, `ready`, or another non-`draft` and non-`failed` status, it returned HTTP 409.

The body was `{ success: false, error: "Cannot generate - article is in status 'generating'.", code: "invalid_status" }`.

New behaviour:

The handler parses the body immediately after the article lookup.

An invalid body returns HTTP 400 before the status check in `enqueueGeneration`.

A valid body still reaches the atomic enqueue conflict branch and returns HTTP 409 with the old shape.

Concrete request that gets a different response than before:

An authenticated owner sends `POST /api/articles/{id}/generate` for an article in status `generating` with body `{}`.

The old handler returns 409 with `code: "invalid_status"`.

The current handler returns 400 with `error: "keywords are required"`.

Confidence: high

### F2 | high | server/routes/geoSignals.ts:756-817 -> server/routes/geoSignals.ts:157-185

Old behaviour:

The handler called `requireBrand(brandId, user.id)` inside the generic catch boundary.

A cross-tenant brand miss raised `OwnershipError`, entered the generic catch, and returned HTTP 500 with `{ success: false, error: "Failed to optimize chunks" }`.

New behaviour:

The handler catches `OwnershipError` before the generic error branch.

It returns HTTP 404 with `{ success: false, error: "Brand not found" }`.

It does not call the optimizer or report the ownership miss through the generic error path.

Concrete request that gets a different response than before:

User A sends an authenticated request to `POST /api/geo-signals/optimize-chunks` with body `{ "content": "short text", "brandId": "<brand owned by User B>" }`.

The old handler returns 500.

The current handler returns 404.

Confidence: high

### F3 | medium | server/routes/prompts.ts:1438-1448 -> server/services/reDetect.ts:19-51; server/routes/prompts.ts:1123-1129

Old behaviour:

The route stored the last run time in a process-local `Map`.

A second request in the same process within 60 seconds returned HTTP 429 with only `success` and `error`.

The old response did not set a `Retry-After` header.

A second process did not see the first process's map, so it could run the operation again.

New behaviour:

The service reads and writes `system_state` under `re-detect-all:{brandId}`.

A second request within 60 seconds returns HTTP 429 with an added `retryAfterSeconds` field and a `Retry-After` header.

All processes read the persisted cooldown state.

Concrete request that gets a different response than before:

An authenticated owner sends `POST /api/brand-prompts/{brandId}/re-detect-all` twice within 60 seconds.

The second response now contains `retryAfterSeconds` and the `Retry-After` header.

If the two requests reach separate application processes, the old code runs the operation twice.

The current code returns 429 for the second request when the persisted state records the first request.

Confidence: high

## Cleared

- The current and origin route trees each contain 242 route registrations.
- The method and path sets match exactly.
- No route registration was added or removed.
- No duplicate method and path exists in either tree.
- Registration order and middleware arguments match in the route comparison.
- `server/routes.ts` has no route-registration diff.
- `server/routes/index.ts` does not exist.
- The 43 service modules contain no Express import and no function parameter named `req` or `res`. An AST scan checked every module.
- The extracted handlers keep their old ownership checks and generic error boundaries, except for F2.
- The indexed read in `server/services/geoOpportunities.ts:195-204` feeds count-based aggregation. It does not expose row order in the response.
- The citation-rate helper returns the same values as the old expression. A direct call to the shipped helper returned `[0,50,100]` for inputs `[(0,0),(1,2),(3,3)]`.
- The client sends a valid generation body at `client/src/pages/content.tsx:447-454`.
- The re-detect client checks `data.success` and does not misread the added cooldown field at `client/src/hooks/usePrompts.ts:803-815`.
- The optimize client reads `data.data.optimizedContent` on success at `client/src/pages/geo-signals.tsx:506-520`. The ownership status difference remains visible as an error.
- No service function was found without a route call or a transitive service caller after checking service exports and references.

## One safety fact

The route registration contract is unchanged.

I reached direct execution proof for the parser that compared both route trees.

It reported 242 registrations in each tree, zero added keys, zero removed keys, and zero duplicate method and path keys.

This proves registration parity.

I also directly executed `shared/visibilityMetrics.ts`. It returned the expected integer percentages `[0,50,100]`.

The audit did not execute a live HTTP path because the task forbids database startup and test execution.

## Before merge

Add a focused request test for F1.

Use an owned article in status `generating` and send an invalid generation body.

Assert that the intended contract is selected explicitly.

Run the existing focused ownership and cooldown tests after the F1 decision:

- `tests/unit/geoSignalsOptimizeChunksOwnership.test.ts`
- `tests/unit/reDetectAllCooldown.test.ts`

Do not use the full suite as proof for F1 because the existing generation test uses a valid body.

## Not checked

- No live HTTP request ran.
- No database or Docker process ran.
- No test suite ran.
- Provider responses and database-dependent response arrays were not exercised.
- The source comparison cannot prove runtime behaviour for network, transaction, or database failure timing.

## Verdict

BEHAVIOUR CHANGED

107 endpoints checked.

Three endpoints have confirmed client-visible behaviour differences.
