// Pure aggregation for the three /v2/visibility "deep" boards: the buyer
// question portfolio, one question's detail, and the citation explorer.
//
// Deliberately has NO import of `../storage` or `../db`: those throw at
// import time without `DATABASE_URL` set (see server/db.ts), which would
// make this module's own unit tests need a database to even load. The route
// file (server/routes/v2Questions.ts) does the database reads and hands the
// rows to the functions here.
//
// None of these views has a matching endpoint anywhere else in the product.
// `brand_prompts` holds the approved question set and `geo_rankings` holds
// one row per (run, question, engine) - see
// `docs/superpowers/analysis/2026-09-14-screens/08-verification-A.md` row
// 35-37. Every field below is computed from those two tables; nothing is
// invented. Where the boards' reference fragments show a field this schema
// cannot back (market, language, a recommendation rate, a next-run
// schedule), the field is left out of the response rather than filled with a
// constant - the client renders the honest "not measured" state for it.
//
// `isCited` means "the brand-name matcher found the brand in this answer"
// (server/citationChecker.ts:993), a MENTION. A row additionally counts as
// CITED (with a source link) when it carries a `citingOutletUrl` or a
// non-empty `citedUrls` array - see the longer note in
// server/services/v2Report.ts, which this file mirrors.

import type { BrandPrompt, GeoRanking } from "@shared/schema";
import { isFailedCheck } from "@shared/citationFailure";
import { splitCitationContext } from "../lib/citationContextFormat";
import { TRACKED_PROMPTS_CAP } from "@shared/constants";

const RECENT_WINDOW_DAYS = 30;

export function isCitedWithLink(row: GeoRanking): boolean {
  return row.isCited === 1 && Boolean(row.citingOutletUrl || (row.citedUrls?.length ?? 0) > 0);
}

