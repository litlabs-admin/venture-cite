# Compare 04 - platform, account layer and data model

Scope: the platform slice of venturecite. Server route registry, the account
and billing layer, the scheduler, the 59-table data model, and five client
pages. Then a comparison against Trakkr.

Every statement below comes from the code. Files read in full:
`shared/schema.ts`, `server/routes.ts`, `server/app.ts`, `server/auth.ts`,
`server/scheduler.ts`, `server/routes/{brands,billing,onboarding,userAccount,cron,tours,adminScrapeInspector}.ts`,
`server/lib/brandActivation.ts`, `server/lib/notificationPrefs.ts`,
`server/setupProducts.ts`, `client/src/components/TrialGate.tsx`, and
`client/src/pages/{settings,setup,brands,welcome,pricing}.tsx`.

`server/routes/factSheet.ts` is skipped. Another agent owns that slice.

---

## 0. Stale claims in the repository documentation

Each claim below is in a `.md` file. Each is wrong. The code proves it.

| Doc | Claim | Reality |
|---|---|---|
| `CLAUDE.md` | "`server/routes.ts` is 7000+ lines" | 529 lines. Routes are already split into 27 modules under `server/routes/`. |
| `CLAUDE.md` | "Where do API routes live? `server/routes.ts` (one file today; per-domain Wave 5)" | The Wave 5.1 split has landed. `routes.ts` is a registry plus 8 cross-cutting routes. |
| `CLAUDE.md` | "**Frontend**: React 18, Vite, Wouter (router)" | `wouter` is not in `package.json`. The router is `@tanstack/react-router` ^1.170.18. Every page imports `Link`/`useNavigate` from it. |
| `CLAUDE.md` | "**Backend**: Express 4 (ESM)" | `package.json` pins `"express": "^5.2.1"`. The 404 handlers use the Express 5 `"/api/*splat"` syntax (`server/app.ts:351`). |
| `CLAUDE.md` | "use the `useToast()` hook from `@/components/ui/use-toast`" | That file does not exist. The hook is `@/hooks/use-toast`. |
| `CLAUDE.md` | "redundant `react-icons` + `lucide-react`, `tw-animate-css` + `tailwindcss-animate`" | `tw-animate-css` is not in `package.json`. Only `tailwindcss-animate` is. |
| `CLAUDE.md` | "Migrations are auto-applied on boot ... (`server/index.ts:181-236`)" | `server/index.ts` is 99 lines. Migrations run through `applyMigrations` from `./lib/migrationRunner`. |
| `CLAUDE.md` | "Don't skip the audit log ... **when Wave 2 lands**, every delete/subscription/admin op will write to `audit_logs` via a `withAudit()` wrapper" | `withAudit()` already exists at `server/lib/audit.ts:70`. `audit_logs` is a live table. |
| `CLAUDE.md` | "Content worker polls `content_generation_jobs` every 5s" | On the current deploy the worker is driven by HTTP slices (`/api/content-jobs/:jobId/advance`) plus a cron drain step (`server/routes/cron.ts:203`). There is no 5-second poll loop in the cron path. |
| `CLAUDE.md` | "Single-instance deployment for now" | The code assumes multi-instance. Every scheduled job takes a Postgres advisory lock (`server/scheduler.ts:31-37`) and a debounce window. |
| `shared/schema.ts:84-100` | A first `usageLimits` doc block describes tiers `trial`, `expired`, `admin`, "Pro $99 / Agency $500", "14 days, granted on signup" | Superseded in place by the SECOND doc block at lines 101-122. The tier keys `trial` and `expired` do not exist in the object. This is a stale comment inside the code itself. |

---

## 1. The data model - all 59 tables

`shared/schema.ts` declares exactly 59 `pgTable` calls. Grouped by the feature
that owns each table.

### 1.1 Account and identity (6)

| Table | Purpose | Owner feature |
|---|---|---|
| `users` | Root of the tenancy tree. Email, Supabase id, `access_tier`, Stripe ids, usage counters, soft-delete stamps, email deliverability state, `onboarding_state` JSONB, Buffer token. | Account layer |
| `beta_invite_codes` | Redeemable codes that grant a tier. `max_uses`, `used_count`, `access_tier`, `expires_at`. | Beta access |
| `waitlist` | Public email capture from the landing page. | Marketing |
| `notification_preferences` | One row per (user, type). Missing row means enabled. | Notifications |
| `audit_logs` | Sensitive-operation trail. `user_id` survives account delete. | Compliance |
| `email_failures` | Dead-letter queue for Resend sends that exhausted retries. | Email |

### 1.2 Brand core (3)

| Table | Purpose | Owner feature |
|---|---|---|
| `brands` | The tenant unit under a user. Profile fields, `name_variations`, autopilot state, legacy citation-cadence columns, optimistic-lock `version`, soft-delete pair, `monitor_mentions`. | Brands |
| `competitors` | Per-brand rivals. `tier` core/discovered, `discovered_by`, `relevance_score`, soft delete and an ignore tombstone. | Competitors |
| `competitor_favicons` | Global domain→icon cache. Not brand-scoped. | Competitors UI |

### 1.3 Prompts and citation measurement (8)

| Table | Purpose | Owner feature |
|---|---|---|
| `brand_prompts` | Tracked / suggested / archived prompts. Carries `category`, `funnel_stage` (TOFU/MOFU/BOFU), `region`. | Prompts |
| `prompt_generations` | One row per batch of generated prompts. Enables prompt versioning. | Prompts |
| `citation_runs` | One row per manual or cron citation sweep. Totals, per-platform breakdown, lifecycle status, `self_citation_count`, `disagreement_count`. | Citations |
| `geo_rankings` | Per (prompt × platform × run) result. Cited flag, rank, sentiment, `cited_urls`, source type, authority and relevance scores. | Citations |
| `competitor_geo_rankings` | The same fidelity for competitors. | Competitors |
| `competitor_citation_snapshots` | Per-run competitor citation counts. | Competitors |
| `brand_visibility_snapshots` | Per-platform visibility, share of voice, sentiment split. | Dashboard |
| `citations` | Legacy per-user citation table. Only remaining reader is `/api/onboarding-status`. | Legacy |

### 1.4 Fact sheet (9)

