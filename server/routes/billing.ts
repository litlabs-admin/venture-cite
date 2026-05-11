// Stripe billing routes (Wave 5.1).
//
// All four endpoints proxy through to Stripe's REST API.
// The webhook is registered separately in server/index.ts because it
// needs raw body access for HMAC verification.
//
// Routes:
//   GET  /api/stripe/publishable-key  — frontend bootstrap
//   GET  /api/stripe/products         — sync'd products + prices for pricing page
//   POST /api/stripe/checkout         — create checkout session (auth-gated)
//   POST /api/billing/portal-session  — open Stripe customer portal (auth-gated)

import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { asyncHandler } from "../lib/routesShared";
import { isAuthenticated } from "../auth";

import { logger } from "../lib/logger";
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
        res.json({ success: false, error: error.message });
      }
    }),
  );

  // Stripe products and prices — fetched directly from Stripe API.
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

        // Validate priceId shape — Stripe price IDs always start with "price_".
        if (!priceId.startsWith("price_")) {
          return res.status(400).json({ success: false, error: "Invalid price ID format" });
        }

        const { getUncachableStripeClient } = await import("../stripeClient");
        const stripe = await getUncachableStripeClient();

        // Verify price exists in our synced Stripe products schema.
        const priceCheck = await db.execute(
          sql`SELECT id FROM stripe.prices WHERE id = ${priceId} AND active = true`,
        );
        if (priceCheck.rows.length === 0) {
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

        const baseUrl = process.env.APP_URL || req.headers.origin || `http://${req.headers.host}`;
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          mode: "subscription",
          success_url: successUrl || `${baseUrl}/pricing?success=true`,
          cancel_url: cancelUrl || `${baseUrl}/pricing?canceled=true`,
          client_reference_id: userId,
        });

        res.json({ success: true, url: session.url });
      } catch (error: any) {
        captureAndFlush(error, { tags: { source: "billing.ts:137" } });
        res.status(500).json({ success: false, error: error.message });
      }
    }),
  );
}
