# B7-13: content.ts / contentTypes.ts service extraction

Extracted business logic from `server/routes/content.ts` (1,056 lines) and
`server/routes/contentTypes.ts` (1,168 lines) into `server/services/`.
`server/services/` did not exist before this change; the layout below is
the first instance of the pattern for other B7 route-extraction agents to
match.

Built on commit `708aa72` (`enforceFeatureCooldownOr429`,
`classifyAiEnqueueError`) without modifying it. Both shared helpers are
still called directly from the route handlers (not from services) because
they write to `res` themselves — per the task's own rule, a function that
touches `res` cannot live in the service layer, so the cooldown/`res`-aware
call stays at the route boundary and only the pure work around it moved.

## Before/after line counts

| File                                             | Before | After |
| ------------------------------------------------ | ------ | ----- |
| `server/routes/content.ts`                       | 1,056  | 745   |
| `server/routes/contentTypes.ts`                  | 1,168  | 758   |
| **New:** `server/services/contentGeneration.ts`  | —      | 204   |
| **New:** `server/services/keywordResearch.ts`    | —      | 292   |
| **New:** `server/services/listicles.ts`          | —      | 32    |
| **New:** `server/services/wikipedia.ts`          | —      | 76    |
| **New:** `server/services/bofuContent.ts`        | —      | 154   |
| **New:** `server/services/faqs.ts`               | —      | 305   |
| **New:** `server/services/trackedContentSync.ts` | —      | 30    |

