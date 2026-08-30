// GEO content scoring: the 6-signal scorecard and the chunk/extractability
// analysis used by server/routes/geoSignals.ts.
//
// Extracted verbatim from server/routes/geoSignals.ts (B7-14 service-layer
// split). No Express types, no req/res - pure functions over content
// strings that either return plain data or throw.
//
// Honest scoring: 6-signal scorecard backed by real embedding similarity,
// stopword-filtered term coverage, structural extractability, and
// real E-E-A-T proxies.

import { logger } from "../lib/logger";
import {
  embedBatch,
  cosineSimilarity,
  stopwordFilterQuery,
  detectBylines,
  detectCitations,
  detectFactualClaims,
  countContentWords,
  detectHeadings,
  STOPWORDS,
  bucketize,
} from "../lib/geoSignalsScoring";

type SignalResult = {
  signal: string;
  score: number;
  maxScore: number;
  status: "excellent" | "good" | "needs_improvement" | "poor";
  recommendations: string[];
};

export type SignalsResult = {
  signals: SignalResult[];
  overallScore: number;
  termCoverageRatio: number;
  questionHeadingFraction: number;
  wordCount: number;
};

// Single source of truth for score → status. Delegates to the shared
// bucketize() helper so every signal, the overall scorecard, and the
// pipeline-simulation stages agree on what "excellent / good /
// needs_improvement / poor" means. Replaces three drifted threshold
// systems that produced visually contradictory results (a 65/100 read
// "warning" on Pipeline but mostly "good"/"needs_improvement" on
// Scorecard for the same article).
function statusFromScore(score: number, max: number): SignalResult["status"] {
  return bucketize(max > 0 ? score / max : 0);
}

