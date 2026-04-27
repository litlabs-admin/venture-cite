# VentureCite — Phase 2 Goals & Audit

> Last updated: 2026-04-18
> Status: Pre-implementation — audit complete, fixes pending
> Purpose: Single, self-contained source of truth for every Phase 2 change. Readable end-to-end without opening any other document.

---

## What Phase 2 is for (context)

VentureCite is a Generative Engine Optimization (GEO) platform. Phase 1 shipped the content + citation loop (create brand → generate AI-optimized content → track citations in ChatGPT / Claude / Perplexity / Google AI / Gemini). **Phase 2 is the analytics, intelligence, and growth layer on top of that loop** — the features that turn a user who "has articles" into a user who "knows which articles are winning, where their brand shows up, who cites them, and how to scale the program."

### The 18 Phase 2 features (the nav)

| #   | Nav entry                | Route                     | Primary job                                                                                |
| --- | ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | GEO Rankings             | `/geo-rankings`           | Live citation dashboard — per-platform citation rate, avg rank, recent feed                |
| 2   | GEO Analytics            | `/geo-analytics`          | Executive per-brand summary with AI Visibility Score, Share of Voice, sentiment            |
| 3   | AI Intelligence          | `/ai-intelligence`        | Share-of-Answer, Citation Quality, Hallucination Detection, Prompt Portfolio               |
| 4   | GEO Opportunities        | `/opportunities`          | Unclaimed listicle slots, forum gaps, schema holes, platform coverage misses               |
| 5   | Outreach                 | `/outreach`               | Campaign-based outreach to publications and contacts with opens/clicks/replies             |
| 6   | Community Engagement     | `/community`              | Discover Reddit / Quora / HN threads; AI-draft non-spammy posts for manual publishing      |
| 7   | AI Agent                 | `/agent`                  | Autonomous task queue for content, outreach, source analysis; paired with automation rules |
| 8   | Revenue Analytics        | `/revenue-analytics`      | Track purchases attributed to AI commerce (ChatGPT Buy buttons, Perplexity Shopping)       |
| 9   | Publication Intelligence | `/publications`           | Discover and rank publications likely to be cited by AI engines                            |
| 10  | Competitors              | `/competitors`            | Side-by-side brand vs. competitor citation counts, share of voice, leaderboard             |
| 11  | Crawler Check            | `/crawler-check`          | Verify robots.txt allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.           |
| 12  | GEO Tools                | `/geo-tools`              | Listicle Tracker, Wikipedia Monitor, BOFU generator, FAQ optimizer, Brand Mention Tracker  |
| 13  | GEO Signals              | `/geo-signals`            | Inspect schema.org markup, content chunking, heading hierarchy — "why am I not cited?"     |
| 14  | AI Traffic               | `/ai-traffic`             | Visits arriving from AI engines; per-source breakdown and trend                            |
| 15  | Analytics Integrations   | `/analytics-integrations` | GA4 + Search Console connection with AI-referrer tracking                                  |
| 16  | FAQ Manager              | `/faq-manager`            | FAQ CRUD + AI generation, each item scored by "AI Surface Score"                           |
| 17  | Client Reports           | `/client-reports`         | Agency white-label: shareable, exportable, schedulable PDF report                          |
| 18  | Brand Fact Sheet         | `/brand-fact-sheet`       | Structured brand facts AI cites verbatim (founding, funding, leadership, products)         |

Phase 1 context readers may need: every API call from the frontend goes through `apiRequest()` in `client/src/lib/queryClient.ts`, which attaches the Supabase Bearer JWT. Mutations invalidate React Query caches explicitly. Ownership on brand-scoped routes is enforced by a `brandIdParamHandler` on `app.param("brandId", ...)`. AI calls use `MODELS` registry in `server/lib/modelConfig.ts` and are rate-limited by `aiLimitMiddleware`. OpenAI logging goes through `attachAiLogger`. SSRF-safe outbound fetch lives at `server/lib/ssrf.ts`. None of this changes in Phase 2; it's the baseline every fix below assumes.

---

## Overview

Phase 2 has six parallel tracks:

