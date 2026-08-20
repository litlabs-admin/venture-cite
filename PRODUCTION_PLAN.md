# VentureCite — Production Readiness Plan

**Source meeting:** Ben (VenturePR) ↔ Vandan / Vivek (LitLabs) — 29 April 2026 (`message.txt` in repo root).
**Repo audited:** `venture-cite/` — Node 20 / Express / React 18 / Postgres (Supabase) / Drizzle / Stripe / OpenAI.
**Author of this plan:** drafted from the verbatim transcript + a code inventory + a security/leak audit. Every line item below is traced either to a meeting timestamp or to a file:line in the codebase.

This document is the single source of truth for what ships before we open the platform to clients. Each item has: **what**, **why**, **where (files & lines)**, **how (concrete steps)**, **acceptance criteria**, **estimated effort** (S/M/L/XL — half-day / 1-2 day / 3-5 day / 1-2 week).

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Workstream A — Meeting-driven product changes](#2-workstream-a--meeting-driven-product-changes)
   - A1. AI Education Assistant (chatbot)
   - A2. Onboarding ring/tracker on dashboard
   - A3. Citation locations — show *where*, not just *how many*
   - A4. Published Articles directory — public list + VenturePR import
   - A5. Per-page educational context (GEO vs AEO vs SEO, "what is this page")
   - A6. Priority list / recommendation engine
   - A7. Expectations & tracking ("when will I see results")
   - A8. CMS integration with VenturePR
   - A9. Lead magnet capture page
   - A10. Services menu / book-a-call inside the app
   - A11. White-label tracking dashboard for Ben
3. [Workstream B — Production-readiness fixes](#3-workstream-b--production-readiness-fixes)
   - B1. Security findings (HIGH → LOW)
   - B2. Memory & resource leaks
   - B3. Rate limiting & abuse
   - B4. Error handling & observability
   - B5. Logging hygiene
   - B6. Database & migrations
   - B7. Frontend hardening
   - B8. Operational readiness
4. [Workstream C — UX polish & design pass](#4-workstream-c--ux-polish--design-pass)
5. [Sequencing & milestones](#5-sequencing--milestones)
6. [Definition of done](#6-definition-of-done)
7. [Open questions for Ben](#7-open-questions-for-ben)

---

## 1. Executive summary

### What Ben actually said (decoded)

The 44-minute call boils down to **three fears** Ben has about taking VentureCite to clients:

1. **"A user who doesn't know GEO will be lost."** He used the platform himself, couldn't tell where to start, what each tool does, or how the pieces fit together. (Transcript 3:42, 7:00, 10:01–14:36, 15:20.)
2. **"I can't tell if anything I'm doing is working."** Citations shows "2" but no detail. No tracking dashboard. No expectations of when results show up. (Transcript 14:38, 32:34, 34:21–35:51.)
3. **"The published page looks empty."** One article makes the directory feel dead; need to seed VenturePR articles. (Transcript 1:11, 2:12.)

Solving those three is the difference between a tool that demos well and a tool clients pay for. Everything in Workstream A maps to one of those three.

### What the code actually says (decoded)

- The platform is **substantially built**. 39 React pages, ~20 API route modules, full Supabase auth, Stripe billing with verified webhooks, citation runs with SSE, content generation worker, schedulers, helmet/HSTS/CORS allowlist, rate limiters, SSRF helpers, LLM budget gates. The README says "pre-launch / active remediation" — that's accurate.
- **No critical IDOR or auth bypass** found. Ownership is enforced via `enforceBrandOwnership` middleware and explicit `checkBrandOwnership()` calls.
- **No exposed secrets**. `SUPABASE_SERVICE_ROLE_KEY` is server-only; `.gitignore` covers `.env`.
- **Real but fixable problems**: one HIGH-severity SSRF gap on user-supplied Slack webhooks, a few unbounded in-memory `Map`s, SSE intervals that may not clear on disconnect, a handful of `console.warn`/`console.error` calls leaking auth-error context, and several missing pieces (chatbot, public articles list, CMS integration, in-app educational context) the meeting flagged.

### Effort total

- Workstream A (meeting-driven): ~**4–5 dev-weeks** for one engineer, or **2–3 weeks** for two working in parallel.
- Workstream B (production fixes): ~**1.5 dev-weeks**, mostly in 2-3 hour slices.
- Workstream C (UX polish): ~**3–5 days**.

Recommended ship sequence at the bottom (§5).

---

## 2. Workstream A — Meeting-driven product changes

> Each item links the meeting timestamp that generated it. The "Where" column points to the exact files in the repo today. The "How" section gives concrete implementation steps a developer can act on without re-deriving the design.

---

### A1. AI Education Assistant (chatbot)

**Source:** Transcript 11:30–13:10 ("an AI agent built in… a chat bot… really knowledgeable AI agent on GEO… that they can go to if they have questions"). Reinforced 23:00 ("a new agent for the education part of things").

**Why this matters:** This is Ben's #1 unblocking ask. He explicitly says "doing an AI agent that educates them might be the quickest, easiest thing… super easy to build with Claude or something." It directly addresses the "user is lost" fear.

**Where in code today:** Does NOT exist. No chat widget, no floating helper, nothing in `client/src/components/`. Server has `server/lib/agentTaskExecutor.ts` for *task* execution but no conversational endpoint.

**How — implementation steps:**

1. **Backend endpoint** — `server/routes/assistant.ts` (new file, mount in `server/routes.ts`):
   - `POST /api/assistant/chat` body `{ messages: Array<{role, content}>, brandId?: string }`.
   - Use **Claude Sonnet 4.6** via Anthropic SDK (already in environment via OpenRouter? — verify; if not, add `ANTHROPIC_API_KEY` to `server/env.ts` and `.env.example`). Prompt-cache the system prompt with `cache_control: { type: "ephemeral" }` — see `claude-api` skill for the pattern.
   - System prompt: hardcoded GEO/AEO/SEO knowledge base (~3-4k tokens). Include: definitions, why GEO matters, how each VentureCite page maps to a GEO concept, recommended order, FAQ ("when will I see results", "what is a citation", "what's the difference between GEO and AEO").
   - Pull lightweight brand context if `brandId` given (name, industry, last visibility score, citation count) so answers can be specific: "you have 0 citations on Perplexity — try X".
   - Stream the response (`text/event-stream`), gate behind `requireAuth + aiLimitMiddleware`, log token usage to `ai_usage_log` table (already exists per `server/lib/aiLogger.ts`).
   - Enforce `assertWithinBudget()` from `server/lib/llmBudget.ts` BEFORE the call.
   - Rate limit: 30 messages / user / hour via `express-rate-limit`.

2. **Frontend widget** — `client/src/components/EducationAssistant.tsx` (new):
   - Floating bubble bottom-right, `fixed bottom-6 right-6 z-50`. Click → side-sheet (use existing `Sheet` from Radix).
   - Maintain a transcript in component state; persist last 10 messages to `localStorage` keyed by `user.id`.
   - Streaming render: append tokens as they arrive (use `EventSource` or `fetch` + `ReadableStream`).
   - Suggest 3-4 starter prompts as buttons: "What should I do first?", "What's the difference between GEO and SEO?", "Why isn't my citation count going up?", "Walk me through this page."
   - Mount once in `client/src/components/AppLayout.tsx` so it's available on every authenticated page.
   - Pass current page path + selected `brandId` (from `useBrandSelection`) to backend so answers are page-aware.

3. **Knowledge base** — `server/lib/assistantKnowledge.ts` (new):
   - One file. Plain TS module exporting a `SYSTEM_PROMPT` string.
   - Sections: GEO 101, AEO vs SEO vs GEO, VentureCite page-by-page guide, "what to do first", measurement timeline (cite the 2-week LLM-index-lag rule from transcript 32:48), Reddit/Quora strategy.
   - Vivek wrote the existing knowledge — pull from `docs/phase1_goals.md` and `docs/phase2_goals.md` to seed it.

**Acceptance criteria:**
- Floating bubble visible on every authenticated page; never on landing/auth pages.
- Sending a message yields a streaming Claude response in <2s first token.
- Asking "what should I do first?" returns a personalized 4-step plan referencing the user's actual brand and citation count.
- Token usage written to `ai_usage_log`. Daily LLM budget cap enforced.
- Rate limit returns 429 with friendly message after 30/hour.
- Conversation persists across page navigation in same session.

**Effort:** **L** (3–5 days). Mostly prompt engineering + streaming wiring.

---

### A2. Onboarding ring/tracker on dashboard

**Source:** Transcript 5:48 ("we can also create this as a tracker over here, which is like a pie chart or sort of like a ring that just gets filled out whenever you are doing these tasks").

**Why this matters:** Vandan's idea, Ben endorsed it (6:38). Today the onboarding lives in the *sidebar dialog* (`SidebarOnboarding.tsx`) — out of sight from the main dashboard. Putting a visible ring on the dashboard solves discoverability without requiring users to click into the sidebar widget.

**Where in code today:**
- `client/src/components/SidebarOnboarding.tsx:34-82` — 4-step `STEPS` array (brand, content, visibility, citation).
- `client/src/components/SidebarOnboarding.tsx:117-119` — completed-count math.
- `client/src/pages/home.tsx:40` — already imports `VisibilityGauge`. Reuse this component for the new ring or create a sibling.
- `client/src/components/dashboard/VisibilityGauge.tsx` — SVG ring component (size, fill color, score 0-100). Trivial to repurpose.
- `server/routes/onboarding.ts` — already serves `/api/onboarding-status` which `SidebarOnboarding` consumes.

**How — implementation steps:**

1. **Extract step definitions** out of `SidebarOnboarding.tsx` into `client/src/lib/onboardingSteps.ts` so both the sidebar widget AND the dashboard ring read the same source of truth. Move `STEPS` array (currently lines 34-82) into the new file. Update import in `SidebarOnboarding.tsx`.

2. **New component** `client/src/components/dashboard/OnboardingProgressRing.tsx`:
   - Reuses `VisibilityGauge` SVG ring with `score = (completedSteps / total) * 100`.
   - Center text: `"3/4 steps"` instead of the score.
   - Below the ring: vertical list of the 4 steps with check/empty circle icons + "Continue from step N →" CTA linking to the next incomplete step.
   - Reads `/api/onboarding-status`, `/api/brands`, `/api/articles` queries — same pattern as `SidebarOnboarding.tsx:95-115`.
   - When `completed === total`, show a celebratory state with "What's next: run weekly citation checks" + link to `/citations`.

3. **Slot it on the dashboard** at the top of `client/src/pages/home.tsx`:
   - Above the existing hero metrics row, render the ring **only when `completed < total`**. Once complete, dismiss permanently (key in localStorage by `user.id`) so the dashboard doesn't permanently waste a hero slot.

4. **Optional:** add a separate "GEO health ring" later that aggregates citation rate + visibility score + content count — not in this scope, but design the component to accept any 0-100 score so it can be reused.

**Acceptance criteria:**
- Ring renders on `/dashboard` for users who haven't completed onboarding.
- Click on any step → navigates to that page.
- Completing the last step animates the ring to 100% and the card transitions to "you're set" state, then disappears on next page load.
- Sidebar widget and dashboard ring stay in sync because they read from the same `STEPS` definition.
- Mobile: stacks below the hero row, ring scaled to 120px.

**Effort:** **S** (half-day to 1 day). Mostly composition; the ring component already exists.

---

### A3. Citation locations — show *where*, not just *how many*

**Source:** Transcript 32:34 ("when I ran it on Venture PR, it said two citations, but then it didn't tell me where the citations were or what they were").

**Why this matters:** Direct user complaint. Today the citations page DOES show per-platform results but only after the user expands an accordion AND a sub-accordion. The header summary just says "2 cited / 24 checked" with no preview of which platforms or which prompts produced citations.

**Where in code today:**
- `client/src/pages/citations.tsx` — citations page, tab structure.
- `client/src/components/citations/ResultsTab.tsx` — by-platform stats card + by-prompt accordion.
- `client/src/components/citations/PlatformResultCard.tsx` — per-platform card with cited/not-cited pill, expandable full response. **Already shows the AI response markdown** when expanded, but does NOT show where in that response the brand was mentioned, and the platforms/citations summary at the top is just a count.
- `server/routes/prompts.ts` — citation run endpoints.
- `shared/schema.ts` — `prompt_run_results` table holds the response text.

**How — implementation steps:**

1. **"Cited mentions" panel** at the top of `ResultsTab.tsx`:
   - When `totalCited > 0`, render a horizontal scroll strip of "citation cards" — one per cited result. Each card shows: platform pill, prompt (truncated), the **highlighted snippet** where the brand name appears (already extractable from `snippet` or `fullResponse`).
   - Click → opens the existing PlatformResultCard expanded.
   - Empty state: "No citations yet. Run a check or wait 1–2 weeks for new content to be indexed by LLM models." (Reuses the lag-time language Vivek used at 32:48.)

2. **Highlight brand mentions inside the response** in `PlatformResultCard.tsx`:
   - Add a `highlightTerms?: string[]` prop (brand name + variations). Use `SafeMarkdown` already in the file but pre-process the markdown to wrap matches in `<mark>` tags. Sanitize via existing `rehype-sanitize`.
   - Source the variations from the brand record (`shared/schema.ts` brands table — name + alternate names).

3. **Citation source URLs (when LLM returned them)**:
   - Many model responses include URLs the LLM cited. Extract them with a regex on the response text in `server/citationChecker.ts` (where the response is parsed) and store as `citedUrls: string[]` column on `prompt_run_results`. Add migration in `migrations/`.
   - In the frontend card, render extracted URLs as a "Sources cited in response" pill list with `<a href>` (`rel="noopener noreferrer"`).

4. **Update Hero card on dashboard** (`client/src/pages/home.tsx`) — the "Cited / Total" tile should be clickable and route to `/citations` with the latest run pre-selected.

**Acceptance criteria:**
- A user with 2 citations sees both citation cards above the fold on `/citations`, each showing platform + prompt + highlighted snippet, before any clicking.
- Brand name is visually highlighted (yellow/violet bg) inside the rendered response.
- Source URLs that the LLM included in its answer are extracted and listed.
- Empty-state explains the 1–2 week LLM lag.

**Effort:** **M** (1–2 days). Migration + extraction + UI panel.

---

### A4. Published Articles directory — public list + VenturePR import

**Source:** Transcript 1:11 ("the published page, but I think the problem with that one is that because we only have just one article over there, the whole page is looking very empty"). Action item logged at 1:38 ("Add 2–3 existing articles to Published page").

**Why this matters:** The public-facing "look at our content" surface is empty. Without seed content, the directory feels dead and is unusable as social proof.

**Where in code today:**
- `client/src/pages/articles.tsx` — *authenticated* article list. Status filter `ready / draft / generating / failed`. NO public route.
- `server/routes/articles.ts` — CRUD, all auth-gated.
- No `/published` or `/articles/public` route exists.
- `server/lib/shopifyWebhook.ts` exists but is signature-verification only — no payload handling or import.

**How — implementation steps:**

1. **Public published page** — `client/src/pages/published.tsx` (new):
   - Public route in `client/src/App.tsx` (no `AuthenticatedRoute` wrapper).
   - Reads `GET /api/published-articles` (new public endpoint) with brand logos, titles, excerpts, published date, "View on VenturePR" link.
   - Render as a 3-column responsive grid with hover lift; empty state hidden because seed data fills it.
   - SEO: include `<title>`, `<meta description>`, JSON-LD `BlogPosting` schema for each article — this directly helps GEO.

2. **Public endpoint** — `server/routes/articles.ts` add `GET /api/published-articles?limit=50`:
   - Returns articles with new boolean column `is_public_published = true`.
   - No auth required. Rate-limit it (60/min/IP) to avoid scraping. Cache 5 minutes via `Cache-Control: public, max-age=300`.

3. **Schema migration** — `shared/schema.ts` and a new SQL file in `migrations/`:
   - Add `articles.is_public_published BOOLEAN DEFAULT false NOT NULL`.
   - Add `articles.public_slug TEXT UNIQUE` for nice URLs (`/p/:slug`). Generate with `slugify(title) + '-' + nanoid(6)` on first publish.
   - Add `articles.published_at TIMESTAMPTZ`.

4. **Toggle in admin UI** — `client/src/components/articles/ViewEditDialog.tsx`:
   - Add "Publish to public directory" switch when status === "ready".
   - Hits `PATCH /api/articles/:id` with `{ is_public_published: true }`.

5. **Seed VenturePR articles**:
   - Vandan to provide 4-6 existing VenturePR thought-leadership pieces as Markdown.
   - One-off script `scripts/seedPublishedArticles.ts`:
     - Reads `seed/published-articles.json` (committed), each entry: `{ title, content, excerpt, brandName, sourceUrl, publishedAt }`.
     - Inserts via Drizzle, sets `is_public_published = true`, links to a "VenturePR" brand record (create if missing).
   - Run via `tsx scripts/seedPublishedArticles.ts` once after migration.

6. **Article detail page** — `client/src/pages/published-article.tsx`:
   - Public route `/p/:slug`.
   - Renders article markdown with `SafeMarkdown`, brand info, "Want this for your brand? Get a free GEO audit →" CTA linking to `/register?utm_source=published`.
   - Open Graph + JSON-LD schema.

**Acceptance criteria:**
- `/published` renders 4+ articles with hero images / brand logos.
- Each article has a clean URL `/p/:slug`.
- Internal users can toggle "publish to directory" on any article from the auth side.
- Page passes Google's Rich Results Test for Article schema.
- Articles render server-side (or pre-rendered at build) for SEO — see §A4-note below.

**A4-note (SSR/prerender):** the app is a Vite SPA. For SEO of the published page, use `vite-plugin-prerender-spa` or static prerender of the public routes at build time. Or move public routes to a tiny Express SSR pass that serves prerendered HTML. Pick one in design review — adds 0.5 day.

**Effort:** **L** (3–5 days) including the SEO/prerender work and seed.

---

### A5. Per-page educational context

**Source:** Transcript 12:55 ("if each page said not only what it does, but where it kind of fits, like do this before you've done this or do this after you've done this, or this is the most critical").

**Why this matters:** Same root cause as the chatbot — the cold user is lost. Page-level explainers are the *passive* solution; the chatbot is the *active* one. Both ship.

**Where in code today:**
- `client/src/components/PageHeader.tsx` exists (only 28 lines — title + description). Already used on most pages (`articles.tsx:217`, `citations.tsx`, etc.).
- No standardized "info" / "where does this fit" component.
- No GEO/AEO/SEO glossary anywhere.

**How — implementation steps:**

1. **Extend `PageHeader.tsx`** to accept an optional `explainer` prop:
   ```ts
   type Props = {
     title: string;
     description?: string;
     explainer?: {
       summary: string;        // "Citation checks ask AI engines if they mention your brand."
       prerequisites?: string; // "Run this AFTER creating a brand and a few articles."
       expectedOutcome?: string; // "Citations appear within 1-2 weeks of new content being indexed."
       relatedConcept?: "GEO" | "AEO" | "SEO";
     };
   };
   ```
   Render explainer behind an `(i)` info icon next to the title that opens a `Popover`.

2. **GEO/AEO/SEO glossary tooltip** — `client/src/components/GeoConceptBadge.tsx`:
   - `<GeoConceptBadge concept="GEO" />` → small pill that on hover shows a Popover with definition + "Learn more" link to a glossary page.

3. **Glossary page** — `client/src/pages/glossary.tsx` (public route):
   - GEO / AEO / SEO definitions, history, why they differ, how VentureCite covers each.
   - Pull text from the meeting (Ben asked for this directly at 13:35: "should there be that note somewhere so they understand, here's specifically what GEO is and what this tool is doing for you").

4. **Populate explainers on every authenticated page** (one-pass PR):
   - `/dashboard` — "Your GEO command center. Run citation checks here, then dig into specific tools as needed."
   - `/citations` — "Asks ChatGPT, Claude, Perplexity, and others your prompts and tracks whether they mention you. Run AFTER setting up brand + a few articles. Results visible within 1-2 weeks of indexing."
   - `/ai-visibility` — "One-time setup checklist. Do this BEFORE expecting citations. Each step boosts your machine-readability for AI engines."
   - `/content` — "AI-optimized content drafts. Publish to your site, then run citations to track impact."
   - `/community` — "Reddit + Quora outreach. AEO tactic — direct engagement that LLMs scrape."
   - …and so on for each of the 35+ pages.

5. **Sidebar reorder** — meeting hint at 12:50 ("a little bit more of moving things around if we need to move the pages around for, like, an order"):
   - Reorder `Sidebar.tsx` `NAV_*` arrays into the recommended workflow:
     1. Setup → Dashboard, Brands, AI Visibility (the checklist)
     2. Create → Content, Articles
     3. Measure → Citations, GEO Analytics, AI Intelligence
     4. Grow → Community, Opportunities, Competitors
     5. Optimize → GEO Tools, Signals, Crawler Check, FAQ Manager, Fact Sheet
   - Match this order to a recommended user journey.

**Acceptance criteria:**
- Every authenticated page has an `(i)` icon in its header that opens a popover with summary, prerequisites, expected outcome.
- Glossary page renders with full GEO/AEO/SEO breakdown and is linked from every popover.
- Sidebar order matches the recommended workflow.

**Effort:** **M** (2 days for component + glossary + 1 day to populate copy across all pages).

---

### A6. Priority list / recommendation engine

**Source:** Transcript 11:17 ("a priority list… recommendation engine… it could be tutorial… recommended onboarding"). Ben pitches this as an alternative to the chatbot but in practice it complements it.

**Why this matters:** A passive but actionable surface that says "based on YOUR brand, do these 3 things next, in this order".

**Where in code today:**
- `client/src/components/dashboard/ActionPlanItem.tsx` exists. Pattern is in place.
- `server/lib/suggestionGenerator.ts:1-7881` — already generates suggestions. Read this file before implementing — it may already do most of this.
- No `/api/recommendations` endpoint surfaced as a standalone "what should I do next" panel on dashboard.

**How — implementation steps:**

1. **Read & extend** `server/lib/suggestionGenerator.ts`. Wire it (if not already) to a `GET /api/brands/:brandId/recommendations` endpoint that returns `{ items: [{ id, title, why, ctaLabel, ctaHref, priority: "P0"|"P1"|"P2", category: "setup"|"content"|"citations"|"signals" }] }`.

2. **Recommendation rules** (deterministic — no LLM cost per pageview):
   - No brand → "Create your first brand" P0.
   - Brand but no `industry` set → "Add your industry to brand profile" P0.
   - Brand has 0 articles → "Generate your first article" P0.
   - Brand has 0 prompts in `brand_prompts` → "Generate citation-check prompts" P0.
   - Brand has 0 completed citation runs → "Run your first citation check" P0.
   - Citation rate < 20% → "Add brand fact sheet" + "Optimize FAQ" P1.
   - No GEO Signals scan in last 14 days → "Re-run GEO Signals" P1.
   - No competitor analysis → "Add competitors" P2.
   - AI Visibility checklist <50% → "Complete checklist" P1.

3. **Dashboard panel** — `client/src/components/dashboard/RecommendationsPanel.tsx`:
   - 3-5 P0/P1 items max. Each is `ActionPlanItem` (reuses existing component).
   - "Why we recommend this" tooltip per item.
   - When clicked, mark dismissed in `localStorage` so it falls down the list (don't dismiss server-side; it might recur).

4. **Slot it** on `/dashboard` directly under the onboarding ring.

**Acceptance criteria:**
- A new user with 1 brand and 0 content sees: 1) Generate article, 2) Generate prompts, 3) Run first citation check.
- A user with 50% citation rate sees content and signal recommendations, not setup ones.
- Each item has a clear CTA that deep-links to the right page.

**Effort:** **M** (2 days; less if `suggestionGenerator.ts` already covers most rules).

---

### A7. Expectations & tracking — "when will I see results"

**Source:** Transcript 14:05 ("once they've done the stuff on this chat GPT visibility checklist, how will they know that they see any results or any changes from it?"). Reinforced 18:30, 19:23.

**Why this matters:** Without an expectation-setting layer, users assume the tool is broken when they don't see citation count rising in the first hour. We already have the data (citation history, run timestamps) — we just don't tell the user the timeline.

**Where in code today:**
- Vivek explicitly says at 32:48: "for updating or getting cited on an LLM model, it takes about like a couple of weeks to get cited". This information lives in *no code or UI*.
- `server/routes/dashboard.ts` returns 8-week citation trend.
- No "what to expect" or timeline component.

**How — implementation steps:**

1. **"What to expect" module** on dashboard — `client/src/components/dashboard/ResultsTimeline.tsx`:
   - Static timeline graphic with 4 milestones:
     - Day 0: Setup brand + AI Visibility checklist.
     - Week 1: Generate 5–10 articles, publish to site, submit to indexing tools.
     - Week 2–3: First citations appear as LLMs re-index your content.
     - Week 4+: Citation rate stabilizes, ranking emerges.
   - Below the timeline, a line: "Your account is currently at: **week 1**" computed from `min(brand.createdAt)`.

2. **First-run citation-check empty state** in `ResultsTab.tsx`:
   - When `totalChecks === 0`, show a hero panel: "First check coming up. Citations typically appear 1–2 weeks after you publish new content. Older content may already be cited — run the check to find out."

3. **Citation trend chart** — already on `home.tsx` per inventory. Add an annotation on the X-axis when "first content was published" so users see the lag visually.

4. **Email digest** — `server/scheduler.ts` already has weekly report. Add to the email body:
   - "Week N since you started VentureCite"
   - "Expected next milestone: <X>"
   - This sets expectations passively over time.

**Acceptance criteria:**
- Every dashboard view includes a clear "what to expect by when" section.
- Empty state on `/citations` is informative, not just an empty card.
- Weekly email mentions the user's current "week N" and the next expected milestone.

**Effort:** **S** (1 day).

---

### A8. CMS integration with VenturePR

**Source:** Transcript 2:18 ("connect Venture Site with Venture PRs CMS… we need to connect it to that"), 2:34 (Vivek confirms "we need to connect it to that"). Ben at 3:45 ("if I'm one of our customers… do I attach it automatically to my website").

**Why this matters:** Right now content lives in VentureCite. Customers want it pushed to their actual sites with one click. Without this, the platform produces drafts that customers have to manually copy/paste — a major UX leak.

**Where in code today:**
- `server/lib/shopifyWebhook.ts` — HMAC verification only, no payload handler.
- No WordPress, Webflow, Ghost, or Framer integration.
- VenturePR's CMS — unknown which platform; ask Vandan.

**How — implementation steps:**

1. **Decide on integration scope** with Ben/Vandan. Recommend **WordPress + Webflow + generic webhook** as v1 (covers ~70% of mid-market sites). Defer Shopify (less common for blog content), Framer (still emerging).

2. **Schema** — add tables in `shared/schema.ts`:
   - `cms_connections` — `(id, brandId, type: 'wordpress'|'webflow'|'venturepr'|'webhook', credentials: jsonb encrypted, createdAt, lastSyncAt)`. Encrypt credentials with `tokenCipher.ts` (already in `server/lib/`).
   - `article_publications` — `(id, articleId, cmsConnectionId, externalId, externalUrl, publishedAt, status)`.

3. **Backend** — `server/lib/cms/` (new dir):
   - `wordpress.ts` — uses WP REST API `/wp-json/wp/v2/posts` with application password auth.
   - `webflow.ts` — uses Webflow API v2 `/collections/:id/items`.
   - `venturepr.ts` — purpose-built for VenturePR's CMS (Vandan to specify endpoint).
   - All implement a common `CmsAdapter` interface: `connect(creds): Promise<void>`, `publish(article): Promise<{externalId, url}>`, `unpublish(externalId): Promise<void>`, `verify(): Promise<boolean>`.

4. **Routes** — `server/routes/cms.ts` (new):
   - `POST /api/brands/:brandId/cms-connections` — create.
   - `DELETE /api/brands/:brandId/cms-connections/:id` — delete.
   - `POST /api/articles/:id/publish` body `{ cmsConnectionId }` — push to remote CMS, persist `article_publications` row.
   - All require ownership via `enforceBrandOwnership`.

5. **Outbound URLs MUST go through `safeFetchUrl()`** in `server/lib/ssrf.ts` to prevent SSRF (a customer could enter a CMS URL pointing at a private IP).

6. **Frontend** — `client/src/pages/cms-settings.tsx` (new):
   - Per-brand list of connections, "Add connection" wizard with 3 forms (WP / Webflow / VenturePR / generic webhook).
   - Verify connection with a `POST /verify` round-trip on submit.
   - Per-article: in `DistributeDialog.tsx` add a "Publish to CMS" tab listing the brand's connections.

7. **Auto-publish** — extend `contentGenerationWorker.ts` so when `auto_publish_to: cmsConnectionId` is set on the article, push immediately on `status === 'ready'`.

**Acceptance criteria:**
- A user can add a WordPress connection, click "Publish" on a ready article, and see it appear on their WP site within 5s.
- Failed publish shows actionable error ("WordPress returned 401 — credentials invalid").
- Credentials encrypted at rest.
- No SSRF possible — pointing at `http://localhost` or `169.254.169.254` rejected at adapter level.

**Effort:** **XL** (1.5 weeks for WP + Webflow + generic webhook + UI). Cut to **L** if we ship only WP + generic webhook v1.

---

### A9. Lead magnet capture page

**Source:** Transcript 41:58 ("the only time I've ever actually seen a high volume of leads come in is when we did a lead magnet… we put on the website and we did ads on Meta or Instagram"). Ben asks Vandan to resend lead magnets.

**Why this matters:** This is a marketing-side ask but it lives on the venture-cite codebase because the public site is hosted there. We need a public page that takes an email + sends back the magnet (PDF download or video).

**Where in code today:**
- `client/src/pages/landing.tsx` and `landing2.tsx` exist but no lead-capture form linked to a magnet.
- No `lead_captures` table.
- `server/emailService.ts` exists (Resend).

**How — implementation steps:**

1. **Schema** — `lead_captures` table: `(id, email, magnetSlug, source, utm: jsonb, createdAt, ipHash)`.

2. **Public route** — `/free-geo-audit` and `/lead/:magnetSlug`:
   - `client/src/pages/lead-capture.tsx` — landing page with hero, value prop, email form (zod-validated, honeypot field).
   - Submit hits `POST /api/lead-capture` body `{ email, magnetSlug, utm? }`. Captcha via hCaptcha free tier or Cloudflare Turnstile (both free).

3. **Backend** — `server/routes/lead.ts`:
   - Rate-limit 5/IP/min.
   - Persist row.
   - Send Resend email with PDF attachment OR with a signed download URL (Supabase Storage signed URL, expires 7 days).
   - Send to HubSpot via API (Vandan already has HubSpot — see transcript 30:53). Add `HUBSPOT_API_KEY` to env.

4. **Magnets** — store as PDFs in Supabase Storage bucket `lead-magnets` (private), generate signed URL per email send.

**Acceptance criteria:**
- `/free-geo-audit` is a clean, fast public page.
- Submitting email → instant download link in email + HubSpot contact created with magnet UTM.
- Honeypot + Turnstile prevent bot scraping.
- Rate-limited.

**Effort:** **M** (2 days).

---

### A10. Services menu / book-a-call inside the app

**Source:** Transcript 25:52 ("I want to put together a menu of services for clients that are a la carte add-on… or retainer"). Action item logged.

**Why this matters:** VentureCite is the wedge — VenturePR's services are the revenue. The app must surface "talk to us" CTAs cleanly without feeling spammy.

**Where in code today:**
- `client/src/pages/outreach.tsx` exists and is functional for the user's own outreach (per inventory). NOT the same as VenturePR services.
- No `/services` page, no Calendly/Cal.com embed.

**How — implementation steps:**

1. **Services page** — `client/src/pages/services.tsx` (authenticated):
   - Card grid of service tiers Vandan/Ben define (PR distribution, Reddit campaigns, content production, GEO audit, custom retainer).
   - Each card has: name, what's included, price (or "from $X"), "Book a call" CTA.
   - Link from sidebar bottom: replace the disabled "Account settings" item with a "Services" link or add it as a separate sidebar group "VenturePR".

2. **Book-a-call modal** — embed Cal.com inline or open a new tab to Ben's link. Require Vandan to provide URL.

3. **Contextual CTAs** — non-intrusive but visible:
   - On `/citations` if `citationRate < 30%` after 4 weeks → small banner "Want a 30-day GEO acceleration package? Talk to us →".
   - On `/community` outreach campaigns → "Hand this over to VenturePR's team".

4. **Pricing on the public site** (`landing.tsx` or new `/services-public` page) — same content but reachable without login.

**Acceptance criteria:**
- Logged-in user has a "Services" link in sidebar leading to a clean menu.
- "Book a call" opens Calendly/Cal.com.
- Contextual CTAs fire when relevant signals exist (low citation rate, etc.).

**Effort:** **S–M** (1–2 days).

---

### A11. White-label tracking dashboard for Ben

**Source:** Transcript 34:21–35:51 ("I want to create one dashboard… one place where I can have it say, here's what we're doing in GEO, AEO, SEO… some understanding of how we are, what the grade is… same thing for anything we're doing in terms of email from Unify, from Instantly").

**Why this matters:** Ben asked for a *cross-tool* dashboard that shows VentureCite + Unify (cold email) + Instantly + HubSpot + Reddit/Quora efforts in one view. Vandan promised at 35:51: "we can build, like, a sort of a web app that we can all use together for tracking tasks."

**Decision required up-front:** is this a feature inside VentureCite (multi-tenant; Ben is just one customer who happens to also get this view) OR a separate internal portal? The transcript implies separate internal but Ben says "white-label" elsewhere. Confirm with Vandan/Ben before building.

**Recommendation:** ship **inside VentureCite** as an admin-only page `/agency-dashboard` gated behind a `users.is_agency_admin` flag. Reuses all the auth/UI infra. Add Unify/Instantly/HubSpot integrations as data sources for the agency view only.

**Where in code today:**
- `client/src/pages/client-reports.tsx` exists — closest analog. Read it before deciding to fork or extend.
- No HubSpot, Unify, Instantly integrations.

**How — implementation steps:**

1. **Confirm scope** with Ben (see open questions, §7).

2. **If proceed inside VentureCite**:
   - Add `users.is_agency_admin BOOLEAN DEFAULT false` migration.
   - `client/src/pages/agency-dashboard.tsx` (auth-gated + admin-gated).
   - Server: `server/routes/agency.ts` aggregates:
     - VentureCite: leaderboard of all brands' citation rates, recent runs.
     - HubSpot: contacts created last 7 days, pipeline value (HubSpot Search API).
     - Instantly: replies received, open rates (Instantly API v2).
     - Unify: opens, replies (Unify API).
   - Each integration: `server/lib/integrations/{hubspot,instantly,unify}.ts`. Tokens stored encrypted in `agency_integrations` table.
   - Refresh: cron every 1h via `server/scheduler.ts`.

3. **Goals & ROI inputs** — Ben asked at 36:48 ("I'll want to align how much we're spending on each thing"):
   - Add `agency_goals` table: `(metric, target, period)`.
   - Add `agency_spend` table: `(channel, amount, period)`.
   - UI: editable goals + spend → ROI = leads × ARPU − spend.

4. **HubSpot integration** — already used per transcript 30:53. Just add API token; existing HubSpot setup is the source of truth for leads.

**Acceptance criteria:**
- Ben can log in, switch to "Agency view" and see GEO + email + Reddit metrics in one dashboard with set goals and ROI math.
- Numbers refresh automatically; manual "refresh" button works on-demand.
- Read-only for non-admin users.

**Effort:** **XL** (1.5–2 weeks). Largest single item. Defer until A1–A8 are done unless this is the new top priority.

---

## 3. Workstream B — Production-readiness fixes

> Findings from the security/leak audit. Severity: **CRITICAL** = ship-blocker, **HIGH** = ship within 1 week, **MEDIUM** = ship within 2 weeks, **LOW** = backlog.

---

### B1. Security findings

#### B1.1 — HIGH: SSRF via user-supplied Slack webhook

**Where:** [`server/routes/intelligence.ts:827`](server/routes/intelligence.ts#L827) — `fetch(setting.slackWebhookUrl, ...)` does manual hostname check (`endsWith("slack.com")`) but does NOT use `safeFetchUrl()` from [`server/lib/ssrf.ts`](server/lib/ssrf.ts). DNS-rebinding bypass possible.

**Fix:**
1. Wrap the call: `await safeFetchUrl(setting.slackWebhookUrl, { ... })`.
2. Tighten URL validation at the *write* path (the route that creates a Slack alert setting) — require the URL to match the official `https://hooks.slack.com/services/T*/B*/...` pattern via regex BEFORE persisting.
3. Test: try saving `https://hooks.slack.com.evil.com/...` and `https://localhost:8443/`.

**Effort:** **S** (2 hours).

#### B1.2 — MEDIUM: Auth error logging via `console`

**Where:** [`server/auth.ts:207`](server/auth.ts#L207), [`server/auth.ts:218`](server/auth.ts#L218), [`server/auth.ts:411`](server/auth.ts#L411), [`server/auth.ts:420`](server/auth.ts#L420) — `console.warn` / `console.error` on JWT verification failures and forgot-password errors.

**Fix:**
1. Replace with the project's structured logger ([`server/lib/logger.ts`](server/lib/logger.ts) — Pino).
2. Log at `warn` level with redaction: `logger.warn({ event: 'jwt_verify_failed', userId: ... }, 'JWT verification failed')`. Do NOT log the token, full headers, or `error.message` if it might contain user input.
3. Verify Pino's redact paths config covers `req.headers.authorization`.

**Effort:** **S** (1 hour).

#### B1.3 — MEDIUM: Some routes return 500 without Sentry capture

**Where:** [`server/routes/intelligence.ts:28-49`](server/routes/intelligence.ts#L28-L49) — generic `res.status(500).json(...)` without `Sentry.captureException(err)`. Several other routes likely have the same pattern.

**Fix:**
1. Audit `git grep -n "status(500)" server/routes/` and add `Sentry.captureException` before each.
2. Better: add a centralized `asyncHandler` wrapper that auto-captures and rethrows, and wrap every route handler. Pattern:
   ```ts
   const asyncHandler = (fn) => (req, res, next) =>
     Promise.resolve(fn(req, res, next)).catch((err) => {
       Sentry.captureException(err);
       next(err);
     });
   ```
3. Then a single Express error handler in `server/index.ts` returns the response.

**Effort:** **M** (1 day).

#### B1.4 — LOW: SSE keep-alive intervals not cleared on client disconnect

**Where:** [`server/routes/content.ts`](server/routes/content.ts), [`server/routes/prompts.ts`](server/routes/prompts.ts) — `setInterval()` for SSE heartbeats; cleanup not confirmed on `req.on('close')`.

**Fix:**
1. In every SSE handler, attach:
   ```ts
   const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
   const cleanup = () => { clearInterval(heartbeat); res.end(); };
   req.on("close", cleanup);
   req.on("aborted", cleanup);
   res.on("close", cleanup);
   ```
2. Test by opening an SSE connection, killing the client, and confirming the interval ID is gone via `process._getActiveHandles()` in dev.

**Effort:** **S** (2 hours).

#### B1.5 — LOW: Unbounded in-memory Maps in citation pipeline

**Where:** [`server/citationChecker.ts`](server/citationChecker.ts) — `competitorDetections = new Map<string, Map<string, number>>()` per run; no bound.

**Fix:**
1. Add a hard cap (e.g. 50 competitors × 100 platforms = 5000 entries) and stop adding once hit.
2. The Map is scoped to a single run handler — once the run completes the Map is GC'd. Real risk only if a runaway run never completes.
3. Confirm by reading `runCitationCheck()` end-of-function — Map should be local, not module-level.

**Effort:** **S** (1 hour).

#### B1.6 — LOW: `dangerouslySetInnerHTML` in chart util

**Where:** `client/src/components/ui/chart.tsx` — Recharts internal CSS. Trusted lib, but verify the input is constant string and not user-derived.

**Fix:** read the file, confirm template is hardcoded, document with a comment.

**Effort:** **S** (15 min).

---

### B2. Memory & resource leaks

Already covered in B1.4 and B1.5 above. Additional:

#### B2.1 — Verify worker cleanup on SIGTERM

**Where:** [`server/index.ts`](server/index.ts), [`server/contentGenerationWorker.ts`](server/contentGenerationWorker.ts), [`server/scheduler.ts`](server/scheduler.ts).

**Fix verification:**
1. Confirm SIGTERM handler:
   - Stops accepting new HTTP requests (`server.close()`).
   - Drains the content generation worker (`worker.stop()`).
   - Cancels all `node-cron` schedules.
   - Calls `pool.end()` on the Postgres pool.
   - Times out and force-exits after 10s.
2. Reading `server/index.ts:500` confirms `setTimeout(..., 10_000)` for graceful shutdown — good. Confirm each worker has a `.stop()` that's called.

**Effort:** **S** (verification only, ~1 hour).

#### B2.2 — Pool config audit

**Where:** [`server/db.ts`](server/db.ts) — `max: 10, idleTimeoutMillis: 30_000`.

**Action:** Supabase's default pooler tier handles ~50 concurrent connections per project. With `max: 10` per dyno × N dynos, ensure `N * 10 < 50`. If we plan to scale beyond 4 dynos, raise pooler tier or switch to Supavisor session mode.

**Effort:** **S** (config decision).

---

### B3. Rate limiting & abuse

#### B3.1 — Audit AI endpoints

**Where:** Most AI-cost endpoints already use `aiLimitMiddleware` per audit. Ones to verify:
- `POST /api/alerts/test/:settingId` (`server/routes/intelligence.ts:808`) — fires Slack webhook, no limiter.
- Any `POST` route under `server/routes/contentTypes.ts`, `server/routes/agent.ts` — spot-check.

**Fix:** add `aiLimitMiddleware` (already exists) to anything that calls OpenAI/Anthropic, even indirectly.

**Effort:** **S** (2 hours, mostly grep + wrap).

#### B3.2 — Public endpoints rate limit

When A4 (public articles) and A9 (lead capture) ship, both need explicit IP-based rate limits (`express-rate-limit` with `standardHeaders: true`). Already noted in those sections.

---

### B4. Error handling & observability

#### B4.1 — Sentry tag coverage

Audit reports Sentry IS integrated. Verify:
- Every route has a `Sentry.captureException(err, { tags: { route: '<name>', userId: req.user?.id } })`.
- Front-end `client/src/components/ErrorBoundary.tsx` reports to `@sentry/react`.

**Fix:** B1.3 covers most of this via centralized `asyncHandler`.

#### B4.2 — Source maps

Ensure `vite.config.ts` uploads source maps to Sentry on production builds AND does NOT serve them publicly. Check `build.sourcemap` setting.

**Effort:** **S** (30 min).

---

### B5. Logging hygiene

Covered in B1.2. Beyond that:

#### B5.1 — Confirm no token logging anywhere

```bash
grep -rn "console\.\(log\|warn\|error\|info\)" server/ client/src/ | grep -v ".test.ts"
```
Audit each remaining call. Replace with structured logger or remove.

**Effort:** **S** (1–2 hours).

#### B5.2 — Pino redact list

Confirm [`server/lib/logger.ts`](server/lib/logger.ts) redacts `*.authorization`, `*.cookie`, `*.password`, `*.token`, `req.body.password`.

**Effort:** **S** (15 min review).

---

### B6. Database & migrations

#### B6.1 — Migrations folder review

`migrations/` has 45 SQL files per `ls` output. Spot-check the last 5 for:
- No `DROP TABLE` / `DROP COLUMN` that fires on populated DB.
- Indexes on `prompt_run_results.brand_id`, `articles.brand_id`, `articles.is_public_published` (after A4), `lead_captures.email` (after A9).
- Foreign keys ON DELETE CASCADE where appropriate.

**Effort:** **S** (1 hour).

#### B6.2 — Drizzle schema vs DB drift

Run `npx drizzle-kit check` and resolve any drift before launch.

**Effort:** **S** (30 min if no drift, more if drift).

---

### B7. Frontend hardening

#### B7.1 — Console.log scrub

Already in B5.1 — applies to client too.

#### B7.2 — CSP nonce for inline styles

[`server/index.ts:49-73`](server/index.ts) — Helmet CSP. Production strict mode is good. Verify Recharts' inline styles don't break under prod CSP. If they do, switch to `style-src 'self' 'unsafe-inline'` for production with documented rationale, OR add a nonce middleware.

**Effort:** **S** (test in prod mode).

#### B7.3 — LocalStorage audit

Confirm no auth tokens, no PII in localStorage. Already verified in audit (only draft IDs, brand selection, UI state).

---

### B8. Operational readiness

#### B8.1 — Health check endpoint

Add `GET /api/health` that:
- Returns 200 + `{ status, dbLatencyMs, version }`.
- 503 if DB ping fails.
- Mounted before auth middleware.

**Effort:** **S** (30 min).

#### B8.2 — Structured request logging

Confirm Pino HTTP middleware logs every request with method, path, status, latency, userId. Review [`server/index.ts`](server/index.ts) for `pino-http`.

**Effort:** **S** (30 min).

#### B8.3 — Sentry release tagging

In the build pipeline, set `SENTRY_RELEASE = git rev-parse HEAD`. Upload source maps with the release name. This makes Sentry events traceable to commits.

**Effort:** **S** (CI tweak — 30 min).

#### B8.4 — RUNBOOK update

[`docs/RUNBOOK.md`](docs/RUNBOOK.md) — verify these scenarios are documented:
- DB connection pool exhausted.
- Stripe webhook signature failures.
- OpenAI 429 / outage.
- LLM budget exceeded.
- Worker stuck on a content generation job.

**Effort:** **S** (1 hour).

#### B8.5 — Backup & restore drill

Confirm with Supabase that:
- Daily backups are enabled.
- Point-in-time recovery is set up (paid feature on Supabase Pro+).
- Document restore procedure in RUNBOOK.

Run a restore drill into a staging project before launch.

**Effort:** **M** (1 day for the drill).

#### B8.6 — Status page

Stand up a simple status page (Statuspage.io free tier OR a `<head> <link rel="icon">` + `betterstack.com` free tier). Link from the marketing site footer.

**Effort:** **S** (1 hour).

---

## 4. Workstream C — UX polish & design pass

**Source:** Transcript 26:00 ("be honest with me and yourselves on whether you think we need to do anything else from a design and UI perspective, just to make this really sharp and like people would pay for this").

### C1. Empty states

- Every page list (`/articles`, `/citations`, `/community`, `/competitors`) needs a meaningful empty state with: illustration, one-line explainer, primary CTA. Most are partly there ([`articles.tsx:223-235`](client/src/pages/articles.tsx#L223-L235)) — audit each page.

### C2. Loading states

- Replace generic spinners with skeleton screens that match the eventual layout (fewer layout jumps). [`client/src/components/ui/skeleton.tsx`](client/src/components/ui/skeleton.tsx) already exists.

### C3. Error states

- Most pages bubble errors silently. Add `<ErrorState retry={...} />` panels for query failures.

### C4. Mobile audit

- Sidebar collapses on mobile. Confirm all 39 pages render correctly at 375px width. Especially `/citations` (tab-heavy), `/geo-tools` (huge form), `/agent-dashboard` (80k bundle).

### C5. Accessibility pass

- Run `axe-core` against the running dev server.
- Top fixes: add `aria-label` on icon-only buttons, ensure all form fields have labels, contrast ratios on muted text.

### C6. Brand identity

- Ben at 4:00: "I can't tell right now with the red logo if I like it or not anymore". Logo / color review with him before launch.

**Effort:** **L** (3–5 days for one designer + dev).

---

## 5. Sequencing & milestones

### Milestone 1 — "Trust" (Week 1)
*Goal: nothing leaks, nothing crashes, audit logs are clean.*

- B1.1 SSRF fix
- B1.2 console → logger
- B1.3 Sentry asyncHandler
- B1.4 SSE cleanup
- B5.1 + B5.2 Logging hygiene
- B8.1 Health check
- B8.4 Runbook update

### Milestone 2 — "Comprehension" (Week 2-3)
*Goal: a cold user, dropped into VentureCite, knows what to do.*

- A1 AI Education Assistant
- A2 Onboarding ring on dashboard
- A5 Per-page educational context + glossary + sidebar reorder
- A6 Recommendation engine
- A7 Expectations & "what to expect" timeline
- C1–C3 Empty/loading/error states
- B6.1 Migration audit

### Milestone 3 — "Proof" (Week 3-4)
*Goal: users see results clearly; the directory looks alive.*

- A3 Citation locations / where, not just count
- A4 Published articles directory + VenturePR seed (1.5 weeks)
- A9 Lead magnet capture
- C4–C5 Mobile + a11y pass

### Milestone 4 — "Revenue" (Week 4-5)
*Goal: the platform sells more services for VenturePR.*

- A10 Services menu + book-a-call
- A8 CMS integration (WP + generic webhook v1)
- C6 Brand identity sign-off

### Milestone 5 — "Agency view" (Week 5-7)
*Goal: Ben has the cross-tool dashboard he asked for.*

- A11 White-label tracking dashboard
- B8.5 Backup/restore drill
- B8.6 Status page

---

## 6. Definition of done

A feature is "done" when:

1. Code merged to `main` with green CI (`npm run check && npm run lint && npm test`).
2. New endpoints have at least one Vitest integration test in `tests/`.
3. New pages have at least one happy-path manual test, screenshotted in the PR.
4. Mobile width 375px verified.
5. Sentry release tagged.
6. RUNBOOK updated for any new failure modes.
7. New env vars added to `.env.example` AND validated in `server/env.ts`.
8. New migrations idempotent (run twice → no error) and rollback documented.
9. Rate limits + auth checks present on every new route (audit checklist).
10. Documented in `docs/` if it changes the user flow.

---

## 7. Open questions for Ben

> Send these in Slack as a single message; un-blocks design sooner.

1. **A11 (Agency dashboard) scope** — is this internal-only for the LitLabs+VenturePR team, or does each customer get a "white-label" version of it for their own tracking? Pricing implications.
2. **A8 (CMS) priority** — VenturePR's CMS (which platform?) vs. WordPress vs. Webflow. Pick one for v1.
3. **A10 (Services menu)** — please send the actual list of services + costs + inclusions (Vandan committed at 25:52). Without these we can scaffold but can't ship copy.
4. **Free tier vs. paid** — do we open VentureCite to clients on a free tier with a paywall behind specific features, or paid-from-day-one with a 14-day trial? Affects A1 budget cap, A9 lead-capture flow.
5. **Logo / brand identity** — confirm we're keeping the red logo or planning a redesign before launch. Don't want to invest in design polish (C6) on a logo that's about to change.
6. **Lead magnets** — Vandan to resend (Ben's ask at 42:50). Until they're in hand, A9 ships with placeholder content.
7. **AI Visibility checklist priorities** — which 3 of the ~50 checklist items should be the "if you do nothing else, do these"? This unblocks the A6 P0 recommendations.
8. **Citation lag-time copy** — Vivek said 1–2 weeks at 32:48. Ben asked at 14:11, "will it take a day for them to see some changes". Confirm the empty-state copy says "1–2 weeks" so we don't over-promise.

---

## Appendix — file:line cheat sheet

Key files referenced above for quick navigation:

- Onboarding logic: [`client/src/components/SidebarOnboarding.tsx`](client/src/components/SidebarOnboarding.tsx) · [`client/src/pages/welcome.tsx`](client/src/pages/welcome.tsx) · [`server/routes/onboarding.ts`](server/routes/onboarding.ts)
- Dashboard: [`client/src/pages/home.tsx`](client/src/pages/home.tsx) · [`server/routes/dashboard.ts`](server/routes/dashboard.ts) · [`client/src/components/dashboard/`](client/src/components/dashboard/)
- Citations: [`client/src/pages/citations.tsx`](client/src/pages/citations.tsx) · [`client/src/components/citations/PlatformResultCard.tsx`](client/src/components/citations/PlatformResultCard.tsx) · [`server/routes/prompts.ts`](server/routes/prompts.ts) · [`server/citationChecker.ts`](server/citationChecker.ts)
- Articles: [`client/src/pages/articles.tsx`](client/src/pages/articles.tsx) · [`server/routes/articles.ts`](server/routes/articles.ts)
- AI Visibility: [`client/src/pages/ai-visibility.tsx`](client/src/pages/ai-visibility.tsx)
- Outreach: [`client/src/pages/outreach.tsx`](client/src/pages/outreach.tsx)
- Auth: [`server/auth.ts`](server/auth.ts) · [`server/lib/ownership.ts`](server/lib/ownership.ts)
- Env config: [`server/env.ts`](server/env.ts) · [`.env.example`](.env.example)
- Webhooks: [`server/webhookHandlers.ts`](server/webhookHandlers.ts) · [`server/index.ts`](server/index.ts)
- SSRF helper: [`server/lib/ssrf.ts`](server/lib/ssrf.ts)
- LLM budget: [`server/lib/llmBudget.ts`](server/lib/llmBudget.ts)
- Logger: [`server/lib/logger.ts`](server/lib/logger.ts)
- Schema: [`shared/schema.ts`](shared/schema.ts)
- Suggestion engine: [`server/lib/suggestionGenerator.ts`](server/lib/suggestionGenerator.ts)
- Scheduler: [`server/scheduler.ts`](server/scheduler.ts)
- Content worker: [`server/contentGenerationWorker.ts`](server/contentGenerationWorker.ts)