| Table | Purpose | Owner feature |
|---|---|---|
| `brand_fact_sheet` | The resolved facts. Domain, subcategory, key, value, `value_type`, confidence, provenance, `user_overridden`, re-verification state. | Fact sheet |
| `brand_fact_scrape_runs` | One row per scrape run. Slice-resumable. Cost and token counters. Partial unique index enforces one active run per brand. | Fact sheet |
| `brand_fact_scrape_pages` | Per-page attempt inside a run. | Fact sheet |
| `fact_scrape_events` | Per-step telemetry. No FK, so events outlive run deletes. Feeds the admin inspector. | Admin inspector |
| `fact_scrape_logs` | Per (run, source) aggregate log. | Fact sheet |
| `fact_scrape_cache` | Cache for search-grounded LLM calls, TTL by `expires_at`. | Fact sheet |
| `brand_monthly_cost_caps` | Per (brand, month) LLM spend cap. Default cap is 500 cents. | Cost control |
| `llm_concurrency_slots` | Postgres token bucket for provider concurrency. | Cost control |
| `system_state` | Generic JSON config store. Also holds the per-brand activation ledger (`brand_jobs:<brandId>`). | Scheduler |

### 1.5 Content generation (7)

| Table | Purpose | Owner feature |
|---|---|---|
| `articles` | The single source of truth for user content. Absorbed the old `content_drafts`. Lifecycle draft → generating → ready/failed. | Content |
| `article_revisions` | Immutable content snapshots per edit or auto-improve. | Content |
| `distributions` | Per-article publish attempts to an external platform. | Distribution |
| `content_generation_jobs` | Article job queue. Per-row slice lock, OpenAI response id, refund bookkeeping. | Content worker |
| `llm_jobs` | Generic one-shot LLM job substrate: keyword discovery, FAQ generation, prompt generation. 24-hour TTL. | LLM substrate |
| `keyword_research` | Discovered keywords with opportunity and citation-potential scores. | Content |
| `community_posts` | Reddit / Quora / forum drafts and posts. | Community |

### 1.6 Content assets and off-site presence (5)

| Table | Purpose | Owner feature |
|---|---|---|
| `bofu_content` | Bottom-of-funnel pieces with publish lifecycle and `last_cited_at`. | GEO tools |
| `faq_items` | FAQ pairs, AI-surface score, publish lifecycle. | GEO tools |
| `listicles` | "Best of" articles tracked for brand inclusion, with an outreach status. | Listicles |
| `wikipedia_mentions` | Wikipedia presence monitoring. | Wikipedia |
| `tracked_content_urls` | Registry of brand-owned published URLs, normalised, used for self-citation matching. | Citations |

### 1.7 Mentions monitoring (4)

| Table | Purpose | Owner feature |
|---|---|---|
| `brand_mentions` | Mentions found across Reddit, Hacker News and Quora. Sentiment, status lifecycle, matched variation and field. | Mentions |
| `scan_jobs` | One row per manual or cron mention scan. Per-source counters. | Mentions |
| `source_health` | Per (brand, source) failure count and backoff pause. | Mentions |
| `sentiment_cache` | Content-hash keyed sentiment cache. | Mentions |

### 1.8 Quality, alerts and automation (8)

| Table | Purpose | Owner feature |
|---|---|---|
| `citation_quality` | Authority, relevance, recency, position scores per citation. | Intelligence |
| `brand_hallucinations` | Inaccurate AI claims with severity, remediation status and source traceback. | Intelligence |
| `metrics_history` | Metric snapshots for trend analysis. | Analytics |
| `alert_settings` | Per (brand, alert type) config with email and Slack webhook fields. | Alerts |
| `alert_history` | Sent alerts. | Alerts |
| `agent_tasks` | Automated optimisation task queue with token and credit accounting. | Agent |
| `workflow_runs` | Multi-step workflow state (`weekly_catchup`). | Workflows |
| `brand_perception_runs` | Five-axis perception score plus overall, praised and questioned lists. | Perception |

### 1.9 Signals, chatbot, tours and platform (9)

| Table | Purpose | Owner feature |
|---|---|---|
| `geo_signal_runs` | One row per "Analyze GEO signals" click. Capped at 100 rows per brand. | Signals |
| `schema_audits` | Cached JSON-LD structured-data audit per URL hash. | Signals |
| `visibility_progress` | Per (brand, engine, step) checklist completion. | Visibility checklist |
| `chatbot_threads` | Assistant conversation threads. | Assistant |
| `chatbot_messages` | Assistant messages with token counts. | Assistant |
| `chatbot_token_usage` | Per (user, date) token and message totals. | Assistant |
| `tour_events` | Product-tour telemetry. 90-day retention. | Tours |
| `api_costs` | Every outbound LLM call, for per-user budget enforcement. | Cost control |
| `analytics` | A single global row of totals. Legacy. Not per-user. | Legacy |

**Count: 6 + 3 + 8 + 9 + 7 + 5 + 4 + 8 + 9 = 59.**

---

## 2. The route registration map

`server/app.ts` builds the Express app. `server/routes.ts` registers everything.

### 2.1 Order in `server/app.ts`

1. `helmet` with an explicit CSP. `connect-src` allows Stripe and Supabase only.
2. HTTPS redirect in production, `/health` exempt.
3. CORS on `/api/*` only. Allowlist is `APP_URL` plus `EXTRA_CORS_ORIGINS` plus
   localhost:5000, plus any `*.vercel.app` preview host.
4. Two raw-body webhooks, before `express.json`:
   - `POST /api/stripe/webhook` - Stripe HMAC verified.
   - `POST /api/webhooks/resend` - Svix signature verified.
5. `express.json({ limit: "1mb" })`.
6. Request-id middleware with AsyncLocalStorage.
7. `GET /health` - a `SELECT 1`.
8. `prepareApp()` calls `registerRoutes(app)`, then adds terminal 404 handlers
   for `/api/*splat` and `/webhooks/*splat`, then the global error handler.

### 2.2 Middleware order inside `registerRoutes`

```ts
// server/routes.ts:78-125
app.use(attachUserIfPresent);
setupAuth(app);              // /api/auth/* - must precede the guard
app.use(requireAuthForApi);  // global bearer-token guard
setupCronRoutes(app);        // public, self-auths via CRON_SECRET
...                          // account, unsubscribe, onboarding, tours,
                             // logo proxy, brands, buffer, billing, enterprise
app.use(enforceBrandOwnership);      // body/query brandId guard
app.param("brandId", brandIdParamHandler);  // URL-path :brandId guard
```

Note the ordering consequence: `setupBrandRoutes`, `setupBillingRoutes`,
`setupBufferRoutes`, `setupOnboardingRoutes` and `setupTourRoutes` are all
registered **before** `enforceBrandOwnership` and the `app.param` handler. Those
modules do their own ownership checks (`storage.getBrandByIdForUser`,
`requireBrand`).

### 2.3 Module to path-prefix map

