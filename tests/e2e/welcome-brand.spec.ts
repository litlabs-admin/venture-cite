// tests/e2e/welcome-brand.spec.ts
//
// Covers the welcome / first-run flow: client/src/pages/welcome.tsx (routed
// through App.tsx's AuthenticatedBareRoute, the one authenticated route that
// does NOT wrap in AppShell) and client/src/pages/brands.tsx (routed through
// the normal AppShell-wrapped AuthenticatedRoute).
//
// No login() / beforeEach(login) here: this suite runs from Task 7 onward
// against the shared storageState produced once by tests/e2e/auth.setup.ts
// (playwright.config.ts's "chromium" project + "setup" dependency). Calling
// login() per test would burn into the 10-attempts-per-(IP,email)-per-15-min
// rate limit (server/auth.ts) for no benefit - the context already arrives
// authenticated.
//
// IMPORTANT: /welcome renders WITHOUT AppShell (client/src/App.tsx:111-130,
// 178 - AuthenticatedBareRoute, not FirstRunGate), so it has no
// `main#main-content` at all. SEL.authenticatedMain will correctly NOT match
// there - asserting its absence is itself part of what this suite pins down,
// not a workaround for a missing selector. SEL.welcomeWebsiteInput
// ('[data-testid="input-website"]', client/src/pages/welcome.tsx:464) is the
// real, unconditional marker of the page's initial "input" scene and is used
// instead, matching the existing convention in tests/e2e/support/auth.ts's
// expectAuthenticated().
//
// DISCREPANCY FROM THE BRIEF (routing): the brief frames /welcome as reached
// via "FirstRunGate redirects brand-less users to /welcome". That is true for
// "/" and "/dashboard" (both wrapped in FirstRunGate, App.tsx:169,179), but
// /welcome's OWN route (App.tsx:178) is wired to AuthenticatedBareRoute, which
// only checks isAuthenticated - it does NOT check brand count. So this test
// account (which has an existing brand - see the brands-API test below) can
// still navigate to /welcome directly and get the real onboarding screen,
// not a bounce back to "/". Confirmed empirically below, not just by reading
// the router.
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";
import { getBearerToken } from "./support/bearer-token";

// Same technique as tests/e2e/billing.spec.ts's getBearerToken(): auth here
// is a Supabase JWT carried as an `Authorization: Bearer` header populated
// client-side from localStorage (client/src/lib/authStore.ts's
// getAccessToken(), consumed by client/src/lib/queryClient.ts's
// apiRequest()) - NOT a cookie. The cached storageState has 0 cookies.
// Forwarding page.context().cookies() (the brief's original approach) would
// send an empty Cookie header and never authenticate the request. See
// tests/e2e/support/bearer-token.ts (shared with billing.spec.ts).

test.describe("Welcome and brand setup", () => {
  test("/welcome renders the onboarding screen, not the AppShell chrome", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/welcome$/);

    // Real, specific content from welcome.tsx's initial "input" scene
    // (lines 449-497), not a generic "body is non-empty" check that would
    // also pass on a crashed/blank page.
    await expect(page.getByRole("heading", { name: "Let's establish your brand" })).toBeVisible();
    await expect(page.locator(SEL.welcomeWebsiteInput)).toBeVisible();
    await expect(page.getByTestId("button-find-brand")).toBeVisible();

    // Pin the AppShell asymmetry itself: AuthenticatedBareRoute renders no
    // <main id="main-content"> at all on this route (see file header).
    await expect(page.locator(SEL.authenticatedMain)).toHaveCount(0);
  });

  test("brands page renders through AppShell and lists the test account's brand", async ({
    page,
  }) => {
    await page.goto("/brands");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

    // The "Add Your Brand" panel (client/src/pages/brands.tsx:369-469) is
    // always rendered, brand-count-independent - real, specific content.
    await expect(page.getByTestId("text-add-brand-heading")).toHaveText("Add Your Brand");
    await expect(page.getByTestId("input-website-url")).toBeVisible();
    await expect(page.getByTestId("button-analyze-website")).toBeVisible();

    // This test account is authenticated and has at least one brand (task
    // constraint - several other specs, e.g. url-state.spec.ts and
    // expectAuthenticated()'s "/" path, depend on that brand continuing to
    // exist, so this suite must never delete it). With brands.length > 0,
    // brands.tsx renders the "Your Brands (N)" heading and one
    // `[data-testid^="card-brand-"]` per brand (lines 495-594) instead of
    // the <EmptyState> branch - assert the real, non-empty branch rather
    // than tolerating either.
    await expect(page.getByTestId("text-brands-heading")).toBeVisible();
    await expect(page.getByTestId("text-brands-heading")).toContainText(/Your Brands \(\d+\)/);
    const brandCards = page.locator('[data-testid^="card-brand-"]');
    await expect(brandCards.first()).toBeVisible();
    expect(await brandCards.count()).toBeGreaterThan(0);
  });

  test("brands API responds successfully for the test account and returns real brand data", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const token = await getBearerToken(page);

    const response = await request.get("/api/brands", {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });

    // Precise assertion on the real, verified response for this account
    // (server/routes/brands.ts:44-55: GET /api/brands is unconditional
    // `res.json({ success: true, data: brands })` - no non-200 branch
    // exists once requireAuthForApi lets the request through) - not just
    // "status < 500" tolerance per this task's tightened bar.
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Shape-check one real brand record rather than just its presence.
    const brand = body.data[0];
    expect(typeof brand.id).toBe("string");
    expect(typeof brand.name).toBe("string");
  });
});
