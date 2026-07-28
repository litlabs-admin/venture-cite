// tests/e2e/billing.spec.ts
//
// Checkout is server-driven: the client POSTs to /api/stripe/checkout and
// sets window.location.href to the returned hosted Checkout URL. There is no
// Stripe Elements integration anywhere in this app. Every test in this file
// stops at that redirect boundary — none of them ever navigate to a returned
// Stripe URL or submit any payment details.
//
// This suite does NOT call login() / beforeEach(login) — auth comes from the
// shared storageState produced once by tests/e2e/auth.setup.ts (see
// playwright.config.ts's "chromium" project and tests/e2e/support/auth.ts).
// The one exception below opts out with an empty storageState, matching the
// pattern in tests/e2e/public-pages.spec.ts.
//
// HISTORY — client/src/pages/pricing.tsx used to be dead code. The component
// was fully implemented (products grid, checkout mutation, success/canceled
// banners) but no route ever mounted it, so "/pricing" fell through to the
// catch-all 404. This spec pinned that reality rather than the assumed
// "renders its title and description", per the rule that when behaviour
// differs from assumptions, the app is right — encode reality and report it.
//
// It has since been routed deliberately: src/routes/pricing.tsx mounts it as
// a TOP-LEVEL, server-rendered public page (a sibling of privacy.tsx and
// glossary.tsx), NOT under the `_app` layout that carries `ssr: false` — a
// public marketing page has to be crawlable. The assertions below were
// inverted to match, and extended to cover the SSR guarantee that the old
// 404 behaviour never had.
import { test, expect } from "@playwright/test";
import { getBearerToken } from "./support/bearer-token";

// POST /api/stripe/checkout is gated by server/auth.ts's requireAuthForApi,
// which authenticates via a Supabase JWT Bearer token (populated by
// attachUserIfPresent) — this app has no auth cookie at all. Confirmed
// against the real cached storage state: playwright/.auth/state.json has 0
// cookies; the Supabase session lives entirely in localStorage under a key
// like "sb-<project-ref>-auth-token" (see client/src/lib/authStore.ts's
// getAccessToken(), which client/src/lib/queryClient.ts's apiRequest() calls
// to build an `Authorization: Bearer <token>` header on every request).
// Forwarding page.context().cookies() as a Cookie header — the original
// draft of this spec — sends an empty header and never authenticates.
// Extract the real bearer token out of localStorage instead — see
// tests/e2e/support/bearer-token.ts (shared with welcome-brand.spec.ts).

