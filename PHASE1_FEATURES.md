# Phase 1 Features — How They Work

A plain-English guide to the six core features in VentureCite, the logic behind each one, and the honest limitations you should know about.

---

## 1. Brand Setup

**What it does**
Stores a profile of your brand — name, industry, voice, products, target audience — so every other feature can tailor its output to *your* business.

**How it works**
- You can create a brand two ways: paste a website URL and let AI fill in the profile, or fill the form manually.
- When you paste a URL, the server fetches the HTML (up to 2 MB, 10-second timeout), strips scripts and tags, and feeds the first ~8,000 characters to GPT (`MODELS.brandAutofill`) with a structured prompt asking for name, industry, tone, products, key values, etc.
- The response comes back as JSON and is saved as your brand record.
- If the site is slow, blocks crawlers, or the AI fails to parse it, you get a "partial analysis" warning and can edit the profile manually.
- Your plan tier caps how many brands you can create (free: 1, beta: 3, pro: 5, enterprise: unlimited).

**Deletion**
- Deleting a brand shows a confirmation dialog warning that all related data will be permanently removed.
- The database cascades the deletion to all dependent tables: articles, keywords, prompts, citations, citation runs, visibility progress, distributions, and content drafts.

**Auto-selection**
- Across all features that require a brand (Citations, Keywords, AI Visibility, Outreach, GEO Tools), if the user has brands and no valid brand is currently selected (first visit, or the previously selected brand was deleted), the first brand is auto-selected. Multi-brand users keep their last-used brand per feature via localStorage (`usePersistedState`).

**Limitations**
- Only works on websites that render their content server-side. Heavy single-page apps that load everything with JavaScript will return empty HTML.
- The AI has 25 seconds to respond — big, slow sites can time out.
- Auto-analysis relies on the model's best guess. It's usually right but not always — always review the generated profile.
- Duplicate name check is case-insensitive and scoped per user.

---

## 2. AI Visibility Checklist

**What it does**
Shows you a per-engine checklist of concrete actions to get your brand cited by AI search engines (ChatGPT, Claude, Gemini, Perplexity, Grok, Google AI, Manus, DeepSeek). Progress persists per-brand in the database so it follows you across devices.

**How it works**
- Each engine has a hand-curated list of steps ordered roughly by priority: register with the engine → structure your content → build authority → engage the ecosystem.
- **Brand selection is mandatory** — the page shows the engine cards and checklist immediately, but trying to check off a step before picking a brand triggers a "Select a brand first" toast. Each brand keeps its own progress.
- **One engine at a time**: the top row of engine cards (ChatGPT, Claude, Gemini, …) is itself clickable. Clicking a card selects that engine and renders its checklist below — no separate tab bar. The selected card is highlighted with a ring.
- You tick off steps as you complete them. **Progress is saved server-side** to the `visibility_progress` table (one row per `brandId + engineId + stepId`) via `POST /api/visibility-progress/:brandId` and `DELETE` for un-ticks.
- Overall progress is computed as `completed steps / total steps` across all engines.
- Optimistic UI update with rollback on network failure, so toggles feel instant.

**Limitations**
- The steps are static guidance, not dynamic tracking. Ticking "Submit to Bing Webmaster Tools" doesn't actually verify you did it.
- Step ordering and content are based on what's publicly known about each engine — if an engine changes its ranking factors, the checklist can go stale.

---

## 3. AI Keyword Research

**What it does**
Generates a list of 12–15 high-opportunity keywords specifically scored for their likelihood of getting cited by AI search engines, based on your brand and competitors.

**How it works**
- You pick a brand, click "Discover Keywords with AI", and the server sends your brand profile + competitor list to GPT (`MODELS.keywordResearch`).
- GPT returns a JSON array where each keyword has: search volume estimate, SEO difficulty, opportunity score, AI citation potential, intent type (informational/commercial/etc), suggested content type (article/guide/how-to), and related terms.
- Before saving, the server deduplicates against keywords you already have for that brand (case-insensitive) so repeated "Discover" clicks don't create duplicates.
- Each keyword has a "Generate Content" button that jumps to the content page pre-filled with the keyword and suggested type.

