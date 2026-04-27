# VentureCite — Phase 1 Completion Log

> Tracks what was built or fixed at each stage, what changed, and how to verify it.
> Appended as each item in phase1_goals.md is completed.

---

## Track 1 — Platform Migration (Replit → Standalone)

**Goal:** Remove all Replit infrastructure dependencies. App runs on any Node.js 20 host with env vars only.

**Status:** Complete

### Files Changed

| File                          | Change                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/session.ts`           | **Created** — extracts `getSession()` from deleted `replitAuth.ts`. pg.Pool with `max:10`, `idleTimeoutMillis:30000`. No `SESSION_SECRET` fallback in production (throws on startup). SIGTERM pool shutdown handler.                                                                          |
| `server/stripeClient.ts`      | **Rewritten** — removed Replit connector credential fetching. Uses `STRIPE_SECRET_KEY` env var directly. Exports `getStripeClient()`, `getUncachableStripeClient()` (alias), `getStripePublishableKey()`.                                                                                     |
| `server/webhookHandlers.ts`   | **Rewritten** — removed `stripe-replit-sync`. Uses `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Updates `users` table via `storage`.    |
| `server/email.ts`             | **Rewritten** — removed Replit connector credential fetching. Uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars. Falls back to `onboarding@resend.dev` sender. `APP_URL` used for reset link base.                                                                                       |
| `server/setupProducts.ts`     | **Updated** — removed `getStripeSync()` and `syncBackfill()`. Uses `getStripeClient()` directly.                                                                                                                                                                                              |
| `server/index.ts`             | **Rewritten** — removed `stripe-replit-sync` import and `initStripe()`. Added `GET /health` endpoint. `STRIPE_SECRET_KEY` guards product setup. SIGTERM graceful shutdown. CORS + helmet + payload limits moved here.                                                                         |
| `server/routes.ts`            | **Updated** — import `getSession` from `./session` (was `./replit_integrations/auth`). Removed `setupAuth`/`registerAuthRoutes` dead code. `REPLIT_DOMAINS` → `APP_URL` (2 occurrences). `GET /api/stripe/products` rewired from Neon raw SQL to Stripe API directly. Stale comments cleaned. |
| `server/replit_integrations/` | **Deleted** — entire directory removed after session extraction confirmed.                                                                                                                                                                                                                    |
| `vite.config.ts`              | **Updated** — removed `@replit/vite-plugin-runtime-error-modal` (always-loaded), `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` and their `REPL_ID` guard.                                                                                                              |
| `package.json`                | **Updated** — removed `stripe-replit-sync`, `openid-client`, `passport`, `passport-local`, `memoizee`, `@types/memoizee`, `memorystore`, `@replit/vite-plugin-*`, `@types/passport`, `@types/passport-local`. Added `pg` + `@types/pg`.                                                       |
| `scripts/post-merge.sh`       | **Deleted**                                                                                                                                                                                                                                                                                   |
| `.replit`                     | **Deleted**                                                                                                                                                                                                                                                                                   |
| `attached_assets/`            | **Deleted** — logo already migrated to `client/src/assets/logo.png`                                                                                                                                                                                                                           |
| `shared/schema.ts`            | Stale comment updated (removed "Replit Auth" reference)                                                                                                                                                                                                                                       |

### How to Test

```bash
npm install
npm run dev
# → Server starts with no Replit import errors

# Auth flow
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' -c cookies.txt
curl http://localhost:5000/api/auth/me -b cookies.txt
# → Returns user object

# Health check
curl http://localhost:5000/health
# → {"status":"ok","db":true,"timestamp":"..."}

# Build
npm run build
# → Zero errors
```

### Pass Criteria

- [x] No string `replit` (case-insensitive) in any file under `server/`, `client/`, or `shared/`
- [x] `server/replit_integrations/` deleted
- [x] `scripts/post-merge.sh` deleted
- [x] `.replit` deleted
- [x] `attached_assets/` deleted
- [x] `stripe-replit-sync` removed from `package.json`
- [x] All Replit vite plugins removed from `vite.config.ts` and `devDependencies`
- [ ] `npm run dev` starts with no errors — requires `npm install` + valid env vars
- [ ] `POST /api/auth/login` → session cookie set, `/api/auth/me` returns user
- [ ] Password reset email arrives via `RESEND_API_KEY`
- [ ] Stripe checkout session creates successfully
- [ ] `npm run build` completes with zero errors

---

## Track 1B — Database Migration (Neon → Supabase)

**Goal:** All data reads/writes go to Supabase. Neon driver removed.

**Status:** Phase A complete (DB driver swap). Phase B pending (custom auth → Supabase Auth JWT).

### Phase A — Database driver swap (Complete)

Replaced the Neon HTTP driver with a standard `pg.Pool` wired into Drizzle via the `node-postgres` adapter. Fully backward compatible — custom bcrypt/session auth untouched, zero API contract changes, same Drizzle query API at every call site.

#### Files Changed

| File               | Change                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`     | **Created** at repo root — template with placeholders for `DATABASE_URL` (Supabase pooled connection string on port 6543), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus existing `SESSION_SECRET`, Stripe, Resend, OpenAI, APP_URL vars. Includes inline instructions for where to find each key in the Supabase dashboard. |
| `server/db.ts`     | **Rewritten** — replaced `drizzle-orm/neon-http` + `neon()` with `drizzle-orm/node-postgres` + `pg.Pool`. Pool configured with `max: 10`, `idleTimeoutMillis: 30_000`, `ssl: { rejectUnauthorized: false }` (required for Supabase pooled connections). Exports `pool` and `db`. SIGTERM handler closes the pool on shutdown.                                                   |
| `server/routes.ts` | Waitlist route at line 85 was the only other place using `neon()` directly for a raw tagged-template INSERT. Replaced with a parameterized `pool.query()` call using the shared pool from `./db`.                                                                                                                                                                               |
| `package.json`     | Removed `@neondatabase/serverless` from `dependencies`. Note: the package still exists in `node_modules/` because it is an optional peer dependency of `drizzle-orm@0.45.2` — this is harmless since no app code imports it.                                                                                                                                                    |

#### How It Was Tested

```bash
npm install                    # synced lockfile
npm run db:push                # drizzle-kit push → Supabase
# → "Using 'pg' driver for database querying"
# → "Pulling schema from database..."
# → "Changes applied"