1. **Auth Fabric Fixes** — Eliminate every remaining raw `fetch()` that bypasses the Bearer-token wrapper. These 401 in production.
2. **Trust-Breaking Stubs** — Replace `Math.random()` mocks, hand-rolled static content, and dead buttons with real implementations or honest "Coming Soon" states.
3. **Data Pipelines** — Build the ingestion jobs that make "read-side" pages useful: AI Traffic, Revenue, Analytics Integrations, Publications.
4. **Ownership, Validation, Rate-Limiting** — Close IDOR gaps, add Zod validation at request boundaries, and throttle AI-backed routes.
5. **Feature-Page Hardening** — Finish the 18 Phase 2 pages feature-by-feature, with each feature's product meaning (per `replit.md`) preserved.
6. **Production Readiness** — Empty/error states, pagination, telemetry, documentation.

---

## Track 1 — Auth Fabric Fixes (Critical, ship first)

### Current State

Phase 1 ended with a single authenticated fetch path: `apiRequest()` in `client/src/lib/queryClient.ts` attaches the Supabase Bearer token to every call. Phase 2 pages were written against an earlier cookie-session model and still use raw `fetch()`. In production (standalone Supabase auth), every one of these calls returns 401 and the page silently renders as empty.

### Affected Files

| File                                        | Line | Issue                                                                |
| ------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `client/src/pages/client-reports.tsx`       | 64   | `fetch('/api/client-reports/...')` — no Bearer header                |
| `client/src/pages/revenue-analytics.tsx`    | 30   | `fetch('/api/revenue/analytics')` — no Bearer header                 |
| `client/src/pages/ai-traffic.tsx`           | 44   | `fetch(url, { credentials: 'include' })` — wrong auth mode (cookies) |
| `client/src/pages/community-engagement.tsx` | 104  | `fetch('/api/community-discover')` — no Bearer header                |

### Required Actions

| Item                              | Action                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Unify fetch**                   | Replace every raw `fetch(...)` in the four files above with `apiRequest('GET' \| 'POST', url, body?)` from `@/lib/queryClient`. |
| **Drop `credentials: 'include'`** | The app is Bearer-only; cookie credentials are unused and misleading.                                                           |
| **Add regression guard**          | An ESLint rule (or a simple grep in CI) that flags raw `fetch(` inside `client/src/pages/`.                                     |

### Pass Criteria

- [ ] No raw `fetch(` calls remain in `client/src/pages/**/*.tsx` (manual grep + CI check)
- [ ] Each of the four pages above loads real data in staging against a logged-in user
- [ ] Logged-out user sees the expected redirect or empty state, not a blank page with a silent 401

---

## Track 2 — Trust-Breaking Stubs

### Current State

Several places in the backend return fake data via `Math.random()` or hand-rolled dictionaries. Users see numbers and statuses that look real but are not. Any of these discovered post-launch destroys credibility.

### Audit

| Stub                       | Location                                                            | What it fakes                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outreach "Send"**        | `server/databaseStorage.ts:1924–1928` (`storage.sendOutreachEmail`) | `Math.random() > 0.15` decides success/failure. No SMTP, no SendGrid, no Resend integration. Campaign "sent" count is a lie.                              |
| **Schema audit**           | `server/routes.ts:6767–6815` (`POST /api/geo-signals/schema-audit`) | `Math.random() > 0.3` decides whether each schema.org type is "present" on the site. The page advertises a schema audit; it ships a coin flip.            |
| **Discovery lookups**      | `server/routes.ts` (geo-tools, publications, community-engagement)  | Hand-rolled per-industry dictionaries for subreddits, publications, listicles, Wikipedia pages. Presented to the user as "discovered" via AI or scraping. |
| **Client Reports export**  | `client/src/pages/client-reports.tsx`                               | "Export PDF", "Share Report", and "Schedule Weekly Report" buttons are wired to no handlers at all.                                                       |
| **FAQ `aiSurfaceScore`**   | `shared/schema.ts` (`faq_items.aiSurfaceScore`)                     | Field exists, UI renders it, but no route ever populates it.                                                                                              |
| **Agent automation rules** | `server/scheduler.ts` + `automation_rules` table                    | Rules CRUD works; `executionCount` and `lastTriggeredAt` are never updated because the scheduler doesn't dispatch rules against events.                   |

### Required Actions

