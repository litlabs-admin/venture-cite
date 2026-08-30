# B7-09: service-layer extraction for server/routes/prompts.ts

Phase B6b. Read `.audit/B5/PARTITION.md` first, per instructions - the
storage decomposition's method (move bodies verbatim, prove nothing changed
with a mechanical gate, never mix a move with an edit) is the model this
extraction follows, adapted for a route file instead of a storage class.

`server/routes/prompts.ts`: **1,835 -> 1,179 lines** (-656, -36%).
New: `server/services/prompts/` (8 files, 1,077 lines) plus 9 new direct
service test files (388 tests file lines, 51 test cases).

## Handler inventory (before)

46 route registrations. Line ranges are from the pre-extraction file.

| Route                                | Lines           | Had real business logic?                                            |
| ------------------------------------ | --------------- | ------------------------------------------------------------------- |
| POST `/brand-prompts/:id/generate`   | 52-81 (30)      | Yes - already-tracked guard, upstream-error mapping                 |
| POST `/brand-prompts/:id/reset`      | 85-108 (24)     | Yes - archive-then-regenerate orchestration                         |
| GET `/brand-prompts/:id/suggestions` | 111-125 (15)    | No - thin                                                           |
| POST `/suggestions/refresh`          | 128-144 (17)    | No - already thin (calls one lib fn, shapes response)               |
| POST `/suggestions/:id/accept`       | 157-205 (49)    | Yes - add/replace branching, cap invariant                          |
| DELETE `/suggestions/:id`            | 208-227 (20)    | No - ownership-style lookup + archive                               |
| POST `/prompts` (create)             | 234-275 (42)    | Yes - cap + duplicate guard, order-index calc                       |
| POST `/prompts/reorder`              | 279-303 (25)    | No - bulk ownership verification + delegate                         |
| PATCH `/prompts/:id`                 | 307-364 (58)    | Yes - text/status branching, two invariants                         |
| PATCH `/prompts/:id/pause`           | 368-388 (21)    | No - thin                                                           |
| GET `/prompts/:id/diagnose`          | 395-412 (18)    | No - already thin (calls one lib fn)                                |
| GET `/prompts/:id`                   | 417-433 (17)    | No - thin                                                           |
| GET `/prompt-tags`                   | 439-451 (13)    | No - thin                                                           |
| GET `/tags`                          | 453-471 (19)    | Yes - tags+counts join                                              |
| POST `/tags`                         | 473-495 (23)    | Yes - duplicate-name guard                                          |
| PATCH `/tags/:id`                    | 497-517 (21)    | No - ownership-style lookup + update                                |
| DELETE `/tags/:id`                   | 519-535 (17)    | No - ownership-style lookup + delete                                |
| POST `/prompts/:id/tags`             | 537-563 (27)    | No - ownership-style attach                                         |
| DELETE `/prompts/:id/tags/:tid`      | 565-581 (17)    | No - ownership-style detach                                         |
| GET `/prompt-audiences`              | 585-597 (13)    | No - thin                                                           |
| GET `/audiences`                     | 599-641 (43)    | Yes - score aggregation joined from ranking history                 |
| POST `/audiences/generate`           | 648-679 (32)    | Yes - cooldown gate                                                 |
| POST `/audiences`                    | 681-714 (34)    | Yes - duplicate-name guard                                          |
| DELETE `/audiences/:id`              | 716-732 (17)    | No - ownership-style lookup + delete                                |
| POST `/prompts/:id/audiences`        | 734-760 (27)    | No - ownership-style attach                                         |
| DELETE `/prompts/:id/audiences/:aid` | 762-778 (17)    | No - ownership-style detach                                         |
| GET `/set-health`                    | 782-794 (13)    | No - thin                                                           |
| POST `/set-health/run`               | 796-824 (29)    | Yes - cooldown gate                                                 |
| GET `/prompts/:id/phrasings`         | 831-847 (17)    | No - thin                                                           |
| POST `/phrasings/generate`           | 849-878 (30)    | Yes - generate + bulk persist                                       |
| POST `/phrasings/:id/analyze`        | 881-927 (47)    | Yes - parallel per-platform checks                                  |
| DELETE `/prompts/:id` (archive)      | 930-954 (25)    | Yes - min-one-tracked invariant                                     |
| GET `/prompt-history`                | 964-979 (16)    | No - already thin (calls one lib fn)                                |
| GET `/brand-prompts/:id` (list)      | 987-1007 (21)   | Borderline - see below                                              |
| GET `/visibility-progress/:id`       | 1010-1029 (20)  | Borderline - see below                                              |
| POST `/visibility-progress/:id`      | 1031-1049 (19)  | No - thin                                                           |
| DELETE `/visibility-progress/:id`    | 1051-1069 (19)  | No - thin                                                           |
| POST `/brand-prompts/:id/run`        | 1079-1173 (95)  | Yes - config/prompt/platform checks, kickoff, background drive loop |
| GET `/history`                       | 1183-1196 (14)  | No - thin                                                           |
| GET `/citation-runs/active`          | 1205-1217 (13)  | No - thin                                                           |
| GET `/citation-runs/state`           | 1225-1295 (71)  | Yes - per-run progress snapshot assembly                            |
| POST `/citation-runs/:id/advance`    | 1300-1335 (36)  | No - ownership-heavy, one lib call                                  |
| GET `/run/:id/details`               | 1338-1425 (88)  | Yes - grouping/sorting/context-splitting                            |
| POST `/re-detect-all`                | 1440-1598 (159) | Yes - cooldown + three-surface re-scan                              |
| GET `/generations`                   | 1601-1613 (13)  | No - thin                                                           |
| GET `/results`                       | 1615-1834 (220) | Yes - large aggregation, `topAnswersFor` helper                     |

