// tests/e2e/settings-theme.spec.ts
//
// Covers the Settings page and the theme persistence system. This matters
// disproportionately for server rendering.
// theme state lives in `localStorage` and is applied to `<html>` by a
// FOUC-blocking synchronous script in client/index.html BEFORE React
// mounts (see that file's inline <script> and client/src/lib/theme.ts's
// header comment, point 4). Server rendering cannot read `localStorage`
// during the server-side render pass, so this exact mechanism is where
// hydration mismatches and dark-mode flashes can appear.
// These tests define the current behavior for server rendering.
//
// No login() here: this suite runs against the shared `storageState`
// (playwright/.auth/state.json, produced once by tests/e2e/auth.setup.ts -
// see playwright.config.ts's "chromium" project). The login endpoint
// rate-limits at 10 attempts per (IP, email) per 15 minutes
// (server/auth.ts), and a per-test login here would burn into that budget
// for no benefit - every test's context already arrives authenticated.
//
// DISCREPANCY FROM THE BRIEF: the brief guessed localStorage key "vc_theme"
// and assumed only two possible stored values (light/dark). Neither is
// right. The real system, per client/src/lib/theme.ts:
//   - Storage key is THEME_STORAGE_KEY = "vc-theme-v1" (theme.ts:41), not
//     "vc_theme". Verified again in client/index.html:70's FOUC script,
//     which reads the same literal key.
//   - Three theme VALUES exist: "system" | "light" | "dark" (theme.ts:36).
//     "system" is what getStoredTheme() returns when nothing is stored
//     (theme.ts:57-66) - there is no bare "unset" state once you're past
//     the FOUC script's own read.
//   - The applied marker the brief guessed - a `dark` class on
//     `document.documentElement` - IS correct (applyResolvedTheme,
//     theme.ts:107-119), but that function does one more thing the brief
//     didn't mention: it also sets `document.documentElement.style.
//     colorScheme` to "light" or "dark" (theme.ts:115-118), which native
//     form controls/scrollbars key off. Covered below alongside the class
//     check since it's part of the same "applied theme" contract.
//   - When no explicit "light"/"dark" is stored, resolution falls through
//     to the OS `prefers-color-scheme` media query
//     (getSystemTheme/resolveTheme, theme.ts:81-104), with "light" as the
//     hard fallback if that's unavailable too (FALLBACK_THEME, theme.ts:46).
//     The brief's two tests only covered the two explicit-value cases;
//     the "system" resolution path (the one most exposed by an SSR
//     migration, since the server can't read matchMedia either) had no
//     coverage at all. Added below via page.emulateMedia({ colorScheme })
//     for a deterministic OS-preference signal instead of depending on
//     whatever colour scheme the CI host happens to report.
//
// CROSS-TEST / CROSS-SPEC CONTAMINATION: the brief warned that the shared
// storageState carries localStorage between specs. Empirically this file's
// tests (and, per grep, every other e2e spec) rely solely on Playwright's
// default per-test `page`/`context` fixtures - no fixture in this project
// scopes context to "worker" or otherwise reuses a context across tests
// (confirmed: grep for `newContext`/`test.use`/`configure` across
// tests/e2e turns up only auth.setup.ts's one-time login write and the two
// specs that opt OUT of the authenticated storageState). Playwright's
// built-in test isolation creates a brand-new browser context for every
// single test, re-seeded from the static playwright/.auth/state.json file
// on disk; that file is written exactly once (by auth.setup.ts) and is
// never rewritten by ordinary spec tests, so a `localStorage.setItem` call
// inside one test cannot actually leak into another test or another spec
// file under this project's current fixture setup - each test starts
// from the identical on-disk snapshot regardless of what earlier tests
// did in-memory. That said, this file still follows the brief's guidance
// defensively and for readability: every test below sets the exact
// storage precondition it depends on rather than assuming ambient state,
// and an afterEach clears the theme key so a human re-running a single
// test in isolation (or a future change to the fixture setup) doesn't
// change behaviour.
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";

// See the discrepancy note above - this is the REAL key (theme.ts:41),
// not the brief's guessed "vc_theme". Hardcoded here (not imported from
// application source) to match this suite's existing convention of
// pinning literal storage keys directly in the spec with a file:line
// citation (see tests/e2e/url-state.spec.ts's "vc_selected_brand_id").
const THEME_STORAGE_KEY = "vc-theme-v1";

async function getThemeState(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    isDark: document.documentElement.classList.contains("dark"),
    colorScheme: document.documentElement.style.colorScheme,
  }));
}

