// Pure aggregation for the /v2/visibility/report screen.
//
// Deliberately has NO import of `../storage` or `../db`: those throw at
// import time without `DATABASE_URL` set (see server/db.ts), which would
// make this module's own unit tests need a database to even load. The route
// file (server/routes/v2Reports.ts) does the database read and hands the
// rows to `summarizeReport` here.
//
// The screen needs three things no existing endpoint returns: a top-question
// table, a cited-domain breakdown, and a "brand omissions" table (questions
// where a competitor is named in the answer and the tracked brand is not).
// All three are computed from `geo_rankings` rows already read elsewhere in
// the product - nothing new is written to the database to produce them.
//
// `isCited` on a geo_rankings row means "the brand-name matcher found the
// brand in the response" (server/citationChecker.ts:993) - a MENTION, not
// proof of a source link. A row additionally counts as CITED (with a link)
// when it also carries a `citingOutletUrl` or a non-empty `citedUrls` array.
// Every count below keeps that distinction rather than treating isCited as
// "cited".
//
// Failed provider calls still write a geo_rankings row with `is_cited = 0`
// and a `citationContext` beginning "Check failed:" - `isFailedCheck` is the
// one classifier for that, shared with the mention-rate endpoint
// (server/services/v2Visibility.ts) so the two never drift.

import type { BrandPrompt, GeoRanking } from "@shared/schema";
import { isFailedCheck } from "@shared/citationFailure";

const PERIOD_LENGTH_DAYS = 14;

export type ReportQuestionRow = {
  id: string;
  text: string;
  attempts: number;
  mentions: number;
  cited: number;
  engineCount: number;
};

export type ReportDomainRow = { domain: string; citations: number; share: number };

export type ReportOmissionRow = {
  questionId: string;
  text: string;
  engineCount: number;
  engineTotal: number;
  competitorCount: number;
  competitorNames: string[];
};

export type ReportSummary = {
  period: { start: string; end: string } | null;
  /** Answered attempts in the report period, and how many mentioned the
   *  brand - the "Observed visibility" tile's fraction. */
  observedMentions: number;
  observedAttempts: number;
  /** Of `observedAttempts`, how many carried a source link - the
   *  "Citations" tile. Always <= observedMentions, unlike a raw isCited
   *  count, because a link requires a mention first. */
  citedWithLink: number;
  buyerQuestions: ReportQuestionRow[];
  citedDomains: ReportDomainRow[];
  totalCitations: number;
  omissions: ReportOmissionRow[];
};

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when `name` and `brandName` look like the same entity - used to keep
 *  the tracked brand's own name out of an "omissions" competitor list. */
