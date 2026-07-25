# Phase 0 baseline — TanStack Start migration e2e gate

**Date:** 2026-07-25
**Branch:** `claude/vite-ssr-vs-ssg-c7d345`
**Commit:** none — nothing in Phase 0 was committed. Every file this phase
touched (`playwright.config.ts`, `tests/e2e/**`, `package.json`,
`package-lock.json`, `.env.example`, `.gitignore`, this document, and
`tests/e2e/README.md`) is uncommitted in the working tree. There is
deliberately no commit SHA to record here; the working tree itself is the
artifact. (`docs/superpowers/plans/2026-07-25-phase0-e2e-safety-net.md` is
the plan this baseline closes out.)

This document is the reference every later migration phase compares against:
the suite must be green before the migration starts (confirmed below) and
green again at the end of every phase. If a test goes red mid-migration, fix
the app, not the test — see `tests/e2e/README.md` for the full rule and the
rationale.

## Result

```
Running 63 tests using 1 worker
...
2 skipped
61 passed (2.9m)
EXIT=0
```

**61 passed, 2 skipped, 0 failed, exit 0, 2.9 minutes.** No crash, no HTTP
429s (rate-limit errors). This was a controller-run, captured verbatim in
`full-suite-run.txt` alongside this plan's supporting material; the numbers
above are transcribed directly from that capture, not re-run.

The setup project reuses a still-valid cached login
(`playwright/.auth/state.json`), so it performs **0** logins on a warm cache
and 1 on a cold one. `auth-login.spec.ts` — the spec that tests logging in —
performs **2** real logins per run. **Total: 2 real logins per run (3 cold).**

The login endpoint rate-limits at **10 attempts per (IP, email) per 15
minutes** (`server/auth.ts:244-251`), so roughly five full-suite runs fit in a
window. Exceeding it does **not** surface as a visible 429 — it appears as
`TimeoutError: page.waitForURL` at `tests/e2e/support/auth.ts`, which looks
like an auth regression. This was hit and diagnosed during Phase 0; see
`tests/e2e/README.md`.

## Per-spec breakdown

| Spec file                       | Tests  | Passed | Skipped |
| ------------------------------- | ------ | ------ | ------- |
| `auth.setup.ts` (setup project) | 1      | 1      | 0       |
| `auth-login.spec.ts`            | 5      | 5      | 0       |
| `auth-signup.spec.ts`           | 5      | 5      | 0       |
| `billing.spec.ts`               | 5      | 5      | 0       |
| `legacy-redirects.spec.ts`      | 13     | 13     | 0       |
| `public-pages.spec.ts`          | 5      | 5      | 0       |
| `settings-theme.spec.ts`        | 6      | 6      | 0       |
| `spine-navigation.spec.ts`      | 10     | 10     | 0       |
| `tours.spec.ts`                 | 5      | 3      | 2       |
| `url-state.spec.ts`             | 5      | 5      | 0       |
| `welcome-brand.spec.ts`         | 3      | 3      | 0       |
| **Total**                       | **63** | **61** | **2**   |

## Skipped tests

Two tests are skipped, both understood and both legitimate — but for
different reasons, and only one of them should stay skipped forever.

1. **`tours.spec.ts:140:3` — "Tour engine e2e › brand switch mid-tour
   cancels"** — structurally untestable, not just currently broken. The tour
   engine's `useModalOverlay` blocks every click outside the active tour
   step's own target element, and the brand selector is never that target
   mid-tour, so a real user click on the brand switcher cannot land while a
   tour is open. This was verified empirically by letting a real click retry
   against the overlay for 60 seconds with no success. There is no fixture or
   code path that makes this scenario reachable through the UI as currently
   built. **No action expected** — this is a permanent, documented skip.

