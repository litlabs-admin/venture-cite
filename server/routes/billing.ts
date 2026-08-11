// Stripe billing routes (Wave 5.1).
//
// All four endpoints proxy through to Stripe's REST API.
// The webhook is registered separately in server/index.ts because it
// needs raw body access for HMAC verification.
//
// Routes:
//   GET  /api/stripe/publishable-key  - frontend bootstrap
//   GET  /api/stripe/products         - sync'd products + prices for pricing page
//   POST /api/stripe/checkout         - create checkout session (auth-gated)
//   POST /api/billing/portal-session  - open Stripe customer portal (auth-gated)

import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/routesShared";
import { isAuthenticated } from "../auth";

import { logger } from "../lib/logger";
import { TRIAL_DAYS } from "@shared/schema";
import { captureAndFlush } from "../lib/sentryReport";
export function setupBillingRoutes(app: Express): void {
  // Foundations Plan 3 Task 2: Stripe customer-portal session for the
  // expanded Settings page. Exposed under /api/billing/* so the new
  // Settings UI has a stable contract.
  app.post(
    "/api/billing/portal-session",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const sessionUser = (req as any).user;
      if (!sessionUser) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const dbUser = await storage.getUser(sessionUser.id);
      if (!dbUser?.stripeCustomerId) {
        return res.status(400).json({
          success: false,
          error: "No billing account on file. Subscribe to a plan first.",
        });
      }
      try {
        const { getUncachableStripeClient } = await import("../stripeClient");
        const stripe = await getUncachableStripeClient();
        const baseUrl = process.env.APP_URL || req.headers.origin || `http://${req.headers.host}`;
        const session = await stripe.billingPortal.sessions.create({
          customer: dbUser.stripeCustomerId,
          return_url: `${baseUrl}/settings`,
        });
        return res.json({ success: true, url: session.url });
      } catch (err: unknown) {
        logger.error({ err, userId: sessionUser.id }, "billing.portal-session failed");
        captureAndFlush(err, { tags: { source: "billing.portal-session" } });
        return res.status(502).json({
          success: false,
          error: "Billing portal temporarily unavailable",
        });
      }
    }),
  );

  app.get(
    "/api/stripe/publishable-key",
    asyncHandler(async (_req, res) => {
      try {
        const { getStripePublishableKey } = await import("../stripeClient");
        const publishableKey = await getStripePublishableKey();
        res.json({ success: true, publishableKey });
      } catch (error: any) {
        // Catch-all around a dynamic import + env lookup - previously had
        // no logging and echoed error.message straight to the client.
        // Status intentionally left as the pre-existing implicit 200 (not
        // touching status semantics here).
        logger.error({ err: error }, "stripe.publishable-key failed");
        captureAndFlush(error, { tags: { source: "billing.ts:publishable-key" } });
        res.json({ success: false, error: "Unable to load billing configuration" });
      }
    }),
  );

  // Stripe products and prices - fetched directly from Stripe API.
  // The dashboard's pricing page consumes the `data` array; failures
  // degrade to an empty array so the page still renders.
  app.get(
    "/api/stripe/products",
    asyncHandler(async (_req, res) => {
      try {
        const { getStripeClient } = await import("../stripeClient");
        const stripe = getStripeClient();

        const [productsResult, pricesResult] = await Promise.all([
          stripe.products.list({ limit: 100, active: true }),
          stripe.prices.list({ limit: 100, active: true }),
        ]);

        const validProducts = productsResult.data.filter((p: any) => p.metadata?.tier);
        const productsMap = new Map<string, any>();

        for (const product of validProducts) {
          productsMap.set(product.id, {
            id: product.id,
            name: product.name,
            description: product.description,
            metadata: product.metadata,
            prices: [],
          });
        }

        for (const price of pricesResult.data) {
          const productId =
            typeof price.product === "string" ? price.product : (price.product as any).id;
          if (productsMap.has(productId)) {
            productsMap.get(productId).prices.push({
              id: price.id,
              unit_amount: price.unit_amount,
              currency: price.currency,
              recurring: price.recurring,
            });
          }
        }

        const sorted = Array.from(productsMap.values()).sort(
          (a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0),
        );

        res.json({ success: true, data: sorted });
      } catch (error: any) {
        logger.error({ err: error }, "Stripe products error");
        res.json({ success: true, data: [] });
      }
    }),
  );

  app.post(
    "/api/stripe/checkout",
    asyncHandler(async (req, res) => {
      try {
        const sessionUser = (req as any).user;
        if (!sessionUser) {
          return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const { priceId, successUrl, cancelUrl } = req.body;

        if (!priceId || typeof priceId !== "string") {
          return res.status(400).json({ success: false, error: "priceId is required" });
        }

        // Validate priceId shape - Stripe price IDs always start with "price_".
        if (!priceId.startsWith("price_")) {
          return res.status(400).json({ success: false, error: "Invalid price ID format" });
        }

        const { getUncachableStripeClient } = await import("../stripeClient");
        const stripe = await getUncachableStripeClient();

        // Verify the price against Stripe itself - the same source of truth
        // GET /api/stripe/products renders the pricing page from.
        //
        // This used to read `stripe.prices`, a table belonging to Supabase's
        // Stripe Sync Engine that is NOT installed on this database (verified:
        // the whole `stripe` schema is absent). The query therefore threw
        // "relation does not exist" on every attempt, was swallowed by the
        // catch below, and returned a generic 500 - i.e. checkout could never
        // succeed for anyone. Validating against a sync table also risked the
        // opposite bug: a price the pricing page happily displays being
        // rejected here because the sync had lagged.
        //
        // The allow-list intent is preserved and unchanged: a caller may only
        // check out an ACTIVE price attached to an ACTIVE product carrying a
        // `tier` metadata key. That is exactly the filter the products
        // endpoint applies, so anything purchasable is something we published,
        // and an arbitrary price ID lifted from another integration is
        // refused.
        let price: import("stripe").Stripe.Price;
        try {
          price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
        } catch {
          return res.status(400).json({ success: false, error: "Invalid or inactive price" });
        }

        const priceProduct = price.product as import("stripe").Stripe.Product;
        const isPurchasable =
          price.active &&
          price.recurring !== null &&
          typeof priceProduct === "object" &&
          !("deleted" in priceProduct && priceProduct.deleted) &&
          priceProduct.active &&
          Boolean(priceProduct.metadata?.tier);

        if (!isPurchasable) {
          return res.status(400).json({ success: false, error: "Invalid or inactive price" });
        }

        const userId = sessionUser.id;
        const user = await storage.getUser(userId);

        let customerId: string | undefined;
        if (user?.stripeCustomerId) {
          customerId = user.stripeCustomerId;
        } else if (user) {
          const customer = await stripe.customers.create({
            email: user.email || undefined,
            metadata: { userId },
          });
          await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
          customerId = customer.id;
        }

        // ── Already subscribed? Change the plan, do not sell a second one. ──
        //
        // This endpoint used to create a Checkout Session unconditionally. A
        // Pro customer clicking "Agency" therefore ended up with TWO live
        // subscriptions and two recurring charges, and because the user row
        // holds a single stripeSubscriptionId, whichever webhook landed last
        // overwrote the other - leaving an orphaned subscription that billed
        // forever with nothing in the app pointing at it. The same path fired
        // on a double-click or a second tab.
        //
        // An existing active subscription is therefore an UPDATE, not a
        // purchase: swap the item's price in place and let Stripe prorate.
        if (customerId) {
          const active = await stripe.subscriptions.list({
            customer: customerId,
            status: "active",
            limit: 10,
          });

          const current = active.data[0];
          if (current) {
            const item = current.items.data[0];
            if (item?.price?.id === priceId) {
              return res
                .status(400)
                .json({ success: false, error: "You're already on this plan." });
            }

            // always_invoice bills the proration immediately rather than
            // parking it on the next invoice, so an upgrade takes effect and
            // is paid for in the same moment the customer asked for it.
            const updated = await stripe.subscriptions.update(current.id, {
              items: [{ id: item.id, price: priceId }],
              proration_behavior: "always_invoice",
              // Carries the user through to customer.subscription.updated,
              // which is what actually re-grants the tier.
              metadata: { userId },
            });

            logger.info(
              { userId, subscriptionId: updated.id, priceId },
              "stripe.checkout: switched plan on existing subscription",
            );
            // No redirect: the change is already live. The client refetches.
            return res.json({ success: true, updated: true });
          }
        }

        const baseUrl = process.env.APP_URL || req.headers.origin || `http://${req.headers.host}`;
        const session = await stripe.checkout.sessions.create(
          {
            customer: customerId,
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "subscription",
            // Stripe owns the trial. The card is collected now, nothing is
            // charged for TRIAL_DAYS, and Stripe bills automatically on the
            // first day after - which is also what gives us
            // customer.subscription.trial_will_end for the reminder email.
            subscription_data: { trial_period_days: TRIAL_DAYS },
            success_url: successUrl || `${baseUrl}/pricing?success=true`,
            cancel_url: cancelUrl || `${baseUrl}/pricing?canceled=true`,
            client_reference_id: userId,
          },
          {
            // Collapses a double-click or a retried request into ONE session
            // instead of two. Scoped to (user, price) so a genuine later
            // purchase of a different plan is unaffected.
            idempotencyKey: `checkout:${userId}:${priceId}`,
          },
        );

        res.json({ success: true, url: session.url });
      } catch (error: any) {
        // Catch-all around the Stripe API calls. Never echo error.message to
        // the client - Stripe errors can carry request IDs and parameter
        // detail we don't want to surface publicly.
        logger.error({ err: error }, "stripe.checkout failed");
        captureAndFlush(error, { tags: { source: "billing.ts:137" } });
        res.status(500).json({ success: false, error: "Failed to create checkout session" });
      }
    }),
  );
}
