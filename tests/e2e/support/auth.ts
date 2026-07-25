// tests/e2e/support/auth.ts
// dotenv must load before we read process.env below — the Playwright test
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
// playwright.config.ts's "chromium" project). Lives under playwright/.auth/ —
// Playwright's own documented convention for this — rather than under
// test-results/, which Playwright wipes on every invocation; a single-spec
// run (e.g. `npx playwright test tests/e2e/foo.spec.ts`) still depends on the
// "setup" project having produced this file, and a wiped test-results/ turned
// that into an ENOENT the moment auth.setup.ts wasn't part of the same
// command. playwright/.auth/ is gitignored (see .gitignore) rather than
// anywhere that could be committed — this file holds a real session token.
// Never log or print its contents.
export const STORAGE_STATE = "playwright/.auth/state.json";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env. " +
      "See .env.example. Never hardcode credentials in spec files.",
  );
}

// Destinations the app can land an authenticated user on straight out of
// login.tsx:62 (setLocation("/")). "/" renders through FirstRunGate
// (client/src/App.tsx), which redirects brand-less accounts to "/welcome"
// instead of rendering <Home>. Both are valid "logged in" outcomes.
const AUTHENTICATED_PATHS = new Set(["/", "/welcome"]);

/**
 * Logs in and waits until the authenticated app has rendered.
 * NOTE: login.tsx:62 redirects to "/" — NOT "/dashboard". Asserting on
 * /dashboard is the bug that made the original tours.spec.ts unrunnable.
 * A brand-less test account gets bounced from "/" to "/welcome" by
 * FirstRunGate; both are treated as a successful login here.
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
 * "/" renders through App.tsx's HomePage(), which picks between the
 * authenticated dashboard (AppShell-wrapped) and the logged-out marketing
 * landing page (client/src/pages/landing/index.tsx) based on useAuth()'s
 * isAuthenticated — both live at the SAME url. The landing page also
 * renders a bare <main>, so SEL.appMain ("main") cannot tell them apart: if
 * auth silently broke and the app fell back to the landing page, a plain
 * "main is visible" check would still pass. We therefore assert on
 * SEL.authenticatedMain ("main#main-content"), which only AppShell renders
 * (client/src/components/AppShell.tsx:180) — see selectors.ts for the
 * uniqueness evidence.
 *
 * "/welcome" is rendered by AuthenticatedBareRoute (client/src/App.tsx),
 * which does NOT wrap with AppShell — client/src/pages/welcome.tsx has no
 * <main> element at all — so on that path we assert on the welcome screen's
 * own onboarding input instead.
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
