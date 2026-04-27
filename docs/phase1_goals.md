# VentureCite — Phase 1 Goals & Audit

> Last updated: 2026-04-14
> Status: Pre-implementation — audit complete, fixes pending
> Purpose: Single source of truth for all Phase 1 changes. Every required action documented here before a line of code changes.

---

## Overview

Phase 1 has three parallel tracks:

1. **Platform Migration** — Off Replit infrastructure entirely. Standalone Node.js app, Supabase database, direct API keys.
2. **Feature Fixes** — The six core features stabilised end-to-end. All other features marked Coming Soon in the UI, code untouched.
3. **Security + Code Quality** — All identified vulnerabilities resolved before any external beta user is onboarded.

---

## Track 1 — Platform Migration (Replit → Standalone)

### Current State

The app was built on Replit. Several core services are injected by the Replit runtime rather than configured via environment variables:

- **Session middleware** lives in `server/replit_integrations/auth/replitAuth.ts:getSession()`. This is the only place `express-session` is configured with the PostgreSQL store. The rest of the app depends on this being registered.
- **Stripe** is initialised via `stripe-replit-sync` which auto-creates managed webhooks using `process.env.REPLIT_DOMAINS`. Without Replit, this fails silently.
- **Resend** email credentials are injected via Replit's connector API (`REPLIT_CONNECTORS_HOSTNAME`). Not available outside Replit.
- **Replit OAuth** (`/api/login`, `/api/callback`, `/api/logout`) is wired in `server/replit_integrations/auth/routes.ts` but is **not** used as the primary auth path. Custom email/password auth (`server/customAuth.ts`) handles all active user flows.
- **Vite build** loads three Replit-specific plugins. The cartographer and dev-banner plugins are gated on `REPL_ID !== undefined` so they don't run outside Replit. `@replit/vite-plugin-runtime-error-modal` is always loaded — must be removed.
- **`@assets` alias** in `vite.config.ts` points to `attached_assets/`. All logo imports use this alias. Must be updated when logo is moved.
- **`SESSION_SECRET`** has a hardcoded dev fallback: `"geo-platform-dev-secret-key"`. Acceptable in dev, not in production.

### Dependency Map (what depends on what)

```
server/replit_integrations/auth/replitAuth.ts
  └── getSession()         ← Used by routes.ts to register session middleware
  └── isAuthenticated()    ← NOT used by main app (customAuth.ts:isCustomAuthenticated used instead)
  └── setupAuth()          ← NOT called (commented out in routes.ts)

server/replit_integrations/auth/routes.ts
  └── Replit OAuth routes (/api/login, /api/callback, /api/logout) ← NOT called in routes.ts

server/replit_integrations/auth/storage.ts
  └── authStorage.upsertUser() ← Used only by replitAuth.ts:upsertUser(), which is only called in setupAuth() — itself not called

stripe-replit-sync (npm package)
  └── runMigrations()      ← Called in server/index.ts:initStripe() — creates stripe schema in DB
  └── stripeSync.findOrCreateManagedWebhook() ← Called in initStripe() — registers webhook via Replit
  └── stripeSync.syncBackfill() ← Called in initStripe() — syncs historical Stripe data

.replit
  └── Defines runtime (nodejs-20), build/run commands, port mapping, postMerge hook path
  └── No app code reads this file — it is consumed by the Replit platform only
```

### Required Actions

