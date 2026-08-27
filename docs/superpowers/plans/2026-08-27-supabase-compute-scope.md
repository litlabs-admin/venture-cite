# Scope — moving compute to Supabase

**Status:** scoping only. No code changed.

> **Supersedes the first draft of this file.** That draft argued against Edge Functions on
> the grounds that measured job durations (244s, 25+ min) exceed the platform ceiling. That
> argument is wrong, and it had already been retracted by the boundary analysis before this
> file was written. Those durations are **not units of work** — they are serial loops.
> Verified: `server/lib/factAgent/v2/reverifyFact.ts:348` is `for (const row of stale)`.
> The 244s is 20 sequential facts, each one fetch plus one LLM call. Split the loop and no
> unit approaches any ceiling. The corrected version is below.

## The question

"Shift the backend to Supabase" is three moves. The first draft treated them as independent
and ranked them. They are not independent: **the decomposition work gates the migration**,
and it is worth doing on its own merits even if nothing ever leaves Render.

| Move                                      | Verdict                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| **A — scheduling → `pg_cron` + `pg_net`** | **Do first.** Fixes a live correctness bug, small        |
| **B — job compute → Edge Functions**      | **Viable.** Gated on decomposition + one CPU measurement |
| **C — data access → PostgREST**           | **Last.** Gated on policy coverage (F-10)                |

---

## Current state (verified)

- Deploy target is **Render free tier** (`render.yaml`), a long-lived Node server. The Vercel
  migration was reversed — though `api/_bundle.js` is still on disk, contradicting
  render.yaml's claim it was "verified absent 2026-07-31". Stale doc, worth deleting.
- Scheduled work is owned by **in-process `node-cron`** (`server/scheduler.ts`), gated by
  `resolveSchedulerMode()` in `server/lib/schedulerMode.ts`.
- All scheduled work funnels through **one authenticated endpoint**,
  `POST /api/cron/daily-orchestrator` (`server/routes/cron.ts:315`) — 29 steps, wall-clock
  budget, `CRON_SECRET`.
- `pg_cron` 1.6.4 and `pg_net` 0.20.0 are **available, not installed**. `supabase_vault`
  0.3.1 **is** installed.
- Supabase serves **Auth and Storage only** — zero `.from()` / `.rpc()` calls in `server/`.

---

## The constraint that actually decides Move B

Not wall clock. **CPU: 2 seconds per request**, and it explicitly excludes async I/O.

That inverts the intuition. An LLM call that blocks for 25 seconds costs ~nothing against the
budget. What costs budget is synchronous text processing — and this codebase has a lot of it.

`computeSignals` (`server/routes/geoSignals.ts:168`) is the clearest case: it runs
`countContentWords` and `detectHeadings` across the **entire** document. It slices to 8,000
characters only for the embedding call — the scoring work sees the whole thing. That file
carries 13 regex sites, and the function backs three endpoints.

**This is unmeasured, and it is the one thing that decides what can be a function at all.**
It is step 2 below for that reason.

---

## Move A — scheduling to `pg_cron` + `pg_net` ✅ do first

### Why it is not a nice-to-have

Render's free plan **spins the service down after ~15 minutes without inbound HTTP traffic**
(documented in `render.yaml`). The scheduler runs _inside that process_. Asleep, `node-cron`
does not fire — and nothing records that it didn't.

The weekly report is `0 8 * * 0`. Account-purge is `0 3 * * *`, brand-purge `30 3 * * *` —
all scheduled when a low-traffic service is almost certainly asleep. Silent: no error, no
alert, just work that never happened.

### Why it is small

The orchestrator is already one authenticated endpoint with a budget. `pg_cron` + `pg_net`
only have to call it on a schedule from something always on. Postgres is always on, and the
inbound request also wakes Render.

`schedulerMode.ts` already models this cutover and **refuses a half-configured state** —
setting one of `DISABLE_IN_PROCESS_SCHEDULER` / `EXTERNAL_CRON_ORCHESTRATOR_ENABLED` without
the other throws at boot. The seam exists and has never been used.

### Must be true before the flip

- **Two steps are in-process only.** `STEP_CAPS_MS` names them: `tour-events-cleanup` and
  `detect-fact-scrape-failure`, with the comment _"Keep that scheduler active until an
  external trigger covers these steps. Otherwise tour_events grows without bound and the
  failure alert stops."_ Port them first, or the flip trades one silent gap for another.