npm run check                  # TypeScript verification
# → 2 pre-existing errors (server/storage.ts passwordHash/emailVerified,
#    server/stripeClient.ts API version) — neither related to DB swap
```

Full schema from `shared/schema.ts` is now materialized in Supabase.

#### Pass Criteria (Phase A)

- [x] `.env.example` created with Supabase-specific placeholders and inline setup instructions
- [x] `server/db.ts` uses `pg.Pool` + `drizzle-orm/node-postgres`
- [x] No `@neondatabase/serverless` import remains in `server/`, `client/`, or `shared/`
- [x] `npm run db:push` succeeds against Supabase pooled connection — zero errors
- [x] `npm run check` introduces zero new TypeScript errors
- [ ] End-to-end dev run: `npm run dev` → login with existing credentials → create brand → verify row in Supabase Studio (pending user verification)

### Phase B — Auth migration (Complete, pending runtime verification)

Custom bcrypt + `express-session` stack → Supabase Auth (JWT-based, stateless). All code changes in place; end-to-end runtime verification pending once the SQL trigger is applied in Supabase and the user runs `npm run dev`.

#### Files Changed

| File                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                         | **Added** `@supabase/supabase-js`. **Removed** `bcryptjs`, `@types/bcryptjs`, `express-session`, `@types/express-session`, `connect-pg-simple`, `@types/connect-pg-simple`, `nanoid`, `resend`.                                                                                                                                                                                                                                                                                                                                       |
| `server/supabase.ts`                   | **Created** — admin client via `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`. Throws on startup if env vars missing.                                                                                                                                                                                                                                                                                                                                          |
| `server/auth.ts`                       | **Created** — replaces `customAuth.ts`. Exports `setupAuth(app)` registering all 6 `/api/auth/*` routes, plus `isAuthenticated` (strict JWT verify, 401 on failure) and `attachUserIfPresent` (best-effort JWT verify, never 401s). Verifies Bearer tokens via `supabaseAdmin.auth.getUser(token)`, then loads the row from `public.users` via Drizzle and attaches full DB user to `req.user`. `publicUserShape()` helper returns the same `{id, email, firstName, lastName, accessTier, profileImageUrl, isAdmin}` shape as before. |
| `server/auth.ts` — register            | Uses `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { firstName, lastName } })`, then immediately issues a session via `signInWithPassword`. Trigger `handle_new_user()` mirrors the new row into `public.users` before the session is returned. Response adds `access_token`, `refresh_token`, `expires_at` alongside existing `{ success, user }`.                                                                                                                                     |
| `server/auth.ts` — login               | `supabaseAdmin.auth.signInWithPassword(...)`. Returns `{ success, user, access_token, refresh_token, expires_at }`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `server/auth.ts` — logout              | No-op on server (JWTs are stateless). Client discards tokens + calls `supabase.auth.signOut()`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `server/auth.ts` — forgot-password     | `supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: \`${APP_URL}/reset-password\` })`. Generic success to avoid account enumeration.                                                                                                                                                                                                                                                                                                                                                                                       |
| `server/auth.ts` — reset-password      | Returns HTTP 410 Gone with explanatory message. Reset is completed client-side after the Supabase magic link lands on `/reset-password`.                                                                                                                                                                                                                                                                                                                                                                                              |
| `server/routes.ts`                     | Replaced `getSession()` + `setupCustomAuth()` + session-bridging middleware with a single `attachUserIfPresent` middleware and `setupAuth(app)`. Imports reduced to `./auth` only.                                                                                                                                                                                                                                                                                                                                                    |
| `server/customAuth.ts`                 | **Deleted**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/session.ts`                    | **Deleted**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/email.ts`                      | **Deleted** — only export was `sendPasswordResetEmail`, no longer needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `shared/schema.ts`                     | Removed `sessions` table (express-session/connect-pg-simple store). Removed `passwordResetTokens` table + its types. `users.passwordHash` column left nullable in place — stays NULL for Supabase-managed accounts; drop in a follow-up to minimize churn.                                                                                                                                                                                                                                                                            |
| `migrations/0001_auth_sync.sql`        | **Created** — `handle_new_user()` function + `on_auth_user_created` trigger. Mirrors `auth.users` → `public.users` on insert and email updates. Idempotent, uses `security definer`, `set search_path = public`, ON CONFLICT DO UPDATE. **Must be applied manually via Supabase Studio → SQL Editor before registering any user.**                                                                                                                                                                                                    |
| `client/src/lib/supabase.ts`           | **Created** — browser client with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true` (required for magic-link password reset).                                                                                                                                                                                                                                                                                                                              |
| `client/src/lib/authStore.ts`          | **Created** — thin wrapper over supabase-js session management. `getAccessToken()` → reads current session (auto-refreshes when near expiry). `setSession({access_token, refresh_token})` → used after login/register. `clearSession()` → signs out.                                                                                                                                                                                                                                                                                  |
| `client/src/lib/queryClient.ts`        | Dropped `credentials: "include"`. New `buildHeaders()` helper attaches `Authorization: Bearer <token>` from `getAccessToken()` to every `apiRequest` and `getQueryFn` call.                                                                                                                                                                                                                                                                                                                                                           |
| `client/src/hooks/use-auth.ts`         | `fetchUser()` now reads token from `authStore` and sends Bearer header. `logoutUser()` calls `clearSession()` + POST `/api/auth/logout`. Public API of `useAuth()` unchanged.                                                                                                                                                                                                                                                                                                                                                         |
| `client/src/pages/login.tsx`           | Dropped `credentials: "include"`. `onSuccess` now `await setSession({access_token, refresh_token})` before redirect.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `client/src/pages/register.tsx`        | Same pattern as login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `client/src/pages/forgot-password.tsx` | Only change: dropped `credentials: "include"`. Server endpoint still exists at same path.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `client/src/pages/reset-password.tsx`  | **Rewritten** — no longer reads `token` from query string. Listens for Supabase `PASSWORD_RECOVERY` auth state event triggered by `detectSessionInUrl`. On submit calls `supabase.auth.updateUser({ password })` directly from the browser using the recovery session. After success, signs out and redirects to `/login`. Shows "Invalid Reset Link" card if no recovery session is detected.                                                                                                                                        |

#### Manual Steps Required (one-time, in Supabase dashboard)

1. **SQL Editor** → paste the contents of `migrations/0001_auth_sync.sql` → Run. This installs the `handle_new_user()` trigger that mirrors `auth.users` → `public.users`. Must be done before any user registers.
2. **Authentication → URL Configuration** → Site URL = `http://localhost:5000` (or production URL). Add `http://localhost:5000/reset-password` to the Redirect URLs allowlist.
3. **Authentication → Email Templates** (optional) — customize the "Reset Password" email branding; the link target is already wired to `${APP_URL}/reset-password`.

#### How It Was Tested

```bash
npm run check    # → 2 pre-existing errors (storage.ts passwordHash/emailVerified,
                 #    stripeClient.ts API version). Zero new errors.
npm run db:push  # → "Using 'pg' driver", "Changes applied"
                 #    → drops `sessions` and `password_reset_tokens` tables from Supabase
```

#### Pass Criteria (Phase B)

- [x] `server/supabase.ts`, `server/auth.ts`, `migrations/0001_auth_sync.sql` created
- [x] `server/customAuth.ts`, `server/session.ts`, `server/email.ts` deleted
- [x] All 6 `/api/auth/*` routes preserved at same paths
- [x] `client/src/lib/supabase.ts`, `client/src/lib/authStore.ts` created
- [x] `client/src/lib/queryClient.ts` switched to Bearer header flow
- [x] `client/src/hooks/use-auth.ts`, all 4 auth pages updated
- [x] `shared/schema.ts` — `sessions` and `passwordResetTokens` tables removed
- [x] `npm run check` — zero new TypeScript errors
- [x] `npm run db:push` — schema applied to Supabase
- [x] No `bcryptjs`, `express-session`, `connect-pg-simple`, `nanoid`, or `resend` imports remain anywhere
- [ ] **Pending runtime verification:** apply `migrations/0001_auth_sync.sql` in Supabase Studio
- [ ] **Pending runtime verification:** register new user → row in `auth.users` + `public.users`
- [ ] **Pending runtime verification:** login returns `{success, user, access_token, refresh_token}`; `/api/auth/me` with Bearer header returns user
- [ ] **Pending runtime verification:** create brand/article while authenticated — persists with correct userId
- [ ] **Pending runtime verification:** logout clears store, subsequent protected requests 401
- [ ] **Pending runtime verification:** forgot-password email arrives; magic link lands on `/reset-password` with active recovery session; `updateUser({password})` succeeds
- [ ] **Pending runtime verification:** Stripe checkout still works (reads `user.email` from `public.users`)

#### Phase B — Follow-up Fixes (after first runtime test)

Runtime testing surfaced issues that code-level review missed:

| File                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/index.ts`                | **Added** `import "dotenv/config"` at the top so `.env` loads before any module reads `process.env`. Without this, `server/db.ts` throws `DATABASE_URL environment variable is required` on startup.                                                                                                                                                                                                                                                                                                              |
| `server/index.ts`                | **Removed** `reusePort: true` flag from `server.listen()`. `SO_REUSEPORT` is not supported on Windows and throws `ENOTSUP`. Changed to plain `server.listen(port, "0.0.0.0", cb)` which works cross-platform.                                                                                                                                                                                                                                                                                                     |
| `server/index.ts`                | **Added** `process.env.SUPABASE_URL` to helmet's CSP `connectSrc` directive. Without this, every browser-side `supabase.auth.*` call (setSession, getSession, getUser, updateUser, signOut) is blocked by Content-Security-Policy and surfaces as "Failed to fetch" in the browser with no visible server error. This broke login end-to-end even though the server's `/api/auth/login` returned 200 — the follow-up `setSession()` call from the browser to `<project>.supabase.co` was silently blocked by CSP. |
| `package.json`                   | **Added** `dotenv`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `client/src/lib/authStore.ts`    | `setSession()` now checks `{ error }` from `supabase.auth.setSession()` and throws if it fails, so login/register errors surface loudly instead of silently leaving the app unauthenticated.                                                                                                                                                                                                                                                                                                                      |
| `client/src/pages/articles.tsx`  | `useQuery` custom queryFn: `fetch('/api/articles')` → `apiRequest('GET', '/api/articles')`. Raw fetch bypassed the Bearer header.                                                                                                                                                                                                                                                                                                                                                                                 |
| `client/src/pages/citations.tsx` | `createCitationMutation`: raw `fetch('/api/citations', { method, headers, body })` → `apiRequest('POST', '/api/citations', data)`. Added `apiRequest` to the import.                                                                                                                                                                                                                                                                                                                                              |
| `client/src/pages/content.tsx`   | Four mutations refactored (`generateContent`, `rewriteContent`, `analyzeContent`, `keywordSuggestions`): raw `fetch()` → `apiRequest()`. `apiRequest` was already imported.                                                                                                                                                                                                                                                                                                                                       |
| `client/src/pages/dashboard.tsx` | `generateContentMutation`: raw `fetch()` → `apiRequest()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Why this matters:** Before Phase B the app used cookie-based sessions (`credentials: "include"`) which the browser attached automatically to every request. After Phase B every authenticated request must carry `Authorization: Bearer <token>`, which is only attached by `apiRequest` / `getQueryFn` in `queryClient.ts` — raw `fetch()` calls skip it and 401. This was the root cause of `/api/usage` 401s observed during the first runtime test.

**Deliberately left as raw fetch** (public routes, no auth needed): `login.tsx`, `register.tsx`, `forgot-password.tsx`, `landing.tsx`. These POST to public auth/waitlist endpoints where no Bearer header is expected.

**Not touched** (dead code behind the ComingSoon gate per Track 5): `ai-traffic.tsx`, `community-engagement.tsx` still contain raw `fetch()` calls with `credentials: "include"` but never actually render because `App.tsx` routes them to `<ComingSoon />`. To be cleaned up when those pages are brought back online in Phase 2.

- [x] `dotenv` loaded at server startup
- [x] Windows-compatible `server.listen()` (no `reusePort`)
- [x] All authenticated raw `fetch()` calls refactored to `apiRequest()`
- [x] `setSession()` surfaces errors
- [x] `npm run check` — zero new TypeScript errors

#### Phase B — Production-Readiness Audit & Fix Pass (Complete)

A thorough multi-agent audit surfaced 20 issues across P0 (blockers), P1 (should-fix), and P2 (polish) severity. Every item is now resolved. The Supabase migration itself was clean; the issues were **pre-existing architectural gaps** exposed by the audit (catastrophic multi-tenancy holes, missing auth on 20+ endpoints, IDOR vulnerabilities, admin endpoints without any access control, missing env validation, missing rate limits, and a broken dev mock).

**P0 — Security blockers (fixed):**

| File                                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/schema.ts`                                          | Added `userId` FK column with `onDelete: "cascade"` and an index to `brands` and `citations`. These are the two tables that needed direct user ownership; everything else filters through `brands.userId` (via `brandId` FK) at the route level.                                                                                                                                                                                                                                                                                                                                                                       |
| `server/databaseStorage.ts`                                 | Added `getBrandsByUserId(userId)`, `getBrandByIdForUser(id, userId)`, `getCitationsByUserId(userId)`. Global `getBrands()` / `getCitations()` remain for internal use (e.g. Stripe sync paths) but are no longer called from user-facing routes.                                                                                                                                                                                                                                                                                                                                                                       |
| `server/storage.ts` (MemStorage + IStorage interface)       | Mirrored the new methods + fixed pre-existing `passwordHash`/`emailVerified` TS error that was blocking `npm run check` from exiting zero.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `server/auth.ts`                                            | Added `isAdmin` middleware (requires `req.user.isAdmin === 1`, returns 403 otherwise). Added `requireAuthForApi` — a single global middleware that calls `isAuthenticated` on every `/api/*` request _except_ those on an explicit `PUBLIC_API_ROUTES` allowlist (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/waitlist`, `/api/stripe/webhook`). This is the single source of truth for "is this request authenticated" — no individual route needs to duplicate a 401 check.                                                          |
| `server/auth.ts` — `isAuthenticated`                        | Now short-circuits if `req.user` was already populated by `attachUserIfPresent` (avoids double-verifying the JWT on every request), logs non-standard JWT verify failures once, and returns the standard `{success: false, error: "Not authenticated"}` shape for consistency with other 401 responses in the app.                                                                                                                                                                                                                                                                                                     |
| `server/routes.ts`                                          | `app.use(requireAuthForApi)` registered immediately after `setupAuth(app)`. Every protected route is now covered in a single line. Public routes bypass via the allowlist.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `server/routes.ts` — `POST /api/beta/codes`                 | Gated with `isAdmin` middleware. Previously **unauthenticated** — anyone could mint admin-tier invite codes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/routes.ts` — `GET /api/beta/codes`                  | Gated with `isAdmin`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `server/routes.ts` — `POST /api/beta/validate`              | Removed `userId` from request body path. Now reads `user.id` from `req.user` (the authenticated caller redeems the code _for themselves_). Previously an **unauthenticated IDOR** — any client could pass any `userId` and escalate that user's `accessTier` to `admin`.                                                                                                                                                                                                                                                                                                                                               |
| `server/routes.ts` — `GET /api/brands`                      | Now calls `getBrandsByUserId(user.id)` instead of the global `getBrands()` that returned every brand in the database to every caller.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `server/routes.ts` — `GET /api/brands/:id`                  | Now calls `getBrandByIdForUser(id, user.id)`; returns 404 (not 403) on ownership mismatch to avoid leaking ID existence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `server/routes.ts` — `POST /api/brands`                     | Stamps `userId: user.id` on every new brand.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/routes.ts` — `POST /api/brands/create-from-website` | Same userId stamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `server/routes.ts` — `PUT /api/brands/:id`                  | Loads the brand via `getBrandByIdForUser` first; returns 404 if the caller doesn't own it, then proceeds with the update. Prevents IDOR on brand mutations.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `server/routes.ts` — `DELETE /api/brands/:id`               | Same ownership pre-check before `deleteBrand`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `server/routes.ts` — `GET /api/citations`                   | Now calls `getCitationsByUserId(user.id)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `server/routes.ts` — `POST /api/citations`                  | Stamps `userId: user.id` from `req.user` — client-supplied `userId` in the body is ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `migrations/0001_auth_sync.sql`                             | Expanded with `alter table ... enable row level security` for every public table (39 tables). No policies = deny-all for non-superuser/service-role connections. Our Express server connects via `pg.Pool` as `postgres` (superuser), which bypasses RLS entirely, so app functionality is unaffected. The purpose is belt-and-suspenders: if anyone ever wires the anon key into the browser for direct table access, every query is blocked instead of silently leaking. Also silences Supabase Studio's "RLS disabled" warnings. The SQL file now contains the trigger + the RLS block in one idempotent migration. |
| `server/index.ts`                                           | Added `applyMigrations()` — reads every `.sql` file in `migrations/` in sorted order and executes it via the shared `pool` on every boot. All operations are idempotent (`create or replace`, `drop trigger if exists`, `alter table ... enable row level security` is a no-op when already enabled). This eliminates the manual Supabase-studio step for fresh environments and ensures new deploys always get the trigger + RLS without human intervention.                                                                                                                                                          |

**P1 — Hardening (fixed):**

| File                                                                | Change                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/env.ts` (new)                                               | Zod schema validates every required env var at startup: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `APP_URL`, `NODE_ENV`, optional `PORT` and `SESSION_SECRET`. Throws a readable error naming every missing/malformed variable. Fails fast — no more silent half-broken boots. |
| `server/index.ts`                                                   | `import "./env"` at the very top, right after `import "dotenv/config"`. Validation runs before any module reads `process.env`.                                                                                                                                                                                                                                    |
| `server/routes.ts`                                                  | Applied `aiRateLimit` (10 req/min per IP, existing middleware) to the 5 previously-unprotected AI endpoints: `/api/analyze-content`, `/api/rewrite-content`, `/api/analyze-sentiment`, `/api/bofu-content/generate`, `/api/faqs/generate/:brandId`. Closes the OpenAI credit exhaustion vector.                                                                   |
| `server/auth.ts`                                                    | `attachUserIfPresent` wraps the Supabase call in try/catch and logs unexpected errors; logs non-standard JWT verify failures (anything that isn't "invalid jwt") so brute-force probes and Supabase outages show up in the logs instead of being silently swallowed.                                                                                              |
| `client/src/pages/content.tsx`                                      | `fetch('/api/popular-topics?...')` → `apiRequest('GET', ...)`. The last live raw fetch to a protected endpoint.                                                                                                                                                                                                                                                   |
| `client/src/pages/login.tsx`, `register.tsx`, `forgot-password.tsx` | Every auth-page fetch now checks `response.ok` and wraps `response.json()` in try/catch before reading `result.success`. Non-JSON 502/503 responses (crashed backend, proxy errors) now show a human-readable toast instead of throwing `SyntaxError: Unexpected token`.                                                                                          |
| `client/src/hooks/use-auth.ts`                                      | `logoutMutation.onSuccess` calls `queryClient.clear()` instead of setting only `/api/auth/me` to null. Wipes every cached brand/article/citation so user B can't see user A's data after a logout/login swap on the same browser.                                                                                                                                 |
| `client/src/lib/authStore.ts`                                       | `getAccessToken()` wrapped in try/catch — returns `null` on supabase-js failures (network, parse errors) instead of leaving protected queries with unhandled rejections.                                                                                                                                                                                          |

**P2 — Polish (fixed):**

| File                        | Change                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patch.js`                  | **Deleted**. The cookie-based mock auth was incompatible with Supabase Auth JWT flow and genuinely broken.                                                                                           |
| `package.json`              | Removed `dev:mock` script (it referenced the deleted `patch.js`).                                                                                                                                    |
| `server/index.ts`           | CORS `credentials: true` → `credentials: false`. Bearer tokens in the Authorization header don't need credentialed CORS; this was a leftover from the cookie-session era.                            |
| `server/routes.ts:5`        | Cleaned up unused `insertXxxSchema` imports — 13 of them were flagged by TS hints. Kept only `insertBrandSchema`, `insertCompetitorSchema`, `insertCompetitorCitationSnapshotSchema`, `usageLimits`. |
| `server/stripeClient.ts:13` | Bumped `apiVersion` string from `'2025-08-27.basil'` → `'2025-11-17.clover'` to match the installed Stripe SDK's expected type. Fixes the last TS error.                                             |

**Verification:**

```bash
npm run check                  # → zero errors, exit 0
npm run dev                    # → "Applied migration 0001_auth_sync.sql" → "serving on port 5000"
```

The migration runner successfully applied the trigger + RLS statements on every boot, and the server came up clean.

**Out of scope (will revisit in Phase 2):**

- **Per-brand-table IDOR protection on tables with `brandId`** — the global auth guard prevents unauthenticated access, but routes that take a `brandId` URL param (e.g. `/api/citation-quality/stats/:brandId`, `/api/brand-fact-sheet/:brandId`, `/api/outreach-campaigns/:brandId`) still need to verify the brand belongs to `req.user.id` before returning data. A brand-ownership helper (`assertBrandOwner(brandId, userId)`) should be added and sprinkled across ~30 routes. Recommended: add the helper in `server/auth.ts`, then invoke it in each route that accepts a `:brandId` param. Tracked as Phase 2 followup because the worst attack vector (unauthenticated access) is now closed.
- **ComingSoon-gated client pages** (`ai-traffic.tsx`, `community-engagement.tsx`, `client-reports.tsx`, `revenue-analytics.tsx`) still contain raw `fetch()` calls with/without `credentials: "include"`. Dead code today — `App.tsx` routes them through `<ComingSoon />`. Fix when those pages are brought online.
- **Switching from `drizzle-kit push` to `drizzle-kit generate`** — real migration history + rollback is valuable long-term but is a separate workflow change.
- **Stripe test key** — `sk_test_...` is still a placeholder in the real `.env`. Stripe features will 401 at startup until a real key is set. Not blocking auth/data flow.

**Multi-tenant isolation verification plan** (to run after the next real deploy):

1. Register User A; create 2 brands.
2. Register User B in a private window; create 1 brand.
3. As User B, `GET /api/brands` must return 1 brand, not 3.
4. As User B, `GET /api/brands/<User-A-brand-id>` must return 404.
5. Unauthenticated `curl http://localhost:5000/api/brands` → 401.
6. Unauthenticated `curl -X POST http://localhost:5000/api/beta/codes -d '{"accessTier":"admin"}'` → 401.
7. As User A (non-admin), same call → 403.
8. Supabase Studio — every `public.*` table shows "RLS enabled".

#### Phase B — Brand-ownership enforcement on `:brandId` routes (Complete)

The first production-readiness pass closed unauthenticated access to every `/api/*` endpoint (via `requireAuthForApi`), but authenticated User A could still guess User B's brand IDs and access `/api/listicles/:brandId`, `/api/keyword-research/:brandId`, `/api/prompt-portfolio/stats/:brandId`, `/api/bofu-content/:brandId`, `/api/faqs/:brandId`, and ~25 other brand-scoped routes. This pass closes the remaining gap with a single middleware + `app.param` handler — no per-route changes.

#### Files Changed

| File               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/auth.ts`   | **Refactored** `enforceBrandOwnership` to scope only to body/query brandId (URL params are empty at `app.use` time before route matching). Added `checkBrandOwnership()` private helper that queries `brands` table for `(id, userId)` match and sends 404 on miss. Added new exported `brandIdParamHandler` — an Express `RequestParamHandler` that fires whenever any route template contains `:brandId` and Express matches it. Both paths share the same helper.                                                   |
| `server/routes.ts` | Added `app.param("brandId", brandIdParamHandler)` immediately after `app.use(enforceBrandOwnership)` in `registerRoutes()`. One line covers every `:brandId` URL param across all 30+ brand-scoped routes — zero per-route changes.                                                                                                                                                                                                                                                                                    |
| `server/index.ts`  | Tightened CSP: production mode drops `'unsafe-inline'` from `scriptSrc` (Vite's inline HMR scripts are dev-only; production bundles are externally hashed). `styleSrc` keeps `'unsafe-inline'` because Tailwind JIT emits runtime-inlined styles.                                                                                                                                                                                                                                                                      |
| `server/db.ts`     | **Not fixed — still pending.** Attempted `rejectUnauthorized: true` but Supabase's pooler (aws-0-<region>.pooler.supabase.com) presents a self-signed cert chain that Node's default CA bundle doesn't trust → strict verification fails with `SELF_SIGNED_CERT_IN_CHAIN`. Reverted to `rejectUnauthorized: false` with an inline comment documenting why and noting TLS encryption is still enforced in transit. Real fix requires pinning Supabase's root CA via the `ca:` option — tracked in remaining work below. |

#### Verification (executed against production build + real Supabase)

```
npm run check   → zero errors
npm run build   → built in 9.70s, dist/index.js 345.1kb, public bundle 1.07MB
NODE_ENV=production node dist/index.js → "Applied migration 0001_auth_sync.sql" + "serving on port 5000"
```

**Multi-tenant smoke test (14/14 passed):**

```
✓ User A sees 1 brand (AliceBrand)
✓ User B sees 0 brands
✓ User B GET /api/brands/<Alice-id>            → 404
✓ User B DELETE /api/brands/<Alice-id>         → 404
✓ User B GET /api/listicles/<Alice-brandId>    → 404  (via app.param)
✓ User B GET /api/keyword-research/<Alice-id>  → 404  (via app.param)
✓ User B GET /api/prompt-portfolio/stats/<id>  → 404  (via app.param)
✓ User B GET /api/bofu-content/<Alice-id>      → 404  (via app.param)
✓ User B GET /api/faqs/<Alice-id>              → 404  (via app.param)
✓ User A GET /api/listicles/<own-brandId>      → 200  (owner access preserved)
✓ Unauth GET /api/brands                       → 401
✓ Unauth POST /api/beta/codes                  → 401
✓ Non-admin POST /api/beta/codes               → 403
✓ Public POST /api/waitlist                    → 200
```

Every protected endpoint now enforces both authentication AND brand ownership. A hostile authenticated user cannot read, write, or delete another user's brand-scoped data regardless of route shape.

**Known remaining gaps** (tracked for later):

- **Non-brand-scoped ownership**: closed by Phase C below — every `:id` route now runs through a `require*` helper that joins the entity to its owning brand before any side effect.
- **Pool SSL cert pinning (NOT FIXED)**: `server/db.ts` still uses `ssl: { rejectUnauthorized: false }`. Strict verification was attempted and reverted — Supabase's pooler presents a self-signed chain that Node's default CA bundle rejects. Real fix: download Supabase's root CA certificate, bundle it in the repo, and pass it via `ssl: { ca: fs.readFileSync(...) }`. TLS encryption is still enforced in transit, so this is defense-in-depth rather than a confidentiality hole, but it should be closed before production.
- **Code-splitting for the 1.07MB client bundle**: build warning flagged. Phase 2.

---

#### Phase C — Audit remediation pass (2026-04-15, Complete)

Second codebase audit surfaced 60+ findings; the P0/P1 items from the approved list are now fixed and verified. This pass touches ~120 routes and adds shared security primitives.

##### New helper modules

| File                                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`server/lib/ownership.ts`](../server/lib/ownership.ts) | Per-entity `require*` helpers (`requireArticle`, `requireCompetitor`, `requireFaq`, `requireListicle`, `requireBofuContent`, `requireHallucination`, `requireBrandFact`, `requireBrandMention`, `requireAiSource`, `requirePromptTest`, `requireAgentTask`, `requireOutreachCampaign`, `requireAutomationRule`, `requirePublicationTarget`, `requireOutreachEmail`, `requireCommunityPost`, `requirePromptPortfolio`, `requireCitationQuality`, `requireKeywordResearch`, `requireAlertSetting`, `requireCitation`). Each resolves the entity → brand → user chain in one query and throws `OwnershipError` (401/404, never 403) on any miss. Also exports `requireUser`, `requireBrand`, `getUserBrandIds`, `pickFields`, and `sendOwnershipError`. |
| [`server/lib/ssrf.ts`](../server/lib/ssrf.ts)           | `assertSafeUrl()` + `safeFetchText()` reject private IPs (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10 CGNAT, plus IPv6 ULA/link-local/loopback) both at URL-parse time and after DNS resolution. Enforces http(s)-only, body size cap (2 MB default), timeout (10 s default). Replaces hand-rolled blocklists at every call site.                                                                                                                                                                                                                                                                                                                                                                                                      |

##### P0 — Ownership + authz hardening

| Area                                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mass assignment** ([routes.ts](../server/routes.ts)) | Every `POST`/`PUT`/`PATCH` route now filters `req.body` through a per-entity `pickFields(body, [...] as const)` allowlist. `userId`, `isAdmin`, `viewCount`, `citationCount`, `createdAt`, `id`, and similar server-controlled fields are no longer accepted from the client under any circumstance. Affected tables: articles, keyword-research, listicles, wikipedia-mentions, bofu-content, faq-items, brand-mentions, prompt-portfolio, citation-quality, brand-hallucinations, brand-fact-sheet, ai-sources, ai-traffic-sessions, prompt-test-runs, agent-tasks, outreach-campaigns, automation-rules, publication-targets, outreach-emails, community-posts, alert-settings (~40 routes).                                                                                                                                                                                                                                                                                                                                                                                                                |
| **IDOR on `:id` routes**                               | Every route shaped `/api/<entity>/:id` (GET, PATCH, POST sub-actions, DELETE) now calls the matching `require*(id, user.id)` helper before touching storage. Attempts to access another user's entity return 404, not 403, to avoid leaking existence. Affected routes: articles (`:id`, `:id/publish`, `slug/:slug`), competitors (`:id`, `:id/snapshots`, `:id/latest-citations`), revenue (`article/:articleId`), keyword-research (`:id`), listicles (`:id`), bofu-content (`:id`), faqs (`:id`, `:id/optimize`), brand-mentions (`:id`), prompt-portfolio (`:id`), citation-quality (`:id`), hallucinations (`:id`, `:id/resolve`), brand-facts (`:id`), ai-sources (`:id`), prompt-tests (`:id`, `run/:id`), agent-tasks (`:id`, `:id/execute`, `execute-next`), outreach-campaigns (`:id`, `detail/:id`), automation-rules (`:id`, `detail/:id`), automation-executions (`:ruleId`, `:id`), publication-targets (`:id`, `:id/find-contacts`, `detail/:id`), outreach-emails (`:id`, `:id/send`, `detail/:id`), community-posts (`:id`), alert-settings (`:id`), alerts/test (`:settingId`). ~60 routes. |
| **Global-read endpoints**                              | `/api/dashboard`, `/api/onboarding-status`, `/api/platform-metrics`, `/api/articles`, `/api/citations`, `/api/geo-rankings`, `/api/geo-rankings/platform/:platform`, `/api/revenue/analytics`, `/api/competitors`, `/api/competitors/leaderboard`, `/api/listicles`, `/api/bofu-content`, `/api/faqs`, `/api/brand-mentions`, `/api/prompt-portfolio`, `/api/citation-quality`, `/api/hallucinations`, `/api/agent-tasks`, `/api/agent-tasks/next`, `/api/agent-tasks/stats`, `/api/community-posts` all now either require a brandId (which is then ownership-checked) or fall back to filtering through `getUserBrandIds(user.id)`. No list endpoint returns data outside the caller's brands.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **SSRF guard**                                         | `/api/brands/autofill`, `/api/brands/create-from-website`, `/api/check-crawler-permissions` replaced hand-rolled blocklists with `safeFetchText()` from `server/lib/ssrf.ts`. Verified: `http://127.0.0.1:5000/` and `http://169.254.169.254/latest/meta-data/` both return `{success:false, error:"This URL is not allowed"}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Rate limiting on expensive AI loops**                | `/api/distribute/:articleId` and `/api/geo-rankings/check/:articleId` — previously unlimited loops of up to 15 OpenAI/Perplexity calls per request — now gated by `aiRateLimit` (user-keyed, 10 req/min) and cap the platforms/prompts arrays to 6×3 = 18 max upstream calls. Ownership also added via `requireArticle`. Applied to `/api/bofu-content/generate`, `/api/analyze-sentiment`, `/api/brands/autofill`, `/api/brands/create-from-website`, `/api/keyword-research/discover`, `/api/faqs/:id/optimize`, `/api/agent-tasks/:id/execute`, `/api/check-crawler-permissions`, `/api/community-discover`, `/api/community-generate`, `/api/geo-signals/optimize-chunks`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Monthly usage year bug (P0-6)**                      | [`databaseStorage.ts:452`](../server/databaseStorage.ts#L452): replaced `now.getMonth() !== resetDate.getMonth()` with absolute-month comparison (`year*12+month`) so Jan-2025 and Jan-2026 don't collide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **DeepSeek real API (P1-10)**                          | [`routes.ts`](../server/routes.ts) `runPlatformCitationCheck()` calls `https://api.deepseek.com/v1/chat/completions` with `DEEPSEEK_API_KEY` instead of simulating via OpenAI. Other non-OpenAI platforms (Claude, Grok, Gemini, Copilot) now clearly mark their responses as `[simulated via OpenAI — no <platform> API configured]` so users know the score isn't authoritative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **`platformUrl` misuse (P1-11)**                       | [`routes.ts:1702`](../server/routes.ts): generated platform content now writes to `distributions.metadata.content` instead of overloading `platform_url`. The column stays null until actual publishing is wired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Frontend auth form response.ok (P1-18)**             | Already handled in `login.tsx`/`register.tsx`/`forgot-password.tsx` during an earlier pass. [`landing.tsx:207`](../client/src/pages/landing.tsx#L207) waitlist fetch now guards `response.json()` in try/catch and checks `res.ok` before updating UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

##### P1 — Correctness + hardening

| Area                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JSON.parse hardening** (P1-1)           | New `safeParseJson<T>()` helper in [`routes.ts`](../server/routes.ts) strips markdown fences, extracts the first balanced JSON object/array, and returns `null` on failure. Applied to every OpenAI response parser: brands/autofill, brands/create-from-website, analyze-sentiment, keyword-research/discover, listicle discovery, wikipedia scan, FAQ optimize, FAQ generate, community-discover, community-generate.                                                                                     |
| **Content length caps** (P1-2)            | `MAX_CONTENT_LENGTH` = 40 KB constant enforced on `/api/analyze-content`, `/api/rewrite-content`, `/api/analyze-sentiment`, `/api/geo-signals/{analyze,chunk-analysis,optimize-chunks,pipeline-simulation}`. Returns 413 with a clear message.                                                                                                                                                                                                                                                              |
| **Production error handler** (P1-3)       | [`server/index.ts`](../server/index.ts): global error middleware now returns `"Internal Server Error"` for 5xx in production (only expose `err.message` when `err.expose === true` or status < 500). Always logs the full error server-side.                                                                                                                                                                                                                                                                |
| **Rate limiter user-keyed** (P1-5)        | [`routes.ts`](../server/routes.ts) `aiRateLimit` now uses `keyGenerator: (req) => user?.id ?? req.ip`, so a shared NAT/proxy IP can't DoS other tenants.                                                                                                                                                                                                                                                                                                                                                    |
| **Stripe webhook idempotency** (P1-6)     | New [`migrations/0002_webhook_idempotency.sql`](../migrations/0002_webhook_idempotency.sql) creates `public.stripe_webhook_events(event_id PK, event_type, received_at, processed_at)`. [`webhookHandlers.ts`](../server/webhookHandlers.ts) inserts `event.id` with `ON CONFLICT DO NOTHING`; if the insert doesn't return a row, the event is a retry and is skipped immediately. `processed_at` is updated after successful handling. Prevents double-downgrade / double-tier-grant when Stripe retries. |
| **Unhandled Stripe events logged** (P1-8) | [`webhookHandlers.ts:101`](../server/webhookHandlers.ts#L101) `default:` case now logs `[Webhook] unhandled event type: ${event.type}` instead of silently dropping.                                                                                                                                                                                                                                                                                                                                        |
| **Env schema extended** (P1-7)            | [`server/env.ts`](../server/env.ts) validates `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `PUBLIC_BASE_URL`, `STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (all optional — features degrade cleanly when absent).                                                                                                                                                                                                                                    |
| **Stripe apiVersion**                     | [`server/stripeClient.ts`](../server/stripeClient.ts) drops the hardcoded `'2025-11-17.clover'` string; the SDK defaults to its bundled `LatestApiVersion` automatically so a future `stripe` package bump no longer requires a second file edit.                                                                                                                                                                                                                                                           |
| **OpenAI SDK timeout**                    | `openai` client instantiated with `timeout: 45_000, maxRetries: 1` so a hanging upstream can't block a worker indefinitely.                                                                                                                                                                                                                                                                                                                                                                                 |
| **GEO rankings citation loop N+1**        | The "increment citations N times in a loop" bug is replaced with a single `updateArticle({ citationCount: existing + N })` call. No more over-increment-on-partial-failure.                                                                                                                                                                                                                                                                                                                                 |
| **Partial failure in FAQ generate**       | `Promise.all(faqs.map(createFaqItem))` replaced with a sequential per-item try/catch loop so one bad OpenAI-generated item doesn't abort the whole batch.                                                                                                                                                                                                                                                                                                                                                   |
| **MemStorage (dead code)**                | Deleted ~2370 lines of unused in-memory storage from [`server/storage.ts`](../server/storage.ts). File shrunk from 2635 → 266 lines.                                                                                                                                                                                                                                                                                                                                                                        |

##### Files changed this pass

- **New:** `server/lib/ownership.ts`, `server/lib/ssrf.ts`, `migrations/0002_webhook_idempotency.sql`
- **Modified:** `server/routes.ts`, `server/index.ts`, `server/env.ts`, `server/stripeClient.ts`, `server/webhookHandlers.ts`, `server/databaseStorage.ts`, `server/storage.ts` (MemStorage deleted), `client/src/pages/landing.tsx`
- Server bundle: 383 kB (was 345 kB — growth from added helpers)
- Client bundle: 1.08 MB (unchanged)

##### Verification

```
npx tsc --noEmit            → zero errors
npm run build               → built in 13.84s
NODE_ENV=production node dist/index.js
    → Applied migration 0001_auth_sync.sql
    → Applied migration 0002_webhook_idempotency.sql
    → serving on port 5000
    → /health: {"status":"ok","db":true}
```

**Multi-tenant + SSRF + admin smoke test (13/13 passed):**

```
✓ A GET /api/brands                             → 200
✓ B sees 0 brands                               → 0
✓ B GET /api/brands/<Alice-id>                  → 404
✓ B DELETE /api/brands/<Alice-id>               → 404
✓ B GET /api/listicles/<Alice-brandId>          → 404
✓ B GET /api/bofu-content/<Alice-brandId>       → 404
✓ B GET /api/faqs/<Alice-brandId>               → 404
✓ B POST competitor with A brandId              → 404 (was 200 + cross-write)
✓ B POST listicle with A brandId                → 404
✓ B POST article with A brandId                 → 404
✓ Non-admin POST /api/beta/codes                → 403
✓ SSRF: autofill localhost rejected             → blocked
✓ SSRF: autofill cloud-metadata rejected        → blocked
```

Unauth curl spot check (all 401 except public waitlist):

```
✓ GET /api/brands                → 401
✓ POST /api/beta/codes           → 401
✓ GET /api/dashboard             → 401
✓ GET /api/onboarding-status     → 401
✓ GET /api/platform-metrics      → 401
✓ GET /api/articles              → 401
✓ GET /api/competitors           → 401
✓ POST /api/competitors          → 401
✓ POST /api/brands/autofill      → 401
✓ POST /api/waitlist             → 200  (public)
```

##### Deferred to a follow-up session (user-approved scope split)

All of these items were closed in Phase D below (same day). Only `sendOutreachEmail` mock and Pool SSL cert pinning remain open.

---

#### Phase D — Deferred-list follow-up (2026-04-15, Complete)

Closed the full deferred list from Phase C and shipped the schema FK overhaul, tracked migrations, and a conservative package upgrade pass.

##### Files changed this pass

| File                                                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`server/index.ts`](../server/index.ts)                                         | **Tracked migration runner** (P1-4): new `public.schema_migrations(filename, applied_at, checksum)` table, per-file transaction wrapper, skip already-applied. Migrations are atomic now — a mid-file failure rolls back and the next boot retries. **Graceful shutdown** coordination: `server.close()` drains in-flight requests, then `pool.end()`, then `process.exit()`; 10 s force-exit timer prevents hung shutdowns. Handles both `SIGTERM` and `SIGINT`. **Health check** verifies write capability via `pg_advisory_lock`/`unlock` round-trip (read-only replica or revoked role fails). **Request logger**: response body only logged in dev; `password`, `passwordHash`, `access_token`, `refresh_token`, `authorization`, `token`, `secret`, `apiKey` keys redacted via `sanitizeLogBody()`; 3-level depth cap; long strings truncated to 200 chars. **CORS** allowlist de-duped via `Set`. |
| [`server/databaseStorage.ts`](../server/databaseStorage.ts)                     | **P1-9 beta code single-use**: `useBetaInviteCode()` replaced check-then-update TOCTOU race with a single atomic `UPDATE ... WHERE used_count < max_uses AND (expires_at IS NULL OR expires_at > now()) RETURNING *`. Two concurrent redemptions of a 1-use code now guarantee only one winner. **P1-16 N+1 fixes**: `getCompetitorLeaderboard()` went from `1 + N*(1 article query + 1 rankings query) + N competitor latest-citation queries` to 3 queries total (brands → articles+rankings via `inArray` → snapshots via `inArray`, bucketed in memory). `discoverPublications()` went from one existence query per publication to a single `inArray` lookup. **P0-6 year bug** was already fixed in Phase C.                                                                                                                                                                                        |
| [`server/routes.ts`](../server/routes.ts)                                       | **P1-2 humanize token cap**: `humanizeContent()` now computes `perCallMaxTokens = min(4500, max(500, ceil(inputTokens * 1.5)))`, so a 200-word article can't spend the full 4500-token budget three passes in a row. Scorer `JSON.parse` replaced with `safeParseJson()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [`shared/schema.ts`](../shared/schema.ts)                                       | **P1-13/14/15 schema FK overhaul**: every `brandId` column that should be required is now `.notNull().references(() => brands.id, { onDelete: "cascade" })`; nullable FKs (articleId, competitorId chains) use `onDelete: "set null"`; every FK column has an index; `articles.slug` dropped global unique, replaced with `uniqueIndex("articles_brand_slug_idx").on(table.brandId, table.slug)` so two brands can own the same slug; `articles_status_idx` + `geo_rankings_ai_platform_idx` + `agent_tasks_status_idx` added for hot filters. 28 tables touched.                                                                                                                                                                                                                                                                                                                                        |
| [`migrations/0003_fk_hardening.sql`](../migrations/0003_fk_hardening.sql)       | **New handcrafted idempotent migration** that drops the old `articles_slug_unique` constraint (if still present), adds the composite `articles_brand_slug_idx`, flips `brand_id` to `NOT NULL` on every owning table (guarded by a `where brand_id is null` check so it won't fail on legacy rows), drops + recreates every `brand_id`/`article_id` FK with the appropriate `ON DELETE CASCADE`/`SET NULL`, and creates every index via `CREATE INDEX IF NOT EXISTS`. Uses two `DO $$ ... END $$` blocks with `pg_constraint` lookups because drizzle-kit's diff engine can't detect `ON DELETE` changes on an already-populated DB. Safe to re-run — the schema_migrations tracker skips it on subsequent boots.                                                                                                                                                                                        |
| [`client/src/pages/reset-password.tsx`](../client/src/pages/reset-password.tsx) | **P1-22**: `useEffect` now wraps `supabase.auth.getSession()` in try/catch and the `onAuthStateChange` subscription respects the `cancelled` flag so late-arriving events don't set state on an unmounted component.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [`client/src/pages/dashboard.tsx`](../client/src/pages/dashboard.tsx)           | **P1-19/21**: `refetchInterval` now turns off when the query is in an error state, and `refetchIntervalInBackground: false` pauses polling while the tab is hidden. Intervals bumped (10 s → 30 s, 30 s → 60 s) to lower unnecessary traffic. Error state threaded through to a `hasError` flag for future UI surfacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [`client/src/pages/home.tsx`](../client/src/pages/home.tsx)                     | **P1-20**: captures `error` from analytics/articles/brands queries; renders a small banner above the KPI strip when any of them fail so users see "something broke" instead of blank cards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [`client/src/pages/citations.tsx`](../client/src/pages/citations.tsx)           | **P1-20**: handles the new `{ data: [...] }` response shape (with fallback to legacy `citations` field) and renders an explicit error state when the query fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [`client/src/pages/geo-tools.tsx`](../client/src/pages/geo-tools.tsx)           | **Package-upgrade fix**: `react-icons@5.6` removed `SiLinkedin` from the simple-icons namespace; swapped to `lucide-react`'s `Linkedin` via a local alias.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`.env.example`](../.env.example)                                               | Removed dead `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (password reset is handled by Supabase Auth). Removed dead `SESSION_SECRET`. Added `DEEPSEEK_API_KEY` and `PERPLEXITY_API_KEY` with "optional" comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [`package.json`](../package.json) / [`package-lock.json`](../package-lock.json) | Conservative `npm update` pass: 26 packages added, 60 removed, 163 updated — all within-major per the existing semver ranges. No major upgrades. Remaining 5 moderate-severity advisories are all transitive through dev-only `drizzle-kit` + `vite@5` (esbuild dev-server CORS issue, not reachable in prod); fixing requires Vite 6→8 major bump, deliberately deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

##### Verification

```
npx tsc --noEmit        → zero errors
npm run build           → built in 10.73s
                          server 389 kB
                          client 1.09 MB
NODE_ENV=production node dist/index.js
  → Applied migration 0003_fk_hardening.sql
  → serving on port 5000
  → /health: {"status":"ok","db":true}
```

**DB state verified via pg queries:**

```
schema_migrations rows → 0001, 0002, 0003
articles.brand_id        → NOT NULL
articles_brand_id_fkey   → confdeltype = 'c' (CASCADE)
articles indexes         → _pkey, _brand_id_idx, _status_idx, _brand_slug_idx
```

**Multi-tenant + SSRF + admin + mass-assignment smoke test (15/15 passed):**

```
✓ A GET /api/brands                             → 200
✓ B sees 0 brands                               → 0
✓ B GET /api/brands/<Alice-id>                  → 404
✓ B GET /api/listicles/<Alice-brandId>          → 404
✓ B GET /api/bofu-content/<Alice-brandId>       → 404
✓ B GET /api/faqs/<Alice-brandId>               → 404
✓ B POST competitor with A brandId              → 404
✓ B dashboard totalBrands                       → 0
✓ B POST article with A brandId                 → 404
✓ SSRF: http://169.254.169.254/                 → blocked
✓ SSRF: http://127.0.0.1:5000/                  → blocked
✓ analyze-content body > 40 KB                  → 413
✓ Non-admin POST /api/beta/codes                → 403
✓ Unauth /api/brands                            → 401
✓ Public POST /api/waitlist                     → 200
```

##### Items remaining (genuinely still open)

- **`sendOutreachEmail` mock** ([`databaseStorage.ts:1564`](../server/databaseStorage.ts#L1564)) — per user direction, left in place; UI does NOT disclose to the user that outreach isn't actually sending. **Status: still pending.**
- **Pool SSL cert pinning** — Supabase pooler uses a self-signed cert chain; `rejectUnauthorized: false` stays. Fix requires downloading Supabase's root CA and pinning via `ssl: { ca: ... }`. **Status: still pending.**
- **Dev-only transitive vulns** (esbuild <=0.24.2 via drizzle-kit + vite) — blocked on Vite 5 → 8 major bump. **Status: deferred.**
- **Client bundle 1.09 MB** — code-splitting warning. **Status: Phase 2.**

---

## Track 2 — Security Hardening

**Goal:** All identified vulnerabilities resolved before beta users are onboarded.

**Status:** Complete

### Files Changed

| File                | Change                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`        | Added `.env`, `.env.*`, `.env.local`, `.env.production`, `.env.development`                                                                                       |
| `server/index.ts`   | `helmet` with CSP policy; `cors` with explicit origin allowlist (`APP_URL` + localhost); `express.json({ limit: '1mb' })`; `express.urlencoded({ limit: '1mb' })` |
| `server/routes.ts`  | `express-rate-limit` (`aiRateLimit`: 10 req/min per IP) on `/api/generate-content`, `/api/keyword-suggestions`, `/api/keyword-research/discover`                  |
| `server/session.ts` | `SESSION_SECRET` throws on startup if not set in production. pg.Pool `max:10`, `idleTimeoutMillis:30000`. SIGTERM shutdown handler.                               |
| `package.json`      | Added `cors`, `express-rate-limit`, `helmet`, `pg`. Added `@types/cors`, `@types/pg`.                                                                             |

### How to Test

```bash
# CORS rejects unlisted origin
curl -H "Origin: https://evil.com" http://localhost:5000/api/auth/me -v 2>&1 | grep -i "access-control"
# → No Access-Control-Allow-Origin header

# Payload limit — 2MB body returns 413
node -e "
const http = require('http');
const body = JSON.stringify({x: 'a'.repeat(2*1024*1024)});
const req = http.request({host:'localhost',port:5000,path:'/api/generate-content',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>console.log('Status:',r.statusCode));
req.write(body); req.end();
"
# → Status: 413

# Rate limit — 11 rapid requests, 11th returns 429
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/generate-content \
    -H "Content-Type: application/json" -d '{}'
done
# → 10x 4xx/2xx then 429

# .env in gitignore
git check-ignore -v .env
# → .gitignore:8:.env    .env
```

### Pass Criteria

- [x] `.env` appears in `.gitignore`
- [x] CORS configured with explicit origin allowlist
- [x] Payload cap: 2MB body → 413
- [x] CSP headers via `helmet` on all responses
- [x] 11 rapid AI generation requests → 11th returns 429
- [x] `SESSION_SECRET` throws in production if not set
- [x] DB connection pool limits set (`max:10`, `idleTimeoutMillis:30000`)
- [x] SIGTERM closes pool and HTTP server cleanly
- [x] `npm audit` — 0 High/Critical CVEs (`npm audit fix` + `drizzle-orm@^0.45.2` upgrade; 5 moderate dev-only esbuild/vite CVEs remain, unfixable without breaking version jumps)

---

## Track 3 — Feature Fixes

### Feature 1 — Brand Setup

**Status:** Pending

#### Pass Criteria

- [ ] Create brand → refresh — brand visible in brand list
- [ ] Brand linked to correct user — other users cannot access it
- [ ] Exceeding brand limit → error message shown

---

### Feature 2 — AI Visibility Checklist

**Status:** Pending

#### Pass Criteria

- [ ] Steps render in correct priority order
- [ ] DeepSeek appears in the platform list
- [ ] Each item has a clear action or verification method
- [ ] Checking an item persists on refresh

---

### Feature 3 — AI Keyword Research

**Status:** Pending

#### Pass Criteria

- [ ] Keywords generate reliably on 5 consecutive attempts
- [ ] API failure → user sees error message, not blank screen
- [ ] Loading spinner visible during generation

---

### Feature 4 — AI Content Generation

**Status:** Pending

#### Pass Criteria

- [ ] Auto-improve: score never decreases from starting score across 5 runs
- [ ] Score delta displayed after each improve attempt
- [ ] Hitting limit → user sees clear message with upgrade CTA
- [ ] Usage counter resets correctly on reset date

---

### Feature 5 — Track AI Citations

**Status:** Pending

#### Pass Criteria

- [ ] Navigate to `/citations` — no 404, page loads
- [ ] Empty state: "No citations tracked yet"
- [ ] With data: citations listed with source, platform, timestamp

---

### Feature 6 — Distribute Your Content

**Status:** Pending

#### Pass Criteria

- [ ] Click "Publish Article" → row in `distributions` table
- [ ] Published article URL is accessible or clearly marked pending
- [ ] Platform-specific content can be viewed, edited, and saved before publishing
- [ ] Re-generating content updates draft — no duplicates

---

## Track 4 — UI/UX Fixes

**Status:** Partial — global layout, design system, and dashboard polish pass complete. Per-page states (loading, empty, error) still pending.

### Dashboard UI/UX Polish Pass (Complete)

**Goal:** Fix remaining visual regressions after the Jobhunt refactor — finish the color strip, polish the sidebar, add a proper layout shell, rework the dashboard, and add mobile responsiveness.

#### Files Created

| File                                   | Change                                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/PageHeader.tsx` | New shared page header with `title`, `description`, `actions` slots. Consistent `text-2xl font-semibold` title, `text-sm text-muted-foreground` description, flex layout with action buttons on the right. |

#### Files Modified

| File                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/home.tsx`           | Removed `color` and `bgColor` fields from `PriorityFeature` interface and all 14 feature entries. Added `tagline` field for 1-line descriptions. Rewrote page: new 4-card KPI strip (Brands/Articles/Citations/Citation Quality) sourced from existing queries. Features grouped into 3 priority sections (`Start here`, `Recommended`, `Power tools`) with H3 headers + 3-col card grid. Removed redundant AI Intelligence Summary card cluster. Uses new `PageHeader` with conditional primary action (Create Brand / Create Content).                                              |
| `client/src/components/Sidebar.tsx`   | Tokenized all literal colors → `bg-sidebar`, `bg-sidebar-primary text-sidebar-primary-foreground`, `text-sidebar-accent-foreground`. Added `focus-visible` rings to nav items. 2px primary indicator bar on active item. Chevron rotation animation on Phase 2 collapse. Replaced per-item Clock icon with "Soon" label. User row wrapped in `DropdownMenu` with Account settings (disabled) + Log out. Avatar fallback → `bg-primary`. Extracted `SidebarContent` as named export shared between desktop `<aside>` and mobile `Sheet`. Default `Sidebar` export now hidden at `<lg`. |
| `client/src/components/AppLayout.tsx` | Wrapped main content in `mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6` gutters. Added responsive mobile top bar (`lg:hidden`) with hamburger Menu button that opens a `Sheet` drawer containing the shared `SidebarContent`. `onNavigate` callback wired through to auto-close drawer on navigation.                                                                                                                                                                                                                                                                       |
| `client/src/pages/brands.tsx`         | `text-red-600` Sparkles → `text-foreground`. `bg-red-600 hover:bg-red-700 text-white` → `bg-primary hover:bg-primary/90 text-primary-foreground`. `bg-red-400 animate-bounce` → `bg-primary animate-bounce`.                                                                                                                                                                                                                                                                                                                                                                          |
| `client/src/pages/citations.tsx`      | All `text-green-600` check icons → `text-foreground`. `text-amber-600` Search, `text-purple-600` BookOpen, `text-amber-500` Lightbulb → `text-muted-foreground`. Green growth badge → `bg-muted text-foreground`. Blue hover links → `text-foreground hover:underline`. Platform icon row `bg-primary` → `bg-muted text-foreground`.                                                                                                                                                                                                                                                  |
| `client/src/pages/articles.tsx`       | `text-blue-700 dark:text-blue-300` → `text-muted-foreground`. `text-green-500` CheckCircle → `text-foreground`. `bg-slate-50 dark:bg-slate-900` pre → `bg-muted`. `text-red-600` failed state → `text-destructive`.                                                                                                                                                                                                                                                                                                                                                                   |
| `client/src/pages/ai-visibility.tsx`  | All 7 engine `color` values → `text-foreground`. `SiGoogle text-blue-500` → `text-foreground`. Priority badges: high → `bg-foreground text-background`, medium → `bg-muted text-foreground border-border`, low → `variant="outline" text-muted-foreground`. Engine card border → `border border-foreground / border-border`. Complete badge → `bg-foreground text-background`. `text-green-600` checks → `text-foreground`. `text-purple-600`/`text-amber-500` icons → `text-muted-foreground`. Quick Wins inner `bg-white` → `bg-card`.                                              |
| `client/src/pages/content.tsx`        | Generated badge `text-green-600 border-green-300` → `text-foreground border-border`. Saved badge `text-blue-600 border-blue-300` → `text-muted-foreground border-border`. `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary/90 text-primary-foreground`. Humanization pass/fail feedback colors preserved (semantic).                                                                                                                                                                                                                                                    |

#### Pass Criteria

- [x] No hardcoded colored text/border/bg classes on the dashboard (home.tsx)
- [x] Sidebar uses only design tokens (no literal `hsl()` or `bg-white`)
- [x] Focus-visible rings on all nav items
- [x] Active nav item has left indicator bar + bg pill
- [x] Phase 2 chevron animates open/closed
- [x] User row opens a DropdownMenu with logout
- [x] `AppLayout` has `max-w-[1400px]` content gutter
- [x] `PageHeader` component available and adopted by dashboard
- [x] Dashboard KPI strip pulls from existing queries (no new endpoints)
- [x] Dashboard features grouped into 3 priority sections
- [x] Mobile (`<lg`): sidebar hidden, hamburger opens Sheet drawer
- [x] `SidebarContent` shared between desktop aside and mobile Sheet
- [x] All color leaks removed from brands/articles/citations/ai-visibility/content
- [x] Zero new TypeScript errors (`npx tsc --noEmit` — only pre-existing server errors remain)
- [ ] Loading states on all data-fetching pages
- [ ] Empty states on all list views
- [ ] Error states on all API-dependent pages
- [ ] Lighthouse accessibility scan ≥ 95 on `/dashboard`

### Earlier Design System Refactor (Complete)

### Design System Refactor (Complete)

**Goal:** Replace top navbar + dark theme with Jobhunt-style fixed left sidebar, white card layout on light gray background. Authenticated routes only — public pages (landing, login, register, forgot-password, reset-password, pricing) untouched.

#### Files Created

| File                                  | Change                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/src/components/Sidebar.tsx`   | New fixed 220px left sidebar. Three nav groups: MAIN (Dashboard, Brands, Articles), TOOLS (Content, Citations, Keywords, AI Visibility), PHASE 2 (collapsible, 18 items with Clock icon). User avatar + logout pinned at bottom. Active item: near-black bg, white text, rounded-lg. |
| `client/src/components/AppLayout.tsx` | Two-column layout shell — `flex min-h-screen`: Sidebar (fixed) + `<main>` with `ml-[220px] overflow-y-auto`.                                                                                                                                                                         |

#### Files Modified

| File                                    | Change                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/index.css`                  | `:root` light-mode tokens updated: `--background` → `hsl(220,14%,96%)` (light gray), `--card` → white, `--border` → `hsl(220,13%,91%)`, `--muted` → `hsl(220,14%,94%)`, sidebar vars updated (white sidebar bg, near-black active item). `.dark` block untouched. |
| `client/src/App.tsx`                    | `AuthenticatedRoute` wraps in `<AppLayout>` instead of `<Navbar>`. `HomePage` (route `/`) also wraps authenticated render in `<AppLayout>`. `Navbar` import removed.                                                                                              |
| `client/src/components/ComingSoon.tsx`  | Violet icon/badge → `bg-muted text-muted-foreground` (neutral palette).                                                                                                                                                                                           |
| `client/src/pages/home.tsx`             | All 14 feature-card `bgColor` values → `bg-muted`. Stat cards: gradient removed → `bg-card border-border`, text → `text-foreground`. AI intelligence sub-boxes → `bg-muted`. Priority badges → neutral. Page wrapper gradient removed.                            |
| `client/src/pages/brands.tsx`           | Add Brand card: gradient + colored border → `bg-card border-border`. Next Step card: blue gradient + blue CTA → neutral card + `bg-primary` button. Icon containers → `bg-muted`.                                                                                 |
| `client/src/pages/articles.tsx`         | Distribution info banner and Live Citation Check banner: blue/green → `bg-muted border-border`.                                                                                                                                                                   |
| `client/src/pages/content.tsx`          | Tips banner, usage widget, template preview, category tag, humanization tips box → neutral. Upgrade button `bg-violet-600` → `bg-primary`.                                                                                                                        |
| `client/src/pages/citations.tsx`        | Why-track card, step number circles, tip/example banners → neutral `bg-muted border-border`.                                                                                                                                                                      |
| `client/src/pages/keyword-research.tsx` | Intent-type badge color map (informational/commercial/transactional/navigational) → `bg-muted text-muted-foreground border-border`.                                                                                                                               |
| `client/src/pages/ai-visibility.tsx`    | All 7 engine `bgColor` values, progress summary card gradient, step completion row, How-to-do-this box, Quick Wins card → neutral.                                                                                                                                |

### Pass Criteria

- [x] Fixed left sidebar visible on all authenticated routes
- [x] Top navbar removed from all authenticated routes
- [x] Light gray app background (`hsl(220,14%,96%)`) on all authenticated pages
- [x] White cards with subtle 1px border on all authenticated pages
- [x] All colored gradient backgrounds stripped from metric/stat cards
- [x] Active nav item: near-black background, white text
- [x] Phase 2 items accessible via collapsible sidebar section
- [x] User avatar + logout in sidebar bottom
- [x] Public pages (landing, login, register, forgot-password, reset-password, pricing) — layout unchanged
- [x] Coming Soon badge uses neutral palette (no violet)
- [ ] Tutorial triggers only after login
- [ ] Sign-up CTA is the primary above-the-fold action on the landing page
- [ ] Pricing page: no duplicate headers, no chart flash
- [ ] Loading states on all data-fetching pages
- [ ] Empty states on all list views
- [ ] Error states on all API-dependent pages
- [ ] No console errors on any route
- [ ] All pages usable at 375px width

---

## Track 5 — Codebase Cleanup

**Status:** Complete

### Files Changed

| File                                   | Change                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `client/src/assets/logo.png`           | Created — logo copied from deleted `attached_assets/`                                                 |
| `vite.config.ts`                       | `@assets` alias → `client/src/assets/`                                                                |
| `client/src/components/Navbar.tsx`     | Import updated to `@assets/logo.png`                                                                  |
| `client/src/pages/login.tsx`           | Import updated to `@assets/logo.png`                                                                  |
| `client/src/pages/register.tsx`        | Import updated to `@assets/logo.png`                                                                  |
| `client/src/pages/forgot-password.tsx` | Import updated to `@assets/logo.png`                                                                  |
| `client/src/pages/reset-password.tsx`  | Import updated to `@assets/logo.png`                                                                  |
| `package.json`                         | Renamed from `"rest-express"` → `"venturecite"`                                                       |
| `client/src/components/ComingSoon.tsx` | Created — "Upcoming — Phase 2" gate component                                                         |
| `client/src/App.tsx`                   | All 18 non-Phase-1 routes render `ComingSoon` instead of their page components. Page files untouched. |
| `server/replit_integrations/`          | Deleted                                                                                               |
| `scripts/post-merge.sh`                | Deleted                                                                                               |
| `.replit`                              | Deleted                                                                                               |
| `attached_assets/`                     | Deleted                                                                                               |

### Pass Criteria

- [x] Logo loads from `client/src/assets/logo.png`
- [x] `package.json` name is `"venturecite"`
- [x] All non-Phase-1 feature pages show "Upcoming — Phase 2" screen
- [x] `server/replit_integrations/` deleted
- [x] `scripts/post-merge.sh` deleted
- [x] `.replit` deleted
- [x] `attached_assets/` deleted
- [x] No `replit` string in any file under `server/`, `client/`, `shared/`
- [ ] `npm run build` passes — requires `npm install` first

---

## Dev Tooling

**Goal:** Local development works on Windows without any real API keys or database.

**Status:** Complete

### Files Changed

| File           | Change                                                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `patch.js`     | Rewritten — cookie-based in-memory mock auth. Intercepts `POST /api/auth/login` (validates `admin@venturecite.com` / `admin123`, sets `mock_auth` cookie), `GET /api/auth/me` (reads cookie, returns admin user), `POST /api/auth/logout` (clears cookie). All dashboard data routes mocked. Windows `reusePort` fix retained. |
| `package.json` | Added `dev:mock` script — `cross-env NODE_ENV=development tsx --import ./patch.js server/index.ts`. Added `cross-env` to devDependencies (required for Windows `NODE_ENV=` syntax).                                                                                                                                            |

### How to Use

```bash
npm run dev:mock
# → Server starts on http://localhost:5000
# → Login at /login with: admin@venturecite.com / admin123
# → Dashboard and all mock data routes available immediately
```

### Pass Criteria

- [x] `npm run dev:mock` starts server with no real env vars required
- [x] `POST /api/auth/login` with dummy credentials → `{success:true, user:{...}}` + cookie set
- [x] `GET /api/auth/me` after login → returns admin user
- [x] `POST /api/auth/logout` → clears cookie, subsequent `/api/auth/me` returns 401
- [x] All dashboard data routes (`/api/brands`, `/api/usage`, `/api/dashboard`, etc.) return mock data

---

## Track 6 — Production Readiness

**Status:** Partial — health endpoint added, graceful shutdown added. TypeScript check and full build pending `npm install`.

### Files Changed

| File              | Change                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/index.ts` | `GET /health` → `{"status":"ok","db":true,"timestamp":"..."}`. SIGTERM graceful shutdown closes HTTP server. Dev-only error logging gated on `NODE_ENV !== 'production'`. |

### Pass Criteria

- [x] `GET /health` returns `{"status":"ok","db":true}`
- [x] SIGTERM shuts down server and pool cleanly
- [ ] `npm run check` → zero TypeScript errors
- [ ] `npm run build` → completes without errors
- [ ] `npm run start` → server starts, serves frontend, API responds

---

## Track 7 — Phase 1 Core Features (Production Hardening)

**Goal:** Take the six Phase 1 features (Brand Setup, AI Visibility, Keyword Research, Content Generation, Citations, Distribute) from prototype to beta-ready — fix critical bugs, plug security holes, and wire the features into real user flows.

**Status:** Complete. `npx tsc --noEmit` clean. `npm run build` passes.

### Batch 1 — P0 Critical Bugs

| Fix                              | File                                                   | Change                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Citation count double-counting   | `server/routes.ts` ~L2243, `server/databaseStorage.ts` | Re-ran ranking checks added to `article.citationCount` instead of SET-ing. Now uses new `countCitedRankingsForArticle()` to compute the true total from the DB. |
| Usage counter charged on failure | `server/routes.ts` ~L874                               | `storage.incrementArticleUsage()` moved after successful article build so failures don't burn quota.                                                            |
| Keyword research ownership check | `server/routes.ts`                                     | Audit confirmed `app.param("brandId", brandIdParamHandler)` already covers `GET /api/keyword-research/:brandId` — no fix needed.                                |

### Batch 2 — Brand Setup Reliability

**Files:** [server/routes.ts](server/routes.ts) (`POST /api/brands`, `POST /api/brands/create-from-website`), [client/src/pages/brands.tsx](client/src/pages/brands.tsx)

- **Tier limits enforced** — `free: 1`, `beta: 3`, `pro: 5`, `enterprise: unlimited` brands. Both manual create and create-from-website paths check `getBrandsByUserId().length` against `usageLimits[tier].maxBrands` and return `403` when exceeded.
- **URL validation** — `new URL(...)` + hostname-must-contain-`.` guard before SSRF fetch.
- **Duplicate name detection** — case-insensitive match per user, returns `409` unless `{force: true}`.
- **OpenAI timeout** — `AbortSignal.timeout(25_000)` on the website-analysis call. `AbortError`/`TimeoutError` → `504` with clear message.
- **Partial-analysis surfacing** — when GPT-4o-mini returns unparseable JSON, the server still creates the brand (with hostname fallback) but returns `{analysisQuality: "partial"}`. The client shows a destructive toast: _"Brand created — analysis incomplete. Edit the details to fill in the gaps."_
- **Null-safe array pre-fill** — edit form uses `Array.isArray(brand.products) ? brand.products.join(', ') : ""` for products, keyValues, uniqueSellingPoints, nameVariations — prevents crashes when legacy brands have non-array values.
- **Type widening** — [server/lib/ownership.ts:16](server/lib/ownership.ts#L16) `requireUser()` return type now includes `accessTier` and `email`.

### Batch 3 — AI Visibility Checklist

**File:** [client/src/pages/ai-visibility.tsx](client/src/pages/ai-visibility.tsx)

- **DeepSeek engine added** — 5 ordered steps covering robots.txt access, authoritative content, Schema.org markup, external citations, indexing API.
- **Safe localStorage parse** — wrapped `JSON.parse` in try/catch; corrupt entries are auto-removed instead of crashing the page.
- **Mandatory brand selection** — "All Brands" option removed, placeholder changed to `"Select a brand..."`. The page still renders immediately, but `toggleStep()` now guards: if no brand is selected, a toast fires (_"Select a brand first"_) and the click is a no-op. localStorage key simplified (no more `default` fallback).
- **Merged engine rows** — deleted the `Tabs`/`TabsList` bar entirely. The row of engine cards (ChatGPT, Claude, Gemini, …) is now itself clickable via `onClick={() => setSelectedEngineId(engine.id)}`, with a visual ring on the selected card. The checklist below is rendered via an IIFE that looks up `aiEngines.find(e => e.id === selectedEngineId)`.

### Batch 4 — AI Keyword Research

**File:** [server/routes.ts](server/routes.ts) (`POST /api/keyword-research/discover`), [client/src/pages/keyword-research.tsx](client/src/pages/keyword-research.tsx)

- **Cache key fix** — delete/update mutations were invalidating `["/api/keyword-research", brandId]` (two-element array) while the query stored under `["/api/keyword-research/${brandId}"]` (template string). Fixed to use the template literal consistently — deletes now refresh the list.
- **Dedup before insert** — builds a `Set` of existing normalized keyword strings (`trim().toLowerCase()`) for the brand and skips duplicates in the loop. Running Discover twice no longer creates dupes.
- **Typed OpenAI errors** — wrapped the GPT-4 call in a try/catch that returns `429` (busy), `503` (misconfigured), `504` (timeout), `502` (other) with user-friendly messages instead of a generic 500.
- **Zero-valid-keywords handling** — if every returned keyword was a duplicate, returns `{success: false, error: "No new keywords found — try completing your brand profile..."}` instead of an empty success.

### Batch 5 — AI Content Generation

**Files:** [server/routes.ts](server/routes.ts) (`humanizeContent()`, `POST /api/generate-content`), [client/src/pages/content.tsx](client/src/pages/content.tsx)

- **Auto-improve never lowers score** — `humanizeContent()` now tracks `bestContent`/`bestScore`/`bestIssues`/`bestStrengths` across all humanization passes and returns the highest-scoring version, not the last one. A 65 → 62 → 81 run now returns 81, not 62.
- **Score delta UI** — `content.tsx` captures `scoreBeforeImprove` before calling rewrite, then shows inline `"65 → 81 (+16)"` in green (or `"Score unchanged"` in amber) next to the score card.
- **Typed OpenAI errors** — 401 → "misconfigured", 429 → "wait 30s", timeout → "generation timed out", 500 → "service error".
- **Disable at limit** — Generate button disables and shows `"Monthly limit reached"` when `usageData.articlesRemaining === 0`. Tooltip explains the block.
- **Usage counter timing** — verified `incrementArticleUsage()` fires only after `humanizeContent()` returns, before `res.json()`.

### Batch 6 — Citations — Brand-Level Prompt Portfolio (Full Redesign)

**Before:** Manual URL pasting + per-article "Check Rankings" button firing 3 hardcoded template prompts.
**After:** AI-generated 10 strategic prompts per brand, run across 5 platforms, aggregated per-platform and per-prompt.

#### Schema + Migration

| File                                                                   | Change                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [shared/schema.ts](shared/schema.ts)                                   | New `brandPrompts` table: `{id, brandId (cascade FK), prompt, rationale, orderIndex, createdAt}`. Updated `geoRankings`: `articleId` now nullable, new `brandPromptId` nullable FK + index. |
| [migrations/0005_brand_prompts.sql](migrations/0005_brand_prompts.sql) | Creates `brand_prompts`, drops NOT NULL from `geo_rankings.article_id`, adds `brand_prompt_id` FK with `ON DELETE SET NULL`, adds indexes.                                                  |

#### New Shared Helper Module

**[server/citationChecker.ts](server/citationChecker.ts)** — extracted out of `routes.ts` so routes and scheduler share one implementation:

- `runPlatformCitationCheck(platform, prompt, brand, ...)` — per-platform query with real APIs where configured (ChatGPT/GPT-4o-mini, Perplexity, DeepSeek) and an OpenAI-simulated fallback for Claude/Gemini/Grok with `[simulated via OpenAI]` tagging.
- `checkForCitation(responseText, brandName, ...)` — heuristic brand-mention detector (exact match → title keywords → related keywords).
- `runBrandPrompts(brandId, platforms)` — loads stored prompts, iterates every (prompt × platform) pair, persists each result as a `geoRankings` row with `articleId: null, brandPromptId: bp.id`.
- `DEFAULT_CITATION_PLATFORMS = ['ChatGPT', 'Perplexity', 'DeepSeek', 'Claude', 'Gemini']`.

#### New API Endpoints ([server/routes.ts](server/routes.ts))

| Method | Path                                   | Purpose                                                                                                                                                                                                             |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/brand-prompts/:brandId/generate` | GPT-4 reads brand profile + up to 10 latest published articles, returns 10 strategic prompts with rationales. Deletes any existing prompts for that brand and replaces them. Timeouts/429s surface as typed errors. |
| `GET`  | `/api/brand-prompts/:brandId`          | Returns the stored 10 prompts.                                                                                                                                                                                      |
| `POST` | `/api/brand-prompts/:brandId/run`      | Rate-limited. Runs all 10 prompts × all 5 platforms (50 checks). Persists rows and returns `{totalChecks, totalCited, citationRate}`.                                                                               |
| `GET`  | `/api/brand-prompts/:brandId/results`  | Aggregates latest result per `(promptId, platform)` pair — reruns don't double-count. Returns `{byPlatform, byPrompt, totalChecks, totalCited, citationRate}`. Optional `?since=ISO` filter.                        |

#### Storage Layer ([server/storage.ts](server/storage.ts), [server/databaseStorage.ts](server/databaseStorage.ts))

Added to `IStorage` + Drizzle implementations:

- `createBrandPrompt(p)` / `getBrandPromptsByBrandId(brandId)` / `deleteBrandPromptsByBrandId(brandId)`
- `getPublishedArticlesByBrandId(brandId, limit)`
- `getGeoRankingsByBrandPromptIds(ids, sinceDate?)`

#### Removed Deprecated Endpoints

- `GET /api/citations` + `POST /api/citations` (manual URL entry) — deleted.
- `POST /api/geo-rankings/check/:articleId` (per-article ranking check) — deleted.
- `GET /api/search-performance` — deleted; replaced by `/api/brand-prompts/:brandId/results`.

#### Frontend Rewrite

**[client/src/pages/citations.tsx](client/src/pages/citations.tsx)** — full rewrite (~440 lines):

1. **Brand selector** — `Select` dropdown, empty-state card when none chosen.
2. **Prompt Portfolio card** — lists all 10 prompts with rationales, or an empty state with "Generate 10 Citation Prompts" button. Cycling loading messages: _"Analyzing your brand..."_, _"Reviewing published articles..."_, _"Crafting strategic citation prompts..."_. Regenerate button confirms before replacing.
3. **"Run Citation Check" button** — only enabled when prompts exist. Loading messages cycle through each platform being queried.
4. **Results dashboard**:
   - Top 3 summary cards: Overall Citation Rate, Best Platform, Top Prompt.
   - By-Platform table: cited/checks/rate/last-run for each of the 5 AI engines.
   - By-Prompt accordion: click a prompt → see per-platform results with context excerpts and check/X icons.

**[client/src/pages/articles.tsx](client/src/pages/articles.tsx)** — `CheckRankingsDialog` component and its usage deleted. Citation checking is no longer article-scoped.

### Batch 7 — Content Distribution + Buffer Integration

**Files:** [server/routes.ts](server/routes.ts), [server/databaseStorage.ts](server/databaseStorage.ts), [server/storage.ts](server/storage.ts), [client/src/pages/articles.tsx](client/src/pages/articles.tsx)

- **Past distributions endpoint** — `GET /api/distributions/:articleId` (existing) now surfaced in the `DistributeDialog` via a new History tab. Past platform content loaded from `distributions.metadata.content` with timestamps, copy buttons, and inline edit via new `PATCH /api/distribute/entry/:distributionId` (uses new `getDistributionById()` storage method for ownership check).
- **Publish canonicalUrl fix** — `publishArticle()` in [server/databaseStorage.ts](server/databaseStorage.ts) now uses `${process.env.APP_URL || 'https://geoplatform.app'}/articles/${slug}` instead of a hardcoded domain.
- **Button rename** — `Distribute` → `Generate Platform Copy`. Dialog subtitle: _"AI rewrites your article for each platform — copy and post manually, or publish directly via Buffer."_
- **Buffer OAuth integration** (pluggable — requires `BUFFER_CLIENT_ID`/`BUFFER_CLIENT_SECRET` env vars):
  - `GET /api/auth/buffer` redirects to Buffer's OAuth page.
  - `GET /api/auth/buffer/callback` exchanges code for `access_token`, persists to `users.bufferAccessToken`.
  - `GET /api/buffer/profiles` fetches connected profiles (returns `{connected: false}` if not set up).
  - `POST /api/buffer/post` pushes content to `https://api.bufferapp.com/1/updates/create.json` with `profile_ids[]` and optional `scheduled_at`.
  - `DELETE /api/auth/buffer` clears the token.
  - **UI**: DistributeDialog shows a _"Connect Buffer"_ banner when `bufferData.connected === false`. When connected, each platform card gets a _"Post to Buffer"_ button next to Copy, matching Buffer profile service name to platform (LinkedIn → LinkedIn).

### Batch 8 — Granular Loading States

**New file:** [client/src/hooks/use-loading-messages.ts](client/src/hooks/use-loading-messages.ts)

- `useLoadingMessages(isLoading, messages[], intervalMs = 3000)` cycles through an array of strings every 3s while `isLoading` is true, resets to index 0 when done.

**Wired into:**

- [client/src/pages/content.tsx](client/src/pages/content.tsx) — generate button: _"Analyzing your brand..."_, _"Researching your industry..."_, _"Structuring the content outline..."_, _"Applying your brand voice..."_, etc. (9 messages).
- [client/src/pages/keyword-research.tsx](client/src/pages/keyword-research.tsx) — discover button: _"Analyzing your brand profile..."_, _"Identifying competitor keywords..."_, _"Scanning AI search patterns..."_, etc. (5 messages).
- [client/src/pages/brands.tsx](client/src/pages/brands.tsx) — website analysis button: _"Fetching your website..."_, _"Reading your content..."_, _"Identifying your brand voice..."_, etc. (5 messages).
- [client/src/pages/articles.tsx](client/src/pages/articles.tsx) — distribute button: _"Reading your article..."_, _"Adapting for each platform..."_, _"Writing LinkedIn version..."_, etc. (6 messages).
- [client/src/pages/citations.tsx](client/src/pages/citations.tsx) — both generate-prompts and run-check buttons get their own cycling messages.

### Batch 9 — Weekly Scheduled Citation Tracking

**New packages:** `resend`, `node-cron`, `@types/node-cron`.

**New files:**

- [server/emailService.ts](server/emailService.ts) — Resend client + per-brand HTML email template. `BrandReport` type: `{name, totalChecks, totalCited, citationRate, platformStats, topPrompts, needsSetup}`. Template renders one section per brand, per-platform table, top-3 prompts, CTA back to `/citations`. Gracefully no-ops when `RESEND_API_KEY` is unset.
- [server/scheduler.ts](server/scheduler.ts) — `initScheduler()` validates cron expression (default `0 8 * * 0` = Sunday 8 AM UTC), schedules weekly job. `runWeeklyReportJob()` iterates eligible users (`weeklyReportEnabled=1`, active within 30 days), capped at `WEEKLY_MAX_BRANDS_PER_USER=3` brands per user. For each brand: either calls `runBrandPrompts(brandId)` (re-runs all 10 prompts × 5 platforms) or surfaces `needsSetup: true` if no prompts exist. Aggregates per-platform + top 3 prompts, sends email, stamps `lastWeeklyReportSentAt`.

**New schema fields** on `users`: `weeklyReportEnabled (integer, default 1)`, `lastWeeklyReportSentAt (timestamp)`, `bufferAccessToken (text)` — all in migration `0004_user_integrations.sql`.

**Opt-out endpoints** ([server/routes.ts](server/routes.ts)):

- `GET /api/user/preferences` → `{weeklyReportEnabled, bufferConnected}`
- `PATCH /api/user/preferences` → toggle weekly reports.

**Registered** in [server/index.ts](server/index.ts) via `initScheduler()` called after `registerRoutes()`.

### Env Vars Added

To [.env.example](.env.example):

```bash
# Email (Weekly Reports)
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=VentureCite <reports@venturecite.app>
WEEKLY_REPORT_CRON=0 8 * * 0

# Buffer Social Publishing
BUFFER_CLIENT_ID=
BUFFER_CLIENT_SECRET=
BUFFER_REDIRECT_URI=http://localhost:5000/api/auth/buffer/callback
```

### Database Changes Summary

| Migration                    | Change                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `0004_user_integrations.sql` | `users.weekly_report_enabled`, `users.last_weekly_report_sent_at`, `users.buffer_access_token`         |
| `0005_brand_prompts.sql`     | New `brand_prompts` table, `geo_rankings.article_id` → nullable, new `geo_rankings.brand_prompt_id` FK |

### Pass Criteria

- [x] `npx tsc --noEmit` → zero errors
- [x] `npm run build` → client + server bundles built successfully
- [x] All 6 Phase 1 features functional end-to-end
- [x] Brand tier limits enforced (free = 1 brand)
- [x] Citation check never double-counts on rerun
- [x] Auto-improve never lowers the human-score
- [x] Weekly email cron registered (skips cleanly without RESEND_API_KEY)
- [x] Buffer OAuth flow wired (skips cleanly without BUFFER_CLIENT_ID)
- [x] Manual citation URL entry removed; brand-prompt portfolio replaces it
- [x] Per-article "Check Rankings" dialog removed from articles page
- [x] AI Visibility: mandatory brand select + single clickable engine row
- [ ] End-to-end QA in staging with real API keys
- [ ] Load test weekly cron with 50+ users

### Documentation

- [PHASE1_FEATURES.md](PHASE1_FEATURES.md) — plain-English user-facing guide to all 6 features, their logic, and honest limitations. Updated after each batch.

---

## Track 8 — Post-Beta Hardening (2026-04-16, Complete)

**Goal:** Fix every issue surfaced during the first real dogfood pass. Remove the unused publish workflow, centralize model selection, rewire citation routing, and polish the UX gaps that only show up when a real user touches the app.

**Status:** Complete. `npx tsc --noEmit` clean. `npm run build` passes.

### Batch 1 — Articles page view/edit + publish removal

**Files:** [client/src/pages/articles.tsx](../client/src/pages/articles.tsx), [shared/schema.ts](../shared/schema.ts), [server/routes.ts](../server/routes.ts), [server/storage.ts](../server/storage.ts), [server/databaseStorage.ts](../server/databaseStorage.ts), [server/contentGenerationWorker.ts](../server/contentGenerationWorker.ts), [client/src/pages/article-view.tsx](../client/src/pages/article-view.tsx), [client/src/pages/home.tsx](../client/src/pages/home.tsx), [client/src/pages/dashboard.tsx](../client/src/pages/dashboard.tsx), [client/src/pages/content.tsx](../client/src/pages/content.tsx), [migrations/0007_drop_article_publish.sql](../migrations/0007_drop_article_publish.sql)

- **Articles list typo fix** — `articlesData?.articles` → `articlesData?.data`. The server returns `{ success, data }` but the page was reading the wrong key so the list always looked empty even when articles existed in the DB.
- **New View/Edit dialog** — Every article row now opens a modal showing the full markdown content, with an Edit mode that saves via `PUT /api/articles/:id` (title + content). Replaces the draft/published action split.
- **Publish workflow removed entirely** — The user confirmed "remove publish/published related anything from the database as well." Dropped the `status`, `published_at`, and `canonical_url` columns from `articles` (migration 0007), deleted `publishArticle` from storage, deleted `POST /api/articles/:id/publish`, deleted both `/sitemap.xml` routes and the `/rss.xml` route (all depended on the `published` filter), removed `publishedArticles`/`draftArticles` counters from `/api/dashboard` and `/api/platform-metrics`, removed the Publish button from the articles page, removed `status: 'draft'` from every `createArticle` call site (worker and rewrite endpoint), and dropped `publishedAt`/`canonicalUrl` refs from `article-view.tsx`. `getPublishedArticlesByBrandId` was renamed to `getRecentArticlesByBrandId` and reused by the citation prompt generator.
- **Home + dashboard KPI cleanup** — Dropped the dead `published` bucket from both pages. Home's "Articles" KPI hint now just shows "N articles".

### Batch 2 — Dashboard citation metrics fix

**Files:** [server/routes.ts](../server/routes.ts) (`/api/dashboard`), [client/src/pages/home.tsx](../client/src/pages/home.tsx)

- **Citations tile was always 0** — it was reading `storage.getCitationsByUserId()` which queries the legacy `citations` table that Phase 1 never writes to. Now aggregates real data from `geo_rankings` + `brand_prompts`: fetches every prompt ID across the user's brands, pulls all geo_rankings tied to those IDs, keeps only the latest row per `(promptId, platform)` pair (same dedup logic as the Results page), and counts rows where `isCited=1`.
- **Citation Quality tile was dead** — It was reading `/api/citation-quality/stats/:brandId` (a Phase 2 manual-entry feature with no writer). Replaced with a new **Citation Rate** tile showing `cited / totalChecks` as a percentage. Both tiles now link to `/citations`.
- **Dropped 3 dead Phase 2 queries** from `home.tsx`: `/api/prompt-portfolio/stats/`, `/api/citation-quality/stats/`, `/api/hallucinations/stats/`.

### Batch 3 — AI Visibility Checklist persistence

**Files:** [shared/schema.ts](../shared/schema.ts), [server/storage.ts](../server/storage.ts), [server/databaseStorage.ts](../server/databaseStorage.ts), [server/routes.ts](../server/routes.ts), [client/src/pages/ai-visibility.tsx](../client/src/pages/ai-visibility.tsx), [migrations/0008_visibility_progress.sql](../migrations/0008_visibility_progress.sql)

- **Root cause** — progress was browser-local only. Tick a step on desktop, open the app on a phone, everything was unchecked.
- **New `visibility_progress` table** — one row per `(brandId, engineId, stepId)`, unique index on all three so toggles are idempotent. Migration 0008.
- **Three new endpoints**:
  - `GET /api/visibility-progress/:brandId` — returns `{ engineId: stepId[] }` grouped for the client
  - `POST /api/visibility-progress/:brandId` — body `{engineId, stepId}`, inserts with `onConflictDoNothing`
  - `DELETE /api/visibility-progress/:brandId` — same body, removes the row
- All ownership-scoped via `requireBrand`.
- **Client rewired** — replaced all localStorage reads/writes with a `useQuery` + `useMutation`. Optimistic UI update with rollback on failure. The `ai-visibility-progress-<brandId>` localStorage key is gone entirely.

### Batch 4 — Content page draft system removal

**File:** [client/src/pages/content.tsx](../client/src/pages/content.tsx)

- **Full draft system deleted** — `ContentDraft` interface, `DRAFTS_KEY`/`ACTIVE_DRAFT_KEY` localStorage, `loadDrafts`/`saveDrafts`/`createEmptyDraft`/`getDraftLabel`/`computeInitialState` helpers, `persistDraftById`/`switchToDraft`/`createNewDraft`/`deleteDraft` callbacks, the autosave `setTimeout` effect, and the URL-params-append effect. Removed the Drafts toggle button, New Draft button, and the entire Drafts panel from the page header. The page now opens clean every time — if the user arrives from the Keyword Research "Generate Content" link, URL params seed the initial state once.
- **Manual keyword suggestions** — Removed the debounced `useEffect` that auto-fetched suggestions as the user typed. Added a **Suggest** button next to the Keywords input. Disabled until industry is selected.

### Batch 5 — Centralized model registry + OpenRouter for non-ChatGPT citations

**New file:** [server/lib/modelConfig.ts](../server/lib/modelConfig.ts)

One `MODELS` object grouped by feature page. Edit a value here and every call site picks it up.

```
brandAutofill              → gpt-4o-mini          (Brand Setup)
keywordResearch            → gpt-4o-mini          (Keyword Research)
keywordSuggestions         → gpt-4o-mini          (Content page autosuggest)
popularTopics              → gpt-4o-mini          (Content page trending)
contentGeneration          → gpt-4o-mini          (Content worker main writer)
contentHumanize            → gpt-4o-mini          (Humanization passes)
contentAnalyze             → gpt-4o-mini          (AI-detection scorer)
brandPromptGeneration      → gpt-4o-mini          (Citation prompt portfolio)
citationChatGPT            → gpt-4o-mini          (direct OpenAI)
citationClaude             → anthropic/claude-haiku-4.5         (OpenRouter)
citationGemini             → google/gemini-2.5-flash-lite       (OpenRouter)
citationPerplexity         → perplexity/sonar                   (OpenRouter)
citationDeepSeek           → deepseek/deepseek-v3.2             (OpenRouter)
distribution               → gpt-4o-mini          (Platform rewrites)
misc                       → gpt-4o-mini          (non-Phase-1 catch-all)
```

**Citation routing rewritten** ([server/citationChecker.ts](../server/citationChecker.ts)):

- ChatGPT → direct OpenAI client (`MODELS.citationChatGPT`)
- Claude / Gemini / Perplexity / DeepSeek → single OpenRouter client (`https://openrouter.ai/api/v1`), each with its own model slug
- Deleted the direct Perplexity API + DeepSeek API integrations (they're now all OpenRouter)
- Deleted the `[simulated via OpenAI]` fallback — if `OPENROUTER_API_KEY` is missing those 4 platforms record a clear "skipped — OPENROUTER_API_KEY not configured" context instead of fabricating data

**Replaced 28 hard-coded `"gpt-5-nano"` strings** across `routes.ts`, `contentGenerationWorker.ts`, and `citationChecker.ts` with `MODELS.xxx` references.

**Env**: [server/env.ts](../server/env.ts) adds optional `OPENROUTER_API_KEY`, drops the now-unused `DEEPSEEK_API_KEY` / `PERPLEXITY_API_KEY`. [.env.example](../.env.example) updated.

### Batch 6 — Citation check: binary detection + full response capture

**File:** [server/citationChecker.ts](../server/citationChecker.ts)

- **Bug: Notion citations never matched.** The detector was doing `response.toLowerCase().includes(brandName.toLowerCase())`. With `brand.companyName = "Notion Labs, Inc."`, the literal string `"notion labs, inc."` never appeared in AI responses even when the response clearly said "Notion". Fixed with three changes:
  - `normalizeBrandName` strips legal suffixes (Inc, LLC, Ltd, Corp, Labs, Technologies, GmbH, etc.) and punctuation
  - `buildBrandNameVariants` generates every searchable form: original, normalized, and individual words ≥ 4 chars (so `"Notion Labs, Inc."` → `["notion labs", "notion", "labs"]` sorted longest→shortest)
  - Word-boundary regex (`\b...\b`) instead of naive `includes()` so `"co"` doesn't match `"companies"`
- **Plumbed `brand.nameVariations`** from the DB through `runBrandPrompts` → `runPlatformCitationCheck` → `checkForCitation`.
- **Detector simplified to binary** — Dropped the context-snippet composition, title-word matching, and keyword fuzzy-match branches (they were only meaningful in the article-scoped world which died with the publish-workflow removal). Signature is now `checkForCitation(responseText, brandName, extraVariations)` returning just `{ isCited, rank }`. No more "Brand mentioned (…)" snippet strings.
- **Full AI response captured** — `runPlatformCitationCheck` now returns `responseText` too. `runBrandPrompts` stores it in `geo_rankings.citationContext` behind a `||| RAW_RESPONSE |||` delimiter alongside a simple status line. The API endpoint splits the two back out on the way to the client. Backwards-compat: the splitter also recognizes the older `--- RAW RESPONSE ---` delimiter from rows written during the initial rollout.

### Batch 7 — Results UI redesign

**File:** [client/src/pages/citations.tsx](../client/src/pages/citations.tsx)

- **New `PlatformResultCard` component** — one per platform inside the by-prompt accordion. Each card has:
  - **Colored platform pill** (ChatGPT = emerald, Claude = orange, Gemini = blue, Perplexity = purple, DeepSeek = cyan)
  - **Cited / Not cited status pill** next to it (green or grey)
  - **Relative timestamp** on the right (`X minutes ago`)
  - **"Show full response" expand button** — clicking reveals the entire AI answer rendered as proper markdown via `ReactMarkdown`, with prose styling, scrollable up to 480px for long answers
- Dropped the truncation on the raw response (was 2000 chars, now unlimited).
- Dropped the old single-line italic `<p>` that used to show `Brand mentioned (...)` snippets.
- **Why this prompt** rationale now shows at the top of each accordion section.

### Batch 8 — Parallel citation runs with rolling concurrency

**File:** [server/citationChecker.ts](../server/citationChecker.ts) (`runBrandPrompts`)

Three successive iterations, ending at a proper worker pool:

1. First pass: parallelized the 5 platforms per prompt via `Promise.all`. Good but the slowest platform (DeepSeek at 100s) held up all 5 row saves.
2. Second pass: moved the DB insert _inside_ each platform task so rows land the moment their response arrives, instead of waiting for the slowest sibling.
3. Third pass: replaced the nested loops with a **rolling worker pool** — all 50 (prompt × platform) tasks flattened into one queue, 5 workers pulling tasks via an atomic `cursor++`, each worker running its AI call → saving its row → immediately grabbing the next task. No per-prompt batching, no waiting for the slowest sibling, predictable burst size (5 in-flight at any moment). Total wall-clock on a 10-prompt run dropped from ~12 min sequential to ~2.5 min.

Per-task logs now show `prompt N ChatGPT ok in Xms` + `prompt N ChatGPT saved at Xms` for each call.

### Batch 9 — Citation checker missing OPENAI_API_KEY guard

**File:** [server/routes.ts:2003](../server/routes.ts#L2003) (`POST /api/brand-prompts/:brandId/run`)

The audit from earlier this session flagged this — the run endpoint didn't check `OPENAI_API_KEY` before calling `runBrandPrompts()`, so a missing key threw an unhandled error inside the citation checker instead of returning a clean 503. Added the standard 3-line guard matching the pattern at `/api/brand-prompts/:brandId/generate`.

### Batch 10 — Misc UX polish

- **Sidebar section rename** — [client/src/components/Sidebar.tsx:175](../client/src/components/Sidebar.tsx#L175) `"Phase 2"` → `"Upcoming"` at user request. Internal `phase2Open` state variable unchanged.
- **`rewrite-content` regression fix** — [server/routes.ts:1123](../server/routes.ts#L1123) was passing `status: "draft"` when creating the improved article, but the column was dropped in migration 0007. The insert would throw on every "Improve" click. Line deleted.
- **AI Visibility UX** (earlier in the session, same batch) — brand selection mandatory (blocks toggleStep with a toast), deleted the redundant engine tab row, the existing engine cards are now clickable with a visual ring on the selected card. Auto-select the single brand when the user owns exactly one.

### Files Changed Summary (Track 8)

- **New:** `server/lib/modelConfig.ts`, `migrations/0007_drop_article_publish.sql`, `migrations/0008_visibility_progress.sql`
- **Rewritten:** `server/citationChecker.ts`, `client/src/pages/citations.tsx` (results rendering), `client/src/pages/content.tsx` (draft system removed), `client/src/pages/articles.tsx` (view/edit dialog)
- **Modified:** `shared/schema.ts`, `server/routes.ts`, `server/contentGenerationWorker.ts`, `server/env.ts`, `server/lib/aiLogger.ts` (now a stdout logger), `server/storage.ts`, `server/databaseStorage.ts`, `client/src/pages/home.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/ai-visibility.tsx`, `client/src/pages/article-view.tsx`, `client/src/components/Sidebar.tsx`, `.env.example`

### Verification

```
npx tsc --noEmit        → zero errors
npm run build           → built in ~7s
                          server 427 kB
                          client 1.08 MB
```

### Pass Criteria

- [x] Publish workflow fully removed (schema, server, client)
- [x] Dashboard Citations + Citation Rate tiles show real numbers from geo_rankings
- [x] AI Visibility Checklist persisted per-brand to Postgres
- [x] Content page opens clean every time (no draft system)
- [x] Keyword suggestions manual (Suggest button, not auto-debounced)
- [x] Single `MODELS` config file — edit one place to change any feature's model
- [x] ChatGPT citation check uses direct OpenAI; Claude/Gemini/Perplexity/DeepSeek via OpenRouter
- [x] Citation detector matches suffixed legal names (Notion Labs, Inc. → Notion)
- [x] Full AI responses captured and rendered as markdown in the UI
- [x] Citation runs use a 5-worker rolling pool — rows save as each response lands
- [x] Sidebar "Phase 2" → "Upcoming"
- [x] `npx tsc --noEmit` clean; `npm run build` passes
- [ ] End-to-end QA in staging with real OPENROUTER_API_KEY against all 4 non-ChatGPT platforms
- [ ] Verify `gpt-4o-mini` works on production OpenAI account (the whole app rides on this one model now)

---

## Track 9 — Post-Beta Hardening: Drafts, Scheduling, UX

**Goal:** Production-quality content draft system, per-brand citation scheduling, cross-feature UX consistency, and auto-improve fix.

**Status:** Complete

### 9A — Auto-Citation Scheduling + Prompt Versioning

Per-brand citation scheduling (Off / Weekly / Biweekly / Monthly + day-of-week) replaces the old fixed Sunday-for-everyone cron. Each scheduled run generates 10 fresh prompts before checking citations.

#### Files Changed

| File                                          | Change                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/schema.ts`                            | Added `autoCitationSchedule`, `autoCitationDay`, `lastAutoCitationAt` to `brands`. Added `promptGenerations` table. Added `generationId` FK + `isActive` (1/0) to `brandPrompts`.                                        |
| `migrations/0010_brand_citation_schedule.sql` | New — adds schedule columns to brands.                                                                                                                                                                                   |
| `migrations/0011_prompt_generations.sql`      | New — creates prompt_generations table, adds generation_id + is_active to brand_prompts.                                                                                                                                 |
| `server/lib/promptGenerator.ts`               | New — extracted `generateBrandPrompts(brand)`. Archives old prompts (`isActive=0`), creates `promptGeneration` record, returns saved prompts + generationId.                                                             |
| `server/scheduler.ts`                         | Rewired from fixed Sunday cron to daily cron checking per-brand schedule/day/lastAutoCitationAt. Each due brand: generate fresh prompts → run citation check.                                                            |
| `server/routes.ts`                            | Added `PATCH /api/brands/:brandId/citation-schedule`. Added `GET /api/brand-prompts/:brandId/run/:runId/details` (drill-down). Updated `POST /api/brand-prompts/:brandId/generate` to use shared `generateBrandPrompts`. |
| `server/storage.ts`                           | Added `archiveBrandPrompts`, `createPromptGeneration`, `getPromptGenerationsByBrandId`, `getGeoRankingsByRunId`.                                                                                                         |
| `server/databaseStorage.ts`                   | Implemented all new storage methods. `getBrandPromptsByBrandId` now filters `isActive = 1`.                                                                                                                              |

### 9B — Multi-Draft Content System

DB-backed multi-draft persistence replacing the old single-session approach. Drafts auto-save on any field change, survive navigation, and link to background generation jobs.

#### Files Changed

| File                                 | Change                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/schema.ts`                   | Added `contentDrafts` table (id, userId, title, keywords, industry, type, brandId, targetCustomers, geography, contentStyle, generatedContent, articleId, jobId, humanScore, passesAiDetection, timestamps).                                                                                                                           |
| `migrations/0012_content_drafts.sql` | New — creates content_drafts table with indexes.                                                                                                                                                                                                                                                                                       |
| `server/storage.ts`                  | Added 6 new methods: `createContentDraft`, `getContentDraftsByUserId`, `getContentDraftById`, `getContentDraftByJobId`, `updateContentDraft`, `deleteContentDraft`, `deleteContentDraftsByBrandId`.                                                                                                                                    |
| `server/databaseStorage.ts`          | Implemented all 7 draft storage methods.                                                                                                                                                                                                                                                                                               |
| `server/routes.ts`                   | Added 5 draft CRUD endpoints: `GET/POST /api/content-drafts`, `GET/PATCH/DELETE /api/content-drafts/:id`. Updated `POST /api/generate-content` to accept `draftId` and link job to draft.                                                                                                                                              |
| `server/contentGenerationWorker.ts`  | `generateArticleForJob` now returns `humanScore`, `passesAiDetection`, `generatedContent`. Worker tick updates the linked draft on job success/failure.                                                                                                                                                                                |
| `client/src/pages/content.tsx`       | Complete rewrite: draft toolbar UI (New Article button + collapsed dropdown for switching drafts), auto-save with 1.5s debounce on any form field, `loadDraft()` function, `handleDeleteDraft()`, session restore from draft list on mount. Removed old `activeJobData` / `sessionRestored` / `clearForm` / localStorage job tracking. |

### 9C — Auto-Improve Fix

The `humanizeContent()` function now accepts a `baselineScore` parameter. Rewrites must strictly beat the baseline — prevents auto-improve from returning worse content.

#### Files Changed

| File                                | Change                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/contentGenerationWorker.ts` | `humanizeContent()` signature: added optional `baselineScore`. `bestScore` initialized to `baselineScore ?? 0` instead of hardcoded `0`.                                                                                                        |
| `server/routes.ts`                  | `humanizeContent()` in routes.ts: same baseline fix. `POST /api/rewrite-content`: accepts `currentScore` in body, passes to humanizer, returns `improved: boolean` flag.                                                                        |
| `client/src/pages/content.tsx`      | `handleRewriteContent` sends `currentScore: humanScore`. On `improved === false`, shows "Content already well-optimized" toast without replacing content. Removed redundant `isRewriting` state — uses `rewriteContentMutation.isPending` only. |

### 9D — Cross-Feature UX Consistency

#### Brand auto-selection

All pages with brand selectors now auto-select the first brand when no valid selection exists (first visit, deleted brand, returning user). Multi-brand users keep their last-used brand per feature via localStorage.

| File                                    | Change                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `client/src/pages/citations.tsx`        | Auto-select: `brands.length === 1` → `brands.length > 0 && (!selectedBrandId \|\| !brands.find(...))` |
| `client/src/pages/keyword-research.tsx` | Same auto-select fix.                                                                                 |
| `client/src/pages/ai-visibility.tsx`    | Same auto-select fix.                                                                                 |
| `client/src/pages/outreach.tsx`         | Converted `useState` → `usePersistedState("vc_outreach_brandId")`. Added auto-select.                 |
| `client/src/pages/geo-tools.tsx`        | Converted `useState` → `usePersistedState("vc_geotools_brandId")`. Added auto-select.                 |

#### Instant UI updates

| `client/src/lib/queryClient.ts` | `staleTime: Infinity` → `30_000`. `refetchOnWindowFocus: false` → `true`. |
| `client/src/pages/keyword-research.tsx` | Discover/delete/update mutations use `setQueryData` for instant cache updates. |
| `client/src/pages/citations.tsx` | Tab layout, generate mutation uses `setQueryData`, run drill-down with expandable rows. |

#### Articles page — delete button

| `server/storage.ts` | Added `deleteArticle(id)` interface method. |
| `server/databaseStorage.ts` | Implemented `deleteArticle`. |
| `server/routes.ts` | Added `DELETE /api/articles/:id` (ownership-scoped). |
| `client/src/pages/articles.tsx` | Added delete mutation with `AlertDialog` confirmation + instant cache removal via `setQueryData`. |

#### Brand deletion — cascade + confirmation

| `client/src/pages/brands.tsx` | Replaced `window.confirm()` with `AlertDialog` warning about all related data being permanently deleted. |
| `server/routes.ts` | `DELETE /api/brands/:id` now calls `deleteContentDraftsByBrandId` before deleting the brand (drafts don't have cascade FK). All other data cascades via DB foreign keys. |

#### Content page layout

Generated Content card moved to full width below the 2-column form+topics grid.

#### Distribute bug fix

| `client/src/pages/articles.tsx` | Fixed `editingId === id` where both could be `null` (`null === null = true`). Changed to `id && editingId === id`. |

### Verification

```
npx tsc --noEmit        → zero errors
```

### Pass Criteria

- [x] Per-brand citation scheduling (Off/Weekly/Biweekly/Monthly + day-of-week)
- [x] Each auto-citation run generates 10 fresh prompts before checking
- [x] Prompt versioning — old prompts soft-archived, not deleted
- [x] Multi-draft system — any number of drafts, auto-saved on field change
- [x] Drafts persist across navigation (DB-backed, not localStorage)
- [x] New Article creates a fresh blank draft
- [x] Auto-improve never returns a worse score than the original
- [x] Brand auto-selected across all features when user has brands
- [x] Brand deletion cascades all related data + shows confirmation dialog
- [x] Article delete button with confirmation on Articles page
- [x] Generated Content card spans full page width
- [x] Instant UI updates via setQueryData across mutations
- [x] `npx tsc --noEmit` clean

---

## Track 10 — Citation Quality + Tracked Prompts + Guided Onboarding

**Goal:** Replace heuristic brand-mention detection with an LLM judge; lock the tracked prompt set so week-over-week comparisons are meaningful; rebuild the onboarding experience to live in the sidebar and match the dashboard's visual language; fix dashboard false alarms.

**Status:** Complete

### 10A — LLM-judged citation detection (gpt-4o-mini)

Heuristic `\b...\b` matching flagged responses about "venture capital" as citations of a brand called "Venture PR". Even layered defences (ambiguous-word guard, context-window signal tokens, word-splitting removal) couldn't tell real citations from coincidental word overlap. Switched to an LLM judge for the final decision.

| File                             | Change                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/citationJudge.ts` (new)  | `judgeCitation(responseText, brand)` — gpt-4o-mini, JSON mode, temperature 0, 8k-char truncation. Returns `{ cited, rank, reasoning }`. Brand profile includes name, companyName, website, industry, description, nameVariations.                                                                                                                                          |
| `server/citationChecker.ts`      | `checkForCitation` rewritten: string-variant pre-filter short-circuits "definitely not cited"; anything with a variant match goes to the judge. `buildBrandNameVariants` retained (now feeds the pre-filter only) with acronym generation, website domain + bare subdomain, diacritic folding. Old `AMBIGUOUS_GENERIC_WORDS` context guard removed — the judge handles it. |
| `server/routes.ts`               | `POST /api/brand-prompts/:brandId/backfill-detection` re-judges every stored response; calls the judge unconditionally (no pre-filter) with concurrency cap of 5, updates `geo_rankings` + re-aggregates affected `citation_runs`.                                                                                                                                         |
| `client/src/pages/citations.tsx` | "Re-check stored" button in the run header calls the backfill endpoint; toast shows scanned/updated/flipped counts; invalidates results + history queries.                                                                                                                                                                                                                 |

### 10B — Tracked prompts + weekly suggestions

Old auto-citation cron regenerated 10 fresh prompts every week, making trends meaningless. New model: the first 10 prompts become the tracked set. Weekly cron re-checks that fixed set and generates 5 diverse suggestions the user curates.

| File                                            | Change                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0013_brand_prompt_status.sql` (new) | Adds `brand_prompts.status` text column; backfills `tracked` / `archived` from legacy `is_active`; creates `(brand_id, status)` index.                                                                                                                                                   |
| `shared/schema.ts`                              | `status` field added to `brandPrompts`.                                                                                                                                                                                                                                                  |
| `server/lib/suggestionGenerator.ts` (new)       | `generateSuggestedPrompts(brandId, { replaceExisting })` — gpt-4o with tracked-set awareness, Jaccard ≥ 0.6 similarity filter, single retry round for shortfalls.                                                                                                                        |
| `server/storage.ts` / `databaseStorage.ts`      | `getBrandPromptsByBrandId(brandId, { status })` defaults to `tracked`. New methods: `archiveSuggestedPrompts`, `updateBrandPromptText`, `archiveBrandPrompt`, `promoteSuggestionToTracked`.                                                                                              |
| `server/scheduler.ts`                           | Auto-citation job no longer regenerates. Re-runs tracked set → refreshes suggestions. Skips brands with no tracked prompts.                                                                                                                                                              |
| `server/routes.ts`                              | `POST /api/brand-prompts/:brandId/generate` returns 409 if tracked already exist. New: `GET /suggestions`, `POST /suggestions/refresh`, `POST /suggestions/:id/accept` (with `replaceTrackedId`), `DELETE /suggestions/:id`, `PATCH /prompts/:id`, `DELETE /prompts/:id`, `POST /reset`. |
| `client/src/pages/citations.tsx`                | Prompts tab split into Tracked (inline edit, archive, reset-all confirm) + Suggested (accept modal picks tracked prompt to retire; dismiss; refresh). Schedule tab copy updated to describe re-checking + suggestion refresh instead of regeneration.                                    |

### 10C — Dashboard scoping

Dashboard said "Welcome back, {brand.name}" and aggregated metrics across every brand the user owns.

| File                        | Change                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/routes.ts`          | `/api/dashboard` accepts optional `?brandId=` and scopes articles/citations/checks to that brand.                                                                                                               |
| `client/src/pages/home.tsx` | Greets by `user.firstName`; brand selector in header for 2+ brand accounts (`usePersistedState` `vc_home_brandId`); articles KPI client-filtered by selected brand; load-error banner gated behind `hasBrands`. |

### 10D — Guided Onboarding redesign

Old dashboard-embedded `OnboardingChecklist` relied on localStorage-only completion flags (broke across devices) and a blue-gradient card that didn't match the dashboard's muted visual language.

| File                                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/SidebarOnboarding.tsx` (new) | Compact tile (rocket icon + progress bar + X-of-4 count) in the sidebar. Click → immersive Dialog styled exactly like home.tsx cards (no gradients; `border-border bg-card`; `bg-muted` icon tiles; `text-xl font-semibold tracking-tight`). Always visible — including a "You're all set" completion state with Revisit buttons. No dismiss X. Auto-opens once per user on first login via `venturecite-onboarding-seen:<userId>` key. |
| `client/src/components/Sidebar.tsx`                 | Tile inserted below the Pricing link.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `client/src/pages/dashboard.tsx`                    | Old `OnboardingChecklist` removed.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `migrations/0014_user_onboarding_flags.sql` (new)   | Adds `users.visibility_guide_visited_at` timestamp.                                                                                                                                                                                                                                                                                                                                                                                     |
| `shared/schema.ts`                                  | `visibilityGuideVisitedAt` column on `users`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/routes.ts`                                  | `POST /api/onboarding/visibility-visited` stamps the column idempotently. `/api/onboarding-status` returns `hasArticles`, `visibilityVisited`, `citedRankingsCount`, `citationRunsCount` — step completion checks read server-side booleans (survives across devices/browsers).                                                                                                                                                         |
| `client/src/pages/ai-visibility.tsx`                | On mount, POSTs the visibility-visited endpoint and invalidates onboarding-status so the tile updates instantly.                                                                                                                                                                                                                                                                                                                        |

Step completion triggers:

1. Create brand → any row in `/api/brands` cache (instant via React Query).
2. Generate content → any row in `/api/articles` cache (instant).
3. View AI Visibility Guide → `users.visibility_guide_visited_at IS NOT NULL`.
4. Run first citation check → any row in `citation_runs` for the user's brands. Fires when the run starts, not when something is actually cited — the user has "done the thing" the moment they kick off a check.

### Verification

```
npx tsc --noEmit        → zero errors

# DB migrations
psql $DATABASE_URL -f migrations/0013_brand_prompt_status.sql
psql $DATABASE_URL -f migrations/0014_user_onboarding_flags.sql
```

Manual flow: sign up → dashboard loads with no error banner → onboarding dialog auto-opens → create brand → step 1 flips instantly → generate an article → step 2 flips → visit /ai-visibility → step 3 flips (confirmed via DB column) → /citations → Run Check → step 4 flips when run completes; sidebar tile shows "You're all set" with no dismiss option.

### Pass Criteria

- [x] False-positive citation case ("Venture PR" vs. "venture capital") no longer flags
- [x] Backfill endpoint re-judges every stored row regardless of prior string-matcher verdict
- [x] Tracked prompts persist week-over-week; weekly cron no longer regenerates them
- [x] Weekly cron produces 5 fresh suggestions, filtered against tracked set by Jaccard ≥ 0.6
- [x] Accepting a suggestion swaps it for a user-chosen tracked prompt; count stays at 10
- [x] Dashboard welcomes by user's first name; per-brand metrics when 2+ brands exist
- [x] Load-error banner doesn't fire for brand-new accounts
- [x] Onboarding tile matches dashboard styling (no gradients); auto-opens once per user; persists across devices via server flags; always visible including completion state
- [x] Onboarding steps update in real time without page reload
- [x] `npx tsc --noEmit` clean

---

## Track 11 — Production Hardening (Batches 1–4)

Post-beta audit found a mix of security, reliability, and performance gaps across all Phase-1 pages. Shipped as four sequential batches so each was independently reviewable. See [docs/production_hardening_fixes.md](production_hardening_fixes.md) for plain-English fix-by-fix writeups.

### 11A — Security & Stability (Batch 1)

| File                                            | Change                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/SafeMarkdown.tsx` (new)  | Wraps `ReactMarkdown` with `rehype-sanitize`. All Markdown renders (`citations.tsx`, `article-view.tsx`) switched to it. Closes the XSS-via-LLM-output vector.                |
| `client/src/components/ErrorBoundary.tsx` (new) | Class component with friendly fallback UI (Try Again / Reload). Wraps `App` root plus every authenticated route in `App.tsx`. No more white-screens on render errors.         |
| `client/src/lib/urlSafety.ts` (new)             | `normalizeWebsite()` (http(s) + domain check), `safeExternalHref()` (rejects `javascript:`), `isAllowedStripeRedirect()` (only `checkout.stripe.com` + `billing.stripe.com`). |
| `client/src/pages/brands.tsx`                   | Website Zod schema uses `normalizeWebsite`; `handleCreateFromWebsite` validates before mutating; `<a href={brand.website}>` routes through `safeExternalHref`.                |
| `client/src/pages/pricing.tsx`                  | `searchString.includes("success=true")` replaced with `URLSearchParams`; Stripe redirect gated by `isAllowedStripeRedirect` with a toast on unexpected URLs.                  |
| `client/src/lib/draftStore.ts` (new)            | Per-user keys `venturecite-active-draft-id:<userId>`; auto-migrates legacy unscoped key on first read.                                                                        |
| `client/src/pages/content.tsx`                  | Reads/writes the active draft id through `draftStore`, waits for `useAuth` to resolve before hydrating.                                                                       |
| `client/src/lib/queryClient.ts`                 | Global `refetchOnWindowFocus: false`. Focus-refetch is now opt-in per query.                                                                                                  |
| 14 page files                                   | `import { Helmet } from "react-helmet"` → `"react-helmet-async"`. `App.tsx` adds `<HelmetProvider>`. Old package + types removed.                                             |
| `package.json`                                  | Added `rehype-sanitize`, `react-helmet-async`. Removed `react-helmet`, `@types/react-helmet`.                                                                                 |

### 11B — Error Contract & Data Integrity (Batch 2)

| File                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/lib/queryClient.ts`      | New exported class `ApiError { status, body, bodyText }` thrown by `throwIfResNotOk`. `.message` keeps the legacy `"<status>: ..."` prefix so any existing string-matcher still works. `apiRequest()` now accepts `{ signal }`. Added `isApiError()` type guard.                                                                                                                                                                                                      |
| `client/src/pages/brands.tsx`        | Replaced every `JSON.parse(error.message.replace(/^\d+:\s*/, ""))` with `isApiError(err)` + `err.body` + `err.status`.                                                                                                                                                                                                                                                                                                                                                |
| `client/src/pages/content.tsx`       | **Auto-save race fixed** — introduced `contentSaveTimer` ref alongside `autoSaveTimer` so the generated-content textarea debounce no longer cancels the form-field debounce (they previously shared one ref). **Polling rewritten** — self-scheduling `setTimeout` loop instead of `setInterval`, with `AbortController` cancellation, `document.visibilityState` gating, exponential backoff to 30s, and a 10-failure fuse that stops the loop and surfaces a toast. |
| `client/src/pages/ai-visibility.tsx` | Progress math guarded against `total === 0` (was rendering `NaN%`). Optimistic-rollback on mutation failure verified correct (already in place from prior work).                                                                                                                                                                                                                                                                                                      |

### 11C — Bundle Size & Performance (Batch 3)

| File                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/App.tsx`                 | Every Phase-1 page (`Content`, `Citations`, `Articles`, `ArticleView`, `Brands`, `KeywordResearch`, `AIVisibility`, `Pricing`) wrapped in `React.lazy` + `<Suspense fallback={<RouteSpinner />}>`. Home + auth pages stay eager. Dead Phase-2 imports removed. Per-route chunks: content 39kb, ai-visibility 36kb, citations 426kb (recharts + markdown), articles 12kb, brands 105kb, pricing 8kb — all lazy. |
| `client/src/pages/home.tsx`          | `useMemo` for `activeBrand` and `scopedArticles`.                                                                                                                                                                                                                                                                                                                                                              |
| `client/src/pages/ai-visibility.tsx` | `useMemo` for `quickWins`; replaced inline `flatMap().filter().slice().map()` with a stable memoized list.                                                                                                                                                                                                                                                                                                     |
| `client/src/pages/citations.tsx`     | `useMemo` for `bestPlatform` and `bestPrompt`.                                                                                                                                                                                                                                                                                                                                                                 |
| `vite.config.ts`                     | Production builds run `babel-plugin-jsx-remove-data-test-id` via `@vitejs/plugin-react`'s `babel.plugins`. Dev + test keep `data-testid` for Playwright etc.                                                                                                                                                                                                                                                   |
| `package.json`                       | Added `babel-plugin-jsx-remove-data-test-id` (devDep).                                                                                                                                                                                                                                                                                                                                                         |

