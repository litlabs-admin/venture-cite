# Phase 0 — Pre-flight Cleanup Implementation Plan

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No commits during execution.** This codebase's working pattern (per the user) is: implement tasks without committing, the user reviews the full diff at the end via `git status` + `git diff`. Each task ends with a "verify diff" step instead of a commit step.

**Goal:** Clear all 12 small Workstream-B items and stand up Sentry observability + status page before adding any new features. Some items (drizzle drift check, migration audit) reduce risk for every subsequent phase.

**Architecture:** Mostly additive — surgical edits to existing files plus three configuration tasks (Sentry account, status page) and one infrastructure addition (`@sentry/vite-plugin` for source-map uploads). No new endpoints, no new functions, no new crons. The codebase already has `@sentry/react` installed and a wired `client/src/lib/sentry.ts`; we only need to provide the DSN and replace 5 `console.*` calls.

**Tech Stack:** Vite + esbuild build, vitest tests, Pino logger, Sentry SDK (browser + Node), Supabase Postgres, Drizzle ORM, Better Stack (status page).

---

## Pre-conditions verified before writing this plan

- `@sentry/react` already installed: `package.json` line 53 (`"@sentry/react": "^8.40.0"`)
- `client/src/lib/sentry.ts` already exists and initializes Sentry, gated on `VITE_SENTRY_DSN`
- `client/src/main.tsx` already calls `initSentry()` as the first thing
- `server/instrument.ts` already initializes `@sentry/node` gated on `SENTRY_DSN`
- `competitorDetections` Map is at `server/citationChecker.ts:429`
- `/api/alerts/test/:settingId` is at `server/routes/intelligence.ts:823`
- `aiLimitMiddleware` is NOT currently imported in `intelligence.ts`
- `@sentry/vite-plugin` is NOT in `package.json` — needs install
- `docs/RUNBOOK.md` exists (136 lines, has incident-response checklist)
- 5 client `console.*` sites confirmed in `ErrorBoundary.tsx`, `authStore.ts`, `ShareOfAnswerTab.tsx`, `reset-password.tsx`

---

## File structure

**Files modified:**

- `server/citationChecker.ts` — cap `competitorDetections` Map (Task 2)
- `server/routes/intelligence.ts` — add `aiLimitMiddleware` import + apply to `/api/alerts/test` route (Task 3)
- `client/src/components/ui/chart.tsx` — add safety comment (Task 4)
- `vite.config.ts` — add `build.sourcemap: 'hidden'` + `@sentry/vite-plugin` (Task 5)
- `client/src/components/ErrorBoundary.tsx` — replace `console.error` with `Sentry.captureException` (Task 7)
- `client/src/lib/authStore.ts` — replace 2 `console.*` calls (Task 8)
- `client/src/components/intelligence/ShareOfAnswerTab.tsx` — replace 1 `console.error` (Task 9)
- `client/src/pages/reset-password.tsx` — replace 1 `console.warn` (Task 10)
- `server/app.ts` — CSP `'unsafe-inline'` rationale comment (Task 11)
- `package.json` — add `@sentry/vite-plugin` to `devDependencies` (Task 5)
- `docs/RUNBOOK.md` — append 5 incident scenarios + backup-drill procedure + status-page note (Tasks 14, 15, 17)

**Files created:**

- `tests/unit/competitorDetectionsCap.test.ts` — Task 2's TDD test

**Manual / no-code tasks:**

- Task 1 (Sentry account signup + DSN/auth-token in Vercel env)
- Task 6 (Vercel `SENTRY_RELEASE` env var setup)
- Task 12 (`npx drizzle-kit check`)
- Task 13 (read last 5 migrations + document findings)
- Task 15 (Supabase Free backup drill — staging project + `pg_dump`)
- Task 16 (Better Stack signup + `/health` monitor + landing footer link)

**Files explicitly NOT modified by this plan:**

- `server/log.ts`, `server/lib/aiLogger.ts`, `server/setupProducts.ts` — kept as-is per the Phase 0 spec (intentional `console.*` use cases per their docstrings).

---

## Pre-flight: baseline check

Run this once before starting any task to capture the baseline state. If anything fails here, fix it before touching the plan tasks.

- [ ] **P0: Confirm baseline is green**

Run:

```
npm run check
npm test
npx eslint server/ client/src/ 2>&1 | tail -3
```

Expected:

- `npm run check`: clean (no output beyond the script header)
- `npm test`: `Test Files 26 passed (26) | Tests 233 passed (233)`
- `eslint`: `0 errors` (some warnings about `any` are pre-existing and acceptable)

If any of these fail, halt and address before continuing — the plan assumes a green baseline.

---

## PR 0.0 — Sentry account setup

**Manual configuration. No code in this PR.**

### Task 1: Create Sentry project and configure Vercel env vars

**Files:** none (configuration in Sentry dashboard + Vercel dashboard)

- [ ] **Step 1: Sign up for Sentry**

Navigate to https://sentry.io. Free tier is fine: 5,000 errors/month, 30-day retention, 1 user account.

- [ ] **Step 2: Create a new project**

In Sentry, create one project named `venturecite`. Choose "Node.js + React" as the platform (this gives you both the server and browser SDK guidance, even though we already have both installed).

- [ ] **Step 3: Copy the DSN and set it in Vercel env**

From the project settings, copy the DSN (looks like `https://abc123@o12345.ingest.sentry.io/67890`).

In Vercel project settings → Environment Variables, add:

- `SENTRY_DSN` = the DSN value, scoped to **Production AND Preview**
- `VITE_SENTRY_DSN` = same DSN value, scoped to **Production AND Preview** (this is the browser-side env var that `client/src/lib/sentry.ts` reads via `import.meta.env`)

- [ ] **Step 4: Create a Sentry auth token for source-map uploads**

In Sentry → User Settings → Auth Tokens, create a new internal integration token with these scopes:

- `project:releases` (read + write)
- `org:read`

Copy the token. It looks like `sntrys_AAAA...`.

