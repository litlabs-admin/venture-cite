# VentureCite → TanStack Start Migration — Design

**Date:** 2026-07-25
**Status:** Approved for planning
**Branch:** new branch off `main`, this repo

---

## 1. Context

VentureCite is a Vite + wouter React SPA with an Express API, deployed on Vercel.
Measured size at time of writing:

|          |                                                                                  |
| -------- | -------------------------------------------------------------------------------- |
| Total    | ~95k LOC — 48k client / 44k server / 3k shared                                   |
| Client   | 272 files, 126 components, 36 routes (48 `<Route>` declarations)                 |
| Server   | 168 files, 24 Express route modules, esbuild-bundled into one Vercel function    |
| Coupling | 33 files import `wouter` · 20 use `react-helmet-async` · 14 touch `localStorage` |
| Tests    | 148 unit/integration files, **1** end-to-end spec                                |
| React    | 18.3.1                                                                           |

The driver is a planned public content surface (marketing pages plus an
Airtable-backed blog) that the current client-rendered SPA cannot serve to
crawlers. The decision was to unify onto one framework rather than split a
separate marketing site out.

## 2. Goals

1. One framework, one codebase, one deployment.
2. Server-rendered, crawlable public pages.
3. Runs correctly on **both** Render (free tier) and Vercel, with no manual
   per-host reconfiguration.
4. Keep the existing Express API intact.
5. No regressions — verified, not asserted.

## 3. Non-goals (explicitly out of scope)

- Marketing pages and the Airtable blog — phase 2 work, after this lands.
- The trakkr→venturecite rebrand — **already complete**. Verified: no
  user-visible "trakkr" remains; the 31 surviving mentions are code comments
  documenting the landing page's design source.
- Removing the old home page — **already done**; `/home2` redirects to `/`.
- Changing authentication.
- Server-rendering the logged-in dashboard.

## 4. Locked decisions

| Decision            | Value                                                 | Rationale                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | TanStack Start 1.168.32                               | Stays on Vite (build config survives); no `"use client"` bookkeeping across 272 files; same ecosystem as the TanStack Query already in use; caching is plain HTTP headers, so it is host-portable |
| Host                | Render **and** Vercel, both fully working             | User requirement. Neither is a fallback; the app must run correctly on Render's free tier and on Vercel without manual reconfiguration                                                            |
| Express             | Kept whole, mounted in-process                        | `server/` is not modified. Removes the largest single chunk of migration risk                                                                                                                     |
| Auth                | **Unchanged**                                         | Since no gated page is server-rendered, browser-side Supabase sessions still work. `@supabase/ssr`, cookie sessions and middleware are unnecessary. The recently-audited auth code is not touched |
| Dashboard rendering | Browser-only                                          | Gated pages are never indexed; server-rendering them adds work and risk for no benefit                                                                                                            |
| Dependencies        | All latest, single pass                               | User directive                                                                                                                                                                                    |
| Verification        | Playwright E2E written first, against the current app | Only mechanism that can substantiate "nothing breaks"                                                                                                                                             |
| Location            | New branch, this repo                                 | Preserves history and diffability                                                                                                                                                                 |

### Rejected alternatives

- **Next.js** — would replace Vite with Turbopack, require `"use client"`
  annotation across the codebase, and its ISR depends on Vercel-specific
  plumbing (self-hosting it needs a persistent disk or a Redis cache handler).
  Worse fit for a dual-host requirement.
- **Separate marketing site** — rejected; user wants one unified stack.
- **Strangler migration** — considered and rejected by the user in favour of a
  big-bang branch.

## 5. Architecture

```
src/
  routes/                     file-based routing, replaces App.tsx
    __root.tsx                providers: QueryClient, Theme, Tooltip, Toaster, ErrorBoundary
    index.tsx                 landing (SSR) or dashboard, by auth state
    login.tsx  register.tsx  forgot-password.tsx  reset-password.tsx  verify-email.tsx
    _app/                     layout route: AppShell + auth guard
      monitor.tsx  diagnose.tsx  act.tsx  setup.tsx  report.tsx
      content.tsx  content.$articleId.tsx  articles.tsx  brands.tsx
      keyword-research.tsx  settings.tsx  welcome.tsx  glossary.tsx
      admin/scrape.tsx  admin/scrape.$runId.tsx
    privacy.tsx               public, SSR
    api/
      $.ts                    catch-all → Express via fromNodeMiddleware
  components/  hooks/  lib/  tours/    moved as-is from client/src
server/                       UNCHANGED — all 24 route modules, scheduler, workers
```

