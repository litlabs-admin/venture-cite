// tests/e2e/url-state.spec.ts
//
// Covers the app's "URL as state" contract described in the migration
// design spec's §5: a large amount of UI state (selected brand, active
// spine tab, an auto-open dialog target) round-trips through query params,
// always written back with `{ replace: true }` rather than pushed. Tests
// here pin down the REAL behaviour of the current (pre-migration) app, not
// the task brief's assumptions about it — several of those assumptions
// turned out to be wrong; see inline notes at each divergence.
//
// No `login()` here: this suite runs from Task 7 onward against the
// shared `storageState` produced once by tests/e2e/auth.setup.ts
// (playwright.config.ts's "chromium" project). Calling login() per test
// would burn into the 10-attempts-per-15-minutes rate limit
// (server/auth.ts) for no benefit — the context already arrives
// authenticated.
import { test, expect } from "@playwright/test";
import { SEL } from "./support/selectors";
import { STORAGE_STATE } from "./support/auth";

test.describe("URL as application state", () => {
  test("brandId written to the URL persists across reload and matches the localStorage record", async ({
    page,
  }) => {
    await page.goto("/monitor");
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

    // BrandSelector (client/src/components/BrandSelector.tsx:42) renders
    // nothing when the account has zero brands. Discover a REAL brand id
    // from the live UI instead of hoping one is already selected — more of
    // the app's actual behaviour gets exercised this way.
    //
    // This account provably has at least one brand — welcome-brand.spec.ts
    // asserts `text-brands-heading` and a `card-brand-*` directly — so
    // BrandSelector rendering is not optional here; assert it with an
    // awaited, auto-retrying expect() rather than the non-waiting
    // `isVisible()` this used to call. `isVisible()` returns immediately
    // without waiting for /api/brands to resolve and BrandSelector to
    // mount, so it can read `false` while the fetch is still in flight — a
    // genuine regression (BrandSelector broken, or the fetch itself broken)
    // would then silently `test.skip()` instead of failing. The version
    // below only ever ran green because the fetch happened to win that race
    // in practice, not because the check was correct.
    const brandTrigger = page.locator(SEL.brandSelectTrigger);
    await expect(brandTrigger).toBeVisible();

    // useBrandSelection auto-picks a brand (URL > localStorage > brands[0])
    // and persists that pick to localStorage on mount, but does NOT write
    // it into the URL by itself (use-brand-selection.ts:37-49 only calls
    // setPersistedId, never setLocation) — the URL is only ever written by
    // an explicit setSelectedBrandId call, i.e. a real user pick via
    // BrandSelector. So by the time the trigger is visible, localStorage
    // already holds an auto-picked id with nothing in `?brandId=` yet.
    const initialStoredRaw = await page.evaluate(() =>
      localStorage.getItem("vc_selected_brand_id"),
    );
    const initialBrandId = initialStoredRaw ? JSON.parse(initialStoredRaw) : null;

    await brandTrigger.click();
    const optionTestIds = await page
      .locator('[data-testid^="select-brand-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    const optionIds = optionTestIds.map((t) => (t ?? "").replace("select-brand-", ""));
    // Radix's Select only fires onValueChange when the picked value differs
    // from the current one — reselecting the already-active brand is a
    // silent no-op (confirmed empirically: clicking the pre-selected first
    // option left the URL untouched). Pick a DIFFERENT option so this test
    // actually exercises the write path, when the account has more than one
    // brand to choose from.
    const differentId = optionIds.find((id) => id !== initialBrandId);

    if (differentId) {
      await page.locator(`[data-testid="select-brand-${differentId}"]`).click();

      // useBrandSelection.setSelectedBrandId writes `?brandId=` with
      // `{ replace: true }` (client/src/hooks/use-brand-selection.ts:51-65).
      await expect(page).toHaveURL(new RegExp(`brandId=${differentId}`));
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`brandId=${differentId}`));
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      const rawAfterPick = await page.evaluate(() => localStorage.getItem("vc_selected_brand_id"));
      expect(JSON.parse(rawAfterPick as string)).toBe(differentId);
      return;
    }

    // Single-brand account: there is no "different" option to pick via the
    // UI, so exercise the other half of the contract instead — that
    // navigating straight to a `?brandId=` URL (the brief's original
    // scenario: sharing/bookmarking a link) is honoured and survives
    // reload.
    await page.keyboard.press("Escape");
    expect(initialBrandId).not.toBeNull();
    const brandId = initialBrandId as string;
    await page.goto(`/monitor?brandId=${brandId}`);
    await expect(page).toHaveURL(new RegExp(`brandId=${brandId}`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`brandId=${brandId}`));
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

    // localStorage key IS "vc_selected_brand_id" (PERSIST_KEY, use-brand-
    // selection.ts:7) — confirmed against source, matching the brief.
    // BUT: it is written via usePersistedState, which JSON.stringifies the
    // value before storing it (use-persisted-state.ts:26-27:
    // `localStorage.setItem(key, JSON.stringify(next))`). So the raw
    // string in storage is `"<id>"` — WITH quote characters — not the bare
    // id the brief assumed. Reading it raw and comparing directly against
    // the URL value (as the brief's snippet did) would silently mismatch
    // in a strict-equality assertion. JSON.parse it here, exactly as
    // usePersistedState itself does on read (use-persisted-state.ts:14-16),
    // to assert the REAL contract.
    const storedRaw = await page.evaluate(() => localStorage.getItem("vc_selected_brand_id"));
    expect(storedRaw).not.toBeNull();
    const storedBrandId = JSON.parse(storedRaw as string);
    expect(storedBrandId).toBe(brandId);
  });

  test("switching spine tabs replaces the history entry instead of stacking one per tab", async ({
    page,
  }) => {
    // The brief's original version compared `history.length` around two
    // `page.goto()` calls — but `goto` always pushes a new entry regardless
    // of what the app does, so that comparison can never observe whether
    // the APP itself uses replace. The real claim under test is that
    // SpineShell's setTab calls `setLocation(..., { replace: true })`
    // (client/src/components/SpineShell.tsx:33-38). Prove it the only way
    // that's falsifiable: click through several tabs in the live UI, then
    // confirm one Back doesn't walk through them.
    await page.goto("/articles");
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

    await page.goto("/monitor");
    await expect(page).toHaveURL(/\/monitor$/);
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

    const tabList = page.locator(SEL.authenticatedMain).locator(SEL.spineTabList).first();

    await tabList.locator('[id$="-trigger-citations"]').click();
    await expect(page).toHaveURL(/tab=citations/);

    await tabList.locator('[id$="-trigger-competitors"]').click();
    await expect(page).toHaveURL(/tab=competitors/);

    await tabList.locator('[id$="-trigger-trends"]').click();
    await expect(page).toHaveURL(/tab=trends/);

    // If any of those three clicks had PUSHED a history entry, one Back
    // would land on an intermediate tab (e.g. tab=competitors) still under
    // /monitor. Because every click replaced the SAME entry created by the
    // earlier `goto("/monitor")`, one Back must skip past all three tab
    // states straight to the page visited before /monitor.
    await page.goBack();
    await expect(page).toHaveURL(/\/articles$/);
  });

  test.describe("?edit=<id> auto-open contract", () => {
    // BACKGROUND: this account provably has zero articles in EVERY status
    // (verified live: GET /api/articles?status=<ready|draft,generating,
    // failed|generating|failed|all> all returned count 0 for this account
    // at the time this was written). articles.tsx:102 defaults its status
    // filter to "ready" and filters server-side, so /articles renders zero
    // `[data-testid^="card-article-"]` cards no matter what — the previous
    // version of this describe block's two tests used a non-waiting
    // `firstCard.isVisible()` to decide whether to `test.skip()`, which:
    //   1. ALWAYS skipped the positive case here (there is no status with
    //      any rows to switch to — approach 1 in the task brief doesn't
    //      apply), giving it zero effective coverage, and
    //   2. made the negative case ("no dialog opens for a bad id") pass
    //      VACUOUSLY — with no <ViewEditDialog> ever mounted (nothing to
    //      render one against), "dialog not visible" is trivially true
    //      regardless of whether the auto-open contract works at all.
    //      Confirmed: deleting articles.tsx:98,516-517 and ViewEditDialog.
    //      tsx:57-64 entirely would leave both old tests green.
    //
    // FIX: create one real "ready" article via the app's own POST
    // /api/articles (not a direct DB write — genuine app behavior, same
    // endpoint client code would call) so both cases exercise the real
    // component tree. The account is a shared throwaway others also read
    // from, so the fixture is created in beforeAll and hard-deleted in
    // afterAll to leave no residue — see spine-navigation.spec.ts's
    // "/articles ... No articles yet" assertion, which depends on this
    // account staying at zero READY articles between suite runs.
    let brandId: string;
    let articleId: string;

    async function authHeaders(page: import("@playwright/test").Page) {
      const token = await page.evaluate(() => {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
            try {
              const parsed = JSON.parse(window.localStorage.getItem(key) ?? "");
              return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
            } catch {
              // Not the session entry (or malformed) — keep looking.
            }
          }
        }
        return null;
      });
      if (!token) throw new Error("Could not read the Supabase access token from localStorage.");
      return { Authorization: `Bearer ${token}` };
    }

    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext({ storageState: STORAGE_STATE });
      const page = await context.newPage();
      await page.goto("/");
      const headers = await authHeaders(page);

      const brandsRes = await page.request.get("/api/brands", { headers });
      const brandsJson = await brandsRes.json();
      const brand = brandsJson.data?.[0];
      if (!brand?.id) {
        throw new Error("Test account has no brands — cannot create the ?edit= fixture article.");
      }
      brandId = brand.id;

      const createRes = await page.request.post("/api/articles", {
        headers,
        data: {
          brandId,
          title: "E2E fixture — ?edit= auto-open contract",
          content: "Created by tests/e2e/url-state.spec.ts. Safe to delete; removed in afterAll.",
        },
      });
      const createJson = await createRes.json();
      if (!createJson.success || !createJson.article?.id) {
        throw new Error(
          `Failed to create the ?edit= fixture article: ${JSON.stringify(createJson)}`,
        );
      }
      articleId = createJson.article.id;
      await context.close();
    });

    test.afterAll(async ({ browser }) => {
      if (!articleId) return;
      const context = await browser.newContext({ storageState: STORAGE_STATE });
      const page = await context.newPage();
      await page.goto("/");
      const headers = await authHeaders(page);
      await page.request.delete(`/api/articles/${articleId}`, { headers });
      await context.close();
    });

    test("?edit=<id> for a real article opens its edit dialog and clears the query param", async ({
      page,
    }) => {
      await page.goto(`/articles?edit=${articleId}`);
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      // The fixture card must actually be present — a real, awaited
      // assertion (not the old non-waiting `isVisible()`) that this test
      // is exercising a genuine <ViewEditDialog> instance, not nothing.
      await expect(page.locator(`[data-testid="card-article-${articleId}"]`)).toBeVisible();

      // articles.tsx reads `?edit=` and passes `autoOpen={editId === article.id}`
      // to every card's <ViewEditDialog> (client/src/pages/articles.tsx:98,516).
      // ViewEditDialog's effect (ViewEditDialog.tsx:57-64) opens the dialog on
      // the Edit tab and calls onAutoOpenHandled when autoOpen is true on
      // mount; articles.tsx wires that callback to
      // `setLocation("/articles", { replace: true })` (articles.tsx:517).
      await expect(page.locator(SEL.dialog)).toBeVisible();
      await expect(page).toHaveURL(/\/articles$/);
      await expect(page).not.toHaveURL(/edit=/);
    });

    test("?edit=<nonexistent id> does not open a dialog and leaves the query param in place", async ({
      page,
    }) => {
      await page.goto("/articles?edit=nonexistent-id-e2e");
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();

      // The page genuinely has a card — and therefore a real, mounted
      // <ViewEditDialog> with autoOpen=false — so "no dialog opened" below
      // is a meaningful result, not a vacuous one (there is something here
      // that COULD have opened and didn't).
      await expect(page.locator(`[data-testid="card-article-${articleId}"]`)).toBeVisible();

      // DISCREPANCY FROM THE BRIEF: it assumed "?edit=<id> auto-opens a
      // dialog and is then cleared with replace: true" unconditionally. That
      // is only true when editId matches a real article.id. With an id that
      // matches nothing, `autoOpen` is false for every rendered
      // <ViewEditDialog>, so its effect's `if (autoOpen && !open)` guard
      // never fires, `onAutoOpenHandled` — the ONLY thing that clears the
      // param — is never called, and no dialog opens. Verified against the
      // running app: the param survives untouched.
      await expect(page.locator(SEL.dialog)).not.toBeVisible();
      await expect(page).toHaveURL(/edit=nonexistent-id-e2e/);
    });
  });

  test("unknown query params are ignored for routing but preserved across an in-app tab switch", async ({
    page,
  }) => {
    await page.goto("/monitor?tab=citations&totallyUnknown=1");
    await expect(page.locator(SEL.authenticatedMain).first()).toBeVisible();
    await expect(page).toHaveURL(/tab=citations/);
    await expect(page).toHaveURL(/totallyUnknown=1/);

    // Prove the requested tab actually activated — not just that the URL
    // string still contains "tab=citations" (goto sets the URL regardless
    // of whether the app reads it). Same technique as
    // spine-navigation.spec.ts: the active trigger's id must end with
    // "-trigger-citations".
    const tabList = page.locator(SEL.authenticatedMain).locator(SEL.spineTabList).first();
    const activeTab = tabList.locator(SEL.spineActiveTabTrigger);
    await expect(activeTab).toHaveAttribute("id", /-trigger-citations$/);

    // SpineShell.setTab builds its next query string from the CURRENT
    // searchString (`new URLSearchParams(searchString)`,
    // SpineShell.tsx:34) before overwriting only `tab`. So switching tabs
    // in-app must carry `totallyUnknown` along rather than dropping it —
    // proving the extra param is ignored for routing purposes without
    // being silently stripped from the URL (i.e. it doesn't break the
    // replace-based history contract either).
    await tabList.locator('[id$="-trigger-competitors"]').click();
    await expect(page).toHaveURL(/tab=competitors/);
    await expect(page).toHaveURL(/totallyUnknown=1/);
  });
});
