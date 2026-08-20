# Foundations — Design Spec

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

**Date:** 2026-05-10
**Spec:** 1 of 6 in the venturecite redesign sequence
**Status:** Draft, pending user review
**Out of scope:** landing page (`landing.tsx` + `landing.css`), all orphan pages (`outreach.tsx`, `ai-traffic.tsx`, `agent-dashboard.tsx`, `agent-run.tsx`, `geo-rankings.tsx`, `publication-intelligence.tsx`, `revenue-analytics.tsx`, `analytics-integrations.tsx`), AI Tutor copilot upgrade (deferred to Spec 6).

> **Note on .md files:** Per project rule, no .md file in this repo is treated as ground truth. Every claim in this spec was verified against code at 2026-05-10. Before acting on any item, re-verify the cited file:line still matches — Wave 0051 work is in-flight in a `wip:` commit and the codebase ships faster than its docs.

---

## 1. Goals

A pre-feature-redesign sweep that removes lying surfaces, enforces the existing design system uniformly, simplifies information architecture, and unblocks the five subsequent feature specs from inheriting the same problems. **No new features.** Mostly deletion, wiring, and disciplined token application.

After Foundations lands:

- Every button on a sidebar-reachable page either does what it claims or doesn't render.
- The dashboard does not accuse a brand-new user of failure before any data exists.
- The sidebar IA is legible to a non-technical founder in under 10 seconds.
- Settings is reachable, contains billing, and has the password/profile fields a real customer expects.
- The design system tokens defined in [`client/src/index.css`](../../../client/src/index.css) and [`DESIGN.md`](../../../DESIGN.md) are honored on every authenticated page (landing exempt).
- Two known dead bridges (welcome → fact-scrape, keyword-research → content) are wired.
- Every AI-generated article carries an `AIGenerated` pill.
- Email verification is on.
- The recommendations engine stops emitting false-positive P1s caused by hardcoded `null/0` inputs.

## 2. Non-goals

- New features, new pages, new schema beyond `articles.ai_generated` and the two persistence tables in §4.11.
- Touching the landing page (`landing.tsx`, `landing.css`) — orange palette, glassmorphism, gradient text, fake mock dashboard, ROI calculator: all left alone. They live in a different bucket of work.
- Touching orphan pages. They stay where they are. Their inbound links from in-use pages get rewired or removed, but the orphan files themselves are not deleted in this spec.
- Brand Fact Sheet agentic deep research (Spec 2).
- Citation analytics consolidation + `prompt_portfolio` deprecation (Spec 3).
- Optimization workspace unification across `/geo-*` + `/crawler-check` + `/faq-manager` (Spec 4).
- Citation-gap → content bridge + full-page editor (Spec 5).
- AI Tutor copilot upgrade with tool use, pathname context, deep-link rendering (Spec 6).
- Any change to the citation engine, mention scanner, content generation worker, agent workflow engine, or auth implementation beyond the email-verify flag.

## 3. Constraints

- **Vercel Hobby ceiling.** No new external services. No Browserless, no ScrapingBee, no Redis, no third-party PDF generator, no headless-browser farm. Functions stay under 60s. New CSV export uses streaming response, not a job queue.
- **No commits without explicit ask.** This spec lands as a working file; the user controls when commits happen.
- **Code-only verification.** Every claim is grounded in a `file.tsx:LINE` reference. No `.md` is trusted.
- **Parallel-safe edits.** Items 1, 2, 3, 4, 5, 6, 9, 10, 11 can be implemented in parallel. Item 7 (onboarding stack consolidation) sequences after Item 4 (Day-0 alarm rule). Item 8 (email verification) is independent.

## 4. The Eleven Items

### 4.1 Design System Enforcement

**Problem (verified):**