The tree above is indicative, not exhaustive. `App.tsx` also carries ~12
retired feature paths (`/citations`, `/competitors`, `/geo-signals`,
`/ai-visibility`, `/crawler-check`, `/faq-manager`, `/community`,
`/brand-fact-sheet`, `/geo-tools`, `/geo-analytics`, `/opportunities`,
`/ai-intelligence`) that 301 into the workflow spine via `SpineRedirect`,
preserving query params and adding `?tab=`. Every one must survive the
migration. The authoritative route table comes from the full `App.tsx`
inventory feeding the implementation plan.

### Express mounting

A single catch-all server route forwards `/api/*`, `/webhooks/*` and `/health`
into the existing Express app using Nitro/h3's `fromNodeMiddleware()`. No
changes to `server/`.

**Known behavioural difference:** on Render the process is persistent, so long
AI jobs run unbounded. On Vercel the same code runs as a function subject to
`maxDuration` (800s on Pro). This is inherent to serverless and is documented,
not worked around.

### Cron portability

All 11 scheduled jobs in `server/scheduler.ts` become HTTP-triggerable
endpoints. `node-cron` is retained as an optional in-process driver.

| Host                | `CRON_MODE` | Trigger                                         |
| ------------------- | ----------- | ----------------------------------------------- |
| Vercel              | `http`      | Vercel Cron                                     |
| Render free         | `http`      | External scheduler (UptimeRobot / cron-job.org) |
| Render paid / local | `internal`  | `node-cron` in-process                          |

Business logic is identical across all three; only the trigger differs.

### URL-as-state contract (must be preserved exactly)

The app uses the query string as its source of truth for a large amount of UI
state, always written with `replace: true` so tab and filter changes do not
spam browser history. This is a behavioural contract, not an implementation
detail — shareable and bookmarkable URLs depend on it.

| Param       | Owner                    | Purpose                                                           |
| ----------- | ------------------------ | ----------------------------------------------------------------- |
| `?tab=`     | `SpineShell.tsx`         | Selects the active tab on all five spine pages                    |
| `?brandId=` | `use-brand-selection.ts` | Brand selection; precedence is URL → `localStorage` → first brand |
| `?mention=` | `MentionsTab.tsx`        | Opens the mention detail sheet                                    |
| `?edit=`    | `articles.tsx`           | Auto-opens the edit dialog, then clears itself                    |
| filter set  | `useMentions.ts`         | status / platform / sentiment / date range / search / sort        |

TanStack Router's typed search params are a good fit here and an upgrade over
the current hand-rolled `URLSearchParams` parsing, which is independently
reimplemented in at least two hooks.

**Highest-complexity route:** `content.tsx` is dual-addressed — standalone at
`/content/:articleId` using a path param, and embedded as the Act spine's
Create tab at `/act?tab=create&article=<id>` using a search param, switching
mode on a pathname prefix check. This needs deliberate reproduction.

**Deliberate full-page navigations that must NOT become router links:**
`window.location.href` in the auth gates and in `pricing.tsx` (Stripe Checkout
redirect and the free-tier bounce).

### SSR surface (inventoried)

**The landing page subtree is already SSR-clean.** Every browser-global access
under `client/src/pages/landing/` is confined to effects or event handlers, and
both portal components already use the correct `mounted`-gate pattern. The page
we most want to server-render needs no SSR remediation — the work there is
purely head-tag migration.

Genuinely SSR-unsafe, all outside the landing subtree:

| File                                                        | Issue                                                                                                      | Severity                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `App.tsx` route guards (3 sites)                            | `window.location.href` in the **render body**, unguarded                                                   | Crashes if ever server-rendered. Dashboard-only today, but a shared root layout would expose it                            |
| `use-persisted-state.ts`                                    | `localStorage` in a `useState` lazy initializer                                                            | try/catch'd, so no crash — but guarantees a hydration mismatch                                                             |
| `dashboard/Pulse.tsx`, `dashboard/RecommendationsPanel.tsx` | same lazy-initializer pattern                                                                              | same                                                                                                                       |
| `tours/engine/shepherdAdapter.ts`                           | top-level `import Shepherd from "shepherd.js"`, and `TourOrchestrator` is mounted **eagerly** in `App.tsx` | Unverified third-party SSR safety. Should be lazy-loaded regardless — it is dashboard-only code riding in the eager bundle |
| `main.tsx`                                                  | `document.getElementById` at module scope                                                                  | Replaced by the framework client entry anyway                                                                              |

`lib/theme.ts` and `ThemeProvider.tsx` are correctly guarded and will not throw,
but SSR always resolves to the light fallback. The existing FOUC-blocker script
in `index.html` needs an equivalent in the Start document head, or dark-mode
users get a flash on every server-rendered page.

### Head tags (inventoried)

19 files emit `<Helmet>`. Every one is limited to `<title>`, sometimes
`<meta name="description">`, and on auth pages `<meta name="robots"
content="noindex">`. `glossary.tsx` is a second, inconsistent pattern — manual
`document.title` and meta injection inside an effect — and folds into the same
migration.

**There are no `og:`, `twitter:`, `<link rel="canonical">` or JSON-LD tags
anywhere in the codebase.** `faq-manager.tsx` generates FAQPage structured data
but only for clipboard copy; it is never injected into the document head. This
is out of scope here, but it is a material gap for a product whose value
proposition is AI/search visibility, and phase 2 should address it.

### Host abstraction

`VERCEL_URL` in `server/env.ts` is replaced by a host-agnostic `APP_URL`
resolver that derives the public origin from whichever host is running.

## 6. Hosting matrix

|                    | Render free                      | Render Starter ($7/mo) | Vercel         |
| ------------------ | -------------------------------- | ---------------------- | -------------- |
| Persistent process | ❌ sleeps after 15 min idle      | ✅                     | ❌ serverless  |
| Cron               | HTTP + external pinger           | `node-cron` native     | Vercel Cron    |
| Cold start         | 30–60s unless kept warm          | none                   | minimal        |
| Edge caching       | ❌ paid-only                     | ✅                     | ✅             |
| Resources          | 512 MB / 0.1 CPU                 | scales                 | per-invocation |
| Hours              | 750/mo (24/7 ≈ 730, one service) | unlimited              | n/a            |

**Accepted trade-offs on Render free:** 0.1 CPU makes rendering and LLM
orchestration slow; 512 MB is tight and may exhaust under concurrent scans; no
edge caching, which will matter when the blog lands but not before. Pinging
every ~10 minutes to drive cron also keeps the service under the sleep
threshold, largely eliminating cold starts.

## 7. Dependency upgrade set

Single pass to latest. Highest-risk first.

> ⚠️ **Audit result: "everything to latest" is not achievable.** Two packages
> cannot reach latest without breaking the lint/typecheck toolchain. See
> §7.1 for the blockers and the sequencing constraints. The table below is the
> original intent; §7.1 supersedes it where they conflict.