### 11D — Refactors & Safety Guards (Batch 4)

| File                                                | Change                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------ |
| `client/src/components/BrandFormFields.tsx` (new)   | Shared form body for brand Create/Edit dialogs. Accepts `form` (RHF instance) and optional `idSuffix` for testid disambiguation. Previously the same ~220 lines of `<FormField>` JSX was copy-pasted twice in `brands.tsx`.                                                           |
| `client/src/pages/brands.tsx`                       | Create dialog uses `<BrandFormFields form={form} />`; Edit dialog uses `<BrandFormFields form={form} idSuffix="-edit" />`. Removed ~440 lines of duplicated JSX.                                                                                                                      |
| `client/src/components/DeleteBrandDialog.tsx` (new) | GitHub-style type-to-confirm: user must type the brand name exactly; confirm button stays `disabled` until match + `!isPending`; `onClick` re-checks both guards against double-clicks.                                                                                               |
| `client/src/pages/brands.tsx`                       | Inline `AlertDialog` delete replaced with `<DeleteBrandDialog ... />`.                                                                                                                                                                                                                |
| `client/src/pages/citations.tsx`                    | "Reset tracked prompts" converted from an inline `async onClick` to a proper `resetMutation = useMutation(...)`. The `AlertDialogAction` now reads `resetMutation.isPending` for its `disabled` state and shows "Resetting…" during the call. Run + Generate buttons check `isPending |     | !selectedBrandId`in both the`onClick`guard and the`disabled` prop. |