| Module | Paths registered |
|---|---|
| `server/auth.ts` (`setupAuth`) | `/api/auth/register`, `/login`, `/logout`, `/me`, `/forgot-password`, `/reset-password` (410 Gone), `/resend-verification` |
| `routes/cron.ts` | `/api/cron/daily-orchestrator`, `/api/cron/fact-scrape-backstop` |
| `routes/userAccount.ts` | `/api/user/delete`, `/export`, `/profile`, `/password`, `/notification-preferences` |
| `routes/unsubscribe.ts` | `/api/unsubscribe` |
| `routes/onboarding.ts` | `/api/onboarding/state`, `/scrape-stream`, `/confirm`, `/autopilot-retry`, `/autopilot-status/:brandId` |
| `routes/tours.ts` | `/api/tours/state`, `/api/tours/events`, `/api/admin/tours/metrics` |
| `routes/logoProxy.ts` | `/api/logo-proxy` |
| `routes/brands.ts` | `/api/brands`, `/api/brands/:id`, `/api/brands/:id/deletion-preview`, `/api/brands/create-from-website` |
| `routes/buffer.ts` | `/api/buffer/connect`, `/connection`, `/post`, `/profiles`, `/status` |
| `routes/billing.ts` | `/api/billing/{portal-session,subscription,cancel,resume,invoices}`, `/api/stripe/{publishable-key,products,checkout}` |
| `routes/enterpriseInquiry.ts` | `/api/enterprise-inquiry` |
| `server/routes.ts` itself | `/api/usage`, `/api/user/preferences`, `/api/waitlist`, `/api/beta/validate`, `/api/beta/codes`, `/api/dashboard`, `/api/onboarding-status`, `/api/onboarding/visibility-visited` |
| `routes/content.ts` | `/api/articles/:id/generate`, `/improve`, `/api/content-jobs/*`, `/api/keyword-research/*`, `/api/keyword-suggestions`, `/api/popular-topics` |
| `routes/articles.ts` | `/api/articles*`, `/api/distributions*`, `/api/distribute/*`, `/api/geo-rankings*` |
| `routes/prompts.ts` | `/api/brand-prompts/:brandId/*`, `/api/brands/:brandId/citation-runs/*`, `/api/visibility-progress/:brandId` |
| `routes/publications.ts` | `/api/competitors*` |
| `routes/analytics.ts` | `/api/geo-analytics/*`, `/api/geo-opportunities*`, `/api/analyze-sentiment`, `/api/check-crawler-permissions` |
| `routes/dashboard.ts` | `/api/dashboard/*`, `/api/brands/:brandId/alerts`, `/api/brands/:brandId/recommendations` |
| `routes/contentTypes.ts` | `/api/bofu-content*`, `/api/faqs*`, `/api/listicles*`, `/api/wikipedia*`, `/api/geo-tools/summary/:brandId` |
| `routes/intelligence.ts` | `/api/hallucinations*`, `/api/citation-quality*`, `/api/brand-facts*`, `/api/metrics-history/*` |
| `routes/geoSignals.ts` | `/api/geo-signals/{analyze,chunk-analysis,optimize-chunks,pipeline-simulation,schema-audit}` |
| `routes/community.ts` | `/api/community-posts*`, `/api/community-discover`, `/api/community-generate` |
| `routes/assistant.ts` | `/api/assistant/chat`, `/api/assistant/threads*` |
| `routes/factSheet.ts` | `/api/brand-fact-sheet/*` (v1), `/api/brands/:brandId/fact-scrape-enabled` |
| `routes/factSheetV2.ts` | `/api/brand-fact-sheet/{plan,scrape-one,search-llm,user-enrich,aggregate,full-rescrape}` |
| `routes/adminScrapeInspector.ts` | `/api/admin/scrape/:runId`, `/api/admin/scrape/runs/recent`, `/api/admin/scrape/fact/:factId/reverify` |
| `routes/llmJobs.ts` | `/api/llm-jobs`, `/api/llm-jobs/:jobId` |
| `routes/mentions.ts` | mounted at `/api/brand-mentions` via `app.use` - a real `express.Router` |

The mentions module is the only one that uses `Router` and `app.use`. Every
other module attaches directly to `app`.

### 2.4 The public-route allowlist

```ts
// server/auth.ts:180-218
const PUBLIC_API_ROUTES = new Set<string>([
  "POST /api/auth/register", "POST /api/auth/login", "POST /api/auth/logout",
  "POST /api/auth/forgot-password", "POST /api/auth/reset-password",
  "POST /api/auth/resend-verification",
  "POST /api/waitlist", "POST /api/stripe/webhook", "POST /api/webhooks/resend",
  "POST /api/unsubscribe", "GET /api/unsubscribe", "GET /api/logo-proxy",
  "POST /api/cron/daily-orchestrator",
  "GET /api/stripe/products", "GET /api/stripe/publishable-key",
  "POST /api/enterprise-inquiry",
]);
```

Everything else under `/api/` requires a Supabase bearer token.

---

## 3. Scheduled jobs

There are two schedulers. Both exist. Both run the same job functions.

### 3.1 In-process cron - `initScheduler()` in `server/scheduler.ts:770`

Started from `server/index.ts:51` (local dev) and from `server/nitroBoot.ts:127`
(built server). `nitroBoot` skips it when `DISABLE_IN_PROCESS_SCHEDULER` is set.

| Job | Default expression | Env override | What it does |
|---|---|---|---|
| account-purge | `0 3 * * *` | `ACCOUNT_PURGE_CRON` | Hard-deletes users past the 30-day grace. Deletes the Supabase auth row first, then the `users` row. |
| brand-purge | `30 3 * * *` | `BRAND_PURGE_CRON` | Hard-deletes brands past the 30-day grace. Clears tour state first. |
| tour-events-cleanup | `0 2 * * *` | `TOUR_EVENTS_CLEANUP_CRON` | Retains 90 days of `tour_events`. |
| auto-citation | `0 * * * *` (hourly) | `AUTO_CITATION_CRON` | Runs tracked prompts for every due brand. |
| brand-activation | `0 * * * *` (hourly) | `BRAND_ACTIVATION_CRON` | The weekly per-brand ledger sweep. |
| detect-fact-scrape-failure | `0 11 * * *` | `DETECT_FACT_SCRAPE_FAILURE_CRON` | Alerts on 3 consecutive failed `cron_refresh` scrapes. |
| weekly-catchup-kickoff | `0 6 * * 1` (Monday) | `WEEKLY_CATCHUP_CRON` | Starts one `weekly_catchup` workflow run per brand. |
| weekly-report | `0 8 * * 0` (Sunday) | `WEEKLY_REPORT_CRON` | Re-runs prompts, then emails the visibility report. Registered only when Resend is configured. |

