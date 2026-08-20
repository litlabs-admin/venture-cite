# Group L — Knowledge, People & Continuity

## Executive Summary

Severe bus-factor risk.

1. **Single-author commit history** — only `litlabs-admin`; no distributed knowledge or code review
2. **Monolithic routes.ts (7226 lines)** — makes team scaling and review impossible
3. **Zero test coverage + zero CI** — regression detection is manual or absent
4. **No runbooks or admin tooling** — support cannot look up users or impersonate without engineer
5. **Undocumented critical systems** — citation checker, content worker, scheduler have console.log-only visibility

---

## Bus Factor & Knowledge Distribution

### [CRITICAL] Single-author commit history
**Evidence**: `git log --format='%an' | sort -u` → only `litlabs-admin`
**Impact**: No distributed knowledge; loss-of-engineer risk is total
**Fix**: Enforce code review; target ≥2 authors on every feature

### [CRITICAL] Monolithic `routes.ts` (7226 lines, ~229 endpoints)
**File**: `server/routes.ts:1-7226`
**Impact**: Merge conflicts on every parallel feature; cannot locate endpoints without grep; no natural service layer
**Fix**: Domain split: `auth.routes.ts`, `brands.routes.ts`, `content.routes.ts`, `citations.routes.ts`, `billing.routes.ts`, `analytics.routes.ts`

### [CRITICAL] Zero tests, zero CI, zero regression detection
**Evidence**: No `*.test.ts`; no CI workflows
**Fix**: Vitest + GitHub Actions; `npm run check && npm test` on every PR

### [HIGH] Undocumented critical workers
**File**: 
- `server/citationChecker.ts` (545 lines)
- `server/contentGenerationWorker.ts` (299 lines)
- `server/scheduler.ts` (299 lines)
**Evidence**: console.log-only; no structured logging, no DLQ metrics
**Fix**: Pino structured logs; Sentry on catches; DLQ surface

### [HIGH] No admin impersonation or support tooling
**Evidence**: Grep for `impersonate`, admin routes — none found
**Impact**: Support must ticket engineering for every user issue
**Fix**: `/admin/users`, `/admin/users/:id/impersonate`, `/admin/brands/:id` behind strict auth

### [HIGH] Scripts require manual env setup
**File**: `scripts/setup-stripe-products.ts`, `scripts/seed-stripe-products.ts`
**Fix**: `npm run support:*` wrappers with env sourcing; document in runbook

### [MEDIUM] No onboarding documentation
**Fix**: `docs/GETTING_STARTED.md`: local setup, scripts, feature-add pattern

### [MEDIUM] Naming inconsistency: "brand" vs "workspace"
**Fix**: Establish single term; document: "Brand is the tenant unit; user owns N brands"

---

## Psychological Safety of the Codebase

### [CRITICAL] `routes.ts` psychological barrier
**File**: `server/routes.ts` (7226 lines)
**Impact**: New engineers fear touching it; reviews impossible
**Fix**: Domain-driven split (see above)

### [HIGH] Multiple competing state management patterns
**File**: `client/src/lib/authStore.ts`, `client/src/hooks/use-auth.ts`, `client/src/lib/draftStore.ts`, inline `useState` in large pages
**Impact**: New engineers unsure which pattern to use
**Fix**: Golden path: TanStack Query for server state; `useState` for UI; `localStorage` for draft backup only

### [MEDIUM] God components
**File**: `client/src/pages/content.tsx` (1415 lines), `citations.tsx` (1226), `ai-intelligence.tsx` (1969)
**Impact**: Reluctant to modify; cannot test
**Fix**: Split into `<ContentForm>`, `<GenerationMonitor>`, `<DraftList>`, etc.

---

## Support & Debuggability by Non-Engineers

### [CRITICAL] No admin panel or support tooling
**Fix**: Build admin UI: user search, brand view, impersonation, subscription management

### [CRITICAL] No CLI support scripts
**File**: `scripts/` contains only Stripe setup
**Fix**: `npm run support -- reset-onboarding --user-id <uuid>`; `support -- refund-stripe`; `support -- view-user <id>`

### [HIGH] No runbook
**Fix**: `docs/RUNBOOK.md` with common incidents (worker stalled, weekly report failed, Stripe webhook failing, OpenAI outage degraded mode)

### [HIGH] No observability (covered in Group G)
**Fix**: Sentry + Pino + request ID correlation

---

## Documentation Quality

### [CRITICAL] No README.md at repo root
**Evidence**: No top-level README
**Fix**: Quickstart, tech stack, doc links

### [HIGH] No CLAUDE.md
**Fix**: Architecture overview + feature-add pattern for AI-paired work

### [MEDIUM] `ARCHITECTURE.md` (if present) incomplete
**Fix**: Expand to cover worker model, file boundaries, design principles

### [MEDIUM] `docs/feature_flows.md` not linked from README
**Fix**: Link with TOC

### [MEDIUM] No API documentation / OpenAPI spec
**Evidence**: 229 endpoints, no OpenAPI
**Fix**: Swagger comments + `/api/docs` endpoint

### [LOW] No ADRs
**Fix**: `docs/adr/` with template + ADRs for key choices (Drizzle vs Prisma, in-process cron vs Bull, Supabase vs Auth0)

---

## Naming & Consistency

### [MEDIUM] "Brand" is the tenant but terminology drifts
**Fix**: Document in ARCHITECTURE.md

### [MEDIUM] snake_case DB vs camelCase JS — Drizzle handles, but undocumented
**Fix**: Document the mapping

### [LOW] File naming: PascalCase components vs kebab-case pages
**Status**: Mostly consistent
**Fix**: Document convention in GETTING_STARTED.md

---

## Positive observations

1. Solid ownership scoping model (`server/lib/ownership.ts`)
2. Zod validation end-to-end
3. `docs/feature_flows.md` is comprehensive (147KB)
4. Migrations tracked + reproducible (`migrations/` + `schema_migrations` table)
5. Env validation at boot
6. TanStack Query consistent across most pages
7. Helmet + rate limiting (AI endpoints)
8. PRODUCTION_READINESS_AUDIT.md already exists — team is aware of gaps
9. PHASE1/PHASE2_FEATURES.md document intent

---

## Recommendations (priority)

| Prio | Fix | Effort | Impact |
|------|-----|--------|--------|
| P0 | README.md + GETTING_STARTED.md | S | Unblocks new engineers |
| P0 | Split routes.ts by domain | L | Enables team scaling |
| P0 | Admin panel + CLI support tools | L | Decouples support from engineering |
| P0 | RUNBOOK.md | M | Incident response |
| P1 | Vitest + GitHub Actions CI | L | Regression detection |
| P1 | CLAUDE.md | S | Better AI-paired dev |
| P1 | Sentry + structured logging | M | Production visibility |
| P2 | OpenAPI spec | M | API self-service |
| P2 | ADR directory | M | Decision preservation |
