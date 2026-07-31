# End-to-end suite

This suite is the pass/fail gate for the TanStack Start migration. It was
written against the pre-migration app so that it encodes **current**
behaviour - including a handful of pre-existing bugs, which are pinned
deliberately (see "Rules during the migration" below).

> **Note:** `.md` files are gitignored in this repo (`.gitignore:25` is
> `*.md`), which is why most docs written during this phase - e.g.
> `docs/superpowers/plans/phase0-baseline.md` - are untracked and won't show
> up from a plain `git status` without `-uall`/`--ignored`. This particular
> file is an exception: `.gitignore:26` is `!README.md`, which un-ignores
> any file literally named `README.md` at any depth, including this one. So
> `tests/e2e/README.md` **is** trackable/stageable like any normal file -
> don't assume it's silently excluded the way the baseline doc is.

## Running

```bash
npm run test:e2e            # headless, the gate itself
npm run test:e2e:ui         # Playwright's interactive UI mode
npm run test:e2e:headed     # headed browser, useful for local debugging
npm run test:e2e:report     # open the last HTML report
```

Playwright starts the dev server automatically (`npm run dev`, port 5000) and
reuses one if it is already running. To test a deployed environment instead:

```bash
E2E_BASE_URL=https://your-host npm run test:e2e
```

## Requirements

- `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` in `.env` (see `.env.example`).
  Must be a throwaway account - the suite creates and reads records under it.
  Never hardcode credentials in spec files.
- Stripe in **test mode** (`STRIPE_SECRET_KEY` starting with `sk_test_...`).
  There is no automated runtime check for this inside `billing.spec.ts` -
  verify the prefix yourself before running the suite against a new
  environment. `billing.spec.ts` never navigates to a real Stripe checkout
  URL or submits payment details, so it cannot itself trigger a live charge,
  but a live key would still mean pointing the suite at real Stripe data.
- Must run against a **dev** build. `data-testid` attributes are stripped
  when `NODE_ENV=production` (`vite.config.ts:29-33`), so the suite only
  works against `npm run dev` - never against a production build.

## Shared auth - why, and how it works

The app authenticates via a **Supabase JWT sent as an `Authorization: Bearer`
header**, not cookies. There is no cookie-based session to reason about; any
test that needs to call the API directly must forward that bearer token, not
cookies.

`POST /api/auth/login` is rate-limited to **10 attempts per (IP, email) per
15 minutes** (`server/auth.ts`) and returns HTTP 429 beyond that. Logging in
once per spec file (or worse, once per test) burns through that budget
almost immediately and turns real defects into unrelated 429 flakes.

So login happens **once per run, in one place**: `tests/e2e/auth.setup.ts` is
a Playwright "setup project" (see `playwright.config.ts`) that runs before
every spec, logs in, and persists the resulting storage state (cookies +
localStorage, including the Supabase session) to
**`playwright/.auth/state.json`**. Every other spec's browser context is
configured with `storageState: STORAGE_STATE`
(`tests/e2e/support/auth.ts`), so it starts the test already logged in -
zero additional logins.

`playwright/.auth/` is gitignored (it holds a real session token - never
commit it, never print its contents).

**Repeat runs perform 2 real logins, not zero.** `auth.setup.ts` first tries
to reuse a still-valid `playwright/.auth/state.json` from a previous run: it
loads the file into a fresh context, visits a gated route, and checks whether
that lands on an authenticated page. Only if that check fails (file missing,
session expired/revoked, bounced to `/login`) does it fall back to a real
login and overwrite the file. That part genuinely costs zero logins on any
run after the first.

