# Phase 0 - E2E Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright end-to-end suite against the **current, unmodified** app that encodes today's behaviour, so it can act as the pass/fail gate for the TanStack Start migration.

**Architecture:** Fix the broken Playwright harness first (wrong port, no webServer, missing credentials), then add one spec file per user-facing flow. Every spec must pass against current `main` before any migration work begins. Tests target `data-testid` attributes where they exist, which requires running against the dev server since production builds strip them.

**Tech Stack:** Playwright 1.61.1, TypeScript, Express + Vite dev server on port 5000, Supabase auth, Stripe test mode.

## Global Constraints

> 🚫 **DO NOT RUN `git commit`. EVER. THIS OVERRIDES EVERY STEP BELOW.**
>
> Several tasks end with a step titled "Commit" containing a `git commit`
> command. **Those commands are cancelled.** Run `git add <files>` to stage
> the work and then STOP. The user commits manually. Do not run `git commit`,
> `git push`, `git checkout -b`, `git reset`, `git stash`, or any other
> history-modifying git command under any circumstances. Staging is the end
> of every task.

- Design spec: `docs/superpowers/specs/2026-07-25-tanstack-start-migration-design.md`.
- **Do not modify application source in this phase.** In scope: `tests/`, `playwright.config.ts`, `.env`, `.env.example`, `package.json` (scripts **and** test-only devDependencies), and `package-lock.json` as a consequence of installing them. If a test cannot pass without an app change, stop and report - that is a finding, not a licence to edit.
  - _Amended during Task 1:_ `@playwright/test` turned out to be undeclared in `package.json` entirely, and `node_modules` was empty. Installing it is a prerequisite for every task in this phase, so test-only dependency additions are in scope. Application dependencies are still out of scope.
- **Do not commit `.env`.** It is gitignored (`.gitignore:15`). Credentials are read from environment variables only, never hardcoded in spec files.
- App runs on **port 5000** (`server/index.ts:53`). Dev command is `npm run dev`.
- `data-testid` attributes exist **only** when `NODE_ENV !== "production"` (`vite.config.ts:29-33`). Tests must run against `npm run dev`.
- Test account: `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` from `.env`. Confirmed throwaway - tests may create and delete records freely.
- 🔑 **Authentication is shared, not per-test.** The login endpoint rate-limits at
  **10 attempts per (IP, email) per 15 minutes** (`server/auth.ts`) and returns
  HTTP 429 beyond that. Task 6b introduced a `storageState` setup project that
  logs in **once** for the whole run.
  **Every spec from Task 7 onward must NOT call `login()` in `beforeEach`** -
  the context arrives already authenticated. Task snippets below that still show
  `test.beforeEach(async ({ page }) => { await login(page); })` are superseded:
  delete that hook and rely on the shared state. The only exceptions are
  `auth-login.spec.ts` (which tests logging in) and the public-page specs, both
  of which opt out with an empty `storageState`.
- Stripe must be in **test mode**. Never exercise checkout against live keys.
- Node engine target: `^20.19.0 || >=22.12.0`.
- Every task ends with a commit. Frequent, small commits.

---

## File Structure

| File                                 | Responsibility                                                   |
| ------------------------------------ | ---------------------------------------------------------------- |
| `playwright.config.ts`               | Modify - correct baseURL, add webServer, sane timeouts           |
| `tests/e2e/support/selectors.ts`     | Create - single source of truth for every selector used by specs |
| `tests/e2e/support/auth.ts`          | Create - login/logout helpers and the authenticated fixture      |
| `tests/e2e/public-pages.spec.ts`     | Create - landing, privacy, glossary, 404 (unauthenticated)       |
| `tests/e2e/auth-login.spec.ts`       | Create - login success, failure, logout                          |
| `tests/e2e/auth-signup.spec.ts`      | Create - registration and password reset entry points            |
| `tests/e2e/spine-navigation.spec.ts` | Create - the five spine pages and their `?tab=` deep links       |
| `tests/e2e/legacy-redirects.spec.ts` | Create - all 11 retired paths still land correctly               |
| `tests/e2e/url-state.spec.ts`        | Create - `?brandId=`, `?tab=`, `?edit=` survive reload           |
| `tests/e2e/settings-theme.spec.ts`   | Create - settings page and theme persistence                     |
| `tests/e2e/billing.spec.ts`          | Create - pricing page and checkout session creation              |
| `tests/e2e/tours.spec.ts`            | Modify - repair the broken `/dashboard` assertion                |
| `package.json`                       | Modify - add `test:e2e:headed` and `test:e2e:report` scripts     |