| Item                            | Action                                                                                                                                                                                                                                                                                                                                                | Risk if not done                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Session middleware**          | Extract `getSession()` from `replitAuth.ts` into a standalone helper (e.g. `server/session.ts`). Keep the same PostgreSQL store config. Remove SESSION_SECRET fallback — throw if not set in production.                                                                                                                                              | App crashes on startup without Replit — session store never registered |
| **Replit OAuth routes**         | After confirming no user is using Replit OAuth (check DB — any users without `password_hash`?), remove `server/replit_integrations/` entirely. Remove `openid-client`, `passport`, `passport-local` if no longer needed.                                                                                                                              | None if unused — confirmed by DB audit                                 |
| **`stripe-replit-sync`**        | Replace `runMigrations()` call with a manual one-time migration step (Stripe schema is standard; run it once, document it). Replace `findOrCreateManagedWebhook()` with an env var `STRIPE_WEBHOOK_SECRET` + manual webhook registration in Stripe dashboard. Replace `syncBackfill()` with a documented one-time script. Remove from `package.json`. | Stripe init fails on startup outside Replit                            |
| **Resend credentials**          | In `server/email.ts`, replace Replit connector credential injection with `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars. Update `.env.example`.                                                                                                                                                                                                    | Password reset emails fail                                             |
| **`REPLIT_DOMAINS` references** | In `server/index.ts`, replace `process.env.REPLIT_DOMAINS?.split(',')[0]` with `process.env.APP_URL`. Stripe webhook URL becomes `${APP_URL}/api/stripe/webhook`.                                                                                                                                                                                     | Webhook URL is undefined; Stripe can't reach the server                |
| **Vite Replit plugins**         | Remove `@replit/vite-plugin-runtime-error-modal` (always loaded). The cartographer + dev-banner are already gated on `REPL_ID` — remove them and the `REPL_ID` check entirely. Remove from `devDependencies`.                                                                                                                                         | Build fails or includes Replit-only runtime code                       |
| **`@assets` alias**             | Move logo file(s) from `attached_assets/` to `client/src/assets/`. Update `vite.config.ts` alias `@assets` → `client/src/assets`. Delete `attached_assets/` directory.                                                                                                                                                                                | Build fails — alias resolves to missing directory                      |
| **`.replit` file**              | Delete after confirming no CI/CD pipeline references it.                                                                                                                                                                                                                                                                                              | No functional impact on standalone deploy                              |
| **`scripts/post-merge.sh`**     | Delete. The `db:push` in a post-merge hook can silently alter or drop columns. Migrations must be run manually.                                                                                                                                                                                                                                       | None — it's a hook, not app code. But dangerous if left in place.      |
| **`SESSION_SECRET` fallback**   | Remove fallback string. Throw startup error if `SESSION_SECRET` is not set.                                                                                                                                                                                                                                                                           | Sessions use predictable secret in prod if env var forgotten           |

### Pass Criteria

- [ ] `npm run dev` starts with no Replit module imports resolving
- [ ] No string `replit` (case-insensitive) in any file under `server/`, `client/`, or `shared/` (docs excluded)
- [ ] `POST /api/auth/login` → session cookie set, subsequent `/api/auth/me` returns user
- [ ] Password reset email arrives when using `RESEND_API_KEY` env var
- [ ] Stripe checkout session creates successfully
- [ ] `npm run build` completes with zero errors

---

## Track 1B — Database Migration (Neon → Supabase)

### Current State

`server/db.ts` uses `@neondatabase/serverless` and the `neon()` HTTP driver. This is a Neon-specific driver — it does not work with a standard PostgreSQL connection string from Supabase.

Drizzle ORM itself is database-agnostic. Only the driver needs to change.

### Required Actions

| Item                    | Action                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Driver**              | Replace `@neondatabase/serverless` with `postgres` (the `postgres` npm package or `pg`). Update `server/db.ts` to use `drizzle(postgres(process.env.DATABASE_URL))`. |
| **`drizzle.config.ts`** | Update driver from `neon-http` to `postgres-js` (or `pg`).                                                                                                           |
| **`package.json`**      | Remove `@neondatabase/serverless`. Add `postgres` (or `pg`).                                                                                                         |
| **Schema push**         | Run `npm run db:push` against Supabase to create all tables. Verify all tables exist in Supabase table editor.                                                       |
| **`DATABASE_URL`**      | Update `.env` to Supabase connection string (use the pooled connection URL).                                                                                         |

### Pass Criteria

- [ ] `npm run db:push` succeeds against Supabase — zero errors
- [ ] `GET /api/auth/me` (with valid session) returns real user data from Supabase
- [ ] All CRUD operations verified: create brand, create article, fetch calls, fetch citations

---

## Track 2 — Security Hardening

### Current State Audit

| Issue                                    | Location                                           | Severity      | Detail                                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CORS wildcard**                        | `server/routes.ts` (check for `cors()` call)       | High          | Accepts requests from any origin. Must be restricted to `APP_URL` and `localhost:5000`.                                                                                                                                        |
| **`.env` not in `.gitignore`**           | `.gitignore`                                       | High          | `.env` files may not be excluded. If API keys were committed at any point, they must be rotated.                                                                                                                               |
| **Dependency CVEs**                      | `package.json`                                     | High/Moderate | Run `npm audit --json` to get the full current list. Do not assume the PRD list of 4 High + 6 Moderate is current — it was a point-in-time snapshot. Evaluate each CVE before fixing to avoid breaking existing functionality. |
| **No payload size cap**                  | `server/index.ts:78`                               | Medium        | `express.json()` and `express.urlencoded()` use default 100KB limit. Must be set explicitly to 1mb.                                                                                                                            |
| **Stack traces in error responses**      | `server/index.ts:114-120`                          | Medium        | Global error handler exists and catches unhandled errors. Verify it returns only `{message}` and not `stack`. Currently does `throw err` after sending — this may log to Replit console but does not send to client. Verify.   |
| **Session secret fallback**              | `server/replit_integrations/auth/replitAuth.ts:34` | High          | Hardcoded fallback `"geo-platform-dev-secret-key"`. Acceptable in dev; unacceptable in production. Remove fallback.                                                                                                            |
| **No DB connection pool limits**         | `server/replit_integrations/auth/replitAuth.ts:22` | Medium        | `new pg.Pool({ connectionString })` with no `max` or `idleTimeoutMillis` set. Must add pool limits. Also no SIGTERM shutdown handler.                                                                                          |
| **`post-merge.sh` runs `db:push`**       | `scripts/post-merge.sh`                            | High          | Auto-migration on merge can silently alter or drop production columns. Delete this file.                                                                                                                                       |
| **No rate limiting on AI endpoints**     | `server/routes.ts`                                 | Medium        | OpenAI generation endpoints have no per-user rate limiting beyond the usage quota. A user can exhaust quota in rapid bursts. Add a request rate limiter (e.g. `express-rate-limit`) on `/api/generate-*` routes.               |
| **No CSP headers**                       | `server/index.ts`                                  | Low           | No Content-Security-Policy header configured. Add via `helmet` or manual header middleware.                                                                                                                                    |
| **JSON.parse without schema validation** | `server/routes.ts` (multiple locations)            | Low           | LLM JSON output is parsed but field shapes are not validated against a schema before use. Use Zod `.safeParse()` on parsed output.                                                                                             |
| **`dangerouslySetInnerHTML`**            | `client/src/components/ui/chart.tsx`               | Low           | Used for Recharts config — data is internal. Acceptable as-is but flag for future review if any user content flows into chart config.                                                                                          |

### Required Actions

1. **Audit `.gitignore`** — confirm `.env`, `.env.*`, `.env.local` are all excluded. Add if missing.
2. **Run `npm audit --json`** — produce full CVE report. For each High/Critical: identify the package, check whether a safe upgrade exists (no breaking API changes), upgrade per-package. Do not use blanket `npm audit --fix`.
3. **CORS** — find the `cors()` middleware call in `routes.ts`. Replace with `cors({ origin: [process.env.APP_URL, 'http://localhost:5000'] })`.
4. **Payload limits** — change `express.json()` → `express.json({ limit: '1mb' })` and same for `urlencoded`.
5. **Session secret** — remove hardcoded fallback from `replitAuth.ts`. After session is extracted to standalone module (Track 1), ensure the new module throws if `SESSION_SECRET` is not set in `NODE_ENV=production`.
6. **DB pool limits** — set `max: 10, idleTimeoutMillis: 30000` on the pg.Pool. Add `process.on('SIGTERM', () => pool.end())`.
7. **Delete `post-merge.sh`**.
8. **Rate limiting** — add `express-rate-limit` on AI generation routes: 10 requests per minute per authenticated user.
9. **CSP headers** — add `helmet()` middleware with a sensible CSP policy.
10. **Error handler audit** — verify `server/index.ts:114-120` never sends `err.stack` to the client.

### Pass Criteria

- [ ] `npm audit` reports 0 High/Critical severity issues
- [ ] CORS rejects a `fetch()` from an origin not in the allowlist (test with curl + `Origin: https://evil.com`)
- [ ] `.env` appears in `.gitignore` — `git check-ignore .env` returns the file
- [ ] Sending a 2MB JSON body to `/api/generate-article` returns 413
- [ ] Triggering a server error returns `{"message":"Internal Server Error"}` — no stack trace
- [ ] 11 rapid `/api/generate-article` requests from one session — 11th returns 429

