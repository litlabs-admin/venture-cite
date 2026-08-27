# Scope — moving compute to Supabase

**Status:** scoping only. No code changed. Every number below is measured or read from the
repo, not recalled.

## The question

"Shift the backend to Supabase" is three independent moves, not one. They have very
different value and very different risk, and only one is worth doing soon. Scoping them
together is what makes the answer look hard.

| Move                                      | Verdict                                          | Size                         |
| ----------------------------------------- | ------------------------------------------------ | ---------------------------- |
| **A — scheduling → `pg_cron` + `pg_net`** | **Do it.** Fixes a live correctness bug          | ~1 migration + 1 config flip |
| **B — job compute → Edge Functions**      | **Don't.** Measured durations exceed the ceiling | large, negative return       |
| **C — data access → PostgREST**           | **Blocked.** Not by effort, by grant coverage    | gated behind F-10            |

---

## Current state (verified)

- Deploy target is **Render free tier** (`render.yaml`), a long-lived Node server. The
  Vercel migration was **reversed** — but `api/_bundle.js` is still on disk, contradicting
  render.yaml's claim that it was "verified absent 2026-07-31". Stale doc; harmless, worth
  deleting.
- Scheduled work is owned by **in-process `node-cron`** (`server/scheduler.ts`), gated by
  `resolveSchedulerMode()` in `server/lib/schedulerMode.ts`.
- All scheduled work already funnels through **one authenticated HTTP endpoint**,
  `POST /api/cron/daily-orchestrator` (`server/routes/cron.ts:315`), which runs **29 steps**
  against a wall-clock budget and authenticates with `CRON_SECRET`.
- Supabase side: `pg_cron` 1.6.4 and `pg_net` 0.20.0 are **available, not installed**.
  `supabase_vault` 0.3.1 **is** installed.
- Supabase is currently used for **Auth and Storage only** — zero `.from()` / `.rpc()` calls
  in `server/`.

---

## Move A — scheduling to `pg_cron` + `pg_net` ✅ recommended

### Why this is not a nice-to-have

Render's free plan **spins the service down after ~15 minutes with no inbound HTTP traffic**
(documented in `render.yaml`). The scheduler runs _inside that process_. When the service is
asleep, `node-cron` does not fire — and nothing records that it didn't.

The weekly report is scheduled `0 8 * * 0`. If nothing hits the service early Sunday morning,
that job silently does not run. Same for `account-purge` (`0 3 * * *`) and `brand-purge`
(`30 3 * * *`) — both scheduled when a low-traffic service is almost certainly asleep.

This is a correctness bug, and it is invisible: no error, no alert, just work that never
happened.

### Why it is small

The hard part is already built. The orchestrator is one authenticated endpoint with a budget
and per-step caps. `pg_cron` + `pg_net` do not need to understand any of it — they only have
to call it on a schedule, from something that is always on. Postgres is always on.

`schedulerMode.ts` already models this exact cutover and **refuses a half-configured state**:
setting one of `DISABLE_IN_PROCESS_SCHEDULER` / `EXTERNAL_CRON_ORCHESTRATOR_ENABLED` without
the other throws at boot. The seam was built for this and has never been used.

Side benefit: the inbound request wakes the Render service, so spin-down stops mattering for
scheduled work.

### Shape

1. Enable `pg_cron` and `pg_net`.
2. Store `CRON_SECRET` in `supabase_vault` — never inline in the cron command.
3. One `cron.schedule` calling `net.http_post` against the orchestrator, hourly.
4. Flip `DISABLE_IN_PROCESS_SCHEDULER=true` **and** `EXTERNAL_CRON_ORCHESTRATOR_ENABLED=true`
   together.

### What must be proven before the flip

- **Two steps are in-process only.** `STEP_CAPS_MS` names them: `tour-events-cleanup` and
  `detect-fact-scrape-failure`, with the comment _"Keep that scheduler active until an
  external trigger covers these steps. Otherwise tour_events grows without bound and the
  failure alert stops."_ **These must be added to the orchestrator before cutover, or the
  flip trades one silent gap for another.**
- `pg_net` is fire-and-forget: it does not retry, and its response lands in
  `net._http_response`. Failures must be surfaced, or this reintroduces exactly the silence
  it was meant to fix.
- One real end-to-end authenticated call, verified in `net._http_response`.

### Honest cost

Two schedulers exist during the transition, and mutual exclusion is enforced at boot rather
than at runtime — so a misconfigured deploy fails loudly instead of double-running. That is
the right failure mode, but it makes the flip a deploy-time event needing both variables set
together.

---

## Move B — job compute to Edge Functions ❌ not recommended

The measured durations rule this out. From `server/routes/cron.ts:62`, against the production
database:

| Step                        | Cap | **Actual**                   |
| --------------------------- | --- | ---------------------------- |
| `fact-reverification-batch` | 30s | **244s** — 8× over           |
| `v2-fact-sheet-refresh`     | 50s | **82s** for a _single_ brand |
| `auto-citation`             | 30s | **25+ min** observed         |

Against Edge Functions' ceiling — 400s wall clock paid, 150s free, and a **2s CPU budget per
request** — `auto-citation` does not fit under any plan, and `fact-reverification-batch`
already exceeds the free ceiling.

Two further blockers:

- **Runtime.** Edge Functions are Deno. The server depends on `pg`, `express`, `node-cron`,
  `@sentry/node`, `stripe`, `resend`, `openai`, and uses `node:async_hooks`. Deno's Node
  compat covers some of this, but not the in-process scheduler, and the 57,467 lines of
  `server/` assume a Node server.
- **The per-step caps are advisory.** A step that checks its clock only between work items
  sails past its cap — precisely why 244s happened against 30s. Moving to a platform with a
  _hard_ kill turns a soft overrun into a mid-job termination, and these jobs spend money on
  LLM calls before they die.

The deadline plumbing (79 references across 13 files) is real and was built for Vercel's
ceiling. It bounds work _between_ items; it does not make any single item short. Edge
Functions need the second property.

**Conclusion:** a large rewrite that makes reliability worse. The one thing people usually
want from it — "scheduled work that actually runs" — is delivered by Move A at a fraction of
the cost.

---

## Move C — data access to PostgREST ⛔ blocked, not scheduled

Blocked by grant coverage, already quantified in Task 9 / F-10:

- **12 of 72** public tables carry any grant to the restricted roles; **60 have none**.
- RLS policies cover the four route files going through `requestData` /
  `contentRequestData`. Everything else runs as the owner by design.
- Migration 0120 has just **revoked** `anon`/`authenticated` grants precisely because nothing
  should reach the Data API today.

Exposing tables to PostgREST before policy coverage exists would hand the Data API tables no
policy protects. The path forward is unchanged and unglamorous: grow the restricted path
route-by-route (`prompts.ts` and `dashboard.ts` first — they handle the most user-scoped
data), adding grants and policies per module. PostgREST is worth asking about once coverage
approaches complete.

---

## Recommendation

Do **Move A** as its own small branch, with the two in-process-only steps ported first. Treat
**B** as closed unless the job shapes change fundamentally. Treat **C** as gated behind the
F-10 route-by-route work, which has its own value independent of PostgREST.

The framing worth keeping: Supabase is your database and your auth. The useful question is
not "how much of the backend can move in", but "what is Postgres better at than a sleeping
Node process". Scheduling is the clear answer.
