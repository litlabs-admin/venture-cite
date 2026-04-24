// Resend (Svix-style) webhook signature verification (Wave 3.6).
//
// Resend signs webhook payloads with the Svix scheme:
//   svix-id:        unique delivery id
//   svix-timestamp: Unix seconds when the request was sent
//   svix-signature: space-separated list of "v1,<base64-sig>" pairs
//
// signature input is HMAC-SHA256 of `${svix_id}.${svix_timestamp}.${body}`
// keyed with the webhook secret. Resend prefixes the secret with "whsec_"
// — strip that and base64-decode before HMAC. We accept the request if
// any of the listed signatures matches.
//
// Replay protection: reject if svix-timestamp is older than ±5 minutes
// from now.

import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Buffer {
  const trimmed = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(trimmed, "base64");
}

function tryTimingSafeEq(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyResendWebhook(params: {
  rawBody: Buffer;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
}): boolean {
  if (!params.rawBody || !params.svixId || !params.svixTimestamp || !params.svixSignature) {
    return false;
  }

  const ts = Number(params.svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return false;

  let key: Buffer;
  try {
    key = decodeSecret(params.secret);
  } catch {
    return false;
  }

  const signedPayload = `${params.svixId}.${params.svixTimestamp}.${params.rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", key).update(signedPayload).digest();

  // svix-signature can list multiple "v1,<sig>" pairs separated by spaces.
  // Accept if any of them matches.
  const candidates = params.svixSignature
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((p) => p.startsWith("v1,"))
    .map((p) => {
      try {
        return Buffer.from(p.slice("v1,".length), "base64");
      } catch {
        return Buffer.alloc(0);
      }
    });

  return candidates.some((sig) => tryTimingSafeEq(sig, expected));
}
