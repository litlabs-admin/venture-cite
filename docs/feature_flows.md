# VentureCite — Feature Flow Reference

Exhaustive walkthrough of every Phase 1 and Phase 2 feature. For each one:

- **What you see** on arrival
- **Every interaction** — every button click, form submit, toggle — traced step-by-step
- **What the server actually does** (external API calls, prompts, retry logic)
- **What lands in the database** (tables, columns, example row values)
- **What the user sees afterwards** (toasts, redirects, UI updates)

File:line references point to the real source of truth. No marketing language.

---

## Legend

- ✅ **Real work** — actually calls an external API or runs non-trivial logic
- ⚠️ **Partial** — works but has known gaps (mocked pieces, no ingestion, etc.)
- ❌ **Placeholder** — UI exists, real backing logic doesn't

---

---

# Phase 1 features

## 1. Brand creation (autofill from URL) ✅

### Where to find it

`/brands` → "Add Brand" button (top right of page).

### What you see

A dialog with two tabs: **Autofill from Website** (default) and **Manual Entry**.

Autofill tab shows:
- URL input with placeholder `"https://stripe.com"`
- "Analyze & Fill" button (disabled until valid URL typed)
- Below that, a preview pane that stays empty until you click Analyze
- A "Switch to manual entry" link

Manual Entry tab shows the same form fields pre-blank: brand name, company name, industry dropdown, website, tone dropdown (professional/casual/friendly/formal/conversational/authoritative), target audience, products (tag input), key values (tag input), unique selling points (tag input), brand voice textarea, name variations (tag input, optional).

### What happens when you type a URL and click "Analyze & Fill"

