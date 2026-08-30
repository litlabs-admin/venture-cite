// Billing business logic extracted from server/routes/billing.ts.
//
// Flat functions: explicit parameters in, plain data out or throws. No
// Express types, no req/res - the route file decides status codes and
// response shapes from what these return or throw.
//
// checkout, subscription-status, cancel and resume (phase B7-18) joined
// getStripeProductCatalog, createBillingPortalSession and listBillingInvoices
// (phase B7-15) here once tests/unit/billingSubscriptionGuards.test.ts,
// tests/unit/stripeWebhookCoverage.test.ts, tests/unit/stripeTestModeBanner.test.ts
// and tests/unit/planBeforeBrandGate.test.ts stopped asserting on the raw
// source text of server/routes/billing.ts and started driving the real
// routes instead - see .audit/B7/B7-18-billing-behavioural-tests.md.

import { createHash } from "node:crypto";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { PLAN_PRICE_CENTS, SELLABLE_TIERS, TRIAL_DAYS, type SellableTier } from "@shared/schema";

export type StripePriceSummary = {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: unknown;
};

export type StripeProductSummary = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: StripePriceSummary[];
};

// Stripe products and prices, merged and sorted for the pricing page.
export async function getStripeProductCatalog(): Promise<StripeProductSummary[]> {
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
    const productId = typeof price.product === "string" ? price.product : (price.product as any).id;
    if (productsMap.has(productId)) {
      productsMap.get(productId).prices.push({
        id: price.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring,
      });
    }
  }

  return Array.from(productsMap.values()).sort(
    (a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0),
  );
}

// Open a Stripe customer-portal session for an already-resolved customer id
// and return URL.
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string | null }> {
  const { getUncachableStripeClient } = await import("../stripeClient");
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

export type BillingInvoiceSummary = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null | undefined;
  invoicePdf: string | null | undefined;
};

// Read-only invoice list for the Settings panel. Only the fields the table
// renders are returned - a raw Stripe invoice carries far more than a
// billing table needs.
export async function listBillingInvoices(customerId: string): Promise<BillingInvoiceSummary[]> {
  const { getStripeClient } = await import("../stripeClient");
  const stripe = getStripeClient();
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 24,
  });
  return (
    invoices.data
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
      }))
  );
}

// Server-controlled redirect target. Never let a caller supply their own
// success/cancel URL - see billingCheckoutSafety.test.ts's "uses only
// server-controlled redirect URLs".
export function appUrl(path: string): string {
  const baseUrl = process.env.APP_URL ?? "https://www.venturecite.com";
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

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

// ─── Subscription state ────────────────────────────────────────────────────
// Everything the Settings billing panel needs in one call: what they are on,
// when it renews, whether it is already set to cancel, and the trial end.
//
// Read straight from Stripe rather than the users row. The row carries the
// TIER (what they may do); Stripe carries the SUBSCRIPTION (what happens to
// their money and when). Rendering a renewal date from our own copy would
// eventually show a date Stripe disagrees with.
export type SubscriptionSnapshot = {
  status: string;
  planName: string | null;
  tier: string | null;
  amount: number | null;
  currency: string;
  interval: string;
  currentPeriodEnd: number | undefined;
  cancelAtPeriodEnd: boolean;
  trialEnd: number | null;
};

export async function getSubscriptionSnapshot(
  stripeCustomerId: string,
): Promise<SubscriptionSnapshot | null> {
  const { getStripeClient } = await import("../stripeClient");
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
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
  if (!sub) return null;

  const item = sub.items.data[0];
  // price.product is an id string at this expand depth. One extra fetch
  // is cheaper than losing the whole panel to an expansion error.
  const productId =
    typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id;
  const product = productId
    ? await stripe.products.retrieve(productId).catch(() => undefined)
    : undefined;
  return {
    status: sub.status,
    planName: product?.name ?? null,
    tier: product?.metadata?.tier ?? null,
    amount: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? "usd",
    interval: item?.price?.recurring?.interval ?? "month",
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: sub.trial_end,
  };
}

// ─── Cancel ────────────────────────────────────────────────────────────────
// cancel_at_period_end, never an immediate delete. They paid for the period,
// so they keep it; an immediate cancel takes away time already bought AND is
// terminal - the subscription cannot be revived, only replaced by a new one.
// Deferring keeps "Cancel" reversible right up to the renewal date, which is
// what resumeSubscriptionForCustomer below exists for.
//
// Access is NOT revoked here. The tier changes only when Stripe actually ends
// the subscription and fires customer.subscription.deleted.
export type CancelOutcome = { cancelAtPeriodEnd: true; endsAt: number | undefined };

export async function cancelSubscriptionForCustomer(
  stripeCustomerId: string,
  userId: string,
): Promise<CancelOutcome | null> {
  const { getStripeClient } = await import("../stripeClient");
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 10,
  });
  const sub = subs.data.find((x) => x.status === "active" || x.status === "trialing");
  if (!sub) return null;
  const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  logger.info({ userId, subscriptionId: sub.id }, "billing.cancel: set to cancel at period end");
  return { cancelAtPeriodEnd: true, endsAt: periodEnd(updated) };
}