Route files shrank by ~29–35%, not more, because every extracted block was
replaced by a same-size result-kind `if` cascade in the handler (the "shape
the response" step of the four-things pattern) rather than a single
one-line call — the branching that used to live inline (400/404/409/413/502/
503 etc.) still has to live somewhere, and it now lives in the handler
mapping a discriminated-union result to a response.

## Handler inventory (content.ts)

| Route                                                 | Before    | Non-parse/ownership/shaping logic found                                   | Extracted to                                                                                            |
| ----------------------------------------------------- | --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `registerLlmJobHandler("keyword_discovery")` finalize | 68 lines  | Entire body: dedup + persist                                              | `keywordResearch.keywordDiscoveryFinalize`                                                              |
| `computeJobStatePayload` (module-level export)        | 27 lines  | Entire body (pure)                                                        | `contentGeneration.computeJobStatePayload` (re-exported from `content.ts` for the existing test import) |
| `contentLengthForResponse` (module-level export)      | 3 lines   | Entire body (pure)                                                        | `contentGeneration.contentLengthForResponse` (re-exported likewise)                                     |
| `POST /api/articles/:id/generate`                     | 117 lines | The `waitUntil` background-drive loop (claim slice → run → poll interval) | `contentGeneration.driveArticleGenerationInBackground`                                                  |
| `GET /api/content-jobs/active`                        | 18 lines  | None                                                                      | —                                                                                                       |
| `GET /api/content-jobs/:jobId`                        | 24 lines  | None                                                                      | —                                                                                                       |
| `GET /api/content-jobs/:jobId/state`                  | 17 lines  | None (calls `computeJobStatePayload`)                                     | —                                                                                                       |
| `POST /api/content-jobs/:jobId/advance`               | 46 lines  | Slice-claim + run + article refetch                                       | `contentGeneration.advanceContentJobSlice`                                                              |
| `POST /api/content-jobs/:jobId/cancel`                | 26 lines  | None                                                                      | —                                                                                                       |
| `POST /api/content/:articleId/cancel`                 | 25 lines  | None                                                                      | —                                                                                                       |
| `POST /api/articles/:id/improve`                      | 111 lines | Snapshot/rewrite/optimistic-lock/two-revision-write                       | `contentGeneration.autoImproveArticle`                                                                  |
| `POST /api/keyword-suggestions`                       | 65 lines  | Prompt build + OpenAI call + parse + error handling                       | `keywordResearch.suggestKeywords`                                                                       |
| `GET /api/popular-topics`                             | 78 lines  | Prompt build + OpenAI call + parse + fallback                             | `keywordResearch.getPopularTopics`                                                                      |
| `POST /api/keyword-research/discover`                 | 143 lines | Competitor fetch + prompt build + enqueue + error classification          | `keywordResearch.discoverBrandKeywords`                                                                 |
| `GET /api/keyword-research/:brandId`                  | 21 lines  | None                                                                      | —                                                                                                       |
| `GET /api/keyword-research/:brandId/opportunities`    | 20 lines  | None                                                                      | —                                                                                                       |
| `PATCH /api/keyword-research/:id`                     | 20 lines  | None                                                                      | —                                                                                                       |
| `DELETE /api/keyword-research/:id`                    | 13 lines  | None                                                                      | —                                                                                                       |

## Handler inventory (contentTypes.ts)

| Route                                              | Before                | Non-parse/ownership/shaping logic found                                                                                                                                                    | Extracted to                               |
| -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `syncTrackedContentUrl` (module-level helper)      | 21 lines              | Entire body (pure, called from two PATCH handlers)                                                                                                                                         | `trackedContentSync.syncTrackedContentUrl` |
| `registerLlmJobHandler("faq_generation")` finalize | 88 lines              | Entire body: dedup + score + persist                                                                                                                                                       | `faqs.faqGenerationFinalize`               |
| Listicle CRUD (get/list/post/patch/delete)         | 5 handlers, 122 lines | None (outreach-status validation is plain input validation, left in place)                                                                                                                 | —                                          |
| `POST /api/listicles/discover/:brandId`            | 47 lines              | Scanner call + response shaping into legacy field aliases                                                                                                                                  | `listicles.discoverBrandListicles`         |
| Wikipedia get/create                               | 2 handlers, 37 lines  | None                                                                                                                                                                                       | —                                          |
| `POST /api/wikipedia/scan/:brandId`                | 55 lines              | Scanner call + response shaping                                                                                                                                                            | `wikipedia.scanBrandWikipediaMentions`     |
| BOFU get/list/post/patch/delete                    | 5 handlers, 108 lines | None (PATCH's tracked-URL sync call moved with `syncTrackedContentUrl`)                                                                                                                    | —                                          |
| `POST /api/bofu-content/generate`                  | 145 lines             | Grounding context + per-type prompt build + OpenAI call + persist                                                                                                                          | `bofuContent.generateBofuContent`          |
| FAQ get/list/post/delete                           | 4 handlers, 84 lines  | None                                                                                                                                                                                       | —                                          |
| `PATCH /api/faqs/:id`                              | 40 lines              | `aiSurfaceScore` recompute-on-edit (fetches existing FAQ + brand, calls `computeAiSurfaceScore`) — this one was _not_ called out in the task brief but is real business logic, not shaping | `faqs.recomputeAiSurfaceScoreForEdit`      |
| `POST /api/faqs/:id/optimize`                      | 82 lines              | Grounding context + prompt build + OpenAI call + parse + score + update                                                                                                                    | `faqs.optimizeFaq`                         |
| `POST /api/faqs/generate/:brandId`                 | 88 lines              | faqCount clamp + prompt build + enqueue + error classification                                                                                                                             | `faqs.generateFaqs`                        |
| `GET /api/geo-tools/summary/:brandId`              | 13 lines              | None                                                                                                                                                                                       | —                                          |
| `POST /api/wikipedia/draft/:mentionId`             | 58 lines              | Grounding context + prompt build + OpenAI call                                                                                                                                             | `wikipedia.draftWikipediaMention`          |

## Service modules and grouping rationale

- `contentGeneration.ts` — article-lifecycle logic (job state, background
  drive loop, per-slice advance, auto-improve). Grouped because all four
  operate on the same job/article pair and share the `ContentRequestArticle`/
  `ContentRequestRevisionRepository` types from `server/data/`.
- `keywordResearch.ts` — everything keyword-shaped from `content.ts`
  (suggestions, popular topics, AI discovery + its job finalize). These
  don't share code with each other but share a domain and a caller file;
  splitting them into three separate one-function files would have been
  one-file-per-route in spirit even though it's one-file-per-handler-group.
- `listicles.ts`, `wikipedia.ts`, `bofuContent.ts`, `faqs.ts` — one module
  per GEO-asset type in `contentTypes.ts`, matching the file's own
  `====` section banners (LISTICLE TRACKER / WIKIPEDIA MONITOR / BOFU
  CONTENT GENERATOR / FAQ OPTIMIZER). `wikipedia.ts` holds both the scan
  and the draft-text helper since both are Wikipedia-specific and small.
- `trackedContentSync.ts` — split out on its own because it is the one
  piece of logic genuinely shared _across_ the BOFU and FAQ PATCH handlers
  (both keep `tracked_content_urls` in sync with their own `publishedUrl`
  column). One file, one shared function, two callers.

## Genuinely common vs. only-looked-common

- **Genuinely common:** `syncTrackedContentUrl` — byte-identical need in
  both BOFU-PATCH and FAQ-PATCH, same signature, same call site shape.
  Extracted once, imported twice.
- **Only looked common:** the `registerLlmJobHandler` finalize pattern
  appears in both files (`keyword_discovery` in `content.ts`,
  `faq_generation` in `contentTypes.ts`) and the AI-enqueue try/catch shape
  in `discoverBrandKeywords` and `generateFaqs` looks identical at a
  glance. Per the task brief, `content.ts`'s keyword-discovery catch has an
  extra `AbortError`/`TimeoutError` → 504 branch that `contentTypes.ts`'s
  FAQ-generate catch deliberately lacks (this was the point of commit
  `708aa72` — the two were _not_ unified into `classifyAiEnqueueError`
  precisely because of this difference). I kept them as two separate
  functions (`discoverBrandKeywords` with the extra branch,
  `generateFaqs` without it) rather than re-introducing a shared helper
  that would either add the branch to FAQ generation or drop it from
  keyword discovery. Verified by reading commit `708aa72`'s diff before
  writing either function.
- **Only looked common:** the "load grounding context, render facts,
  build an OpenAI prompt, call the model" shape repeats across
  `generateBofuContent`, `optimizeFaq`, `generateFaqs`, and
  `draftWikipediaMention`. Each prompt's actual content, model, and
  temperature differ enough (and the task instructs moving bodies
  verbatim, not designing new shared abstractions) that I left each as its
  own function rather than inventing a generic "runGroundedPrompt" helper.
  That would be a real refactor, not an extraction, and isn't reviewable
  as a pure move.

## Defects found and left alone

- `server/services/keywordResearch.ts` (moved from `content.ts`'s
  `suggestKeywords` catch block): `captureAndFlush(error, { tags: { source:
"content.ts:541" } })` — the tag hardcodes a stale file:line reference
  that predates this extraction (and was probably already stale before it,
  since the surrounding code had shifted inside `content.ts` itself).
  Left verbatim per the "move verbatim, don't fix what you notice"
  instruction; flagging here so someone updates the Sentry tag string
  intentionally rather than as a side effect of a move.
- `server/routes/contentTypes.ts`, `POST /api/wikipedia/scan/:brandId`:
  the handler calls `requireBrand(req.params.brandId, user.id)` for
  ownership and then immediately re-fetches the same row with
  `storage.getBrandById(req.params.brandId)` to get the fields
  `hasEnoughBrandProfile` needs. This double-fetch predates this change
  (present in the original file) and wasn't touched — it's a real
  inefficiency (two DB round-trips where `requireBrand`'s row already has
  everything needed) but fixing it wasn't in scope for a pure extraction.
- `server/services/faqs.ts` `recomputeAiSurfaceScoreForEdit`: if
  `storage.getFaqItemById` returns nothing (FAQ deleted between the
  ownership check and the PATCH body processing — a narrow race), the
  function returns `undefined` and the caller silently skips recomputing
  `aiSurfaceScore`, exactly matching the original inline `if (existing) {
... }` guard. Not a new defect — preserved exactly — but worth noting
  since it means a same-request race can PATCH a FAQ without updating its
  score.
- Confirmed (not a defect, but validated during extraction): migration
  `0106_content_request_generation_commands.sql`'s atomic status check
  is the only guard on `POST /api/articles/:id/generate`'s article-status
  transition. No shadowing pre-check was reintroduced; the route still
  relies solely on `jobs.enqueueGeneration`'s `{kind: "conflict"}` result
  from the atomic command, per `contentGenerateStatusConflict.test.ts`
  (still green, unmodified).

## Verification

- `npx tsc --noEmit -p .` — clean, no errors.
- `npm run check` (`tsc && verify:tours`) — clean:
  `Tour-target verification OK (22 targets, all present).`
- `npx eslint <all touched files>` — 0 errors, 50 `no-explicit-any`
  warnings, all pre-existing style (the original files used the same
  `any` casts; matches the project's existing 942-warning/0-error
  baseline on `npm run lint`).
- `npx prettier --check <all touched files>` — clean after one
  `--write` pass restricted to files this task owns (did not touch the
  other in-flight agents' unformatted files: `server/routes/analytics.ts`,
  `server/routes/prompts.ts`, `server/services/geoAnalytics.ts`,
  `server/services/geoSignals.ts`, `server/services/prompts/*`).
- Existing tests, run unmodified and green (101 tests across 14 files):
  `tests/unit/contentCancel.test.ts`,
  `tests/unit/contentGenerateStatusConflict.test.ts`,
  `tests/unit/contentGenerationResponses.test.ts` (this one imports
  `computeJobStatePayload`/`contentLengthForResponse` from
  `server/routes/content.ts` directly — preserved via re-export),
  `tests/unit/keywordResearchProvenance.test.ts`,
  `tests/unit/aiEnqueueErrorMap.test.ts`, `tests/unit/rateLimitBuckets.test.ts`,
  `tests/unit/trackedContentMatcher.test.ts`.
- New direct (no-HTTP) service tests, one file per service module, all
  green: `tests/unit/contentGenerationService.test.ts`,
  `tests/unit/keywordResearchService.test.ts`,
  `tests/unit/listiclesService.test.ts`, `tests/unit/wikipediaService.test.ts`,
  `tests/unit/bofuContentService.test.ts`, `tests/unit/faqsService.test.ts`,
  `tests/unit/trackedContentSyncService.test.ts`. These call every
  extracted function directly against mocked `storage`/`openai`/`llmJobs`,
  with no Express app, request, or response involved.
- No test required editing to go green. No database or container was
  started. `server/routes/prompts.ts`, `dashboard.ts`, `geoSignals.ts`,
  `analytics.ts`, `migrations/`, and `client/` were not touched.
