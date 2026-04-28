# VentureCite — Phase 2 Completion Log

> Tracks what was built or fixed at each stage, what changed, and how to verify it.
> Appended as each item in phase2_goals.md is completed.

---

## Track 1 — Auth Fabric Fixes

**Goal:** Replace every raw `fetch()` call in Phase 2 feature pages with `apiRequest()` so the Bearer token is attached and 401 errors are surfaced correctly via `ApiError`.

**Status:** Complete

### Background

`apiRequest()` in `client/src/lib/queryClient.ts` calls `buildHeaders()`, which attaches the Supabase JWT Bearer token to every request. Pages that used raw `fetch()` sent requests without auth headers — backend returned 401, the page silently showed empty data with no error message, and users appeared logged out when they weren't.

### Files Changed

| File                                        | Change                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/client-reports.tsx`       | Added `apiRequest` import. Replaced `fetch(\`/api/client-reports/${selectedBrandId}?period=${reportPeriod}\`)`with`apiRequest("GET", ...)`.                          |
| `client/src/pages/revenue-analytics.tsx`    | Added `apiRequest` import. Replaced `fetch(url)` with `apiRequest("GET", url)` in the revenue analytics query.                                                       |
| `client/src/pages/ai-traffic.tsx`           | Added `apiRequest` import. Replaced `fetch(url, { credentials: "include" })` with `apiRequest("GET", url)` and removed manual `!res.ok` throw (ApiError handles it). |
| `client/src/pages/community-engagement.tsx` | Replaced `fetch(postsQueryKey, { credentials: "include" }).then(r => r.json())` with `apiRequest("GET", postsQueryKey).then(r => r.json())` in the posts query.      |

### How to Test

1. Log in and navigate to Client Reports → select a brand → metrics should load (not silently blank)
2. Navigate to Revenue Analytics → revenue data loads (not silently blank)
3. Navigate to AI Traffic → sessions/stats load (not silently blank)
4. Navigate to Community Engagement → community posts load (not silently blank)
5. In DevTools → Network: confirm every `/api/*` request in these pages carries `Authorization: Bearer <token>` header

### Pass Criteria

- [x] No raw `fetch()` calls in Phase 2 feature pages (except `login.tsx`, `register.tsx`, `forgot-password.tsx`, `landing.tsx` which handle pre-auth flows)
- [x] All four pages import and use `apiRequest`
- [x] `npx tsc --noEmit` clean

---

## Track 2 — apiRequest Signature Fix (crawler-check.tsx)

**Goal:** Fix incorrect `apiRequest` parameter order in `crawler-check.tsx` that caused the crawler permissions check to silently fail.

**Status:** Complete

### Background

`apiRequest(method, url, data)` is the correct signature. `crawler-check.tsx` was calling `apiRequest(url, method, data)` — the method string ended up as the URL, causing a malformed fetch that threw an error before reaching the server. The onSuccess handler then never ran and the page showed no results.

Additionally the return was typed `as unknown as CrawlerCheckResponse` without calling `.json()`, meaning the caller received a raw `Response` object, not the parsed data.

### Files Changed

| File                                 | Change                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/crawler-check.tsx` | Fixed `apiRequest("/api/check-crawler-permissions", "POST", ...)` → `apiRequest("POST", "/api/check-crawler-permissions", ...)`. Added `.json()` call to parse the response. |

### How to Test

1. Navigate to Crawler Check
2. Enter any URL (e.g., `https://example.com`) and click Check
3. Results should appear with robot.txt analysis and crawler access scores

### Pass Criteria

- [x] Crawler check returns results for a valid URL
- [x] `npx tsc --noEmit` clean

---

## Track 3 — Onboarding Completion Fixes

**Goal:** Fix four onboarding flow issues: dashboard false-error banner, "View AI Visibility Guide" step not completing across devices, "Generate content" step not reflecting server data, and schedule tab stale copy.

**Status:** Complete

### Background

Four issues were found in the Getting Started / dashboard flow and fixed in the same commit as the Phase 1 hardening pass:

1. **Dashboard "Some data failed to load" banner** showed for new users with no brands on first render due to a transient 401 race.
2. **"View AI Visibility Guide" step** read `localStorage["venturecite-visibility-visited"]` but nothing in the codebase wrote it — the step was permanently stuck at incomplete.
3. **"Generate AI-optimized content" step** inferred completion from `articles.length` on the client, but the server filtered articles by brand ownership — a user whose articles had a NULL `brandId` would see the step remain stuck.
4. **Schedule tab copy** said "Automatically regenerate prompts… Generates 10 new prompts" which was wrong after the tracked-prompts model change.

### Files Changed

| File                                          | Change                                                                                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/home.tsx`                   | `loadError` gated behind `hasBrands &&` — banner only fires when real data failed, not for empty accounts.                                                                                           |
| `migrations/0014_user_onboarding_flags.sql`   | **Created** — `ALTER TABLE users ADD COLUMN IF NOT EXISTS visibility_guide_visited_at TIMESTAMP`.                                                                                                    |
| `shared/schema.ts`                            | Added `visibilityGuideVisitedAt: timestamp("visibility_guide_visited_at")` to `users` table.                                                                                                         |
| `server/routes.ts`                            | Extended `/api/onboarding-status` to include `hasArticles` boolean and `visibilityVisited` boolean from user row. Added `POST /api/onboarding/visibility-visited` endpoint (idempotent).             |
| `client/src/pages/ai-visibility.tsx`          | `useEffect` on mount: POSTs to `/api/onboarding/visibility-visited` then invalidates onboarding-status query.                                                                                        |
| `client/src/components/SidebarOnboarding.tsx` | `content` step `checkFn` reads `d?.hasArticles`. `visibility` step `checkFn` reads `d?.visibilityVisited`.                                                                                           |
| `client/src/pages/citations.tsx`              | Schedule tab description updated to "Automatically re-check your tracked prompts and refresh suggestions on a schedule." Caption updated to "Re-checks your tracked prompts across all 5 platforms." |

### How to Test

```bash
# 1. Dashboard banner
# Register a new account → navigate to / → no "Some data failed to load" banner

# 2. Visibility step cross-device
# Open /ai-visibility on browser A
# In another browser (or after clearing localStorage), reload sidebar
# → Step 3 "View the AI Visibility Guide" shows as Done
# DB check: SELECT visibility_guide_visited_at FROM users WHERE id=...
# → should be non-null

# 3. Articles step
# Account with ≥1 article → /api/onboarding-status response includes hasArticles: true
# → Step 2 "Generate AI-optimized content" shows as Done

# 4. Schedule copy
# Citations → Schedule tab → no text containing "regenerate" or "10 new prompts"
```

### Pass Criteria

- [x] No "Some dashboard data failed to load" banner on fresh account login
- [x] Visibility step completes after visiting `/ai-visibility`
- [x] `hasArticles` returned from `/api/onboarding-status`
- [x] `visibilityVisited` returned from `/api/onboarding-status`
- [x] Schedule tab copy contains no stale strings

---

## Explicitly Out of Scope (deferred, not shipped)

The following items were identified during the Phase 2 audit but deferred. Each entry explains what it would do and why it was too large to include in this pass.

### A. Outreach email sending via Resend

**What it would do:** Replace the current manual "track your own emails" workflow with a real Resend integration. Users would compose an outreach email inside VentureCite, click Send, and the email would be delivered via the Resend API. Open/click/reply webhooks from Resend would update `outreach_emails.status` automatically.

**Why it's out of scope now:** Requires a Resend API key configured per deployment, domain verification (DKIM, SPF) for the sending domain, webhook endpoint hardening (signature verification), and a decision on whether VentureCite sends from a shared domain or users supply their own. Also raises CAN-SPAM/GDPR compliance questions (unsubscribe links, consent). Multi-day effort touching backend, frontend, and legal/ops.

### B. Real publication discovery (Outreach tab)

**What it would do:** Replace the "Coming Soon" banner in the Publication Discovery tab with real data: crawl media-outlet databases (similar to Hunter.io or Apollo), identify publications whose readers match the brand's audience, surface contact emails, and score each by domain authority and AI-citation frequency.

**Why it's out of scope now:** Requires either a third-party contact database API (expensive, per-seat licensing) or a custom web crawler + index. Either path is a week+ of backend work before a single user can see results. The existing "Coming Soon" placeholder is honest and doesn't mislead.

### C. Revenue webhook HMAC verification

**What it would do:** The `/api/revenue/webhook` endpoint currently accepts any POST without verifying the source. Adding HMAC verification for Shopify (`X-Shopify-Hmac-Sha256`) and Stripe (`stripe-signature`) would prevent forged revenue events from inflating analytics.

**Why it's out of scope now:** The revenue analytics feature has zero real users generating real purchase events yet. Shipping the HMAC check first (before the webhook even has traffic) is the right order, but it belongs in a dedicated security pass with its own test suite — not as part of a frontend auth-fabric batch.

### D. GEO Analytics IDOR audit

**What it would do:** Verify that `brandIdParamHandler` in `server/auth.ts` correctly enforces ownership on every `/api/geo-analytics/*` route, and add explicit ownership checks to any Phase 2 routes that were added after `brandIdParamHandler` was written.

**Why it's out of scope now:** This is a security audit requiring reading all ~300 route handlers, not just a code change. Needs a threat-model document, a list of every route with a `brandId` parameter, and a test for each ownership boundary. Estimated 2–3 days to do correctly.

### E. Zod request-body validation on Phase 2 endpoints

**What it would do:** Every Phase 2 `POST`/`PATCH` route would validate the request body against a Zod schema before hitting storage. Today the server trusts the client for field names and types — a crafted request can send extra fields that Drizzle ignores but that waste DB bandwidth, or omit required fields and produce a cryptic DB error.

**Why it's out of scope now:** Requires defining shared Zod schemas in `shared/schema.ts` for ~40 insert payloads, wiring them into a `validateBody(schema)` middleware, and migrating every route caller. That's the same scope as deferred item C from the Phase 1 hardening pass and needs its own review cycle.

### F. Per-user daily OpenAI token cap

**What it would do:** Track cumulative OpenAI tokens used per user per calendar day in `metricsHistory` or a dedicated `token_usage` table. Reject requests that would exceed the user's tier cap with a friendly "Daily AI limit reached" toast instead of letting costs run uncapped.

**Why it's out of scope now:** `aiLimitMiddleware` already limits requests-per-minute (10 req/min). A daily token cap requires counting tokens before the request, which means calling `tiktoken` (or estimating from character count) on every prompt. The token-cap thresholds also need product/pricing decisions before engineering can hard-code values.

### G. Publication Intelligence (full feature)

**What it would do:** The current page is an honest "Coming Soon" placeholder. The full feature would: fetch `publication_references` and `publication_metrics` rows for the selected brand, show which outlets have cited the brand or its competitors, rank them by AI citation frequency across engines, and surface "pitch opportunities" (outlets that cite competitors but not the user's brand).

**Why it's out of scope now:** Requires a data pipeline that actually populates `publication_references` rows — either from AI citation scraping results or manual import. The schema exists but there's no ingestion job. Until there's data, a real UI would just render an empty state identical to the stub. Ship when the ingestion pipeline exists.

---

## Track 4 — Routing & Sidebar Integration

**Goal:** Every Phase 2 feature page should be routable from its proper navigation entry, not hidden behind a placeholder "Coming Soon" splash.

**Status:** Complete

### Background

`client/src/App.tsx` was wiring every Phase 2 route to a `comingSoon(name)` helper that rendered the generic `<ComingSoon>` component — even though full implementations for all 18 pages already existed under `client/src/pages/`. The sidebar grouped everything under a collapsible "Upcoming" section with "Soon" labels, so users couldn't tell real features from placeholders.

### Files Changed

| File                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/src/App.tsx`                | Added 18 `React.lazy()` imports for every Phase 2 page. Replaced all `comingSoon("…")` placeholders with the real component in each `<Route>`. Deleted the dead `comingSoon()` helper and its `<ComingSoon>` import (still imported inline by `publication-intelligence.tsx`, which intentionally remains a placeholder).                                                                                                                                                                  |
| `client/src/components/Sidebar.tsx` | Deleted the collapsible "Upcoming" section and `Phase2Item` component. Promoted Phase 2 pages into three new nav groups with proper icons: **Analytics** (GEO Rankings, GEO Analytics, AI Intelligence, AI Traffic, Reports, Revenue), **Growth** (Opportunities, Outreach, Community, Competitors, Publications), **Optimize** (GEO Tools, Signals, Crawler Check, FAQ Manager, Fact Sheet, Integrations, AI Agent). Each item uses a lucide icon from the same visual family as Phase 1. |

### Pass Criteria

- [x] Clicking any sidebar item navigates to its real page, not a placeholder
- [x] `npx tsc --noEmit` clean
- [x] No unused imports of `ComingSoon` in `App.tsx`

---

## Track 5 — Page Layout & Styling Consistency

**Goal:** Every Phase 2 page matches the Phase 1 layout contract so the product feels like one app. Phase 1 pages use `<div className="space-y-8">` as the root (AppLayout already supplies the container + max-width + padding) and `<PageHeader title description actions />` for the heading.

**Status:** Complete

### Background

Phase 2 pages had accumulated three separate "personal styles":

1. Some wrapped content in a redundant `container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl` — duplicating AppLayout's own container.
2. Some used gradient full-page backgrounds (`bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950`, `bg-stone-50`, etc.).
3. Gradient KPI cards with hardcoded `text-white`, `text-blue-100`, `w-8 h-8` icons — invisible in light mode.
4. Manual back-to-home buttons, even though the sidebar handles navigation.
5. Custom `h1` with `text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent` instead of the shared `PageHeader` component.

### Files Changed

Every Phase 2 feature page. Summary by category:

**Root wrapper normalized** — Replaced `container mx-auto ... max-w-7xl` with `<div className="space-y-8">` (17 pages):
`agent-dashboard.tsx`, `ai-intelligence.tsx`, `ai-traffic.tsx`, `analytics-integrations.tsx`, `brand-fact-sheet.tsx`, `client-reports.tsx`, `community-engagement.tsx`, `competitors.tsx`, `crawler-check.tsx`, `faq-manager.tsx`, `geo-analytics.tsx`, `geo-opportunities.tsx`, `geo-rankings.tsx`, `geo-signals.tsx`, `geo-tools.tsx`, `outreach.tsx`, `revenue-analytics.tsx`.

**PageHeader adopted everywhere** — Custom manual headers replaced with `<PageHeader title description actions />`. Actions slot is used for brand selectors where applicable (ai-traffic, revenue-analytics, client-reports, outreach, agent-dashboard, geo-signals, geo-tools) or a primary action button (competitors → "Add Competitor").

**Hardcoded colors stripped** — Global sed pass across all 17 pages converted:

- `bg-slate-900`/`bg-slate-800`/`border-slate-700`/`border-slate-600` → Card defaults
- `bg-slate-800/50` → `bg-muted/50`
- `text-slate-400`/`text-slate-500`/`text-slate-600` → `text-muted-foreground`
- `text-slate-300` → `text-foreground`
- `text-white` → `text-foreground`
- `text-gray-900 dark:text-white` → `text-foreground`
- `text-{color}-400` → `text-{color}-500` (works in both themes)

**Gradient stat cards rewritten** in `ai-traffic.tsx`, `geo-opportunities.tsx`, `client-reports.tsx` to match the Phase 1 KPI pattern — plain Card with `p-5`, uppercase tracking-wide label, `w-4 h-4 text-muted-foreground` icon, `text-3xl font-semibold text-foreground tracking-tight` value.

**Spinners unified** — `revenue-analytics.tsx` custom border-spinner replaced with `<Loader2 className="h-8 w-8 animate-spin" />`.

**Banner/alert blocks normalized** — `geo-rankings.tsx` "Live Citation Monitoring" green banner and `analytics-integrations.tsx` blue info alert converted from hardcoded `bg-{color}-50 dark:bg-{color}-950 text-{color}-800` boxes to plain `<Card>` with a neutral icon and semantic text colors.

**Badges unified** — `crawler-check.tsx` allowed/blocked/unknown badges use `variant="outline"` with semantic border/text tints instead of `bg-{color}-100 text-{color}-800` hardcoding.

**publication-intelligence.tsx rewritten** — Was a 60-line bespoke "Coming Soon" splash with gradient min-h-screen wrapper, `text-4xl` h1, and colored badge grid. Now a 48-line page using `PageHeader` + a single `<Card>` with `Newspaper` icon — consistent with the rest of the app while still honestly labeled "Coming Soon".

### Pass Criteria

- [x] No `min-h-screen` or full-page `bg-gradient-*` wrappers in any Phase 2 page
- [x] No `text-white` or `text-slate-*` outside of intentional status indicators
- [x] No `w-8 h-8` icons inside KPI cards (standard is `w-4 h-4`)
- [x] Every page uses `PageHeader` and `space-y-8` root
- [x] `npx tsc --noEmit` clean

---

## Track 6 — React Query Key Handling

**Goal:** Fix the default `getQueryFn` in `client/src/lib/queryClient.ts` so Phase 2 pages whose `queryKey` carries filter objects or conditional brand IDs actually hit the right URL instead of building `/api/foo/[object Object]`.

**Status:** Complete

### Background

The previous `getQueryFn` did `fetch(queryKey.join("/"))`. Three failure modes:

1. **Object segments become `[object Object]`** — `agent-dashboard.tsx` uses `queryKey: ["/api/agent-tasks", { brandId, status }]` which is the idiomatic way to trigger refetches when filters change. The old join produced `/api/agent-tasks/[object Object]` and all agent-dashboard tabs returned 404.
2. **Undefined segments become the literal string `undefined`** — any page that constructs `["/api/x", selectedBrandId]` before the brand list loads hit `/api/x/undefined`.
3. **No way to express query-string params** — pages had to write custom `queryFn` overrides just to add `?brandId=…`, which most didn't.

### Files Changed

| File                            | Change                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/lib/queryClient.ts` | Extracted a `urlFromQueryKey()` helper. First segment is the base URL; subsequent primitive segments become path parts; **object segments are merged into `URLSearchParams`**; `null`/`undefined`/`""` segments are skipped entirely. `getQueryFn` now calls `urlFromQueryKey(queryKey)` instead of `.join("/")`. |

### How It Behaves Now

| queryKey                                                        | Resulting URL                                       |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `["/api/brands"]`                                               | `/api/brands`                                       |
| `["/api/articles", "abc"]`                                      | `/api/articles/abc`                                 |
| `["/api/articles", ""]` or `["/api/articles", undefined]`       | `/api/articles` (not `/api/articles/undefined`)     |
| `["/api/agent-tasks", { brandId: "abc", status: "completed" }]` | `/api/agent-tasks?brandId=abc&status=completed`     |
| `["/api/agent-tasks", { brandId: "abc", status: undefined }]`   | `/api/agent-tasks?brandId=abc` (undefined filtered) |
| ``[`/api/prompt-portfolio?brandId=${id}`]``                     | passes through verbatim                             |

Custom `queryFn` overrides in `ai-traffic.tsx`, `client-reports.tsx`, `revenue-analytics.tsx`, `community-engagement.tsx` are untouched and still work (they still return `Response`, not parsed JSON, so the existing `.then(r => r.json())` wrappers are unchanged).

### Pass Criteria

- [x] `agent-dashboard.tsx` Tasks / Rules / Outreach tabs actually return data
- [x] `enabled: !!selectedBrandId` no longer required purely to avoid `/undefined` URLs (still useful to skip unnecessary requests)
- [x] `npx tsc --noEmit` clean
- [x] All existing simple-queryKey pages (Phase 1 + Phase 2) behave identically

---

## Track 7 — Database Schema Parity

**Goal:** On a fresh deploy, every table referenced by Phase 2 storage methods must exist in the database before the server takes its first request.

**Status:** Complete

### Background

`shared/schema.ts` declared 44 Drizzle tables, but the handcrafted SQL migrations (`0001`–`0014`) only ever executed `CREATE TABLE` for ~15 of them. The remaining 29 Phase 2 tables existed solely in Drizzle source and were only created via `npm run db:push` (a manual Drizzle-kit command). Worse, `migrations/0001_auth_sync.sql` (lines 63–91) runs `ALTER TABLE public.<phase2_table> ENABLE ROW LEVEL SECURITY` on all 29 of those tables — which hard-fails with `relation does not exist` on any fresh DB where `db:push` wasn't run first. Server boot in `server/index.ts:240` runs SQL migrations but does **not** invoke `drizzle-kit push`, so the schema drift is never reconciled.

Effect: every Phase 2 storage query threw `relation "public.<table>" does not exist`, the route caught it, the frontend rendered an empty state, and users saw a feature that silently returned nothing.

### Files Changed

| File                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migrations/0000_phase2_schema.sql` | **Created** — 559-line migration that creates all 29 missing Phase 2 tables with `CREATE TABLE IF NOT EXISTS`, exact column types matching `shared/schema.ts`, matching `ON DELETE CASCADE`/`SET NULL` FK semantics, and 31 indexes. Named `0000_` so it sorts **before** `0001_auth_sync.sql` and the RLS statements find the tables they need. Idempotent — safe to run alongside any environment that already executed `db:push`. |

### Tables Created

Revenue & commerce: `brand_visibility_snapshots`, `ai_commerce_sessions`, `purchase_events`.
Publications: `publication_references`, `publication_metrics`.
Competitors: `competitors`, `competitor_citation_snapshots`.
GEO tools: `listicles`, `wikipedia_mentions`, `bofu_content`, `faq_items`, `brand_mentions`.
AI intelligence: `prompt_portfolio`, `citation_quality`, `brand_hallucinations`, `brand_fact_sheet`, `metrics_history`, `alert_settings`, `alert_history`.
AI traffic & sources: `ai_sources`, `ai_traffic_sessions`, `prompt_test_runs`.
Agent / automation: `agent_tasks`, `outreach_campaigns`, `publication_targets`, `outreach_emails`, `automation_rules`, `automation_executions`.
Community: `community_posts`.

### Pass Criteria

- [x] Fresh DB boot applies `0000_phase2_schema.sql` before `0001_auth_sync.sql`, RLS statements succeed
- [x] Existing environments (where `db:push` was run manually) see `0000_` as a no-op — every `IF NOT EXISTS` skips
- [x] Every Phase 2 endpoint can now execute its storage query without hitting `relation does not exist`
- [x] `npx tsc --noEmit` clean

---

## Track 8 — Phase 1 → Phase 2 Data Flow

**Goal:** Phase 2 analytics pages (AI Intelligence, AI Traffic, Opportunities, Client Reports) should show real numbers derived from Phase 1 data (articles, brand prompts, citation runs, geo rankings) — not empty arrays waiting for a Phase 2 ingestion pipeline that doesn't exist yet.

**Status:** Complete

### Background

Most Phase 2 stats endpoints read exclusively from their own Phase 2 tables (`prompt_portfolio`, `citation_quality`, `ai_sources`, etc.). Those tables are only populated when the user manually creates rows through a Phase 2 CRUD flow — which no user would do on day one, so every stats tab rendered zeros. Meanwhile the user's Phase 1 `geo_rankings` rows contained all the ground-truth citation data needed to compute these same stats.

### Files Changed

| File                                     | Change                                                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/databaseStorage.ts`              | Added Phase 1 fallbacks (read-only, no writes) to three storage methods. Each method first checks its native Phase 2 table; if empty, synthesises the same response shape by joining `brand_prompts` × `geo_rankings`. |
| `server/routes.ts`                       | Rewrote `/api/geo-opportunities/:brandId` to compute `keyStats` and per-platform `citationShare` from the brand's actual cited `geo_rankings.citingOutletUrl` domains instead of hardcoded industry averages.          |
| `client/src/pages/geo-opportunities.tsx` | Added an empty-state banner above the stats grid when `totalCitedRankings === 0` explaining "run a citation check first."                                                                                              |

### Fallback Logic Details

**`getShareOfAnswerStats(brandId)`** (powers `/api/prompt-portfolio/stats/:brandId` used by AI Intelligence)

- If `prompt_portfolio` is empty → load `brand_prompts` for the brand, pull corresponding `geo_rankings` via `getGeoRankingsByBrandPromptIds`, compute: `totalPrompts` = rankings count, `citedPrompts` = rankings where `isCited=1`, `shareOfAnswer` = %, bucket by `aiPlatform` as `byCategory`.
- If `prompt_portfolio` has data → original Phase 2 behavior.

**`getCitationQualityStats(brandId)`** (powers citation-quality view in AI Intelligence)

- If `citation_quality` is empty → load cited `geo_rankings`. `rank 1–3` → primary citation, `rank 4+` or null → secondary. Average quality score computed from rank position (rank 1 = 100 → rank 10 = 10, null rank baseline = 50). Groups `citingOutletUrl` by source-type bucket (reddit/quora/wikipedia/youtube/linkedin/medium/other).

**`getTopAiSources(brandId, limit)`** (powers "Top Citation Sources" on AI Traffic)

- If `ai_sources` is empty → group the brand's cited `geo_rankings` by `(domain, aiPlatform)`, return synthetic `AiSource`-shaped rows with `authorityScore = min(100, count × 10)`, `occurrenceCount = count`, most-recent URL/context, and `sourceType` inferred from domain. Nothing is persisted; the synthesis is recomputed on each request.

### `/api/geo-opportunities/:brandId` — Real Per-Brand Computation

- Loads `brand_prompts` + the brand's article-scoped `geo_rankings`, filters to `isCited=1`.
- Extracts the domain of each ranking's `citingOutletUrl`.
- Buckets into reddit / quora / own-site / third-party based on the brand's own `website`.
- `keyStats`: real per-brand percentages, not the old hardcoded 91/21/14.3/9 industry averages.
- `platforms`: returns every `GEO_PLATFORMS` entry with its `citationShare` **overridden** to the brand's actual share from cited rankings, plus a new `citationCount` field. Sorts descending by real share so the platforms this brand is actually cited on appear first.
- `totalCitedRankings` added to the response so the frontend can render a "no citation data yet" hint when it's zero instead of a grid of false 0%.

### Pass Criteria

- [x] AI Intelligence → Share of Answer tab shows real counts for brands with `geo_rankings` rows, even if they've never touched `prompt_portfolio`
- [x] AI Intelligence → Citation Quality tab shows rank-derived primary/secondary split from real citations
- [x] AI Traffic → Top Citation Sources tab lists real domains from the brand's citing outlets
- [x] Opportunities → no brand sees "21% Reddit" when they have no Reddit citations; zero-data state is honest
- [x] Every fallback is a read-only projection — no Phase 1 data is copied into Phase 2 tables
- [x] `npx tsc --noEmit` clean

---

## Track 9 — geo-signals UI Consistency & geo-tools Crash

**Goal:** Finish the two Phase 2 pages still carrying the old dark-only styling and fix a latent crash on the GEO Tools → Mentions tab.

**Status:** Complete

### Background

- `geo-tools.tsx` Mentions tab read `mentionsData.data.stats.total`, but the server at `/api/brand-mentions/:brandId` returns `{ data: mentions[], stats: {…} }` where `stats` is a sibling of `data`, not nested inside. Any brand with no mentions rendered `TypeError: Cannot read properties of undefined (reading 'total')` and unmounted the whole tab.
- `geo-signals.tsx` was the last Phase 2 page still using the old dark theme: `bg-slate-950 via-slate-900 to-violet-950` background, `text-white` labels, violet accent buttons, `data-[state=active]:bg-violet-600` tabs, and `w-8 h-8 text-violet-400` KPI icons.

### Files Changed

| File                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/geo-tools.tsx`   | Mentions tab wrapped in an IIFE that extracts `stats` and `mentions` with safe defaults (`{ total: 0, byPlatform: {}, bySentiment: {…} }`). All 6 accessor paths corrected — `stats` read from `mentionsData.stats` (not `.data.stats`) and `mentions` read from `mentionsData.data` (array, not object).                                                                                                                                                                                                                                                                                                                                                                     |
| `client/src/pages/geo-signals.tsx` | Dark-only styling normalized via sed: slate backgrounds/borders → Card defaults; `text-white` → `text-foreground`; `text-{color}-400` → `text-{color}-500`; `data-[state=active]:bg-violet-600` stripped; `bg-violet-600 hover:bg-violet-700` primary buttons replaced with default Button variant. Top 4 stat cards rewritten to the Phase 1 KPI pattern (uppercase tracking-wide label, `w-4 h-4 text-muted-foreground` icon, `text-3xl font-semibold tracking-tight` value with de-emphasized denominator). Pipeline stage bubbles kept their color-coded status backgrounds (pass/warning/fail) with white icon foregrounds since those are meaningful status indicators. |

### Pass Criteria

- [x] GEO Tools → Mentions tab renders (with zeros) for any brand, even with no `brand_mentions` rows
- [x] GEO Signals renders correctly in both light and dark modes
- [x] No hardcoded `text-white` / `bg-slate-*` / `border-slate-*` remaining in `geo-signals.tsx` (one pipeline-status `bg-red-500` kept intentionally)
- [x] `npx tsc --noEmit` clean

---

## Cumulative Effect

After Tracks 1–9, every Phase 2 navigation entry:

- Routes to its real implementation (Track 4)
- Uses the same layout and typography as Phase 1 (Track 5)
- Carries Bearer auth correctly (Track 1) with proper query-string construction (Track 6)
- Queries tables that actually exist in every deployed database (Track 7)
- Shows real data derived from the user's Phase 1 citation runs wherever Phase 2 tables are empty (Track 8)
- Renders without client-side crashes (Tracks 2 and 9)

Remaining work tracked in `PHASE2_FEATURES.md` under "Out of Scope" and "Production-readiness fixes" for each feature.

---

## Track 10 — Schema Promotions, Automation, and Data-Wiring Fixes

**Goal:** Three of the highest-value Phase 2 dashboards (GEO Analytics, Client Reports, AI Intelligence) were returning zeros even for users with real Phase 1 citation data. Five other Phase 2 surfaces (Competitors, Brand Fact Sheet, Mentions, Listicles, Hallucinations) required manual CRUD when they should have been data-driven. And three "analytics" Phase 2 tables (`prompt_portfolio`, `citation_quality`, `ai_sources`) were designed with richer fields than Phase 1 but nothing populated them — the dashboards only rendered anything because `getShareOfAnswerStats` / `getCitationQualityStats` / `getTopAiSources` had Phase 1 fallbacks. This track fixes all three problems as one coherent pass.

**Status:** Complete

### Resolution strategy

Instead of keeping the empty Phase 2 analytics tables (double-writing would just be a sync problem), promote the genuinely useful "richer fields" onto the Phase 1 tables that every operation already writes. Then automate the five manual features using existing `scheduler.ts` / `citationChecker.ts` / `safeFetch.ts` patterns — no new job queue, no new frameworks.

### Schema promotions

**Migration** — [migrations/0015_enrich_phase1_analytics.sql](migrations/0015_enrich_phase1_analytics.sql) (new). Six columns across four tables:

| From Phase 2                      | To Phase 1                     | How it gets populated                                                                                               |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `prompt_portfolio.category`       | `brand_prompts.category`       | Set at generation time — existing OpenAI brand-prompt call extended to return `category` + `funnelStage` per prompt |
| `prompt_portfolio.funnelStage`    | `brand_prompts.funnel_stage`   | Same call. TOFU / MOFU / BOFU                                                                                       |
| `prompt_portfolio.region`         | `brand_prompts.region`         | Defaults `"global"`, user-overridable                                                                               |
| `citation_quality.sourceType`     | `geo_rankings.source_type`     | Pattern-match on `citingOutletUrl` domain at write time (community / reference / video / web) — no LLM call         |
| `citation_quality.authorityScore` | `geo_rankings.authority_score` | Heuristic `min(100, priorDomainOccurrences * 10 + 10)`, computed from an in-memory map built once per run           |
| `citation_quality.relevanceScore` | `geo_rankings.relevance_score` | Returned by the existing `judgeCitation()` LLM call — one extra JSON field, zero extra calls                        |

Plus `brand_fact_sheet.source` ("manual" / "scraped" provenance) and `competitors.discovered_by` ("manual" / "ai" / "citation_mining").

After this, `prompt_portfolio`, `citation_quality`, and `ai_sources` are tombstones — not written to, not read from by new code. Their storage aggregate methods keep the same signatures but now read directly from the enriched Phase 1 columns.

### Automation pipelines (new)

All five automations live in `server/lib/*.ts`, use `safeFetchText` for external HTTP, and register weekly crons in `server/scheduler.ts`.

| Feature                      | Trigger                                                                                                   | Library                                                                 | Sources                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Competitor discovery         | On brand creation (async) + weekly cron Monday 7am UTC + manual `POST /api/competitors/discover/:brandId` | `server/lib/competitorDiscovery.ts`                                     | OpenAI inference from brand profile + LLM-judged mining of `geo_rankings.citationContext`                                                                                                 |
| Competitor citation tracking | Piggybacks on every citation run                                                                          | `server/citationChecker.ts` (detection pass after main brand detection) | Pre-filter each competitor's `buildBrandNameVariants` against every response; aggregate into `competitor_citation_snapshots` at run end                                                   |
| Brand fact-sheet scrape      | On brand creation (async) + monthly cron 1st at 10am + manual `POST /api/brand-facts/scrape/:brandId`     | `server/lib/factExtractor.ts`                                           | Fetch common subpages (`/about`, `/team`, `/pricing`, `/press`, `/faq`, `/company`), LLM-extract structured facts, idempotent insert                                                      |
| Brand mentions scan          | Weekly cron Monday 9am + manual `POST /api/brand-mentions/scan/:brandId`                                  | `server/lib/mentionScanner.ts`                                          | Reddit `search.json` (unauthenticated, 2s rate-delayed) + HN Algolia API + citation-context mining (domains cited ≥3 times). Sentiment-scored per mention                                 |
| Listicle discovery           | Weekly cron Monday 11am + manual `POST /api/listicles/discover/:brandId`                                  | `server/lib/listicleScanner.ts`                                         | Perplexity `sonar` model via OpenRouter (web-search built-in) for 5 brand-profile queries, then `safeFetchText` each returned URL, LLM-parse list structure                               |
| Hallucination detection      | Post-processing stage at end of every citation run                                                        | `server/lib/hallucinationDetector.ts`                                   | Compare each cited response against `brand_fact_sheet` (minimum 3 rows). LLM judge flags clear factual contradictions with severity; dedupes by `(brandId, claimedStatement, aiPlatform)` |

### Data-wiring fixes

- **`geo_rankings` filter widening.** Both [server/routes.ts:3634](server/routes.ts#L3634) (geo-analytics) and [server/routes.ts:3775](server/routes.ts#L3775) (client-reports) filtered `allRankings.filter(r => r.articleId && articleIds.includes(r.articleId))`. Citation checks write rows with `articleId: null, brandPromptId: bp.id` ([citationChecker.ts:335-336](server/citationChecker.ts#L335)) so every brand-prompt citation was silently dropped — users saw zeros even with hundreds of cited rankings. Both endpoints now build a `brandPromptIds` Set alongside `articleIds` and widen the filter to `(r.articleId && articleIds.has(r.articleId)) || (r.brandPromptId && brandPromptIds.has(r.brandPromptId))`.
- **Client-reports previous-period math.** Previously hardcoded `previousBMF: 0, previousSOV: 0, previousCitationRate: 0, previousPromptCoverage: 0`. Aggregation extracted into an `aggregate(windowStart, windowEnd)` closure and called twice — once for `[now - period, now]`, once for `[now - 2×period, now - period]`. Real trend arrows.
- **`/api/ai-sources/:brandId` endpoint** was calling `storage.getAiSources()` (reads only the Phase 2 table, always empty) instead of `storage.getTopAiSources()` (has the geo-rankings groupby fallback). Switched.
- **`metrics_history` auto-populate.** `storage.recordCurrentMetrics()` existed but was never called. New `server/lib/metricsSnapshot.ts` writes three rows per citation run (`citation_rate`, `citation_quality`, `hallucinations_unresolved`) so the trend chart has real data going forward.

### Citation-pipeline enrichment

[server/citationChecker.ts](server/citationChecker.ts) now:

1. **Builds a domain-occurrence map** once per run (scans prior cited rankings for this brand's prompts) to drive `authorityScore`.
2. **Per (prompt × platform) task**: extracts the first URL in the response (`extractFirstUrl`), classifies it (`classifySourceType`), computes `authorityScore`, reads `relevance` from the judge. Writes all four fields onto the `geo_rankings` row.
3. **Runs a competitor-detection pass** inline for every cited response — cheap string pre-filter per competitor against the response, no per-competitor LLM call.
4. **Post-aggregate hooks**: `recordCurrentMetrics()` → `metrics_history`; `detectHallucinationsForRun()` → `brand_hallucinations` (skipped if fact sheet has < 3 rows).

[server/citationJudge.ts](server/citationJudge.ts) — `JudgeVerdict` now includes `relevance: number | null`. System prompt extended with "Also return `relevance` (0-100): how directly the response answers the user's question." Zero extra LLM calls.

[server/lib/promptGenerator.ts](server/lib/promptGenerator.ts) — OpenAI prompt returns `category` + `funnelStage` per prompt; values written to `brand_prompts`.

### Files Changed

| File                                                | Change                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0015_enrich_phase1_analytics.sql` (NEW) | 6 column promotions across 4 tables + 3 indexes                                                                                                                |
| `shared/schema.ts`                                  | Matching column additions on `brandPrompts`, `geoRankings`, `brandFactSheet`, `competitors`                                                                    |
| `server/lib/promptGenerator.ts`                     | Classify category + funnel stage at generation                                                                                                                 |
| `server/citationJudge.ts`                           | Return `relevance` field                                                                                                                                       |
| `server/citationChecker.ts`                         | Domain map, URL extraction, source classification, authority scoring, relevance plumbing, competitor detection pass, post-run metrics + hallucination hooks    |
| `server/lib/metricsSnapshot.ts` (NEW)               | Phase-1-sourced metrics_history writer                                                                                                                         |
| `server/lib/hallucinationDetector.ts` (NEW)         | Fact-sheet contradiction detector                                                                                                                              |
| `server/lib/competitorDiscovery.ts` (NEW)           | AI inference + citation-context mining                                                                                                                         |
| `server/lib/factExtractor.ts` (NEW)                 | Multi-page scrape + LLM extraction + monthly refresh                                                                                                           |
| `server/lib/mentionScanner.ts` (NEW)                | Reddit + HN + citation-mining adapters with sentiment                                                                                                          |
| `server/lib/listicleScanner.ts` (NEW)               | Perplexity web-search + page parser                                                                                                                            |
| `server/scheduler.ts`                               | 4 new crons (competitor-discovery Mon 7am, mention-scan Mon 9am, listicle-scan Mon 11am, fact-refresh 1st of month 10am) + exported `runForEveryBrand` helpers |
| `server/routes.ts:3634`                             | geo-analytics filter widened to union articleId + brandPromptId                                                                                                |
| `server/routes.ts:3775+`                            | client-reports rewritten with real previous-period diff + widened filter                                                                                       |
| `server/routes.ts` ai-sources                       | `/api/ai-sources/:brandId` routed through `getTopAiSources`                                                                                                    |
| `server/routes.ts` brand-create                     | Async `setImmediate` kickoff of fact scrape + competitor discovery                                                                                             |
| `server/routes.ts` listicle-discover                | Rewritten to call real scanner                                                                                                                                 |
| `server/routes.ts`                                  | New endpoints `POST /api/competitors/discover/:brandId`, `POST /api/brand-facts/scrape/:brandId`, `POST /api/brand-mentions/scan/:brandId`                     |

### Pass Criteria

- [x] `npx tsc --noEmit` clean
- [x] `geo_rankings` filter union returns brand-prompt rows (verify: `SELECT COUNT(*) WHERE brand_prompt_id IS NOT NULL` > 0 after a citation run, and both geo-analytics and client-reports surface non-zero)
- [x] Every cited `geo_rankings` row written after this migration has non-null `source_type` and `authority_score`; rows that passed the pre-filter also have `relevance_score`
- [x] Every `brand_prompts` row generated after this migration has `category` and `funnel_stage` set (unless the model returned nothing usable)
- [x] Brand creation triggers async fact scrape + competitor discovery without blocking the response
- [x] Every citation run writes `metrics_history` rows and attempts hallucination detection (skipped quietly if fact sheet < 3 rows)
- [x] Weekly cron schedule registered at server boot — 4 new entries visible in startup logs
- [x] Listicle discover endpoint now returns real fetched URLs, not hypothetical LLM suggestions

### Out of scope (still pending)

- Twitter/X and YouTube as mention sources (paid API overhead)
- `automation_rules` table evaluator (separate plan)
- Webhook HMAC verification on `purchase_events`
- Real JSON-LD parsing in Schema Audit
- Client Reports PDF export + share link

---

## Track 11 — Agent automations do real work + deeper fact-sheet scrape

After Track 10 landed, two follow-up gaps surfaced during live QA:

1. **Agent tasks were text-only.** `POST /api/agent-tasks/:id/execute` ran a single OpenAI call per task type and stored the raw text as `outputPayload`. No content job got enqueued, no outreach email row created, no citation check actually ran. The UI reported "task executed" but nothing downstream moved.
2. **Brand fact-sheet scraping was shallow.** `scrapeBrandFacts` only hit 9 hardcoded subpaths, never the homepage. Its 8-category output (`founding/funding/team/products/pricing/locations/achievements/other`) didn't match the UI's 5-bucket render (`company_info/pricing/team/statistics/features`), so half of every scrape was silently invisible. The UI also forced the user to re-type a URL that's already stored on the brand.

### 11.1 Agent tasks → real side effects

Rewrote the switch in [server/routes/agent.ts](server/routes/agent.ts) `POST /api/agent-tasks/:id/execute`. Each task type now performs the real operation instead of saving generated text:

| Task type                   | Before                             | Now                                                                                                              |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `content_generation`        | OpenAI text saved as payload       | `enqueueContentGenerationJob(userId, brandId, payload)` — goes through the existing worker                       |
| `outreach`                  | OpenAI email text saved as payload | `storage.createOutreachEmail({ status: "draft", ... })` — real draft row                                         |
| `prompt_test`               | OpenAI response saved              | `runBrandPrompts(brandId, undefined, { triggeredBy: "manual" })` — runs full citation pipeline                   |
| `source_analysis`           | OpenAI analysis saved              | `storage.getTopAiSources(brandId, 25)` — real aggregation                                                        |
| `hallucination_remediation` | OpenAI remediation text saved      | `storage.updateBrandHallucination(id, { remediationSteps, remediationStatus: "in_progress" })` — real row update |
| `seo_update`                | Not handled                        | `enqueueContentGenerationJob` with refresh payload                                                               |

Each case returns a structured `action` + the artifact id (e.g. `{ action: "content_generation_enqueued", jobId }`) so the UI can link through to the real resource.

### 11.2 Fact-sheet scraper — homepage + link discovery + confidence dedupe

[server/lib/factExtractor.ts](server/lib/factExtractor.ts):

- **Homepage scan first.** Fetches `/` before the path list, extracts hero/tagline/stats facts that only appear there.
- **Dynamic link discovery** via new `discoverInternalLinks(baseUrl, html, limit=12)`. Scans `<a href>` tags, filters to same-origin URLs whose href/anchor text matches `about|story|company|team|leadership|founder|pricing|plan|press|newsroom|customer|case-study|career|contact|investor|media|faq`. Merged with the fixed path list — covers sites that use `/our-story`, `/leadership`, `/plans`, etc.
- **Expanded fixed path list:** 9 → 18 entries (adds `/our-story`, `/leadership`, `/plans`, `/media`, `/customers`, `/case-studies`, `/careers`, `/contact`, `/investors`).
- **Expanded OpenAI prompt.** System prompt now enumerates specific fact keys per category (e.g. `year_founded`, `total_funding_raised`, `ceo_name`, `product_names`, `pricing_tier_amount`, `hq_city`, `customer_count`). Bumped `max_tokens` 1,200 → 1,800.
- **Cross-page confidence dedupe.** All extractions collected into a `Map<"cat::key", {value, confidence, sourceUrl}>`. Highest-confidence candidate wins per key. Replaces the old first-page-wins insert loop.
- **`allowOverwrite` option.** Defaults to `false` (on-demand UI scan stays append-only). The monthly refresh cron passes `true` to update stale values. Existing `refreshScrapedFacts` untouched.

### 11.3 Fact-sheet UI — use the rich scraper, use the stored website

[client/src/pages/brand-fact-sheet.tsx](client/src/pages/brand-fact-sheet.tsx):

- The "Auto-Fill from URL" card was calling the shallow `POST /api/brands/autofill` endpoint (7 generic fields only). Swapped to `POST /api/brand-facts/scrape/:brandId` — the deep Track 10 endpoint that goes through `scrapeBrandFacts()`.
- Removed the URL input entirely. The card now shows the brand's stored `website` in a read-only pill; the button (labelled "Scan Website" / "Re-scan Website" depending on whether facts exist) triggers the scrape with no typing. If the brand has no website, a link to `/brands?edit=:brandId` is surfaced.
- `FACT_CATEGORIES` rewritten to match the scraper's 8-category output (`founding/funding/team/products/pricing/locations/achievements/other`). `SUGGESTED_FACTS` expanded with keys the scraper actually writes — manual entries now match scraped ones.
- Legacy rows saved under old category names (`company_info`, `statistics`, `features`) still render — any unknown category routes to "Other" instead of being silently dropped.

### 11.4 Files touched

| File                                                                           | Change                                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [server/routes/agent.ts](server/routes/agent.ts)                               | Execute endpoint rewritten — 6 task types do real work                                                   |
| [server/lib/factExtractor.ts](server/lib/factExtractor.ts)                     | Homepage scan, link discovery, 18-path list, expanded prompt, cross-page dedupe, `allowOverwrite` option |
| [client/src/pages/brand-fact-sheet.tsx](client/src/pages/brand-fact-sheet.tsx) | Swap to rich scrape endpoint, drop URL input, unify categories                                           |

### 11.5 Pass criteria

- [x] `npx tsc --noEmit` clean
- [x] `POST /api/agent-tasks/:id/execute` with `taskType: "content_generation"` creates a row in `content_generation_jobs`
- [x] `POST /api/agent-tasks/:id/execute` with `taskType: "outreach"` creates an `outreach_emails` row with `status = "draft"`
- [x] `POST /api/agent-tasks/:id/execute` with `taskType: "prompt_test"` produces new `citation_runs` + `geo_rankings` rows
- [x] `POST /api/brand-facts/scrape/:brandId` on a brand whose site uses non-standard paths (e.g. `/our-story`) returns facts with `sourceUrl` values from the discovered paths, not just the hardcoded list
- [x] Same-key facts from two different pages result in a single row (highest confidence wins)
- [x] Fact-sheet page renders existing scraped facts under Founding / Funding / Locations / Achievements groups (previously all invisible)

---

## Section 12 — Wave 5 — Four-feature correctness + honesty pass

Four consecutive deep-audit loops on GEO Tools, GEO Signals, Agents, and Crawler Check. Every bug below was reproduced from source before the fix landed.

### 12.0 Why this section exists

Previous tracks prioritized feature reach over correctness. Live walkthroughs surfaced a pattern across all four surfaces: handlers appearing to work end-to-end while emitting wrong-shape data that no consumer could read, labels claiming measurements the code didn't perform, approval gates that had no effect on the downstream step, and link targets that led to routes the page didn't honor.

This section is the cleanup: honest logic, correct shapes, real deep-links, and the minimum structural additions (workflow engine, schema-audit cache, embedding primitives) needed for the four features to deliver what their labels claim.

### 12.1 GEO Tools — four tabs fixed

- **Listicles:** frontend read `data.opportunities` while server returned `{listicles: [...]}`. Fix: frontend reads `data.listicles`, mounts `GET /api/listicles?brandId=` query, scanner throws on missing `OPENROUTER_API_KEY` and returns `{inserted, candidates, reason}`. Also removed the `response_format: json_object` from the Perplexity/Sonar call — unsupported on that model and caused 100% 400s.
- **Wikipedia:** handler invented URLs via LLM. Rewritten as `server/lib/wikipediaScanner.ts` — real MediaWiki search, extract fetch, grounded LLM classification into `existing` / `opportunity` / `irrelevant`. UI splits the tab into two sections.
- **BOFU:** free-text "Compare with" replaced by shadcn Popover+Command combobox bound to `GET /api/competitors?brandId=`; multi-select + Enter-to-add freeform.
- **Mentions:** dropped `mineFromCitations()` (source of noisy `platform="web"` rows and dead external links). Added `searchQuora(query)` as the third real social source. Rows open a `<Sheet>` drawer instead of an external anchor.

Files: [client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx), [server/lib/listicleScanner.ts](server/lib/listicleScanner.ts), `server/lib/wikipediaScanner.ts` (new), [server/lib/mentionScanner.ts](server/lib/mentionScanner.ts), [server/routes/contentTypes.ts](server/routes/contentTypes.ts).

### 12.2 GEO Signals — full honest rebuild

**Old scorecard was fiction.** "Gecko Score" was substring matching with no stopword removal. "BM25" wasn't BM25. "PCTR" didn't measure CTR. "Jetstream" was hardcoded substring checks for English conjunctions. "Boost/Bury" was "has facts AND has lists."

**New 6-signal set:**

| Signal                       | Max | Real measurement                                                                                   |
| ---------------------------- | --- | -------------------------------------------------------------------------------------------------- |
| Content depth                | 15  | Unicode-aware word count + heading hierarchy                                                       |
| Semantic similarity to query | 20  | OpenAI `text-embedding-3-small` cosine similarity with in-process LRU cache                        |
| Query-term coverage          | 10  | Stopword-filtered content words from query found in article                                        |
| Exact-phrase match           | 5   | Binary exact-phrase presence                                                                       |
| Structure extractability     | 15  | Real extractable-chunks ratio (rebuilt chunker)                                                    |
| Authority signals            | 15  | Byline detection + outbound-citation count + factual-claim attribution + schema-completeness bonus |
| Freshness                    | 10  | Age-bucketed; null `updatedAt` → 5 pts with explanatory note                                       |

**Rebuilt chunker:** normalizes CRLF and `<br><br>`; protects code blocks; heading regex dropped the "any capital letter" false-positive; `hasDirectAnswer` uses verb/copula heuristic instead of the absurd "2–5 sentence" rule. Apply-to-Article has a real line-LCS diff + `expectedVersion` optimistic lock.

**Rebuilt Schema Lab:** 14 types (up from 7). Stopped hardcoding `searchable/indexable/retrievable` — measures real field-completeness per type (Article checks headline/author/datePublished/dateModified/articleBody). New `schema_audits` cache table (7-day TTL). Charset auto-detected. `<noscript>` JSON-LD extracted.

**Rebuilt Pipeline Sim:** every stage computes from the same primitives as Tab 1. Signal stage == Tab 1 `overallScore` exactly. All hardcoded strings ("NLU processing: Intent classified as informational", "Gemini 2.5 Flash generation: Ready", "Safety filters: Passed") removed.

**State reducer:** cross-tab ghost state fixed — per-article slice keyed by `(brandId, articleId)`. Switching articles clears top stat cards.

**Deep-link fixed:** `/articles?edit={id}` now auto-opens the article's edit dialog via a `useEffect` in [client/src/pages/articles.tsx](client/src/pages/articles.tsx) and strips the param after open. Previously broken.

**Prompt hardening:** `/api/geo-signals/optimize-chunks` truncates content to 12k chars, sets `response_format: json_object`, prepends prompt-injection guard.

Files: `server/lib/geoSignalsScoring.ts` (new), [server/routes/geoSignals.ts](server/routes/geoSignals.ts), [client/src/pages/geo-signals.tsx](client/src/pages/geo-signals.tsx), [client/src/pages/articles.tsx](client/src/pages/articles.tsx), `migrations/0030_schema_audits_and_article_version.sql` (new).

### 12.3 Agents — workflow engine + 10 breaking bugs

**New substrate.** `workflow_runs` + `workflow_approvals` tables; a workflow step IS an `agent_task` with `workflowRunId` + `workflowStepKey` columns added. 30s scheduler tick advances pending runs via `advanceRun(runId)`. No new worker. Three flagship workflows shipped: Win a Prompt, Weekly Catch-up, Fix a Losing Article.

**Engine correctness:**

- Per-step approval ordering: synthetic-approval steps run their body first (user sees real output), then pause. Task-based approval steps complete the task, then pause for review.
- Approval payload threaded end-to-end — server route → engine → next step's `priorOutputs`.
- Rejection is terminal (cancelled + reason), not "reset to pending" (which had caused infinite loops).
- Parallel steps now actually parallel via `Promise.allSettled` (was sequential `for await`).
- `onPartialFailure: "continue"` for fan-out steps.
- Advisory-lock rescue after 5 min staleness.
- `awaitJob` step type — workflow waits for `content_generation_jobs.status = "completed"` before advancing to steps that need `articleId`.

**10 breaking bugs fixed** in the same pass (deep-audit numbers):

1. `prompt_test` emitted flat per-(prompt, platform) entries; all three consumers (weekly delta, fix-losing recheck, win-a-prompt baseline) expected `{promptId, cited, checks, platforms, bestRank}[]`. Handler now emits the consumer-expected shape.
2. Approval payload was destructured out of the route body and the engine signature didn't accept it — user edits never reached `buildInput`. Fixed end-to-end.
3. Win-a-Prompt's `outreach_drafts` failed 100% — listicles returned `email: null`, outreach handler threw "recipientEmail required." Fix: drafts step filters to listicles with emails; warns in the approval banner when none are pitchable.
4. `(ctx.run.brandId || "").slice(0, 0)` typo always returned empty string — every pitch said "our brand" instead of the real brand name. Fix: thread `brandName` from `content_brief` output to `outreach_drafts`.
5. `content_brief` threw when `gap_analysis` returned no data (new brands with no citation history) — run died at step 3. Fix: synthesize 4 generic starter angles with `firstRun: true`; UI shows amber warning banner.
6. `fixLosingArticle.recheck_citation` shape mismatch — `stillLosingPromptIds` always empty, chain-to-outreach always said "all cited." Fix: uses new byPrompt shape + guards undefined counts.
7. `apply_rewrite` bypassed the optimistic lock — workflows could clobber concurrent user edits. Fix: uses `updateArticleIfVersion`.
8. `runChunkOptimize` had no truncation, no response format, no refusal detection. Fix: 12k-char cap, prompt-injection prelude, refusal-pattern rejection, heading-presence sanity check.
9. Parallel engine execution was sequential. Fix: `Promise.allSettled`.
10. `sendWeeklyDigest` returned `true` on undeliverable recipients, stamping `lastWeeklyReportSentAt` → user never retried. Fix: returns `false`, aggregator retries next run.

**Theater removed:** Automation Rules tab + routes + storage methods (kept the table with deprecation comment; workflow cron triggers replace everything it was scaffolded for). Outreach `Math.random() > 0.15` send replaced with real Resend via `emailService.ts`. Placeholder `pending@placeholder.local` recipient fallback removed.

**UI rebuilt:** 3 tabs (Workflows default / Task Queue / Runs History) + new route `/agent/runs/:runId` with approval banner (3 summary shapes: brief, listicle multi-select, chunk-optimize diff). Deep-links `/agent?taskId=`, `/content?jobId=`, `/outreach?emailId=`, `/ai-intelligence?tab=` all honored.

**Per-type Create Task form.** Replaced the one-shape form with per-type sub-forms matching the Zod schemas in `server/lib/agentTaskSchemas.ts` that were already strict — the form wasn't passing the right fields through.

Files: [server/lib/workflowEngine.ts](server/lib/workflowEngine.ts), [server/lib/agentTaskExecutor.ts](server/lib/agentTaskExecutor.ts), `server/storage/workflowStorage.ts`, `server/lib/workflows/{winAPrompt,weeklyCatchup,fixLosingArticle,registry}.ts`, [server/scheduler.ts](server/scheduler.ts), [server/routes/agent.ts](server/routes/agent.ts), [server/emailService.ts](server/emailService.ts), [client/src/pages/agent-dashboard.tsx](client/src/pages/agent-dashboard.tsx) (rewritten), `client/src/pages/agent-run.tsx`, `migrations/0029_workflows.sql`.

### 12.4 Crawler Check — purpose dimension + Perplexity-User + Claude-Web

Added a `purpose: "training" | "search" | "realtime"` tag orthogonal to vendor `category`. This is the dimension site owners actually reason about:

- Blocking `search` = invisibility in AI search answers (CRITICAL)
- Blocking `realtime` = users hit "couldn't access this page" when asking an assistant to open a URL
- Blocking `training` = acceptable if intentional (opt-out of future model training)

**New bots:** Perplexity-User (realtime), Claude-Web (still observed in the wild alongside ClaudeBot). List now 18 bots.

**Purpose-stratified recommendations:** blocked bots are split by purpose in the recommendation output — CRITICAL banner for search, warning for realtime, informational for training.

**Snippet generator rebuilt:** was hardcoded, now generated from `AI_CRAWLERS` grouped by purpose with section headers. One `User-agent:` + `Allow:` pair per bot (blank lines between) — some parsers mishandle stacked User-agent lines.

**Existing correct behavior confirmed:**

- Empty `Disallow:` → explicit allow-all (RFC 9309 compliant; already fixed in a prior pass).
- `Allow: /` in a specific block overrides `Disallow: /` in the same block.
- Per-bot directive blocks in the generated snippet, not stacked groups.

File: [server/routes/analytics.ts](server/routes/analytics.ts).

### 12.5 Pass criteria

- [x] `npx tsc --noEmit` clean.
- [x] Start a `win_a_prompt` workflow on a prompt with zero citation history — content_brief produces generic angles with `firstRun: true` instead of crashing.
- [x] Start a `win_a_prompt` workflow with listicles that have no emails — drafts step skips them, approval banner warns.
- [x] Reject a content brief — run transitions to `cancelled`, no infinite loop.
- [x] `weekly_catchup` on a brand with <2 metrics_history rows — firstRun branch returns a valid digest payload.
- [x] `fix_losing_article`: chunk-optimize approval shows a real line-LCS diff; apply_rewrite fails if the article advanced between approval and write.
- [x] GEO Signals: `/articles?edit=ID` opens the edit dialog; switching articles clears top stat cards; null `updatedAt` shows "No update timestamp" not 54 years.
- [x] GEO Signals: Pipeline Sim Signal stage == Tab 1 overallScore exactly on the same article+query.
- [x] Crawler Check on a site blocking PerplexityBot + OAI-SearchBot: CRITICAL recommendation names both, and the generated snippet contains one `User-agent: + Allow: /` pair per bot across three purpose sections.
- [x] `sendOutreachEmail` path no longer contains `Math.random`; unconfigured Resend surfaces as a clear error, not a silent "sent."

### 12.6 Open items after Wave 5

- Brief approval UI is read-only (payload plumbing is live; inline `keyAngles` editor is a ~30-line follow-up).
- `source_analysis mode=listicles_for_prompt` uses substring matching — fuzzy/embedding matching is Wave 6.
- YouTube mention source needs `YOUTUBE_API_KEY`.
- Real Gecko embeddings call OpenAI every analyze — no pgvector cache yet. Cost is ~$0.0001/analyze; revisit if usage spikes.

---

## Section 13 — Wave 6 — Universal detection + dashboard honesty pass

Two threads in this wave: collapse 9 ad-hoc citation/mention detection paths into one shared matcher, and rebuild the home dashboard so every number on it has an honest derivation. Plus a stack of trailing fixes that surfaced during walkthroughs.

### 13.0 Why this section exists

Detection was sprawled across `citationChecker.ts`, `responseAnalyzer.ts`, `mentionScanner.ts`, `listicleScanner.ts`, `wikipediaScanner.ts`, `hallucinationDetector.ts`, plus inline regex in two more places. They disagreed with each other on edge cases (substring "PR" matched "production"; "anotion.so.store" falsely matched the variant "notion.so"; competitors with the same name in another industry produced false positives). The home dashboard had eleven cards, several of which displayed numbers that bore no relationship to the underlying data — a "Score History" that was always 0, "Brand Entity Strength" with four arbitrary subscores, "Threads Found" that was a verbatim duplicate of "Brand Mentions," and AI Visibility Scores that disagreed across pages by 50 points for the same brand.

This section is the cleanup: one detection contract, one matching algorithm, every dashboard card backed by a transparent formula or removed.

### 13.1 Universal brand/competitor matcher

New file: [server/lib/brandMatcher.ts](server/lib/brandMatcher.ts). Single entry point `detectBrandAndCompetitors(text, brand, competitors)` returns `{matched, hitVariants, positions}` per entity. Three matching rules:

- **Name variant** — whole-word + possessive-tolerant: `\b<word>(?:[''’]s)?\b`. Multi-word variants tolerate any whitespace (multiple spaces, newlines).
- **Domain variant** — URL-boundary aware: `(?:^|[\s/:<>"'.])(?:www\.)?<domain>(?=[/\s?#:<>"']|$)`. Allows `.` on the left so `docs.notion.so` matches the variant `notion.so`; right-boundary excludes `.` so `anotion.so.store` doesn't.
- **Ambiguity gate** — variants ≤3 chars or in the curated `AMBIGUOUS_WORDS` set (apple, target, square, notion, venture, etc.) require a signal token (`company`, `app`, `platform`, `founded`, `acquired`, `saas`, `ceo`, ...) within ±60 chars. Stops common-word brand names from false-positiving on every sentence.

Diacritic folding applied to both haystack and variant. Legal suffixes stripped from primary names (`Notion Labs, Inc.` → also matches `Notion Labs`). Domain extracted from `entity.website ?? entity.domain`.

Test suite at [tests/unit/brandMatcher.test.ts](tests/unit/brandMatcher.test.ts) — 30 tests covering possessives, multi-word whitespace flex, subdomain matching, fake-embedded-domain rejection, signal-word proximity, diacritic folding, and edge cases. All green.

### 13.2 Migrating callers + variant learning loop

Replaced local detection in five library files with `detectBrandAndCompetitors` / `matchEntity`. LLM analyzers (`responseAnalyzer.ts`) still run for rank/relevance, but stopped doing local fuzzy matching.

The analyzer now feeds a **variant-learning loop**: when the LLM extracts a surface form for a tracked brand or competitor that isn't already in `nameVariations`, it auto-appends. Direct append, no pending queue — user curates from the brand/competitor edit UI. Scoped per-entity via new DAO methods `addBrandNameVariation` and `addCompetitorNameVariation` (case-insensitive dedup).

### 13.3 Schema migration + competitor edit UI

Migration `0032_universal_detection.sql`:

- `competitors.name_variations text[] DEFAULT ARRAY[]::text[]` — competitors now mirror brands.
- `geo_rankings.re_detected_at timestamp` — set when "Re-check stored" reveals a new citation via an updated variant. UI badges these "Re-detected" because the rank from the original LLM pass isn't available.

`PATCH /api/competitors/:id` endpoint added in [server/routes/publications.ts](server/routes/publications.ts) — whitelist of editable fields, `nameVariations` accepts comma-separated string or array. Edit dialog wired into [client/src/pages/competitors.tsx](client/src/pages/competitors.tsx).

### 13.4 "Re-check stored" rebuilt — zero LLM calls

Old endpoint `POST /api/brand-prompts/:brandId/backfill-detection` re-ran the LLM judge on every stored row. Replaced with `POST /api/brand-prompts/:brandId/re-detect-all`:

- Iterates `geo_rankings` (citation responses), `listicles` (page metadata), `wikipedia_mentions` (extract text).
- Runs the shared matcher against each stored text using the entity's _current_ variant list.
- Updates `is_cited` / `is_included` / `is_active` in place; sets `re_detected_at` for newly-cited rankings.
- Re-aggregates affected `citation_runs` (`totalCited`, `citationRate`, `platformBreakdown`) so UI sees the new totals immediately.
- Per-brand 60s rate limit; one button click runs all surfaces.

Toast on success reports counts: `"Updated N rankings, M listicles, K wiki mentions. P newly re-detected. (Xs)"`.

Spec: [docs/superpowers/specs/2026-04-25-universal-citation-detection-design.md](docs/superpowers/specs/2026-04-25-universal-citation-detection-design.md). Plan: [docs/superpowers/specs/2026-04-25-universal-citation-detection-plan.md](docs/superpowers/specs/2026-04-25-universal-citation-detection-plan.md).

### 13.5 Home dashboard honesty pass

Eleven items. Every card's data path was traced and either fixed or the card was removed.

| Card                       | Before                                                                                                                                                                                                                    | After                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Score History              | Empty unless someone hit a separate snapshot endpoint nobody clicks. Always read 0 scans.                                                                                                                                 | Replaced with **Citation Trend** — 8 weekly buckets computed from `geo_rankings.checkedAt`. New endpoint `/api/dashboard/citation-trend/:brandId`.                                                                                                  |
| Brand Entity Strength      | 4 hand-tuned subscores (30/25/20/25), pseudo-rigorous regex for "comparison prompts," weights with no empirical basis.                                                                                                    | **Citation Health**: `round(100 × cite_rate × rank_factor)` where `rank_factor = max(0, 1 − (avg_rank − 1) / 10)`. Single transparent formula. Card shows score + cite rate + avg rank explainer.                                                   |
| Generative Rankings        | Included Microsoft Copilot + Meta AI (not actually queried by citation runner). Snippet showed raw `\|\|\| RAW_RESPONSE \|\|\|` delimiter. Always rendered, even with zero data.                                          | `AI_PLATFORMS_CORE = [ChatGPT, Claude, Perplexity, Gemini, DeepSeek]`. Snippet split on delimiter; cited snippet preferred, falls back to non-cited if no citations. Green/red pill via `isCitedSnippet`. Platforms with zero rows hidden entirely. |
| Platform Visibility        | Showed `reasonLine` ("Low Reddit / web citation presence") that was a hardcoded fallback string, not computed from real data.                                                                                             | `reasonLine` removed from server response and UI.                                                                                                                                                                                                   |
| Competitors Dominating     | Top 8.                                                                                                                                                                                                                    | Top 10.                                                                                                                                                                                                                                             |
| Competitor Gap Analysis    | Binary "yes/no" — competitor with 1 citation flagged the same as competitor with 10.                                                                                                                                      | Magnitude threshold: gap only flagged when `competitor_cited - brand_cited >= 2`. Returns `cellDiffs` per category for tooltip detail.                                                                                                              |
| Share of AI Voice          | Denominator included "Others" (every untracked brand the AI happened to name); user's slice diluted to single-digit percentages. Legend used `hsl(var(--primary))` for the user's brand → near-black dot, looked missing. | Denominator restricted to tracked brand + tracked competitors. Capped at top 10 entries. Legend uses explicit hex colors so every entry has a visible dot.                                                                                          |
| What AI Says About You     | Pulled `latestSnippet` verbatim including the delimiter; could show duplicate prompts.                                                                                                                                    | Filters to cited-only via `isCitedSnippet`; one block per platform that has a cited snippet (up to 5). Server strips delimiter via `extractResponseBody`.                                                                                           |
| Reddit Visibility          | Three metric cards. "Threads Found" and "Brand Mentions" rendered the same `mentions.length` value with different labels — theater.                                                                                       | Two cards: **Brand Mentions** (count) + **Subreddits** (distinct community count).                                                                                                                                                                  |
| Your Action Plan           | Filtered queued `agent-tasks` to top 5 with hardcoded fake timeframes ("8 weeks" / "4 weeks" by regex).                                                                                                                   | Section removed. `tasks` query unmounted. `ActionPlanItem` import dropped.                                                                                                                                                                          |
| AI Sentiment & Positioning | Quote source was the most-recent cited row's raw `citationContext` — included delimiter and "Not cited" status lines for non-cited rows.                                                                                  | Reads only when `isCitedSnippet === true` AND uses delimiter-stripped body via `extractResponseBody`.                                                                                                                                               |

Files: [client/src/pages/home.tsx](client/src/pages/home.tsx), [server/routes/dashboard.ts](server/routes/dashboard.ts), [shared/constants.ts](shared/constants.ts), [client/src/components/dashboard/PlatformRankingCard.tsx](client/src/components/dashboard/PlatformRankingCard.tsx), [client/src/components/dashboard/PlatformVisibilityBar.tsx](client/src/components/dashboard/PlatformVisibilityBar.tsx), [client/src/components/dashboard/BrandEntityStrength.tsx](client/src/components/dashboard/BrandEntityStrength.tsx). Deleted: `client/src/components/dashboard/ActionPlanItem.tsx` references.

### 13.6 AI Visibility Score — single formula across surfaces

Two endpoints used to disagree by 50 points on the same brand. Dashboard hero used `0.5 × cite_rate × 100 + 0.3 × avg_authority + 0.2 × (1 − not_found_rate) × 100` (the `(1 − not_found_rate)` term floored every brand at ~20 just for AI returning _any_ response). GEO Analytics used per-platform scores averaged across "platforms with data" — flattering, hid the platforms where the brand was invisible. Plus a `mentionScore` that credited every check attempt as a "mention" — gave platforms 30/100 with zero citations.

Both endpoints now use the same global aggregate:

```
score = 70 × cite_rate × ((1 + rank_factor) / 2) + 30 × (avg_authority / 100)
```

- `cite_rate` = `cited_rows / total_checks` across all platforms.
- `rank_factor` = `max(0, 1 − (avg_rank − 1) / 10)` from cited rows only.
- `avg_authority` = mean `authority_score` of cited rows (0–100).
- **Hard floor: 0 citations → 0 score.** No exceptions.

The `mentionScore` is gone. `mentions` is still reported on the row as "checks attempted" but doesn't feed scoring. Per-platform `visibilityScore` returns 0 when that platform has zero citations.

Files: [server/routes/dashboard.ts](server/routes/dashboard.ts) (`/api/dashboard/hero/:brandId`), [server/routes/analytics.ts](server/routes/analytics.ts) (`/api/geo-analytics/:brandId`).

### 13.7 Hidden pages — feature stripping for pre-launch focus

Eight feature pages removed from the navigable surface. Code preserved on disk so they can be re-enabled when the underlying data becomes real:

- **Routes unmounted** ([client/src/App.tsx](client/src/App.tsx)): `/geo-rankings`, `/revenue-analytics`, `/publications`, `/outreach`, `/ai-traffic`, `/analytics-integrations`, `/agent`, `/agent/runs/:runId`. Direct URL hits now return `NotFound`.
- **Sidebar entries removed** ([client/src/components/Sidebar.tsx](client/src/components/Sidebar.tsx)): GEO Rankings, AI Traffic, Revenue, Outreach, Publications, Integrations, AI Agent.
- **Dead components deleted**: `client/src/components/Navbar.tsx` (was imported nowhere), `client/src/components/PlatformGuide.tsx` (only used by Navbar), `client/src/pages/dashboard.tsx` (unrouted, replaced by home.tsx years ago).
- **Pricing hidden** ([client/src/pages/landing.tsx](client/src/pages/landing.tsx), [client/src/components/Sidebar.tsx](client/src/components/Sidebar.tsx), [client/src/components/content/UsageWidget.tsx](client/src/components/content/UsageWidget.tsx)): Route unmounted, sidebar Pricing link removed, all landing nav entries + pricing section + CTA buttons removed. `pricing.tsx` and the `pricing = [...]` constant in landing.tsx kept on disk.

Stale links from deleted features cleaned up: home.tsx `SeeAllLink` to `/geo-rankings`, `/ai-traffic`, `/agent`; ActionPlanItem's `/agent?task=` button; PlatformGuide's three guide-step entries pointing to removed paths.

### 13.8 Bug fixes + UX polish

- **Welcome → /dashboard redirect bounce.** `FirstRunGate` reads cached `/api/brands` to decide whether to redirect to `/welcome`. After confirm, the cache still showed empty array → infinite redirect loop. Fix in [client/src/pages/welcome.tsx](client/src/pages/welcome.tsx): `await queryClient.invalidateQueries(["/api/brands"])` + `refetchQueries` before `setLocation("/dashboard")`.
- **Community drafts.** Added editable draft dialog (Pencil icon button); `tick` (CheckCircle2) now reliably moves draft to Posted tab. Server PATCH coerces incoming ISO-string `postedAt` to `Date` before handing to Drizzle (timestamp columns reject string values silently). Mutation has `onError` so future failures aren't invisible.
- **GEO Tools mentions sheet.** AI mentions (platform `ai:<engine>`, synthetic `ai://...` URL) render the full response inline in a scrollable bordered box, no "Open on" button (the synthetic URL can't be opened). Social mentions use a real `<a target="_blank">` instead of `window.open` — popup blockers no longer silently swallow the click.
- **Articles page.** Brand filter Select added when user has >1 brand. Defaults to "All brands" so existing behavior preserved. Client-side filter on `article.brandId`; no API change.
- **Competitors page.** Now requires brand selection (matching all other brand-scoped pages). BrandSelector pinned at top; competitor + leaderboard queries pass `?brandId=`. Competitor edit dialog covered in 13.3.
- **Auth UX.** "← Back to home" link top-left inside login + register cards. Landing hero gets "Log in" button alongside "Start Free Trial". Mobile menu gets "Sign up" alongside "Log in".
- **Favicon.** Wired at [client/public/favicon.png](client/public/favicon.png), referenced from [client/index.html](client/index.html) plus default `<title>VentureCite</title>` for pre-React-mount fallback.

### 13.9 Deploy fixes (Render)

- **Empty package-lock entries.** Render's Node 22 npm refused `Invalid Version: ` from 29 packages with no `version` field in the lockfile. Local npm tolerated it; production didn't. Regenerated `package-lock.json` from a clean `npm install`. New build proceeded past install.
- **`docs/privacy-policy.md` missing on Render.** `.gitignore` line 24 has `*.md` (only README excepted). The privacy import in [client/src/pages/privacy.tsx](client/src/pages/privacy.tsx) needs the file at build time — Render couldn't find it, build failed at Rollup. Added `!docs/privacy-policy.md` exception, force-added the file, committed.

### 13.10 Pass criteria

- [x] `npx tsc --noEmit` clean across server + client + shared.
- [x] `npx vitest run` — 159/159 tests pass, including 30 new brandMatcher tests.
- [x] One detection contract used by every citation/mention surface.
- [x] "Re-check stored" runs across rankings + listicles + wikipedia in <5s for typical user; zero LLM calls observed in server logs.
- [x] Brand with 0 citations: dashboard AI Visibility Score = 0; GEO Analytics overall score = 0; per-platform Visibility scores = 0.
- [x] Same brand with citations: dashboard score and GEO Analytics score now agree (mathematically guaranteed by shared formula).
- [x] Adding a name variation in the Brand or Competitor edit dialog + clicking "Re-check stored" surfaces previously-missed citations with a "Re-detected" badge.
- [x] Welcome → confirm → land on `/dashboard` (not bounced to `/welcome`).
- [x] Direct navigation to `/pricing`, `/outreach`, `/agent`, etc. returns NotFound.
- [x] Render build succeeds end-to-end after lockfile regen + privacy-policy commit.

### 13.11 Open items after Wave 6

- **`competitor_geo_rankings` not re-checked.** The "Re-check stored" loop covers `geo_rankings` (brand-side) but not the parallel competitor table — no `updateCompetitorGeoRanking` DAO exists yet, and the data shape is per-competitor-per-prompt-per-platform which 10×s the matcher work. Means the competitor leaderboard lags by up to one citation-run cycle when variants change. Fix is ~50 LOC: add the DAO, extend the loop. Deferred — the brand-side fix delivers the headline value.
- **`brand_mentions` re-check skipped.** No `is_matched` column on `brand_mentions` — re-checking would mean _deleting_ mentions that no longer match the variant list. Destructive and surprising. Add a soft-flag column in a future wave if curating mention noise becomes a real workflow.
- **Hallucination re-verification still uses `string.includes(claimSnippet)`.** The 40-char post-hoc snippet matcher in [server/lib/hallucinationDetector.ts](server/lib/hallucinationDetector.ts) wasn't migrated to the shared matcher because it's matching free-form prose, not entity names. Different shape, different rules. Could be unified later but not urgent.
- **`authority_score` is a domain-occurrence heuristic.** Counts how often a citing-outlet domain has appeared in past citations. It's directionally meaningful but not a ground-truth authority signal. The visibility-score formula gives it 30 of 100 weight; if we ever wire real authority data (DR, RD count), the formula stays the same — just better inputs.
- **Variant learning loop has no cap.** LLM-extracted variants append unbounded. If a hallucinating model invents nonsense variants, they accumulate until a user prunes them. Per-entity max (e.g. 50) would be cheap insurance.
- **One-shot back-detection migration.** Existing user data won't auto-realign with the new matcher until each user clicks "Re-check stored." A separate ops script that walks every brand and runs `re-detect-all` once is on the to-do — not part of any PR, just a deploy-time chore.

---

## 14. Wave 7 — Content + Articles full rebuild

### 14.0 Why this wave existed

The Content + Articles pages had grown three overlapping data models that disagreed about what "content" was: `content_drafts` (form state with a `generatedContent` field), `content_generation_jobs` (the work order), and `articles` (the canonical row). A single piece of content was duplicated across 2-3 places with no enforced sync. Six different code paths PATCH'd the draft row with no version field. The "AI Detection Score" was an LLM grading its own LLM output and shouldn't have existed. Auto-Improve created a new "(improved)" article every click, cluttering the list. `/article/:slug` exposed every article publicly via slug enumeration.

The audit and critique we did for these two pages produced a 20+ point list. This wave addresses all of it.

### 14.1 Schema unification (migration 0033)

[migrations/0033_content_unification.sql](migrations/0033_content_unification.sql) collapses the three-table model:

- **`articles` carries the lifecycle.** New `status text` column with `CHECK (status IN ('draft','generating','ready','failed'))`. Defaults to `'ready'` (existing rows), so the migration is non-destructive on first run. New `job_id varchar` (links to in-flight generation), `target_customers`, `geography`, `content_style` (form-state fields the legacy drafts table used to hold), and `external_url text` (where the article actually lives on the user's own site — replaces the slug-based fake URL).
- **`articles.title` and `articles.content` are now nullable** so a draft article can exist before either is filled in. The worker writes both on transition to `ready`.
- **Slug is gone.** `DROP INDEX articles_brand_slug_idx; ALTER TABLE articles DROP COLUMN slug.` No more public-by-slug surface.
- **`article_revisions` table created.** Per Auto-Improve / per manual edit / per restore. Columns: `article_id`, `content`, `source IN ('generated','manual_edit','auto_improve','distribute_back')`, `created_by`, `created_at`. Every existing `ready` article gets a seed `'generated'` revision so the diff viewer has a baseline.
- **`content_generation_jobs` extended:** `stream_buffer text DEFAULT ''` (worker appends streamed tokens here; SSE handler tails it), `error_kind text` (classification for refund logic), `refunded_at timestamp` (idempotency flag). Status CHECK now accepts `'cancelled'`.
- **Backfill.** Orphan articles (`brand_id IS NULL`) get re-parented under a per-user "Personal" brand (industry "Other", tone "professional"). Every `content_drafts` row is absorbed: drafts with `articleId` are merged onto that article (form fields copied, status flipped); drafts with `generatedContent` but no `articleId` become new ready articles; unfinished drafts become draft articles. Then `DROP TABLE content_drafts`.
- **Idempotent.** `IF NOT EXISTS`/`IF EXISTS` everywhere; the destructive drops are guarded by the table-existence check so re-running on a fresh DB is a no-op.

### 14.2 Slug deletion (everywhere)

A clean cut, in deploy order so we never serve a 404 to ourselves:

- **Server.** Both `/api/articles/slug/:slug` route handlers deleted (one was a duplicate dead route that was supposed to bump view count and never did). `getArticleBySlug` DAO removed; `generateSlug` private helper removed; storage interface entry removed. Worker no longer derives a slug. Sitemap stops emitting article URLs (articles aren't publicly indexable on our domain anymore — users link to their own externally-hosted versions via `articles.externalUrl`).
- **GEO Signals schema audit.** Used to construct a fake URL via `${brand.website}/${article.slug}` to look up cached schema audits. Now reads `article.externalUrl`; if unset, returns `completeness: null` and the UI hides the panel.
- **Client.** `/article/:slug` route removed from [client/src/App.tsx](client/src/App.tsx). [client/src/pages/article-view.tsx](client/src/pages/article-view.tsx) deleted entirely.

### 14.3 Backend rebuild

#### Storage interface ([server/storage.ts](server/storage.ts))

Old draft methods (`createContentDraft`, `getContentDraftsByUserId`, `updateContentDraft`, `deleteContentDraft`, …) replaced by:

- `createDraftArticle(userId, brandId, fields)` — creates `status='draft'` row.
- `getArticlesByUserIdWithStatus(userId, { status?, brandId?, limit, offset })` — single status-filterable list. Status arg accepts a string or string[]. Drives both the Articles page (default `'ready'`) and the Content page's Recent Drafts dropdown (`'draft','generating','failed'`).
- `setArticleGeneratingFromDraft`, `setArticleReady`, `setArticleFailed`, `setArticleDraft` — atomic transitions used by the worker.
- `appendStreamBuffer(jobId, delta)` — atomic concat (`SET stream_buffer = COALESCE(stream_buffer,'') || $delta`).
- `createRevision`, `listRevisions`, `getRevisionById` — revision history.
- `failStuckContentJobs` updated to return `[{id, userId, articleId}]` so the boot recovery can refund quota and reset linked articles to draft.

#### Content routes ([server/routes/content.ts](server/routes/content.ts))

- `POST /api/articles/:id/generate` (replaces `POST /api/generate-content`) — body: `{keywords, industry, type, contentStyle, targetCustomers, geography}`. Verifies article ownership and `status IN ('draft','failed')`. Atomically: `withArticleQuota` reserve → insert job with `articleId` → set `articles.status='generating', jobId`. Returns `{jobId, status:'pending'}`. **Synchronous status flip** so the UI switches to streaming immediately rather than waiting for the worker to claim.
- `GET /api/content-jobs/:jobId` — JSON poll. Includes `errorKind` so the client can show classified error messages.
- `GET /api/content-jobs/:jobId/stream` — SSE. Tails `stream_buffer` at 250ms, emits `event: delta` per new chunk, `event: end` on terminal status. Hard cap at 5min total connection.
- `POST /api/content-jobs/:jobId/cancel` — flips job to `cancelled`. Worker checks every 1s during the stream and aborts the OpenAI request. If the job is still `pending` when cancelled (worker hadn't claimed yet), the route refunds quota and resets the article to draft inline.
- `POST /api/articles/:id/improve` (replaces `POST /api/rewrite-content`) — **one** rewrite pass. Snapshots current content as a `manual_edit` revision, calls gpt-4o-mini, writes new content, records an `auto_improve` revision. Optimistic-locked via `expectedVersion` (returns 409 with `current` payload). No score gating, no fork.
- `POST /api/analyze-content` and `POST /api/rewrite-content` — **deleted**. The LLM-graded human score is gone for good.
- All `/api/content-drafts/*` routes — **deleted**.

#### Article routes ([server/routes/articles.ts](server/routes/articles.ts))

- `POST /api/articles/draft` — creates a `status='draft'` row. Drives the Content page's "New Article" button.
- `GET /api/articles` — supports `?status=` (single value, comma-list, or `all`) and `?brandId=`. Default `status=ready`.
- `PUT /api/articles/:id` — already had optimistic-lock support; client now always sends `expectedVersion`. Allowlist drops `slug`, adds `externalUrl`.
- `GET /api/articles/:id/revisions` — list revisions newest-first.
- `GET /api/articles/:id/revisions/:revId` — single revision content.
- `POST /api/articles/:id/revisions/:revId/restore` — overwrite article with revision content, bump version, log a new `manual_edit` revision recording the restore.
- `POST /api/articles` — **brandId now required** (no orphan articles going forward).
- `POST /api/distribute/:articleId` — platform calls switched from sequential `for` loop to `Promise.all`. ~2× faster on multi-platform distribute.

#### Worker rewrite ([server/contentGenerationWorker.ts](server/contentGenerationWorker.ts))

Worker no longer creates the article — it fills one. On claim:

1. Re-assert `status='generating'`, `jobId` set (idempotent because the route already did it).
2. Build prompt (brand context + content type + style + keywords).
3. **Stream from OpenAI** with `stream: true, stream_options: { include_usage: true }` and an `AbortController` signal.
4. For each chunk: append to `stream_buffer` (flush every 16 tokens), check cancel flag every 1s.
5. **Watchdog** runs every 1s: aborts if no chunk arrived in `STREAM_IDLE_TIMEOUT_MS = 60s` or total elapsed > `STREAM_TOTAL_TIMEOUT_MS = 5min`. Throws a synthetic `TimeoutError` so the catch handler classifies → refunds.
6. On success: `setArticleReady(articleId, content, title)`, insert `'generated'` revision.
7. On failure: classify error → `errorKind`, set `jobs.{status, errorKind, errorMessage, completedAt}`, set article to `failed` (or `draft` if cancelled), call `refundArticleQuota` (idempotent — checks `refunded_at IS NULL`).
8. Boot recovery (`STUCK_JOB_RECOVERY_MINUTES = 5`, was 15): every job left running for >5 min on startup gets failed with `errorKind='timeout'`, refunded, and its article reset.

#### Quota refund helper ([server/lib/usageLimit.ts](server/lib/usageLimit.ts))

`refundArticleQuota(userId, jobId, errorKind)`. Refundable kinds: `cancelled`, `circuit`, `openai_429`, `openai_5xx`, `timeout`. Non-refundable: `budget`, `invalid_input`, `unknown`. Wraps both the user row and the job row in `FOR UPDATE`, decrements counter clamped at 0, sets `refunded_at = now()`.

### 14.4 Frontend rebuild

#### Shared helpers + new components

- [shared/industries.ts](shared/industries.ts) (NEW) — moved the 50+ industry list out of the Content page into a shared module. Used by Content, Brand setup, Keyword research.
- [client/src/lib/diff.ts](client/src/lib/diff.ts) (NEW) — hand-rolled line-level LCS diff. ~80 LOC, no external dep.
- [client/src/components/content/MarkdownEditor.tsx](client/src/components/content/MarkdownEditor.tsx) (NEW) — split-pane editor: monospace `<Textarea>` left, live `<SafeMarkdown>` preview right, word + character count toolbar. Supports `editable={false}` for the streaming preview.
- [client/src/components/content/KeywordChips.tsx](client/src/components/content/KeywordChips.tsx) (NEW) — chip-input with comma/Enter to add, Backspace-on-empty to pop. Pasting "a, b, c" splits into multiple chips.
- [client/src/components/content/IndustryCombobox.tsx](client/src/components/content/IndustryCombobox.tsx) (NEW) — `cmdk`-backed type-to-filter combobox over the industry list, grouped by super-category.
- [client/src/components/content/BrandCombobox.tsx](client/src/components/content/BrandCombobox.tsx) (NEW) — same pattern, brand selector. No "(generic content)" option — brand is required.
- [client/src/hooks/useArticleAutoSave.ts](client/src/hooks/useArticleAutoSave.ts) (NEW) — single auto-save channel with two debounce timers (form 1.5s, content 2s) and a serial flush queue. Always passes `expectedVersion`. On 409: surfaces a toast and stops queuing. Replaces the legacy 6-way PATCH race.
- [client/src/components/articles/RevisionDiff.tsx](client/src/components/articles/RevisionDiff.tsx) (NEW) — unified red/green diff renderer with a `context` prop that collapses long unchanged runs to "⋯ N unchanged lines ⋯".
- [client/src/components/articles/ViewEditDialog.tsx](client/src/components/articles/ViewEditDialog.tsx) (NEW) — three tabs: View (SafeMarkdown), Edit (MarkdownEditor + Auto-Improve button + diff confirmation flow), Versions (revision list + diff viewer + Restore button). 409 conflict modal with Reload-latest / Force-save-mine.
- [client/src/components/articles/DistributeDialog.tsx](client/src/components/articles/DistributeDialog.tsx) (NEW) — extracted from the legacy 370-line block in articles.tsx. Selected platforms now persist when switching between Generate/Results tabs. Buffer profile match only auto-fires on unambiguous (single-match) cases.

#### Content page ([client/src/pages/content.tsx](client/src/pages/content.tsx))

- **Route-driven.** `/content/:articleId` is the canonical URL. Visiting `/content` with no id either jumps to the most recent draft or creates a new draft article and redirects.
- **Bootstrap.** Three-way decision: localStorage active draft → that article; else `drafts[0]`; else create new and redirect. If the article id 404s (deleted, wrong owner), redirects back to `/content` instead of spinning forever.
- **Three render modes** driven by `article.status`:
  - `draft|failed` → DraftForm (combobox + chip-input + content-type + style + targeting + Generate button). Failed shows an error banner with the classified message.
  - `generating` → GeneratingPreview (read-only MarkdownEditor showing live tokens, Cancel button visible).
  - `ready` → ReadyEditor (split-pane MarkdownEditor with auto-save, "Open in Articles" link).
- **Streaming UX.** SSE when tab is focused; poll fallback (4s) when blurred. EventSource can't send `Authorization` headers, so the SSE URL appends `?token=<JWT>` — the route is in `SELF_AUTHED_PREFIXES` so the global Bearer guard skips it; the SSE handler validates inline.
- **Optimistic flip on Generate.** `queryClient.setQueryData` patches the cached article to `status='generating'` immediately so the form-→-streaming transition is instant.
- **Hydration.** A single `useEffect` re-hydrates `contentDraft` from `article.content` whenever the server-side content changes, gated by a `userEditedContent` ref so an in-progress edit isn't clobbered. Auto-save of `content` only fires when `userEditedContent.current === true` — fixed the bug where streaming-→-ready transition was triggering a phantom PATCH that wiped the article to `""`.
- **Brand-less empty state.** If user has zero brands, hard stop with "Add a brand first" CTA.
- **Removed.** AI Detection Score box, "How to Improve Your Score" tips, Issues/Strengths grid, `analyzeContentMutation`, `rewriteContentMutation`, `handleRewriteContent`, `scoreBeforeImprove`, `humanScore` state, "Save Article" button, `saveArticleMutation`, `savedArticleId`, `handleSaveArticle`. The article is created on draft entry; ready transition is handled by the worker; manual saves are PATCHes through the auto-save hook.
- **Form-level fixes.**
  - Industry: `<Combobox>` (was scrolling Radix Select).
  - Industry caption: "This is the industry the article targets — can differ from your brand's home industry." Per user note, brands intentionally write for adjacent verticals.
  - Keywords: chip-input. First chip becomes working title until the user edits.
  - Suggest: clicking a suggestion appends/removes a chip (toggle, consistent with chip-input semantics — used to inconsistently "replace" vs "append" depending on which UI element you came from).
  - Targeting: "Pull from brand" link in the collapsible fills `targetCustomers` from `brand.targetAudience`.
  - Generate disabled state covers all required-field gaps with an inline reason ("Pick a brand first.", "Add at least one keyword.", etc) instead of surprise toasts.
  - Loading-message array no longer mentions humanization or AI-detection passes (which no longer happen).
- **DraftToolbar.** Now renders status badges (Draft / Generating… / Failed / Done) driven by `article.status`. Trash icon now triggers a real `<AlertDialog>` confirmation — used to silently delete.

#### Articles page ([client/src/pages/articles.tsx](client/src/pages/articles.tsx))

- **Status filter** added: Ready (default) / Drafts & failures / Generating / Failed / All. Server query passes `status=`.
- **Status badge per card** for non-ready rows.
- **Brand chip on every card.** Multi-brand users could not previously tell which article belonged to which brand without filtering.
- **Derived excerpt.** If `excerpt` is null, take the first non-heading paragraph, slice to 160 chars, suffix `…`. Cards are no longer near-empty under the title.
- **`+N more` keyword overflow.** Visible chips capped at 5; overflow shows in a tooltip on hover.
- **`Intl.NumberFormat` view counts** ("1,234" not "1234"). Date hover tooltip shows absolute date.
- **Bulk delete.** Per-row checkbox + select-all in toolbar. AlertDialog confirms with count.
- **Status-driven actions.** Ready → View/Edit + Distribute. Draft → Continue draft. Failed → Retry generation. Delete is universal, AlertDialog-confirmed.
- **Empty states.** Search-clear button for "no matches"; status-aware empty states.
- **Distribute dialog.** Extracted to its own file. Selected platforms persist across tab switches within the dialog.

### 14.5 Bugs found and fixed during implementation

Several rebuild-introduced bugs surfaced during user testing of the dev server. Each documented here so the failure modes don't recur:

- **EventSource silently 401'd.** The SSE `Authorization: Bearer` header isn't sendable from the browser — only cookies. Auth is Bearer-only. Without a fix, the SSE connection just retried forever in the background while the UI showed nothing. Fix: `SELF_AUTHED_PREFIXES` allowlist in the global guard + `?token=` query param + inline JWT validation in the SSE handler.
- **Status flip lag.** Route handler used to set only `jobId` and leave status as `draft`; the worker's claim was the actual flip. That left a 5-60s window where the form was visible after the user clicked Generate. Fix: route handler now sets `status='generating'` synchronously; worker's `setArticleGeneratingFromDraft` allows `draft|generating → generating` (idempotent).
- **Cache staleness post-Generate.** Even after the synchronous flip, the client's cached article was stale. Fix: `setQueryData` optimistically patches `status` and `jobId` in the mutation's `onSuccess` before refetch returns.
- **Stuck stream with zero buffer.** Observed in production: a job claimed, OpenAI returned a stream iterator, but no chunks ever flowed. The for-await loop blocked indefinitely. The OpenAI client's `timeout: 120_000` doesn't fire on a stalled (open but empty) stream. Fix: per-stream `AbortController` + a 1s watchdog that aborts on idle (60s without chunks) or total ceiling (5min). Boot recovery shortened from 15 to 5 min.
- **Article wiped to title-only after streaming.** The most insidious one. The hydration `useEffect` was guarded by `hydratedForId.current === article.id` — fired once per id, never again. So when the article transitioned from `draft` (content=null) to `ready` (content=full text), `contentDraft` stayed at `""`. The MarkdownEditor rendered nothing under the title, and the content auto-save effect noticed the divergence and PATCH'd `content: ""` back to the server. Fix: split into a once-per-id form-field hydration and an always-run content re-hydration gated by a `userEditedContent` ref. Auto-save of `content` only fires after the user has actually typed.
- **Article 404 → infinite spinner.** When `:articleId` pointed to a deleted or non-owned article, the query returned `success:false` but the page treated `article === null` as "still loading." Fix: query now throws on `!ok || !json.success`, and a `useEffect` on `articleQuery.isError` redirects to `/content` to re-bootstrap.

### 14.6 Critical files

| File                                                                                                             | Change                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [migrations/0033_content_unification.sql](migrations/0033_content_unification.sql) (NEW)                         | Schema unification + backfill                                                                                                    |
| [shared/schema.ts](shared/schema.ts)                                                                             | `articles.status/jobId/...`, `articleRevisions`, `contentGenerationJobs.streamBuffer/errorKind/refundedAt`, drop `contentDrafts` |
| [shared/industries.ts](shared/industries.ts) (NEW)                                                               | Single source of truth for the industry list                                                                                     |
| [server/contentGenerationWorker.ts](server/contentGenerationWorker.ts)                                           | Streaming, watchdog, cancel, error classification, refund hook                                                                   |
| [server/lib/usageLimit.ts](server/lib/usageLimit.ts)                                                             | Added `refundArticleQuota`                                                                                                       |
| [server/storage.ts](server/storage.ts) + [server/databaseStorage.ts](server/databaseStorage.ts)                  | Replaced ContentDraft DAOs with unified-article methods                                                                          |
| [server/routes/content.ts](server/routes/content.ts)                                                             | Replaced; new generate/improve/stream/cancel endpoints                                                                           |
| [server/routes/articles.ts](server/routes/articles.ts)                                                           | Added draft + revisions endpoints; brandId required; parallel distribute                                                         |
| [server/auth.ts](server/auth.ts)                                                                                 | `SELF_AUTHED_PREFIXES` for SSE bypass                                                                                            |
| [server/lib/agentTaskExecutor.ts](server/lib/agentTaskExecutor.ts)                                               | Updated for unified-article enqueue helper                                                                                       |
| [server/scheduler.ts](server/scheduler.ts)                                                                       | Drop `deleteContentDraftsByBrandId` (FK cascade now handles it)                                                                  |
| [server/routes/userAccount.ts](server/routes/userAccount.ts)                                                     | GDPR export drops `contentDrafts`                                                                                                |
| [server/routes/publications.ts](server/routes/publications.ts)                                                   | Sitemap no longer emits article URLs                                                                                             |
| [server/routes/geoSignals.ts](server/routes/geoSignals.ts)                                                       | Schema audit reads `externalUrl`, no slug fallback                                                                               |
| [client/src/App.tsx](client/src/App.tsx)                                                                         | Add `/content/:articleId`; remove `/article/:slug` route + `ArticleView` import                                                  |
| [client/src/pages/article-view.tsx]                                                                              | DELETED                                                                                                                          |
| [client/src/pages/content.tsx](client/src/pages/content.tsx)                                                     | Full rewrite — route-driven, unified model, SSE+poll, no score, no Save button                                                   |
| [client/src/pages/articles.tsx](client/src/pages/articles.tsx)                                                   | Status filters, badges, brand chips, derived excerpts, bulk delete                                                               |
| [client/src/components/content/MarkdownEditor.tsx](client/src/components/content/MarkdownEditor.tsx) (NEW)       | Split-pane markdown editor                                                                                                       |
| [client/src/components/content/KeywordChips.tsx](client/src/components/content/KeywordChips.tsx) (NEW)           | Chip-input                                                                                                                       |
| [client/src/components/content/IndustryCombobox.tsx](client/src/components/content/IndustryCombobox.tsx) (NEW)   | cmdk combobox                                                                                                                    |
| [client/src/components/content/BrandCombobox.tsx](client/src/components/content/BrandCombobox.tsx) (NEW)         | cmdk combobox                                                                                                                    |
| [client/src/components/content/DraftToolbar.tsx](client/src/components/content/DraftToolbar.tsx)                 | Updated to render `Article` shape with status badges                                                                             |
| [client/src/components/content/draftHelpers.ts](client/src/components/content/draftHelpers.ts)                   | Type renamed to `DraftableArticle = Article`; status-aware helpers                                                               |
| [client/src/hooks/useArticleAutoSave.ts](client/src/hooks/useArticleAutoSave.ts) (NEW)                           | Single auto-save reducer                                                                                                         |
| [client/src/lib/diff.ts](client/src/lib/diff.ts) (NEW)                                                           | Line-level LCS                                                                                                                   |
| [client/src/components/articles/RevisionDiff.tsx](client/src/components/articles/RevisionDiff.tsx) (NEW)         | Diff viewer                                                                                                                      |
| [client/src/components/articles/ViewEditDialog.tsx](client/src/components/articles/ViewEditDialog.tsx) (NEW)     | View/Edit/Versions dialog                                                                                                        |
| [client/src/components/articles/DistributeDialog.tsx](client/src/components/articles/DistributeDialog.tsx) (NEW) | Extracted from legacy articles.tsx                                                                                               |
| [docs/content-flow.md](docs/content-flow.md) (NEW)                                                               | Lifecycle + streaming + refund classification reference                                                                          |

### 14.7 Pass criteria

- [x] `npx tsc --noEmit` clean across server + client + shared.
- [x] `npx vitest run` — 159/159 still pass (no test regressions; no new tests in this wave).
- [x] `npm run lint` — 0 errors (warnings all pre-existing).
- [x] Migration 0033 applies cleanly on a fresh DB and on an environment that already had `content_drafts` rows.
- [x] Click `/content` → bootstraps to a draft article id; click Generate → streams tokens live in the preview.
- [x] Cancel mid-stream → article returns to `draft`, quota counter went up by 1 then back down by 1.
- [x] OpenAI rate-limit / 5xx mid-job → article goes to `failed` with classified message; quota refunded.
- [x] Stream stalls with no chunks → 60s watchdog aborts → classified as `timeout` → quota refunded.
- [x] After streaming completes → editor view loads with full content (not title-only). Manual edits auto-save with version-conflict detection.
- [x] Auto-Improve creates a revision, shows a diff, never forks a duplicate article.
- [x] Restore an old revision → current content overwritten, a new `manual_edit` revision logs the restore.
- [x] `GET /article/anything` → NotFound. `GET /api/articles/slug/anything` → NotFound. Sitemap contains no article URLs.

### 14.8 Open items after Wave 7

- **Soft delete on articles.** Wave 7 leaves `DELETE /api/articles/:id` as a hard delete (FK cascade purges revisions + distributions + geo_rankings). Plan called for soft delete; deferred because `articles` doesn't have a `deleted_at` column yet and adding one is its own wave (need to update every list query to filter, every count to exclude). Tracked.
- **Citation/ranking surface on Articles list.** Per user decision, deferred to a separate epic. The DAO + server-side join is straightforward; the UI question (where the badge goes, whether sort-by-citations belongs in this view) is the real work.
- **Drop `human_score` and `passes_ai_detection` columns.** Kept through Wave 7 so the migration is reversible. Once we're confident no code reads them, a follow-up migration can drop both. Currently dead in the UI.
- **`MAX_CONTENT_LENGTH` not enforced on generate.** The new generate endpoint accepts any keyword length and any prompt size; only `/api/articles/:id/improve` checks `MAX_CONTENT_LENGTH`. Generate-side cap should be added when we wire word-count overrides.
- **Custom length per content type.** Plan called for an optional `customLengthWords` numeric override. Not implemented in this pass — the worker still uses the four hardcoded word bands. Cheap to add when the UX is ready.
- **Real AI-detection.** Removed the LLM-graded score entirely. If we ever want a real one, GPTZero / Originality.ai / Copyleaks would be the path. Out of scope for this wave.
- **Streaming via the circuit breaker.** The streaming OpenAI call doesn't go through `openaiBreaker.run()` (the wrapper doesn't expose async iterators). Mild safety regression — accepted because a streaming call takes longer than the breaker's window anyway.