| Package                                              | From → To                      | Risk                                                                   |
| ---------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| tailwindcss (+ typography, tailwind-merge)           | 3.4.17 → 4.3.3                 | 🔴 config model rewrite; `index.css` holds a custom OKLCH token system |
| zod                                                  | 3.24.2 → 4.4.3                 | 🔴 used pervasively for server validation                              |
| stripe / @stripe/stripe-js / @stripe/react-stripe-js | 20→22.3.2 / 8→9.12.0 / 5→6.8.0 | 🔴 money path                                                          |
| typescript                                           | 5.6.3 → 7.0.2                  | 🔴 new compiler implementation                                         |
| express                                              | 4.21.2 → 5.2.1                 | 🟠 breaking, but `server/` is otherwise untouched                      |
| react / react-dom                                    | 18.3.1 → 19.2.8                | 🟠 forced by the framework                                             |
| recharts                                             | 2.15.2 → 3.10.0                | 🟠 forced by React 19                                                  |
| @sentry/\*                                           | 8.40.0 → 10.68.0               | 🟠 two majors; SDK swapped to `@sentry/tanstackstart-react`            |
| vite                                                 | 6.4.2 → 8.1.5                  | 🟠                                                                     |
| lucide-react                                         | 0.453.0 → 1.26.0               | 🟠 possible icon renames                                               |
| react-day-picker / date-fns                          | 8→10.0.1 / 3→4.4.0             | 🟠                                                                     |
| vitest / eslint                                      | 3→4.1.10 / 9→10.7.0            | 🟡 tooling only                                                        |
| framer-motion / shepherd.js                          | 11→12.42.2 / 14→15.2.2         | 🟡                                                                     |
| drizzle-kit                                          | 0.31.4 → 0.31.10               | 🟢                                                                     |

### 7.1 Audit findings

**Resolved (verified against the npm registry):**

| Decision         | Target             | Verification                                                                                                                                                                                        |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint           | **hold at 9.x**    | `eslint-plugin-react@latest` peers cap at `eslint ^9.7`. ESLint 10 confirmed blocked. Bump `typescript-eslint`, `eslint-config-prettier` and `eslint-plugin-react-refresh` only                     |
| TypeScript       | **6.0.3**, defer 7 | `6.0.2` / `6.0.3` are real stable releases (not RCs). Critically, `typescript-eslint` peers `typescript >=4.8.4 <6.1.0` — so **6.0.3 keeps type-aware linting working**, where 7.0.2 would break it |
| `drizzle-zod`    | **0.8.3**          | Latest; exactly the version zod 4 requires                                                                                                                                                          |
| `@types/express` | **5.0.6**          | Latest; matches Express 5                                                                                                                                                                           |

Staging through 6 also isolates the 5→6 breaking-change set from the 6→7 set
rather than absorbing both blind. TypeScript 7 becomes its own project once
`typescript-eslint` supports it.

**Hard blockers — cannot go to latest:**