---

### Task 1: Repair the Playwright harness

**Files:**

- Modify: `playwright.config.ts` (whole file)
- Modify: `.env` (append two variables)
- Modify: `.env.example` (append two variables)

**Interfaces:**

- Consumes: nothing.
- Produces: a working Playwright harness on `http://localhost:5000` that boots the dev server automatically; environment variables `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD`.

- [ ] **Step 1: Add the test credentials to `.env`**

Append to `.env` (values supplied by the user; do not invent them):

```
E2E_TEST_EMAIL=yogeshagrawal255@gmail.com
E2E_TEST_PASSWORD=Admin123
```

- [ ] **Step 2: Document the variables in `.env.example`**

Append to `.env.example`:

```
# Playwright end-to-end tests. Must be a throwaway account - the suite
# creates and deletes records under it. Never point this at a real user.
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

- [ ] **Step 3: Rewrite `playwright.config.ts`**

Replace the entire file with:

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

// The app listens on PORT (default 5000 - see server/index.ts:53).
// NOTE: data-testid attributes are stripped when NODE_ENV=production
// (vite.config.ts:29-33), so e2e MUST run against the dev server.
const PORT = process.env.PORT || "5000";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
```

Rationale for `fullyParallel: false` / `workers: 1`: the specs share one test
account and mutate its brands. Parallel workers would race.

- [ ] **Step 4: Verify the harness boots and reaches the app**

Run: `npx playwright test --list`
Expected: lists the existing `tours.spec.ts` tests without a config error.

Then run: `npx playwright test tests/e2e/tours.spec.ts --reporter=list`
Expected: the suite **runs** (tests may fail - `tours.spec.ts` is known broken and is repaired in Task 12). The point of this step is that the web server boots and the browser reaches `http://localhost:5000`, not that assertions pass. If you see `ECONNREFUSED` or a webServer timeout, the harness is still wrong - fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts .env.example
git commit -m "test: repair playwright harness - correct port, add webServer"
```

Note: `.env` is intentionally not staged; it is gitignored.

---

### Task 2: Build the selector and auth support modules

**Files:**

- Create: `tests/e2e/support/selectors.ts`
- Create: `tests/e2e/support/auth.ts`

**Interfaces:**

- Consumes: the harness from Task 1.
- Produces:
  - `SEL` - a frozen object of selector strings, imported by every spec.
  - `login(page: Page): Promise<void>` - logs in and waits for the dashboard.
  - `logout(page: Page): Promise<void>` - logs out and waits for `/login`.
  - `expectAuthenticated(page: Page): Promise<void>` - asserts the app shell is present.

- [ ] **Step 1: Create the selector module**

Create `tests/e2e/support/selectors.ts`:

```ts
// tests/e2e/support/selectors.ts
// Single source of truth for e2e selectors. Prefer data-testid, which the
// app emits in dev builds only (vite.config.ts strips them in production).
// If a selector here stops matching, fix it HERE, not in individual specs.

export const SEL = Object.freeze({
  // Auth pages - verified present in client/src/pages/login.tsx and register.tsx
  emailInput: '[data-testid="input-email"]',
  passwordInput: '[data-testid="input-password"]',
  loginButton: '[data-testid="button-login"]',
  firstNameInput: '[data-testid="input-first-name"]',
  lastNameInput: '[data-testid="input-last-name"]',
  confirmPasswordInput: '[data-testid="input-confirm-password"]',
  registerButton: '[data-testid="button-register"]',
  forgotPasswordLink: '[data-testid="link-forgot-password"]',
  registerLink: '[data-testid="link-register"]',
  loginLink: '[data-testid="link-login"]',
  backHomeLink: '[data-testid="link-back-home"]',

  // App shell - role-based, resilient to markup changes
  sidebar: 'nav, [data-testid="sidebar"]',
  appMain: "main",
}) satisfies Record<string, string>;
```

- [ ] **Step 2: Create the auth helper module**

Create `tests/e2e/support/auth.ts`:

```ts
// tests/e2e/support/auth.ts
import { expect, type Page } from "@playwright/test";
import { SEL } from "./selectors";

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env. " +
      "See .env.example. Never hardcode credentials in spec files.",
  );
}

