import type { BrandFactView } from "../data/brandFacts";

// What a fact row means, derived once so the table, the evidence block and
// the review gate cannot disagree about it.

/**
 * The three positions a fact can be in, told apart by GLYPH AND WORDS.
 *
 * Never by hue: `index.css:580` aliases `--warning` to `--brand-accent`, so a
 * "needs review" chip painted `text-warning` would be the same pixel colour as
 * every link on this screen. `state/StateBadge.tsx` sets out the rule and the
 * reason at length; this is the same rule applied to review state.
 *
 * The distinctions are the ones this screen exists to protect:
 *   - "Needs review" is not "wrong". Nobody has looked at it yet.
 *   - "Confirmed" means the brand owner said so. It is never reached by
 *     viewing the page, by approving a different fact, or by any default.
 *   - "Dismissed" is not "confirmed". The value was rejected, and saying
 *     nothing about it would read as quiet approval.
 */
export type FactReviewState = "needs_review" | "confirmed" | "dismissed";

export function reviewStateOf(fact: BrandFactView): FactReviewState {
  if (fact.dismissedAt) return "dismissed";
  if (fact.acceptedAt) return "confirmed";
  return "needs_review";
}

export function needsReview(fact: BrandFactView): boolean {
  return reviewStateOf(fact) === "needs_review";
}

/** `service_region` -> `Service region`. The stored key is a machine key; the
 *  table column is read by a person. */
export function factLabel(factKey: string): string {
  const words = factKey.replace(/[_-]+/g, " ").trim();
  if (words.length === 0) return factKey;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * How a source reads in the table.
 *
 * A fact with no `sourceUrl` did not come from a page - it was supplied by
 * the user during onboarding or entered by hand. Saying "User supplied"
 * rather than leaving the cell blank is the difference between "we know where
 * this came from" and "we lost track of where this came from".
 */
export function sourceLabel(sourceUrl: string | null): string {
  if (!sourceUrl) return "User supplied";
  try {
    const url = new URL(sourceUrl);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    // Not a parseable URL. Show what was stored rather than hide it.
    return sourceUrl;
  }
}

export type ScannedPage = {
  /** The grouping key: the absolute URL, or `null` for user-supplied facts. */
  sourceUrl: string | null;
  label: string;
  factCount: number;
  /** The most recent `lastVerified` across the page's facts, ISO or null. */
  lastVerified: string | null;
};

/**
 * The pages these facts were read out of, derived from the facts themselves.
 *
 * IT IS DERIVED, AND THAT BOUNDS IT. A page that was scanned and yielded
 * nothing produces no fact row, so it cannot appear here - only the run
 * endpoint (`/api/brand-fact-sheet/runs/:runId`) knows about those, and this
 * screen does not read a run. So the list is titled for what it actually is:
 * the pages these facts came from, not every page that was visited. Claiming
 * the second from the first would be a lie about coverage.
 */
export function scannedPages(facts: readonly BrandFactView[]): ScannedPage[] {
  const groups = new Map<string, ScannedPage>();
  for (const fact of facts) {
    const key = fact.sourceUrl ?? "";
    const existing = groups.get(key);
    if (existing) {
      existing.factCount += 1;
      if (
        fact.lastVerified &&
        (!existing.lastVerified || fact.lastVerified > existing.lastVerified)
      ) {
        existing.lastVerified = fact.lastVerified;
      }
      continue;
    }
    groups.set(key, {
      sourceUrl: fact.sourceUrl,
      label: sourceLabel(fact.sourceUrl),
      factCount: 1,
      lastVerified: fact.lastVerified,
    });
  }
  return [...groups.values()].sort((a, b) => b.factCount - a.factCount);
}
