# Phase 1 — Dependency Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every dependency to its latest safe version, on the existing Vite + wouter stack, so the TanStack Start migration in Phase 2 starts from a modern baseline and does not have to debug framework problems and dependency problems simultaneously.

**Architecture:** One upgrade group per task, ordered lowest-risk first. Each task ends with the full verification gate green before the next begins. Groups that the dependency audit found must move together (Tailwind + tailwind-merge, Zod + drizzle-zod) are single tasks. TypeScript ships alone.

**Tech Stack:** Vite, React, Express, Drizzle, Zod, Tailwind, Playwright, Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-25-tanstack-start-migration-design.md` §7 and §7.1.
- Phase 0 baseline: `docs/superpowers/plans/phase0-baseline.md`.
- 🚫 **RUN NO GIT COMMANDS.** No `add`, `commit`, `push`, `checkout`, `reset`, `stash`. The user commits manually. Each task ends by reporting a suggested commit message, never by running one.
- 🔴 **ESLint stays at 9.x.** `eslint-plugin-react` has no ESLint-10-compatible release; ESLint 10 removed `context.getFilename()`, which its `react/display-name` rule calls, and this repo spreads `react.configs.recommended.rules` across every `client/**/*.tsx`. Upgrading would crash `npm run lint` and the husky pre-commit hook. Verified against the npm registry: `eslint-plugin-react@latest` peers cap at `eslint ^9.7`.
- 🔴 **TypeScript goes to 6.0.3, NOT 7.** TypeScript 7 ships no compiler API and `typescript-eslint` hard-caps at `typescript <6.1.0`. 6.0.3 is the highest version that keeps type-aware linting working.
- **The verification gate after every task** is all four of:
  - `npm run check` — clean
  - `npm run lint` — **0 errors**. Roughly 829 warnings are expected and non-blocking: the config deliberately grades `no-explicit-any`, `no-unescaped-entities`, `prefer-const` and others as warnings ("Track as warnings; don't gate CI"). Watch the error count, not the total.
  - `npm test` — 148 unit/integration files passing
  - `npm run test:e2e` — **61 passed / 2 skipped / 0 failed**
- The e2e suite performs 2 real logins per run against a limit of 10 per (IP, email) per 15 minutes. Roughly five runs fit in a window. Exceeding it appears as `TimeoutError: page.waitForURL`, not a visible 429 — do not misdiagnose that as a regression.
- **If a test goes red, fix the code, not the test.** The only legitimate reason to change an assertion is a behaviour change that is intentional and reported. Two assertions are expected to need updating and are called out explicitly in Tasks 4 and 8.
- Never print secrets. `.env` is gitignored and must stay that way.

---

## Prerequisite already applied

`eslint.config.js` had two gaps that made `npm run lint` report **2218 errors**, which would have rendered the gate above meaningless:

- `.claude/**` was absent from the ignore list, even though its siblings `.agents/**` and `.codex/**` are there under a comment reading "Local vendored tool/skill caches — not project source, never lint". The directory filled with plugin files and produced 2120 `no-undef` errors.
- Test globals were declared for `tests/**/*.ts` and `**/*.test.ts` only, so `tests/unit/*.test.tsx` and `tests/component/*.test.tsx` received neither Node nor browser globals.

Both are now fixed, taking lint to **0 errors**. Neither was caused by any dependency change; they were latent.

## Pre-existing state this plan assumes

Ten packages were already removed as dead code before this phase, which deleted several upgrades from the original audit:

`@stripe/stripe-js`, `@stripe/react-stripe-js`, `zod-validation-error`, `react-day-picker`, `next-themes`, `embla-carousel-react`, `vaul`, `input-otp`, `react-resizable-panels`, and the `calendar.tsx` / `chart.tsx` / `draftStore.ts` / `carousel.tsx` / `drawer.tsx` / `input-otp.tsx` / `resizable.tsx` components.

**Consequence:** the audit's mandatory `react-day-picker` + `date-fns` lockstep no longer applies — `react-day-picker` is gone, so `date-fns` upgrades independently and is near-drop-in.

**Optional pre-step, not scheduled here.** Eight more `components/ui/*` files have zero consumers and each orphans one Radix package: `aspect-ratio`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `radio-group`, `slider`, `toggle-group`. Radix upgrades are low-risk, so removing them buys little; do it only if you want a smaller surface. Four more (`breadcrumb`, `pagination`, `sidebar`, `table`) are unused but orphan nothing.

---

## File Structure

| File                                                                                | Responsibility                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `package.json` / `package-lock.json`                                                | Every task modifies these                                     |
| `server/vite.ts`                                                                    | Task 6 — two `app.use("*")` wildcards invalid under Express 5 |
| `server/routes/*.ts`                                                                | Task 7 — 13 `ZodError.errors` sites                           |
| `tailwind.config.ts`, `postcss.config.js`, `client/src/index.css`, `vite.config.ts` | Task 8 — Tailwind 4 config model                              |
| `client/src/components/intelligence/TrendsTab.tsx`                                  | Task 3 — `connectNulls` semantics                             |
| `tests/e2e/billing.spec.ts`                                                         | Task 9 — only if Stripe changes the error shape               |
| `tsconfig.json`                                                                     | Task 10 — explicit `target`, verify `baseUrl`                 |

---

### Task 1: Low-risk batch

**Files:**

- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: nothing.
- Produces: a clean starting point; later tasks assume these are current.

These five were graded LOW or LOW-MEDIUM by the audit with no code changes anticipated. Batched because individually verifying each would cost five full gate runs for no information.

- [ ] **Step 1: Upgrade**

```bash
npm install drizzle-kit@0.31.10 framer-motion@12.42.2 shepherd.js@15.2.2 date-fns@4.4.0 @sentry/vite-plugin@5.4.0
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: clean. `date-fns` v4 is ESM-first and this repo is already `"type": "module"`; the nine consuming files use only root-entry `format()` / `formatDistanceToNow()`, which are untouched by v3→v4.

- [ ] **Step 3: Check the one real risk — shepherd.js Node engine**

Run: `node --version`
Expected: ≥ 19. shepherd.js 15 dropped Node 18. If your Node is older, stop and report — the rest of the plan assumes `^20.19.0 || >=22.12.0`.

- [ ] **Step 4: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e **61 passed / 2 skipped / 0 failed**.

- [ ] **Step 5: Visually smoke-test the tour engine**

shepherd.js 15 rewrote its internals from Svelte to vanilla TypeScript. The changelog shows no class renames, but `client/src/tours/engine/tour-engine.css` targets Shepherd's DOM classes and that stability is not guaranteed by the changelog alone.

Start the app, log in, and trigger a tour via the `?` help button on `/monitor?tab=citations`. Confirm the tour renders styled, not unstyled. Report what you saw.

- [ ] **Step 6: Report, do not commit**

Suggested message: `chore(deps): upgrade drizzle-kit, framer-motion, shepherd.js, date-fns, sentry vite plugin`

---

### Task 1b: lucide-react 1.x

**Files:**

- Modify: `package.json`, `package-lock.json`
- Possibly modify: any of the 109 files importing icons

**Interfaces:**

- Consumes: Task 1.
- Produces: nothing later tasks depend on.

Its own task because **109 files** import from `lucide-react` and this is a 0.x → 1.x jump. Two changes matter: brand/trademarked icons were removed entirely, and `aria-hidden="true"` is now the default on every icon.

The audit inventoried all **78 distinct icons** in use and confirmed **none** is a brand icon, so the removals do not affect you. Icon renames ship with backwards-compatible aliases, and because these are named ESM exports, any genuine removal surfaces as a build error — not a silent blank icon.

- [ ] **Step 1: Upgrade**

```bash
npm install lucide-react@1.26.0
```

- [ ] **Step 2: Typecheck — this is the real detector**

Run: `npm run check`

Expected: clean. A missing icon export fails here loudly. If one does, look up its current name in the lucide docs and rename the import — do not substitute a different icon without saying so.

- [ ] **Step 3: Assess the accessibility default change**

`aria-hidden="true"` is now applied to all icons by default. That is correct for the overwhelming majority — decorative icons beside a text label should be hidden from screen readers.

It is **wrong** for icon-only interactive controls, which would become unlabelled. Find them:

```bash
grep -rn "size=\"icon\"" client/src --include=*.tsx | head -30
```

For each hit, confirm the control has an accessible name from something other than the icon — an `aria-label`, `sr-only` text, or a tooltip that sets one. Where it does not, add an `aria-label` to the **button**; do not set `aria-hidden={false}` on the icon, which produces a worse result for screen readers.

Report how many icon-only controls you checked and how many needed a label.

- [ ] **Step 4: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 5: Report, do not commit**

Suggested message: `chore(deps): upgrade lucide-react to 1.x`

---

### Task 2: React 19

**Files:**

- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: Task 1.
- Produces: React 19 runtime — Tasks 3 and 5 depend on it.

Graded LOW by the audit. An exhaustive scan of all 272 client files found **zero** uses of anything React 19 removed: no `propTypes`, no `defaultProps` on function components, no legacy context, no string refs, no `ReactDOM.render`, no `react-test-renderer`, and no zero-argument `useRef()`. `main.tsx` already uses `createRoot`. Every remaining third-party package declares React 19 peer support.

- [ ] **Step 1: Upgrade**

```bash
npm install react@19.2.8 react-dom@19.2.8 && npm install -D @types/react@^19 @types/react-dom@^19
```

- [ ] **Step 2: Typecheck — expect this to surface type-only changes**

Run: `npm run check`

React 19's types changed in three ways that can surface here: `ReactElement["props"]` is `unknown` rather than `any`, ref callbacks may no longer implicitly return a value, and the global `JSX` namespace moved to `React.JSX`. If errors appear, fix them at the type level — do not add `any` or `@ts-ignore`.

`forwardRef` is used in 40 shadcn files. It is **not** removed in React 19, only superseded. Leave those alone.

- [ ] **Step 3: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 4: Report, do not commit**

Suggested message: `chore(deps): upgrade to React 19`

---

### Task 3: Recharts 3

**Files:**

- Modify: `package.json`, `package-lock.json`
- Possibly modify: `client/src/components/intelligence/TrendsTab.tsx`

**Interfaces:**

- Consumes: Task 2.
- Produces: nothing later tasks depend on.

Correcting a common misconception: recharts 3 does **not** require React 19 — it peers `^16.8 || ^17 || ^18 || ^19`. It is sequenced here because charts are worth verifying right after a React major, not because it is forced.

Three files import recharts: `monitor-overview.tsx`, `citations/HistoryTab.tsx`, `intelligence/TrendsTab.tsx`. The shadcn `chart.tsx` wrapper that used to complicate this was deleted as dead code.

- [ ] **Step 1: Upgrade**

```bash
npm install recharts@3.10.0
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`

Expect possible errors from the `TooltipProps` → `TooltipContentProps` rename and from `label` widening to `string | number | undefined`. `HistoryTab.tsx` and `monitor-overview.tsx` both use custom tooltip render functions, so they are the likely sites.

- [ ] **Step 3: Resolve the one genuine judgement call**

`client/src/components/intelligence/TrendsTab.tsx:209` sets `connectNulls` on a `<Line>`, and its data legitimately contains `hallucinations: number | null` (nulls inserted around line 112).

Recharts' 3.0 migration guide states that `connectNulls={true}` now treats `null` as `0` — but states it for `<Area>`, not `<Line>`. **Verify empirically rather than assume:** run the app, open the Trends tab, and compare the hallucinations line against the pre-upgrade behaviour. A null rendered as a dip to zero is a data-integrity misstatement, not a cosmetic change.

If it does treat nulls as zero, filter the nulls out of the series rather than setting `connectNulls={false}` — a gap is honest, a zero is not. Report which you found and what you did.

- [ ] **Step 4: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 5: Report, do not commit**

Suggested message: `chore(deps): upgrade recharts to 3.x`

---

### Task 4: Sentry 10

**Files:**

- Modify: `package.json`, `package-lock.json`, `server/instrument.ts`, `client/src/lib/sentry.ts` (if needed)

**Interfaces:**

- Consumes: Task 2.
- Produces: nothing later tasks depend on.

Two majors (8 → 9 → 10). The audit confirmed everything actually in use is stable across the jump, but explicitly flagged two blind spots you must close.

- [ ] **Step 1: Close the audit's blind spots first**

Before upgrading, grep and record:

```bash
grep -rn "Sentry\." server/ --include=*.ts
```

```bash
grep -rn "from \"@sentry/react\"" client/src --include=*.tsx --include=*.ts
```

The audit only inspected `server/instrument.ts`, `server/lib/sentryReport.ts` and `client/src/lib/sentry.ts`. Specifically look for `Sentry.setupExpressErrorHandler` or a Sentry `<ErrorBoundary>` from `@sentry/react`, whose `componentStack` type tightened in v9. Report what you find before changing anything.

- [ ] **Step 2: Upgrade**

```bash
npm install @sentry/node@10.68.0 @sentry/react@10.68.0
```

Note: `@sentry/vite-plugin` is versioned independently and has no v6 — it was already moved to 5.4.0 in Task 1. Do not bump it further.

- [ ] **Step 3: Check the removed init options**

`enableTracing` and `autoSessionTracking` were removed, and `getCurrentHub()` / `Hub` are gone. `server/instrument.ts:17` already sets `sendDefaultPii: false` explicitly, which matches the safer v9+ default, and line 19 uses an `integrations: (defaults) => defaults` passthrough — both fine.

Run: `npm run check`
Expected: clean, or errors only at the sites you found in Step 1.

- [ ] **Step 4: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 5: Verify errors still actually reach Sentry**

A silently broken error reporter is worse than none, and the gate cannot detect it. Trigger a real error — request `/api/stripe/checkout` with an unknown `priceId`, which is a known 500 — and confirm it appears in your Sentry project.

This matters more than usual right now: the recent error-sanitisation work made Sentry the **only** place the detail exists. Report whether the event arrived.

- [ ] **Step 6: Report, do not commit**

Suggested message: `chore(deps): upgrade Sentry SDKs to 10.x`

---

### Task 5: Vite 8

**Files:**

- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: Task 2.
- Produces: build toolchain that Task 8 depends on.

Vite 8 swaps the bundler from esbuild/Rollup to Rolldown/Oxc. The config surface here is genuinely clean — no `rollupOptions`, no `optimizeDeps.esbuildOptions`, no custom `resolve.mainFields`, no `import.meta.hot.accept(url)` anywhere. The risk is not config, it is that a different bundler produces different output.

- [ ] **Step 1: Upgrade**

```bash
npm install -D vite@8.1.5
```

`@vitejs/plugin-react` is pinned `^5.0.4`; version 5.2.0 adds Vite 8 support and is already inside that range, so the lockfile refresh resolves it with no `package.json` edit. **Do not** jump to plugin-react 6.x — it requires new peers and opts you into the React Compiler, which is out of scope.

- [ ] **Step 2: Build and compare output**

```bash
npm run build
```

Expected: succeeds. Then inspect `dist/public/` — confirm assets are present and the bundle sizes are in the same order of magnitude as before. A different bundler can legitimately change chunking; a 10x size change is a red flag worth reporting.

- [ ] **Step 3: Verify Sentry sourcemap upload still fires**

`@sentry/vite-plugin` only uploads when `NODE_ENV=production` and `SENTRY_AUTH_TOKEN` is set (`vite.config.ts:12-22`), and `build.sourcemap` is `"hidden"` in prod. The plugin's hook shapes were not verified against Vite 8's plugin API. Confirm the build emits `.map` files and that the plugin does not error. Report what you observed.

- [ ] **Step 4: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 5: Report, do not commit**

Suggested message: `chore(deps): upgrade Vite to 8.x`

---

### Task 6: Express 5

**Files:**

- Modify: `package.json`, `package-lock.json`, `server/vite.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces: nothing later tasks depend on.

The audit found only **two** certain breaks, both mechanical. The change that sounds scariest — the query-parser default flipping from `extended` to `simple` — is a complete no-op here: all ~30 `req.query` reads are flat scalars, exhaustively verified.

- [ ] **Step 1: Upgrade, including the types**

`@types/express` is pinned to an exact `4.17.21` with no caret, so it will not move on its own. This is mandatory, not optional.

```bash
npm install express@5.2.1 && npm install -D @types/express@5.0.6
```

- [ ] **Step 2: Fix the two bare wildcards**

`server/vite.ts:79` and `server/vite.ts:113` both call `app.use("*", ...)`. Under path-to-regexp v8, a bare `*` is invalid and throws at route-registration time.

Both are terminal catch-alls, so drop the path argument entirely:

```ts
// before
app.use("*", (req, res) => {
  /* ... */
});

