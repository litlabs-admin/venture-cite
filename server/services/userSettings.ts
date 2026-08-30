// User account settings business logic, extracted verbatim from
// server/routes/userAccount.ts as part of the B7 service-layer split.
//
//   - applyProfileUpdate backs PATCH /api/user/profile.
//   - changeUserPassword backs POST /api/user/password.
//
// logAudit(req, ...) calls stay in the route handlers - they need the
// Express Request for actor/IP/user-agent extraction, which this module
// must not import.

import { supabaseAdmin } from "../supabase";
import { supabaseAuth } from "../lib/supabaseAuth";
import { validatePassword } from "@shared/passwordPolicy";
import { logger } from "../lib/logger";
import { createRequestActor } from "../lib/requestActor";
import { requestData } from "../data/requestData";
import type { RequestUserProfilePatch } from "../data/requestUserRepository";

// ── PATCH /api/user/profile ─────────────────────────────────────────────────

export type ProfileUpdateOutcome =
  { kind: "invalid_timezone" } | { kind: "no_change" } | { kind: "updated" };

export async function applyProfileUpdate(
  userId: string,
  input: { firstName?: string; lastName?: string; timezone?: string },
): Promise<ProfileUpdateOutcome> {
  // Validate timezone against the runtime's IANA list. Older Node
  // versions without supportedValuesOf are tolerated (no-op check).
  if (input.timezone) {
    const valid: string[] =
      typeof (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf === "function"
        ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
            "timeZone",
          )
        : [];
    if (valid.length > 0 && !valid.includes(input.timezone)) {
      return { kind: "invalid_timezone" };
    }
  }

  // Empty-string firstName/lastName must NOT wipe the saved value.
  // The client always sends all three fields; if its form briefly
  // renders blank (e.g. before /auth/me hydrates), we'd overwrite
  // the user's real name with "". Treat trimmed-empty as "skip".
  const patch: RequestUserProfilePatch = {};
  if (input.firstName && input.firstName.trim().length > 0)
    patch.firstName = input.firstName.trim();
  if (input.lastName && input.lastName.trim().length > 0) patch.lastName = input.lastName.trim();
  if (input.timezone) patch.timezone = input.timezone;

  if (Object.keys(patch).length === 0) {
    return { kind: "no_change" };
  }

  const actor = createRequestActor(userId);
  await requestData.forActor(actor).users.updateProfile(patch);
  return { kind: "updated" };
}

// ── POST /api/user/password ─────────────────────────────────────────────────

export type ChangePasswordOutcome =
  | { kind: "weak_password"; error: string }
  | { kind: "wrong_current_password" }
  | { kind: "update_rejected"; status: number; error: string }
  | { kind: "changed" };

export async function changeUserPassword(params: {
  userId: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  bearerToken: string;
}): Promise<ChangePasswordOutcome> {
  const { userId, email, currentPassword, newPassword, bearerToken } = params;

  // Same shared strength policy as registration + the UIs. GoTrue also
  // enforces its configured rules on admin.updateUserById below, but
  // validating here keeps the message clear and the policy in one place.
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.ok) {
    return { kind: "weak_password", error: pwCheck.error };
  }

  // Re-auth on the dedicated auth client (supabaseAuth), NOT
  // supabaseAdmin. The old code used supabaseAdmin here "because the
  // anon-key client was fragile" - but that is exactly what poisoned the
  // shared service-role client's Authorization header and broke
  // server-side Storage uploads with RLS errors. supabaseAuth prefers the
  // anon key and falls back to the service key, so it works in every env
  // without touching supabaseAdmin (see server/lib/supabaseAuth.ts).
  const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError || !signInData?.user) {
    return { kind: "wrong_current_password" };
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updateError) {
    // admin.updateUserById enforces password strength + leaked-password
    // (HIBP) rules, so a rejected password is a user-actionable 4xx - not
    // an upstream 502. Surface the real reason (e.g. "Password is known to
    // be compromised") so the user can pick another; keep the generic 502
    // only for genuine GoTrue/network failures (no internal detail leak).
    const status = (updateError as { status?: number }).status;
    const isClientError = typeof status === "number" && status >= 400 && status < 500;
    logger.warn({ err: updateError, userId }, "user.password.update failed");
    return {
      kind: "update_rejected",
      status: isClientError ? 400 : 502,
      error: isClientError ? updateError.message : "Password update failed",
    };
  }

  // Revoke all OTHER sessions (every device except the one used to
  // make this call). Without this, a stolen-then-rotated password
  // leaves attacker tokens valid on other devices. Non-fatal - the
  // password change itself succeeded; logging is enough on failure.
  try {
    if (bearerToken) {
      await supabaseAdmin.auth.admin.signOut(bearerToken, "others");
    }
  } catch (revokeErr) {
    logger.warn(
      { err: revokeErr, userId },
      "Failed to revoke other sessions after password change",
    );
  }

  return { kind: "changed" };
}