- [`client/src/index.css`](../../../client/src/index.css) already defines the canonical token system: `--primary: hsl(0,75%,45%)` (vermillion), `--background: hsl(220,14%,96%)` (cool off-white), `--card`, `--muted`, `--destructive: hsl(0,84%,60%)`, `--chart-1..5`, `--font-sans: Inter`, `--font-mono: JetBrains Mono`, `--shadow-{2xs,xs,sm,md,lg,xl}`. Tokens are correct.
- Pages bypass the tokens at scale. Verified offenders, illustrative not exhaustive:
  - [`client/src/App.tsx:52, 63, 80, 107, 138`](../../../client/src/App.tsx#L52) — `border-violet-600` spinners on every authenticated route. Violet is not in the design system at all.
  - [`client/src/pages/register.tsx:87, 200, 223`](../../../client/src/pages/register.tsx#L87) — `bg-stone-50`, `bg-red-600`, `text-red-600` (Tailwind hex, not tokens; destructive-ramp red used for a primary-CTA semantic).
  - [`client/src/pages/login.tsx:62, 130, 122, 150`](../../../client/src/pages/login.tsx#L62) — same pattern.
  - [`client/src/pages/welcome.tsx:312, 384`](../../../client/src/pages/welcome.tsx#L312) — `bg-neutral-50`, `bg-emerald-400/500` pulse dot.
  - [`client/src/pages/brand-fact-sheet.tsx:314, 317, 334, 491, 553, 595, 632, 635`](../../../client/src/pages/brand-fact-sheet.tsx#L314) — page-wide `text-violet-*`, `border-violet-200`, `bg-violet-50` identity divergent from the rest of the app.
  - [`client/src/pages/home.tsx:247-258`](../../../client/src/pages/home.tsx#L247-L258) — hardcoded chart hex `#3b82f6, #f97316, #eab308, #22c55e, #ef4444, #8b5cf6, #ec4899, #14b8a6, #a855f7, #f59e0b`. Tokens `--chart-1..5` are unused.
  - [`client/src/pages/citations.tsx:407, 551`](../../../client/src/pages/citations.tsx#L407) — `bg-red-600`, `border-red-500` instead of `bg-primary`, `border-primary`.
  - [`client/src/pages/geo-analytics.tsx:206, 233, 258, 482`](../../../client/src/pages/geo-analytics.tsx#L206) — `bg-gradient-to-br from-blue-500/20 to-purple-500/20`, `from-green-500/20 to-teal-500/20`, `from-amber-500/20 to-orange-500/20`, `from-blue-50 to-purple-50` — purple-to-pink gradients explicitly forbidden by design.json.
  - [`client/src/pages/faq-manager.tsx:626`](../../../client/src/pages/faq-manager.tsx#L626) — `bg-gradient-to-r from-purple-600 to-blue-600` Generate button.
  - Per-page `text-amber-*`, `text-emerald-*`, `text-orange-*`, `text-blue-*`, `text-green-*`, `text-yellow-*` decorative usage everywhere; status-vs-brand mixing on the same surface in `home.tsx:1105, 1158`; KPI numbers rendered in `text-3xl font-semibold` everywhere instead of `font-mono tabular-nums`.
- No KPI tile primitive component exists. There are at minimum 4 different KPI tile implementations (home hero, geo-analytics, ai-intelligence per-tab, citations Results 3-up) with different paddings, type sizes, color treatments, and delta affordances.
- Section/PageHeader patterns vary across pages; description text uses `truncate` ([`home.tsx:141`](../../../client/src/pages/home.tsx#L141)) cutting long copy silently — design.json mandates `line-clamp-2`.

**Solution:**

1. Ship four primitive components in `client/src/components/foundations/`:
   - `<KPITile label number delta?>` — `font-mono tabular-nums` number, muted-foreground label, optional delta with arrow icon + `text-chart-4` (gain) or `text-destructive` (loss). One canonical resting card style.
   - `<Section title description? metaRow? action?>` — replaces ad-hoc `<Section>` patterns in home.tsx and elsewhere. `line-clamp-2` on description, separate `metaRow` slot for chips like "Seeded 12 days ago" instead of jamming them into the description string.
   - `<EmptyState icon title body cta?>` — single canonical empty-state card. Replaces ~12 different empty-state patterns across the app.
   - `<StatusDot tone="success|warn|fail|neutral|pending" />` — 8px filled dot used wherever a status badge needs a non-color encoding (color-paired-with-shape rule).
2. Replace `border-violet-*` spinners in App.tsx (5 locations) with a single `<RouteSpinner />` component using `border-primary border-t-transparent`. Replace `<div className="...border-4 border-violet-600...">` everywhere it appears; one component, one import.
3. Sweep raw Tailwind palette usage on authenticated-route pages. Replace:
   - `bg-stone-*`, `bg-neutral-*` → `bg-background` or `bg-card`
   - `bg-red-600/700`, `text-red-600` (when used for primary actions or links) → `bg-primary`, `text-primary`
   - `text-red-*` (when used for errors/warnings) → `text-destructive`
   - `text-slate-*` → `text-foreground` or `text-muted-foreground`
   - `text-violet-*`, `bg-violet-*`, `border-violet-*` → `text-primary` (if it was acting as brand) or `text-muted-foreground` (if decorative chrome). Brand Fact Sheet specifically: every violet token replaced.
   - `text-emerald-*`, `text-green-*` → `text-chart-4` (verdant green), or pair with icon
   - `text-amber-*`, `text-orange-*`, `text-yellow-*` → `text-chart-3` (warm tan) for warnings, otherwise neutral
   - Hardcoded chart hex (`home.tsx:247-258`) → `hsl(var(--chart-1))` through `--chart-5`
4. Retire any `bg-gradient-to-*` usage on authenticated pages. Specifically: `geo-analytics.tsx:206, 233, 258, 482`, `faq-manager.tsx:626`, any glassmorphism `backdrop-filter`. Replace with flat-at-rest cards.
5. Apply `font-variant-numeric: tabular-nums` (or `font-mono` where stacked numbers warrant it) to every numeric KPI on dashboards, analytics, citations, geo-analytics, ai-intelligence, geo-tools summary cards, faq-manager KPI cards.
6. `truncate` → `line-clamp-2` audit on all description-style text. `home.tsx:141, 549, 679, 930` and equivalents in `brands.tsx`, `competitors.tsx`, `articles.tsx`, `citations/PromptsTab.tsx`.
7. Page-level shadow audit: `shadow-sm border-border/60` ambient shadows (e.g., `home.tsx:133, 585, 647, 700`) demoted to flat-at-rest `border-border`; shadows appear only on hover/focus state per the Flat-At-Rest rule.

**Rationale:** The system is already correctly defined in `index.css` and `design.json`; the failure is enforcement, not specification. A single sweep + four primitive components is a higher-leverage move than a fresh design system. Every subsequent feature spec inherits these primitives.

**Dependencies:** None. Independent of all other items.

**Out of scope:** Landing page palette, `landing.css` orange/amber theme, `text-gradient-red` utility (only consumed by landing).

---

### 4.2 Sidebar IA Simplification

**Problem (verified at [`Sidebar.tsx:40-75`](../../../client/src/components/Sidebar.tsx#L40-L75)):**

Current sidebar — 18 nav entries in 5 groups:

- **Setup** (3): Dashboard, Brands, AI Visibility
- **Create** (3): Content, Articles, Keywords
- **Measure** (4): Citations, GEO Analytics, AI Intelligence, Reports
- **Grow** (3): Community, Opportunities, Competitors
- **Optimize** (5): GEO Tools, Signals, Crawler Check, FAQ Manager, Fact Sheet

Three problem clusters:

1. **Label collisions:** Citations / AI Visibility / AI Intelligence / GEO Analytics — four labels, three of which sound like analytics. `GEO Tools` / `Signals` / `Opportunities` / `Crawler Check` — four optimization-flavored entries with no clear hierarchy. A non-technical founder cannot infer which page does what.
2. **Settings unreachable from UI:** [`Sidebar.tsx:236-238`](../../../client/src/components/Sidebar.tsx#L236-L238) renders `<DropdownMenuItem disabled><Settings/> Account settings</DropdownMenuItem>`. The `/settings` route exists ([`App.tsx:204`](../../../client/src/App.tsx#L204)) and the page works ([`settings.tsx`](../../../client/src/pages/settings.tsx)). The `disabled` attribute is the bug.
3. **Active-state color:** active nav items use `bg-sidebar-primary text-sidebar-primary-foreground` ([`Sidebar.tsx:107-108`](../../../client/src/components/Sidebar.tsx#L107)) which resolves through `index.css` to `hsl(220,20%,12%)` — the dark slate is correct per design.json's "active state uses dark slate (#191e29), not the brand accent" rule. But [`Sidebar.tsx:113`](../../../client/src/components/Sidebar.tsx#L113) renders an absolute `bg-primary` left rail (vermillion stripe) on the active item. design.json explicitly forbids `border-left greater than 1px as a colored accent stripe`. The vermillion left rail is decorative and violates the rule — also competes for accent budget with the actual primary CTA on each page.

**Solution:**

1. **Re-enable Account Settings:** drop the `disabled` attribute on `Sidebar.tsx:236`. Wire `onClick={() => navigate("/settings")}` and add a `<Link to="/settings">` wrapper. Verify the `/settings` route renders correctly post-fix (it does today).
2. **Remove the vermillion active-stripe:** delete the absolute `<span className="absolute left-0 ... bg-primary">` at [`Sidebar.tsx:112-114`](../../../client/src/components/Sidebar.tsx#L112-L114). Active state stays dark-slate fill only. Earned-accent budget restored.
3. **Rename ambiguous labels** (no IA restructure in this spec — just clarification):
   - `AI Visibility` → `Visibility Setup` (it is a one-time setup checklist; verb the noun)
   - `Citations` stays
   - `GEO Analytics` → `Visibility Report` (it is the executive snapshot)
   - `AI Intelligence` stays — this label is fine for the deep-analysis surface; rename happens in Spec 3
   - `GEO Tools` → `Optimization Tools`
   - `Signals` → `Page Signals`
   - `Crawler Check` stays
   - `Opportunities` → `Off-Page Opportunities`
4. **Re-group Reports into Measure** (already there) but rename to `Client Reports` to match the route. No file moves.
5. **Verify all `data-tour-id` markers still resolve** after rename. The five group markers `sidebar.group.{setup,create,measure,grow,optimize}` and individual nav targets used by the tour engine ([`Sidebar.tsx:149, 161, 173, 185, 197`](../../../client/src/components/Sidebar.tsx#L149)) are unchanged.

**Rationale:** Smallest possible IA change that addresses Sarah's "what's the difference between GEO Signals, GEO Tools, GEO Analytics?" complaint without restructuring routes. Real consolidation lives in Specs 3 and 4. This spec just fixes labels and reachability.

**Dependencies:** None.

**Out of scope:** Collapsing GEO Analytics + AI Intelligence into one Analytics page (Spec 3). Collapsing GEO Tools + Signals + Opportunities + Crawler Check + FAQ Manager into one `/optimize` workspace (Spec 4). Adding Account Settings to the sidebar as a top-level nav entry (it stays in the user-menu dropdown for now).

---

### 4.3 Settings Page Expansion

**Problem (verified):**

[`settings.tsx`](../../../client/src/pages/settings.tsx) currently contains: read-only email, notification preferences, tour-suppression toggle, account deletion, data export. **Missing:** billing, plan info, profile name edit, password change, timezone, integrations hub. For a SaaS product where Stripe is wired in the stack and a real customer needs to change cards or invite teammates, this is a gap.

**Solution:**

1. Add **Billing** section: embed Stripe customer portal via redirect (`POST /api/billing/portal-session` → returns Stripe portal URL → `window.location.href = url`). One new server route, ~30 lines. Stripe customer ID already lives on `users` table (verify schema).
2. Add **Profile** section: editable first name, last name, timezone (`Intl.supportedValuesOf("timeZone")`). PATCH `/api/user/profile`. Timezone is read at render time only in this spec — full timezone-aware data display is deferred.
3. Add **Password change** section: current password + new password + confirm. Calls Supabase `updateUser({password})` from server with re-auth check.
4. Add **Integrations** section: Buffer connection status (already exists per-distribution; surface here as a single source of truth) + "Coming soon: Slack, Webhooks" placeholders rendered as disabled cards with explicit tooltip text.
5. Apply the design system enforcement from §4.1 — replace `border-destructive/40` on the delete-account section ([`settings.tsx:246`](../../../client/src/pages/settings.tsx#L246)) with a hairline border + destructive button only.

**Rationale:** A real customer at $99–$249/mo will hit "I need to change my card" within month two. Without billing, the only path is email support, which destroys NPS.

**Dependencies:** None for billing (Stripe already wired). Profile and password are independent.

**Out of scope:** Team management / multi-seat (deferred until tier with seats lands). API keys (no public API in this spec). 2FA (deferred — pre-launch product, single-user accounts).

---

### 4.4 Day-0 Alarm Rule

**Problem (verified at [`home.tsx`](../../../client/src/pages/home.tsx)):**

On a brand-new account, before any citation run completes, the dashboard renders six destructive-red panels:

| Component                  | File:line                                                            | Renders red when                              |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| "No Reddit presence found" | [home.tsx:1328-1337](../../../client/src/pages/home.tsx#L1328-L1337) | `redditRows.length === 0` (always true day 0) |
| "Recognition: Unknown"     | [home.tsx:1094-1101](../../../client/src/pages/home.tsx#L1094-L1101) | `citationRate < 20` (always true day 0)       |
| "Underexposed" callout     | [home.tsx:1158-1173](../../../client/src/pages/home.tsx#L1158-L1173) | low share-of-voice                            |
| PromptCoverageMap "Absent" | [home.tsx:1255-1284](../../../client/src/pages/home.tsx#L1255-L1284) | per-category zero rankings                    |
| "Gaps AI identifies" list  | [home.tsx:419-430](../../../client/src/pages/home.tsx#L419-L430)     | hardcoded heuristics that all pre-fire        |
| Failed autopilot banner    | [home.tsx:495-528](../../../client/src/pages/home.tsx#L495-L528)     | error state, no retry button                  |

Plus: every PlatformRankingCard turns red border at 0 citations ([`PlatformRankingCard.tsx:28`](../../../client/src/components/dashboard/PlatformRankingCard.tsx#L28)); RecommendationsPanel P0 always renders `border-red-500/30 bg-red-500/5` ([`RecommendationsPanel.tsx:29`](../../../client/src/components/dashboard/RecommendationsPanel.tsx#L29)).

This inverts design.json's Operator's Console north star: "Numbers come before conclusions." The system delivers verdicts before evidence.

**Solution:**

Establish a cross-cutting **Pre-Data State** rule that every feature spec inherits:

> A surface may render destructive tone **only if** all three are true: (1) at least one citation run has completed for the selected brand, (2) the underlying metric has a non-null value, (3) the metric crosses the failure threshold defined for that surface. Otherwise the surface renders neutral with copy like "Not yet measured" or "Will measure this week."

Concretely in this spec:

1. Compute a derived `hasMeasured` boolean on the dashboard query response: `(citationRunCount > 0 && lastScanAt !== null && autopilot.status !== 'running_citations')`. Pass through to all child components via context (`DashboardStateContext`).
2. Gate every destructive-red render on `hasMeasured` AND a real failure condition. Specific changes:
   - `home.tsx:1094-1101` (Recognition): show "Pending" with neutral chrome until `hasMeasured && citationRate < 20`.
   - `home.tsx:1116-1125` ("Gaps AI identifies"): hide entirely when `!hasMeasured`. Show inline `<EmptyState icon body="We'll surface gaps after your first scan completes" />`.
   - `home.tsx:1158-1173` ("Underexposed"): same gate.
   - `home.tsx:1255-1284` (PromptCoverageMap): render category rows in neutral `bg-muted` "Pending" until per-category data exists.
   - `home.tsx:1328-1337` (Reddit Visibility): show "Reddit scan runs Mondays" message until `runMentionScanJob` has fired at least once for the brand.
   - `home.tsx:495-528` (autopilot banner): add a Retry button on `status === 'failed'` calling new `POST /api/onboarding/autopilot-retry`. Same banner uses brand red only on the Retry CTA, neutral chrome on the message.
   - `PlatformRankingCard.tsx:28`: remove the `border-red` branch on zero citations; render neutral until `hasMeasured`.
   - `RecommendationsPanel.tsx:29`: P0 items lose the destructive tint; switch to a `<StatusDot tone="warn">` + neutral card, brand red only on the action button.
3. Hide the `home.tsx:1082` hardcoded `value="Neutral"` Sentiment tile entirely until real sentiment lands (Spec 3) — replace with a "We're learning your brand voice" placeholder.
4. Hide the `home.tsx:1083-1093` "AI Confidence Score" tile (it duplicates Visibility Score). Spec 3 will replace.
5. Add a `POST /api/onboarding/autopilot-retry` route that re-fires `runOnboardingAutopilot(brandId, userId, { deadlineMs: now + 50000 })` for a brand where `autopilot_status === 'failed'`.

**Rationale:** This is the single biggest single-session trust killer per Sarah's journey simulation. Five red banners on a fresh dashboard read as "your brand is broken" when the truth is "we haven't measured yet." Fix is mechanical but pervasive — cleanest as a cross-cutting rule rather than per-feature patches.

**Dependencies:** None for the pre-data-gate work. Spec 3 and Spec 4 inherit the rule.

**Out of scope:** Replacing `home.tsx`'s 11 numbered sections with a smaller set (Spec 3 will collapse). Day-1 / Week-1 narrative content — stays as-is in this spec.

---

### 4.5 Faking-as-real Cleanup Pass

**Problem (verified, in-scope items only — orphans excluded):**

| #   | Surface                                          | Verified at                                                                                                                                                         | Issue                                                                                                                                                                                                      |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Reports — Export PDF button                      | [client-reports.tsx:111-119](../../../client/src/pages/client-reports.tsx#L111-L119)                                                                                | No `onClick`. No PDF library imported anywhere in `server/`.                                                                                                                                               |
| b   | Reports — Share button                           | [client-reports.tsx:120-123](../../../client/src/pages/client-reports.tsx#L120-L123)                                                                                | No `onClick`. No share-token table. No `/r/` route.                                                                                                                                                        |
| c   | Reports — Schedule Weekly Report button          | [client-reports.tsx:423-426](../../../client/src/pages/client-reports.tsx#L423-L426)                                                                                | No `onClick`. Cron exists but UI doesn't drive it.                                                                                                                                                         |
| d   | Reports — "Next update in 24 hours" copy         | [client-reports.tsx:421](../../../client/src/pages/client-reports.tsx#L421)                                                                                         | False — no scheduled regeneration; data is live each load.                                                                                                                                                 |
| e   | Quora UI — community-engagement                  | [community-engagement.tsx:57, 80, 89, 320, 370, 398, 599, 949](../../../client/src/pages/community-engagement.tsx#L57)                                              | 8 references including SiQuora icon, dropdown option, generate-prompt platform, best-practices section. No Quora scanner exists in [`mentionScanner.ts:8-9`](../../../server/lib/mentionScanner.ts#L8-L9). |
| f   | Quora UI — geo-opportunities                     | [geo-opportunities.tsx:35, 66, 72, 81, 213-432](../../../client/src/pages/geo-opportunities.tsx#L35)                                                                | 12+ references including a dedicated "Quora" tab with link generators driven by hardcoded `INDUSTRY_QUORA_TOPICS` ([`analytics.ts:1327-1369`](../../../server/routes/analytics.ts#L1327-L1369)).           |
| g   | Quora UI — distribute dialog                     | [DistributeDialog.tsx:37](../../../client/src/components/articles/DistributeDialog.tsx#L37)                                                                         | Quora as a distribution platform (copy-paste only).                                                                                                                                                        |
| h   | AI Visibility 404 quick-actions                  | [ai-visibility.tsx:170, 513](../../../client/src/pages/ai-visibility.tsx#L170)                                                                                      | Links to `/publications` and `/geo-rankings` — **both 404 in App.tsx**.                                                                                                                                    |
| i   | Phase indicator theatre                          | [routes/content.ts:64-77](../../../server/routes/content.ts#L64-L77)                                                                                                | `PHASE_BANDS` rotates "Brainstorming themes / Drafting outline / Writing sections / Polishing" purely on elapsed milliseconds.                                                                             |
| j   | Keyword Research metrics                         | [routes/content.ts:691-734](../../../server/routes/content.ts#L691-L734) + [keyword-research.tsx:354-393](../../../client/src/pages/keyword-research.tsx#L354-L393) | `searchVolume`, `difficulty`, `opportunityScore`, `aiCitationPotential` are LLM-fabricated. No DataForSEO/Ahrefs/Google Suggest source.                                                                    |
| k   | "9 AI platforms" claim                           | [geo-analytics.tsx:227, 361](../../../client/src/pages/geo-analytics.tsx#L227)                                                                                      | Only 5 platforms produce data (ChatGPT/Claude/Perplexity/Gemini/DeepSeek per [`citationChecker.ts:42-48`](../../../server/citationChecker.ts#L42-L48)).                                                    |
| l   | `SiOpenai` icon for every platform               | [competitors.tsx:496](../../../client/src/pages/competitors.tsx#L496)                                                                                               | Same icon for Claude/Gemini/Perplexity rows — visual lie.                                                                                                                                                  |
| m   | Snapshot dialog — manual citation count          | [competitors.tsx:768-828](../../../client/src/pages/competitors.tsx#L768-L828)                                                                                      | Asks user to type a number by hand. Contradicts the automated mining everywhere else.                                                                                                                      |
| n   | Animated stage circles                           | [geo-signals.tsx:1357-1361](../../../client/src/pages/geo-signals.tsx#L1357-L1361)                                                                                  | `bg-green-600`, `bg-yellow-600`, `bg-red-500` decorative status fills.                                                                                                                                     |
| o   | Listicle 4px purple left-border                  | [geo-tools.tsx:781](../../../client/src/pages/geo-tools.tsx#L781)                                                                                                   | Border-left > 1px colored accent stripe — explicit design.json don't.                                                                                                                                      |
| p   | FAQ Manager 4px colored left-border              | [faq-manager.tsx:432-440](../../../client/src/pages/faq-manager.tsx#L432-L440)                                                                                      | Same don't.                                                                                                                                                                                                |
| q   | FAQ Manager dark-mode terminal code block        | [faq-manager.tsx schema tab](../../../client/src/pages/faq-manager.tsx)                                                                                             | `bg-slate-900` + `text-green-400` JSON-LD viewer breaks the canonical light workspace.                                                                                                                     |
| r   | community-engagement.tsx Discord/Slack platforms | [community-engagement.tsx:368-376](../../../client/src/pages/community-engagement.tsx#L368-L376)                                                                    | Discord and Slack appear as platform options with no scanner / no posting integration.                                                                                                                     |
| s   | Citations — user-facing schedule menu            | `citations.tsx` (verify exact lines during impl)                                                                                                                    | Per user decision: schedule UI gives users control they shouldn't need. Cadence is a product decision, not a user setting.                                                                                 |
| t   | AI Intelligence — Alerts surface                 | `ai-intelligence.tsx` (verify exact lines during impl)                                                                                                              | Per user decision: alerts surface is removed entirely from this product.                                                                                                                                   |

**Solution per item:**

- **a, b, c, d (Reports):** Per user decision (2026-05-10):
  - Export PDF: **kill** (remove button entirely). Export is out of scope for the platform until a future spec; no CSV stand-in.
  - Share: **kill** (remove button entirely). Public-share infrastructure is its own spec.
  - Schedule Weekly Report: **wire** to existing `weeklyReportEnabled` user preference. Cron already exists at [`scheduler.ts:26-148`](../../../server/scheduler.ts#L26-L148); the toggle on the Reports page now controls the existing per-user flag. (Distinct from Citations: per user amendment, only **Citations** had its schedule menu killed in favor of a non-configurable weekly cadence — see item s.)
  - "Next update in 24 hours" copy: replace with "Last refreshed: <relative time>" sourced from query timestamp.
- **e, f, g (Quora):** strip every reference. `community-engagement.tsx` removes Quora from `platformIcons`, dropdown, prompt branches, best-practices card. `geo-opportunities.tsx` removes the Quora tab and `INDUSTRY_QUORA_TOPICS` references; the server-side `INDUSTRY_QUORA_TOPICS` map ([`analytics.ts:1327-1369`](../../../server/routes/analytics.ts#L1327-L1369)) gets deleted; the `GET /api/geo-opportunities` response shape drops the `quora` bucket. `DistributeDialog.tsx` removes Quora from the platform array. The Quora-side classifier in [`citationChecker.ts:182`](../../../server/citationChecker.ts#L182) (`classifySourceType` mapping `quora.com` → 'community') stays — that's source classification for citations, harmless and orthogonal.
- **h (AI Visibility 404 quick-actions):** at [`ai-visibility.tsx:170`](../../../client/src/pages/ai-visibility.tsx#L170) the "Track Rankings" quickAction → `/geo-rankings` (orphan). Repoint to `/citations` (citations is the real ranking surface). At [`ai-visibility.tsx:513`](../../../client/src/pages/ai-visibility.tsx#L513), `/publications` has no in-product equivalent yet — drop the entire `quickAction` field on that step so the CTA button doesn't render at all (the step's `howTo` copy still teaches the user what to do externally). Audit every other `quickAction.link` value across the eight engines in `aiEngines` ([`ai-visibility.tsx:77-804`](../../../client/src/pages/ai-visibility.tsx#L77)) against the `App.tsx` route table; for each link with no matching route, decide repoint-or-drop.
- **i (Phase indicator):** replace `PHASE_BANDS` time-driven rotation with an honest single line: "Generating ({elapsedSeconds}s)". Add a Cancel button that aborts the OpenAI background run and refunds quota. Remove `phaseFor()` and `PHASE_BANDS` from [`routes/content.ts:58-77`](../../../server/routes/content.ts#L58-L77).
- **j (Keyword Research metrics):** wrap each numeric column with an "AI-estimated" badge + tooltip explaining: "These figures are AI-estimated, not measured. We don't yet integrate a real search-volume source." Server-side, add a `provenance: 'ai-estimate'` field on `keyword_research` rows; UI keys off it. Real-source integration is intentionally deferred — Vercel Hobby + no-extra-services constraints rule out DataForSEO/Ahrefs/Semrush in this spec, and the only no-cost alternatives (Google Suggest, free trends APIs) don't return volumes. Honest labeling is the right shippable answer until paid-tier infrastructure lands.
- **k ("9 platforms" claim):** [`geo-analytics.tsx:227`](../../../client/src/pages/geo-analytics.tsx#L227) and `:361` copy changes to "5 AI platforms (ChatGPT, Claude, Perplexity, Gemini, DeepSeek)". The dead 5 platforms (Grok / Microsoft Copilot / Meta AI / Bing AI / Google AI Overview) are removed from the rendered platform breakdown until real data flows. `AI_PLATFORMS` const in `shared/constants.ts` is split into `AI_PLATFORMS_ACTIVE` (5) and `AI_PLATFORMS_PLANNED` (the rest); UI consumes only ACTIVE.
- **l (SiOpenai for every platform):** [`competitors.tsx:496`](../../../client/src/pages/competitors.tsx#L496) gets a per-platform icon mapping using existing `react-icons` brand glyphs (`SiOpenai`, `SiAnthropic` or fallback `Brain`, `SiGoogle` for Gemini, custom Perplexity icon, `SiDeepseek` if available else fallback). Five icons total.
- **m (Snapshot dialog):** delete [`competitors.tsx:768-828`](../../../client/src/pages/competitors.tsx#L768-L828) entirely. Manual citation count is fabricated data. Remove the trigger Plus icon at `competitors.tsx:651-655` from the row actions.
- **n (Pipeline Sim circles):** swap `bg-green-600/yellow-600/red-500` for `<StatusDot tone="success|warn|fail">`.
- **o, p (4px colored left-borders):** replace with 1px hairline border + `<StatusDot>` glyph at the row start.
- **q (Terminal-aesthetic JSON-LD viewer):** swap `bg-slate-900 text-green-400` for `bg-muted font-mono text-sm border-border`. Same code, neutral chrome.
- **r (Discord/Slack in community-engagement):** drop both from the platform select; leave Reddit + Hacker News only (the two with real scanners). The page header copy updates to "Reddit & Hacker News engagement workflow."
- **s (Citations schedule menu):** grep `citations.tsx` for the schedule/cadence UI (dropdown, dialog, or button group exposing scan-frequency choice) and remove it entirely. The underlying weekly cron stays — citation runs continue to fire on the existing cadence in [`scheduler.ts`](../../../server/scheduler.ts) for every active brand, with no per-user opt-out. Any server-side `citationCheckFrequency` field on `brand_settings` or similar becomes a dead column — keep the column for now (drop in a later migration) but ignore reads/writes. Replace the removed UI region with a quiet info line: "Citation scans run weekly for every brand."
- **t (AI Intelligence alerts):** grep `ai-intelligence.tsx` for the Alerts tab/section/dialog and remove it. Remove any related route handler (`server/routes/ai-intelligence.ts` or wherever `/api/ai-intelligence/alerts*` lives — verify during impl). Remove the underlying `alerts` table reads from the dashboard query if it's surfaced anywhere else. The `alerts` DB table itself stays for now (drop in a later migration once we're sure nothing reads from it) — no destructive schema change in this spec.

**Rationale:** Lying buttons are the highest-leverage trust-killer in the product per the journey simulation. Each cleanup is small individually; together they form the credibility difference between "this works" and "this is half-finished."

**Dependencies:** None.

**Out of scope:** Real PDF rendering. Real DataForSEO integration. Touching `outreach.tsx`, `ai-traffic.tsx`, and other orphan pages. The `/r/<token>` public-share route. Reddit OAuth-on-behalf-of-user.

---

### 4.6 Two Bridge Fixes

**Problem (verified):**

1. `/welcome` confirm path never triggers `scrapeBrandFacts`. [`server/routes/onboarding.ts:441-447`](../../../server/routes/onboarding.ts#L441-L447) calls `runOnboardingAutopilot` only. Brand-fact scraping is wired to `POST /api/brands` and `POST /api/brands/from-website` ([`brands.ts:267-275`](../../../server/routes/brands.ts#L267-L275), [`brands.ts:364-365`](../../../server/routes/brands.ts#L364-L365)) but **not** to `POST /api/onboarding/confirm`. Result: most users finish onboarding and the Brand Fact Sheet page polls every 3 seconds for 2 minutes ([`brand-fact-sheet.tsx:107-128`](../../../client/src/pages/brand-fact-sheet.tsx#L107-L128)) for facts that will never arrive.

2. Keyword Research → Content URL handoff is dead. [`keyword-research.tsx:147-155`](../../../client/src/pages/keyword-research.tsx#L147-L155) builds `/content?keyword=...&industry=...&type=...&brandId=...`. [`content.tsx`](../../../client/src/pages/content.tsx) does not import `useSearch` from wouter and does not parse `URLSearchParams`. Verified by grep — no consumer of any of those four params anywhere in the file. Click "Generate Content" on a keyword → land on a blank draft.

**Solution:**

1. **Welcome → fact scrape:** in [`onboarding.ts`](../../../server/routes/onboarding.ts) confirm handler, after `runOnboardingAutopilot(...)` is invoked, add `setImmediate(() => scrapeBrandFacts(brand.id).catch((err) => logger.warn({ err, brandId: brand.id }, "Welcome-path fact scrape failed")))`. One line of business logic plus error handling. Import `scrapeBrandFacts` from `server/lib/factExtractor`. Verify the same fire-and-forget pattern already used in `brands.ts:267-275` is replicated.
2. **Keyword Research → Content:** in `content.tsx`, on mount, read URL params via `useSearch()` from wouter (`const search = useSearch(); const params = new URLSearchParams(search);`). If `keyword`, `industry`, `type`, or `brandId` are present AND the bootstrap effect creates a new draft, pass them as initial values into the form state setter. ~15 lines including type checks and effect ordering. Update [`keyword-research.tsx:147-155`](../../../client/src/pages/keyword-research.tsx#L147-L155) to confirm param names match what content.tsx now reads.

**Rationale:** Both are 1-line / 15-line fixes that eliminate two of the platform's most disorienting failures. The welcome → fact scrape fix alone removes a 2-minute polling-for-nothing experience for every new user.

**Dependencies:** None.

**Out of scope:** Persisting `keyword_research.article_id` (the column exists; population is in Spec 5's citation-gap → content bridge). Streaming `scrapeBrandFacts` progress to the UI (Spec 2).

---

### 4.7 Onboarding Stack Consolidation

**Problem (verified):**

A first-time user lands on `/dashboard` with **six concurrent guidance UIs** above the fold:

1. `<SidebarOnboarding>` ([`SidebarOnboarding.tsx`](../../../client/src/components/SidebarOnboarding.tsx)) — auto-opens dialog on first login + sidebar widget
2. `<OnboardingProgressRing>` ([`OnboardingProgressRing.tsx`](../../../client/src/components/dashboard/OnboardingProgressRing.tsx)) — same 4 STEPS as a circular gauge card on `/home`
3. `<ResultsTimeline>` ([`ResultsTimeline.tsx`](../../../client/src/components/dashboard/ResultsTimeline.tsx)) — Day 0 / Week 1 / Week 2-3 / Week 4+ tile strip
4. `<RecommendationsPanel>` ([`RecommendationsPanel.tsx`](../../../client/src/components/dashboard/RecommendationsPanel.tsx)) — server-driven P0/P1/P2 from rules engine
5. Autopilot banner ([`home.tsx:495-528`](../../../client/src/pages/home.tsx#L495-L528))
6. Tour engine welcome tour (`TourOrchestrator` mounted at [`App.tsx:232`](../../../client/src/App.tsx#L232))

These disagree. The Sidebar says "Step 3 done" the moment the user visits `/ai-visibility`; the page itself has 53 unchecked boxes. RecommendationsPanel pushes to `/brand-fact-sheet` even after the user filled facts on `/welcome` (because welcome-path doesn't trigger fact scrape — fixed by §4.6). ResultsTimeline says "Day 0: set up your brand" while Recommendations P0 says "Generate citation-check prompts." Three different "next steps" simultaneously.

**Solution:**

Designate `<RecommendationsPanel>` as the canonical onboarding spine. It already runs the most rigorous logic (deterministic rules engine, priority order, dismissal with TTL, real DB-driven state).

1. **Demote `<SidebarOnboarding>`** to a small "Setup: 2/4" link in the sidebar bottom that opens a side drawer showing the same recommendations as on the dashboard. Remove the auto-opening dialog on first login. The sidebar widget itself stays as a status indicator only.
2. **Remove `<OnboardingProgressRing>` from the dashboard mount** at `home.tsx:559` (component file stays, no longer imported by `home.tsx`). The same 4 STEPS render through the Recommendations spine.
3. **Demote `<ResultsTimeline>`** to a single line above the recommendations: "Day 3 of week 4 — first AI citations typically appear week 2." No tile strip. Remove from `home.tsx:561`. The component file stays; only the dashboard usage changes.
4. **Recommendations spine layout** (canonical, on `/dashboard` and accessible from sidebar drawer):
   - Header: "What to do next"
   - Top-1 recommendation rendered as a primary card with action button inline
   - Side rail collapsed by default: remaining recs with priority chip + dismiss
   - Below: timeline single-line
5. **Sidebar widget** (the small "Setup: 2/4") deep-links to `/dashboard#recommendations` (anchor scroll). On mobile, the spine surfaces as the first card.
6. **Autopilot banner** stays but moves _into_ the spine header position — when autopilot is running, the spine header reads "Setting up your visibility report (Step 2/3)" instead of the static "What to do next." Same visual region, two states.
7. **Tour engine** — verify the `globalWelcomeTour` ([`global-welcome.tour.ts`](../../../client/src/tours/...)) targets still resolve with the consolidated layout. If targets like `dashboard.progressRing` no longer exist (because the ring was deleted), the tour engine silently no-ops on those steps — re-author the welcome tour to target the spine instead.

**Rationale:** Six guidance UIs is six too many. The recommendations engine is the only one driven by real state and real rules. Pick it; subsume or demote the rest.

**Dependencies:** §4.4 (Day-0 alarm rule must land first so the spine doesn't render destructive recommendations on a brand-new account).

**Out of scope:** Adding new recommendation rules. Cross-page recommendation surfacing (Spec 4 unifies this for the `/optimize` cluster).

---

### 4.8 Email Verification

**Problem (verified at [`server/auth.ts:288`](../../../server/auth.ts#L288)):**

`createUser({ email_confirm: true })` skips Supabase email verification. Anyone registers with `[REDACTED EMAIL]` and is instantly logged in. For a B2B GEO product where domain authority is implied, this is a credibility hole and an abuse vector.

**Solution:**

1. Flip [`server/auth.ts:288`](../../../server/auth.ts#L288) to `email_confirm: false`. Add a verification-required flow:
   - Server returns `{ success: true, requiresVerification: true }` instead of an immediate session.
   - Client `register.tsx` redirects to a new `/verify-email` page (or reuses `forgot-password`'s post-submit pattern: "Check your email for a verification link").
   - The verification link goes to Supabase's hosted handler; Supabase redirects back to `/` once verified, where the user lands authenticated.
2. Ship a welcome email via Resend on first verified login. Single template: "Welcome to VentureCite. Here's what to do next." The cron / event hook lives in `server/lib/notificationPrefs.ts` or a new `welcomeEmail.ts`. Trigger: first `users.lastLoginAt` set with `emailVerifiedAt` non-null.
3. Add a "Resend verification link" affordance on the post-submit screen, with a 60-second cooldown and rate limit (3/hr per (IP, email)).

**Rationale:** Email verification is table stakes for B2B SaaS and the existing Supabase + Resend infrastructure makes it ~half a day of work.

**Dependencies:** None.

**Out of scope:** Domain verification (does the user own `acme.com`?). MX-record checks. Email-OTP magic-link login (deferred to Spec 6).

---

### 4.9 AI Disclosure Global Pattern

**Problem (verified):**

No AI-disclosure label anywhere in the app. `articles.author` defaults to `"GEO Platform"` ([`shared/schema.ts:211`](../../../shared/schema.ts#L211)) but no UI exposes "this was AI-written." For a product whose value prop is "AI-cited," shipping articles with no disclosure is both a regulatory risk (FTC AI-disclosure guidelines) and a trust break.

**Solution:**

1. Add `articles.ai_generated BOOLEAN NOT NULL DEFAULT false` column. Migration in `migrations/0052_ai_generated_flag.sql`. Backfill all existing articles created via `/api/articles/draft` and downstream `setArticleReady` to `true`.
2. In [`server/contentGenerationWorker.ts:166-167`](../../../server/contentGenerationWorker.ts#L166), when the article transitions to `ready` from a generated job, set `ai_generated: true`. Manual edits do not flip this flag.
3. Ship `<AIGeneratedPill />` component that renders `<Sparkles /> AI-generated` in muted chrome. Mount on:
   - `articles.tsx` row card title row
   - `ViewEditDialog.tsx` header
   - `DistributeDialog.tsx` preview
   - `content.tsx` ready-state header
4. Add an `aiGenerated` field to the public article representation if a public-share route lands later (out of scope here, but the column is in place).

**Rationale:** Cheap, low-risk, eliminates an emerging compliance and credibility gap.

**Dependencies:** None.

**Out of scope:** `schema.org/CreativeWork`-style structured-data disclosure on rendered article HTML (deferred to whenever public-share lands).

---

### 4.10 Loading + Empty State Primitives

**Problem (verified):**

At least three loading idioms across the app: `Skeleton` (citations, dashboard), `Loader2` spinner (run-check button, generation), full-page `<div className="...border-violet-600...animate-spin" />` (App.tsx route transitions). Empty states are bespoke per page — `EmptyState` exists but coexists with hand-rolled inline `Card` patterns ([`citations.tsx:523-535`](../../../client/src/pages/citations.tsx#L523-L535) vs [`brand-fact-sheet.tsx:518-543`](../../../client/src/pages/brand-fact-sheet.tsx#L518-L543) vs [`articles.tsx:617-623`](../../../client/src/pages/articles.tsx#L617-L623)).

**Solution:**

1. Single canonical `<RouteSpinner />` (already covered in §4.1).
2. Single canonical `<Skeleton variant="card|line|circle" />` — replace ad-hoc `<div className="animate-pulse bg-muted">` with the primitive.
3. Single canonical `<EmptyState icon title body cta?>` — replace bespoke patterns. Sweep the ~12 unique empty-state implementations.
4. Establish the rule: cards never show spinners; cards show skeletons. Spinners appear only in: button submit states, full-route initial loads, modal-internal loads.

**Rationale:** Visual consistency is downstream of primitive consistency. Foundations is the right place to ship the primitives.

**Dependencies:** §4.1 design system primitives.

**Out of scope:** Animating skeletons differently per data type. Page-transition orchestration.

---

### 4.11 Hardcoded Fallback Inputs

**Problem (verified at [`server/routes/dashboard.ts:574-579`](../../../server/routes/dashboard.ts#L574-L579)):**

```ts
lastSignalsScanAt: null,
visibilityChecklistCompleted: 0,
visibilityChecklistTotal: 4,
```

Inline comments in the same file acknowledge: "No persisted last-scan timestamp yet — engine treats null as 'never'." and "No checklist-progress storage method yet — defensive default treats user as 'haven't started.'"

Consequence: in [`server/lib/recommendationsEngine.ts:163-181`](../../../server/lib/recommendationsEngine.ts#L163-L181), rule #8 (`signalsStale = lastSignalsScanAt === null || ...`) **always fires** because the input is always null. Rule #9 (`visibilityChecklistCompleted / total < 0.5`) **always fires** because the input is always 0/4. Both are P1 dismissible — they appear, the user dismisses for 7 days, they re-appear forever.

**Solution:**

1. **Persist GEO Signals scans:** new table `geo_signal_runs (id, brand_id, article_id, ran_at, overall_score, payload jsonb)`. The existing `analyze` endpoint writes a row on each run. `dashboard.ts:574` now reads `MAX(ran_at) WHERE brand_id = $1` from this table.
2. **Persist visibility checklist progress:** new table `visibility_progress (user_id, brand_id, engine_id, step_id, completed_at)` keyed by `(user_id, brand_id, engine_id, step_id)`. Toggle handler at [`ai-visibility.tsx:845-880`](../../../client/src/pages/ai-visibility.tsx#L845-L880) inserts/deletes rows. `dashboard.ts:577` now reads `COUNT(*)` per brand and computes ratio against the static checklist size (53 steps total per [§4.5 audit]).

These changes silence the two false-positive rules without changing the rules themselves.

**Rationale:** A surface telling users "you haven't done X" when they have done X destroys product trust the moment they notice. The persistence is straightforward; the absence is the bug.

**Dependencies:** None for the table additions. §4.5 (Faking-as-real cleanup) doesn't depend on this; they can land in parallel.

**Out of scope:** Aggregating recommendation completion across the three rec engines (Spec 4). Recurring re-scan reminders.

---

## 5. Sequence

Foundations is one spec but lands in a recommended order to minimize merge conflicts and isolate breakage:

1. **Wave A (parallel-safe, ~3 days):** §4.6 (bridge fixes), §4.8 (email verification), §4.9 (AI disclosure column + pill), §4.11 (persistence tables + writes), §4.5 (faking-as-real cleanup, all sub-items in parallel because they're independent). Each is independent and small.
2. **Wave B (parallel-safe, ~5 days):** §4.1 (design system enforcement), §4.10 (loading + empty primitives), §4.2 (sidebar IA), §4.3 (settings page expansion). Wave B can start as soon as Wave A's primitives are stable.
3. **Wave C (sequential, ~3 days):** §4.4 (Day-0 alarm rule), then §4.7 (onboarding stack consolidation, depends on §4.4). End of Foundations.

Total estimate: **~2 weeks of focused work.**

## 6. Success Criteria

Foundations is complete when **every** statement below is true, verified in code:

- [ ] No `border-violet-*` class anywhere in `client/src/` (grep returns 0 matches).
- [ ] No `bg-stone-*`, `bg-neutral-*` on authenticated routes (`landing.css` and `landing.tsx` exempt).
- [ ] No raw `bg-red-{600,700}` for primary actions; primary CTAs use `bg-primary` token.
- [ ] No `text-violet-*` anywhere in `client/src/pages/` (Brand Fact Sheet specifically clean).
- [ ] No hardcoded chart hex `#3b82f6`, `#f97316`, etc., in `home.tsx:247-258` — replaced with `hsl(var(--chart-N))`.
- [ ] No `bg-gradient-to-*` on authenticated routes.
- [ ] All KPI numbers across dashboard, analytics, citations, ai-intelligence, geo-tools, faq-manager render with `font-mono` or `tabular-nums`.
- [ ] `<KPITile>`, `<Section>`, `<EmptyState>`, `<StatusDot>` primitives shipped and used in at least 4 pages each.
- [ ] `Sidebar.tsx:236` Account Settings is no longer `disabled`; clicking it navigates to `/settings`.
- [ ] Sidebar vermillion left-stripe at `Sidebar.tsx:112-114` removed.
- [ ] Settings page contains a Billing section that opens Stripe customer portal.
- [ ] Settings page contains a Profile (name + timezone) and Password change section.
- [ ] Reports buttons: Export and Share removed entirely; Schedule toggle now drives the existing `weeklyReportEnabled` user preference (no longer a no-op).
- [ ] No schedule/cadence UI on `/citations`; replaced with "Citation scans run weekly" info line.
- [ ] No Alerts surface anywhere in `/ai-intelligence` (tab, dialog, or route).
- [ ] No Quora references in `community-engagement.tsx`, `geo-opportunities.tsx`, or `DistributeDialog.tsx`.
- [ ] `ai-visibility.tsx:170, 513` no longer link to 404 routes.
- [ ] `PHASE_BANDS` removed from `routes/content.ts:64-77`. Phase indicator shows elapsed seconds only.
- [ ] Keyword Research metrics carry an "AI-estimated" badge or tooltip.
- [ ] `geo-analytics.tsx:227, 361` say "5 AI platforms" with the named platforms.
- [ ] `competitors.tsx:496` uses per-platform icons.
- [ ] Snapshot dialog at `competitors.tsx:768-828` is deleted.
- [ ] Dashboard renders no `text-destructive` panels on a brand-new account before any citation run completes.
- [ ] `home.tsx:1082` "Neutral" hardcoded sentiment hidden until real sentiment lands.
- [ ] `home.tsx:1083-1093` AI Confidence Score tile hidden.
- [ ] On a brand-new account, the dashboard shows 1–2 calm guidance surfaces, not 6.
- [ ] `<SidebarOnboarding>` no longer auto-opens a dialog on first login.
- [ ] `<OnboardingProgressRing>` is no longer rendered on `/dashboard`.
- [ ] `<ResultsTimeline>` is reduced to a single line.
- [ ] `articles.ai_generated` column exists and is populated by the worker.
- [ ] `<AIGeneratedPill>` renders on Articles list, ViewEditDialog, DistributeDialog, content.tsx ready state.
- [ ] Email verification is required for new registrations.
- [ ] Welcome email fires on first verified login.
- [ ] `geo_signal_runs` and `visibility_progress` tables exist and are written.
- [ ] `dashboard.ts:574-579` reads from those tables instead of returning hardcoded `null/0`.
- [ ] `RecommendationsPanel` no longer surfaces rule #8 or #9 on a brand that has actually scanned signals or completed checklist steps.
- [ ] `/welcome` confirm path triggers `scrapeBrandFacts` via `setImmediate`.
- [ ] `/content` reads URL params for keyword/industry/type/brandId and pre-populates the form.

A spot-check of any 5 of the above proves Foundations work landed.

## 7. Risks

- **Scope creep into Spec 3/4 territory.** Some items (e.g., collapsing rec engines) tempt cross-pollination. Hard rule: anything touching `/citations`, `/geo-analytics`, `/ai-intelligence`, `/geo-tools`, `/geo-signals`, `/faq-manager`, `/crawler-check`, or `/opportunities` page-level structure stays in Specs 3–4. Foundations only touches design tokens, copy, and obvious 404 link rewires inside those pages.
- **Email verification breaking existing test accounts.** Mitigation: backfill `email_confirmed_at = now()` for all existing users in the migration that flips the flag.
- **Tour engine targets stale after sidebar consolidation.** Mitigation: tour engine silently no-ops on missing targets; verify the welcome tour still produces a meaningful first-run experience after rename. If not, re-author the tour file.
- **Stripe customer-portal redirect failing on test mode.** Mitigation: gate the portal-session route behind `STRIPE_SECRET_KEY` env presence; show "Billing not yet configured" placeholder otherwise.

## 8. What Lands in Subsequent Specs

For traceability, deferred items by spec:

- **Spec 2 (Brand profile + Fact Sheet):** agentic deep research rebuild; SSE progress streaming for fact scrape; per-source UI; "How AI describes you vs how you describe yourself" diff view; valueType discriminated union for non-string facts.
- **Spec 3 (Citation analytics):** collapse `/geo-analytics` + `/ai-intelligence` into one Analytics page; deprecate `prompt_portfolio` table; per-engine health row; verbatim-quotes panel; source-domain rollup.
- **Spec 4 (Optimization workspace):** unify `/geo-tools` + `/geo-signals` + `/opportunities` + `/crawler-check` + `/faq-manager` into `/optimize`; one rec engine across all; persist all scans; FAQ schema publish-back loop.
- **Spec 5 (Content engine):** citation-gap → content bridge with `articles.target_prompt_id` FK; full-page editor route; FAQ JSON-LD output; sources/RAG; internal/external link suggestions.
- **Spec 6 (Differentiator features):** AI Tutor → real copilot with tool use, pathname context, deep-link rendering, proactive greeting; "How AI describes you" diff view standalone; Reports PDF + share-token + scheduling UI.

---

## Appendix: Files Touched (Estimated)

**Created:**

- `client/src/components/foundations/KPITile.tsx`
- `client/src/components/foundations/Section.tsx`
- `client/src/components/foundations/EmptyState.tsx` (or move existing)
- `client/src/components/foundations/StatusDot.tsx`
- `client/src/components/foundations/RouteSpinner.tsx`
- `client/src/components/AIGeneratedPill.tsx`
- `client/src/pages/verify-email.tsx` (or reuse forgot-password pattern)
- `migrations/0052_ai_generated_flag.sql`
- `migrations/0053_geo_signal_runs.sql`
- `migrations/0054_visibility_progress.sql`
- `server/routes/billing.ts` (Stripe portal session)
- `server/routes/onboarding.ts` (autopilot-retry route)
- `server/lib/welcomeEmail.ts`

**Modified (non-exhaustive):**

- `client/src/App.tsx` (RouteSpinner)
- `client/src/components/Sidebar.tsx` (re-enable settings, remove vermillion stripe, label renames)
- `client/src/pages/home.tsx` (Day-0 gates, hardcoded sentiment removal, primitive adoption)
- `client/src/pages/register.tsx`, `login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `welcome.tsx` (token sweep)
- `client/src/pages/brand-fact-sheet.tsx` (full violet purge)
- `client/src/pages/citations.tsx`, `ai-visibility.tsx`, `geo-analytics.tsx`, `ai-intelligence.tsx`, `competitors.tsx`, `community-engagement.tsx`, `geo-opportunities.tsx`, `geo-tools.tsx`, `geo-signals.tsx`, `faq-manager.tsx`, `client-reports.tsx`, `content.tsx`, `articles.tsx`, `keyword-research.tsx`, `settings.tsx` (token sweep, primitive adoption, faking-as-real cleanup per §4.5)
- `client/src/components/dashboard/RecommendationsPanel.tsx`, `OnboardingProgressRing.tsx` (one removed from dashboard, one survives), `ResultsTimeline.tsx` (demoted)
- `client/src/components/SidebarOnboarding.tsx` (auto-dialog removed)
- `client/src/components/articles/ViewEditDialog.tsx`, `DistributeDialog.tsx`, `MarkdownEditor.tsx` (AI pill, Quora removal, design tokens)
- `server/auth.ts` (email verification flip)
- `server/routes/onboarding.ts` (welcome → fact scrape bridge)
- `server/routes/content.ts` (PHASE_BANDS removal, AI-estimated keyword tags)
- `server/routes/dashboard.ts` (read from new persistence tables)
- `server/routes/analytics.ts` (Quora map deletion, geo-opportunities cleanup)
- `server/contentGenerationWorker.ts` (set ai_generated on completion)
- `client/src/index.css` (no changes — tokens already correct)
- `shared/constants.ts` (`AI_PLATFORMS_ACTIVE` split)
- `shared/schema.ts` (ai_generated column, new tables)

**Deleted:**

- `client/src/pages/competitors.tsx` Snapshot dialog block ([:768-828](../../../client/src/pages/competitors.tsx#L768-L828))
- `server/routes/analytics.ts` `INDUSTRY_QUORA_TOPICS` map ([:1327-1369](../../../server/routes/analytics.ts#L1327-L1369))
- `server/routes/content.ts` `PHASE_BANDS` + `phaseFor` ([:64-77](../../../server/routes/content.ts#L64-L77))
- (Components / hooks for removed onboarding surfaces stay as files; only their dashboard-level mounts are removed.)