// Undo a pending cancellation, any time before the period actually ends.
export async function resumeSubscriptionForCustomer(
  stripeCustomerId: string,
  userId: string,
): Promise<{ subscriptionId: string } | null> {
  const { getStripeClient } = await import("../stripeClient");
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 10,
  });
  const sub = subs.data.find(
    (x) => (x.status === "active" || x.status === "trialing") && x.cancel_at_period_end,
  );
  if (!sub) return null;
  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
  logger.info({ userId, subscriptionId: sub.id }, "billing.resume: cancellation reversed");
  return { subscriptionId: sub.id };
}

// ─── Checkout ───────────────────────────────────────────────────────────────

function isSellableTier(value: string | undefined): value is SellableTier {
  return SELLABLE_TIERS.some((tier) => tier === value);
}

type ApprovedCatalogEntry = {
  priceId: string;
  productId: string;
  tier: SellableTier;
};

function approvedCatalog(): ApprovedCatalogEntry[] {
  const entries: ApprovedCatalogEntry[] = [];
  const proProductId = process.env.STRIPE_PRO_PRODUCT_ID;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  if (proProductId && proPriceId) {
    entries.push({ tier: "pro", productId: proProductId, priceId: proPriceId });
  }

  const agencyProductId = process.env.STRIPE_AGENCY_PRODUCT_ID;
  const agencyPriceId = process.env.STRIPE_AGENCY_PRICE_ID;
  if (agencyProductId && agencyPriceId) {
    entries.push({ tier: "agency", productId: agencyProductId, priceId: agencyPriceId });
  }
  return entries;
}

function isCatalogPrice(price: import("stripe").Stripe.Price, requestedPriceId: string): boolean {
  if (price.id !== requestedPriceId || !price.active) return false;
  if (
    price.currency.toLowerCase() !== "usd" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  ) {
    return false;
  }

  const product = price.product;
  if (typeof product === "string" || "deleted" in product || !product.active) return false;

  const tier = product.metadata.tier?.trim().toLowerCase();
  if (!isSellableTier(tier) || price.unit_amount !== PLAN_PRICE_CENTS[tier]) return false;

  // The env pin is per-tier and OPTIONAL.
  //
  // It used to be mandatory for every tier, so with STRIPE_PRO_PRODUCT_ID /
  // STRIPE_PRO_PRICE_ID (and the Agency pair) unset, approvedCatalog() was
  // empty, .some() was false, and EVERY checkout was rejected with
  // "Invalid or inactive price" - which the pricing page reports as "Failed to
  // start checkout". The page had no way to know: it derives its priceId from
  // the live Stripe catalog (tier + amount), while this endpoint additionally
  // demanded an env match. Two different rules, so a plan could render as
  // purchasable and be refused a click later.
  //
  // Everything above this line is already a real allow-list: an ACTIVE price
  // on an ACTIVE product, USD, monthly, carrying a `tier` we sell, at EXACTLY
  // the amount we publish for that tier. An arbitrary price ID from another
  // integration cannot pass it.
  //
  // So: if a pin exists FOR THIS TIER, enforce it strictly - that is what
  // disambiguates duplicate products in the catalog. If no pin is configured
  // for this tier, fall back to the checks above rather than refusing to sell
  // anything at all.
  const pinsForTier = approvedCatalog().filter((entry) => entry.tier === tier);
  if (pinsForTier.length === 0) return true;

  return pinsForTier.some(
    (entry) => entry.priceId === requestedPriceId && entry.productId === product.id,
  );
}

function stripeCustomerRecoveryKey(userId: string): string {
  return createHash("sha256").update(`venturecite:stripe-customer:${userId}`).digest("hex");
}

