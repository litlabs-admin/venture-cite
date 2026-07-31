# Phase 1 baseline - dependency upgrades complete

**Date:** 2026-07-27
**Branch:** `pre-migration-baseline`
**Commit:** none - every change this phase made (`package.json`, `package-lock.json`,
application source, and test files) is uncommitted in this worktree. Nothing was
committed at any point during Phase 1. There is deliberately no commit SHA to
record; the working tree itself is the artifact, exactly as in the Phase 0
baseline this document follows
(`docs/superpowers/plans/phase0-baseline.md`, plan:
`docs/superpowers/plans/2026-07-25-phase1-dependency-upgrades.md`).

This document is the reference Phase 2 (the TanStack Start migration) starts
from and compares against.

---

## 1. Result

Final verified gate, run un-chained (never `npm test` immediately followed by
`npm run test:e2e` - both hit the same database and chaining produces spurious
failures that look like regressions; see §6):

- `npm run check` - **clean**.
- `npm run lint` - **0 errors**, ~830 warnings (warnings are graded
  non-blocking by the eslint config; the number moved by ±1 a few times
  across tasks with no swing in errors).
- `npm test` - **904 passed / 1 failed / 3 skipped**.
- `npm run test:e2e` - **64 passed / 2 skipped / 0 failed**.

The single unit failure is `tests/unit/v2UrlTierScoring.test.ts`, and it is
**deliberately red**: it correctly exposes a real, unfixed application bug
(`server/lib/factAgent/v2/urlTierScoring.ts`'s `LOCALE_PREFIX` regex treats
any 2–3 letter path segment as an ISO locale, so `/api`, `/faq`, `/ceo` all
strip to `/` and score Tier 1 instead of their intended tier). Left unfixed
on purpose - changing it changes scoring output, which is the user's call,
not an upgrade side effect. The assertion was re-verified unchanged at the
end of the phase (line 51 still expects `/api` → 0, still red).

The 2 skipped e2e tests are the same two carried over from the Phase 0
baseline (structurally untestable tour-cancel test, and the one-shot global
welcome tour skipped to keep the pass/skip count stable across runs) - see
`phase0-baseline.md` for the full reasoning; nothing in Phase 1 changed
their status.

Nothing was committed. Branch `pre-migration-baseline`.

---

## 2. What moved

`npm outdated` went from **59 packages to 6** over the course of the phase
(the plan's original audit only covered 17 "interesting" packages from the
design spec's §7 table; a mid-phase gap review found the other 42 had never
been audited - see §6). Grouped by task, with every version actually landed:

**Task 1 - low-risk batch**

- `drizzle-kit` → 0.31.10
- `framer-motion` → 12.42.2
- `shepherd.js` → 15.2.2
- `date-fns` → 4.4.0
- `@sentry/vite-plugin` → 5.4.0

**Task 1b**

