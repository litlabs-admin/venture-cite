// Stripe billing routes.
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
//
// The route handlers below are thin: request validation, session/dbUser
// lookup, and mapping a service result onto a status code + response body.
// The actual billing logic (Stripe calls, the catalog allow-list, the
// duplicate-subscription guard, the checkout concurrency lock) lives in
// ../services/billing.ts.

import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/routesShared";
import { isAuthenticated } from "../auth";

import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import {
  getStripeProductCatalog,
  createBillingPortalSession,
  listBillingInvoices,
  appUrl,
  createCheckoutSession,
  getSubscriptionSnapshot,
  cancelSubscriptionForCustomer,
  resumeSubscriptionForCustomer,
} from "../services/billing";

export function setupBillingRoutes(app: Express): void {
  // Stripe customer-portal session for the
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
        const session = await createBillingPortalSession(
          dbUser.stripeCustomerId,
          appUrl("/settings"),
        );
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
        const sorted = await getStripeProductCatalog();

        // testMode rides along on the response the pricing page and the
        // billing panel already fetch, so the banner needs no extra request.
        // It leaks nothing: the publishable key on the same page announces
        // test mode anyway.
        const { isStripeTestMode } = await import("../stripeClient");
        res.json({ success: true, data: sorted, testMode: isStripeTestMode() });
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

        const { priceId } = req.body;

        if (!priceId || typeof priceId !== "string") {
          return res.status(400).json({ success: false, error: "priceId is required" });
        }

        // Validate priceId shape - Stripe price IDs always start with "price_".
        if (!priceId.startsWith("price_")) {
          return res.status(400).json({ success: false, error: "Invalid price ID format" });
        }

        const outcome = await createCheckoutSession(sessionUser.id, priceId);
        switch (outcome.kind) {
          case "invalid-price":
            return res.status(400).json({ success: false, error: "Invalid or inactive price" });
          case "already-subscribed":
            return res.status(400).json({ success: false, error: "You're already on this plan." });
          case "switched":
            // No redirect: the change is already live. The client refetches.
            return res.json({ success: true, updated: true });
          case "session":
            return res.json({ success: true, url: outcome.url });
        }
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

  // ─── Subscription state ────────────────────────────────────────────────────
  // Everything the Settings billing panel needs in one call: what they are on,
  // when it renews, whether it is already set to cancel, and the trial end.
  //
  // Read straight from Stripe rather than the users row. The row carries the
  // TIER (what they may do); Stripe carries the SUBSCRIPTION (what happens to
  // their money and when). Rendering a renewal date from our own copy would
  // eventually show a date Stripe disagrees with.
  app.get(
    "/api/billing/subscription",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const sessionUser = (req as any).user;
      const dbUser = await storage.getUser(sessionUser.id);
      if (!dbUser?.stripeCustomerId) {
        // Never subscribed. Not an error - the panel renders its empty state.
        return res.json({ success: true, data: null });
      }
      try {
        const data = await getSubscriptionSnapshot(dbUser.stripeCustomerId);
        return res.json({ success: true, data });
      } catch (err) {
        logger.error({ err, userId: sessionUser.id }, "billing.subscription failed");
        captureAndFlush(err, { tags: { source: "billing.subscription" } });
        return res.status(502).json({ success: false, error: "Could not load your subscription" });
      }
    }),
  );

  // ─── Cancel ────────────────────────────────────────────────────────────────
  // cancel_at_period_end, never an immediate delete. They paid for the period,
  // so they keep it; an immediate cancel takes away time already bought AND is
  // terminal - the subscription cannot be revived, only replaced by a new one.
  // Deferring keeps "Cancel" reversible right up to the renewal date, which is
  // what the resume route below exists for.
  //
  // Access is NOT revoked here. The tier changes only when Stripe actually ends
  // the subscription and fires customer.subscription.deleted.
  app.post(
    "/api/billing/cancel",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const sessionUser = (req as any).user;
      const dbUser = await storage.getUser(sessionUser.id);
      if (!dbUser?.stripeCustomerId) {
        return res.status(400).json({ success: false, error: "No subscription to cancel." });
      }
      try {
        const result = await cancelSubscriptionForCustomer(dbUser.stripeCustomerId, sessionUser.id);
        if (!result) {
          return res.status(400).json({ success: false, error: "No active subscription." });
        }
        return res.json({
          success: true,
          data: {
            cancelAtPeriodEnd: true,
            endsAt: result.endsAt,
          },
        });
      } catch (err) {
        logger.error({ err, userId: sessionUser.id }, "billing.cancel failed");
        captureAndFlush(err, { tags: { source: "billing.cancel" } });
        return res.status(502).json({ success: false, error: "Could not cancel right now" });
      }
    }),
  );

  // Undo a pending cancellation, any time before the period actually ends.
  app.post(
    "/api/billing/resume",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const sessionUser = (req as any).user;
      const dbUser = await storage.getUser(sessionUser.id);
      if (!dbUser?.stripeCustomerId) {
        return res.status(400).json({ success: false, error: "No subscription found." });
      }
      try {
        const result = await resumeSubscriptionForCustomer(dbUser.stripeCustomerId, sessionUser.id);
        if (!result) {
          return res
            .status(400)
            .json({ success: false, error: "Nothing to resume - this plan is not cancelling." });
        }
        return res.json({ success: true });
      } catch (err) {
        logger.error({ err, userId: sessionUser.id }, "billing.resume failed");
        captureAndFlush(err, { tags: { source: "billing.resume" } });
        return res.status(502).json({ success: false, error: "Could not resume right now" });
      }
    }),
  );

  // ─── Invoices ──────────────────────────────────────────────────────────────
  // Read-only list for the Settings panel. Only the fields the table renders
  // are returned: a raw Stripe invoice carries far more than a billing table
  // needs, and shipping all of it to the browser would leak internal ids and
  // customer detail for no benefit.
  app.get(
    "/api/billing/invoices",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const sessionUser = (req as any).user;
      const dbUser = await storage.getUser(sessionUser.id);
      // No billing account yet is an empty list, not an error.
      if (!dbUser?.stripeCustomerId) return res.json({ success: true, data: [] });
      try {
        const data = await listBillingInvoices(dbUser.stripeCustomerId);
        return res.json({ success: true, data });
      } catch (err) {
        logger.error({ err, userId: sessionUser.id }, "billing.invoices failed");
        captureAndFlush(err, { tags: { source: "billing.invoices" } });
        return res.status(502).json({ success: false, error: "Could not load invoices" });
      }
    }),
  );
}
