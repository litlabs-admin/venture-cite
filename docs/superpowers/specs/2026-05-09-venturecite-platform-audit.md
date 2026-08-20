# VentureCite Platform Audit — May 2026

**Date:** 2026-05-09
**Scope:** Full-platform audit of code, UX, and competitive positioning, prompted by client feedback (Ben/Vandan/Vivek meeting transcript) and the user's own confusion about flow and value.
**Method:** Six parallel research agents (backend, frontend, journey, brand-fact-sheet, AI Tutor, competitor research) + structural reads + web research across the GEO/AEO competitive landscape.
**Constraint:** Code only — no `.md` files were used as sources because they are out of date.

---

## TL;DR — The Verdict

**The engine works. The product is a maze.**

VentureCite has built a genuinely capable citation-tracking and brand-monitoring engine — the matcher, the workflow engine, the citation runner, and the agent task system are real, well-engineered, and runnable end-to-end. The team has shipped a lot.

But the product the user sees is structurally incoherent:

- **Three competing onboarding systems** (sidebar checklist, dashboard ring, recommendations panel) plus a **fourth that's entirely dead code** (the tour engine ships but is never mounted).
- **22 sidebar destinations** in 5 sections, with 4 different pages showing ~70% the same citation data, and 8 page files that exist but have **no route and no nav entry**.
- **The brand fact-sheet scraper** is a 2022-era homepage-text-only pipeline — exactly what the user complained about — with no agent loop, no multi-source enrichment, and an LLM-only fallback that **fills the brand profile from training-data hallucinations** when the site is hard to scrape.
- **Quora is dead in scanning but alive in 5+ other places** — recommendations, distribute endpoint, opportunities, citation source classifier — all still pushing Quora at users it can't track.
- **The freshly-shipped AI Tutor** is a polished but architecturally thin Q&A bot — no tool use, no page context, only 5 fields of brand state per turn — that "papers over" the IA confusion rather than fixing it.

**Not ready for unsupervised customer testing.** A non-technical SaaS founder will land on the dashboard, see 11 cards full of slightly-alarming numbers (`Underexposed`, `No Reddit presence`, `Unknown` recognition) on a 1-day-old account, click "AI Tutor" once, get nothing proactive, and leave.

**But the gap to ready is smaller than it looks.** Most of the issues are wiring, deletion, and IA simplification — not "rebuild the engine." Three sharp waves of work get this to a credible test:

1. **Wave 1 (1–2 weeks):** Surgical cleanup — kill orphan pages, mount the tour engine, finish the Quora removal, fix the dashboard onboarding stack, route /settings, kill the fake outreach data. Mostly deletion and wiring.
2. **Wave 2 (2–3 weeks):** Reframe onboarding around a single canonical "Day 1 → Week 1 → Week 4" arc with one source of truth; collapse the duplicate citation pages into one analytics surface; add the citation-gap → content-generated bridge. Real product work.
3. **Wave 3 (3–6 weeks):** Rebuild the brand fact sheet as agentic deep research; add tool-use to the AI Tutor so it can actually do things; add a "What AI says about you today vs how you describe yourself" diff view (the white-space differentiator no competitor has).

Then test.

The competitive landscape is forgiving here — Profound is enterprise/$2K+/mo, Goodie is $495/mo entry, Athena is $295/mo, Otterly is $29/mo SMB. There's a real $99–$299/mo "for serious founders, not enterprise, with a copilot that actually does things" lane. **"Become the answer"** is **not taken** — Athena's "Become the Brand AI Trusts" is the closest. Ben's framing is available.

The rest of this document supports each of those claims with specific file paths, line numbers, and citations.

---

## 1. How VentureCite Works Today (For Grounding)

