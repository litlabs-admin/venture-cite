import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";

// Bucket key for express-rate-limit on the auth endpoints.
//
// Keyed by IP + lowercased email so two different accounts on a shared
// outbound IP (CGNAT, office NAT) can retry independently of each other.
// Falls back to IP-only when the request body hasn't supplied an email
// (e.g. malformed POST or endpoints that don't take an email at all).
//
// The IP component is normalized through express-rate-limit's
// `ipKeyGenerator` helper (required as of v8) so IPv6 addresses are
// collapsed to a /56 subnet instead of keyed per-address - otherwise an
// attacker can trivially rotate through billions of addresses in their
// own /64 to bypass the limit. IPv4 addresses pass through unchanged.
export function authRateKey(req: Request): string {
  const ip = ipKeyGenerator(req.ip ?? "unknown");
  const rawEmail =
    req.body &&
    typeof req.body === "object" &&
    typeof (req.body as { email?: unknown }).email === "string"
      ? (req.body as { email: string }).email
      : null;
  if (rawEmail) {
    return `${ip}:${rawEmail.toLowerCase().trim()}`;
  }
  return `ip:${ip}`;
}