// after
app.use((req, res) => {
  /* ... */
});
```

Scope note: these run only under `npm run dev` and `npm start`. Vercel bypasses them via `vercel.json`'s SPA rewrite, so production traffic is unaffected — but local dev breaks hard without the fix.

- [ ] **Step 3: Confirm nothing else uses removed routing syntax**

```bash
grep -rn 'app\.\(get\|post\|put\|patch\|delete\|use\)("\([^"]*[*:?][^"]*\)"' server/ --include=*.ts
```

Expected: no bare `*`, no optional `:param?`, no regex-string routes. `server/routes.ts:121`'s `app.param("brandId", handler)` uses the still-supported 2-argument form and is fine.

- [ ] **Step 4: Full gate plus a webhook smoke test**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Then verify the two raw-body webhook mounts still work. `server/app.ts:143-167` (Stripe) and `:169-240` (Resend) both use `express.raw()` ahead of the `express.json()` mount and check `Buffer.isBuffer(req.body)`. These are payment-adjacent, so confirm by hand rather than trusting the gate — the e2e suite does not exercise webhooks.

- [ ] **Step 5: Note a behaviour improvement, do not "fix" it**

Express 5 auto-forwards promise rejections to error middleware. `server/routes/mentions.ts` has 13 async handlers registered without `asyncHandler`; under Express 5 these now return clean error responses instead of hanging. That is an improvement — do not mistake the changed behaviour for a regression.

- [ ] **Step 6: Report, do not commit**

Suggested message: `chore(deps): upgrade Express to 5.x`

---

### Task 7: Zod 4 and drizzle-zod

**Files:**

- Modify: `package.json`, `package-lock.json`
- Modify: `server/routes/assistant.ts`, `brands.ts`, `factSheet.ts`, `factSheetV2.ts`, `userAccount.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces: nothing later tasks depend on.