1. **Client validates URL format** — must be `http://` or `https://`, otherwise the button stays disabled.
2. **Client fires** `POST /api/brands/create-from-website` with body `{ url, force: false }` ([routes.ts:2796](server/routes.ts#L2796)).
3. **Server auth + rate limit** — `requireUser()` pulls the authed user from JWT Bearer, `aiLimitMiddleware` caps AI-endpoint calls per minute.
4. **Tier-based brand limit check** — `storage.getBrandsByUserId()` counts existing brands. Free tier = 1 max, beta = 3, pro = 5, enterprise = unlimited. Over limit → HTTP 403 with JSON `{ error: "Brand limit reached for your tier", upgradeHint: "..." }`. Client shows a red toast with Upgrade link.
5. **Duplicate-name check** — If any existing brand for this user has `name ILIKE "<inferred name>"` and `force !== true`, returns 409 with `{ suggestConfirm: true }`. Client shows a confirm modal: "You already have a brand named X. Create another?". User clicks Confirm → re-fire with `force: true`.
6. **Website fetch** — `safeFetchText(url, { maxBytes: 2MB, timeoutMs: 10000 })`. This runs SSRF protection: rejects private IPs (10.x, 192.168.x, 169.254.x metadata endpoints), enforces HTTPS on non-localhost, follows up to 3 redirects, aborts at 2 MB. If it fails → response includes `analysisQuality: "partial"` and empty-ish fields; client still opens the form pre-filled with whatever was parseable + shows warning banner "Couldn't fully analyze website — review fields before saving".
7. **HTML cleanup** ([routes.ts:2842-2848](server/routes.ts#L2842)) — strip `<script>…</script>` + `<style>…</style>` blocks via regex, strip remaining HTML tags, normalize whitespace (`\s+` → single space), truncate to 8,000 chars.
8. **OpenAI extraction call** ([routes.ts:2861-2888](server/routes.ts#L2861)):
   - `model: MODELS.brandAutofill` (gpt-4o-mini)
   - `response_format: { type: "json_object" }`
   - `temperature: 0.3`
   - System prompt: "Extract brand details from website content. Return JSON with keys: name, companyName, industry, description, tone, targetAudience, products (array), keyValues (array), uniqueSellingPoints (array), brandVoice, nameVariations (array)."
   - User message: the cleaned website text
   - 25-second abort timeout → 504 Gateway Timeout if exceeded
9. **Response to client** — `{ success: true, data: <extracted fields>, analysisQuality: "full" | "partial" }`. Client **does not yet save the brand** — it opens the form pre-filled so the user can edit before saving.

### What happens when you click "Save Brand" on the filled form

1. `POST /api/brands` with the edited payload.
2. Server re-validates, inserts one row into `brands`:
   ```
   {
     id: "<uuid>",
     userId: "<user.id>",
     name: "Stripe",
     companyName: "Stripe, Inc.",
     industry: "Fintech",
     description: "Online payment processing...",
     website: "https://stripe.com",
     tone: "professional",
     targetAudience: "Developers and online businesses",
     products: ["Payments", "Billing", "Connect", "Atlas"],
     keyValues: ["Developer-first", "Reliability", "Global scale"],
     uniqueSellingPoints: ["Best-in-class API", "194 country support"],
     brandVoice: "Technical yet approachable",
     nameVariations: ["stripe", "stripe.com"],
     autoCitationSchedule: "off",
     autoCitationDay: 0,
     createdAt: now(),
     updatedAt: now()
   }
   ```
3. Response returns the new brand. Client invalidates `/api/brands` query → sidebar dropdown repopulates with the new brand auto-selected.

### What the user sees after

- Green toast: "Brand created"
- Redirected to `/brands` list with the new brand at top
- Sidebar BrandSelector dropdown now shows the new brand — already selected across all pages via URL query param `?brandId=<id>`

### Name-variants (behind the scenes, used later)

When citation checking runs, `buildBrandNameVariants()` at [citationChecker.ts:88-138](server/citationChecker.ts#L88) builds a lookup list:
- Raw name ("Stripe")
- Legal-suffix-stripped normalized form ("Stripe" → "Stripe" since no suffix; "Acme Inc." → "Acme")
- Diacritic-folded form ("Nestlé" → "Nestle")
- Auto-acronym from 3+ word names, unless the acronym matches blocklist (CAR/APP/API/ONE/...)
- Domain-derived variants from the `website` field (bare domain ≥ 4 chars, not in `COMMON_DOMAIN_WORDS`)
- Any entries from `nameVariations`

Sorted longest → shortest so specific matches win first (e.g. "Stripe Atlas" matched before just "Stripe").

---

## 2. AI Visibility checklist ✅

### Where to find it

Sidebar → "AI Visibility".

### What you see

- Page header "AI Engine Visibility Recommendations" with subtitle
- `<BrandSelector>` in top-right (auto-picks first brand; selection syncs to URL `?brandId=...`)
- A progress card: "X of Y steps completed" across all engines
- A row of 8 engine cards: ChatGPT, Claude, Gemini, Perplexity, Grok, Google AI, Manus, DeepSeek
- Below the engines, a vertical checklist of ~8-15 hand-curated steps for the currently selected engine

### What happens on page mount

1. `GET /api/brands` loads brands (via `useBrandSelection` hook).
2. `GET /api/visibility-progress/:brandId` loads completed steps. Returns rows from `visibility_progress` where `brandId = <selected>`. Client builds `completedSteps: Record<engineId, stepId[]>`.
3. A **one-shot** `POST /api/onboarding/visibility-visited` fires (fire-and-forget): server stamps `users.visibility_guide_visited_at = NOW()` if it's null. This powers the Onboarding tile cross-device: "3. View the AI Visibility Guide" flips to Done on any device once the user opens this page once. Client also writes `localStorage["venturecite-visibility-visited"] = "true"` as back-compat belt-and-suspenders.
4. Client invalidates `["/api/onboarding-status"]` → sidebar onboarding tile updates.

### What happens when you click an engine card

- No network call. Pure client state: `selectedEngineId` persisted to localStorage key `vc_visibility_engine` via `usePersistedState`.
- Checklist below re-renders showing that engine's steps.

### What happens when you tick a checkbox

1. **Optimistic UI**: `queryClient.setQueryData(["/api/visibility-progress", brandId], (old) => ...)` flips the local cache immediately — checkbox appears checked instantly.
2. **Server call**: `POST /api/visibility-progress/:brandId` body `{ engineId, stepId }`.
3. **Server** ([routes.ts:2323](server/routes.ts#L2323)) validates brand ownership, does `INSERT INTO visibility_progress(brandId, engineId, stepId, completedAt) VALUES (..., NOW()) ON CONFLICT DO NOTHING`.
4. **On 200 OK**: refetch `visibility-progress` to reconcile. No user-visible change if everything matched.
5. **On error**: cache rolled back → checkbox unticks itself, red toast "Failed to save progress".

### What happens when you untick a checkbox

Same flow but `DELETE /api/visibility-progress/:brandId` with body `{ engineId, stepId }` ([routes.ts:2338](server/routes.ts#L2338)). Deletes the matching row.

### What gets saved

One row per `(brandId, engineId, stepId)` tuple in `visibility_progress`:
```
{ id: "<uuid>", brandId, engineId: "chatgpt", stepId: "register-with-chatgpt", completedAt: now() }
```
UNIQUE constraint on `(brandId, engineId, stepId)` prevents duplicates.

Plus `users.visibility_guide_visited_at = <timestamp>` once on first page visit.

### What the user never sees

There is **no verification** that you actually completed the step. Ticking "Submit sitemap to ChatGPT" does not call ChatGPT's API. This is self-tracking.

### Progress math

`overallProgress = completedSteps / totalSteps` across all engines. Memoized in the page to avoid recomputing on every render.

---

## 3. AI Keyword Research ✅

### Where to find it

Sidebar → "Keyword Research".

### What you see

- Brand selector card + filter-status card side-by-side at the top
- Main card: "Discover Keywords" with a big "Discover with AI" button
- Below: paginated table of already-discovered keywords, columns: Keyword / Volume / Difficulty / Opportunity / AI Citation Potential / Intent / Content Type / Status / Actions

### What happens on page mount

1. `GET /api/brands` loads brands.
2. When a brand is selected: `GET /api/keyword-research/:brandId` loads existing rows from `keyword_research`.
3. Filter defaults to `status_filter: "all"` (persisted via `usePersistedState` key `vc_keywords_filter`).

### What happens when you click "Discover with AI"

1. Client POST `/api/keyword-research/discover` body `{ brandId }` ([routes.ts:1537](server/routes.ts#L1537)).
2. **Rate limit check** — blocks if over 10 req/min.
3. **Server loads**:
   - `storage.getBrandById(brandId)` → brand profile with products, USPs, audience
   - `storage.getCompetitors(brandId)` → competitor names
4. **OpenAI call** ([routes.ts:1570-1593](server/routes.ts#L1570)):
   - `model: MODELS.keywordResearch` (gpt-4o-mini)
   - `response_format: { type: "json_object" }`
   - System prompt demands a JSON object `{ keywords: [...] }` where each keyword has:
     - `keyword` (string)
     - `searchVolume` (number, 1,000–50,000 realistic range)
     - `difficulty` (1–100)
     - `opportunityScore` (1–100)
     - `aiCitationPotential` (1–100)
     - `intent` ("informational" | "commercial" | "transactional" | "navigational")
     - `category` (free-text topic cluster)
     - `competitorGap` (0–3 — how many listed competitors are missing from this keyword)
     - `suggestedContentType` ("article" | "guide" | "comparison" | "how-to" | "listicle")
     - `relatedKeywords` (array of 3–5 related terms)
   - User message: "Brand: <name>. Industry: <industry>. Products: <products>. Audience: <audience>. USPs: <USPs>. Competitors: <competitor list>. Generate 12–15 high-opportunity keywords this brand should target for AI-citation visibility."
5. **Dedup pass** ([routes.ts:1640-1641](server/routes.ts#L1640)) — For each returned keyword, check `keyword_research.keyword ILIKE <returned>` for this brandId. Skip any match.
6. **Insert remaining** ([routes.ts:1649-1664](server/routes.ts#L1649)):
   ```
   {
     id, brandId, keyword: "best crm for startups",
     searchVolume: 8900, difficulty: 62,
     opportunityScore: 78, aiCitationPotential: 85,
     intent: "commercial",
     category: "Sales Tools",
     competitorGap: 2,
     suggestedContentType: "comparison",
     relatedKeywords: ["crm comparison", "startup sales tools", ...],
     status: "discovered",
     contentGenerated: 0,
     discoveredAt: now(),
     updatedAt: now()
   }
   ```
7. Returns `{ success: true, data: { inserted: N, skipped: M } }`. Client invalidates keyword list → table refreshes.

### What the user sees after

- Green toast: "Discovered 12 new keywords, skipped 3 duplicates"
- Table updates with fresh rows
- Each row has a "Generate Content" button

### What happens when you click "Generate Content" on a keyword row

- Navigates to `/content?keyword=<keyword>&brandId=<brandId>&contentType=<suggestedContentType>` — content form page opens with those fields pre-filled.

### What happens when you edit a keyword status (e.g. archive)

- `PATCH /api/keyword-research/:id` body `{ status: "archived" }`
- Updates the row. Filter shows/hides based on status.

### ⚠️ Known limitation

`searchVolume` and `difficulty` are GPT judgments, not real SEO-tool data. They're directional only. A production version would wire in DataForSEO or Ahrefs API.

---

## 4. Content Generation + Humanizer ✅

### Where to find it

Sidebar → "Content".

### What you see

Form with:
- **Keywords** (comma-separated input)
- **Industry** (dropdown + search)
- **Content Type** (article/guide/comparison/how-to/listicle)
- **Brand** (BrandSelector)
- **Target Customers** (textarea, optional)
- **Geography** (input, optional: "United States", "Europe", etc.)
- **Content Style** toggle: B2B / B2C
- **Title** (optional — if blank, derived from first H1)
- **Humanize** toggle (on by default)
- **Generate Content** button (primary CTA)
- Right sidebar: list of saved drafts with "Open" links

### What happens as you type in the form

- After **1.5 seconds** of no input (debounced), client POST `/api/content-drafts` with the full form state.
- Server upserts `content_drafts` row keyed by `(userId, id)`. On first save, inserts; thereafter updates:
  ```
  {
    id, userId, brandId, title, keywords, industry, type,
    targetCustomers, geography, contentStyle, generatedContent: null,
    articleId: null, jobId: null, updatedAt: now()
  }
  ```
- Toast: small "Saved" indicator in bottom-right corner.

### What happens when you click "Generate Content"

1. Client validation: keywords + industry + type required.
2. Client POST `/api/generate-content` ([routes.ts:1097](server/routes.ts#L1097)) with full form payload.
3. **Usage limit check** ([routes.ts:1109-1117](server/routes.ts#L1109)) — `checkUsageLimit(user.id, user.accessTier)`. If user has exhausted their monthly quota (free=5, beta=20, pro=40, enterprise=200), returns 403 `{ error: "Monthly article limit reached", remaining: 0, resetsAt: "..." }`. Client shows upgrade modal.
4. **Job enqueue** — insert one row into `content_generation_jobs`:
   ```
   {
     id, userId, brandId, status: "pending",
     requestPayload: { keywords, industry, type, brandId, targetCustomers, ... humanize: true },
     articleId: null,
     createdAt: now()
   }
   ```
5. Client receives `{ jobId }` and **starts polling** `GET /api/content-jobs/:jobId` every 2 seconds.
6. Client-side UI switches to a progress state: animated loader + "Generating your article (this takes 30-90 seconds)..." message.

### What the background worker does

`server/contentGenerationWorker.ts` runs a `setInterval` loop every 5 seconds. On each tick:

1. **Claim** — `storage.claimPendingContentJob()` runs `UPDATE content_generation_jobs SET status='in_progress', startedAt=NOW() WHERE id=(SELECT id FROM content_generation_jobs WHERE status='pending' ORDER BY createdAt LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`. Atomic — two workers on different servers can't claim the same job.
2. **If nothing to claim**, sleep.
3. **Load brand** (via `job.brandId`) for context.
4. **Call OpenAI** ([contentGenerationWorker.ts:154-167](server/contentGenerationWorker.ts#L154)):
   - `model: MODELS.contentGeneration`
   - `max_tokens: 4000`
   - `temperature: 0.7`
   - System prompt (~800 tokens): "You are a GEO (Generative Engine Optimization) expert. Write a 1500-2000 word article in markdown. Use H2/H3 structure. Include an FAQ section. Reference statistics and real examples. Avoid AI clichés."
   - User message interpolates all form fields and brand context: "Keywords: ... Industry: ... Brand: {name}, {description}. Tone: {tone}. Audience: {targetAudience}. Products: {products}. USPs: {USPs}. Target customers: {targetCustomers}. Geography: {geography}. Style: {B2B or B2C}."
5. **Raw markdown returned** — typically 1500-2500 words.

### Humanizer pass (if `humanize: true`, which is default)

`humanizeContent(rawContent, industry, maxAttempts=3, baselineScore=0)` at [contentGenerationWorker.ts:49-127](server/contentGenerationWorker.ts#L49). Loops up to 3 times:

**Pass 1 (of up to 3):**
1. **Rewrite** call to `MODELS.contentHumanize` (gpt-4o or similar), `temperature: 1.0`. System prompt: "You are a seasoned journalist. Rewrite this article to sound human. Drop AI tells: 'landscape', 'leverage', 'delve', 'crucial', 'comprehensive', 'In today's world'. Vary sentence lengths. Add contractions. Keep all markdown structure intact."
2. **Analyze** call to `MODELS.contentAnalyze`, `response_format: json_object`. System prompt: "Analyze this text for AI-generation signals. Return JSON: `{ score: 0-100 where 100=fully human, issues: string[] up to 5, strengths: string[] up to 5 }`. Note: most AI-rewritten text scores 40-65. Be harsh."
3. **Compare**: if `humanScore > bestScore`, replace `bestContent` and `bestScore`. If `humanScore ≥ 80`, break early (good enough).
4. **Token math**: per-call `max_tokens = min(4500, max(500, ceil(inputTokens * 1.5)))` to avoid runaway costs.

**Pass 2:** same but system prompt says "You are a meticulous copy editor. Cut filler. Replace generic phrases."

**Pass 3:** "Final polish. Read it aloud mentally — rewrite anything stiff."

If no pass beats `baselineScore` (which is 0 for fresh generation but currentScore for Auto-Improve), **keep the original raw content**.

### Saving the article

[contentGenerationWorker.ts:189-204](server/contentGenerationWorker.ts#L189):
1. Derive title: first markdown H1 (`^# (.+)$`) or fallback `${keywords} — ${industry}`.
2. Derive slug: lowercase title, spaces → dashes, strip non-alphanumeric, truncate to 100 chars. Uniqueness ensured by `(brandId, slug)` unique index.
3. Insert `articles` row:
   ```
   {
     id, brandId, title: "Best CRM for Startups — A 2025 Guide",
     slug: "best-crm-for-startups-a-2025-guide",
     content: "<final markdown>",
     keywords: ["crm", "startups", ...],
     industry: "SaaS",
     contentType: "guide",
     author: "GEO Platform",
     viewCount: 0,
     citationCount: 0,
     seoData: {
       humanScore: 78,
       humanizationAttempts: 3,
       passesAiDetection: true,  // humanScore >= 70
       generatedVia: "background-worker"
     },
     createdAt: now(),
     updatedAt: now()
   }
   ```
4. **Increment usage** — `storage.incrementArticleUsage(userId)` bumps `users.articlesUsedThisMonth`. Done AFTER successful save so failed jobs don't burn quota.
5. **Update job**: `UPDATE content_generation_jobs SET status='completed', articleId=<new>, completedAt=NOW() WHERE id=<jobId>`.
6. **Update draft**: `UPDATE content_drafts SET generatedContent=<content>, articleId=<new>, humanScore=78, passesAiDetection=1, jobId=NULL WHERE jobId=<jobId>`. Clearing `jobId` tells the client to stop polling.

### What the user sees

- Client's poll loop sees `status: "completed"` → stops polling.
- Page redirects to `/articles/:slug` showing the generated article rendered as markdown.
- Header shows a score badge: "Human Score: 78/100 ✓ Passes AI detection".
- If score < 70, header shows "Human Score: 62/100 ⚠ Below threshold" + orange "Auto-Improve" button.

### On error

- Job status flipped to `"failed"`, `errorMessage` saved.
- Client polling sees failure → shows error toast with the message.
- `articlesUsedThisMonth` NOT incremented — no credit burned.

---

## 5. Auto-Improve (re-humanize pass) ✅

### Where to find it

Any article view page where `seoData.humanScore < 70`. An orange "Auto-Improve" button appears next to the score badge.

### What happens when you click it

1. Client POST `/api/rewrite-content` ([routes.ts:1285](server/routes.ts#L1285)) body `{ content: article.content, industry: article.industry, articleId: article.id, currentScore: article.seoData.humanScore }`.
2. Server runs the same 3-pass humanizer, but with `baselineScore = currentScore`. This guarantees strict improvement — if no pass beats the current score, server returns `{ improved: false, message: "Content already well-optimized" }`.
3. If improvement achieved:
   - Server creates a **new** `articles` row (not modifying the original) with:
     ```
     seoData: {
       humanScore: <new, higher>,
       humanizationAttempts: 3,
       passesAiDetection: <new score >= 70>,
       improvedFrom: "<original article.id>",
       generatedVia: "auto-improve"
     }
     ```
   - Slug gets a suffix like `-v2` to avoid collision.
   - Response returns the new article id.
4. Client redirects to the new article URL. Toast: "Improved 62 → 81 (+19)".

### If no improvement

Toast: "Content is already well-optimized for humanness."

### Why a new row?

To preserve lineage. You can always compare v1 vs v2. `seoData.improvedFrom` chains the history.

---

## 6. Brand Prompts generation ✅

### Where to find it

`/citations` → "Prompts" tab → "Generate 10 Citation Prompts" button (visible only when no prompts exist yet for this brand).

### What you see

- Tab layout: **Prompts** / **Results** / **History** / **Schedule**
- Prompts tab empty state: big centered card with the Generate button + explanation "We'll generate 10 real user questions your brand should rank for on AI engines."

### What happens when you click "Generate 10 Citation Prompts"

1. Client POST `/api/brand-prompts/:brandId/generate` ([routes.ts:2141](server/routes.ts#L2141)).
2. **Server guard**: if `brand_prompts` already has rows for this brand with `status='tracked'`, returns HTTP 409 `{ error: "Prompts already exist. Reset first." }`. UI shows confirm: "Reset 10 existing prompts and regenerate?" — if confirmed, calls DELETE first then retries.
3. **Load recent articles** — `storage.getRecentArticlesByBrandId(brand.id, 10)` for context. Builds an article summary: `[{title, first 5 keywords}]`.
4. **OpenAI call** ([lib/promptGenerator.ts:44-73](server/lib/promptGenerator.ts#L44)):
   - `model: MODELS.brandPromptGeneration`
   - `response_format: json_object`
   - `max_tokens: 2000`
   - System prompt: "Generate EXACTLY 10 user questions where this brand should rank on AI engines. Questions must be ones real users type — NOT brand-name questions (users don't search by brand). Each question needs a 1-sentence rationale explaining why the brand would rank."
   - User message: brand name, company name, industry, description, target audience, products, USPs, article summary.
5. **Parse + save** — Server validates response shape. Inserts 10 rows into `brand_prompts`:
   ```
   {
     id, brandId, generationId: null (for v1),
     prompt: "What's the best CRM for a 10-person startup?",
     rationale: "Startup CRM comparisons are Acme's core content vertical.",
     orderIndex: 0,
     isActive: 1,
     status: "tracked",
     createdAt: now()
   }
   ```
6. Response returns all 10 prompts. Client invalidates `/api/brand-prompts/:brandId` → list renders.

### What the user sees

- Green toast: "Generated 10 tracked prompts"
- List of 10 question cards, each showing the question + rationale + edit/delete buttons
- "Run Citation Check" button now prominent at top of page

### What happens when you edit a prompt inline

- Click pencil icon → question becomes editable
- Blur (or Enter) → PATCH `/api/brand-prompts/:brandId/prompts/:promptId` body `{ prompt: "<new>" }` ([routes.ts:2255](server/routes.ts#L2255))
- Updates the row. No new generation — same id preserved.

### What happens when you delete a prompt

- Trash icon → DELETE `/api/brand-prompts/:brandId/prompts/:promptId` ([routes.ts:2274](server/routes.ts#L2274))
- Row deleted. If fewer than 10 remain, "Add suggestion" button appears pulling from `status='suggested'` rows (generated by the scheduler — see feature 10).

---

## 7. Citation Check ✅ — the keystone feature

**Every citation number in the entire app flows from the rows this creates.**

### Where to find it

`/citations` → big "Run Citation Check" button at top once prompts exist.

### What you see before

- 10 tracked prompts listed
- Button: "Run Citation Check (50 queries, ~2 min)"
- Sub-text: "Asks all 10 prompts against 5 AI platforms. Detects if your brand is mentioned in each answer."

### What happens when you click "Run Citation Check"

1. Client POST `/api/brand-prompts/:brandId/run` ([routes.ts:2354](server/routes.ts#L2354)) body `{ platforms: ["ChatGPT","Claude","Perplexity","Gemini","DeepSeek"] }`.
2. **Server rate limit + ownership check.**
3. **Server calls** `runBrandPrompts(brandId, platforms, { triggeredBy: "manual" })` in [citationChecker.ts:256-389](server/citationChecker.ts#L256).

### What `runBrandPrompts` actually does

**Step A — Setup:**
- Load `brand` + `prompts = getBrandPromptsByBrandId(brandId, status='tracked')`.
- Build `brandNameVariants` via `buildBrandNameVariants(brand)`.
- **Insert `citation_runs` row upfront** with placeholder totals:
  ```
  { id: <runId>, brandId, totalChecks: 0, totalCited: 0, citationRate: 0,
    triggeredBy: "manual", startedAt: now(), platformBreakdown: {} }
  ```
- Build flat task queue: `tasks = [{prompt, platform} × 50]` (10 prompts × 5 platforms).

**Step B — Parallel execution** ([citationChecker.ts:294-363](server/citationChecker.ts#L294)):
- **Concurrency = 5** rolling worker pool. 5 workers pull tasks atomically off the queue; each worker handles full query + detect + DB write before grabbing the next.
- Typical runtime: **2-3 minutes** for all 50 queries.

**Step C — Per-task flow** (`runOne`):

For each `{prompt, platform}`:

1. **Call the AI:**
   - **ChatGPT** ([citationChecker.ts:210-222](server/citationChecker.ts#L210)): Direct OpenAI SDK. Model `MODELS.citationChatGPT`. System prompt "You are a helpful assistant. Answer thoroughly, citing sources." User prompt = the question. `max_tokens: 1500`, `temperature: 0.7`.
   - **Claude/Gemini/Perplexity/DeepSeek**: Same SDK with `baseURL: OPENROUTER_BASE_URL` ([citationChecker.ts:184-189](server/citationChecker.ts#L184)). Model slugs routed via OpenRouter: `anthropic/claude-3-5-sonnet`, `google/gemini-pro-1.5`, `perplexity/llama-3.1-sonar-large-128k-online`, `deepseek/deepseek-chat`. System prompt prefixed with "You are {platform}, a helpful AI assistant...".
   - If `OPENROUTER_API_KEY` missing → skip + save error row (see step 5). No simulation.

2. **Pre-filter** ([citationChecker.ts:158-160](server/citationChecker.ts#L158)):
   - Lowercase response text.
   - Loop through `brandNameVariants` (longest first): does any variant appear as a substring?
   - If **no variant matches** → `isCited = false` immediately. Skip the expensive LLM judge.

3. **LLM judge** (only if pre-filter hits):
   - `judgeCitation({ responseText, brand })` — calls `gpt-4o-mini` in JSON mode.
   - Prompt: "Does this AI response actually cite the brand '{brand.name}' — either by linking to their site, recommending their product, or naming them directly — or does the word(s) appear only coincidentally (homonym, unrelated context)? Return `{ isCited: boolean, rank: number|null, citingOutletUrl: string|null }`. Rank = position of brand mention (1 = first). OutletUrl = any URL the AI linked alongside the brand."
   - Returns real decision.

4. **Construct citationContext:**
   ```
   "Cited\n\n||| RAW_RESPONSE |||\n<full AI response>"
   ```
   (or `"Not cited\n\n..."` or `"Check failed: <error>"`).
   The `||| RAW_RESPONSE |||` delimiter lets the UI split status from the full response on display.

5. **Insert `geo_rankings` row** ([citationChecker.ts:334-350](server/citationChecker.ts#L334)):
   ```
   {
     id, articleId: null,
     brandPromptId: bp.id,
     runId: citationRun.id,
     aiPlatform: "ChatGPT",
     prompt: "What's the best CRM for a 10-person startup?",
     rank: 2,  // or null if not cited
     isCited: 1,  // or 0
     citationContext: "Cited\n\n||| RAW_RESPONSE |||\nFor small teams, I'd recommend...",
     citingOutletUrl: "https://acme.com/crm",  // or null
     citingOutletName: null,
     sentiment: "positive",
     sentimentScore: 0.6,
     checkedAt: now()
   }
   ```

6. `rankings.push(row)`. Worker picks next task.

**Step D — Aggregate** ([citationChecker.ts:365-384](server/citationChecker.ts#L365)):

After all 50 complete:
- `totalChecks = 50`
- `totalCited = rankings.filter(r => r.isCited).length`
- `citationRate = Math.round((totalCited / totalChecks) * 100)`
- `platformBreakdown = { ChatGPT: { checks: 10, cited: 3, rate: 30 }, Claude: {...}, ... }`
- UPDATE `citation_runs` with final values + `completedAt = now()`.

### What the user sees

- During run: progress bar "28 of 50 checks complete..." polling a stats endpoint every 3 seconds.
- On complete: page updates with:
  - **Summary card**: "Overall Citation Rate: 34% • Best platform: Perplexity (50%) • Weakest: Gemini (10%)"
  - **Per-platform table**: one row per platform with cited/checks/rate.
  - **Per-prompt drill-down**: click a prompt → see each platform's full response rendered as markdown, with Cited/Not-cited pill above each.
  - **History entry** added under the History tab.

### Cost per run

~50 AI API calls + ~5 GPT-4o-mini judge calls (only for those responses where brand variant matched). At current pricing, typical cost ~$0.15–$0.30 per full run.

### What if OpenRouter is down?

The 4 non-ChatGPT platforms save rows with `citationContext: "Check failed: OpenRouter timeout"` and `isCited: 0`. Run still completes with partial data. No auto-retry.

---

## 8. Content Distribution ✅

### Where to find it

Any article view → "Distribute" button top-right.

### What you see

Modal dialog with:
- Checkbox per platform: LinkedIn, Medium, Reddit, Quora, X (capped at 5)
- "Generate" button
- Below: tabbed panels for each selected platform (empty until generation)

### What happens when you select platforms and click "Generate"

1. Client POST `/api/distribute/:articleId` ([routes.ts:1957](server/routes.ts#L1957)) body `{ platforms: ["LinkedIn", "Medium", ...] }`.
2. Server verifies ownership, checks OPENAI_API_KEY, caps platforms at 5.
3. **Parallel OpenAI calls** — one per platform, kicked off with `Promise.all`:
   - **LinkedIn prompt**: "Rewrite this article as a LinkedIn post (300-400 words). Professional hook in first sentence, short paragraphs with line breaks, 3-5 branded hashtags at end, clear CTA."
   - **Medium prompt**: "Rewrite as a Medium essay (1,200+ words). Narrative arc. Pull quotes between sections. Engaging first paragraph that sets tension."
   - **Reddit prompt**: "Rewrite as a Reddit post for r/{inferred sub}. Conversational, first-person voice. Acknowledge limits. Include anecdote. NO marketing speak."
   - **Quora prompt**: "Rewrite as a Quora answer. Direct answer in first 2 sentences. Numbered steps. Cite sources. Minimal self-promotion."
   - **X prompt**: "Convert to a 10-tweet thread. Hook in tweet 1. One claim per tweet. Include line breaks and emojis sparingly."
4. **Save each result** — INSERT per-platform row into `distributions`:
   ```
   {
     id, articleId, platform: "LinkedIn",
     platformPostId: null, platformUrl: null,
     status: "pending",
     distributedAt: null,
     metadata: { content: "<the LinkedIn rewrite>" },
     createdAt: now()
   }
   ```
5. Return all results to client.

### What the user sees

- Modal tabs populate with each platform's rewritten copy.
- Each tab has "Copy to Clipboard" button.
- **If user has Buffer connected** (`users.bufferAccessToken` set): also shows "Post to Buffer" button per tab.

### What happens when you click "Post to Buffer"

1. `POST /api/buffer/post` ([server/routes/buffer.ts](server/routes/buffer.ts)) body `{ text, channelId, scheduledAt? }`. One channel per request — to post to multiple channels, the client fires one request per channel.
2. Server decrypts the user's Buffer API key and calls Buffer's GraphQL `createPost` mutation at `https://api.buffer.com` with `Authorization: Bearer <key>`. `mode: addToQueue` if `scheduledAt` is omitted, else `mode: customScheduled` with `dueAt`.
3. Buffer returns the new post's `id` (or a `MutationError` whose `message` we surface verbatim).
4. Server updates the `distributions` row: `platformPostId`, `platformUrl`, `status = "scheduled"`, `distributedAt = now()`.

### History tab

Shows all past `distributions` rows for the article with timestamps, status, links.

---

## 9. Dashboard + Onboarding ✅

### Where to find it

Root URL `/` (home page after login).

### What you see

- Big KPI cards: Total Citations / Total Checks / Citation Rate / Articles / Brands
- Latest article cards (3-6 most recent)
- "Recent Activity" timeline
- **Onboarding Checklist tile** (if not all 4 steps complete) — expandable panel with 4 steps and Done/In-progress badges

### What happens on page mount

1. `GET /api/dashboard` ([routes.ts:631](server/routes.ts#L631)):
   - Loads user's brands (optional `?brandId=` filter for single-brand view).
   - For scoped brands, loads all `brand_prompts`, then all `geo_rankings` by those prompt ids.
   - **Latest-per-(prompt, platform) dedup** ([routes.ts:659-664](server/routes.ts#L659)): map `${promptId}:${platform}` → row, keeping the most recent `checkedAt`. Prevents counting 3 historical runs as 3× the citations.
   - `totalChecks = latestRows.length`
   - `totalCitations = latestRows.filter(r => r.isCited).length`
   - `citationRate = Math.round((totalCitations / totalChecks) * 100)`
2. `GET /api/onboarding-status` ([routes.ts:691](server/routes.ts#L691)):
   - 4 step counts:
     - `hasBrands`: `brands.length > 0`
     - `hasArticles`: any `articles` row with `brandId` in user's brands
     - `visibilityVisited`: `users.visibility_guide_visited_at IS NOT NULL`
     - `citationRunsCount`: any `citation_runs` row with user's brands (even 0 cited = done, because they ran the feature)
   - Plus `citedRankingsCount` for analytics display.

### What happens when you click a checklist step

- Each step is a link to the relevant page: `/brands` (create brand), `/content` (generate article), `/ai-visibility`, `/citations`.
- Auto-opens the checklist once per user (keyed by localStorage `venturecite-onboarding-seen:<userId>`).

### Banner: "Some dashboard data failed to load"

Shown only when `hasBrands && (analyticsError || articlesError || brandsError)` — so no-brand users don't see a scary banner on their empty dashboard.

---

## 10. Scheduler (auto-citation runs) ✅

### Trigger

`server/scheduler.ts` — cron runs via `setInterval` (typically every hour), iterating active brands where `autoCitationSchedule !== 'off'`.

### Per-brand logic

1. Check `autoCitationSchedule` (weekly/biweekly/monthly) + `autoCitationDay` (0=Sun…6=Sat) against current date.
2. Cap: `MAX_BRANDS_PER_USER = process.env.WEEKLY_MAX_BRANDS_PER_USER ?? 3` — no single user burns more than 3 scheduled brand runs per week.
3. **Invoke** `runBrandPrompts(brandId, platforms, { triggeredBy: "cron" })` — exact same pipeline as a manual Run Citation Check.
4. UPDATE `brands.lastAutoCitationAt = now()`.

### Suggestion regeneration

On each scheduled run, also regenerates the 5 "suggested" prompts. Generates 5 new questions via the same `generateBrandPrompts` logic but with `status: "suggested"` (not "tracked"). User can promote them to tracked or delete.

### What the user sees

- No UI notification by default.
- On next page load: new row in History tab tagged `triggeredBy: cron`.
- Optional: `users.weeklyReportEnabled` + `lastWeeklyReportSentAt` drives an email digest (not always wired).

---

## 11. Crawler permissions check ✅

### Where to find it

Sidebar → "Crawler Check".

### What you see

- Input field for domain (placeholder `yourdomain.com`)
- "Check Permissions" button
- Below: empty state

### What happens when you submit

1. Client POST `/api/check-crawler-permissions` ([routes.ts:3504](server/routes.ts#L3504)) body `{ domain: "acme.com" }`.
2. **Server** — `safeFetchText("https://{domain}/robots.txt", { maxBytes: 500KB, timeoutMs: 5s })` with SSRF protection.
3. **Parse** robots.txt via `parseRobotsTxt()`: extracts `User-agent:` groups, `Allow:` / `Disallow:` rules per group.
4. **Per-crawler evaluation** — for each of: GPTBot, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, CCBot, Bytespider, Amazonbot, anthropic-ai, ChatGPT-User, Applebot-Extended, FacebookBot, Meta-ExternalAgent:
   - If explicitly `Disallow: /` → **accessScore = 0** (blocked)
   - If explicitly `Allow: /` → **accessScore = 100**
   - If unspecified → **accessScore = 50-75** based on how common that crawler is in typical configs
5. **Compute overall**: average across all crawlers, plus per-category breakdown.
6. Return `{ robotsTxtFound, rules: [...], crawlers: [{name, status, accessScore, rule: "Disallow /"}, ...], overallScore }`.

### What the user sees

- Results render: overall score (0-100 donut chart), per-crawler row with checkmark/X + access score.
- Recommendations panel: "Your robots.txt blocks GPTBot — removing this line will make your content eligible for ChatGPT citations".
- Button: "Copy recommended robots.txt" — gives a pre-built one.

### What gets saved

Nothing. This is stateless — just a live fetch + parse.

---

---

# Phase 2 features

## 12. GEO Rankings ✅

**This is a read-view of the `geo_rankings` rows created by the Phase 1 Citation Check flow (feature 7). It is not a separate data pipeline.**

### Where to find it

Sidebar → "GEO Rankings".

### What you see

- "Live Citation Monitoring" banner (green checkmark) — explaining that these numbers come from real AI API calls
- 4 KPI cards: Total Checks / Citations / Citation Rate / Platforms
- "Platform Performance" card — one row per platform, showing `cited/checks (rate%)`, avg rank
- "Recent Rankings" scrollable list — each row shows platform badge, prompt text, rank badge (if cited), "Cited" / "Not cited" icon, article title (if tied to an article), "Checked X days ago", external-link icon to the article

### What happens on page mount

1. `GET /api/geo-rankings` ([routes.ts:2098](server/routes.ts#L2098)) — returns all `geo_rankings` rows tied to articles the user owns (via brandId).
2. `GET /api/articles` — for mapping `articleId` → article title/slug in the UI.

### Server logic

- For each row, server checks `articleId IN (<user's article ids>)` — only returns owned data.
- No aggregation server-side — client does the math.

### Client-side math

```
platformStats[ranking.aiPlatform] ||= { total: 0, cited: 0, avgRank: [] }
stats.total++
if (ranking.isCited) {
  stats.cited++
  if (ranking.rank) stats.avgRank.push(ranking.rank)
}
```
Then:
- `citationRate = (totalCited / totalRankings) × 100`
- `avgRank = sum(avgRank[]) / avgRank.length` (only if length > 0)
- Per-platform rate = `(stats.cited / stats.total) × 100`

### What happens when you click a ranking row

Opens the article view page (if tied to an article) in a new tab.

### When this looks empty

New account without any citation runs. The "Live Citation Monitoring" banner tells users: go run a check from the Citations page.

---

## 13. GEO Analytics ✅

### Where to find it

Sidebar → "GEO Analytics".

### What you see

- BrandSelector (top-right, mandatory — page hides content until picked)
- **Executive Summary card**: big numbers for AI Visibility Score (0-100 gauge) + Share of Voice (%) + Avg sentiment
- **Per-platform breakdown table**: one row per AI platform, columns Mentions / Citations / Avg Rank / Visibility Score / Sentiment (🟢🟡🔴 icons)
- **Share of Voice chart**: horizontal bar showing you + top 5 competitors
- **Sentiment breakdown**: stacked bar (positive/neutral/negative)

### What happens on page mount

1. `GET /api/geo-analytics/:brandId` ([routes.ts:3619](server/routes.ts#L3619)).
2. Server performs real-time aggregation:
   - Load all `geo_rankings` for the brand's articles + brand's prompts.
   - Load `competitors` + `competitor_citation_snapshots` for SOV math.
   - Per-platform aggregate:
     - `mentions` = count of rankings (cited or not) where brand variant appeared anywhere in response
     - `citations` = count where `isCited = 1`
     - `avgRank` = average of `rank` across cited rows (null-safe)
     - `visibilityScore`: weighted formula (below)
     - `sentimentCounts = { positive, neutral, negative }` from `geo_rankings.sentiment`
3. Share of Voice: `brandCitations / (brandCitations + sum(competitorCitations)) × 100`.

### The Visibility Score formula

Weights live in [shared/constants.ts:40-47](shared/constants.ts#L40) as `CITATION_SCORING`:
```
citationWeight: 40
mentionWeight: 30
rankWeight: 30
citationMultiplier: 10
mentionMultiplier: 5
rankMultiplier: 3
```

Per-platform:
```
citationScore = min(citations × 10, 40)           // max 40 points
mentionScore  = min(mentions × 5,  30)            // max 30 points
rankScore     = max(30 - (avgRank × 3), 0)        // max 30 points, lower rank = more points
visibility    = min(citationScore + mentionScore + rankScore, 100)
```

Example: 5 citations, 10 mentions, avg rank 2 on ChatGPT →
- citationScore = min(50, 40) = 40
- mentionScore = min(50, 30) = 30
- rankScore = max(30 - 6, 0) = 24
- Total: **94/100**

### Sentiment bucketing

Per ranking's saved `sentimentScore`:
- `> 0.3` → positive
- `< -0.3` → negative
- else → neutral

### What the user sees

Cards render. Hover on any bar → tooltip with exact numbers. Click a platform row → drill to `/geo-rankings?platform=<X>` filtered view.

---

## 14. GEO Opportunities ✅

### Where to find it

Sidebar → "GEO Opportunities".

### What you see

- BrandSelector top-right
- If no brand selected: amber banner "Industry benchmarks — select a brand to see your data"
- 4 stat cards: Third-Party Citations % / Reddit % / Quora % / Brand Site %
- Key Insight card: "91% of AI citations come from third-party sources..." — values driven by real stats
- Platform rankings table (sorted by citation share)
- Recommended subreddits + Quora topics (tabs)
- Content Ideas tab: AI-generated templates

### What happens on page mount

1. If brand selected: `GET /api/geo-opportunities/:brandId` ([routes.ts:4132](server/routes.ts#L4132)).
2. If not: `GET /api/geo-opportunities` (no brand) — returns industry-benchmark defaults with a visible "these are benchmarks" banner.

### Server logic (brand-scoped)

1. Load all `isCited=1` rows from `geo_rankings` for the brand.
2. For each row:
   - Extract domain from `citingOutletUrl` (strip protocol, www, split on /).
   - Bucket:
     - contains `reddit.com` → Reddit
     - contains `quora.com` → Quora
     - matches brand's own domain (from `brands.website`) → Own-site
     - else → Third-party
3. Each bucket % = `(bucketCount / totalCited) × 100` rounded to 1 decimal.
4. If `totalCited === 0`, return all zeros (not benchmarks) + flag `totalCitedRankings: 0`.

### What the user sees

- If ≥1 cited ranking: real per-platform % for *your* brand
- If 0 cited: "No citation data yet — run a citation check" info banner
- If no brand: industry benchmarks with clear "benchmarks" banner

### Click on a subreddit card

Opens `https://reddit.com/r/<subreddit>` in a new tab.

---

## 15. AI Intelligence — Share of Answer ✅

### Where to find it

Sidebar → "AI Intelligence" → "Share of Answer" tab (default).

### What you see

- BrandSelector at top
- Big metric: "Share of Answer: 34%" with trend arrow
- Per-platform breakdown: how often brand appears in answers per platform
- Volatility + Consensus scores (0-100)
- List of tracked prompts with their individual share % and last-checked date

### What happens on page mount

1. `GET /api/prompt-portfolio/stats/:brandId` — first reads `prompt_portfolio` table. If empty for this brand, **fallback kicks in**:

### Phase 1 fallback logic ([databaseStorage.ts:1228-1263](server/databaseStorage.ts#L1228))

- Load `brand_prompts` for the brand.
- Load all `geo_rankings` tied to those `brandPromptId`s.
- Aggregate: `totalPrompts`, `citedPrompts` (where any ranking had `isCited=1`), per-platform breakdown.
- `shareOfAnswer = (citedPrompts / totalPrompts) × 100`.

### Volatility / Consensus

Thresholds hardcoded at [databaseStorage.ts:1298-1300](server/databaseStorage.ts#L1298):
- Score < 30 → volatile (answers vary heavily run-to-run)
- 30-60 → mixed
- > 60 → consensus (AI consistently cites you)

These are computed from the history of `geo_rankings` rows per prompt: if same prompt has been checked multiple times with mixed cited/not-cited results, volatility high.

### What the user sees

- Numbers render real-time from Phase 1 data
- No writes — this is a read view

---

## 16. AI Intelligence — Citation Quality ✅

### Where to find it

Same page, "Citation Quality" tab.

### What you see

- Big metric: "Citation Quality: 74/100"
- Breakdown: Primary citations (rank 1-3) count + % / Secondary citations count
- Average scores for Authority / Relevance / Recency / Position
- List of each citation with its scores

### Phase 1 fallback ([databaseStorage.ts:1365-1393](server/databaseStorage.ts#L1365))

If `citation_quality` table empty:
- Filter `geo_rankings` to `isCited = 1`.
- Per row:
  - `isPrimaryCitation = rank !== null && rank <= 3 ? 1 : 0`
  - `positionScore = rank != null ? max(0, 100 - (rank-1) * 10) : 50`  (rank 1→100, rank 5→60, null→50)
  - `sourceType` inferred from `citingOutletUrl` domain:
    - `reddit.com | quora.com | ycombinator.com` → "community"
    - `wikipedia.org` → "reference"
    - `youtube.com` → "video"
    - else → "web"
- `totalQualityScore = avg(positionScore)`.

### What the user sees

Synthesized-from-Phase-1 citation quality breakdown.

---

## 17. AI Intelligence — Hallucinations ⚠️

### Where to find it

Same page, "Hallucinations" tab.

### What you see

- "Log a Hallucination" button
- Table of logged hallucinations with severity badges (red/orange/yellow)
- Resolved filter toggle

### What happens when you click "Log Hallucination"

Modal:
- AI Platform (dropdown)
- Prompt (text — the question)
- What AI claimed (text)
- Actual fact (text)
- Type (dropdown: incorrect_fact / outdated_info / misattribution)
- Severity (low/medium/high)
- Category

**Save** → `POST /api/brand-hallucinations` → INSERT into `brand_hallucinations`:
```
{
  id, brandId, aiPlatform, prompt, claimedStatement, actualFact,
  hallucinationType: "incorrect_fact", severity: "high",
  category: "product features", isResolved: 0,
  detectedAt: now()
}
```

### What happens when you mark resolved

- Toggle → PATCH sets `isResolved: 1, resolvedAt: now()`.
- Modal collects `remediationSteps[]` + `remediationStatus`.

### ⚠️ No auto-detection

Entirely manual. A production version would compare `prompt_test_runs.response` against `brand_fact_sheet` entries.

---

## 18. AI Traffic ⚠️

### Where to find it

Sidebar → "AI Traffic".

### What you see

- BrandSelector
- KPI cards: Total Sessions / Conversions / Conversion Rate / Avg Duration
- Per-platform breakdown (ChatGPT vs Perplexity vs ...)
- Top Citation Sources list (top domains citing brand)
- Session list (paginated)

### What happens on page mount

1. `GET /api/ai-traffic/:brandId` — reads `ai_traffic_sessions`.
2. `GET /api/ai-traffic/stats/:brandId` — aggregate stats.
3. `GET /api/ai-sources/top/:brandId` — top sources (with Phase 1 fallback).

### Conversion rate math

`conversionRate = conversions / totalSessions × 100` where `conversions = count(sessions where converted=1)`.

### Top Sources Phase 1 fallback ([databaseStorage.ts:1626-1695](server/databaseStorage.ts#L1626))

If `ai_sources` empty:
- Group cited `geo_rankings` by `(extractDomain(citingOutletUrl), aiPlatform)`.
- For each group:
  - `occurrenceCount = <count>`
  - `authorityScore = min(100, occurrenceCount × 10)`
  - `sourceType` inferred from domain (same as citation quality)
- Return top N by authority score.

### ⚠️ No ingestion pipeline

`ai_traffic_sessions` table requires webhook ingestion or manual import. Not wired by default. Page shows zeros out of the box unless data is populated externally.

---

## 19. Revenue Analytics ⚠️

### Where to find it

Sidebar → "Revenue".

### What you see

- KPI cards: Total Revenue / Orders / AOV / Revenue per AI Session
- Per-platform revenue breakdown
- Recent purchases list

### Data source

`purchase_events` table — written by two webhook handlers:
- `POST /webhooks/shopify/orders` — Shopify order-paid webhook
- `POST /webhooks/ecommerce/purchase` — generic

**⚠️ HMAC verification isn't enforced yet.** Anyone can POST to these and forge rows. Don't point prod traffic here until that's fixed.

### Math

```
totalRevenue = sum(purchase_events.revenue)
totalOrders  = count(purchase_events)
AOV          = totalRevenue / totalOrders
perPlatform  = group by aiPlatform
```

### What happens when a webhook fires

1. Shopify sends `POST /webhooks/shopify/orders` with signed payload.
2. Server (should) verify HMAC using shared secret (gap).
3. Parse order: customer, revenue, currency, products.
4. Try to correlate with `ai_commerce_sessions` via session id from cookies — `commerceSessionId` linked if matched.
5. INSERT `purchase_events` row.

### UI reality

Shows zeros until webhooks start firing.

---

## 20. Client Reports ✅

### Where to find it

Sidebar → "Reports".

### What you see

- BrandSelector
- Period dropdown (7/30/90 days — default 30)
- Metrics cards: Brand Mention Frequency / Share of Voice / Citation Rate / Prompt Coverage — each with trend arrow vs previous period
- Top 5 performing articles (by citation count)
- Recommendations list
- "Export PDF" + "Share Report" buttons (UI only — not wired)

### What happens on page mount

1. `GET /api/client-reports/:brandId?period=30` ([routes.ts:3748-3850](server/routes.ts#L3748)).
2. Server aggregates real-time:
   - **Brand Mention Frequency**: count of all `geo_rankings` rows (cited + uncited) in window
   - **Citation Rate**: `citedInWindow / totalInWindow × 100`
   - **Share of Voice**: `brandCitations / (brandCitations + competitorCitations) × 100` using `competitor_citation_snapshots` in window
   - **Prompt Coverage**: count of `prompt_portfolio` rows where `isBrandCited=1`
   - **Top Articles**: sort articles by citation count (from `articles.citationCount` or computed from `geo_rankings` join) desc, take 5
3. Returns payload + period info.

### What the user sees

Cards render with metrics + trend arrows. Arrows currently always show 0-change because **previous-period diff isn't computed** ([routes.ts:3842-3846](server/routes.ts#L3842)) — known gap.

### Export PDF

Button currently does nothing. A production version would call a headless Chrome renderer.

### Share Report

Also unwired.

---

## 21. GEO Signals — 7-Signal Scorecard ✅

### Where to find it

Sidebar → "GEO Signals" → "7-Signal Scorecard" tab.

### What you see

- BrandSelector (for context)
- Article picker (optional — auto-fills content box)
- Target Query input
- Content textarea
- "Analyze" button
- Results: 7 score cards (Base Ranking, Gecko, Jetstream, BM25, PCTR, Freshness, Authority)

### What happens when you click Analyze

1. `POST /api/geo-signals/analyze` ([routes.ts:6606-6673](server/routes.ts#L6606)) body `{ content, targetQuery, brandId }`.
2. **Zero external API calls.** Pure text heuristics:

**Base Ranking** (0-15):
```
wordCount = content.split(/\s+/).length
hasHeadings = /^#{1,3}\s/m.test(content)
hasLists = /^[*-]\s|^\d+\.\s/m.test(content)
score = min(15, (wordCount/1500) × 10 + hasHeadings × 3 + hasLists × 2)
```

**Gecko (semantic)** (0-20):
```
queryWords = targetQuery.toLowerCase().split(/\s+/)
contentLower = content.toLowerCase()
matched = queryWords.filter(w => contentLower.includes(w)).length
keywordDensity = matched / queryWords.length
hasFacts = /\d+%|\$\d+|\d{4}/.test(content)  // percentages, dollar amounts, years
score = min(20, keywordDensity × 15 + (hasFacts ? 5 : 0))
```

**Jetstream (context)** (0-15):
```
hasQuestions = /\?/.test(content)
hasContrast = /however|but|unlike|compared|versus/.test(contentLower)
score = (hasQuestions ? 5 : 0) + (hasContrast ? 5 : 0) + (content.length > 3000 ? 5 : 3)
```

**BM25 (keyword match)** (0-15):
```
exactPhrase = contentLower.includes(targetQuery.toLowerCase())
score = min(15, keywordDensity × 12 + (exactPhrase ? 3 : 0))
```

**PCTR (clickability)** (0-15):
```
score = (hasQuestions ? 5 : 0) + (length > 500 ? 5 : 0) + (hasHeadings ? 5 : 0)
```

**Freshness**: hardcoded 10 (placeholder — production should check actual publication/update date).

**Authority**: hardcoded 10 (placeholder — production should check backlinks/E-E-A-T signals).

3. Returns `{ signals: [{ signal, score, maxScore, status, recommendations }], overallScore }`.

### What the user sees

- Each signal renders as a card with progress bar (score/maxScore)
- Status badge: excellent (≥80%) / good (≥60%) / needs-improvement (40-60%) / poor (<40%)
- Click expand → recommendations list ("Add more H2 headings", "Include more fact-based claims").

### Nothing written to DB

Analysis is stateless — re-analyzing the same content gives the same result.

---

## 22. GEO Signals — Chunk Engineer ✅

### What you see

Same page, "Chunk Engineer" tab. Textarea + Analyze button.

### What happens

`POST /api/geo-signals/chunk-analysis` body `{ content }`.

Server splits content into ~500-token chunks (rough tokenization: `words.length × 1.33`). For each chunk:
- `hasHeading`: starts with a markdown heading
- `hasDirectAnswer`: first sentence is a declarative (no question mark)
- `questionBased`: section heading is a question
- `extractable = hasHeading && hasDirectAnswer && questionBased`

### Optimize Chunks button

`POST /api/geo-signals/optimize-chunks` body `{ content, brandId }`.

Calls OpenAI to rewrite into extractable form: each ~500-token chunk gets a question-based H2 + a direct first-sentence answer.

Saves nothing — returns `optimizedContent` string for user to copy.

---

## 23. GEO Signals — Schema Audit ❌

**Fake.** `POST /api/geo-signals/schema-audit` body `{ url }` returns a hardcoded list of schema types (FAQ, Article, HowTo, BreadcrumbList, Organization, Product) with `Math.random() > 0.5 ? present : missing` per type ([routes.ts:6846-6886](server/routes.ts#L6846)).

Production needs: HTTP fetch of URL → parse JSON-LD from `<script type="application/ld+json">` → compare against schemas.

---

## 24. GEO Signals — Pipeline Simulation ⚠️

Visualization tab showing 4 stages (Prepare → Retrieve → Signal → Serve) with per-stage status derived from the other signal scores. Educational.

`POST /api/geo-signals/pipeline-simulation` body `{ content, query }` returns stage objects with status (`pass` / `warning` / `fail`) based on 7-signal results.

---

## 25. GEO Tools ⚠️

### Where to find it

Sidebar → "GEO Tools".

### Tabs

- **Listicles**: Monitor listicles ("Top 10 CRM") for brand inclusion
- **Wikipedia**: Track Wikipedia mentions
- **BOFU**: Generate bottom-of-funnel content
- **FAQ**: (separate page now, see feature 26)
- **Brand Mentions**: Log mentions manually

### Listicles tab

- BrandSelector
- "Discover Listicles" button — **⚠️ returns empty/stub** (no real discovery)
- Manual "Add Listicle" form: URL, title, source, list position, total items, is-included toggle, competitors mentioned

**Save** → INSERT into `listicles`:
```
{
  id, brandId, title, url, sourcePublication, listPosition: 3, totalListItems: 10,
  isIncluded: 1, competitorsMentioned: ["Salesforce", "HubSpot"],
  keyword, searchVolume, domainAuthority,
  lastChecked: now(), createdAt: now()
}
```

### Wikipedia tab

- "Scan Wikipedia" button — **⚠️ stub** (no Wikipedia API integration)
- Manual add: page title, URL, mention context, mention type (direct/reference/citation/related)

**Save** → INSERT into `wikipedia_mentions`.

### BOFU Content tab

Generator form:
- Content type (comparison / alternative / vs-page)
- Primary keyword
- Compared with (multi-select competitor names)
- Target intent

**Generate** → `POST /api/bofu-content/generate/:brandId` → OpenAI call with brand context. Returns markdown.

**Save Draft** → INSERT `bofu_content`:
```
{
  id, brandId, contentType: "comparison", title, content: "<markdown>",
  primaryKeyword, comparedWith: [...], targetIntent, status: "draft",
  aiScore, createdAt, updatedAt
}
```

### Brand Mentions tab

- Add mention manually: platform, source URL, context, sentiment, engagement score
- "Discover Mentions" button — **⚠️ stub**

**Save** → INSERT `brand_mentions`.

Aggregate stats: sum of engagement scores, counts by platform/sentiment ([routes.ts:5002-5020](server/routes.ts#L5002)).

---

## 26. FAQ Manager ✅

### Where to find it

Sidebar → "FAQ Manager".

### What you see

- BrandSelector
- Generate form: topic input + count (1-20)
- Tabs: "Manage" (list of FAQs) / "Generate" / "Categories"

### What happens when you click "Generate"

1. `POST /api/faqs/generate/:brandId` body `{ topic, count }` ([routes.ts:4921-4996](server/routes.ts#L4921)).
2. Count clamped `min(20, max(1, count))` ([routes.ts:4929](server/routes.ts#L4929)).
3. OpenAI call:
   - System: "Write N FAQs matching how users ask AI chatbots questions. Each has question + comprehensive answer + category + aiSurfaceScore (1-100, your estimate of likelihood AI will surface this FAQ)."
   - User: brand context + topic
   - JSON mode
4. For each returned FAQ, INSERT `faq_items`:
   ```
   {
     id, brandId, articleId: null,
     question: "What is the best CRM for startups?",
     answer: "<comprehensive answer>",
     category: "product selection",
     searchVolume: null,
     aiSurfaceScore: 78,
     isOptimized: 0,
     optimizationTips: null,
     createdAt, updatedAt
   }
   ```

### What happens when you edit an FAQ

Inline edit → PATCH `/api/faqs/:id` → updates.

### What happens when you click "Optimize"

Runs another OpenAI call to rewrite question+answer for higher AI-surface scoring. Updates row with new score + `isOptimized: 1`.

### ⚠️ `aiSurfaceScore` is whatever OpenAI returns

Never re-validated. Not a ground-truth metric.

---

## 27. Community Engagement ✅

### Where to find it

Sidebar → "Community".

### What you see

- BrandSelector
- Tabs: Communities / Posts
- Communities tab: "Discover Communities" button → list of discovered subreddits/Quora spaces
- Posts tab: list of generated drafts

### What happens when you click "Discover Communities"

1. `POST /api/communities/discover` body `{ brandId }`.
2. Server OpenAI call: "Give me 10-15 communities (subreddits, Quora spaces, Discord servers, forums) relevant to this brand. For each: platform, name, URL, suggested topics[]."
3. Returns JSON. **Not saved** — displayed ephemerally. User picks one to generate post for.

### What happens when you click "Generate Post"

Modal:
- Platform (dropdown: Reddit / Quora / Slack / Discord)
- Group name (pre-filled if from discovery)
- Topic
- Post type (post / answer / comment)
- Tone (helpful / authentic / professional)

**Generate** → `POST /api/community-posts/generate` body `{ brandId, platform, groupName, topic, postType, tone }` ([routes.ts:7102-7135](server/routes.ts#L7102)).

Server OpenAI call with platform-specific guidelines baked in:
- **Reddit**: conversational, first-person, acknowledge limits, no marketing speak
- **Quora**: direct answer, numbered steps, cite sources
- **Slack/Discord**: casual, emoji-appropriate

INSERT `community_posts` as draft:
```
{
  id, brandId, platform: "Reddit", groupName: "r/startups", groupUrl,
  title: "<if applicable>", content: "<AI-generated draft>",
  postUrl: null, status: "draft", postType: "answer",
  keywords, generatedByAi: 1, createdAt
}
```

### What the user does next

- Reviews draft
- Edits if needed (inline)
- Copies to clipboard
- Posts manually on real platform
- Comes back, marks "Posted" + pastes `postUrl` → status becomes "posted", `postedAt` set

### ⚠️ Not an auto-poster

No Reddit API, no Quora API. User does the posting manually.

---

## 28. Outreach ⚠️

### Where to find it

Sidebar → "Outreach".

### What you see

- BrandSelector
- Tabs: Campaigns / Publications / Emails / Analytics
- KPI cards: Total campaigns / Success rate / Accepted

### Campaigns tab

- "Create Campaign" button → modal with form (campaign name, type, target domain, contact email, pitch angle, proposed topic)
- Save → INSERT `outreach_campaigns`:
  ```
  {
    id, brandId, campaignName, campaignType: "guest_post",
    targetDomain: "techcrunch.com", targetContactEmail,
    targetContactName, status: "draft",
    emailSubject, emailBody, pitchAngle, proposedTopic,
    linkedArticleId: null, authorityScore: 0,
    aiGeneratedDraft: 0, createdAt, updatedAt
  }
  ```

### AI-draft email button

On a campaign → "Draft with AI". `POST /api/outreach-campaigns/:id/draft` → OpenAI writes subject + body based on pitch angle + target. Sets `aiGeneratedDraft: 1`, populates `emailSubject`, `emailBody`.

### Publications tab

List of `publication_targets` rows. Manual add form with domain, contact info, domain authority.

"Discover Publications" button — **⚠️ returns empty/stub**.

### Emails tab

- "Compose Email" → modal
- Save draft → INSERT `outreach_emails` with `status: "draft"`
- **"Send" button** → `POST /api/outreach-emails/:id/send`

### Send flow ⚠️

[databaseStorage.ts:2065-2079](server/databaseStorage.ts#L2065):
```
async sendOutreachEmail(id) {
  if (Math.random() > 0.15) {
    // 85% "success"
    UPDATE outreach_emails SET status='sent', sentAt=NOW() WHERE id=?
    return { sent: true }
  } else {
    UPDATE outreach_emails SET status='failed', error='Simulated delivery failure' WHERE id=?
    return { sent: false }
  }
}
```

**No SMTP. No Resend. Pure coin-flip mock.** Production needs real email integration.

### What the user sees

Email table shows status pills: Draft / Sent / Failed / Opened / Replied. All driven by mock except Draft.

---

## 29. Competitors ⚠️

### Where to find it

Sidebar → "Competitors".

### What you see

- BrandSelector
- Competitor list table: name, domain, total citations, last snapshot
- Leaderboard: competitors + your brand ranked by citation count
- "Add Competitor" button

### Add Competitor flow

Modal: name, domain, industry, description.

Save → INSERT `competitors`:
```
{ id, brandId, name: "HubSpot", domain: "hubspot.com", industry: "CRM", description, createdAt }
```

### Snapshot entry

On competitor row → "Add Snapshot" modal: AI platform + citation count (manual entry).

Save → INSERT `competitor_citation_snapshots`:
```
{ id, competitorId, aiPlatform: "ChatGPT", citationCount: 47, snapshotDate: now() }
```

### Leaderboard math

`storage.getCompetitorLeaderboard(brandId)` — joins `competitors` with latest `competitor_citation_snapshots` per (competitor, platform), sums to total per competitor, sorts desc. Your brand's total computed from `geo_rankings`.

### ⚠️ No scraping

All competitor citation counts are hand-entered. A real implementation would run `runBrandPrompts`-style checks against competitors' name variants.

---

## 30. Brand Fact Sheet ⚠️

### Where to find it

Sidebar → "Brand Fact Sheet".

### What you see

- BrandSelector
- Fact categories: Founding / Funding / HQ / Products / People / Metrics / Other
- Per category: list of facts (key → value) with edit/delete
- "Add Fact" button
- "Autofill from Website" button

### Add Fact flow

Modal: category (dropdown), key (e.g. "founded"), value (e.g. "2018"), source URL (optional).

Save → INSERT `brand_fact_sheet`:
```
{
  id, brandId, factCategory: "Founding", factKey: "year_founded",
  factValue: "2018", sourceUrl: "https://acme.com/about",
  lastVerified: now(), isActive: 1,
  createdAt, updatedAt
}
```

### Autofill from Website

`POST /api/brand-facts/autofill` body `{ url }` → fetches URL, runs OpenAI extraction, returns facts list. User reviews, clicks Save All → bulk INSERT.

### Edit flow

Inline edit → PATCH → updates row. **`lastVerified = NOW()` stamped on every save**, regardless of whether user actually verified the fact. Not true verification.

---

## 31. Agent Dashboard — Tasks ✅

### Where to find it

Sidebar → "AI Agent".

### What you see

- BrandSelector
- 4 KPI cards: Queued / In Progress / Completed / Tokens Used
- Tabs: Task Queue / Automation Rules / Outreach
- Task Queue tab: list of tasks with status badges + Run Now / Delete buttons + "Create Task" button

### Create Task flow

"Create Task" → modal with 6 task-type cards:
1. **Generate AI-Optimized Article** (content_generation) — ~2-3 min
2. **Draft Outreach Email** (outreach) — ~1-2 min
3. **Test AI Citation** (prompt_test) — ~1-2 min
4. **Analyze Competitor Sources** (source_analysis) — ~2-3 min
5. **Fix AI Hallucinations** (hallucination_remediation) — ~3-5 min
6. **Update Existing Content** (seo_update) — ~2-3 min

User picks a card → "Start This Task" button.

### Save + execute

1. POST `/api/agent-tasks` body `{ brandId, taskType, taskTitle, taskDescription, priority: "medium", triggeredBy: "manual" }` → INSERT `agent_tasks`:
   ```
   {
     id, brandId, taskType: "content_generation",
     taskTitle: "Generate AI-Optimized Article",
     taskDescription, priority: "medium",
     status: "queued", assignedTo: "agent",
     triggeredBy: "manual", automationRuleId: null,
     inputData: {...form fields...}, outputData: null,
     aiModelUsed: null, tokensUsed: 0,
     retryCount: 0, maxRetries: 3,
     createdAt, updatedAt
   }
   ```
2. Auto-fire `POST /api/agent-tasks/:id/execute` ([routes.ts:6026-6130](server/routes.ts#L6026)).
3. Server:
   - UPDATE task status to `in_progress`, `startedAt = now()`.
   - Branch on `taskType`:
     - **content_generation**: OpenAI call with system prompt "You are a GEO content expert. Generate a 1500-word article…". User message has brand context.
     - **outreach**: "Draft a guest post pitch email for {publication}."
     - **prompt_test**: Run 5 sample queries — but NOT `runBrandPrompts`. Just asks OpenAI to predict citation probability.
     - **source_analysis**: Research publications citing brand's vertical.
     - **hallucination_remediation**: Produce correction content.
     - **seo_update**: Rewrite an existing article with fresh citations.
   - Save response: `outputData = { output: "<text>" }`, `tokensUsed = response.usage.total_tokens`, `aiModelUsed = "gpt-4o"`, `status = "completed"`, `completedAt = now()`.
4. Client polls task status → on completion, green toast + output panel expands.

### What happens on failure

`status = "failed"`, `error = "<message>"`. If `retryCount < maxRetries`, UI shows Retry button.

### ⚠️ No side effects

`content_generation` task doesn't create an `articles` row. `outreach` task doesn't send email. It's "AI thinks" not "AI does". Production would wire outputs back to real side-effect endpoints.

---

## 32. Agent Dashboard — Automation Rules ❌

### Where to find it

Agent Dashboard → "Automation Rules" tab.

### What you see

- "Create Rule" button
- Rule list with toggle switches

### Create Rule flow

Modal:
- Rule name
- Trigger type (dropdown: citation_drop, new_hallucination, schedule, alert)
- Trigger conditions (JSON — "when citation rate drops below X%")
- Action type (create_agent_task, send_email, etc.)
- Action config (JSON)
- Cooldown minutes (default 60)
- Max executions per day (default 10)

Save → INSERT `automation_rules`:
```
{
  id, brandId, ruleName, ruleDescription,
  triggerType: "citation_drop", triggerConditions: { threshold: 20 },
  actionType: "create_agent_task", actionConfig: { taskType: "source_analysis" },
  isEnabled: 1, priority: 50, cooldownMinutes: 60, maxExecutionsPerDay: 10,
  executionCount: 0, lastTriggeredAt: null, lastExecutedAt: null,
  createdAt, updatedAt
}
```

### Toggle on/off

PATCH `/api/automation-rules/:id` body `{ isEnabled: 1 | 0 }` → updates.

### ⚠️ No scheduler evaluates these rules

`executionCount` and `lastTriggeredAt` never increment automatically. Creating a rule is a no-op until someone writes a worker. Production needs a cron that:
1. Loads enabled rules
2. Evaluates triggerConditions against current metrics
3. If match → creates `agent_tasks` row + `automation_executions` log
4. UPDATEs rule's counts

---

## 33. Publication Intelligence ❌

### Where to find it

Sidebar → "Publications".

### What you see

Coming Soon splash screen with icon and description. Routes exist (`/api/publication-references`, `/api/publication-metrics`) but page doesn't call them. Tables never populated.

Production needs an ingestion source (e.g., periodically scrape `geo_rankings.citingOutletUrl` domains + attribute citations to publications).

---

## 34. Analytics Integrations (GA4 / GSC) ❌

### Where to find it

Sidebar → "Integrations".

### What you see

- Card: Google Analytics 4 with "Connect" button + setup instructions
- Card: Google Search Console with "Connect" button + setup instructions

### What happens when you click Connect

Modal: paste API key / OAuth token.

Save → `localStorage["venturecite-ga4-config"] = <token>`. No server call, no actual connection. Data never syncs.

Production needs real OAuth flow.

---

---

# Summary table

| Feature | Status | Real external call? |
|---|---|---|
| Brand autofill | ✅ | Website fetch + OpenAI |
| AI Visibility checklist | ✅ | Self-tracking, no verification |
| Keyword research | ✅ | OpenAI (⚠️ AI-estimated volume/difficulty) |
| Content generation | ✅ | OpenAI (generation + 3× humanize loop) |
| Auto-improve | ✅ | OpenAI (humanize loop with baseline floor) |
| Brand prompts generation | ✅ | OpenAI |
| Citation check | ✅ | OpenAI + OpenRouter (50 calls/run) |
| Content distribution | ✅ | OpenAI (up to 5 platforms) |
| Dashboard / onboarding | ✅ | DB aggregation |
| Scheduler | ✅ | Reuses citation check pipeline |
| Crawler check | ✅ | robots.txt HTTP fetch |
| GEO Rankings | ✅ | Read view of citation data |
| GEO Analytics | ✅ | DB aggregation |
| GEO Opportunities | ✅ | DB aggregation |
| AI Intelligence (Share/Quality) | ✅ | DB aggregation + Phase 1 fallback |
| AI Intelligence (Hallucinations) | ⚠️ | Manual entry only |
| AI Traffic | ⚠️ | Needs webhook ingestion |
| Revenue Analytics | ⚠️ | Webhooks exist, HMAC unverified |
| Client Reports | ✅ | DB aggregation (⚠️ trend diffs not computed) |
| GEO Signals (7-signal) | ✅ | Text heuristics |
| GEO Signals (Chunk) | ✅ | Text splitting + OpenAI optimize |
| GEO Signals (Schema Audit) | ❌ | Fake — uses `Math.random()` |
| GEO Signals (Pipeline Sim) | ⚠️ | Visualization over other signals |
| GEO Tools (Listicles/Wiki discovery) | ❌ | Stub |
| GEO Tools (BOFU / FAQ / Mentions) | ✅ / manual | OpenAI for generation, manual for mentions |
| FAQ Manager | ✅ | OpenAI (⚠️ self-reported score) |
| Community Engagement | ✅ | OpenAI (not Reddit API) |
| Outreach (send) | ⚠️ | **Coin-flip mock, no SMTP** |
| Competitors | ⚠️ | Manual entry, no scraping |
| Brand Fact Sheet | ⚠️ | Manual entry, fake verification |
| Agent Tasks | ✅ | OpenAI (no downstream side effects) |
| Automation Rules | ❌ | CRUD only, no scheduler |
| Publication Intelligence | ❌ | Coming Soon |
| Analytics Integrations | ❌ | localStorage placeholder |

---

# Known production gaps

Ship-blockers if you're trying to go GA with everything:

1. **Outreach send** must use Resend/SMTP, not `Math.random()`.
2. **Schema Audit** must fetch real HTML + extract JSON-LD.
3. **Automation Rules** need a scheduler to evaluate triggers.
4. **Revenue webhooks** need HMAC verification before accepting prod traffic.
5. **Client Reports** trend arrows need previous-period math.
6. **Competitor snapshots** need automated scraping or citation-check integration.
7. **GA4 / GSC integrations** need real OAuth.
8. **Keyword research** scores should call DataForSEO or Ahrefs API (currently AI estimates).
9. **Hallucination detection** needs a real detection pipeline — today it's manual log only.
10. **Publication Intelligence** page needs an ingestion source.

Everything else is the actual article — real AI calls, real data, real aggregation.

---

---

# Database reference

Source of truth: [shared/schema.ts](shared/schema.ts). All 44 tables, grouped by feature cluster, followed by a feature→tables cross-reference.

Column notation:
- `PK` — primary key (all tables use UUID `varchar` with `gen_random_uuid()` default)
- `FK → table.col` — foreign key reference (cascade behavior noted)
- `[]` after a type = Postgres text array
- Integer `0/1` columns are used as booleans throughout (legacy from SQLite port)

---

## Auth & billing

### `users` ([schema.ts:6](shared/schema.ts#L6))
The account. Every other user-owned row FKs back here (usually via `brandId → brands.userId`).

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| email | text UNIQUE | |
| passwordHash | text | bcrypt |
| firstName, lastName | text | |
| profileImageUrl | text | |
| accessTier | text NOT NULL | default `"free"` — one of `free/beta/pro/enterprise/admin` |
| stripeCustomerId | text | |
| stripeSubscriptionId | text | |
| betaInviteCode | text | set when redeemed |
| isAdmin | int | 0/1 |
| articlesUsedThisMonth | int | incremented by `storage.incrementArticleUsage()` on successful generation |
| brandsUsed | int | |
| usageResetDate | timestamp | |
| emailVerified | int | 0/1 |
| weeklyReportEnabled | int | 0/1 |
| lastWeeklyReportSentAt | timestamp | cron check marker |
| visibilityGuideVisitedAt | timestamp | stamped on first `/ai-visibility` visit — powers cross-device onboarding tile |
| bufferAccessToken | text | Encrypted Buffer access token (user-supplied via Connect dialog) |
| createdAt, updatedAt | timestamp | |

### `betaInviteCodes` ([schema.ts:40](shared/schema.ts#L40))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| code | text UNIQUE | |
| maxUses | int | default 1 |
| usedCount | int | |
| accessTier | text | tier granted when redeemed |
| expiresAt | timestamp | |
| createdBy | text | admin email |
| createdAt | timestamp | |

### `waitlist` ([schema.ts:56](shared/schema.ts#L56))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| email | text UNIQUE | |
| source | text | default `"landing"` |
| createdAt | timestamp | |

---

## Brand & content core

### `brands` ([schema.ts:91](shared/schema.ts#L91))
Every feature scopes by brand. Deleting a brand cascades to ~25 child tables.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users.id (cascade) | |
| name | text NOT NULL | |
| companyName | text NOT NULL | |
| industry | text NOT NULL | |
| description | text | |
| website | text | |
| tone | text | default `"professional"` |
| targetAudience | text | |
| products | text[] | |
| keyValues | text[] | |
| uniqueSellingPoints | text[] | |
| brandVoice | text | |
| sampleContent | text | |
| nameVariations | text[] | extra names for citation-detection pre-filter |
| autoCitationSchedule | text NOT NULL | `off/weekly/biweekly/monthly` |
| autoCitationDay | int NOT NULL | 0=Sun…6=Sat |
| lastAutoCitationAt | timestamp | |
| createdAt, updatedAt | timestamp | |

### `articles` ([schema.ts:118](shared/schema.ts#L118))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| title | text NOT NULL | |
| slug | varchar(255) NOT NULL | unique per (brandId, slug) |
| content | text NOT NULL | markdown |
| excerpt | text | |
| metaDescription | text | |
| keywords | text[] | |
| industry | text | |
| contentType | text | |
| featuredImage | text | |
| author | text | default `"GEO Platform"` |
| viewCount | int | |
| citationCount | int | incremented when new cited `geo_rankings` rows reference this article |
| seoData | jsonb | `{ humanScore, humanizationAttempts, passesAiDetection, generatedVia, improvedFrom }` |
| createdAt, updatedAt | timestamp | |

### `distributions` ([schema.ts:145](shared/schema.ts#L145))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| articleId | varchar FK → articles.id (cascade) NOT NULL | |
| platform | text NOT NULL | LinkedIn/Medium/Reddit/Quora/X |
| platformPostId | text | set after real post (Buffer) |
| platformUrl | text | |
| status | text NOT NULL | default `"pending"` |
| distributedAt | timestamp | |
| error | text | |
| metadata | jsonb | holds the rewritten content under `metadata.content` |
| createdAt | timestamp | |

### `keywordResearch` ([schema.ts:162](shared/schema.ts#L162))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| keyword | text NOT NULL | |
| searchVolume | int | AI estimate, not real SEO data |
| difficulty | int | AI estimate |
| opportunityScore | int NOT NULL | default 50 |
| aiCitationPotential | int NOT NULL | default 50 |
| intent | text | informational/commercial/transactional/navigational |
| category | text | |
| competitorGap | int | |
| suggestedContentType | text | article/guide/comparison/how-to/listicle |
| relatedKeywords | text[] | |
| status | text NOT NULL | default `"discovered"` |
| contentGenerated | int | 0/1 |
| articleId | varchar FK → articles.id (set null) | set when user generates content from this keyword |
| discoveredAt, updatedAt | timestamp | |

### `contentGenerationJobs` ([schema.ts:193](shared/schema.ts#L193))
Background worker queue.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users.id (cascade) NOT NULL | |
| brandId | varchar FK → brands.id (set null) | |
| status | text NOT NULL | `pending/in_progress/completed/failed` |
| requestPayload | jsonb NOT NULL | full form state |
| articleId | varchar FK → articles.id (set null) | filled on completion |
| errorMessage | text | |
| createdAt, startedAt, completedAt | timestamp | |

### `contentDrafts` ([schema.ts:224](shared/schema.ts#L224))
Auto-saved form state.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar NOT NULL | |
| title | text | |
| keywords | text NOT NULL | default `""` |
| industry | text NOT NULL | default `""` |
| type | text NOT NULL | default `"article"` |
| brandId | varchar | |
| targetCustomers | text | |
| geography | text | |
| contentStyle | text | default `"b2c"` — b2b/b2c |
| generatedContent | text | final markdown after job completes |
| articleId | varchar FK → articles.id (set null) | |
| jobId | varchar | FK to content_generation_jobs (soft, no cascade) |
| humanScore | int | |
| passesAiDetection | int | NULL=unchecked, 0=fails, 1=passes |
| createdAt, updatedAt | timestamp | |

---

## Citations (Phase 1 core)

### `promptGenerations` ([schema.ts:256](shared/schema.ts#L256))
One row per batch of 10 prompts — enables history.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| generationNumber | int NOT NULL | monotonic per brand |
| createdAt | timestamp | |

### `brandPrompts` ([schema.ts:271](shared/schema.ts#L271))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| generationId | varchar FK → promptGenerations.id (set null) | |
| prompt | text NOT NULL | the question asked to AIs |
| rationale | text | 1-sentence why-this-prompt |
| orderIndex | int | 0–9 |
| isActive | int | legacy 0/1 — prefer `status` |
| status | text NOT NULL | `tracked/suggested/archived` |
| createdAt | timestamp | |

### `citationRuns` ([schema.ts:318](shared/schema.ts#L318))
One row per "Run Citation Check" click or cron run.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| totalChecks | int | 10 prompts × 5 platforms = 50 typical |
| totalCited | int | |
| citationRate | int | percentage 0–100 |
| triggeredBy | text NOT NULL | `manual/cron` |
| startedAt | timestamp | |
| completedAt | timestamp | |
| platformBreakdown | jsonb | `{ ChatGPT: { checks, cited, rate }, ... }` |

### `geoRankings` ([schema.ts:343](shared/schema.ts#L343))
**The critical table.** One row per `(prompt, platform)` AI query. Every citation number downstream is derived from these rows.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| articleId | varchar FK → articles.id (cascade) | nullable — article-scoped checks |
| brandPromptId | varchar FK → brandPrompts.id (set null) | nullable — brand-scoped checks |
| runId | varchar FK → citationRuns.id (set null) | |
| aiPlatform | text NOT NULL | ChatGPT/Claude/Gemini/Perplexity/DeepSeek/Grok/etc. |
| prompt | text NOT NULL | the question asked |
| rank | int | position if cited (1 = first mention), null otherwise |
| isCited | int NOT NULL | 0/1 |
| citationContext | text | `"Cited\n\n\|\|\| RAW_RESPONSE \|\|\|\n{full response}"` — UI splits on delimiter |
| citingOutletUrl | text | domain the AI cited alongside brand (powers GEO Opportunities buckets) |
| citingOutletName | text | |
| sentiment | text | positive/neutral/negative |
| sentimentScore | numeric(3,2) | −1.0 to 1.0 |
| checkedAt | timestamp | |
| metadata | jsonb | |

### `visibilityProgress` ([schema.ts:296](shared/schema.ts#L296))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| engineId | text NOT NULL | chatgpt/claude/perplexity/gemini/grok/... |
| stepId | text NOT NULL | checklist step id |
| completedAt | timestamp | |

UNIQUE on `(brandId, engineId, stepId)` — toggle = insert/delete.

---

## Phase 2 analytics (mostly derived from Phase 1 via fallbacks)

### `brandVisibilitySnapshots` ([schema.ts:370](shared/schema.ts#L370))
Not actively populated. Placeholder for historical snapshotting.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| aiPlatform | text NOT NULL | |
| mentionCount | int | |
| citationCount | int | |
| shareOfVoice | numeric(5,2) | |
| visibilityScore | int | 0–100 |
| sentimentPositive/Neutral/Negative | int | |
| avgSentimentScore | numeric(3,2) | |
| snapshotDate | timestamp | |

### `promptPortfolio` ([schema.ts:691](shared/schema.ts#L691))
Phase 2's "rich prompts" table with funnel/category. Falls back to `brandPrompts` + `geoRankings` if empty.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| prompt | text NOT NULL | |
| category | text NOT NULL | |
| funnelStage | text NOT NULL | TOFU/MOFU/BOFU |
| competitorSet | text[] | |
| region | text | default `"global"` |
| aiPlatform | text NOT NULL | |
| isBrandCited | int | 0/1 |
| citationPosition | int | |
| shareOfAnswer | numeric(5,2) | |
| sentiment | text | |
| answerVolatility | int | 0–100 |
| consensusScore | int | 0–100 |
| lastChecked | timestamp | |
| checkedHistory | jsonb | time-series |
| createdAt | timestamp | |
| metadata | jsonb | |

### `citationQuality` ([schema.ts:717](shared/schema.ts#L717))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| articleId | varchar FK → articles.id (set null) | |
| aiPlatform | text NOT NULL | |
| prompt | text | |
| citationUrl | text | |
| authorityScore | int | 0–100 |
| relevanceScore | int | 0–100 |
| recencyScore | int | 0–100 |
| positionScore | int | 0–100, derived from rank |
| isPrimaryCitation | int | 0/1 — true if rank ≤ 3 |
| totalQualityScore | int | 0–100 |
| sourceType | text | community/reference/video/web |
| competingCitations | text[] | other URLs AI mentioned in same answer |
| scoredAt | timestamp | |

### `brandHallucinations` ([schema.ts:741](shared/schema.ts#L741))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| aiPlatform | text NOT NULL | |
| prompt | text NOT NULL | |
| claimedStatement | text NOT NULL | what AI said |
| actualFact | text | what's true |
| hallucinationType | text NOT NULL | |
| severity | text NOT NULL | `low/medium/high` |
| category | text | |
| isResolved | int | 0/1 |
| remediationSteps | text[] | |
| remediationStatus | text | default `"pending"` |
| detectedAt, resolvedAt | timestamp | |
| verifiedBy | text | |

### `brandFactSheet` ([schema.ts:765](shared/schema.ts#L765))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| factCategory | text NOT NULL | founders/funding/HQ/products/... |
| factKey | text NOT NULL | |
| factValue | text NOT NULL | |
| sourceUrl | text | |
| lastVerified | timestamp | stamped on every edit — not a real verification |
| isActive | int | 0/1 |
| createdAt, updatedAt | timestamp | |

### `metricsHistory` ([schema.ts:784](shared/schema.ts#L784))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| metricType | text NOT NULL | citation_rate/visibility_score/SOV/... |
| metricValue | numeric(10,2) NOT NULL | |
| metricDetails | jsonb | |
| snapshotDate | timestamp | |

### `alertSettings` ([schema.ts:798](shared/schema.ts#L798))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| alertType | text NOT NULL | |
| isEnabled | int | 0/1 |
| threshold | numeric(10,2) | |
| emailEnabled | int | 0/1 |
| emailAddress | text | |
| slackEnabled | int | 0/1 |
| slackWebhookUrl | text | |
| lastTriggered | timestamp | |
| createdAt | timestamp | |

### `alertHistory` ([schema.ts:817](shared/schema.ts#L817))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| alertSettingId | varchar FK → alertSettings.id (cascade) | |
| brandId | varchar FK → brands.id (cascade) | |
| alertType | text NOT NULL | |
| message | text NOT NULL | |
| details | jsonb | |
| sentVia | text NOT NULL | email/slack |
| sentAt | timestamp | |

### `aiSources` ([schema.ts:833](shared/schema.ts#L833))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| aiPlatform | text NOT NULL | |
| sourceUrl | text NOT NULL | |
| sourceDomain | text NOT NULL | |
| sourceName | text | |
| sourceType | text NOT NULL | community/reference/video/web |
| prompt | text | |
| citationContext | text | |
| authorityScore | int | fallback formula: `min(100, occurrenceCount * 10)` |
| isBrandMentioned | int | 0/1 |
| sentiment | text | |
| discoveredAt, lastSeenAt | timestamp | |
| occurrenceCount | int | default 1 |

### `aiTrafficSessions` ([schema.ts:857](shared/schema.ts#L857))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| articleId | varchar FK → articles.id (set null) | |
| aiPlatform | text NOT NULL | |
| referrerUrl | text | |
| landingPage | text NOT NULL | |
| userAgent | text | |
| sessionDuration | int | seconds |
| pageViews | int | |
| bounced | int | 0/1 |
| converted | int | 0/1 — drives conversion rate |
| conversionType | text | |
| conversionValue | numeric(10,2) | |
| country, device | text | |
| createdAt | timestamp | |

### `promptTestRuns` ([schema.ts:882](shared/schema.ts#L882))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| promptPortfolioId | varchar FK → promptPortfolio.id (set null) | |
| prompt | text NOT NULL | |
| aiPlatform | text NOT NULL | |
| response | text | full AI response |
| isBrandCited | int | 0/1 |
| citationPosition | int | |
| competitorsFound | text[] | |
| sentiment | text | |
| shareOfAnswer | numeric(5,2) | |
| hallucinationDetected | int | 0/1 |
| hallucinationDetails | text | |
| sourcesCited | jsonb | |
| runStatus | text NOT NULL | `pending/running/completed/failed` |
| scheduledAt, completedAt, createdAt | timestamp | |
| error | text | |

---

## Commerce

### `aiCommerceSessions` ([schema.ts:390](shared/schema.ts#L390))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| articleId | varchar FK → articles.id (cascade) | |
| brandId | varchar FK → brands.id (cascade) | |
| aiPlatform | text NOT NULL | |
| sessionId | text | |
| userQuery | text | |
| productMentioned | text | |
| clickedThrough | int | 0/1 |
| createdAt | timestamp | |

### `purchaseEvents` ([schema.ts:407](shared/schema.ts#L407))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| commerceSessionId | varchar FK → aiCommerceSessions.id (set null) | |
| articleId | varchar FK → articles.id (set null) | |
| brandId | varchar FK → brands.id (cascade) | |
| aiPlatform | text NOT NULL | |
| ecommercePlatform | text NOT NULL | |
| orderId | text | |
| revenue | numeric(10,2) NOT NULL | |
| currency | text NOT NULL | default `"USD"` |
| productName | text | |
| quantity | int | |
| customerEmail | text | |
| purchasedAt | timestamp | |
| webhookData | jsonb | raw payload |

---

## Publication ecosystem (placeholder)

### `publicationReferences` ([schema.ts:429](shared/schema.ts#L429))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| outletName, outletDomain, outletUrl | text | |
| industry | text | |
| aiPlatform | text NOT NULL | |
| articleId | varchar FK → articles.id (set null) | |
| citationCount | int | |
| lastSeenAt | timestamp | |

### `publicationMetrics` ([schema.ts:442](shared/schema.ts#L442))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| outletName, outletDomain, industry | text NOT NULL | |
| totalCitations | int | |
| aiPlatformBreakdown | jsonb | |
| authorityScore | numeric(5,2) NOT NULL | |
| trendDirection | text | `rising/stable/falling` |
| lastUpdated | timestamp | |

---

## Competitors

### `competitors` ([schema.ts:513](shared/schema.ts#L513))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| name | text NOT NULL | |
| domain | text NOT NULL | |
| industry | text | |
| description | text | |
| createdAt | timestamp | |

### `competitorCitationSnapshots` ([schema.ts:527](shared/schema.ts#L527))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| competitorId | varchar FK → competitors.id (cascade) NOT NULL | |
| aiPlatform | text NOT NULL | |
| citationCount | int | hand-entered |
| snapshotDate | timestamp | |

---

## GEO Tools

### `listicles` ([schema.ts:556](shared/schema.ts#L556))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| title, url | text NOT NULL | |
| sourcePublication | text | |
| listPosition | int | your rank if included |
| totalListItems | int | |
| isIncluded | int | 0/1 |
| competitorsMentioned | text[] | |
| keyword | text | |
| searchVolume | int | |
| domainAuthority | int | |
| lastChecked | timestamp | |
| createdAt | timestamp | |

### `wikipediaMentions` ([schema.ts:579](shared/schema.ts#L579))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| pageTitle, pageUrl | text NOT NULL | |
| mentionContext | text | |
| mentionType | text | direct/reference/citation/related |
| sectionName | text | |
| isActive | int | 0/1 |
| lastVerified | timestamp | |
| createdAt | timestamp | |

### `bofuContent` ([schema.ts:598](shared/schema.ts#L598))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| contentType | text NOT NULL | comparison/alternative/vs-page |
| title | text NOT NULL | |
| content | text NOT NULL | markdown |
| primaryKeyword | text | |
| comparedWith | text[] | competitor names |
| targetIntent | text | |
| status | text | default `"draft"` |
| aiScore | int | |
| createdAt, updatedAt | timestamp | |

### `faqItems` ([schema.ts:619](shared/schema.ts#L619))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| articleId | varchar FK → articles.id (set null) | |
| question | text NOT NULL | |
| answer | text NOT NULL | |
| category | text | |
| searchVolume | int | |
| aiSurfaceScore | int | returned by OpenAI, never re-validated |
| isOptimized | int | 0/1 |
| optimizationTips | text[] | |
| createdAt, updatedAt | timestamp | |

### `brandMentions` ([schema.ts:640](shared/schema.ts#L640))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| platform | text NOT NULL | |
| sourceUrl | text NOT NULL | |
| sourceTitle | text | |
| mentionContext | text | |
| sentiment | text | |
| sentimentScore | numeric(3,2) | |
| engagementScore | int | |
| authorUsername | text | |
| isVerified | int | 0/1 |
| mentionedAt | timestamp | |
| discoveredAt | timestamp | |

---

## Agents & outreach

### `agentTasks` ([schema.ts:910](shared/schema.ts#L910))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| taskType | text NOT NULL | content_generation/outreach/prompt_test/source_analysis/hallucination_remediation/seo_update |
| taskTitle | text NOT NULL | |
| taskDescription | text | |
| priority | text NOT NULL | low/medium/high/urgent |
| status | text NOT NULL | queued/in_progress/completed/failed/cancelled |
| assignedTo | text | `"agent"` or userId |
| triggeredBy | text NOT NULL | automation_rule/manual/schedule/alert |
| automationRuleId | varchar | soft FK |
| inputData | jsonb | |
| outputData | jsonb | OpenAI response saved here |
| aiModelUsed | text | |
| tokensUsed | int | from `response.usage.total_tokens` |
| estimatedCredits, actualCredits | numeric(10,4) | |
| scheduledFor, startedAt, completedAt | timestamp | |
| error | text | |
| retryCount | int | |
| maxRetries | int | default 3 |
| createdAt, updatedAt | timestamp | |

### `outreachCampaigns` ([schema.ts:942](shared/schema.ts#L942))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| campaignName | text NOT NULL | |
| campaignType | text NOT NULL | guest_post/PR_pitch/... |
| targetPublicationId | varchar | soft FK to publicationTargets |
| targetDomain | text NOT NULL | |
| targetContactEmail, targetContactName | text | |
| status | text NOT NULL | default `"draft"` |
| emailSubject, emailBody | text | |
| pitchAngle, proposedTopic | text | |
| linkedArticleId | varchar FK → articles.id (set null) | |
| authorityScore | int | |
| expectedImpact | text | |
| aiGeneratedDraft | int | 0/1 |
| sentAt, lastFollowUpAt, responseReceivedAt | timestamp | |
| followUpCount | int | |
| responseNotes | text | |
| resultUrl | text | link to published guest post |
| createdAt, updatedAt | timestamp | |

### `publicationTargets` ([schema.ts:976](shared/schema.ts#L976))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| publicationName | text NOT NULL | |
| domain | text NOT NULL | |
| category | text NOT NULL | |
| industry | text | |
| domainAuthority | int | |
| monthlyTraffic | text | |
| acceptsGuestPosts, acceptsPRPitches | int | 0/1 |
| relevanceScore | int | |
| contactName, contactEmail, contactRole, contactLinkedIn, contactTwitter | text | |
| submissionUrl | text | |
| editorialGuidelines | text | |
| pitchNotes | text | |
| previousOutreach | int | count of prior pitches |
| lastContactedAt | timestamp | |
| status | text NOT NULL | default `"discovered"` |
| discoveredBy | text NOT NULL | default `"ai"` |
| discoveredAt, updatedAt | timestamp | |

### `outreachEmails` ([schema.ts:1010](shared/schema.ts#L1010))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| campaignId | varchar FK → outreachCampaigns.id (cascade) | |
| publicationTargetId | varchar FK → publicationTargets.id (set null) | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| recipientEmail | text NOT NULL | |
| recipientName | text | |
| subject | text NOT NULL | |
| body | text NOT NULL | |
| emailType | text NOT NULL | initial/follow_up/response |
| status | text NOT NULL | default `"draft"` — `Math.random() > 0.15` flips to `"sent"` |
| scheduledFor, sentAt, openedAt, clickedAt, repliedAt | timestamp | |
| openCount, clickCount | int | |
| replyContent | text | |
| error | text | |
| trackingId | text | |
| createdAt | timestamp | |

### `automationRules` ([schema.ts:1040](shared/schema.ts#L1040))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| ruleName | text NOT NULL | |
| ruleDescription | text | |
| triggerType | text NOT NULL | citation_drop/new_hallucination/schedule/... |
| triggerConditions | jsonb NOT NULL | |
| actionType | text NOT NULL | create_agent_task/send_email/post_content/... |
| actionConfig | jsonb NOT NULL | |
| isEnabled | int | 0/1 |
| priority | int | default 50 |
| cooldownMinutes | int | default 60 |
| maxExecutionsPerDay | int | default 10 |
| executionCount | int | **never auto-increments — no scheduler** |
| lastTriggeredAt, lastExecutedAt | timestamp | |
| createdAt, updatedAt | timestamp | |

### `automationExecutions` ([schema.ts:1066](shared/schema.ts#L1066))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| automationRuleId | varchar FK → automationRules.id (cascade) | |
| brandId | varchar FK → brands.id (cascade) | |
| agentTaskId | varchar FK → agentTasks.id (set null) | |
| triggerData | jsonb | |
| executionStatus | text NOT NULL | default `"running"` |
| resultSummary | text | |
| errorMessage | text | |
| startedAt, completedAt | timestamp | |

---

## Community

### `communityPosts` ([schema.ts:1246](shared/schema.ts#L1246))

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| brandId | varchar FK → brands.id (cascade) NOT NULL | |
| platform | text NOT NULL | Reddit/Quora/Slack/Discord/... |
| groupName | text NOT NULL | subreddit/space name |
| groupUrl | text | |
| title | text | |
| content | text NOT NULL | AI-generated draft |
| postUrl | text | filled after user manually posts |
| status | text NOT NULL | draft/posted |
| postType | text | answer/post/comment |
| keywords | text[] | |
| generatedByAi | int | 0/1 |
| createdAt, postedAt | timestamp | |

---

## Legacy (unused in current UI)

### `citations` ([schema.ts:67](shared/schema.ts#L67))
Predates `geoRankings`. Kept for old dashboard queries; new code uses `geoRankings`.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users.id (cascade) | |
| source, url, platform | text | |
| keywords | text[] | |
| timestamp | timestamp | |
| metadata | jsonb | |

### `analytics` ([schema.ts:82](shared/schema.ts#L82))
Single global row. Legacy.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| totalCitations | int | |
| weeklyGrowth | numeric(5,2) | |
| avgPosition | numeric(5,2) | |
| monthlyTraffic | int | |
| updatedAt | timestamp | |

---

---

# Feature → Tables cross-reference

Each feature listed with the tables it **reads** (R), **writes** (W), or uses as **fallback** (F).

## Phase 1

| # | Feature | Tables touched |
|---|---|---|
| 1 | Brand creation (autofill) | W: `brands`. R: `users` (tier check). |
| 2 | AI Visibility checklist | W: `visibilityProgress`, `users.visibilityGuideVisitedAt`. R: `brands`. |
| 3 | AI Keyword Research | W: `keywordResearch`. R: `brands`, `competitors`. |
| 4 | Content Generation + Humanizer | W: `contentGenerationJobs`, `articles`, `contentDrafts`, `users.articlesUsedThisMonth`. R: `brands`. |
| 5 | Auto-Improve | W: new `articles` row (with `seoData.improvedFrom`). R: `articles`. |
| 6 | Brand Prompts generation | W: `promptGenerations`, `brandPrompts`. R: `brands`, `articles` (last 10 for context). |
| 7 | **Citation Check (core)** | W: `citationRuns`, `geoRankings` (one per prompt×platform). R: `brandPrompts`, `brands` (for name variants). |
| 8 | Content Distribution | W: `distributions`. R: `articles`, `users.bufferAccessToken`. |
| 9 | Dashboard / Onboarding | R: `brands`, `articles`, `brandPrompts`, `geoRankings`, `citationRuns`, `users.visibilityGuideVisitedAt`. |
| 10 | Scheduler (cron) | Same as Citation Check. Updates `brands.lastAutoCitationAt`. |
| 11 | Crawler check | No DB — fetches `robots.txt` live. |

## Phase 2

| # | Feature | Tables touched |
|---|---|---|
| 12 | GEO Rankings | R: `geoRankings` + `articles`. |
| 13 | GEO Analytics | R: `geoRankings`, `brands`, `competitors`, `competitorCitationSnapshots`. |
| 14 | GEO Opportunities | R: `geoRankings` (filtered to `isCited=1`, uses `citingOutletUrl`). |
| 15 | AI Intelligence — Share of Answer | R: `promptPortfolio`. F: `brandPrompts` + `geoRankings` if empty. |
| 16 | AI Intelligence — Citation Quality | R: `citationQuality`. F: `geoRankings.rank` if empty. |
| 17 | AI Intelligence — Hallucinations | R/W: `brandHallucinations`, `brandFactSheet`. |
| 18 | AI Traffic | R: `aiTrafficSessions`, `aiSources`. F: `geoRankings` group-by-domain if `aiSources` empty. |
| 19 | Revenue Analytics | R: `purchaseEvents`, `aiCommerceSessions`. |
| 20 | Client Reports | R: `geoRankings`, `brandPrompts`, `promptPortfolio`, `articles`, `competitors`. |
| 21 | GEO Signals — 7-signal | No DB — pure text heuristic. |
| 22 | GEO Signals — Chunk Engineer | No DB. |
| 23 | GEO Signals — Schema Audit | No DB (and not real — `Math.random()`). |
| 24 | GEO Signals — Pipeline Sim | No DB. |
| 25 | GEO Tools — Listicles | R/W: `listicles`. |
| 25 | GEO Tools — Wikipedia | R/W: `wikipediaMentions`. |
| 25 | GEO Tools — BOFU | R/W: `bofuContent`. |
| 25 | GEO Tools — Brand Mentions | R/W: `brandMentions`. |
| 26 | FAQ Manager | R/W: `faqItems`. R: `brands`. |
| 27 | Community Engagement | R/W: `communityPosts`. |
| 28 | Outreach | R/W: `outreachCampaigns`, `publicationTargets`, `outreachEmails`. |
| 29 | Competitors | R/W: `competitors`, `competitorCitationSnapshots`. |
| 30 | Brand Fact Sheet | R/W: `brandFactSheet`. |
| 31 | Agent Dashboard — Tasks | R/W: `agentTasks`. |
| 32 | Automation Rules | R/W: `automationRules`, `automationExecutions`. ⚠️ no worker evaluates them. |
| 33 | Publication Intelligence | R: `publicationReferences`, `publicationMetrics`. ⚠️ never populated. |
| 34 | Analytics Integrations | localStorage only — no DB. |

---

# Key cross-table insights

1. **`geoRankings` is the keystone.** Features 7, 9, 12–20 all derive from it (directly or via fallback). Break it and most dashboards go dark.

2. **Phase 2 tables with Phase 1 fallbacks** — these are the ones you can trust to show data even if the Phase 2 pipeline never runs:
   - `promptPortfolio` ← falls back to `brandPrompts` + `geoRankings`
   - `citationQuality` ← falls back to `geoRankings.rank`
   - `aiSources` ← falls back to `geoRankings` grouped by `citingOutletUrl` domain

3. **Tables never populated by any automated code path:**
   - `brandVisibilitySnapshots` (no snapshot job)
   - `metricsHistory` (no snapshot job)
   - `publicationReferences` / `publicationMetrics` (no ingestion)
   - `promptTestRuns` (agent tasks don't write here)
   - `alertSettings` / `alertHistory` (CRUD only, no evaluator)
   - `automationRules` / `automationExecutions` (no scheduler)
   - `aiCommerceSessions` (no tagging pipeline)

4. **Tables fed only by mocked/fake writes:**
   - `outreachEmails.status = "sent"` via `Math.random() > 0.15` (no SMTP)
   - `purchaseEvents` via webhooks with no HMAC verification

5. **Cascade blast radius if you delete a brand:** ~28 tables lose rows. Delete cascades flow from `brands.id` down through `articles` → `distributions` / `geoRankings` / `keywordResearch`, plus all the brand-scoped analytics tables.

6. **Orphan-safe FKs (set-null on cascade)** so you can delete without breaking history:
   - `geoRankings.articleId`, `geoRankings.brandPromptId`, `geoRankings.runId`
   - `keywordResearch.articleId`
   - `contentGenerationJobs.articleId`, `contentGenerationJobs.brandId`
   - `outreachCampaigns.linkedArticleId`
   - `outreachEmails.publicationTargetId`

---

---

# Full backend reference — AI prompts + HTTP requests

Exact prompts, model parameters, and external HTTP calls for every feature. Quoted verbatim from source files. Use this as the technical bible for audits, rewrites, and cost estimates.

## Global configuration

### Environment variables required

| Var | Required for | What it does |
|---|---|---|
| `OPENAI_API_KEY` | All OpenAI direct calls | Brand autofill, keyword research, content generation, humanizer, ChatGPT citation checks, brand prompts, sentiment, FAQ, listicles, BOFU, community, agent tasks |
| `OPENROUTER_API_KEY` | Claude / Gemini / Perplexity / DeepSeek citation checks | Routed via OpenRouter. Missing → those 4 platforms save `isCited: 0` + error message |
| `BUFFER_ENCRYPTION_KEY` | Content distribution → Buffer publishing | Required when users connect Buffer — encrypts their pasted access tokens at rest. Distribute works without Buffer set up; users just won't see the "Post to Buffer" option. |
| `WEEKLY_MAX_BRANDS_PER_USER` | Scheduler | Per-user weekly cap on auto-citation runs (default 3) |

### OpenAI client setup

Two clients, same SDK (`openai` npm package):

```typescript
// Direct OpenAI (for ChatGPT + all GPT-4o-mini utility calls)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,     // 45s per call
  maxRetries: 1,       // One automatic retry on transient failure
});

// OpenRouter (for Claude, Gemini, Perplexity, DeepSeek citation checks)
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 45_000,
  maxRetries: 1,
});
```

### `MODELS` constant (server/lib/modelConfig.ts)

```typescript
export const MODELS = {
  // Brand setup
  brandAutofill: "gpt-4o-mini",

  // Keyword research
  keywordResearch: "gpt-4o-mini",
  keywordSuggestions: "gpt-4o-mini",
  popularTopics: "gpt-4o-mini",

  // Content generation + humanization
  contentGeneration: "gpt-4o-mini",
  contentHumanize: "gpt-4o-mini",
  contentAnalyze: "gpt-4o-mini",

  // Brand prompt generation
  brandPromptGeneration: "gpt-4o-mini",

  // Citation platform models
  citationChatGPT: "gpt-4o-mini",              // Direct OpenAI
  citationClaude: "anthropic/claude-haiku-4.5",// Via OpenRouter
  citationGemini: "google/gemini-2.5-flash-lite",
  citationPerplexity: "perplexity/sonar",
  citationDeepSeek: "deepseek/deepseek-v3.2",

  // Distribution
  distribution: "gpt-4o-mini",

  // Catch-all
  misc: "gpt-4o-mini",
};

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
```

### Cost floor

Every AI call is `gpt-4o-mini` (cheap) except OpenRouter platform checks. Typical full citation run (50 calls) ≈ $0.15–$0.30.

### Global rate limit

```typescript
const aiLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 AI-heavy endpoint calls per minute per user
  keyGenerator: aiRateKey,  // User ID if authed, else IP
  message: { success: false, error: "Too many requests. Please wait a moment before trying again." }
});
```

Applied to: content generation, keyword research, citation runs, distribution, brand autofill, FAQ generate, BOFU generate, listicle discovery, community generate, agent task execute.

### Concurrency controls

| Where | Setting |
|---|---|
| Citation check worker pool | `CONCURRENCY = 5` ([citationChecker.ts:294](server/citationChecker.ts#L294)) |
| Content generation worker poll | `POLL_INTERVAL_MS = 5_000` |
| Stuck-job recovery | After 10 minutes of `in_progress` with no update, job marked failed |

---

## Feature 1 — Brand creation (autofill)

### HTTP fetch (website content)

```typescript
// server/lib/safeFetch.ts + routes.ts:2836
const { status, text, contentType } = await safeFetchText(url, {
  maxBytes: 2 * 1024 * 1024,   // 2 MB
  timeoutMs: 10_000,           // 10 seconds
  headers: { 'User-Agent': 'VentureCiteBot/1.0' }
});
```

**SSRF protections** (layered):
1. **URL parse** — must be HTTP/HTTPS, rejects `file://`, `ftp://`, etc.
2. **Hostname check** — rejects `localhost`, `ip6-localhost`, `ip6-loopback` literal strings.
3. **DNS lookup** — resolves hostname to IPs, validates each against private ranges:
   ```typescript
   const PRIVATE_V4_RANGES = [
     [ip4("10.0.0.0"),      ip4("10.255.255.255")],       // RFC 1918
     [ip4("172.16.0.0"),    ip4("172.31.255.255")],       // RFC 1918
     [ip4("192.168.0.0"),   ip4("192.168.255.255")],      // RFC 1918
     [ip4("127.0.0.0"),     ip4("127.255.255.255")],      // Loopback
     [ip4("169.254.0.0"),   ip4("169.254.255.255")],      // Link-local + AWS EC2 metadata
     [ip4("0.0.0.0"),       ip4("0.255.255.255")],
     [ip4("100.64.0.0"),    ip4("100.127.255.255")],      // CGNAT
   ];
   // IPv6 equivalents also checked (::1, fc00::/7, fe80::/10, etc.)
   ```
4. **Follow redirects** up to 3 hops (each hop re-validated).
5. **Abort** on timeout or byte limit.

### OpenAI call

```typescript
// routes.ts:2861-2888
await openai.chat.completions.create({
  model: MODELS.brandAutofill,                // "gpt-4o-mini"
  response_format: { type: "json_object" },
  temperature: 0.3,
  messages: [
    {
      role: "system",
      content: `You are an expert brand analyst. Given a company's website content, extract brand information and return a JSON object with these fields:
- name: The brand/product name (short)
- companyName: The full legal/company name
- industry: The primary industry (e.g., "Technology", "Healthcare", "Finance")
- description: A 2-3 sentence description of what the company does
- tone: One of: "professional", "casual", "friendly", "formal", "conversational", "authoritative"
- targetAudience: Who they sell to (e.g., "B2B SaaS companies", "small business owners")
- products: An array of main products/services (e.g., ["Product A", "Service B"])
- keyValues: An array of core brand values (e.g., ["Innovation", "Trust"])
- uniqueSellingPoints: An array of what makes them unique (e.g., ["AI-powered", "24/7 support"])
- brandVoice: A brief description of their communication style
- nameVariations: An array of common name variations for tracking (e.g., ["stripe", "stripe inc", "stripe payments"])

Be specific and accurate based on the content. If you can't determine something, make a reasonable inference from the domain/industry.`
    },
    {
      role: "user",
      content: `Website URL: ${url}\n\nWebsite content:\n${pageContent}`  // pageContent truncated to 8,000 chars
    }
  ],
}, { signal: AbortSignal.timeout(25_000) });  // 25s override
```

**Response parsing:** `safeParseJson()` strips markdown fences, extracts first JSON object. Sets `analysisQuality: "full"` if all expected keys present, `"partial"` otherwise.

---

## Feature 3 — Keyword research

### OpenAI call

```typescript
// routes.ts:1570-1620
await openai.chat.completions.create({
  model: MODELS.keywordResearch,              // "gpt-4o-mini"
  response_format: { type: "json_object" },
  temperature: 0.7,
  max_tokens: 4000,
  messages: [
    {
      role: "system",
      content: `You are an expert keyword researcher specializing in AI search optimization (GEO - Generative Engine Optimization). Your goal is to find keywords that will help brands get cited by AI search engines like ChatGPT, Claude, Perplexity, and Google AI.

Return a JSON object of the shape:
{
  "keywords": [
    {
      "keyword": "primary keyword phrase",
      "searchVolume": 1000-50000,
      "difficulty": 1-100,
      "opportunityScore": 1-100,
      "aiCitationPotential": 1-100,
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "category": "topic category",
      "competitorGap": 0-100,
      "suggestedContentType": "article" | "guide" | "comparison" | "how-to" | "listicle",
      "relatedKeywords": ["related term 1", "related term 2"]
    }
  ]
}

Focus on:
1. Questions AI assistants commonly answer
2. Comparison queries ("X vs Y")
3. "Best of" and recommendation queries
4. How-to and educational content
5. Industry-specific expertise queries`
    },
    {
      role: "user",
      content: `Discover 12-15 high-opportunity keywords for this brand:

Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "Not specified"}
Products/Services: ${brand.products?.join(", ") || "Not specified"}
Target Audience: ${brand.targetAudience || "Not specified"}
${competitorContext}

Find keywords that would help this brand get cited by AI search engines. Prioritize queries where creating authoritative content could establish the brand as a trusted source.`
    }
  ],
});
```

**Where `competitorContext` comes from:** `storage.getCompetitors(brandId)` — joined as a comma-separated string: `"Competitors: HubSpot, Salesforce, Pipedrive"`.

---

## Feature 4 — Content generation + humanizer

### Main generation call

```typescript
// contentGenerationWorker.ts:154-180
await openai.chat.completions.create({
  model: MODELS.contentGeneration,            // "gpt-4o-mini"
  max_tokens: 4000,
  // Note: temperature defaults to 1.0 (not explicitly set)
  messages: [
    {
      role: "system",
      content: `You are an expert content strategist specializing in GEO (Generative Engine Optimization). Create authoritative, well-structured markdown content that AI platforms like ChatGPT, Claude, and Perplexity would cite as a reliable source. Always include: clear intro, multiple sections with H2/H3 headings, practical examples, FAQ with 4-6 questions, strong conclusion.`
    },
    {
      role: "user",
      content: `Write a ${promptType} about "${keywords}" for the ${industry} industry.${brandContext}${audienceContext}${styleDirective}

Use markdown (# title, ## sections, ### subsections). Include an FAQ section.`
    }
  ],
});
```

**Template variables:**
- `promptType` = contentType (article/guide/comparison/how-to/listicle)
- `brandContext` = `"\n\nBrand: ${brand.companyName}\nDescription: ${brand.description}\nTone: ${brand.tone}\nAudience: ${brand.targetAudience}\nProducts: ${brand.products.join(', ')}\nUnique selling points: ${brand.uniqueSellingPoints.join(', ')}"` — blank if no brand selected
- `audienceContext` = `"\n\nTarget customers: ${targetCustomers}\nGeography: ${geography}"` if provided
- `styleDirective` = `"\n\nStyle: B2B professional"` or `"\n\nStyle: B2C consumer-friendly"`

### Humanizer pass 1 — seasoned journalist

```typescript
// contentGenerationWorker.ts:49-100 (pass index 0)
await openai.chat.completions.create({
  model: MODELS.contentHumanize,              // "gpt-4o-mini"
  temperature: 1.0,                           // Maximum variety
  max_tokens: perCallMaxTokens,               // min(4500, max(500, ceil(inputTokens * 1.5)))
  messages: [
    {
      role: "system",
      content: `You are a seasoned ${industry} journalist. Rewrite AI-sounding text so it reads as if a human wrote it: vary sentence lengths aggressively, use contractions, drop first-person observations, avoid AI clichés ("landscape", "leverage", "delve", "crucial", "comprehensive", "In today's...", "In conclusion"). Return ONLY the rewritten markdown content.`
    },
    {
      role: "user",
      content: `Rewrite this to sound naturally human, keeping all info + markdown:\n\n${currentContent}`
    }
  ],
});
```

### Humanizer pass 2 — copy editor

```typescript
// Same call shape, pass index 1 — only system prompt changes:
{
  role: "system",
  content: `You are a meticulous copy editor. Replace any remaining AI-sounding phrases with natural alternatives, ensure contractions, vary sentence starts, and break any monotonous rhythm. Return ONLY improved markdown content.`
}
```

### Humanizer pass 3 — final polish

```typescript
{
  role: "system",
  content: `Final pass: flag anything that sounds "written by committee" and make it sound like one person talking. Ensure varied sentence structure, no AI clichés, and end on a forward-looking thought. Return ONLY the final markdown content.`
}
```

### Humanizer analyzer (runs after each pass)

```typescript
// contentGenerationWorker.ts:85-108
await openai.chat.completions.create({
  model: MODELS.contentAnalyze,               // "gpt-4o-mini"
  response_format: { type: "json_object" },
  temperature: 0.3,                           // Deterministic
  max_tokens: 600,
  messages: [
    {
      role: "system",
      content: `Strict AI-detection analyst. Return JSON {"score": 0-100, "issues": [...max 5], "strengths": [...max 5]}. Be harsh — most AI-rewritten text scores 40-65.`
    },
    {
      role: "user",
      content: `Analyze strictly:\n\n${currentContent.substring(0, 4000)}`
    }
  ],
});
```

### Humanizer loop logic

```typescript
// contentGenerationWorker.ts:49-127
let bestContent = originalContent;
let bestScore = baselineScore;  // 0 for fresh gen, currentScore for auto-improve

for (let attempt = 0; attempt < 3; attempt++) {
  const rewrite = await rewriteCall(bestContent, passSystemPrompts[attempt]);
  const { score } = await analyzeCall(rewrite);
  
  if (score > bestScore) {
    bestContent = rewrite;
    bestScore = score;
  }
  
  if (bestScore >= 80) break;  // Good enough
}

return { content: bestContent, humanScore: bestScore, attempts: <attemptsRun> };
```

**Token budget formula:**
```typescript
const inputTokens = Math.ceil(content.length / 3.5);  // rough char→token
const perCallMaxTokens = Math.min(4500, Math.max(500, Math.ceil(inputTokens * 1.5)));
```

---

## Feature 6 — Brand prompts generation

```typescript
// lib/promptGenerator.ts:44-85
await openai.chat.completions.create({
  model: MODELS.brandPromptGeneration,        // "gpt-4o-mini"
  response_format: { type: "json_object" },
  max_tokens: 2000,
  messages: [
    {
      role: "system",
      content: `You are a GEO (Generative Engine Optimization) expert. Your job is to generate EXACTLY 10 user questions where the given brand is most likely to be cited if those questions were asked to ChatGPT, Claude, or Gemini.

Rules:
- Mix query types: direct ("best X tools"), comparison ("X vs Y"), how-to, and buyer-intent.
- Each question should be natural — something a real user would type.
- For each question, include a 1-sentence rationale explaining why THIS brand would rank well for it.
- Ground the questions in the brand's industry, products, and published articles.
- Do NOT use the brand name in the questions themselves — users rarely search by brand.

Return JSON: { "prompts": [{ "prompt": "...", "rationale": "..." }, ... 10 items total] }`
    },
    {
      role: "user",
      content: `Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || 'N/A'}
Target audience: ${brand.targetAudience || 'N/A'}
Products/services: ${Array.isArray(brand.products) ? brand.products.join(', ') : 'N/A'}
Unique selling points: ${Array.isArray(brand.uniqueSellingPoints) ? brand.uniqueSellingPoints.join(', ') : 'N/A'}

Published articles:
${articleSummaries.length === 0 ? '(no articles published yet — base prompts on brand profile only)' : articleSummaries.map((a, i) => `${i + 1}. "${a.title}" — keywords: ${a.keywords.join(', ') || 'none'}`).join('\n')}`
    }
  ],
}, { signal: AbortSignal.timeout(45_000) });
```

### Suggestion variant (for scheduler + "Suggest more" button)

System prompt adds an anti-duplication directive:

```
You are a GEO (Generative Engine Optimization) expert. The user already tracks 10 fixed questions weekly — your job is to propose NEW candidate questions that cover different angles, personas, or buying-journey stages.

Rules:
- Each question must be something a real user would type into ChatGPT, Claude, or Gemini.
- Do NOT rephrase any tracked question. Do not make near-duplicates (e.g. "best X for Y" → "top X for Y" is forbidden).
- Cover gaps: different intent (comparison vs. how-to vs. buyer), different personas, or different journey stages (awareness/consideration/decision).
- Do NOT use the brand name in the questions themselves.
- Include a 1-sentence rationale per question explaining the gap it fills.

Return JSON: { "prompts": [{ "prompt": "...", "rationale": "..." }, ... exactly ${howMany} items] }
```

Plus a Jaccard token-similarity filter applied client-side to drop suggestions where ≥60% of tokens overlap with any tracked prompt.

---

## Feature 7 — Citation check

This is the feature with the most external calls. Each "Run Citation Check" button click fires **≥50 AI API calls** (10 prompts × 5 platforms) plus optional judge calls.

### Setup — which client for which platform

```typescript
// citationChecker.ts:184-200
function getClientForPlatform(platform: string) {
  if (platform === "ChatGPT") return { client: openai, model: MODELS.citationChatGPT };
  if (platform === "Claude") return { client: openrouter, model: MODELS.citationClaude };
  if (platform === "Gemini") return { client: openrouter, model: MODELS.citationGemini };
  if (platform === "Perplexity") return { client: openrouter, model: MODELS.citationPerplexity };
  if (platform === "DeepSeek") return { client: openrouter, model: MODELS.citationDeepSeek };
  throw new Error(`Unsupported platform: ${platform}`);
}
```

### ChatGPT call (direct OpenAI)

```typescript
// citationChecker.ts:210-225
await openai.chat.completions.create({
  model: MODELS.citationChatGPT,              // "gpt-4o-mini"
  temperature: 0.7,
  max_tokens: 1500,
  messages: [
    {
      role: "system",
      content: "You are a helpful assistant. Answer the question thoroughly, citing specific sources, brands, companies, or products when relevant."
    },
    {
      role: "user",
      content: prompt  // E.g. "What is the best CRM for a 10-person startup?"
    }
  ],
});
```

### Claude/Gemini/Perplexity/DeepSeek calls (via OpenRouter)

```typescript
// citationChecker.ts:240-260 — same shape, different client + system prompt
await openrouter.chat.completions.create({
  model: <platformModelSlug>,                 // e.g. "anthropic/claude-haiku-4.5"
  temperature: 0.7,
  max_tokens: 1500,
  messages: [
    {
      role: "system",
      content: `You are ${platform}, a helpful AI assistant. You are a helpful assistant. Answer the question thoroughly, citing specific sources, brands, companies, or products when relevant.`
    },
    {
      role: "user",
      content: prompt
    }
  ],
});
```

**If OPENROUTER_API_KEY is missing:** those 4 platforms skip the call entirely and save a `geo_rankings` row with `isCited: 0`, `citationContext: "<platform> check skipped — OPENROUTER_API_KEY not configured"`.

### Citation detection — two-stage (pre-filter + LLM judge)

**Stage A — pre-filter** ([citationChecker.ts:158-160](server/citationChecker.ts#L158)):

Cheap string search. For each variant in `brandNameVariants` (sorted longest-first), check `responseText.toLowerCase().includes(variant.toLowerCase())`. If NO variant matches, return `isCited: false` immediately — skips the paid LLM judge.

**Stage B — LLM judge** ([citationJudge.ts](server/citationJudge.ts)):

```typescript
// Only called if pre-filter matched
await judgeClient.chat.completions.create({
  model: "gpt-4o-mini",
  temperature: 0,                             // Deterministic
  response_format: { type: "json_object" },
  max_tokens: 200,
  messages: [
    {
      role: "system",
      content: `You are a precise citation judge. You decide whether an AI-generated response cites a specific brand/company.

A "citation" means the response explicitly refers to THIS brand — by its name, a known variation, its website/domain, or an unambiguous description. Generic English words that happen to overlap with the brand name do NOT count (e.g., "venture capital" is not a citation of a brand called "Venture PR"). Industry-generic terms (e.g., "PR agency", "CRM software") do NOT count unless the specific brand is named.

Return JSON only, exactly in this shape:
{"cited": boolean, "rank": number | null, "reasoning": "short sentence"}

"rank" is the 1-indexed position of the brand's first mention inside an ordered/numbered list or ranked recommendation in the response. If the brand is mentioned but not inside such a list, return null.`
    },
    {
      role: "system",
      content: `Brand profile:
${profile}

Response text to evaluate:
"""
${truncated}   // Max 8000 chars
"""

Respond with JSON only.`
    }
  ],
});
```

**`profile` template:**
```
Name: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Website: ${brand.website}
Products: ${brand.products.join(', ')}
Name variations: ${brand.nameVariations.join(', ')}
```

### Worker pool execution

```typescript
// citationChecker.ts:294-363
const CONCURRENCY = 5;
const tasks = prompts.flatMap(p => platforms.map(pf => ({ prompt: p, platform: pf })));

const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (tasks.length > 0) {
    const task = tasks.shift();
    if (!task) break;
    await runOne(task);  // The full AI call + detect + DB write
  }
});

await Promise.all(workers);
```

Total wall time: ~2-3 min for 50 tasks.

---

## Feature 8 — Content distribution (multi-platform rewrite)

All 5 platform prompts share the same OpenAI wrapper call; only user message content differs.

### Wrapper call

```typescript
// routes.ts:1957-1990
await openai.chat.completions.create({
  model: MODELS.distribution,                 // "gpt-4o-mini"
  temperature: 0.8,
  max_tokens: 2000,
  messages: [
    {
      role: "system",
      content: `You are a social media content expert who adapts long-form content for specific platforms. Create engaging, platform-native content that drives engagement.`
    },
    {
      role: "user",
      content: platformPrompts[platform]       // See templates below
    }
  ],
});
```

### LinkedIn

```
Convert this article into a compelling LinkedIn post (max 3000 characters). Include:
- A strong hook in the first line to stop scrolling
- Key insights broken into short paragraphs
- Relevant hashtags (5-8)
- A call-to-action or question at the end
- Professional but conversational tone
${brand ? `Brand: ${brand.companyName}` : ''}

Article title: ${article.title}
Content: ${articleContent}
```

### Medium

```
Convert this article into a well-formatted Medium story. Include:
- An engaging title and subtitle
- Clean markdown formatting with headers, bold text, and quotes
- A compelling introduction paragraph
- Key sections maintained from the original
- A strong conclusion
- 3-5 relevant tags at the end (format: Tags: tag1, tag2, tag3)
${brand ? `Brand: ${brand.companyName}` : ''}

Article title: ${article.title}
Content: ${articleContent}
```

### Reddit

```
Convert this article into a Reddit post suitable for industry subreddits. Include:
- A descriptive, non-clickbait title
- A "TL;DR" at the top
- Key points in a readable format
- Genuine, helpful tone (not promotional)
- Discussion questions at the end to encourage engagement
- Suggested subreddits to post in (format: Suggested subreddits: r/sub1, r/sub2)
${brand ? `Brand: ${brand.companyName} (mention naturally, not as promotion)` : ''}

Article title: ${article.title}
Content: ${articleContent}
```

### Quora

```
Convert this article into a comprehensive Quora answer. Include:
- A suggested question to answer
- A direct, authoritative response
- Supporting details and examples
- Conversational yet knowledgeable tone
- A brief mention of credentials/expertise
${brand ? `Brand: ${brand.companyName}` : ''}

Article title: ${article.title}
Content: ${articleContent}
```

`articleContent` truncated to 2000 chars before interpolation.

### Buffer connection (bring-your-own-key)

Users generate an API key in Buffer Settings → API
(https://publish.buffer.com/settings/api) and paste it into the
Connect dialog in the Distribute panel. The server validates the key
by issuing a `{ account { id } }` GraphQL query against
`https://api.buffer.com`, then stores it encrypted (AES-256-GCM via
`server/lib/tokenCipher.ts`) on the user row. Subsequent channel
lookups and post submissions decrypt the key just-in-time. There is
no platform-owned OAuth app and no callback route.

The Buffer v1 REST API (`api.bufferapp.com/1/`) was retired in favor
of the GraphQL endpoint, so all upstream calls go to
`https://api.buffer.com` with `Authorization: Bearer <key>`.

**List connected channels (formerly "profiles"):**
```typescript
// Two queries: account → organizations, then channels per org.
const orgsRes = await bufferGraphQL(token, `{ account { organizations { id } } }`);
for (const org of orgsRes.data.account.organizations) {
  const chRes = await bufferGraphQL(
    token,
    `query GetChannels($input: ChannelsInput!) {
      channels(input: $input) { id name service avatar }
    }`,
    { input: { organizationId: org.id } },
  );
  // Each channel: { id, name, service, avatar }
  // Surfaced to the client as { id, service, formattedService, username, avatar }
  // (formattedService synthesized from service so the existing UI matcher works.)
}
```

**Schedule a post:**
```typescript
const mutation = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id text dueAt } }
      ... on MutationError { message }
    }
  }
`;
await bufferGraphQL(token, mutation, {
  input: {
    channelId,
    text,
    schedulingType: "automatic",
    ...(scheduledAt
      ? { mode: "customScheduled", dueAt: new Date(scheduledAt).toISOString() }
      : { mode: "addToQueue" }),
  },
});
```

Non-2xx, top-level GraphQL `errors[]`, or a `MutationError` payload → 502 to the client with the upstream message.

---

## Feature 11 — Crawler permissions check

### robots.txt fetch

```typescript
// routes.ts:3504-3523 via safeFetchText
const robotsUrl = `https://${domain}/robots.txt`;
const { status, text } = await safeFetchText(robotsUrl, {
  maxBytes: 1 * 1024 * 1024,   // 1 MB
  timeoutMs: 10_000,           // 10 seconds
  headers: { 'User-Agent': 'GEO-Platform-Checker/1.0' },
});
```

Same SSRF layers as brand autofill.

### Parsing (no AI call)

Pure text parsing. Extracts `User-agent: X` blocks, then `Allow:` / `Disallow:` rules within each block. Per AI crawler (GPTBot, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, CCBot, Bytespider, Amazonbot, anthropic-ai, ChatGPT-User, Applebot-Extended, FacebookBot, Meta-ExternalAgent), checks whether `Disallow: /` applies under any matching user-agent block.

---

## Feature 17 — Sentiment analysis (AI Intelligence → Hallucinations / Brand Mentions context)

Used implicitly by several features to score mention sentiment:

```typescript
// routes.ts sentiment endpoint
await openai.chat.completions.create({
  model: MODELS.misc,                         // "gpt-4o-mini"
  response_format: { type: "json_object" },
  max_tokens: 200,
  messages: [
    {
      role: "system",
      content: `You are a sentiment analysis expert. Analyze the sentiment of text mentions about a brand or company.
Return a JSON object with:
- sentiment: "positive", "neutral", or "negative"
- score: a number from -1 (very negative) to +1 (very positive)
- confidence: a number from 0 to 1 indicating confidence
- reasoning: brief explanation of the sentiment

Consider:
- Tone and word choice
- Context of the mention
- Implied recommendations or criticisms
- Comparative statements with competitors`
    },
    {
      role: "user",
      content: `Analyze the sentiment of this brand mention${contextStr ? ` (context: ${contextStr})` : ""}:\n\n"""\n${text}\n"""`
    }
  ],
});
```

---

## Feature 25 — GEO Tools (BOFU + Listicle discovery)

### Listicle discovery

```typescript
// routes.ts listicle-discovery endpoint
await openai.chat.completions.create({
  model: MODELS.misc,
  temperature: 0.7,
  messages: [
    {
      role: "user",
      content: `You are a GEO (Generative Engine Optimization) expert. Identify high-value listicle and "best of" article opportunities for ${brand.name} in the ${brand.industry} industry.

BRAND CONTEXT:
-- Products/Services: ${brandProducts || 'Not specified'}
-- Target Audience: ${brandAudience || 'Not specified'}
-- Brand Values: ${brandValues || 'Not specified'}
-- Competitors: ${competitorNames.join(', ') || 'industry leaders'}

IMPORTANT: Generate a DIVERSE mix of listicle types that will help this brand reach ALL relevant audiences:

1. CONSUMER/LIFESTYLE listicles (B2C): "Best [product] for [use case]", "Top [products] of 2025", "Best [products] for Kids", "Best Budget [products]", "Best [products] for Beginners", etc. Think about real consumer search queries.

2. PROFESSIONAL/INDUSTRY listicles (B2B): "Best [tools/services] for [industry]", "Top [solutions] for Small Business", "Best Enterprise [solutions]", etc.

3. COMPARISON/REVIEW listicles: "[Brand] vs [Competitor]", "Best Alternatives to [Competitor]", "[Product] Reviews & Rankings"

4. NICHE/AUDIENCE-SPECIFIC listicles: target specific demographics, use cases, price points, geographies, or lifestyles relevant to this brand's actual customers.

5. PARTNER/INVESTOR-RELEVANT listicles: "Fastest Growing [industry] Companies", "Most Innovative [industry] Startups", "Top [industry] Companies to Watch"

The goal is to find listicles that:
-- Get cited by AI search engines (ChatGPT, Claude, Perplexity, Google AI)
-- Match how REAL people search for products/services like this brand offers
-- Cover both broad popular searches AND specific niche queries
-- Include lifestyle and consumer angles, not just professional/industry ones

Return a JSON array of 10 listicle opportunities with a good mix of the above types:
[{
  "title": "Suggested listicle title",
  "keyword": "Target search keyword",
  "audienceType": "consumer" | "professional" | "investor" | "partner",
  "searchVolume": estimated monthly search volume (number),
  "domainAuthority": suggested minimum DA to target (number 1-100),
  "strategy": "Specific action steps to get included in this listicle",
  "priorityScore": 1-10 rating based on GEO value and reach
}]

Return ONLY the JSON array, no other text.`
    }
  ],
});
```

### BOFU — Comparison content

```
Create a comprehensive comparison article: "${title}"

Brand: ${brand.name}
Industry: ${brand.industry}
Description: ${brand.description || ''}
Key Products/Services: ${brand.products?.join(', ') || ''}
Unique Selling Points: ${brand.uniqueSellingPoints?.join(', ') || ''}

Create an in-depth, balanced comparison (1500+ words) that:
1. Compares features, pricing, pros/cons objectively
2. Helps readers make an informed decision
3. Is optimized for AI citation (structured with headers, tables, clear conclusions)
4. Includes a FAQ section at the end

Format with markdown headers. Be balanced but highlight genuine strengths of ${brand.name}.
```

### BOFU — Alternatives

```
Create an "Alternatives to ${to}" article that positions ${brand.name} as a top alternative.

Brand: ${brand.name}
Industry: ${brand.industry}

Create a comprehensive alternatives guide (1500+ words) that:
1. Lists 5-7 alternatives (including ${brand.name})
2. Explains why someone might look for alternatives
3. Compares each alternative with pros/cons
4. Positions ${brand.name} favorably but honestly
5. Includes FAQ section for AI indexing

Format with markdown. Each alternative should have clear headers and bullet points.
```

### BOFU — Buying guide

```
Create a transactional buying guide for ${brand.industry}.

Brand: ${brand.name}
Target Keyword: ${keyword || brand.industry + ' guide'}

Create a comprehensive buyer's guide (1500+ words) that:
1. Helps buyers understand what to look for
2. Explains key features and considerations
3. Naturally mentions ${brand.name} as a solution
4. Includes comparison tables and checklists
5. Has a detailed FAQ section

This is bottom-of-funnel content designed to convert and get cited by AI.
```

### Shared call shape

```typescript
await openai.chat.completions.create({
  model: MODELS.misc,
  temperature: 0.7,
  max_tokens: 4000,
  messages: [{ role: "user", content: prompt }]
});
```

---

## Feature 26 — FAQ Manager

```typescript
// routes.ts:4935-4975
const prompt = `You are an FAQ optimization expert for AI search engines. Generate exactly ${faqCount} FAQs for ${brand.name} (${brand.industry}).

Topic focus: ${topic || brand.industry}
Company description: ${brand.description || ''}
Products/Services: ${brand.products?.join(', ') || ''}

Generate FAQs that:
1. Mirror how users ask AI chatbots questions
2. Have clear, concise answers (40-60 words optimal)
3. Include the brand name naturally where relevant
4. Cover common objections and buying considerations

Return JSON array:
[{
  "question": "The question users might ask AI",
  "answer": "Concise, authoritative answer",
  "category": "pricing|features|comparison|support|general",
  "aiSurfaceScore": 1-100 (how likely AI will surface this),
  "optimizationTips": ["tip1", "tip2"]
}]

Return ONLY the JSON array.`;

await openai.chat.completions.create({
  model: MODELS.misc,
  temperature: 0.7,
  messages: [{ role: "user", content: prompt }]
});
```

`faqCount` clamped 1–20 via `Math.max(1, Math.min(20, count))`.

---

## Feature 27 — Community engagement

### Discover communities

```typescript
// routes.ts:7085+
const prompt = `You are a community discovery expert. Find relevant online communities where ${brand.name} customers and prospects hang out.

Brand: ${brand.name}
Industry: ${brand.industry}
${brand.description ? `Description: ${brand.description}` : ''}
Products/services: ${brand.products?.join(', ') || ''}

Return a JSON array of 10-15 community groups with this structure:
[{
  "platform": "reddit" | "quora" | "hackernews" | "forum" | "discord" | "slack",
  "name": "group/subreddit/space name",
  "url": "direct URL to the group",
  "members": "estimated member count string",
  "relevance": "high" | "medium",
  "description": "Why this group is relevant and how to participate",
  "suggestedApproach": "Specific strategy for engaging without being spammy",
  "topicIdeas": ["topic 1", "topic 2", "topic 3"]
}]

Only return the JSON array, no other text.`;

await openai.chat.completions.create({
  model: MODELS.misc,
  response_format: { type: "json_object" },
  temperature: 0.7,
  messages: [{ role: "user", content: prompt }]
});
```

### Generate post (platform-specific)

```typescript
// routes.ts:7102-7135
const platformGuidelines = {
  reddit: "Reddit values authentic, helpful content. Never be overtly promotional. Share genuine expertise. Use the community's language style. Add value first, mention brand naturally only if relevant. Follow subreddit rules.",
  quora: "Quora rewards detailed, expert answers. Cite sources, share personal experience, be thorough. You can mention your brand as a relevant example but the answer should be valuable standalone.",
  hackernews: "Hacker News values technical depth, original insights, and contrarian thinking. Be substantive. Avoid marketing language entirely. Focus on technical merit and data.",
  forum: "Forum posts should be helpful and community-oriented. Build reputation through consistent, valuable contributions. Never spam.",
  discord: "Discord is conversational. Be helpful, concise, and friendly. Share expertise naturally in conversations.",
  slack: "Slack communities value professional, concise contributions. Share actionable insights and resources."
};

const prompt = `You are an expert community marketer. Generate a ${postType || 'post'} for ${platform} in the "${groupName}" group/community.

Brand: ${brandName}
${brandDescription ? `Brand description: ${brandDescription}` : ''}
Topic: ${topic}
Tone: ${tone || 'helpful and authentic'}

Platform guidelines: ${platformGuidelines[platform] || 'Be helpful and authentic.'}

CRITICAL RULES:
- The content must provide genuine value to the community
- Do NOT be overtly promotional or spammy
- Mention the brand naturally only if it adds value to the discussion
- Focus on being helpful, informative, and engaging
- Write like a real community member, not a marketer
- Include specific examples, data points, or actionable advice

Return a JSON object with:
{
  "title": "Post title (if applicable for the platform)",
  "content": "The full post/answer content",
  "hashtags": ["relevant", "hashtags"],
  "tips": ["Posting tip 1", "Posting tip 2"],
  "bestTimeToPost": "Suggested time/day to post for maximum visibility"
}

Only return the JSON object, no other text.`;

await openai.chat.completions.create({
  model: MODELS.misc,
  temperature: 0.7,
  messages: [{ role: "user", content: prompt }]
});
```

---

## Feature 31 — Agent Dashboard tasks

Each task type has its own system prompt. User message is `task.taskDescription` or fallback.

### content_generation

```typescript
await openai.chat.completions.create({
  model: MODELS.misc,
  max_tokens: 2000,
  messages: [
    {
      role: "system",
      content: `You are a GEO content specialist. Generate SEO-optimized content that AI search engines will cite.${brand ? ` Brand context: ${brand.companyName || brand.name}, Industry: ${brand.industry}, Tone: ${brand.tone || 'professional'}` : ''}`
    },
    {
      role: "user",
      content: task.taskDescription || `Generate optimized content for: ${task.taskTitle}`
    }
  ]
});
```

### outreach

```typescript
{
  role: "system",
  content: `You are an expert PR outreach specialist. Create compelling outreach emails for guest posts and citation requests.${brand ? ` Brand: ${brand.companyName || brand.name}, Industry: ${brand.industry}` : ''}`
}
// max_tokens: 1000
```

### source_analysis

```typescript
{
  role: "system",
  content: "You are an AI source intelligence analyst. Analyze which sources AI platforms cite most frequently and why."
}
// max_tokens: 1500
```

### hallucination_remediation

```typescript
{
  role: "system",
  content: `You are a brand accuracy specialist. Help correct AI hallucinations about brands by suggesting content updates and citation strategies.${brand ? ` Brand: ${brand.companyName || brand.name}` : ''}`
}
// max_tokens: 1500
```

### prompt_test

```typescript
{
  role: "system",
  content: "You are testing how AI platforms respond to prompts. Provide analysis of likely AI responses and citation patterns."
}
// max_tokens: 1500
```

### seo_update

Similar to content_generation but task description specifies which article to refresh.

**Token accounting:** `tokensUsed = response.usage?.total_tokens || 0`, saved to `agent_tasks.tokensUsed`. `aiModelUsed` set to resolved model string.

---

## Feature 21-24 — GEO Signals (no AI — pure heuristics)

No external calls. All computation is regex + `.split()` on the pasted text. See Feature 21 section in the main body for the exact formulas.

The one AI call in this cluster: **Chunk optimize** button fires a rewrite:

```typescript
// routes.ts optimize-chunks endpoint
await openai.chat.completions.create({
  model: MODELS.misc,
  messages: [
    {
      role: "system",
      content: `You are an AI-content optimization specialist. Rewrite this content into extractable ~500-token chunks, each with a question-based H2 heading and a direct first-sentence answer. Preserve all facts. Return clean markdown only.`
    },
    {
      role: "user",
      content: `Rewrite for chunk extractability:\n\n${content}`
    }
  ]
});
```

Schema Audit is **fake** — no AI, just:
```typescript
const schemaTypes = ["FAQ", "Article", "HowTo", "BreadcrumbList", "Organization", "Product"];
schemaTypes.map(t => ({ schemaType: t, present: Math.random() > 0.5, ... }))
```

---

## Features with NO AI calls

| Feature | Why |
|---|---|
| GEO Rankings | Read view of `geo_rankings` |
| GEO Analytics | DB aggregation |
| GEO Opportunities | DB aggregation + domain parsing |
| AI Intelligence (Share/Quality) | DB aggregation + Phase 1 fallback |
| AI Intelligence (Hallucinations) | Manual CRUD |
| AI Traffic | DB read |
| Revenue Analytics | DB read + webhook-fed |
| Client Reports | DB aggregation |
| GEO Signals (7-signal, Chunk Analysis, Pipeline Sim) | Text regex |
| GEO Signals (Schema Audit) | `Math.random()` ❌ |
| Competitors | Manual CRUD |
| Brand Fact Sheet | Manual CRUD |
| Automation Rules | CRUD only — no evaluator |
| Publication Intelligence | No page wiring |
| Analytics Integrations | localStorage only |

---

## Response parsing utilities

### `safeParseJson<T>(rawText)` ([server/utils/json.ts](server/utils/json.ts))

1. Strip markdown fences: `raw.replace(/^\s*```json\s*/, "").replace(/\s*```\s*$/, "")`.
2. Find first `{` or `[` → walk forward tracking brace depth → extract balanced JSON substring.
3. `JSON.parse()` with try/catch.
4. On failure, returns null — caller handles missing data gracefully.

Used in every JSON-mode AI call. Necessary because models sometimes wrap output in markdown.

### Token estimator

```typescript
const inputTokens = Math.ceil(text.length / 3.5);  // Char→token ratio
const approxOutputTokens = response.usage?.completion_tokens;  // From API
const totalTokens = response.usage?.total_tokens;
```

---

## Retries + timeouts summary

| Where | Timeout | Retries |
|---|---|---|
| All OpenAI calls (default) | 45s | 1 automatic |
| Brand autofill | 25s override | 1 |
| Brand prompts generation | 45s (explicit AbortSignal) | 1 |
| Website / robots fetch | 10s | 0 (single shot) |
| Buffer API | fetch default (no timeout) | 0 |
| Citation judge | 45s | 0 (non-fatal on fail — reports not-cited) |

Content generation worker handles stuck-job recovery separately: any `content_generation_jobs` row with `status='in_progress'` and `startedAt` older than 10 minutes gets reset to `pending` for re-claim.

---

## Putting it together — cost + runtime for a typical power user

**Fresh user journey (zero data → first citation run):**

1. Create brand (autofill): 1 website fetch + 1 GPT-4o-mini call ≈ $0.001, ~5s
2. Generate keywords: 1 GPT-4o-mini call ≈ $0.003, ~10s
3. Generate article: 1 generation call (4000 tokens) + 3 humanize passes (rewrite+analyze ×3) ≈ $0.05, 60-90s
4. Generate 10 brand prompts: 1 GPT-4o-mini call ≈ $0.002, ~10s
5. Run citation check: 50 AI calls + ~5 judge calls ≈ $0.15–0.30, 2-3min
6. Optionally: distribute to 5 platforms: 5 calls ≈ $0.01, ~30s

**Total per power-user first session: ~$0.20–0.35 in OpenAI spend, ~5 minutes of latency.**

Weekly scheduled run: ~$0.20 per brand × up to 3 brands/user/week (env-capped).

---

That's the complete external-API footprint. Everything else is Postgres + text heuristics.
