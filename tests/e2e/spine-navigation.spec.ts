// tests/e2e/spine-navigation.spec.ts
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";

// server/auth.ts rate-limits POST /api/auth/login to 10 attempts per
// (IP, email) per 15 minutes (loginRateLimit) — deliberate anti
// credential-stuffing hardening, out of scope to change in this phase. This
// file has 10 tests, so logging in once per test via a beforeEach (the
// pattern tests/e2e/auth-login.spec.ts uses, appropriately, since IT is
// testing the login flow itself) would burn through that budget on its own.
// This file isn't testing login — it relies on the suite-wide shared
// STORAGE_STATE (see tests/e2e/auth.setup.ts and playwright.config.ts's
// "chromium" project), which authenticates exactly ONCE for the whole run,
// so every `page` fixture here starts already logged in with no additional
// login requests.
const SPINE_PAGES = ["/monitor", "/diagnose", "/act", "/setup", "/report"] as const;

// Tab values, verified directly against each spine page's SpineShell config
// (the code is the source of truth, not the original task brief):
//   client/src/pages/monitor.tsx   -> tabs: overview, citations, competitors, trends, mentions
//   client/src/pages/diagnose.tsx  -> tabs: hallucinations, signals, crawler
//   client/src/pages/act.tsx       -> tabs: create, library, keywords, geo-assets, faq, community
//   client/src/pages/setup.tsx     -> tabs: brands, fact-sheet, visibility
// All four values below matched on inspection; none needed correcting.
//
// client/src/pages/report.tsx renders standalone (useBrandSelection + direct
// /api/dashboard queries) — it does NOT use SpineShell and has no tab strip
// at all, so "/report" is intentionally absent from this map.
const SPINE_TABS: Record<string, string> = {
  "/monitor": "citations",
  "/diagnose": "signals",
  "/act": "geo-assets",
  "/setup": "fact-sheet",
};

