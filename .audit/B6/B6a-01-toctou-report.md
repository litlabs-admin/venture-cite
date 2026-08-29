# B6a-01: non-atomic status check shadowing an atomic one

Target: `server/routes/content.ts`, `POST /api/articles/:id/generate` handler.

## Verification

### 1. The two 409 responses are byte-identical

Route-level check (now deleted), lines 246-252 before this change:

```ts
if (article.status !== "draft" && article.status !== "failed") {
  return res.status(409).json({
    success: false,
    error: `Cannot generate - article is in status '${article.status}'.`,
    code: "invalid_status",
  });
}
```

Atomic-result handling, lines 303-309 (unchanged, still present):

```ts
if (result.kind === "conflict") {
  return res.status(409).json({
    success: false,
    error: `Cannot generate - article is in status '${result.status}'.`,
    code: "invalid_status",
  });
}
```

Same status code (409), same `code` field (`"invalid_status"`), same message
template. `article.status` (route-level read) and `result.status` (value
returned by the Postgres function from its own read of the same row) are the
same field on the same row, so the interpolated string matches whenever both
checks observe the same status. Confirmed equivalent.

### 2. The atomic enqueue really validates status and returns a conflict result

`server/data/contentRequestJobRepository.ts:167-191` calls
`private.request_enqueue_content_generation` and parses its result with
`parseGenerationCommand` (lines 76-91), which maps a `"conflict"` row kind to
`{ kind: "conflict", status: row.article_status }`.

The Postgres function itself, `migrations/0106_content_request_generation_commands.sql:7-174`,
checks `article_row.status NOT IN ('draft', 'failed')` twice inside its own
transaction:

- Lines 72-75: an early check right after the ownership lookup, before any
  quota/brand work, returning `('conflict', NULL, article_row.status, NULL)`.
- Lines 126-129: a second check after re-reading the row `FOR UPDATE` (i.e.
  under a row lock), for the case where the status changed between the first
  read and the lock. This is the actually-atomic check; the first one is just
  an early exit for the common case.

So the enqueue path has its own correct, race-safe status validation, and it
surfaces the rejection as the same `"conflict"` shape the route already
translates into the 409/`invalid_status` response. Confirmed.

### 3. Nothing between the old check (line 246) and the enqueue call (line 286) depends on it

Read the full handler body between those two points. It:

- Parses `req.body` against `contentGenerationRequestSchema` (independent of
  article status).
- Returns 400s for bad `keywords`/`industry` (independent).
- Checks `OPENAI_API_KEY` / `usesFakeContentGenerationProvider()`
  (independent).
- Builds `GenerationPayload` from `article.brandId` and `article.id` only
  (independent of status).

Nothing reads `article.status` or branches on it in that span. Confirmed no
dependency.

All three checks passed, so the deletion is safe.

## What was deleted

`server/routes/content.ts`, the block:

```ts
if (article.status !== "draft" && article.status !== "failed") {
  return res.status(409).json({
    success: false,
    error: `Cannot generate - article is in status '${article.status}'.`,
    code: "invalid_status",
  });
}
```

(previously lines 246-252, immediately after the `article` existence check and
before `contentGenerationRequestSchema.safeParse`). No other route or file was
touched except the test below.

## Test

No existing test drove `POST /api/articles/:id/generate` far enough to reach
the atomic conflict branch (`result.kind === "conflict"` at line 296-301) -
the closest coverage was e2e specs (`tests/e2e/article-flow.spec.ts`,
`tests/e2e/content-generation-fake.spec.ts`) that don't target this status
race at all, and no unit test for this route existed.

Added `tests/unit/contentGenerateStatusConflict.test.ts`, modeled on the
existing `tests/unit/contentCancel.test.ts` mocking pattern (auth, ownership,
storage, `contentRequestData`, db, etc., plus a `routesShared` partial mock to
bypass the real rate limiter, which needs a live HTTP request). It stubs
`content.articles.get` to return an article with `status: "generating"` and
`jobs.enqueueGeneration` to resolve `{ kind: "conflict", status: "generating" }`
(i.e. it asserts the _atomic_ path alone produces the 409, not a route-level
pre-check), then asserts:

- `status === 409`
- `body` equals `{ success: false, error: "Cannot generate - article is in status 'generating'.", code: "invalid_status" }`
- `enqueueGeneration` was actually called (proving the response came from the
  atomic path, not a short-circuit before it)

Before the deletion, this test failed as expected:

```
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
```

because the old route-level check short-circuited at the article read and
never reached `enqueueGeneration` - the exact shadowing behavior described in
the task. After deleting the block, the same test passes.

### Output after the fix

```
$ npx vitest run tests/unit/contentGenerateStatusConflict.test.ts tests/unit/contentCancel.test.ts \
    tests/unit/contentRequestData.test.ts tests/unit/contentCostOutboxAdapter.test.ts \
    tests/unit/contentCostOutboxDrain.test.ts tests/unit/contentGenerationProvider.test.ts \
    tests/unit/contentGenerationResponses.test.ts tests/unit/contentJobCompletionTransaction.test.ts \
    tests/unit/jobDebounce.test.ts tests/unit/jobLease.test.ts

 Test Files  10 passed (10)
      Tests  55 passed (55)
```

Also ran (all test files whose names mention "content" or "job"):

```
$ npx vitest run tests/integration/contentRequestRls.test.ts
 Test Files  1 skipped (1)
      Tests  24 skipped (24)
(skips silently without TEST_DATABASE_URL, as documented in AGENTS.md)

$ npx vitest run tests/unit/pageContentAnalysis.test.ts tests/unit/trackedContentMatcher.test.ts \
    tests/integration/localContentCostIdempotency.test.ts tests/unit/llmJobsOutbox.test.ts \
    tests/unit/openAiLlmJobAdapter.test.ts tests/unit/perceptionProbes.test.ts tests/unit/factSheetRobots.test.ts

 Test Files  6 passed | 1 skipped (7)
      Tests  67 passed | 1 skipped (68)
```

No full-suite run was performed, per instructions.
