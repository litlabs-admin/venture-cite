# Group F — Architecture & Performance

## Executive Summary

31 findings: 3 CRITICAL, 11 HIGH, 12 MEDIUM, 5 LOW.

1. **Multi-instance scaling breaks immediately** — migrations on every boot without distributed lock; cron + content worker both run concurrently on every instance (no leader election)
2. **Large files + schema.ts ships to browser** — routes.ts 7226, databaseStorage.ts 2293, schema.ts 1287 (also inflates client bundle)
3. **Missing perf optimizations** — no React.memo/useMemo on hot components; SELECT * queries; polling without debounce
4. **No server-side caching** — OpenAI calls repeated every week for same prompts; no Redis
5. **Time handling cron UTC-only** — user timezone ignored

---

## Dimension 26 — Tech Stack Appropriateness

### [CRITICAL] Multi-instance deployments fail on migrations
**File**: `server/index.ts:181-236`
**Evidence**: `applyMigrations()` at line 240 has no distributed lock; per-file tracking in `schema_migrations` is idempotent for re-runs but two instances booting simultaneously race on new migrations
**Impact**: Data corruption, partial schema, failed deploys
**Fix**: `pg_advisory_lock(9000)` before loop at line 197; release on finish

### [CRITICAL] node-cron executes on every instance
**File**: `server/scheduler.ts:250-299`
**Evidence**: `initScheduler()` called per instance; 5 cron jobs registered; no leader election
**Impact**: Weekly report sent N times; auto-citation runs N times per brand/week; competitor/mention/listicle duplicated; each hit OpenAI + Resend + Postgres simultaneously
**Fix**: Leader election via Postgres advisory lock (one instance per cluster); or move to external job queue (BullMQ, Temporal)

### [CRITICAL] Content generation worker polls on every instance
**File**: `server/contentGenerationWorker.ts:218-266`, `server/databaseStorage.ts:495-512`
**Evidence**: `initContentGenerationWorker()` per instance; `setInterval(() => tick(), 5000)` every instance; no backoff on empty claims
**Impact**: DB thrashed every 5s × N instances; spins on idle
**Fix**: Single leader runs worker OR move to Redis/BullMQ; exponential backoff on empty claim (up to 60s); use LISTEN/NOTIFY to wake workers on enqueue

### [HIGH] schema.ts shipped to browser; type pollution
**File**: `shared/schema.ts:1-150` + client imports
**Evidence**: Drizzle ORM metadata and SQL column info included in browser bundle (~50-100KB)
**Impact**: Larger bundle; ships implementation details
**Fix**: Split into `shared/types.ts` (types only) + `server/schema.ts` (full Drizzle); or `/* @server-only */` markers and build tree-shake

### [HIGH] Pool max hardcoded; no scaling parameter
**File**: `server/db.ts:15-20`
**Evidence**: `max: 10` hardcoded
**Impact**: Under load, legitimate requests queue
**Fix**: `max: parseInt(process.env.DB_POOL_MAX || '10', 10)`

### [HIGH] Dual ORM pattern (Drizzle + raw pg.Pool)
**File**: `server/db.ts`, `server/index.ts:197-236` (migrations use raw pool)
**Impact**: Inconsistent abstraction; harder to debug
**Fix**: Keep raw SQL for migrations (acceptable); document the exception

### [MEDIUM] font-display strategy missing or inconsistent
**File**: `client/index.html:6-8`
**Evidence**: Many Google Fonts loaded; `display=swap` in URL good, but no `font-display` in CSS @font-face
**Fix**: Limit to 2-3 families; verify all @font-face have `font-display: swap`

### [MEDIUM] express.json limit 1mb may be insufficient for article uploads
**File**: `server/index.ts:94-95`
**Fix**: Per-route limits: `app.post('/api/articles', express.json({ limit: '5mb' }), ...)`

### [MEDIUM] Dependency redundancy
**File**: `package.json:61, 71, 80`
**Evidence**: `react-icons` + `lucide-react`; `tw-animate-css` + `tailwindcss-animate`
**Fix**: Keep `lucide-react` + `tailwindcss-animate`; remove the other two

### [MEDIUM] TLS cert validation disabled for Postgres
**File**: `server/db.ts:19`
**Evidence**: `ssl: { rejectUnauthorized: false }`
**Impact**: MITM risk on Postgres connection
**Fix**: `ssl: { ca: fs.readFileSync('certs/supabase-ca.crt') }`