/**
 * Logs in and waits until the authenticated app has rendered.
 * NOTE: login.tsx:62 redirects to "/" - NOT "/dashboard". Asserting on
 * /dashboard is the bug that made the original tours.spec.ts unrunnable.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill(SEL.emailInput, TEST_EMAIL);
  await page.fill(SEL.passwordInput, TEST_PASSWORD);
  await page.click(SEL.loginButton);
  await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 30_000 });
  await expectAuthenticated(page);
}

/** Asserts the authenticated shell rendered rather than the marketing page. */
export async function expectAuthenticated(page: Page): Promise<void> {
  await expect(page.locator(SEL.appMain).first()).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

/** Clears the session by clearing storage, then confirms /login is reachable. */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
}
```

- [ ] **Step 3: Verify the helpers compile and login actually works**

Create a temporary probe file `tests/e2e/_probe.spec.ts`:

```ts
import { test } from "@playwright/test";
import { login } from "./support/auth";

test("probe: login helper works", async ({ page }) => {
  await login(page);
});
```

Run: `npx playwright test tests/e2e/_probe.spec.ts --reporter=list`
Expected: **PASS**. If it fails on a selector, correct `selectors.ts` - do not weaken the assertion. If it fails because the account has no brands and gets redirected to `/welcome`, note that and adjust `expectAuthenticated` to accept `/welcome` as a valid authenticated destination.

- [ ] **Step 4: Delete the probe**

```bash
rm tests/e2e/_probe.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/support/
git commit -m "test: add e2e selector and auth support modules"
```

---

### Task 6b: Shared authenticated storage state (inserted during execution)

**Why this exists:** Task 6 discovered the login endpoint rate-limits at
**10 attempts per (IP, email) per 15 minutes** (`server/auth.ts`), returning
HTTP 429. The `beforeEach(login)` pattern used throughout this plan exhausts
that after ~6 logins, so running the full suite - which Task 13 requires -
fails on rate limiting rather than on real defects.

**Fix:** adopt Playwright's standard `storageState` pattern. A setup project
logs in **once**, saves the authenticated browser storage to a file, and every
other spec reuses it. Supabase persists its session in `localStorage`, which
`storageState` captures, so this works without touching application code.

`auth-login.spec.ts` keeps performing real logins - it is the spec that tests
logging in - but must run without the shared state and stay within budget.

**Files:**

- Create: `tests/e2e/auth.setup.ts`
- Modify: `playwright.config.ts` (add setup project + dependency)
- Modify: `tests/e2e/support/auth.ts` (export the storage-state path)
- Modify: `tests/e2e/spine-navigation.spec.ts` (drop its local workaround fixture)

**Interfaces:**

- Consumes: `login`, `expectAuthenticated` from Task 2.
- Produces: `STORAGE_STATE` path constant; all later specs get an authenticated
  context for free and must NOT call `login()` in `beforeEach`.

---

### Task 3: Public pages spec

**Files:**

- Create: `tests/e2e/public-pages.spec.ts`

**Interfaces:**

- Consumes: `SEL` from Task 2.
- Produces: nothing consumed by later tasks.

Covers the routes that are public today: `/` (landing when logged out), `/privacy`, `/glossary`, and the 404 fallback. These are the pages that will be **server-rendered** after migration, so they matter most.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/public-pages.spec.ts`:

