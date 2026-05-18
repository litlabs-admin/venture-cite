// Canonical visibility math. ONE definition of the citation rate AND the
// composite visibility score, so every surface shows the same number for
// the same brand/platform (PRODUCT.md principle 2 — "one number means one
// thing everywhere").
//
// The visibility-score formula here is the dashboard-hero formula, which
// the code already designated as canonical (dashboard.ts: "Must match the
// formula in /api/geo-analytics so both pages agree"). It is rate-based
// (not raw-count-based) and honest (zero citations → zero, no theater).
// /api/geo-analytics, /api/dashboard/rankings and /api/dashboard/
// entity-strength were previously three *different* formulas; they now
// all derive from computeVisibilityScore (expressed at their natural
// scale), so the numbers finally agree across screens.

/** Citation rate as a 0..1 fraction. 0 when there were no checks. */
export function citationRateFraction(cited: number, total: number): number {
  return total > 0 ? cited / total : 0;
}

/** Citation rate as an integer 0..100 percentage. 0 when no checks. */
export function citationRatePct(cited: number, total: number): number {
  return total > 0 ? Math.round((cited / total) * 100) : 0;
}

/**
 * Canonical visibility score, integer 0..100. Works at any scope (whole
 * brand or a single platform) — pass that scope's aggregates.
 *
 * - `cited` / `total`: cited vs total (prompt × engine) checks in scope.
 * - `avgRank`: mean rank of the cited rows. <= 0 means "no rank data" →
 *   neutral (rank-1 citations are worth more than rank-10 at equal rate).
 * - `avgAuthority`: mean 0..100 authority of the cited rows (0 if none).
 *
 * Zero citations → 0 (no theater). Otherwise 70 pts from rate blended
 * with rank quality + 30 pts from cited-source authority.
 */
export function computeVisibilityScore(
  cited: number,
  total: number,
  avgRank: number,
  avgAuthority: number,
): number {
  if (cited <= 0) return 0;
  const rate = citationRateFraction(cited, total);
  const rankFactor = avgRank > 0 ? Math.max(0, 1 - (avgRank - 1) / 10) : 1;
  const raw = 70 * rate * ((1 + rankFactor) / 2) + 30 * (Math.max(0, avgAuthority) / 100);
  return Math.min(100, Math.max(0, Math.round(raw)));
}