---

## Track 3 — Feature Fixes (6 Core Features)

### Feature 1 — Brand Setup

**Current State:** Auto-pulls info from URL. Manual edit available. Save is unreliable — brand data does not consistently persist or link to the correct user account.

**Issues Found:**

- Brand save may not associate `userId` correctly on creation
- Edit flow may overwrite data incorrectly
- No validation feedback when required fields are missing

**Required Actions:**

- Audit `POST /api/brands` and `PUT /api/brands/:id` — verify `userId` is always set from `req.user.id`, not from the request body
- Verify `brandsUsed` counter increments on create and enforces `usageLimits.maxBrands`
- Add form validation: name and website are required
- Test: create brand → refresh page → brand persists with correct user association

**Pass Criteria:**

- [ ] Create brand → refresh — brand visible in brand list
- [ ] Brand is linked to correct user — another user cannot access it
- [ ] Attempt to exceed brand limit → error message shown to user

---

### Feature 2 — AI Visibility Checklist

**Current State:** Steps render but ordering is wrong. Not all entries are verified against actual AI platforms. DeepSeek is absent.

**Issues Found:**

- Step order in the checklist does not match logical priority
- Some checklist items cannot be verified (no live API check behind them)
- DeepSeek not included as a tracked platform

**Required Actions:**

