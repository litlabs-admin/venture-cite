/**
 * The "has this brand's current level already been shown to the user"
 * record behind board 47 (level completion).
 *
 * `/work/summary` reports the brand's current level but not whether the
 * user has been told about it - there is no server field for that, so the
 * dispatch keeps the fact client-side, one entry per brand, keyed the way
 * the brief specifies: `vc.v2.levelSeen.<brandId>`.
 *
 * NOTE for the orchestrator: this key is not registered in
 * `client/src/lib/clientStorageKeys.ts`'s `USER_SCOPED_STORAGE_KEYS`, so it
 * is not cleared on logout. That file is outside this worktree's ownership.
 * Because the key is brand-scoped rather than a single static key, clearing
 * it needs either a prefix-aware sweep in that cleanup path or a change to
 * how it enumerates per-brand keys - flagging rather than changing it here.
 */

const KEY_PREFIX = "vc.v2.levelSeen.";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Private windows and locked-down environments can throw on access.
    return null;
  }
}

/** The level number last recorded as shown to the user for this brand, or
 *  `null` if none has ever been recorded (first visit, or storage unavailable). */
export function readLevelSeen(brandId: string): number | null {
  if (!brandId) return null;
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(`${KEY_PREFIX}${brandId}`);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Records `level` as shown for this brand, so the next visit does not treat
 *  it as an unseen completion again. */
export function writeLevelSeen(brandId: string, level: number): void {
  if (!brandId) return;
  const store = storage();
  if (!store) return;
  store.setItem(`${KEY_PREFIX}${brandId}`, String(level));
}
