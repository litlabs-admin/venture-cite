// Single source of truth for password STRENGTH policy, imported by both the
// client (registration + reset-password UIs) and the server (registration +
// change-password routes) so the rules cannot drift across the trust
// boundary. Before this module the rules were duplicated in two client files
// and the server enforced only a length check - a direct API caller could
// set a weaker password than the UI allowed.
//
// Three things enforce passwords in this app and they must agree:
//   1. This module - the ONLY strength check on the registration path
//      (admin.createUser bypasses GoTrue's rules, supabase/auth#1959), plus a
//      belt-and-suspenders check on the server change-password route.
//   2. GoTrue's configured policy - the platform-level enforcement for the
//      reset-password and change-password paths. Set password_min_length +
//      password_required_characters via the Management API to match these
//      rules so a client-bypassing direct API call is still rejected.
//   3. Leaked-password (HIBP) - enforced separately because it needs a
//      network call: server-side at registration (server/lib/leakedPassword.ts)
//      and by GoTrue elsewhere.
//
// Max length is a hard platform limit, not a stylistic choice: GoTrue hashes
// with bcrypt, which silently truncates at 72 BYTES. We reject longer inputs
// up front so a long passphrase can't be quietly shortened (which makes later
// sign-ins with the "full" password behave unpredictably).

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export interface PasswordRule {
  readonly label: string;
  readonly test: (pw: string) => boolean;
}

// The positive requirements rendered as a live checklist in the UI. Wording
// and order are load-bearing - the client shows these labels verbatim.
//
// These four rules map EXACTLY onto GoTrue's `password_required_characters`
// preset "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"
// (lowercase : uppercase : digits) plus password_min_length = 8. Keep them in
// sync: registration enforces this module, while reset-password and
// change-password are enforced by GoTrue against that preset - so all three
// paths accept and reject identical passwords. Changing a rule here without
// updating the GoTrue config (or vice-versa) re-introduces drift.
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { label: "Contains a number", test: (pw) => /\d/.test(pw) },
  { label: "Contains uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "Contains lowercase letter", test: (pw) => /[a-z]/.test(pw) },
];

// Isomorphic UTF-8 byte length (TextEncoder is global in Node 18+ and the
// browser). Multibyte chars can exceed 72 bytes before 72 chars, so the bcrypt
// limit must be checked in bytes, not String.length.
const encoder = new TextEncoder();
export function passwordByteLength(pw: string): number {
  return encoder.encode(pw).length;
}

export type PasswordValidation = { ok: true } | { ok: false; error: string };

// Full strength validation (NOT the HIBP check - that's an async network call,
// see isPasswordLeaked). Returns the first failure with a user-actionable
// message, suitable to return straight to the client.
export function validatePassword(pw: unknown): PasswordValidation {
  if (typeof pw !== "string" || pw.length === 0) {
    return { ok: false, error: "Password is required." };
  }
  if (passwordByteLength(pw) > PASSWORD_MAX_BYTES) {
    return { ok: false, error: `Password is too long (max ${PASSWORD_MAX_BYTES} characters).` };
  }
  const failed = PASSWORD_RULES.find((rule) => !rule.test(pw));
  if (failed) {
    return { ok: false, error: `Password must satisfy: ${failed.label.toLowerCase()}.` };
  }
  return { ok: true };
}
