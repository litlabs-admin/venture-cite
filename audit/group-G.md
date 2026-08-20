# Group G — Operations

## Executive Summary

**Weakest group in the audit.** Zero observability, zero tests, zero IaC.

1. **No error tracking** — production errors vanish silently
2. **Zero test coverage** — every commit untested; regressions ship
3. **No CI/CD** — nothing blocks bad code at merge
4. **Manual, risky deployments** — no Dockerfile, no rollback plan, migrations at boot without distributed lock
5. **Backup/DR untested** — Supabase-managed assumption only; RTO/RPO unknown

---

## Dimension 33 — Observability & Monitoring

### [CRITICAL] No centralized error tracking
**File**: ABSENT
**Evidence**: No Sentry/DataDog/Rollbar imports
**Impact**: Production errors silently vanish; no alerting
**Fix**: Integrate Sentry; capture in global error handler + ErrorBoundary + worker catches

### [CRITICAL] No APM on database queries
**Evidence**: No OpenTelemetry, DataDog APM, New Relic
**Impact**: Slow queries invisible; worker polling never profiled
**Fix**: Enable Postgres `log_min_duration_statement=500`; scrape to Sentry/Datadog

### [CRITICAL] No request ID / trace correlation
**File**: `server/index.ts:134-161`
**Evidence**: Logs show method/path/status/duration but no request ID, user ID, brand ID
**Impact**: Cannot correlate multi-step user actions; support debugging manual
**Fix**: UUID request ID middleware; include in every log + error report

### [HIGH] Request logging omits sensitive tracking fields
**File**: `server/index.ts:134-161`
**Fix**: Inject `req.user?.id`, route params into log line

### [HIGH] No audit logs for sensitive operations
**Evidence**: No `audit_logs` table
**Fix**: Create `audit_logs`; wrap DELETE/subscription/billing operations

### [HIGH] Frontend JS errors not reported
**File**: `client/src/components/ErrorBoundary.tsx:23`
**Evidence**: `componentDidCatch` → `console.error()` only
**Fix**: POST error to `/api/errors` with stack + context; aggregate in Sentry

### [MEDIUM] Health check shallow
**File**: `server/index.ts:167-179`
**Evidence**: `SELECT 1` + advisory lock; doesn't test real table access
**Fix**: Extend to `SELECT FROM users LIMIT 1`; test schema availability

### [MEDIUM] No slow-query visibility
**Fix**: Enable `log_min_duration_statement=500` in Supabase

---

## Dimension 34 — Testing & Quality Gates

### [CRITICAL] Zero test coverage
**Evidence**: Zero `*.test.ts` or `*.spec.ts` files
**Impact**: Auth bug = login broken, undetected until support ticket
**Fix**: Priority order: auth (10 tests), billing (5), ownership middleware (15), content worker (5), webhook idempotency (3), rate limits (3). Target >80% on these paths first.

### [CRITICAL] No CI/CD blocking merge
**Evidence**: No `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`
**Fix**: GitHub Actions: `tsc`, tests, eslint on every PR; block merge if failing

### [CRITICAL] No linting or formatting
**Evidence**: No `eslint`, `prettier` in `package.json`
**Fix**: Add `@typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`; `.eslintrc.cjs`, `.prettierrc.json`; CI integration

### [HIGH] Type-check manual only
**File**: `npm run check` runs `tsc`
**Evidence**: `tsconfig.json` strict flag needs verification
**Fix**: `"strict": true`; mandatory pre-commit + CI

### [HIGH] No contract testing FE↔BE
**Fix**: OpenAPI spec + contract tests (MSW or generated client SDK)

### [MEDIUM] No coverage threshold
**Fix**: `coverageThreshold: { global: { statements: 80, branches: 70 } }`

### [MEDIUM] Deploy triggerable without tests
**Fix**: Require CI checks before merge to main; auto-deploy only on main merge

---

## Dimension 35 — Deployment & Rollback

### [CRITICAL] Deploy mechanism unclear
**Evidence**: No Dockerfile, docker-compose, `.replit`, cloud config
**Impact**: Cannot audit deployment safety, scale limits, failure recovery
**Fix**: Document current deploy mechanism in `docs/DEPLOYMENT.md`; containerize

### [CRITICAL] Migrations at boot with no distributed lock
**File**: `server/index.ts:181-236`
**Evidence**: IIFE calls `applyMigrations()` before `server.listen()`; no lock; two instances race
**Impact**: Migration 0007 DROPs columns; second instance crashes or corrupts state
**Fix**: `pg_advisory_xact_lock()` before migration loop; release on finish

### [CRITICAL] No dry-run mode for migrations
**File**: `migrations/*.sql`
**Fix**: `scripts/migration-dryrun.ts` simulating against schema copy; test lock/index times

### [HIGH] Irreversible migrations with no rollback
**File**: `migrations/0007_drop_article_publish.sql:4-8`
**Evidence**: DROPs columns; no UNDO migration
**Fix**: Every migration reversible; forbid `DROP` without matching UNDO script

### [HIGH] Zero-downtime deployment not documented
**Fix**: Document blue-green: start N new, health-check, drain old, terminate

### [HIGH] Rollback >5min or manual
**Fix**: Tag every deploy (git hash); auto-rollback if post-deploy error rate spikes

