import { getStripeClient, isStripeTestMode } from "./stripeClient";
import { logger } from "./lib/logger";
import { usageLimits } from "@shared/schema";

// The self-serve catalogue. Two plans, both monthly USD.
//
// `metadata.tier` is load-bearing, not decoration. Three separate places read
// it: routes/billing.ts hides products without it from the pricing page AND
// refuses to sell their prices, and webhookHandlers.ts reads it to decide what
// a payment actually bought. A product created by hand in the Stripe dashboard
// without this key is invisible and unsellable - which is the safe direction,
// but confusing if you do not know to look for it.
//
// Article generation is the paid line between the two plans: Pro is the
// AI-visibility tracking product and generates no content at all.
//
// Deliberately NOT here:
//   Free        no longer sold. The accounts still on it predate this pricing.
//   Enterprise  sales-led. No price, no self-serve checkout - the pricing page
//               shows a contact card and the tier is set by hand after a call.
const PLANS = [
  {
    tier: "pro",
    name: "Pro",
    amount: 9900,
    description: "Track how AI engines see your brand",
    features: [
      "AI visibility tracking across every major engine",
      "Weekly citation checks",
      "Competitor benchmarking",
      "Site health and crawler access audits",
      "3 brand profiles",
    ],
  },
  {
    tier: "agency",
    name: "Agency",
    amount: 50000,
    description: "Everything in Pro, plus content built to get you cited",
    features: [
      "Everything in Pro",
      "40 AI-generated articles/month",
      "Reddit and community posts",
      "10 brand profiles",
      "Priority support",
    ],
  },
] as const;

/**
 * Creating a priced product in someone's Stripe account is not a boot-time
 * side effect. This runs from THREE places - server/index.ts, nitroBoot.ts and
 * the daily cron - so without a gate, merely starting the app against a live
 * key mints real, purchasable products.
 *
 * That was survivable while the catalogue matched what the account already
 * had (every name existed, so every branch was a no-op). It stopped being
 * survivable the moment the catalogue changed: "Agency" exists in no account
 * yet, so the next boot would have created a live $500/month product in the
 * customer's Stripe without anyone asking for it.
 *
 * Opt in explicitly with STRIPE_PRODUCT_SYNC=true, ideally against test keys.
 */
function syncEnabled(): boolean {
  const raw = (process.env.STRIPE_PRODUCT_SYNC ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export async function setupStripeProducts() {
  // A deployed environment on test keys is a deliberate, temporary state - it
  // is how the payment flow gets clicked through with Stripe's test cards,
  // which the live API rejects. It is also completely silent: every checkout
  // "succeeds", entitlements are granted, and no money moves. Say so loudly on
  // every boot, because the failure mode is forgetting.
  if (process.env.NODE_ENV === "production" && isStripeTestMode()) {
    logger.warn(
      "STRIPE IS IN TEST MODE ON A PRODUCTION BUILD - no card will ever be charged. " +
        "Swap STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY and STRIPE_WEBHOOK_SECRET for live " +
        "values before taking real customers.",
    );
  }

  if (!syncEnabled()) {
    logger.info(
      "stripe setup: skipped (set STRIPE_PRODUCT_SYNC=true to create the Pro/Agency products)",
    );
    return;
  }

  const stripe = getStripeClient();
  const keyMode = (process.env.STRIPE_SECRET_KEY ?? "").includes("_live_") ? "LIVE" : "test";
  logger.warn({ keyMode }, "stripe setup: product sync ENABLED - this writes to Stripe");

  const existing = await stripe.products.list({ limit: 100, active: true });

  for (const plan of PLANS) {
    // Match on the tier metadata rather than the display name, so renaming a
    // plan in Stripe does not cause this to create a duplicate alongside it.
    const limits = usageLimits[plan.tier];
    const metadata = {
      tier: plan.tier,
      features: plan.features.join(","),
      // Recorded so the plan's entitlements are legible in the Stripe
      // dashboard. The app reads shared/schema.ts, never these.
      maxBrands: String(limits.maxBrands),
      articlesPerMonth: String(limits.articlesPerMonth),
    };

    const found = existing.data.find((p) => p.metadata?.tier === plan.tier);
    if (found) {
      // Converge, do not skip. The copy here is what the pricing page renders
      // (Stripe's `features` metadata wins over the client's fallback), so a
      // create-once sync meant every later wording fix silently never reached
      // customers. Price is deliberately NOT touched - changing an amount
      // means minting a new price object and retiring the old one, which
      // affects existing subscribers and has to be a human decision.
      await stripe.products.update(found.id, {
        name: plan.name,
        description: plan.description,
        metadata,
      });

      const activePrice = (await stripe.prices.list({ product: found.id, active: true, limit: 10 }))
        .data[0];
      if (activePrice && activePrice.unit_amount !== plan.amount) {
        logger.warn(
          {
            tier: plan.tier,
            productId: found.id,
            stripeAmount: activePrice.unit_amount,
            expectedAmount: plan.amount,
          },
          "stripe setup: price MISMATCH - the pricing page will disable checkout for this plan until a price of the expected amount is the active one",
        );
      }
      logger.info({ tier: plan.tier, productId: found.id }, "stripe setup: plan updated");
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata,
    });
    await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amount,
      currency: "usd",
      recurring: { interval: "month" },
    });
    logger.info(
      { tier: plan.tier, productId: product.id, amount: plan.amount },
      "stripe setup: plan created",
    );
  }

  // Anything sellable that is NOT one of our plans is reported, never touched.
  // Archiving is destructive and visible in the customer's Stripe dashboard, so
  // it stays a human decision - this just makes the leftovers impossible to
  // miss. At the time of writing the account carries duplicated Free/Pro/
  // Enterprise products from the previous pricing.
  const strays = existing.data.filter(
    (p) => p.metadata?.tier && !PLANS.some((plan) => plan.tier === p.metadata.tier),
  );
  if (strays.length > 0) {
    logger.warn(
      { count: strays.length, products: strays.map((p) => ({ id: p.id, name: p.name })) },
      "stripe setup: sellable products outside the current catalogue - archive these in Stripe",
    );
  }
}
