# Phase 2 — TanStack Start Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace wouter + the Express SPA fallback with TanStack Start, so the three public routes are genuinely server-rendered and crawlable, while the authenticated dashboard stays browser-rendered and its auth code is untouched.

**Architecture:** File-based routing under `src/routes/`. Public routes SSR. A single `_app` layout route carries `ssr: false`, which cascades to every gated route beneath it. The existing Express app is mounted whole into a splat server route. `server/` is not rewritten.

**Tech Stack:** `@tanstack/react-start@1.168.32`, `@tanstack/react-router@1.170.18`, Vite 8, Nitro, React 19.

## Global Constraints

- 🚫 **RUN NO GIT COMMANDS.** The user commits. Each task ends by reporting a suggested commit message.
- **The gate after every task** — run `npm test` and `npm run test:e2e` as _separate_ commands, never chained (they share a database):
  - `npm run check` — clean
  - `npm run lint` — **0 errors** (~830 warnings expected; watch errors only)
  - `npm test` — **904 passed / 1 failed** (`v2UrlTierScoring.test.ts` is deliberately red)
  - `npm run test:e2e` — **67 passed / 2 skipped / 0 failed**
- **Fix the code, not the test.** The one sanctioned exception is Task 11, where `raw-html.spec.ts` assertions _must_ flip — and that flip is the proof SSR works.
- Known-flaky under parallel load: `v2SearchLlmSmoke`, `citationCronUnconditional`, `llmConcurrency`, `v2Lifecycle*`. Re-run a file alone before calling it a regression; **if it fails alone too, investigate rather than re-running.**
- Free port 5000 and warm the dev server before an e2e run — a cold Vite optimise pass can exceed the 60s setup budget.
- **No type suppressions.** Phase 1 completed 16 tasks with zero `any`/`as any`/`@ts-ignore`. Hold it.
- Never print secrets.

---

## Verified inputs

Two research passes fed this plan. Read them before starting:

- `scratchpad/p2/tanstack-api-research.md` — API shapes with code
- `scratchpad/p2/migration-surface-inventory.md` — the exhaustive surface

Key facts, verified:

|                      |                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Version              | `1.168.32` is the `latest` dist-tag, **no prerelease suffix**; last six releases stable. Checked against the npm registry, not release notes. |
| Client-only routes   | `createFileRoute({ ssr: false })`. Set on a **parent layout**, children inherit and cannot loosen it.                                         |
| Express mount        | **NOT `fromNodeMiddleware`** — that is stale. Current: `srvx/node`'s `toFetchHandler(expressApp)` into a splat server route.                  |
| Dual host            | One `vite.config.ts`; Nitro auto-detects Vercel at build time, else defaults to `node-server` for Render.                                     |
| Surface              | 33 wouter files · 20 helmet files · 36 routes + 1 catch-all · 2 SSR-breaking root causes                                                      |
| `react-helmet-async` | **Delete, do not port.** React 19 hoists metadata natively — proven in this codebase when `data-rh` stopped appearing.                        |

### ✅ API details — RESOLVED by the Task 1 spike, with live evidence

Full output in `scratchpad/p2/api-unknowns-resolved.md`. Settled empirically against a real scratch app, not from docs.

**1. Splat param key — both work.** `src/routes/$.tsx` → `createFileRoute('/$')`. A live request to `/foo/bar/baz` returned `{"_splat":"foo/bar/baz","*":"foo/bar/baz"}` — both keys populated with the same value. Prefer `_splat`; it is the documented modern form.

**2. Express mount — no first-party adapter.** `@tanstack/react-start`'s `exports` map has **no** `./node` or `./express` subpath (verified against the installed package). `srvx` is currently only a **transitive** dependency via `@tanstack/start-plugin-core` / `start-server-core` / `nitro` — it works today through npm hoisting, which is fragile. **Add `srvx` as a direct pinned dependency in Task 2.**

`toFetchHandler(expressApp)` in `src/routes/api/$.ts` was proven working: a GET returned 200 with JSON, and — critically — **`express.raw()` bodies arrived as real Buffers with matching length**. Stripe and Resend webhook signature verification therefore survives the mount.

> ⚠️ **`toFetchHandler` is marked `@experimental` in srvx's own JSDoc.** It is load-bearing for the entire "keep Express whole" design. It works today; treat a breaking change in it as a real risk and pin `srvx` accordingly.

