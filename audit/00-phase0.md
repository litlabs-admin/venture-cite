# Phase 0 — Codebase Discovery

Factual snapshot for the 58-dimension production-readiness audit.
All downstream group agents should reference this file before auditing.

---

## 1. STACK FINGERPRINT

**Frontend** (from `package.json`):
- React 18.3.1 + react-dom 18.3.1
- Vite 5.4.20, `@vitejs/plugin-react` 4.7.0
- Wouter 3.3.5 (client-side router)
- TanStack Query 5.60.5
- Tailwind 3.4.17 + tailwindcss-animate + `@tailwindcss/typography`
- Radix UI primitives (26 packages)
- React Hook Form 7.55.0 + `@hookform/resolvers` 3.10.0
- Zod 3.24.2 for validation
- Framer Motion 11.13.1
- next-themes 0.4.6 (dark/light mode)
- react-markdown 10.1.0 + rehype-sanitize 6.0.0
- react-helmet-async 3.0.0 (SEO tags)
- `@stripe/react-stripe-js` 5.0.0 + `@stripe/stripe-js` 8.0.0
- `@supabase/supabase-js` 2.103.0

**Backend**:
- Node.js + TypeScript (ESM) — no Node engine pin in package.json
- Express 4.21.2
- Drizzle ORM 0.45.2 + drizzle-kit 0.31.4 + drizzle-zod 0.7.0
- Postgres via `pg` 8.13.1 (raw pool) + Supabase
- helmet 8.0.0 (security headers)
- express-rate-limit 7.5.0
- cors 2.8.5
- node-cron 4.2.1
- openai 5.23.1
- stripe 20.0.0
- resend 6.11.0 (transactional email)
- ws 8.18.0 (WebSocket)
- dotenv 17.4.2

**Build/Run scripts**:
- `dev`: `cross-env NODE_ENV=development tsx server/index.ts`
- `build`: `vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist`
- `start`: `cross-env NODE_ENV=production node dist/index.js`
- `check`: `tsc` (type check only — no test runner)
- `db:push`: `drizzle-kit push`

**Version/CVE concerns**:
- No lint, format, or test tooling in package.json (no eslint, prettier, vitest, jest, playwright)
- `dotenv 17.4.2` — major version newer than most guides; verify behavior
- `express 4.21.x` — modern; `express 5` is out but not adopted (probably fine)
- `helmet 8.0.0` current major
- `stripe 20.0.0` current (Stripe API version set per client)
- No `@types/*` missing flags observed for prod deps
- `bufferutil` is an optionalDependency for `ws` performance — OK
- `tw-animate-css` + `tailwindcss-animate` both listed — possible redundancy
- `react-icons` + `lucide-react` both listed — possible redundancy
- `react-helmet-async` relies on a deprecated-ish maintenance state; for React 18+ consider alternatives

---

## 2. REPO STRUCTURE

```
venturecite/
├── client/src/
│   ├── App.tsx                # Wouter routes + lazy-loading
│   ├── pages/                 # 34 page components
│   ├── components/            # Shared + Radix-wrapped ui/
│   ├── hooks/
│   ├── lib/                   # auth-utils, authStore, draftStore, queryClient, supabase, urlSafety, utils
│   └── main.tsx
├── server/
│   ├── index.ts               # Entry, CSP/CORS/helmet/rate-limit, migrations runner, graceful shutdown
│   ├── routes.ts              # 7226 lines — ~229 endpoints
│   ├── auth.ts                # 309 lines — Supabase bearer auth + ownership param handlers
│   ├── databaseStorage.ts     # 2293 lines — DAO layer
│   ├── storage.ts             # Storage facade
│   ├── db.ts                  # Drizzle + pg.Pool init
│   ├── env.ts                 # Zod env validation
│   ├── scheduler.ts           # node-cron jobs
│   ├── contentGenerationWorker.ts  # Polling worker
│   ├── webhookHandlers.ts     # Stripe webhooks
│   ├── setupProducts.ts       # Stripe product bootstrap
│   ├── stripeClient.ts
│   ├── supabase.ts            # Admin client
│   ├── emailService.ts        # Resend wrapper
│   ├── citationChecker.ts     # LLM-driven citation scan
│   ├── citationJudge.ts       # LLM judge
│   ├── vite.ts                # Dev SSR/HMR middleware
│   └── lib/                   # aiLogger, competitorDiscovery, factExtractor, hallucinationDetector,
│                              # listicleScanner, mentionScanner, metricsSnapshot, modelConfig,
│                              # ownership, promptGenerator, ssrf, suggestionGenerator
├── shared/
│   ├── schema.ts              # 1287 lines — Drizzle tables + Zod insert schemas
│   └── constants.ts
├── migrations/                # 16 SQL files (0000-0015)
├── scripts/
│   ├── seed-stripe-products.ts
│   └── setup-stripe-products.ts
├── docs/
├── .env / .env.example
└── package.json
```

