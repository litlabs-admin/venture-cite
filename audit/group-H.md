# Group H — Integrations & External Services

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

## Executive Summary

5 CRITICAL, 11 HIGH, 8 MEDIUM findings.

1. **Shopify webhook missing HMAC** (also in Group E)
2. **No per-user LLM cost caps** — runaway spend on abuse or stuck loops
3. **No email retry/DLQ/bounce handling** — weekly reports silently drop
4. **Stripe API version unpinned** — silent breaking changes on SDK update
5. **No event tracking** — zero visibility into feature adoption, DAU/MAU, conversion funnels

---

## Dimension 41 — Third-Party Vendor Risk

### [HIGH] Rate limiting only on AI endpoints; not auth
**File**: `server/routes.ts:72-74`
**Evidence**: 10 req/min on AI endpoints; login/register/forgot-password unprotected
**Fix**: Rate-limit all auth endpoints (also in Group E)

### [HIGH] OpenAI models are rolling aliases
**File**: `server/lib/modelConfig.ts:13-52`
**Evidence**: `"gpt-4o-mini"` is a rolling alias — OpenAI may swap underlying model anytime
**Impact**: Cost spike if pricing changes; citation detection drift if reasoning changes
**Fix**: Pin to dated release: `"gpt-4o-mini-2024-07-18"`

### [HIGH] OpenRouter model slugs manually verified; no automation
**File**: `server/lib/modelConfig.ts:36-42`
**Evidence**: Comment: "Slugs verified against https://openrouter.ai/api/v1/models on 2026-04-16"
**Impact**: If OpenRouter renames/deprecates, checks silently fail
**Fix**: Boot-time health check against OpenRouter models API; alert on mismatch

### [MEDIUM] Vendor blast radius not documented
**Evidence**: Separation is good (Supabase auth / Stripe payments / Resend email / OpenAI LLM) but no degraded-mode documentation
**Fix**: Document what breaks if each vendor is down; degraded modes in `docs/RUNBOOK.md`

---

## Dimension 42 — Email & Notification Reliability

### [CRITICAL] No email delivery retry / DLQ / bounce handling
**File**: `server/emailService.ts:127-137`
**Evidence**: Resend failures return false with no retry; no bounce/complaint webhook
**Impact**: Users expect weekly reports but never receive; no visibility into bounce rate; future deliverability suffers
**Fix**: Exponential backoff retry; DLQ table; Resend bounce webhook handler

### [HIGH] Email templates inline in code
**File**: `server/emailService.ts:107-124`
**Evidence**: HTML template hardcoded in function; typo fix requires deploy
**Fix**: Resend Templates API or DB table with admin UI

### [HIGH] Weekly email runs synchronously in cron
**File**: `server/scheduler.ts:17-138`
**Evidence**: `runWeeklyReportJob()` blocks in-process; if Resend slow, other crons miss windows
**Fix**: Offload to BullMQ + Redis; cron only enqueues

### [MEDIUM] SPF/DKIM/DMARC not documented
**File**: `server/emailService.ts:6` (`reports@example.test`)
**Impact**: Emails flagged as spam if DNS incorrect
**Fix**: Document DNS records; verify in Resend dashboard

### [MEDIUM] Resend API scope not validated at boot
**File**: `server/env.ts:26`
**Fix**: Send test email on boot (once per deploy) to verify key + domain

### [MEDIUM] No List-Unsubscribe header
**File**: `server/emailService.ts:127-131`
**Fix**: `List-Unsubscribe: <mailto:...>, <https://...>` + one-click POST

---

## Dimension 43 — Outbound Webhook & Integration Security

### [CRITICAL] Shopify webhook missing HMAC
**File**: `server/routes.ts:3111-3144`
**Evidence**: Comment explicitly says "add HMAC check here" — not implemented
**Impact**: Forgable purchase events
**Fix**: HMAC-SHA256 with Shopify secret; reject invalid

### [MEDIUM] No rate limiting on incoming webhooks
**File**: `server/index.ts:70-92`, `server/routes.ts:3116, 3149`
**Impact**: DoS via webhook flood
**Fix**: 100/min per IP

### [MEDIUM] No circuit breaker for outbound calls
**File**: `server/citationChecker.ts:250-308`
**Evidence**: `CONCURRENCY=5` retries immediately on OpenAI/OpenRouter failures
**Impact**: Thundering herd intensifies outage
**Fix**: Opossum.js circuit breaker (10 fails → 30s reset)

