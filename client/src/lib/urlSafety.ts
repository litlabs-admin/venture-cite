// Shared URL hardening helpers. Anywhere we accept a URL from a user or a
// server response and then render it into an href or hand it to
// window.location, it must pass through one of these.

const SAFE_SCHEMES = new Set(["http:", "https:"]);

export function parseSafeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!SAFE_SCHEMES.has(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

// Accepts bare hostnames ("example.com") by assuming https://.
export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = parseSafeUrl(withScheme);
  if (!parsed) return null;
  if (!parsed.hostname.includes(".")) return null;
  return parsed.toString();
}

// Stripe redirects: only Checkout + Billing Portal domains.
const STRIPE_ALLOWED_HOSTS = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
]);

export function isAllowedStripeRedirect(raw: string): boolean {
  const url = parseSafeUrl(raw);
  if (!url) return false;
  if (url.protocol !== "https:") return false;
  return STRIPE_ALLOWED_HOSTS.has(url.hostname);
}

export function safeExternalHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const url = parseSafeUrl(raw);
  return url ? url.toString() : undefined;
}