🔴 **These two must move in the same commit.** `drizzle-zod` is only genuinely Zod-4-compatible at **0.8.3+**, and its current 0.7.x declares an unbounded `zod >=3.0.0` peer — so npm will **not** stop a broken install. `shared/schema.ts` calls `createInsertSchema()` 45 times; getting this wrong breaks validation across the app silently.

- [ ] **Step 1: Upgrade both together**

```bash
npm install zod@4.4.3 drizzle-zod@0.8.3
```

- [ ] **Step 2: Fix the 13 `.errors` sites**

`ZodError.errors` was **removed** in v4 — not deprecated, gone. Accessing it yields `undefined` and throws on any malformed request. Replace with `.issues` at exactly these sites:

- `server/routes/assistant.ts:185`
- `server/routes/brands.ts:366`, `:420`
- `server/routes/factSheet.ts:52`, `:380`, `:468`, `:514`, `:558`, `:599`
- `server/routes/factSheetV2.ts:153`, `:269`, `:335`, `:410`, `:512`, `:615`, `:657`
- `server/routes/userAccount.ts:327`, `:394`

Already correct, do not touch: `server/env.ts:97`, `server/lib/agentTaskExecutor.ts:54`, `server/routes/intelligence.ts:368`, `server/routes/mentions.ts:195`, `:304`, `:346`.