### [MEDIUM] No outbound webhook delivery pattern
**Evidence**: Currently receives only; when customer webhooks added, no template
**Fix**: Design outbound pattern now: request/response log, exponential backoff, admin UI

---

## Dimension 44 — External API Versioning

### [CRITICAL] Stripe API version unpinned
**File**: `server/stripeClient.ts:11-15`
**Evidence**: Comment: "Omitting apiVersion makes SDK use bundled LatestApiVersion"
**Impact**: Breaking changes deploy silently on SDK update
**Fix**: `new Stripe(key, { apiVersion: "2024-11-20" })`

### [HIGH] OpenAI models as rolling aliases
See Dimension 41.

### [HIGH] OpenRouter slugs manual
See Dimension 41.

### [MEDIUM] No changelog subscriptions
**Fix**: IFTTT/Zapier: Stripe/OpenAI/Resend status pages → Slack

### [MEDIUM] Usage-based pricing surprise risk (OpenAI)
**Fix**: Hard per-user daily token budget; soft alerts at 80%

---

## Dimension 45 — Product Analytics & Behavior Observability

### [CRITICAL] No event tracking system
**Evidence**: No PostHog, Amplitude, Mixpanel; only GA4 client-side ID storage
**Impact**: Cannot measure feature adoption, drop-off, LTV, retention, time-to-value
**Fix**: Integrate PostHog or Amplitude; event naming convention; DAU/MAU dashboards

### [HIGH] No Sentry / error tracking (also Group G)
**Fix**: Add Sentry; tag by endpoint; alert on 5xx spike

### [HIGH] No session recording / heatmaps
**Fix**: Hotjar/FullStory on onboarding, content gen, citations

### [HIGH] No in-app feedback mechanism
**Fix**: Survicate / embedded feedback widget

### [MEDIUM] No conversion funnel instrumentation
**Fix**: Track: signup → first brand → first content → first citation → subscription

---

## Dimension 46 — Cost & Resource Efficiency

### [CRITICAL] No per-user LLM cost caps
**File**: `server/citationChecker.ts:313-483`, `server/contentGenerationWorker.ts:49-127`
**Evidence**: Unlimited prompts × 5 platforms × CONCURRENCY=5; 100 brands × 10 prompts × 5 = 5000 calls per run
**Impact**: Runaway token burn; abuser can cost VentureCite $1000s/month
**Fix**: Per-tier budgets (free 100K tokens/day, pro 1M); hard block at 100%; alert at 80%

### [HIGH] Content generation makes 6 API calls per article
**File**: `server/contentGenerationWorker.ts:49-127`
**Evidence**: `humanizeContent()` 3 rewrite passes × 2 calls = 6 per article
**Impact**: ~30K tokens ≈ $0.90 per article; 100 articles free tier = $90
**Fix**: Reduce passes on free tier (1); track tokens; enforce budget

### [HIGH] Citation checks O(N×M) with no pagination
**File**: `server/citationChecker.ts:313-483`
**Evidence**: `runBrandPrompts()` fetches all prompts, runs all concurrently; no chunking; no resume
**Impact**: Long jobs timeout; retry restarts from zero
**Fix**: Paginated runs (limit=10); resumable checkpoints

### [HIGH] Multiple server instances duplicate cron cost (also Group F)
**Fix**: Leader election

### [HIGH] N+1 LLM calls in competitor discovery
**File**: `server/scheduler.ts:223-236`
**Evidence**: `runForEveryBrand()` iterates, each brand calls LLM
**Fix**: Batch; cache results 30-day TTL

### [MEDIUM] No cost monitoring dashboard
**Fix**: `api_costs` table logging every call (service, tokens, cost estimate); admin dashboard

---

## Positive observations

1. Stripe webhook signature verification present (`stripe.webhooks.constructEvent()`)
2. Env validation at boot (Zod)
3. Rate limiting on AI endpoints
4. Async LLM calls wrapped in try/catch
5. Resend graceful degradation (skips if key missing)
6. OpenRouter optional fallback
7. Ownership scoping prevents cross-user leak
8. Stripe webhook idempotency (`webhook_events`)
9. Strict CSP in production
10. Publishable vs secret key separation for Stripe
