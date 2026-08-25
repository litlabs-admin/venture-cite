// tests/e2e/support/auth.ts
// dotenv must load before we read process.env below - the Playwright test
// runner process does not inherit .env the way the webServer child process
// does (server/app.ts loads "dotenv/config" itself). Same pattern used by
// tests/integration/*.test.ts and tests/unit/*.test.ts in this repo.
import "dotenv/config";
import { expect, type Page } from "@playwright/test";
import { SEL } from "./selectors";

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

// Where the authenticated browser storage state (cookies + localStorage,
// including the Supabase session token) gets written by tests/e2e/auth.setup.ts
// and read back by every spec that wants to start already logged in (see
// playwright.config.ts's "chromium" project). Lives under playwright/.auth/ -
// Playwright's own documented convention for this - rather than under
// test-results/, which Playwright wipes on every invocation; a single-spec
// run (e.g. `npx playwright test tests/e2e/foo.spec.ts`) still depends on the
// "setup" project having produced this file, and a wiped test-results/ turned
// that into an ENOENT the moment auth.setup.ts wasn't part of the same
// command. playwright/.auth/ is gitignored (see .gitignore) rather than
// anywhere that could be committed - this file holds a real session token.
// Never log or print its contents.
export const STORAGE_STATE = "playwright/.auth/state.json";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env. " +
      "See .env.example. Never hardcode credentials in spec files.",
  );
}

// Destinations the app can land an authenticated user on straight out of
// login.tsx, which still navigates to "/".
//
// "/" is now the PUBLIC, server-rendered landing page (src/routes/index.tsx).
// A per-route SSR flag cannot straddle "landing for logged-out visitors,
// dashboard for logged-in ones" at one URL, so the router separates them.
// "/" always renders Landing, and authenticated visitors are
// redirected to "/dashboard" client-side after hydration. "/dashboard" then
// renders through FirstRunGate, which bounces brand-less accounts to
// "/welcome" instead of rendering <Home>.
//
// So a login settles on "/dashboard" or "/welcome". "/" is deliberately NOT
// in this set even though the browser passes through it: it is a transient
// hop, and accepting it as terminal would let waitForURL resolve before the
// redirect fires, leaving expectAuthenticated() to assert against the
// marketing page and fail intermittently.
const AUTHENTICATED_PATHS = new Set(["/dashboard", "/welcome"]);

/**
 * Logs in and waits until the authenticated app has rendered.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill(SEL.emailInput, TEST_EMAIL);
  await page.fill(SEL.passwordInput, TEST_PASSWORD);
  await page.click(SEL.loginButton);
  await page.waitForURL((url) => AUTHENTICATED_PATHS.has(url.pathname), { timeout: 30_000 });
  await expectAuthenticated(page);
}

/**
 * Asserts the authenticated app rendered rather than the marketing page.
 *
 * The public and authenticated pages can both have a <main> element.
 * Check SEL.authenticatedMain so an auth failure cannot pass as a public page.
 *
 * The welcome page does not render the authenticated app shell.
 * Check its onboarding input instead.
 */
export async function expectAuthenticated(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/);
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/welcome") {
    await expect(page.locator(SEL.welcomeWebsiteInput)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible({ timeout: 30_000 });
  }
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
