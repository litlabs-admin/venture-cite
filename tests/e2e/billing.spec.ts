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
// IMPORTANT FINDING — client/src/pages/pricing.tsx is dead code. It is a
// fully implemented page (products grid, checkout mutation, success/canceled
// banners) but client/src/App.tsx's <Router>/<Switch> never imports or
// routes it — grep confirms no "/pricing" <Route> exists anywhere in
// App.tsx. Corroborated by the landing page's own nav/footer data comments:
// client/src/pages/landing/sections/Nav/data.ts:95 — "The Pricing row is
// gone too — the page's Pricing section was removed." — and
// .../Footer/data.ts:24/31 make the same statement. So "/pricing" falls
// through to the catch-all `<Route component={NotFound} />`. wouter's
// <Switch> matches on pathname alone, before any auth check runs, so this is
// true regardless of login state — confirmed both by code inspection and by
// the two describe blocks below (authenticated + explicitly logged-out).
//
// The tests below encode that REAL behavior rather than the originally
// planned "pricing page renders its title and description" assertion, per
// this phase's rule: when behavior differs from assumptions, the app is
// right — encode reality and report it.
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
    test("/pricing is not wired into the router — falls through to the 404 page", async ({
      page,
    }) => {
      await page.goto("/pricing");
      await expect(page).toHaveTitle(/Not Found/i);
      await expect(
        page.getByRole("heading", { name: /404 Page Not Found/i, level: 1 }),
      ).toBeVisible();
    });

    test("stripe success/canceled query params don't change the 404 outcome", async ({ page }) => {
      // pricing.tsx's success/canceled banners (lines ~172-187) read these
      // params, but since the page is never routed at all, that logic is
      // unreachable — pinning this so a later migration doesn't silently
      // change what "/pricing?success=true" renders without anyone noticing.
      await page.goto("/pricing?success=true");
      await expect(page).toHaveTitle(/Not Found/i);

      await page.goto("/pricing?canceled=true");
      await expect(page).toHaveTitle(/Not Found/i);
    });
  });

  test.describe("pricing page (unauthenticated)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("/pricing 404s the same way logged out — not an auth gate, genuinely unrouted", async ({
      page,
    }) => {
      await page.goto("/pricing");
      await expect(page).toHaveTitle(/Not Found/i);
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
