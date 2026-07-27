// tests/e2e/auth-signup.spec.ts
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";

// This deliberately does NOT complete a registration — that would create a
// real Supabase user and send a real verification email on every run.
// These tests only verify the forms render, validate client-side, and are
// reachable — the parts a framework migration could silently break.

test.describe("Registration and password reset", () => {
  test("register page renders every field and is marked noindex", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveTitle(/Create Account/i);
    // client/index.html ships a static crawler-fallback meta[name="robots"]
    // (content="index, follow, max-image-preview:large, max-snippet:-1"),
    // and react-helmet-async *appends* its own page-specific tag rather
    // than replacing it, so /register legitimately renders two
    // meta[name="robots"] elements.
    //
    // React 19 hoists <title>/<meta>/<link> children rendered anywhere in
    // the tree directly into <head> itself, so Helmet's data-rh="true"
    // marker no longer appears on the tags it manages — react-helmet-async
    // is expected to be removed entirely once the framework migration
    // lands, at which point this marker disappears for good. Locate the
    // tag by its exact page-specific content instead: a bare
    // meta[name="robots"] locator matches both tags (a Playwright
    // strict-mode violation) and, worse, would still find non-empty
    // "content" text if the noindex Helmet tag were deleted, since the
    // static fallback's content is also non-empty. Matching the exact
    // literal content="noindex" only matches this page's own tag, never
    // the static "index, follow, ..." fallback.
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
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
    // client/src/pages/register.tsx renders a live "Passwords do not
    // match" message the instant confirmPassword diverges from password,
    // and disables button[data-testid="button-register"] via
    // `disabled={... || !passwordsMatch}` — the button never becomes
    // clickable for a mismatched pair, so there is nothing to click here.
    // (Playwright's .click() would just hang against actionability
    // checks until the mismatch resolves, which it never does.) Assert on
    // both real pieces of feedback the app renders, not just the URL:
    // asserting the URL alone would still pass if the button silently did
    // nothing, or if the page crashed before ever wiring up validation.
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    await expect(page.locator(SEL.registerButton)).toBeDisabled();
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
    // See the register test above for why this must target the exact
    // literal content="noindex" tag rather than a bare
    // meta[name="robots"] locator or the now-absent data-rh="true" marker.
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
    await expect(page.locator(SEL.emailInput)).toBeVisible();
  });

  test("verify-email page renders and is marked noindex", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page).toHaveTitle(/Verify your email/i);
    // See the register test above for why this must target the exact
    // literal content="noindex" tag rather than a bare
    // meta[name="robots"] locator or the now-absent data-rh="true" marker.
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  });
});