test.describe("Billing", () => {
  test.describe("pricing page (authenticated)", () => {
    test("/pricing is routed and renders the plans", async ({ page }) => {
      await page.goto("/pricing");
      await expect(page).toHaveTitle(/Pricing - VentureCite/i);
      await expect(page.getByRole("heading", { name: /Choose Your GEO Plan/i })).toBeVisible();
      // Must NOT be the old catch-all outcome.
      await expect(page.getByRole("heading", { name: /404 Page Not Found/i })).toHaveCount(0);
    });

    test("stripe success/canceled query params reach the page's banners", async ({ page }) => {
      // pricing.tsx reads these params to show post-checkout banners. That
      // logic was unreachable while the page was unrouted; this pins that it
      // is now actually reachable, and that the params survive the router's
      // search handling (src/router.tsx pins search to string-in/string-out).
      await page.goto("/pricing?success=true");
      await expect(page).toHaveTitle(/Pricing - VentureCite/i);
      await expect(page).toHaveURL(/success=true/);

      await page.goto("/pricing?canceled=true");
      await expect(page).toHaveTitle(/Pricing - VentureCite/i);
      await expect(page).toHaveURL(/canceled=true/);
    });
  });

  test.describe("pricing page (unauthenticated)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("/pricing is public — reachable logged out, and server-rendered", async ({
      page,
      request,
    }) => {
      await page.goto("/pricing");
      await expect(page).toHaveTitle(/Pricing - VentureCite/i);
      await expect(page.getByRole("heading", { name: /Choose Your GEO Plan/i })).toBeVisible();

      // The point of routing this page at the top level rather than under the
      // `ssr: false` _app layout: the plan copy must be in the served bytes,
      // before any JavaScript runs. `request` is a plain HTTP client that
      // never executes scripts, so this fails if /pricing regresses to being
      // client-rendered — which a browser-based assertion could not detect.
      const raw = await (await request.get("/pricing")).text();
      expect(raw).toContain("Choose Your GEO Plan");
    });
  });

  test.describe("checkout endpoint", () => {
    test("POST /api/stripe/checkout requires a priceId", async ({ page, request }) => {
      await page.goto("/");
      const token = await getBearerToken(page);

      const response = await request.post("/api/stripe/checkout", {
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        data: {},
        failOnStatusCode: false,
      });

      // Loose safety net per this spec's charter: a 5xx here would be a
      // genuine, unacceptable bug (server/routes/billing.ts's validation
      // order means an empty body is rejected before any DB or Stripe call,
      // so this branch is deterministic for any account state).
      expect(response.status()).toBeLessThan(500);

      // Precise assertion on the real, verified response for this account —
      // don't just tolerate it.
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ success: false, error: "priceId is required" });

      if (response.ok()) {
        const okBody = body as { url?: string };
        if (okBody.url) {
          expect(String(okBody.url)).toMatch(/^https:\/\/(checkout\.)?stripe\.com\//);
        }
      }
    });

    test("POST /api/stripe/checkout 500s on a well-formed but unrecognized priceId (pre-existing bug, pinned for migration parity) without leaking SQL", async ({
      page,
      request,
    }) => {
      // KNOWN BUG — the 500 itself is not desired behavior, pinned here on
      // purpose so this Phase 0 gate catches any accidental change during
      // the framework migration. The `stripe` Postgres schema is NOT being
      // created/fixed by this change — see below.
      //
      // server/routes/billing.ts's checkout handler runs
      //   SELECT id FROM stripe.prices WHERE id = $1 AND active = true
      // before making any Stripe API call. In this environment the `stripe`
      // Postgres schema does not exist at all — verified directly against
      // DATABASE_URL: `SELECT schema_name FROM information_schema.schemata
      // WHERE schema_name = 'stripe'` returns zero rows (this project's
      // Supabase "Stripe sync" integration was apparently never enabled).
      // The query throws and the handler's catch-all still returns HTTP
      // 500 — that part of the bug is intentionally left as-is.
      //
      // What DID change (information-disclosure fix): the handler used to
      // echo the raw driver error — including the SQL statement text above
      // — straight into the JSON error body. It now logs the full error
      // server-side (logger + Sentry via captureAndFlush) and returns only
      // a generic, stable message to the client. This test asserts the
      // sanitized shape and pins that the SQL text / schema details never
      // reappear in the response body.
      //
      // Separately (and independently): STRIPE_SECRET_KEY here is a
      // syntactically valid sk_test_ key — it satisfies this spec's Step 1
      // safety gate and guarantees no live/production billing can ever be
      // touched — but Stripe's own API rejects it with a 401
      // "Invalid API Key provided" (verified with a direct
      // stripe.products.list() call against this key). That is the exact
      // error server/index.ts's boot sequence logs via
      // setupStripeProducts().catch(...) on every dev-server start ("Stripe
      // product setup failed") — the "Stripe API key error" seen in earlier
      // startup logs. Net effect: even if the stripe.prices row existed, the
      // subsequent stripe.customers.create()/checkout.sessions.create() call
      // would also fail — a genuine https://checkout.stripe.com/... URL
      // cannot be produced from this environment at all right now. The
      // conditional Stripe-host assertion in the previous test is written to
      // stay correct if/when that key is ever fixed.
      await page.goto("/");
      const token = await getBearerToken(page);

      const response = await request.post("/api/stripe/checkout", {
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        data: { priceId: "price_e2e_test_nonexistent" },
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);

      // The fix: no SQL statement text, table/schema names, or query
      // fragments in the response body — only the generic message.
      const rawBody = JSON.stringify(body);
      expect(rawBody).not.toContain("stripe.prices");
      expect(rawBody).not.toContain("SELECT");
      expect(body.error).toBe("Failed to create checkout session");
    });
  });
});