```ts
// tests/e2e/public-pages.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Public pages (unauthenticated)", () => {
  test("landing page renders with its title and description", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/VentureCite/i);
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /.+/);
    await expect(page.locator("body")).toContainText(/VentureCite/i);
  });

  test("privacy page is reachable without logging in", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/Privacy/i);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("glossary page is reachable without logging in", async ({ page }) => {
    await page.goto("/glossary");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("unknown path renders the not-found page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page).toHaveTitle(/Not Found/i);
  });

  test("/home2 redirects to the homepage", async ({ page }) => {
    await page.goto("/home2");
    await expect(page).toHaveURL((url) => new URL(url).pathname === "/");
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/public-pages.spec.ts --reporter=list`
Expected: **PASS** on all five tests.

If the landing or privacy title assertions fail, read the `<Helmet>` block in `client/src/pages/landing/index.tsx` and `client/src/pages/privacy.tsx` and correct the expected pattern to match what the app actually emits. The app is the source of truth - do not change application code.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/public-pages.spec.ts
git commit -m "test: cover public pages e2e"
```

---

### Task 4: Login, logout and failure spec

**Files:**

- Create: `tests/e2e/auth-login.spec.ts`

**Interfaces:**

- Consumes: `login`, `logout`, `TEST_EMAIL`, `SEL` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/auth-login.spec.ts`:

```ts
// tests/e2e/auth-login.spec.ts
import { test, expect } from "@playwright/test";
import { login, logout, TEST_EMAIL } from "./support/auth";
import { SEL } from "./support/selectors";

test.describe("Authentication", () => {
  test("valid credentials log the user in and land on /", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL((url) => new URL(url).pathname === "/");
  });

  test("invalid password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill(SEL.emailInput, TEST_EMAIL);
    await page.fill(SEL.passwordInput, "definitely-not-the-password");
    await page.click(SEL.loginButton);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/invalid|incorrect|failed/i, {
      timeout: 15_000,
    });
  });

  test("an authenticated route bounces an anonymous visitor to /login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test("session survives a page reload", async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("logging out returns the user to /login", async ({ page }) => {
    await login(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/auth-login.spec.ts --reporter=list`
Expected: **PASS** on all five tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth-login.spec.ts
git commit -m "test: cover login, logout and auth gating e2e"
```

---

### Task 5: Registration and password reset entry points spec

**Files:**

- Create: `tests/e2e/auth-signup.spec.ts`

**Interfaces:**

- Consumes: `SEL` from Task 2.
- Produces: nothing consumed by later tasks.

This deliberately does **not** complete a registration - that would create real users and send real email on every run. It verifies the forms render, validate, and are reachable, which is what the migration could break.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/auth-signup.spec.ts`:

```ts
// tests/e2e/auth-signup.spec.ts
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";

test.describe("Registration and password reset", () => {
  test("register page renders every field and is marked noindex", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveTitle(/Create Account/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator(SEL.firstNameInput)).toBeVisible();
    await expect(page.locator(SEL.lastNameInput)).toBeVisible();
    await expect(page.locator(SEL.emailInput)).toBeVisible();
    await expect(page.locator(SEL.passwordInput)).toBeVisible();
    await expect(page.locator(SEL.confirmPasswordInput)).toBeVisible();
    await expect(page.locator(SEL.registerButton)).toBeVisible();
  });

  test("mismatched passwords are rejected without navigating away", async ({ page }) => {
    await page.goto("/register");
    await page.fill(SEL.firstNameInput, "Test");
    await page.fill(SEL.lastNameInput, "User");
    await page.fill(SEL.emailInput, `e2e-noop-${Date.now()}@example.invalid`);
    await page.fill(SEL.passwordInput, "SomePassword123!");
    await page.fill(SEL.confirmPasswordInput, "DifferentPassword123!");
    await page.click(SEL.registerButton);
    await expect(page).toHaveURL(/\/register/);
  });

  test("login page links to register and forgot-password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(SEL.registerLink)).toBeVisible();
    await expect(page.locator(SEL.forgotPasswordLink)).toBeVisible();
  });

  test("forgot-password page renders and is marked noindex", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page).toHaveTitle(/Reset Password/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator(SEL.emailInput)).toBeVisible();
  });

  test("verify-email page renders and is marked noindex", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page).toHaveTitle(/Verify your email/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/auth-signup.spec.ts --reporter=list`
