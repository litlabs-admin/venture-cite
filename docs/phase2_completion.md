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

### 14.9 Production CORS + APP_URL fixes (Render deploy)

After the Wave 7 push went live the production logs surfaced two CORS-shaped failures that needed follow-up fixes:

#### Static assets blocked by CORS

Symptom: every page load 500'd on `/assets/index-*.js` and `/assets/index-*.css` with `CORS: origin https://www.venturecite.com not allowed`. The page is served from the same origin — CORS shouldn't even apply.

Cause: Vite emits `<script crossorigin>` and `<link crossorigin>` on its module-preload tags. With `crossorigin` set, the browser sends an `Origin` header even on same-origin asset requests, which made our global CORS middleware run and reject. The request was technically same-origin but the `Origin` header was unfamiliar to the API allowlist.

Fix in [server/index.ts](server/index.ts): scoped the CORS middleware to `/api/*` requests only. Static assets bypass it entirely. Same-origin asset loads no longer trip the allowlist:

```ts
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return corsMiddleware(req, res, next);
  return next();
});
```

#### APP_URL trailing slash silently breaking the allowlist

Symptom: even after fixing static assets and adding `APP_URL=https://www.venturecite.com/` in Render, `POST /api/auth/login` still 500'd with `CORS: origin https://www.venturecite.com not allowed`.

Cause: the env var had a trailing slash (`https://www.venturecite.com/`). The boot-time CORS allowlist log showed `https://www.venturecite.com/` literally. The browser's `Origin` header is `https://www.venturecite.com` (no slash). String comparison fails.

Two-part fix:

1. **Operator fix:** dropped the trailing slash from `APP_URL` in Render's env vars.
2. **Code fix in [server/index.ts](server/index.ts):** `expandApexAndWww` now reconstructs a canonical `${protocol}//${host}[:${port}]` form (no path, no trailing slash) before adding to the allowlist. A trailing slash in `APP_URL` or `EXTRA_CORS_ORIGINS` is now stripped automatically:

```ts
const port = u.port ? `:${u.port}` : "";
const canonical = `${u.protocol}//${host}${port}`;
const out = new Set<string>([canonical]);
```

Also added a boot-time log line so the resolved allowlist is visible immediately on startup instead of buried inside 500 responses:

```
[express] CORS allowlist: https://www.venturecite.com, https://venturecite.com, http://localhost:5000, http://127.0.0.1:5000
```

#### APP_URL fallback to RENDER_EXTERNAL_URL

While debugging CORS we also relaxed `APP_URL` from required to optional in [server/env.ts](server/env.ts). Resolution order is now:

1. `APP_URL` if set (highest priority — required when you have a custom domain like `https://venturecite.com` because Render's auto URL is the wrong host for emails).
2. `RENDER_EXTERNAL_URL` (Render auto-injects this; points at the `*.onrender.com` URL).
3. `http://localhost:5000` in dev.
4. Hard fail in production if none of the above resolve.

Ship-fresh Render deploys without a custom domain now boot without manual env config — `RENDER_EXTERNAL_URL` covers email links, Stripe redirects, and CORS. Custom-domain deploys still require `APP_URL` to be set explicitly so emails don't link to the `*.onrender.com` URL.

#### CORS apex/www auto-expansion

Added in [server/index.ts](server/index.ts): every entry in the CORS allowlist auto-expands to cover both the bare-apex and `www.` form. If `APP_URL=https://venturecite.com`, the allowlist also accepts `https://www.venturecite.com`, and vice-versa. DNS pointing both names at the same service no longer requires a code change to add the alternate. New `EXTRA_CORS_ORIGINS` env var (comma-separated) for staging/preview deploys; each entry is also auto-expanded.

#### Slug column 500s on the deployed-but-not-pushed window

Symptom: production was throwing `column "slug" does not exist` for every `getArticles()` call.

Cause: migration 0033 had been applied to the production DB (dropping the slug column), but the deployed code bundle was still pre-Wave-7 (`fd16ce8`) and Drizzle's compiled SELECT still listed `slug`. Database and code were out of sync because Wave 7 hadn't been pushed yet.

Fix: pushed the Wave 7 commit. Once Render rebuilt the bundle from the new shared/schema.ts, the SELECT no longer requested a non-existent column. No code change needed beyond the original Wave 7 work — this was a deploy-ordering artifact, documented here so the failure pattern is recognizable next time a schema migration races a code push.

---

## 15. Wave 8 — Analytics correctness v2 + crawler refresh + Opportunities / GEO Tools / GEO Signals fixes

### 15.0 Why this wave existed

After Wave 5 / 6 shipped the analytics scaffolding, a live QA walkthrough surfaced a second layer of failures:

1. Sentiment was never populated during citation runs — geo-analytics rendered 0/0/0 forever.
2. Competitor leaderboard summed brand citations only from `articles`, missing the `brand_prompts` path that holds most real citations. Brands with 29 cited rankings showed 0% share-of-voice.
3. Share-of-Answer "By Prompt Category" bucketed by AI platform (DeepSeek, Gemini…) instead of intent (informational, transactional…) — the Phase-1 fallback author took a shortcut.
4. By Funnel / Competitor Comparison / Answer Stability / Tracked Prompts read from a deprecated `prompt_portfolio` table nothing in the active pipeline writes to.
5. Citation Quality "Breakdown" card read `citation_quality` directly with no Phase-1 fallback.
6. Source Types showed 1 because `citingOutletUrl` was rarely populated.
7. Hallucinations "Mark as resolved" fired the DB update but the list never refreshed (query-key mismatch between list and invalidation).

On top of that, the user wanted the counting pipeline collapsed: one merged LLM analysis call per response (extract + judge), down from N+1 per-entity judge calls + a separate auto-discovery pass.

The wave also covered: a crawler-check bot-list refresh + parser bug, the Opportunities empty state, four GEO Tools gaps (Wikipedia persistence, BOFU clarity, Mentions scan trigger, FAQ optimised toggle), and four GEO Signals gaps (Chunk Engineer apply-to-article, Schema Lab real fetch, Schedule Update wiring, no-articles empty state).

### 15.1 Merged extract+judge analyzer

[server/lib/responseAnalyzer.ts](server/lib/responseAnalyzer.ts) (new) — single function `analyzeResponse({responseText, trackedEntities})`. One gpt-4o-mini call returns `{brands: {name: {variants, cited, rank, relevance, context, citedUrls}}}` for every brand it detected, tracked or not. Validated with Zod (≤25 brands, ≤5 variants, ≤3 URLs). `parseLLMJson` for tolerant JSON parsing. `deriveSentiment(relevance, cited)` helper exported alongside.

[server/citationChecker.ts](server/citationChecker.ts) — `runPlatformCitationCheck` accepts `opts.skipJudge` so the per-response brand judge call is skipped. The main `runOne` task now:

1. Fetches the platform response (no internal judge).
2. Calls `analyzeResponse` once with brand + every competitor as `trackedEntities`.
3. Reads `analysis.tracked[brand.id]` for brand verdict; loops competitors using `analysis.tracked[comp.id]`.
4. Auto-discovers brands from `analysis.untracked[]` (cap 10/run/platform).
5. Writes `geo_rankings` (always) + `competitor_geo_rankings` (cited only) + `brand_mentions` rows.

Call-count math for a 30-prompt × 5-platform × 15-competitor run: ~2,250 judge calls → ~150 analyzer calls. ~80% reduction in LLM spend.

Sentiment is now derived from analyzer relevance (`>=70 positive, 40-69 neutral, <40 negative, null when not cited`) and persisted to both `geo_rankings.sentiment` and `competitor_geo_rankings.sentiment`. Migration `0028_competitor_sentiment.sql` adds the column.

Auto-discovered competitors carry `discoveredBy='citation_auto'`. UI badge added at [client/src/pages/competitors.tsx](client/src/pages/competitors.tsx) (`Auto` label) so users can review and demote them.

Entity matching in the analyzer was hardening-pass strengthened: `stripSuffixes` strips legal suffixes (`Inc`, `LLC`, `Labs`, `Technologies`, etc.) on both sides of the index — so "Notion Labs, Inc." matches "Notion" and vice versa. Without this fix, real brands with formal names never matched analyzer output and the competitor pipeline produced zero rows.

### 15.2 Brand citations unified across articles + brand_prompts

[server/databaseStorage.ts](server/databaseStorage.ts) `getCompetitorLeaderboard` rewrote the brand-row builder to OR brand-articles AND brand-prompt rankings in a single window-scoped query, deduped by ranking id. The geo-analytics page already did this correctly — the bug was leaderboard-only.

The leaderboard endpoint now returns `meta: {totalTracked, withActivity}`. UI renders "15 tracked · 14 with activity in last 30d" instead of one number that disagreed with the competitors page count.

### 15.3 Share-of-Answer rebuild

[server/databaseStorage.ts](server/databaseStorage.ts) `getShareOfAnswerStats`:

- Queries `prompt_portfolio` directly (NOT through `getPromptPortfolio`, which now synthesizes Phase-1 rows for the Tracked Prompts tab and was masking the Phase-1 stats branch).
- When the Phase-2 table is empty (the common case): bucket `byCategory` by `brand_prompts.category`, `byFunnel` by `funnelStage` (with category-derived fallback: informational → awareness, comparison → consideration, transactional → decision).
- `byCompetitor` joins `competitor_geo_rankings` filtered to `isCited=1`. Denominator is the brand's total checks in the window — previously every competitor showed 100% shareAgainst because total/cited counted the same rows.
- `avgVolatility` / `volatilityDistribution` per **(brand_prompt, ai_platform) pair** across runs, not per brand_prompt alone — previous grouping mixed platforms together and inflated apparent flips. Pairs with <2 runs are skipped (no history yet).

`citedPrompts` semantic fix: was `rankings.filter(isCited===1).length` (raw rows, inflated by platforms × runs). Now: `new Set(rankings.filter(...).map(r.brandPromptId)).size` — distinct prompts cited at least once. Separate `citationRate = citedChecks / totalChecks` keeps the per-check rate.

`getPromptPortfolio` synthesizes Phase-1 rows from `brand_prompts × geo_rankings` when the real table is empty so the Tracked Prompts list isn't blank for new brands.

### 15.4 Citation Quality Phase-1 fallback

[server/databaseStorage.ts](server/databaseStorage.ts) `getCitationQualities` falls back to deriving rows from `geo_rankings` when `citation_quality` is empty:

```
qualityScore = positionScore * 0.4 + relevance * 0.4 + authority * 0.2
positionScore = max(0, 100 - (rank - 1) * 10)
isPrimaryCitation = rank <= 3 ? 1 : 0
sourceType = domain(citingOutletUrl) || 'ai-generated'
recencyScore = 100 - (ageDays / 90) * 100, clamped 0..100
```

The endpoint serves real per-row data even when the deprecated Phase-2 table is untouched, so the Citation Quality breakdown card renders.

### 15.5 metrics_history dual-write + Trends granularity

[server/lib/metricsSnapshot.ts](server/lib/metricsSnapshot.ts) writes both `citation_rate` + `share_of_answer` (same value) and both `hallucinations` + `hallucinations_unresolved` so TrendsTab queries match.

[server/databaseStorage.ts](server/databaseStorage.ts) `storage.recordCurrentMetrics` (the version called by the Trends "Record Snapshot" button — different function from `lib/metricsSnapshot.ts`) gained a Phase-1 fallback. Previously it only read `prompt_portfolio` and silently wrote nothing on click. Now Phase-2 first, Phase-1 fallback, hallucinations always.

[client/src/components/intelligence/TrendsTab.tsx](client/src/components/intelligence/TrendsTab.tsx) `getTrendChartData` keys snapshots by ISO timestamp rounded to the minute (was `toLocaleDateString()` — day granularity). Three citation runs on the same day previously collapsed into one chart point with `.find()` returning the first row only; now each run gets its own point.

### 15.6 Mentions semantics

Citation = brand in a ranked recommendation (`isCited=1`). Mention = brand name appeared in the response at all (cited OR not-cited but analyzer-detected).

[server/citationChecker.ts](server/citationChecker.ts) writes a `brand_mentions` row whenever the analyzer surfaced the brand, not only when cited. Metadata carries `cited: true|false` so downstream filters can distinguish. Synthetic URL `ai://{platform}/{runId}/{promptId}` prevents the `(brandId, platform, sourceUrl)` dedup index from inflating across re-runs.

[server/routes/analytics.ts](server/routes/analytics.ts) `totalMentions` reads from `brand_mentions` table (real source) instead of counting ranking rows. Previously "mentions" on geo-analytics was just "total checks" mislabeled.

### 15.7 Hallucinations — invalidation + URL parse + state machine

Three separate bugs, all fixed:

[client/src/components/intelligence/HallucinationsTab.tsx:96](client/src/components/intelligence/HallucinationsTab.tsx#L96) — invalidation key changed from `["/api/hallucinations"]` to `[`/api/hallucinations?brandId=${id}`]` to match the list query exactly. Same-array exact-match is how TanStack Query compares single-string keys; the bare path never matched the parameterised list, so the DB updated but the UI showed stale state until reload.

[client/src/components/intelligence/HallucinationsTab.tsx:300-328](client/src/components/intelligence/HallucinationsTab.tsx) — `new URL(citingUrl)` was throwing on synthetic `ai://` URLs and bare-domain strings. Wrapped in a try/catch that prepends `https://` when no scheme is present, hides the source link entirely for `ai://` URLs.

[server/lib/statusTransitions.ts:29-37](server/lib/statusTransitions.ts) — added `pending → resolved` to the allowed transitions (was `pending → in_progress → resolved` only). The UI's "Mark as resolved" is a one-click flow; users shouldn't have to first toggle to in_progress. New unit test covers the direct path.

### 15.8 Crawler check refresh

[server/routes/analytics.ts](server/routes/analytics.ts):

- **Bot list updated** to current vendor names. Removed deprecated `Claude-Web`, `anthropic-ai`, `facebookexternalhit` (link previews, not AI training). Added `OAI-SearchBot`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `Applebot` (plain), `meta-externalagent`. Each entry carries a `category` so the UI groups by vendor.
- **Parser bug fixed.** `Disallow:` with empty value used to normalise to `/` — that's the opposite semantic (empty Disallow = allow everything per RFC 9309). The previous code flagged every crawler as blocked on sites with `Disallow:`. Empty paths are now preserved and treated as an explicit allow-all signal in `isCrawlerBlocked`.
- **Recommended robots.txt snippet** now covers every vendor, grouped with comments. `criticalBlocked` set updated to current names.

[client/src/pages/crawler-check.tsx](client/src/pages/crawler-check.tsx) — crawlers grouped by category in the UI ("OpenAI (3 bots)", "Anthropic (3 bots)") with per-vendor "N blocked" badge.

### 15.9 Opportunities — empty-state CTA

[client/src/pages/geo-opportunities.tsx](client/src/pages/geo-opportunities.tsx) added a "Run Citation Check →" button (wouter `<Link>` to `/citations`) inside the "No citation data yet" card. Previously a dead text-only empty state.

### 15.10 GEO Tools

[server/routes/contentTypes.ts](server/routes/contentTypes.ts) — Wikipedia scan now persists each recommended page to `wikipedia_mentions` (mentionType `related`, source `wikipedia_scan`, deduped by `pageUrl`). The endpoint returns `savedRecommendations` count so the toast can reflect "Saved N new recommendations" vs "All recommendations were already tracked".

[client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx):

- BOFU toast clarified ("Saved! View in BOFU Content tab — saved to this brand's library"). Server already auto-saves at `contentTypes.ts:476` — the previous toast just didn't tell users.
- Mentions tab gained a `Scan Now` button + `scanMentionsMutation` calling the existing `POST /api/brand-mentions/scan/:brandId` endpoint (Reddit + HN + citation-domain mining).
- FAQ list status icon → clickable button. `toggleFaqOptimizedMutation` PATCHes `/api/faqs/:id` with `{isOptimized: 0|1}`. Toggles between "Mark optimized" and "Optimized" with a success toast. Replaces a read-only badge that nothing flipped.

### 15.11 GEO Signals

[client/src/pages/geo-signals.tsx](client/src/pages/geo-signals.tsx):

- **Chunk Engineer "Apply to Article".** New `applyOptimizedMutation` PUTs `/api/articles/:id` with the optimised content. Buttons added next to the optimised-content textarea: "Copy" + "Apply to Article". Closes the loop — feature is now a real tool, not a report.
- **"Schedule Update" → "Mark Updated".** Vaporware button is now wired: empty-body PUT to `/api/articles/:id`, which causes `storage.updateArticle` to bump `updatedAt = now()` (server-managed). Freshness scores reflect the new timestamp on next render. Articles invalidated.
- **No-articles empty state.** When a brand has no articles, the empty `<Select>` dropdown is replaced with a "Create an article →" link to `/articles`.

[server/routes/geoSignals.ts](server/routes/geoSignals.ts) — Schema Lab does a real fetch + JSON-LD parse:

1. SSRF-safe fetch via `safeFetchText` (max 2MB, 15s timeout, custom User-Agent).
2. Regex-extract every `<script type="application/ld+json">` block.
3. Parse each as JSON (skips malformed blocks, walks nested `@graph` and arbitrary keys), collect every `@type` value.
4. Mark each catalogue schema (Article, FAQPage, HowTo, Organization, BreadcrumbList, WebPage, Product) as present/missing based on real findings.
5. Surface `additionalTypes` for schemas outside the catalogue (Event, Recipe, VideoObject, etc.).
6. SSRF rejection (private IPs, file://, metadata endpoints) returns 400 with a clear error.

Replaces the previous mock that returned `Math.random() > 0.3` regardless of URL — sites with FAQ schema were being told to "add FAQ schema".

### 15.12 Verification

- `npm run check` clean
- `npm run lint` 0 errors (warnings pre-existing)
- 129/129 tests pass (1 new: `pending → resolved` direct transition)

### 15.13 Out of scope

Deliberately not in this wave:

- **Pipeline Simulation refinement** ([server/routes/geoSignals.ts](server/routes/geoSignals.ts) `pipeline-simulation`). Recommendations are templated heuristics; meaningful improvement requires real query/embedding analysis. Captured in the audit, not fixed.
- **Freshness score sophistication.** Currently `100 - ageDays`. The "How to Improve" panel describes Google's nuanced signal (cadence, content type, topic churn) but the math doesn't reflect it. Acceptable simplification for now.
- **Background scanners** for listicles / brand-mentions. Both still require a manual button; cron-driven scheduling deferred until usage patterns clarify which scans are worth running automatically.

---

> Wave 8 superseded by Wave 9 below.

---

## Wave 9 — Citations end-to-end fixes (correctness + UX + scaling)

The dominant user-reported bug — "I have to manually refresh every page" — was a TanStack Query semantics gotcha: `setQueryDefaults({ refetchInterval })` only takes effect when a new observer is created, not on already-mounted ones. The Wave 8 live-refresh hook never started polling on dependent pages because they had already mounted by the time the hook ran. Wave 9 fixes that and 30+ adjacent issues found across every Citations sub-tab.

### 16.1 Live-refresh fix (the actual bug)

[client/src/hooks/useCitationLiveRefresh.ts](../client/src/hooks/useCitationLiveRefresh.ts) rewritten to return `{ hasActive, refetchInterval }` instead of mutating defaults imperatively. Every consuming page ([home.tsx](../client/src/pages/home.tsx), [geo-analytics.tsx](../client/src/pages/geo-analytics.tsx), [competitors.tsx](../client/src/pages/competitors.tsx), [geo-tools.tsx](../client/src/pages/geo-tools.tsx), [ResultsTab.tsx](../client/src/components/citations/ResultsTab.tsx), [HistoryTab.tsx](../client/src/components/citations/HistoryTab.tsx)) threads the value into its `useQuery({ refetchInterval })`. TanStack dedupes the gate query so the underlying status poll is shared across all hooks. [useActiveCitationRuns](../client/src/hooks/useActiveCitationRuns.ts) gained idle-aware backoff (8 s → 30 s → 60 s after consecutive empty polls) and pauses when the tab is hidden.

### 16.2 Async run lifecycle

- [migrations/0035_citation_runs_dedup.sql](../migrations/0035_citation_runs_dedup.sql): partial unique index `citation_runs(brand_id) WHERE status IN ('pending','running')`.
- New `kickoffBrandPromptsRun` in [server/citationChecker.ts](../server/citationChecker.ts) creates the row synchronously, fires `runBrandPrompts` via `setImmediate`, returns `{ runId }` in ~100 ms. `POST /run` no longer holds HTTP open for 30-120 s. 23505 → 409 `{ error: 'already_running', runId }` so a second-tab race joins the existing stream.
- [server/lib/citationReconciliation.ts](../server/lib/citationReconciliation.ts) called between `applyMigrations` and `initScheduler` in [server/index.ts](../server/index.ts) — marks any `pending|running` row older than 15 min as `failed` so server crashes don't permanently block the brand.
- `bumpProgressIfDue` now bumps every 5 tasks **OR** every 1.5 s — small runs feel live.
- `re-detect-all` writes a `triggeredBy='re-detect'` row so the live banner fires for it.

### 16.3 SSE hardening

In [server/routes/prompts.ts](../server/routes/prompts.ts): 20 s heartbeat (comment frame), per-user 3-stream cap (oldest evicted on the 4th tab), 5-min cap sends `event: end, data: { reason: "timeout", reconnect: true }`, client reconnects with a fresh JWT (bounded to 5 retries) so long runs (>1 h, JWT lifetime) keep their banner. First-tick `lastSinceMs = run.startedAt` so a (re)connect replays existing rankings — Latest Results populates immediately. `console.warn` → `logger.warn` per CLAUDE.md.

### 16.4 Variation cache + disagreement counter

Run-scoped `Map<entityId, string[]>` replaces ~50 per-response `getBrandById` + `getCompetitors` reads. Updated synchronously when `addBrandNameVariation` / `addCompetitorNameVariation` succeed so the matcher sees variants the analyzer just learned for THIS response — strict ordering preserved. [migrations/0036_citation_runs_disagreement.sql](../migrations/0036_citation_runs_disagreement.sql) adds `disagreement_count` to citation_runs; HistoryTab surfaces a tooltip when ratio ≥5%.

### 16.5 ScheduleTab v2

[migrations/0037_citation_schedule_v2.sql](../migrations/0037_citation_schedule_v2.sql) adds `auto_citation_hour`, `auto_citation_active`, `last_auto_citation_status`. [server/scheduler.ts](../server/scheduler.ts) honors all three. [ScheduleTab](../client/src/components/citations/ScheduleTab.tsx) rewritten with hour picker, pause Switch, "Next run" preview in local TZ, quota banner, last-run status indicator.

### 16.6 Sub-tab UX

| Tab                | Wave 9 changes                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Citations shell    | Re-check stored → overflow menu; banner deep-link to Results tab; hide "0 cited / 0 checks so far" until SSE delivers; loading messages tied to `hasActive`; "Run started" toast; 409 → "Run already in progress" toast. |
| PromptsTab         | 1-500 char validation + counter + optimistic edit; checkbox-gate on Reset all; quota-confirm dialog before Refresh; Accept-suggestion radio default = none + side-by-side preview.                                       |
| ResultsTab         | Best Platform requires ≥5 checks; stable best-prompt tie-break; 0% empty state with next steps; sortable platform table; per-prompt sort dropdown; CSV export; last-run timestamp.                                       |
| HistoryTab         | Status badges + errorMessage tooltip; chart filter (Scheduled/Manual/Re-detect/All); excludes non-succeeded rows; date filter; drill-down cache; disagreement badge.                                                     |
| PlatformResultCard | HSL hash for unknown platforms; "Check failed:" inline error pill; Copy + Open-in-chat (deep-link for ChatGPT/Gemini/Perplexity, clipboard fallback for Claude/DeepSeek).                                                |

### 16.7 Tests

- [tests/unit/citationChecker.kickoff.test.ts](../tests/unit/citationChecker.kickoff.test.ts) — kickoff returns sync, dedup 23505 → 409 shape, detached failure writes errorMessage.
- [tests/unit/citationReconciliation.test.ts](../tests/unit/citationReconciliation.test.ts) — SQL filters by status + 15 min age, swallows DB errors, logs reconciled rows.
- 18 files / 171 tests pass.

### 16.8 Verification

- `npm run check` — 0 errors.
- `npx vitest run` — 171/171 green.
- E2E manual matrix in [docs/citation-detection.md § Wave 9](citation-detection.md).

### 16.9 Out of scope

- Single-prompt re-run endpoint. Marginal value over Run Check.
- `geo_ranking_flags` table for "Flag as wrong". Capture-only without admin review UI was vague-value.
- Day-of-month vs day-of-week for monthly schedule. Edge cases (months <31 days) deserve a focused follow-up.
- Postgres LISTEN/NOTIFY replacing SSE polling. Not needed at current scale.
- Run cancellation. Detached run runs to completion regardless.

## Wave 9.1 / 9.2 — Citations follow-ups (correctness + run-window scoping)

Two rounds of user-reported bugs surfaced after Wave 9 shipped. The dominant theme: data shown during an active run mixed all-time history with the run's incoming numbers, so totals barely moved and aggregate cards looked frozen. Plus a handful of correctness bugs where re-detect rows polluted History, prompt-suggestion accept silently replaced rows, and historical aggregates drifted from `geo_rankings`.

### 16a.1 Re-detect rows polluting History

Clicking Re-check on a single result wrote a new `citation_runs` row with `triggeredBy='re-detect'`, which appeared in HistoryTab as a fresh "run" with totals like `1/50` (only the re-detected platform was checked). User read this as "the run failed for 49 prompts". [migrations/0038_drop_redetect_runs.sql](migrations/0038_drop_redetect_runs.sql) deletes existing re-detect rows; the re-detect path no longer writes to `citation_runs` at all. Live banner trigger for the bulk `re-detect-all` flow stays (Wave 9.2 — that one IS a real run; only single-row re-checks were demoted).

### 16a.2 Suggested-prompt accept forced replacement

The accept-suggestion endpoint required a `replaceTrackedId` even when the brand had open slots. Users on under-cap brands got "select a tracked prompt to replace" prompts that didn't apply. Fix: `replaceTrackedId` is now optional. Server enforces the cap explicitly (`getActivePromptCount(brand) >= cap` → require replacement; otherwise insert directly). UI no longer shows the replacement picker when slots are free.

### 16a.3 Aggregate drift between citation_runs and geo_rankings

User reported a History row showing `2/50` cited when the drill-down clearly summed to 16/50. Root cause: `citation_runs.total_cited` is a cached aggregate maintained by the run loop, but Wave 8's matcher-authoritative `is_cited` flips happened after the cache was last bumped, so the cache was stale.

[migrations/0039_recompute_citation_run_aggregates.sql](migrations/0039_recompute_citation_run_aggregates.sql) recomputes `total_checks` + `total_cited` for every existing `citation_runs` row by summing the underlying `geo_rankings`. New helper [`recomputeCitationRunAggregate(runId)`](server/databaseStorage.ts) is called from `re-detect-all` (and is the entry point future `is_cited` mutations should use) so the cache stays honest. Wave 9.3's migration 0040 went further and rebuilt `platform_breakdown` JSONB the same way.

### 16a.4 Latest Results not resetting on a fresh run

Starting a new run left the prior run's results visible while the new run streamed in. User read it as "the new run is broken". Fix is the `?since=` filter pattern: when a run is active the page passes the run's `startedAt` ISO into the query key, so the cache rotates and only the run's rows render. Server-side, `loadRankingsContext(brandId, opts)` accepts `{ since?, windowDays? }` with `since` taking precedence. Same pattern was extended to Dashboard hero / rankings / gap-matrix / entity-strength and to GEO Analytics in Wave 9.2.

[server/routes/prompts.ts](server/routes/prompts.ts), [server/routes/dashboard.ts](server/routes/dashboard.ts), [server/routes/analytics.ts](server/routes/analytics.ts), [client/src/pages/citations.tsx](client/src/pages/citations.tsx), [client/src/pages/home.tsx](client/src/pages/home.tsx), [client/src/pages/geo-analytics.tsx](client/src/pages/geo-analytics.tsx).

### 16a.5 ScheduleTab v2 hour picker silently never fired

Wave 9's hour gate inside `isBrandDueForCitation` rejects when `currentHour < auto_citation_hour`. But the `AUTO_CITATION_CRON` was `"0 6 * * *"` — daily at 06:00 UTC — so any brand that picked an hour ≥ 7 got rejected at 06:00 and the cron never ran again that day. Picker promised behavior the scheduler couldn't deliver.

Fix: cron default → `"0 * * * *"` (hourly check). Each tick is cheap (one SELECT + per-brand filter); per-brand gates are unchanged. [migrations/0040_citation_schedule_v2_fixes.sql](migrations/0040_citation_schedule_v2_fixes.sql) backfills `auto_citation_hour=0` for any row still at the legacy migration default of 9, so brands that never touched the picker continue firing at the legacy 06:00 ish window. New brands explicitly choose an hour. Migration 0040 also rebuilds `platform_breakdown` JSONB on every existing `citation_runs` row via `jsonb_object_agg` over `geo_rankings` — so HistoryTab tooltips stop showing stale per-platform numbers from before Wave 8.

[server/scheduler.ts](server/scheduler.ts).

### 16a.6 Drill-down rows in arbitrary DB order

`getGeoRankingsByRunId` returns whatever the DB hands back; under concurrency=5 prompts complete out of order. User read drill-down accordion as "5, 1, 7, 2, …". Fix: the route in [server/routes/prompts.ts](server/routes/prompts.ts) loads `brandPrompts` once, builds a `Map<promptText, orderIndex>`, and post-sorts the drill-down array. Prompts no longer in the brand (deleted/archived) sort to the end via `Number.MAX_SAFE_INTEGER`.

### 16a.7 POST /run accepted empty platforms[]

Empty `platforms[]` silently kicked off a run that finalized as failed. Phantom row in History. Now `POST /run` 400s with "At least one platform must be selected" before any DB write.

### 16a.8 Kickoff race retry bounded

Original `kickoffBrandPromptsRun` used a recursive IIFE on 23505 (the active-run partial unique index). Theoretical infinite loop on a pathological race. Capped at one retry; if the retry also hits 23505 _and_ `getActiveCitationRuns` is empty, returns `{ ok: false, reason: "race", runId: null }`. Surfaces as a 500 with a clean toast.

[server/citationChecker.ts](server/citationChecker.ts).

### 16a.9 SSE progress event also invalidates the results query

The 1 s gap at 100%: the last `progress` SSE event delivered `totals=50/50` but didn't invalidate the results query, so the banner showed 100% while the accordion still showed 49/50 until `complete` fired the one-shot. Now the `progress` handler also calls `queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${brandId}/results`] })`. Banner and accordion catch up together.

### 16a.10 Optimistic banner + brand-switch state clear

First-run banner used to wait ~8 s for the active-runs gate query to detect the new run. `runMutation.onSuccess` now seeds `pendingRunId` from the kickoff response so the banner appears within ~200 ms; cleared once the gate confirms or after a 30 s safety timeout. `useEffect` reset on `selectedBrandId` change clears both `liveProgress` and `pendingRunId` so old-brand state doesn't bleed into the new banner.

[client/src/pages/citations.tsx](client/src/pages/citations.tsx).

### 16a.11 HistoryTab — drilldown cache LRU + clearer trigger badges

Drill-down details cached forever; long sessions accumulated 25 MB of stale blobs. Now LRU-capped at 10 (oldest key evicted on insert).

Trigger badge used `<Badge className="capitalize">{run.triggeredBy}</Badge>`, which rendered `auto_onboarding` as `Auto_onboarding` — ugly and misleading. Replaced with an explicit label map (`manual → Manual`, `cron → Auto`, `auto_onboarding → Onboarding`, `re-detect → Re-detect`); fallback to title-case for unknowns.

[client/src/components/citations/HistoryTab.tsx](client/src/components/citations/HistoryTab.tsx).

### 16a.12 useActiveCitationRuns — module-scoped empty-streak

The Wave 9 idle-aware backoff stored its consecutive-empty-poll counter in a per-component `useRef`. Home calls this hook 7+ times via `useDashboardQueries` observers, each with its own ref; one fast hook (just-mounted, streak=0) keeps every other observer fast even when the page is genuinely idle. Moved the counter to module scope keyed by `brandId` so all observers on the same brand share cadence. Roughly halves idle poll volume on multi-consumer pages.

[client/src/hooks/useActiveCitationRuns.ts](client/src/hooks/useActiveCitationRuns.ts).

### 16a.13 ResultsTab — CSV export removed

User explicit request. Dropped `handleExportCsv`, the button, and the `Download` icon import. No server-side change — the endpoint never knew about CSV.

[client/src/components/citations/ResultsTab.tsx](client/src/components/citations/ResultsTab.tsx).

### 16a.14 Verification

- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` — 171/171 green.
- Migrations 0038, 0039, 0040 are idempotent (UPDATE that's a no-op on already-correct rows).

## Wave 9.3 — AI Intelligence + GEO Tools/Analytics correctness pass

End-to-end critique covered the AI Intelligence page (6 sub-tabs), GEO Tools (5 sub-tabs), and GEO Analytics. Findings mixed real cross-tenant exposure, broken-by-design UX (mutation invalidations missing the cached entry), and Wave 9.2 follow-throughs that didn't reach every consumer. This wave fixes everything user-visible without breaking existing flows.

### 17.1 Cross-tenant data leak: stat/list endpoints missing ownership

`/api/prompt-portfolio/stats/:brandId`, `/api/citation-quality/stats/:brandId`, `/api/alert-settings/:brandId`, `/api/alert-history/:brandId`, `/api/bofu-content/:brandId`, and `/api/faqs/:brandId` accepted any brandId without verifying the caller owned it. The list-style siblings (e.g. `/api/hallucinations`) had been hardened, but these stat/by-brand reads slipped through. Fixed by threading `requireUser(req)` + `await requireBrand(:brandId, user.id)` through each handler. `/api/alert-history` also bounds `?limit` at 200 (was unbounded — a brand that misfires alerts overnight could load 10MB of JSON into the panel).

[server/routes/intelligence.ts](server/routes/intelligence.ts), [server/routes/contentTypes.ts](server/routes/contentTypes.ts).

### 17.2 Alert duplicate-fire: missing unique constraint

The `alert_settings` schema only had a brand_id index. Double-clicking the create button — or two browser tabs racing — produced two rows of the same `(brand_id, alert_type)`, each then fired its own email/Slack notification on every triggering event. The user's complaint surfaced as "I keep getting two emails for the same hallucination."

Fix is two-layered. [migrations/0041_alert_settings_unique.sql](migrations/0041_alert_settings_unique.sql) collapses legacy duplicates (keeping the oldest row per `(brand_id, alert_type)` so any user-edited threshold/channel survives) then adds `UNIQUE INDEX alert_settings_brand_id_alert_type_uniq`. The Wave 9.3 `POST /api/alert-settings` handler also pre-checks via `getAlertSettings(brandId)` and returns 409 with a clear message — so the UX surfaces "An alert of this type already exists" instead of a generic 500. The client mutation now has an `onError` toast that renders that message.

### 17.3 GEO Analytics — Wave 9.2 since-filter incomplete

Wave 9.2 threaded `?since=` into the brand-prompt rankings path but two consumers were missed:

**Article-tied rankings** were still loaded via `getGeoRankings()` (full table scan) and post-filtered in memory by `r.checkedAt >= sinceFilter`. Inefficient at scale and a precision-mismatch hazard (timestamps stored at millisecond resolution but filter dates from `new Date(ISO)` could round differently across drivers). Added [`getGeoRankingsByArticleIds(ids, sinceDate?)`](server/databaseStorage.ts#L515) — symmetric to `getGeoRankingsByBrandPromptIds` — and the `/api/geo-analytics` handler now uses the indexed call.

**Competitor leaderboard** wasn't getting `since` at all. So during a fresh run, brand citations were filtered to the run window (e.g. 100 in the last 5 minutes) but the leaderboard's `totalMarketCitations` still summed every competitor's all-time totals (e.g. 5000). Share-of-Voice read 100/5000 = 2% during the run when the run-relative SoV was actually 50%. The `getCompetitorLeaderboard()` storage method already accepted `opts.since` (Wave B); the handler just never passed it. Now it does.

[server/routes/analytics.ts](server/routes/analytics.ts).

### 17.4 GEO Analytics — queryKey instability across run boundaries

Client built the key as `["/api/geo-analytics", selectedBrandId, { since: since ?? "" }]`. The default queryFn skips empty-string segments, so the URL was correct, but TanStack still treats `""` and an ISO string as different cache keys. When a run completes and `since` flips back to null, the queryKey changes — TanStack drops the run-window snapshot before the new fetch returns, and the visibility score visibly jumps as all-time data rehydrates the moment the run finishes.

Fixed by using `since ?? "all"` as a stable sentinel; the server treats `since=all` the same as missing. Same key shape across the run lifecycle, no mid-flight cache evictions.

[client/src/pages/geo-analytics.tsx:134](client/src/pages/geo-analytics.tsx#L134), [server/routes/analytics.ts](server/routes/analytics.ts).

### 17.5 GEO Analytics — `avgRank: 0` collapses two distinct states

The handler returned `avgRank: 0` both when no cited rows had any rank field (Gemini-style platforms that don't expose rank position) and when the platform had legitimate rank-0 data. The UI rendered `metrics.avgRank || "N/A"` — falsy `0` treated as missing. Distinct states became indistinguishable.

Fixed by emitting `avgRank: number | null` from the handler (with the scoring math still using a numeric `avgRankRaw` internally) and rendering `null` as "—" on the client. Existing TS type updated.

### 17.6 Competitors tab — queries ignored selectedBrandId

`CompetitorsTab` received `selectedBrandId` and renamed it to `_selectedBrandId` to silence an unused-arg warning. Both queries (`/api/competitors`, `/api/competitors/leaderboard`) ran without a brandId, so the server's no-brand branch aggregated every brand the user owned. Switching brands in the selector didn't change what the panel rendered.

Fixed by threading `{ brandId: selectedBrandId }` into both query keys (object segment → URL param via the default queryFn) and into the create-competitor mutation payload. Mutation invalidations switched to predicate-based matching so they catch every variant of the key shape regardless of future refactors.

[client/src/components/intelligence/CompetitorsTab.tsx](client/src/components/intelligence/CompetitorsTab.tsx).

### 17.7 Trends tab — invalidation always missed the cached entry

Query key was `[`/api/metrics-history/${brandId}?days=${trendDays}`]`. The Record-Snapshot mutation invalidated the bare `[`/api/metrics-history/${brandId}`]` — exact-match miss because the cached key has the `?days=` suffix. The chart never refetched. User clicked "Record Snapshot", got a success toast, and the chart still showed yesterday's last point.

Fixed by predicate-matching every key whose first segment starts with `/api/metrics-history/${brandId}` so the active window — whichever it happens to be — invalidates correctly.

Also fixed timezone-naive labels: snapshots are stored UTC but `toLocaleString()` rendered in the user's local zone, which made the same chart read differently for collaborators across timezones. Labels now render with `timeZone: "UTC"` and an explicit "UTC" suffix.

[client/src/components/intelligence/TrendsTab.tsx](client/src/components/intelligence/TrendsTab.tsx).

### 17.8 Hallucinations tab — Mark Resolved produced 409 on already-actioned rows

The "Mark Resolved" button stayed enabled even when `remediationStatus` was `verified` or `dismissed`. Server's `assertTransition` correctly rejected the call, but the UI surfaced it as "Failed to resolve" — confusing because the button was visibly clickable. Fixed by gating the button: only enabled when status is `pending` / `in_progress` / null.

[client/src/components/intelligence/HallucinationsTab.tsx](client/src/components/intelligence/HallucinationsTab.tsx).

### 17.9 Share-of-Answer tab — division-by-zero NaN renders + duplicate competitors

Three rendering blocks (`byCategory`, `byFunnel`, `byCompetitor`) divided `data.cited / data.total` with no `>0` guard. A brand with stat rows but zero counts rendered `NaN%` and the Progress bar had `value={NaN}`. Now each block uses a single guarded computation that defaults to 0 when total is 0.

Separately the create-prompt payload split competitor names by comma, trimmed, and filtered blanks but didn't dedupe — "Salesforce, salesforce" landed in `competitorSet` as two entries. The downstream win-rate matcher collapses them, but historical rows already stored both. Now we trim, drop blanks, and dedupe case-insensitively while preserving the user's first-seen casing.

[client/src/components/intelligence/ShareOfAnswerTab.tsx](client/src/components/intelligence/ShareOfAnswerTab.tsx).

### 17.10 Alerts tab — threshold UI hidden for hallucinations + clearer 409

The threshold slider was hidden for `alertType: "hallucination_detected"`, which meant the alert always fired on every detection — but the UI gave no indication of that. New users created the alert thinking it would batch, then complained about notification volume. Now the slider is shown for hallucinations too with a count semantic ("fire when at least N new hallucinations are detected") and explanatory copy.

The create mutation now has an `onError` handler that renders the server's 409 message ("An alert of this type already exists for this brand") instead of failing silently.

[client/src/components/intelligence/AlertsTab.tsx](client/src/components/intelligence/AlertsTab.tsx).

### 17.11 BOFU tab — competitor names duplicated by casing

The `CompetitorCombobox` used `value.includes(name)` for presence checks (toggle, free-form Enter, checkbox state). User adds "Salesforce" then types "salesforce" — both stored in `bofuCompetitors`, posted to `/api/bofu-content/generate`, and saved to `comparedWith` with both casings. The downstream leaderboard matcher dedupes them but the BOFU rows are duplicated permanently.

Fixed via a single `indexOfCi` helper used everywhere presence is checked. First-seen casing is preserved.

[client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx).

### 17.12 BOFU content — fake aiScore: 85

`/api/bofu-content/generate` hard-coded `aiScore: 85` on every save. The BOFU panel surfaced this as a real quality signal, so users read the constant 85 as a meaningful ranking. Removed — the column is nullable; the optimizer flow can populate it later via PATCH if a real scoring step is added.

[server/routes/contentTypes.ts](server/routes/contentTypes.ts).

### 17.13 FAQ generation — pre-marked as optimized

The bulk-generate endpoint (`POST /api/faqs/generate/:brandId`) inserted every freshly generated FAQ with `isOptimized: 1`. Users saw the green "Optimized" check on every newly-generated row, defeating the point of the per-FAQ optimize step (which is a separate `POST /api/faqs/:id/optimize` call that refines wording). Now generation defaults to `isOptimized: 0`; the optimize endpoint flips it to 1 as it always did.

[server/routes/contentTypes.ts](server/routes/contentTypes.ts).

### 17.14 Verification

- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` — 171/171 green.
- Apply migration 0041 on next boot to dedupe legacy alert rows + install the unique index.

### 17.15 Out of scope (explicitly deferred)

Critique findings the user judged not worth this round:

- Hallucination paraphrase clustering (MD5 dedup misses near-duplicates with different wording).
- Sentiment threshold tuning (skewed-neutral distributions still classify "Neutral").
- Leaderboard medal colors keyed off filtered-array index instead of true rank — only matters if filtering is added.
- GEO Tools mentions tab: no `?since=` filter; mentions discovered across runs aren't visually marked "new this run".
- Scan-mutation timeouts; hung scan leaves the button stuck on "Scanning…".
- Token-in-URL for SSE (#27), CSRF (#28), Redis-backed re-detect cooldown (#29) — security follow-up pass.
- Wikipedia disambiguation handling, sentry classification of synthetic `ai://` source URLs.

None of these block any active flow.

## Wave 9.4 — GEO Tools content lifecycle, citation-tracking integration, and scanner correctness

The user's headline complaint was real and surfaced first: **BOFU content was generated but invisible** — [client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx) rendered each piece as a 500-char preview inside a 160px ScrollArea with no view/edit/copy/publish/delete affordances. Generated content sat in the DB and the user had no way to actually use it. A fresh end-to-end audit of GEO Tools also surfaced harder problems: hallucinated competitor comparisons, fake `aiSurfaceScore` numbers, no DB-level dedup (concurrent scans = duplicate rows), no content lifecycle, no citation-tracking integration, scanners that swallowed rate-limit failures into silent success toasts. Wave 9.4 closes all of it.

### 18.1 BOFU is now a real surface

[client/src/components/geo-tools/BofuContentSheet.tsx](client/src/components/geo-tools/BofuContentSheet.tsx) (NEW) — full-content sheet with four tabs:

- **Content**: full markdown render via `SafeMarkdown` (already sanitized via rehype-sanitize). Copy-all + download-as-`.md`.
- **Metadata**: type, primary keyword, comparedWith list, target intent, aiScore, createdAt/updatedAt, last-cited timestamp.
- **Publish**: text input for `publishedUrl` + a Switch that sets `publishedAt = now()` when toggled. Saves via `PATCH /api/bofu-content/:id`. Once a publishedUrl is saved, the citation checker registers it for self-citation tracking (see 18.6).
- **Schema**: live JSON-LD generation tailored to content type (`Article` baseline; `comparison`/`alternatives` add an `about: [Thing]` array of competitors). Copy with `<script type="application/ld+json">` wrapper.

Plus a delete with browser-native confirm. The geo-tools.tsx BOFU "Generated Content" section now renders compact clickable cards showing title + type + status + publishedUrl + a "Cited recently" badge if `last_cited_at` is within 30 days. Click anywhere on the card → sheet opens.

### 18.2 Brand-fact grounding for BOFU + FAQ generation

[server/lib/brandGenerationContext.ts](server/lib/brandGenerationContext.ts) (NEW) — `loadBrandGenerationContext(brandId, comparedWith)` returns the brand row, active fact-sheet entries (from `brand_fact_sheet`), and resolved competitors (case-insensitive match on `name` against the tracked-competitors table). `renderFactsBlock()` and `renderCompetitorBlock()` produce prompt-ready strings.

Both BOFU `/generate` and FAQ `/generate` (in [server/routes/contentTypes.ts](server/routes/contentTypes.ts)) now consume these blocks. Two consequential changes:

1. **The fact sheet goes into the prompt** with explicit grounding rules: "Use only facts in the Verified-facts block above for claims about this brand. For competitor specifics not in the Competitors block, hedge with phrases like 'commonly reported as' or omit. If a comparison data point is unknown, say so explicitly rather than inventing a number."
2. **BOFU now uses the entire `comparedWith` array, not `[0]`.** Selecting 3 competitors used to silently drop 2; now all three flow into the prompt with their own description / industry / domain inlined when tracked. Untracked freeform names get a "(no verified facts available)" tag so the LLM hedges instead of inventing a feature list.

The FAQ optimizer endpoint (`POST /api/faqs/:id/optimize`) gets the same grounding treatment.

### 18.3 Real `aiSurfaceScore` heuristic — the LLM no longer scores its own output

[server/lib/faqScoring.ts](server/lib/faqScoring.ts) (NEW) — `computeAiSurfaceScore({ question, answer, brand })` returns a deterministic 0-100 integer. Range design: a "perfect" FAQ scores ~95, a "terrible" one ~15-30. Inputs:

- **Length window**: 40-80 word answers get +25 (sweet spot for AI summarization). 25-39 or 81-120 get +10. <15 gets −25; >200 gets −15.
- **Question phrasing**: starts with what/how/why/when/where/who/which/is/are/do/does/can/should → +10. Otherwise −10.
- **Question mark**: +5.
- **Brand mention** in the answer (verbatim or via `nameVariations`): +10.
- **Lead-with-bullets** (first non-empty line is `- ` / `* ` / `1.`): −5.

Clamped to 0-100. Both `/generate` (per insert) and `/optimize` call this and **ignore any score the LLM returns**. The previous `aiSurfaceScore: 85` hardcoded fallback in the optimizer is gone.

### 18.4 FAQ semantic dedup at insert time

`storage.findSimilarFaqQuestion(brandId, question, threshold = 0.65)` runs `SELECT id, question, similarity(question, $1) AS sim FROM faq_items WHERE brand_id = $2 AND similarity(question, $1) >= $3 ORDER BY sim DESC LIMIT 1`. The FAQ generator consults it before each insert; on hit, increments `mergedDuplicates` in the report and skips. Toast now reads `Generated 5 · Merged 2 with existing similar questions`.

Falls back to exact case-insensitive match if `pg_trgm` isn't installed (the function call throws → caller catches and treats as no match). Migration 0042 enables `pg_trgm` and creates `faq_items_question_trgm_idx` for index-backed lookups.

### 18.5 DB-level scan dedup + ScanReport with failure accounting

Three coordinated changes:

**Migration 0042** ([migrations/0042_geo_tools_lifecycle.sql](migrations/0042_geo_tools_lifecycle.sql)) collapses legacy duplicates with a window-function CTE (keep oldest per `(brand_id, lower(url))`), then adds:

- `listicles_brand_id_url_uniq` ON `(brand_id, lower(url))`
- `wikipedia_mentions_brand_id_page_url_uniq` ON `(brand_id, page_url)`
- `brand_mentions_brand_id_source_url_uniq` ON `(brand_id, lower(source_url))`

**Storage** gains `tryInsertListicle` / `tryInsertWikipediaMention` / `tryInsertBrandMention`, which use Drizzle's `.onConflictDoNothing().returning()` pattern. They return `Listicle | null` — null = the unique index rejected the insert, i.e. the row already existed. Scanners use the null return to count "duplicates skipped" cleanly.

**[server/lib/scanReport.ts](server/lib/scanReport.ts)** (NEW) — typed shape returned by every scanner: `{ found, inserted, skippedDuplicate, skippedFiltered, failed: [{ url?, reason }], reverified?, lostInclusion?, warning? }`. Routes return `report` in `data`; client renders multi-line toasts via a new `formatReportLines` helper that hides zero-valued lines so a clean run shows just the meaningful signal.

What this fixes:

- **Concurrent-scan duplicates** ([server/lib/listicleScanner.ts](server/lib/listicleScanner.ts) old behavior: read existing URLs into a Set, loop, insert) — gone. Two users scanning the same brand simultaneously now produce exactly one row per URL.
- **Silent partial failures** — Reddit 429s, Wikipedia 404s, Quora HTML-shape changes, Perplexity hallucinated URLs that 404 on fetch — all push into `failed[]` with a reason instead of a `console.warn`-and-continue. Toast surfaces the count: "Found 12 · Inserted 3 · Duplicates 7 · Failed 2."

### 18.6 Listicle re-verification phase

Wave 9.3's audit flagged that listicle rows went stale forever — a brand could drop out of a listicle in May and the row still showed `isIncluded=1, listPosition=3` in October. [server/lib/listicleScanner.ts](server/lib/listicleScanner.ts) now does a two-phase scan:

1. **Re-verify** every existing row whose `last_verified_at` is missing or older than 7 days (bounded at 50 per scan). Re-fetch the URL, re-run matcher, update `is_included` / `list_position` / `competitors_mentioned` / `last_verified_at`. New report fields `reverified` and `lostInclusion` surface in the toast.
2. **Discover** new candidates (the existing flow).

Status flips are logged to the toast — "Lost inclusion: 1" tells the user a previously-included listicle has dropped them.

### 18.7 Lifecycle state tracking — the dropdowns

[client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx) — inline `<Select>` per row drives a PATCH:

**Listicles** (`outreach_status` column, default `'new'`): `new` → `contacted` → `won` / `dropped`. Stored on every listicle row, edited via the dropdown on the row card. Lets the user track outreach state without leaving the app.

**Brand mentions** (`status` column, default `'new'`): `new` → `acknowledged` → `replied` / `false_positive` / `ignored`. The header summary card "Mentions: 47 · 12 unaddressed" only counts rows still at `new`. False-positive captures the common-word-brand-name case ("Apple", "Match") where the matcher mis-fires; ignored captures intentional non-engagement.

Both columns are categorical, not strict state machines — users can move backward to correct mistakes. Server validates the value against an allowlist on PATCH; ownership-checked via `requireBrand` on the row's brand.

#### 18.7.1 Followup — making the saved state visible

User feedback after the dropdowns shipped: "but where can I see those tracked data? it just vanishes after I select something." The status was persisting correctly to the DB but the UI didn't render it back — listicle rows had no status badge at all, and mention rows only rendered a subtle outline badge when the status was non-default. Three additions:

- **Always-visible colored status badge on every row.** Shared display maps (`LISTICLE_STATUS_DISPLAY`, `MENTION_STATUS_DISPLAY`) define a label + color class per state. Listicles: gray "New", blue "Contacted", green "Won", muted "Dropped". Mentions: gray "New", blue "Acknowledged", green "Replied", amber "False positive", muted "Ignored". The badge sits next to the existing Included / sentiment / platform badges so the row visibly updates as soon as the user picks a value.
- **Filter `<Select>` at the top of each tab** — "Filter by outreach" on Listicles, "Filter by status" on Mentions, default `All`. Lets users see only the rows in a chosen state (e.g. "show me only Contacted listicles") so the workflow state actually drives the view.
- **Real total counts in the section headers** ("Tracked Listicles (12)", "Recent Mentions (47)") so the user knows how many rows the filter is hiding. The mention list display cap also bumped from 10 to 25 so the filter has room to operate.

[client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx).

### 18.8 Manual-entry endpoints + dialogs

For artifacts the scanner missed (a listicle a colleague forwarded, a Wikipedia mention discovered manually, a brand mention found in a private Slack):

- `POST /api/listicles` (existed) — now uses `tryInsertListicle`, returns 409 on duplicate URL.
- `POST /api/wikipedia` (existed) — same treatment via `tryInsertWikipediaMention`.
- `POST /api/brand-mentions` (NEW) — `tryInsertBrandMention` + ownership check, accepts `platform` + `sourceUrl` + `mentionContext` + `sentiment`.

Three dialog components (`ManualAddListicleDialog`, `ManualAddWikipediaDialog`, `ManualAddMentionDialog`) live at the bottom of [client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx). "+ Add manually" buttons next to each tab's primary scan button open them.

### 18.9 Citation-tracking integration — closing the loop

**The biggest gap from the audit**: BOFU/FAQ/listicle rows had no foreign key into `citation_runs` or `geo_rankings`. Users had no way to answer "did the BOFU page I published actually get cited?"

Fix:

- **`tracked_content_urls` table** (migration 0042): polymorphic registry keyed by `(source_type, source_id)` where source_type is `'bofu'` or `'faq'`. Stores the canonical URL plus a `normalized_url` (lower-cased host + path with `www.` / trailing slash / query / fragment stripped) used as the citation-checker match target.
- **`citation_runs.self_citation_count`** (migration 0042): aggregate maintained by the checker.
- **`bofu_content.last_cited_at` and `faq_items.last_cited_at`** (migration 0042): per-row timestamps stamped on every match.

When a user sets `publishedUrl` on a BOFU or FAQ piece, the PATCH handler calls `syncTrackedContentUrl()` which upserts into `tracked_content_urls` (one row per source — re-publishing a different URL UPDATEs in place; clearing publishedUrl DELETEs).

[server/lib/trackedContentMatcher.ts](server/lib/trackedContentMatcher.ts) (NEW) exposes `normalizeUrl(raw)` and `findSelfCitationsInText(text, trackedUrls)`. The citation checker ([server/citationChecker.ts](server/citationChecker.ts)) preloads tracked URLs once per run, and after the existing matcher resolves the brand/competitor verdict for a `(brand, prompt, platform)` cell, calls `findSelfCitationsInText(responseText, trackedContentUrls)`. For each hit:

- `storage.stampSelfCitation(sourceType, sourceId)` updates the source row's `lastCitedAt`.
- `storage.incrementCitationRunSelfCitations(citationRun.id)` bumps the aggregate.

Idempotent within a run via a `stampedThisRun: Set<string>` so a piece cited from multiple cells gets stamped exactly once per run.

UI surfaces: BOFU cards (and the sheet header) show a "Cited recently" badge when `lastCitedAt` is within 30 days. Header summary card "BOFU: 4 published · 1 cited (30d)".

### 18.10 GEO Tools header summary

`GET /api/geo-tools/summary/:brandId` returns counts across all five tabs in one round trip. Storage method `getGeoToolsSummary(brandId)` runs five filtered counts (`count(*) filter (where ...)`) in parallel:

```json
{
  "listicles": { "total": 12, "included": 5 },
  "wikipedia": { "existing": 1, "opportunities": 3 },
  "bofu": { "drafts": 4, "published": 2, "cited30d": 1 },
  "faqs": { "drafts": 8, "published": 5, "cited30d": 2 },
  "mentions": { "total": 47, "unaddressed": 12, "negative": 3 }
}
```

Renders as a 5-card strip beneath PageHeader. Refreshes on the live-citation-run cadence so newly stamped `cited30d` counts surface within the run.

### 18.11 Wikipedia draft helper

`POST /api/wikipedia/draft/:mentionId` takes a known Wikipedia opportunity row, the brand's fact sheet, and the page extract, and asks OpenAI for a 2-3 sentence NPOV-tuned mention the user can paste into the Wikipedia edit form. Out-of-scope this wave: actually submitting via the MediaWiki API (legal/account compliance work).

UI: each opportunity row gets a "Draft mention" button. Click → modal opens with the draft text + a copy button + three notes (cite a real source, verify WP:NOTABILITY, disclose WP:COI on the talk page).

### 18.12 Common-name warning + multi-tenant rate limits

Two coordinated changes for brands with ambiguous names ("Apple", "Match", "Square") and shared infra running multiple users' scans simultaneously:

**[server/lib/brandNameAmbiguity.ts](server/lib/brandNameAmbiguity.ts)** (NEW) — hardcoded blocklist of ~80 common-word brand names. `brandNameAmbiguityScore(name)` returns 0 / 1 / 2; `brandNameWarning(name)` returns a copy-paste-ready advisory. Listicle and mention scanners check on kickoff and surface the warning in the toast (doesn't block the scan; just nudges the user to add `nameVariations`).

**[server/lib/rateLimitBuckets.ts](server/lib/rateLimitBuckets.ts)** (NEW) — in-process token bucket per `(provider, scopeId)`. Configured for Reddit (10 cap, 1/6 refill — matches the unauth limit), Wikipedia (30/5), Hacker News (30/5), Quora (5/0.25). `acquireOrWait(provider, scopeId, maxWaitMs)` blocks up to 30s; on timeout the mention scanner records "rate-limited" in `report.failed` rather than burning a 429.

The previous `await sleep(REDDIT_RATE_DELAY_MS)` was per-process; concurrent users on the same instance both hit Reddit within the 100ms window and most got 429s that were then swallowed by a `console.warn` while the success toast lied. Now: explicit ETA in failure messages ("reddit rate-limited (try again in ~30s)") and the toast surfaces the count.

In-memory bucket is fine for single-instance deployment per CLAUDE.md; comments mark the spot for Redis migration when multi-instance lands.

### 18.13 Files

| File                                                                                                         | Change                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [migrations/0042_geo_tools_lifecycle.sql](migrations/0042_geo_tools_lifecycle.sql)                           | NEW. pg_trgm; dedup CTEs; lifecycle columns; tracked_content_urls table; self_citation_count; trigram GIN index.                                                                          |
| [shared/schema.ts](shared/schema.ts)                                                                         | Lifecycle columns on bofu_content / faq_items / listicles / brand_mentions; new trackedContentUrls table + insert schema + types; citation_runs.selfCitationCount.                        |
| [server/databaseStorage.ts](server/databaseStorage.ts)                                                       | tryInsert{Listicle,WikipediaMention,BrandMention}; findSimilarFaqQuestion; tracked_content_urls CRUD; stampSelfCitation; incrementCitationRunSelfCitations; getGeoToolsSummary.           |
| [server/storage.ts](server/storage.ts)                                                                       | Type signatures for the new methods; TrackedContentUrl import.                                                                                                                            |
| [server/lib/brandGenerationContext.ts](server/lib/brandGenerationContext.ts)                                 | NEW. loadBrandGenerationContext + renderFactsBlock + renderCompetitorBlock.                                                                                                               |
| [server/lib/faqScoring.ts](server/lib/faqScoring.ts)                                                         | NEW. computeAiSurfaceScore deterministic heuristic.                                                                                                                                       |
| [server/lib/trackedContentMatcher.ts](server/lib/trackedContentMatcher.ts)                                   | NEW. normalizeUrl + findSelfCitationsInText.                                                                                                                                              |
| [server/lib/rateLimitBuckets.ts](server/lib/rateLimitBuckets.ts)                                             | NEW. in-process token bucket per (provider, scopeId).                                                                                                                                     |
| [server/lib/brandNameAmbiguity.ts](server/lib/brandNameAmbiguity.ts)                                         | NEW. common-name blocklist + warning.                                                                                                                                                     |
| [server/lib/scanReport.ts](server/lib/scanReport.ts)                                                         | NEW. shared ScanReport shape.                                                                                                                                                             |
| [server/lib/listicleScanner.ts](server/lib/listicleScanner.ts)                                               | Re-verification phase; ON CONFLICT inserts; ScanReport return.                                                                                                                            |
| [server/lib/wikipediaScanner.ts](server/lib/wikipediaScanner.ts)                                             | ON CONFLICT inserts; WikipediaScanReport return.                                                                                                                                          |
| [server/lib/mentionScanner.ts](server/lib/mentionScanner.ts)                                                 | acquireOrWait against rate-limit buckets; ScanReport return.                                                                                                                              |
| [server/routes/contentTypes.ts](server/routes/contentTypes.ts)                                               | Grounded BOFU + FAQ prompts; multi-competitor; tracked_content_urls sync on PATCH/DELETE; summary endpoint; Wikipedia draft endpoint; listicle outreach status; manual-add via tryInsert. |
| [server/routes/publications.ts](server/routes/publications.ts)                                               | Mention scan returns full report; PATCH /api/brand-mentions/:id; POST /api/brand-mentions manual-add.                                                                                     |
| [server/citationChecker.ts](server/citationChecker.ts)                                                       | Preloads tracked_content_urls per run; per-cell self-citation detection; idempotent-per-run stamping.                                                                                     |
| [server/scheduler.ts](server/scheduler.ts)                                                                   | runForEveryBrand fn signature widened to `Promise<unknown>` to accept ScanReport returns.                                                                                                 |
| [client/src/components/geo-tools/BofuContentSheet.tsx](client/src/components/geo-tools/BofuContentSheet.tsx) | NEW. Full-content view + publish + schema export + delete.                                                                                                                                |
| [client/src/pages/geo-tools.tsx](client/src/pages/geo-tools.tsx)                                             | Header summary cards; BOFU sheet wiring; status selects on listicle + mention rows; "+ Add manually" buttons; Wikipedia draft button + dialog; multi-line scan toasts.                    |

### 18.14 Tests

Four new test files, 31 new assertions:

- [tests/unit/faqScoring.test.ts](tests/unit/faqScoring.test.ts) — table-driven across the sweet-spot length window, short answers, non-question questions, brand-mention bumps, and clamp-to-0-100 pathological cases.
- [tests/unit/trackedContentMatcher.test.ts](tests/unit/trackedContentMatcher.test.ts) — URL normalization across scheme / www / casing / query / fragment / trailing-slash variations; `findSelfCitationsInText` per-call dedup, multi-URL match, empty-input safety.
- [tests/unit/rateLimitBuckets.test.ts](tests/unit/rateLimitBuckets.test.ts) — initial burst up to capacity, scope isolation, ETA estimation, `acquireOrWait` timeout return.
- [tests/unit/brandNameAmbiguity.test.ts](tests/unit/brandNameAmbiguity.test.ts) — common-word flags, short-word fallback, null-safe handling.

### 18.15 Verification

- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` — **22 files / 202 tests passing** (171 prior + 31 new).
- Migration 0042 is idempotent: `CREATE EXTENSION IF NOT EXISTS`, dedup CTEs run before the unique indexes, all `ADD COLUMN IF NOT EXISTS`, trigram index wrapped in DO block that NOTICE-skips if pg_trgm is unavailable.

### 18.16 Out of scope (deferred to a follow-up)

- Wikipedia API submission flow (drafting in scope; actually editing Wikipedia from inside the app needs OAuth + account-compliance work).
- BOFU regeneration / section-level edit (sheet supports view + publish + delete + duplicate; no in-place block-level rewriter yet).
- Embedding-based competitor entity resolution (trigram is sufficient for FAQ dedup; competitor matching stays case-insensitive name matching).
- Scheduled re-scan jobs (listicle re-verification piggy-backs on user-triggered scans; a cron-driven weekly auto-scan adds scheduler load + cost-management questions).
- Mention reply flow (state tracking in scope; actually posting replies via Reddit/HN/Quora APIs is a bigger product call).
- Outbound publishing integrations (manual publish + paste URL covers 95% of value; "Publish to Medium / LinkedIn" requires OAuth flows).
- Multi-instance rate-limit coordination (in-memory bucket fine for current single-instance; Redis migration tracked separately).
- Cross-brand competitive intelligence in the mentions tab.
- Audit log of generation prompts (knowing exactly which fact-sheet version produced a given BOFU is desirable but adds a `generation_audit` table nothing else uses yet).

## Wave 9.4 — Operational notes (Render free-tier keepalive)

Not a code change but worth recording: a GitHub Actions workflow at [.github/workflows/keep-alive.yml](.github/workflows/keep-alive.yml) pings `/health` every 5 minutes from `ubuntu-latest` runners to defeat Render's 15-minute idle-spin-down on the free tier. The endpoint runs `SELECT 1` + advisory-lock round-trip ([server/index.ts:381](server/index.ts#L381)) so a green ping confirms DB connectivity, not just process liveness. `curl -fsSL` makes non-2xx fail the workflow; `-w` prints HTTP status + total time + DNS + connect time so creeping cold-start latency is visible in the run log.

Cadence is `*/5` rather than `*/10` to absorb GitHub Actions cron jitter (scheduled workflows can be delayed 5-15 min during peak load on the runner pool; a 10-minute interval + 6-minute delay = 16-min gap = service sleeps anyway).

Notes for whoever inherits this:

- GitHub disables scheduled workflows after 60 days of repo inactivity. Push any commit (even a comment) every 8 weeks to keep the cron alive.
- Public repo = unlimited Actions minutes; private repo = 2,000/month free, ~720 burned at this cadence (still fits, but other workflows share the budget).
- Once the service moves to a paid Render tier (or off Render entirely), the workflow becomes redundant and should be removed.

## Wave 10 — Vercel Hobby single-path migration

Scope: move the entire app off Render's always-on Node process onto Vercel Hobby. No dual-path code, no `process.env.VERCEL` conditionals, no Render fallback — a single deployment target. Constraints accepted up front: 60s function cap, 1 cron/day, ephemeral filesystem, no in-process schedulers or workers.

### 10.1 Single Express function via pre-bundled entry

`api/index.ts` is the source-controlled function entry Vercel discovers natively. It is a six-line stub that re-exports the default handler from `api/_bundle.js` — a self-contained ESM bundle produced by the build step from `server/vercelEntry.ts`. The bundle is gitignored.

The stub-imports-bundle pattern is a workaround for two Vercel quirks discovered the hard way:

1. Vercel's node-file-trace doesn't reliably resolve extensionless ESM imports (`from "./routes"`) through the `server/` tree, so a directly-deployed `api/index.ts` that imports `../server/app` fails with `ERR_MODULE_NOT_FOUND` at runtime.
2. Vercel validates the `functions` glob in `vercel.json` _before_ running `buildCommand`. A function file that only exists post-build (e.g. esbuild output written to `api/index.js`) fails the pre-build validation with "doesn't match any Serverless Functions inside the api directory."

Pre-bundling `server/vercelEntry.ts` → `api/_bundle.js` and having `api/index.ts` re-export from it satisfies both constraints: discovery sees a real source file, NFT only has to trace one bundled file, and runtime imports work because the bundle is self-contained.

### 10.2 Build pipeline

`package.json` `build` runs four steps in sequence:

```
npm run db:migrate
  && vite build
  && esbuild server/index.ts ... --outdir=dist           (local-dev entry; for `npm start`)
  && esbuild server/vercelEntry.ts ... --outfile=api/_bundle.js   (Vercel function bundle)
```

Migrations run at build time (`scripts/migrate.ts`) so the lambda never owns migration responsibility. An advisory lock around `applyMigrations` prevents two concurrent Vercel builds racing on the migration table.

### 10.3 vercel.json

Single function, single cron, SPA fallback rewrite:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/public",
  "functions": {
    "api/index.ts": { "maxDuration": 60, "memory": 1024, "includeFiles": "api/_bundle.js" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/health", "destination": "/api/index" },
    { "source": "/webhooks/(.*)", "destination": "/api/index" },
    {
      "source": "/((?!api|webhooks|health|assets|fonts|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
      "destination": "/index.html"
    }
  ],
  "crons": [{ "path": "/api/cron/daily-orchestrator", "schedule": "0 6 * * *" }]
}
```

`includeFiles: "api/_bundle.js"` ships the bundle into the lambda even though it isn't directly imported via NFT-traceable static analysis (the stub uses a dynamic-looking `export { default } from "./_bundle.js"` that NFT can't always resolve through the build artifact).

### 10.4 Daily cron orchestrator

`POST /api/cron/daily-orchestrator` ([server/routes/cron.ts](server/routes/cron.ts)) replaces the in-process node-cron scheduler. Authenticated by Vercel's auto-injected `Authorization: Bearer <CRON_SECRET>` header (or the manual `x-cron-secret` header for triggering from the dashboard).

Runs each sub-job serially with crash isolation; budgets the wall clock and skips remaining steps when the budget is exhausted so the function returns under 60s. Sub-jobs:

1. `failStuckContentJobs` (60-min stale)
2. `reconcileOrphanCitationRuns`
3. `resumeInFlightAutopilots` (deadline-bounded so it returns; remainder picked up tomorrow)
4. `runAccountPurgeJob`, `runBrandPurgeJob`
5. `runAutoCitationJob` — hour-of-day filter dropped (degraded from "9 AM UTC respected" to "fires at 06:00 UTC"; documented degradation)
6. Day-of-week-gated: `runCompetitorDiscoveryJob`, `runMentionScanJob`, `runListicleScanJob`, `runWeeklyCatchupKickoff` on Mondays; `runWeeklyReportJob` on Sundays
7. Day-of-month-gated: `runFactRefreshJob` on the 1st

Test coverage: [tests/unit/cronOrchestrator.test.ts](tests/unit/cronOrchestrator.test.ts) — auth gate (no secret / wrong secret / Bearer / x-cron-secret) + per-step results array shape.

### 10.5 Lazy evaluation replaces sub-daily crons

Two former in-process crons collapsed into demand-driven ticks:

**Workflow tick** — was a 30s cron `WORKFLOW_TICK_CRON`. Now `maybeTickActiveRunsForUser(userId)` ([server/lib/workflowEngine.ts](server/lib/workflowEngine.ts)) fires from the `attachUserIfPresent` middleware via `waitUntil`. Per-user debounce table `workflow_tick_state` prevents stampedes on parallel requests. Workflows only progress when something changes; those changes always come back through HTTP, so ticking on every authenticated request advances stuck runs within seconds.

**Weekly digest aggregator** — was a 5-min cron. Now `tryEmitWeeklyDigestForUser(userId)` ([server/lib/weeklyDigestEmitter.ts](server/lib/weeklyDigestEmitter.ts)) runs inside `tickActiveRuns`/`advanceRun` whenever a `weekly_catchup` run reaches a terminal status. The 6-day stamp on `users.lastWeeklyReportSentAt` is the dedup; concurrent firings race harmlessly because `UPDATE ... WHERE lastWeeklyReportSentAt < now() - interval '6 days'` is atomic.

### 10.6 Postgres-backed rate-limit buckets

Rate-limit state moved from per-process `Map` to the `rate_limit_buckets` table (migration `0043_rate_limit_buckets.sql`). `tryAcquire(provider, scopeId)` and `acquireOrWait(provider, scopeId)` now do `BEGIN; SELECT ... FOR UPDATE; compute refill; UPDATE; COMMIT;` per acquire. Necessary because Vercel lambdas don't share memory.

Test suite ([tests/unit/rateLimitBuckets.test.ts](tests/unit/rateLimitBuckets.test.ts)) was rewritten to spin up a real Postgres test path; semantics tests (capacity, refill rate, blocking, scope isolation) preserved.

### 10.7 Content generation worker — client-driven /advance with section chunking

The polling content worker (`server/contentGenerationWorker.ts`) lost its `setTimeout` polling loop. Replaced by `POST /api/content-jobs/:jobId/advance` ([server/routes/content.ts](server/routes/content.ts)):

1. Auth + ownership.
2. Claim the job with `SELECT ... FOR UPDATE NOWAIT`.
3. Compute deadline = `Date.now() + 8000`.
4. `generateArticleSliceForJob(job, deadline)` — works on the next pending section (BOFU long-form is broken into intro / comparison / FAQ / conclusion; FAQ batches are one section per item). Each section is one OpenAI call, expected to complete under 8s. Persists `current_section`, `completed_sections`, `section_plan` (migration `0044_content_job_sectioning.sql`).
5. Returns `{status, contentLength, done, error?}`. Client polls `/advance` then `/state` in a loop until `done:true`.

If the user navigates away mid-generation, the job sits in `pending`/`running` until the daily cron's `failStuckContentJobs(60min)` cleans it up.

### 10.8 SSE replaced by polling

Two streams converted from EventSource to interval polling:

- **Content stream** — old: `/api/content-jobs/:jobId/stream` SSE. New: `GET /api/content-jobs/:jobId/state?since=<n>` returns `{ status, streamBuffer, contentLength, error?, done }`. Client polls every 500ms while the tab is visible, 4s while hidden. Tail-only: `?since=<n>` lets the client request only the slice of `streamBuffer` past its cursor.
- **Citation events** — old: `/api/brands/:brandId/citation-events` SSE + a `Map<userId, Set<stream>>` with a 3-stream-per-user cap. New: `GET /api/brands/:brandId/citation-runs/state?since=<rankingId>` returns the active runs' status + progress + any `geo_rankings` rows newer than the cursor. Client polls every 1s. The cap and the in-memory map are gone (polling is cheap; no need to limit it).

Trade-off: token-by-token SSE feel becomes 500ms-chunked. Imperceptible for long-form BOFU; slightly chunky for short FAQ items. Documented as accepted degradation.

### 10.9 Citation kickoff: detached → inline-with-deadline

`kickoffBrandPromptsRun` ([server/citationChecker.ts](server/citationChecker.ts)) used `setImmediate(() => runBrandPrompts(...))` to fire-and-forget the citation work behind the kickoff request. On Vercel that detached work gets killed when the lambda terminates ~60s after responding.

Replaced with an inline call gated by a deadline — kickoff returns `runId` immediately as before (the work is sliced and progress-bounded), but the lambda stays alive for as much of the run as fits under the function cap. Whatever doesn't finish is picked up by the client's `/advance` polling, the same pattern as content generation.

### 10.10 Boot-path migrations and worker init removed

`server/index.ts` (now the local-dev entry only) keeps `applyMigrations()` + `initScheduler()` + `initContentGenerationWorker()` for `npm run dev`. None of those run on Vercel because Vercel uses `server/vercelEntry.ts` instead — Vercel imports the Express app, not the IIFE that boots it.

`reconcileOrphanCitationRuns` and `resumeInFlightAutopilots` moved into the daily cron orchestrator. They're best-effort recoveries; running them daily instead of on-boot adds at most a 24h reconciliation window, acceptable.

### 10.11 DB pool sized for serverless

[server/db.ts](server/db.ts) pool: `max: 1`, `idleTimeoutMillis: 5_000` on Vercel; `max: 10`, `idleTimeoutMillis: 30_000` locally. Combined with switching `DATABASE_URL` on Vercel to Supabase's transaction pooler (port 6543, `aws-0-<region>.pooler.supabase.com`), this avoids exhausting Postgres connections under cold-start storms — the pooler is what holds the warm connections to Postgres; lambdas hold one short-lived connection to the pooler.

### 10.12 Vite dev-only import isolation

`server/vite.ts` imports `vite` (which transitively imports `rollup`'s native bindings). Bundling that file into the Vercel lambda dragged `@rollup/rollup-linux-x64-gnu` into the runtime require path; Vercel doesn't ship that native binary and the function crashed with `MODULE_NOT_FOUND` on cold start.

Fix: extracted the `log()` helper to its own file `server/log.ts`. `server/app.ts` now imports `log` from `./log`, not from `./vite`. `server/vite.ts` re-exports `log` so existing dev-only imports in `server/index.ts` still work. Bundle no longer references `vite` or `rollup` (verified with grep).

### 10.13 Render-specific code removed

Per the migration plan's "no dual paths" rule:

- All `process.env.VERCEL` / `!process.env.VERCEL` conditionals deleted.
- `RENDER_EXTERNAL_URL` removed from [server/env.ts](server/env.ts); URL detection now `APP_URL → VERCEL_URL → http://localhost:5000`.
- `setImmediate(() => ...)` detach paths in citation kickoff and onboarding autopilot replaced with deadline-bounded inline runs.
- `.github/workflows/keep-alive.yml` deleted (Vercel doesn't sleep).
- `health` endpoint dropped its `pg_advisory_lock(1)` round-trip (advisory locks don't help on serverless and add contention under cold-start storms); now just `SELECT 1`.

### 10.14 Files

| File                                         | Change                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `api/index.ts`                               | NEW. Eight-line stub that re-exports `default` from `./_bundle.js`.                                                            |
| `server/vercelEntry.ts`                      | NEW. Bundled root for Vercel. Imports `app` + `prepareApp` from `./app`, returns the Express handler.                          |
| `server/app.ts`                              | NEW. Extracted Express app builder from former `server/index.ts`. Both dev entry and `vercelEntry` import from here.           |
| `server/index.ts`                            | Slimmed. Local-dev only: imports the app, calls `app.listen(port)`, runs migrations + worker + scheduler.                      |
| `server/log.ts`                              | NEW. Lifted out of `server/vite.ts` so `server/app.ts` doesn't transitively import vite/rollup.                                |
| `server/vite.ts`                             | Re-exports `log` from `./log` for backward compat with `server/index.ts`.                                                      |
| `server/routes/cron.ts`                      | NEW. Daily orchestrator endpoint with budget-aware step scheduler.                                                             |
| `server/lib/migrationRunner.ts`              | Extracted from former `server/index.ts`. Wraps `applyMigrations` in `pg_advisory_lock(54321)` so concurrent builds don't race. |
| `scripts/migrate.ts`                         | NEW. Standalone migration runner invoked by `npm run db:migrate` at build time.                                                |
| `vercel.json`                                | NEW. Function definition + rewrites + daily cron.                                                                              |
| `migrations/0043_rate_limit_buckets.sql`     | NEW. `(provider, scope_id)` PK, `tokens NUMERIC`, `last_refill_at`.                                                            |
| `migrations/0044_content_job_sectioning.sql` | NEW. `current_section`, `completed_sections`, `section_plan` columns.                                                          |
| `migrations/0045_workflow_tick_state.sql`    | NEW. Per-user debounce row for the lazy workflow tick.                                                                         |
| `server/lib/rateLimitBuckets.ts`             | Rewritten. Postgres-backed `tryAcquire`/`acquireOrWait`.                                                                       |
| `server/lib/workflowEngine.ts`               | Added `maybeTickActiveRunsForUser`, `tryEmitWeeklyDigestForUser`.                                                              |
| `server/auth.ts`                             | Fire-and-forget tick after JWT verify, via `waitUntil`.                                                                        |
| `server/routes/content.ts`                   | Dropped SSE handler. Added `/state` and `/advance`.                                                                            |
| `server/routes/prompts.ts`                   | Dropped SSE handler + `sseStreams` Map + 3-stream cap. Added `/state` and `/advance`.                                          |
| `server/contentGenerationWorker.ts`          | Dropped polling loop. Added `generateArticleSliceForJob`. `failStuckContentJobs` retained but called from cron.                |
| `server/citationChecker.ts`                  | Dropped `setImmediate` detach. `kickoffBrandPromptsRun` now deadline-bounded inline. Added `advanceCitationRun`.               |
| `server/db.ts`                               | Vercel-aware pool: `max: 1` / `5s idle` on Vercel, `max: 10` / `30s idle` locally.                                             |
| `server/env.ts`                              | `RENDER_EXTERNAL_URL` removed. URL inference is `APP_URL → VERCEL_URL → localhost`.                                            |
| `server/scheduler.ts`                        | `initScheduler` is a no-op. Job functions stay as named exports for the cron orchestrator.                                     |
| `client/src/pages/content.tsx`               | Polling consumer instead of EventSource.                                                                                       |
| `client/src/pages/citations.tsx`             | Polling consumer; `/advance` + `/state` driven from a single timer.                                                            |
| `package.json`                               | `build` now runs `db:migrate && vite build && esbuild dev-entry && esbuild vercel-entry`.                                      |
| `.gitignore`                                 | `api/_bundle.js`.                                                                                                              |
| `.github/workflows/keep-alive.yml`           | DELETED.                                                                                                                       |

### 10.15 Tests

Existing 217 tests preserved. New: [tests/unit/cronOrchestrator.test.ts](tests/unit/cronOrchestrator.test.ts) (5 tests covering auth gate + per-step result shape).

### 10.16 Accepted degradations

| Feature                      | Before                | After                                         | Notes                                                                                                      |
| ---------------------------- | --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Auto-citation hour-of-day    | 9 AM UTC respected    | 06:00 UTC daily                               | Dropped from cron day-of-week filter as a trade-off for the 1-cron Hobby cap.                              |
| Workflow tick latency        | 30s cap               | "Up to next user request"                     | OK — workflows already async; users hit endpoints often.                                                   |
| Weekly digest emission       | 5-min cron            | Triggered by next `weekly_catchup` completion | Effectively the same.                                                                                      |
| SSE token-stream feel        | Token-by-token        | 500ms chunks                                  | Imperceptible for long content; mildly chunky for short.                                                   |
| Long generations >5 min      | Single Render handler | Section-chunked across `/advance` calls       | If a single section exceeds 8s, the slice retries that section. Acceptable in observed BOFU data.          |
| In-flight autopilot recovery | Resumes on every boot | Resumes daily via cron                        | Edge case: a user starting onboarding right after deploy waits up to 24h if their lambda crashes mid-flow. |

### 10.17 Out of scope (deferred)

- Multi-region or edge function exploration (Hobby has limited edge support).
- Migration of OpenRouter-backed providers (Claude / Gemini / Perplexity / DeepSeek) onto OpenAI's Responses API background mode for full off-request execution. Only OpenAI's own SDK supports background mode today.
- Splitting `server/databaseStorage.ts` (124 KB, 14% of the bundle) and `shared/schema.ts` (76 KB, 8.4%) by domain. Wave 5 territory in CLAUDE.md; cold-start parse cost remains.

---

## Wave 11 — Citation runs concurrency + duplication hardening

After the Vercel migration shipped, citation runs exhibited two visible symptoms:

1. **`totalChecks` drifting above the prompt × platform cap.** A 50-pair brand showed "61 checks". Latest Results card disagreed with the live banner — 27/29 vs 41/61.
2. **Cascading 504s on `/advance`** during a single run, then the run stalling.

Root cause analysis — both symptoms came from the same defect: nothing was preventing concurrent slices for the same run.

### 11.1 Symptom 1: client polling fired /advance every 1s without waiting

The polling effect in [client/src/pages/citations.tsx](client/src/pages/citations.tsx) called `/advance` fire-and-forget on each tick. With each `/advance` taking up to 25s server-side, ~25 concurrent lambdas were racing on the same run, all loading existing rankings into `alreadyDone`, all queueing the still-pending pairs, all inserting into `geo_rankings` (which had no unique constraint on `(run_id, brand_prompt_id, ai_platform)`). Duplicates accumulated; `totalChecks` = `geo_rankings` count went past the cap.

Compounding bug: the effect's closure also captured a stale `liveProgress` from React state. The deps array was `[selectedBrandId, hasActive]` (not `liveProgress`), so the closure's `liveProgress?.runId` stayed undefined forever. `/advance` was never fired at all on the very first run after kickoff — the only progress was from kickoff's inline 50s deadline-bounded slice (8 checks before timeout), then the run stalled.

**Fix** ([client/src/pages/citations.tsx](client/src/pages/citations.tsx)):

- Track `activeRunId` and `advanceInFlight` in closure-local variables that the tick mutates. Reads from the `/state` response, not from React state.
- Skip the `/advance` call if `advanceInFlight === true`. Only one `/advance` per browser tab is ever in flight per run.

### 11.2 Symptom 2: server-side concurrency

The client-side gate fixes a single tab. It doesn't protect against multi-tab polling, the cron drain colliding with browser polling, or any future caller. Added a per-run Postgres advisory lock around `runBrandPrompts(resume:true)`:

[server/lib/advisoryLock.ts](server/lib/advisoryLock.ts) — new helper `withDynamicAdvisoryLock(namespace, entityId, label, fn)`. Hashes the entity ID (a UUID) into the int4 keyspace Postgres advisory locks accept, takes a session-level lock with `pg_try_advisory_lock(namespace, key)`. Returns `{ran: false}` if the lock is busy; the caller treats that as a successful skip.

Namespace `dynamicLockNamespaces.citationRunSlice` (`920001`) reserved for citation slices. Wraps `runBrandPrompts(resume:true)` inside `advanceCitationRun` ([server/citationChecker.ts](server/citationChecker.ts)). Concurrent `/advance` calls for the same run now serialize at the lock; the second caller returns the run's current status and the client keeps polling until the first slice releases.

### 11.3 Symptom 3: progress accounting was per-slice, not cumulative

`bumpCitationRunProgress` was writing `pct = completedCount / totalTasks * 100` — but on a resume, `totalTasks` is `queue.length` after filtering out `alreadyDone`. So a slice that picked up 5 remaining pairs after 25 had been done in earlier slices wrote `pct = 100, totalChecks = 5`, then the UI banner showed "5 cited / 5 checks — 20%" while the actual DB had 30 rankings.

**Fix** ([server/citationChecker.ts](server/citationChecker.ts)):

- On resume, capture `resumedChecks` and `resumedCited` from the existing rankings.
- `bumpProgressIfDue` writes cumulative numbers: `cumulativeDone = resumedChecks + completedCount`, `cumulativeTotal = resumedChecks + totalTasks`, `cumulativeCited = resumedCited + totalCited`.
- Finalize re-queries `getGeoRankingsByRunId` (when resuming) so the `citation_runs` row's `totalChecks` / `totalCited` / `citationRate` / `platformBreakdown` reflect the full run, not just the closing slice.

### 11.4 504 cascade root cause

The advisory lock was correctly serializing slices, but each slice was still occasionally running past 60s. With `CONCURRENCY = 5` workers and Perplexity occasionally returning at 18s, the worst-case timeline was: 25s deadline + 18s in-flight tail + cold start + response flush ≈ 60s. Some slices crossed it.

**Fix:** lowered both deadlines to leave consistent ~30s headroom under the 60s cap:

- `kickoffBrandPromptsRun` deadline: 50s → 40s → 30s ([server/citationChecker.ts](server/citationChecker.ts)).
- `/advance` deadline: 8s → 25s → 30s ([server/routes/prompts.ts](server/routes/prompts.ts)).

The user pushed back on the iterative tuning — correctly — pointing out that a 60s function cap can't reliably wrap an unbounded number of LLM calls with high variance. The architecturally correct answer is to move the work off the request path entirely (worker process polling a queue, OpenAI Responses API background mode, etc.). That's deferred to a future wave; the deadline tightening here is a stop-gap that makes the existing design behave under observed worst-case latency.

### 11.5 Files

| File                             | Change                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/src/pages/citations.tsx` | Polling effect tracks `activeRunId` + `advanceInFlight` in closure; reads runId from `/state` response, not React state.                                                                                           |
| `server/lib/advisoryLock.ts`     | NEW helper `withDynamicAdvisoryLock` for per-entity locks; namespace `citationRunSlice` reserved.                                                                                                                  |
| `server/citationChecker.ts`      | `advanceCitationRun` wraps slice in advisory lock. Resume captures `resumedChecks` / `resumedCited`. `bumpProgressIfDue` writes cumulative numbers. Finalize re-queries rankings. Kickoff deadline lowered to 30s. |
| `server/routes/prompts.ts`       | `/advance` deadline raised to 30s (from 8s) to match.                                                                                                                                                              |

### 11.6 Verification

- `npx tsc --noEmit` — 0 errors.
- All 217 existing tests still pass.
- Live verification post-deploy: progress bar matches Latest Results card; `totalChecks` does not exceed prompt × platform cap; no 504s under sustained polling.

### 11.7 Known caveats

- Pre-existing rows in `citation_runs` (runs that completed before this fix) may have inflated `totalChecks` / `totalCited` persisted on the row from the duplicate-write era. The History tab shows these as-is. A one-time SQL backfill that recomputes from `geo_rankings` (deduped by latest `checked_at` per `(run_id, brand_prompt_id, ai_platform)`) is available on request but not run yet.
- If a lambda is force-killed mid-slice (504), the underlying advisory lock is held by a dead Postgres connection until TCP keepalive times out (typically 1–2 min on Supabase pooler). During that window all `/advance` calls for that run return `ran: false` and the run appears stalled. The next `/advance` after the keepalive succeeds. If this becomes user-visible, switch from session-level advisory locks to a row-based lock with explicit TTL.

---

## Wave 12 — Buffer bring-your-own-key

Replaced the platform-owned Buffer OAuth integration with a bring-your-own-key flow.

### 12.1 Why

The OAuth integration required the platform to maintain a Buffer-registered OAuth app, ship `BUFFER_CLIENT_ID` / `BUFFER_CLIENT_SECRET` env vars, and host a callback route. Buffer has no public path for end-user-issued tokens via the platform's app — every Buffer user who wants API access already creates their own developer app in Buffer's dashboard. Routing through the platform's app added zero value and added one OAuth route on the lambda surface.

The new flow: users generate an access token in Buffer's developer dashboard themselves, paste it into a small Connect dialog, server validates it against Buffer's `/user.json` and stores it AES-256-GCM encrypted (existing `tokenCipher` helpers, unchanged). Profile listing and posting work exactly as before — only the token's origin changed.

### 12.2 Server

Full rewrite of [server/routes/buffer.ts](server/routes/buffer.ts):

- `POST /api/buffer/connect` — body `{accessToken}`. Trims, rejects empty with `400 missing_token`. Calls Buffer `/user.json`. On 200, encrypts and persists. On 401, `400 invalid_token`. On other non-2xx or network error, `502 buffer_unreachable`.
- `GET /api/buffer/profiles` — unchanged.
- `POST /api/buffer/post` — unchanged.
- `DELETE /api/buffer/connection` — replaces the old `DELETE /api/auth/buffer`. Path renamed for namespace consistency.
- Deleted: `GET /api/auth/buffer`, `GET /api/auth/buffer/callback`, `DELETE /api/auth/buffer`.

`server/env.ts` — dropped `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET`, `BUFFER_REDIRECT_URI` and the cross-field `.refine()` that tied them to `BUFFER_ENCRYPTION_KEY`. The encryption key remains optional (lazy-loaded by `tokenCipher`); deployments not using Buffer don't need to set it.

### 12.3 Client

[client/src/components/articles/BufferConnectDialog.tsx](client/src/components/articles/BufferConnectDialog.tsx) — new component. Masked `<input type="password">` for the token, "Where do I get this?" link to `https://buffer.com/developers/api`, validation error mapping (`missing_token` / `invalid_token` / `buffer_unreachable`). On success, closes the dialog, invalidates the `/api/buffer/profiles` query so the profile picker repopulates, toasts. Disconnect path is implemented in the component for future reuse from a settings page but not currently wired into any UI.

[client/src/components/articles/DistributeDialog.tsx](client/src/components/articles/DistributeDialog.tsx) — replaced the `<a href="/api/auth/buffer">Connect Buffer</a>` link with `<BufferConnectDialog connected={false} />`. The dialog is the only UI affected; the surrounding profile picker and post composer continue to consume `/api/buffer/profiles` and `/api/buffer/post` unchanged.

### 12.4 Files

| File                                                     | Change                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `server/routes/buffer.ts`                                | Rewritten. New `POST /api/buffer/connect`, renamed delete to `DELETE /api/buffer/connection`, OAuth routes deleted.                  |
| `server/env.ts`                                          | Buffer OAuth env vars + cross-field refine removed.                                                                                  |
| `.env.example`                                           | Buffer block rewritten for BYOK; only `BUFFER_ENCRYPTION_KEY` remains.                                                               |
| `docs/feature_flows.md`                                  | Three stale OAuth references cleaned up; env-var table row + one obsolete `APP_URL: Buffer OAuth callback default` row removed.      |
| `client/src/components/articles/BufferConnectDialog.tsx` | NEW. Masked input + validation + error mapping + success/disconnect mutations.                                                       |
| `client/src/components/articles/DistributeDialog.tsx`    | OAuth `<a href>` replaced with `<BufferConnectDialog />`.                                                                            |
| `tests/unit/bufferConnect.test.ts`                       | NEW. 8 tests: scaffold, connect success, missing-token, whitespace-only, invalid token (Buffer 401), 5xx, network error, disconnect. |

### 12.5 Database

No schema change. `users.buffer_access_token` reused. Existing OAuth-connected users' encrypted tokens still decrypt correctly with the same `BUFFER_ENCRYPTION_KEY`; their connections continue to work until they explicitly disconnect or paste a new token.

### 12.6 Tests

8 new tests in [tests/unit/bufferConnect.test.ts](tests/unit/bufferConnect.test.ts). 217 → 224 total (one pre-existing ssrf network-timeout failure unrelated to this work).

### 12.7 Out of scope

- Token rotation reminders / expiry banners (Buffer access tokens don't expire).
- A separate Buffer-settings page outside `DistributeDialog`.
- A migration shim for users connected via the deleted OAuth flow — they reconnect with a manually-generated token. Acceptable per the user's decision.
- Caching the profile list locally (existing `/profiles` route fetches on demand; layering a cache is premature).

## Wave 13 — Buffer v1 REST → GraphQL migration

After Wave 12 shipped, real-world testing revealed Buffer had retired the v1 REST API (`api.bufferapp.com/1/`). Every paste of a fresh API key returned `400 invalid_token` because Buffer's `/user.json` endpoint no longer exists. Buffer's current public API is GraphQL at `https://api.buffer.com` with `Authorization: Bearer <key>` auth, and keys are now generated at `https://publish.buffer.com/settings/api` (not the legacy `developers/api` page). Wave 12 implemented BYOK against an API surface that was already gone — this wave migrates everything to the live GraphQL API.

### 13.1 Endpoint rewrites ([server/routes/buffer.ts](server/routes/buffer.ts))

All three Buffer-facing routes rewritten against the GraphQL endpoint. A new `bufferGraphQL()` helper inside the file centralizes the POST-with-Bearer pattern and JSON parsing.

- **`POST /api/buffer/connect`** — validates by issuing a minimal `{ account { id } }` query. 200 with `data.account.id` non-null = valid; HTTP 401 OR a top-level `errors[].extensions.code === "UNAUTHORIZED"` / `"FORBIDDEN"` = `invalid_token`; everything else = `buffer_unreachable`. The 200-with-UNAUTHORIZED case is GraphQL-specific (REST APIs use HTTP status; GraphQL APIs use 200 + errors[]) and the most common failure mode for a wrong-account or revoked key.
- **`GET /api/buffer/profiles`** — was a single `GET /1/profiles.json`; is now two queries: `{ account { organizations { id } } }` to discover the org list, then `channels(input: { organizationId })` for each. Buffer's data model exposes channels under organizations rather than a flat profile list. The response shape returned to the client is intentionally identical to the legacy REST mapping (`{id, service, formattedService, username, avatar}`) so `DistributeDialog`'s existing matcher logic kept working without UI changes. `formattedService` is synthesized from `service` (`"twitter"` → `"Twitter"`, `"google_business"` → `"Google Business"`).
- **`POST /api/buffer/post`** — was a `POST /1/updates/create.json` with `profile_ids[]`; is now a `createPost` mutation per channel. The route's contract changed from `profileIds: string[]` to `channelId: string` (one channel per request — multi-channel becomes a client-side loop, which is what the existing call site already did with single-element arrays).

### 13.2 Documentation cleanup

`.env.example` Buffer block rewritten to point at `https://publish.buffer.com/settings/api` and to mention the GraphQL endpoint.

`docs/feature_flows.md` — five stale references hunted down: the env-var row referencing `BUFFER_CLIENT_ID/SECRET/REDIRECT_URI`, an obsolete `APP_URL: Buffer OAuth callback default` row, a "What happens when you click Post to Buffer" section narrating the v1 REST flow, two narrative phrases ("user's stored Buffer OAuth token" / "OAuth token for Buffer posting"), and a "Buffer connection" section with v1 REST code samples. All replaced with GraphQL equivalents documenting the new `createPost` mutation and the channel-via-organization fetch pattern.

### 13.3 Tests

[tests/unit/bufferConnect.test.ts](tests/unit/bufferConnect.test.ts) updated for the GraphQL response shape (URL `https://api.buffer.com`, `Authorization: Bearer` header, `data.account.id` in success body). Two new test cases:

- 200 OK with `errors[].extensions.code === "UNAUTHORIZED"` → `invalid_token`. Locks in the GraphQL idiom.
- 200 OK with `data.account: null` → `buffer_unreachable`. Guards against silently succeeding when the account query returns nothing useful.

10 buffer tests passing (217 → 224 → 227 across the migration).

### 13.4 Connected-state strip in DistributeDialog

After successfully connecting, the disconnect-side strip with the Connect button got replaced with a green "Buffer connected · N channel(s)" strip that includes a "Disconnect Buffer" button — so the user has a confirmation that the connection landed and a one-click way to switch keys. ([client/src/components/articles/DistributeDialog.tsx](client/src/components/articles/DistributeDialog.tsx)).

### 13.5 Files

| File                                                     | Change                                                                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/routes/buffer.ts`                                | Full rewrite. New `bufferGraphQL()` helper; `formatService()` slug-to-display helper; all three routes (`/connect`, `/profiles`, `/post`) issue GraphQL queries/mutations against `https://api.buffer.com`. |
| `client/src/components/articles/DistributeDialog.tsx`    | Profile-picker matcher unchanged (the kept-identical response shape is why). Connected-state green strip added; `<a href="/api/auth/buffer">` link removed (stale even pre-GraphQL).                        |
| `client/src/components/articles/BufferConnectDialog.tsx` | Copy + helper link updated to `https://publish.buffer.com/settings/api`; placeholder "Paste your Buffer API key".                                                                                           |
| `tests/unit/bufferConnect.test.ts`                       | All assertions updated for GraphQL endpoint + Bearer auth + JSON response body shape; +2 tests for UNAUTHORIZED-in-200 and missing-account paths.                                                           |
| `.env.example`                                           | Buffer block rewritten.                                                                                                                                                                                     |
| `docs/feature_flows.md`                                  | Buffer flow narration replaced with GraphQL equivalents; v1 REST code samples removed.                                                                                                                      |

### 13.6 Observed timeline

The connect bug → fix loop took about a day:

- Initial Wave 12 ship: paste → 400 invalid_token (silent — the v1 REST endpoint just rejects everything)
- Buffer's developer docs were the smoking gun: their published API spec is GraphQL-only.
- Migration ship: paste → 200 → channel list visible immediately.

Lesson worth recording: when a third-party integration starts failing for "no obvious reason," check the third party's current API docs before assuming the bug is on your side. v1 REST was deprecated for ~12 months before retirement; older blog posts and StackOverflow answers still reference it as canonical.

---

## Wave 14 — Distribute: direct-post to Buffer + expanded platforms + posted-state persistence

The Distribute panel previously generated platform-adapted copy for LinkedIn / Medium / Reddit / Quora and stopped there — the user copied each card's text and pasted it into Buffer manually. With BYOK working, the natural next step was a one-click Post-to-Buffer button per card. Three additions in this wave:

1. **Three new prompt templates** (Twitter / Facebook / Instagram) with per-platform character limits embedded as hard constraints in the prompt itself.
2. **Per-card "Add to Buffer Queue" button** with a four-state machine (already-queued / not-connected / disabled-no-channel / queueable) and a popover channel picker for the multiple-matches case.
3. **Posted-state persistence** — repurposing the existing `distributions.platform_post_id` column properly so closing and reopening the Distribute dialog still shows which cards have been queued.

### 14.1 Server-side: prompts and the new endpoint

**Three new prompt templates** added to `platformPrompts` inside `POST /api/distribute/:articleId` ([server/routes/articles.ts](server/routes/articles.ts)). Each one bakes the platform's hard limit directly into the prompt as a literal "Hard constraint:" sentence plus a final-line reminder, so the LLM treats it as non-negotiable and we don't need a post-process step:

- **Twitter:** ≤ 280 characters total. Punchy hook, 1–2 hashtags, no preamble.
- **Facebook:** ≤ 2000 characters (engagement falls off past that). 2–4 short paragraphs, 1–2 emojis, 3–5 hashtags.
- **Instagram:** ≤ 2200 characters total, but the **first 125 characters** must contain the hook (that's what shows before Instagram's "more" cut). Up to 30 hashtags grouped at the end.

The platform cap raised from 5 → 7 to fit the new set ([server/routes/articles.ts:375](server/routes/articles.ts#L375)).

**Pre-existing fake-stamp bug fixed.** The old generation handler stamped `distributions.platform_post_id` with a synthetic `<service>_<articleId>_<timestamp>` string at generation time — but `platform_post_id` is meant to hold the real third-party post id. The new direct-post UI correctly treats any non-null `platform_post_id` as "this row has been posted to Buffer," so every existing generated row showed as "Posted ✓" falsely. Migration `0046_clear_fake_distribution_post_ids.sql` clears those synthetic strings via a regex match (`^(linkedin|medium|reddit|quora|twitter|facebook|instagram)_[0-9a-f-]+_[0-9]+$`) — real Buffer post ids don't match the pattern so legitimate posts are preserved. The generation handler also stops writing the synthetic value going forward.

**New shared helper [server/lib/bufferPost.ts](server/lib/bufferPost.ts):** extracted `postToBuffer(userId, channelId, text, scheduledAt?)` returning `{ok:true, postId} | {ok:false, code: "not_connected"|"rejected"|"unreachable", message?}`. Both `/api/buffer/post` and the new endpoint go through it. Default mode is `addToQueue` (Buffer fills the next slot from the user's per-channel posting schedule); `scheduledAt` switches to `customScheduled` with a `dueAt`. Top-level GraphQL `errors[]` are surfaced as `rejected` with the upstream message verbatim instead of being lumped with `unreachable`, so the inline UI error tells the user exactly what Buffer rejected (e.g. "Tweet too long") rather than a generic 502.

**New endpoint `POST /api/distributions/:distributionId/buffer-post`** ([server/routes/articles.ts](server/routes/articles.ts)). Body `{channelId}`. Verifies article ownership (`requireArticle`) — 404 not 403 on miss per the anti-enumeration rule. Reads the row's `metadata.content`; 400 `no_content` if missing/empty. Calls `postToBuffer`; on success stamps `platform_post_id` with the Buffer post id, flips `status` to `scheduled`, sets `distributed_at`, returns 200 `{success:true, data:{platformPostId}}`. On failure preserves the row and returns the right error code.

The existing `/api/buffer/post` route became a thin shim over `postToBuffer` so all three callers share one code path.

### 14.2 Client-side: PlatformPostButton + DistributeDialog rewiring

**New component [client/src/components/articles/PlatformPostButton.tsx](client/src/components/articles/PlatformPostButton.tsx):** self-contained four-state machine.

| State            | Trigger                 | Label                            | Action                                                         |
| ---------------- | ----------------------- | -------------------------------- | -------------------------------------------------------------- |
| Already queued   | `platformPostId` truthy | `Queued ✓ View in Buffer`        | Opens `https://publish.buffer.com/queue` in new tab            |
| Not connected    | `!bufferConnected`      | `Connect Buffer to post`         | Opens controlled `<BufferConnectDialog>` instance              |
| No channel match | `matches.length === 0`  | `Add to Buffer Queue` (disabled) | Tooltip: "No {platform} channel in your Buffer"                |
| Single match     | `matches.length === 1`  | `Add to Buffer Queue`            | Posts to that channel                                          |
| Multiple matches | `matches.length > 1`    | `Add to Buffer Queue ▾`          | Popover lists each matching channel by username; click → posts |

While a post is in flight: spinner + "Posting…", button disabled. On Buffer rejection (e.g. content over the platform's character limit), the upstream message renders inline below the button — the user can edit copy and retry without losing the rest of their cards.

The set of platforms the button renders for: **LinkedIn, Twitter, Facebook, Instagram**. Medium / Reddit / Quora cards keep their existing Edit / Copy actions only — Buffer doesn't support those services, and no Post-to-Buffer button means no false hope.

**`BufferConnectDialog` extended to optional controlled mode.** When both `open` and `onOpenChange` props are passed, the dialog defers to the parent for open state instead of using its internal `useState`. This lets the per-card "Connect Buffer to post" button (rendered when `!bufferConnected`) open the same dialog instance that lives in the top connection strip. Default uncontrolled behavior preserved for existing call sites.

**[DistributeDialog.tsx](client/src/components/articles/DistributeDialog.tsx) — five wiring changes:**

1. **Platform list** widened from 4 → 7. Buffer-supported first, copy-only after: `["LinkedIn", "Twitter", "Facebook", "Instagram", "Medium", "Reddit", "Quora"]`. A constant `BUFFER_SUPPORTED_PLATFORMS` gates the new button.
2. **`generatedContent` row type widened** to carry `distributionId` and `platformPostId`. The `/api/distribute/:articleId` response was extended to return both per-row, so freshly-generated cards have what the new button needs without an extra round-trip.
3. **Per-platform merge instead of replace** in `distributeMutation.onSuccess`. Previously `setGeneratedContent(data.data)` overwrote the array — generating Twitter alone after a previous LinkedIn run would erase the LinkedIn card and its queued state. The new code merges by platform: incoming rows replace same-platform existing ones; new platforms append; untouched platforms persist.
4. **Hydrate from history on dialog open.** A new `useEffect` reads `historyData` (the existing `GET /api/distributions/:articleId` response), groups by platform, picks the most recent successful row per platform, and seeds `generatedContent` if it's empty. Closing the dialog (which resets `generatedContent` to `[]`) and reopening rehydrates the same cards — the user never loses track of what's queued.
5. **History tab filter widened** to include `status: "scheduled"` rows (the new "queued in Buffer" status), not just `"success"`.

The old `postToBufferMutation` (which targeted the legacy `/api/buffer/post` with arbitrary text) is replaced by `postDistributionMutation`, which calls the new distribution-scoped endpoint and stores per-card error messages in a `cardErrors` state map. On success: optimistic local update of `platformPostId`, invalidate `/api/distributions/:articleId` so the next refetch confirms it, toast "Queued in Buffer".

### 14.3 Tests

New [tests/unit/distributionBufferPost.test.ts](tests/unit/distributionBufferPost.test.ts) with six cases covering the new endpoint:

1. Success — distribution exists, ownership confirmed, `postToBuffer` returns `{ok:true, postId}` → 200 with `platformPostId` stamped on the row.
2. Buffer not connected — `postToBuffer` returns `{ok:false, code:"not_connected"}` → 403, no DB write.
3. No content — distribution row's `metadata.content` is missing/empty → 400 `no_content`, no Buffer call.
4. Distribution not owned — `requireArticle` throws → 404 `not_found` (not 403; anti-enumeration).
5. Buffer rejection — `postToBuffer` returns `{ok:false, code:"rejected", message:"Tweet too long."}` → 502 with the upstream message verbatim.
6. Buffer unreachable — `postToBuffer` returns `{ok:false, code:"unreachable"}` → 502 `buffer_unreachable`.

All 233 tests pass (227 → 233, +6 from the new endpoint).

### 14.4 Files

| File                                                     | Change                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/routes/articles.ts`                              | 3 new prompts (Twitter/Facebook/Instagram) inside `platformPrompts`; cap `slice(0,5)` → `slice(0,7)`; removed fake `platformPostId` stamp at generation time; generate response now returns `distributionId` and `platformPostId: null` per row; new `POST /api/distributions/:distributionId/buffer-post` route.                                                                                  |
| `server/routes/buffer.ts`                                | `/api/buffer/post` reduced to a thin shim over `postToBuffer`.                                                                                                                                                                                                                                                                                                                                     |
| `server/lib/bufferPost.ts`                               | NEW. Shared helper `postToBuffer(userId, channelId, text, scheduledAt?)`. Default `mode: addToQueue`; surfaces upstream `errors[]` as `rejected` with message; logs the failure body server-side for debugging.                                                                                                                                                                                    |
| `migrations/0046_clear_fake_distribution_post_ids.sql`   | NEW. One-shot UPDATE clearing synthetic `platform_post_id` strings via regex; preserves real Buffer post ids.                                                                                                                                                                                                                                                                                      |
| `client/src/components/articles/PlatformPostButton.tsx`  | NEW. Four-state per-card button with channel-picker popover.                                                                                                                                                                                                                                                                                                                                       |
| `client/src/components/articles/BufferConnectDialog.tsx` | Optional controlled-mode props (`open`, `onOpenChange`); existing uncontrolled behavior preserved.                                                                                                                                                                                                                                                                                                 |
| `client/src/components/articles/DistributeDialog.tsx`    | Platform list widened to 7; matcher changed to return all matches (was filtering to single match silently); generate-onSuccess merges by platform; hydrate-from-history `useEffect`; history filter widened for `status: "scheduled"`; per-card `<PlatformPostButton>` mounted on Buffer-supported cards; controlled `<BufferConnectDialog>` instance opened by per-card "Connect Buffer to post". |
| `tests/unit/distributionBufferPost.test.ts`              | NEW. 6 tests covering the new endpoint's branches.                                                                                                                                                                                                                                                                                                                                                 |

### 14.5 Queue timing

`mode: addToQueue` lets Buffer pick the slot from the user's per-channel posting schedule (configured at `https://publish.buffer.com/account/posting-schedule`). The platform does **not** set queue timing — that's the entire point of queue mode. If a channel has no posting schedule configured in Buffer, queued posts sit in the queue indefinitely until the user adds a schedule or moves them to a custom time inside Buffer's web app. The toast description ("Will publish at the next slot in your Buffer schedule for this channel.") makes this explicit.

The helper still accepts an optional `scheduledAt` ISO string and switches to `mode: customScheduled` with a `dueAt`, so adding a per-card date picker later is a UI-only change.

### 14.6 Out of scope

- Per-card scheduling UI (date picker → `mode: customScheduled`). Helper supports it; UI doesn't surface it yet.
- Server-side dedup of double-clicks. Buffer doesn't dedup; cost > benefit at this scale.
- Image / media attachments on posts. Generated copy is text-only; Buffer's `createPost` mutation supports `assets` but neither generation nor the dialog produces media.
- Client-side character-count preview before submit. The prompt enforces; Buffer enforces again on accept; we display Buffer's error message verbatim on rejection.
- Buffer Idea / draft mode.
- Twitter thread / multi-tweet support.
- Buffer post performance analytics. Buffer's own dashboard handles it.
- Refactoring the inline prompt strings into named exports for testability. Tried during planning; the file is already large and the constraint phrases live in plain sight in code review. Skipped.

---

## Wave 15 — Production-readiness pass: SSRF + asyncHandler + Sentry capture-and-flush + console sweep

Driven by the items flagged in `PRODUCTION_PLAN.md` Workstream B. Five discrete fixes, all additive and shape-preserving — no response bodies changed, no try/catch removed, no architectural rewrites. The codebase still serves the same JSON to clients; the difference is what happens server-side when something goes wrong.

### 15.1 SSRF on the Slack webhook test endpoint

**Problem.** `POST /api/alerts/test/:settingId` did `fetch(setting.slackWebhookUrl, ...)` after only checking `url.hostname.endsWith("slack.com")`. Two bypasses existed:

1. Attacker-controlled subdomains that happen to end with `slack.com` (or someone's tenant subdomain on Slack's infra) — the `endsWith` check passes them.
2. **DNS rebinding** — `legit.slack.com` resolves to a public IP at validation time (passes the hostname check) and to `127.0.0.1` or `169.254.169.254` (AWS metadata) when the actual `fetch` runs milliseconds later.

**Fix.** Two layers in [server/routes/intelligence.ts](server/routes/intelligence.ts):

1. A strict regex pinning the canonical Slack incoming-webhook shape: `^https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+$`. Enforced at all three sites (create, update, test). Closes the subdomain-padding bypass.
2. `assertSafeUrl()` from [server/lib/ssrf.ts](server/lib/ssrf.ts) called immediately before the `fetch`. It DNS-resolves and rejects private/loopback/link-local/CGNAT/metadata IPs at fetch time. Closes DNS rebinding.

The 3 prior `endsWith("slack.com")` checks at the create / update / test sites all collapse into a single shared `isValidSlackWebhookUrl()` helper.

### 15.2 `console.*` → `logger` in `server/auth.ts`

Four `console.warn` / `console.error` calls in [server/auth.ts](server/auth.ts) (`attachUserIfPresent` JWT-verify path; forgot-password error path) replaced with `logger.warn` / `logger.error` from the existing Pino instance. Errors are passed as `{ err }` so Pino's serializer extracts the stack and the redact list (`authorization`, `cookie`, `password`, `token`, …) auto-scrubs sensitive fields. Per the `CLAUDE.md` rule that no `console.*` should appear in server code.

### 15.3 Centralized `asyncHandler` + Sentry capture in `sendError`

Two structural problems before this wave:

1. The global Express error handler in [server/app.ts:356-375](server/app.ts#L356-L375) calls `Sentry.captureException` for any 5xx — but only for **uncaught** errors. Most route handlers use a `try { … } catch (e) { sendError(...) }` pattern that swallows the error before it ever reaches the global handler. Result: ~200 caught 5xx responses were invisible in Sentry.
2. A handful of handlers had no top-level `try/catch` at all — a thrown error in those leaked as an unhandled rejection. Specifically: [logoProxy.ts:18](server/routes/logoProxy.ts#L18), [content.ts:490](server/routes/content.ts#L490), [content.ts:557](server/routes/content.ts#L557), and [onboarding.ts:101](server/routes/onboarding.ts#L101) (the SSE stream).

**`asyncHandler`** ([server/lib/asyncHandler.ts](server/lib/asyncHandler.ts), 10 lines): wraps an async handler and forwards any thrown error / rejected promise to `next(err)`. Lives in its own file so utility callers (e.g. [server/routes/cron.ts](server/routes/cron.ts)) can import it without dragging in the singleton OpenAI client that [server/lib/routesShared.ts](server/lib/routesShared.ts) instantiates at module load. `routesShared` re-exports it so the 20+ route modules that already import from there don't need an import change.

**`sendError` patched** in [server/lib/routesShared.ts](server/lib/routesShared.ts) and [server/routes.ts](server/routes.ts) (the legacy monolith carries a verbatim copy of the helper): logs via the structured logger AND calls `captureAndFlush` (see §15.7) for any `status >= 500`. Skips capture when `sendOwnershipError` short-circuited (those are 401/404, not 5xx). Tags the event with `source: "sendError"` and the fallback string. ~200 caller sites covered with one edit.

### 15.4 Wrap every route handler with `asyncHandler` (additive)

134 handlers across 21 route files. Every `app.<verb>("/x", async (req, res) => {…})` became `app.<verb>("/x", asyncHandler(async (req, res) => {…}))`. The handler body — including its existing try/catch and `sendError` calls — is **not modified**; the wrapper only adds a safety net for the rare path where an error escapes the inner catch.

The 5 previously-unprotected handlers (§15.3) are now safe. Every future regression where a thrown error escapes a `try` is also covered.

A small codemod (`scripts/wrap-handlers.mjs`, deleted after use) did the mechanical wrapping with brace-aware scanning, idempotent against re-runs. Two multi-line handlers ([prompts.ts:92-108](server/routes/prompts.ts#L92), [analytics.ts:1333](server/routes/analytics.ts#L1333)) the codemod missed were fixed by hand.

Two test mocks needed `asyncHandler` added because they stub `routesShared`: [bufferConnect.test.ts](tests/unit/bufferConnect.test.ts) and [distributionBufferPost.test.ts](tests/unit/distributionBufferPost.test.ts). Both got a pass-through `asyncHandler: (fn) => fn` so the tests don't exercise the unhandled-rejection path.

### 15.5 Inline `Sentry.captureException` at the raw `res.status(500)` sites that bypass `sendError`

49 sites — mostly older handlers (auth registration paths, billing, analytics, intelligence, content, etc.) — write the response directly via `res.status(500).json(...)` without going through `sendError`, so the §15.3 patch doesn't cover them. Each got an inline `Sentry.captureException(error, { tags: { source: "<file>:<line>" } })` immediately before the response. Response shape preserved exactly — the agent endpoint's non-standard `{ success, error, task }` shape at [agent.ts:208](server/routes/agent.ts#L208) is left intact.

A second small codemod (`scripts/add-sentry-capture.mjs`, deleted after use) inserted these by walking each `res.status(500)` site, finding the nearest `} catch (X)` above it to identify the error variable, and inserting the capture line at the matching indent. Idempotent (skips sites that already have `Sentry.captureException` within 6 lines or `sendError` within 10 lines).

### 15.6 `console.*` sweep across `server/`

62 `console.{log,warn,error}` calls across 15 files converted to `logger.{info,warn,error}`. Two-pass codemod: a single-line shape pass plus a multi-line shape pass for the `console.X(\n  \`template\`,\n err instanceof Error ? err.message : err,\n);` pattern that's everywhere in [server/citationChecker.ts](server/citationChecker.ts) and the brand routes. Pino's existing redact list (`server/lib/logger.ts:62-85`) auto-scrubs sensitive fields so no per-call `{ err }` object had to be hand-curated for safety.

**Skipped on purpose** (3 files):

- [server/log.ts](server/log.ts) — 10-line dev-mode timestamp formatter. Its single `console.log` _is_ its purpose.
- [server/lib/aiLogger.ts](server/lib/aiLogger.ts) — its docstring states _"Writes to console only — no files — so it works on Vercel's ephemeral filesystem. Safe to leave on in production; noisy but cheap."_ Intentional LLM-trace stdout output that callers grep for. Converting to Pino would change the format.
- [server/setupProducts.ts](server/setupProducts.ts) — CLI script invoked manually (`tsx server/setupProducts.ts`). 9 `console.log` calls are intentional CLI UX.

Final state: `grep "console\\." server/` returns hits only in the three skip-list files.

### 15.7 Sentry flush via `waitUntil` — fixes the serverless event-loss caveat

Sentry's transport queues events in-process and flushes them asynchronously. On Vercel serverless that queue is fragile: the function freezes the moment the response goes out, so any queued event that hadn't been transmitted is lost. Result before this fix: Sentry would receive _some_ of the events from §15.3–15.5 — the ones that happened to flush before the function suspended — and silently drop the rest. Hard to debug because there's no error: the captures happen, the queue just never empties.

**Fix.** [server/lib/sentryReport.ts](server/lib/sentryReport.ts) (new):

```ts
export function captureAndFlush(err, ctx = {}) {
  Sentry.captureException(err, ctx);
  // 2s upper bound — long enough to clear a normal queue, short
  // enough to never approach the function's max duration.
  waitUntil(Sentry.flush(2000).catch(() => {}));
}
```

`waitUntil` from `@vercel/functions` keeps the function alive _after_ the response is sent (zero added request latency, bounded by `maxDuration`). Outside Vercel (`npm run dev`, long-running Node), `waitUntil` is a shim that runs the promise in the background — safe in every environment.

Applied via codemod (`scripts/swap-to-flush.mjs`, deleted after use) to every `Sentry.captureException(...)` call in the request/cron lifecycle: 33 pre-existing direct callers + 41 of the 46 inline sites added in §15.5 (the other 5 were in `server/routes.ts` which the script also covered). Total 74 sites converted in addition to the two `sendError` helpers and the global error handler.

**Sites left calling `Sentry.captureException` directly** (intentional):

- [server/lib/sentryReport.ts](server/lib/sentryReport.ts) — defines the wrapper.
- [server/index.ts:26](server/index.ts#L26) — boot path. On Vercel this never runs in a request; on local dev the long-running process flushes naturally.
- [server/auth.ts](server/auth.ts) — `Sentry.setUser({ id })` (not an exception capture, doesn't need flushing).

**18 unused `Sentry` imports** dropped from files where every direct call was swapped to the helper. The files still report errors to Sentry — just indirectly via the helper. The dropped imports were dead code that ESLint flagged. A second small codemod (`scripts/drop-unused-sentry.mjs`, deleted after use) walked the candidate list, simulated removing the import, and only removed it when no other `Sentry.X` reference remained in the file.

**Two test mocks updated**: [contentGenerationResponses.test.ts](tests/unit/contentGenerationResponses.test.ts) and [cronOrchestrator.test.ts](tests/unit/cronOrchestrator.test.ts) extended their `Sentry` stub from `{ captureException: vi.fn() }` to `{ captureException: vi.fn(), flush: vi.fn(async () => true) }` so the helper's `Sentry.flush(2000)` call doesn't throw inside the mock.

### 15.8 Files

| File                                                                                                                                                                                                                         | Change                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/asyncHandler.ts`                                                                                                                                                                                                 | NEW. Tiny wrapper that forwards thrown errors to `next(err)`.                                                                                                                                                       |
| `server/lib/sentryReport.ts`                                                                                                                                                                                                 | NEW. `captureAndFlush(err, ctx)` — capture + `waitUntil(Sentry.flush(2000))`.                                                                                                                                       |
| `server/lib/routesShared.ts`                                                                                                                                                                                                 | `sendError` now logs via Pino and calls `captureAndFlush` for 5xx. Re-exports `asyncHandler`.                                                                                                                       |
| `server/routes.ts`                                                                                                                                                                                                           | Same `sendError` patch on the legacy duplicate. 11 handlers wrapped. 5 inline `Sentry.captureException` added at raw 500 sites, then swapped to `captureAndFlush`. One `console.error` (waitlist) → `logger.error`. |
| `server/app.ts`                                                                                                                                                                                                              | Global error handler now calls `captureAndFlush` (was `Sentry.captureException`). 3 webhook captures (Stripe / Shopify / Resend) swapped to `captureAndFlush`.                                                      |
| `server/auth.ts`                                                                                                                                                                                                             | 4 `console.*` → `logger.*`. 3 inline `Sentry.captureException` at registration error paths added then swapped to `captureAndFlush`.                                                                                 |
| `server/routes/intelligence.ts`                                                                                                                                                                                              | SSRF fix at the Slack webhook test endpoint (regex + `assertSafeUrl`). asyncHandler wrap. 10 `Sentry.captureException` added then swapped to `captureAndFlush`. 1 console → logger.                                 |
| `server/routes/{logoProxy,cron,unsubscribe,billing,revenue,userAccount,onboarding,dashboard,community,geoSignals,analytics,brands,prompts,articles,publications,buffer,content,contentTypes,agent}.ts`                       | asyncHandler wrap on every handler (134 total). Per-file inline Sentry captures + `captureAndFlush` swaps + `console.*` → `logger.*` per the breakdown above.                                                       |
| `server/{contentGenerationWorker,scheduler,webhookHandlers,citationChecker,emailService}.ts` and `server/lib/{audit,onboardingAutopilot,weeklyDigestEmitter,workflowEngine,factExtractor,listicleScanner,mentionScanner}.ts` | Existing `Sentry.captureException` calls swapped to `captureAndFlush` (these all run inside the daily cron's serverless function). Misc `console.*` → `logger.*` (19 calls in `citationChecker.ts` alone).          |
| `tests/unit/bufferConnect.test.ts`, `tests/unit/distributionBufferPost.test.ts`                                                                                                                                              | Mock `routesShared` extended with `asyncHandler: (fn) => fn` pass-through.                                                                                                                                          |
| `tests/unit/contentGenerationResponses.test.ts`, `tests/unit/cronOrchestrator.test.ts`                                                                                                                                       | Mock `instrument` extended with `Sentry.flush: vi.fn(async () => true)`.                                                                                                                                            |

### 15.9 Verification

- `npm run check`: clean.
- `npm test`: 233/233 passing (no new tests added; this wave is structural — every existing test still passes against the new wiring).
- `npx eslint server/`: 0 errors. ~368 warnings, all pre-existing `@typescript-eslint/no-explicit-any` style hits unchanged from baseline.
- `grep "console\\." server/`: only the 3 skip-list files match.
- `grep "app\\.(get|post|put|patch|delete)" server/routes/`: every match has `asyncHandler(` after the route verb (or after a middleware identifier). No bare `async (req, res)`.
- `grep "Sentry\\.captureException" server/`: only the three intentional sites listed in §15.7.

### 15.10 Vercel Hobby compatibility

All changes are within the Hobby plan envelope:

- No new functions, no new cron entries, no `vercel.json` changes — still 1 daily cron at `/api/cron/daily-orchestrator`.
- No new env vars required. `SENTRY_DSN` remains optional; if unset, every `captureAndFlush` is a no-op (and `waitUntil` of a no-op is also a no-op).
- No new dependencies. `@vercel/functions` was already in `package.json` (used by [server/auth.ts:80-84](server/auth.ts#L80-L84)).
- Bundle size grew by a few KB. Function size is far below the 250 MB cap.
- Per-request cost neutral or positive. `asyncHandler` adds sub-microsecond overhead. Pino is ~5× faster than `console.*`. Sentry capture is queued; `waitUntil` keeps the function warm only on error paths and only for ≤2s.

### 15.11 Out of scope

- The remaining items in `PRODUCTION_PLAN.md` Workstream A (chatbot, public articles directory, citation locations, CMS integration, lead magnets, services menu, agency dashboard) — those are product-feature work, separately scoped.
- Sentry release tagging in CI (PR-time `SENTRY_RELEASE = git rev-parse HEAD`) — small CI tweak, deferred.
- Source-map upload to Sentry on production builds — deferred.
- Centralized `HttpError` class so handlers can `throw new HttpError(500, "Failed to X")` and let the global handler do everything. Would let us delete the per-handler try/catch entirely. Tempting but riskier than this wave's additive approach; deferred until we have evidence the current pattern is causing real bugs.
- A retry-on-flush-failure layer for Sentry. The 2s `waitUntil` budget is generous for normal load; if Sentry's ingest is itself down, dropping the event is the right behavior (the global handler already logged it via Pino).

---

## Wave 16 — Phase 0: Pre-flight cleanup (production-readiness foundation)

First slice of the comprehensive Workstream-A+C product plan (`docs/superpowers/specs/2026-05-04-implement-workstream-a-and-c-design.md`). Phase 0 is the foundation that every subsequent phase builds on — Sentry observability live, server hardened, database safety verified, RUNBOOK expanded.

### 16.1 Sentry account setup (manual, deferred to user)

Sentry org/project signup + DSN + auth-token in Vercel env vars deferred to user's manual session. Code is fully wired (`@sentry/react` already installed + initialized in `client/src/lib/sentry.ts`, server-side `@sentry/node` initialized in `server/instrument.ts`, gated on `SENTRY_DSN`). All capture/flush plumbing from Wave 15 + every new capture site added in this wave is no-op until DSN is provided.

### 16.2 Server hardening

- **B1.5 cap `competitorDetections` Map** at 5000 entries via new `addCompetitorDetection(map, id, platform, delta, onCapHit?)` helper exported from [server/citationChecker.ts](server/citationChecker.ts). Caller in `runCitationCheck` deduplicates `onCapHit` to one warn per run via local `competitorDetectionsCapWarned` boolean. 4 unit tests cover sub-cap accept, at-cap reject, post-cap update-existing, and caller-deduplication pattern.
- **B3.1 rate limit on `/api/alerts/test/:settingId`** ([server/routes/intelligence.ts:823](server/routes/intelligence.ts#L823)) — added `aiLimitMiddleware`. Closes Slack-webhook flooding abuse vector that the Wave 15 SSRF fix did not (SSRF blocked the destination but not request volume).
- **B1.6 chart safety comment** at [client/src/components/ui/chart.tsx:75](client/src/components/ui/chart.tsx#L75) — code comment locks in the rationale for `dangerouslySetInnerHTML` (input is hardcoded `THEMES` + caller-supplied static `config`, no user input).

### 16.3 Observability

- **`@sentry/vite-plugin` installed + configured** in [vite.config.ts](vite.config.ts). `build.sourcemap: 'hidden'` generates source maps without exposing them publicly via `sourceMappingURL` comments. The plugin uploads them to Sentry on prod builds gated by `SENTRY_AUTH_TOKEN`. Local builds without the token skip upload silently.
- **Client-side console sweep** — 5 `console.*` calls remaining in client code routed to `Sentry.captureException` from `@/lib/sentry`:
  - [client/src/components/ErrorBoundary.tsx](client/src/components/ErrorBoundary.tsx) — React tree crashes now visible without users emailing support
  - [client/src/lib/authStore.ts](client/src/lib/authStore.ts) — 2 auth-flow failures
  - [client/src/components/intelligence/ShareOfAnswerTab.tsx](client/src/components/intelligence/ShareOfAnswerTab.tsx) — 1 mutation error
  - [client/src/pages/reset-password.tsx](client/src/pages/reset-password.tsx) — 1 session error
- **CSP rationale comment** added to [server/app.ts](server/app.ts) explaining why `styleSrc` includes `'unsafe-inline'` (Recharts injects per-chart theme styles via `dangerouslySetInnerHTML` at component-render time).

### 16.4 Database / migration safety

- **`drizzle-kit check` clean** — no schema drift between Drizzle ORM and database.
- **Full audit of all 47 migrations** (escalated from spec's "last 5" per user request for production-grade rigor). Found 1 P1 issue: `migrations/0011_prompt_generations.sql:11` was missing `IF NOT EXISTS` on `CREATE INDEX`. Theoretical risk only (the `applyMigrations()` runner uses `schema_migrations` table to skip already-applied migrations on re-boot), but matters for partial-restore scenarios. **Fixed inline.** All other 46 migrations are exemplary — consistent `IF NOT EXISTS`, idempotent data mutations, FK columns indexed, dedup-before-unique-index pattern.

### 16.5 Operational readiness

- **RUNBOOK expansion** ([docs/RUNBOOK.md](docs/RUNBOOK.md), gitignored via `*.md`) — appended four sections: schema state + migration audit findings, 5 incident scenarios (DB pool exhaustion, Stripe webhook signature failures, OpenAI/OpenRouter 429, LLM budget exceeded, stuck content jobs), backup-and-restore procedure for Supabase Free, status page placeholder.
- **B8.5 backup drill / B8.6 status page** deferred to user's manual session (requires Supabase staging project + `pg_dump`/`psql` installed locally; Better Stack signup + landing footer edit).

### 16.6 Files

| File                                                                                                    | Change                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/citationChecker.ts`                                                                             | New `addCompetitorDetection` helper exported; in-place mutation replaced; cap warning wired    |
| `tests/unit/competitorDetectionsCap.test.ts`                                                            | NEW. 4 tests covering cap behavior + caller deduplication pattern                              |
| `server/routes/intelligence.ts`                                                                         | `aiLimitMiddleware` applied to `/api/alerts/test/:settingId`                                   |
| `client/src/components/ui/chart.tsx`                                                                    | Safety comment on `dangerouslySetInnerHTML`                                                    |
| `vite.config.ts`                                                                                        | `@sentry/vite-plugin` + `build.sourcemap: 'hidden'`                                            |
| `package.json` + `package-lock.json`                                                                    | `@sentry/vite-plugin` devDependency added                                                      |
| `client/src/components/ErrorBoundary.tsx`, `authStore.ts`, `ShareOfAnswerTab.tsx`, `reset-password.tsx` | 5 `console.*` → `Sentry.captureException`                                                      |
| `server/app.ts`                                                                                         | CSP `'unsafe-inline'` rationale comment                                                        |
| `migrations/0011_prompt_generations.sql`                                                                | `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`                                                  |
| `docs/RUNBOOK.md`                                                                                       | Schema state, migration audit, 5 incident scenarios, backup procedure, status page placeholder |

### 16.7 Verification

- `npm run check` clean. `npm test` 237/237 (233 baseline + 4 new from competitorDetections cap test). 0 lint errors.
- `grep -rE "console\.(log|warn|error|info)" client/src/` returns 0 matches. `server/` matches only the 3 deliberate skip-list files (`log.ts` dev formatter, `aiLogger.ts` LLM tracer, `setupProducts.ts` CLI script).
- Vite prod build verified: source maps generated, no `sourceMappingURL` referenced in shipped JS.
- Drizzle schema and DB agree.

---

## Wave 17 — Phase 1: Onboarding ring + expectations timeline

Two small dashboard-visible wins that immediately answer Ben's "users get lost" and "can't tell when results will come" complaints from the meeting transcript. Builds on Phase 0's clean foundation.

### 17.1 Onboarding ring

- **Single source of truth** — extracted the 4-step `STEPS` array (was inline in [client/src/components/SidebarOnboarding.tsx](client/src/components/SidebarOnboarding.tsx)) into [client/src/lib/onboardingSteps.ts](client/src/lib/onboardingSteps.ts) along with `OnboardingData` type, `isOnboardingComplete(data)`, `completedStepCount(data)`. Eliminates the "two definitions" trap before adding the second consumer.
- **`OnboardingProgressRing` component** at [client/src/components/dashboard/OnboardingProgressRing.tsx](client/src/components/dashboard/OnboardingProgressRing.tsx) reuses the existing `VisibilityGauge` SVG ring. Reads from three TanStack Query caches (`/api/onboarding-status`, `/api/brands`, `/api/articles`); renders skeleton when any is loading; renders nothing when any errors; auto-dismisses + writes localStorage when all 4 steps complete.
- **localStorage scoping** by `user.id` (`venturecite-onboarding-ring-dismissed:${user.id}`) — the existing `clearAllVentureCiteStorage()` from [client/src/lib/clientStorage.ts](client/src/lib/clientStorage.ts) wipes any `venturecite-*` prefixed key on logout, so cross-user-on-shared-browser leak is automatically prevented.
- **Sidebar widget complement** — when complete, [SidebarOnboarding.tsx](client/src/components/SidebarOnboarding.tsx) renders a tiny "✓ Setup complete" condensed trigger instead of the in-progress version. Click still opens the same Dialog with all 4 steps checkmarked (read-only celebration view).
- **4 RTL tests** at [tests/unit/OnboardingProgressRing.test.tsx](tests/unit/OnboardingProgressRing.test.tsx) — skeleton state, partial-data state, auto-dismiss + localStorage write, user.id-scoped dismissal (no cross-account leak).

### 17.2 Expectations timeline

- **`ResultsTimeline` component** at [client/src/components/dashboard/ResultsTimeline.tsx](client/src/components/dashboard/ResultsTimeline.tsx) — static horizontal 4-milestone timeline (Day 0 / Week 1 / Week 2-3 / Week 4+) with current-week highlight derived from `min(brand.createdAt)` for the user. Computes `daysSinceOldest` from `/api/brands` query; clamps to `[0, 365]`; `currentMilestoneIndex` returns 0–3.
- **`EmptyResultsHero` component** at [client/src/components/citations/EmptyResultsHero.tsx](client/src/components/citations/EmptyResultsHero.tsx) — replaces the citations page's generic empty state with the 1–2 week LLM lag explainer. Wired into [ResultsTab.tsx](client/src/components/citations/ResultsTab.tsx) when `totalChecks === 0`. CTA gated by `hasPrompts && !runMutation.isPending` (don't surface "Run a check" when there's nothing to run or one's in flight).
- **Weekly digest email** ([server/emailService.ts](server/emailService.ts) `WeeklyDigestPayload` extended with `weekN: number | null`; [server/lib/weeklyDigestEmitter.ts](server/lib/weeklyDigestEmitter.ts) extends `userBrands.select` with `createdAt`, computes `weekN` from oldest brand, passes to `sendWeeklyDigest`). Email body now reads "Week of X · Week N since you started VentureCite" (uses `weekN + 1` for human-friendly counting).
- **3 RTL tests** at [tests/unit/ResultsTimeline.test.tsx](tests/unit/ResultsTimeline.test.tsx) — correct milestone for 16-day-old brand (Week 2-3), brand-new clamps to Day 0, oldest-brand selection across multiple brands.

### 17.3 Test infrastructure (one-time investment paying off Phase 1+)

- Installed `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `happy-dom` to devDependencies.
- Extended [vitest.config.ts](vitest.config.ts): added `react()` plugin, `.test.tsx` matching, `setupFiles: ["./tests/setup.ts"]`. Server tests stay on `node` env; React component tests opt into `// @vitest-environment happy-dom` per-file pragma.
- New [tests/setup.ts](tests/setup.ts) imports `@testing-library/jest-dom/vitest` matchers and registers global `afterEach(cleanup)` (required because `globals: false` disables RTL's auto-cleanup).

### 17.4 Three deviations fixed inline

After parallel-agent execution, three minor deviations were flagged and fixed:

1. **`SidebarOnboarding.tsx` had both `isComplete` and `complete`** computing the same boolean two ways — collapsed to single `isComplete = isOnboardingComplete(data)`.
2. **Email `weekNLine` styling tokens** were `color:#666;margin:0 0 24px` (per plan) but original line used `color:#6b7280;margin:0 0 20px` — restored original to avoid email-design churn.
3. **`runLoadingMessage` prop on `ResultsTab`** was unused after the empty-state refactor — dropped from the type and from the parent's prop pass at `citations.tsx:561`.

### 17.5 Wouter v3 cleanups (additional)

After Phase 1 finished, two new files used the deprecated Wouter v2 nested-`<a>` pattern (`<Link href="..."><a className="...">...</a></Link>`). On Wouter v3.3.5 this emits console warnings in strict mode. Fixed in `OnboardingProgressRing.tsx` (2 sites) using v3-style `<Link href="..." className="...">children</Link>` directly.

### 17.6 Verification

- `npm run check` clean. `npm test` 244/244 (237 + 7 new RTL tests). 0 lint errors.
- Manual smoke: dashboard renders ring + timeline; new-user account shows "0/4 steps" and "Day 0"; account with all 4 done shows "You're set 🎉" once then auto-dismisses; sidebar widget shows "Setup complete ✓" indicator. Mobile (375px) stacks correctly.

---

## Wave 18 — Phase 2: Per-page explainers + glossary + sidebar reorder

Introduces the most reusable infrastructure of the entire product plan. The `pageExplainers.ts` config becomes a referenceable knowledge base that the upcoming chatbot (Wave 20) imports to ground its answers, and that empty states (later wave) reference for fall-back copy. Single source of truth across many surfaces.

### 18.1 PageHeader extension + GeoConceptBadge

- **`PageHeader.tsx`** ([client/src/components/PageHeader.tsx](client/src/components/PageHeader.tsx)) extended with optional `explainer?: PageExplainer` prop. When present, renders an `(i)` Info icon button next to the title that opens a Radix Popover with summary + optional prerequisites + optional expectedOutcome + optional related-concept badge. Backward-compatible — existing callers without the prop work unchanged.
- **`PageExplainer` type** exported from `PageHeader.tsx`:
  ```ts
  export type PageExplainer = {
    summary: string; // required
    prerequisites?: string;
    expectedOutcome?: string;
    relatedConcept?: "GEO" | "AEO" | "SEO";
  };
  ```
- **`GeoConceptBadge` component** ([client/src/components/GeoConceptBadge.tsx](client/src/components/GeoConceptBadge.tsx)) — inline pill that hover-cards a definition + click-jumps to `/glossary#<concept>` anchor. Uses existing Radix `HoverCard` + `Badge`. Three concepts: GEO, AEO, SEO.

### 18.2 Centralized pageExplainers config + 26-page wiring

- **[client/src/lib/pageExplainers.ts](client/src/lib/pageExplainers.ts)** — single export `pageExplainers` const with explainer entries for all 26 authenticated pages. Adding/editing copy across the app is a one-file edit.
- **26 page files modified** — each gets one `import { pageExplainers } from "@/lib/pageExplainers"` line + one `explainer={pageExplainers.<key>}` prop on its `<PageHeader>` call site (28 total call sites including loading/empty variants on `home.tsx` and `content.tsx`).
- **Why centralized:** chatbot system prompt (Wave 20) will import this same map to keep its answers in sync with what users see in the popovers; empty states (later wave) fall back to `pageExplainers[page].expectedOutcome` for generic copy. Prevents "the popover says X but the chatbot says Y" drift.

### 18.3 Public `/glossary` route

- **[client/src/pages/glossary.tsx](client/src/pages/glossary.tsx)** — public route (no `<AuthenticatedRoute>` wrapper) with three sections: GEO (Generative Engine Optimization), AEO (Answer Engine Optimization), SEO (Search Engine Optimization). Each section: definition, why it matters, how VentureCite covers it, related pages.
- **SEO surface** — inline `useEffect` sets `<title>` and `<meta name="description">` (matches existing codebase pattern, no React Helmet dep). JSON-LD `DefinedTermSet` schema injected via `dangerouslySetInnerHTML` for AI engines + Google rich-results.
- **Lazy-loaded** via render-prop pattern matching the existing `/privacy` route (the only other lazy public route). Avoids loading the glossary code on initial paint for authenticated users.
- **Anchor links** — each section uses `id={term.id}` + `scroll-mt-16` so deep-links (`/glossary#geo`, `/glossary#aeo`, `/glossary#seo`) work. The `GeoConceptBadge` uses these.

### 18.4 Sidebar reorder into workflow sequence

- **[client/src/components/Sidebar.tsx](client/src/components/Sidebar.tsx)** — 5 NAV\_\* arrays restructured into Setup → Create → Measure → Grow → Optimize order:
  - **Setup**: Dashboard, Brands, AI Visibility (moved from Tools — it's a one-time setup checklist, not a tool)
  - **Create**: Content, Articles (moved from Main — it's an output of Create, not Setup), Keywords
  - **Measure**: Citations (moved from Tools), GEO Analytics, AI Intelligence, Reports (moved from Optimize)
  - **Grow**: Community, Opportunities, Competitors
  - **Optimize**: GEO Tools, Signals, Crawler Check, FAQ Manager, Fact Sheet
- **No URL changes** — bookmarks still work. Section labels updated to "Setup / Create / Measure / Grow / Optimize" so the workflow order is communicated at a glance.

### 18.5 Wouter v3 cleanups (additional)

After Phase 2 shipped, the new `glossary.tsx` (Phase 2) and `OnboardingProgressRing.tsx` (Phase 1) used the deprecated Wouter v2 nested-`<a>` pattern. Fixed both via parallel agents — `<Link href="..." className="...">children</Link>` directly. Pre-existing usage in `landing.tsx` left for a project-wide cleanup pass later.

### 18.6 Files (highlights)

| File                                        | Change                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| `client/src/components/PageHeader.tsx`      | Optional `explainer` prop + (i) icon + Popover          |
| `client/src/components/GeoConceptBadge.tsx` | NEW. Inline GEO/AEO/SEO pill with hover-card            |
| `client/src/lib/pageExplainers.ts`          | NEW. 26-page explainer config                           |
| `client/src/pages/glossary.tsx`             | NEW. Public route with JSON-LD                          |
| `client/src/App.tsx`                        | Public `/glossary` route registered                     |
| `client/src/components/Sidebar.tsx`         | NAV\_\* arrays reordered into workflow sequence         |
| 26 page files                               | One `import` + one `explainer={...}` prop addition each |

### 18.7 Verification

- `npm run check` clean. `npm test` 244/244 (no new tests — layout-only per convention). 0 lint errors.
- Manual smoke: every authenticated page has the `(i)` icon next to its title; click → popover with the right copy. Glossary renders publicly with anchor jumps + JSON-LD in DOM. Sidebar shows new workflow grouping.

---

## Wave 19 — Phase 3: Citation locations (highlight + snippet strip + URL extraction)

Self-contained to the citations pages. Directly answers Ben's literal complaint from the meeting: "it didn't tell me where the citations were or what they were."

### 19.1 Brand-mention highlighting

- **Custom rehype plugin** at [client/src/lib/highlightTermsRehype.ts](client/src/lib/highlightTermsRehype.ts) — `createHighlightPlugin(terms): Plugin<[], Root>` factory. Walks hast text nodes (NOT markdown source — that would corrupt links/code blocks); skips text inside `<code>`, `<pre>`, `<a>`. Splits matched text into `[text, mark, text, mark, ...]` and replaces in parent's children.
- **Lookaround word-boundary** — replaced standard `\b` with `(?<![A-Za-z0-9_])(...)(?![A-Za-z0-9_])` because `\b` doesn't match terms ending in non-word chars like "C++" (the `+` is already a non-word char, so there's no "boundary"). Lookaround handles both standard names AND symbol-laden ones.
- **Sanitize schema extended** ([client/src/components/SafeMarkdown.tsx](client/src/components/SafeMarkdown.tsx)) — `defaultSchema.tagNames` extended with `"mark"` so the sanitizer doesn't strip the highlighting tags. `Pluggable[]` type from `unified` used to type the plugin array (mutable, not `as const`, to match React-Markdown's expected shape).
- **Wired through** [PlatformResultCard.tsx](client/src/components/citations/PlatformResultCard.tsx) (new `highlightTerms` prop) and [ResultsTab.tsx](client/src/components/citations/ResultsTab.tsx) + [HistoryTab.tsx](client/src/components/citations/HistoryTab.tsx) (each calls `useBrandSelection()` to derive `highlightTerms = [selectedBrand.name, ...nameVariations]` then passes down).
- **6 unit tests** at [tests/unit/highlightTermsRehype.test.ts](tests/unit/highlightTermsRehype.test.ts) — case-insensitive word-boundary matching, code/link skipping, regex char escaping (C++), longest-first multi-term preference, empty terms no-op, 50-term cap.

### 19.2 "Cited mentions" snippet strip

- **`extractSnippet` helper** at [client/src/lib/extractSnippet.ts](client/src/lib/extractSnippet.ts) — `extractSnippet(text, terms, radius = 200): string`. Returns ±radius chars around the FIRST matching term across all candidates; "…" boundaries when truncated; longest-first term preference; returns leading 2\*radius chars + "…" when no match. Pure function, 6 unit tests.
- **`CitedMentionsStrip` component** at [client/src/components/citations/CitedMentionsStrip.tsx](client/src/components/citations/CitedMentionsStrip.tsx) — horizontal scrollable strip of cards rendered above the per-platform stats card when `totalCited > 0`. Each card: platform pill, truncated prompt, snippet (extracted on the fly from `fullResponse` if available, falling back to saved `citationContext`).
- **Wired into [ResultsTab.tsx](client/src/components/citations/ResultsTab.tsx)** — flattens `results.byPrompt[].platforms[]` into a `CitedMention[]` filtered to `isCited && (fullResponse || snippet)`.

### 19.3 Source URL extraction — schema + extractor + UI

- **Migration `0047_geo_rankings_cited_urls.sql`** — `ALTER TABLE geo_rankings ADD COLUMN IF NOT EXISTS cited_urls TEXT[]`. Backward-compatible (nullable, existing rows stay null).
- **Drizzle schema** ([shared/schema.ts](shared/schema.ts)) — `citedUrls: text("cited_urls").array()` added to `geoRankings`.
- **`extractCitedUrls` server helper** at [server/lib/urlExtractor.ts](server/lib/urlExtractor.ts) — pure function. Captures both markdown links `[text](url)` and plain URLs via single regex; strips trailing punctuation (NOT `?` since URLs commonly end with query strings); validates http/https + hostname-with-dot; dedupe-case-insensitive on hostname + exact on path/search; cap 20 URLs × 2048 chars each. 8 unit tests.
- **Perplexity structured-citations capture** ([server/citationChecker.ts](server/citationChecker.ts)) — discovered during the Task 6 investigation that Perplexity (via OpenRouter) returns a top-level `citations: string[]` field that we were dropping. Now defensively read via `(chatResponse as any).citations`, threaded through `runOne`'s `attemptFetch` helper, and merged with text-extracted URLs at the `createGeoRanking` site (single dedupe + cap pass via the same `extractCitedUrls` call). Other platforms' `structuredCitations: []` collapses to text-only behavior.
- **Cited-URLs pill list** rendered in [PlatformResultCard.tsx](client/src/components/citations/PlatformResultCard.tsx) below the SafeMarkdown content when `result.citedUrls?.length > 0`. Each pill is an `<a target="_blank" rel="noopener noreferrer">` with `hostname` as the visible label and full URL in `title`. The `rel="noopener noreferrer"` is critical — these URLs come from external AI output and must not be allowed to script the parent window or leak referrer.

### 19.4 Files

| File                                                                                        | Change                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `client/src/lib/highlightTermsRehype.ts`                                                    | NEW. Rehype plugin factory                                             |
| `client/src/components/SafeMarkdown.tsx`                                                    | Allow `<mark>` in sanitize schema; type plugins array as `Pluggable[]` |
| `client/src/lib/extractSnippet.ts`                                                          | NEW. Pure function for snippet extraction                              |
| `client/src/components/citations/CitedMentionsStrip.tsx`                                    | NEW. Horizontal scrollable strip                                       |
| `client/src/components/citations/PlatformResultCard.tsx`                                    | `highlightTerms` prop + `citedUrls` rendering                          |
| `client/src/components/citations/ResultsTab.tsx`                                            | `useBrandSelection`-derived highlightTerms + `<CitedMentionsStrip>`    |
| `client/src/components/citations/HistoryTab.tsx`                                            | Same `highlightTerms` wiring                                           |
| `server/lib/urlExtractor.ts`                                                                | NEW. Pure function for URL extraction                                  |
| `server/citationChecker.ts`                                                                 | Capture Perplexity structured citations + merge + write `citedUrls`    |
| `shared/schema.ts`                                                                          | `citedUrls: text("cited_urls").array()` on `geoRankings`               |
| `migrations/0047_geo_rankings_cited_urls.sql`                                               | NEW. Idempotent column add                                             |
| `tests/unit/highlightTermsRehype.test.ts`, `extractSnippet.test.ts`, `urlExtractor.test.ts` | NEW. 6 + 6 + 8 = 20 unit tests                                         |

### 19.5 Verification

- `npm run check` clean. `npm test` 264/264 (244 + 20 new). 0 lint errors. `drizzle-kit check` "Everything's fine".
- Per-write CPU cost: <5 ms additional per `geo_rankings` INSERT (regex + URL parsing). Negligible vs. the 2–10s the LLM call took.
- DB storage long-term: ~20 MB at 100x current scale. Supabase Free 500 MB still safe through pre-launch.

### 19.6 Out of scope (for follow-ups)

- Backfilling `cited_urls` for pre-migration rows — only new citation runs from this point onward populate the column. Old rows render without the pill list section.
- Pulling page titles (only hostnames render in pills) — would require a separate fetch per URL, expensive.
- Filtering URL list to "authoritative" sources — every URL the LLM cited is rendered; quality scoring is separate.
- "Click strip card → scroll-to-accordion-row" interaction — `CitedMentionsStrip` supports the `onClick` prop but it's left unwired in `ResultsTab` for now.

---

## Wave 20 — Phase 4: Recommendations Engine (A6)

**Status:** Complete
**Date:** 2026-05-04

### 20.1 What was built

**Pure rules engine** at [server/lib/recommendationsEngine.ts](server/lib/recommendationsEngine.ts) — `getRecommendations(state: RecommendationState): Recommendation[]`. 11 deterministic rules (P0/P1/P2), output capped at 5, P0 first. Zero side effects, zero LLM cost per pageview.

**Endpoint** `GET /api/brands/:brandId/recommendations` added to [server/routes/dashboard.ts](server/routes/dashboard.ts) — loads 6 data points via `Promise.all`, calls engine, returns `{ success: true, data: recommendations }`. Typical latency 50–100 ms.

**`RecommendationsPanel` component** at [client/src/components/dashboard/RecommendationsPanel.tsx](client/src/components/dashboard/RecommendationsPanel.tsx) — P0 cards (red accent, not dismissible), P1 cards (amber, 7-day soft-hide), P2 cards (subtle, dismissible). Dismiss state keyed by `venturecite-recs-dismissed:${user.id}`.

**Mounted** in [client/src/pages/home.tsx](client/src/pages/home.tsx) below `OnboardingProgressRing` and `ResultsTimeline`.

### 20.2 Type contracts

```ts
type RecommendationPriority = "P0" | "P1" | "P2";
type RecommendationCategory = "setup" | "content" | "citations" | "signals" | "growth";
type Recommendation = {
  id: string;
  title: string;
  why: string;
  ctaLabel: string;
  ctaHref: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  dismissible: boolean;
};
```

### 20.3 Files

| File                                                       | Change                                         |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `server/lib/recommendationsEngine.ts`                      | NEW. Pure rules engine                         |
| `server/routes/dashboard.ts`                               | Added GET /api/brands/:brandId/recommendations |
| `client/src/components/dashboard/RecommendationsPanel.tsx` | NEW. Panel component                           |
| `client/src/pages/home.tsx`                                | Mount RecommendationsPanel                     |
| `tests/unit/recommendationsEngine.test.ts`                 | NEW. 6 unit tests                              |

### 20.4 Verification

- `npm run check` clean. `npm test` 274/274. 0 lint errors.
- Vercel Hobby: one new endpoint in existing function, no new function/cron/env var.

---

## Wave 21 — Phase 5: Chatbot / Education Assistant (A1)

**Status:** Complete
**Date:** 2026-05-04

### 21.1 What was built (3 PRs)

**PR 5.1 — Production baseline:** Migration, schema, OpenRouter client, knowledge base, budget system, storage layer, `POST /api/assistant/chat` endpoint (JSON response), `EducationAssistant` floating bubble, daily cron prune step.

**PR 5.2 — SSE streaming:** Endpoint converted to Server-Sent Events (heartbeat every 15s, `req.on("close")` abort handling). Client uses `fetch + ReadableStream + TextDecoder`. Partial content persisted on stream abort. Validation/budget errors stay as JSON 4xx (before `flushHeaders()`).

**PR 5.3 — Brand-aware context:** When `brandId` in request body, brand summary loaded in parallel with history and injected as a second system message AFTER the cached `SYSTEM_PROMPT` (preserves Anthropic prompt cache). Cache-control on index 0 only.

### 21.2 New persistence

| Table                 | Bounded by                                       |
| --------------------- | ------------------------------------------------ |
| `chatbot_messages`    | 30-day TTL + 100 msgs/user soft cap (daily cron) |
| `chatbot_token_usage` | One row per user-per-day                         |

### 21.3 Rate limits / caps (per `server/lib/llmPricing.ts`)

| Tier       | Tokens/day | Messages/hour |
| ---------- | ---------- | ------------- |
| Free       | 15,000     | 20            |
| Pro        | 75,000     | 60            |
| Enterprise | 250,000    | 120           |

### 21.4 Key design decisions

- OpenAI SDK pointed at OpenRouter (`baseURL: "https://openrouter.ai/api/v1"`), model `anthropic/claude-sonnet-4.5`
- System prompt (~3,500 tokens) uses `cache_control: { type: "ephemeral" }` — 90% discount on cache hits
- Last 10 messages only (bounds context, prevents runaway cost)
- Persist user message BEFORE OpenRouter call (preserves message on timeout)
- 1 retry on 5xx/429 from OpenRouter (1s backoff)
- Budget exceeded → 429 `{ code: "budget_exceeded", error: "..." }` (JSON, not SSE)
- Stream abort → persist accumulated content, no Sentry event (abort is normal)
- localStorage key `venturecite-chatbot-history:${user.id}` (auto-cleared on logout via `clearAllVentureCiteStorage()`)

### 21.5 Files

| File                                           | Change                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `migrations/0048_chatbot_messages.sql`         | NEW. chatbot_messages + chatbot_token_usage                                     |
| `shared/schema.ts`                             | chatbotMessages + chatbotTokenUsage tables                                      |
| `server/lib/llmPricing.ts`                     | CHATBOT_DAILY_TOKEN_CAP, CHATBOT_MESSAGES_PER_HOUR, Sonnet 4.5 pricing          |
| `server/lib/openrouterClient.ts`               | NEW. Lazy singleton OpenAI-SDK client for OpenRouter                            |
| `server/lib/chatbotKnowledge.ts`               | NEW. ~3,500-token GEO/AEO/SEO SYSTEM_PROMPT                                     |
| `server/lib/chatbotBudget.ts`                  | NEW. tokensUsedToday, messagesLastHour, assertChatbotBudget, recordChatbotUsage |
| `server/storage.ts`                            | getChatbotHistory, insertChatbotMessage, pruneChatbotMessages interfaces        |
| `server/databaseStorage.ts`                    | Implementations (30-day TTL + 100-msg cap via raw SQL)                          |
| `server/routes/assistant.ts`                   | NEW. POST /api/assistant/chat (SSE after PR 5.2, brand-aware after PR 5.3)      |
| `server/routes.ts`                             | setupAssistantRoutes(app) call                                                  |
| `server/routes/cron.ts`                        | chatbot-prune step (5,000 ms cap)                                               |
| `server/env.ts`                                | OPENROUTER_API_KEY doc comment (required at runtime)                            |
| `client/src/components/EducationAssistant.tsx` | NEW. Floating bubble → Sheet, SSE streaming, localStorage hydration             |
| `client/src/components/AppLayout.tsx`          | Mount EducationAssistant                                                        |
| `tests/unit/chatbotBudget.test.ts`             | NEW. 3 tests                                                                    |
| `tests/unit/assistantChat.test.ts`             | NEW. 6 tests                                                                    |
| `tests/unit/EducationAssistant.test.tsx`       | NEW. 6 tests                                                                    |
| `tests/unit/cronOrchestrator.test.ts`          | Added pruneChatbotMessages stub                                                 |

### 21.6 Verification

- `npm run check` clean. `npm test` 289/289. 0 lint errors.
- New env var: `OPENROUTER_API_KEY` (required at runtime for chatbot)
- Vercel Hobby: one new endpoint + one cron step, no new function/cron entry.

---

## Wave 22 — Phase 6: Empty / Skeleton / Error States (C1+C2+C3)

**Status:** Complete
**Date:** 2026-05-04

### 22.1 What was built (2 PRs)

**PR 6.1 — Shared infrastructure + top 5 pages:**
Three new shared components, then applied to `/dashboard`, `/citations`, `/articles`, `/content`, `/brands`.

**PR 6.2 — Remaining 23 pages:**
Mechanical sweep: `agent-dashboard`, `agent-run`, `ai-intelligence`, `ai-traffic`, `ai-visibility`, `analytics-integrations`, `brand-fact-sheet`, `client-reports`, `community-engagement`, `competitors`, `crawler-check`, `faq-manager`, `geo-analytics`, `geo-opportunities`, `geo-rankings`, `geo-signals`, `geo-tools`, `keyword-research`, `outreach`, `publication-intelligence`, `revenue-analytics`, `settings`, `welcome`.

### 22.2 New shared components

**[client/src/components/ui/empty-state.tsx](client/src/components/ui/empty-state.tsx)** — `EmptyState` — card with optional icon, title, description, primary action, secondary action. Consistent center-aligned layout matching existing `EmptyResultsHero` style.

**[client/src/components/ui/error-state.tsx](client/src/components/ui/error-state.tsx)** — `ErrorState` — card with red-tinted icon, title, description, retry button (spins while `isRetrying`). `onRetry` is mandatory — forces every caller to wire refetch.

**[client/src/lib/queryStates.ts](client/src/lib/queryStates.ts)** — `renderQueryState<T>()` — centralises the `isLoading → isError → isEmpty → data` branch pattern for future use.

### 22.3 Pattern applied per page

1. Destructure `isError`, `isRefetching`, `refetch` from existing `useQuery` calls.
2. Add `<ErrorState>` with `onRetry` wired to `refetch` and contextual title.
3. Replace inline empty cards with `<EmptyState>` — copy ported verbatim, CTAs preserved.

Conservative skips (queries in subcomponents, mutation-driven flows, static pages with bespoke error UX): `ai-intelligence`, `ai-visibility`, `analytics-integrations`, `crawler-check`, `geo-signals`, `publication-intelligence`, `welcome`.

### 22.4 Files

| File                                       | Change                                                             |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `client/src/components/ui/empty-state.tsx` | NEW                                                                |
| `client/src/components/ui/error-state.tsx` | NEW                                                                |
| `client/src/lib/queryStates.ts`            | NEW                                                                |
| ~22 page files                             | `ErrorState` + `EmptyState` wired per page (see per-agent reports) |

### 22.5 Verification

- `npm run check` clean. `npm test` 289/289 (no new tests at this layer per spec). 0 lint errors.
- No server changes. No new env vars. No new migrations. Bundle delta: ~+13 KB.
- Vercel Hobby: entirely client-side. No impact.

---

## Wave 23 — Phase 5 v2: Chatbot Multi-Thread Redesign + Anti-Hallucination

**Goal:** Make the AI Tutor production-ready: separate chat threads (ChatGPT-style), branded UI, accurate persona, no hallucinated UI labels or stats.

**Status:** Complete

### 23.1 Background

Phase 5 v1 shipped a single-bucket chat: every message lived in one `chatbot_messages` table scoped to `userId`. "New chat" hard-deleted everything. Users couldn't see, resume, or browse past conversations. The bot also drifted off-persona on its first message, hallucinated UI labels ("Edit Fact Sheet button", "Add Question modal"), invented brand stats (transaction volumes, customer counts), and misrepresented what each VentureCite page does.

This wave fixed all of it end-to-end: data model, server API, client architecture, system prompt, brand-switch behavior.

### 23.2 Auth bug fix (precursor)

Before redesign, the chatbot was returning 401 on every send. Root cause: `EducationAssistant.tsx` used raw `fetch()` with `credentials: "include"` instead of attaching the Supabase JWT via `Authorization: Bearer` header. Per `CLAUDE.md`, this app authenticates via JWT — no cookies. Replaced with `getAccessToken()` + manual Bearer attachment (can't use `apiRequest()` because it consumes the response body, breaking SSE streaming).

### 23.3 Data model

**[migrations/0049_chatbot_threads.sql](migrations/0049_chatbot_threads.sql)** — additive, idempotent:

```sql
CREATE TABLE chatbot_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id    VARCHAR REFERENCES brands(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
ALTER TABLE chatbot_messages ADD COLUMN thread_id UUID NOT NULL
  REFERENCES chatbot_threads(id) ON DELETE CASCADE;
```

Backfill: each existing user gets one "Earlier conversation" thread carrying all their pre-existing messages. No history lost. The `ALTER ... SET NOT NULL` runs _after_ backfill so the migration is safe to apply on data.

Indexes: `(user_id, updated_at desc)` partial WHERE `archived_at is null` for the threads list; `(thread_id, created_at)` for transcript fetches; partial WHERE `archived_at is not null` for the prune job.

Soft-delete via `archived_at`. Nightly prune (extended in `pruneChatbotMessages`) hard-deletes threads archived > 30 days. Messages still respect the existing 30-day TTL.

### 23.4 Server API (six endpoints)

**[server/routes/assistant.ts](server/routes/assistant.ts)** — fully rewritten:

| Method   | Path                                  | Purpose                                                |
| -------- | ------------------------------------- | ------------------------------------------------------ |
| `GET`    | `/api/assistant/threads`              | List user's non-archived threads, newest-active first. |
| `POST`   | `/api/assistant/threads`              | Create empty thread (`{brandId?}`).                    |
| `GET`    | `/api/assistant/threads/:id/messages` | Transcript of one thread.                              |
| `DELETE` | `/api/assistant/threads/:id`          | Soft-archive (sets `archived_at = now()`).             |
| `POST`   | `/api/assistant/threads/:id/restore`  | Un-archive (clears `archived_at`).                     |
| `POST`   | `/api/assistant/chat`                 | SSE chat — now requires `threadId` in body.            |

All endpoints behind `isAuthenticated`. Thread endpoints enforce ownership via new `requireChatbotThread(id, userId)` helper in [server/lib/ownership.ts](server/lib/ownership.ts) — returns 404 (not 403) on miss per the project's anti-enumeration policy.

**Auto-titling:** when a chat send hits a thread whose title is still `"New chat"`, the server sets the title to `truncate(firstUserMessage, 60)`. Free, deterministic, no second LLM call. Future upgrade: swap to a 1-call summarizer for nicer titles.

**Touch-on-write:** every message insert calls `touchChatbotThread(threadId)` to bump `updated_at`. Drives the sort order in the history view.

**Removed:** legacy `GET /api/assistant/history` and `DELETE /api/assistant/history` (replaced by thread endpoints). One-shot release; no compat shim needed since chatbot is internal-only at this stage.

### 23.5 Storage layer

**[server/databaseStorage.ts](server/databaseStorage.ts)** — eight new methods on `IStorage`:

```ts
listChatbotThreads(userId, limit=50): Promise<Array<ChatbotThread & {messageCount: number}>>
getChatbotThread(threadId): Promise<ChatbotThread | undefined>
createChatbotThread(userId, brandId?): Promise<ChatbotThread>
archiveChatbotThread(threadId): Promise<void>
restoreChatbotThread(threadId): Promise<void>
setChatbotThreadTitle(threadId, title): Promise<void>
touchChatbotThread(threadId): Promise<void>
getChatbotThreadMessages(threadId, limit=200): Promise<ChatbotMessage[]>
```

`insertChatbotMessage()` signature now requires `threadId`. `getChatbotHistory(userId)` deleted — chat handler reads thread-scoped history via `getChatbotThreadMessages(threadId, 11)`. This means past sessions in _other_ threads no longer bleed into the current prompt — fixed the "bot greets twice because it sees old hi" bug observed in v1.

### 23.6 Client architecture

**New hook [client/src/hooks/useChatbot.ts](client/src/hooks/useChatbot.ts)** — single source of truth for chatbot data layer. Owns:

- `threads` list (TanStack Query, key `["/api/assistant/threads"]`).
- `activeThreadId` + auto-selects most recent thread on first open.
- `messages` for the active thread (TanStack Query, key `["/api/assistant/threads", id, "messages"]`).
- `send(text)` — handles thread auto-creation if none active, attaches Bearer JWT, streams SSE deltas with `AbortController` cancellation.
- `stop()` — aborts in-flight stream.
- `regenerate()` — drops last assistant message, resends last user message.
- `newChat()` / `archiveThread` / `restoreThread` mutations with cache invalidation.
- `brandSwitchNotice` — surfaces when user changes app-level brand mid-thread.

**New components under [client/src/components/chatbot/](client/src/components/chatbot/):**

- **`MessageBubble.tsx`** — user (right-aligned, primary tint) vs assistant (left-aligned, bot avatar, prose markdown). Hover-revealed Copy + Regenerate actions on assistant bubbles. Streaming cursor (`▍`) at end of in-flight response.
- **`WelcomeState.tsx`** — branded greeting card + 2×2 starter grid (Concepts / How-to / Troubleshoot / Strategy).
- **`HistoryView.tsx`** — past conversations list. Each row: title + relative time + message count. Active thread marked with check icon. Hover-revealed archive button. 5s undo toast on archive.

**Shell [client/src/components/EducationAssistant.tsx](client/src/components/EducationAssistant.tsx)** — Sheet + view switcher (`thread` ↔ `history`) + header with active-thread chip + brand chip + ⋮ menu (New chat / Conversation history / Archive this chat). Composer is auto-grow textarea with char counter, Send button morphs into Stop button while streaming. Enter to send, Shift+Enter for newline.

**LocalStorage cache dropped.** Server is the source of truth — multi-device safer, no sync conflicts.

### 23.7 UI/UX flows

**A. First-time user:** opens panel → `GET /threads` returns `[]` → welcome state shows. First send creates a thread implicitly via `POST /threads` then `POST /chat`.

**B. Returning user:** opens panel → most recent thread auto-loads → transcript hydrates from server.

**C. New chat:** ⋮ → "New chat" → `POST /threads` → transcript clears → composer focuses. Previous thread preserved untouched.

**D. Resume old chat:** ⋮ → "Conversation history" → list view → click any row → switch to that thread.

**E. Archive:** trash icon on row → `DELETE /threads/:id` → animates out → 5s undo toast. Click Undo → `POST /threads/:id/restore`.

**F. Brand switch:** if user changes app-level brand AND active thread has messages under a different `brandId`, hook detaches the thread (so next send creates a fresh one under the new brand) and shows a sparkle-tinted notice in the panel: _"Brand changed — your next message will start a new chat."_ Empty/just-created threads aren't disturbed.

### 23.8 Persona + anti-hallucination work

**[server/lib/chatbotKnowledge.ts](server/lib/chatbotKnowledge.ts)** — system prompt rewritten over the course of the wave to fix three classes of bug surfaced during user testing:

**Bug class 1 — Greeting on real questions.** Bot was greeting on "How do I get started?" because the v1 first-message rule was loose. Tightened to a strict whitelist of bare openers ("hi", "hello", "help", "who are you" etc.). Anything else, including "how do I get started", must answer directly. Even if past history shows greetings were given, the bot must not repeat one on a non-opener message.

**Bug class 2 — Fabricated UI.** Bot invented buttons ("Edit Fact Sheet"), modals ("Add Question dialog"), and step-by-step click sequences that don't exist in the current UI. Fix: explicit `# Anti-hallucination rule (CRITICAL)` section forbidding invention of:

- Button labels, link text, CTA copy
- Section/tab/modal/accordion titles
- Field/toggle/dropdown/column names
- Brand stats (transaction volume, customer count, founding year, HQ) unless in the brand context block
- Specific feature flows not described in the prompt itself

Replacement guidance: describe outcomes at the page level ("Open the FAQ Manager and add the Q&As your customers ask"), never click sequences. If asked for exact buttons: "I can point you to the right page — the current UI is best seen by opening it."

**Bug class 3 — Page-list drift.** v1's page list was wrong on multiple fronts: AI Visibility was described as a "fact-sheet/FAQ/schema checklist" (it's actually per-engine optimization steps), several real sidebar items (Keywords, Reports, Opportunities, GEO Tools, Crawler Check) were missing, and a fictional "Settings" entry was hallucinated into the list. Fix: cross-checked against [client/src/components/Sidebar.tsx](client/src/components/Sidebar.tsx) verbatim. The prompt's `# VentureCite sidebar — exhaustive page list` now matches the real 18-item sidebar exactly. Each entry has an accurate one-line description. Account/billing settings are explicitly noted as living in a user-menu dropdown, not the sidebar.

**Removed unverifiable specifics:** no more "20%+ citation rate target", no more rigid "Week 1 / Week 2 / Week 4" timeline, no more "5–10 articles, 10–20 prompts" rigid counts. Reframed as directional principles tuned to user situation.

### 23.9 Tests

| File                                                                             | Status  | Coverage                                                                                                                     |
| -------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [tests/unit/chatbotThreads.test.ts](tests/unit/chatbotThreads.test.ts)           | NEW     | 6 tests — list/create/messages/archive/restore + 404 on bad UUID + ownership                                                 |
| [tests/unit/assistantChat.test.ts](tests/unit/assistantChat.test.ts)             | UPDATED | All requests now pass `threadId`; new ownership + storage mocks added                                                        |
| [tests/unit/EducationAssistant.test.tsx](tests/unit/EducationAssistant.test.tsx) | UPDATED | Welcome flow, thread creation on first send, budget exceeded card, auto-load most recent thread, Stop button while streaming |

Final: **294/294 tests pass. Typecheck clean.**

### 23.10 Files changed

**Server:**

- [migrations/0049_chatbot_threads.sql](migrations/0049_chatbot_threads.sql) — NEW
- [shared/schema.ts](shared/schema.ts) — `chatbotThreads` table + `threadId` FK on `chatbotMessages`
- [server/storage.ts](server/storage.ts) — `IStorage` thread interface
- [server/databaseStorage.ts](server/databaseStorage.ts) — 8 new methods, `pruneChatbotMessages` extended
- [server/lib/ownership.ts](server/lib/ownership.ts) — `requireChatbotThread`
- [server/routes/assistant.ts](server/routes/assistant.ts) — full rewrite with 6 endpoints
- [server/lib/chatbotKnowledge.ts](server/lib/chatbotKnowledge.ts) — system prompt rewritten

**Client:**

- [client/src/hooks/useChatbot.ts](client/src/hooks/useChatbot.ts) — NEW
- [client/src/components/chatbot/MessageBubble.tsx](client/src/components/chatbot/MessageBubble.tsx) — NEW
- [client/src/components/chatbot/WelcomeState.tsx](client/src/components/chatbot/WelcomeState.tsx) — NEW
- [client/src/components/chatbot/HistoryView.tsx](client/src/components/chatbot/HistoryView.tsx) — NEW
- [client/src/components/EducationAssistant.tsx](client/src/components/EducationAssistant.tsx) — full rewrite as shell

**Tests:**

- [tests/unit/chatbotThreads.test.ts](tests/unit/chatbotThreads.test.ts) — NEW
- [tests/unit/assistantChat.test.ts](tests/unit/assistantChat.test.ts) — updated
- [tests/unit/EducationAssistant.test.tsx](tests/unit/EducationAssistant.test.tsx) — updated

### 23.11 Production characteristics

- **Migration safety:** additive table + column, idempotent backfill. Worst-case rollback drops the new table + column; messages remain intact.
- **Cost:** zero additional LLM calls per message (title via truncation). One extra Postgres write per chat (`touchChatbotThread`). Negligible.
- **Bundle:** ~+10 KB for the new components + hook.
- **A11y:** transcript has `role="log" aria-live="polite"`. History list is `role="listbox"` with `aria-selected` per row. All buttons labeled. Tooltips on Send/Stop. 44px touch targets.
- **Mobile:** safe-area padding on composer. Auto-focus textarea on open. Auto-scroll to bottom on new content.
- **Multi-device:** server is the source of truth. No localStorage cache to conflict.

### 23.12 Deliberate non-goals

- ❌ Thread search (Cmd+K). Defer until users have >20 threads on average.
- ❌ Thread renaming UI. Auto-titles are good enough for v1.
- ❌ Multi-device sync notifications. Server is SoT; eventual-consistency is fine.
- ❌ Exporting threads. Defer.
- ❌ Pinned/starred threads. YAGNI.
- ❌ LLM-generated titles. Truncation is good enough; revisit when UX demands it.

---

## Track 24 — Mentions Tab post-rebuild fixes (2026-05-05)

**Goal:** Stabilise the rebuilt Mentions feature after first round of real-user testing. Address Reddit query failures, Quora bot-blocking, broken UI controls, removal of half-working features, and a cross-machine clock-skew bug that made every relative timestamp display "about 6 hours ago".

**Status:** Complete

### 24.1 Reddit — HTTP 414 fix and per-variation looping

**Problem.** Public-path Reddit search returned `414 URI Too Long` for any brand with two or more name variations. The query string concatenated all variations into one Lucene expression — `(title:"X" OR selftext:"X" OR title:"Y" OR selftext:"Y" ...)` — which after URL-encoding exceeded Reddit's ~2 KB cap on `/search.json`. RSS fallback hit the same limit. Result: `reddit: { found: 0, failed: true, reason: "414 (public + rss both blocked)" }` for every multi-variation brand on the unauthenticated path.

**Fix.** Split the public path into one HTTP request per variation, preserving field-scoped Lucene syntax (`(title:"<variation>" OR selftext:"<variation>")`) — short, precise, and well under the URL limit. Stop iterating as soon as any variation returns matching mentions (no point spending more requests when we already have data). Hard cap at 100 mentions per scan as a safety net.

| File                                 | Change                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/sources/redditSource.ts` | Replaced single-call `scanViaPublic` with a per-variation loop. Per-variation rate-limit acquire (matches HN/Quora pattern). Stop-on-first-hit. `MAX_PUBLIC_MENTIONS = 100` enforced at every accumulation point. RSS fallback runs per variation. Failure surfaced only when every variation's JSON + RSS returned non-OK. |

**OAuth path unchanged.** The OAuth host (`oauth.reddit.com`) accepts longer queries, and credentials avoid the IP-banning that motivated the fallback chain in the first place.

### 24.2 Quora — removed from the Mentions feature

**Problem.** Cloudflare blocks unauthenticated headless Chromium at the WAF layer (`pageTitle: "Just a moment..."` / `"Performing security verification"`). On the rare requests that get through, Quora serves the logged-out landing page with a "Sign in to continue" overlay instead of search results. Diagnostic logging (`quora.variation_diagnostics`) confirmed `rawLinks: 0` across both bot-challenge and login-wall paths — there is nothing to scrape without an authenticated session, which is fragile (cookies expire) and arguably ToS-violating.

**Decision.** Remove Quora from the Mentions feature surface. Reddit + HN cover the bulk of brand-discussion volume; spending engineering time fighting Cloudflare to recover a low-yield third source is not worth it.

| File                                                   | Change                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/lib/mentionScanner.ts`                         | Removed `quora` from `ScanReport.perSource`, removed Quora dispatch block, removed Quora from totals aggregation. Removed `normalizeEngagement` import (see 24.3). |
| `client/src/components/geo-tools/ScanStatusPanel.tsx`  | Dropped `quora` from `SOURCES` array and `SOURCE_LABELS`. Updated 3-fail banner copy to "Reddit/HN paused — check status below."                                   |
| `client/src/components/geo-tools/MentionsFilters.tsx`  | Removed Quora platform filter option.                                                                                                                              |
| `client/src/components/geo-tools/AddMentionDialog.tsx` | Removed Quora from manual-add platform dropdown and helper text.                                                                                                   |

**Intentionally not removed.** The DB column `MentionPlatform` type union still includes `"quora"` — historical mention rows in the DB still resolve. The orphaned `server/lib/sources/quoraSource.ts`, `tests/unit/quoraSource.test.ts`, and Quora references elsewhere in the codebase (citation checker, recommendation engine, glossary) are inert for the Mentions feature and unrelated to brand-mention scanning. Safe to delete in a separate cleanup pass.

### 24.3 Engagement score — removed from the Mentions UI

**Problem.** The 0–100 engagement score (Reddit: `log10(ups + comments * 2 + 1) * 25`, HN similar, Quora null) added complexity without delivering insight. Users could not act on it and the value distribution was bimodal (lots of zeros, a few high outliers).

**Fix.** Removed engagement display from card and detail-sheet UI. New mention rows are written with NULL `engagement_score` / `engagement_normalized`. The DB columns and `EngagementDisplay` React component are left in place to avoid a migration and to keep historical rows readable.

| File                                                     | Change                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/mentionScanner.ts`                           | Removed `engagementScore` / `engagementNormalized` writes from `tryInsertBrandMention` payload. Removed `normalizeEngagement` import. |
| `client/src/components/geo-tools/MentionCard.tsx`        | Removed `EngagementDisplay` from desktop and mobile layouts.                                                                          |
| `client/src/components/geo-tools/MentionDetailSheet.tsx` | Removed engagement metadata row (both normalized and raw paths).                                                                      |

### 24.4 Universal clock-skew fix — server-anchored relative time

**Problem.** Every mention card and the "Last scan" panel displayed "about 6 hours ago" the moment they were inserted, even on a fresh scan. Investigation traced the issue across three independent layers:

1. The `pg` driver parses `TIMESTAMP WITHOUT TIME ZONE` columns by interpreting the wall-clock string in the **Node process's local timezone**, not UTC. On a misconfigured host, a row written via `defaultNow()` (Postgres `now()` is UTC) and read back through `pg` produces a JS `Date` that's hours off.
2. The DB host's `now()` was returning a UTC value 5–6 hours behind real UTC, independently of the pg parser issue. Tables that relied on `defaultNow()` inserted timestamps that were already wrong on disk.
3. Even with both fixed, the client's `formatDistanceToNow(new Date(row.discoveredAt))` is sensitive to drift between DB host, Node host, and browser.

**Fix attempts that proved insufficient:**

- Added `pgTypes.setTypeParser(1114, val => new Date(val + "Z"))` in `server/db.ts` to force UTC parsing of timestamp columns. Helps for new reads but doesn't fix DB-host clock drift.
- Switched `createScanJob` and `tryInsertBrandMention` to write `createdAt` / `discoveredAt` from `new Date()` on the Node side instead of relying on Postgres `defaultNow()`. Helps when the Node clock is correct but breaks if Node and DB disagree.

**Final fix — server-anchored age in the response.** The only stable measurement is "how long ago did **this** server perceive this event," which cancels out skew between machines. On every Mentions API response that carries a user-visible relative timestamp, the server attaches `<field>AgeSeconds` computed as `Date.now() - row.timestamp.getTime()` on the request handler. The client renders relative-time labels from `ageSeconds` directly — `new Date()` anchoring on the browser is no longer in the codepath.

| File                                                  | Change                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/db.ts`                                        | Added `pgTypes.setTypeParser(1114, val => new Date(val + "Z"))` to force UTC parsing of every `TIMESTAMP WITHOUT TIME ZONE` column at the wire level.                                                                                                                                                 |
| `server/databaseStorage.ts`                           | `createScanJob` writes `createdAt: new Date()` explicitly. `tryInsertBrandMention` and `createBrandMention` default `discoveredAt` to `new Date()` if not provided.                                                                                                                                   |
| `server/routes/mentions.ts`                           | Added `ageSeconds()` and `withAge()` helpers. Wired into `GET /:brandId` (adds `discoveredAtAgeSeconds`, `mentionedAtAgeSeconds`, `lastVerifiedAtAgeSeconds`), `GET /scans/active`, and `GET /scans/last/:brandId` (each adds `startedAtAgeSeconds`, `completedAtAgeSeconds`, `createdAtAgeSeconds`). |
| `client/src/components/geo-tools/MentionCard.tsx`     | Added `formatAgeSeconds()` helper. Reads `discoveredAtAgeSeconds` from the row and renders via that helper. Falls back to `formatDistanceToNow` if the field is absent.                                                                                                                               |
| `client/src/components/geo-tools/ScanStatusPanel.tsx` | Same `formatAgeSeconds()` helper. "Last scan" line now reads `completedAtAgeSeconds ?? createdAtAgeSeconds` from the scan job.                                                                                                                                                                        |

**Why this is universal.** The browser's `Date.now()` is no longer used for relative time, the DB clock is no longer used for relative time, and the only clock that matters is the server's own — which has been working fine for every other feature. Absolute date displays (the detail sheet's "Mentioned: 28 April 2026") still pass through the original ISO string, so dates render normally.

### 24.5 Daily auto-scan toggle — wrong endpoint

**Problem.** Toggling "Daily auto-scan" did nothing. The switch flipped briefly then reverted. `handleToggleMonitor` was PATCHing `/api/brands/:brandId` with `{ monitorMentions: enabled }`, but the brands route does not accept that field — silent no-op. The local cache was also not invalidated, so the UI kept showing the old (false) value even if the write had succeeded.

**Fix.**

| File                                              | Change                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/geo-tools/MentionsTab.tsx` | Toggle now PATCHes the dedicated `/api/brand-mentions/brands/:brandId/monitor-mentions` endpoint with `{ enabled }`. Added `useQueryClient()` and `await queryClient.invalidateQueries({ queryKey: ["/api/brands"] })` after the write so the cached brand row re-fetches and the switch reflects the new state. |

### 24.6 "+ Add variation" — no-op handler

**Problem.** The "+ add variation" link inside the Searching-for line on the Scan Status panel did nothing. The `onAddVariation` prop was wired to `() => { /* lives in the brand settings page */ }` — a stub.

**Fix.**

| File                                              | Change                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/geo-tools/MentionsTab.tsx` | `onAddVariation` now calls `setLocation("/brands")` to navigate to the brands page where the name-variations editor lives. |

### 24.7 Reddit query — 100-mention cap and stop-on-hit

**Decision.** Stop iterating Reddit variations at the first one that returns mentions, and never accumulate beyond 100 mentions in a single scan. Avoids burning rate-limit tokens and keeps response times bounded.

| File                                 | Change                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/sources/redditSource.ts` | `MAX_PUBLIC_MENTIONS = 100`. Loop breaks when `seen.size >= MAX_PUBLIC_MENTIONS` or when any variation produced ≥ 1 mention. |

### 24.8 Quora diagnostic logging (then removed)

Before the decision to drop Quora, added a `quora.variation_diagnostics` log line to distinguish login-wall (zero raw links + login-wall body markers) from gate-rejection (many raw links, none pass brand presence). The diagnostic confirmed Cloudflare bot-challenge and login-wall responses were the actual blockers, leading to the 24.2 decision. Logging code remains in `quoraSource.ts` for now since the file is orphaned.

### How to verify

1. **Reddit no longer 414s.** Run a manual scan on any brand with ≥ 2 name variations. `scan.complete` log line should show `reddit: { found: N, failed: false }` rather than `414`.
2. **Quora is gone.** Mentions tab shows only Reddit and HN chips on the scan-status panel. Platform filter dropdown has only Reddit and Hacker News. Manual-add dialog has only Reddit and Hacker News.
3. **Engagement score is gone.** Mention cards no longer show the 0/100 progress bar. Detail sheet has no Engagement row.
4. **Relative time is correct.** Run a fresh scan. New mention cards display "just now" / "1 minute ago", not "about 6 hours ago." Inspect the API response at `/api/brand-mentions/<brandId>` — every row carries `discoveredAtAgeSeconds: <small-number>`.
5. **Daily auto-scan toggle persists.** Click the switch on the Scan Status panel. Page → reload → state matches what you set.
6. **+ add variation navigates.** Click the link. Browser navigates to `/brands`.

### Deferred / not done

- DB columns `engagement_score`, `engagement_normalized` not dropped. Requires a migration with risk of touching historical rows.
- Orphaned files (`server/lib/sources/quoraSource.ts`, `tests/unit/quoraSource.test.ts`, `tests/unit/engagementScore.test.ts`, etc.) are inert but still on disk. Cleanup left for a follow-up pass.
- DB host clock drift (the underlying root cause of the "6 hours ago" symptom) is not fixed at the infrastructure level. The server-anchored age approach makes the application immune to it for the Mentions feature; other features still write `defaultNow()`-based timestamps that may also be hours off on the same host. Out of scope for this track.

---