Then confirm none remain:

```bash
grep -rn "\.errors" server/ --include=*.ts | grep -i "zod\|parsed\|result\|validation"
```

- [ ] **Step 3: Typecheck all 45 schema builders**

Run: `npm run check`

`shared/schema.ts`'s `createInsertSchema()` calls are the highest-risk surface — drizzle's own issue tracker flags coerced and enum fields specifically. Errors here are the reason this task exists; fix them properly rather than casting.

- [ ] **Step 4: Regression-test the JSON-schema generation path**

`shared/factAgent/schema.ts`'s `buildFactsJsonSchema()` feeds OpenAI's structured-output mode. It was not a documented v4 breaking change but it is load-bearing and a malformed schema fails at runtime, not compile time.

```bash
npm test -- factSheet
```

Expected: passing. Also confirm the generated schema still has the expected shape.

- [ ] **Step 5: Leave the deprecated-but-working forms alone**

`.strict()` at `server/routes/intelligence.ts:356`, `.passthrough()` at `server/lib/agentTaskSchemas.ts:10`, and `z.string().url()` / `.email()` in `server/env.ts` and `shared/factAgent/schema.ts` are all deprecated in v4 but still functional. Migrating them is churn with no benefit in this task — leave them.

- [ ] **Step 6: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 7: Report, do not commit**