But `auth-login.spec.ts` is a second, separate source of real logins: it
tests the login flow itself, so two of its five tests ("valid credentials
log the user in" and "invalid password shows an error") must perform a real
`POST /api/auth/login` every run, regardless of `auth.setup.ts`'s cache. Its
other three tests ("an authenticated route bounces an anonymous visitor",
"session survives a page reload", "logging out ends the session") do not log
in - the reload and logout tests use the shared authenticated `storageState`
instead of calling `login()` again (see "Specs that opt out of shared auth"
below).

So the realistic per-run total is **2 real login POSTs** (0 from
`auth.setup.ts` once the cache is warm, 2 from `auth-login.spec.ts`), against
the 10-per-(IP,email)-per-15-minutes budget - enough headroom for five full
runs inside one window, not the two you'd get if every spec logged in fresh.

If you exceed the budget anyway (e.g. several runs back-to-back, or manual
login attempts against the same test account), the failure does **not**
surface as a visible HTTP 429. `server/auth.ts`'s `loginRateLimit` returns
429 with `{ success: false, error: "Too many attempts..." }`, but from the
test's point of view that just means the login form never redirects: `login()`
(`tests/e2e/support/auth.ts`) calls `page.waitForURL(...)` after submitting
the form, and a rate-limited response never navigates anywhere, so that call
times out. **The symptom is a `TimeoutError: page.waitForURL` thrown from
`tests/e2e/support/auth.ts`, not an obvious 429** - easy to misdiagnose as an
auth regression instead of a rate limit. If you see that specific timeout,
check for "Too many attempts" text on the page (or wait 15 minutes) before
assuming the login flow broke.

Set `E2E_FORCE_LOGIN=1` to skip the reuse check and force a fresh login
(e.g. when intentionally testing against a new/rotated account):

```bash
E2E_FORCE_LOGIN=1 npm run test:e2e
```

### Specs that opt out of shared auth

Three specs need a **logged-out** browser context somewhere in the file and
explicitly override `storageState: { cookies: [], origins: [] }` (an empty
state) via `test.use(...)`, instead of inheriting the shared authenticated
state:

- `auth-login.spec.ts` - tests the login flow itself, but only _part_ of the
  file needs to start logged out. It has two `describe` blocks:
  - `"logged out"` opts out via `test.use(...)` and covers the three tests
    that must start from a genuinely unauthenticated context: "valid
    credentials log the user in" and "invalid password shows an error" (both
    call `login()`, i.e. a real login POST) plus "an authenticated route
    bounces an anonymous visitor" (no login at all).
  - `"logged in (shared session)"` has no `test.use(...)`, so it inherits the
    shared `storageState` like every other spec. It covers "session survives
    a page reload" and "logging out ends the session" - both need an
    _already-authenticated_ context, not a fresh login, to test what they're
    actually testing (reload persistence; that logout truly ends the
    session). Neither calls `login()`.
  - Net effect: 2 real logins per run for this file, not 4.
- `public-pages.spec.ts` - the marketing/landing pages render differently
  logged in vs. logged out; opts out for the whole file.
- `billing.spec.ts` - mostly runs authenticated, but its "pricing page
  (unauthenticated)" describe block opts out locally with its own
  `test.use(...)` to prove `/pricing` 404s the same way logged out.

## Rules during the migration

1. These tests must be green **before** any migration work starts.
2. They must be green **at the end of every migration phase**.
3. If a test fails during the migration, **fix the application, not the
   test**. The only legitimate reason to change a test is a behaviour change
   the user has explicitly approved.

Note that a few tests deliberately pin _existing bugs_ (e.g. a 500 on an
unrecognized Stripe `priceId`) rather than the "correct" behaviour - see
"Pinned bugs and known defects" below for the full list. That is
intentional: the gate exists to catch behaviour changes introduced by the
migration, not to grade the current app. Do not "fix" a test to match what
the app _should_ do instead of what it _does_ do without explicit sign-off.

## Pinned bugs and known defects

> The original, more detailed writeup of this inventory lived at
> `docs/superpowers/plans/phase0-baseline.md`. Per `.gitignore:25`
> (`*.md`), that file **cannot be committed** - only `README.md` files are
> exempted (`.gitignore:26`, `!README.md`). So the essential inventory is
> inlined here instead; treat this table, not that file, as the durable
> source of truth once this branch is committed.

### Deliberately pinned bugs

These are asserted in the suite as real, current behaviour - not the
"correct" behaviour - so the gate catches the migration silently changing
them. Fixing the underlying bug is legitimate; the fix must come with an
explicit, approved update to the corresponding test.