- [ ] **Step 5: Set the auth token in Vercel build env**

In Vercel project settings, add:

- `SENTRY_AUTH_TOKEN` = the token, scoped to **Production AND Preview** (build-time only — do NOT expose to runtime; Vercel handles this distinction by default)
- `SENTRY_ORG` = your Sentry org slug
- `SENTRY_PROJECT` = `venturecite`

- [ ] **Step 6: Trigger a deploy to verify**

Push a no-op commit to trigger a Vercel build. Confirm:

- The build logs show `@sentry/vite-plugin` running (will appear after Task 5; for now this step just confirms the env vars don't break the build)
- The deployed app loads normally

- [ ] **Step 7: Verify Sentry server-side capture**

After deploy, navigate to any page and look for the request log in Vercel → Functions → Logs. Trigger a test error: paste this into a browser console while logged in:

```js
fetch("/api/articles?_force500=1", {
  headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
});
```

(The `_force500` param is hypothetical — adapt to a real test path. Easiest is to temporarily add `throw new Error('sentry test')` to a route handler, deploy, hit it, then revert.)

Expected: Sentry receives an event tagged with `source: "sendError"` or similar, visible in the Sentry project's Issues view within 30 seconds.

- [ ] **Step 8: Verify Sentry client-side capture**

In a deployed page, open browser DevTools console and run:

```js
throw new Error("sentry client test");
```

Expected: Sentry receives a browser event in the same project. The release will be unset until Task 5 + Task 6.

---

## PR 0.1 — Server hardening

### Task 2: Cap `competitorDetections` Map (B1.5)

**Files:**

- Test: `tests/unit/competitorDetectionsCap.test.ts` (CREATE)
- Modify: `server/citationChecker.ts:429` (cap the Map within the `runCitationCheck` function)

**Why:** Today `competitorDetections` is unbounded (`new Map<string, Map<string, number>>()`). A pathological brand with 200+ competitors × 30 platforms = 6,000+ entries × ~200 bytes each ≈ 1.2 MB per run. Vercel Hobby has 1024 MB memory cap. Not OOM today, but a bad import or runaway customer could blow it. Hard cap surfaces the issue instead of silently degrading.

- [ ] **Step 1: Inspect the current code at the call site**

Read `server/citationChecker.ts` around lines 420-440 to confirm the Map definition and around lines 820-840 to confirm where entries are added (`competitorDetections.set(comp.id, perPlatform)`).

- [ ] **Step 2: Write the failing test**

Create file `tests/unit/competitorDetectionsCap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the cap behavior in isolation by extracting it into a helper.
// The implementation will export a small `addToCappedMap` utility from
// citationChecker.ts so this test can exercise it without spinning up a
// full citation run.

import { addCompetitorDetection } from "../../server/citationChecker";

describe("competitorDetections cap", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts entries below the 5000-competitor cap", () => {
    const map = new Map<string, Map<string, number>>();
    for (let i = 0; i < 100; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1);
    }
    expect(map.size).toBe(100);
  });

  it("stops adding NEW competitors once cap is reached and warns once", () => {
    const map = new Map<string, Map<string, number>>();
    const warnSpy = vi.fn();

    // Fill to cap.
    for (let i = 0; i < 5000; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1, warnSpy);
    }
    expect(map.size).toBe(5000);
    expect(warnSpy).not.toHaveBeenCalled();

    // Try to add 100 more new competitors — should be rejected, warn fires once.
    for (let i = 5000; i < 5100; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1, warnSpy);
    }
    expect(map.size).toBe(5000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("still allows updates to EXISTING competitors after cap is reached", () => {
    const map = new Map<string, Map<string, number>>();
    for (let i = 0; i < 5000; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1);
    }

    // Updating an existing competitor with a new platform must work.
    addCompetitorDetection(map, "comp-0", "Claude", 1);
    expect(map.get("comp-0")?.get("Claude")).toBe(1);

    // Incrementing should also work.
    addCompetitorDetection(map, "comp-0", "Claude", 1);
    expect(map.get("comp-0")?.get("Claude")).toBe(2);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run:

```
npx vitest run tests/unit/competitorDetectionsCap.test.ts
```

Expected: `FAIL` — `addCompetitorDetection is not a function` or import error. Either confirms the helper doesn't exist yet.

- [ ] **Step 4: Read the existing call site**

Read `server/citationChecker.ts` lines 820-835. Confirm the current code looks roughly like:

```ts
const perPlatform = competitorDetections.get(comp.id) || new Map<string, number>();
perPlatform.set(platform, (perPlatform.get(platform) || 0) + 1);
competitorDetections.set(comp.id, perPlatform);
```

- [ ] **Step 5: Add the helper export at the top of `server/citationChecker.ts`**

Insert this near the top of the file (after the imports, before the first function):

```ts
// Cap on per-run competitor map size. Vercel Hobby has 1024 MB memory; a
// runaway run with thousands of competitors × dozens of platforms could
// exceed that. Cap surfaces the issue instead of silently degrading.
const COMPETITOR_DETECTIONS_CAP = 5000;

// Adds a (competitorId, platform) detection to the per-run map, respecting
// the cap. Updates to existing competitors always work; only NEW competitor
// IDs beyond the cap are dropped (and a warning fires exactly once per
// run via the optional `onCapHit` callback).
export function addCompetitorDetection(
  map: Map<string, Map<string, number>>,
  competitorId: string,
  platform: string,
  delta = 1,
  onCapHit?: () => void,
): void {
  const existing = map.get(competitorId);
  if (existing) {
    existing.set(platform, (existing.get(platform) || 0) + delta);
    return;
  }
  if (map.size >= COMPETITOR_DETECTIONS_CAP) {
    if (onCapHit) onCapHit();
    return;
  }
  const fresh = new Map<string, number>();
  fresh.set(platform, delta);
  map.set(competitorId, fresh);
}
```

- [ ] **Step 6: Replace the inline Map mutation with a call to the helper**

In `server/citationChecker.ts`, find the existing inline mutation around lines 820-835 (the `const perPlatform = ...` block) and replace with:

```ts
addCompetitorDetection(competitorDetections, comp.id, platform, 1, () => {
  if (!capWarnedOnce) {
    capWarnedOnce = true;
    logger.warn(
      { brandId, runId: citationRun.id, cap: 5000 },
      "citationChecker: competitorDetections cap hit — additional competitors dropped from this run",
    );
  }
});
```

Add a `let capWarnedOnce = false;` at the top of the `runCitationCheck` function (alongside the existing `const competitorDetections = ...` line).

- [ ] **Step 7: Run the test, verify it passes**

Run:

```
npx vitest run tests/unit/competitorDetectionsCap.test.ts
```

Expected: `Test Files 1 passed (1) | Tests 3 passed (3)`.

- [ ] **Step 8: Run full typecheck and full test suite**

Run:

```
npm run check
npm test
```

Expected: typecheck clean. Full suite: `26 passed (26) | 236 passed (236)` (233 baseline + 3 new).

- [ ] **Step 9: Verify the diff for this task**

Run:

```
git diff server/citationChecker.ts tests/unit/competitorDetectionsCap.test.ts
```

Confirm: helper added, inline mutation replaced, test file created. No other lines touched.

### Task 3: Add `aiLimitMiddleware` to `/api/alerts/test/:settingId` (B3.1)

**Files:**

- Modify: `server/routes/intelligence.ts:823` (the route registration line)
- Modify: `server/routes/intelligence.ts` imports (add `aiLimitMiddleware`)

**Why:** A logged-in attacker can spam Slack webhooks (the customer's webhooks, not yours) by repeatedly hitting the test endpoint. Causes the customer's Slack channel to flood. The 10-requests/minute cap stops this without breaking legitimate "click test 3 times" UX.

- [ ] **Step 1: Check the existing imports in `server/routes/intelligence.ts`**

Run:

```
grep -nE "from \"../lib/routesShared\"" server/routes/intelligence.ts
```

You'll see something like `import { sendError, asyncHandler } from "../lib/routesShared";` (line 23).

- [ ] **Step 2: Extend the import to include `aiLimitMiddleware`**

Edit `server/routes/intelligence.ts`. Find:

```ts
import { sendError, asyncHandler } from "../lib/routesShared";
```

Replace with:

```ts
import { sendError, asyncHandler, aiLimitMiddleware } from "../lib/routesShared";
```

- [ ] **Step 3: Apply the middleware to the alerts/test route**

Find line 823, which currently looks like:

```ts
app.post("/api/alerts/test/:settingId", asyncHandler(async (req, res) => {
```

Replace with:

```ts
app.post("/api/alerts/test/:settingId", aiLimitMiddleware, asyncHandler(async (req, res) => {
```

- [ ] **Step 4: Run typecheck and tests**

Run:

```
npm run check
npm test
```

Expected: typecheck clean. All 236 tests pass (no behavior change for the existing tests since none exercise rate-limit-exceeded paths on this endpoint).

- [ ] **Step 5: Verify the diff**

Run:

```
git diff server/routes/intelligence.ts
```

Confirm: only two changes — the import line and the route registration line. No other code touched.

### Task 4: Chart.tsx safety comment (B1.6)

**Files:**

- Modify: `client/src/components/ui/chart.tsx:75` (add a code comment above the `dangerouslySetInnerHTML` usage)

**Why:** Audit trail. The `dangerouslySetInnerHTML` is safe (input is a hardcoded `THEMES` config + caller-supplied static `config`, no user input). Comment documents that for the next reviewer.

- [ ] **Step 1: Read the surrounding code**

Read `client/src/components/ui/chart.tsx` lines 70-90 to confirm the structure.

- [ ] **Step 2: Add the comment immediately before `dangerouslySetInnerHTML`**

Find:

```tsx
    <style
      dangerouslySetInnerHTML={{
```

Replace with:

```tsx
    <style
      // Safe: input is a hardcoded THEMES record (above) + caller-supplied
      // static `config` object — never user-controlled input. This is the
      // shadcn chart theming pattern from the upstream component.
      dangerouslySetInnerHTML={{
```

- [ ] **Step 3: Run typecheck**

Run:

```
npm run check
```

Expected: clean.

- [ ] **Step 4: Verify the diff**

Run:

```
git diff client/src/components/ui/chart.tsx
```

Confirm: only the 3-line comment added. No other lines touched.

---

## PR 0.2 — Observability

### Task 5: Install `@sentry/vite-plugin` and configure source-map upload (B4.2)

**Files:**

- Modify: `package.json` (add `@sentry/vite-plugin` to `devDependencies`)
- Modify: `vite.config.ts` (set `build.sourcemap: 'hidden'` + add the plugin)

**Why:** Without source maps, every production Sentry stack trace is gibberish like `n.l.X is not a function`. Useless for debugging. With them, Sentry shows real component/file names. The `'hidden'` setting matters — `'true'` would expose the `.map` files publicly via the production bundle; `'hidden'` generates them but doesn't reference them in the JS, so only Sentry (which receives them via the upload plugin) can use them.

- [ ] **Step 1: Install the plugin**

Run:

```
npm install --save-dev @sentry/vite-plugin
```

Expected: package added to `devDependencies` in `package.json`. `package-lock.json` updates.

- [ ] **Step 2: Read the current `vite.config.ts`**

Read the full file. Confirm it currently has a `build` block that sets `outDir` and `emptyOutDir` but no `sourcemap` setting.

- [ ] **Step 3: Update `vite.config.ts` to enable hidden source maps and the upload plugin**

Replace the imports at the top:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
```

With:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";
```

Then update the `plugins` array to conditionally include the Sentry plugin:

```ts
  plugins: [
    react({
      babel: {
        plugins: isProd
          ? [["babel-plugin-jsx-remove-data-test-id", { attributes: ["data-testid"] }]]
          : [],
      },
    }),
    // Upload source maps to Sentry on prod builds. Gated on the auth token
    // existing — local builds without it skip upload silently. The
    // SENTRY_ORG and SENTRY_PROJECT env vars must also be set in the build
    // environment (Vercel) for the upload to work.
    isProd && process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          // Picked up automatically by Sentry as the release identifier
          // when SENTRY_RELEASE env var is set in the build (see Task 6).
          release: process.env.SENTRY_RELEASE
            ? { name: process.env.SENTRY_RELEASE }
            : undefined,
        })
      : null,
  ].filter(Boolean) as any,
```

And update the `build` block to enable hidden source maps:

```ts
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // 'hidden' generates .map files but does NOT reference them in the
    // emitted JS via sourceMappingURL comments. The plugin uploads them
    // to Sentry; browsers never download them, so they're not exposed
    // publicly. Required for prod Sentry stack traces to be readable.
    sourcemap: isProd ? "hidden" : false,
  },
```

- [ ] **Step 4: Verify local dev still builds**

Run:

```
npm run build
```

Expected: build completes successfully. If `SENTRY_AUTH_TOKEN` is not set locally, the plugin skips silently — no error. The `dist/public/` directory should contain the bundled JS plus `.map` files alongside (no `sourceMappingURL` comment in the JS itself).

Confirm the source maps are NOT referenced in the JS:

```
grep -l "sourceMappingURL" dist/public/assets/*.js | head -3
```

Expected: no output (no JS file references the maps).

- [ ] **Step 5: Run typecheck and tests**

Run:

```
npm run check
npm test
```

Expected: typecheck clean (the plugin is excluded from the type graph at runtime). All 236 tests pass.

- [ ] **Step 6: Verify the diff**

Run:

```
git diff vite.config.ts package.json
```

Confirm: vite.config.ts has the import + plugin entry + sourcemap setting; package.json has the new devDependency. No other changes.

### Task 6: Set `SENTRY_RELEASE` in Vercel build env (B8.3)

**Files:** none (configuration in Vercel dashboard)

**Why:** Without a release identifier, all Sentry events show as "unreleased." When you ship a regression, you can't see "errors increased after release X." Setting `SENTRY_RELEASE` to the git commit SHA lets you filter by deploy.

- [ ] **Step 1: Set the env var in Vercel**

In Vercel project settings → Environment Variables, add:

- `SENTRY_RELEASE` = `$VERCEL_GIT_COMMIT_SHA`, scoped to **Production AND Preview**

Vercel will substitute the actual commit SHA at build time.

- [ ] **Step 2: Trigger a deploy**

Push a no-op commit (or trigger a redeploy from the Vercel dashboard).

- [ ] **Step 3: Verify the release shows up in Sentry**

After the deploy completes, in Sentry → Releases (left sidebar), you should see a new release named with the git SHA. It should also show "Source Maps: Uploaded" (from Task 5).

- [ ] **Step 4: Trigger a test error and verify the stack trace is mapped**

In the deployed app, open browser DevTools and run:

```js
throw new Error("sentry release + sourcemap test");
```

In Sentry, find the new event. Click into it. The stack trace should show real file names and line numbers (e.g., `client/src/main.tsx:9`) instead of minified gibberish.

If the stack trace is still minified: source maps aren't being matched. Check Sentry → Project Settings → Source Maps for upload errors.

### Task 7: Replace `console.error` in `ErrorBoundary.tsx` (B7.1 part 1)

**Files:**

- Modify: `client/src/components/ErrorBoundary.tsx`

**Why:** `ErrorBoundary` errors mean the entire React tree crashed for that user. Today they're invisible to you (browser console only). Routing them to Sentry means you find out before the user emails support.

- [ ] **Step 1: Read the current file**

Read `client/src/components/ErrorBoundary.tsx`. Confirm there's a single `console.error("[ErrorBoundary]", error, info.componentStack);` call inside the `componentDidCatch` lifecycle.

- [ ] **Step 2: Add the Sentry import**

At the top of the file (after the React import), add:

```ts
import { Sentry } from "@/lib/sentry";
```

- [ ] **Step 3: Replace the console.error call**

Find:

```ts
console.error("[ErrorBoundary]", error, info.componentStack);
```

Replace with:

```ts
// Route to Sentry so unhandled React tree crashes are visible without
// requiring the user to email support. componentStack goes into the
// event context for debuggability.
Sentry.captureException(error, {
  tags: { source: "react-error-boundary" },
  contexts: { react: { componentStack: info.componentStack } },
});
```

- [ ] **Step 4: Run typecheck**

Run:

```
npm run check
```

Expected: clean.

- [ ] **Step 5: Verify the diff**

Run:

```
git diff client/src/components/ErrorBoundary.tsx
```

Confirm: import added, console call replaced. No other changes.

### Task 8: Replace `console.*` in `client/src/lib/authStore.ts` (B7.1 part 2)

**Files:**

- Modify: `client/src/lib/authStore.ts`

**Why:** Auth-flow failures matter. The two existing calls (`getSession failed`, `setSession failed`) silently fail today.

- [ ] **Step 1: Inspect the two call sites**

Run:

```
grep -nB 3 -A 3 "console\." client/src/lib/authStore.ts
```

- [ ] **Step 2: Add Sentry import at top of file**

Add (after existing imports):

```ts
import { Sentry } from "@/lib/sentry";
```

- [ ] **Step 3: Replace both console calls**

Find:

```ts
console.warn("[authStore] getSession failed:", err);
```

Replace with:

```ts
Sentry.captureException(err, { tags: { source: "authStore.getSession" } });
```

Find:

```ts
console.error("[authStore] setSession failed:", error.message);
```

Replace with:

```ts
Sentry.captureException(error, { tags: { source: "authStore.setSession" } });
```

- [ ] **Step 4: Run typecheck**

Run:

```
npm run check
```

Expected: clean.

- [ ] **Step 5: Verify the diff**

Run:

```
git diff client/src/lib/authStore.ts
```

Confirm: import added, both console calls replaced, nothing else.

### Task 9: Replace `console.error` in `ShareOfAnswerTab.tsx` (B7.1 part 3)

**Files:**

- Modify: `client/src/components/intelligence/ShareOfAnswerTab.tsx`

- [ ] **Step 1: Find the call site**

Run:

```
grep -nB 3 -A 3 "console\." client/src/components/intelligence/ShareOfAnswerTab.tsx
```

You'll see `console.error("Prompt creation error:", error);` inside a mutation `onError` handler.

- [ ] **Step 2: Add Sentry import**

Add (after existing imports at top of file):

```ts
import { Sentry } from "@/lib/sentry";
```

- [ ] **Step 3: Replace the console call**

Find:

```ts
console.error("Prompt creation error:", error);
```

Replace with:

```ts
Sentry.captureException(error, { tags: { source: "share-of-answer.prompt-create" } });
```

- [ ] **Step 4: Run typecheck**

Run:

```
npm run check
```

Expected: clean.

- [ ] **Step 5: Verify the diff**

Run:

```
git diff client/src/components/intelligence/ShareOfAnswerTab.tsx
```

Confirm: import added, console call replaced.

### Task 10: Replace `console.warn` in `reset-password.tsx` (B7.1 part 4)

**Files:**

- Modify: `client/src/pages/reset-password.tsx`

- [ ] **Step 1: Find the call site**

Run:

```
grep -nB 3 -A 3 "console\." client/src/pages/reset-password.tsx
```

- [ ] **Step 2: Add Sentry import**

Add (after existing imports at top of file):

```ts
import { Sentry } from "@/lib/sentry";
```

- [ ] **Step 3: Replace the console call**

Find:

```ts
console.warn("[reset-password] getSession failed:", err);
```

Replace with:

```ts
Sentry.captureException(err, { tags: { source: "reset-password.getSession" } });
```

- [ ] **Step 4: Run typecheck and verify no client-side `console.*` remain (except deliberate ones)**

Run:

```
npm run check
grep -rE "console\.(log|warn|error|info)" client/src/
```

Expected: typecheck clean. Grep should return zero matches (all 5 sites have been replaced).

- [ ] **Step 5: Verify the diff**

Run:

```
git diff client/src/pages/reset-password.tsx
```

Confirm: import added, console call replaced.

### Task 11: Add CSP rationale comment to `server/app.ts` (B7.2)

**Files:**

- Modify: `server/app.ts` (around the helmet CSP block, currently around lines 44-59)

**Why:** Locks the rationale for `'unsafe-inline'` in `styleSrc` into code review. No functional change.

- [ ] **Step 1: Read the current CSP block**

Read `server/app.ts` lines 40-65.

- [ ] **Step 2: Add the comment immediately above the `styleSrc` line**

Find:

```ts
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
```

Replace with:

```ts
        // 'unsafe-inline' is required because Recharts injects per-chart
        // theme styles via dangerouslySetInnerHTML at component-render
        // time (see client/src/components/ui/chart.tsx). Tightening this
        // to a nonce-based policy is on the post-launch backlog if a
        // security audit requires it.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
```

- [ ] **Step 3: Run typecheck**

Run:

```
npm run check
```

Expected: clean.

- [ ] **Step 4: Verify the diff**

Run:

```
git diff server/app.ts
```

Confirm: only the comment block added.

---

## PR 0.3 — Database / migration safety

### Task 12: Drizzle drift check (B6.2)

**Files:** none (read-only check) — but if drift is found, a migration may need to be added.

**Why:** Drift between Drizzle schema and DB schema causes "column X does not exist" runtime errors that bypass type checking. Catching drift now is cheap; in production it's a 3 AM page.

- [ ] **Step 1: Run drizzle-kit check**

Run:

```
npx drizzle-kit check
```

- [ ] **Step 2: If output is clean, document and move on**

Expected output (clean): `Everything is fine` or similar success message.

If clean, append a one-line note to `docs/RUNBOOK.md` under a new "Schema state" section:

```md
## Schema state

- **Last drizzle-kit check:** 2026-05-04 — clean. Re-run before each migration PR.
```

- [ ] **Step 3: If output shows drift, halt and report**

If `drizzle-kit check` reports any drift (e.g., "your sql migration file does not match generated schema"), do NOT auto-fix. Halt this task and report the output to the user. Drift fixes need human judgment — could be a missed migration, a manual DB change that should be captured, or a Drizzle schema typo.

- [ ] **Step 4: Verify the diff (if note added)**

Run:

```
git diff docs/RUNBOOK.md
```

Confirm: only the schema-state note added (if applicable).

### Task 13: Audit last 5 migrations for risky patterns (B6.1)

**Files:** none (read-only audit) — outcome is a documented checklist.

**Why:** Bad migrations have already shipped to your prod DB. You've absorbed those. The audit is to make sure NEW work (like Phase 5's `chatbot_messages` table) follows safe patterns. You learn what good looks like in this codebase before you write more.

- [ ] **Step 1: Read the last 5 migration files**

Read in order:

- `migrations/0042_geo_tools_lifecycle.sql`
- `migrations/0043_rate_limit_buckets.sql`
- `migrations/0044_content_job_advance.sql`
- `migrations/0045_content_job_openai_response.sql`
- `migrations/0046_clear_fake_distribution_post_ids.sql`

- [ ] **Step 2: Check each for risky patterns**

For each file, check:

1. **`DROP TABLE` or `DROP COLUMN` on populated tables** — would lose data if run on prod with existing rows. Flag if found.
2. **`ALTER TABLE ... ADD COLUMN ... NOT NULL` without DEFAULT** — would fail if the table has existing rows. Flag if found.
3. **`CREATE INDEX` without `CONCURRENTLY` and without `IF NOT EXISTS`** — `CREATE INDEX` (non-concurrent) locks the table during creation; for hot tables this is downtime. `IF NOT EXISTS` makes the migration idempotent (safe to retry). Flag any missing.
4. **Missing index on FK columns that are joined hot-paths** — read the schema in `shared/schema.ts` to spot FK columns that aren't indexed. (Drizzle's `references(...)` does NOT auto-create an index.)
5. **Migrations that aren't idempotent** — i.e., re-running them would fail. Most of yours use `IF NOT EXISTS` consistently. Flag any that don't.

- [ ] **Step 3: Document findings**

Append to `docs/RUNBOOK.md` under the schema-state section from Task 12:

```md
### Migration audit (2026-05-04)

Audited 0042–0046 for risky patterns:

- ✅ All migrations use `IF NOT EXISTS` for new objects (idempotent on retry)
- ✅ No `DROP TABLE` on populated tables in this batch
- ✅ No `ADD COLUMN ... NOT NULL` without DEFAULT in this batch
- [Add findings here per actual audit — replace these placeholder bullets with what you actually found]

**Patterns to follow for new migrations** (Phase 5+):

- Always use `IF NOT EXISTS` for new tables, columns, indexes
- Use `ON DELETE CASCADE` on FK to `users(id)` for GDPR compliance
- Index FK columns explicitly — Drizzle's `references()` does NOT auto-create indexes
- For hot tables, prefer `CREATE INDEX CONCURRENTLY` (note: requires running outside a transaction)
```

If the audit finds real issues that need migrations to fix, halt and report — those need human decision-making about whether to write a corrective migration now or defer.

- [ ] **Step 4: Verify the diff**

Run:

```
git diff docs/RUNBOOK.md
```

Confirm: schema-state section + migration-audit section added.

---

## PR 0.4 — Operational readiness

### Task 14: RUNBOOK expansion — 5 incident scenarios (B8.4)

**Files:**

- Modify: `docs/RUNBOOK.md` (append 5 new sections)

**Why:** When your first paying customer hits an issue at 11 PM, you (or anyone covering) need a script to follow. Vercel Hobby has no SLA — you ARE the on-call.

- [ ] **Step 1: Read the existing RUNBOOK structure**

Read `docs/RUNBOOK.md` to understand the existing format. The file has an incident-response checklist and a request-tracing section.

- [ ] **Step 2: Append 5 incident scenarios**

Append these sections to the end of `docs/RUNBOOK.md`:

```md
---

## Common incidents

### 1. Database connection pool exhausted

**Symptoms:**
- Vercel function logs show errors like `Error: Connection terminated unexpectedly` or `remaining connection slots are reserved`
- `/health` returns 503
- Sentry shows a spike of DB-related errors

**Immediate mitigation:**
- Trigger a fresh Vercel deploy. New function instances get fresh pool connections; old leaked connections will eventually be reclaimed by Postgres timeouts.
- Open Supabase dashboard → Database → Pool settings — confirm the pool isn't paused or stalled.

**Investigation:**
- Check `server/db.ts` — `max: isServerless ? 1 : 10`. On Vercel each function instance gets max=1 connection. Pool exhaustion in serverless usually means a long-running query holding the connection.
- Check Sentry for the slow query. Look at recent code changes for new heavy queries.

**Post-incident:**
- If a specific endpoint is implicated, add query timeouts or convert to a background job (cron orchestrator step).
- Consider upgrading Supabase to Pro for more connection headroom.

### 2. Stripe webhook signature failures

**Symptoms:**
- `/api/stripe/webhook` returning 400
- Stripe dashboard → Webhooks → recent deliveries showing failures
- Customers reporting "I paid but got no access"

**Immediate mitigation:**
- Confirm `STRIPE_WEBHOOK_SECRET` env var matches what's in Stripe dashboard → Webhooks → Endpoint signing secret (revealed by clicking the endpoint).
- If secret has rotated, update the Vercel env var and redeploy.
- Stripe will retry failed webhooks for ~3 days, so urgency is medium-high but not minutes.

**Investigation:**
- Check `server/webhookHandlers.ts` for signature verification. The raw body must be passed to `stripe.webhooks.constructEvent`. Body parsing must NOT have happened before this route.
- Check `server/app.ts` ordering — `express.raw()` must be applied to `/api/stripe/webhook` BEFORE `express.json()`.

**Post-incident:**
- Webhook signing secrets should be rotated annually. Document rotation in this RUNBOOK.

### 3. OpenAI / OpenRouter 429 (rate limited or quota exhausted)

**Symptoms:**
- Sentry events tagged with OpenAI or OpenRouter origins
- Users see "AI service temporarily unavailable" in the chatbot, content generation, or citation runs
- Status page may show degraded service

**Immediate mitigation:**
- Check the provider's status page (status.openai.com or openrouter.ai/status) for outages.
- Check your account billing dashboards for spend caps hit (yes — defensive caps you set yourself can fire too).
- If a single user is monopolizing, look at recent api_costs rows for outliers.

**Investigation:**
- `server/lib/llmBudget.ts` defines daily spending caps. Check current spend in `api_costs` table.
- For chatbot specifically, check `chatbot_token_usage` table for the user (Phase 5+).

**Post-incident:**
- Tighten per-user daily token budgets if abuse pattern observed.
- Consider routing to a different provider via `OPENROUTER_API_KEY` if persistent OpenAI issues.

### 4. LLM budget exceeded (your daily cap)

**Symptoms:**
- All AI features return 429 with "daily budget exceeded" type errors
- All users affected, not just one

**Immediate mitigation:**
- Increase the daily cap in `server/lib/llmBudget.ts` if the spend is intentional / expected (e.g., end-of-month batch).
- Roll back the cap once load normalizes.

**Investigation:**
- Query `api_costs` table grouped by `feature` to see what spent the budget.
- Check for runaway loops — most likely culprits: citation runs in a tight loop, autopilot misconfigured, abuse via prompt-test flows.

**Post-incident:**
- If a feature is structurally too expensive, redesign cost model (e.g., add per-user daily limits, tier-gate the feature).

### 5. Stuck content generation jobs

**Symptoms:**
- `/api/content-jobs/active` shows jobs in `pending` or `running` status for >10 minutes
- Users see articles "still generating" forever
- `failStuckContentJobs` cron step in daily orchestrator failing or no-op

**Immediate mitigation:**
- Run the orchestrator manually: `POST /api/cron/daily-orchestrator` with `Authorization: Bearer $CRON_SECRET`. The `fail-stuck-content-jobs` step will time-out anything stale.
- For specific jobs that need urgent recovery, query `content_generation_jobs` and manually update status to `failed` (will trigger refund via `refundArticleQuota`).

**Investigation:**
- Read `server/contentGenerationWorker.ts` and `server/routes/content.ts` for the slice/advance logic.
- Check Sentry for `runArticleSlice` errors — silent failures here cause stuck jobs.

**Post-incident:**
- If a particular failure mode is recurring, add it as an explicit guard in the slice handler.

---
```

- [ ] **Step 3: Verify the file is well-formed Markdown**

Open `docs/RUNBOOK.md` and confirm the new sections render correctly (headings, lists, code blocks).

- [ ] **Step 4: Verify the diff**

Run:

```
git diff docs/RUNBOOK.md
```

Confirm: only appended sections, no modifications to existing content.

### Task 15: Backup / restore drill (B8.5, revised for Supabase Free)

**Files:** mostly external action — the artifact is a documented procedure in RUNBOOK + a one-time successful drill.

**Why:** Supabase backups are automatic but UNTESTED until you actually restore one. Doing the drill once answers "can I recover from disaster" before disaster strikes. Supabase Free has daily backups with 7-day retention (no PITR), so the drill exercises the lower-bound recovery scenario.

- [ ] **Step 1: Create a staging Supabase project**

In Supabase dashboard, create a new project named `venturecite-staging` (free tier is fine).

Note the connection string — you'll need it for the restore step.

- [ ] **Step 2: Export the production database via `pg_dump`**

From Supabase dashboard → Settings → Database, copy the production connection string (under "Connection Pooling" — use the `postgres://...` URI, NOT the pooled one for `pg_dump`).

Run locally:

```
pg_dump "postgres://[prod_connection_string]" \
  --no-owner --no-acl \
  --schema=public \
  --file=venturecite-prod-backup-2026-05-04.sql
```

This produces a SQL file with the full schema + data.

**If `pg_dump` is not installed locally:** install via your package manager (`brew install postgresql` on macOS; on Windows, install the PostgreSQL client tools from the official installer).

**File size sanity check:** the output file should be a few MB at most given Supabase Free's 500 MB cap. If it's empty or only a few KB, the export failed silently — re-run with `--verbose`.

- [ ] **Step 3: Restore into the staging project**

Get the staging connection string (same path: Supabase dashboard → Settings → Database).

Run:

```
psql "postgres://[staging_connection_string]" -f venturecite-prod-backup-2026-05-04.sql
```

Watch for errors. Some are expected and ignorable: warnings about extensions (`gen_random_uuid` etc.) being already-installed in fresh Supabase projects. Real problems would be "relation does not exist" during data load.

- [ ] **Step 4: Smoke-test the staging DB**

Connect to the staging DB via Supabase dashboard SQL editor and run:

```sql
SELECT count(*) FROM users;
SELECT count(*) FROM brands;
SELECT count(*) FROM articles;
SELECT count(*) FROM citation_runs;
```

The counts should match production (or be very close — a row or two may have been added between the dump and now).

- [ ] **Step 5: Document the procedure in RUNBOOK**

Append to `docs/RUNBOOK.md`:

```md
## Backup and restore

### Backup state

- **Provider:** Supabase Free tier — daily backups, 7-day retention, NO PITR
- **Worst-case data loss in disaster:** ~24 hours (last daily backup is the most recent restore point)
- **Last successful restore drill:** 2026-05-04 (production → venturecite-staging Supabase project, full schema + data)

### Restore procedure (Supabase Free)

1. Create a fresh Supabase project (or empty an existing staging project).
2. Export prod via `pg_dump`:
```

pg_dump "postgres://[prod_uri]" --no-owner --no-acl --schema=public --file=backup.sql

```
3. Restore to target:
```

psql "postgres://[target_uri]" -f backup.sql

```
4. Update Vercel env vars (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) to point at the restored project.
5. Trigger a Vercel redeploy.
6. Smoke-test: log in, list brands, list articles.

### MUST upgrade before taking real money

Supabase Pro ($25/mo) is a launch-blocker for paying customers:
- Adds **point-in-time recovery (PITR)** — restore to any second within last 7 days (vs. nightly snapshots only on Free)
- Extends backup retention to 30 days
- Higher connection limits and storage cap (8 GB vs 500 MB)

Until upgrade: do NOT charge customers, or accept the worst-case-24h-data-loss risk explicitly with them.
```

- [ ] **Step 6: Tear down the staging project (optional)**

If you don't need the staging project for ongoing dev, delete it from Supabase dashboard to free up the Free-tier quota (Free is limited to 2 projects per org).

If you DO want to keep it for future drills, leave it but pause it (Supabase auto-pauses inactive Free projects after 1 week anyway).

- [ ] **Step 7: Verify the diff**

Run:

```
git diff docs/RUNBOOK.md
```

Confirm: backup-and-restore section added, no modifications to existing sections.

### Task 16: Status page setup (B8.6)

**Files:**

- Modify: `client/src/pages/landing.tsx` (add status page link in footer) — OR another visible footer location if landing.tsx doesn't have a footer

**Why:** When the product IS down, customers email "is it just me?" Posting to a status page (auto-detected via `/health` ping) deflects 80% of those tickets.

- [ ] **Step 1: Sign up for Better Stack (free tier)**

Navigate to https://betterstack.com. Sign up. Free tier includes 10 monitors and 1 status page — plenty.

- [ ] **Step 2: Create a heartbeat-style monitor on `/health`**

In Better Stack → Uptime → Monitors → Create monitor:

- Type: HTTP
- URL: `https://[your-vercel-domain]/health`
- Frequency: 1 minute
- Expected response: HTTP 200 with `{"status":"ok"}` in the body
- Notification: configure email alerts to your dev email

- [ ] **Step 3: Create a public status page**

In Better Stack → Status Pages → Create:

- Name: VentureCite
- Custom domain (optional): `status.venturecite.com` if you have DNS access. Otherwise use the default `venturecite.betteruptime.com` URL.
- Add the `/health` monitor to the page

- [ ] **Step 4: Add the status page link to your landing page footer**

Read `client/src/pages/landing.tsx`. Find the footer section. Add a link to the status page URL.

If the footer has a list of links, add:

```tsx
<a
  href="https://venturecite.betteruptime.com"
  target="_blank"
  rel="noopener noreferrer"
  className="text-sm text-muted-foreground hover:text-foreground"
>
  Status
</a>
```

(Use the URL you got from Better Stack.)

If the landing page has no footer, add a minimal one or include the link wherever footer-style metadata lives in the existing design.

- [ ] **Step 5: Verify Better Stack reports the monitor as up**

Within ~2 minutes of creating the monitor, Better Stack should show the `/health` check as up. Visit your status page URL — it should display "All systems operational."

- [ ] **Step 6: Test the alert by simulating downtime (optional but recommended)**

Temporarily break the `/health` endpoint (e.g., revoke the Supabase service-role key in a staging environment, or modify the route to throw). Wait 1-2 minutes for Better Stack to detect → confirm you receive an email alert and the status page flips to "Down."

Restore service. Confirm Better Stack auto-recovers and emails an "all clear."

- [ ] **Step 7: Document in RUNBOOK**

Append to `docs/RUNBOOK.md`:

```md
## Status page

- **Public URL:** https://venturecite.betteruptime.com (replace with custom domain if configured)
- **Provider:** Better Stack (free tier)
- **Monitor:** `/health` checked every 1 minute
- **Alerts:** email to [your-dev-email]
- **Linked from:** landing page footer
```

- [ ] **Step 8: Verify the diff**

Run:

```
git diff client/src/pages/landing.tsx docs/RUNBOOK.md
```

Confirm: footer link added to landing page, RUNBOOK status-page section added.

---

## Final verification

### Task 17: End-to-end Phase 0 verification

**Goal:** Confirm everything across all 4 PRs is consistent and the codebase is in a clean state.

- [ ] **Step 1: Run typecheck**

Run:

```
npm run check
```

Expected: clean.

- [ ] **Step 2: Run full test suite**

Run:

```
npm test
```

Expected: `Test Files 26 passed (26) | Tests 236 passed (236)` (233 baseline + 3 new from Task 2's `competitorDetectionsCap.test.ts`).

- [ ] **Step 3: Run lint, expect no new errors**

Run:

```
npx eslint server/ client/src/ 2>&1 | tail -3
```

Expected: `0 errors`. Pre-existing warnings about `any` are unchanged.

- [ ] **Step 4: Confirm no client-side `console.*` calls remain (except deliberate ones)**

Run:

```
grep -rE "console\.(log|warn|error|info)" client/src/
```

Expected: zero matches. (Deliberate `Sentry.captureException` calls in `ErrorBoundary.tsx` are NOT `console.*` and won't match.)

- [ ] **Step 5: Confirm no server-side `console.*` calls remain (except 3 skip-list files)**

Run:

```
grep -rE "console\.(log|warn|error|info)" server/ | grep -v -e log.ts -e aiLogger.ts -e setupProducts.ts
```

Expected: zero matches.

- [ ] **Step 6: Verify Sentry release tagging works in production**

In Sentry → Releases, confirm the most recent release shows the git SHA, has source maps uploaded, and recent test events have mapped stack traces.

- [ ] **Step 7: Verify Better Stack status page is live**

Open the status page URL. Confirm "All systems operational." Confirm the `/health` monitor shows green for the last hour.

- [ ] **Step 8: Run the `git diff --stat` to see total Phase 0 footprint**

Run:

```
git diff --stat
```

Expected files changed (no surprises):

- `client/src/components/ErrorBoundary.tsx`
- `client/src/components/intelligence/ShareOfAnswerTab.tsx`
- `client/src/components/ui/chart.tsx`
- `client/src/lib/authStore.ts`
- `client/src/pages/landing.tsx`
- `client/src/pages/reset-password.tsx`
- `docs/RUNBOOK.md`
- `package.json`
- `package-lock.json`
- `server/app.ts`
- `server/citationChecker.ts`
- `server/routes/intelligence.ts`
- `tests/unit/competitorDetectionsCap.test.ts`
- `vite.config.ts`

If any unexpected file appears in the diff, investigate before reporting Phase 0 done.

- [ ] **Step 9: Report completion**

Phase 0 is complete. Summarize what changed (high-level — the user has the diff for details), confirm the four production-readiness milestones are achieved:

1. **Sentry observability** — DSN wired, source maps uploaded, releases tagged, all unhandled errors captured both server + client side
2. **Server hardening** — citation Map cap closes a memory-exhaustion vector, alerts/test endpoint rate-limited closes an abuse vector
3. **Database safety** — drift check passed, last 5 migrations audited
4. **Operational readiness** — RUNBOOK has 5 incident scenarios + backup procedure, backup drill done once, status page live and monitoring `/health`

The codebase is now ready for Phase 1 (onboarding ring + expectations timeline).

---

## What this plan does NOT do

Per the spec's "Out of scope" section, Phase 0 deliberately does not:

- Set up team alerting beyond email (PagerDuty / Opsgenie integration would be Phase ∞)
- Configure log aggregation (Datadog / Better Stack Logs) — out of scope; Pino logs to stdout, Vercel captures them
- Add automated load testing — manual only for now
- Tighten CSP beyond the existing `'unsafe-inline'` posture — comment-only in Task 11
- Write migrations to fix any drift found in Task 12 — those would be a separate plan if drift exists

These are tracked in the spec's "Open items / follow-up specs" section.
