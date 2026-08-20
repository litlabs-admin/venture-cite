# Group I — Product

## Executive Summary

VentureCite has four critical gaps threatening revenue, user retention, and discoverability:

1. **Onboarding state not persisted server-side** — all three client implementations use localStorage.
2. **No RBAC** — only flat user-tier model, zero scoped permissions.
3. **Usage-limit race conditions** — read-before-write without atomicity.
4. **SPA serves 200 for all routes** — no 404s; crawlability broken.

## Dimension 47 — Onboarding & First-Run

### CRITICAL: Onboarding State Not Persisted Server-Side

Files: GuidedOnboarding.tsx:117, OnboardingChecklist.tsx:75, SidebarOnboarding.tsx:122

Evidence:
- GuidedOnboarding: localStorage.getItem("hasSeenOnboarding")
- OnboardingChecklist: localStorage.getItem("venturecite-onboarding")
- SidebarOnboarding: localStorage.getItem("${SEEN_KEY_PREFIX}${user.id}")
- Migration 0014 creates visibilityGuideVisitedAt but only SidebarOnboarding uses it

Impact:
- Cross-browser sync failure: dismiss in Firefox, login Chrome = full tour again
- Account leakage: User A logs out, User B logs in = sees A's hasSeenOnboarding flag
- Resume broken: no recovery if localStorage clears
- Cannot adapt onboarding to actual user progress (brands created, articles written)

Fix:
- Persist steps server-side via POST /api/onboarding/mark-step-complete/{stepId}
- Clear all venturecite-* localStorage keys on logout
- Extend schema: onboardingStep, onboardingStartedAt, toursDismissedCount

---

### MEDIUM: Three Overlapping Onboarding UIs

Files: GuidedOnboarding.tsx, OnboardingChecklist.tsx, SidebarOnboarding.tsx

Evidence: 7-step modal + 4-step checklist + 4-step sidebar. Different language, icons, emphasis. All shown on day 1.

Impact: Cognitive overload, repetition fatigue, unclear CTAs

Fix: Consolidate to one server-driven UI. Use SidebarOnboarding as main. Remove GuidedOnboarding modal.

---

## Dimension 48 — User Permissions & Role Complexity

### CRITICAL: No RBAC — Only Flat Tier Model

Files: schema.ts:13, auth.ts:15, routes.ts:599

Evidence:
- Users table: accessTier (free/beta/pro/enterprise/admin) + isAdmin (0/1)
- No roles, role_permissions, or team_members tables
- Only two isAdmin uses: middleware guard + /api/beta/codes gate
- No team features or audit trail for admin actions

Impact: Cannot delegate. No escalation path. Super-admin is binary. SaaS scaling broken.

Fix: Create roles, role_permissions, team_members tables. Add immutable audit log.

---

### HIGH: Permission Checks Duplicated & Inconsistent

Files: ownership.ts, auth.ts:77-88, routes.ts

Evidence: ownership.ts queries DB, auth.ts queries DB again. Some routes skip ownership. Inconsistent error codes.

Fix: Standardize on ownership.ts. Call requireBrand once per request. Use DB constraints.

---

## Dimension 49 — Commercial / Pricing Logic

### HIGH: Usage Limits Enforced Without Atomicity — Race Condition

Files: routes.ts:395-416, 2943-2947, 1109-1117

Evidence:
- checkUsageLimit() reads usage, checks limit, returns.
- Then createBrand() or createArticle() called separately.
- No transaction. Race: 6 concurrent requests, all pass check, all create = over limit.

Impact: Free-tier user creates 6 articles (limit=5). Revenue leakage.

Fix: Wrap check+insert in DB transaction with FOR UPDATE lock. Add DB check constraint.

---

### MEDIUM: Pricing Logic Scattered Across Files

Files: schema.ts, stripeClient.ts, setupProducts.ts, routes.ts, webhookHandlers.ts

Evidence: usageLimits in schema, Stripe products in setupProducts, checkUsageLimit inline in routes.

Fix: Create server/pricing.ts with PRICING_PLANS. Export to all consumers. Validate Stripe products on startup.

---

### MEDIUM: No Dunning or Grace Period for Failed Payments

Files: webhookHandlers.ts

Evidence: No pause/suspend logic on payment.failed. No retry window.

Fix: Add suspensionReason, suspendedAt to users. Implement exponential backoff (day 1, 3, 5, then suspend).

---

## Dimension 50 — API Abuse

### MEDIUM: AI-Generation Rate-Limit May Not Be Per-User

Files: routes.ts:72-79

Evidence: aiLimitMiddleware (10 req/min) but aiRateKey not visible. Cannot verify per-user vs per-IP.

Fix: Verify aiRateKey uses req.user?.id || req.ip.

---

### MEDIUM: No Bulk Export Prevention

Files: routes.ts:1788-1794

Evidence: GET /api/articles unthrottled, no pagination. Competitor bulk-exports your content.

Fix: Paginate (max 100/page). Track exports. Alert on >1000 rows/day.

---

## Dimension 51 — Notification Fatigue

### MEDIUM: No Unified Notification Preferences Center

Files: routes.ts:159-202

Evidence: PATCH /api/user/preferences accepts only weeklyReportEnabled. No granular control.

Fix: Create /settings/notifications page. Add notification_preferences table.

---

## Dimension 52 — SEO & Discoverability

### CRITICAL: SPA Serves 200 for All Routes — No 404s

Files: server/vite.ts:70-85

Evidence: app.use("*", (_req, res) => res.sendFile(index.html)) returns 200 for all paths.

Impact: Crawlers cannot distinguish 404 from real pages. Sitemap breaks.

Fix: Pre-render public pages as static HTML. Return 404 status for missing pages.

---

### HIGH: Missing robots.txt and sitemap.xml

Evidence: Zero files found.

Fix: Create robots.txt (disallow /dashboard, /api). Create /sitemap.xml endpoint.

---

### HIGH: Meta Tags Static, Not Dynamic

Evidence: index.html has no meta. landing/pricing use client-side Helmet. No OG image.

Fix: Pre-render as static HTML with inline meta. Set OG tags in Helmet.

---

## Positive Observations

1. Ownership scoping comprehensive (30+ helpers, anti-enumeration 404 returns)
2. CSP well-configured (strict for scripts in production)
3. Graceful shutdown implemented (10s grace period)
4. Stripe idempotency via webhook_events table
5. Rate limiting on AI endpoints (10 req/min)
6. Onboarding UIs well-designed
7. Email sanitization (escapeHtml prevents XSS)
8. Beta invite codes functional (expiry, max uses)
9. Helmet security headers enabled
10. Usage limits defined centrally
