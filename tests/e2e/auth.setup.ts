// tests/e2e/auth.setup.ts
//
// Playwright "setup project" (see playwright.config.ts's "setup" project and
// the "chromium" project's `dependencies: ["setup"]` / `storageState:
// STORAGE_STATE`). Runs once before the real spec files and ensures
// STORAGE_STATE holds a genuinely authenticated browser storage state
// (cookies + localStorage, including the Supabase session) so every
// dependent spec starts already logged in instead of calling
// POST /api/auth/login itself.
//
// This exists because server/auth.ts rate-limits that endpoint to 10
// attempts per (IP, email) per 15 minutes (loginRateLimit) — a
// beforeEach(login) pattern repeated across every spec file burns through
// that budget almost immediately and turns real defects into 429 flakes.
// Authenticating exactly once here, and only re-authenticating explicitly in
// specs that are testing the login flow itself (auth-login.spec.ts) or that
// need a logged-out context (public-pages.spec.ts), keeps the whole suite
// well under budget.
//
// That budget is shared across an entire 15-minute window, not just one
// suite run: two full runs back-to-back would otherwise cost two setup
// logins plus the specs' own real logins, and 5 real logins/run * 2 runs is
// close enough to the limit that it starts failing with unrelated 429s. So
// this setup step first tries to REUSE a still-valid STORAGE_STATE from a
// previous run instead of unconditionally logging in again: it loads the
// existing file into a fresh browser context, visits a gated route, and
// checks whether that lands on an authenticated page. Only if that check
// fails (file missing, session expired/revoked, bounced to /login) does it
// fall back to a real login() and overwrite the file. Set E2E_FORCE_LOGIN=1
// to skip the reuse check and always perform a fresh login (e.g. when
// intentionally testing against a new account).
import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { login, expectAuthenticated, STORAGE_STATE } from "./support/auth";

// Any authenticated-only route works here: an expired/missing/invalid
// session gets redirected to /login (see client/src/App.tsx's
// AuthenticatedRoute), which expectAuthenticated() below treats as a
// failure. "/" is the app's post-login landing route (see auth.ts's
// AUTHENTICATED_PATHS), so it's guaranteed to be gated.
const GATED_ROUTE = "/";

setup("authenticate", async ({ browser }) => {
  const forceLogin = process.env.E2E_FORCE_LOGIN === "1";
  let reused = false;

  if (forceLogin) {
    console.log("[auth.setup] E2E_FORCE_LOGIN=1 set — skipping cache reuse, logging in fresh.");
  } else if (!fs.existsSync(STORAGE_STATE)) {
    console.log("[auth.setup] No cached storage state found — logging in fresh.");
  } else {
    // Load the existing file into its own context (do NOT touch the
    // "page" fixture's default context — the setup project intentionally
    // has no storageState of its own, see playwright.config.ts) and check
    // whether it's still authenticated before trusting it.
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    try {
      const page = await context.newPage();
      await page.goto(GATED_ROUTE);
      await expectAuthenticated(page);

      // A page-level check alone is NOT sufficient, and trusting it caused
      // real failures. The in-page Supabase client silently refreshes its
      // session, so a gated route can render fine while the *stored* JWT
      // snapshot in this file is already expired. Specs that call the API
      // directly (billing.spec.ts, welcome-brand.spec.ts) extract that raw
      // token via support/bearer-token.ts and got 401s — intermittently at
      // first, since the tests latest in the run are most exposed, then
      // consistently once the token fully lapsed.
      //
      // So validate the token the specs actually use, against a real
      // authenticated endpoint, before trusting the cache.
      const token = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.includes("auth-token")) continue;
          try {
            const parsed = JSON.parse(localStorage.getItem(k) ?? "");
            if (parsed?.access_token) return parsed.access_token as string;
          } catch {
            /* not the entry we want */
          }
        }
        return null;
      });
      if (!token) throw new Error("no access_token in cached storage state");

      const probe = await page.request.get("/api/brands", {
        headers: { authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      });
      if (probe.status() !== 200) {
        throw new Error(`cached bearer token rejected: /api/brands -> ${probe.status()}`);
      }

      reused = true;
      console.log(
        "[auth.setup] Cached storage state is still valid (page + bearer token verified) — reusing it, 0 logins performed.",
      );
    } catch {
      console.log("[auth.setup] Cached storage state is stale/expired — logging in fresh.");
    } finally {
      await context.close();
    }
  }

  if (reused) {
    // The reuse check above already ran expectAuthenticated() successfully
    // against a live page loaded from this exact file, so the file on disk
    // is confirmed good — nothing left to do.
    return;
  }

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await login(page);
    // login() already calls expectAuthenticated() internally, but assert
    // again here explicitly: this setup step is the sole source of truth
    // for every dependent spec's session, so if it silently produced a
    // logged-out or half-authenticated storage state, every downstream
    // spec would fail in confusing, indirect ways instead of failing here
    // with a clear signal.
    await expectAuthenticated(page);
    await context.storageState({ path: STORAGE_STATE });
  } finally {
    await context.close();
  }
});
