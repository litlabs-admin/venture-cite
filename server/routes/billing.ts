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

// When the current period ends, in unix seconds.
//
// Stripe moved current_period_end OFF the subscription and onto the
// subscription ITEM. Reading it from the subscription returns undefined on
// this API version, which rendered "Cancels on period end" with no date - the
// one fact a cancellation notice actually needs. Subscription-level is kept as
// a fallback so an older API version still resolves.
function periodEnd(sub: import("stripe").Stripe.Subscription): number | undefined {
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const onSub = (sub as unknown as { current_period_end?: number }).current_period_end;
  return item?.current_period_end ?? onSub ?? sub.cancel_at ?? undefined;
}

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
          // status "all", then filter - NOT status:"active".
          //
          // A trialing subscription is a real, live subscription with a card
          // behind it; Stripe just has not charged it yet. Listing only
          // "active" missed every trialing customer, so anyone upgrading
          // during their trial fell through to Checkout and ended up with a
          // SECOND subscription - the exact double-billing this block exists
          // to prevent. Most upgrades happen during a trial, so the guard was
          // missing the common case.
          const existing = await stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 20,
          });

          const current = existing.data.find(
            (x) => x.status === "active" || x.status === "trialing",
          );
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
            // Forward, not back to the page they just left. They came here to
            // start using the product; dropping them on the pricing page with
            // a green tick makes them find their own way in. /welcome is the
            // next real step, and it forwards to the dashboard by itself if
            // they already have a brand.
            success_url: successUrl || `${baseUrl}/welcome?checkout=success`,
            cancel_url: cancelUrl || `${baseUrl}/pricing?canceled=true`,
            client_reference_id: userId,
          },
          {
            // Collapses a double-click or a retried request into ONE session
            // instead of two. Scoped to (user, price) so a genuine later
            // purchase of a different plan is unaffected.
            //
            // The minute bucket is load-bearing. Stripe caches an idempotent
            // response for 24 HOURS, and a Checkout session also lives 24
            // hours - so a key without a time component replays the SAME
            // session right up to the moment it dies, and then keeps replaying
            // it. Anyone who opened checkout and did not finish got handed
            // that dead session on every subsequent click, for the rest of the
            // day, with no way out: Stripe renders "You're all done here" and
            // the button appears to do nothing. Observed in production -
            // damienwoods7 clicked Pro at 16:42, and every later attempt
            // returned that expired session instead of a new one.
            //
            // A double-click or an auto-retry lands within the same minute,
            // which is all this was ever meant to collapse. Straddling a
            // minute boundary makes one extra unused session, which costs
            // nothing and expires by itself - the opposite failure is a
            // customer who cannot pay.
            idempotencyKey: `checkout:${userId}:${priceId}:${Math.floor(Date.now() / 60_000)}`,
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
        const { getStripeClient } = await import("../stripeClient");
        const stripe = getStripeClient();
        const subs = await stripe.subscriptions.list({
          customer: dbUser.stripeCustomerId,
          status: "all",
          limit: 10,
          // "data.items.data.price" is already Stripe's 4-level expand limit;
          // adding ".product" makes it 5 and the whole call 400s
          // (property_expansion_max_depth), which surfaced as the billing
          // panel silently showing no subscription at all. The product is
          // fetched separately below instead.
          expand: ["data.items.data.price"],
        });
        // A customer can carry cancelled subscriptions from earlier signups;
        // the live one is what the panel is about.
        const sub =
          subs.data.find((x) => x.status === "active" || x.status === "trialing") ??
          subs.data.find((x) => x.status === "past_due");
        if (!sub) return res.json({ success: true, data: null });

        const item = sub.items.data[0];
        // price.product is an id string at this expand depth. One extra fetch
        // is cheaper than losing the whole panel to an expansion error.
        const productId =
          typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id;
        const product = productId
          ? await stripe.products.retrieve(productId).catch(() => undefined)
          : undefined;
        return res.json({
          success: true,
          data: {
            status: sub.status,
            planName: product?.name ?? null,
            tier: product?.metadata?.tier ?? null,
            amount: item?.price?.unit_amount ?? null,
            currency: item?.price?.currency ?? "usd",
            interval: item?.price?.recurring?.interval ?? "month",
            currentPeriodEnd: periodEnd(sub),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            trialEnd: sub.trial_end,
          },
        });
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
        const { getStripeClient } = await import("../stripeClient");
        const stripe = getStripeClient();
        const subs = await stripe.subscriptions.list({
          customer: dbUser.stripeCustomerId,
          status: "all",
          limit: 10,
        });
        const sub = subs.data.find((x) => x.status === "active" || x.status === "trialing");
        if (!sub) {
          return res.status(400).json({ success: false, error: "No active subscription." });
        }
        const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
        logger.info(
          { userId: sessionUser.id, subscriptionId: sub.id },
          "billing.cancel: set to cancel at period end",
        );
        return res.json({
          success: true,
          data: {
            cancelAtPeriodEnd: true,
            endsAt: periodEnd(updated),
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
        const { getStripeClient } = await import("../stripeClient");
        const stripe = getStripeClient();
        const subs = await stripe.subscriptions.list({
          customer: dbUser.stripeCustomerId,
          status: "all",
          limit: 10,
        });
        const sub = subs.data.find(
          (x) => (x.status === "active" || x.status === "trialing") && x.cancel_at_period_end,
        );
        if (!sub) {
          return res
            .status(400)
            .json({ success: false, error: "Nothing to resume - this plan is not cancelling." });
        }
        await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
        logger.info(
          { userId: sessionUser.id, subscriptionId: sub.id },
          "billing.resume: cancellation reversed",
        );
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
        const { getStripeClient } = await import("../stripeClient");
        const stripe = getStripeClient();
        const invoices = await stripe.invoices.list({
          customer: dbUser.stripeCustomerId,
          limit: 24,
        });
        return res.json({
          success: true,
          data: invoices.data
            // A draft is not a bill anyone owes yet; listing one reads as a
            // surprise charge.
            .filter((inv) => inv.status && inv.status !== "draft")
            .map((inv) => ({
              id: inv.id,
              number: inv.number,
              status: inv.status,
              amountPaid: inv.amount_paid,
              amountDue: inv.amount_due,
              currency: inv.currency,
              created: inv.created,
              hostedInvoiceUrl: inv.hosted_invoice_url,
              invoicePdf: inv.invoice_pdf,
            })),
        });
      } catch (err) {
        logger.error({ err, userId: sessionUser.id }, "billing.invoices failed");
        captureAndFlush(err, { tags: { source: "billing.invoices" } });
        return res.status(502).json({ success: false, error: "Could not load invoices" });
      }
    }),
  );
}