**Limitations**
- Search volume and difficulty scores are **GPT estimates, not real SEO data**. They're directionally useful but you shouldn't trust the exact numbers. A real DataForSEO/Ahrefs integration would replace this but isn't built yet.
- AI calls can take 10–30 seconds and occasionally fail (429 rate limit, timeout). The UI shows specific error messages for each case.
- Quality of results depends heavily on how complete your brand profile is — an empty brand gives generic keywords.

---

## 4. AI Content Generation

**What it does**
Writes a full article in your brand voice, then rewrites it up to three times to make it read more human and harder for AI detectors to flag.

**How it works**
1. **Enqueue**: Clicking Generate enqueues a row in the `content_generation_jobs` table and returns a job ID immediately. The background worker picks it up within ~5 seconds.
2. **Generate** (worker): `MODELS.contentGeneration` writes an article using your brand profile, target keyword, and chosen content type (article, guide, how-to, listicle, comparison).
3. **Analyze**: `MODELS.contentAnalyze` scores the draft on how "human" it reads (0–100) and lists specific AI tells.
4. **Humanize**: If the score is below 70, `MODELS.contentHumanize` rewrites the draft addressing those tells. This runs up to 3 passes.
5. **Track best version**: Across all passes, the worker keeps the highest-scoring version — so clicking "Improve" can never give you a *worse* result than you already had.
6. **Usage counting**: Your monthly article quota is incremented *after* the article is successfully built, not before, so failures don't cost you credits.
7. **Score delta**: The UI shows "68 → 82 (+14)" after improving so you can see if the rewrite helped.

**Why a background job queue?**
Generation can take 20–60 seconds. Doing it inside the HTTP request would abort if you navigate away or log out. The worker polls the `content_generation_jobs` table every 5 seconds, claims the oldest pending job atomically, and writes the finished article to the `articles` table independently of the request. You can close the tab, sign out, come back the next day — the article will be in your Articles list.

**Multi-draft system**
Every form state is persisted as a **draft** in the `content_drafts` Postgres table. Drafts auto-save 1.5 seconds after any field change (industry, keywords, type, brand, style, targeting, geography). You can have any number of drafts open simultaneously — switch between them from the drafts dropdown in the toolbar, or click "New Article" to start fresh. Deleting a draft is permanent.

- **Auto-create**: If no draft exists and you change any form field, a draft is created automatically in the background.
- **Session resume**: Navigate away mid-generation, come back later — the draft loads with all form fields intact. If a background job is still running, polling resumes automatically.
- **Job linkage**: When you click Generate, the background job is linked to the active draft via `content_drafts.jobId`. When the worker finishes, it writes the generated content, article ID, and human score directly back into the draft record.
- **Completed drafts**: Drafts that finished generation show a "Done" badge and load the full article content + AI score when selected.

**Auto-Improve (humanization)**
- Clicking "Auto-Improve" sends the current content + current score to `/api/rewrite-content`.
- The server's `humanizeContent()` function now accepts a `baselineScore` parameter. Rewrites must **strictly beat** the baseline to replace the content — so Auto-Improve can never return a worse score than you started with.
- If no rewrite passes beat the baseline, the server returns `improved: false` and the client shows "Content already well-optimized" instead of silently replacing your content with a lower-scoring version.
- Improved content is automatically saved back to the active draft.

**Page behavior**
The Content page shows a compact toolbar at the top: "New Article" button + a "N drafts" dropdown (collapsed by default). Click the dropdown to see all your drafts with status badges, timestamps, and delete buttons. The form below reflects the active draft. If you arrive via the Keyword Research "Generate Content" link, the URL params seed the initial form state and a draft is created on the first auto-save. Keyword suggestions are manual: click the **Suggest** button next to the Keywords input to fetch ideas for your selected industry.

