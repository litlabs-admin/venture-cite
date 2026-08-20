# VentureCite — Production Readiness Audit

**Date**: 2026-04-21
**Scope**: All 58 dimensions across 12 groups (A–L)
**Method**: Phase 0 codebase discovery → parallel per-group audits → consolidation
**Deliverables**: This file (executive summary + priority triage) + per-group reports in [`audit/`](audit/)

---

## How to read this report

1. **Per-group findings** live in [audit/group-A.md](audit/group-A.md) … [audit/group-L.md](audit/group-L.md), each with file:line citations, evidence, impact, fix.
2. **Phase 0 fingerprint** is in [audit/00-phase0.md](audit/00-phase0.md) — stack, routes, entities, env, deployment.
3. **Severity scale**:
   - **CRITICAL** = blocks ship / data loss / legal / auth bypass
   - **HIGH** = regularly degrades production or enables exploit
   - **MEDIUM** = hardening; fix within a quarter
   - **LOW** = cleanup / defense-in-depth
4. **This doc** is the **prioritized punch list**. When in doubt, work top-down.

---

## 1. Ship-blocker summary (fix before production/GA)

These are the items that should gate any new customer or launch announcement.

| # | Category | Issue | Cite | Group |
|---|---|---|---|---|
| 1 | Security | **Shopify webhook missing HMAC** — forgable revenue events | [server/routes.ts:3111-3144](server/routes.ts#L3111-L3144) | E, D, H |
| 2 | Compliance | **No account deletion endpoint** (GDPR Art. 17) — €20M/4% revenue risk | `server/routes.ts` (absent) | E |
| 3 | Compliance | **No GDPR data export** (Art. 20) | `server/routes.ts` (absent) | E |
| 4 | Security | **No rate limit on auth endpoints** (login/register/forgot-password) — enables brute force, enumeration, email bombing | [server/auth.ts:164-307](server/auth.ts#L164-L307) | E, D, H |
| 5 | Security | **Buffer access token stored plaintext** — DB breach = social account takeover | [shared/schema.ts:25](shared/schema.ts#L25), [server/routes.ts:240](server/routes.ts#L240) | E |
| 6 | Security/Infra | **No HSTS; no HTTPS enforcement in code** — Bearer tokens in cleartext if edge TLS misconfigured | [server/index.ts:32-45](server/index.ts#L32-L45) | E |
| 7 | Architecture | **Migrations run at boot with no distributed lock** — multi-instance deploy → schema corruption | [server/index.ts:181-236](server/index.ts#L181-L236) | F, G |
| 8 | Architecture | **`node-cron` runs on every instance** — weekly report sent N×, auto-citation runs N×, LLM cost multiplied | [server/scheduler.ts:250-299](server/scheduler.ts#L250-L299) | F, D, G, H |
| 9 | Architecture | **Content worker polls on every instance** — duplicate processing risk (verify `FOR UPDATE SKIP LOCKED` at [databaseStorage.ts:495-512](server/databaseStorage.ts#L495-L512)) | [server/contentGenerationWorker.ts:218-266](server/contentGenerationWorker.ts#L218-L266) | F, D |
| 10 | Cost | **No per-user LLM cost caps** — abusive user can cost VentureCite $1000s/month in OpenAI/OpenRouter | [server/citationChecker.ts:313-483](server/citationChecker.ts#L313-L483) | H |
| 11 | Resilience | **Unhandled Promise.all crashes dashboard** — one slow source 500s entire metrics endpoint | [server/routes.ts:776-781](server/routes.ts#L776-L781) | D |
| 12 | Data integrity | **Revenue stored/parsed with JS `Number`** — precision loss above 2^53; rounding errors in billing reports | `D10:3205-3240` | B |
| 13 | Data integrity | **Non-transactional multi-step mutations** (e.g. `promoteSuggestionToTracked`) — race conditions | `D7:384-396` | B |
| 14 | Data integrity | **Unbounded analytics query** loads all articles in-memory — OOM at 10K+ articles | `D6:99-131` | B |
| 15 | Data integrity | **Cascade deletes without audit trail** — brand delete silently purges 20+ tables | [migrations/0003_fk_hardening.sql](migrations/0003_fk_hardening.sql) | B, E |
| 16 | Ops | **No error tracking** (Sentry/DataDog) — production errors silently vanish | Absent | G |
| 17 | Ops | **Zero automated tests** — auth bug ships undetected | Absent | G, L |
| 18 | Ops | **No CI/CD blocking merge** — broken code reaches main with no friction | Absent | G, L |
| 19 | Ops | **No IaC, no Dockerfile, no staging env** — infrastructure snowflake; cannot recreate in <1 week | Absent | G |
| 20 | Knowledge | **Single-author commit history** (`litlabs-admin` only) — bus factor of 1 | `git log` | L |

---

## 2. Severity counts by group

| Group | Focus | CRIT | HIGH | MED | LOW | File |
|---|---|---|---|---|---|---|
| A | UX | 0 | 6 | 13 | ~ | [group-A.md](audit/group-A.md) |
| B | Data Flows & Integrity | 4 | 15 | 11 | ~ | [group-B.md](audit/group-B.md) |
| C | Frontend | 2 | 6 | 4 | ~ | [group-C.md](audit/group-C.md) |
| D | Backend | 4 | 6 | 9 | 2 | [group-D.md](audit/group-D.md) |
| E | Security | 5 | 4 | 8 | 4 | [group-E.md](audit/group-E.md) |
| F | Architecture & Perf | 3 | 11 | 12 | 5 | [group-F.md](audit/group-F.md) |
| G | Operations | 8 | 10 | 8 | ~ | [group-G.md](audit/group-G.md) |
| H | Integrations | 5 | 11 | 8 | ~ | [group-H.md](audit/group-H.md) |
| I | Product | 4 | 6 | 8 | ~ | [group-I.md](audit/group-I.md) |
| J | Code Health | 6 | 9 | 11 | 5 | [group-J.md](audit/group-J.md) |
| K | i18n / l10n | 2 | 5 | 5 | ~ | [group-K.md](audit/group-K.md) |
| L | Knowledge / Bus Factor | 5 | 4 | 6 | 1 | [group-L.md](audit/group-L.md) |
| **Total** | | **~48** | **~93** | **~103** | **~17** | |

Note: counts overlap across groups where the same root cause surfaces in multiple lenses (e.g. Shopify webhook missing HMAC is a Group D, E, and H finding).

---

## 3. Prioritised remediation roadmap

### Week 1 — Ship blockers
1. Shopify webhook HMAC verification (Group E, D, H)
2. Auth endpoint rate limiting (Group E)
3. Encrypt Buffer access token (Group E)
4. Account-deletion + GDPR export endpoints (Group E)
5. `Promise.allSettled` instead of `Promise.all` on dashboard metrics (Group D)
6. Fix revenue precision (integer cents instead of JS Number) (Group B)
7. `FOR UPDATE SKIP LOCKED` verification in content worker (Group F, D)
8. Per-user LLM token budgets (Group H)

### Week 2 — Distributed safety
9. `pg_advisory_lock` around migrations at boot (Group G, F)
10. Leader election for cron (Postgres advisory lock or BullMQ) (Group F)
11. Concurrency control on worker `setInterval` (prevent stacked ticks) (Group F)
12. HSTS + HTTPS redirect in Helmet (Group E)
13. Audit log table + wrap sensitive ops (Group E, G)

### Week 3 — Observability
14. Sentry integration (server + client ErrorBoundary + worker catches) (Group G)
15. Request ID middleware + include user/brand in logs (Group G)
16. Structured logging (Pino) (Group G, L)
17. Frontend error reporting (`componentDidCatch` → POST `/api/errors`) (Group G)

### Week 4 — Test + CI baseline
18. Vitest setup (Group G, L)
19. Write first tests: auth, billing, ownership middleware, webhook idempotency, rate limits (Group G)
20. GitHub Actions CI: `tsc` + tests + eslint on PR (Group G, J)
21. ESLint + Prettier + pre-commit hooks (Group J)

### Quarter 1 — Structural refactor
22. Split `server/routes.ts` by domain (Group L, J)
23. Split `server/databaseStorage.ts` by entity (Group F, J)
24. Split `shared/schema.ts` into types (client) vs full Drizzle (server) (Group F)
25. Admin panel + CLI support tools (Group L, I)
26. README.md + CLAUDE.md + GETTING_STARTED.md + RUNBOOK.md (Group L)
27. Dockerfile + staging environment (Group G)
28. Feature flags table (Group G, J)

### Quarter 2 — Scale prep
29. Soft deletes + audit trail retention (Group B, E)
30. Optimistic locking on updates (`updated_at` as version) (Group F, B)
31. Redis cache layer (OpenAI prompt cache; rate-limit store) (Group F)
32. Per-domain pagination standardisation (Group D, F)
33. Postgres RLS policies (defense-in-depth for multi-tenancy) (Group F)
34. Load test baseline (k6) + capacity plan (Group G)
35. DR runbook + monthly restore drill (Group G)
36. User timezone/locale columns (Group K, F)
37. API versioning (`/v1/`) + OpenAPI generation (Group D, L)
38. Product analytics (PostHog) (Group H)

### Quarter 3+ — Polish / i18n
39. i18n extraction (Group K)
40. Spanish/French/German translations (Group K)
41. MFA, session management UI (Group E)
42. Notification preference centre (Group I)
43. Multi-region + CDN (Group F)
44. RTL support (Group K)

---

## 4. Cross-cutting themes

Several findings recur across multiple groups. Attacking the root cause unblocks many items simultaneously.

### Theme: "Runs on every instance"
- Migrations at boot (Group G, F)
- `node-cron` (Group D, F, G, H)
- Content generation worker (Group D, F)
**Root fix**: Leader election via Postgres advisory lock OR externalise to Bull/Redis/Temporal. Unblocks horizontal scaling, fixes cost duplication, prevents DB contention.

### Theme: "Zero observability"
- No Sentry/error tracking (Group G)
- No request IDs (Group G)
- No audit logs (Group E, G)
- Frontend errors only `console.error` (Group G)
- Worker logs unstructured (Group L)
**Root fix**: Sentry + Pino + `requestId` middleware + global hook applied everywhere.

### Theme: "Zero tests → everything harder"
- No CI (Group G, L)
- No regression detection on auth (Group E, D)
- No confidence to refactor routes.ts (Group L, J)
- No contract tests FE↔BE (Group D)
**Root fix**: Vitest + GitHub Actions; grow coverage starting with auth + billing + ownership + webhook idempotency.

### Theme: "Code concentration / bus factor"
- `routes.ts` 7226 lines (Group D, F, J, L)
- `databaseStorage.ts` 2293 lines (Group F, J, L)
- `schema.ts` 1287 lines + shipped to browser (Group F)
- Single-author git history (Group L)
**Root fix**: Domain-split refactor + onboarding docs + code review process.

### Theme: "Vendor/cost safety nets missing"
- No per-user LLM budget (Group H)
- Rolling model aliases (Group H)
- No circuit breaker (Group D, H)
- No fallback for Resend/OpenRouter outage (Group H)
- No cost dashboard (Group H)
**Root fix**: Per-tier token budget enforced at service layer; circuit breaker on every outbound; cost table logging per call.

### Theme: "Compliance debt"
- No account deletion (Group E)
- No data export (Group E)
- No audit trail (Group E, G)
- No List-Unsubscribe (Group E, H)
- No user locale/timezone storage (Group K)
- No GDPR processor list (Group E)
**Root fix**: Compliance sprint: build the five endpoints + two tables, update Privacy Policy.

---

## 5. What the codebase does well (keep doing)

Not everything is broken. Credit where due:

1. **Ownership scoping is thorough** — `server/lib/ownership.ts` + `app.param` interceptors enforce tenant isolation at the middleware layer; 30+ `require*()` helpers use 404 for anti-enumeration
2. **Drizzle + Zod type safety end-to-end** — schema is the source of truth; fewer runtime type errors
3. **SSRF defense is solid** — `server/lib/ssrf.ts` does DNS rebinding defense, private-IP blocks, size/timeout caps
4. **CSP strict in production** — `'self'` + Stripe only; no `'unsafe-inline'` for scripts
5. **Stripe webhook correctly verified + idempotent** — `stripe.webhooks.constructEvent` + `webhook_events` dedup table; a clean reference implementation for the Shopify fix
6. **Env validation fails fast** — `server/env.ts` Zod schema at boot
7. **Graceful shutdown** — 10s drain on SIGTERM/SIGINT
8. **Request logging sanitizes sensitive fields** — passwords/tokens/API keys redacted before emit
9. **Health check tests write path** — `pg_advisory_lock` round-trip catches read-replicas or revoked roles that `SELECT 1` would miss
10. **Migrations transactional + tracked** — `schema_migrations` table with per-file transaction wrappers
11. **Content worker has stuck-job recovery** — >10min "started" → "pending" reset on boot
12. **TanStack Query defaults sensible** — `refetchOnWindowFocus: false` globally prevents excessive polls
13. **Password hashing delegated to Supabase** — zero custom crypto
14. **All deps MIT/Apache-licensed** — no GPL surprise
15. **Clean monorepo boundaries** — client never imports server; shared types flow both ways correctly

---

## 6. Files referenced in this audit

Most-cited files (for quick navigation):

- [server/routes.ts](server/routes.ts) (7226 lines, 229 endpoints)
- [server/auth.ts](server/auth.ts) (309 lines)
- [server/index.ts](server/index.ts) (307 lines)
- [server/lib/ownership.ts](server/lib/ownership.ts)
- [server/databaseStorage.ts](server/databaseStorage.ts) (2293 lines)
- [server/scheduler.ts](server/scheduler.ts) (299 lines)
- [server/contentGenerationWorker.ts](server/contentGenerationWorker.ts) (299 lines)
- [server/citationChecker.ts](server/citationChecker.ts) (545 lines)
- [server/webhookHandlers.ts](server/webhookHandlers.ts)
- [server/emailService.ts](server/emailService.ts)
- [server/stripeClient.ts](server/stripeClient.ts)
- [server/env.ts](server/env.ts)
- [server/db.ts](server/db.ts)
- [server/lib/modelConfig.ts](server/lib/modelConfig.ts)
- [server/lib/ssrf.ts](server/lib/ssrf.ts)
- [shared/schema.ts](shared/schema.ts) (1287 lines)
- [client/src/App.tsx](client/src/App.tsx)
- [client/src/lib/queryClient.ts](client/src/lib/queryClient.ts)
- [client/src/lib/supabase.ts](client/src/lib/supabase.ts)
- [migrations/0003_fk_hardening.sql](migrations/0003_fk_hardening.sql)

---

## 7. Open questions for the team (audit could not answer from code alone)

1. **What's the actual deployment mechanism?** No Dockerfile or cloud config is checked in. Replit? Render? Fly? This blocks Group G findings on rollback, IaC, parity.
2. **Instance count in production?** Several CRITICAL findings (cron, worker, migrations) only manifest at >1 instance. Currently running at 1?
3. **Is there a staging environment?** No `.env.staging` in repo.
4. **Are Supabase backups enabled + tested?** Assumption in Group G.
5. **Is there a pre-launch legal review for GDPR/CCPA?** Group E compliance findings assume EU/US customers.
6. **Is there budget monitoring on OpenAI/OpenRouter/Stripe?** No cost dashboard in code.
7. **Does the team have on-call rotation or incident response plan?**

Answers to these reshape some severity counts — especially if instance count is 1 today (defers several CRITICALs to HIGH) or if there's already a staging env outside the repo.

---

## Appendix — Audit artifacts

- [audit/00-phase0.md](audit/00-phase0.md) — codebase discovery
- [audit/group-A.md](audit/group-A.md) — UX
- [audit/group-B.md](audit/group-B.md) — data flows & integrity
- [audit/group-C.md](audit/group-C.md) — frontend
- [audit/group-D.md](audit/group-D.md) — backend
- [audit/group-E.md](audit/group-E.md) — security
- [audit/group-F.md](audit/group-F.md) — architecture & performance
- [audit/group-G.md](audit/group-G.md) — operations
- [audit/group-H.md](audit/group-H.md) — integrations
- [audit/group-I.md](audit/group-I.md) — product
- [audit/group-J.md](audit/group-J.md) — code health
- [audit/group-K.md](audit/group-K.md) — i18n
- [audit/group-L.md](audit/group-L.md) — knowledge & continuity