| Bug                                                                                                                                                                                                                                                   | Where pinned                             | Root cause                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/stripe/checkout` returns an unhandled 500 (not a clean 400) for a well-formed but unrecognized `priceId`, and the 500 body leaks the raw DB driver error (SQL text + the caller-supplied `priceId`) with no production redaction (CWE-209) | `billing.spec.ts`                        | The `stripe` Postgres schema that `server/routes/billing.ts`'s price-existence check queries does not exist in this database (Supabase's "Stripe sync" integration was never enabled here), so the lookup throws before any Stripe call. `server/routes/billing.ts` (~line 187) puts `error.message` straight into the JSON response, unlike `server/routes.ts`'s `sendError`, which redacts in production. |
| `/pricing` 404s for both authenticated and unauthenticated users                                                                                                                                                                                      | `billing.spec.ts` (both describe blocks) | `client/src/pages/pricing.tsx` is a fully built page (products grid, checkout mutation, Stripe success/canceled banners) but `client/src/App.tsx`'s router never mounts a `/pricing` route for it - dead code, falls through to the generic 404. Corroborated by the landing page's own nav/footer data files, which record the pricing section was deliberately removed.                                   |

### Skipped tests

| Test                                                                                | Why skipped                                                                                                                                                                                                                                                                                               | Expected to change?                                                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `tours.spec.ts:140:3` - "brand switch mid-tour cancels"                             | Structurally untestable: the tour engine's `useModalOverlay` blocks every click outside the active tour step's target, and the brand selector is never that target mid-tour. Verified empirically (a real click retried 60s against the overlay, no success). No fixture or UI path makes this reachable. | No - permanent, documented skip.                                                                         |
| `url-state.spec.ts:147:3` - "`?edit=<id>` for a real article opens its edit dialog" | Fixture gap, not a code/test bug: the shared `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` account has zero articles with `status="ready"`, the only state this happy path needs. The sibling "nonexistent id" test does run and pass.                                                                             | Yes - seed one `status="ready"` article into the test account to unskip. Outstanding as of this writing. |

### Other known app defects (not pinned as bugs, but found by this suite)

One line each - see the spec file listed for the exact assertion.

- **Duplicate `<meta name="description">` on every Helmet-rendered page** - the static fallback in `index.html` is never removed; React Helmet appends a second one instead of replacing it. (`public-pages.spec.ts`)
- **Contradictory `robots` meta on auth-flow pages** - `index.html` ships a static `index, follow`; Helmet appends a second `noindex` on `/register`, `/login`, `/forgot-password`, `/verify-email` instead of replacing it. Not currently exploitable (browsers apply the most-restrictive directive) but not actually enforced by the markup either. (`auth-signup.spec.ts`)
- **Legacy redirect `/ai-intelligence` targets a dead tab** - `client/src/App.tsx:196-211` sends it to `/monitor?tab=share-of-answer`, but `share-of-answer` isn't in the current tab set (`overview`, `citations`, `competitors`, `trends`, `mentions`); `SpineShell` silently falls back to `overview`. (`legacy-redirects.spec.ts`)
- **`?edit=<nonexistent-id>` is never cleared from the URL** - the edit dialog correctly doesn't open, but unlike the "real id" path the query param is never stripped afterward. (`url-state.spec.ts`)
- **`CardTitle` renders a `<div>`, not a heading element** - every card title (including in the settings UI) sits outside the page's heading hierarchy; screen-reader users navigating by heading cannot reach it. (`settings-theme.spec.ts`)
- **`setupStripeProducts()` fails at server boot** - `server/index.ts:35-40` calls it at startup; the configured `STRIPE_SECRET_KEY` is syntactically valid but Stripe rejects it (401 "Invalid API Key"), so product sync never completes and `GET /api/stripe/products` returns empty. Environment/secrets issue, not an app bug. (`billing.spec.ts`)

## Selectors

All selectors live in `tests/e2e/support/selectors.ts`. Fix them there,
never inline in a spec file.

## Layout

```
tests/e2e/
  auth.setup.ts          # the shared-login "setup" project, see above
  support/
    auth.ts               # login()/logout()/expectAuthenticated(), STORAGE_STATE
    bearer-token.ts        # getBearerToken() - shared by billing.spec.ts, welcome-brand.spec.ts
    selectors.ts           # SEL.* - every selector used by the suite
  auth-login.spec.ts
  auth-signup.spec.ts
  billing.spec.ts
  legacy-redirects.spec.ts
  public-pages.spec.ts
  settings-theme.spec.ts
  spine-navigation.spec.ts
  tours.spec.ts
  url-state.spec.ts
  welcome-brand.spec.ts
```