- `pg_net` is fire-and-forget: no retry, response lands in `net._http_response`. Surface
  failures, or this reintroduces the silence it was meant to fix.
- One real authenticated call, verified in `net._http_response`.
- `CRON_SECRET` in `supabase_vault`, never inline in the cron command.

---

## Move B — job compute to Edge Functions ✅ viable, gated

### The prize is fan-out, not the migration

No heavy job parallelises across brands. Every sweep is `for (const x of xs)` with a deadline
check between iterations, which is why one slow unit starves everything behind it. Queue the
units and wall clock stops being the sum and becomes the slowest single unit.

| Job                         | Shape today                                           | Unit to queue       |
| --------------------------- | ----------------------------------------------------- | ------------------- |
| `fact-reverification-batch` | 20 stale facts, strictly serial — verified at :348    | one fact            |
| `auto-citation`             | ~15 prompts × 6 platforms per brand, then next brand  | one prompt×platform |
| `v2-fact-sheet-refresh`     | 10 pages, then Wikidata → search → enrich → aggregate | one page + fan-in   |
| `brand-activation`          | brands serial, 5 sub-jobs serial within each          | one brand×sub-job   |

**This is worth doing even if nothing leaves Render.** It fixes the starvation that caused
244s against a 30s cap, in place.

### One number to design around

A full sweep is 45 brands × 90 prompt-platform pairs ≈ **4,050 units**. Function-to-function
fan-out is ~5,000 calls/min shared across a request chain — dispatching by nested invocation
lands on the limit. **pgmq is the right dispatcher**: enqueue, let workers pull at whatever
rate providers tolerate, keep the existing Postgres concurrency slots as throttle.

### Genuinely open

- **CPU headroom is unmeasured** (see above). Measure before porting.
- **Cold start** against Drizzle + schema + OpenAI SDK, versus a 20MB bundle limit. Several
  modules construct clients eagerly at import; those need lazy init.
- **400s is the paid figure.** Free is 150s — changes granularity, not approach.
- **Memory:** `runFullScrape` holds 10 pages of extracted text in a 256MB isolate. Fails as
  OOM, not timeout, so worth checking.
- npm packages and Node built-ins are GA on the runtime, so `pg`, Drizzle and `node:crypto`
  port. Only multithreaded natives don't. **The first draft's claim that the Deno runtime
  blocks these was wrong.**

### What stays on Node regardless

TanStack Start renders every page through Nitro, and `/api/*` reaches Express via an srvx
fetch bridge. Edge Functions cannot host Nitro SSR. **A Node host remains — but as a
renderer, not an API server.**

---

## Move C — data access to PostgREST ⛔ last

- **12 of 72** public tables carry grants to the restricted roles; **60 have none**.
- RLS covers the four route files using `requestData` / `contentRequestData`. Everything else
  runs as owner by design — so RLS is inert outside those four files.
- Migration 0120 has just **revoked** `anon`/`authenticated` grants, precisely because nothing
  should reach the Data API today.
- The 4 orphaned `public.users` rows must be reconciled first, and `public.users.id` is
  `varchar`, so any policy needs `auth.uid()::text = user_id`.

Grow the restricted path route-by-route (`prompts.ts`, `dashboard.ts` first). PostgREST
becomes worth asking about once coverage approaches complete.

---

## Order

1. **Move A** — pg_cron + pg_net, after porting the two in-process-only steps. Fixes the
   sleep bug now.
2. **Measure CPU** on `computeSignals`, `re-detect-all`, the HTML extractors, the listicle
   parser. This decides what can be a function.
3. **Queue one job end to end** — `fact-reverification-batch`: 20 independent units, no
   ordering requirement, already runs last because it overruns. Drivable by the existing Node
   worker before any Edge Function exists.
4. **Move the in-memory limiters into Postgres** — circuit breakers, per-origin concurrency,
   auth rate limits, checkout mutex, following the `rate_limit_buckets` pattern. Correct
   today regardless; prerequisite for more than one worker.
5. **Port workers to Edge Functions**, pinned to `ap-southeast-1`, invoked by pg_cron + pg_net.
6. **Move C**, once policy coverage justifies it.