- Audit `client/src/pages/ai-visibility.tsx` — identify the step data source (hardcoded array or API response)
- Fix step ordering to match: Foundation → Content → Technical → Platform-specific
- Add DeepSeek to the platform list
- For items that cannot be live-verified: mark them as "manual check" with clear instructions
- Ensure all items have actionable descriptions

**Pass Criteria:**

- [ ] Steps render in the correct priority order
- [ ] DeepSeek appears in the platform list
- [ ] Each checklist item has a clear action or verification method
- [ ] Checking an item persists state (does not reset on refresh)

---

### Feature 3 — AI Keyword Research

**Current State:** Intermittent failures with no error handling shown to the user. Sometimes returns nothing.

**Issues Found:**

- OpenAI call in the keyword research route likely has no retry or fallback
- Error state in the UI shows nothing (blank) rather than a user-facing message
- No loading state on slow responses

**Required Actions:**

- Audit the keyword research API route in `routes.ts` — locate the OpenAI call
- Wrap in try/catch if not already done; return structured error response
- Add loading spinner in `client/src/pages/keyword-research.tsx`
- Add error state: "Keyword research failed. Please try again." with retry button
- Verify the prompt returns consistent JSON and parse it defensively with Zod

**Pass Criteria:**

- [ ] Generate keywords → results appear reliably on 5 consecutive attempts
- [ ] Simulate API failure (bad key) → user sees error message, not blank screen
- [ ] Loading spinner visible during generation

---

### Feature 4 — AI Content Generation

**Current State:** Works partially. Auto-improve sometimes lowers the SEO score. Article limit is hit too fast with no clear message.

**Issues Found:**

- Auto-improve prompt likely does not include the current score as context, so rewrites can produce lower-scoring content
- When article limit is reached, the user gets an error without explanation
- Score delta (before/after improve) not shown visually

**Required Actions:**

