// Onboarding-state merge business logic, extracted verbatim from
// server/routes/onboarding.ts (PATCH /api/onboarding/state) as part of the
// B7 service-layer split.
//
// The allowlist below defines the only fields the client can write into
// users.onboarding_state - arbitrary keys are silently dropped. Add new
// flags here as we introduce them; that keeps the column from
// accumulating dead / abusive data.
//
// Backs the SidebarOnboarding component, which reads/writes these
// flags to drive the checklist state.

import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";

// Allowlist of field names the client can write into onboarding_state.
// Add new keys as new flags appear in the UI.
export const ONBOARDING_FIELDS = new Set([
  "guidedSeen",
  "checklistDismissed",
  "checklistExpanded",
  "sidebarSeenAt",
  "platformGuideCompletedSteps",
]);

export type ApplyOnboardingStatePatchResult =
  { kind: "no_fields"; allowedFields: string[] } | { kind: "updated"; onboardingState: unknown };

export async function applyOnboardingStatePatch(
  userId: string,
  body: Record<string, unknown>,
): Promise<ApplyOnboardingStatePatchResult> {
  // Filter to allowlisted keys. Anything else is silently ignored -
  // the client gets a 200 either way so a slightly out-of-date client
  // doesn't fail outright when the server has tightened the allowlist.
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ONBOARDING_FIELDS.has(key)) {
      patch[key] = value;
    }
  }

  if (Object.keys(patch).length === 0) {
    // Nothing to write but caller did supply something - surface it
    // as 400 so a client typo doesn't silently no-op forever.
    return { kind: "no_fields", allowedFields: Array.from(ONBOARDING_FIELDS) };
  }

  // jsonb || jsonb merges keys (right wins). One query, atomic.
  const [row] = await db
    .update(users)
    .set({
      onboardingState: sql`COALESCE(${users.onboardingState}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(users.id, userId))
    .returning({ onboardingState: users.onboardingState });

  return { kind: "updated", onboardingState: row?.onboardingState ?? {} };
}
