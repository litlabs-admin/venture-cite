// tests/e2e/auth-login.spec.ts
import { test, expect } from "@playwright/test";
import { login, logout, expectAuthenticated, TEST_EMAIL } from "./support/auth";
import { SEL } from "./support/selectors";

test.describe("Authentication", () => {
  // These three tests exercise the login form / gate itself, so each must
  // start from a genuinely unauthenticated browser context rather than the
  // shared STORAGE_STATE every other spec reuses (see playwright.config.ts's
  // "chromium" project and tests/e2e/auth.setup.ts) — otherwise "valid
  // credentials log the user in" etc. would be exercising an already-logged-in
  // session instead of the real login form flow.
  //
  // Only these two actually perform a real login POST ("an authenticated
  // route bounces an anonymous visitor" never logs in at all) — the reload
  // and logout tests below use the shared authenticated storageState instead
  // of a fresh login, see tests/e2e/README.md's "Shared auth" section for why
  // that split exists (server/auth.ts rate-limits POST /api/auth/login to 10
  // attempts per (IP, email) per 15 minutes).
  test.describe("logged out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

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
      // server/auth.ts's POST /api/auth/login returns
      // { success: false, error: "Invalid email or password" } (status 401)
      // whenever Supabase's signInWithPassword rejects the credentials.
      // login.tsx's onError toasts error.message verbatim, so this exact
      // string is what a real credential-mismatch regression would change.
      // A generic /invalid|incorrect|failed/i pattern would also match the
      // page's *generic* 500 fallback ("Login failed (500)"), so it would
      // still pass even if the real 401 path silently broke — assert the
      // literal server copy instead.
      await expect(page.locator("body")).toContainText(/Invalid email or password/i, {
        timeout: 15_000,
      });
    });

    test("an authenticated route bounces an anonymous visitor to /login", async ({ page }) => {
      // AuthenticatedRoute (client/src/App.tsx) does
      // `window.location.href = "/login"` — a full page navigation, not a
      // client-side wouter redirect — once useAuth() resolves isLoading and
      // finds no user. page.goto + toHaveURL's auto-retrying poll handles
      // that transparently: it just waits for the browser to land on the
      // new document.
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
      // Prove it's actually the gate doing this, not a coincidental redirect
      // from some other route rule: the login form itself must be present.
      await expect(page.locator(SEL.emailInput)).toBeVisible();
    });
  });

  // These two need an *authenticated* context to prove something about it
  // (that the session survives a reload; that it can be genuinely ended) —
  // neither needs to exercise a fresh login POST to do that, so they inherit
  // the shared storageState (playwright.config.ts's "chromium" project) like
  // every other spec, instead of opting out with test.use(...) above.
  test.describe("logged in (shared session)", () => {
    test("session survives a page reload", async ({ page }) => {
      // The shared context starts already authenticated (via STORAGE_STATE),
      // so land on an authenticated page first rather than calling login()
      // (which would burn a real login POST) — then prove the *reload*,
      // not the initial navigation, is what's under test.
      await page.goto("/");
      await expectAuthenticated(page);
      await page.reload();
      // Not just "URL isn't /login" — that alone would also pass if the app
      // fell back to rendering the logged-out landing page at "/" (same URL,
      // see auth.ts's expectAuthenticated). Assert authenticated content
      // actually rendered post-reload.
      await expectAuthenticated(page);
    });

    test("logging out returns the user to /login and actually ends the session", async ({
      page,
    }) => {
      // Confirm this context actually starts authenticated before logging
      // out — otherwise a broken shared storageState could make the
      // post-logout /settings bounce below a false positive (already logged
      // out to begin with, not because logout() worked).
      await page.goto("/");
      await expectAuthenticated(page);
      await logout(page);
      await expect(page).toHaveURL(/\/login/);

      // logout() only clears localStorage/sessionStorage and navigates to
      // /login — it never calls the app's real logout flow (useAuth's
      // logoutMutation, which also POSTs /api/auth/logout and calls
      // supabase.auth.signOut()). Landing on /login proves nothing on its
      // own. Prove the session is genuinely gone by attempting a
      // previously-gated route afterwards: if any credential survived (e.g.
      // a Supabase session persisted somewhere localStorage.clear() doesn't
      // reach), /settings would render instead of bouncing back to /login.
      //
      // logout() clears storage only inside this test's own browser context
      // (page.evaluate against this page's window), and never touches disk —
      // it does not rewrite playwright/.auth/state.json, so it cannot
      // corrupt the shared storage state other specs (or this file's own
      // "logged out" describe block) rely on.
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    });
  });
});
