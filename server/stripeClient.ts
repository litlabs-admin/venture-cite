import Stripe from "stripe";

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set.");
  }
  return key;
}

// Pin the Stripe API version explicitly so bumping the SDK
// package never silently changes billing behavior (parameter renames,
// new required fields, response shape changes). When you bump this
// string, run the Stripe webhook + checkout flow end-to-end first.
//
// The SDK's bundled latest at install time is "2026-02-25.clover";
// override per-deployment with STRIPE_API_VERSION when needed.
const STRIPE_API_VERSION = (process.env.STRIPE_API_VERSION ??
  "2026-02-25.clover") as Stripe.LatestApiVersion;

export function getStripeClient(): Stripe {
  return new Stripe(getStripeKey(), { apiVersion: STRIPE_API_VERSION });
}

/**
 * Whether billing is pointed at Stripe's test mode.
 *
 * Deliberately supported in production: a deployed environment on test keys is
 * how the whole payment flow gets clicked through with Stripe's test cards,
 * which the live API rejects outright.
 *
 * The danger is forgetting. On test keys nothing ever charges, so a real
 * visitor can "subscribe" with a fake card and receive full entitlements while
 * no money moves - and there is no failure anywhere to notice, because from
 * the app's side everything succeeded. That is why this is surfaced in the UI
 * rather than left as a config detail: the state has to be visible to be
 * temporary.
 */
export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

// Alias - some routes import this name
export async function getUncachableStripeClient(): Promise<Stripe> {
  return getStripeClient();
}

export async function getStripePublishableKey(): Promise<string> {
  const key = process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error("STRIPE_PUBLISHABLE_KEY environment variable is not set.");
  }
  return key;
}