| Item                            | Action                                                                                                                                                                                                                                                                                                                                                          | Risk if not done                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Outreach email send**         | Integrate Resend (already in `package.json` for password reset). Wire `storage.sendOutreachEmail` to `resend.emails.send({ to, from, subject, html })`. Rate-limit per user (e.g. 30/day on free, 300/day on pro) via `express-rate-limit`. Record `outreach_emails.status='sent'` only on 2xx from Resend; `status='failed'` with the error message otherwise. | Users report false "delivered" counts. Brand damage + potential spam-provider-blacklisting if users send in volume thinking it's working. |
| **Schema audit**                | Replace `Math.random()` with a real fetch of the user-provided URL (through the SSRF-safe `server/lib/ssrf.ts` client), parse `<script type="application/ld+json">` blocks, and check which schema.org `@type` values are present. Return the actual present/missing matrix.                                                                                    | Users optimize schemas that the audit said were missing; no downstream signal confirms the change worked.                                 |
| **Discovery lookups**           | Mark each as either (a) "Coming Soon" in the UI until a real data source is wired, or (b) honestly labeled as a curated list ("Suggested subreddits for your industry"). Do not imply AI discovery when there is none.                                                                                                                                          | Users expect fresh targets; receive the same 10 hand-picked forums forever.                                                               |
| **Client Reports buttons**      | Either (a) implement each (PDF export via `@react-pdf/renderer` or a server-side `puppeteer` renderer; share via signed URL; schedule via `node-cron` job writing to Resend), or (b) remove the buttons and add a "Coming Soon" banner. Do not leave dead UI.                                                                                                   | Primary agency-user workflow ("send report to client") is non-functional.                                                                 |
| **FAQ `aiSurfaceScore`**        | Either (a) implement a scoring job that runs a citation-check style pass against each FAQ question across platforms and writes the score, or (b) remove the field from the UI.                                                                                                                                                                                  | Dashboard shows `null` / `0` / `NaN` for every FAQ.                                                                                       |
| **Automation rules dispatcher** | Implement a scheduler worker in `server/scheduler.ts` that evaluates every enabled `automation_rules` row against recent events (new citation, rank drop, competitor spike, alert threshold) and dispatches the configured action (create `agent_tasks` row, send email, webhook). Update `executionCount` + `lastTriggeredAt`.                                 | Users configure rules that silently never fire.                                                                                           |

### Pass Criteria

- [ ] No `Math.random()` in any code path that returns user-facing truth (audit with `grep -rn "Math.random" server/`)
- [ ] Resend-backed outreach send, verified with a test email round-trip
- [ ] Schema audit returns real present/missing breakdown for a control URL with known schemas
- [ ] Every button in `client-reports.tsx` either works or is removed
- [ ] Automation rules with a known triggering event fire within the scheduler's tick window and `executionCount` increments

---

## Track 3 — Data Pipelines (the pages that look real but ingest nothing)

### Current State

Four Phase 2 pages have working read-side UI but no data ingestion behind them. They'll look empty forever unless we ship the pipelines.

| Page                       | Storage table                          | What's missing                                                                                                                                                     |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AI Traffic**             | `ai_traffic_sessions`                  | No ingestion endpoint. The page expects rows populated from a user-installed JS snippet or server-side log parser — neither exists.                                |
| **Revenue Analytics**      | `revenue_events`                       | `POST /webhooks/shopify/orders` + `POST /webhooks/ecommerce/purchase` exist but no docs, no signed-webhook verification, no user-facing "connect your store" flow. |
| **Analytics Integrations** | N/A — purely `localStorage`            | Nothing persists; no GA4 / GSC OAuth; the page is a setup guide pretending to be integration tooling.                                                              |
| **Publications**           | `publications`, `publication_contacts` | Backend routes exist but the page (60 lines) is a "Coming Soon" placeholder.                                                                                       |

### Required Actions

| Item                       | Action                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI Traffic snippet**     | Ship a lightweight JS snippet users embed (`<script src="https://your-app/ai-traffic.js?brandId=...">`). Snippet posts to `POST /api/ai-traffic/ingest` with a brand-scoped API key. Server validates the key, writes a row to `ai_traffic_sessions`. Detect AI referrers (`chat.openai.com`, `claude.ai`, `perplexity.ai`, `gemini.google.com`, etc.) per the GA4-referral list documented in `replit.md`. |
| **Revenue webhooks**       | For Shopify: verify `X-Shopify-Hmac-Sha256` against the brand-specific secret stored in a new `shopify_integrations` table. For generic e-commerce: issue a per-brand secret, verify an `X-VC-Signature: sha256=...` header. Add a "Connect Shopify" flow with OAuth. Revenue must be attributable to the ChatGPT Buy-button / AI-commerce source (per `replit.md` Revenue Tracking spec).                  |
| **Analytics Integrations** | Replace `localStorage` form with Supabase OAuth-based GA4 / GSC connection (use `googleapis` or a minimal token-refresh worker). Store refresh tokens encrypted in `analytics_integrations` table. Either implement or delete and route "Coming Soon".                                                                                                                                                      |
| **Publications**           | Either (a) wire `publication-intelligence.tsx` to `/api/publications/*`, or (b) remove the nav entry until real publication discovery is built.                                                                                                                                                                                                                                                             |