Suggested message: `chore(deps): upgrade Zod to 4.x and drizzle-zod to 0.8.x`

---

### Task 8: Tailwind 4

**Files:**

- Modify: `package.json`, `package-lock.json`, `client/src/index.css`, `vite.config.ts`
- Delete: `postcss.config.js`
- Possibly modify: `tailwind.config.ts`, ~41 component files

**Interfaces:**

- Consumes: Task 5 (Vite 8).
- Produces: nothing later tasks depend on.

🔴 **`tailwindcss` and `tailwind-merge` must move in the same commit** — tailwind-merge v3 assumes v4 class syntax project-wide via the shared `cn()` helper.

**Good news the audit established:** your OKLCH design-token system **survives without restructuring**. In `@config` compatibility mode the exclusion list (`corePlugins`, `safelist`, `separator`) does not touch `theme.extend.colors`, `darkMode`, `content` or `plugins` — all of which `tailwind.config.ts` uses. The hand-written `oklch(...)` values in `index.css` were never part of Tailwind's generated palette.

- [ ] **Step 1: Run the official codemod first**

```bash
npx @tailwindcss/upgrade
```

This automates the `@tailwind` → `@import` swap and the `outline-none` → `outline-hidden` rename across **64 occurrences in 41 files**. Review its diff before proceeding — do not accept it blindly.