Two crons were removed and the code says so: the 30-second workflow tick (now
driven lazily from `isAuthenticated`, `server/auth.ts:105`) and the 5-minute
weekly-digest aggregator (now driven when a `weekly_catchup` run reaches a
terminal state).

Every job body is wrapped in a Postgres advisory lock. `weekly-report`,
`auto-citation` and `mention-scan` add a debounce window on top.

### 3.2 The daily orchestrator - `POST /api/cron/daily-orchestrator`

`server/routes/cron.ts`. Authenticated by `CRON_SECRET`, in either an
`Authorization: Bearer` header or an `x-cron-secret` header. **`vercel.json`
declares no `crons` array**, so nothing on Vercel calls this on a schedule
today. An external caller must drive it.

It runs 26 steps against a wall-clock budget, each with a soft cap. Order is
deliberate: cheap and gated first, open-ended last.

| Step | Cap | Gate | Work |
|---|---|---|---|
| fail-stuck-content-jobs | 5s | every tick | Fails jobs stuck 60 min, refunds the article quota. |
| fail-stale-scan-jobs | 5s | every tick | Fails mention scans stuck 30 min. |
| reconcile-orphan-citation-runs | 5s | every tick | Marks abandoned runs failed. |
| resume-in-flight-autopilots | 10s | every tick | Drives onboarding autopilots to completion. |
| drain-pending-content-jobs | 8s | every tick | One article slice for the oldest advanceable job. |
| drain-pending-citation-runs | 10s | every tick | One slice for the oldest run stale by 30s. |
| tour-events-cleanup | 5s | every tick | 90-day retention. |
| detect-fact-scrape-failure | 5s | every tick | Serial-failure alert. |
| fact-scrape-backstop | 30s | every tick | Completes runs abandoned by the client. |
| v2-lifecycle-cleanup | 30s | every tick | Retention: pages 7d, runs 30d, logs 90d, plus expired cache and slots. |
| llm-jobs-drain | 20s | every tick | Polls background OpenAI Responses for orphaned `llm_jobs`. |
| llm-jobs-prune | 3s | every tick | Deletes expired `llm_jobs`. |
| signals-retention-prune | 5s | every tick | `geo_signal_runs` 90 days and top-100 per brand; `schema_audits` 30 days. |
| fact-scrape-events-prune | 5s | every tick | 90-day retention. |
| v2-weekly-summary | 20s | Monday UTC | Weekly fact summary. |
| account-purge | 5s | every tick | Same job as the cron. |
| brand-purge | 5s | every tick | Same job as the cron. |
| chatbot-prune | 5s | every tick | Prunes chatbot messages. |
| stripe-products-setup | 5s | if `STRIPE_SECRET_KEY` | Idempotent catalogue sync. Also gated by `STRIPE_PRODUCT_SYNC`. |
| auto-citation | 30s | every tick | Same job as the cron, with a deadline. |
| brand-activation | 45s | every tick | The ledger sweep, with a deadline. |
| weekly-catchup-kickoff | 5s | Monday UTC | Same job as the cron. |
| weekly-digest-aggregator | 10s | every tick | Sweep fallback for the lazy digest. |
| weekly-report-legacy | 20s | Sunday UTC | Same job as the cron. |
| fact-reverification-batch | 30s | every tick | Re-verifies up to 20 stale facts. |
| v2-fact-sheet-refresh | 50s | every tick | Full v2 pipeline for brands stale by 7+ days. Runs last on purpose. |

The comments state measured overruns: `fact-reverification-batch` took 244s
against a 30s cap, and `v2-fact-sheet-refresh` 81.7s against a 50s cap for one
brand. The caps are advisory - a step only checks its deadline between items.

### 3.3 The per-brand activation ledger

`server/lib/brandActivation.ts`. Five sub-jobs, ordered cheapest first:

```ts
// server/lib/brandActivation.ts:41-47
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const JOBS = ["siteHealth", "mentionScan", "listicleScan", "perception", "competitors"] as const;
```

Each sub-job is due 7 days after it last ran. The ledger is one JSON row per
brand in `system_state`, keyed `brand_jobs:<brandId>`. The stamp is written on
**attempt**, not on success, so a permanently failing scan gets the same weekly
backoff as a success. The sweep selects only brands whose owner is on a paying
tier.

### 3.4 The citation cadence

```ts
// server/scheduler.ts:194-200
function isBrandDueForCitation(brand: { lastAutoCitationAt: Date | null }): boolean {
  if (!brand.lastAutoCitationAt) return true; // never run before
  const now = new Date();
  const daysSinceLast =
    (now.getTime() - brand.lastAutoCitationAt.getTime()) / (24 * 60 * 60 * 1000);
  return daysSinceLast >= 6; // at least ~1 week
}
```

The cadence is **not configurable**. The `auto_citation_schedule`,
`auto_citation_day`, `auto_citation_hour` and `auto_citation_active` columns are
still on `brands` but the cron no longer reads them. A deadline-truncated run
does not stamp `lastAutoCitationAt`, so it resumes on the next tick.

---

## 4. The plan and billing model

### 4.1 The limits table - quoted in full

```ts
// shared/schema.ts:123-132
export const usageLimits = {
  pending: { articlesPerMonth: 0, maxBrands: 0 },
  readonly: { articlesPerMonth: 0, maxBrands: 0 },
  free: { articlesPerMonth: 5, maxBrands: 1 },
  beta: { articlesPerMonth: 20, maxBrands: 3 },
  pro: { articlesPerMonth: 0, maxBrands: 3 },
  agency: { articlesPerMonth: 40, maxBrands: 10 },
  enterprise: { articlesPerMonth: 200, maxBrands: -1 },
  admin: { articlesPerMonth: -1, maxBrands: -1 },
};
```

`-1` means unlimited. `0` means the feature is not part of the plan at all.
Pro deliberately generates **zero** articles - article generation is the paid
line between Pro and Agency.

### 4.2 Prices and sellable tiers

```ts
// shared/schema.ts:135-153
export const SELLABLE_TIERS = ["pro", "agency"] as const;

export const PLAN_PRICE_CENTS: Record<SellableTier, number> = {
  pro: 9900,
  agency: 50000,
};
```

Only Pro ($99/month) and Agency ($500/month) can be bought self-serve.
Enterprise is sales-led through `POST /api/enterprise-inquiry`. Free is legacy.

`server/setupProducts.ts` writes the same two products into Stripe, but only
when `STRIPE_PRODUCT_SYNC` is `true`/`1`/`yes`. Without that flag the sync is a
no-op, so merely booting the app cannot mint live products.

### 4.3 The tier resolver