### [HIGH] Partial deploy failure handling opaque
**File**: `server/index.ts:255`
**Evidence**: `await initContentGenerationWorker()` unhandled — server crashes on init fail
**Fix**: try/catch with degraded-mode fallback

### [MEDIUM] No feature flags
**Fix**: `feature_flags` table; 1min cache; admin UI

### [MEDIUM] Destructive scripts runnable against prod
**File**: `scripts/seed-stripe-products.ts`
**Evidence**: Creates real Stripe products without `--dry-run` or `NODE_ENV !== 'production'` guard
**Fix**: `if (NODE_ENV === 'production') throw` + `--i-am-sure` flag

---

## Dimension 36 — Configuration Management

### [HIGH] Env validation tight but .env.example drift not detected
**File**: `server/env.ts` vs `.env.example`
**Fix**: Build-time script parses both; fails on mismatch

### [HIGH] No feature flag mechanism
**Fix**: `feature_flags` table; cached read in routes

### [MEDIUM] Secrets not hot-rotatable
**Fix**: Secrets Manager or Vault; SIGHUP reload

### [MEDIUM] No config change audit trail
**Fix**: Log to `audit_logs` when flags/envs change

---

## Dimension 37 — Environment Parity & Drift

### [HIGH] Dev vs prod behavioral differences not tracked
**File**: `server/index.ts:28-30, 40-42, 150-151, 271-275`
**Evidence**: Multiple `NODE_ENV === 'production'` branches
**Fix**: Minimize dev/prod diffs; use feature flags instead of env checks

### [HIGH] No staging environment
**Fix**: Provision staging (separate Supabase project, Stripe test keys); auto-deploy to staging on commit

### [MEDIUM] Migration state not visible per env
**Fix**: Admin endpoint `GET /admin/migrations` listing `schema_migrations`; verify before deploy

### [MEDIUM] Stripe test vs live keys not enforced
**File**: `server/stripeClient.ts`, `server/env.ts`
**Fix**: Enforce key prefix in env validation: `sk_test_` in dev, `sk_live_` in prod

---

## Dimension 38 — Infrastructure as Code & Drift

### [CRITICAL] Zero IaC
**Evidence**: No Terraform, Pulumi, CDK, Dockerfile, docker-compose
**Impact**: Infrastructure snowflake; cannot recreate in hours
**Fix**: Dockerfile (Node 20 LTS); docker-compose.yml (app + Postgres); Terraform for cloud infra

### [HIGH] Environment not recreatable in 2h
**Fix**: `scripts/setup-env.sh` bootstraps Supabase, Stripe products, migrations, .env generation

### [MEDIUM] No infra versioning
**Fix**: Commit Terraform state (or S3 versioned bucket)

### [MEDIUM] No drift detection
**Fix**: Every deploy runs `terraform plan`; fail on drift

---

## Dimension 39 — Load Testing & Capacity

### [CRITICAL] Never load tested
**Evidence**: No k6, Locust, JMeter script; no perf baseline
**Fix**: k6: 100 concurrent users, 5min, 1000 req/min; success = P99 <2s, err <0.1%

### [HIGH] Known bottlenecks uninstrumented
**File**: `server/contentGenerationWorker.ts`, `server/citationChecker.ts`
**Evidence**: Polling hardcoded; no queue-depth metric
**Fix**: `content_generation_queue_size` metric; alert on `>100 for 5min`

### [HIGH] Graceful degradation not tested
**Fix**: Load test with OpenAI throttled; verify queuing + retry behavior

### [MEDIUM] DB pool limit not tuned
**File**: `server/db.ts:17`
**Fix**: Load test varying pool sizes; pick where P99 <500ms

### [MEDIUM] No backpressure
**Fix**: Bull (Redis queue) or async cap; 503 + Retry-After when full

---

## Dimension 40 — Backup / Recovery / DR

### [CRITICAL] Backup strategy not verified
**Evidence**: "Supabase managed" assumption; no restore test, no RTO/RPO
**Fix**: Verify Supabase backup frequency; test restore monthly to throwaway DB

### [HIGH] RTO/RPO not defined
**Fix**: Publish: "RPO 1h (daily backups), RTO 4h (manual restore)"

### [HIGH] Backups never tested
**Fix**: Monthly restore drill; document time; run smoke tests on restored DB

### [HIGH] Geographic redundancy absent
**Fix**: Supabase multi-region or cross-region backup; read replica in different region

### [HIGH] Point-in-time snapshots unknown
**Fix**: Enable automated snapshots (hourly or 4h) if plan allows

### [MEDIUM] Single-DB-instance risk
**Fix**: Supabase read replica; route analytics reads to replica

### [MEDIUM] No DR runbook or drill
**Fix**: `docs/DISASTER_RECOVERY.md`: detect → assess → restore → verify → post-mortem

---

## Positive observations

1. Env validation tight (`server/env.ts`) — boot fails fast
2. Health check tests write-path (advisory lock)
3. Stripe webhook idempotency (`stripe_webhook_events`)
4. Graceful shutdown (10s timeout)
5. Log sanitization (passwords/tokens redacted)
6. Stuck job recovery in worker (>10min → pending)
7. CSP strict in prod
8. Rate limiting on AI endpoints
