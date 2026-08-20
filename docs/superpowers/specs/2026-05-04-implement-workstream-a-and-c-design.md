# Implement Workstream A + C — End-to-end design

**Status:** Approved
**Date:** 2026-05-04
**Source:** `PRODUCTION_PLAN.md` Workstreams A and C, with verifications cross-referenced against the actual codebase (see "Wave 15" in `docs/phase2_completion.md` for related production-readiness work already shipped).

---

## Context

`PRODUCTION_PLAN.md` enumerated 11 product items (Workstream A) and 6 UX polish items (Workstream C) needed before VentureCite is opened to clients. Wave 15 (already shipped this session) cleared the production-readiness security/observability backlog (Workstream B). This spec covers the remaining product and polish work the user wants to ship.

The user explicitly excluded six items from scope (because they're blocked on external deliverables or strategic decisions): **A4** public articles directory (blocked on seed content from Vandan), **A8** CMS integration (blocked on CMS choice), **A9** lead magnet capture (blocked on Vandan's PDFs), **A10** services menu (blocked on Ben's price list), **A11** agency dashboard (blocked on scope decision), and **C6** logo decision (separate process).

The intended outcome is a 5-week roll that takes VentureCite from "demo-quality tool" to "thing real customers pay for" — directly addressing Ben's three meeting-stated fears (users get lost, can't tell if it's working, directory looks empty for the items in scope) without depending on external deliverables.

---

## Constraints (non-negotiable, apply to every phase)

1. **Vercel Hobby compatible.** Single function (`api/index.ts`), single cron (`/api/cron/daily-orchestrator`), 60s `maxDuration`, 1024 MB memory, 250 MB function size cap. No new functions, no new cron entries.
2. **Supabase Free tier.** 500 MB database storage cap, daily backups with 7-day retention (no PITR), 60s query timeout. New persistence (chatbot messages) bounded via 30-day TTL pruning + 100-message-per-user soft cap.
3. **Sentry Free tier.** 5,000 errors/month, 30-day retention, 1 user account. No Sentry account exists today — Phase 0 sets it up.
4. **Production-ready for real users from day one.** Each feature ships with: per-user rate limits where AI is involved, dedicated token budgets where LLMs are called, persistence with explicit retention policies, error capture via the `captureAndFlush` helper from Wave 15, mobile responsive at 375px, accessibility audited via axe-core.
5. **Test coverage convention.** Server endpoints + shared utilities get vitest tests (matches existing 233-test convention). Three logic-bearing client components (`EducationAssistant`, `OnboardingProgressRing`, `RecommendationsPanel`) get React Testing Library tests. Layout-only components rely on manual smoke testing per PR.
6. **PR granularity.** Hybrid: multi-PR phases for big features (A1, A3, A5, A6, plus C1+C2+C3 batched per page-set, plus C4/C5 in 2 batches each), single-PR for small features (A2, A7).
7. **Shape preservation.** No existing API response shape changes. The patterns established in Wave 15 (additive wraps, no try/catch removal) carry forward.

---

## Out of scope (deliberately excluded)

- **A4 public articles directory** — needs Vandan to deliver seed articles; without them the page is dead
- **A8 CMS integration** — needs Ben/Vandan to pick a target CMS for v1
- **A9 lead magnet capture** — needs Vandan to deliver the PDF magnets
- **A10 services menu** — needs Ben to deliver the price list + service inclusions
- **A11 agency / cross-tool dashboard** — needs scope decision (internal-only vs. white-label)
- **C6 logo / brand identity** — separate process with Ben

These items remain in the backlog. They're not impossible, just not implementable inside this spec without external inputs.

---

## Phase summary

Linear dependencies between phases (each builds on the prior); within a phase, PRs are independently shippable.

| Phase | What | PRs | Days | New env vars | New migrations |
|---|---|---|---|---|---|
| **0** | Pre-flight cleanup (B items) | 4 + 1 setup | 1.5 | `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE` | 0 |
| **1** | A2 onboarding ring + A7 expectations timeline | 2 | 2 | 0 | 0 |
| **2** | A5 per-page explainers + glossary + sidebar reorder | 4 | 2 | 0 | 0 |
| **3** | A3 citation locations | 3 | 3 | 0 | 1 (`cited_urls`) |
| **4** | A6 recommendations engine | 2 | 1.5 | 0 | 0 |
| **5** | A1 chatbot (Sonnet via OpenRouter) | 3 | 5.5 | `OPENROUTER_API_KEY` (becomes required) | 1 (`chatbot_messages` + `chatbot_token_usage`) |
| **6** | C1 + C2 + C3 batched (empty/skeleton/error states) | 2 | 2.5 | 0 | 0 |
| **7** | C4 mobile audit at 375px | 2 | 2 | 0 | 0 |
| **8** | C5 accessibility pass via axe-core | 2 | 2 | 0 | 0 |
| **Total** | | **24 PRs** | **~22 days focused dev** | **4** | **2** |

**Day-count caveat:** these are focused implementation-time estimates. Realistic calendar time is 30–35% higher when accounting for PR review iterations, unexpected blockers, and context-switching. Plan for ~5–6 calendar weeks at half-time, ~3–4 weeks full-time.

---

## Phase 0 — Pre-flight cleanup

**Goal:** Clear tech debt and harden observability before adding features. Some items reduce risk of all subsequent work.

### PR 0.0 — Sentry account setup (~30 min, no code)

Manual setup, no code change:

1. Sign up at sentry.io (free tier).
2. Create one project for VentureCite (Node.js + React + Browser).
3. Copy the DSN → set `SENTRY_DSN` in Vercel env (production AND preview).
4. Create internal integration with `Project Releases: Admin` scope → set `SENTRY_AUTH_TOKEN` in Vercel env (build-time only).
5. Confirm by triggering a test error after deploy → verify event appears in Sentry → revert.

The codebase is already wired for Sentry (`server/instrument.ts` initializes it gated on `SENTRY_DSN`). PR 0.0 is purely "turn it on with a real DSN."

### PR 0.1 — Server hardening (~3 hours)

| Item | Change |
|---|---|
| **B1.5** Cap `competitorDetections` Map | At [server/citationChecker.ts:429](server/citationChecker.ts#L429): hard cap at 5,000 entries. When hit: `logger.warn` once with `{brandId, runId}`, continue the run. Bounds memory at ~1 MB worst case. |
| **B3.1** Rate limit on alerts/test endpoint | Add existing `aiLimitMiddleware` to `POST /api/alerts/test/:settingId` at [intelligence.ts:823](server/routes/intelligence.ts#L823). Closes Slack-webhook-flooding abuse vector. |
| **B1.6** Chart safety comment | One-line comment at [chart.tsx:75](client/src/components/ui/chart.tsx#L75): `// safe: input is hardcoded THEMES + caller-supplied static config (Recharts shadcn pattern)`. |

### PR 0.2 — Observability (~4 hours)

| Item | Change |
|---|---|
| **B4.2** Source maps to Sentry | Add `build.sourcemap: 'hidden'` to [vite.config.ts](vite.config.ts) (generated, not browser-referenced). Add `@sentry/vite-plugin` to upload them on prod build, gated by `SENTRY_AUTH_TOKEN`. |
| **B8.3** Sentry release tagging | Set `SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA` in Vercel build env. The vite plugin from B4.2 picks it up automatically. |
| **B7.1** 5 client `console.*` calls | Install `@sentry/react`. Initialize in [client/src/main.tsx](client/src/main.tsx) with same DSN. Replace `console.error("[ErrorBoundary]", ...)` in [ErrorBoundary.tsx](client/src/components/ErrorBoundary.tsx) with `Sentry.captureException`. Same for [authStore.ts](client/src/lib/authStore.ts), [ShareOfAnswerTab.tsx](client/src/components/intelligence/ShareOfAnswerTab.tsx), [reset-password.tsx](client/src/pages/reset-password.tsx). Adds ~50 KB to initial JS bundle. |
| **B7.2** CSP comment | Code comment in [server/app.ts:53](server/app.ts#L53) explaining why `styleSrc` includes `'unsafe-inline'` (Recharts injects inline styles). |

### PR 0.3 — Database / migration safety (~2 hours)

| Item | Change |
|---|---|
| **B6.2** Drizzle drift check | Run `npx drizzle-kit check`. If clean: PR is RUNBOOK note confirming. If drift: small migration to align. |
| **B6.1** Audit last 5 migrations | Read `migrations/0042_*–0046_*.sql` for: `DROP COLUMN` on populated tables, missing indexes on FK hot-paths, `CREATE INDEX` without `IF NOT EXISTS`. Fix any issues found. |

### PR 0.4 — Operational readiness (~4 hours)

| Item | Change |
|---|---|
| **B8.4** RUNBOOK expansion | Append 5 incident scenarios to [docs/RUNBOOK.md](docs/RUNBOOK.md): pool exhaustion, Stripe webhook signature failures, OpenAI/OpenRouter 429, LLM budget exceeded, stuck content jobs. Each with symptoms, immediate mitigation, root-cause investigation steps, post-incident actions. |
| **B8.5** Backup/restore drill (revised for Supabase Free) | Create staging Supabase Free project. Use `pg_dump` to export prod, restore into staging. Run smoke tests. Document procedure + recovery-window limit (worst case ~24h data loss without PITR) in RUNBOOK. **Flag in RUNBOOK:** Supabase Pro ($25/mo) is mandatory before taking real money — gives PITR (recover to any second within 7 days) + 30-day daily backups. Treat as launch-blocker. |
| **B8.6** Status page | Stand up Better Stack free tier monitoring `/health` (already exists at [server/app.ts:333](server/app.ts#L333)). Link from landing footer. |

### Phase 0 verification

- `npm run check` clean, `npm test` 233/233 passing
- `npx eslint server/ client/src/` returns 0 errors
- `grep -rE "console\.(log|warn|error|info)" server/` returns only `log.ts`, `aiLogger.ts`, `setupProducts.ts`
- `grep -rE "console\.(log|warn|error|info)" client/src/` returns only deliberate `Sentry.captureException` calls in `ErrorBoundary.tsx`
- Manual: trigger error in prod, confirm Sentry event with mapped source line + correct release tag
- Manual: hit `/health` from Better Stack, confirm 200; revoke Supabase service-role temporarily in staging, confirm 503 + Better Stack alert

### Vercel Hobby check

Two new build-time env vars (`SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE`). One new runtime env var (`SENTRY_DSN`, was already optional in code). One new client dep (`@sentry/react`, +50 KB initial bundle). No new functions, no new crons. All within Hobby limits.

---

## Phase 1 — A2 onboarding ring + A7 expectations timeline

**Goal:** Two small visible wins on the dashboard. Builds momentum cheaply.

### PR 1.1 — Onboarding ring on dashboard (~1 day)

**New files:**

```
client/src/lib/onboardingSteps.ts
  Single source of truth for the 4 onboarding steps. Currently inline in
  SidebarOnboarding.tsx; this extracts them so adding/removing a step
  touches one place. Exports: STEPS array + isOnboardingComplete(data).

client/src/components/dashboard/OnboardingProgressRing.tsx
  Visible ring + step list. Reuses the existing VisibilityGauge SVG ring.
```

**Modified files:**

```
client/src/components/SidebarOnboarding.tsx
  Imports STEPS from new lib file. When isOnboardingComplete(data) →
  renders a tiny "✓ Setup complete" button instead of full checklist.
  Click → opens same Dialog with all steps checkmarked (read-only celebration).

client/src/pages/home.tsx
  Mounts <OnboardingProgressRing /> above hero metrics row when:
    - all queries loaded successfully
    - completed < total
    - not dismissed for this user

client/src/hooks/use-auth.ts
  Add new localStorage key to logout-clear list:
    `venturecite-onboarding-ring-dismissed:${user.id}`
```

**State management contract:**

The ring reads from three TanStack Query caches independently:
- All loading → render `<Skeleton>` (existing component at `client/src/components/ui/skeleton.tsx`)
- Some loaded, some loading → render skeleton (don't show partial state)
- All loaded with errors → don't render (page-level empty state will explain)
- All loaded successfully → compute and show

**Dismissal logic:**
- `localStorage` key scoped by `user.id` (CLAUDE.md compliance — prevents cross-account leak on shared browsers)
- Manual dismiss → ring hidden; sidebar widget unaffected (different surfaces, different lifecycles)
- `completed === total` → ring auto-animates to 100%, "you're set" celebratory state for 5s, auto-dismisses; sidebar widget switches to "✓ Setup complete" indicator

**RTL tests** (4 tests, ~30 min):
1. Skeleton renders when any query loading
2. Ring renders correct `completed/total` when all queries loaded
3. Auto-dismisses + writes localStorage when `completed === total`
4. Different `user.id` sees fresh ring (no leak across accounts)

**Vercel Hobby check:** zero server changes, +5 KB bundle.

### PR 1.2 — "What to expect" timeline (~1 day)

**New files:**

```
client/src/components/dashboard/ResultsTimeline.tsx
  Static horizontal timeline with 4 milestones. Computes "current week"
  from min(brand.createdAt) for the user.

client/src/components/citations/EmptyResultsHero.tsx
  Replaces generic citations empty state with one explaining the 1–2
  week LLM lag. Reused by Phase 6 empty-state pattern.
```

**Modified files:**

```
client/src/pages/home.tsx
  Mount <ResultsTimeline /> below onboarding ring (or above hero if ring
  dismissed).

client/src/components/citations/ResultsTab.tsx
  Render <EmptyResultsHero /> when totalChecks === 0.

server/scheduler.ts
server/lib/weeklyDigestEmitter.ts
server/emailService.ts
  Weekly digest email body adds one line: "Week N since you started
  VentureCite". No schedule change, no new email.
```

**Locked timeline copy:**

| Day 0 | Setup brand + AI Visibility checklist |
| Week 1 | Generate 5–10 articles, publish to your site |
| Week 2–3 | First citations appear as LLMs re-index your content |
| Week 4+ | Citation rate stabilizes, rankings emerge |

The 1–2 week LLM lag wording matches what's used in EmptyResultsHero (Phase 6) and the chatbot system prompt (Phase 5). Single source of truth.

**Current week computation:** `Math.floor((now - min(brand.createdAt)) / (7 days))` clamped to `[0, 12]`. No brands → "Day 0".

**RTL test** (1 test, ~15 min): correct current-week highlight given a faked `min(brand.createdAt)`.

**Vercel Hobby check:** server change is one extra string in already-running cron job. Zero impact on `maxDuration` budget. +3 KB bundle.

### Real-world edge cases handled (Phase 1)

- New user, no brands → "Day 0", no crash
- Brand created today → "Week 1"
- Existing user → "Week 4+" (capped)
- Email send failure → existing `captureAndFlush` covers it (Wave 15)
- Multiple brands with different ages → use OLDEST brand's `createdAt` (most generous interpretation)
- User completes onboarding in another tab → ring dismisses on this tab too (TanStack Query refetch on focus)
- `/api/onboarding-status` is down → ring doesn't render (graceful degradation)
- Logout + different user login on same browser → fresh ring (key scoped by user.id)

---

## Phase 2 — A5 per-page explainers + glossary + sidebar reorder

**Goal:** Every authenticated page has an `(i)` icon by its title explaining what the page does, prerequisites, expected outcome. Public glossary for GEO/AEO/SEO. Sidebar reordered into workflow sequence.

This phase introduces the most reusable infrastructure of the plan — `pageExplainers.ts` becomes a referenceable knowledge base for the chatbot in Phase 5 and for empty states in Phase 6.

### PR 2.1 — `PageHeader` extension + reusable `GeoConceptBadge` (~3 hours)

**Modified file:**

```
client/src/components/PageHeader.tsx
  Add optional `explainer` prop. Renders (i) icon next to title that
  opens a Popover (existing Radix component). Backward-compatible —
  existing callers without explainer keep working.
```

**New file:**

```
client/src/components/GeoConceptBadge.tsx
  Inline pill rendered like <Badge>GEO</Badge> with HoverCard showing
  glossary definition + "Learn more" link to /glossary#geo.
  Uses existing client/src/components/ui/hover-card.tsx.
```

**Locked type contract:**

```ts
// client/src/components/PageHeader.tsx
export type PageExplainer = {
  summary: string;                    // Required. One sentence.
  prerequisites?: string;             // Optional.
  expectedOutcome?: string;           // Optional.
  relatedConcept?: "GEO" | "AEO" | "SEO";
};

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  leading?: ReactNode;
  explainer?: PageExplainer;          // NEW
}
```

**A11y:** popover trigger has `aria-label="Page explainer"`. Radix handles keyboard interaction for free.

### PR 2.2 — `pageExplainers.ts` config + populate copy across 28 pages (~2 days)

**New file:**

```
client/src/lib/pageExplainers.ts
  Single export: Record<RouteKey, PageExplainer> for all 28 authenticated
  pages. Eliminates "where do I edit the dashboard explainer?" — answer
  is always this one file.
```

**Why centralized config:**

1. Copy review for entire app happens in one PR
2. Chatbot in Phase 5 imports this file to ground its answers ("if user asks 'what does GEO Signals do,' check pageExplainers.geoSignals.summary")
3. Empty states (Phase 6) reference it — when `/citations` is empty, show `pageExplainers.citations.expectedOutcome`

**Locked file shape (excerpt; full content in implementation):**

```ts
export const pageExplainers = {
  dashboard: {
    summary: "Your GEO command center — see citation trends, rankings, and what to do next.",
    expectedOutcome: "New data appears within minutes after each citation check completes.",
  },
  citations: {
    summary: "Asks ChatGPT, Claude, Perplexity, and others your prompts and tracks whether they mention you.",
    prerequisites: "Run AFTER setting up a brand and generating a few articles.",
    expectedOutcome: "Citations typically appear 1–2 weeks after new content is published — LLM models re-index on their own schedule.",
    relatedConcept: "GEO",
  },
  // ... 26 more entries
} as const satisfies Record<string, PageExplainer>;
```

**Per-page modification** (28 pages):

```tsx
// before:
<PageHeader title="Citations" description="Track AI mentions" />
// after:
<PageHeader title="Citations" description="Track AI mentions" explainer={pageExplainers.citations} />
```

### PR 2.3 — Public `/glossary` route (~3 hours)

**New file:**

```
client/src/pages/glossary.tsx
  Public route (no AuthenticatedRoute wrapper). Three sections (GEO,
  AEO, SEO), each with: definition (2 sentences), why it matters (2
  sentences), how VentureCite covers it (2 sentences with links to
  relevant in-app pages). Plus a comparison table at end.
```

**Modified file:**

```
client/src/App.tsx
  Add public route for /glossary.
```

**SEO:**
- `<title>GEO vs AEO vs SEO — VentureCite Glossary</title>` and meta description via inline `document.title` setter (existing pattern in codebase, don't introduce React Helmet)
- JSON-LD `DefinedTermSet` schema for each term
- Open Graph tags

**Public access rationale:** SEO surface (people Googling "what is GEO" land here, become leads); chatbot can deep-link to `/glossary#geo` from its responses; no marketing reach lost to auth-gating.

### PR 2.4 — Sidebar reorder (~2 hours)

**Modified file:**

```
client/src/components/Sidebar.tsx
  Reorder NAV_* arrays into workflow sequence. No URL changes — only
  the sidebar grouping shifts. All routes stay where they are. No
  redirects needed.
```

**New section structure:**

| Section | Items |
|---|---|
| **Setup** | Dashboard, Brands, AI Visibility *(was in Tools)* |
| **Create** | Content, Articles *(was in Main)*, Keywords |
| **Measure** | Citations *(was in Tools)*, GEO Analytics, AI Intelligence, Reports *(was in Optimize)* |
| **Grow** | Community, Opportunities, Competitors |
| **Optimize** | GEO Tools, Signals, Crawler Check, FAQ Manager, Fact Sheet |

Section labels updated to match: "Setup / Create / Measure / Grow / Optimize."

### Phase 2 Vercel Hobby check

Zero server changes. Glossary is a public route added to existing SPA bundle, served by same single function. No new env var, no new cron, no DB writes. Bundle delta: +13 KB.

---

## Phase 3 — A3 citation locations

**Goal:** Show users *where* in each AI response their brand was mentioned. Self-contained to citations pages.

The relevant data is already in `geo_rankings` table at [shared/schema.ts:521-560](shared/schema.ts#L521-L560) — `citationContext`, `citingOutletUrl`, `citingOutletName`. We surface it better and extract more from existing response text.

### PR 3.1 — Highlight brand mentions inside responses (~3 hours)

**New file:**

```
client/src/lib/highlightTermsRehype.ts
  Custom rehype plugin: createHighlightPlugin(terms) walks hast text
  nodes (NOT markdown source — that would corrupt links/code blocks)
  and wraps case-insensitive, word-boundary matches in <mark> tags.
```

**Modified files:**

```
client/src/components/SafeMarkdown.tsx
  Extend rehype-sanitize schema to allow <mark> tag.

client/src/components/citations/PlatformResultCard.tsx
  Pass highlightTerms prop into SafeMarkdown. Terms come from
  brand.name + brand.nameVariations (already in schema).
```

**Matching contract:**
- Case-insensitive
- Word-boundary required (no partial matches)
- Regex special chars escaped
- Multiple terms: one RegExp with alternation, longest-first
- Empty terms: plugin no-ops
- Cap at 50 terms per render

**RTL test** (1 test, ~15 min): brand `{name: "Stripe", nameVariations: ["stripe.com"]}`, response containing both → assert `<mark>` wraps matches but not occurrences inside `<code>`.

### PR 3.2 — "Cited mentions" snippet strip (~4 hours)

**New files:**

```
client/src/components/citations/CitedMentionsStrip.tsx
  Horizontal scroll strip above per-platform accordion. One card per
  cited result: platform pill, prompt (truncated), highlighted snippet.

client/src/lib/extractSnippet.ts
  Pure function: given response text + brand terms, returns ±200 chars
  around first match with "..." boundaries. Tested independently.
```

**Modified file:**

```
client/src/components/citations/ResultsTab.tsx
  Render <CitedMentionsStrip /> above existing per-platform stats card
  when totalCited > 0. Render <EmptyResultsHero /> (from Phase 1.2)
  when totalCited === 0.
```

**RTL test** (1 test, ~30 min): mock results with 3 cited / 5 total → assert exactly 3 cards, click first → PlatformResultCard expands.

### PR 3.3 — Extract source URLs migration + UI (~1 day)

**Investigation step at top of implementation:** read current Perplexity and ChatGPT Search response handling in [server/citationChecker.ts](server/citationChecker.ts). If structured citations are present in API response, extend `cited_urls` extraction to include them in this PR. If they require new API call or significant adapter work, defer to PR 3.5 (out of scope for current spec).

**New migration:**

```sql
-- migrations/0047_geo_rankings_cited_urls.sql
ALTER TABLE geo_rankings ADD COLUMN IF NOT EXISTS cited_urls TEXT[];
```

Idempotent. No backfill — existing rows stay null. New runs from this migration onward populate the column.

**New file:**

```
server/lib/urlExtractor.ts
  extractCitedUrls(responseText: string): string[]
  - Strip markdown link syntax: [text](https://x.com)
  - Plain URLs via standard URL regex
  - Strip trailing punctuation
  - Validate http/https only, hostname must contain dot
  - Dedupe (case-insensitive on hostname, exact on path)
  - Cap at 20 URLs per response
  - Cap each URL at 2 KB length
```

**Modified files:**

```
server/citationChecker.ts
  At existing INSERT INTO geo_rankings site, add
  citedUrls: extractCitedUrls(responseText) to the values. ~3 lines.

client/src/components/citations/PlatformResultCard.tsx
  When result.citedUrls?.length > 0, render "Sources cited in response"
  pill list with rel="noopener noreferrer".
```

**Server unit tests** (3 tests, ~30 min, in `tests/unit/urlExtractor.test.ts`):
1. Markdown link extraction
2. Plain URL extraction with trailing punct
3. Dedup + cap behavior

### Phase 3 Vercel Hobby check

- Migration: one ALTER COLUMN, instant, idempotent
- Per-write CPU: <5 ms additional per geo_rankings INSERT
- DB storage long-term: ~20 MB at 100x current scale (Supabase Free safe)
- Zero new endpoints, functions, env vars

---

## Phase 4 — A6 recommendations engine

**Goal:** "Do this next" panel on dashboard. Pure deterministic rules, no LLM cost per pageview, sub-200ms response.

### PR 4.1 — Rules engine + endpoint (~1 day)

**New file:**

```
server/lib/recommendationsEngine.ts
  Pure function: getRecommendations(state) => Recommendation[]
  Zero side effects, fully testable.
```

**Modified file:**

```
server/routes/dashboard.ts
  New handler: GET /api/brands/:brandId/recommendations
  Auth: existing. Loads state via Promise.all (6 parallel queries),
  calls engine, returns. ~30 lines.
```

**Locked type contract:**

```ts
export type RecommendationPriority = "P0" | "P1" | "P2";
export type RecommendationCategory = "setup" | "content" | "citations" | "signals" | "growth";

export type Recommendation = {
  id: string;                    // stable, e.g. "create-brand"
  title: string;
  why: string;
  ctaLabel: string;
  ctaHref: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  dismissible: boolean;          // P0 = false, P1/P2 = true
};

export type RecommendationState = {
  brand: Brand | null;
  articleCount: number;
  promptCount: number;
  citationRunCount: number;
  citationRate: number | null;
  lastSignalsScanAt: Date | null;
  visibilityChecklistCompleted: number;
  visibilityChecklistTotal: number;
  competitorCount: number;
  communityPostCount: number;
};
```

**The 11 locked rules** (evaluation order, first match per rule fires; output P0 first then P1 then P2; cap at 5 returned):

1. **P0** — `brand === null` → "Create your first brand"
2. **P0** — `brand && !brand.industry` → "Add industry to brand profile"
3. **P0** — `articleCount === 0` → "Generate your first article"
4. **P0** — `promptCount === 0` → "Generate citation-check prompts"
5. **P0** — `citationRunCount === 0` → "Run your first citation check"
6. **P1** — `citationRate < 0.20` → "Add a brand fact sheet to improve citation accuracy"
7. **P1** — `citationRate < 0.20 && faqCount === 0` → "Optimize your FAQ for AI engines"
8. **P1** — `lastSignalsScanAt === null || daysSince > 14` → "Re-run GEO Signals scan"
9. **P1** — `visibilityChecklistCompleted / total < 0.5` → "Complete your AI Visibility checklist (X/Y done)"
10. **P2** — `competitorCount === 0` → "Add competitors to track relative GEO performance"
11. **P2** — `communityPostCount === 0` → "Try Reddit/Quora outreach for AEO"

**Server unit tests** (6 tests, ~1 hour, in `tests/unit/recommendationsEngine.test.ts`):
1. Empty state → P0 #1 only
2. Brand created, no industry → P0 #2 only
3. Full setup, 0% citation rate → P1 fact-sheet + FAQ
4. All P0 done, citation rate 30% → only P2 growth recommendations
5. All possible rules firing → output capped at 5, P0 first
6. 12+ rules firing edge case → still capped at 5

### PR 4.2 — `RecommendationsPanel` on dashboard (~3 hours)

**New file:**

```
client/src/components/dashboard/RecommendationsPanel.tsx
  Renders the list. P0 first (red accent), P1 next (amber), P2 last
  (subtle). Each card: title, why tooltip, CTA button, dismiss button
  on P1/P2 only (P0 not dismissible — they're blockers).
```

**Modified files:**

```
client/src/pages/home.tsx
  Mount <RecommendationsPanel /> below the onboarding ring (stacked
  per the user's decision — all three sections render simultaneously).

client/src/hooks/use-auth.ts
  Add localStorage key to logout-clear list:
    `venturecite-recs-dismissed:${user.id}`
```

**Dismissal logic:**
- localStorage key per user: `venturecite-recs-dismissed:${user.id}`
- Value: `{ [recommendationId]: ISO_8601_timestamp }`
- 7-day soft hide (reappears at bottom after 7 days if rule still applicable)
- P0 cards have no dismiss button

**RTL tests** (3 tests, ~1.5 hours):
1. Renders 3 P0 cards correctly
2. Dismiss button on P1 card removes from view + writes localStorage with timestamp
3. Different `user.id` sees fresh recommendations

### Phase 4 Vercel Hobby check

- One new endpoint added to existing function — no new function
- 6-query Promise.all per request, ~50–100ms typical
- Zero LLM token usage per pageview
- Zero new env vars, crons

---

## Phase 5 — A1 chatbot

**Goal:** Floating chat bubble in bottom-right of every authenticated page. Click → side sheet opens with a GEO/AEO/SEO tutor powered by Claude Sonnet via OpenRouter. Production-grade from day one.

### PR 5.1 — Production baseline: persistence + budget + non-streaming Sonnet (~3 days)

**New migration:**

```sql
-- migrations/0048_chatbot_messages.sql
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id      VARCHAR      REFERENCES brands(id) ON DELETE SET NULL,
  role          TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT         NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  model         TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chatbot_messages_user_created_idx
  ON chatbot_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_token_usage (
  user_id       VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    DATE         NOT NULL,
  input_tokens  INTEGER      NOT NULL DEFAULT 0,
  output_tokens INTEGER      NOT NULL DEFAULT 0,
  message_count INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
```

`ON DELETE CASCADE` on user_id → GDPR delete cascades automatically.
`ON DELETE SET NULL` on brand_id → conversation persists if brand deleted.

**Locked daily caps** (configured in `server/lib/llmPricing.ts` per tier):

| Tier | Tokens/day | Messages/hour | Worst-case $/user/month | % of tier price |
|---|---|---|---|---|
| Free | 15,000 (~10 turns) | 20 | $4.50 | n/a (CAC) |
| Pro | 75,000 (~45 turns) | 60 | $22 | 28% of $79 |
| Enterprise | 250,000 (~150 turns) | 120 | $75 | 30% of $249 |

Two-axis cap — either limit triggers 429. Real-world average is 10–30% of cap.

**New files:**

```
server/lib/openrouterClient.ts
  Uses existing OpenAI SDK pointed at OpenRouter:
    baseURL: "https://openrouter.ai/api/v1"
    apiKey: process.env.OPENROUTER_API_KEY
    headers: { "HTTP-Referer": "https://venturecite.com", "X-Title": "VentureCite" }
  Model: "anthropic/claude-sonnet-4.5". Timeout: 45s. Max retries: 1.

server/lib/chatbotKnowledge.ts
  Exports SYSTEM_PROMPT constant. ~3,500 tokens. Sections:
    - Identity & guardrails (decline non-GEO/marketing topics)
    - GEO 101
    - AEO vs SEO vs GEO comparison
    - VentureCite page-by-page guide (imports pageExplainers from Phase 2)
    - "What to do first" 6-step recipe
    - Measurement timeline (1–2 week LLM lag — same wording as A7)
    - Reddit/Quora strategy basics

server/lib/chatbotBudget.ts
  assertChatbotTokenBudget(userId): throws BudgetExceededError if user
  has no remaining tokens for today. Reads chatbot_token_usage row,
  compares to tier cap from llmPricing.ts.

server/routes/assistant.ts
  POST /api/assistant/chat endpoint.
  Middleware: chatbotRateLimit (30/hour for free, 60 for pro, 120
  for enterprise — keyed by userId).
```

**Endpoint contract:**

```
POST /api/assistant/chat
  Body: { messages: { role: 'user'|'assistant', content: string }[],
          brandId?: string }   // brandId only used in PR 5.3

Validation:
  - At least one user message
  - Last must be 'user'
  - Last user message ≤ 2,000 chars

Steps (in order):
  1. assertChatbotTokenBudget(userId) → throws 429 if exceeded
  2. Persist new user message to chatbot_messages
  3. Build prompt:
     - System message with cache_control: {type: "ephemeral"} for caching
     - Last 10 messages from chatbot_messages (history)
     - The new user message
  4. Call OpenRouter via openrouterClient.chat.completions.create
     Retry once on 5xx/429 with 1s backoff
  5. Persist assistant message with token counts
  6. Increment chatbot_token_usage for today (INSERT ON CONFLICT DO UPDATE)
  7. Log to api_costs with feature: 'chatbot'
  8. Return { success: true, data: { content, inputTokens, outputTokens } }

Errors (all captured via captureAndFlush from Wave 15):
  - Budget exceeded: 429 { code: 'budget_exceeded', error: 'Daily AI tutor budget reached. Resets at midnight UTC.' }
  - Rate limit (middleware): 429
  - Validation: 400 with specific reason
  - OpenRouter unavailable after retry: 502 with friendly message
```

**Reasoning for design choices:**

1. Last 10 messages, not full history — bounds context size, plenty for tutor.
2. Cache system prompt with `cache_control: {type: "ephemeral"}` — Anthropic 90% discount on cache hits via OpenRouter pass-through. Critical for free-tier economics.
3. Persist BEFORE OpenRouter call — failed call still preserves user's message for retry.
4. One retry on 5xx/429 — catches transient blips without wasting budget on real outages.
5. 2 KB max user message, 8 KB max assistant — bounds abuse via giant pastes.

**New files (client):**

```
client/src/components/EducationAssistant.tsx
  Floating bubble (bottom-right, fixed bottom-6 right-6 z-40 — z-40 NOT
  z-50 so Radix dialogs visually cover it). Click → opens Sheet (existing
  Radix component). Side sheet ~400px wide, full height. Auto-hides on
  mobile (<640px) when body[data-radix-dialog-open] is true.
```

**Modified files:**

```
client/src/components/AppLayout.tsx
  Mount <EducationAssistant /> once inside authenticated layout only
  (not on landing/auth pages).

server/routes/cron.ts
  Append "chatbot-prune" step to daily orchestrator. STEP_CAPS_MS: 5_000.

server/lib/llmPricing.ts
  Add chatbotDailyTokens + chatbotMessagesPerHour per tier.
```

**Daily TTL pruning** (added to cron orchestrator):

```sql
DELETE FROM chatbot_messages WHERE created_at < NOW() - INTERVAL '30 days';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM chatbot_messages
)
DELETE FROM chatbot_messages WHERE id IN (SELECT id FROM ranked WHERE rn > 100);
```

Bounds DB to ~50 MB at 50 active users × 100 msgs × 10 KB.

**RTL tests** (5 tests, ~2.5 hours):
1. Renders empty state with starter prompts
2. Sends message → optimistic append → assistant response renders
3. Server returns 429 budget_exceeded → friendly "daily limit reached" notice
4. Sheet auto-scrolls to bottom on new message
5. Different user.id loads fresh conversation

**Server unit tests** (6 tests, ~2 hours):
1. Empty messages array → 400
2. Last message not user role → 400
3. User message > 2 KB → 400
4. Budget: 49,500 tokens used, 1,000-token request → 429
5. OpenRouter 5xx → retry once succeed; OpenRouter 5xx twice → 502
6. Successful flow: persists user msg, calls OpenRouter, persists assistant msg, increments usage row, logs api_costs

### PR 5.2 — Streaming responses (~1.5 days)

**Modified files:**

```
server/routes/assistant.ts
  Endpoint switches to SSE response. Reuses SSE heartbeat + cleanup
  pattern from server/routes/onboarding.ts (already handles req.on('close')
  properly).

client/src/components/EducationAssistant.tsx
  Uses fetch + ReadableStream + TextDecoder to consume SSE. Tokens
  append into buffer; UI re-renders on each chunk. AbortController on
  unmount/navigation.
```

**Critical production details:**
- Persistence still happens once at end of stream (atomic with token usage incrementing)
- Stream interruption: persist whatever was generated with `metadata.streamError` flag; UI shows "Stream interrupted, try again"
- Abort on user navigation: server-side handler watches `req.on('close')`, aborts OpenRouter call. **No tokens charged for aborted streams** (OpenRouter bills only on returned tokens)
- Heartbeat every 15s to keep connection alive through proxies
- Vercel 60s timeout: 30s typical, 55s soft cap before server cuts response cleanly

**RTL test** (1 test, ~30 min): mocked SSE stream with 3 chunks via `vi.useFakeTimers()` → text appears incrementally → final state matches concatenated chunks.

### PR 5.3 — Brand-aware system prompt (~1 day)

**Modified files:**

```
server/routes/assistant.ts
  When brandId in request body:
    1. Verify ownership (existing brandIdParamHandler-style check)
    2. Load brand summary in parallel with message history (Promise.all):
       - brand.name, brand.industry
       - latest visibility score
       - citation count last 30d
       - article count
    3. Inject as structured "user context" block at start of system
       message (BEFORE the cached static knowledge — keeps cache effective)

client/src/components/EducationAssistant.tsx
  Reads selected brand from useBrandSelection hook. Passes brandId in
  every request.
```

**Cache-aware prompt structure:**

```ts
const messages = [
  {
    role: "system",
    content: SYSTEM_PROMPT,                    // ~3,500 tokens, CACHED
    cache_control: { type: "ephemeral" }
  },
  ...(brandContext ? [{
    role: "system",
    content: brandContextBlock(brandContext),  // ~200 tokens, NOT cached
  }] : []),
  ...history,
  newUserMessage,
];
```

**Brand context block format (locked):**

```
[Current user's brand]
Name: Acme Corp
Industry: B2B SaaS
Articles published: 12
Citation runs in last 30 days: 4
Latest citation rate: 23%
Latest visibility score: 42/100

Use this context to make your answers specific to their situation.
If they ask "what should I do next," reference their actual numbers.
```

**Server unit test** (1 test, ~30 min): brand context loaded from DB matches what's injected into the prompt.

### Phase 5 Vercel Hobby check (whole phase)

- One new endpoint, added to existing function bundle
- One new daily-cron step (chatbot-prune), added to existing orchestrator (no new cron entry)
- One new required env var (`OPENROUTER_API_KEY`) — was optional, becomes required
- DB usage: bounded ~50 MB ceiling. Supabase Free safe through pre-launch
- Per-request cost: ~$0.001–0.005 typical. At 50 active users × 30 messages/day = ~$3–7/day chatbot spend
- Sentry events: captures all failures via `captureAndFlush`. Streaming abort = no Sentry event (intentional — abort is normal)

---

## Phase 6 — C1 + C2 + C3 batched (empty/skeleton/error states)

**Goal:** Every page handles four query states (loading / empty / error / data) consistently.

### PR 6.1 — Shared infrastructure + top 5 pages (~1.5 days)

**New files:**

```
client/src/components/ui/empty-state.tsx
  Generic empty-state card. Props: icon, title, description, action.
  When description omitted, falls back to pageExplainers[page].expectedOutcome.

client/src/components/ui/error-state.tsx
  Generic error card. Props: title, description, onRetry (mandatory).

client/src/lib/queryStates.ts
  renderQueryState({ isLoading, isError, data, refetch, skeleton, empty,
    error, children }) — centralizes the if/elif chain so every page
  handles four query phases the same way.
```

**Top 5 pages modified:** `/dashboard`, `/citations`, `/articles`, `/content`, `/brands`. Each gets:
- Empty state via `<EmptyState>` (with `pageExplainers` fallback when copy isn't notably better)
- Skeleton matching final layout (no layout shift)
- `<ErrorState>` with retry per independent query (don't error-out whole page if one query fails)

### PR 6.2 — Remaining 23 pages (~1 day with read-then-port discipline)

Mechanical sweep using same patterns. **Per-page contract: read existing inline empty-state implementation FIRST, port unique copy/CTAs into `<EmptyState>` props, don't blindly delete.** PR description includes per-page audit ("old copy: X / new copy: Y").

23 pages: `/agent-dashboard`, `/agent-run`, `/ai-intelligence`, `/ai-traffic`, `/ai-visibility`, `/analytics-integrations`, `/brand-fact-sheet`, `/client-reports`, `/community-engagement`, `/competitors`, `/crawler-check`, `/faq-manager`, `/geo-analytics`, `/geo-opportunities`, `/geo-rankings`, `/geo-signals`, `/geo-tools`, `/keyword-research`, `/outreach`, `/publication-intelligence`, `/revenue-analytics`, `/settings`, `/welcome`.

### Phase 6 Vercel Hobby check

Entirely client-side. +13 KB bundle. Zero server impact.

---

## Phase 7 — C4 mobile audit at 375px

**Goal:** Every page renders cleanly at 375px width. No horizontal page scroll. Touch targets ≥44×44px (Apple HIG). Modals fit screen.

**Methodology:** Chrome DevTools → iPhone SE (375×667). Walk each page in 3 states (data, empty, error). Check 8 common issues: horizontal scroll, touch targets, text legibility, modal fit, chart sizing, sidebar collapse, form inputs, bottom-fixed elements.

### Locked patterns (use consistently across all fixes)

| Issue | Pattern |
|---|---|
| Multi-column layout | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |
| Side-by-side form fields | `flex flex-col md:flex-row` |
| Tables wider than screen | `overflow-x-auto` wrapper, OR card-view alternative on mobile (`block md:hidden` + `hidden md:block` pair) |
| Long text labels | `min-w-0` on flex parent + `truncate` on text element |
| Touch targets too small | `min-h-[44px] min-w-[44px]` |
| Modal content overflow | `max-h-[calc(100vh-4rem)] overflow-y-auto` on dialog content |

### PR 7.1 — Top 5 pages (~1 day)

Same 5 pages as Phase 6. PR description includes screenshots at 375px in 3 states (data/empty/error).

### PR 7.2 — Remaining 23 pages (~1 day)

Mechanical sweep using same patterns. Flagged as likely-problematic per `PRODUCTION_PLAN.md`: `/geo-tools` (huge form), `/agent-dashboard` (complex layout).

### Phase 7 Vercel Hobby check

Entirely client-side CSS / responsive class changes. ~0 bundle delta (Tailwind tree-shakes).

---

## Phase 8 — C5 accessibility pass via axe-core

**Goal:** Run axe-core against running dev server, fix Serious + Critical issues. Procurement-blocker mitigation; better UX for keyboard users / password managers / screen readers.

### Setup (start of PR 8.1)

```
1. Install @axe-core/react in devDependencies (NOT runtime).
2. Initialize conditionally in client/src/main.tsx:
     if (process.env.NODE_ENV !== "production") {
       import("@axe-core/react").then(({ default: axe }) =>
         axe(React, ReactDOM, 1000)
       );
     }
   Logs violations to browser console in dev; never ships to production.
```

### PR 8.1 — Critical + Serious fixes (~1 day)

Categories of issues with locked fix patterns:

| Category | Fix pattern |
|---|---|
| Icon-only buttons missing labels | `aria-label="Delete article"` etc. |
| Form fields without labels | `<Label htmlFor={id}>` paired with `<Input id={id}>`. Use `sr-only` class for visually-hidden labels if design requires placeholder-only. |
| Insufficient color contrast | Adjust Tailwind theme tokens to WCAG AA (4.5:1 normal, 3:1 large). One file: `tailwind.config.ts`. |
| Heading hierarchy skips | Adjust `<h1>` → `<h2>` → `<h3>` ordering. |
| Focus visible | Add `focus-visible:ring-2 focus-visible:ring-ring`. |
| Alt text on meaningful images | `alt={brand.name}`. Decorative: `alt=""`. |
| Non-semantic clickable divs | Change to `<button>` (preferred) OR add `role="button" tabIndex={0} onKeyDown={handleEnter}`. |

PR includes manual keyboard-only walkthrough notes for top 5 pages.

### PR 8.2 — Long-tail moderate fixes + a11y status doc (~1 day)

Mechanical sweep of remaining axe-core findings. Document any deliberately-deferred Minor findings in new file `docs/a11y-status.md`.

### Phase 8 Vercel Hobby check

`@axe-core/react` is `devDependencies` only — zero production bundle impact. Zero server impact.

---

## Verification approach (end-to-end)

After each phase:
- `npm run check` clean (tsc strict)
- `npm test` all tests passing (233 baseline + new tests per phase)
- `npx eslint server/ client/src/` returns 0 errors

After all phases (ship-readiness):
- `grep -r "console\." server/ client/src/` returns ONLY: `server/log.ts`, `server/lib/aiLogger.ts`, `server/setupProducts.ts`, and deliberate `Sentry.captureException` calls in `client/src/components/ErrorBoundary.tsx`
- Manual: chatbot smoke test with each tier (free/pro/enterprise) hitting cap
- Manual: trigger error in prod, confirm Sentry receives with mapped source line + correct release tag
- Manual: every page at 375px, axe-core console clean for Critical+Serious
- Manual: full backup/restore drill on staging

---

## Cross-cutting concerns

### New env vars required

| Var | Phase | Required at | Purpose |
|---|---|---|---|
| `SENTRY_DSN` | 0 | runtime | Was already optional in code; becomes required to actually capture errors |
| `SENTRY_AUTH_TOKEN` | 0 | build | Source map upload via `@sentry/vite-plugin` |
| `SENTRY_RELEASE` | 0 | build | Tag uploads with `$VERCEL_GIT_COMMIT_SHA` |
| `OPENROUTER_API_KEY` | 5 | runtime | Sonnet via OpenRouter for chatbot. Was optional; becomes required when chatbot ships. |

### New migrations

| File | Phase | Purpose |
|---|---|---|
| `migrations/0047_geo_rankings_cited_urls.sql` | 3 | `cited_urls TEXT[]` column on `geo_rankings` |
| `migrations/0048_chatbot_messages.sql` | 5 | `chatbot_messages` + `chatbot_token_usage` tables |

### New cron steps (added to existing daily-orchestrator, no new cron entries)

| Step | Phase | Step cap |
|---|---|---|
| `chatbot-prune` | 5 | 5,000 ms |

### Test count delta

| Phase | Server tests | RTL tests |
|---|---|---|
| 0 | 0 | 0 |
| 1 | 0 | 5 |
| 2 | 0 | 0 |
| 3 | 3 | 2 |
| 4 | 6 | 3 |
| 5 | 7 | 6 |
| 6 | 0 | 0 |
| 7 | 0 | 0 |
| 8 | 0 | 0 |
| **Total** | **+16** | **+16** |

Final test count: **233 + 32 = 265 tests**.

### Bundle size delta

~+116 KB total across all phases. Largest contributors: `@sentry/react` (~50 KB, Phase 0), chatbot UI (~16 KB, Phase 5), empty/error state components (~13 KB, Phase 6), pageExplainers + glossary (~13 KB, Phase 2). All within Vercel function size cap.

### Database storage long-term ceiling

| Table | Source | Bounded by | Estimated steady state |
|---|---|---|---|
| `chatbot_messages` | Phase 5 | 30-day TTL + 100 per user | ~50 MB at 50 users |
| `chatbot_token_usage` | Phase 5 | One row per user-per-day | ~1 MB at 50 users × 365 days |
| `geo_rankings.cited_urls` | Phase 3 | Existing geo_rankings retention | ~20 MB at 100x current scale |

Total new storage: ~70 MB. Supabase Free 500 MB cap safe through pre-launch.

---

## Open items / follow-up specs

These are NOT part of this spec but should be tracked for follow-up work:

1. **PR 3.5 — Perplexity / ChatGPT Search structured citations.** Decided during PR 3.3 implementation based on whether structured data is cheap to extract. ~1–2 days if needed.
2. **A4 / A8 / A9 / A10 / A11 / C6** — explicitly out of scope per user; need external deliverables (seed content, CMS choice, magnets, prices, scope decision, logo) before spec'ing.
3. **Supabase Pro upgrade** — required before taking real money (PITR + 30-day backups). Treat as launch-blocker per Phase 0 RUNBOOK.
4. **Sentry Team plan upgrade** — required when team grows beyond 1 person, or volume exceeds 5,000 errors/month.
5. **Chatbot Phase 4** (post-MVP, future spec): conversation summarization for long threads, content moderation layer if abuse detected, multiple conversation threads per user, admin dashboard for chatbot analytics.
6. **CSP nonce-based hardening** (post-launch): tighten current `'unsafe-inline'` style policy if security audit requires it.

---

## Approval

Design walked through with the user across 9 incremental sections (2026-05-04). All architectural decisions, type contracts, rate limits, token budgets, and per-phase scopes are locked. Ready for implementation plan.
