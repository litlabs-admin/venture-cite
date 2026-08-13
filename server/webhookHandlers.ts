import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { getStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { db } from "./db";
import { logger } from "./lib/logger";
import { logSystemAudit } from "./lib/audit";

import { captureAndFlush } from "./lib/sentryReport";
import { usageLimits } from "@shared/schema";
import {
  sendPaymentFailedEmail,
  sendPaymentActionRequiredEmail,
  sendTrialEndingEmail,
} from "./lib/billingEmails";

/**
 * The tier a Stripe product grants, read from its `tier` metadata key.
 *
 * This used to substring-match the product's NAME - "enterprise", then "pro",
 * then "beta", defaulting to "free". That silently broke the moment a plan was
 * named anything else: the $500 plan is called "Agency", which matches none of
 * them, so every Agency customer would have been charged and then dropped to
 * free-tier access.
 *
 * Metadata is the right source because the rest of the billing code already
 * treats it as required - routes/billing.ts refuses to sell a price whose
 * product has no `metadata.tier`, and hides such products from the pricing
 * page. Reading the same field here means a product is either fully sellable
 * or not sellable at all, with no third state where it can be bought but
 * grants nothing.
 *
 * Returns null when the metadata is missing or unrecognised. Callers must
 * treat that as "leave the user's tier alone" - never as a downgrade. An
 * unrecognised product is our configuration error, and taking access away
 * from someone who just paid is the worst possible response to it.
 */
function tierFromProduct(product: Stripe.Product | undefined): string | null {
  const tier = product?.metadata?.tier?.trim().toLowerCase();
  if (!tier) return null;
  return tier in usageLimits ? tier : null;
}

/**
 * True when this invoice failed because the bank wants the cardholder to
 * authenticate (3DS), rather than because the card was declined.
 *
 * The distinction is not on the invoice itself - it lives on the payment
 * intent - so this costs one expanded retrieve, on a path that is rare by
 * definition. On any error it returns false, which sends the ordinary decline
 * email: guessing wrong in that direction is a slightly-off message, while the
 * other direction is silence on a payment that actually failed.
 */
async function invoiceAwaitingAuthentication(invoiceId: string | null | undefined) {
  if (!invoiceId) return false;
  try {
    const { getStripeClient } = await import("./stripeClient");
    const full = (await getStripeClient().invoices.retrieve(invoiceId, {
      expand: ["payments.data.payment.payment_intent"],
    })) as unknown as {
      payments?: { data?: { payment?: { payment_intent?: { status?: string } } }[] };
    };
    return (full.payments?.data ?? []).some(
      (p) => p.payment?.payment_intent?.status === "requires_action",
    );
  } catch (err) {
    logger.warn({ err, invoiceId }, "stripe: could not classify payment failure");
    return false;
  }
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
// recorded the event but then threw mid-processing - in which case Stripe's
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
    // but not finished - because a prior attempt threw mid-handler - must be
    // re-run, not silently dropped (that used to permanently lose paid
    // upgrades on any transient DB/Stripe error). Handlers here are idempotent
    // (setter-style updates), so re-running is safe.
    const isFirstTime = await recordStripeEvent(event.id, event.type);
    if (!isFirstTime) {
      if (await isStripeEventProcessed(event.id)) {
        logger.info(
          { eventId: event.id, type: event.type },
          "stripe webhook: duplicate event (already processed) - skipping",
        );
        return;
      }
      logger.warn(
        { eventId: event.id, type: event.type },
        "stripe webhook: event recorded but not finished on a prior attempt - reprocessing",
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
            const tier = tierFromProduct(product);
            if (tier) {
              updates.accessTier = tier;
            } else {
              // Paid, but we cannot tell what for. Leave the tier untouched and
              // shout: the customer keeps whatever access they had, and this
              // needs a human to add `metadata.tier` to the product in Stripe.
              logger.error(
                { userId, productId: product?.id, productName: product?.name },
                "stripe: product has no usable metadata.tier - tier NOT updated",
              );
              captureAndFlush(new Error("Stripe product missing metadata.tier"), {
                tags: { source: "stripe-webhook.tier-lookup" },
                extra: { productId: product?.id, productName: product?.name, userId },
              });
            }
          } catch (err) {
            logger.error(
              { err, subscriptionId: session.subscription },
              "stripe: failed to retrieve subscription for tier - rethrowing so Stripe retries",
            );
            captureAndFlush(err, { tags: { source: "stripe-webhook.tier-lookup" } });
            // RETHROW. Swallowing this let execution fall through to
            // markStripeEventProcessed(), which stamps the event as done and
            // means Stripe never redelivers it. On a transient error the
            // customer had then paid and there was no event left in the system
            // that would ever grant their tier - a silent pay-and-get-nothing.
            //
            // Throwing returns 400 from the route, so Stripe retries with
            // backoff for up to 3 days. Re-running is safe: the handlers are
            // setter-style, and the idempotency table only skips events whose
            // side effects actually completed.
            throw err;
          }
        }

        if (Object.keys(updates).length > 0) {
          await storage.updateUserStripeInfo(userId, updates);
          logger.info({ userId, updates }, "stripe: checkout.session.completed - user updated");
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
        const tier = tierFromProduct(product);
        const previousTier = user.accessTier;

        // An inactive subscription lands on "expired", not "free". Free is a
        // legacy tier that still carries real entitlements (1 brand, 5
        // articles); handing it to someone whose payment lapsed would be a
        // reward. "expired" is the no-access state the trial also ends in, so
        // both paths reach the same paywall.
        //
        // An active subscription whose product has no usable metadata.tier
        // keeps the user where they are rather than being downgraded - same
        // reasoning as the checkout handler above.
        // `trialing` is an entitled state, not a pending one: the customer
        // picked a plan and put a card down, so they get that plan's tier for
        // the whole trial. Treating it as inactive would have locked out every
        // trialling customer on day one.
        // `past_due` is entitled too. It means one charge was declined and
        // Stripe's Smart Retries are still working - a window of days, and most
        // of those recover. Revoking on the first decline would lock out a
        // customer who is about to pay, and it directly contradicts the
        // payment_failed email, which tells them their account stays active
        // while we retry. Access ends when the retries are exhausted: Stripe
        // then cancels the subscription and fires
        // customer.subscription.deleted, which downgrades below.
        //
        // `unpaid` is deliberately NOT here - that is the terminal state for
        // accounts configured to be marked unpaid rather than cancelled, and it
        // means the retry window is over.
        const entitled =
          sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";

        let newTier: string;
        if (!entitled) {
          // readonly, not zero-access: their data stays visible and only new
          // work stops. See usageLimits in shared/schema.ts.
          newTier = "readonly";
        } else if (tier) {
          newTier = tier;
        } else {
          newTier = previousTier;
          logger.error(
            { userId: user.id, productId: product?.id, productName: product?.name },
            "stripe: active subscription product has no usable metadata.tier - tier NOT updated",
          );
          captureAndFlush(new Error("Stripe product missing metadata.tier"), {
            tags: { source: "stripe-webhook.subscription-updated" },
            extra: { productId: product?.id, productName: product?.name, userId: user.id },
          });
        }

        await storage.updateUserStripeInfo(user.id, {
          stripeSubscriptionId: sub.id,
          accessTier: newTier,
          // Mirror Stripe's own trial_end so the UI can render a countdown
          // without a round trip. Cleared the moment the trial is over, so a
          // stale timestamp can never keep the banner alive.
          trialEndsAt:
            sub.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000) : null,
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

      // Stripe fires this 3 days before the trial converts. It only exists
      // because the trial is Stripe-managed - an app-managed trial has no
      // equivalent hook, which is one of the reasons to let Stripe own it.
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user?.email) break;

        const daysLeft = sub.trial_end
          ? Math.max(1, Math.ceil((sub.trial_end * 1000 - Date.now()) / 86_400_000))
          : 3;
        const price = sub.items.data[0]?.price;
        const amount =
          price?.unit_amount != null
            ? new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: (price.currency || "usd").toUpperCase(),
              }).format(price.unit_amount / 100)
            : null;

        logger.info({ userId: user.id, daysLeft }, "stripe: trial_will_end - notifying customer");
        await sendTrialEndingEmail(user.email, { daysLeft, amount });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user) break;

        const previousTier = user.accessTier;
        // readonly, not "free": free is a legacy grant (a brand + 5 articles)
        // that a cancelled customer should not inherit. readonly keeps their
        // data visible and stops all new work, so the account costs us nothing.
        await storage.updateUserStripeInfo(user.id, {
          accessTier: "readonly",
          trialEndsAt: null,
        });
        logger.info({ userId: user.id }, "stripe: customer.subscription.deleted - now read-only");
        await logSystemAudit(user.id, {
          action: "subscription.cancel",
          entityType: "subscription",
          entityId: sub.id,
          before: { accessTier: previousTier },
          after: { accessTier: "readonly" },
        });
        break;
      }

      // Renewals never pass through Checkout again, so checkout.session
      // .completed only ever covers the FIRST payment. invoice.paid is
      // Stripe's documented signal for provisioning on every subsequent
      // cycle - without it, a renewal that arrives after any tier drift
      // (a lapsed past_due, a manual edit) is never reconciled back.
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof (invoice as { subscription?: unknown }).subscription === "string"
            ? ((invoice as { subscription?: string }).subscription as string)
            : null;
        if (!subId) break;

        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (!user) break;

        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ["items.data.price.product"],
        });
        const product = sub.items.data[0]?.price?.product as Stripe.Product | undefined;
        const tier = tierFromProduct(product);

        // Same rule as everywhere else: an unrecognised product never
        // downgrades a paying customer.
        if (tier && sub.status === "active" && user.accessTier !== tier) {
          await storage.updateUserStripeInfo(user.id, { accessTier: tier });
          logger.info(
            { userId: user.id, tier, invoiceId: invoice.id },
            "stripe: invoice.paid - tier reconciled on renewal",
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        // Access is deliberately NOT revoked here. Smart Retries keep trying
        // for the configured window and most of these recover; cutting the
        // customer off on the first decline would manufacture the churn we are
        // trying to prevent. The tier only drops when the subscription itself
        // leaves 'active' (customer.subscription.updated) or is cancelled.
        const email =
          invoice.customer_email ||
          (customerId
            ? ((await storage.getUserByStripeCustomerId(customerId))?.email ?? null)
            : null);

        // An SCA invoice fires payment_action_required AND payment_failed for
        // the same attempt, a second apart. Without this check the customer
        // gets two emails that contradict each other: "confirm this payment"
        // followed by "update your payment method". The card is fine, so the
        // second one sends them to fix something that is not broken. The
        // payment_action_required handler already emailed them, so this path
        // stays quiet.
        const needsAuth = await invoiceAwaitingAuthentication(invoice.id);

        logger.warn(
          {
            customerId,
            invoiceId: invoice.id,
            attempt: invoice.attempt_count,
            notified: !!email && !needsAuth,
            needsAuth,
          },
          "stripe: invoice.payment_failed",
        );
        if (email && !needsAuth) {
          await sendPaymentFailedEmail(email, {
            amountDue: invoice.amount_due,
            currency: invoice.currency,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
          });
        }
        break;
      }

      // SCA / 3D Secure. Distinct from a decline: the card is fine, the bank
      // wants the cardholder to authenticate. Telling these customers to
      // update their card would be wrong and would leave them stuck with an
      // unpaid invoice and no access.
      case "invoice.payment_action_required": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const email =
          invoice.customer_email ||
          (customerId
            ? ((await storage.getUserByStripeCustomerId(customerId))?.email ?? null)
            : null);

        logger.warn(
          { customerId, invoiceId: invoice.id, notified: !!email },
          "stripe: invoice.payment_action_required",
        );
        if (email) {
          await sendPaymentActionRequiredEmail(email, {
            hostedInvoiceUrl: invoice.hosted_invoice_url,
          });
        }
        break;
      }

      // Money is being taken back and there is a deadline to respond. This
      // must not sit in the generic unhandled bucket with benign noise like
      // payment_intent.created.
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        logger.error(
          { disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason },
          "stripe: charge.dispute.created - respond before the evidence deadline",
        );
        captureAndFlush(new Error("Stripe dispute opened"), {
          tags: { source: "stripe-webhook.dispute" },
          extra: { disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason },
        });
        break;
      }

      // Finalization failing means the invoice never even reaches the customer -
      // no charge is attempted and nothing else in this switch will fire. The
      // usual cause is Stripe Tax missing a customer location.
      case "invoice.finalization_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.error(
          { invoiceId: invoice.id, customerId: invoice.customer },
          "stripe: invoice.finalization_failed - this invoice will never be charged until fixed",
        );
        captureAndFlush(new Error("Stripe invoice finalization failed"), {
          tags: { source: "stripe-webhook.finalization" },
          extra: { invoiceId: invoice.id },
        });
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
