// tests/e2e/public-pages.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Public pages (unauthenticated)", () => {
  // client/src/App.tsx's HomePage() renders "/" differently depending on
  // useAuth().isAuthenticated — the authenticated dashboard vs. the
  // logged-out marketing landing page (client/src/pages/landing/index.tsx).
  // This file is explicitly testing the logged-out marketing pages, but the
  // suite's default "chromium" project now reuses the shared authenticated
  // STORAGE_STATE (see tests/e2e/auth.setup.ts and playwright.config.ts) so
  // that other specs don't re-hit the rate-limited login endpoint. Opt this
  // file back out with a genuinely empty, unauthenticated context —
  // otherwise "landing page renders with its title and description" would
  // assert against the authenticated dashboard instead of the marketing
  // page it's meant to cover.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page renders with its title and description", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/VentureCite/i);
    // client/index.html ships a static crawler-fallback meta[name="description"]
    // (see the "AI / crawler-readable metadata" block) for non-JS crawlers and
    // the pre-hydration document. react-helmet-async *appends* its own
    // page-specific tag rather than replacing it, so client/src/lib/
    // dedupeStaticMeta.ts removes the static duplicate once Helmet mounts its
    // data-rh="true" tag, leaving exactly one meta[name="description"] after
    // hydration. Target the data-rh attribute explicitly anyway — it's the
    // one guaranteed to carry this page's own copy, so asserting against
    // .first() (or against /.+/) would still pass even if this page's
    // <Helmet> block were deleted.
    const description = page.locator('meta[name="description"][data-rh="true"]');
    await expect(description).toHaveAttribute(
      "content",
      /Find where AI overlooks, misreads or undersells you, then fix the pages and sources shaping every answer\./,
    );
    await expect(page.locator("body")).toContainText(/VentureCite/i);
  });

  test("privacy page is reachable without logging in", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/Privacy/i);
    // See the landing test above for why this targets the Helmet-managed
    // tag (data-rh="true") explicitly.
    await expect(page.locator('meta[name="description"][data-rh="true"]')).toHaveAttribute(
      "content",
      /How VentureCite collects, uses, and protects your data\./,
    );
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("glossary page is reachable without logging in", async ({ page }) => {
    await page.goto("/glossary");
    await expect(page).not.toHaveURL(/\/login/);
    // client/src/pages/glossary.tsx sets document.title and patches the
    // existing meta[name="description"] in place inside a useEffect. Assert
    // on both the title and a distinctive piece of real page content so this
    // fails if the page crashed or rendered empty, rather than just
    // asserting the body has *some* non-empty output.
    await expect(page).toHaveTitle(/GEO vs AEO vs SEO/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /Generative Engine Optimization/,
    );
    await expect(page.getByRole("heading", { name: "GEO vs AEO vs SEO", level: 1 })).toBeVisible();
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