test.describe("Workflow spine navigation", () => {
  for (const path of SPINE_PAGES) {
    test(`${path} renders for an authenticated user`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`\\${path}`));
      await expect(page).not.toHaveURL(/\/login/);
      // main#main-content is unique to AppShell, which only mounts for
      // authenticated routes — see selectors.ts. A bare "main" would also
      // match the logged-out marketing landing page and could not prove
      // the authenticated app actually rendered.
      //
      // BUT: AppShell (client/src/components/AppShell.tsx:180) renders
      // main#main-content OUTSIDE the per-route <ErrorBoundary> that App.tsx
      // wraps each page component in (App.tsx:100-108). If the route
      // component throws — or its lazy chunk fails — AppShell still mounts
      // and ErrorBoundary's fallback UI ("Something went wrong",
      // ErrorBoundary.tsx:44) renders INSIDE main#main-content. So this
      // assertion alone would pass even on a crashed page; it only proves
      // the SHELL rendered, not the route. Every case below adds a second,
      // page-unique assertion pulled from the actual page component so a
      // crash is distinguishable from a real render.
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      if (path === "/report") {
        // client/src/pages/report.tsx has no SpineShell tab strip (see the
        // SPINE_TABS comment above), so this is its ONLY assertion in the
        // entire suite — it must not be satisfiable by a crash. Once
        // brands.length > 0 (this account has one — see welcome-brand.spec.ts)
        // and none of the three dashboard queries error (verified live against
        // this account: /api/dashboard/hero, /api/dashboard/citation-trend and
        // /api/geo-analytics all return 200 for it), report.tsx unconditionally
        // renders the "Citation-rate trend" and "By engine" <SectionLabel>s
        // (report.tsx:225-226, :254-255) ABOVE their loading/data ternaries —
        // real, page-specific text nowhere near ErrorBoundary's "Something
        // went wrong" fallback (ErrorBoundary.tsx:44), so this fails if the
        // route crashed instead of rendering.
        await expect(page.getByText("Citation-rate trend", { exact: true })).toBeVisible();
        await expect(page.getByText("By engine", { exact: true })).toBeVisible();
      }
    });
  }

  for (const [path, tab] of Object.entries(SPINE_TABS)) {
    test(`${path}?tab=${tab} deep link activates the requested tab and survives reload`, async ({
      page,
    }) => {
      await page.goto(`${path}?tab=${tab}`);
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      // Prove the app actually honoured ?tab=, not merely that the URL
      // still contains it. `goto` sets the URL itself and a reload
      // preserves it regardless of whether SpineShell reads the param, so a
      // URL-only assertion would pass even if ?tab= were silently ignored
      // and the page fell back to its default tab. Instead assert on the
      // real Radix tab state: the *active* trigger's id must end with
      // "-trigger-<requested tab value>" (see SEL.spineActiveTabTrigger).
      // If SpineShell fell back to defaultTab, the active trigger's id would
      // end with "-trigger-<defaultTab>" instead and this fails.
      //
      // Must scope to the outer spine tablist (.first(), see SEL.
      // spineTabList's comment) — some embedded pages (geo-signals.tsx under
      // /diagnose?tab=signals, geo-tools.tsx under /act?tab=geo-assets) mount
      // a second, nested Tabs of their own, and an unscoped query threw a
      // Playwright strict-mode "resolved to 2 elements" error in practice.
      const spineTabList = page.locator(SEL.authenticatedMain).locator(SEL.spineTabList).first();
      const activeTab = spineTabList.locator(SEL.spineActiveTabTrigger);
      await expect(activeTab).toHaveAttribute("id", new RegExp(`-trigger-${tab}$`));

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
      await expect(spineTabList.locator(SEL.spineActiveTabTrigger)).toHaveAttribute(
        "id",
        new RegExp(`-trigger-${tab}$`),
      );
    });
  }

  test("other pages reachable from the sidebar render", async ({ page }) => {
    for (const path of ["/content", "/articles", "/brands", "/keyword-research"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      // As above (see the SPINE_PAGES loop's comment): main#main-content
      // alone can't distinguish a real render from ErrorBoundary's crash
      // fallback rendering inside it, so each route below gets one more
      // assertion pulled from that page's own component — verified by
      // reading the source, not assumed from the task brief.
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      if (path === "/content") {
        // client/src/pages/content.tsx bootstraps (creates or reuses a
        // draft article) then always renders <DraftToolbar> once `article`
        // loads (content.tsx:650-656), regardless of the article's status
        // (draft/generating/ready) — DraftToolbar always renders its "New
        // Article" button (DraftToolbar.tsx:41-44). Real button text, not
        // matched by ErrorBoundary's "Something went wrong" fallback.
        await expect(page.getByRole("button", { name: "New Article" })).toBeVisible();
      } else if (path === "/articles") {
        // client/src/pages/articles.tsx: this account currently has zero
        // articles in every status (verified live via GET /api/articles —
        // ready/draft/generating/failed/all all return count 0), and the
        // default statusFilter is "ready" (articles.tsx:102), so the page's
        // real, current render is the `articles.length === 0 &&
        // statusFilter === "ready"` branch: an <EmptyState> with heading
        // "No articles yet" (articles.tsx:253-263, empty-state.tsx:31 — an
        // <h2>). That heading only renders on this specific, verified branch
        // of articles.tsx — not on a crash.
        // articles.tsx:253 branches on `articles.length === 0 &&
        // statusFilter === "ready"`: that branch renders <EmptyState> with
        // heading "No articles yet" and NO toolbar; the else branch renders
        // the search/filter toolbar and the list. The two are mutually
        // exclusive, so there is no single always-present element.
        //
        // This previously asserted only the empty state, which coupled the
        // test to the account happening to own zero ready articles. That
        // broke for real: url-state.spec.ts creates a fixture article in
        // beforeAll and deletes it in afterAll, and when the dev server died
        // mid-run the cleanup never executed — leaving a ready article behind
        // and failing this unrelated spec.
        //
        // Asserting "one of the two real states rendered" is state-
        // independent without being weaker: both are genuine page content,
        // and neither matches ErrorBoundary's "Something went wrong".
        await expect(
          page
            .getByRole("heading", { name: "No articles yet" })
            .or(page.getByTestId("input-articles-search")),
        ).toBeVisible();
      } else if (path === "/brands") {
        // client/src/pages/brands.tsx's "Add Your Brand" panel
        // (brands.tsx:369-469) is unconditional — rendered above every
        // loading/error/empty branch, brand-count independent. Same real
        // content welcome-brand.spec.ts already asserts on.
        await expect(page.getByTestId("text-add-brand-heading")).toHaveText("Add Your Brand");
      } else if (path === "/keyword-research") {
        // client/src/pages/keyword-research.tsx's "Filter Status" and "AI
        // Discovery" cards (lines 176-238) are unconditional, rendered
        // above the `!selectedBrandId` / error / loading / empty ternary —
        // data-testid="select-status-filter" (line 186) is real,
        // page-specific markup regardless of whether this account has any
        // keyword research rows yet.
        await expect(page.getByTestId("select-status-filter")).toBeVisible();
      }
    }
  });
});