**3. Preset — `nitro({ preset })`, from a separate plugin.** It is a **sibling Vite plugin imported from `nitro/vite`**, not an option on Start's plugin — confirmed by reading `node_modules/nitro/dist/vite.d.mts`, and by the absence of any `preset` reference in `@tanstack/start-plugin-core`'s types.

Dual-host auto-detection **proven with real builds**: no preset + no env → `preset: node-server`; no preset + `VERCEL=1` → `preset: vercel` with `.vercel/output` emitted. One config genuinely targets both.

**4. `ssr: false` cascade — confirmed live.** A parent layout with `ssr: false` and a child route produced **no marker in the initial HTML**, while a sibling control route with normal SSR did. The design's central mechanism works as assumed.

### Still open, and honestly so

- Whether Nitro has a dedicated Render preset or Render simply runs the `node-server` fallback. Not checked — Phase 3's problem.
- No real deployment was performed; Vercel detection was proven by local env simulation only.
- RSC-mode export conditions were not exercised. This migration does not use RSC.

---

## 🔴 The design decision this plan makes: splitting `/`

`/` is currently auth-conditional — `HomePage()` renders `<Landing/>` when logged out and `<FirstRunGate component={Home}/>` when logged in, **at the same URL**. That cannot survive a per-route SSR flag: the landing must server-render, the dashboard must not.

Worse, the auth gates call `window.location.href = "/login"` **in the render body**, not an effect. Today that is masked because `useAuth()`'s query is always loading on first render. Under SSR with a resolving loader, it throws server-side.

**Decision: `/` becomes the public landing page only, server-rendered.** Authenticated users are redirected to `/dashboard` — a route that already exists and already renders `Home`.

The redirect happens **client-side, after hydration**, so the server never needs to know who the user is and the auth code stays untouched. A logged-in user hitting `/` sees the landing for a moment and then lands on the dashboard.

**This is a real, user-visible behaviour change** and the only one in this plan. The alternative — keeping `/` auth-conditional — forces either server-side auth (rewriting the code we deliberately protected) or giving up SSR on the highest-value page. Flag it to the user before Task 4 if they have not already agreed.

---

## File Structure

```
src/routes/
  __root.tsx              providers: QueryClient, Theme, Tooltip, Toaster, ErrorBoundary
  index.tsx               landing — SSR
  privacy.tsx             SSR
  glossary.tsx            SSR
  login.tsx  register.tsx  forgot-password.tsx  reset-password.tsx  verify-email.tsx
  _app.tsx                layout: ssr:false + AppShell + auth guard  ← the cascade point
  _app/
    dashboard.tsx  monitor.tsx  diagnose.tsx  act.tsx  setup.tsx  report.tsx
    content.tsx  content.$articleId.tsx  articles.tsx  brands.tsx
    keyword-research.tsx  settings.tsx  welcome.tsx
    admin/scrape.tsx  admin/scrape.$runId.tsx
  (redirects)             the 12 retired paths
  $.tsx                   catch-all 404
  api/$.ts                server route → Express
```

`client/src/{components,hooks,lib,tours}` move across unchanged. `server/` is untouched.

---

### Task 1: Close the three API unknowns

**Files:** none — this is a spike.

- [ ] **Step 1: Install into a scratch directory, not the repo**

Create a throwaway TanStack Start app outside this worktree and inspect the real generated code and types. Do **not** install into the repo yet.

- [ ] **Step 2: Answer each unknown with evidence**

1. **Splat param key.** Create a splat route, log the params, record whether the key is `_splat` or `*`.
2. **Express adapter.** Determine whether `@tanstack/react-start` re-exports a Node/Express adapter or whether `srvx` must be a direct dependency. Check the package's exports map, not just the docs.
3. **Preset nesting.** Read the Nitro plugin's TypeScript types to settle whether it is `nitro({ preset })` or nested under `server`.

- [ ] **Step 3: Report**

Write the three answers with evidence to `scratchpad/p2/api-unknowns-resolved.md`. If any cannot be settled, say so plainly — an honest unknown is better than a guess that fails in Task 3.

---

### Task 2: Scaffold Start alongside the existing app

**Files:** Create `src/routes/__root.tsx`, `src/router.tsx`; Modify `vite.config.ts`, `package.json`

**Interfaces:** Produces a booting Start dev server with one trivial route. The existing app must still work.

- [ ] **Step 1: Install**

```bash
npm install @tanstack/react-start@1.168.32 @tanstack/react-router@1.170.18
npm install -D @tanstack/router-plugin@1.168.23
```