```ts
// shared/schema.ts:196-199
export function resolveTier(user: { accessTier?: string | null }): keyof typeof usageLimits {
  const tier = (user.accessTier ?? "pending") as keyof typeof usageLimits;
  return tier in usageLimits ? tier : "pending";
}
```

There is no date arithmetic. Stripe owns the trial; the webhooks drive every
transition. An unknown tier fails **closed**, to `pending` (zero entitlements),
not to `free`.

### 4.4 Which tiers cost money to serve

```ts
// shared/schema.ts:177
export const PAYING_TIERS: string[] = ["pro", "agency", "enterprise", "beta", "free", "admin"];
```

Both the citation-scan selector (`server/scheduler.ts:208-214`) and the
activation sweep (`server/lib/brandActivation.ts:207-214`) join `users` and
filter `access_tier = ANY(PAYING_TIERS)`. A `readonly` or `pending` account keeps
its data visible but consumes no recurring LLM spend.

### 4.5 Every gate

| Gate | Where | Behaviour |
|---|---|---|
| Brand quota, pre-check | `routes/brands.ts:84-95` | Counts existing brands, returns 403 with `limitReached: true` before any LLM call. |
| Brand quota, authoritative | `lib/usageLimit.ts:175-201` (`withBrandQuota`) | `SELECT ... FOR UPDATE` inside the insert transaction. Message: "Brand limit reached - your `<tier>` plan allows `<n>`." |
| Article quota | `lib/usageLimit.ts:66-87` (`withArticleQuota`) | "You've reached your monthly limit of `<n>` articles. Upgrade at /pricing for more." Refundable on transient infra failures via `refundArticleQuota`. |
| Signup gate | `client/src/components/TrialGate.tsx:87-139` | Blocks the whole app for `pending`. Fails **open** when `hasPurchasablePlan()` sees no correctly-priced Stripe plan, so a stale catalogue cannot lock everyone out. |
| Trial banner | `TrialGate.tsx:38-78` | Counts days left; a `readonly` account gets a "Reactivate" banner, not a paywall. |
| Price-match gate | `pricing.tsx:175-187` and `shared/schema.ts:157-172` | A Stripe price that does not equal `PLAN_PRICE_CENTS` disables checkout for that plan. The button falls back to "Contact Sales". |
| Checkout allow-list | `routes/billing.ts:187-205` | The price must be active, recurring, on an active product carrying `metadata.tier`. |
| Double-subscription guard | `routes/billing.ts:234-279` | An existing `active` **or** `trialing` subscription is updated in place with `proration_behavior: "always_invoice"`, never sold a second time. Idempotency key `checkout:<userId>:<priceId>`. |
| Admin gate | `server/auth.ts:171-176` | `users.is_admin === 1`. Guards `/api/beta/codes`, `/api/admin/scrape/*`. `/api/admin/tours/metrics` returns 404 (not 403) to non-admins. |

### 4.6 The trial

```ts
// shared/schema.ts:202
export const TRIAL_DAYS = 14;
```

The card is collected first. `routes/billing.ts:292` passes
`subscription_data: { trial_period_days: TRIAL_DAYS }` to Checkout. Stripe
charges on day 15 and fires `customer.subscription.trial_will_end` for the
reminder email.

`webhookHandlers.ts` maps subscription status to tier: `trialing` and `active`
grant the product's `metadata.tier`; anything terminal sets `readonly`, never
`free` (free carries real entitlements a cancelled customer must not inherit).

---

## 5. The onboarding flow

Two distinct entry paths exist.

### 5.1 Guided setup - `/welcome`

A four-scene state machine in `client/src/pages/welcome.tsx:29`
(`type Scene = "input" | "scraping" | "confirm" | "activating"`).

1. **Input.** The user types a domain. `validateDomain` runs live for the submit
   gate and debounced at 300 ms for the inline error message.
2. **Scraping.** `POST /api/onboarding/scrape-stream` opens a Server-Sent-Events
   stream. Server side (`routes/onboarding.ts:112`):
   - one active scrape per user, held in an in-memory `Map`;
   - fetch the homepage through `safeFetchText` (SSRF-guarded, 2 MB, 10 s);
   - scrape the logo and mirror it into Supabase Storage under a SHA-1 of the
     domain;
   - strategy 1 - LLM over the homepage text (max 8000 chars);
   - strategy 2 - if fewer than 3 facts, read `sitemap.xml`, pick up to 3 URLs
     matching `about|team|company|story`, and re-run the LLM on the merge.
   - A third strategy was deliberately removed: asking the model about the
     domain with no page content at all. The comment calls it "a hallucination
     generator" (`routes/onboarding.ts:303-310`).
3. **Confirm.** Every field is editable. Untouched fields carry an
   "auto-detected" badge. Competitors are editable rows with favicons proxied
   through `/api/logo-proxy`.
4. **Confirm submit.** `POST /api/onboarding/confirm` inserts the brand inside
   `withBrandQuota`, sets `autopilotStatus: "pending"`, inserts the confirmed
   competitors, then fires `runOnboardingAutopilot` inside Vercel `waitUntil`
   with a 50-second deadline.
5. **Activating.** The page polls `GET /api/onboarding/autopilot-status/:brandId`
   every 3 seconds until `completed` or `failed`. Three ordered phases are shown
   (`welcome.tsx:150-166`): fact sheet → prompts → citations. On `completed` it
   navigates to `/dashboard?brandId=...` after 1100 ms. On `failed` it offers
   Retry (`POST /api/onboarding/autopilot-retry`, an atomic
   failed→pending compare-and-swap that 409s on a lost race).

The autopilot is resumable server side. Whatever the 50-second deadline does
not finish is driven to completion by the cron `resume-in-flight-autopilots`
step and the fact-scrape backstop.

### 5.2 Fast path - `/brands`

`POST /api/brands/create-from-website` does the whole thing in one request:
quota pre-check, URL normalisation, SSRF-guarded fetch, one LLM call against
`MODELS.brandAutofill` with a 25-second abort, then insert inside
`withBrandQuota`. Competitor discovery fires in `waitUntil`. Duplicate names
return 409 unless `{ force: true }`. When the LLM returns nothing usable the
response carries `analysisQuality: "partial"` and the UI tells the user to
fill the gaps by hand.

### 5.3 Checklist state

Two stores, deliberately separate:

- `users.onboarding_state` JSONB, written through `PATCH /api/onboarding/state`.
  The allowlist is five keys (`routes/onboarding.ts:41-47`): `guidedSeen`,
  `checklistDismissed`, `checklistExpanded`, `sidebarSeenAt`,
  `platformGuideCompletedSteps`. Unknown keys are dropped silently; a body with
  no recognised key returns 400.
