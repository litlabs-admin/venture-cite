// Centralized cleanup of all VentureCite-owned browser storage. Called on
// logout so the next user (or anonymous state) on this browser cannot see
// the previous user's draft IDs, onboarding flags, GA4 IDs, or UI state.
//
// Strategy: iterate localStorage and sessionStorage. Delete every key that
// starts with `venturecite-`, every known user-scoped key, and the legacy
// non-prefixed keys that pre-date the prefix convention.
//
// Supabase manages its own auth-token key (`sb-<project>-auth-token`) and
// clears it via `supabase.auth.signOut()` - we don't touch it here.

import { THEME_STORAGE_KEY } from "./theme";
import { USER_SCOPED_STORAGE_KEYS } from "./clientStorageKeys";

const LEGACY_UNPREFIXED_KEYS = ["hasSeenOnboarding", "completedGuideSteps"];

const VENTURECITE_PREFIX = "venturecite-";
const USER_SCOPED_KEY_SET = new Set<string>(USER_SCOPED_STORAGE_KEYS);
const RETAINED_DEVICE_STORAGE_KEYS = new Set([THEME_STORAGE_KEY]);

function shouldClearKey(key: string): boolean {
  const isVentureCiteKey =
    key.startsWith(VENTURECITE_PREFIX) ||
    LEGACY_UNPREFIXED_KEYS.includes(key) ||
    USER_SCOPED_KEY_SET.has(key);
  return isVentureCiteKey && !RETAINED_DEVICE_STORAGE_KEYS.has(key);
}

function clearStorage(storage: Storage): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && shouldClearKey(key)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) storage.removeItem(key);
}

function getStorageAreas(): Storage[] {
  const storageAreas: Storage[] = [];
  try {
    storageAreas.push(localStorage);
  } catch {
    // localStorage may be unavailable.
  }
  try {
    storageAreas.push(sessionStorage);
  } catch {
    // sessionStorage may be unavailable.
  }
  return storageAreas;
}

export function clearAllVentureCiteStorage(): void {
  for (const storage of getStorageAreas()) {
    try {
      clearStorage(storage);
    } catch {
      // Storage access can throw in private mode or when full. Continue with
      // the other storage area when one storage area is unavailable.
    }
  }
}