- [ ] **Step 2: Upgrade the packages together**

```bash
npm install tailwindcss@4.3.3 tailwind-merge@3.6.0 && npm install -D @tailwindcss/typography@0.5.20 @tailwindcss/vite@4.3.3
```

`@tailwindcss/typography` only needs a minor bump — stable v4 support landed in 0.5.20, not a major.

- [ ] **Step 3: Switch from PostCSS to the Vite plugin**

`@tailwindcss/vite` is already a dependency but has never been registered — `vite.config.ts`'s plugins array does not import it. It is currently inert. For a pure-Vite SPA this is the cleaner path than `@tailwindcss/postcss`.

Add it to `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react({
      /* existing babel config unchanged */
    }),
    tailwindcss(),
    ...(sentryPlugin ? [sentryPlugin] : []),
  ],
  // ...rest unchanged
});
```

Then delete `postcss.config.js` — `tailwindcss` is no longer a PostCSS plugin in v4.

- [ ] **Step 4: Verify the token system survived**

```bash
npm run build
```

Then run the app and confirm in the browser that CSS custom properties resolve: `getComputedStyle(document.documentElement).getPropertyValue('--brand-accent')` should return an `oklch(...)` value, not empty. Check both light and dark themes.

This is the single highest-value check in the task — if the tokens broke, everything looks subtly wrong rather than obviously broken.

- [ ] **Step 5: Visual QA the two changed utility defaults**

Two changes need eyes, not a typecheck:

- **`space-x` / `space-y` / `divide`** changed selector from `:not([hidden]) ~ :not([hidden])` to `:not(:last-child)` — **330 occurrences across 85 files**. Functionally equivalent in the common case, but diverges when a middle child is conditionally hidden. This codebase renders conditionally a lot. Walk the main dashboard pages and look for spacing that has collapsed or doubled.
- **`ring` and `border` default colours changed.** A naive grep found only 3 literal `ring` classNames, but usages inside `cva()` and `cn()` template strings were not captured. Check focus rings on inputs and buttons specifically.

- [ ] **Step 6: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0. Note the e2e suite asserts behaviour, not appearance — it will **not** catch a visual regression, which is why Step 5 exists.