**Limitations**
- Humanization is an arms race. Passing one detector doesn't mean passing all of them — we calibrate against one internal model, not every tool on the market.
- Each full generation takes 20–60 seconds and burns OpenAI credits (1 write + up to 6 analyze/rewrite calls).
- The article is generic unless your brand profile is rich. "Industry: Technology" produces worse output than "Industry: B2B developer tooling for observability teams".
- Tier limits: free = 5 articles/month, beta = 20, pro = 40, enterprise = 200. The Generate button disables at zero.

---

## 5. Track AI Citations

**What it does**
Generates a portfolio of 10 strategic questions where your brand is most likely to be cited, then asks those questions to five AI engines (ChatGPT, Claude, Gemini, Perplexity, DeepSeek) and tracks which ones actually cited your brand — including the full AI response so you can read exactly what each platform said.

**How it works**
- **Step 1 — Generate prompts**: On the Citations page, pick a brand and click "Generate 10 Citation Prompts". `MODELS.brandPromptGeneration` reads your brand profile (name, industry, products, USPs, target audience) and your most recent 10 articles, then returns 10 user questions like *"What are the best B2B analytics tools for startups?"* — each with a 1-sentence rationale explaining why your brand would rank. These are stored in the `brand_prompts` table and can be regenerated anytime.
- **Step 2 — Run citation check**: Click "Run Citation Check" to ask each of the 10 prompts to 5 platforms (50 total queries). Results are saved to the `geo_rankings` table tagged with `brandPromptId`.
- **Step 3 — View results**: The dashboard shows:
  - **Top cards**: overall citation rate, best-performing platform, top prompt.
  - **By-platform table**: cited/checks/rate for each AI engine, with last-run timestamp.
  - **By-prompt accordion**: click any prompt to see each platform's full, markdown-rendered response with a "Cited" or "Not cited" pill. Expand "Show full response" to read the entire answer the AI gave.
- **Re-run handling**: If you run the check multiple times, the aggregation keeps only the latest result per `(prompt, platform)` pair — no double counting.

**Routing**
- **ChatGPT** uses the direct OpenAI client with `MODELS.citationChatGPT`.
- **Claude, Gemini, Perplexity, DeepSeek** all route through a single OpenRouter client (`https://openrouter.ai/api/v1`) with their respective `MODELS.citationClaude`, `citationGemini`, `citationPerplexity`, `citationDeepSeek` slugs. OpenRouter lets us use all four platforms through one API key and one SDK instead of four separate integrations.
- If `OPENROUTER_API_KEY` is missing, those four platforms record a clear "skipped — OPENROUTER_API_KEY not configured" row instead of silently fabricating data.

**Parallelism**
- The check fans out 50 calls (10 prompts × 5 platforms) through a **rolling worker pool** with a concurrency ceiling of 5. All 50 tasks are flattened into one queue; 5 workers grab tasks atomically, run the AI call, save the row to Postgres the moment the response lands, and immediately pick up the next task. No per-prompt batching, no waiting for the slowest sibling. A 10-prompt run typically finishes in ~2–3 minutes.