- `users.visibility_guide_visited_at`, stamped once by
  `POST /api/onboarding/visibility-visited`.

`GET /api/onboarding-status` aggregates brands, articles, citations, cited
rankings, citation-run count and the state blob.

### 5.4 The `/setup` page

`client/src/pages/setup.tsx` is 43 lines. It is a `SpineShell` with three lazy
tabs that embed existing pages unchanged: Brands, Fact Sheet, Visibility
Checklist. Its own comment calls it a "Phase 0 scaffold".

---

## 6. Multi-brand support

### 6.1 How brands are scoped

Single-tenant rooted at `users`. `brands.user_id` has `ON DELETE CASCADE`.
Everything else hangs off `brand_id`.

Scoping is **application level only**. There is no Postgres row-level security.
Three mechanisms enforce it:

1. `enforceBrandOwnership` (`auth.ts:141`) - checks a `brandId` found in the
   query string or the JSON body, on every `/api/*` request.
2. `app.param("brandId", brandIdParamHandler)` (`auth.ts:157`) - fires whenever a
   matched route template contains `:brandId`.
3. Explicit helpers - `storage.getBrandByIdForUser(id, userId)` and
   `requireBrand(brandId, userId)` in modules registered before the global
   guards.

All three return **404, not 403**, on a miss. That is anti-enumeration.

Soft delete: `DELETE /api/brands/:id` sets `deleted_at` and
`deletion_scheduled_for` 30 days out. List queries filter `deleted_at IS NULL`,
so the brand vanishes immediately. The `brand-purge` job hard-deletes after the
grace, and the FK cascade sweeps the child tables.

Optimistic locking: `PUT /api/brands/:id` accepts `expectedVersion`. A mismatch
returns 409 with `code: "version_conflict"` and the current row.

### 6.2 How many brands a user may have

| Tier | Max brands |
|---|---|
| pending | 0 |
| readonly | 0 |
| free (legacy) | 1 |
| beta | 3 |
| **pro** | **3** |
| **agency** | **10** |
| enterprise | unlimited (`-1`) |
| admin | unlimited (`-1`) |

### 6.3 What multi-brand does NOT include

There is no team, no seat, no invite, no role and no per-brand permission. The
schema has no `teams`, `memberships` or `roles` table. A brand belongs to
exactly one user. There is no way to share a brand with a colleague.

---

## 7. User-visible features on the assigned client pages

### 7.1 `/settings` - `client/src/pages/settings.tsx`

Nine panels, in this order:

1. **Profile** - shows the signed-in email; edits first name, last name and
   timezone. The timezone list comes from `Intl.supportedValuesOf("timeZone")`.
   `PATCH /api/user/profile` treats a trimmed-empty name as "skip" so a
   pre-hydration blank form cannot wipe the saved value.
2. **Appearance** - light / dark / system toggle. A hint line reports the
   resolved theme when "system" is chosen.
3. **Change password** - current, new, confirm. Client floor is 8 characters;
   the server applies the shared policy plus the Supabase leaked-password check.
   On success all **other** sessions are revoked.
4. **Billing** - current tier from `resolveTier(user)`; live subscription read
   from Stripe (plan name, amount, interval); one of three mutually exclusive
   status lines (cancels on / trial first-charge on / renews on); a "Payment
   method" button that opens the Stripe portal; Cancel and Resume, never both;
   a confirmation dialog whose wording differs for a trial; and an invoice list
   of up to 24 rows with a PDF link, drafts filtered out, unpaid rows flagged.
5. **Integrations** - one card. Buffer, connected or not.
6. **Notifications** - one toggle today (`weekly_report`), rendered from
   `NOTIFICATION_TYPES`. Optimistic, with rollback on error.
7. **Onboarding tours** - a wildcard "don't auto-show tours" switch, disabled
   until the tour state has actually loaded.
8. **Delete account** - password plus the literal word `DELETE`. Schedules a
   30-day soft delete, then signs the user out after 1.5 s.
9. **Export your data** - downloads a JSON blob. One export per account per 24
   hours.

### 7.2 `/pricing` - `client/src/pages/pricing.tsx`

- Three cards: Pro, Agency (both from `SELLABLE_TIERS`) and a hard-coded
  Enterprise card.
- The app owns the plan list and the marketing copy; Stripe owns the price.
  Both drift directions are handled: a plan in Stripe but not in the app is
  ignored; a plan in the app but not in Stripe still renders, with no
  Subscribe button.
- A `?success=true` / `?canceled=true` banner after the Stripe round trip.
- A `TRIAL_DAYS`-day trial badge and the explicit line "Start free for 14 days".
- Button label follows the real state: "Book a call" for Enterprise,
  "Start free trial" when signed out (goes to `/register`, because Checkout
  would 401), "Subscribe" only when a verified price exists, otherwise
  "Contact Sales".
- An Enterprise enquiry dialog: name, work email, company, message.
- A beta invite-code redemption box.
- A "Trusted by Leading Brands" strip with three placeholder icons and no
  logos.

### 7.3 `/brands` - `client/src/pages/brands.tsx`

- "Add Your Brand" - one input, one button, and rotating loading messages while
  the website is analysed.
- Two secondary links: "Use the guided setup instead" (to `/welcome`) and
  "Or add your brand details manually" (a modal form).
- A brand grid, up to 3 columns. Each card shows name, company, industry, a safe
  external website link, target audience, tone, description and the first 3
  products with a "+N more" pill.
- Edit and Delete per card. Delete goes through `DeleteBrandDialog`.
- A "Next Step" panel linking to `/ai-visibility`.
- A manual-create modal and an edit modal, both `BrandFormFields`, validated on
  blur.
- Error, loading-skeleton and empty states.
- Brand-limit errors are surfaced with the server's own message under the title
  "Brand limit reached".

### 7.4 `/welcome` and `/setup`

Covered in section 5.

---

## 8. Comparison with Trakkr

Source: `docs/trakkr-clone/14-features-and-deeplinks.md`, sections 3, 4.17,
4.22, 4.23 and 9.

### 8.1 Navigation (section 3)

Trakkr ships 18 sidebar links in 4 groups, plus 6 unlisted routes.

