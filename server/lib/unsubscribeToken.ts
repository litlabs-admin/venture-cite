import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-signed token embedded in unsubscribe links.
//
// Token format:   <base64url(payload)>.<base64url(signature)>
// Payload bytes:  `${userId}|${list}`  (utf-8)
//
// Why no timestamp? Unsubscribe links live in inboxes forever — a user
// who unsubscribes from an email two years old still expects it to work.
// Replay isn't a security concern: re-clicking the link just re-applies
// "unsubscribed", which is idempotent.
//
// HMAC key: EMAIL_UNSUBSCRIBE_SECRET. Falls back to SESSION_SECRET if
// unset (so deployments without a dedicated key still work). If neither
// is set, signToken/verifyToken throw — explicit failure beats silently
// signing with a weak key.

const SEPARATOR = ".";

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "EMAIL_UNSUBSCRIBE_SECRET (or SESSION_SECRET) must be set to sign unsubscribe tokens",
    );
  }
  return secret;
}

export type UnsubscribeList = "weekly_report" | "marketing";

export function signUnsubscribeToken(userId: string, list: UnsubscribeList): string {
  if (!userId) throw new Error("signUnsubscribeToken: userId required");
  const payload = Buffer.from(`${userId}|${list}`, "utf8");
  const sig = createHmac("sha256", getSecret()).update(payload).digest();
  return `${toBase64Url(payload)}${SEPARATOR}${toBase64Url(sig)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { userId: string; list: UnsubscribeList } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return null;

  let payload: Buffer;
  let providedSig: Buffer;
  try {
    payload = fromBase64Url(parts[0]);
    providedSig = fromBase64Url(parts[1]);
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", getSecret()).update(payload).digest();
  if (providedSig.length !== expectedSig.length) return null;
  try {
    if (!timingSafeEqual(providedSig, expectedSig)) return null;
  } catch {
    return null;
  }

  const decoded = payload.toString("utf8");
  const sepIdx = decoded.indexOf("|");
  if (sepIdx <= 0 || sepIdx === decoded.length - 1) return null;
  const userId = decoded.slice(0, sepIdx);
  const list = decoded.slice(sepIdx + 1);
  if (list !== "weekly_report" && list !== "marketing") return null;
  return { userId, list };
}