2. **`tours.spec.ts:52:3` — "global welcome tour fires for new user and
   persists"** — unconditionally skipped so the suite's pass/skip count stays
   **stable across runs**. Two reasons, both verified:
   - The test is **one-shot**. Clicking the tour to "Done" PATCHes completion
     to the server for the shared account, and
     `client/src/tours/engine/eligibility.ts:46-47` then returns false
     permanently. There is no reset operation —
     `server/routes/tours.ts`'s `PatchOpSchema` whitelist has no global-clear
     op — so after its first-ever run the test could never pass again. An
     earlier baseline recorded 61/2 while this test still ran; the following
     run would have silently become 60/3.
   - Independently, `client/src/tours/engine/shepherdAdapter.ts` has a race:
     when a step fails to build, Shepherd's own `next()` cascades to
     `complete()` without invoking the adapter's `onComplete` handler, making
     the click-through non-deterministic even on a fresh account.

   **Action:** add a tour-state reset operation (useful for testing, support,
   and re-onboarding users) and fix the adapter race, then re-enable.

**Note on an earlier fixture gap, now closed.** A previous version of this
baseline listed `url-state.spec.ts:147` as skipped because the test account
had no `status="ready"` article. That gap was worse than it looked: with no
article cards rendering at all, the _sibling_ negative test also passed
vacuously, leaving the entire `?edit=` contract unguarded. Both tests now
create and delete a real article through the app's own
`POST /api/articles` in `beforeAll`/`afterAll`, so `url-state.spec.ts` runs
5/5 with zero skips.

## Pre-existing application defects the suite uncovered

Application source was explicitly out of scope for Phase 0 (only `tests/`,
`package.json`, and `docs/` could change), so **none of the following were
fixed**. Each is now pinned by an assertion in the suite so a later
migration phase cannot silently change the behavior without the gate
noticing — per the rule that behavior changes must be reviewed, not
absorbed silently. Two are security-relevant (marked below); the rest are
correctness, SEO, or accessibility findings.

1. **Duplicate meta descriptions on every Helmet-rendered page.** The static
   fallback `<meta name="description">` in `index.html` is never removed;
   React Helmet appends a second, real one alongside it instead of
   replacing it, so both coexist in the DOM on every page. Found while
   writing `public-pages.spec.ts` (Task 3); the test targets
   `meta[name="description"][data-rh="true"]` specifically to avoid
   asserting on the stale static one.

2. **Contradictory `robots` meta directives on auth-flow pages.**
   `index.html` ships a static `<meta name="robots" content="index, follow">`
   on every route. React Helmet appends a second `noindex` meta on
   `/register`, `/login`, `/forgot-password`, and `/verify-email` instead of
   replacing the static one, so both directives coexist in the DOM. Search
   engines apply the most-restrictive directive, so this isn't currently
   exploitable, but it means the "these pages must not be indexed" intent is
   only accidentally honored, not actually enforced by the markup. Found
   while writing `auth-signup.spec.ts` (Task 5).

3. **Legacy redirect `/ai-intelligence` points at a tab that no longer
   exists.** `client/src/App.tsx:196-211`'s redirect table sends
   `/ai-intelligence` to `/monitor?tab=share-of-answer`, but the current
   monitor tab set is `overview`, `citations`, `competitors`, `trends`,
   `mentions` — `share-of-answer` isn't one of them. `SpineShell` silently
   falls back to the `overview` tab instead of erroring. Found while writing
   `legacy-redirects.spec.ts` (Task 7); the test asserts the real fallback
   (`overview`), not the table's stated target.

4. **`?edit=<nonexistent-id>` is never cleared from the URL.** When the query
   param references an article id that doesn't exist, the edit dialog
   correctly never opens — but unlike the "real id" path, the query param is
   never stripped from the URL afterward; it sits there indefinitely. Found
   while writing `url-state.spec.ts` (Task 8).

5. **`CardTitle` renders a `<div>`, not a heading element.** Every card
   title in the settings UI (and elsewhere `CardTitle` is used) sits outside
   the page's heading hierarchy — screen-reader users navigating by heading
   cannot jump to card titles. Accessibility finding from
   `settings-theme.spec.ts` (Task 9).

