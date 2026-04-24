import type { Request } from "express";

// Bucket key for express-rate-limit on the auth endpoints.
//
// Keyed by IP + lowercased email so two different accounts on a shared
// outbound IP (CGNAT, office NAT) can retry independently of each other.
// Falls back to IP-only when the request body hasn't supplied an email
// (e.g. malformed POST or endpoints that don't take an email at all).
export function authRateKey(req: Request): string {
  const ip = req.ip ?? "unknown";
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
