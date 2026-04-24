import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { getStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { db } from "./db";
import { logger } from "./lib/logger";
import { Sentry } from "./instrument";
import { verifyShopifyHmac } from "./lib/shopifyWebhook";
import { logSystemAudit } from "./lib/audit";
import { dollarsToCents } from "@shared/money";

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

    // Idempotency: Stripe retries on any non-2xx. If we've seen this event
    // before, return immediately without re-applying side effects.
    const isFirstTime = await recordStripeEvent(event.id, event.type);
    if (!isFirstTime) {
      logger.info(
        { eventId: event.id, type: event.type },
        "stripe webhook: duplicate event — skipping",
      );
      return;
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
            Sentry.captureException(err, { tags: { source: "stripe-webhook.tier-lookup" } });
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

  // ────────────────────────────────────────────────────────────────────
  // Shopify
  // ────────────────────────────────────────────────────────────────────
  //
  // Shopify identifies each delivery with a `X-Shopify-Webhook-Id`
  // header. Recording it in `shopify_webhook_events` lets us short-
  // circuit the inevitable retries on transient failures.
  //
  // Caller is responsible for HMAC verification BEFORE delegating
  // here. We accept the raw body so the caller can do both with one
  // pass; re-verifying inside this method would couple the two.

  static async processShopifyOrder(
    payload: Buffer,
    headers: { hmac: string; webhookId: string; topic: string; shopDomain?: string },
  ): Promise<{
    processed: boolean;
    reason?: "duplicate" | "invalid_signature" | "missing_secret";
  }> {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      // Fail closed — without a secret, every request is unauthenticated.
      return { processed: false, reason: "missing_secret" };
    }

    if (!verifyShopifyHmac(payload, headers.hmac, secret)) {
      return { processed: false, reason: "invalid_signature" };
    }

    const isFirstTime = await recordShopifyEvent(
      headers.webhookId,
      headers.topic,
      headers.shopDomain,
    );
    if (!isFirstTime) {
      logger.info(
        { webhookId: headers.webhookId, topic: headers.topic },
        "shopify webhook: duplicate event — skipping",
      );
      return { processed: false, reason: "duplicate" };
    }

    let orderData: Record<string, unknown>;
    try {
      orderData = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
    } catch (err) {
      logger.error({ err }, "shopify webhook: malformed JSON body");
      Sentry.captureException(err, { tags: { source: "shopify-webhook.json-parse" } });
      throw err;
    }

    const referrer = String(
      (orderData.referring_site as string | undefined) ??
        (orderData.source_name as string | undefined) ??
        "",
    );
    const noteAttrs = Array.isArray(orderData.note_attributes)
      ? (orderData.note_attributes as Array<{ name?: string; value?: string }>)
      : [];
    const articleId = noteAttrs.find((a) => a.name === "article_id")?.value ?? null;
    const brandId = noteAttrs.find((a) => a.name === "brand_id")?.value ?? null;
    const lineItems = Array.isArray(orderData.line_items)
      ? (orderData.line_items as Array<{ name?: string; quantity?: number }>)
      : [];

    // `revenue` is NOT NULL in the schema (numeric stored as string).
    // Shopify always sends `total_price` as a string for paid orders, but
    // be defensive in case Shopify ever omits it (free $0 orders, refunds).
    // Wave 4.1: also write integer cents so analytics rollups can sum
    // bigints exactly without JS Number precision loss.
    const revenue = typeof orderData.total_price === "string" ? orderData.total_price : "0";
    const revenueCents = dollarsToCents(revenue) ?? 0;
    const currency = typeof orderData.currency === "string" ? orderData.currency : "USD";

    await storage.createPurchaseEvent({
      articleId,
      brandId,
      aiPlatform: referrer.toLowerCase().includes("chatgpt")
        ? "ChatGPT"
        : referrer.toLowerCase().includes("claude")
          ? "Claude"
          : "Unknown",
      ecommercePlatform: "Shopify",
      orderId: orderData.id != null ? String(orderData.id) : null,
      revenue,
      revenueCents,
      currency,
      productName: lineItems[0]?.name ?? null,
      quantity: lineItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0) || 1,
      customerEmail: typeof orderData.email === "string" ? orderData.email : null,
      webhookData: orderData,
    });

    await markShopifyEventProcessed(headers.webhookId);
    return { processed: true };
  }
}

// Insert the webhook id into the dedupe table. Returns true when this is
// the first time we've seen this id; false on a Shopify retry.
async function recordShopifyEvent(
  webhookId: string,
  topic: string,
  shopDomain?: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    insert into public.shopify_webhook_events (webhook_id, topic, shop_domain)
    values (${webhookId}, ${topic}, ${shopDomain ?? null})
    on conflict (webhook_id) do nothing
    returning webhook_id
  `);
  return (result as any).rows?.length > 0 || (result as any).length > 0;
}

async function markShopifyEventProcessed(webhookId: string): Promise<void> {
  await db.execute(sql`
    update public.shopify_webhook_events
    set processed_at = now()
    where webhook_id = ${webhookId}
  `);
}
