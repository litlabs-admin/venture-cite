// tests/e2e/public-pages.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Public pages (unauthenticated)", () => {
  // Use an empty storage state. These tests must cover public pages without
  // a saved authenticated session from another test.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page renders with its title and description", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/VentureCite/i);
    // Match the page description exactly. A broad locator can match a static
    // fallback description instead.
    const description = page.locator(
      'meta[name="description"][content="Find where AI overlooks, misreads or undersells you, then fix the pages and sources shaping every answer."]',
    );
    await expect(description).toHaveCount(1);
    await expect(page.locator("body")).toContainText(/VentureCite/i);
  });

  test("privacy page is reachable without logging in", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/Privacy/i);
    // Match the page description exactly. A broad locator can match a static
    // fallback description instead.
    await expect(
      page.locator(
        'meta[name="description"][content="How VentureCite collects, uses, and protects your data."]',
      ),
    ).toHaveCount(1);
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
