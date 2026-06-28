// Leaked-password (HaveIBeenPwned) check for the registration path.
//
// Why this exists: registration provisions accounts via
// supabase.auth.admin.createUser (server/auth.ts), which — unlike public
// signUp() and admin.updateUserById — does NOT run GoTrue's configured
// leaked-password / strength rules (supabase/auth#1959). So enabling
// Supabase's leaked-password protection covers password reset and the
// in-app change-password flow but leaves signup unprotected. This closes
// that gap with the same external source of truth GoTrue itself uses: the
// HaveIBeenPwned Pwned Passwords range API.
//
// Privacy: only the first 5 chars of the SHA-1 ever leave the process
// (k-anonymity); the full hash and the password never do. The `Add-Padding`
// header makes HIBP return random padding entries so response size can't be
// used to fingerprint the prefix.
//
// Availability: fail-OPEN. A HIBP outage must never block every signup, so
// an unreachable / slow / non-2xx response is logged and treated as "not
// leaked" — the same posture GoTrue takes when HIBP is unreachable.

import { createHash } from "node:crypto";
import { logger } from "./logger";

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const HIBP_TIMEOUT_MS = 2_500;

// Pure parser: given the uppercased SHA-1 of a password and a HIBP range
// response body ("SUFFIX:COUNT\r\n…"), return the breach count for that
// password (0 = not present). Padding entries carry a count of 0, so the
// `> 0` test in the caller ignores them. Exported for a network-free test.
export function breachCountFromRange(sha1Upper: string, rangeBody: string): number {
  const suffix = sha1Upper.slice(5);
  for (const line of rangeBody.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim().toUpperCase() === suffix) {
      return Number.parseInt(line.slice(idx + 1).trim(), 10) || 0;
    }
  }
  return 0;
}

// Returns true iff the password appears in HIBP at least once. Fail-open:
// returns false on any timeout / network / HTTP error.
export async function isPasswordLeaked(password: string): Promise<boolean> {
  const sha1Upper = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1Upper.slice(0, 5);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HIBP_TIMEOUT_MS);
  try {
    const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "venturecite-auth" },
      signal: ac.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "hibp: range lookup non-ok — failing open");
      return false;
    }
    return breachCountFromRange(sha1Upper, await res.text()) > 0;
  } catch (err) {
    logger.warn({ err }, "hibp: range lookup failed — failing open");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
