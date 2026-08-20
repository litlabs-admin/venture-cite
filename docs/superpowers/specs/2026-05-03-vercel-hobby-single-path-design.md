# Design: Vercel Hobby — Single-Path Architecture

**Date:** 2026-05-03
**Status:** Approved (pending user review of this doc)
**Supersedes:** Parts of `~/.claude/plans/tidy-wandering-gem.md` (Vercel migration plan)

## Context

VentureCite was migrated to Vercel Hobby in earlier work (`tidy-wandering-gem.md`). That migration achieved a working deployment but introduced multi-layer fall-through behavior — a "common case / slow case / failure case" pattern where different code paths handle different scenarios. That pattern produces:

- Inconsistent UX (streaming for short generations, polling for long ones, error toasts for what the platform can't fit)
- Hidden systematic failures (long generations silently truncated when a Chat Completions stream hits the 60s function ceiling)
- Multiple code paths to maintain, debug, and test

This design replaces that with **one path per feature, one architectural shape across features, and no upfront task refusals based on length**. Every accepted task completes; UX is consistent within each feature regardless of input size.

The migration constraints are unchanged from the prior work:
- Vercel Hobby (60s max function duration, 1 cron/day, no background workers, no persistent in-memory state)
- No external services (no Inngest, QStash, GitHub Actions, cron-job.org, etc.)
- Postgres on Supabase (existing)
- All quality gates pass: tsc, lint, vitest, build

## Architecture overview

Every async operation in the app follows the same shape:

```
1. Client POSTs to a kickoff endpoint  →  returns { resourceId } in <1s
2. Client polls GET /state             →  reads progress / final result
3. Client POSTs to /advance            →  drives one slice of work (50s budget)
4. Repeat 2 + 3 until /state.done = true
5. Daily cron drains resources with stale advance locks (orphans)
6. Lazy-eval on auth middleware fires /advance via waitUntil() for active users
```

Backend properties:
- Each resource has a row with `status`, `last_advance_started_at`, and progress fields.
- `/advance` claims the row via the lock column (already implemented for content jobs); concurrent calls see "busy" and bail.
- All work is **idempotent**: any slice can be retried; resume mode reads existing partial state and skips done units.
- Daily cron (existing 06:00 UTC) calls the same `/advance` code path internally.

This is the only path. There is no streaming endpoint, no fall-through Layer-2, no upfront pre-flight refusal based on size.

## Per-feature mechanisms

### Content generation

**The work runs on OpenAI's infrastructure, not ours.** This is what makes content generation possible without a 60s ceiling.

**`/advance` body:**
```ts
async function advanceContentJob(jobId, deadlineMs) {
  const job = await getJob(jobId);

  if (!job.openaiResponseId) {
    // First /advance call: kick off the OpenAI background response.
    const response = await openai.responses.create({
      model: job.model,                          // gpt-4o-mini default
      input: buildPrompt(job.requestPayload),
      background: true,                          // run on OpenAI's infra
      store: true,                               // retrievable later
    });
    await updateJob(jobId, {
      openaiResponseId: response.id,
      status: "running",
    });
    return { done: false, status: "running" };
  }

  // Subsequent /advance calls: check OpenAI for completion.
  const response = await openai.responses.retrieve(job.openaiResponseId);

  if (response.status === "completed") {
    const content = extractText(response);
    await finalizeArticle(jobId, content);       // setArticleReady, etc.
    return { done: true, status: "succeeded" };
  }
  if (response.status === "failed" || response.status === "cancelled") {
    await markJobFailed(jobId, response.error);
    return { done: true, status: "failed" };
  }
  // Still in_progress / queued — client polls again.
  return { done: false, status: "running" };
}
```

**Properties:**
- Single LLM call per article (one Responses API call, regardless of length).
- No continuation prompts in the codebase.
- No 60s ceiling on the actual generation (OpenAI runs Responses up to its own internal limit, ~10 minutes).
- Browser disconnect, tab close, refresh — all irrelevant to whether the generation completes.
- All article sizes / models work identically; no upfront refusal.

**UX (replacing token streaming):**
- Phase indicators driven by elapsed time on the client: "Brainstorming themes" → "Drafting outline" → "Writing sections" → "Polishing." Smooth UI animations, not tied to OpenAI's internal state.
- Skeleton outline (just H2 headings) shown immediately. Generated cheaply via a separate fast call upfront if needed; or a placeholder skeleton from the article's keywords.
- Final reveal: when /state returns `done:true`, full article fades in over the skeleton.
- This is the same pattern Notion AI, Cursor, and similar production AI products use.

**Schema additions:** Migration adds `openai_response_id TEXT` column to `content_generation_jobs`. The existing `stream_buffer` column stays for backward compatibility with prior in-flight jobs but is no longer written.

**`/state` response shape changes:** The current shape `{ status, delta, contentLength, errorMessage, done }` (streamBuffer-tail-based) becomes `{ status, done, errorMessage, phase?: string, elapsedMs?: number }`. The phase and elapsedMs fields support client-side phase animations. The article's final content is fetched from `articles.content` via the existing GET `/api/articles/:id` once `done:true` arrives — the /state endpoint does not return the body itself, keeping it cheap to poll at 1s intervals.

**Removed code:** The `runJobToCompletionOrDeadline` function (continuation logic, mid-stream deadline aborts) is deleted. The watchdog timers, `existingBuffer` continuation prompt, and `streamBuffer` token-batching code go away. `streamBuffer` column stays in the schema but isn't written to during generation (legacy data only).

### Citation runs

**Unchanged.** Existing kickoff + /advance pattern (built in prior work). No continuation issue because each (prompt, platform) pair is an independent OpenAI call. Multi-/advance for runs that exceed one slice; resume mode (`resume: true`) skips pairs already in `geo_rankings`.

The only edit: remove the existing pre-flight cap that refuses runs > 150 pairs. Large runs work via multi-slice naturally.

### Onboarding autopilot

**Unchanged.** Existing kickoff + /advance pattern. Phases (`generating_prompts`, `running_citations`) are tracked in `brands.autopilot_*`. Resume happens via inspecting current status.

The only edit: remove the existing pre-flight scope cap. The autopilot has more pairs to do — that's fine; client polls /advance until done.

### Workflows

**Unchanged.** Existing kickoff + /advance pattern. Steps are independent units. Each /advance drives steps until 50s budget.

### Inactive-user scheduling

**Daily cron at 06:00 UTC** (existing) is the only mechanism for users not actively in the app. UI labels affected features:

```
Auto-citation
   Frequency: Weekly (Mondays)
   ⓘ On the free plan, scheduled jobs run once per day around 06:00 UTC.
     For exact-time scheduling, upgrade to Pro.
```

**Lazy-eval augmentation** (existing): on every authenticated request, `waitUntil(maybeFireScheduledWorkForUser(userId))` checks if anything is overdue and fires it via the same /advance path. Active users get earlier service; inactive users wait for the cron floor.

This is not a fallback — it's the same /advance code path, just triggered by a request instead of by the cron. One mechanism, two triggers.

## Idempotency contract

The single architecture relies on **idempotent /advance for every resource**:

- Resource state in DB is the source of truth.
- /advance claims via `last_advance_started_at` row lock; concurrent calls see "busy".
- Each /advance is safe to retry: it inspects current state and resumes from there.
- For content gen: the `openai_response_id` makes /advance a no-op state-poll after the first call.
- For citation runs: `resume: true` reads existing rankings.
- For onboarding: phase status drives which sub-step runs.
- For workflows: step index + status.

This means the cron drain, lazy-eval tick, and explicit client polls **all call the same /advance** without coordination problems.

## Edge case behavior — uniform per case

| Case | Behavior across all features |
|---|---|
| Browser disconnect mid-task | Resource state in DB, not on the wire. Refresh shows current state. |
| Two tabs open same resource | Row lock; second tab sees `busy:true`, both poll /state. |
| Network drops between polls | Polling resumes when network returns; nothing in DB lost. |
| User abandons forever | Daily cron drain at 06:00 UTC picks up. If still incomplete next day, orphan reconciler marks failed. |
| OpenAI 5xx | Resource marked failed in /advance; UI shows Retry. |
| Vercel cold start during /advance | First call may take ~2s extra; no functional impact. |
| Vercel platform incident | Resources stay in `running`; reconciler at 5min cleans zombies. |
| Function timeout mid-/advance | Slice ends gracefully at deadline; client's next /advance picks up. |

Every case has one behavior. No "Layer 1 fails so Layer 2 takes over" branches.

## Critical files

### New
- `migrations/0045_content_job_openai_response.sql` — adds `openai_response_id TEXT` column
- (Schema-side) Drizzle field on `contentGenerationJobs`

### Modified
- [server/contentGenerationWorker.ts](../../../server/contentGenerationWorker.ts) — replace `runJobToCompletionOrDeadline` with the Responses-API-based slice. Delete continuation prompt logic, watchdog timers, token batching.
- [server/routes/content.ts](../../../server/routes/content.ts) — `/advance` route stays; adapt response shape if needed.
- [client/src/pages/content.tsx](../../../client/src/pages/content.tsx) — replace token-buffer streaming UI with phase-based progress + skeleton + reveal.
- [server/routes/prompts.ts](../../../server/routes/prompts.ts) — remove pre-flight 150-pair cap.
- [server/routes/onboarding.ts](../../../server/routes/onboarding.ts) — remove pre-flight scope cap.
- [client/src/pages/citations.tsx](../../../client/src/pages/citations.tsx) — verify polling already in place (it is, from prior work).
- (UI labels) Touchpoints in schedule-related pages — add the "free plan: once per day" footnote.

### Reused (no change)
- [server/routes/cron.ts](../../../server/routes/cron.ts) — daily orchestrator already deadline-bound; drain steps already exist for content jobs and citation runs.
- [server/lib/workflowEngine.ts](../../../server/lib/workflowEngine.ts) — already drives content jobs via slice from advanceRun.
- [server/db.ts](../../../server/db.ts) — Vercel-aware pool config stays.
- [server/lib/rateLimitBuckets.ts](../../../server/lib/rateLimitBuckets.ts) — Postgres-backed; unchanged.
- All migrations through `0044_content_job_advance.sql` — unchanged.
- All authentication, CORS, request-ID, webhook handlers — unchanged.

## Reused patterns

- **Pollable resource + /advance**: established in prior work for content jobs and citation runs. This design extends the same pattern uniformly across features and removes streaming as an alternative.
- **Daily cron orchestrator with budget-aware step scheduling** (`server/routes/cron.ts`'s `Orchestrator` class): unchanged.
- **Lazy-eval auth-tick** (`maybeTickActiveRunsForUser` in workflowEngine): pattern stays; will be extended with `waitUntil()` for non-blocking execution.

## Verification

### Pre-merge (local)
```
npm run check    # tsc strict — must pass
npm run lint     # zero errors
npm test         # all green; new tests for Responses-API content path
npm run build    # vite + esbuild succeed
```

New tests:
- `tests/unit/contentGenerationResponses.test.ts` — mocks `openai.responses` and verifies /advance creates response on first call, polls retrieve on subsequent calls, finalizes on `completed`, fails on `failed`.
- Update existing `tests/unit/cronOrchestrator.test.ts` — drain step exercises Responses-based runArticleSlice.

### Post-deploy (Vercel preview)
1. Generate a 1500-word article on gpt-4o-mini → completes in ~17-30s, phase UI animates, skeleton fills, article renders. ✓
2. Generate a 4000-word article on gpt-4o → completes in ~80-120s, browser sees phase UI throughout, no truncation. ✓
3. Close tab during a 60-second-plus generation → reopen 2 minutes later, /state shows completed article. ✓
4. Trigger Stripe webhook → still works (raw body parsing unchanged). ✓
5. Trigger daily cron via Vercel dashboard → all steps log success; drain step picks up any orphaned content jobs / citation runs. ✓

### Production (24h watch)
- Sentry: zero new error categories
- Function P95 latency: <2s (cold start ceiling)
- Article completion rate: >99% (failure only on OpenAI errors, not function timeout)
- Daily cron at 06:00 UTC fires; per-step status all `ok` or graceful skip-due-to-budget

## Out of scope

- Token-by-token streaming UI for content generation (explicitly rejected by user; phase UX replaces it)
- Sub-daily scheduling for inactive users (impossible on Hobby; UI labels honestly instead)
- Pro-tier features (5-min functions, hourly cron) — separate decision
- Edge runtime exploration (limited capabilities for our needs)
- Replacing existing rate-limit / migration / auth machinery (all kept)

## Effort estimate

| Phase | Time |
|---|---|
| Migration `0045_content_job_openai_response.sql` + schema | 30 min |
| Refactor `runArticleSlice` for Responses API | 4 hours |
| Update `/advance` route + tests | 2 hours |
| Replace client streaming UI with phase + skeleton | 4 hours |
| Remove pre-flight caps from prompts.ts + onboarding.ts | 30 min |
| UI label updates for scheduled-features | 30 min |
| Lazy-eval `waitUntil()` enhancement | 1 hour |
| Test additions | 2 hours |
| Verification + smoke + cleanup | 2 hours |
| **Total** | **~2 days of focused work** |
