# Group D — Backend

## Executive Summary

4 CRITICAL, 6 HIGH, 9 MEDIUM findings across Dimensions 14-18.

Highest priority issues:
1. **Cron and worker scaling failures** — scheduled jobs + content worker run on every instance simultaneously, causing 3-10× duplication and resource waste
2. **Fire-and-forget failures** — async tasks post-response with zero visibility; silent failures on brand creation
3. **Promise.all crashes dashboard** — unhandled errors in parallel queries kill entire metrics endpoint
4. **No auth rate-limiting** — login/register/forgot-password exposed to brute-force
5. **No API versioning** — breaking changes propagate to frontend with no grace period

---

## Dimension 14 — Backend Logic

### [CRITICAL] Cron jobs execute on every server instance simultaneously
**File**: `server/index.ts:252`, `server/scheduler.ts:251-299`
**Evidence**: `initScheduler()` is called unconditionally in boot; `cron.schedule()` is invoked on every instance
**Impact**: In 3-server deployment, weekly reports send 3× to every user; competitor discovery runs 3× in parallel; DB contention scales with instance count
**Fix**: Implement Postgres advisory locks or Redis leader election; only one instance owns cron jobs

### [CRITICAL] Content generation worker runs on every instance with no atomic job claiming (verify)
**File**: `server/index.ts:255`, `server/contentGenerationWorker.ts:282-315`
**Evidence**: `initContentGenerationWorker()` starts polling on every instance; verify `SELECT ... FOR UPDATE SKIP LOCKED` is present (databaseStorage.ts:495-512 was claimed to have it)
**Impact**: If SKIP LOCKED is missing, two instances may claim same job; duplicate articles generated; OpenAI credits wasted
**Fix**: Use atomic `SELECT ... FOR UPDATE SKIP LOCKED`; implement job lease with TTL

### [HIGH] No rate-limiting on auth endpoints (login, register, forgot-password, reset)
**File**: `server/auth.ts:164-307`
**Evidence**: POST /api/auth/register, login, forgot-password have no rate-limit middleware. AI endpoints rate-limit at 10 req/min (`routes.ts:72-79`) but auth does not.
**Impact**: Brute-force on login; account enumeration via forgot-password; email spam
**Fix**: 5 attempts per 15 minutes per IP for login/register; 3 per hour per email for forgot-password

### [HIGH] Fire-and-forget async tasks with no failure visibility
**File**: `server/routes.ts:2957-2974`
**Evidence**: `POST /api/brands` uses `setImmediate(async () => { scrapeBrandFacts(...); discoverCompetitors(...); })`; response fires before tasks complete; errors only to console
**Impact**: User sees "Brand created" but background work fails silently; no retry; no UI indicator
**Fix**: Enqueue to Postgres job table instead of setImmediate; return job IDs; expose re-run endpoints

### [HIGH] Session expiry not enforced beyond Supabase JWT TTL
**File**: `server/auth.ts:24-47`
**Evidence**: JWT verified via Supabase `auth.getUser(token)` but no server-side `session.expires_at` check; no refresh-token rotation on API calls
**Impact**: Expired tokens may still be accepted if Supabase doesn't embed TTL in JWT; no immediate logout across servers
**Fix**: Ensure Supabase JWT TTL is 15-60 minutes; client must refresh; denylist on logout

### [MEDIUM] Authorization checks use 404 instead of 403
**File**: `server/auth.ts:49-71`
**Evidence**: `checkBrandOwnership()` returns 404 when ownership fails (by design for anti-enumeration)
**Impact**: Confuses legitimate users; fine for security but document intent
**Fix**: Document the anti-enumeration pattern in an ADR; or use 403 after rate-limit + 404 without

### [MEDIUM] Input length limits on request body (1MB) but not per-field
**File**: `server/index.ts:94-95`, `server/routes.ts:57-61`
**Evidence**: `express.json({ limit: '1mb' })` but no per-field Zod `.max()` constraints on strings headed to LLM
**Impact**: 1MB `sampleContent` = 250k+ tokens fed to LLM (cost spike + prompt injection surface)
**Fix**: Add Zod `.max(4000)` on all user-input strings destined for LLM

### [MEDIUM] External service calls have timeouts but minimal retry logic
**File**: `server/routes.ts:49-54`, `server/contentGenerationWorker.ts:16-21`
**Evidence**: OpenAI client `timeout: 45_000, maxRetries: 1` — one retry, no backoff
**Impact**: Transient OpenAI outages cause 500 to user; no circuit breaker
**Fix**: `maxRetries: 3` with exponential backoff (100/200/400ms); circuit breaker (10 fails → 5min cooldown)

### [MEDIUM] Bulk operations have no progress tracking or cancellation
**File**: `server/routes.ts:1954-2000` (distributions)
**Evidence**: Multi-platform article distribution is synchronous; no job tracking; no cancel
**Fix**: Enqueue per-platform sends to Postgres queue; return job ID; expose cancel endpoint

---

## Dimension 15 — API Contract & Versioning

### [HIGH] No API versioning; breaking changes propagate silently
**File**: `server/routes.ts` (all routes — no `/v1/` prefix)
**Impact**: Renaming response field breaks all clients; frontend/backend must deploy lock-step
**Fix**: Add `/v1/` prefix; create `/v2/` for breaking changes; maintain old for 2+ quarters

