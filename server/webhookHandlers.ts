import Stripe from 'stripe';
import { sql } from 'drizzle-orm';
import { getStripeClient } from './stripeClient';
import { storage } from './storage';
import { db } from './db';

// Map Stripe product names to access tiers
function tierFromProduct(productName: string): string {
  const name = productName.toLowerCase();
  if (name.includes('enterprise')) return 'enterprise';
  if (name.includes('pro')) return 'pro';
  if (name.includes('beta')) return 'beta';
  return 'free';
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
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
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
      console.log(`[Webhook] duplicate event ${event.id} (${event.type}) — skipping`);
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) break;

        const updates: { stripeCustomerId?: string; stripeSubscriptionId?: string; accessTier?: string } = {};

        if (session.customer && typeof session.customer === 'string') {
          updates.stripeCustomerId = session.customer;
        }
        if (session.subscription && typeof session.subscription === 'string') {
          updates.stripeSubscriptionId = session.subscription;
          // Fetch subscription to determine tier
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription, {
              expand: ['items.data.price.product'],
            });
            const product = sub.items.data[0]?.price?.product as Stripe.Product | undefined;
            if (product?.name) {
              updates.accessTier = tierFromProduct(product.name);
            }
          } catch (err) {
            console.error('[Webhook] Failed to retrieve subscription for tier:', err);
          }
        }

        if (Object.keys(updates).length > 0) {
          await storage.updateUserStripeInfo(userId, updates);
          console.log(`[Webhook] checkout.session.completed — updated user ${userId}:`, updates);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user) break;

        const expandedSub = await stripe.subscriptions.retrieve(sub.id, {
          expand: ['items.data.price.product'],
        });
        const product = expandedSub.items.data[0]?.price?.product as Stripe.Product | undefined;
        const tier = product?.name ? tierFromProduct(product.name) : 'free';

        await storage.updateUserStripeInfo(user.id, {
          stripeSubscriptionId: sub.id,
          accessTier: sub.status === 'active' ? tier : 'free',
        });
        console.log(`[Webhook] customer.subscription.updated — user ${user.id} → tier: ${tier}, status: ${sub.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user) break;

        await storage.updateUserStripeInfo(user.id, { accessTier: 'free' });
        console.log(`[Webhook] customer.subscription.deleted — user ${user.id} reset to free`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn('[Webhook] invoice.payment_failed — customer:', invoice.customer);
        break;
      }

      default:
        // Log unhandled event types so we notice unexpected traffic (and so
        // that silent regressions show up in logs rather than disappearing).
        console.warn(`[Webhook] unhandled event type: ${event.type}`);
        break;
    }

    await markStripeEventProcessed(event.id);
  }
}
