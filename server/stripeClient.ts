import Stripe from 'stripe';

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
  }
  return key;
}

// Omitting apiVersion entirely makes the SDK use its bundled LatestApiVersion,
// so bumping the stripe package automatically bumps the pinned version. One
// less string to hand-edit on every SDK upgrade.
export function getStripeClient(): Stripe {
  return new Stripe(getStripeKey());
}

// Alias — some routes import this name
export async function getUncachableStripeClient(): Promise<Stripe> {
  return getStripeClient();
}

export async function getStripePublishableKey(): Promise<string> {
  const key = process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error('STRIPE_PUBLISHABLE_KEY environment variable is not set.');
  }
  return key;
}
