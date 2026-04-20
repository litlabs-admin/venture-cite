// Per-user localStorage key for the "currently active" content draft id.
// Keying by user.id prevents one user's draft id from leaking into another
// user's session on the same browser (logout + new login on same device).

const LEGACY_KEY = "venturecite-active-draft-id";
const PREFIX = "venturecite-active-draft-id:";

function keyFor(userId: string) {
  return `${PREFIX}${userId}`;
}

export function getActiveDraftId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    const scoped = localStorage.getItem(keyFor(userId));
    if (scoped) return scoped;
    // One-shot migration from the old unscoped key for returning users.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(keyFor(userId), legacy);
      localStorage.removeItem(LEGACY_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function setActiveDraftId(userId: string | null | undefined, draftId: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(keyFor(userId), draftId);
  } catch {
    // storage full — ignore
  }
}

export function clearActiveDraftId(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