6. **`setupStripeProducts()` fails at server boot.**
   `server/index.ts:35-40` calls this at startup; in this environment the
   configured `STRIPE_SECRET_KEY` is a syntactically valid `sk_test_...` key
   that Stripe itself rejects with a 401 ("Invalid API Key"), so product sync
   never completes and `GET /api/stripe/products` returns empty. Found while
   writing `billing.spec.ts` (Task 10). This is an environment/secrets
   problem (the key needs replacing), not something fixable in application
   code.

7. **[Security-relevant] `POST /api/stripe/checkout` returns an unhandled
   500 for any well-formed, unrecognized `priceId`, instead of a clean 400.**
   The `stripe` Postgres schema that `server/routes/billing.ts`'s
   price-existence check queries does not exist in this database at all (the
   Supabase "Stripe sync" integration appears to have never been enabled
   here), so the lookup throws before any Stripe API call happens. This is
   pinned in `billing.spec.ts` as "POST /api/stripe/checkout 500s on a
   well-formed but unrecognized priceId (pre-existing bug, pinned for
   migration parity)" — deliberately encoding the bug, not endorsing it. Once
   the `stripe` schema exists, the route will start returning 400 instead of
   500, and this test will fail loudly, forcing an update — the intended
   failure mode.

8. **[Security-relevant] That same 500 response leaks the raw database
   driver error — including literal SQL text and the caller-supplied
   `priceId` reflected back — straight into the client-facing JSON body.**
   `server/routes/billing.ts`, around line 187, puts `error.message` directly
   into the response with no `NODE_ENV` production redaction, unlike
   `server/routes.ts`'s `sendError` helper, which does redact in production.
   This is an information-disclosure bug (CWE-209): any authenticated caller
   can trigger it with an arbitrary `priceId` and get schema/SQL detail back.
   Found and flagged by the reviewer during Task 10's review pass, logged in
   the `billing.spec.ts` file as item 14 of its findings.

9. **`/pricing` is dead code — fully built but never routed.**
   `client/src/pages/pricing.tsx` is a complete page (products grid,
   checkout mutation, Stripe success/canceled banners, ~330 lines) but
   `client/src/App.tsx`'s router never mounts a `/pricing` route for it, so
   the path falls through to the generic 404 page regardless of
   authentication state. Corroborated independently by the landing page's
   own nav/footer data files, which record that the pricing section was
   deliberately removed. Found while writing `billing.spec.ts` (Task 10);
   pinned as real behavior in both an authenticated and an unauthenticated
   describe block.

## Non-defect findings worth knowing about (not pinned as bugs)

These came out of the same work but are documented behavior/contract, not
things anyone flagged as wrong:

- `localStorage["vc_selected_brand_id"]` is stored JSON-stringified (a
  quoted string), not as a bare id, because it's written through
  `usePersistedState`'s `JSON.stringify` (`client/src/hooks/use-persisted-state.ts:26-27`).
  A naive strict-equality read against the URL's unquoted id would silently
  fail. `url-state.spec.ts` reads it with `JSON.parse` to match.
- The app authenticates via a Supabase JWT sent as an `Authorization: Bearer`
  header, not cookies — confirmed by `playwright/.auth/state.json` having
  zero cookies. Any test (or future migration code) that assumes a cookie
  session is wrong.

## Prior housekeeping notes carried into this baseline (not defects, for

completeness)

- `@playwright/test` was entirely undeclared in `package.json` at the start
  of Phase 0 and `node_modules` was empty; installing it was a Task 1
  prerequisite (test-only dependency; application dependencies remained out
  of scope throughout).
- `npm audit` reports 39 pre-existing vulnerabilities (2 critical) unrelated
  to this suite; noted in Task 1, expected to be substantially addressed in
  a later phase.