- [ ] **Step 7: Report, do not commit**

Suggested message: `chore(deps): upgrade Tailwind to 4.x and tailwind-merge to 3.x`

---

### Task 9: Stripe 22

**Files:**

- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: Task 1.
- Produces: nothing later tasks depend on.

Graded LOW by the audit, for one decisive reason: `server/stripeClient.ts:18-22` **pins the outgoing Stripe API version** (`2026-02-25.clover`, overridable via `STRIPE_API_VERSION`). The REST wire format therefore does not move with the SDK, which neutralises the entire "API object shape changed" risk category.

🔴 **The single most important rule for this task: do not touch that pin.** Removing or changing it reintroduces every risk this task otherwise avoids.

The two browser packages `@stripe/stripe-js` and `@stripe/react-stripe-js` were already removed as dead code — checkout is server-driven via a hosted Checkout Session and Elements is never used.

- [ ] **Step 1: Upgrade**

```bash
npm install stripe@22.3.2
```

- [ ] **Step 2: Confirm the pin is intact**

```bash
grep -n "STRIPE_API_VERSION\|apiVersion" server/stripeClient.ts
```

Expected: the `apiVersion` is still passed to the `Stripe` constructor and still defaults to the pinned version. If the upgrade or an editor touched it, restore it.

- [ ] **Step 3: Typecheck**

Run: `npm run check`

The v21/v22 breaking changes — `Stripe` becoming a true ES6 class, callback-style removal, positional-argument changes, CJS destructured require, the `types/` directory removal — are all already satisfied by existing code style. `server/stripeClient.ts:22` and `scripts/setup-stripe-products.ts:3` both use `new Stripe(...)` and `import Stripe from "stripe"`.

- [ ] **Step 4: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

`tests/e2e/billing.spec.ts` asserts the checkout endpoint returns 500 with the generic message `"Failed to create checkout session"` and **no** SQL in the body. That behaviour is unrelated to the SDK version, so it should pass unchanged. If it does not, report the actual response before changing anything — the billing bugs are deliberately unfixed and must stay that way.

- [ ] **Step 5: Report, do not commit**

Suggested message: `chore(deps): upgrade Stripe SDK to 22.x`

---

### Task 10: TypeScript 6.0.3

**Files:**

- Modify: `package.json`, `package-lock.json`, `tsconfig.json`

**Interfaces:**

- Consumes: all prior tasks.
- Produces: nothing.

🔴 **Ships alone.** TypeScript majors interact with every other package's types; bundling this with anything else makes a failure impossible to attribute.

**6.0.3, not 7.** Verified against the npm registry: `6.0.2` and `6.0.3` are real stable releases, and `typescript-eslint` peers `typescript >=4.8.4 <6.1.0` — so 6.0.3 is the **highest** version that keeps type-aware linting working. TypeScript 7 ships no compiler API and the typescript-eslint issue to support it was closed _not planned_.

- [ ] **Step 1: Upgrade**

```bash
npm install -D typescript@6.0.3
```

- [ ] **Step 2: Set an explicit compile target**

`tsconfig.json` currently sets no `target`, relying on an implicit default. Relying on an implicit default across a compiler major is asking for a surprise. Add it explicitly:

```json
"target": "ES2022",
```

- [ ] **Step 3: Verify the path aliases still resolve**

An intermediate source claimed `baseUrl` is removed in TypeScript 6/7. This was **not** confirmed against primary documentation and is flagged low-confidence — but `tsconfig.json:16`'s `baseUrl` underpins the `@/*` and `@shared/*` aliases used throughout `client/src`, so verify rather than assume.

Run: `npm run check`

If alias resolution breaks, migrate to `paths` without `baseUrl` (supported since TS 4.x) rather than removing the aliases. Note that Vite resolves aliases independently via `vite.config.ts:37-42`, so a build can succeed while the typecheck fails — do not let that mask the problem.

- [ ] **Step 4: Confirm the linting toolchain still works**

This is the whole reason 6.0.3 was chosen over 7.

```bash
npm run lint
```