- [ ] **Step 2: Wire the Vite plugin**

Add the Start/Nitro plugin to `vite.config.ts`, composing with the existing `@vitejs/plugin-react` and `@tailwindcss/vite`. **Keep `css: { postcss: {} }`** — this worktree is nested inside the main checkout and Vite's config search walks up into the parent repo's stale PostCSS config without it.

- [ ] **Step 3: Root route with the existing providers**

`__root.tsx` mounts what `App.tsx` currently mounts: `QueryClientProvider`, `ThemeProvider`, `TooltipProvider`, `Toaster`, `ErrorBoundary`. **Drop `HelmetProvider`** — React 19 hoists metadata natively.

- [ ] **Step 4: Verify it boots** with one trivial route, then run the full gate. The existing app must be unaffected.

---

### Task 3: Mount Express

**Files:** Create `src/routes/api/$.ts`

- [ ] **Step 1: Wire the adapter** using whatever Task 1 established, forwarding `/api/*`, `/webhooks/*` and `/health` into the existing Express app from `server/app.ts`. Change nothing in `server/`.

- [ ] **Step 2: Verify the API answers**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/brands
```

Expect `401` unauthenticated — proving Express is reached and its auth middleware ran, not a 404 from the router.

- [ ] **Step 3: Verify raw-body webhooks specifically.** `server/app.ts:143-241` mounts Stripe and Resend webhooks with `express.raw()` before `express.json()` and checks `Buffer.isBuffer(req.body)`. An adapter that pre-parses the body silently breaks signature verification — and **no test covers this**. Confirm by hand that a POST with a raw body arrives as a Buffer.

- [ ] **Step 4: Full gate.**

---

### Task 4: Public routes, server-rendered

**Files:** Create `src/routes/index.tsx`, `privacy.tsx`, `glossary.tsx`

This is the task the whole migration exists for.

- [ ] **Step 1: Confirm the `/` split with the user** (see the decision section above) before writing code.

- [ ] **Step 2: Port the three pages**, moving components across unchanged. Set titles and meta with plain React 19 elements; do not reintroduce Helmet.

- [ ] **Step 3: Add the client-side redirect** for authenticated users on `/` → `/dashboard`, in an effect, after hydration.

- [ ] **Step 4: Prove SSR actually happens**

```bash
curl -s http://localhost:5000/privacy | grep -c "This Privacy Policy describes how VentureCite"
```

Expect `1`. Today it is `0` — that string only appears after JavaScript runs. **This single check is the migration's reason for existing.** Repeat for `/` and `/glossary` using the strings named in `tests/e2e/raw-html.spec.ts`.

- [ ] **Step 5: Full gate.** `raw-html.spec.ts` will now FAIL — that is correct and expected; Task 11 flips it. Note the failure and proceed.

---

### Task 5: Auth pages

**Files:** Create `src/routes/login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`

- [ ] Port each, preserving `data-testid` attributes exactly — the e2e suite selects on them.
- [ ] `login.tsx` must still land on `/` after success (`login.tsx:62`), or the whole suite's auth helper breaks.
- [ ] Preserve `<meta name="robots" content="noindex">` on all five.
- [ ] Full gate.

---

### Task 6: The `_app` layout and every gated route

**Files:** Create `src/routes/_app.tsx` and its children

- [ ] **Step 1: `_app.tsx` carries `ssr: false`.** This is the cascade point — every route beneath inherits client-only rendering. Get this right and the SSR hazards in `use-persisted-state.ts` and the auth gates become irrelevant.

- [ ] **Step 2: Move the auth guard out of the render body.** The current gates call `window.location.href = "/login"` during render. Convert to a router `beforeLoad` redirect or an effect. Even under `ssr: false` this is worth fixing — a side effect during render is a React correctness problem, not only an SSR one.

- [ ] **Step 3: Port the routes** — dashboard, the five spine pages, content, articles, brands, keyword-research, settings, welcome, admin. `welcome` renders **without** `AppShell`; preserve that (`welcome-brand.spec.ts` asserts `main#main-content` has count 0 there).

- [ ] **Step 4: Preserve the URL-as-state contract.** `?tab=`, `?brandId=`, `?edit=`, `?mention=` and the mention filters are all written with `replace: true`. TanStack Router's typed search params are an upgrade here, but the _behaviour_ must match — `url-state.spec.ts` asserts a single `goBack()` skips past three tab changes.

