// Wave 9.4: shared shape returned by listicle / wikipedia / mention
// scanners. Replaces the per-scanner ad-hoc { inserted: number } so the
// route handlers can render multi-line toasts ("Found N · Inserted M ·
// Skipped (duplicates) D · Failed F") instead of swallowing partial
// failures into a single misleading success message.

export interface ScanFailure {
  /** Optional URL/identifier that failed (omitted for non-URL ops). */
  url?: string;
  /** Short human-readable cause; will be surfaced to the user. */
  reason: string;
}

export interface ScanReport {
  /** Total candidates considered (after pre-dedupe heuristics). */
  found: number;
  /** Newly persisted rows. */
  inserted: number;
  /** Candidates that hit a unique-index conflict — "you already had it". */
  skippedDuplicate: number;
  /** Candidates the scanner intentionally skipped (irrelevant, too short, etc). */
  skippedFiltered: number;
  /** Per-failure details — rate limits, fetch errors, parse failures. */
  failed: ScanFailure[];
  /** Wave 9.4: re-verification phase only (listicles). */
  reverified?: number;
  lostInclusion?: number;
  /** Optional warning surfaced to the toast (e.g. ambiguous brand name). */
  warning?: string;
}

export function emptyReport(): ScanReport {
  return {
    found: 0,
    inserted: 0,
    skippedDuplicate: 0,
    skippedFiltered: 0,
    failed: [],
  };
}