### [MEDIUM] No OpenAPI/GraphQL schema; no runtime response validation
**File**: Zod schemas in `shared/schema.ts` but no OpenAPI generation
**Impact**: Frontend infers types from reading code; response drift silent
**Fix**: Generate OpenAPI from Zod; expose `/openapi.json`; use `openapi-typescript` for client types

### [MEDIUM] Pagination inconsistent across list endpoints
**File**: `server/routes.ts:1711` (`limit` for keywords), `server/routes.ts:2408` (limit with max-cap)
**Impact**: Some endpoints use `limit`, others may use `page/offset`; no cursor pagination for big tables
**Fix**: Standardize on `limit` + `offset`; document; cursor pagination for >10k rows

### [LOW] Error response shape inconsistent
**File**: Various
**Evidence**: Some return `{ success, error }`; others add `limitReached`, `remaining`
**Fix**: Standard: `{ success: false, error: string, code: "CODE", details?: any }`

---

## Dimension 16 — Real-Time & Async

### [CRITICAL] Content generation worker: verify duplicate detection
**File**: `server/contentGenerationWorker.ts:282-315`
**Evidence**: Polling mechanism needs atomic claim; verify SKIP LOCKED pattern
**Impact**: If missing, two instances process same job; OpenAI waste + confusing UX
**Fix**: Confirm `FOR UPDATE SKIP LOCKED`; add job lease TTL so crashed claims can be re-tried

### [MEDIUM] No retry or dead-letter queue for failed background jobs
**File**: `server/scheduler.ts:170-214`
**Evidence**: `catch (err) { console.error(...); }` with no retry; failed jobs lost
**Impact**: User waits a week for next scheduled run; still no data
**Fix**: Create `failed_jobs`/DLQ table; hourly retry with backoff; alert on excessive DLQ

### [MEDIUM] Weekly cron runs on all instances (duplicate scheduling)
**File**: `server/scheduler.ts:295-298`
**Fix**: Distributed lock before any cron job

### [MEDIUM] Long-running jobs not cancellable mid-execution
**File**: `server/contentGenerationWorker.ts:129-180` (humanization passes)
**Evidence**: 3 passes sequential with no AbortSignal
**Fix**: Accept AbortSignal; check `signal.aborted` between passes; abort OpenAI fetch

### [MEDIUM] Scheduled jobs not idempotent on re-run
**File**: `server/scheduler.ts:170-214`
**Evidence**: `runAutoCitationJob()` doesn't check "already ran today?"; re-runs on failure create duplicates
**Fix**: Store `last_run_completed_at`; skip brands ran in last N hours; or idempotency keys (job_type + brand_id + date)

---

## Dimension 17 — Search Architecture

### [LOW] No full-text search index; LIKE '%query%' pattern suspected
**Evidence**: No explicit full-text search; likely LIKE on name/description/content
**Impact**: Table scans on large datasets; no typo tolerance or ranking
**Fix**: Postgres full-text (tsvector/tsquery) or pg_trgm; paginate; cap 100

---

## Dimension 18 — Error Handling & Resilience

### [CRITICAL] Unhandled Promise.all errors crash dashboard
**File**: `server/routes.ts:776-781`
**Evidence**: `Promise.all([...])` — if any one fails, entire endpoint 500s
**Impact**: Dashboard fails if any single data source is slow/down
**Fix**: `Promise.allSettled()`; return partial data with error flags

### [HIGH] Global error handler may leak stack traces
**File**: `server/index.ts:260-269`
**Evidence**: `console.error('[error]', err)` full; dev message exposed
**Fix**: Never expose stack in prod; structured logging with redaction; `err.expose` flag only for safe messages (already implemented — verify usage)

### [HIGH] Shopify webhook idempotency/signature suspected missing
**File**: `server/webhookHandlers.ts` (Stripe only); `server/routes.ts:3111-3144` (Shopify)
**Evidence**: Stripe events deduplicated via `stripe_webhook_events`; Shopify endpoint has comment "wire up real integrations, add shared-secret / HMAC check here" but no implementation
**Fix**: HMAC-SHA256 verification; idempotency via webhook_events or dedup key

### [MEDIUM] Catch blocks swallow errors without logging
**File**: `server/routes.ts:1321`, `server/routes.ts:365`
**Evidence**: `.catch(() => null)`, `.catch(() => [])` with no log
**Fix**: Log unexpected errors: `.catch(err => { console.error('...', err); return []; })`

### [MEDIUM] External service failures not gracefully degraded
**File**: Throughout (OpenAI, Resend, Stripe calls)
**Fix**: Circuit breaker; return partial success where possible; queue emails to job table instead of blocking

### [LOW] Missing process-level unhandled rejection handler
**File**: `server/index.ts`
**Fix**:
```typescript
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});
```

---

## Positive observations

1. SSRF protection (`server/lib/ssrf.ts`) — DNS rebinding defense, private IP blocks, size/timeout caps
2. OpenAI timeout configured (45s)
3. CSP strict in production
4. Stripe webhook idempotency via `stripe_webhook_events`
5. Request logging sanitizes sensitive fields (passwords, tokens redacted)
6. Password minimum length enforced (8 chars)
7. Env vars validated at boot (Zod in `server/env.ts`)
8. Migrations are transactional
9. Graceful shutdown (10s grace)
10. Bearer token auth is stateless