The product is a multi-tenant SaaS at `c:\Users\yoges\OneDrive\Desktop\venturecite\` with:

- **Frontend:** React 18 + Vite + Wouter + TanStack Query + Radix/Tailwind. **36 page files**, **18 sidebar entries**, **24 routes registered** in `client/src/App.tsx`.
- **Backend:** Express 4 (ESM) + Drizzle + raw `pg.Pool` + Supabase JWT auth. **23 route files** in `server/routes/`, **70+ libs** in `server/lib/`, **51 migrations**.
- **External:** OpenAI (direct), OpenRouter (multi-model citation runs + chatbot), Stripe webhooks, Resend email, Reddit OAuth, HackerNews via Algolia, Wikipedia API, Buffer (BYO key), Shopify webhooks, Sentry.
- **Workers:** Vercel-cron-driven daily orchestrator (`/api/cron/daily-orchestrator`, 55s budget, ~17 steps), plus a polling content-job slicer driven by client `/advance` calls + cron drains. No persistent leader-elected workers.

**The intended user journey:**

1. User signs up at `/register` → no email verification → straight into `/`
2. `FirstRunGate` sees no brands → redirects to `/welcome` (visible URL flicker)
3. User pastes their domain → SSE-streamed scrape → confirm form (10 fields) → submit
4. Server fires `runOnboardingAutopilot` inline with 50s deadline:
   - Step 1: Generate 10 tracked prompts via `generateBrandPrompts` (`gpt-4o-mini`)
   - Step 2: Run those prompts against ~5 AI engines (ChatGPT, Claude, Perplexity, Gemini, DeepSeek) → 30–120s
   - Step 3: Mark complete, fire competitor discovery + brand-fact-sheet scrape via `setImmediate` (fire-and-forget)
5. User lands on `/dashboard?brandId=…` with autopilot banner running, then dashboard fills with real numbers
6. From there: a 22-link sidebar, a 4-step onboarding checklist (different from the 50+ engine-specific checkboxes on `/ai-visibility`), a P0/P1/P2 recommendations panel, and the AI Tutor as a floating drawer

The engine works. The user experience around it is what we're auditing.

---

## 2. Mapping Ben's Meeting Feedback to Code Findings

Each item from the meeting transcript and the user's review, paired with what the code actually says.

### "I'm super confused and overwhelmed on the flow"

**Confirmed at the code level.** The product currently has **four to seven concurrent onboarding/guidance surfaces**, not counting the chatbot:

1. `client/src/components/SidebarOnboarding.tsx` — 4-step dialog that auto-opens on first login
2. `client/src/components/dashboard/OnboardingProgressRing.tsx` — same 4 steps as a circular gauge card on `/dashboard`
3. `client/src/components/dashboard/ResultsTimeline.tsx` — Day 0 / Week 1 / Week 2-3 / Week 4+ tile strip (calendar-based, not action-based)
4. `client/src/components/dashboard/RecommendationsPanel.tsx` — server-driven P0/P1/P2 recs from `server/lib/recommendationsEngine.ts`
5. `client/src/pages/brands.tsx:582-609` — inline "Next Step: Get Your Brand Cited by AI Engines" CTA card pointing to `/ai-visibility`
6. `client/src/pages/ai-visibility.tsx` — 50+ engine-specific checkboxes (the only "real" depth checklist) — also reachable as one of the 4 sidebar steps
7. **The Tour Engine** — `client/src/tours/` contains 6 page tours + 9 nudges + 1 global welcome — built but **never mounted**: `client/src/components/AppLayout.tsx` does not import `TourOrchestrator`

These don't agree with each other. The Sidebar says "Step 3 done" the moment the user visits `/ai-visibility`, while the page itself has 50 unchecked boxes. The Recommendations Panel pushes the user to `/brand-fact-sheet` even after they completed the fact sheet on `/welcome` — because the data lives in two places (see §4).

Verdict: **the user is right to be confused — the product genuinely does not have a single canonical "do this next" arrow.**

### "The brand fact sheet captures only very simple things"

**Confirmed.** Audit detail in §4. Root cause is structural: `server/lib/factExtractor.ts` walks a hardcoded 10-page list (`/`, `/about`, `/team`, `/pricing`, `/press`, `/faq`, etc.), strips HTML with regex, truncates each page to 8000 chars, and runs **one** `gpt-4o-mini` JSON-mode call per page. No headless browser (so SPA marketing sites return shells), no sitemap crawl, no external sources (Crunchbase, LinkedIn, G2, Wikipedia infobox), no agentic loop, no verification pass, no follow-up questions. The `confidence` field is parsed and discarded. Two parallel data sets (`brands.description` and `brand_fact_sheet.factValue`) never reconcile — the UI shows only the latter.

`client/src/pages/brand-fact-sheet.tsx:518-523` literally apologizes to the user for SPA blindness in copy. The pipeline is honest, well-engineered code; the **strategy** is single-pass extraction, not research. Modern users implicitly compare against Perplexity Deep Research / OpenAI Deep Research — anything that returns 10 short key-value pairs in 5 seconds reads as broken.

### "Test the other logo or do something to clean up and modernize the design"

The current sidebar mounts `@assets/logo.png` (`client/src/components/Sidebar.tsx:34`), 36px tall on a 220px-wide aside. Branding is uniform but uninspired — it reads as default-Tailwind-SaaS, not a category leader. Visual benchmarking against competitors:

- Profound, AthenaHQ, Goodie, Scrunch all use bold serif/condensed-sans hybrid wordmarks with restrained palettes (mostly black + 1 accent)
- Otterly leans on a fun mascot ("we *otter* know") — works for SMB
- Daydream uses heavy editorial typography (Söhne-style)

VentureCite's current logo + violet primary feels closer to "AI startup template" than premium SaaS. Worth a fresh swing — but it should be sequenced after IA cleanup so a new identity doesn't ride a confused product.

### "Text is squished together"

**Confirmed in two specific places** (the user's screenshots):

1. `client/src/pages/citations.tsx` (Prompts tab inside) — section headers with format: `Suggested prompts (5)` + paragraph subtitle + ad-hoc inline metadata `Seeded 12 days ago` jammed into the description string.
2. The general anti-pattern in `client/src/pages/home.tsx:140` (`Section` component): `<p className="text-xs text-muted-foreground mt-0.5 truncate">` — long descriptive subtitles get hard-truncated when they should `line-clamp-2` and metadata should be a separate row of chips.

This is a system-wide pattern, not a one-off. Fixing it means a single change to the shared `Section`/`PageHeader`/section-header components, plus pulling the metadata strings (`Seeded 12 days ago`) into a structured slot. Worth doing; trivial PR.

### "We should test the other logo or do something to clean up and modernize"

See above.

### "I want to get this into a place where I can let customers test it but it's not there yet"

**Confirmed.** The journey-trace agent ran the full path from signup to first dashboard and identified five day-1 friction points and five week-1 friction points. The five most damaging:

- **Day 1, #1:** Tour engine never mounts (the most obvious "first-run experience" feature is dead code). New user has no narration.
- **Day 1, #2:** Sidebar is a 22-link wall with 5 jargon-heavy section labels.
- **Day 1, #3:** Autopilot banner has no time estimate, no "what is happening", no result interpretation. Dashboard cards show alarming defaults on day 1.
- **Day 1, #4:** "Account settings" in user dropdown is `disabled` (`client/src/components/Sidebar.tsx:226`) — users can't reach `/settings`, which is where notification preferences and GDPR delete/export live.
- **Day 1, #5:** Fact sheet exists in two places (`/welcome` form vs `/brand-fact-sheet` CRUD); recommendations push the user to the second one without acknowledging the first exists.

### "The AI Tutor — does it work?"

**Audit in §6.** Verdict: it's a polished but architecturally thin Q&A bot. The system prompt is genuinely good (anti-hallucination rules, sidebar taxonomy, "Next:" pointer convention). But:

- **Zero tool use** — cannot fetch live data mid-conversation, cannot trigger any backend action
- **No page context** — doesn't know what page the user is on
- **5 brand-context fields** injected per turn (name, industry, has-articles, citation runs in 30 days, latest run citation rate) — anything else requires fabrication
- **Cannot deep-link** — replies are markdown text, no parser converts "Open **Citations**" into navigation
- Always-available, never proactive — never says hello, never suggests anything

The chatbot cannot solve onboarding by itself because it's compensating for a navigation problem. Fix IA first, then give the chatbot tool-use. Both are needed; in that order.

---

## 3. The Backend — What's Real, What's Stub, What's Dead

### 3.1 The citation engine: surprisingly strong

`server/citationChecker.ts` (1369 lines) is the spine and is real:

- Per `(prompt × platform)` queue with concurrency 5, single retry on transient failure
- 5 platforms: ChatGPT (direct OpenAI `gpt-4o-mini`), Claude (`anthropic/claude-haiku-4.5` via OpenRouter), Gemini (`google/gemini-2.5-flash-lite`), Perplexity (`perplexity/sonar`), DeepSeek (`deepseek/deepseek-v3.2`)
- **Brand matching is sophisticated** (`server/lib/brandMatcher.ts`): whole-word regex on user-editable variants, diacritic folding, legal-suffix stripping, possessive-tolerant, ambiguity gate (≤3-char names + curated common-word list require a "signal word" within 60 chars)
- **Variant learning** during runs: analyzer-surfaced surface forms append to brand/competitor variants on the fly
- **Auto-discovery**: untracked brands found in cited responses get inserted as competitors with `discoveredBy='citation_auto'` (matcher-confirmed)
- **Self-citation tracking** (Wave 9.4): if a tracked BOFU/FAQ URL appears in a response, stamps `lastCitedAt`
- **Hallucination detection** (`hallucinationDetector.ts`) + reverification baked into the run
- **Resume-able** via partial unique index (`migrations/0035`) and `kickoffBrandPromptsRun` + `advanceCitationRun` slicing pattern that respects Vercel Hobby's 60s function ceiling

**Concerns:**

- The 1369-line single function is a refactor target — it does ~12 things (queue, resume, concurrency, variant learning, disagreement logging, self-citation, auto-discovery, finalize, metrics, hallucination detect, reverification). Editing safely is risky.
- `server/citationJudge.ts` is **dead in the main path** — every `runBrandPrompts` call passes `skipJudge: true`. Replaced by `responseAnalyzer.analyzeResponse`. File still imported.

### 3.2 Workers, jobs, crons

All real, all wrapped in `withAdvisoryLock`:

| Job | Schedule | Purpose |
|---|---|---|
| `runAccountPurgeJob` | `0 3 * * *` | Hard-delete users past 30-day grace |
| `runBrandPurgeJob` | `30 3 * * *` | Hard-delete soft-deleted brands |
| `runAutoCitationJob` | `0 * * * *` | Re-run tracked prompts per brand schedule |
| `runCompetitorDiscoveryJob` | `0 7 * * 1` | Weekly competitor discovery |
| `runMentionScanJob` | `0 9 * * 1` | Weekly mention scan (Reddit + HN only) |
| `runListicleScanJob` | `0 11 * * 1` | Weekly listicle scan via Perplexity |
| `runFactRefreshJob` | `0 10 1 * *` | Monthly fact-sheet refresh |
| `runWeeklyCatchupKickoff` | `0 6 * * 1` | Per-(user × brand) weekly catchup workflow |
| `runWeeklyReportJob` | `0 8 * * 0` | Per-brand visibility report email |

Day-gated under `/api/cron/daily-orchestrator` on Vercel; `STEP_CAPS_MS` enforces a 55s wall budget. Lazy-eval workflow tick fires per-authed-request via `waitUntil` with a 10s in-memory debounce.

**Concerns:**

- Auto-citation `autoCitationHour` is silently ignored (`scheduler.ts:178: void currentHour;` since Wave 9.5) but the UI still shows an hour picker.
- `setImmediate` fire-and-forget in `routes/brands.ts:265-291` (kicks `scrapeBrandFacts` + `discoverCompetitors`) — on Vercel serverless the lambda may freeze before these complete; prod silently loses work.

### 3.3 External integrations — all real

OpenAI direct (`OPENAI_API_KEY` required), OpenRouter (citation + chatbot), Reddit OAuth (3-tier strategy: OAuth → public JSON → RSS fallback), HackerNews via Algolia, Stripe (HMAC-verified, webhook idempotent via `stripe_webhook_events`), Resend (email + Svix-verified webhook for bounce/complaint tracking), Buffer (BYO key, AES-256-GCM encrypted via `tokenCipher`), Shopify (HMAC-verified, fails closed when secret missing), Wikipedia (MediaWiki API), Sentry.

**Concerns:**

- `MODELS.misc` collapses to `gpt-4o-mini-2024-07-18` for *everything* except citation paths and chatbot. Fact extraction, hallucination detection, sentiment, keyword research, brand autofill, competitor discovery, content generation rewriter — all the same cheap model. Some of these (fact extraction, hallucination detection) would benefit measurably from a stronger model.
- A comment in `server/routes.ts:96` mentions "the newest OpenAI model is gpt-5… do not change" — gpt-5 is not actually used anywhere.

### 3.4 The agent / workflow engine — real and runnable

`server/lib/workflowEngine.ts` is a real state machine: advisory-lock per run, awaiting_approval gates, parallel-step support with `onPartialFailure`, an `awaitJob` step that drives content-generation slices itself when a tick fires. Three workflows registered:

1. `winAPrompt.ts` — 7 steps: baseline_citation → gap_analysis → content_brief (approval) → generate_article → await_article_job → outreach_discovery (approval) → outreach_drafts (parallel)
2. `weeklyCatchup.ts` — 6 steps: citation_check → delta_calc → hallucination_scan → spawn_remediations → compose_digest → mark digest ready
3. `fixLosingArticle.ts` — chunk-optimize + re-run citation check + signals re-score

`server/lib/agentTaskExecutor.ts` handles `content_generation`, `outreach`, `prompt_test`, `source_analysis`, `hallucination_remediation`, `seo_update`. All real, all wired.

**This is one of the most underrated assets in the codebase.** It's wired but barely surfaced in the UI (the `agent-dashboard.tsx` page exists but is **orphaned** — see §3.6). Could be a major differentiator if exposed.

### 3.5 Brand fact sheet pipeline — the structural weakness

Already covered in §2 and detailed in §4. Confirmed root causes:

1. Single-pass per page, no agent loop, no follow-ups
2. Hardcoded 10-path list (`/`, `/about`, etc.) — no sitemap, no crawl
3. Raw `fetch` only, no headless browser → SPA blindness
4. 8KB input cap per page
5. Generic LLM prompt, no per-category targeting
6. No external sources at all (Crunchbase, LinkedIn, Wikipedia infobox, G2)
7. `confidence` parsed and discarded
8. 1000-char value cap forces nuance into one-liners
9. No iteration / refinement loop
10. Two parallel data paths (`brands.description` vs `brand_fact_sheet`) never reconcile

The Wikipedia scanner exists (`server/lib/wikipediaScanner.ts`) but feeds `ai_sources`, not `brand_fact_sheet` — easy reuse miss.

**Most damning detail:** the onboarding scrape stream (`server/routes/onboarding.ts:299-313`) has an LLM-only fallback when scraping yields little — it asks `gpt-4o-mini` "What do you know about the domain X?" and **fills the brand profile from training-data hallucinations** with no flag to the user.

### 3.6 Dead code and stubs

**Hardcoded data masquerading as features:**

- `databaseStorage.discoverPublications` (lines 3711-3964) — entire industry-to-publications lookup is hardcoded (technology → TechCrunch/Verge/Wired, marketing → HubSpot/CMI/SEJ, finance → Forbes/Investopedia, etc.) with `relevanceScore: Math.floor(60 + Math.random() * 40)`. **This powers the "Discover Publications" outreach button** — users get fake-but-plausible suggestions.
- `databaseStorage.findContacts` (lines 3966-4009) — hardcoded contact emails for 8 known domains; for unknown domains returns `editor@<domain>` boilerplate.
- A stale comment in `agent.ts:727` claims `sendOutreachEmail` is a `Math.random` mock — actually real (calls Resend). Comment misleading.
- `analytics.ts` `GEO_PLATFORMS`, `INDUSTRY_SUBREDDITS`, `INDUSTRY_QUORA_TOPICS` — hardcoded with 5 industries; everything else falls to "default".

**Quora removal incomplete** — despite `migrations/0050_mentions_rebuild.sql` actively `DELETE FROM brand_mentions WHERE platform IN ('quora')`:

- `server/citationChecker.ts:182` (`classifySourceType`) still buckets `quora.com` as "community"
- `server/routes/articles.ts:481` distribution rewriter still has a Quora template
- `server/routes/analytics.ts:1170` ships `INDUSTRY_QUORA_TOPICS` and `GEO_PLATFORMS.quora` with `citationShare: 14.3`
- `server/routes/community.ts` still mentions Quora as a platform enum value
- `server/lib/recommendationsEngine.ts` likely contains Quora references
- Client-side: `client/src/pages/geo-opportunities.tsx` and `community-engagement.tsx` still import `SiQuora` and render Quora rows

Net effect: **the product recommends Quora to users it can't track on Quora.**

**Engagement-score removal partial** — column `engagement_normalized` drives keyset pagination in `databaseStorage.ts:4995-5027` but is never written by the scanners (always NULL → `NULLS LAST` → effective sort is `id ASC`). The "engagement" sort label is meaningless.

**Effectively dead code:**

- `server/lib/citationJudge.ts` — only reachable via legacy `runPlatformCitationCheck(skipJudge=false)`, never called
- `server/lib/wikipediaScanner.ts` — produces `ai_sources` rows that are surfaced only by `/api/ai-sources/*`; not wired into the brand fact sheet despite being the obvious source
- `server/lib/recommendationsEngine.ts` — single-caller (`dashboard.ts:534`)

### 3.7 Production readiness flags

**Hardcoded values that should be config:**

- `routes/tours.ts:42` — admin gate is `email.endsWith("@litlabs.io")`, ignoring the existing `isAdmin` middleware
- `factExtractor.ts:22` `FACT_PAGE_PATHS`
- `mentionScanner.ts:11` `DAILY_SENTIMENT_CAP = 200`
- `citationChecker.ts:55` `COMPETITOR_DETECTIONS_CAP = 5000`
- `brandMatcher.ts:85` `AMBIGUOUS_WORDS` set (brands like "Patagonia" with longer common-word names may false-positive)
- `routes/mentions.ts:393` `COOLDOWN_MS = 0` (manual-scan cooldown disabled)
- `contentGenerationWorker.ts:225` content-type → word-count map

**Real-world load risks:**

- `storage.getArticles()` is called as **unfiltered full-table scan** from at least 8 endpoints (dashboard, platform-metrics, geo-analytics, client-reports, geo-opportunities, geo-rankings list); per-brand methods exist but aren't used. Same pattern for `storage.getGeoRankings()`. **Will not survive multi-tenant scale past hundreds of users.**
- `storage.getAgentTasks(undefined, …)` at `routes/agent.ts:74` — full-table scan + JS filter
- N+1 in `runWeeklyReportJob` — for each user × brand × prompt × 5 platforms (sequential LLM calls)
- Rate-limit-buckets are in-memory (`acquireOrWait`) — per-lambda on Vercel; shared brand can over-fetch

**Swallowed errors** (sample): `citationChecker.ts:1083-1093`, `onboardingAutopilot.ts:14`, `factExtractor.ts:286/308`, `hallucinationDetector.ts:131/312-316`, `assistant.ts:388`, multiple `.catch(() => [] as any[])` patterns silently degrading endpoints to empty arrays.

---

## 4. The Brand Fact Sheet — Why It's Weak and How to Fix It

User complaint: "captures only very simple things, doesn't really do a great job."

**Current capture surface:**

- `brands` row (one-shot at onboarding): `name`, `companyName`, `industry`, `description` (2-3 sentences), `tone`, `targetAudience`, `products[]` (names only), `keyValues[]`, `uniqueSellingPoints[]`, `brandVoice`, `nameVariations[]`, `logoUrl`. 12 fields, never refreshed.
- `brand_fact_sheet` rows (async scrape, 10 pages): flat key-value pairs in 8 categories (founding, funding, team, products, pricing, locations, achievements, other). Per-fact value capped at 1000 chars; LLM cap 1200 output tokens per page; input cap 8000 chars per page.

**What a great fact sheet should have that this is NOT capturing:**

| Field | Captured? |
|---|---|
| Brand voice / tone / positioning paragraph | Partial (single LLM-derived adjectives) |
| Real products with descriptions, pricing tiers, features | **No** (`products[]` is a `text[]` of names only) |
| Differentiators / vs-competitors | **No** (`uniqueSellingPoints[]` is generic LLM filler) |
| ICP / target customer with personas | Partial (single short string) |
| Use cases / jobs-to-be-done | **No** |
| Pricing model / free tier / trial | Partial (only if `/pricing` is static HTML) |
| Founding story / founders / year founded | Partial (depends on `/about` being static HTML) |
| Funding / investors / VCs | **No effectively** |
| Press mentions / awards / customer logos | **No** |
| Geographic markets | **No** |
| Compliance posture (SOC 2, HIPAA, GDPR) | **No** |
| Tech stack signals | **No** |
| Content footprint (blog topics, authors) | **No** (`/blog` not in `FACT_PAGE_PATHS`) |
| LinkedIn / X / YouTube presence | **No** |
| G2 / Capterra / Trustpilot reviews | **No** |
| **"How they describe themselves" vs "how AI describes them" diff** | **No** — these data sets exist separately and are never compared |

**Three rebuild options** (cheapest → fanciest):

### Option A — Polish the current pipeline (Effort: M, Quality lift: ~30%)
- Replace `FACT_PAGE_PATHS` with sitemap.xml fetch + 1-hop link follow (cap 30 paths)
- Headless rendering fallback when raw fetch yields <800 chars (Browserless / ScrapingBee / Jina Reader free tier `r.jina.ai/<URL>`)
- Bump `MAX_PAGE_CHARS` to 30k via Markdown converter
- Per-category targeted prompts (one prompt for pricing, one for team, one for funding)
- Persist `confidence` and add UI affordance for low-confidence facts
- Verification pass for high-stakes facts (founder name, year founded, total raised)

### Option B — Multi-source synthesis (Effort: L, Quality lift: ~70%)
Everything in A, plus:
- Wikipedia infobox parse (re-use existing `wikipediaScanner.ts`)
- Crunchbase / Apollo / Clearbit for funding + headcount + founding date
- G2 / Capterra / Trustpilot scrape for review summary
- Social presence probe (LinkedIn /company/{slug}, X handle, YouTube)
- News API for press mentions in last 90 days
- Synthesis pass producing structured `BrandProfile` JSONB column on `brands` alongside flat fact rows

### Option C — Agentic deep research (Effort: XL, Quality lift: 90%+, Cost: $1.50–4/brand, 60–180s wall-clock) ← **Recommended target**

The "Perplexity Deep Research / OpenAI Deep Research" pattern:

1. **Plan.** Frontier model reads URL + brand name and writes a research plan (15 sub-questions max)
2. **Execute.** Tool-calling loop: `fetch_url`, `web_search`, `wikipedia_lookup`, `read_pdf`, `extract_links`. Iterates per sub-question, follows leads, bounded by 30 tool calls and a $5 budget per brand.
3. **Verify.** Second model pass cross-references claims across sources, flags contradictions, demotes unsupported assertions.
4. **Structure.** Produces both flat `brand_fact_sheet` rows (back-compat) AND a rich `BrandProfile` JSONB.
5. Stream progress to UI ("Reading pricing page... Found 3 plans... Cross-referencing with G2...")

**Recommendation:** skip A, do B's data plumbing as Option C's tool-set. The user's complaint is structural — Option A alone won't fix it because the system isn't doing research, it's doing extraction.

---

## 5. The Frontend — Page Sprawl, Duplicate Surfaces, Dead Routes

### 5.1 Routes vs nav vs files: the orphan inventory

- **36 page files** in `client/src/pages/` (1 file `pricing.tsx` is missing despite being expected)
- **24 routes registered** in `client/src/App.tsx`
- **18 nav entries** in `client/src/components/Sidebar.tsx`
- **8 page files exist but have neither route nor nav:**
  - `outreach.tsx` — full ~500-line CRUD UI for email campaigns
  - `ai-traffic.tsx`
  - `geo-rankings.tsx`
  - `publication-intelligence.tsx` — "Coming Soon" placeholder with hardcoded "100+ / 7 / 20+" stats
  - `revenue-analytics.tsx`
  - `analytics-integrations.tsx` — has the unscoped GA4/GSC localStorage bug (see §5.4)
  - `agent-dashboard.tsx` — links to `/geo-rankings` and `/outreach` (both unrouted → 404)
  - `agent-run.tsx`

**Plus:** `client/src/pages/ai-visibility.tsx` quick-actions link to `/publications` (line 170) and `/geo-rankings` (line 513) — both 404. **A demo of the per-engine checklist breaks on the first link click.**

### 5.2 Duplicate analytical surfaces — the four-way overlap

The same underlying citation data is reframed at least 5 times:

- `home.tsx` (1336 lines, 11 sections) — hero metrics, citation trend, generative rankings, share-of-voice donut, competitor leaderboard, gap matrix, prompt coverage, entity strength, sentiment, verbatim, Reddit visibility
- `geo-analytics.tsx` (528 lines) — same hero metrics + share-of-voice + sentiment + platform breakdown + leaderboard
- `ai-intelligence.tsx` — share-of-answer + competitors + citation quality + trends — re-using citation/leaderboard data (6-tab `grid-cols-6` collapses badly under 900px)
- `client-reports.tsx` — BMF + SoV + citation rate + prompt coverage + platform breakdown
- `competitors.tsx` — same leaderboard

**Verdict:** ~70% of the same data, four times. These could collapse into one analytics surface with mode tabs (or one + a "shareable report" export).

GEO data is similarly fragmented across `geo-analytics`, `geo-signals`, `geo-tools`, `geo-opportunities`, `geo-rankings` (orphaned). Mergeable into one GEO surface.

Three competitor surfaces: `/competitors`, dashboard gap matrix, `/ai-intelligence` Competitors tab — same data, three views.

### 5.3 The onboarding stack on `/dashboard`

Above-the-fold on the dashboard for a first-time user: autopilot banner + `OnboardingProgressRing` (large card with the same 4 steps as the sidebar) + `ResultsTimeline` (4-tile horizontal Day-0/Week-1/Week-2-3/Week-4+ strip) + `RecommendationsPanel` (5 P0/P1/P2 items) + the `PageHeader` with explainer popover and "Create Content" CTA + a per-section empty-state CTA "Run your first citation check."

That is **six guidance UIs above the fold**, none synced.

### 5.4 The bugs

- **Account settings disabled** (`Sidebar.tsx:226`) — `/settings` exists with notification preferences and GDPR delete/export but is functionally unreachable.
- **Unscoped localStorage** in `analytics-integrations.tsx:27,30,37,49` — writes `venturecite-ga4-id` and `venturecite-gsc-url` with no userId prefix. Two users on the same browser cross-leak each other's GA4 + Search Console URLs. (Page is also orphaned, so the easier fix is delete.)
- **Quora UI remnants** (see §3.6).
- **Tour engine ships but never mounts** (`TourOrchestrator` not imported in `AppLayout.tsx`).
- **Raw `fetch()` in `landing.tsx:1043`** for waitlist (anti-pattern per CLAUDE.md). Auth pages forgivable; marketing waitlist isn't.

### 5.5 UX density issues (the "squished text" pattern)

Single-source-of-truth fix. The `Section` component in `client/src/pages/home.tsx:140` uses:

```tsx
<p className="text-xs text-muted-foreground mt-0.5 truncate">
```

`truncate` cuts long descriptions silently. Same anti-pattern lives in `PromptsTab.tsx`, where ad-hoc inline metadata (`Seeded 12 days ago`) is jammed into the description string.

**Fix:** swap `truncate` → `line-clamp-2`, pull metadata into a separate `<MetaRow>` component with chips. Single PR; ~30 minutes.

---

## 6. The AI Tutor — Polished Q&A, Not a Real Copilot

### Architecture
- Single hardcoded model: `anthropic/claude-sonnet-4.5` via OpenRouter, temp 0.4, 1500 max_tokens, SSE streaming with 15s heartbeats
- Multi-thread (`chatbot_threads`, `chatbot_messages`), thread auto-archive with 5s undo
- Budget: free tier = 15k tokens/day + 20 user messages/hour
- "Persona hardening" = pure system-prompt engineering (no moderation layer, no output classifier)
- Mounted globally in `AppLayout.tsx:48` as a floating bottom-right "AI Tutor" pill

### Knowledge
- Static system prompt (~125 lines) hardcoded in `server/lib/chatbotKnowledge.ts`
- Per-message brand context block (5 fields: name, industry, has-articles, citation runs in 30 days, latest run citation rate)
- Last 11 messages from current thread
- **No RAG, no docs index, no embedding lookup, no tool use, no function calling**

### Prompt quality (genuine strength)
- Strict greeting rule prevents the "Great question!" preamble
- Explicit anti-hallucination rules forbid inventing button labels, field names, numbers
- Clean sidebar taxonomy with one-line OUTCOME descriptions per page
- "Next:" pointer convention forces every actionable answer to end with `Open **<page>** → <action>`
- Settings caveat baked in (the prompt explicitly tells the bot NOT to invent a Settings sidebar entry, because billing lives in the user-menu dropdown)

### Limitations
- **No tool use** → cannot answer "How is my brand doing?" with real numbers beyond the 5 fields
- **No page context** → cannot say "I see you're on Citations and you have no runs yet — start here"
- **No actions** → cannot trigger a citation run, add a tracked prompt, or generate content
- **Cannot deep-link** → "Open **Citations**" is just bold text

### Verdict
Solid Q&A bot. Solves *education* (it's a competent GEO/AEO tutor). Partially solves *navigation* (points at the right sidebar label). Does **not** solve *onboarding* — without page state and tool-use, "what should I do next?" devolves to the static 5-step recipe regardless of where the user actually is.

**Path forward** (after IA cleanup):
1. Add tool use: `getBrandStatus(brandId)`, `listOpportunities(brandId)`, `getCurrentPage()`, `runCitationCheck(promptIds)`, `addTrackedPrompt(text)`
2. Send `pathname` with each request
3. Add a "first message" hook for new users (proactive: "Welcome! I see you've just added Acme. Want me to walk you through the dashboard?")

---

## 7. Competitive Landscape — Where VentureCite Stands (May 2026)

Verified via direct WebFetch + WebSearch. URLs cited inline.

### 7.1 The major players

| Player | Hero tagline | Pricing | Position |
|---|---|---|---|
| **Profound** ([tryprofound.com](https://www.tryprofound.com/)) | "Optimize Your Brand's Visibility in AI Search" | $99/mo Starter (ChatGPT only) → $399/mo Growth (3 platforms) → $2-5K+/mo Enterprise | **Enterprise**. SOC 2 + HIPAA. 10+ AI engines. Sales-led only. "Marketing agents to win in [AI]" |
| **AthenaHQ** ([athenahq.ai](https://athenahq.ai)) | "Become the Brand AI Trusts" | $295/mo Self-Serve ($95/mo annual) → Enterprise custom | **Mid-market.** "End-to-end AEO & GEO platform". 8 LLMs, "ACE" Citation Engine, Content Optimization AI Agent with Deep Research, blindspot detection |
| **Goodie AI** ([higoodie.com](http://higoodie.com/)) | "Unlock AI Search Growth" | $495/mo entry → Enterprise | **Mid-market+.** Closed-loop AEO system. AEO Writer, Agentic Commerce Suite, dedicated AEO strategist on Enterprise. Shopify integration. |
| **Peec AI** ([peec.ai](https://peec.ai)) | "AI search analytics for marketing teams" | €89/mo entry → Pro/Advanced/Enterprise (prices not all public) | **Mid-market.** "Visibility, Position, and Sentiment". Looker integration, recommendation-centric framing. |
| **Otterly** ([otterly.ai](https://otterly.ai)) | "We otter know where your brand shows up on AI Search" | $29/mo Lite → $189/mo Standard → $489/mo Premium → Enterprise | **SMB.** Cute branding. Gartner Cool Vendor 2025, G2 High Performer. 4 engines, 1k–10k GEO URL audits/month. |
| **Daydream** ([withdaydream.com](https://withdaydream.com)) | "Your unfair advantage in SEO & AI Search" | Custom only | **Hybrid SEO + AI Search.** "SEO agents and dedicated experts" — partly services-led. Customers: Beautiful.ai, Clay, Lightspark. |
| **Scrunch** ([scrunch.com](https://scrunch.com/)) | "Monitor and improve your brand's visibility in AI search" | 7-day trial → Enterprise | **Enterprise.** 500+ companies including Lenovo, Skims. "Agent Experience Platform" (AXP) — content delivery optimized for AI agents. SOC 2 Type II. Bot/crawl observability. |

### 7.2 Cross-competitor feature matrix (table stakes vs differentiators)

| Feature | Profound | Athena | Goodie | Peec | Otterly | Daydream | Scrunch |
|---|---|---|---|---|---|---|---|
| Multi-LLM citation tracking | Y (10+) | Y (8) | Y | Y | Y (4) | Y | Y |
| Competitor benchmarking | Y | Y | Y | Y | Y | Y | Y |
| Prompt volumes (search demand) | Y | partial | Y | partial | partial | partial | partial |
| Recommendations / actions | Y | Y | Y | Y | Y (limited) | Y (services) | Y |
| Content generation | Y (Agents) | Y (Deep Research agent) | Y (AEO Writer) | partial | partial | Y | partial |
| Sentiment analysis | Y | Y | Y | Y | partial | partial | Y |
| Reddit/community monitoring | partial | partial | partial | partial | partial | partial | partial |
| Brand profile depth | partial | Y (deep research) | Y | partial | basic | basic | partial |
| **In-product AI copilot/chatbot** | partial | partial | partial | partial | **No** | **No** | **No** |
| Crawler/bot observability | Y | Y | partial | partial | partial | partial | **Y (standout)** |
| Looker / BI integration | partial | partial | partial | **Y** | **Y** | partial | Y |
| Slack alerts | Y | Y | Y | Y | partial | partial | Y |
| API access | Enterprise | Enterprise | Y | Advanced+ | partial | partial | Y |
| White-label / agency | Y | Y | partial | Y | Y | Y (services) | Y |
| Multi-brand portfolio | Y | Y | Y | Y | Y | Y | Y |
| Ecommerce/Shopify connector | partial | Y | Y | partial | partial | partial | partial |
| **"How AI describes you" diff** | partial | partial | partial | **No** | **No** | **No** | partial |

### 7.3 Onboarding deep-dive

**Profound:** [Statsig case study](https://www.tryprofound.com/blog/profound-reviews) — "I was able to set up full visibility across all the core prompts we cared about in less than two hours." Enterprise customers get a 4-week structured onboarding (Week 1: define intents/prompts, Week 2: connect log sources + select engines, Week 3: configure dashboards/alerts, Week 4: schedule QBRs). **Sales-led only — no self-serve signup.**

**AthenaHQ:** Self-serve at $95/mo annual. Includes 3,600 credits and "$300/mo free credit" — an unusual onboarding hook (let users try features before paying, on the same plan).

**Otterly:** SMB self-serve from $29. Lower bar to first dashboard.

### 7.4 The "Become the answer" language audit

The user's client (Ben) wants to position around "Become the answer AI gives" / "Have AI recommend you over competitors." Search verdict ([web search](https://www.semrush.com/blog/ai-visibility/)): the exact phrase **"Become the answer"** is **not taken** as a tagline. Athena's "Become the Brand AI Trusts" is the closest (semantic neighbor). The conceptual framing is widely used in the space (Microsoft talks about "Brand Agents", every player talks about "AI search visibility" / "AEO" / "GEO"), but **the specific aspirational verb "Become" + the noun "the answer" is white space.**

### 7.5 Narrative themes

**What every competitor has (table stakes):**
- Multi-LLM citation tracking (≥4 engines)
- Competitor benchmarking
- Sentiment analysis on AI responses
- Multi-brand support

**What one competitor has that nobody else does (differentiators):**
- **Profound:** "Prompt Volumes" panel — share-of-voice mapped to actual search demand from real users
- **Athena:** "Athena Citation Engine" with deep-research workflows; "blindspot detection"
- **Goodie:** "Agentic Commerce Suite" — Shopify-integrated GEO blogs and product surfaces; dedicated AEO strategist
- **Otterly:** Lowest entry price + Gartner/G2 awards; consumer-friendly tone
- **Scrunch:** "Agent Experience Platform" — formatting your content specifically for AI consumption (different from optimizing for citation). Crawler/bot observability with real-time feeds.
- **Daydream:** Services + agents hybrid (SEO experts in the loop)

**What nobody really has (white space for VentureCite):**
1. **A genuinely useful in-product AI copilot** that can read live state, suggest concrete actions, and take them (the "Granola for AEO" idea — your tutor knows where you are and what to do, and can do it for you)
2. **"How AI describes you today" vs "how you describe yourself" diff view** with a clear "fix this gap" workflow
3. **Self-serve at the $99–$299/mo "serious founder, not enterprise" lane** with a copilot — Otterly's SMB but limited; Athena starts at $95-$295 but is feature-dense; Goodie starts at $495. There's a lane.
4. **Citation-gap → content-generated bridge** — most competitors have content generation, but few wire it directly to the gap analysis ("you lose Prompt #4; click here to draft content targeting it")

### 7.6 Pricing recommendation

VentureCite should target **$99/$249/$499/Enterprise** with a 14-day free trial, self-serve signup. This puts it in the "more than Otterly's $29 SMB tier, less than Goodie's $495 entry, comparable to Athena at $95-$295." The key is shipping enough depth at $99/mo that it doesn't feel like a downgrade from Athena.

### 7.7 Brand/visual direction

Saturated aesthetics in the space:
- Dark techy + neon gradients (Profound, Scrunch)
- Clean black serif wordmark + 1 accent (Athena, Goodie)
- Editorial typography (Daydream)

Stand-out angles still available:
- **Warm/editorial** — Lit Labs–style; works against the "sterile AI startup" default
- **Mascot-light fun for founders** — Otterly owns "fun + cute"; an "approachable but serious" middle slot is open
- **Document-feeling** — magazine-style typography, calm palette, big editorial images

The current VentureCite logo (purple primary, default-Tailwind sidebar) reads "AI startup template." Worth a fresh swing. **Sequence after IA cleanup** so a new identity doesn't ride a confused product.

---

## 8. Honest Verdict — Ready for Customers?

**No, not unsupervised.**

Specifically:

**Day 1 friction (will lose them within hours):**

1. Tour engine never mounts — no narration of the first run
2. 22-link sidebar with jargon labels (GEO Signals vs GEO Tools vs GEO Analytics)
3. Autopilot banner has no time estimate or result interpretation
4. Day-1 dashboard reads as alarming ("No Reddit presence", "Underexposed", "Unknown" recognition)
5. Account settings is disabled — can't reach `/settings` from UI

**Week 1 friction (will lose them within days):**

1. No clear bridge from citation gap → content generated to fill it
2. Recommendations panel suggests work in 5 places (fact sheet, FAQ, signals, competitors, community) — feels like a TODO list, not a system
3. AI Visibility page has 50 manual checkboxes with no "this is what changes when you tick them"
4. No outbound notifications surface — user has to remember to come back
5. Three competitor surfaces with different pivots, no clear primary

**The fact sheet quality** — even if the user does succeed at the rest, the brand profile they get back is shallow; this is the foundation of everything else. Won't impress.

**What's *almost* ready:**

The citation engine, mention scanner, workflow engine, and agent task executor are real, runnable, and well-engineered. The data model is solid. The advisory-locking and idempotency around webhooks/jobs is mature. The brand-matching logic is genuinely sophisticated.

**This is not a demo-ware codebase.** The engine is good. The UX scaffolding around it is the gap. That's encouraging — most of what needs to happen is wiring, deletion, IA simplification, and the brand-fact-sheet rebuild. Not "rebuild the engine."

---

## 9. Ranked Path to Customer-Testable

Three waves, in order. Each is independently shippable.

### Wave 1 — Surgical Cleanup (1–2 weeks)

Pure deletion + wiring. No new features. Goal: a clean demo with no 404s, no dead surfaces, no hallucinated data.

| # | Task | Effort | File(s) | Why |
|---|---|---|---|---|
| 1.1 | Mount the tour engine | XS | `client/src/components/AppLayout.tsx` | The most expensive recent UX work is dead code. Single import. |
| 1.2 | Decide fate of 8 orphan pages — delete or wire | S | App.tsx, Sidebar.tsx, 8 page files | Either route them or remove them; current state is just confusing |
| 1.3 | Fix `/ai-visibility` quick-action 404s | XS | `ai-visibility.tsx:170,513` | Demo breaks on first link click |
| 1.4 | Fix agent-dashboard 404s | XS | `agent-dashboard.tsx:553,555` | Same |
| 1.5 | Remove the disabled "Account settings" — link it to /settings | XS | `Sidebar.tsx:226` | GDPR delete/export is unreachable |
| 1.6 | Finish Quora removal | S | `citationChecker.ts`, `analytics.ts`, `articles.ts`, `community.ts`, `recommendationsEngine.ts`, client `geo-opportunities`, `community-engagement` | Stop recommending Quora to users we can't track on Quora |
| 1.7 | Delete or replace fake `discoverPublications` + `findContacts` | S–M | `databaseStorage.ts:3711-4009` | These power the outreach UI with `Math.random` "data" |
| 1.8 | Fix the squished text pattern globally | XS | `home.tsx Section`, `PromptsTab.tsx`, `PageHeader` | Single shared change; 30-min PR |
| 1.9 | Hide the auto-citation-hour picker | XS | UI only | It's silently ignored |
| 1.10 | Remove unscoped GA4/GSC localStorage keys (or delete page) | XS | `analytics-integrations.tsx` | Cross-account leak |
| 1.11 | Stale "Math.random mock" comment cleanup | XS | `agent.ts:727` | False; misleading future readers |

**Outcome:** A platform that doesn't lie, doesn't 404, doesn't hide settings. Ready for Vandan's internal demo.

### Wave 2 — Onboarding & IA Cleanup (2–3 weeks)

The product understanding the user has after a week. Goal: any non-technical founder who signs up can describe what the product does and what they should do next.

| # | Task | Effort | Notes |
|---|---|---|---|
| 2.1 | One canonical onboarding surface | M | Pick the tour engine as the spine. Sidebar pill becomes a status indicator only. Dashboard ring + ResultsTimeline + RecommendationsPanel rationalized into a single "where you are now" component. |
| 2.2 | Day 1 / Week 1 / Week 4 narrative | M | The meeting transcript referenced this; the codebase has 4-step + per-engine + recs but no "narrative arc". Pick one; build the others around it. |
| 2.3 | Sidebar reorganization | M | 22 → ~10. Group tools under a single "Tools" entry with sub-tabs. Move Brand Fact Sheet to top of "Setup" (currently at bottom of "Optimize"). |
| 2.4 | Collapse home/geo-analytics/ai-intelligence/client-reports | L | One analytics surface with mode tabs. Client-reports stays as the "shareable export" |
| 2.5 | Single brand-creation path | S | Pick `/welcome` SSE flow as canonical; remove `/brands` URL paste duplicate |
| 2.6 | Fix "AI Visibility" auto-complete-on-visit | XS | Step 3 currently completes when user just visits the page; should require real engagement |
| 2.7 | First-run framing for Day-1 dashboard | M | "No Reddit presence" framed as "this is normal — we'll measure it on Monday" instead of red destructive banner |
| 2.8 | Settings page accessible (already routed) — confirm flow works | S | Notification prefs + GDPR; the page exists |
| 2.9 | The "Squished text" sweep | S | Already in Wave 1.8 — verify across pages |

**Outcome:** A user who lands on the dashboard understands the product in 60 seconds and has one obvious next action.

### Wave 3 — Differentiators (3–6 weeks)

Now move from "doesn't suck" to "is better than competitors at something specific."

| # | Task | Effort | Why |
|---|---|---|---|
| 3.1 | **Brand Fact Sheet — agentic deep research** | XL | Plan → Execute → Verify → Structure with tool-calling, 60-180s wall-clock. The core differentiator and the user's #1 complaint. (Option C from §4.) |
| 3.2 | **AI Tutor → real copilot** | L | Add tool use (`getBrandStatus`, `listOpportunities`, `getCurrentPage`, `runCitationCheck`, `addTrackedPrompt`); send `pathname` per request; first-message hook for new users; consider deep-link parser. The "Granola for AEO" idea. |
| 3.3 | **"How AI describes you today" diff view** | M | Pull what AI engines actually said about the brand from existing citation runs; LLM-summarize; diff against the user's own positioning paragraph. White-space differentiator no competitor has. |
| 3.4 | **Citation gap → generate content bridge** | M | One-click from a weak prompt to a content draft pre-filled with that prompt as the topic. Cross the engine→content workflow. |
| 3.5 | Fix N+1 / full-table-scan endpoints | M | `getArticles()` / `getGeoRankings()` unfiltered scans (8+ endpoints). Necessary before customer load. |
| 3.6 | Refactor `citationChecker.ts` (1369 lines, one function) | L | The strongest part of the engine is a maintenance liability. Carefully split into queue / runner / variant-learner / persistence. Tests exist; preserve behavior. |
| 3.7 | New brand identity / landing | M | After IA cleanup. Skip a fresh logo while the product is still confusing. |
| 3.8 | Pricing & positioning reframe | M | $99/$249/$499/Enterprise; "Become the answer" headline (white space confirmed); 14-day free trial. |

**Outcome:** A product that specifically out-classes Profound's $99 starter (more than ChatGPT-only), undercuts Goodie's $495 entry, and has features Athena and Otterly don't.

---

## 10. The Decision Tree from Here

Three questions for the user.

1. **Sequence:** Wave 1 first, then Wave 2, then Wave 3 — does that match intent? Or is there a feature in Wave 3 (e.g., the brand fact sheet rebuild) that should jump ahead because it's the loudest customer pain point?

2. **Scope of change tolerance:** Some Wave 2 items involve deleting code (collapsing four pages into one, removing brand-creation paths). Are you OK with that, or do you want to keep duplicates as "options" and just add a default?

3. **Branding sequence:** Hold the new logo / landing redesign until Wave 3 (after IA cleanup), or run it in parallel as a separate track?

After your answers, the brainstorming skill takes us into design docs for the picked items — one design per item. The plan is to write each as its own spec in `docs/superpowers/specs/`, then implement under the writing-plans skill.

---

## Appendix A — Files cited

(All paths relative to `c:\Users\yoges\OneDrive\Desktop\venturecite\`.)

**Frontend:**
- `client/src/App.tsx` — route table
- `client/src/components/AppLayout.tsx` — TourOrchestrator NOT mounted here
- `client/src/components/Sidebar.tsx` — 18 nav entries, disabled Account settings
- `client/src/components/SidebarOnboarding.tsx`, `dashboard/OnboardingProgressRing.tsx`, `dashboard/ResultsTimeline.tsx`, `dashboard/RecommendationsPanel.tsx` — competing onboarding UIs
- `client/src/lib/onboardingSteps.ts` — 4-step source of truth
- `client/src/components/EducationAssistant.tsx` + `client/src/hooks/useChatbot.ts` — AI Tutor
- `client/src/components/chatbot/{WelcomeState,HistoryView,MessageBubble}.tsx` — chatbot UI
- `client/src/tours/` — entire tour engine (NOT mounted)
- `client/src/pages/welcome.tsx` — SSE scrape flow
- `client/src/pages/home.tsx` — 1336 lines, 11 sections
- `client/src/pages/{ai-visibility,ai-intelligence,geo-analytics,client-reports}.tsx` — duplicate analytics surfaces
- `client/src/pages/{outreach,ai-traffic,geo-rankings,publication-intelligence,revenue-analytics,analytics-integrations,agent-dashboard,agent-run}.tsx` — orphan pages
- `client/src/pages/brand-fact-sheet.tsx:518-523` — UI apologizing for SPA blindness

**Backend:**
- `server/routes.ts` (748 lines, mostly mount), `server/routes/*.ts` (23 files)
- `server/lib/factExtractor.ts` — fact-sheet pipeline (see §4)
- `server/lib/brandMatcher.ts` — strong brand-matching
- `server/citationChecker.ts` (1369 lines) — citation engine
- `server/lib/chatbotKnowledge.ts` — AI Tutor system prompt
- `server/lib/workflowEngine.ts` + `server/lib/workflows/{winAPrompt,weeklyCatchup,fixLosingArticle}.ts` — agent/workflow engine
- `server/lib/onboardingAutopilot.ts` — 3-step pipeline
- `server/databaseStorage.ts` (5102 lines) — `discoverPublications` + `findContacts` are stubs
- `server/scheduler.ts` — cron jobs
- `server/routes/cron.ts` — `/api/cron/daily-orchestrator`

**Migrations:**
- `migrations/0050_mentions_rebuild.sql` — Quora removal at the data layer
- `migrations/0051_tour_engine.sql` — `tour_events` table (used only if `TourOrchestrator` were mounted)
- `migrations/0048_chatbot_messages.sql`, `0049_chatbot_threads.sql` — AI Tutor schema

## Appendix B — Competitive citations

- [Profound homepage](https://www.tryprofound.com/) — "Optimize Your Brand's Visibility in AI Search"
- [Profound product features](https://www.tryprofound.com/) — Prompt Volumes, Answer Engine Insights, Agents, Agent Analytics, Shopping
- [Profound reviews](https://www.tryprofound.com/blog/profound-reviews) — Statsig "less than two hours" onboarding
- [Profound pricing comparison](https://discoveredlabs.com/blog/profound-vs-peec-vs-otterly-which-ai-visibility-platform-should-you-buy) — $99/Starter, $399/Growth, $2-5K+/Enterprise
- [AthenaHQ](https://athenahq.ai) — "Become the Brand AI Trusts", $95/mo annual, 8 LLMs, ACE Citation Engine
- [Goodie AI](http://higoodie.com/) — "Unlock AI Search Growth", $495/mo entry
- [Peec AI](https://peec.ai) — "AI search analytics for marketing teams", €89/mo entry
- [Otterly](https://otterly.ai) — "We otter know where your brand shows up on AI Search", $29/mo Lite
- [Daydream](https://withdaydream.com) — "Your unfair advantage in SEO & AI Search"
- [Scrunch](https://scrunch.com/) — "Monitor and improve your brand's visibility in AI search", Agent Experience Platform
- [LLM Pulse — best AI visibility tools 2026](https://llmpulse.ai/blog/best-ai-visibility-tools/)
- [Surfaced — Profound vs Peec](https://discoveredlabs.com/blog/profound-vs-peec-vs-otterly-which-ai-visibility-platform-should-you-buy)
- [Workduo — Profound pricing](https://www.workduo.ai/blog/profound-ai-pricing)
- [Trakkr — Profound review](https://trakkr.ai/reviews/profound-review)
- [Semrush — AI visibility 2026](https://www.semrush.com/blog/ai-visibility/)
