// Centralized cleanup of all VentureCite-owned browser storage. Called on
// logout so the next user (or anonymous state) on this browser can't see
// the previous user's draft IDs, onboarding flags, GA4 IDs, etc.
//
// Strategy: iterate localStorage and delete every key that starts with
// `venturecite-` (catches all current + future scoped keys), plus an
// explicit list of legacy non-prefixed keys that pre-date the prefix
// convention.
//
// Supabase manages its own auth-token key (`sb-<project>-auth-token`) and
// clears it via `supabase.auth.signOut()` — we don't touch it here.

const LEGACY_UNPREFIXED_KEYS = ["hasSeenOnboarding", "completedGuideSteps"];

const VENTURECITE_PREFIX = "venturecite-";

export function clearAllVentureCiteStorage(): void {
  try {
    // Snapshot keys first — mutating localStorage while iterating shifts
    // indices and skips entries.
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(VENTURECITE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    for (const key of LEGACY_UNPREFIXED_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage access can throw in private mode or when full — best-effort.
  }
}
