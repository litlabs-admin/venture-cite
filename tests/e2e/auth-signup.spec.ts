// tests/e2e/auth-signup.spec.ts
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";

// This deliberately does NOT complete a registration - that would create a
// real Supabase user and send a real verification email on every run.
// These tests only verify the forms render, validate client-side, and are
// reachable. These paths can silently break during router changes.

test.describe("Registration and password reset", () => {
  // The standalone /register sign-up page (client/src/pages/register.tsx) is
  // deleted - sign-up now happens inside the public, pre-account /start
  // onboarding flow (docs/superpowers/specs/2026-09-18-onboarding-data-contract.md).
  // /register itself still exists as a redirect to /start
  // (src/routes/_app/register.tsx) so old bookmarks/emails keep working, but
  // there is no longer a standalone form to fill in or validate here - that
  // coverage belongs with client/src/components/onboarding/.
  test("register redirects to the /start onboarding flow", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/start/);
  });

  test("login page links to sign-up (/start) and forgot-password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(SEL.registerLink)).toBeVisible();
    await expect(page.locator(SEL.registerLink)).toHaveAttribute("href", "/start");
    await expect(page.locator(SEL.forgotPasswordLink)).toBeVisible();
  });

  test("forgot-password page renders and is marked noindex", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page).toHaveTitle(/Reset Password/i);
    // Match the page value. A broad robots locator can match the static tag.
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
    await expect(page.locator(SEL.emailInput)).toBeVisible();
  });

  test("verify-email page renders and is marked noindex", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page).toHaveTitle(/Verify your email/i);
    // Match the page value. A broad robots locator can match the static tag.
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  });
});