- Audit auto-improve route in `routes.ts` — update prompt to include current article, current SEO score, and instruction to score higher
- Add score delta display in the UI: show "+3" or "-2" after each improve attempt
- When usage limit is reached: return `{ error: "limit_reached", limit: N, tier: "free" }` from the API. In the UI, show a clear message with upgrade CTA.
- Verify `articlesUsedThisMonth` increments correctly and resets on `usageResetDate`

**Pass Criteria:**

- [ ] Auto-improve: run 5 times — score never decreases from starting score
- [ ] Score delta displayed after each improve attempt
- [ ] Hitting article limit → user sees "You've used X/X articles this month. Upgrade to Pro for more."
- [ ] Usage counter resets correctly on reset date

---

### Feature 5 — Track AI Citations

**Current State:** Clicking citations in the nav returns a "Page not found" error. Zero results shown.

**Issues Found:**

- Route `/citations` is either not registered in `client/src/App.tsx` or the page component has an error on load
- Backend citation monitoring endpoint may not return data
- Results display not wired up

**Required Actions:**

- Audit `client/src/App.tsx` — verify `/citations` route is registered and points to `citations.tsx`
- Open `citations.tsx` — identify the data-fetching call and verify it matches an existing backend route
- Audit the citations backend route — verify it queries the `citations` table and returns data
- If citations table is empty (no monitoring yet): show "No citations tracked yet" state rather than an error
- Fix any routing mismatch causing the 404

**Pass Criteria:**

- [ ] Navigate to `/citations` — no 404, page loads
- [ ] With no data: "No citations tracked yet" message shown
- [ ] With data: citations listed with source, platform, and timestamp

---

### Feature 6 — Distribute Your Content

**Current State:** Shows saved articles but "Publish Article" button is broken. Platform-specific generated content is not saved. No view/edit/save flow for distributed content.

**Issues Found:**

- "Publish Article" button has no working handler or links to a dead route
- Platform-specific content (e.g. LinkedIn post, Twitter thread) is generated but not persisted to the `distributions` table
- No UI to view, edit, or re-publish generated platform content

**Required Actions:**

- Audit the Distribute/Articles page — locate the Publish button handler
- Audit the `distributions` table in `shared/schema.ts` and the corresponding API routes
- Fix: on publish, insert a row into `distributions` with `status = 'published'` and `published_url`
- Add view/edit/save UI for platform-specific generated content before publishing
- Ensure published articles have a working link (not a dead URL)

**Pass Criteria:**

- [ ] Click "Publish Article" → row created in `distributions` table
- [ ] Published article URL is accessible (or clearly marked as pending)
- [ ] Platform-specific content (LinkedIn, Twitter) can be viewed, edited, and saved before publishing
- [ ] Re-generating platform content updates the saved draft, does not create duplicates

---

## Track 4 — UI/UX Fixes

### Known Bugs (from PRD §4)

| Issue                                      | Location                            | Fix Required                                                                                                |
| ------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tutorial starts before login               | `GuidedOnboarding.tsx` or `App.tsx` | Move tutorial trigger to fire only after successful login and first dashboard load                          |
| Sign-up CTA not prominent                  | `landing.tsx`                       | Make "Sign Up" the primary CTA — larger button, above the fold                                              |
| Pricing page: duplicate headers            | `pricing.tsx`                       | Fix render order — deduplicate any headers rendered twice during mount                                      |
| Pricing page: feature chart flashes        | `pricing.tsx`                       | Identify flash source (likely conditional render on data load) — add skeleton loader                        |
| Navbar disappears on Dashboard             | `Navbar.tsx` / `dashboard.tsx`      | Fix — Navbar must persist on all authenticated routes. Likely a layout/z-index or conditional render issue. |
| Saved articles show "published" but no URL | `articles.tsx`                      | Fix publish flow — store `published_url` in DB; surface it in the article row                               |

### General UI Audit (all authenticated pages)

- [ ] Navbar visible on all authenticated routes
- [ ] Dark theme consistent across all pages — no white/light backgrounds on dark-mode pages
- [ ] Loading states present on all data-fetching pages (spinner or skeleton)
- [ ] Empty states present on all list views ("No items yet" + CTA)
- [ ] Error states present on all API-dependent pages (not blank)
- [ ] Coming Soon badge visible on all non-Phase-1 feature pages
- [ ] No console errors on any page navigation
- [ ] Mobile responsive — all pages usable at 375px width