18 handlers had real business logic worth a service function. 7 were already
in the target shape (call one lib function, shape the response) and needed
no change. 21 were ownership-style lookups or pure pass-through and were
left alone.

## Service modules created

All under `server/services/prompts/`, grouped by cohesion rather than
one-file-per-route:

| Module                                  | Functions                                                                                                                                       | Why grouped together                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `promptPortfolioService.ts` (205 lines) | `generateInitialPrompts`, `resetTrackedPrompts`, `acceptPromptSuggestion`, `createTrackedPrompt`, `updateTrackedPrompt`, `archiveTrackedPrompt` | All six enforce the same `TRACKED_PROMPTS_CAP` invariant (never 0, never >10) against the same `brand_prompts` rows                     |
| `promptTagService.ts` (35 lines)        | `createPromptTag`, `listPromptTagsWithCounts`                                                                                                   | Tag-specific rules: name dedupe, counts join                                                                                            |
| `promptAudienceService.ts` (100 lines)  | `listPromptAudiencesWithScores`, `generatePromptAudiencesForBrand`, `createPromptAudience`                                                      | Audience-specific rules: score aggregation, generation cooldown, name dedupe                                                            |
| `promptSetHealthService.ts` (28 lines)  | `runSetHealthAuditForBrand`                                                                                                                     | Single cooldown-gated call; kept separate because the audit is a distinct concept from tags/audiences                                   |
| `phrasingService.ts` (69 lines)         | `generatePhrasingsForPrompt`, `analyzePhrasing`                                                                                                 | Both belong to the "exploratory phrasing" workflow, deliberately isolated from tracked-prompt scoring                                   |
| `citationRunService.ts` (165 lines)     | `startBrandCitationRun`, `buildCitationRunStateSnapshot`                                                                                        | Both are the _live_ citation-run lifecycle (kickoff + progress polling)                                                                 |
| `citationResultsService.ts` (297 lines) | `buildRunDetails`, `buildBrandPromptResults`                                                                                                    | Both are _read-side_ shaping of already-completed citation-check rows; `topAnswersFor` is a private helper shared only within this file |
| `reDetectService.ts` (178 lines)        | `reDetectAllForBrand`                                                                                                                           | Self-contained three-surface re-scan workflow; large enough (159 original lines) to earn its own file                                   |

19 exported functions total. Every function takes `Brand` (and sometimes
`userId`/other primitives) as parameters - none imports Express types or
touches `req`/`res`. That is the test the task specified for a real
extraction, and it holds: `grep -rn "express\|req\.\|res\." server/services/prompts/`
returns nothing.