export async function computeSignals(
  content: string,
  targetQuery: string,
  articleUpdatedAt?: string,
  schemaCompleteness?: number,
  ownDomain?: string | null,
): Promise<SignalsResult> {
  const safeContent = typeof content === "string" ? content : "";
  const safeQuery = typeof targetQuery === "string" ? targetQuery : "";

  const wordCount = countContentWords(safeContent);
  const headings = detectHeadings(safeContent);

  let depthScore = 0;
  if (wordCount >= 2000) depthScore = 12;
  else if (wordCount >= 1000) depthScore = 10;
  else if (wordCount >= 500) depthScore = 5;
  if (headings.hasHierarchy) depthScore += 3;
  depthScore = Math.min(15, depthScore);
  const depthRecs: string[] = [];
  if (wordCount < 500)
    depthRecs.push(`Expand content to at least 500 words (currently ${wordCount}).`);
  else if (wordCount < 1000) depthRecs.push("Aim for 1000+ words for richer coverage.");
  else if (wordCount < 2000)
    depthRecs.push("Articles above 2000 words tend to perform better for complex queries.");
  if (!headings.hasHierarchy) depthRecs.push("Use both H2 and H3 headings for clearer hierarchy.");

  const truncated = safeContent.slice(0, 8000);
  let cos = 0;
  if (safeQuery.trim() && truncated.trim()) {
    try {
      const embeds = await embedBatch([safeQuery, truncated]);
      if (embeds.length === 2 && embeds[0].length > 0 && embeds[1].length > 0) {
        cos = cosineSimilarity(embeds[0], embeds[1]);
      }
    } catch (err) {
      logger.warn({ err }, "computeSignals: embedding failed, defaulting similarity to 0");
    }
  }
  const semScore = Math.round(cos * 20);
  // Unified thresholds: same bucketize() as every other signal. The
  // prior Semantic-specific cutoffs (0.75/0.5/0.25 cosine) made the
  // same article read as "good" on Scorecard but "warning" on Pipeline.
  const semStatus = statusFromScore(semScore, 20);
  const semRecs: string[] = [];
  if (semStatus === "needs_improvement" || semStatus === "poor") {
    semRecs.push("Mention the target query's concepts more directly.");
  }

  const terms = stopwordFilterQuery(safeQuery);
  const contentLower = safeContent.toLowerCase();
  let termCoverageRatio = 0;
  let coverageScore = 0;
  const coverageRecs: string[] = [];
  if (terms.length === 0) {
    coverageRecs.push("Target query has no meaningful terms after stopword removal.");
  } else {
    const hits = terms.filter((t) => contentLower.includes(t));
    termCoverageRatio = hits.length / terms.length;
    coverageScore = Math.round(10 * termCoverageRatio);
    const missing = terms.filter((t) => !contentLower.includes(t));
    if (missing.length > 0) coverageRecs.push(`Cover these query terms: ${missing.join(", ")}.`);
  }

  const exactMatch = safeQuery.trim().length > 0 && contentLower.includes(safeQuery.toLowerCase());
  const exactScore = exactMatch ? 5 : 0;
  const exactRecs: string[] = [];
  if (!exactMatch && safeQuery.trim())
    exactRecs.push(`Include the exact phrase "${safeQuery}" at least once.`);

  const chunks = computeChunks(safeContent);
  const structureScore =
    chunks.stats.totalChunks === 0
      ? 0
      : Math.round(15 * (chunks.stats.extractableChunks / chunks.stats.totalChunks));
  const structureRecs: string[] = [];
  if (structureScore < 10)
    structureRecs.push("More chunks need clear headings with direct answers.");

  const byline = detectBylines(safeContent);
  // Pass ownDomain so we count EXTERNAL citations only. The Authority
  // signal cares about whether the article references third-party
  // sources, not whether the footer cross-links to /pricing.
  const citations = detectCitations(safeContent, ownDomain);
  const claims = detectFactualClaims(safeContent);
  let authorityScore = 0;
  if (byline.found) authorityScore += 3;
  if (citations.count >= 3) authorityScore += 4;
  if (claims.count >= 2) authorityScore += 4;
  if (typeof schemaCompleteness === "number" && schemaCompleteness >= 0) {
    authorityScore += Math.round(4 * Math.min(1, schemaCompleteness));
  }
  authorityScore = Math.min(15, authorityScore);
  const authorityRecs: string[] = [];
  if (!byline.found) authorityRecs.push("Add a visible author byline.");
  if (citations.count < 3) authorityRecs.push("Link to at least 3 authoritative external sources.");
  if (claims.count < 2)
    authorityRecs.push('Back claims with attribution phrases ("according to", "research shows").');
  if (typeof schemaCompleteness !== "number" || schemaCompleteness < 1)
    authorityRecs.push("Improve JSON-LD schema completeness in Schema Lab.");

  // Freshness has TWO "this can't be scored" states:
  //   1. `applicable=false` - no timestamp at all: we drop this signal
  //      from the denominator entirely so the user sees an honest %.
  //   2. `applicable=true, score=0` - clock-skew / future timestamp:
  //      we still score it, just as poor.
  let freshnessScore = 0;
  let freshnessStatus: SignalResult["status"] = "poor";
  let freshnessRec = "No update timestamp - freshness cannot be measured.";
  let freshnessApplicable = false;
  if (articleUpdatedAt && typeof articleUpdatedAt === "string" && articleUpdatedAt.length > 0) {
    const parsed = new Date(articleUpdatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      freshnessApplicable = true;
      // Clamp to >= 0 so a future / clock-skewed timestamp scores as
      // "most recent" (age 0) rather than a NEGATIVE age that would still
      // pass the `<= 30` gate. Normal (past) dates are unaffected.
      const ageDays = Math.max(0, (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays <= 30) {
        freshnessScore = 10;
        freshnessStatus = "excellent";
        freshnessRec = "Content is fresh - no action.";
      } else if (ageDays <= 90) {
        freshnessScore = 6;
        freshnessStatus = "good";
        freshnessRec = "Plan an update in the next 2 weeks.";
      } else {
        freshnessScore = 3;
        freshnessStatus = "needs_improvement";
        freshnessRec = "Stale - refresh with a current-year datapoint and re-publish.";
      }
    }
  }

  const questionHeadingFraction =
    headings.count > 0
      ? headings.headings.filter((h) => {
          const t = h.text.toLowerCase();
          return (
            /\?/.test(h.text) || /^(what|how|why|when|where|who|which|can|does|is|are)\b/.test(t)
          );
        }).length / headings.count
      : 0;

  // Authority's schema sub-component is worth 4/15. When the caller
  // didn't pass schemaCompleteness (article has no externalUrl, or the
  // Schema audit hasn't been run yet), we drop those 4 points from
  // Authority's denominator. Same idea as Freshness.
  const schemaApplicable = typeof schemaCompleteness === "number" && schemaCompleteness >= 0;
  const authorityMaxScore = schemaApplicable ? 15 : 11;

  const signals: SignalResult[] = [
    {
      signal: "Content Depth",
      score: depthScore,
      maxScore: 15,
      status: statusFromScore(depthScore, 15),
      recommendations: depthRecs,
    },
    {
      signal: "Semantic Similarity",
      score: semScore,
      maxScore: 20,
      status: semStatus,
      recommendations: semRecs,
    },
    {
      signal: "Query-Term Coverage",
      score: coverageScore,
      maxScore: 10,
      status: statusFromScore(coverageScore, 10),
      recommendations: coverageRecs,
    },
    {
      signal: "Exact-Phrase Match",
      score: exactScore,
      maxScore: 5,
      status: exactScore === 5 ? "excellent" : "needs_improvement",
      recommendations: exactRecs,
    },
    {
      signal: "Structure Extractability",
      score: structureScore,
      maxScore: 15,
      status: statusFromScore(structureScore, 15),
      recommendations: structureRecs,
    },
    {
      signal: "Authority Signals",
      score: authorityScore,
      maxScore: authorityMaxScore,
      status: statusFromScore(authorityScore, authorityMaxScore),
      recommendations: authorityRecs,
    },
    {
      signal: "Freshness",
      score: freshnessScore,
      // Drop from denominator when we couldn't measure (no timestamp).
      // The UI sees maxScore=0 and renders "-" instead of "0/10 poor".
      maxScore: freshnessApplicable ? 10 : 0,
      status: freshnessStatus,
      recommendations: [freshnessRec],
    },
  ];

  // Honest overall: ratio of achieved / (sum of applicable max scores).
  // Previously this was sum(scores) capped at 100 - but the realistic
  // max was 90, and dropped to 86 in production because schema was
  // never wired. Users couldn't reach 100% no matter what. Now: when
  // every signal is applicable, the denominator is 90; when Freshness
  // and/or Authority-schema can't be measured, both numerator and
  // denominator shrink so 100% remains achievable.
  const totalAchieved = signals.reduce((s, x) => s + x.score, 0);
  const totalApplicable = signals.reduce((s, x) => s + x.maxScore, 0);
  const overallScore =
    totalApplicable > 0 ? Math.round((100 * totalAchieved) / totalApplicable) : 0;

  return {
    signals,
    overallScore,
    termCoverageRatio,
    questionHeadingFraction,
    wordCount,
  };
}

type ChunkRecord = {
  chunkNumber: number;
  tokenCount: number;
  wordCount: number;
  hasHeading: boolean;
  hasDirectAnswer: boolean;
  questionBased: boolean;
  extractable: boolean;
  content: string;
  rawContent: string;
  issues: string[];
};

export function computeChunks(content: string): {
  chunks: ChunkRecord[];
  stats: { totalChunks: number; extractableChunks: number; avgTokens: number };
} {
  if (!content)
    return { chunks: [], stats: { totalChunks: 0, extractableChunks: 0, avgTokens: 0 } };

  let normalized = content.replace(/\r\n/g, "\n").replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "\n\n");

  const codeBlocks: string[] = [];
  normalized = normalized.replace(/```[\s\S]*?```/g, (match) => {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(match);
    return token;
  });

  const restore = (s: string): string =>
    s.replace(/__CODE_BLOCK_(\d+)__/g, (_m, idx) => codeBlocks[Number(idx)] ?? "");

  const paragraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunksRaw: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    const candidate = current ? current + "\n\n" + para : para;
    const candWords = candidate.split(/\s+/).filter(Boolean).length;
    if (candWords > 375 && current) {
      chunksRaw.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) chunksRaw.push(current);

  const verbRe = /\b\w+(ed|es|ing|ize|ise|ates?|s)\b/i;
  const copulaRe = /\b(is|are|was|were|be|being|been|has|have|had|does|did)\b/i;

  const chunks: ChunkRecord[] = chunksRaw.map((raw, i) => {
    const restored = restore(raw);
    const words = restored.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const tokens = Math.round(wordCount * 1.33);

    const lines = restored
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLine = lines[0] ?? "";
    const hasHeading = /^#{1,6}\s+/.test(firstLine) || /^<h[1-6]\b/i.test(firstLine);

    const firstBody = (hasHeading ? lines[1] : lines[0]) ?? "";
    const bodyTokens = firstBody.split(/\s+/).filter(Boolean);
    const bodyNonStop = bodyTokens.filter(
      (t) => !STOPWORDS.has(t.toLowerCase().replace(/[^a-z]/g, "")),
    );
    const hasDirectAnswer =
      firstBody.length >= 40 &&
      bodyNonStop.length > 0 &&
      (verbRe.test(firstBody) || copulaRe.test(firstBody));

    const headingText = hasHeading ? firstLine.replace(/^#{1,6}\s+|<[^>]+>/g, "").trim() : "";
    const questionBased =
      hasHeading &&
      (headingText.includes("?") ||
        /^(what|how|why|when|where|who|which|can|does|is|are)\b/i.test(headingText));

    const extractable = tokens <= 500 && hasHeading && hasDirectAnswer;
    const issues: string[] = [];
    if (tokens > 500) issues.push("Chunk exceeds 500 token limit");
    if (!hasHeading) issues.push("No heading structure detected");
    if (!hasDirectAnswer) issues.push("First line is not a clear direct answer");
    if (!questionBased && hasHeading) issues.push("Consider a question-based heading");

    return {
      chunkNumber: i + 1,
      tokenCount: tokens,
      wordCount,
      hasHeading,
      hasDirectAnswer,
      questionBased,
      extractable,
      content: restored.substring(0, 200) + (restored.length > 200 ? "..." : ""),
      rawContent: restored,
      issues,
    };
  });

  const stats = {
    totalChunks: chunks.length,
    extractableChunks: chunks.filter((c) => c.extractable).length,
    avgTokens: chunks.length
      ? Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)
      : 0,
  };
  return { chunks, stats };
}
