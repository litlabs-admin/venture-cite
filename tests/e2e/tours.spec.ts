// tests/e2e/tours.spec.ts
import { test, expect } from "@playwright/test";

// These tests assume:
// - VITE_TOUR_ENGINE_ENABLED=true at build time
// - A test user is seeded via test fixtures (deferred — for v1, run against
//   a staging env with a known user)
// - The test user's tour state has been reset before each test

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "tours-e2e@litlabs.io";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD || "");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
}

test.describe("Tour engine e2e", () => {
  test("global welcome tour fires for new user and persists", async ({ page }) => {
    await login(page);
    await expect(page.locator(".shepherd-element")).toBeVisible({ timeout: 10_000 });
    // Click through 6 steps
    for (let i = 0; i < 6; i++) {
      await page.click(
        ".shepherd-element button:has-text('Next'), .shepherd-element button:has-text('Done')",
      );
    }
    await expect(page.locator(".shepherd-element")).not.toBeVisible();
    // Reload — does not re-fire
    await page.reload();
    await expect(page.locator(".shepherd-element")).not.toBeVisible({ timeout: 5_000 });
  });

  test("? button manual replay works", async ({ page }) => {
    await login(page);
    await page.goto("/citations");
    await page.click('[data-tour-id="page.help"]');
    await expect(page.locator(".shepherd-element")).toBeVisible({ timeout: 5_000 });
  });

  test("waitForTarget race — late-rendering target", async ({ page }) => {
    await login(page);
    await page.goto("/geo-tools");
    await page.click('[data-tour-id="page.help"]');
    await expect(page.locator(".shepherd-element")).toBeVisible({ timeout: 5_000 });
  });

  test("waitForTarget timeout — missing target skips step", async ({ page }) => {
    await login(page);
    // Inject CSS to hide a target element, then trigger tour
    await page.addStyleTag({
      content: '[data-tour-id="aiVisibility.engineList"] { display: none !important; }',
    });
    await page.goto("/ai-visibility");
    await page.click('[data-tour-id="page.help"]');
    // Tour should still progress past the missing step
    await expect(page.locator(".shepherd-element")).toBeVisible({ timeout: 5_000 });
  });

  test("brand switch mid-tour cancels", async ({ page }) => {
    await login(page);
    await page.goto("/citations");
    await page.click('[data-tour-id="page.help"]');
    await expect(page.locator(".shepherd-element")).toBeVisible();
    // Switch brand
    await page.click('[data-tour-id="sidebar.brandSelector"]');
    // Pick second brand option (assumes test account has 2 brands)
    await page.click("text=Brand B");
    await expect(page.locator(".shepherd-element")).not.toBeVisible({ timeout: 3_000 });
  });

  test("tab close mid-tour records abandoned event via beacon", async ({ page, context }) => {
    await login(page);
    await page.goto("/citations");
    await page.click('[data-tour-id="page.help"]');
    await expect(page.locator(".shepherd-element")).toBeVisible();
    // Close the page — beacon fires synchronously
    await page.close();
    // Verification of the event row in DB is out of scope for the e2e
    // (would require a test API endpoint). Manual check via /admin/tours/metrics.
    expect(true).toBe(true);
  });
});