### Pass Criteria

- [ ] AI Traffic snippet installs on a test site; page shows the visit within 30 seconds, correctly attributed to an AI referrer
- [ ] Shopify webhook signed with the correct secret inserts a `revenue_events` row; tampered signature returns 401
- [ ] Analytics Integrations page either reflects a real GA4 connection or is gone
- [ ] Publications page either renders real data or is routed to "Coming Soon"

---

## Track 4 — Ownership, Validation, Rate Limiting

### Current State Audit

| Issue                                         | Location                                                                                           | Severity | Detail                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Potential IDOR on `geo-analytics`**         | `server/routes.ts:3618`                                                                            | Critical | Handler calls `storage.getBrandById(brandId)` which does not filter by `userId`. The `app.param("brandId", brandIdParamHandler)` guard _should_ enforce ownership — confirm the path `/api/geo-analytics/:brandId` matches the guard and that the guard rejects foreign brandIds with 403. |
| **Unowned publication routes**                | `server/routes.ts:3198–3260`                                                                       | High     | `/api/publications/*` routes without `brandId` in the path return global data. Must be scoped per user/brand.                                                                                                                                                                              |
| **No Zod validation on most Phase 2 POSTs**   | `server/routes.ts` (community, agent, geo-signals, faq-manager)                                    | High     | Request bodies are spread into DB inserts and into OpenAI prompts. Prompt-injection surface is wide.                                                                                                                                                                                       |
| **No per-user rate limiting on AI endpoints** | `/api/community-generate`, `/api/community-discover`, `/api/geo-signals/*`, `/api/faqs/*/optimize` | Medium   | A user or script can burn through OpenAI quota in seconds. Phase 1 `aiLimitMiddleware` (10 req/min) covers content-gen but was never extended to Phase 2 AI endpoints.                                                                                                                     |
| **Slack webhook URLs stored plaintext**       | `automation_rules.actionPayload.webhookUrl`                                                        | Medium   | Stored as JSON text in the DB. Any DB leak = every user's Slack routed. Encrypt at rest or store in a separate `integration_secrets` table.                                                                                                                                                |
| **No per-user OpenAI token cap**              | Global                                                                                             | Medium   | Phase 1 rate limits requests/minute; there is no total-tokens-per-day cap. A Pro user can cost the platform hundreds of dollars in a day.                                                                                                                                                  |

### Required Actions

1. **Audit `brandIdParamHandler`** — verify it rejects any `brandId` not owned by `req.user.id` with 403. Unit-test against a foreign-brand id.
2. **Scope publications** — all `/api/publications/*` routes must take `:brandId` and enforce ownership.
3. **Zod at boundaries** — every POST/PATCH route with a request body gets `bodySchema.parse(req.body)` at the top. Shared schemas in `shared/schema.ts` via `drizzle-zod`.
4. **Extend AI rate limiter** — apply `aiLimitMiddleware` to every AI-backed Phase 2 route; tune per-route (e.g. community-generate: 20/hr, geo-signals/analyze: 30/hr).
5. **Encrypt webhook secrets** — move all webhook/slack/smtp credentials out of `actionPayload` into a new `integration_secrets` table with AES-GCM at-rest encryption.
6. **Daily OpenAI token cap** — per-user daily ceiling (free: 50k, pro: 500k, enterprise: 5M) tracked in `users.openAiTokensUsedToday`, reset at UTC midnight, enforced at the `attachAiLogger` layer.

### Pass Criteria

- [ ] `curl` with a user-A JWT against `/api/geo-analytics/<user-B-brandId>` returns 403
- [ ] `zod-validation-error` returns a readable 400 for every malformed POST body
- [ ] 11th call per minute to `/api/community-generate` returns 429
- [ ] `SELECT actionPayload->>'webhookUrl' FROM automation_rules` returns `NULL`
- [ ] A single user's daily spend cannot exceed the tier cap (verified with a synthetic burn test)

---

## Track 5 — Feature-Page Hardening (meaning → gap → fix)

Each feature below leads with its **product meaning** (what the user is supposed to get from it), then the gap found in the audit, then the concrete fix. This way the "why" survives reorganization and the acceptance bar is obvious without cross-referencing any other doc.

### 5.1 GEO Rankings