| Trakkr route | venturecite equivalent | Verdict |
|---|---|---|
| `/dashboard` | `/dashboard` (`routes/dashboard.ts`, 12 endpoints) | **SAME** |
| `/actions` | No work-queue page. `agent_tasks` exists as a table but has no route module. | **ABSENT IN VENTURECITE** |
| `/prompts` | `/api/brand-prompts/*` - 21 endpoints, including suggestions, generations, reorder and per-run details | **STRONGER** - venturecite adds funnel stage, region, prompt generations and a suggestion accept/reject loop. |
| `/research` | No one-off study surface outside the tracked set. | **ABSENT IN VENTURECITE** |
| `/diagnose` | No per-loss explanation page. `/api/dashboard/gap-matrix/:brandId` is the nearest thing. | **WEAKER** |
| `/pages` | `/api/dashboard/site-health/:brandId/pages` | **WEAKER** - a health list, not a URL inventory. |
| `/citations` | `/api/dashboard/cited-urls/:brandId`, `citation_runs`, `geo_rankings`, `tracked_content_urls` | **SAME** |
| `/competitors` | `routes/publications.ts` - discovery, leaderboard, ignore, latest citations, plus `competitor_geo_rankings` | **STRONGER** - per-run, per-prompt competitor fidelity. |
| `/perception` | `/api/dashboard/perception/:brandId` and `brand_perception_runs` (5 axes) | **SAME** |
| `/traffic/analytics` (Visitors) | Nothing. No Google Analytics integration anywhere in the repo. | **ABSENT IN VENTURECITE** |
| `/traffic/crawler` (Crawlers) | `POST /api/check-crawler-permissions` reads robots.txt for ~15 known AI crawlers. No log ingestion. | **WEAKER** - see 8.4. |
| `/create` (Content) | `routes/content.ts` and `routes/articles.ts` - a full job queue, revisions, auto-improve | **STRONGER** |
| `/optimize` | `routes/geoSignals.ts` - analyze, chunk analysis, chunk optimisation, pipeline simulation, schema audit | **SAME** |
| `/ai-pages` | Nothing. | **ABSENT IN VENTURECITE** |
| `/reddit` | `routes/community.ts` plus the mentions scanner (Reddit, Hacker News, Quora) | **SAME** |
| `/automations` | No user-facing rule builder. Automation is fixed server-side crons. | **ABSENT IN VENTURECITE** |
| `/integrate` | See 8.2. | **WEAKER** |
| `/settings` | See 8.3. | **WEAKER** |
| `/learn` | Landing-page content only, no in-app docs route. | **WEAKER** |
| `/reports` | No reports route. `citation_runs` history is on the citations page. | **WEAKER** |
| `/explore` | No pivot-table builder, no saved views, no CSV export. | **ABSENT IN VENTURECITE** |
| `/activity` | No unified event feed. `audit_logs` exists but has no UI. | **ABSENT IN VENTURECITE** |
| `/agent` | `routes/assistant.ts` - threads, messages, per-user token budget | **SAME** - venturecite has no memory panel ("What I know about this brand") and no `Cmd+K`. |
| `/agency` | Nothing. See 8.5. | **ABSENT IN VENTURECITE** |
| `/upgrade` | `/pricing` | **SAME** |

### 8.2 Integrations (section 4.17)

Trakkr: 27 cards in 7 groups. venturecite has **one** user-facing integration.

| Trakkr group | Trakkr cards | venturecite |
|---|---|---|
| Your website | WordPress, Shopify, Webflow, GitHub | **ABSENT IN VENTURECITE** - no CMS connector at all |
| AI traffic | AI Crawler Tracking, AI Pages, Google Search Console, Google Analytics | **ABSENT IN VENTURECITE** - all four |
| Advertising | OpenAI Ads | **ABSENT IN VENTURECITE** |
| Alerts and tasks | Zapier, Make, Slack, Discord, Linear, GitHub Issues, Trello, Notion, Asana, Jira, Microsoft Teams, Gmail | **WEAKER** - `alert_settings` has `slack_webhook_url` and `slack_enabled` columns and a `lib/slackNotify` sender, so Slack is partly there. The Settings page exposes no UI for it. The other eleven are absent. |
| Export | CSV Export, Google Sheets, Looker Studio | **WEAKER** - `GET /api/user/export` returns one JSON blob for the whole account, once per 24 hours. That is a GDPR export, not a reporting export. No CSV. |
| Developer | Webhooks, REST API, MCP Server | **ABSENT IN VENTURECITE** - see 8.4. venturecite *receives* two webhooks (Stripe, Resend) but *sends* none. |
| Not in Trakkr | - | Buffer social publishing. `routes/buffer.ts`, five endpoints, OAuth plus post. **STRONGER** on this one card. |

Verdict on the integration layer as a whole: **WEAKER**. 1 card against 27.

### 8.3 Settings (section 4.22)

Trakkr: eight tabs, addressed by `?tab=`.