---

## Track 5 — Codebase Cleanup

### Files to Remove (after safe migration)

| File / Directory                                 | Condition for Removal                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `server/replit_integrations/`                    | After session middleware is extracted and Replit OAuth confirmed unused (DB audit: no users without `password_hash`) |
| `scripts/post-merge.sh`                          | Immediately — no migration dependency                                                                                |
| `.replit`                                        | After confirming no CI/CD pipeline references it                                                                     |
| `attached_assets/` directory                     | After logo files moved to `client/src/assets/` and all imports updated                                               |
| `stripe-replit-sync` (from `package.json`)       | After Stripe is wired directly                                                                                       |
| `@replit/vite-plugin-*` (from `devDependencies`) | After Vite config is cleaned up                                                                                      |

### Files to Audit (may remove or consolidate)

| File                        | Issue                                                                                          | Decision                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `server/storage.ts`         | Abstract `IStorage` interface — not currently used by any route (routes use Drizzle directly). | Remove if no storage swapping is planned. If kept, document why. |
| `server/databaseStorage.ts` | Implementation of `IStorage` — same question.                                                  | Remove if `storage.ts` is removed.                               |

### `attached_assets/` Logo Migration

The `@assets` alias in `vite.config.ts` currently resolves to `attached_assets/`. All logo imports use this alias.

Migration steps (do not do until all other Replit migration is stable):

1. Identify all files that import from `@assets` — `grep -r "@assets" client/`
2. Move the logo file(s) to `client/src/assets/`
3. Update `vite.config.ts` alias: `"@assets": path.resolve(import.meta.dirname, "client", "src", "assets")`
4. Verify build passes
5. Delete `attached_assets/`

### `package.json` Name

The package name is `"rest-express"` — a Replit scaffold default. Rename to `"venturecite"`.

### Coming Soon Gating (non-Phase-1 features)

All features outside the 6 Phase 1 core features must show a Coming Soon badge in the UI. The page code, backend routes, and DB schema for these features are preserved completely — do not modify them.

Pages to gate with Coming Soon (code untouched, UI badge only):
`geo-rankings`, `geo-analytics`, `geo-tools`, `geo-signals`, `geo-opportunities`,
`ai-intelligence`, `ai-traffic`, `agent-dashboard`, `outreach`,
`analytics-integrations`, `community-engagement`, `faq-manager`,
`client-reports`, `brand-fact-sheet`, `publication-intelligence`,
`revenue-analytics`, `crawler-check`, `competitors`

---

## Track 6 — Production Readiness

| Item                    | Required Action                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Health endpoint**     | Add `GET /health` → `{ status: "ok", db: true, timestamp }`. Checks DB connectivity with a lightweight query.                                                    |
| **`NODE_ENV` guards**   | Dev-only middleware (request logging, Vite dev server) already gated on `app.get("env") === "development"`. Verify nothing dev-only leaks into production build. |
| **Graceful shutdown**   | Add `process.on('SIGTERM', ...)` to close DB pool and HTTP server cleanly.                                                                                       |
| **`package.json` name** | Rename from `"rest-express"` to `"venturecite"`.                                                                                                                 |
| **`.env.example`**      | Create `.env.example` documenting every required env var with placeholder values. No real values in this file.                                                   |
| **`npm run check`**     | TypeScript must compile with zero errors before any merge.                                                                                                       |
| **`npm run build`**     | Full production build must complete with zero errors.                                                                                                            |

### Pass Criteria

- [ ] `GET /health` returns `{"status":"ok","db":true}`
- [ ] `npm run check` → zero TypeScript errors
- [ ] `npm run build` → completes without errors
- [ ] `npm run start` → server starts, serves frontend, API routes respond
- [ ] No `console.log` calls with sensitive data (scan for `console.log.*key`, `console.log.*secret`, `console.log.*password`)
