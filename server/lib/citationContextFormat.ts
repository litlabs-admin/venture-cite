// Single source of truth for the citationContext delimiter format.
//
// geo_rankings.citation_context (and the derived competitor rows) store a
// short status line / snippet followed by the model's raw response text,
// joined by a marker so the UI can split "what we show by default" from
// "what we show when expanded" without a second column.
//
// Current format, written by citationChecker.ts and the re-detect-all route
// in server/routes/prompts.ts:
//   "{statusLineOrSnippet}\n\n||| RAW_RESPONSE |||\n{rawResponseText}"
//
// Legacy format, written before 2026-04-16 and never written by current
// code. Rows in this format still exist in the database, so readers that
// render historical data check for it as a fallback:
//   "{snippet}\n\n--- RAW RESPONSE ---\n{rawResponseText}"
//
// Before this module existed, six files each hardcoded one or both of
// these delimiter strings (some in a local `RAW_DELIM` constant, some
// inline). A delimiter defined in six places is one edit away from a
// parser that no longer matches its writer - every writer and reader now
// imports the constants (and, where the split logic was byte-identical
// across files, the shared functions) from here instead.

export const RAW_RESPONSE_DELIMITER = "||| RAW_RESPONSE |||";
export const LEGACY_RAW_RESPONSE_DELIMITER = "--- RAW RESPONSE ---";

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

const RAW_RESPONSE_MARKER = `\n\n${RAW_RESPONSE_DELIMITER}\n`;
const LEGACY_RAW_RESPONSE_MARKER = `\n\n${LEGACY_RAW_RESPONSE_DELIMITER}\n`;

/**
 * Builds a citationContext string in the current format. This is the only
 * writer - nothing should ever write the legacy marker again.
 */
export function buildCitationContext(statusLineOrSnippet: string, rawResponseText: string): string {
  return `${statusLineOrSnippet}${RAW_RESPONSE_MARKER}${rawResponseText}`;
}

/**
 * Splits a stored citationContext into its snippet/status-line and its raw
 * response body, accepting either the current or the legacy marker so rows
 * written before the 2026-04-16 format change still render. When neither
 * marker is present the whole string is treated as the snippet and
 * fullResponse is null - this is a genuine "no raw response was ever
 * recorded" case (e.g. very old rows), not an error.
 *
 * This is the exact logic server/routes/dashboard.ts and
 * server/routes/prompts.ts each had their own copy of.
 */
export function splitCitationContext(ctx: string | null | undefined): {
  snippet: string | null;
  fullResponse: string | null;
} {
  if (!ctx) return { snippet: null, fullResponse: null };
  for (const marker of [RAW_RESPONSE_MARKER, LEGACY_RAW_RESPONSE_MARKER]) {
    const idx = ctx.indexOf(marker);
    if (idx !== -1) {
      return {
        snippet: ctx.slice(0, idx).trim() || null,
        fullResponse: ctx.slice(idx + marker.length).trim() || null,
      };
    }
  }
  return { snippet: ctx, fullResponse: null };
}