| Package              | Blocker                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eslint` 9→10        | `eslint-plugin-react` has **no** ESLint-10-compatible release. ESLint 10 removes `context.getFilename()`, which the `react/display-name` rule calls — and this repo spreads `react.configs.recommended.rules` across every `client/**/*.tsx`. `npm run lint` and the husky pre-commit hook would crash, not warn. Upstream bug open with no ETA. |
| `typescript` 5.6→7.0 | TypeScript 7 **ships no compiler API**, and `typescript-eslint` hard-caps at `<6.1.0` — the issue to support TS7 was closed _not planned_. Breaks type-aware linting and `npm run check`. Also a double-major jump skipping all of 6.x. Microsoft's own guidance is to alias a `@typescript/typescript6` compat package for tooling.             |

**Sequencing constraints (mandatory):**

- `tailwindcss` + `tailwind-merge` must land in the **same** commit — v3 of tailwind-merge assumes v4 class syntax via the shared `cn()` helper.
- `react-day-picker` + `date-fns` must land in the **same** commit — rdp 8.10.1's peer range rejects date-fns v4.
- `zod` + `drizzle-zod` must land in the **same** commit — drizzle-zod is only zod-v4-safe at **≥0.8.3**; the current 0.7.x has an unbounded peer range, so npm will _not_ stop a broken install.
- `typescript` must ship alone, if at all.

**Corrections to earlier assumptions:**

- **Tailwind 4 does _not_ break the OKLCH token system.** In `@config` compat mode the exclusion list doesn't touch `theme.extend.colors`, `darkMode`, `content` or `plugins`. The hand-written `oklch(...)` values are outside Tailwind's generated palette entirely. This was the highest-scrutiny item and it turns out to be the most robust.
- **Stripe is LOW risk, not high.** `server/stripeClient.ts` pins the outgoing API version (`2026-02-25.clover`), so the wire format doesn't move with the SDK bump. Every v21/v22 breaking change is either already satisfied or unused. **The single most important rule for that PR: do not touch that pin.**
- **React 19 is LOW risk.** No `propTypes`, `defaultProps`, `ReactDOM.render`, string refs or zero-arg `useRef()` anywhere. Every third-party peer already declares React 19 support.
- **recharts 3 does not require React 19** — it supports 16.8 through 19.
- **Express 5 has only two real breaks:** the bare `app.use("*", …)` wildcards at `server/vite.ts:79,113` (dev-only path; Vercel bypasses them), and `@types/express` being pinned to an exact 4.x. The scary-sounding query-parser default change is a complete no-op given actual usage.

**Concrete work surfaced:**

- **zod 4:** 13 `ZodError.errors` call sites will throw on every malformed request — `assistant.ts`, `brands.ts` (×2), `factSheet.ts` (×6), `factSheetV2.ts` (×7), `userAccount.ts` (×2). Mechanical `.errors`→`.issues`.
- **Tailwind 4:** 64 `outline-none` occurrences across 41 files (codemod handles it); 330 `space-x`/`space-y`/`divide` occurrences whose selector semantics change — needs visual QA, not find/replace. Also `@tailwindcss/vite` is already a dependency but **never registered in `vite.config.ts`** — inert today.
- **Sentry:** audit acknowledged blind spots — a full `server/`-wide `Sentry.` sweep and a `client/src` `ErrorBoundary` sweep still need doing.

**Dead code found — deleting removes upgrade risk entirely:**

| Item                                           | Status                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `components/ui/chart.tsx`                      | Zero import sites, but still typechecked — recharts 3 types could break CI over unused code |
| `components/ui/calendar.tsx`                   | Zero call sites; its entire v8-era API is invalid under react-day-picker 10                 |
| `@stripe/stripe-js`, `@stripe/react-stripe-js` | **Zero usage** — checkout is server-driven hosted Checkout, never Elements                  |
| `zod-validation-error`                         | Zero imports                                                                                |
| `lib/draftStore.ts`                            | No call sites found                                                                         |

## 8. Risks

| Risk                                                  | Mitigation                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Big-bang + ~20 major upgrades has a wide blast radius | Phase 0 E2E gate; phases must be green before proceeding                                           |
| Only 1 E2E test exists today                          | Phase 0 exists solely to fix this, written against the current app so it encodes current behaviour |
| Tailwind 4 breaks the OKLCH token system              | Audited before upgrade; tokens are the design system's foundation                                  |
| Stripe upgrade affects billing                        | Opus-owned, test-mode keys, E2E covers checkout                                                    |
| Render free resource limits                           | Documented and accepted; upgrade path is $7/mo                                                     |
| Smaller TanStack Start ecosystem                      | Accepted; official Vercel support, Nitro presets and a Sentry SDK all exist                        |

## 9. Phases

Each phase must leave the E2E suite green before the next begins.

| Phase                | Content                                                                                                                                                  | Exit criteria                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **0 — Safety net**   | ~10 Playwright specs on the _current_ app: login, signup, password reset, welcome/brand setup, 5 spine pages, settings, billing checkout, landing render | All green against current `main`   |
| **1 — Dependencies** | Every upgrade in §7, on the existing framework                                                                                                           | E2E green, `npm run check` clean   |
| **2 — Framework**    | Routing, four mechanical sweeps, Express mount                                                                                                           | E2E green                          |
| **3 — Deploy**       | Nitro presets, `CRON_MODE`, `render.yaml`, `vercel.json`, parity check                                                                                   | App verified working on both hosts |

## 10. Execution model

Opus orchestrates, advises and reviews, and personally owns anything touching
auth, payments, or the security surface. Sonnet subagents perform mechanical
work: file sweeps, test authoring, config generation, inventory.

## 11. Open items

1. External scheduler for Render free must be set up by the user; endpoint URLs
   and schedules will be supplied.
2. ✅ **DECIDED — Render region: Singapore.** Supabase Postgres is in
   `ap-southeast-1` (Singapore), and Render offers a Singapore region. Using
   it keeps the app and database co-located; any other choice adds a
   cross-region round trip to every query, which compounds badly because
   dashboard pages issue many queries per render.
3. ✅ **DECIDED — canonical domain: `venturecite.com`, single domain for
   everything.** It is already what `client/index.html` declares as the
   canonical URL and uses across every Open Graph and Twitter tag, so this
   is the lowest-friction choice. Supabase auth redirect URLs, the Stripe
   webhook endpoint and CORS must all be set to it.
   ⚠️ **Inconsistency to resolve during Phase 3:** the codebase also
   references `venturecite.app` in two places — `APP_URL` defaults to
   `https://venturecite.app` (`server/emailService.ts:13`) and the fallback
   email sender is `VentureCite <reports@venturecite.app>`. Either align
   them to `.com`, or keep `.app` deliberately as a separate sending domain
   and document why. Right now it looks accidental.