**Import boundaries**:
- Client uses `@/*` (client/src) and `@shared/*` aliases
- Server uses relative imports + `@shared/*`
- `client` never imports from `server`
- Both sides import `shared/schema.ts` (client uses it for types)

---

## 3. ROUTE INVENTORY (229 endpoints)

`server/routes.ts` is the single route file. High-level domain groups observed:

| Domain | Sample paths | Auth |
|---|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET /api/auth/me` | Public (login/register/reset); Auth (me/logout) |
| Brands | `GET/POST/PATCH/DELETE /api/brands`, `POST /api/brands/autofill`, `POST /api/brands/from-website` | Auth + ownership |
| Articles | `GET/POST/PATCH/DELETE /api/articles`, distribution subpaths | Auth + ownership |
| Content generation | `POST /api/content/generate`, `POST /api/content/analyze`, `POST /api/content/rewrite`, `POST /api/drafts`, keyword routes | Auth + rate-limited |
| Citations | `GET /api/citations/*`, `POST /api/citations/run`, `GET /api/citations/history` | Auth + ownership |
| Brand prompts | `GET/POST /api/brands/:id/prompts` | Auth + ownership |
| Visibility / GEO | `GET /api/visibility/progress`, `GET /api/geo-rankings/*` | Auth |
| Analytics | `GET /api/analytics/*`, `GET /api/revenue/*`, `GET /api/ai-traffic/*` | Auth |
| Competitors / intelligence | `GET /api/competitors/*`, `GET /api/listicles/*`, `GET /api/wikipedia/*`, `GET /api/fact-sheet/*`, `GET /api/hallucinations/*`, `GET /api/mentions/*` | Auth |
| Outreach / community | `GET /api/outreach/*`, `GET /api/community/*` | Auth |
| FAQs | `GET/POST /api/faqs/*` | Auth |
| Agents | `GET /api/agents/*` | Auth |
| Onboarding | `POST /api/onboarding/*` | Auth |
| Billing | `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/publishable-key`, `GET /api/billing/products` | Auth (public key endpoint) |
| Stripe webhook | `POST /api/stripe/webhook` | **Raw body, signature verified** (`server/index.ts:70-92`) |
| Waitlist | `POST /api/waitlist` | Public |
| Health | `GET /health` | Public (`server/index.ts:167-179`) |

**Shopify / e-commerce webhooks**: scan `server/routes.ts` for `shopify` — noted as present but **signature verification status TBD per Group E**.

**Rate limiting**: `express-rate-limit` applied at ~10 req/min on AI-generation endpoints (grep `rateLimit` in routes.ts).

---

## 4. PAGE INVENTORY (34 pages)

From `client/src/pages/`:

| Page file | Notes |
|---|---|
| `landing.tsx` | Public marketing page |
| `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx` | Public auth |
| `home.tsx`, `dashboard.tsx` | Authenticated |
| `brands.tsx`, `brand-fact-sheet.tsx` | Brand management |
| `articles.tsx`, `article-view.tsx`, `content.tsx` | Content creation |
| `citations.tsx`, `ai-visibility.tsx`, `ai-intelligence.tsx`, `ai-traffic.tsx` | AI citation tracking |
| `geo-analytics.tsx`, `geo-opportunities.tsx`, `geo-rankings.tsx`, `geo-signals.tsx`, `geo-tools.tsx` | GEO suite |
| `competitors.tsx`, `publication-intelligence.tsx`, `community-engagement.tsx`, `outreach.tsx` | Intelligence |
| `keyword-research.tsx`, `crawler-check.tsx`, `client-reports.tsx`, `faq-manager.tsx`, `revenue-analytics.tsx`, `analytics-integrations.tsx` | Analytics/tools |
| `agent-dashboard.tsx` | Agent status |
| `pricing.tsx` | Billing |
| `not-found.tsx` | 404 |

Routing logic lives in `client/src/App.tsx` — verify auth gates per route.

Per-page API mapping is enormous (34 × N); downstream Group A/B/C agents should grep each page for fetch/queryKey.

---

## 5. DATA ENTITIES (shared/schema.ts)

~40 tables (final list must come from grep of `pgTable(`). Key roots:

- `users` (Supabase-linked id; subscription fields)
- `brands` (`userId` FK — primary tenant root)
- `articles` (`brandId` FK)
- `brandPrompts`
- `citationRuns`, `citationQuality`
- `promptPortfolio`, `promptGenerations`
- `contentGenerationJobs`, `contentDrafts`
- `distributions`
- `keywords`
- `visibilityProgress`, `brandVisibilitySnapshots`
- `aiTrafficSessions`, `purchaseEvents`, `metricsHistory`
- `competitors`, `listicles`, `wikipediaMentions`
- `brandFactSheet`, `brandHallucinations`, `brandMentions`
- `userIntegrations` (migration 0004)
- `userOnboardingFlags` (migration 0014)
- `webhookEvents` (migration 0002 — idempotency)
- `brandCitationSchedule` (migration 0010)
- `schema_migrations` (bootstrapped by `server/index.ts:197`)

**FK hardening**: migration `0003_fk_hardening.sql` exists — confirms at least some cascade-on-delete rules were added after initial schema. **Risk**: cascade deletes across a 40-table graph rooted at `users` or `brands` could silently purge a lot of data.

---

## 6. AUTH & AUTHZ MECHANISM

- **Issuer**: Supabase Auth (email/password + reset flows). Passwords **not stored in our DB** — Supabase handles hashing.
- **Token**: Supabase JWT issued to client. Stored in **localStorage** via Supabase SDK default (`client/src/lib/supabase.ts`).
- **Transport**: `Authorization: Bearer <supabase-jwt>` on every API request (no cookies).
- **Server verification**: `server/auth.ts` exports `authenticateUser` / `requireAuthForApi` middleware that calls Supabase admin client to verify tokens, then attaches `req.user`.
- **Ownership scoping**: `server/lib/ownership.ts` exports 30+ `require*()` helpers (e.g. `requireOwnedBrand`). Each fetches the entity and asserts `entity.userId === req.user.id` (returns **404** on miss, not 403 — anti-enumeration).
- **Express `app.param`**: `server/auth.ts:163-310` — per-route-param interceptors auto-apply ownership for `:brandId`, `:articleId`, etc.
- **Admin**: no `role=admin` check visible in auth.ts — verify whether admin routes exist at all (Group E).

---

## 7. THIRD-PARTY SERVICES

| Service | SDK | File | Required? | Used for |
|---|---|---|---|---|
| Supabase | `@supabase/supabase-js` | `server/supabase.ts`, `client/src/lib/supabase.ts` | **Required** | Auth, JWT verification |
| PostgreSQL | `pg`, `drizzle-orm` | `server/db.ts` | **Required** | Data |
| OpenAI | `openai` | `server/lib/modelConfig.ts` (and call sites) | **Required** | Content, citations, factsheet, fact extraction |
| Stripe | `stripe` | `server/stripeClient.ts` | **Required** for billing | Subscriptions, webhooks, portal |
| Resend | `resend` | `server/emailService.ts` | **Optional** | Weekly report emails |
| OpenRouter | via fetch / OpenAI SDK | citation worker | **Optional** | Multi-LLM citation queries |
| Buffer | custom | (search for `BUFFER_`) | **Optional** | Social distribution |

---

## 8. BACKGROUND JOBS

`server/scheduler.ts`:
- **Weekly report cron** (default Sunday 08:00 UTC) — iterates all users + brands, sends email via Resend
- **Per-brand citation schedule** — dynamic cron per brand row in `brandCitationSchedule` (weekly/biweekly/monthly)

`server/contentGenerationWorker.ts`:
- Polls `content_generation_jobs` table every 5s
- Claims pending jobs atomically (likely `UPDATE … RETURNING`)
- Runs LLM pipeline, writes drafts to `content_drafts`
- Recovers stuck "started" jobs >10 min old back to "pending"

**Scaling concern**: multiple server instances would all run cron + worker concurrently with no leader election → **duplicate work risk** (Group F / G).

---

## 9. WEBHOOKS

- **Stripe**: `POST /api/stripe/webhook` at `server/index.ts:70-92`. Raw body, `stripe-signature` header verified by `WebhookHandlers.processWebhook`. Idempotency via `webhook_events` table (migration 0002).
- **Shopify / e-commerce**: referenced by feature docs; grep `/api/shopify`, `/api/webhooks/` to find endpoint + verify signature check. **Suspected gap — no HMAC verification** per prior knowledge.

---

## 10. BROWSER STORAGE

From `client/src/`:
- **localStorage keys** (grep `localStorage.` in client):
  - Supabase auth JWT (SDK key `sb-<ref>-auth-token`)
  - `hasSeenOnboarding`
  - `completedGuideSteps`
  - `venturecite-visibility-visited`
  - `venturecite-draft-active-<userId>` (in `draftStore.ts`)
  - `venturecite-ga4-id`
- **sessionStorage**: none observed
- **cookies**: none (auth is all header-bearer)
- **Implication**: logout must clear all venturecite-* keys; Supabase SDK handles its own key on `signOut()`.

---

## 11. ENVIRONMENT VARIABLES

Validated in `server/env.ts` (Zod schema — fails fast on boot):

**Required**:
- `NODE_ENV`, `APP_URL`, `DATABASE_URL`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`

**Optional**:
- `OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET`, `BUFFER_REDIRECT_URI`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client)
- `PORT` (defaults 5000)

**Client exposure**: anything prefixed `VITE_*` ships to the browser.

---

## 12. TESTING & CI

- **No test files** (no `*.test.ts`, `*.spec.ts`, jest/vitest/playwright configs)
- **No CI/CD** (no `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`)
- **No pre-commit hooks** (no husky, lint-staged, simple-git-hooks)
- **No linter** (no `.eslintrc*`, no `eslint` in deps)
- **No formatter** (no `.prettierrc*`, no `prettier` in deps)
- **TypeScript strict** available via `npm run check`; not enforced anywhere

---

## 13. DEPLOYMENT

- **No Dockerfile**
- **No docker-compose**
- **No terraform / pulumi / CDK**
- **No `.replit` observed in listing, but repo layout suggests Replit origin** (verify with Agent if needed)
- Build produces `dist/public` (client) + `dist/index.js` (server)
- Start command: `node dist/index.js`
- Port from `PORT` env, defaults 5000, binds `0.0.0.0`
- Migrations auto-applied on boot (`server/index.ts:181-236`) — **dangerous in multi-instance** deploy (no distributed lock on boot)
- Graceful shutdown on SIGTERM/SIGINT with 10s forced exit (`server/index.ts:285-306`)

---

## 14. NOTABLE OBSERVATIONS

1. **Huge files**: `server/routes.ts` 7226 lines, `server/databaseStorage.ts` 2293, `shared/schema.ts` 1287 — refactoring pressure.
2. **No test suite, no CI, no lint** — regression risk on every commit.
3. **Auth token in localStorage** — XSS would exfiltrate it. `helmet` CSP exists (`server/index.ts:32-45`), but CSP doesn't allow `'unsafe-inline'` for scripts in prod ✅.
4. **Migrations run at boot, no distributed lock** — multi-instance risk.
5. **Cron & worker in-process** — horizontal scaling doubles work.
6. **Cascade-delete hardening** (`0003_fk_hardening.sql`) — double-check ON DELETE CASCADE doesn't nuke audit/billing events.
7. **`express.json({ limit: '1mb' })`** — fine for most, but check file upload endpoints.
8. **No global observability** — logs to stdout only; no Sentry / DD / OTel.
9. **Rate limits only on AI endpoints** — login/register/password-reset should also be rate-limited (Group E).
10. **Console.log usage**: server/index.ts has console.error in the global error handler (line 262) and webhook handler (82, 88) — intentional; but downstream agents should grep remaining console.* in hot paths.
11. **`helmet` used** but HSTS / frame-options not explicitly set in config — defaults should be verified.
12. **Drizzle + raw pg pool coexist** (`server/db.ts` exports `pool` used by `server/index.ts:197` for migrations) — intentional but a gotcha.
13. **Shopify webhook suspected missing HMAC** — must be confirmed by Group E.
14. **PRODUCTION_READINESS_AUDIT.md** already exists in repo — audit agents should diff against it.

---

## FILES MOST-CITED BY DOWNSTREAM AUDITS

- `server/index.ts` (307 lines)
- `server/routes.ts` (7226 lines — navigate by grep)
- `server/auth.ts` (309 lines)
- `server/lib/ownership.ts`
- `server/databaseStorage.ts` (2293 lines)
- `shared/schema.ts` (1287 lines)
- `server/scheduler.ts`
- `server/contentGenerationWorker.ts`
- `server/webhookHandlers.ts`
- `server/env.ts`
- `server/emailService.ts`
- `server/stripeClient.ts`
- `server/setupProducts.ts`
- `client/src/App.tsx`
- `client/src/lib/queryClient.ts`
- `client/src/lib/supabase.ts`
- `client/src/lib/authStore.ts`
- `client/src/lib/draftStore.ts`
- `client/src/lib/urlSafety.ts`
- `migrations/*.sql`
