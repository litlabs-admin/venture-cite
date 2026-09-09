// The one classifier that tells a FAILED PROVIDER CALL apart from an answer.
//
// PORTED, DELIBERATELY UNCHANGED, from `server/lib/citationContextFormat.ts`
// on `feat/v2-ui-vis`, where it was written and verified against the real
// database (7,302 geo_rankings rows, 2,604 of them failed calls). The name,
// the constants and the semantics are identical so the two branches converge
// on one predicate at integration rather than on two that drift.
//
// It lives in `shared/` rather than in `server/lib/` for one reason: the
// screen that needs it is a client screen. `client/src/**` cannot import
// `server/**` - the Vite root is `client/`, and the only aliases the app and
// the test runner both carry are `@` and `@shared`. A second copy inside
// `client/src` would be exactly the six-hardcoded-delimiters problem
// `citationContextFormat.ts` was created to end. At integration, the server
// copy re-exports from here.

/**
 * Status-line prefix citationChecker writes when a provider call did not
 * return an answer (see the `fetchError` branch in server/citationChecker.ts).
 *
 * A failed call still becomes a geo_rankings row, with `is_cited = 0`. That
 * makes a failure indistinguishable from an honest "not cited" to any reader
 * that only looks at `is_cited` - which is why every count(*) denominator over
 * geo_rankings silently mixes "the engine answered and did not mention the
 * brand" with "the engine never answered". This prefix is the only recorded
 * difference between the two, so it is the classifier.
 */
export const CHECK_FAILED_PREFIX = "Check failed:";

/**
 * SQL LIKE pattern matching the same rows as `isFailedCheck`, for aggregate
 * queries that must exclude failed calls without loading every row. Kept
 * beside the predicate so the two cannot drift apart.
 */
export const CHECK_FAILED_LIKE_PATTERN = `${CHECK_FAILED_PREFIX}%`;

/**
 * True when the stored citationContext records a failed provider call rather
 * than an answer. Case-insensitive, matching the live UI's own test in
 * client/src/components/citations/PlatformResultCard.tsx.
 */
export function isFailedCheck(ctx: string | null | undefined): boolean {
  if (!ctx) return false;
  return ctx.trimStart().toLowerCase().startsWith(CHECK_FAILED_PREFIX.toLowerCase());
}