function funnelLabel(stage: string | null): string | null {
  switch (stage) {
    case "TOFU":
      return "Awareness";
    case "MOFU":
      return "Consideration";
    case "BOFU":
      return "Decision";
    default:
      return null;
  }
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

// ---------------------------------------------------------------------------
// Portfolio (board 35)
// ---------------------------------------------------------------------------

export type PortfolioRow = {
  id: string;
  text: string;
  journeyStage: string | null;
  category: string | null;
  region: string;
  audienceNames: string[];
  status: "tracked" | "suggested" | "archived";
  paused: boolean;
  activeEngineCount: number;
  latestVisibilityCount: number;
  latestVisibilityDenominator: number;
  citationRate: number | null;
  change30d: number | null;
  /** When the question was added. Named `createdAt`, not `updatedAt` -
   *  `brand_prompts` has no edit-history column, so this must not be shown
   *  as a "last updated" date. */
  createdAt: string;
};

export type PortfolioSummary = {
  questions: PortfolioRow[];
  setHealth: { score: number | null; verdict: string | null } | null;
  allowance: { used: number; limit: number };
};

/** Pure aggregation, exported for unit testing without a database. */
export function summarizePortfolio(
  prompts: readonly BrandPrompt[],
  rows: readonly GeoRanking[],
  audienceNamesByPrompt: ReadonlyMap<string, string[]>,
  setHealth: { score: number | null; verdict: string | null } | null,
): PortfolioSummary {
  const now = Date.now();
  const recentSince = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const priorSince = now - 2 * RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const byPrompt = new Map<string, GeoRanking[]>();
  for (const row of rows) {
    if (!row.brandPromptId) continue;
    const bucket = byPrompt.get(row.brandPromptId);
    if (bucket) bucket.push(row);
    else byPrompt.set(row.brandPromptId, [row]);
  }

  const questions: PortfolioRow[] = prompts
    .filter((prompt) => prompt.status !== "archived")
    .map((prompt) => {
      const promptRows = (byPrompt.get(prompt.id) ?? []).filter(
        (row) => !isFailedCheck(row.citationContext),
      );

      // Latest observed result per engine, for the "N of M engines" figure.
      const latestByEngine = new Map<string, GeoRanking>();
      for (const row of promptRows) {
        const existing = latestByEngine.get(row.aiPlatform);
        if (!existing || new Date(row.checkedAt) > new Date(existing.checkedAt)) {
          latestByEngine.set(row.aiPlatform, row);
        }
      }
      const activeEngineCount = latestByEngine.size;
      const latestVisibilityCount = [...latestByEngine.values()].filter(
        (row) => row.isCited === 1,
      ).length;

      const recentRows = promptRows.filter(
        (row) => new Date(row.checkedAt).getTime() >= recentSince,
      );
      const priorRows = promptRows.filter((row) => {
        const at = new Date(row.checkedAt).getTime();
        return at >= priorSince && at < recentSince;
      });
      const recentCitationRate = pct(
        recentRows.filter((row) => isCitedWithLink(row)).length,
        recentRows.length,
      );
      const recentMentionRate = pct(
        recentRows.filter((row) => row.isCited === 1).length,
        recentRows.length,
      );
      const priorMentionRate = pct(
        priorRows.filter((row) => row.isCited === 1).length,
        priorRows.length,
      );
      const change30d =
        recentMentionRate !== null && priorMentionRate !== null
          ? recentMentionRate - priorMentionRate
          : null;

      return {
        id: prompt.id,
        text: prompt.prompt,
        journeyStage: funnelLabel(prompt.funnelStage),
        category: prompt.category,
        region: prompt.region,
        audienceNames: audienceNamesByPrompt.get(prompt.id) ?? [],
        status: prompt.status as "tracked" | "suggested" | "archived",
        paused: prompt.paused,
        activeEngineCount,
        latestVisibilityCount,
        latestVisibilityDenominator: activeEngineCount,
        citationRate: recentCitationRate,
        change30d,
        createdAt: prompt.createdAt.toISOString(),
      };
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "tracked" ? -1 : 1));

  const used = prompts.filter((prompt) => prompt.status !== "archived").length;

  return { questions, setHealth, allowance: { used, limit: TRACKED_PROMPTS_CAP } };
}

// ---------------------------------------------------------------------------
// Detail (board 36)
// ---------------------------------------------------------------------------

export type TrendPoint = {
  weekStart: string;
  mentionRate: number | null;
  citationRate: number | null;
  failureRate: number | null;
};

export type EngineRecordRow = {
  engine: string;
  total: number;
  answered: number;
  mentioned: number;
  cited: number;
  failed: number;
};

export type CitedUrlRow = { url: string; citations: number; engines: string[] };
export type CompetitorRow = { name: string; mentions: number; engines: string[] };

export type QuestionDetail = {
  question: {
    id: string;
    text: string;
    status: string;
    paused: boolean;
    category: string | null;
    journeyStage: string | null;
    region: string;
    /** When the question was added. `brand_prompts` has no edit-history
     *  column, so there is no separate "last updated" value to show. */
    createdAt: string;
  };
  trend: TrendPoint[];
  metrics: {
    mentionCount: number;
    citationCount: number;
    failedCount: number;
    attemptCount: number;
  };
  engineRecords: EngineRecordRow[];
  citedUrls: CitedUrlRow[];
  competitors: CompetitorRow[];
};

function weekStartOf(date: Date): string {
  const dt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

const DETAIL_TREND_WEEKS = 8;

/** Pure aggregation, exported for unit testing without a database. */
export function summarizeQuestionDetail(
  prompt: BrandPrompt,
  rows: readonly GeoRanking[],
): QuestionDetail {
  const failedRows = rows.filter((row) => isFailedCheck(row.citationContext));
  const answered = rows.filter((row) => !isFailedCheck(row.citationContext));

  const nowWeek = weekStartOf(new Date());
  const buckets = new Map<
    string,
    { measured: number; mentioned: number; cited: number; attempts: number; failed: number }
  >();
  for (let i = DETAIL_TREND_WEEKS - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i * 7);
    const key = weekStartOf(d);
    if (key <= nowWeek)
      buckets.set(key, { measured: 0, mentioned: 0, cited: 0, attempts: 0, failed: 0 });
  }
  for (const row of rows) {
    const key = weekStartOf(new Date(row.checkedAt));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.attempts += 1;
    if (isFailedCheck(row.citationContext)) {
      bucket.failed += 1;
      continue;
    }
    bucket.measured += 1;
    if (row.isCited === 1) {
      bucket.mentioned += 1;
      if (isCitedWithLink(row)) bucket.cited += 1;
    }
  }
  const trend: TrendPoint[] = [...buckets.entries()].map(([weekStart, bucket]) => ({
    weekStart,
    mentionRate: pct(bucket.mentioned, bucket.measured),
    citationRate: pct(bucket.cited, bucket.measured),
    failureRate: pct(bucket.failed, bucket.attempts),
  }));

  const byEngine = new Map<string, GeoRanking[]>();
  for (const row of rows) {
    const bucket = byEngine.get(row.aiPlatform);
    if (bucket) bucket.push(row);
    else byEngine.set(row.aiPlatform, [row]);
  }
  const engineRecords: EngineRecordRow[] = [...byEngine.entries()]
    .map(([engine, engineRows]) => {
      const engineAnswered = engineRows.filter((row) => !isFailedCheck(row.citationContext));
      return {
        engine,
        total: engineRows.length,
        answered: engineAnswered.length,
        mentioned: engineAnswered.filter((row) => row.isCited === 1).length,
        cited: engineAnswered.filter((row) => isCitedWithLink(row)).length,
        failed: engineRows.length - engineAnswered.length,
      };
    })
    .sort((a, b) => b.total - a.total);

  const urlAgg = new Map<string, { citations: number; engines: Set<string> }>();
  for (const row of answered) {
    if (!isCitedWithLink(row)) continue;
    const urls =
      row.citedUrls && row.citedUrls.length > 0
        ? row.citedUrls
        : row.citingOutletUrl
          ? [row.citingOutletUrl]
          : [];
    for (const url of urls) {
      const agg = urlAgg.get(url) ?? { citations: 0, engines: new Set<string>() };
      agg.citations += 1;
      agg.engines.add(row.aiPlatform);
      urlAgg.set(url, agg);
    }
  }
  const citedUrls: CitedUrlRow[] = [...urlAgg.entries()]
    .map(([url, agg]) => ({ url, citations: agg.citations, engines: [...agg.engines] }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 10);

  const competitorAgg = new Map<string, { mentions: number; engines: Set<string> }>();
  for (const row of answered) {
    const mentioned = Array.isArray(row.mentionedBrands)
      ? (row.mentionedBrands as Array<{ name?: string; cited?: boolean }>)
      : [];
    for (const entry of mentioned) {
      if (!entry?.cited || !entry.name) continue;
      if (entry.name.trim().toLowerCase() === prompt.prompt.trim().toLowerCase()) continue;
      const agg = competitorAgg.get(entry.name) ?? { mentions: 0, engines: new Set<string>() };
      agg.mentions += 1;
      agg.engines.add(row.aiPlatform);
      competitorAgg.set(entry.name, agg);
    }
  }
  const competitors: CompetitorRow[] = [...competitorAgg.entries()]
    .map(([name, agg]) => ({ name, mentions: agg.mentions, engines: [...agg.engines] }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10);

  return {
    question: {
      id: prompt.id,
      text: prompt.prompt,
      status: prompt.status,
      paused: prompt.paused,
      category: prompt.category,
      journeyStage: funnelLabel(prompt.funnelStage),
      region: prompt.region,
      createdAt: prompt.createdAt.toISOString(),
    },
    trend,
    metrics: {
      mentionCount: answered.filter((row) => row.isCited === 1).length,
      citationCount: answered.filter((row) => isCitedWithLink(row)).length,
      failedCount: failedRows.length,
      attemptCount: rows.length,
    },
    engineRecords,
    citedUrls,
    competitors,
  };
}

// ---------------------------------------------------------------------------
// Citation explorer (board 37)
// ---------------------------------------------------------------------------

export type AnswerRecordRow = {
  id: string;
  questionId: string | null;
  question: string;
  engine: string;
  state: "cited" | "mentioned" | "not_mentioned" | "failed";
  brandMentioned: boolean;
  brandCited: boolean;
  sourceDomain: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  excerpt: string | null;
};

export type CitationExplorerSummary = {
  captureDate: string | null;
  summary: { mentions: number; citations: number; failures: number; attempts: number };
  records: AnswerRecordRow[];
  sourceMix: Array<{ type: string; count: number }>;
  firstPartyShare: number | null;
  thirdPartyShare: number | null;
};

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Pure aggregation, exported for unit testing without a database. */
export function summarizeCitationExplorer(
  rows: readonly GeoRanking[],
  prompts: readonly BrandPrompt[],
  brandDomain: string | null,
): CitationExplorerSummary {
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const sorted = [...rows].sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
  );

  const records: AnswerRecordRow[] = sorted.map((row) => {
    const failed = isFailedCheck(row.citationContext);
    const mentioned = !failed && row.isCited === 1;
    const cited = !failed && isCitedWithLink(row);
    const sourceUrl = row.citingOutletUrl ?? row.citedUrls?.[0] ?? null;
    const state: AnswerRecordRow["state"] = failed
      ? "failed"
      : cited
        ? "cited"
        : mentioned
          ? "mentioned"
          : "not_mentioned";
    return {
      id: row.id,
      questionId: row.brandPromptId,
      question: (row.brandPromptId && promptById.get(row.brandPromptId)?.prompt) || row.prompt,
      engine: row.aiPlatform,
      state,
      brandMentioned: mentioned,
      brandCited: cited,
      sourceDomain: cited ? hostnameOf(sourceUrl) : null,
      sourceType: cited ? row.sourceType : null,
      sourceUrl: cited ? sourceUrl : null,
      capturedAt: new Date(row.checkedAt).toISOString(),
      excerpt: failed ? null : splitCitationContext(row.citationContext).snippet,
    };
  });

  const attempts = records.length;
  const failures = records.filter((row) => row.state === "failed").length;
  const mentions = records.filter((row) => row.brandMentioned).length;
  const citations = records.filter((row) => row.brandCited).length;

  const sourceMixCounts = new Map<string, number>();
  let firstParty = 0;
  let thirdParty = 0;
  for (const row of records) {
    if (!row.brandCited) continue;
    const type = row.sourceType ?? "Unknown";
    sourceMixCounts.set(type, (sourceMixCounts.get(type) ?? 0) + 1);
    if (brandDomain && row.sourceDomain === brandDomain) firstParty += 1;
    else thirdParty += 1;
  }
  const sourceMix = [...sourceMixCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const partyTotal = firstParty + thirdParty;

  const captureDate = records[0]?.capturedAt ? records[0].capturedAt.slice(0, 10) : null;

  return {
    captureDate,
    summary: { mentions, citations, failures, attempts },
    records,
    sourceMix,
    firstPartyShare: partyTotal > 0 ? Math.round((firstParty / partyTotal) * 100) : null,
    thirdPartyShare: partyTotal > 0 ? Math.round((thirdParty / partyTotal) * 100) : null,
  };
}

export function hostnameOfUrl(url: string | null | undefined): string | null {
  return hostnameOf(url);
}