**Meaning:** Live citation monitoring. For every article the user owns, show how often each AI engine (ChatGPT, Claude, Perplexity, Google AI, Gemini) cites it — per-platform citation rate, average rank, and a recent-rankings feed. This is the reporting surface that turns Phase 1's citation pipeline into a daily dashboard.

**Gap:**

- `GET /api/geo-rankings` selects the entire `articles` table then filters in memory by brand ownership (`databaseStorage.ts:203`).
- Client-side aggregates with untyped `any` accumulators; mixes number/string return types.
- No pagination. A year of weekly runs ships the full set on mount.
- Not invalidated when a new run completes — stale until reload.

**Fix:**

- [ ] Rewrite `storage.getGeoRankings(brandId, opts)` to JOIN through `articles` server-side; add `GET /api/geo-rankings?brandId&limit&cursor`.
- [ ] Add `geo_rankings.checkedAt` + `(articleId, checkedAt)` indexes.
- [ ] Invalidate `['/api/geo-rankings']` from the `POST /api/brand-prompts/:brandId/run` onSuccess.
- [ ] Platform filter, date range, CSV export.
- [ ] Skeletons on the overview cards, not just the list.

### 5.2 GEO Analytics

**Meaning:** Executive-level per-brand summary: AI Visibility Score (0–100), Share of Voice, sentiment breakdown, per-platform metrics, competitor leaderboard. The one page an agency sends to a client to say "here's how your brand is doing in AI search this month."

**Gap:**

- Potential IDOR: handler calls `storage.getBrandById(brandId)` without userId filtering (see Track 4).
- `aiVisibilityScore` formula is documented only in-code; the UI number has no tooltip or explanation.
- Aggregation runs fully on every GET — no cached metric snapshot, so cost scales O(full geo_rankings history) per page load.

**Fix:**

- [ ] Confirm `brandIdParamHandler` rejects foreign brandIds with 403; add a regression test.
- [ ] Render a tooltip on the AI Visibility Score showing: `citations×10 (cap 40) + mentions×5 (cap 30) + 30 − avgRank×3 (floor 0)`.
- [ ] Nightly `metrics_snapshots` cron that pre-computes the executive numbers per brand; GET reads the snapshot, recomputes only if older than 24h.

### 5.3 AI Intelligence

**Meaning:** Advanced analytics layer: Share-of-Answer, Citation Quality, Hallucination Detection, Competitor Comparison, Prompt Portfolio. This is the "why is our brand losing on Perplexity but winning on Claude" deep-dive surface.

**Gap:**

- Four of its core tables (`prompt_portfolio`, `citation_quality`, `brand_hallucinations`, plus alert thresholds) have CRUD surfaces but **no automated producer** — they stay empty unless a user manually POSTs rows.
- `alert_settings` CRUD-only: thresholds can be set but nothing evaluates them.

**Fix:**

- [ ] Ship at least one real ingestion job per table:
  - `prompt_portfolio`: derived from tracked prompts + weekly run results (already flowing in Phase 1).
  - `citation_quality`: score each stored AI response for accuracy/context/completeness via a GPT-4o-mini judge pass (reuse `server/citationJudge.ts`).
  - `brand_hallucinations`: flag responses where the AI invented a product/fact not in the brand profile, using the same judge.
- [ ] Alert-evaluation worker on the scheduler: after every citation run, evaluate `alert_settings` and dispatch via the automation-rules dispatcher (Track 2).

### 5.4 GEO Opportunities

**Meaning:** Show users where they're _not_ getting cited but could be — unclaimed listicle positions, forum gaps, missing schema entries, AI-platform coverage holes. The proactive companion to the reactive GEO Rankings page.

**Gap:**

- Entire surface uses a hand-rolled industry → subreddit dictionary. No discovery, no ranking, no freshness.
- Routes generate marketing-style content as "opportunities" — scope creep from the content-generation feature, not what the page is supposed to be.

**Fix:**

- [ ] Replace hard-coded lookup with real discovery:
  - Reddit Search API + topic clustering for relevant subreddits.
  - `geo_rankings` deltas to surface articles that slipped in rank (opportunity = fix-this-article).
  - `listicles` scanner results (see 5.12) to surface listicles where the user's brand is absent.
- [ ] Remove routes that just output marketing copy; Phase 2 is discovery, not content.
- [ ] Each opportunity row carries a quick-action that routes back to Content, Outreach, or GEO Tools as appropriate.

### 5.5 Outreach