Expected: clean, with type-aware rules still running. If `typescript-eslint` reports an unsupported TypeScript version, stop and report — do not proceed to Phase 2 with linting broken.

- [ ] **Step 5: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 6: Report, do not commit**

Suggested message: `chore(deps): upgrade TypeScript to 6.0.3`

---

### Task 11: Test and lint tooling

**Files:**

- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: Task 10.
- Produces: the final Phase 1 state.

- [ ] **Step 1: Upgrade vitest**

```bash
npm install -D vitest@4.1.10 @vitest/coverage-v8@4.1.10
```

`vitest.config.ts` uses none of the removed options (`coverage.all`, `coverage.extensions`, `coverage.ignoreEmptyLines`, the `maxThreads`/`maxForks` pool keys), so no config change is expected. The `// @vitest-environment happy-dom` pragma used in 10 files is still supported.

- [ ] **Step 2: Check the one real vitest risk**

v4 lets `vi.fn`/`vi.spyOn` mocks be constructor-called, which breaks arrow-function mock implementations invoked with `new`. There are **392 `vi.mock()` calls across ~71 files** and these were not individually audited.

```bash
npm test
```

Expected: all 148 files passing. If failures appear, look for arrow-function mocks used as constructors before assuming a real regression.

`vitest-axe@0.1.0` is unmaintained and used in exactly one test (`tests/unit/MentionsTab.test.tsx`). It has no upper peer bound so it will not block, but treat that test as the canary.

- [ ] **Step 3: Upgrade the ESLint plugins — but NOT ESLint itself**

```bash
npm install -D typescript-eslint@latest eslint-config-prettier@10.1.8 eslint-plugin-react-refresh@0.5.3
```

🔴 **`eslint` stays at 9.x.** Do not upgrade it. Do not upgrade `eslint-plugin-react`. Do not upgrade `eslint-plugin-react-hooks` — its next compatible release is a 5→7 jump with new rules, which is a separate project, not a version bump.

- [ ] **Step 4: Verify lint still runs**

```bash
npm run lint
```

Expected: clean. If it crashes rather than reporting rule violations, something upgraded ESLint transitively — check `npm ls eslint` and pin it back to 9.x.

- [ ] **Step 5: Full gate**

```bash
npm run check && npm run lint && npm test && npm run test:e2e
```

Expected: all clean; e2e 61/2/0.

- [ ] **Step 6: Report, do not commit**

Suggested message: `chore(deps): upgrade vitest to 4.x and eslint plugins`

---

### Task 12: Record the Phase 1 baseline

**Files:**

- Create: `docs/superpowers/plans/phase1-baseline.md`

- [ ] **Step 1: Capture the final state**

```bash
npm run test:e2e -- --reporter=list > /tmp/phase1-e2e.txt 2>&1; echo "EXIT=$?" >> /tmp/phase1-e2e.txt
```

- [ ] **Step 2: Write the baseline**

Record: the date, the final version of every upgraded package, the e2e result, anything that needed a code change beyond a version bump and why, every visual-QA observation from Tasks 1, 3, 5 and 8, and anything deliberately **not** upgraded with the reason — ESLint 9, `eslint-plugin-react`, `eslint-plugin-react-hooks`, TypeScript 7, and the eight unused Radix packages.

- [ ] **Step 3: Report, do not commit**

Suggested message: `docs: record phase 1 dependency baseline`

---

## Exit criteria for Phase 1

- [ ] Every package at its target version; `npm ls` reports no unmet peer dependencies.
- [ ] `npm run check`, `npm run lint`, `npm test` and `npm run test:e2e` all clean, with e2e at **61 passed / 2 skipped / 0 failed**.
- [ ] `npm run build` succeeds and Sentry sourcemap upload still fires.
- [ ] Visual QA done for the tour engine (Task 1), the Trends chart's null handling (Task 3), and Tailwind's spacing and focus rings (Task 8).
- [ ] A real error confirmed arriving in Sentry (Task 4) — it is now the only place error detail exists.
- [ ] Stripe webhooks smoke-tested by hand (Task 6) — the e2e suite does not cover them.
- [ ] `STRIPE_API_VERSION` pin verified intact (Task 9).
- [ ] Baseline recorded.

Only then does Phase 2 begin.