| Trakkr tab | venturecite | Verdict |
|---|---|---|
| Profile | Profile panel - name, timezone, email display | **SAME** |
| Brands | Lives on `/brands` and `/setup`, not in Settings | **SAME** (different location) |
| Billing | Billing panel - subscription state, cancel, resume, portal, 24 invoices with PDFs | **STRONGER** - Trakkr's doc records no in-app cancel or invoice table. |
| Team | Nothing. No team, seat, invite or role anywhere in the 59 tables. | **ABSENT IN VENTURECITE** |
| White-Label | Nothing. Zero matches for `white-label`, `whiteLabel` or `white_label` across the repo. | **ABSENT IN VENTURECITE** (Trakkr's own tab renders an empty body - the doc flags it as defect 3) |
| Custom | Nothing. | **ABSENT IN VENTURECITE** |
| Security | Password change with other-session revocation; account deletion with a 30-day grace | **SAME** |
| Developer | Nothing. No API keys, no `openapi.json`. | **ABSENT IN VENTURECITE** |
| Not in Trakkr | Appearance (theme), Notifications, Onboarding tours, Data export | **STRONGER** on those four |

Verdict: **WEAKER** overall. Four of eight tabs have no counterpart, and three
of those four (Team, White-Label, Developer) are structural gaps, not cosmetic
ones.

### 8.4 Plan gates (section 9)

| Trakkr requirement | Trakkr behaviour | venturecite |
|---|---|---|
| Dashboard, Prompts, Diagnose, Competitors, Perception, Citations - "model access only" | Works without setup | **SAME** - these need only a brand plus prompts. |
| Pages, Site Optimization - "a public website" | Works | **SAME** - `site-health` and `geo-signals` need `brands.website`. |
| Crawlers - "a log drain from your host" | Does **not** work without it | **ABSENT IN VENTURECITE** - there is no log drain, so the deeper feature does not exist to gate. venturecite's robots.txt check needs nothing. |
| Visitors - "Google Analytics" | Does not work without it | **ABSENT IN VENTURECITE** |
| Search Console - "a verified Google property" | Does not work without it | **ABSENT IN VENTURECITE** |
| Reddit - "Reddit credentials" | Does not work without it | **STRONGER** - venturecite's mention scanner reads Reddit with no user credentials, and `source_health` gives per-source backoff. |
| Agency, White-Label - "the Scale plan" | Locked behind a plan | **ABSENT IN VENTURECITE** - no such features, so no such gate. |
| "Six of the eight models returned no data" | A new Trakkr account shows mostly empty charts | **STRONGER** - venturecite's onboarding autopilot runs fact sheet, prompts and citations before the user reaches the dashboard, and the activation sweep fills mentions, listicles, perception, site health and competitors. A new brand is not empty. |

**Gate mechanism comparison.** Trakkr gates by *plan* (Scale unlocks Agency and
White-Label) and by *connection* (no GA means no Visitors). venturecite gates by
*quota* (`maxBrands`, `articlesPerMonth`) and by *entitlement state*
(`pending` blocks the app, `readonly` freezes new work). venturecite has no
feature-level plan gate at all: Pro and Agency differ only in brand count and
article allowance. **WEAKER** as a monetisation surface - there is no
feature that only a higher plan unlocks.

### 8.5 Trakkr platform features venturecite does NOT have

Each answer below is a direct statement about venturecite.

| Trakkr feature | Does it exist in venturecite? | Evidence |
|---|---|---|
| **AI crawler log collector** (`/traffic/crawler`, 10 host connectors, 7 CMS connectors, log drain) | **No.** venturecite cannot ingest server logs. What it has is `server/lib/crawlerAccess.ts` - a robots.txt fetcher that evaluates whether ~15 named AI crawlers are allowed, blocked or unknown, exposed at `POST /api/check-crawler-permissions` and reused by the site-health panel. It tells you whether a bot *may* crawl. It never tells you whether a bot *did*. There is no log-drain endpoint, no host connector, and no table holding crawler hits. | No `logdrain` match in the repo; `AI_CRAWLERS` is a static list. |
| **AI Pages crawler rendering** (Detect, Transform, Serve, Track; 17 crawlers, 9 platforms, 5 features) | **No.** Nothing in venturecite serves a different page to a crawler. There is no edge middleware, no per-crawler transform, no install step and no tracking table. | Zero matches for `ai-pages` or any transform pipeline. |
| **MCP server** (76 tools, 12 groups, 18 resources, 6 workflows) | **No.** venturecite exposes no MCP server. The string "mcp" appears only inside prompt text and marketing copy on the landing page. There is no MCP transport, no tool registry and no `@modelcontextprotocol` dependency. | `package.json` has no MCP package; no MCP route. |
| **Public API** (96 paths in `openapi.json`, `/get-brands` shape, 27 documented) | **No.** venturecite has no public API. There is no `openapi.json` anywhere in the repo, no API key table, no API key column on `users`, and no key-authenticated route. Every `/api/*` route is authenticated by a Supabase user JWT and is meant for the app's own browser client. | `grep -ril openapi` returns nothing; `PUBLIC_API_ROUTES` holds 16 entries, all internal or webhook. |
| **White-label portal** (`/settings?tab=white-label`, `/client`) | **No.** Zero matches for `white-label`, `whiteLabel` or `white_label` in `server/`, `client/src/`, `shared/` or `src/`. There is no branding table, no custom domain support and no client-facing portal route. | Grep returns no files. |
| **Agency portfolio layer** (`/agency`, 8 routes, Clients / Actions / Reports / Pitches) | **No.** The word "agency" in venturecite is only a **plan name** - `usageLimits.agency`, `PLAN_PRICE_CENTS.agency` and the Stripe product. It buys 10 brands and 40 articles a month. It buys no client-management surface. There is no clients table, no workspace concept, no cross-brand portfolio view, no pitch builder and no per-client report. A user with 10 brands sees 10 independent brands. | `SELLABLE_TIERS` and `setupProducts.ts`; no `/agency` route, no clients table among the 59. |

Also absent, from the same sections:

- **Team and seats.** No membership model. One brand, one owner.
- **Outbound webhooks.** venturecite verifies two *inbound* webhooks and sends none.
- **Zapier / Make / Linear / Jira / Notion / Asana / Trello / Discord / Teams / Gmail.** None.
- **Google Search Console and Google Analytics.** Neither.
- **CSV / Google Sheets / Looker Studio export.** None. Only the single-blob JSON GDPR export.
- **`/explore` pivot builder, saved views and immediate export.** None.
- **`/activity` unified event feed.** `audit_logs` is written but never rendered.
- **`/reports` timeline and monthly views with a `/reports/<id>` detail.** None.
- **OpenAI Ads.** None.

### 8.6 Where venturecite is stronger

Stated plainly, because the comparison is not one-directional.

1. **Fact sheet.** Nine tables, a slice-resumable scrape agent, per-fact
   provenance and confidence, a user-override flag, per-fact re-verification on
   a cron, per-brand monthly cost caps and an admin run inspector. Trakkr's
   document records no equivalent.
2. **Hallucination detection.** `brand_hallucinations` with severity,
   remediation status, seen-count and source traceback to the originating
   ranking. No Trakkr counterpart in the document.
3. **Billing self-service.** In-app cancel, in-app resume, an invoice table with
   PDFs, and an existing-subscription upgrade that swaps the price in place
   rather than selling a second subscription.
4. **Account compliance.** 30-day soft delete with a purge cron, a JSON data
   export, an audit log and per-user notification preferences.
5. **Onboarding.** A server-driven, resumable, three-phase activation pipeline
   that fills the dashboard before the user first sees it. Trakkr's document
   says a new account "shows mostly empty charts".
6. **Cost control.** `api_costs`, `brand_monthly_cost_caps`,
   `llm_concurrency_slots`, a paying-tier filter on every scheduled producer,
   and article-quota refunds on transient infrastructure failures.

---

## 9. Summary verdict

| Layer | Verdict |
|---|---|
| Account and identity | **SAME**, with a compliance edge to venturecite |
| Billing self-service | **STRONGER** in venturecite |
| Plan gating as a monetisation surface | **WEAKER** - no feature-level gate, only quotas |
| Team, seats, roles | **ABSENT IN VENTURECITE** |
| Integrations | **WEAKER** - 1 card against 27 |
| Developer platform (API, MCP, webhooks out) | **ABSENT IN VENTURECITE** |
| Agency and white-label | **ABSENT IN VENTURECITE** |
| Traffic measurement (crawler logs, GA, GSC) | **ABSENT IN VENTURECITE** |
| Reporting and export | **WEAKER** |
| Measurement core (prompts, citations, competitors, perception) | **SAME to STRONGER** |
| Fact sheet and hallucination detection | **STRONGER** in venturecite |
| Data model | 59 tables, all live, all reachable from a feature |