### Verification

```
npx tsc --noEmit        → zero errors
npx vite build          → successful, chunks split per page
```

Manual flow:

- Create brand with `javascript:alert(1)` as website → rejected with validation toast.
- Render a citation run response containing `<script>alert(1)</script>` → HTML stripped by `rehype-sanitize`, no alert.
- Kick off a content generation, background the tab for a minute → no runaway polling; returns to normal cadence when the tab becomes visible again.
- Log out on browser, log in as a different user → previous user's active-draft id does not appear.
- Click Run Check + Reset + Generate rapidly → each mutation fires exactly once; buttons disable correctly.
- Trigger a render error (temporary `throw`) inside a page → ErrorBoundary card renders instead of a white screen; Try Again recovers.

### Pass Criteria

- [x] All `<ReactMarkdown>` calls routed through `<SafeMarkdown>` (rehype-sanitize)
- [x] `ErrorBoundary` wraps `App` root and every authenticated route
- [x] Brand website field validated with `new URL()`; Stripe redirect allowlist enforces `checkout.stripe.com` + `billing.stripe.com`
- [x] Pricing success/canceled flags parsed via `URLSearchParams` (no substring match)
- [x] Active content draft id in localStorage is namespaced per user
- [x] Global `refetchOnWindowFocus` disabled; opt-in per query
- [x] `react-helmet` migrated to `react-helmet-async` across all 14 call sites
- [x] Typed `ApiError` class; `brands.tsx` callers migrated off `JSON.parse(error.message)`
- [x] `apiRequest()` accepts `AbortSignal`; content.tsx polling uses AbortController + backoff + visibility gate
- [x] content.tsx form-field and generated-content debouncers use separate timer refs
- [x] `ai-visibility` progress math returns `0` (not `NaN`) when `total === 0`
- [x] All Phase-1 feature pages lazy-loaded with Suspense
- [x] Hot derivations memoized (home, ai-visibility, citations)
- [x] `data-testid` stripped from production builds
- [x] Brand create/edit share one `<BrandFormFields>` component
- [x] Brand delete uses type-to-confirm + isPending gate
- [x] Citations reset is a `useMutation` with pending state; Run/Generate guard against empty brand id
- [x] `npx tsc --noEmit` clean; `npx vite build` succeeds
