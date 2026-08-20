# Content flow (Wave 7 — unified articles model)

This page documents how content generation works end-to-end after the Wave 7
rebuild. It supersedes the legacy three-table model
(`content_drafts` + `content_generation_jobs` + `articles`).

## Lifecycle

Every piece of user content is a single row in the `articles` table with one
of four statuses:

| Status       | Meaning |
|--------------|---------|
| `draft`      | Form being filled. No content yet. The Content page renders the form for these. |
| `generating` | A worker is filling in the content. SSE/poll surfaces live progress. |
| `ready`      | Content present. The Articles page lists these by default. |
| `failed`     | Last generation attempt failed. The Content page shows the form pre-filled with the user's last-attempted values plus an error banner. |

Transitions:

```
draft ─(POST /api/articles/:id/generate)→ generating ─(worker success)→ ready
                                       └─(worker failure)→ failed
                                       └─(user cancel)──→ draft

ready ─(POST /api/articles/:id/improve)→ ready (with a new revision row)
ready ─(restore)──────────────────────→ ready (with a manual_edit revision)
```

`articles.jobId` is set while in `generating` and cleared on terminal states.

## Streaming + poll fallback

The worker streams OpenAI tokens directly into
`content_generation_jobs.stream_buffer` (a single text column, atomically
appended via `appendStreamBuffer`). The client subscribes via:

- **SSE** (`GET /api/content-jobs/:jobId/stream`) while the tab is visible —
  tails the buffer at 250ms ticks and emits `event: delta` for each new
  chunk. Closes on terminal status.
- **Polling** (`GET /api/content-jobs/:jobId`) at 4s while the tab is hidden
  or `EventSource` isn't available. Same shape, just status-only — content
  is read from `articles.content` once `status='ready'`.

Both code paths converge on `articles` once the job terminates. Tab refresh
mid-generation re-reads the current `stream_buffer` (initial replay) and
re-subscribes — no UI gap.

## Quota refund classification

Failed jobs carry `errorKind` so the refund helper knows whether to give a
quota slot back:

| `errorKind`     | Refundable | Why |
|-----------------|------------|-----|
| `cancelled`     | yes        | User explicitly bailed |
| `circuit`       | yes        | Provider circuit breaker tripped |
| `openai_429`    | yes        | OpenAI rate-limited us — not the user's fault |
| `openai_5xx`    | yes        | Provider error |
| `timeout`       | yes        | Network/process timeout |
| `budget`        | no         | User actually hit their daily token cap |
| `invalid_input` | no         | User sent broken keywords/industry |
| `unknown`       | no         | Conservative default |

`refundArticleQuota(userId, jobId, errorKind)` is idempotent — it gates on
`content_generation_jobs.refunded_at IS NULL` and bumps it to `now()` once
the refund is applied. Boot-recovery runs the same path for jobs left in
`running` state past `STUCK_JOB_RECOVERY_MINUTES`.

## Auto-Improve + revisions

`POST /api/articles/:id/improve` runs **one** rewrite pass against the
current content (no 3-pass loop, no human-score gating). Before the rewrite
overwrites `articles.content`, the previous content is recorded as a
`manual_edit` revision; after the rewrite, the new content is recorded as
an `auto_improve` revision. Both are required so the diff viewer can show
before/after and Restore can pull either side back.

Restore (`POST /api/articles/:id/revisions/:revId/restore`) overwrites the
article content with the chosen revision and records a new `manual_edit`
revision pointing at the restored state. Optimistic-locking via
`expectedVersion` is required on every write — 409 surfaces a real conflict
modal in the client (Discard local / Force-save).

## Slug — gone

There is no longer a `slug` column on `articles`. Articles are referenced
by id only. The `/article/:slug` public route was removed. Sitemap no
longer emits article URLs. Externally-hosted articles use
`articles.externalUrl`, supplied by the user.

## Where the code lives

| Concern | File |
|---|---|
| Schema | [shared/schema.ts](../shared/schema.ts) (`articles`, `articleRevisions`, `contentGenerationJobs`) |
| Migration | [migrations/0033_content_unification.sql](../migrations/0033_content_unification.sql) |
| DAOs | [server/databaseStorage.ts](../server/databaseStorage.ts) (`createDraftArticle`, `setArticleReady`, `appendStreamBuffer`, `createRevision`, `listRevisions`, …) |
| Generation routes | [server/routes/content.ts](../server/routes/content.ts) |
| Articles routes | [server/routes/articles.ts](../server/routes/articles.ts) |
| Worker | [server/contentGenerationWorker.ts](../server/contentGenerationWorker.ts) |
| Refund helper | [server/lib/usageLimit.ts](../server/lib/usageLimit.ts) (`refundArticleQuota`) |
| Content page | [client/src/pages/content.tsx](../client/src/pages/content.tsx) |
| Articles page | [client/src/pages/articles.tsx](../client/src/pages/articles.tsx) |
| Markdown editor | [client/src/components/content/MarkdownEditor.tsx](../client/src/components/content/MarkdownEditor.tsx) |
| Diff viewer | [client/src/components/articles/RevisionDiff.tsx](../client/src/components/articles/RevisionDiff.tsx) |
| Auto-save hook | [client/src/hooks/useArticleAutoSave.ts](../client/src/hooks/useArticleAutoSave.ts) |