function namesMatch(name: string, brandName: string): boolean {
  const a = name.trim().toLowerCase();
  const b = brandName.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function isCitedWithLink(row: GeoRanking): boolean {
  return row.isCited === 1 && Boolean(row.citingOutletUrl || (row.citedUrls?.length ?? 0) > 0);
}

/**
 * Pure aggregation over rows already loaded from `geo_rankings`. Exported so
 * a unit test can prove the math against a captured response shape without a
 * database.
 */
export function summarizeReport(
  rows: readonly GeoRanking[],
  prompts: readonly BrandPrompt[],
  brandName: string,
): ReportSummary {
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const answered = rows.filter((row) => !isFailedCheck(row.citationContext));

  if (answered.length === 0) {
    return {
      period: null,
      observedMentions: 0,
      observedAttempts: 0,
      citedWithLink: 0,
      buyerQuestions: [],
      citedDomains: [],
      totalCitations: 0,
      omissions: [],
    };
  }

  const latestMs = answered.reduce(
    (max, row) => Math.max(max, new Date(row.checkedAt).getTime()),
    new Date(answered[0]!.checkedAt).getTime(),
  );
  const periodEnd = new Date(latestMs);
  const periodStart = new Date(
    periodEnd.getTime() - (PERIOD_LENGTH_DAYS - 1) * 24 * 60 * 60 * 1000,
  );
  const withinPeriod = answered.filter((row) => new Date(row.checkedAt) >= periodStart);
  // A brand with sparse measurement can have zero answers in the last 14
  // days even though it has been measured before. Fall back to the full
  // lookback window rather than showing an empty report for a brand that
  // does have evidence, just not evidence this recent.
  const scoped = withinPeriod.length > 0 ? withinPeriod : answered;

  type QuestionAgg = { attempts: number; mentions: number; cited: number; engines: Set<string> };
  const byQuestion = new Map<string, QuestionAgg>();
  for (const row of scoped) {
    if (!row.brandPromptId) continue;
    const agg = byQuestion.get(row.brandPromptId) ?? {
      attempts: 0,
      mentions: 0,
      cited: 0,
      engines: new Set<string>(),
    };
    agg.attempts += 1;
    agg.engines.add(row.aiPlatform);
    if (row.isCited === 1) {
      agg.mentions += 1;
      if (isCitedWithLink(row)) agg.cited += 1;
    }
    byQuestion.set(row.brandPromptId, agg);
  }
  const buyerQuestions: ReportQuestionRow[] = [...byQuestion.entries()]
    .map(([id, agg]) => ({
      id,
      text: promptById.get(id)?.prompt ?? "Untracked question",
      attempts: agg.attempts,
      mentions: agg.mentions,
      cited: agg.cited,
      engineCount: agg.engines.size,
    }))
    .sort((a, b) => b.mentions - a.mentions || b.attempts - a.attempts)
    .slice(0, 5);

  const domainCounts = new Map<string, number>();
  let totalCitations = 0;
  for (const row of scoped) {
    if (!isCitedWithLink(row)) continue;
    const urls =
      row.citedUrls && row.citedUrls.length > 0
        ? row.citedUrls
        : row.citingOutletUrl
          ? [row.citingOutletUrl]
          : [];
    for (const url of urls) {
      const domain = hostnameOf(url);
      if (!domain) continue;
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      totalCitations += 1;
    }
  }
  const citedDomains: ReportDomainRow[] = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, citations]) => ({
      domain,
      citations,
      share: totalCitations > 0 ? Math.round((citations / totalCitations) * 100) : 0,
    }));

  type OmissionAgg = { engines: Set<string>; totalEngines: Set<string>; competitors: Set<string> };
  const byOmission = new Map<string, OmissionAgg>();
  for (const row of scoped) {
    if (!row.brandPromptId) continue;
    const agg = byOmission.get(row.brandPromptId) ?? {
      engines: new Set<string>(),
      totalEngines: new Set<string>(),
      competitors: new Set<string>(),
    };
    agg.totalEngines.add(row.aiPlatform);
    const mentioned = Array.isArray(row.mentionedBrands)
      ? (row.mentionedBrands as Array<{ name?: string; cited?: boolean }>)
      : [];
    const competitorsHere = mentioned
      .filter((entry) => entry?.cited && entry.name && !namesMatch(entry.name, brandName))
      .map((entry) => entry.name as string);
    if (row.isCited !== 1 && competitorsHere.length > 0) {
      agg.engines.add(row.aiPlatform);
      for (const name of competitorsHere) agg.competitors.add(name);
    }
    byOmission.set(row.brandPromptId, agg);
  }
  const omissions: ReportOmissionRow[] = [...byOmission.entries()]
    .filter(([, agg]) => agg.engines.size > 0)
    .map(([id, agg]) => ({
      questionId: id,
      text: promptById.get(id)?.prompt ?? "Untracked question",
      engineCount: agg.engines.size,
      engineTotal: agg.totalEngines.size,
      competitorCount: agg.competitors.size,
      competitorNames: [...agg.competitors].slice(0, 5),
    }))
    .sort((a, b) => b.engineCount - a.engineCount || b.competitorCount - a.competitorCount)
    .slice(0, 5);

  return {
    period: { start: dateOnly(periodStart), end: dateOnly(periodEnd) },
    observedMentions: scoped.filter((row) => row.isCited === 1).length,
    observedAttempts: scoped.length,
    citedWithLink: scoped.filter((row) => isCitedWithLink(row)).length,
    buyerQuestions,
    citedDomains,
    totalCitations,
    omissions,
  };
}