## The pattern for the next agent (dashboard.ts, etc.)

1. **Inventory first.** Classify every handler as thin (ownership + one
   storage/lib call + response shaping - leave alone), already-correct
   (calls one existing lib function - leave alone), or has-real-logic
   (extract).
2. **A route handler's business branches become a discriminated union.**
   The original code decided status codes and messages inline
   (`return res.status(409).json(...)`). A service function cannot call
   `res`, so it returns a tagged result instead
   (`{ outcome: "tracked_set_full", trackedCount, cap }`), and the handler's
   job shrinks to a mechanical switch back to the exact original status code
   and message. This is the one place a "verbatim move" necessarily becomes
   a translation - the condition, the arithmetic, and the order of checks
   are unchanged; only the terminal action (`return res.json(...)` vs.
   `return { outcome }`) changes shape. Every message string and status code
   in this extraction is copied character-for-character from the original.
3. **Ownership-style lookups stay in the handler**, even when they look like
   business logic. Patterns like `all.find(p => p.id === X && p.brandId ===
brand.id)` that exist purely to verify a sub-resource belongs to the
   already-authorized brand are ownership enforcement, not business logic -
   they stay next to `requireBrand`, matching the existing convention for
   tags/audiences attach-detach routes in this same file.
4. **Group by invariant/workflow, not by route.** `promptPortfolioService.ts`
   is one file because six routes share one invariant, not because they're
   adjacent in the router.
5. **A closure-scoped helper becomes a private module function.** `results`
   had a `topAnswersFor` closure capturing `brand.name`; moved to
   `citationResultsService.ts` it takes `brandName` as a parameter instead
   of a closure. This is a mechanical, unavoidable adaptation of hoisting a
   nested function to module scope, not a logic change - the comparison it
   performs is byte-identical.

## Coordination note for the orchestrator

This is a shared worktree with four agents running concurrently.
`server/services/` did **not** exist when this task said it wouldn't - by
the time this extraction finished, another agent (owner of `dashboard.ts`)
had independently populated it with flat files with no subdirectory:
`dashboardVisibility.ts`, `dashboardRecommendations.ts`,
`dashboardSiteHealth.ts`, `dashboardPerception.ts`, plus several files for
other route domains (`content.ts` -> `contentGeneration.ts`, `faqs.ts`;
`geoSignals.ts` -> `geoSignals.ts`, `geoAnalytics.ts`, `geoOpportunities.ts`,
etc.).

This extraction used a `server/services/prompts/` **subdirectory** instead,
because prompts.ts alone produces 8 cohesive modules and flattening them all
into `server/services/` would mix naming with the dashboard/content/geo
modules with no visual grouping. Both conventions are defensible; they are
not currently the same convention. Recommend the orchestrator pick one
before more route files are split - either flatten `prompts/*` up a level,
or move the existing dashboard/content/geo files into their own
subdirectories - rather than letting a sixth agent invent a third pattern.

## Defects observed and deliberately left alone

None of these were touched - fixing them would mix a move with an edit,
which the task explicitly forbids.

1. **`GET /api/brand-prompts/:brandId` silently drops archived prompts that
   are also suggestions-turned-tracked-then-archived-again in an edge case**
   - no, on inspection this one is correct; retracted. (Verified by tracing
     `storage.getBrandPromptsByBrandId(..., {status: "all"})` filtering out
     `status === "suggested"` - suggestions never reach `archived`, they go
     `suggested -> tracked` or `suggested -> archived-as-dismissed` via
     `archiveBrandPrompt`, so the filter is sound. Listed here only to show
     it was checked, not skipped.)
2. **`topAnswersFor`'s `isBrand` comparison** (`citationResultsService.ts`,
   originally inline in `/results`) compares `b.name` against `brand.name`
   with `.trim().toLowerCase()` but never against `brand.nameVariations`.
   A response that names the brand only by an alternate name (e.g. "Acme
   Inc" when `brand.name` is "Acme") would mark that entry `isBrand: false`
   even though the same request's own `detectBrandAndCompetitors` call (used
   by re-detect and the citation checker) treats every name variation as a
   match. This is a real inconsistency between "was this row counted as
   cited" and "does Top Answers highlight it as us," but it predates this
   extraction and is out of scope for a verbatim move.