**Brand-name detection — LLM-judged (gpt-4o-mini)**
- A fast string-based pre-filter (word-boundary match against the brand's short name, company name, stored `nameVariations`, auto-acronyms from 3+ word names, website domain + bare subdomain, diacritic-folded forms, legal-suffix-stripped forms) decides whether any brand variant appears in the response at all. If not → definitely not cited, skip the LLM call.
- Otherwise the full AI response + brand profile (name, company name, website, industry, description, variations) go to **gpt-4o-mini** in JSON mode. The model judges whether the response *actually cites the brand* vs. mentioning generic English words that happen to overlap with the brand name. This kills the whole class of false positives ("Venture PR" no longer matches "venture capital" discussions).
- Backfill endpoint `POST /api/brand-prompts/:brandId/backfill-detection` re-judges every stored response for a brand in place (concurrency-limited to 5), updating `geo_rankings.isCited` and re-aggregating affected `citation_runs`. No AI calls wasted on the actual question — only the judging pass.

**Tracked prompts + weekly suggestions (replaces "regenerate every week")**
- When a brand's first 10 prompts are generated, those become the **tracked set** — a fixed list the scheduler re-runs every week. Week-over-week citation trends are now actually comparable because the question set isn't shuffled on every run.
- After each weekly auto-run, the system generates **5 new suggested prompts** tuned to fill gaps the tracked set misses. gpt-4o sees the tracked prompts + brand profile and is instructed not to rephrase any tracked question; a Jaccard-similarity post-filter (≥ 0.6 overlap → reject) drops near-duplicates and prompts a single retry round.
- Users can:
  - **Edit** any tracked prompt's text inline (text stays tied to the same `brandPromptId` so history is preserved).
  - **Accept** a suggestion by swapping it in for a chosen tracked prompt (modal picks the one to retire). The tracked count stays at 10.
  - **Dismiss** any suggestion (soft-archived).
  - **Refresh** the suggestion pool on demand (also runs automatically each week).
  - **Reset all** — destructive, confirmation-gated: archives every tracked + suggested row and re-seeds a fresh 10.
- Schema: `brand_prompts.status` column with values `tracked | suggested | archived`. `getBrandPromptsByBrandId()` filters to `tracked` by default so citation runs automatically use the right set.
- First-time seed (`POST /api/brand-prompts/:brandId/generate`) returns 409 if tracked prompts already exist — prevents accidental clobbering; users must use Reset to re-seed.

**Auto-citation scheduling**
- Each brand has its own schedule: Off / Weekly / Biweekly / Monthly + preferred day-of-week. Configured on the Citations page under the Schedule tab or via `PATCH /api/brands/:brandId/citation-schedule`.
- A daily cron checks every brand's schedule + `lastAutoCitationAt`. When a brand is due: re-checks the tracked prompts across all 5 platforms, then refreshes the suggestions pool. Brands with zero tracked prompts are skipped — the user must seed manually first.

**Weekly email report**
- The `node-cron` job runs every Sunday at 8 AM UTC, iterates each user's brands (capped at `WEEKLY_MAX_BRANDS_PER_USER=3`), re-runs their 10 prompts against all 5 platforms, and emails a per-brand breakdown showing citation rate, platform performance, and top-performing prompts. Users can opt out via `weeklyReportEnabled`. Only sends if `RESEND_API_KEY` is configured.

**Limitations**
- Each full citation check makes ~50 AI API calls and takes 2–5 minutes depending on the slowest platform. Not free and not instant.
- AI responses are non-deterministic — the same prompt on the same day can cite you once and not the next time. Results are snapshots, not guarantees.
- Brand-mention detection is heuristic. False negatives happen when an AI paraphrases without naming you; false positives are possible if the brand name happens to be a common English word.

---

## 6. Distribute Content

**What it does**
Takes an article you've generated and rewrites it into platform-optimized copy for LinkedIn, Medium, Reddit, and Quora — so you don't have to manually reformat for each channel.

**How it works**
- You pick which platforms you want, click generate, and `MODELS.distribution` rewrites your article for each one (LinkedIn: professional hook + hashtags; Reddit: conversational, less promotional; Medium: long-form intro; Quora: answer-shaped).
- Generated content is saved in the database under `distributions.metadata.content` so you can come back later.
- A **History** tab in the dialog shows all your past distributions with timestamps, copy-to-clipboard buttons, and inline editing — so closing the modal doesn't lose the content.
- **Buffer integration** (optional): Connect your Buffer account via OAuth, and a "Post to Buffer" button appears next to Copy for matching platforms. One click queues the post in Buffer's schedule.

**Limitations**
- Buffer integration requires you to create a Buffer developer app and set `BUFFER_CLIENT_ID`/`BUFFER_CLIENT_SECRET`. Without those, the connect button returns a config error.
- "Post to Buffer" only shows up for platforms Buffer supports (LinkedIn, X, Facebook, Instagram). Reddit, Medium, and Quora are copy-paste only — their APIs are too locked down or too manual.
- Platform matching is heuristic: we match Buffer profile's `service` field to the platform name. Edge cases (multiple LinkedIn profiles, custom service names) may not auto-match.
- Generated content quality varies — the AI sometimes produces LinkedIn posts that are too corporate or Reddit posts that are too sales-y. Always review before posting.
- No analytics loop back from Buffer — we don't know if your scheduled post actually went out or how it performed.

---

## 7. Dashboard + Guided Onboarding

**Dashboard (home page)**
- Welcomes the user by their first name (`/api/auth/me.firstName`) rather than by brand name. Falls back to "Welcome back" / "VentureCite" for edge cases.
- **Brand filter**: users with 2+ brands get a dropdown in the header; metrics (citations, citation rate, articles) scope to the selected brand via `?brandId=` on `/api/dashboard`. First brand is auto-selected and last-used brand is persisted (`vc_home_brandId` in localStorage). Single-brand users don't see the dropdown.
- The "data failed to load" banner is gated behind `hasBrands` so fresh accounts don't see a false-alarm error while their empty-state KPIs load.

**Getting Started checklist**
- Lives as a compact tile in the left sidebar, just below the Pricing link. Always visible — clicking it opens an immersive dialog styled to match the dashboard's card language (no gradients, `border-border bg-card`, `bg-muted` icon tiles).
- Four steps:
  1. **Create your first brand** — counts any row in `/api/brands`.
  2. **Generate AI-optimized content** — counts any row in `/api/articles` owned by the user. Server returns a precomputed `hasArticles` boolean as a shortcut.
  3. **View the AI Visibility Guide** — server-side flag on the `users.visibility_guide_visited_at` column (set on first mount of `/ai-visibility` via `POST /api/onboarding/visibility-visited`). Persists across browsers/devices.
  4. **Run your first citation check** — counts any row in `citation_runs` for the user's brands. Flips the moment a run *starts*, not when something is actually cited.
- **Auto-opens once** on the first login per user, keyed by `venturecite-onboarding-seen:<userId>` in localStorage. Every subsequent session the user accesses it by clicking the sidebar tile.
- **Always visible** — even after all 4 are done, the tile and dialog remain available in a completion state ("You're all set") with "Revisit" buttons on each step. There is no dismiss X.
- The sidebar reads brand + article lists directly from their existing React Query caches, so creating a brand or an article updates the progress tile instantly with no page reload. Visibility + citation completion come from `/api/onboarding-status` with a 5s staleTime + refetch on focus.

---

## Quick Architecture Notes

- **Stack**: React + Vite frontend, Express + TypeScript backend, Drizzle ORM + Postgres (Supabase), OpenAI SDK for all AI calls.
- **Auth**: Supabase Auth — every API route checks user ownership via `requireUser()` / `requireBrand()` helpers.
- **Model registry**: Every AI call reads its model name from a single `MODELS` object in [server/lib/modelConfig.ts](server/lib/modelConfig.ts) grouped by feature page. Edit one value to change any feature's model. Defaults to `gpt-4o-mini` for non-citation features.
- **Citation routing**: ChatGPT goes direct OpenAI; Claude/Gemini/Perplexity/DeepSeek route through OpenRouter. Both clients share a stdout logger (`attachAiLogger`) so every request/response is visible in the server log during development.
- **Rate limiting**: `aiLimitMiddleware` (10 req/min/user) on all AI endpoints to prevent runaway costs.
- **Background jobs**: `node-cron` for the weekly citation report; `content_generation_jobs` polled in-process via `setInterval` for content generation. No Redis, no BullMQ — both ride on Postgres. Fine for the current scale; would need a real queue for high-frequency tasks.
- **Content drafts**: The `content_drafts` table tracks form state independently from articles. Drafts auto-save on field change and survive navigation. When a background job completes, it updates the linked draft with the generated content and article ID. Articles can be deleted from the Articles page with a confirmation dialog.
- **Instant UI updates**: All mutations across the app use `queryClient.setQueryData` for zero-delay cache updates alongside server invalidation. `refetchOnWindowFocus: true` and `staleTime: 30_000` ensure data freshness without excessive polling.
- **State persistence**: Pages that need brand/filter selections to survive navigation use `usePersistedState` (localStorage-backed `useState` wrapper). Content page uses DB-backed drafts instead.

---

## 8. Production Hardening Pass

Four batches of security, reliability, and performance fixes applied across the Phase 1 surface. See [docs/production_hardening_fixes.md](docs/production_hardening_fixes.md) for plain-English, fix-by-fix before/after writeups.

**Security**
- All Markdown (citation responses, article bodies) renders through a shared `<SafeMarkdown>` wrapper that runs `rehype-sanitize` before rendering — LLM output can no longer smuggle `<script>` or `onerror` into the DOM.
- Root-level `<ErrorBoundary>` plus per-route boundaries. A render error now shows a friendly retry/reload card instead of white-screening the app.
- URL safety helpers in `client/src/lib/urlSafety.ts`: `normalizeWebsite()` validates brand websites via `new URL()`; `safeExternalHref()` strips `javascript:` hrefs; `isAllowedStripeRedirect()` only permits `checkout.stripe.com` and `billing.stripe.com` for the Stripe redirect.
- Pricing page reads success/canceled flags via `URLSearchParams` — no more `?successfully=true` triggering the success banner by substring match.
- Content draft localStorage key is now namespaced per user (`venturecite-active-draft-id:<userId>`); legacy keys auto-migrate on first read. Prevents draft id leaking across accounts on a shared browser.
- Brand delete uses a GitHub-style type-to-confirm dialog — the user must type the exact brand name, and the button is gated by `isPending` against double-clicks.

**Data integrity**
- Typed `ApiError { status, body, bodyText }` class replaces the old "`status: text`" string-encoded errors. Callers use `isApiError()` and read structured `body` directly instead of `JSON.parse(error.message.replace(...))`.
- Content auto-save / job-polling race resolved: the form-field auto-save and generated-content auto-save now use separate timer refs (they previously shared one and silently cancelled each other). Polling was rewritten as a self-scheduling loop with `AbortController`, exponential backoff (3s → 30s), tab-visibility gating, and a 10-failure fuse that stops the loop and tells the user.
- `apiRequest()` accepts an `AbortSignal` for clean cancellation.
- `ai-visibility` progress math guards `total > 0` to prevent `NaN%` when an engine has zero steps.
- Citations "Reset tracked prompts" is now a proper `useMutation` (disabled + label swap while pending); Run and Generate buttons check `isPending || !selectedBrandId` in both `onClick` and `disabled`.

**Bundle & performance**
- Every Phase-1 feature page (`content`, `citations`, `articles`, `article-view`, `brands`, `keyword-research`, `ai-visibility`, `pricing`) is now `React.lazy` + `<Suspense>`. Auth pages and Home stay eager. First-paint bundle no longer carries recharts, react-markdown, or framer-motion for visitors who never leave the landing page.
- `react-helmet` → `react-helmet-async` with a single `<HelmetProvider>` at the app root; old package + types removed.
- Global `refetchOnWindowFocus: true` turned off in queryClient — duplicate fetches racing with `setQueryData` eliminated. Queries that genuinely need focus-refetch (onboarding status) opt in individually.
- Memoized hot derivations: `home.tsx` (`activeBrand`, `scopedArticles`), `ai-visibility.tsx` (`quickWins`), `citations.tsx` (`bestPlatform`, `bestPrompt`).
- `data-testid` attributes are stripped from production bundles via `babel-plugin-jsx-remove-data-test-id` (dev/test builds keep them).

**Refactor**
- `<BrandFormFields>` extracted — the Create-brand and Edit-brand dialog bodies previously copy-pasted ~220 lines of form JSX each. One shared component, one `idSuffix` prop to preserve the original testid differences.
- `<DeleteBrandDialog>` extracted with type-to-confirm + double-click guard.