test.describe("Settings and theme", () => {
  test.afterEach(async ({ page }) => {
    // Defensive cleanup - see the contamination note above. Leaves this
    // file's contexts in the same "nothing stored" state they'd have
    // started in, whether or not that's strictly load-bearing today.
    await page.evaluate((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Best-effort; page may already be navigating away.
      }
    }, THEME_STORAGE_KEY);
  });

  test("settings page renders the account settings sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

    // Strengthened from the brief's bare "main is visible" check, which
    // would pass even if Settings crashed and fell back to some other
    // AppShell-wrapped page. Assert content specific to THIS page:
    // PageHeader's <h1> (client/src/pages/settings.tsx:525) and the
    // Appearance card's ThemeToggle (settings.tsx:195), which only this
    // page mounts. CardTitle (client/src/components/ui/card.tsx:23) renders
    // a plain <div>, not a heading element, so "Profile"/"Appearance" are
    // matched as text, not via getByRole("heading").
    const main = page.locator(SEL.authenticatedMain);
    await expect(page.getByRole("heading", { name: "Account settings", level: 1 })).toBeVisible();
    await expect(main.getByText("Profile", { exact: true })).toBeVisible();
    await expect(main.getByText("Appearance", { exact: true })).toBeVisible();
    await expect(page.locator(SEL.themeToggle)).toBeVisible();
  });

  test("an explicitly stored dark theme is applied on load", async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate((key) => localStorage.setItem(key, "dark"), THEME_STORAGE_KEY);
    await page.reload();

    const { isDark, colorScheme } = await getThemeState(page);
    expect(isDark).toBe(true);
    // applyResolvedTheme (theme.ts:107-119) sets both the class AND the
    // native color-scheme hint - assert the full contract, not just half.
    expect(colorScheme).toBe("dark");
  });

  test("an explicitly stored light theme is applied on load", async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate((key) => localStorage.setItem(key, "light"), THEME_STORAGE_KEY);
    await page.reload();

    const { isDark, colorScheme } = await getThemeState(page);
    expect(isDark).toBe(false);
    expect(colorScheme).toBe("light");
  });

  test("with no stored preference, the resolved theme follows the OS colour-scheme signal", async ({
    page,
  }) => {
    // Not in the brief at all. getStoredTheme() returns "system" when
    // nothing is in storage (theme.ts:57-66), and resolveTheme("system")
    // falls through to getSystemTheme()'s matchMedia check (theme.ts:
    // 81-104). This is the path most exposed by the coming SSR migration
    // (the server can't read matchMedia either), so it deserves direct
    // coverage rather than being left implicit. page.emulateMedia gives a
    // deterministic OS-preference signal instead of depending on whatever
    // colour scheme the test host happens to report.
    // page starts on about:blank, where localStorage is inaccessible
    // (SecurityError) - navigate first to establish a real origin before
    // touching storage.
    await page.goto("/settings");
    await page.evaluate((key) => localStorage.removeItem(key), THEME_STORAGE_KEY);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    let state = await getThemeState(page);
    expect(state.isDark).toBe(true);
    expect(state.colorScheme).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    state = await getThemeState(page);
    expect(state.isDark).toBe(false);
    expect(state.colorScheme).toBe("light");
  });

  test("picking a theme from the Settings UI persists it to localStorage and applies it immediately", async ({
    page,
  }) => {
    // Exercises the write path (ThemeToggle -> useTheme().setTheme ->
    // setStoredTheme + applyResolvedTheme, ThemeProvider.tsx:51-57), not
    // just the read path the brief's two tests covered. No reload
    // involved - proves the in-app toggle applies the class live.
    // page starts on about:blank - navigate first, storage isn't reachable
    // until there's a real origin (see the note in the previous test).
    await page.goto("/settings");
    await page.evaluate((key) => localStorage.removeItem(key), THEME_STORAGE_KEY);

    await page.locator(SEL.themeToggleDark).click();
    await expect(page.locator(SEL.themeToggleDark)).toHaveAttribute("aria-checked", "true");
    let state = await getThemeState(page);
    expect(state.isDark).toBe(true);
    let stored = await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);
    expect(stored).toBe("dark");

    await page.locator(SEL.themeToggleLight).click();
    await expect(page.locator(SEL.themeToggleLight)).toHaveAttribute("aria-checked", "true");
    state = await getThemeState(page);
    expect(state.isDark).toBe(false);
    stored = await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);
    expect(stored).toBe("light");
  });

  test("theme survives client-side navigation, not just a reload", async ({ page }) => {
    // The brief only checked survival across `page.reload()`, which is a
    // full document (re-)load and re-runs the FOUC script every time -
    // exactly the case that already works today. What the migration can
    // actually break is a client-side route change that does NOT hit a
    // fresh document load. Prove this is a genuine in-app navigation (not
    // a disguised full reload) by planting a `window` marker beforehand:
    // a real full-page load would reset it, an SPA navigation via
    // wouter's <Link> (client/src/components/Sidebar.tsx:59) would not.
    // page starts on about:blank - navigate first, storage isn't reachable
    // until there's a real origin (see the note earlier in this file), then
    // set the theme and reload once to have the FOUC script apply it.
    await page.goto("/settings");
    await page.evaluate((key) => localStorage.setItem(key, "dark"), THEME_STORAGE_KEY);
    await page.reload();
    let state = await getThemeState(page);
    expect(state.isDark).toBe(true);

    await page.evaluate(() => {
      (window as unknown as { __e2eNoReloadMarker?: boolean }).__e2eNoReloadMarker = true;
    });

    // Sidebar.tsx's spine nav renders each stage as a wouter <Link>
    // (client-side navigation, no full document load) with the stage
    // label as its accessible name.
    await page.getByRole("link", { name: "Monitor" }).first().click();
    await expect(page).toHaveURL(/\/monitor/);

    const survivedWithoutReload = await page.evaluate(
      () => (window as unknown as { __e2eNoReloadMarker?: boolean }).__e2eNoReloadMarker === true,
    );
    expect(survivedWithoutReload).toBe(true);

    state = await getThemeState(page);
    expect(state.isDark).toBe(true);
    expect(state.colorScheme).toBe("dark");
  });
});
