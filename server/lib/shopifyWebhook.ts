import { createHmac, timingSafeEqual } from "node:crypto";

// Verify a Shopify webhook signature.
//
// Shopify computes HMAC-SHA256(rawBody, webhookSecret) and base64-encodes
// the result, sending it in the `X-Shopify-Hmac-SHA256` header. To verify,
// we recompute the HMAC over the EXACT bytes Shopify signed and compare
// using a timing-safe comparison.
//
// CRITICAL: this must be called against the raw request body. If the body
// has already been parsed (e.g. by express.json), the byte-exact original
// is gone and the HMAC won't match. Register this endpoint with a raw
// body parser that runs BEFORE any JSON parser.
//
// Returns true iff the signature is valid; never throws on bad input.
export function verifyShopifyHmac(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  // timingSafeEqual throws if the two buffers differ in length, so guard
  // explicitly and bail.
  if (actual.length !== expected.length) return false;

  try {
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