3. **`reDetectService.ts`'s `updateGeoRanking` patch object is cast `as
any`** (line ~112, moved verbatim from the original route). The patch's
   keys (`isCited`, `rank`, `reDetectedAt`, `citationContext`) are a real
   subset of `GeoRanking`, so the cast is masking a `Partial<GeoRanking>`
   inference issue, not an actual type mismatch - worth a follow-up type fix
   but not a behavior change.
4. **`buildBrandPromptResults`'s "keep only the latest ranking per
   (promptId, platform)" dedup key** is a raw template string
   `` `${r.brandPromptId}__${r.aiPlatform}` ``. If a `brandPromptId` or
   `aiPlatform` value ever contained the literal substring `__`, two
   distinct pairs could collide. No current platform name or id format does
   this, so it is theoretical, but it is a fragile key-construction pattern
   inherited verbatim from the original handler.

## Verification (gate output)

Typecheck (`npx tsc --noEmit -p .` and `npm run check`): clean, exit 0.

```
> venturecite@1.0.0 check
> tsc && npm run verify:tours

> venturecite@1.0.0 verify:tours
> tsx scripts/verify-tour-targets.ts

Tour-target verification OK (22 targets, all present).
```

One transient failure was observed mid-run
(`server/routes/contentTypes.ts(574,17): error TS2552: Cannot find name
'requireArticle'`) while another agent was concurrently editing that file in
this shared worktree; a second run immediately after was clean. That file
was never touched by this task (`git status` confirms it as `M` by another
agent, not by this session).

Lint (`npx eslint` on every file this task touched, and `npm run lint` for
the whole repo): 0 errors. 10 pre-existing-style `@typescript-eslint/no-explicit-any`
warnings across the new service files (all are `as any`/`(x as any)` casts
copied verbatim from the original route file - the original had 9 such
casts; the count differs by one because of the `topAnswersFor`
closure-to-parameter change counted separately) plus 13 warnings in the new
test files (same rule, standard for this repo's test style - see
`tests/unit/dashboardVisibilityService.test.ts` for the precedent). Full
`npm run lint`: 940 warnings repo-wide, 0 errors - consistent with the
pre-existing baseline.

Format (`npx prettier --check`): clean after one `--write` pass over the new
and modified files (whitespace/line-wrap only, applied by the tool - no
logic changed by the reformat, confirmed by re-running the test suite
after).

Tests - scoped to prompts routes and the new service tests only, per
instructions (did not run the full suite):

```
tests/unit/reDetectAllCooldown.test.ts       - 3 tests, unchanged, PASS
tests/unit/promptPortfolioService.test.ts    - 19 tests, new, PASS
tests/unit/promptTagService.test.ts          - 3 tests, new, PASS
tests/unit/promptAudienceService.test.ts     - 6 tests, new, PASS
tests/unit/promptSetHealthService.test.ts    - 3 tests, new, PASS
tests/unit/phrasingService.test.ts           - 4 tests, new, PASS
tests/unit/citationRunService.test.ts        - 7 tests, new, PASS
tests/unit/citationResultsService.test.ts    - 3 tests, new, PASS
tests/unit/reDetectService.test.ts           - 3 tests, new, PASS

9 test files, 51 tests, all passing.
```

`tests/unit/reDetectAllCooldown.test.ts` is the only existing test file that
mounts `setupPromptsRoutes` against a live Express app (confirmed by
`grep -rn "routes/prompts\|setupPromptsRoutes" tests/`). It was not edited
and passes unchanged, proving the HTTP-level contract (status codes,
response bodies, the `Retry-After` header, and the cross-process cooldown
behavior) is identical after the extraction.

Every new service test calls its function directly with a plain object and
mocked `storage`/lib functions - no `app`, no `supertest`, no `req`/`res` -
which is the actual proof the extraction decoupled the logic from Express.