### [LOW] Node engine version not pinned
**File**: `package.json` (missing `"engines"`)
**Fix**: `"engines": { "node": ">=20.0.0" }`

---

## Dimension 27 — Performance

### [HIGH] Vite chunk splitting not tuned
**File**: `client/src/App.tsx:23-50`, `vite.config.ts`
**Evidence**: 25 pages lazy-loaded (good); some are 1500+ lines (ai-intelligence 1969, content 1415); no `manualChunks` config in vite
**Fix**: `build.rollupOptions.output.manualChunks: { vendor: ['react', 'recharts', 'framer-motion'] }`

### [HIGH] `staleTime: 0` on content page triggers excessive refetch
**File**: `client/src/pages/content.tsx:246`
**Evidence**: Always stale; rapid focus changes refetch every time
**Fix**: `staleTime: 60_000` for draft list; manual "refresh" button for immediate

### [HIGH] SELECT * pattern in databaseStorage.ts
**File**: `server/databaseStorage.ts:53-100+` (many occurrences)
**Evidence**: `await db.select().from(schema.users).where(eq(...))` — implicit SELECT *; `getCitations()` has no `userId` filter
**Impact**: Wasted bytes; potential data leak (multi-tenant risk on unscoped queries)
**Fix**: Explicit column select; every query scoped by `userId`/`brandId` where applicable

### [HIGH] Large page components without memoization
**File**: `client/src/pages/ai-intelligence.tsx` (1969), `client/src/pages/content.tsx` (1415)
**Evidence**: No `React.memo()` on children; no `useMemo()` on derived lists; no `useCallback()`
**Fix**: Extract memoized list rows; `useMemo` on filtered/sorted lists; `useCallback` on handlers

### [MEDIUM] Client-side job polling without cancellation
**File**: `client/src/pages/content.tsx` (job status polling)
**Fix**: `AbortController` + `queryClient.cancelQueries()` on unmount

### [MEDIUM] Sequential awaits in routes without Promise.all
**File**: `server/routes.ts:634-712`
**Evidence**: Sequential `await` on independent queries
**Fix**: `Promise.all()` or `Promise.allSettled()`

### [MEDIUM] Huge articles shipped in list responses
**Evidence**: `articles.content` full text returned on list endpoints
**Fix**: Separate endpoint for full content; list returns `{ id, title, excerpt, updatedAt }`

### [MEDIUM] Unbounded list queries
**Evidence**: `getArticles()` returns all rows in `databaseStorage.ts`
**Fix**: `.limit(100).offset(skip)` on all list queries

---

## Dimension 28 — Memory Usage

### [HIGH] Unbounded poll loop in content worker
**File**: `server/contentGenerationWorker.ts:219-266`
**Evidence**: `setInterval(() => tick(), 5_000)` — if tick() blocks 45s, 9 more setInterval fires stack
**Impact**: 100 jobs queued + 45s each = 100 parallel in-flight; OOM on LLM responses
**Fix**:
```typescript
let ticking = false;
workerInterval = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try { await tick(); } finally { ticking = false; }
}, POLL_INTERVAL_MS);
```

### [HIGH] Client localStorage unbounded accumulation
**Evidence**: `venturecite-draft-active-<userId>`, `completedGuideSteps` never cleared
**Fix**: Clear on logout; TTL on guide steps

### [MEDIUM] Drizzle results fetch full rows
**File**: `server/databaseStorage.ts:87-100`
**Fix**: `.select({ id: ..., onlyNeeded: ... })`

### [MEDIUM] Manual type casting to `any`
**File**: `server/databaseStorage.ts:511`
**Evidence**: `(result as any).rows?.[0]` then cast to type
**Fix**: Use Drizzle `.returning()` or Zod-validate raw results

---

## Dimension 29 — Caching Strategy

### [HIGH] No Redis or server-side cache; only TanStack Query on client
**Evidence**: No `redis` import in server; no HTTP `Cache-Control` on API responses
**Impact**: OpenAI re-called for repeated prompts (cost); no dedup across concurrent users; cache stampede risk
**Fix**: HTTP cache on GET: `Cache-Control: private, max-age=300`; cache OpenAI by prompt hash; Redis for shared state

