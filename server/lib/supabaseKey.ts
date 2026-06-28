// Pure classifier for a Supabase API key, used at boot to verify that
// SUPABASE_SERVICE_ROLE_KEY is actually privileged (legacy service_role JWT or
// a new-style sb_secret_ key) and not an anon/publishable key. A real
// privileged key bypasses RLS; an anon key does not, which is what produces
// opaque "new row violates row-level security policy" 403s at runtime.
//
// Side-effect-free on purpose, so it can be unit-tested without constructing a
// Supabase client. server/supabase.ts applies the verdict: `rejected` refuses
// to boot, `unknown` warns and boots (never block a valid-but-unusual key).

export type KeyVerdict =
  | { kind: "privileged" }
  | { kind: "rejected"; reason: string }
  | { kind: "unknown"; reason: string };

const FIX = "Use the project's secret/service_role key (Supabase → Project Settings → API).";

export function classifyServiceKey(key: string): KeyVerdict {
  if (key.startsWith("sb_secret_")) return { kind: "privileged" }; // new-style secret key
  if (key.startsWith("sb_publishable_")) {
    return {
      kind: "rejected",
      reason: `SUPABASE_SERVICE_ROLE_KEY is a PUBLISHABLE key, which cannot bypass RLS. ${FIX}`,
    };
  }

  // Legacy keys are JWTs; the privilege level is the `role` claim.
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
        role?: unknown;
      };
      if (payload.role === "service_role") return { kind: "privileged" };
      if (typeof payload.role === "string") {
        return {
          kind: "rejected",
          reason:
            `SUPABASE_SERVICE_ROLE_KEY has role "${payload.role}", expected "service_role". ` +
            `Privileged operations (auth admin, Storage uploads) will fail RLS. ${FIX}`,
        };
      }
    } catch {
      // Unparseable JWT payload → fall through to "unknown".
    }
  }

  return {
    kind: "unknown",
    reason:
      "SUPABASE_SERVICE_ROLE_KEY is an unrecognized format — could not confirm it is a " +
      "service_role key. If privileged operations fail with RLS errors, verify this key.",
  };
}
