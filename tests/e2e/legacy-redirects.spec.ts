// tests/e2e/legacy-redirects.spec.ts
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";

// server/auth.ts rate-limits POST /api/auth/login to 10 attempts per
// (IP, email) per 15 minutes (loginRateLimit). This file has 13 tests, so
// logging in once per test via a beforeEach would burn through that budget
// on its own. This file isn't testing login - it relies on the suite-wide
// shared STORAGE_STATE (see tests/e2e/auth.setup.ts and playwright.config.ts's
// "chromium" project), which authenticates exactly ONCE for the whole run, so
// every `page` fixture here starts already logged in with no additional
// login requests. Do NOT add a login() beforeEach here.

// Source of truth: client/src/App.tsx's SpineRedirect declarations
// (App.tsx:196-211), read directly and verified against this table - every
// row below matches the code exactly. (The retired-paths count called out in
// App.tsx's own comment block and the original task brief text says "11";
// the code and this table both actually have 12 - the code is authoritative,
// so 12 is what's tested here.)
const REDIRECTS: Array<{ from: string; toPath: string; tab: string; activeTab?: string }> = [
  { from: "/citations", toPath: "/monitor", tab: "citations" },
  { from: "/geo-analytics", toPath: "/monitor", tab: "citations" },
  { from: "/competitors", toPath: "/monitor", tab: "competitors" },
  // client/src/pages/monitor.tsx's SpineShell tabs are citations,
  // competitors, trends, mentions - "share-of-answer" is NOT one of them
  // (monitor.tsx's own comment explains its Share-of-Answer tab was dropped
  // because the backing prompt_portfolio table is dead). SpineRedirect still
  // faithfully writes ?tab=share-of-answer into the URL - it has no
  // knowledge of the destination's valid tab values - but SpineShell's
  // `tabs.some((t) => t.value === requested) ? requested : defaultTab`
  // fallback (SpineShell.tsx:31) means the tab that actually activates is
  // Monitor's defaultTab, "citations". `activeTab` records that real outcome;
  // the URL is still asserted against the literal `tab` value SpineRedirect
  // writes.
  { from: "/ai-intelligence", toPath: "/monitor", tab: "share-of-answer", activeTab: "citations" },
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
  for (const { from, toPath, tab, activeTab } of REDIRECTS) {
    test(`${from} redirects to ${toPath}?tab=${tab} and renders the destination`, async ({
      page,
    }) => {
      await page.goto(from);

      // SpineRedirect (App.tsx:62-67) force-sets ?tab= to the literal value
      // configured on the route, regardless of whether that value maps to a
      // real tab on the destination (see the /ai-intelligence comment
      // above) - so this URL assertion always uses `tab`, not `activeTab`.
      await expect(page).toHaveURL(new RegExp(`\\${toPath}\\?.*tab=${tab}`), {
        timeout: 20_000,
      });
      await expect(page).not.toHaveURL(/\/login/);

      // A URL match alone proves only that the browser ended up at the
      // right address, not that the workflow-spine page actually rendered
      // (this project has shipped that false positive twice before). Assert
      // the authenticated shell mounted - main#main-content is unique to
      // AppShell (see SEL.authenticatedMain's comment), so this also rules
      // out a silent bounce to the logged-out landing page or /login.
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      // ...and that a real tab is genuinely active, not merely that the URL
      // string contains "tab=". Radix's TabsTrigger id always ends
      // "-trigger-<value>" for whichever tab is truly showing (see
      // SEL.spineActiveTabTrigger's comment). Scoped to the outer tablist's
      // .first() because geo-signals.tsx (mounted under /diagnose?tab=signals)
      // and geo-tools.tsx (mounted under /act?tab=geo-assets) each render a
      // second, nested Tabs further down the tree - spine-navigation.spec.ts
      // hit a Playwright strict-mode "resolved to 2 elements" error without
      // this scoping, so the same pattern is followed here.
      const spineTabList = page.locator(SEL.authenticatedMain).locator(SEL.spineTabList).first();
      const activeTabTrigger = spineTabList.locator(SEL.spineActiveTabTrigger);
      await expect(activeTabTrigger).toHaveAttribute(
        "id",
        new RegExp(`-trigger-${activeTab ?? tab}$`),
      );
    });
  }

  test("redirects preserve pre-existing query params and inject ?tab=", async ({ page }) => {
    await page.goto("/citations?brandId=preserve-me");

    // Both must survive together: SpineRedirect rebuilds URLSearchParams
    // from the incoming search string (App.tsx:63-64), so the pre-existing
    // brandId param must not be dropped, AND ?tab= must be force-set
    // (App.tsx:65) alongside it - proving neither the "preserve existing
    // params" half nor the "inject ?tab=" half of SpineRedirect regressed.
    await expect(page).toHaveURL(/brandId=preserve-me/, { timeout: 20_000 });
    await expect(page).toHaveURL(/tab=citations/);
    await expect(page).not.toHaveURL(/\/login/);

    // And the destination genuinely rendered with the requested tab active -
    // not just that the URL string happens to contain both params.
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();
    const spineTabList = page.locator(SEL.authenticatedMain).locator(SEL.spineTabList).first();
    await expect(spineTabList.locator(SEL.spineActiveTabTrigger)).toHaveAttribute(
      "id",
      /-trigger-citations$/,
    );
  });
});