**Meaning:** Campaign management for backlink and citation-building outreach. Users draft templated emails to publications, press contacts, and niche authors; send and track opens/clicks/replies.

**Gap:**

- `storage.sendOutreachEmail` is a `Math.random()` mock (Track 2).
- No unsubscribe list, no suppression — a user could email the same contact across three campaigns with no safeguard.
- "Deliverability" = `status=sent`; nothing tracks opens, clicks, or bounces.

**Fix:**

- [ ] Resend integration (Track 2).
- [ ] Per-user daily send cap by tier (30/day free, 300/day pro, unlimited enterprise).
- [ ] `outreach_suppressions` table + automatic suppression on bounce, unsubscribe header, and manual add.
- [ ] Resend webhooks → `outreach_email_events` table → per-campaign open/click/bounce/reply metrics.

### 5.6 Community Engagement

**Meaning:** AI-powered discovery of relevant Reddit, Quora, Hacker News, and forum communities for brand citation-building. AI generates non-spammy, value-first post drafts; users copy-paste and post manually (platforms don't allow programmatic posting on their free tiers).

**Gap:**

- Raw `fetch` bypasses auth on `/api/community-discover` (Track 1).
- `community-generate` has no rate limit and no Zod validation — prompt-injection surface on a route that calls OpenAI.
- Generated posts have no citations — they're pure LLM output, risking factual confabulation in real communities.

**Fix:**

- [ ] Migrate to `apiRequest` (Track 1).
- [ ] Rate-limit `/api/community-generate` (20/hr) and `/api/community-discover` (60/hr).
- [ ] Zod-validate request bodies.
- [ ] Generation prompt must require the AI to ground claims in a subset of the user's brand's published articles; attach the article IDs used as a `sources[]` field on the draft.

### 5.7 AI Agent (agent-dashboard)

**Meaning:** Autonomous task queue. User queues a task ("write 5 BOFU articles for industry X", "find 10 outreach targets in niche Y") and the agent executes it using OpenAI, storing the structured result in `agent_tasks.outputData`. Combined with automation rules: "every Monday, run this task."

**Gap:**

- Automation rules dispatcher doesn't exist — rules CRUD but never fire (Track 2).
- `outputData` is rendered without schema validation, so any AI output shape shift breaks the page.
- No per-user daily task cap; a runaway rule could queue thousands of tasks.

**Fix:**

- [ ] Automation-rules dispatcher (Track 2 delivers this).
- [ ] Zod-validate `outputData` at render time per task-type.
- [ ] Daily task ceiling per tier; queued tasks over the limit show a clear "upgrade to run more" state.

### 5.8 Revenue Analytics

**Meaning:** Tracks purchases attributed to AI commerce features (ChatGPT Buy buttons, Perplexity Shopping, etc.). Ingests Shopify / e-commerce webhooks, attributes the order to the AI session that drove it, computes revenue per article and per brand.

**Gap:**

- Raw `fetch` on line 30 (Track 1).
- Webhook endpoints accept any body — no HMAC verification, no secret per brand.
- Trend badges render `NaN%` when the previous period is zero.
- No pagination on `revenue_events`.

**Fix:**

- [ ] Migrate to `apiRequest`.
- [ ] Per-brand HMAC secret + signature verification on `/webhooks/shopify/orders` and `/webhooks/ecommerce/purchase` (Track 3).
- [ ] Trend helper: `pct(curr, prev)` returns `null` when `prev === 0`; UI renders "—" instead of `NaN%`.
- [ ] Paginate `/api/revenue/events` and move aggregates to a nightly `revenue_snapshots` table.

### 5.9 Publication Intelligence

**Meaning:** Discover publications relevant to the user's industry that are likely to be cited by AI engines, track their citation share, and surface which of the user's articles have been picked up. Feeds the Outreach workflow.

**Gap:**

- Page is a 60-line "Coming Soon" placeholder.
- Backend routes exist but return global (not per-brand) data.

**Fix:**

- [ ] Wire `publication-intelligence.tsx` to `/api/publications/:brandId` with owned scoping (Track 4).
- [ ] If real discovery can't ship this phase: remove the nav entry and document "Coming Soon."
- [ ] When discovery ships: use the same GPT-4o-mini judging pattern used for citation scoring to rank publications by likely AI-citation authority.

### 5.10 Competitors

**Meaning:** Side-by-side brand vs. competitor analytics. See how competitors' citation counts, share of voice, and rank compare across the same prompts you track. Leaderboard ranks your brand against peers in your industry.

**Gap:**

- Competitor citation counts are **user-typed** — the "leaderboard" ranks on self-reported data.
- No automation; users must manually refresh snapshots.

**Fix:**

- [ ] Run the same citation-check pipeline against competitor brand names + variations; store in `competitor_citation_snapshots` automatically.
- [ ] Leaderboard reads from verified snapshot data; user-typed fields are deprecated.
- [ ] Weekly cron refresh aligned with the Phase 1 tracked-prompts schedule.

### 5.11 Crawler Check

**Meaning:** Confirm each major AI crawler is permitted by the user's robots.txt — GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc. A Phase-1-adjacent utility for the AI Visibility checklist.

**Gap:**

- Each check is fire-and-forget; no persistence, so users can't see "did my fix work" over time.
- No scheduled re-check; if the site's robots.txt regresses we never notice.

**Fix:**

- [ ] Persist each check to `crawler_check_results (brandId, url, bot, allowed, checkedAt)`.
- [ ] Weekly cron re-check per brand; surface diffs in the AI Visibility page.
- [ ] Alert integration: crawler blocked → automation-rules dispatcher fires the configured action.

### 5.12 GEO Tools

**Meaning:** Toolkit of discovery utilities: Listicle Tracker (find listicles in the user's niche and whether the brand is included), Wikipedia Monitor (track mentions on relevant pages), BOFU Content Generator, FAQ Optimizer, Brand Mention Tracker.

**Gap:**

- `discoverListicles` and `scanWikipedia` return static stub tables — not real discovery.
- Brand-mention scanner's fetch path needs SSRF-safe wrapper confirmation.

**Fix:**

- [ ] Real listicle discovery: keyword-based Google search (via SerpAPI or similar) filtered to `intitle:"best"` / `intitle:"top"` listicles; check if the brand appears on the page.
- [ ] Real Wikipedia scan: Wikipedia REST API (`search?q=...`), fetch top N pages, check for brand mentions in the article body + references section.
- [ ] Confirm `brand_mentions` scanner routes through `server/lib/ssrf.ts`.

### 5.13 GEO Signals

**Meaning:** Inspect the structural signals AI engines use to decide whether to cite a page — schema.org markup, content chunking, heading hierarchy, semantic HTML, FAQ pages. Run one-off analyses and get actionable optimization suggestions.

**Gap:**

- `schema-audit` is a `Math.random()` coin flip (Track 2).
- Analyze / chunk / optimize endpoints have no rate limit and no Zod validation.

**Fix:**

- [ ] Real schema audit (Track 2).
- [ ] Rate-limit analyze (30/hr), chunk-analysis (30/hr), optimize-chunks (20/hr).
- [ ] Zod-validate every request body.

### 5.14 AI Traffic

**Meaning:** Show the user how many visits are arriving from AI search engines — referrer-based tracking for `chat.openai.com`, `claude.ai`, `perplexity.ai`, `gemini.google.com`, etc. Per-source breakdown, trend over time, top-landing-pages.

**Gap:**

- Raw `fetch` on line 44 (Track 1) — uses `credentials: 'include'` against a Bearer-token app.
- No ingestion path whatsoever — table is always empty.

**Fix:**

- [ ] Migrate to `apiRequest`.
- [ ] Ship the ingestion snippet (Track 3) with AI-referrer detection wired to the known source list.

### 5.15 Analytics Integrations

**Meaning:** Setup guide and connection point for Google Analytics 4 + Search Console. Stores GA4 property ID, documents AI-referral source configuration, and (intended) pulls real GA4 / GSC metrics for cross-referencing with in-app citation data.

**Gap:**

- Page is a localStorage-only form — nothing persists server-side, no OAuth, no data sync.
- "Integration" is a misnomer; it's a setup document today.

**Fix:**

- [ ] Implement GA4 + GSC OAuth via `googleapis`. Store refresh tokens encrypted in `analytics_integrations` table (AES-GCM via env key).
- [ ] Nightly sync worker pulls the previous day's AI-referrer session counts from GA4 into `ai_traffic_sessions` (complementary to the snippet from 5.14).
- [ ] If OAuth can't ship this phase: delete the page and route the nav entry to "Coming Soon" — no more pretending.

### 5.16 FAQ Manager

**Meaning:** CRUD and AI generation for FAQ items attached to a brand. Each FAQ question gets an `aiSurfaceScore` — how likely an AI engine is to surface the brand's answer when asked this question. Part of the GEO Tools suite.

**Gap:**

- `aiSurfaceScore` is never populated by any endpoint — UI renders `null` / `0`.
- No rate limit on `/api/faqs/*/optimize`.
- No Zod validation on request bodies.

**Fix:**

- [ ] Score job: for each FAQ, run the question as a prompt through the citation-check pipeline; derive score from `citedCount / totalChecks`. Run on FAQ create/edit and via weekly cron.
- [ ] If scoring can't ship: hide the field in the UI.
- [ ] Rate-limit `/api/faqs/:id/optimize` (20/hr) and `/api/faqs/generate/:brandId` (10/hr).
- [ ] Zod-validate all bodies.

### 5.17 Client Reports

**Meaning:** Agency-focused surface. Bundles a brand's full GEO state — metrics, top articles, competitor comparison, quick wins — into a shareable, exportable, schedulable report for the agency's end-client. The "white-label deliverable" workflow.

**Gap:**

- Raw `fetch` on line 64 (Track 1).
- "Export PDF", "Share Report", "Schedule Weekly Report" buttons are dead (Track 2).
- Page reads `metrics.previousBMF` etc. fields the backend doesn't return — NaN badges.

**Fix:**

- [ ] Migrate to `apiRequest`.
- [ ] Implement or remove each button (Track 2). Recommended: server-side `puppeteer` PDF render, `node-cron` scheduler that posts PDFs via Resend, signed-URL share links that expire.
- [ ] Backend response must include `previousBMF`, `previousCitationRate`, `previousShareOfVoice` — compute in the same nightly snapshot used by 5.2.

### 5.18 Brand Fact Sheet

**Meaning:** Structured facts about the brand — founding date, funding rounds, leadership, product list — that AI engines tend to cite verbatim. `lastVerified` timestamp tells the user which facts are fresh and which need re-checking against the source URL.

**Gap:**

- `lastVerified` is stamped on any edit. Editing the display text "bumps" verification without checking the source.
- No verification workflow.

**Fix:**

- [ ] Split `lastVerified` from `lastEdited`. Only the former is updated by the verification worker.
- [ ] Verification workflow: fetch the source URL via SSRF-safe client, search the document for the claim text (fuzzy match), stamp `lastVerified` on success.
- [ ] Surface stale facts (older than 90 days) prominently in the UI.

---

## Track 6 — Production Readiness (Phase 2)

Follows Phase 1's Track 6 pattern.

| Item                                 | Required Action                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-page empty/error states**      | Every Phase 2 page must render empty-state + error-state UI — no blank screens on 401/500/empty data                                           |
| **Pagination on all list endpoints** | `geo_rankings`, `revenue_events`, `outreach_emails`, `agent_tasks`, `community_posts` all currently return full tables                         |
| **Unified API response schemas**     | Every Phase 2 response parses through Zod at the client fetch boundary (extends the Phase 1 "out of scope" item)                               |
| **Sentry / telemetry**               | Wire Sentry to the existing Phase 1 `ErrorBoundary`. Required before Phase 2 exposes real external integrations.                               |
| **Documentation**                    | `docs/phase2_completion.md` records every merged change following the Phase 1 Track-pattern (file → change table, verification, pass criteria) |

### Pass Criteria

- [ ] `npx tsc --noEmit` clean after every batch
- [ ] `npx vite build` succeeds; no chunk larger than 800 KB pre-gzip
- [ ] Every Phase 2 page surveyed by hand against a real account with data, an empty account, and a logged-out state
- [ ] Sentry receives a test error from production build
- [ ] `docs/phase2_completion.md` updated alongside every merged implementation

---

## Execution Order

Recommended sequencing to minimize blast radius:

1. **Track 1 (auth fabric)** — unblocks the four broken pages immediately; no schema changes, low risk.
2. **Track 4 (ownership/validation/rate-limit)** — do before any new surface ships; the IDOR audit is the gating item.
3. **Track 2 (trust-breaking stubs)** — highest reputational risk. Fix or honestly label each before public launch.
4. **Track 3 (data pipelines)** — largest engineering scope; can run in parallel with Track 5.
5. **Track 5 (per-feature hardening)** — feature-by-feature, shipped in small PRs.
6. **Track 6 (prod-readiness)** — continuous alongside 1–5; finalized before GA.

Out of scope for Phase 2 (still open after this plan):

- Multi-tenant / agency workspace mode (multiple users per brand)
- Public API for third-party integrations
- Real-time websocket updates (today everything is poll/invalidate)
- Full i18n — current strings are English-only