4. E2E credentials live in `.env` as `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`,
   never in committed test files.
5. ~~Pre-existing bug: `.env` sets `RESEND_FROM_EMAIL` but the code reads
   `RESEND_FROM_ADDRESS`.~~ **RESOLVED 2026-07-25.** Investigated: the code,
   `server/env.ts` and `.env.example:68` all correctly use
   `RESEND_FROM_ADDRESS`. `RESEND_FROM_EMAIL` was retired in phase 1 (see
   `docs/phase1_completion.md:457`) when `server/email.ts` became
   `emailService.ts`, but the local `.env` kept the dead key with the
   placeholder value `no-reply@yourdomain.com`. Renaming it would have made
   the app send from an unverified domain — strictly worse than the existing
   fallback. The dead line was deleted instead; behaviour is unchanged and
   correct. **Still to confirm: whether the Vercel environment carries the
   same dead key.**
6. Pre-existing bug, surfaced by the route inventory: `ai-visibility.tsx` passes
   external URLs and `mailto:` links into wouter's `<Link>`, which the client
   router intercepts. Needs a decision during the port — fix to plain `<a>`
   rather than porting the bug forward.
7. Three files navigate directly to retired paths rather than their canonical
   spine URLs, paying an extra redirect hop: `brands.tsx` → `/brand-fact-sheet`,
   `HallucinationsTab.tsx` → `/brand-fact-sheet`, `ScanCompletionListener.tsx`
   → `/geo-tools`. Cheap to correct while the links are being touched.
8. The unauthenticated path is inconsistent: the auth gates hard-navigate via
   `window.location.href = "/login"` (full page reload) while `FirstRunGate`
   uses a router redirect. Worth normalising during the port.
9. ~~No Open Graph, Twitter card, canonical or JSON-LD tags exist anywhere.~~
   **CORRECTED 2026-07-25.** They all exist, statically, in
   `client/index.html`: canonical (line 23), robots (24), full Open Graph
   (27-35), Twitter card (38-44) and JSON-LD (47). The original finding came
   from scanning `<Helmet>` blocks in page components and was wrongly
   generalised. The real, much smaller issue: these are **site-wide and
   static**, so every route inherits the homepage's tags — there are no
   per-page canonicals or OG images. That matters once the marketing site
   grows to many pages, not before.
   9a. **Duplicate meta descriptions on every Helmet page.** `client/index.html`
   ships a static crawler-fallback `<meta name="description">`, and
   `react-helmet-async` _appends_ rather than replaces — so two coexist.
   Crawlers most likely read the generic static one, not the page-specific
   copy. Found while writing the Task 3 e2e spec. The Start head API
   replaces rather than appends, so migrating head tags fixes this by
   construction — but verify it rather than assuming.
10. `client/src/lib/draftStore.ts` appears to be dead code — no call sites found
    for `getActiveDraftId` / `setActiveDraftId` / `clearActiveDraftId`. Confirm
    before carrying it across.
