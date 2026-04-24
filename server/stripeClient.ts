import Stripe from "stripe";

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set.");
  }
  return key;
}

// Wave 3.5: pin the Stripe API version explicitly so bumping the SDK
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

// Alias — some routes import this name
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
