// The v2 mention rate.
//
// WHY THIS FILE EXISTS, since nothing else in the tree computes a rate twice.
//
// A provider call that never returned an answer still becomes a geo_rankings
// row, with `is_cited = 0` and a citation_context whose status line starts
// "Check failed:" (server/citationChecker.ts, the `fetchError` branch). Every
// existing denominator over that table is `count(*)`, so a failed call is
// counted exactly like an engine that answered and did not mention the brand.
//
// The effect is not small. Across this database 2,604 of 7,302 observations
// are failed calls, which is why the live dashboard reads a brand at 44.5%
// when the answers actually collected put it at 82.1%.
//
// The live dashboard keeps its numbers. `getDashboardHero` and
// `getDashboardCitationTrend` are untouched, and nothing here is wired into
// them. This function is read only by /v2/ screens, and it divides by answers
// actually collected.
//
// A failure is NOT folded into any other state. It is reported as its own
// count so a screen can say "12 calls failed" rather than quietly shrinking a
// denominator and leaving the user to wonder where the sample went.

import { storage } from "../storage";
import { citationRatePct } from "@shared/visibilityMetrics";

/** Weeks of history the v2 trend covers, matching the live trend's window. */
const WEEKS = 8;

export type V2MentionWeek = {
  weekStart: string;
  /** Answers actually collected: observations minus failed calls. */
  measured: number;
  /** Of `measured`, those that mentioned the brand. */
  cited: number;
  /** Calls that never returned an answer. Never part of `measured`. */
  failed: number;
  /** `cited / measured` as an integer percent. 0 when `measured` is 0 - which
   *  is why a caller must test `measured`, not this, before rendering. */
  mentionRate: number;
};

export type V2MentionRate = {
  /** Answers actually collected across the window. ZERO MEANS NEVER
   *  MEASURED, and is not the same as a measured zero. */
  measured: number;
  cited: number;
  failed: number;
  /** Every observation, failures included. Reported so a screen can show what
   *  was excluded rather than silently absorbing the difference. */
  observed: number;
  mentionRate: number;
  weeks: V2MentionWeek[];
};

/**
 * Mention rate for a brand over the trailing 8 weeks, with failed provider
 * calls excluded from the denominator and reported separately.
 */
export async function getV2MentionRate(brandId: string): Promise<V2MentionRate> {
  const since = new Date(Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000);
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  const promptIds = prompts.map((p) => p.id);
  const rows =
    promptIds.length > 0
      ? await storage.getWeeklyMentionTrendExcludingFailures(promptIds, since)
      : [];

  // Monday-anchored week starts, the same anchoring the live trend uses, so
  // the two series line up week for week even though their values differ.
  const weekStartOf = (d: Date) => {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = dt.getUTCDay(); // 0=Sun..6=Sat
    dt.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
    return dt;
  };

  // Seed every week in the window. A week with no observations must survive
  // as measured=0 so the client can render it as "Not measured" rather than
  // having the gap disappear and the line join across it unremarked.
  const buckets = new Map<string, { measured: number; cited: number; failed: number }>();
  const nowWeek = weekStartOf(new Date());
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(nowWeek);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.set(d.toISOString().slice(0, 10), { measured: 0, cited: 0, failed: 0 });
  }
  for (const row of rows) {
    const bucket = buckets.get(row.weekStart);
    if (!bucket) continue;
    bucket.measured = row.total - row.failed;
    bucket.cited = row.cited;
    bucket.failed = row.failed;
  }

  const weeks: V2MentionWeek[] = [...buckets.entries()].map(([weekStart, b]) => ({
    weekStart,
    measured: b.measured,
    cited: b.cited,
    failed: b.failed,
    mentionRate: citationRatePct(b.cited, b.measured),
  }));

  const measured = weeks.reduce((sum, week) => sum + week.measured, 0);
  const cited = weeks.reduce((sum, week) => sum + week.cited, 0);
  const failed = weeks.reduce((sum, week) => sum + week.failed, 0);

  return {
    measured,
    cited,
    failed,
    observed: measured + failed,
    mentionRate: citationRatePct(cited, measured),
    weeks,
  };
}