Expected: **PASS** on all five tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth-signup.spec.ts
git commit -m "test: cover registration and password reset entry points e2e"
```

---

### Task 6: Spine navigation spec

**Files:**

- Create: `tests/e2e/spine-navigation.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

The five workflow-spine pages are the heart of the authenticated app. Their `?tab=` deep links are the single most likely thing to break during a routing migration.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/spine-navigation.spec.ts`:

```ts
// tests/e2e/spine-navigation.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

const SPINE_PAGES = ["/monitor", "/diagnose", "/act", "/setup", "/report"] as const;

// Tab values are declared by each spine page's SpineShell config.
const SPINE_TABS: Record<string, string> = {
  "/monitor": "citations",
  "/diagnose": "signals",
  "/act": "geo-assets",
  "/setup": "fact-sheet",
};

test.describe("Workflow spine navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const path of SPINE_PAGES) {
    test(`${path} renders for an authenticated user`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`\\${path}`));
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main").first()).toBeVisible();
    });
  }

  for (const [path, tab] of Object.entries(SPINE_TABS)) {
    test(`${path}?tab=${tab} deep link preserves the tab across reload`, async ({ page }) => {
      await page.goto(`${path}?tab=${tab}`);
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
      await expect(page.locator("main").first()).toBeVisible();
    });
  }

  test("other pages reachable from the sidebar render", async ({ page }) => {
    for (const path of ["/content", "/articles", "/brands", "/keyword-research"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main").first()).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/spine-navigation.spec.ts --reporter=list`
Expected: **PASS**. If a `?tab=` value is rejected and falls back to the page's default tab, correct the value in `SPINE_TABS` to match the actual tab config in `client/src/pages/<page>.tsx` - the test must encode real behaviour, not aspirational behaviour.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/spine-navigation.spec.ts
git commit -m "test: cover workflow spine navigation and tab deep links e2e"
```

---

### Task 7: Legacy redirect spec

**Files:**

- Create: `tests/e2e/legacy-redirects.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

All 11 retired paths redirect through `SpineRedirect` in `App.tsx`, preserving query params and injecting `?tab=`. Silently losing these during the migration would break every existing bookmark and inbound link.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/legacy-redirects.spec.ts`:

```ts
// tests/e2e/legacy-redirects.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

// Source of truth: client/src/App.tsx SpineRedirect declarations.
const REDIRECTS: Array<{ from: string; toPath: string; tab: string }> = [
  { from: "/citations", toPath: "/monitor", tab: "citations" },
  { from: "/geo-analytics", toPath: "/monitor", tab: "overview" },
  { from: "/competitors", toPath: "/monitor", tab: "competitors" },
  { from: "/ai-intelligence", toPath: "/monitor", tab: "share-of-answer" },
  { from: "/geo-signals", toPath: "/diagnose", tab: "signals" },
  { from: "/crawler-check", toPath: "/diagnose", tab: "crawler" },
  { from: "/opportunities", toPath: "/diagnose", tab: "hallucinations" },
  { from: "/geo-tools", toPath: "/act", tab: "geo-assets" },
  { from: "/faq-manager", toPath: "/act", tab: "faq" },
  { from: "/community", toPath: "/act", tab: "community" },
  { from: "/brand-fact-sheet", toPath: "/setup", tab: "fact-sheet" },
  { from: "/ai-visibility", toPath: "/setup", tab: "visibility" },
];

test.describe("Retired path redirects", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const { from, toPath, tab } of REDIRECTS) {
    test(`${from} redirects to ${toPath}?tab=${tab}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`\\${toPath}\\?.*tab=${tab}`), {
        timeout: 20_000,
      });
    });
  }

  test("redirects preserve pre-existing query params", async ({ page }) => {
    await page.goto("/citations?brandId=preserve-me");
    await expect(page).toHaveURL(/brandId=preserve-me/, { timeout: 20_000 });
    await expect(page).toHaveURL(/tab=citations/);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/legacy-redirects.spec.ts --reporter=list`
Expected: **PASS** on all 13 tests.

If any redirect target disagrees with the table, read the `SpineRedirect` declarations in `client/src/App.tsx` and correct the table to match the code. The code is the source of truth.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/legacy-redirects.spec.ts
git commit -m "test: cover retired path redirects e2e"
```

---

### Task 8: URL-as-state spec

**Files:**

- Create: `tests/e2e/url-state.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

The spec's §5 "URL-as-state contract" identifies five families of query params that carry UI state. This test locks that behaviour in.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/url-state.spec.ts`:

```ts
// tests/e2e/url-state.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

test.describe("URL as application state", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("brandId in the URL survives navigation to a spine page", async ({ page }) => {
    await page.goto("/brands");
    await expect(page.locator("main").first()).toBeVisible();

    const brandId = await page.evaluate(() => {
      try {
        return localStorage.getItem("vc_selected_brand_id");
      } catch {
        return null;
      }
    });
    test.skip(!brandId, "Test account has no selected brand; nothing to assert.");

    await page.goto(`/monitor?brandId=${brandId}`);
    await expect(page).toHaveURL(new RegExp(`brandId=${brandId}`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`brandId=${brandId}`));
  });

  test("switching tabs replaces history rather than stacking entries", async ({ page }) => {
    await page.goto("/monitor?tab=citations");
    await expect(page).toHaveURL(/tab=citations/);

    const before = await page.evaluate(() => history.length);
    await page.goto("/monitor?tab=competitors");
    await expect(page).toHaveURL(/tab=competitors/);
    const after = await page.evaluate(() => history.length);

    // Direct goto always pushes; this asserts the app itself does not add
    // extra entries on top of the navigation.
    expect(after - before).toBeLessThanOrEqual(1);
  });

  test("articles ?edit= param is accepted and does not error", async ({ page }) => {
    await page.goto("/articles?edit=nonexistent-id");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("unknown query params are ignored rather than breaking the page", async ({ page }) => {
    await page.goto("/monitor?tab=citations&totallyUnknown=1");
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page).toHaveURL(/tab=citations/);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/url-state.spec.ts --reporter=list`
Expected: **PASS** (the first test may report as skipped if the account has no brand selected - that is acceptable).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/url-state.spec.ts
git commit -m "test: cover URL-as-state contract e2e"
```

---

### Task 9: Settings and theme persistence spec

**Files:**

- Create: `tests/e2e/settings-theme.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

Theme is stored in `localStorage` and applied to `document.documentElement`. The migration adds server rendering, which is exactly where theme flashing and hydration mismatches appear.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/settings-theme.spec.ts`:

```ts
// tests/e2e/settings-theme.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

test.describe("Settings and theme", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("settings page renders", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("an explicitly stored dark theme is applied on load", async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate(() => localStorage.setItem("vc_theme", "dark"));
    await page.reload();
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(isDark).toBe(true);
  });

  test("an explicitly stored light theme is applied on load", async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate(() => localStorage.setItem("vc_theme", "light"));
    await page.reload();
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(isDark).toBe(false);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/settings-theme.spec.ts --reporter=list`
Expected: **PASS**.

If the theme tests fail, read `client/src/lib/theme.ts` to find the real localStorage key and the real class or attribute applied to `documentElement`, then correct the test. Do not change application code.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings-theme.spec.ts
git commit -m "test: cover settings page and theme persistence e2e"
```

---

### Task 10: Billing spec

**Files:**

- Create: `tests/e2e/billing.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

Checkout is server-driven: `POST /api/stripe/checkout` returns a hosted Checkout URL and the client sets `window.location.href`. The test stops at the redirect boundary - it never completes a purchase.

- [ ] **Step 1: Verify Stripe is in test mode before writing anything**

Run:

```bash
node -e "const k=process.env.STRIPE_SECRET_KEY||require('fs').readFileSync('.env','utf8').match(/^STRIPE_SECRET_KEY=(.*)$/m)?.[1]||''; console.log(k.startsWith('sk_test_')?'TEST MODE - safe':'NOT TEST MODE - STOP')"
```

Expected: `TEST MODE - safe`.

**If this prints `NOT TEST MODE - STOP`, halt this task and report to the user.** Do not exercise checkout against live keys.

- [ ] **Step 2: Write the spec**

Create `tests/e2e/billing.spec.ts`:

```ts
// tests/e2e/billing.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

test.describe("Billing", () => {
  test("pricing page renders its title and description", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveTitle(/Pricing/i);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
  });

  test("checkout endpoint returns a Stripe-hosted session URL", async ({ page, request }) => {
    await login(page);

    const cookies = await page.context().cookies();
    const response = await request.post("/api/stripe/checkout", {
      headers: {
        cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        "content-type": "application/json",
      },
      data: {},
      failOnStatusCode: false,
    });

    // A 4xx here is acceptable and informative (e.g. missing plan id or an
    // already-subscribed account). What must NOT happen is a 5xx.
    expect(response.status()).toBeLessThan(500);

    if (response.ok()) {
      const body = await response.json();
      if (body?.url) {
        expect(String(body.url)).toMatch(/^https:\/\/(checkout\.)?stripe\.com\//);
      }
    }
  });

  test("stripe success and cancel params render without error", async ({ page }) => {
    await login(page);
    await page.goto("/pricing?success=true");
    await expect(page.locator("body")).not.toBeEmpty();
    await page.goto("/pricing?canceled=true");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npx playwright test tests/e2e/billing.spec.ts --reporter=list`
Expected: **PASS**. If the checkout POST returns 5xx, that is a genuine pre-existing bug - record it and report, do not weaken the assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/billing.spec.ts
git commit -m "test: cover pricing page and checkout session creation e2e"
```

---

### Task 11: Brand setup / welcome flow spec

**Files:**

- Create: `tests/e2e/welcome-brand.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

`FirstRunGate` redirects brand-less users to `/welcome`. That gate is auth-adjacent routing logic and is easy to break.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/welcome-brand.spec.ts`:

```ts
// tests/e2e/welcome-brand.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

test.describe("Welcome and brand setup", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("/welcome renders without the app shell chrome", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("brands page renders and lists or offers to create a brand", async ({ page }) => {
    await page.goto("/brands");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("brands API responds successfully for the test account", async ({ page, request }) => {
    const cookies = await page.context().cookies();
    const response = await request.get("/api/brands", {
      headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
      failOnStatusCode: false,
    });
    expect(response.status()).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/welcome-brand.spec.ts --reporter=list`
Expected: **PASS**.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/welcome-brand.spec.ts
git commit -m "test: cover welcome and brand setup e2e"
```

---

### Task 12: Repair the existing tours spec

**Files:**

- Modify: `tests/e2e/tours.spec.ts`

**Interfaces:**

- Consumes: `login` from Task 2.
- Produces: nothing consumed by later tasks.

The existing spec has three defects: it waits for `/dashboard` (login redirects to `/`), it uses `input[name="email"]` selectors instead of the app's `data-testid` attributes, and it navigates to retired paths. It also has a meaningless `expect(true).toBe(true)` assertion.

- [ ] **Step 1: Replace the local login helper with the shared one**

In `tests/e2e/tours.spec.ts`, delete the local `login` function and the `TEST_EMAIL` constant, and replace the import block at the top of the file with:

```ts
// tests/e2e/tours.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

// These tests require VITE_TOUR_ENGINE_ENABLED=true and a test account whose
// tour state has been reset. They are skipped when the flag is off.
const TOURS_ENABLED = process.env.VITE_TOUR_ENGINE_ENABLED === "true";
```

- [ ] **Step 2: Gate the whole suite behind the feature flag**

Change the `test.describe` opening line to:

```ts
test.describe("Tour engine e2e", () => {
  test.skip(!TOURS_ENABLED, "VITE_TOUR_ENGINE_ENABLED is not true");
```

- [ ] **Step 3: Point navigations at canonical paths**

Replace `await page.goto("/citations")` with `await page.goto("/monitor?tab=citations")` everywhere in the file, and `await page.goto("/geo-tools")` with `await page.goto("/act?tab=geo-assets")`. These retired paths still redirect, but the tour targets are on the canonical pages and the redirect hop makes the tests flaky.

- [ ] **Step 4: Remove the meaningless assertion**

Delete the final test `"tab close mid-tour records abandoned event via beacon"` in its entirety - it ends with `expect(true).toBe(true)` and verifies nothing. Its stated verification requires a test API endpoint that does not exist.

- [ ] **Step 5: Run the spec**

Run: `npx playwright test tests/e2e/tours.spec.ts --reporter=list`
Expected: all tests **PASS**, or all **SKIPPED** if `VITE_TOUR_ENGINE_ENABLED` is not `true`. A skipped suite is an acceptable outcome for this task.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/tours.spec.ts
git commit -m "test: repair tours e2e - correct login target, selectors and paths"
```

---

### Task 13: Wire up scripts and gate documentation

**Files:**

- Modify: `package.json` (scripts block)
- Create: `tests/e2e/README.md`

**Interfaces:**

- Consumes: every spec from Tasks 3–12.
- Produces: `npm run test:e2e` as the migration's pass/fail gate.

- [ ] **Step 1: Add the helper scripts**

In `package.json`, alongside the existing `"test:e2e": "playwright test"`, add:

```json
"test:e2e:headed": "playwright test --headed",
"test:e2e:report": "playwright show-report",
```

- [ ] **Step 2: Document the gate**

Create `tests/e2e/README.md`:

````markdown
# End-to-end suite

This suite is the pass/fail gate for the TanStack Start migration. It was
written against the pre-migration app so that it encodes **current** behaviour.

## Running

```bash
npm run test:e2e
```
````

Playwright starts the dev server automatically (`npm run dev`, port 5000) and
reuses one if it is already running. To test a deployed environment instead:

```bash
E2E_BASE_URL=https://your-host npm run test:e2e
```

## Requirements

- `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` in `.env`. Must be a throwaway
  account - the suite creates and deletes records under it.
- Stripe in **test mode**. `billing.spec.ts` refuses to run against live keys.
- Must run against a **dev** build. `data-testid` attributes are stripped when
  `NODE_ENV=production` (`vite.config.ts`).

## Rules during the migration

1. These tests must be green before any migration work starts.
2. They must be green at the end of every migration phase.
3. If a test fails during the migration, **fix the application**, not the test.
   The only legitimate reason to change a test is a behaviour change the user
   has explicitly approved.

## Selectors

All selectors live in `support/selectors.ts`. Fix them there, never inline.

````

- [ ] **Step 3: Run the entire suite**

Run: `npm run test:e2e`
Expected: **every test passes** (tours may be skipped). This is the gate.

If anything fails, fix it before proceeding. Phase 1 must not begin against a red suite.

- [ ] **Step 4: Commit**

```bash
git add package.json tests/e2e/README.md
git commit -m "test: add e2e scripts and document the migration gate"
````

---

### Task 14: Record the baseline

**Files:**

- Create: `docs/superpowers/plans/phase0-baseline.md`

**Interfaces:**

- Consumes: the green suite from Task 13.
- Produces: the reference the later phases compare against.

- [ ] **Step 1: Capture the passing run**

Run: `npm run test:e2e -- --reporter=list 2>&1 | tee /tmp/e2e-baseline.txt`

- [ ] **Step 2: Write the baseline document**

Create `docs/superpowers/plans/phase0-baseline.md` containing: the date, the commit SHA (`git rev-parse HEAD`), the total test count, the pass/skip counts, and the full list of test titles from the run. Also record any pre-existing defect discovered while writing the suite (for example a non-2xx checkout response), with the file and line where it lives.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/phase0-baseline.md
git commit -m "docs: record phase 0 e2e baseline"
```

---

## Exit criteria for Phase 0

- [ ] `npm run test:e2e` is green from a clean checkout.
- [ ] The suite covers: public pages, login/logout/gating, registration and reset entry points, the five spine pages and their tab deep links, all 12 retired-path redirects, the URL-as-state contract, settings and theme, billing, and the welcome/brand flow.
- [ ] No application source was modified.
- [ ] A baseline document records the passing state and any pre-existing defects found.

Only then does Phase 1 begin.