- `lucide-react` 0.x → **1.27.0** (final package.json range; installed at 1.26.0, later carried forward by Task 9b's sweep)

**Task 2 - React 19**

- `react` → 19.2.8
- `react-dom` → 19.2.8
- `@types/react` → 19.2.17
- `@types/react-dom` → 19.2.3

**Task 3**

- `recharts` → 3.10.0 (package.json now allows 3.10.1 via `^3.10.1` after later drift within range)

**Task 4 - Sentry 10**

- `@sentry/node` → 10.68.0
- `@sentry/react` → 10.68.0
- (`@sentry/vite-plugin` intentionally left at 5.4.0 - no v6 exists)

**Task 5 - Vite 8 + vitest 4 (pulled forward from planned Task 11 - see §6)**

- `vite` → 8.1.5
- `vitest` → 4.1.10
- `@vitest/coverage-v8` → 4.1.10
- `esbuild` 0.25.0 → 0.28.1 (unplanned, required: Vite 8's optional peer needs `^0.27 || ^0.28`)

**Task 6 - Express 5**

- `express` → 5.2.1
- `@types/express` → 5.0.6
- `@types/express-serve-static-core` → pinned exact `5.1.0` (see §3 - deliberately not moved further)

**Task 7 - Zod 4 (coupled with drizzle-zod)**

- `zod` → 4.4.3
- `drizzle-zod` → 0.8.3

**Task 8 - Tailwind 4 (coupled with tailwind-merge)**

- `tailwindcss` → 4.3.3
- `tailwind-merge` → 3.6.0
- `@tailwindcss/typography` → 0.5.20
- `@tailwindcss/vite` → 4.3.3 (was already a dependency but had never been wired into `vite.config.ts` - inert until this task)

**Tasks 9 + 11 (combined in execution)**

- `stripe` → 22.3.2 (`STRIPE_API_VERSION` pin `2026-02-25.clover` verified intact)
- `typescript-eslint` → 8.65.0
- `eslint-config-prettier` → 10.1.8
- `eslint-plugin-react-refresh` → 0.5.3
- `eslint` confirmed still single deduped 9.39.4 (not upgraded - see §3)

**Task 9b - bulk minor/patch sweep**

- 44 same-major packages upgraded in one pass (Radix primitives, `@supabase/supabase-js`,
  `@tanstack/react-query`, `@playwright/test`, `lucide-react` to its final 1.27.0 range, etc.)
- `npm outdated` count: 59 → 16 after this task.
- `react-icons` → 5.7.0, requiring a code change (see §4).
- `@playwright/test` 1.61.1 → 1.62.0 orphaned its installed browser binary; fixed with
  `npx playwright install chromium`.

**Task 9c - low-risk missed majors**

- `@testing-library/jest-dom` → 7.0.0
- `@types/supertest` → 7.2.1
- `lint-staged` → 17.2.0
- `globals` → 17.8.0
- `uuid` → 14.0.1
- `@types/node` → 26.1.1 (six majors, zero type errors)

**Task 9d - high-scrutiny missed majors**

- `pino` → 10.3.1
- `pino-pretty` → 13.1.3
- `express-rate-limit` → 8.6.1
- `@hookform/resolvers` → 5.5.7 (this upgrade is what _fixed_ a bug Task 7 itself introduced - see §4)
- `openai` → 6.49.0 (clean drop-in; also removed the need for `--legacy-peer-deps`, since v6 widened its optional zod peer to `^3.25 || ^4.0`)

**Task 10 - TypeScript**

- `typescript` → 6.0.3 (exact pin, not `7` - see §3)
- `tsconfig.json`: `baseUrl` removed entirely (pre-empting TS 7's full removal - paths were already `"./"`-relative and resolve fine without it); `target: "ES2022"` added explicitly.

**Gate-integrity fixes made along the way (not package upgrades, but part of the record)**

- `eslint.config.js`: `.claude/**` was not ignored (2120 `no-undef` errors) and test globals missed
  `.tsx` files - fixed, lint went from 2218 errors to 0. Committed separately as `e6f52a2` per the
  git log (outside this phase's "nothing committed" scope, done as an explicit prerequisite fix).
- `vitest.config.ts`: included `tests/**/*.spec.ts`, so vitest tried to run Playwright specs. Excluded
  `tests/e2e/**`, recovering 8 files.
- A new e2e spec, `tests/e2e/raw-html.spec.ts`, was added to close a coverage gap (see §6) - the
  e2e count rose from 61 to 64 because of this addition, not because of any upgrade.

---

## 3. What was deliberately NOT upgraded, and why

| Package                            | Held at           | Latest available | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ----------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint`                           | 9.39.4            | 10.8.0           | `eslint-plugin-react@7.37.5` peers `^3 … ^9.7` - no `^10` release exists. Upgrading crashes `npm run lint` and the husky pre-commit hook.                                                                                                                                                                                                                                                                                                                                                                                           |
| `eslint-plugin-react-hooks`        | 5.2.0             | 7.1.1            | The 5→7 jump is a rules rewrite, not a version bump - a separate project of work, not something to fold into a dependency task.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `typescript`                       | 6.0.3 (exact)     | 7.0.2            | TypeScript 7 ships no compiler API, and `typescript-eslint` hard-caps its peer at `<6.1.0`. 6.0.3 is the highest version compatible with the linting toolchain currently in place. **Correction:** an earlier justification for this pin claimed it "keeps type-aware linting working" - that claim was wrong and is corrected in §5.                                                                                                                                                                                               |
| `@vitejs/plugin-react`             | 5.2.0             | 6.0.4            | v6 requires opting into the React Compiler, which is out of scope for this phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@types/express-serve-static-core` | 5.1.0 (exact pin) | 5.1.2            | 5.1.1 widened `ParamsDictionary`'s value type and reproduced the exact 195/197-error regression that Task 6 had already root-caused and fixed once (`ParamsDictionary` went from a narrower type to `string \| string[]`, breaking `isAuthenticated`/`enforceBrandOwnership`/`brandIdParamHandler`). Task 9b hit the same regression on a routine bump attempt and restored the pin. The pin has now held twice because its reason is recorded here. The real fix - making those three middleware generic over `P` - is still open. |

**`bufferutil` shows as MISSING** in `npm outdated`. This is expected, not a
gap: it is declared under `optionalDependencies` as a native addon and is not
built on Windows in this environment. It does not affect functionality (`ws`
falls back to its pure-JS implementation).

---

## 4. Bugs found

This is the most important section. In order of severity:

**1. Phase 1 itself introduced a regression in Task 7, and six consecutive
green gates missed it.** `@hookform/resolvers@3.10` combined with `zod@4`
(landed in Task 7) was not merely outdated - it was **broken**. Zod 4 removed
`ZodError.errors`; the 3.10 zod adapter detects validation failure via
`Array.isArray(error?.errors)`, which evaluates `false` under zod 4, so
instead of returning `{errors}` to react-hook-form it threw the raw
`ZodError`, rejecting the resolver's promise outright. This broke client-side
validation on the brand form (`client/src/pages/brands.tsx`, the only
`zodResolver` call site in the app) from the moment Task 7 landed through
five subsequent tasks (8, 9, 9b, 9c, and the first part of 9d) - all of which
reported a clean gate. It was only caught in Task 9d when
`@hookform/resolvers` was itself upgraded to 5.5.7 for unrelated reasons and
the fix was reproduced and verified directly (broken under 3.10 + zod 4,
resolves under 5.5.7 with a correct `{errors: {...}}` shape). **Root cause of
the miss: the e2e suite never submits a zod-validated form**, so nothing in
the gate could have caught this - see §6.

**2. `server/vite.ts`'s `process.exit(1)` kill switch.** `customLogger.error`
called `process.exit(1)` synchronously on _any_ dev-mode Vite error. This was
the true cause of a dev server that appeared to die mid-e2e-run at test
26–28, reproducibly, across three separate task cycles - each time initially
misdiagnosed as an environment flake before the real cause was isolated. It
explains every observed symptom at once: exit code 1 with no stack trace
(`process.exit` truncates buffered output), no graceful-shutdown log (no
signal was ever sent), the server being perfectly healthy when idle or
standalone (it only trips when a real page navigation runs through
`vite.middlewares`), and the failures clustering right after the suite's
first heavy real-page-load specs. Two other hypotheses were investigated and
ruled out first: a missing `unhandledRejection`/`uncaughtException` guard
(plausible given Node 24's default of killing the process on an unhandled
rejection, but wrong - this was a synchronous call, not an async rejection),
and a cron job (also ruled out - every scheduler job was already wrapped in
`cronCrashGuard(...).catch(...)`, and cron fires on wall-clock time, which
cannot align with a test index). Fixed: the kill switch now logs and
continues instead of exiting. This is very likely inherited Replit-scaffold
boilerplate rather than a considered decision.

**3. Dead 404 logic.** The catch-all handler in `server/vite.ts` was
registered as `app.use("*", ...)`. Express strips the mount prefix before the
handler runs, so `req.path` was **always `"/"`** inside it -
`isKnownRoute("/")` was always `true`, so **every URL returned 200**,
including genuine 404s. This bug was invisible until Express 5 forced the
fix: a bare `"*"` string is invalid under Express 5's `path-to-regexp` v8 and
throws at route-registration time, so the wildcard had to be removed as part
of the mandatory Task 6 migration - which made the 404 check live for the
first time. Verified after the fix: all real routes return 200,
`/this-does-not-exist` correctly returns 404.

**4. The `KNOWN_ROUTES` allowlist had drifted in both directions**, only
discoverable once bug #3 made the check live. Fixed by adding the routes
that existed but weren't listed: `/home2`, `/verify-email`, `/welcome`,
`/glossary`, `/monitor`, `/diagnose`, `/act`, `/setup`, `/report`,
`/content/:id`, `/admin/scrape`, `/admin/scrape/:id`. **It is still stale in
the other direction, left deliberately unfixed:** `/pricing`, `/article/:id`,
`/geo-rankings`, `/revenue-analytics`, `/publications`, `/agent`,
`/outreach`, `/ai-traffic`, `/analytics-integrations` are all still listed
and return 200, but should 404 - flipping 200→404 for those needs its own
verification pass (some, like `/pricing`, are already known dead pages per
the Phase 0 baseline) and was out of scope here.

**5. `express-rate-limit` v8 IPv6 keying hardening.** v8 rejects custom
`keyGenerator`s that use raw `req.ip` directly, requiring its new
`ipKeyGenerator()` helper instead - this closes an IPv6-rotation bypass of
rate limits (an attacker could previously rotate addresses within an IPv6
/56 block to evade the login limiter). All keygens in this codebase
(`authRateKey`, `aiRateKey`, and inline ones in `auth.ts` and
`userAccount.ts`) used raw `req.ip` and were all wrapped. Verified by
simulation: the 15-minute/10-attempt window is intact, (IP, email) keying is
intact, and same-/56 IPv6 addresses now correctly collapse into one bucket.

**6. `react-icons` dropped an exported icon (`SiOpenai`) in a patch
release** (Task 9b, 5.7.0). Two files imported it (`ai-visibility.tsx`,
`competitors.tsx`); both were switched to `BsOpenai`. A reminder that "minor
is safe" (or in this case, patch) is not a guarantee for icon libraries with
brand-mark churn.

**7. The auth-setup token-validation bug, misdiagnosed as flakiness
twice.** `tests/e2e/support/auth.setup.ts` validated its cached login by
_navigating_ to a gated route - but the in-page Supabase client silently
refreshes its own session on render, so the page can render fine even after
the **stored JWT snapshot** on disk has expired. Specs that read that raw
token directly (`billing.spec.ts`, `welcome-brand.spec.ts`, via
`support/bearer-token.ts`) then got 401s calling the API - intermittently at
first (tests running later in a run were more exposed as the token aged),
then consistently once the token fully lapsed. This was called "flaky"
twice before the real mechanism was found and fixed: setup now also extracts
the stored `access_token` and probes `GET /api/brands` with it directly,
forcing a fresh login on anything other than a 200. Falsification-tested
both ways (corrupted token → detected and recovered; valid token → 0 logins
performed).

---

## 5. Corrections to the record

Three claims were written down during the phase, repeated, and later found
wrong. Recorded here rather than quietly fixed, per instruction not to
soften anything:

1. **`tests/integration/v2SearchLlmSmoke.test.ts` was described as calling a
   live LLM through OpenRouter**, and that description was propagated into
   the flaky-test rationale across multiple tasks. It does not - direct
   inspection during Task 9d found it **fully mocks both OpenAI client
   exports**. It genuinely does flake, but from the same DB contention that
   affects the other flaky tests, not from network variance. An earlier
   agent's claim was taken at face value and repeated without verification
   until this correction.

2. **"Flaky" was used as a diagnostic label twice where the underlying cause
   was in fact real and reproducible, not environmental noise:** the auth
   token-expiry bug in §4 item 7 (misdiagnosed as flaky twice before the
   mechanism was isolated), and leftover fixture data from crashed e2e runs
   poisoning a later test (Task 7: a leftover DB row from `url-state.spec.ts`
   whose `afterAll` cleanup never ran because the dev server had died
   mid-run earlier that day - via bug #2 above - caused
   `spine-navigation.spec.ts`'s "other pages reachable" test to fail, and
   fail again in isolation, before the leftover row was traced and deleted).

3. **"TypeScript 6.0.3 keeps type-aware linting working"** was used
   repeatedly, across at least Task 10's plan text and its own gate
   commentary, as a stated benefit of the 6.0.3 pin. It is false: there is
   **no type-aware linting configured anywhere in this repository**.
   `eslint.config.js` uses `tseslint.configs.recommended`, which is
   syntax-only, and no `parserOptions.project` exists anywhere in the repo.
   The pin's real and still-valid justification is narrower: it is the
   highest TypeScript version inside `typescript-eslint`'s peer range
   (`>=4.8.4 <6.1.0`), full stop - not that it preserves a capability that
   was never enabled in the first place.

---

## 6. Open items for Phase 2

- **No e2e coverage of form submission.** This is the gap that let the
  `@hookform/resolvers` + zod 4 break (§4 item 1) sit unnoticed through six
  green gates. Phase 2 touches every form via the routing migration - close
  this before then, not after.
- **`KNOWN_ROUTES` is still stale in the direction that matters for
  correctness**: it still lists paths that no longer exist as real pages
  (`/pricing`, `/article/:id`, `/geo-rankings`, `/revenue-analytics`,
  `/publications`, `/agent`, `/outreach`, `/ai-traffic`,
  `/analytics-integrations`) and they still return 200 instead of 404. Also
  note `server/lib/factAgent/v2/urlTierScoring.ts`'s header docblock (line
  ~18) still lists `integrations/*` under Tier 3 - stale relative to the
  code, flagged but not fixed.
- **`react-helmet-async` is now redundant and actively conflicting.** React
  19 natively hoists `<title>`/`<meta>`/`<link>` into `<head>` itself,
  correctly, but without Helmet's `data-rh` marker - Helmet's own children
  still get hoisted by React 19 before Helmet's own logic runs, so the two
  systems now duplicate tags rather than one replacing the other. The
  `dedupeStaticMeta` fix made earlier in this branch's history was itself
  silently neutralized by this (it keyed off `data-rh`) and had to be
  re-keyed to an explicit `data-static-fallback` marker in `index.html` -
  the second time in this session a fix was silently inerted by a later,
  unrelated change. The design spec's "20 files use react-helmet-async"
  migration item is simpler than originally assumed: they should move to
  React 19 native metadata or TanStack Start's head API, and the library
  should be dropped entirely rather than migrated.
- **Type-aware ESLint rules are not enabled**, and per §5 correction #3 never
  were. Enabling them (via `parserOptions.project`) would add
  `no-floating-promises` - precisely the check that would have flagged the
  class of unhandled-async-work failure this phase spent real time chasing
  (§4 items 2–3). Worth doing before Phase 2 adds more async surface area.
- **The nested-worktree PostCSS trap.** This worktree lives nested inside the
  main checkout, and Vite's PostCSS config search walks _up_ past this
  worktree into the parent repo's stale v3 `postcss.config.js` and
  `node_modules`, breaking the build. Currently worked around with an
  explicit `css: { postcss: {} }` in `vite.config.ts`. This will be
  baffling to hit cold if anyone removes that line without knowing why it's
  there.
- **`@playwright/test` upgrades need a matching browser download.** The
  1.61.1 → 1.62.0 bump in Task 9b orphaned the installed Chromium binary and
  crashed the setup project instantly; fixed ad hoc with
  `npx playwright install chromium`. Worth adding as a postinstall step (or
  at minimum a documented manual step) before this becomes a CI failure
  instead of a local one.
- **Sentry delivery was never verified locally** across any of Tasks 1–5 -
  `SENTRY_DSN`/`VITE_SENTRY_DSN` are unset in this environment, so
  `server/instrument.ts`'s init is a guarded no-op and error capture cannot
  be confirmed from this worktree. This needs a deployed-environment check
  (trigger the known `POST /api/stripe/checkout` 500 and confirm the event
  lands in Sentry) before trusting error reporting post-migration.
- **Sourcemap upload is likewise unverified** - `SENTRY_AUTH_TOKEN` is unset
  and the local build never sets `NODE_ENV=production`, so `@sentry/vite-plugin`'s
  upload path has not actually run in this environment.
- **The `@types/express-serve-static-core` pin (§3) has already caused one
  repeat regression** (Task 6, then again attempted in Task 9b). The durable
  fix is making `isAuthenticated`/`enforceBrandOwnership`/`brandIdParamHandler`
  generic over `P` instead of relying on the exact-pinned older type - still
  open.
- **`v2UrlTierScoring`'s underlying bug is still live**, not just its test:
  `LOCALE_PREFIX` in `server/lib/factAgent/v2/urlTierScoring.ts` still
  mis-scores `/api`, `/faq`, `/ceo`-shaped paths as locale-prefixed. Left
  for a deliberate, reviewed fix rather than an incidental one.