### [HIGH] Inconsistent `staleTime` across pages
**File**: `client/src/lib/queryClient.ts:120`, page overrides
**Evidence**: Global 30s; content.tsx 0s; dashboard 30s; no centralized config
**Fix**: Central `CACHE_TTL` constants per entity type

### [MEDIUM] No invalidation on mutations
**Evidence**: After POST mutation, related `queryClient.invalidateQueries()` often absent
**Fix**: Every mutation `onSuccess` invalidates relevant query keys

### [MEDIUM] Weekly report recomputes from scratch
**File**: `server/scheduler.ts:17-138`
**Fix**: Cache last week's result; diff new rankings

---

## Dimension 30 — Concurrency & Distributed Races

### [CRITICAL] Migrations + cron + worker on all instances
See Dimension 26.

### [HIGH] Cascade deletes may silently purge audit trails
**File**: `migrations/0003_fk_hardening.sql:80-162`
**Evidence**: All brand_id FKs `ON DELETE CASCADE`; deleting brand cascades to 20+ tables
**Impact**: No recovery; no audit trail
**Fix**: Soft delete + audit log trigger; 30-day retention before physical purge

### [HIGH] No optimistic locking on concurrent edits
**File**: `shared/schema.ts`, update routes
**Evidence**: `updatedAt` present but not used as version token
**Impact**: Lost updates on concurrent edit
**Fix**: `UPDATE ... WHERE id = $1 AND updated_at = $2 RETURNING`; treat 0 rows as conflict

### [HIGH] DB connection pool exhaustion under load
**File**: `server/db.ts:15-20` (max 10)
**Fix**: `connectionTimeoutMillis: 5000` fail fast; monitor utilization

### [MEDIUM] No backpressure on content generation
**Fix**: Per-user pending-job cap (5 concurrent, 50/day); priority queue by tier

### [MEDIUM] FOR UPDATE SKIP LOCKED inefficient at scale
**File**: `server/databaseStorage.ts:500-510`
**Fix**: LISTEN/NOTIFY to wake workers on enqueue; check `status = 'pending'` before lock; exponential backoff on empty

---

## Dimension 31 — Multi-Tenancy & Tenant Isolation

### [HIGH] No Postgres RLS; app-level only
**File**: No RLS policies in migrations
**Impact**: One bug in ownership check = data leak; DB-level defense absent
**Fix**: Enable RLS on `articles`, `brands`, etc.; policies keyed on `current_setting('request.jwt.claim.sub')`

### [MEDIUM] User ID scoping inconsistency potential
**File**: `server/routes.ts` — not all endpoints use `requireOwned*()` helpers consistently
**Fix**: Mandatory lint rule or test that every `/api/:resourceId/*` route uses an ownership param handler

### [MEDIUM] Logs omit tenant context
**File**: `server/index.ts:134-161`
**Fix**: Inject `req.user?.id` and relevant resource IDs into log line

---

## Dimension 32 — Multi-Region & Geographic Latency

### [HIGH] Single-region; no CDN for static assets
**File**: `server/index.ts:277-279`
**Impact**: Non-local users experience high latency
**Fix**: CloudFront/Cloudflare for static; multi-region app instances; geo-DNS

### [MEDIUM] Cron times UTC-only; no user timezone
**File**: `server/index.ts:175`, `server/scheduler.ts:153-165, 218-221`
**Evidence**: `"0 8 * * 0"` Sunday 08 UTC → Tokyo user gets 17:00 local
**Fix**: Store `users.timezone`; convert cron to UTC equivalent per user; use `date-fns-tz`

### [MEDIUM] No read replicas
**File**: `server/db.ts` (single DATABASE_URL)
**Fix**: If Supabase read replica available, separate pool for dashboard/analytics reads

### [MEDIUM] No CORS preflight caching
**File**: `server/index.ts:57-67`
**Fix**: `maxAge: 86400` in CORS options

### [LOW] No data residency controls
**Fix**: Document DB region; for GDPR-sensitive clients, offer EU-region deployment

---

## Positive observations

1. Drizzle + TypeScript — type-safe queries
2. Content worker recovery (`failStuckContentJobs` on boot)
3. `FOR UPDATE SKIP LOCKED` present (good pattern; just needs backoff)
4. Strict CSP in prod
5. Helmet + CORS allowlist
6. Lazy-loaded route bundles
7. TanStack Query sensible defaults (no refetch on window focus globally)
8. Graceful shutdown (10s)
9. Log sanitization
10. Health check tests read+write via advisory lock