function hasSubscriptionEntitlement(status: import("stripe").Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

const checkoutLocks = new Map<string, Promise<void>>();

async function withCheckoutLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const prior = checkoutLocks.get(userId) ?? Promise.resolve();
  const task = prior.catch(() => undefined).then(work);
  const tail = task.then(
    () => undefined,
    () => undefined,
  );
  checkoutLocks.set(userId, tail);
  try {
    return await task;
  } finally {
    if (checkoutLocks.get(userId) === tail) checkoutLocks.delete(userId);
  }
}

export type CheckoutOutcome =
  | { kind: "invalid-price" }
  | { kind: "already-subscribed" }
  | { kind: "switched" }
  | { kind: "session"; url: string | null };

export async function createCheckoutSession(
  userId: string,
  priceId: string,
): Promise<CheckoutOutcome> {
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
    return { kind: "invalid-price" };
  }

  if (!isCatalogPrice(price, priceId)) {
    // The client is told nothing specific on purpose. But "Failed to
    // start checkout" with no server-side reason cost real debugging
    // time once already, so record WHICH condition failed. The common
    // cause is a catalog whose amount does not match what the pricing
    // page publishes for that tier - e.g. Stripe carrying Pro at $79
    // while PLAN_PRICE_CENTS says 9900.
    const rejectedProduct = price.product;
    logger.warn(
      {
        priceId,
        active: price.active,
        currency: price.currency,
        interval: price.recurring?.interval,
        intervalCount: price.recurring?.interval_count,
        unitAmount: price.unit_amount,
        tier:
          typeof rejectedProduct === "string" || "deleted" in rejectedProduct
            ? null
            : rejectedProduct.metadata.tier,
        expectedAmounts: PLAN_PRICE_CENTS,
        envPinsConfigured: approvedCatalog().map((entry) => entry.tier),
      },
      "stripe.checkout: price rejected by catalog gate",
    );
    return { kind: "invalid-price" };
  }

  const user = await storage.getUser(userId);
  let trialEligible = !user?.stripeSubscriptionId;

  let customerId: string | undefined;
  if (user?.stripeCustomerId) {
    customerId = user.stripeCustomerId;
  } else if (user) {
    const recoveryKey = stripeCustomerRecoveryKey(userId);
    const recoveredCustomers = await stripe.customers.search({
      query: `metadata['ventureciteRecoveryKey']:'${recoveryKey}'`,
      limit: 10,
    });
    const recoveredCustomer = recoveredCustomers.data.find(
      (customer) =>
        customer.metadata.userId === userId &&
        customer.metadata.ventureciteRecoveryKey === recoveryKey,
    );
    if (recoveredCustomer) {
      customerId = recoveredCustomer.id;
    } else {
      const customer = await stripe.customers.create(
        {
          email: user.email || undefined,
          metadata: { userId, ventureciteRecoveryKey: recoveryKey },
        },
        { idempotencyKey: `customer:${recoveryKey}` },
      );
      customerId = customer.id;
    }
    await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
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
    trialEligible = trialEligible && existing.data.length === 0;

    const current = existing.data.find((subscription) =>
      hasSubscriptionEntitlement(subscription.status),
    );
    if (current) {
      const item = current.items.data[0];
      if (item?.price?.id === priceId) {
        return { kind: "already-subscribed" };
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
      return { kind: "switched" };
    }
  }

  const session = await withCheckoutLock(userId, async () => {
    if (customerId) {
      const openSessions = await stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 100,
      });
      const reusable = openSessions.data.find(
        (openSession) =>
          openSession.client_reference_id === userId &&
          openSession.metadata?.venturecitePriceId === priceId &&
          Boolean(openSession.url),
      );
      await Promise.all(
        openSessions.data
          .filter((openSession) => openSession.id !== reusable?.id)
          .map((openSession) => stripe.checkout.sessions.expire(openSession.id)),
      );
      if (reusable) return reusable;
    }

    return stripe.checkout.sessions.create(
      {
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        ...(trialEligible ? { subscription_data: { trial_period_days: TRIAL_DAYS } } : {}),
        success_url: appUrl("/welcome?checkout=success"),
        cancel_url: appUrl("/pricing?canceled=true"),
        client_reference_id: userId,
        metadata: { venturecitePriceId: priceId },
      },
      {
        idempotencyKey: `checkout:${userId}:${priceId}:${Math.floor(Date.now() / 60_000)}`,
      },
    );
  });

  return { kind: "session", url: session.url };
}