11. **Billing is non-functional in the local environment** (found by the Task 10
    e2e spec, all three verified directly):
    - The `STRIPE_SECRET_KEY` in `.env` has an `sk_test_` prefix but is
      **invalid** — Stripe returns 401 `Invalid API Key provided`. Safe, but
      dead. This is why `setupStripeProducts()` fails at boot and
      `/api/stripe/products` returns an empty array.
    - The **`stripe` Postgres schema does not exist** in this database, so a
      well-formed `priceId` yields a 500 rather than a Checkout Session.
    - **`/pricing` is dead code** — `pricing.tsx` exists but is never routed in
      `App.tsx`, so the path 404s. The landing nav data confirms the pricing
      section was deliberately removed.
      **Confirm whether production shares any of these before the migration**, and
      decide whether `pricing.tsx` should be deleted or re-routed. The e2e spec
      currently pins the broken behaviour as-is, which is correct for a migration
      gate but must not be mistaken for the behaviour being desirable.
12. 🔒 **Systemic information disclosure: raw error messages returned to
    clients.** `res.status(500).json({ success: false, error: error.message })`
    appears at **19 sites across 7 route modules** — `billing.ts`,
    `content.ts`, `factSheet.ts`, `factSheetV2.ts`, `geoSignals.ts`,
    `intelligence.ts`, `onboarding.ts`. The raw driver message reaches the
    client, **including SQL statement text**. Currently observable via
    `billing.ts:187`, which leaks `SELECT id FROM stripe.prices WHERE ...`
    because the `stripe` schema is missing. Verified by direct grep, not
    inferred. This is the same class of issue the recent security audit
    addressed and is worth fixing independently of the migration: capture
    detail to Sentry (already wired via `captureAndFlush`) and return a
    generic message.
13. **Race in the tour engine.** `client/src/tours/engine/shepherdAdapter.ts` — when
    a step fails to build, Shepherd's own `next()` cascades to `complete()`
    _without_ invoking the adapter's `onComplete` handler, so the tour's
    completion bookkeeping is skipped. This makes a tour click-through
    non-deterministic even on a fresh account. Found while investigating why
    the tours e2e test could not be made repeatable.
14. **Tour completion cannot be reset.** `server/routes/tours.ts`'s
    `PatchOpSchema` whitelist has no global-clear operation, and tour
    eligibility (`client/src/tours/engine/eligibility.ts:46-47`) is
    permanently false once completed. That makes the global-welcome
    auto-fire path untestable after its first run on any account. Worth a
    reset op — for testing, for support, and for re-onboarding users.
15. **A successful payment would land on a 404.** `server/routes/billing.ts`
    sets `success_url` and `cancel_url` to `${baseUrl}/pricing?success=true`
    / `?canceled=true`, but `/pricing` is not routed in `App.tsx` (see item
    11). If checkout were working, Stripe would return paying customers to a
    not-found page. Fix the route or the redirect target before billing is
    revived.
16. **URL tier scoring mis-classifies short paths as locale prefixes.**
    `server/lib/factAgent/v2/urlTierScoring.ts`'s `LOCALE_PREFIX` regex
    treats **any** bare 2–3 letter path segment as an ISO locale code.
    `/api`, `/faq` and `/ceo` are all stripped to `/`, which then matches the
    homepage rule and scores Tier 1. Confirmed by
    `tests/unit/v2UrlTierScoring.test.ts:51`, which expects
    `scoreUrl("https://x.com/api") === 0` and gets `1`. **The test is correct
    and the code is wrong.** Left unfixed deliberately: correcting it changes
    scoring output, which may affect stored results and user-visible
    metrics, so it is your call rather than a silent fix. Constrain the regex
    to a real ISO-639-1 list, or require a region suffix.
17. `CardTitle` renders a `<div>` rather than a heading element, so card titles
    sit outside the document heading hierarchy. Accessibility nit, found in
    Task 9.
18. **Broken legacy redirect.** `/ai-intelligence` redirects to
    `/monitor?tab=share-of-answer`, but `share-of-answer` is no longer a tab on
    `monitor.tsx` (actual tabs: `overview`, `citations`, `competitors`,
    `trends`, `mentions`). `SpineShell` falls back to `overview`, so the link
    silently lands users on the wrong tab. Found by the Task 7 e2e spec, which
    now asserts the real fallback behaviour rather than the intended one. Decide
    during the migration whether to repoint the redirect or retire the path.