- [ ] **Step 5: Full gate.**

---

### Task 7: The 12 legacy redirects

**Files:** Create the retired-path routes

- [ ] Port all 12, preserving existing query params and injecting `?tab=`. `legacy-redirects.spec.ts` covers every one.
- [ ] **`/ai-intelligence` currently redirects to a tab that does not exist** (`share-of-answer` was removed from `monitor.tsx`), so `SpineShell` silently falls back to `overview`. The spec asserts the real fallback. Either preserve that behaviour or repoint the redirect and update the spec — but decide deliberately and say which.
- [ ] Full gate.

---

### Task 8: Delete wouter

**Files:** 33 files

- [ ] Remove every `wouter` import and the package. The router migration is done by now; this is the sweep that proves it.
- [ ] **Keep the deliberate full-page navigations.** `pricing.tsx`'s Stripe redirect and the free-tier bounce use `window.location.href` on purpose and must NOT become router links.
- [ ] **Fix the external-URL bug while here:** `ai-visibility.tsx` passes external `https://` and `mailto:` URLs into the client router's `<Link>`. Use a plain `<a>`.
- [ ] Full gate.

---

### Task 9: Delete react-helmet-async

**Files:** 20 files + `client/src/lib/dedupeStaticMeta.ts` + `client/index.html`

- [ ] Remove the package and every import. Verified: every usage is plain `<title>` / `<meta name="robots|description">`, all of which React 19 hoists natively.
- [ ] **`dedupeStaticMeta.ts` can go too** — it exists only because Helmet _appended_ rather than replaced. Verify that React 19 alone produces exactly one description per page before deleting, then remove the `data-static-fallback` marker from `index.html`.
- [ ] `public-pages.spec.ts` and `auth-signup.spec.ts` assert on exact meta content, not `data-rh`, so they should pass unchanged. If they do not, the metadata genuinely regressed.
- [ ] Full gate.

---

### Task 10: Delete the Express SPA fallback

**Files:** `server/vite.ts`

- [ ] Remove `setupVite`'s SPA fallback, `KNOWN_ROUTES`, and `isKnownRoute`. Start owns routing now and knows its own routes — the hand-maintained allowlist that drifted in both directions stops existing.
- [ ] For the record: it currently has **9** phantom entries (`/pricing`, `/article/:id`, `/geo-rankings`, `/revenue-analytics`, `/publications`, `/agent`, `/outreach`, `/ai-traffic`, `/analytics-integrations`) and 0 gaps. An earlier commit message said eight; nine is correct.
- [ ] **Verify status codes still behave**: real routes 200, unknown paths 404. `raw-html.spec.ts` and `public-pages.spec.ts` both assert this.
- [ ] Decide `pricing.tsx`'s fate — a fully-built page routed nowhere. Either wire it up or delete it; `billing.spec.ts` currently pins its 404.
- [ ] Full gate.

---

### Task 11: Flip the SSR assertions

**Files:** `tests/e2e/raw-html.spec.ts`

This is the task that proves the migration worked.

- [ ] The spec currently asserts page-specific content is **absent** from raw HTML, with a header explaining that those assertions must invert once SSR lands. Invert them: assert the content is now **present**.
- [ ] **Falsification required.** Temporarily break SSR for one route (or assert content that genuinely is not rendered) and confirm the test fails. A flipped assertion that cannot fail proves nothing.
- [ ] Update the file header to describe post-migration reality.
- [ ] Full gate — now expecting **67 passed** again, with raw-html green in its new direction.

---

### Task 12: Record the baseline

**Files:** Create `docs/superpowers/plans/phase2-baseline.md`

- [ ] Record the final gate, the routes migrated, the `/` split and its user-visible consequence, what was deleted (wouter, react-helmet-async, the SPA fallback, `KNOWN_ROUTES`), anything left unresolved, and the deployment state going into Phase 3.

---

## Exit criteria

- [ ] `curl` on `/`, `/privacy`, `/glossary` returns page content in the raw HTML.
- [ ] Every gated route is client-only via the `_app` cascade; auth code unchanged.
- [ ] Express serves `/api/*`, `/webhooks/*`, `/health` — webhook raw bodies verified by hand.
- [ ] wouter, react-helmet-async, `KNOWN_ROUTES` and the SPA fallback are gone.
- [ ] All four gate commands green, e2e at 67 with raw-html flipped and falsification-tested.
- [ ] Baseline recorded.
