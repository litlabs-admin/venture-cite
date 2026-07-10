import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { getStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { db } from "./db";
import { logger } from "./lib/logger";
import { logSystemAudit } from "./lib/audit";

import { captureAndFlush } from "./lib/sentryReport";
// Map Stripe product names to access tiers
function tierFromProduct(productName: string): string {
  const name = productName.toLowerCase();
  if (name.includes("enterprise")) return "enterprise";
  if (name.includes("pro")) return "pro";
  if (name.includes("beta")) return "beta";
  return "free";
}

// Insert the event.id into the dedupe table. Returns true if this is the
// first time we've seen this event, false if it's already been recorded
// (i.e. Stripe is retrying and we should skip processing).
async function recordStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  const result = await db.execute(sql`
    insert into public.stripe_webhook_events (event_id, event_type)
    values (${eventId}, ${eventType})
    on conflict (event_id) do nothing
    returning event_id
  `);
  return (result as any).rows?.length > 0 || (result as any).length > 0;
}

async function markStripeEventProcessed(eventId: string): Promise<void> {
  await db.execute(sql`
    update public.stripe_webhook_events
    set processed_at = now()
    where event_id = ${eventId}
  `);
}

// True only once the event's side effects have fully completed (processed_at
// stamped). A row can exist with processed_at IS NULL if a prior attempt
// recorded the event but then threw mid-processing — in which case Stripe's
// retry MUST be allowed to re-run the handler, not skipped as a duplicate.
async function isStripeEventProcessed(eventId: string): Promise<boolean> {
  const result = await db.execute(sql`
    select processed_at
    from public.stripe_webhook_events
    where event_id = ${eventId}
    limit 1
  `);
  const rows = (result as any).rows ?? (result as any);
  const row = rows?.[0];
  return Boolean(row && row.processed_at);
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set.");
    }

    const stripe = getStripeClient();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    // Idempotency: Stripe retries on any non-2xx. Skip ONLY events whose side
    // effects previously completed (processed_at stamped). An event recorded
    // but not finished — because a prior attempt threw mid-handler — must be
    // re-run, not silently dropped (that used to permanently lose paid
    // upgrades on any transient DB/Stripe error). Handlers here are idempotent
    // (setter-style updates), so re-running is safe.
    const isFirstTime = await recordStripeEvent(event.id, event.type);
    if (!isFirstTime) {
      if (await isStripeEventProcessed(event.id)) {
        logger.info(
          { eventId: event.id, type: event.type },
          "stripe webhook: duplicate event (already processed) — skipping",
        );
        return;
      }
      logger.warn(
        { eventId: event.id, type: event.type },
        "stripe webhook: event recorded but not finished on a prior attempt — reprocessing",
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) break;

        const updates: {
          stripeCustomerId?: string;
          stripeSubscriptionId?: string;
          accessTier?: string;
        } = {};

        if (session.customer && typeof session.customer === "string") {
          updates.stripeCustomerId = session.customer;
        }
        if (session.subscription && typeof session.subscription === "string") {
          updates.stripeSubscriptionId = session.subscription;
          // Fetch subscription to determine tier
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription, {
              expand: ["items.data.price.product"],
            });
            const product = sub.items.data[0]?.price?.product as Stripe.Product | undefined;
            if (product?.name) {
              updates.accessTier = tierFromProduct(product.name);
            }
          } catch (err) {
            logger.error(
              { err, subscriptionId: session.subscription },
              "stripe: failed to retrieve subscription for tier",
            );
            captureAndFlush(err, { tags: { source: "stripe-webhook.tier-lookup" } });
          }
        }

        if (Object.keys(updates).length > 0) {
          await storage.updateUserStripeInfo(userId, updates);
          logger.info({ userId, updates }, "stripe: checkout.session.completed — user updated");
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user) break;

        const expandedSub = await stripe.subscriptions.retrieve(sub.id, {
          expand: ["items.data.price.product"],
        });
        const product = expandedSub.items.data[0]?.price?.product as Stripe.Product | undefined;
        const tier = product?.name ? tierFromProduct(product.name) : "free";
        const newTier = sub.status === "active" ? tier : "free";
        const previousTier = user.accessTier;

        await storage.updateUserStripeInfo(user.id, {
          stripeSubscriptionId: sub.id,
          accessTier: newTier,
        });
        logger.info(
          { userId: user.id, tier, status: sub.status },
          "stripe: customer.subscription.updated",
        );
        await logSystemAudit(user.id, {
          action: "subscription.update",
          entityType: "subscription",
          entityId: sub.id,
          before: { accessTier: previousTier },
          after: { accessTier: newTier, status: sub.status },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user) break;

        const previousTier = user.accessTier;
        await storage.updateUserStripeInfo(user.id, { accessTier: "free" });
        logger.info({ userId: user.id }, "stripe: customer.subscription.deleted — reset to free");
        await logSystemAudit(user.id, {
          action: "subscription.cancel",
          entityType: "subscription",
          entityId: sub.id,
          before: { accessTier: previousTier },
          after: { accessTier: "free" },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn({ customerId: invoice.customer }, "stripe: invoice.payment_failed");
        break;
      }

      default:
        // Log unhandled event types so we notice unexpected traffic (and so
        // that silent regressions show up in logs rather than disappearing).
        logger.warn({ type: event.type }, "stripe: unhandled webhook event type");
        break;
    }

    await markStripeEventProcessed(event.id);
  }
}
