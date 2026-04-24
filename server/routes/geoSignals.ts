// GEO signals analysis / chunk / schema / pipeline routes (Wave 1 rebuild).
//
// Honest scoring: 6-signal scorecard backed by real embedding similarity,
// stopword-filtered term coverage, structural extractability, and
// real E-E-A-T proxies. Schema audit measures per-type field
// completeness, not hardcoded presence flags. Results cached in
// schema_audits with a 7-day TTL.

import type { Express } from "express";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { requireUser, requireBrand } from "../lib/ownership";
import { MODELS } from "../lib/modelConfig";
import { openai, aiLimitMiddleware, MAX_CONTENT_LENGTH } from "../lib/routesShared";
import { safeFetchText } from "../lib/ssrf";
import { db } from "../db";
import { articles, brands, schemaAudits } from "@shared/schema";
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
} from "../lib/geoSignalsScoring";

const SCHEMA_FIELD_REQUIREMENTS: Record<string, { required: string[]; recommended: string[] }> = {
  Article: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "articleBody", "publisher", "image"],
  },
  NewsArticle: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "image", "publisher"],
  },
  BlogPosting: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "articleBody", "publisher"],
  },
  FAQPage: { required: ["mainEntity"], recommended: [] },
  HowTo: {
    required: ["name", "step"],
    recommended: ["totalTime", "tool", "supply"],
  },
  Recipe: {
    required: ["name", "recipeIngredient", "recipeInstructions"],
    recommended: ["cookTime", "prepTime", "image", "nutrition"],
  },
  Event: {
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "performer", "offers"],
  },
  VideoObject: {
    required: ["name", "uploadDate", "thumbnailUrl"],
    recommended: ["description", "duration", "contentUrl"],
  },
  Organization: {
    required: ["name"],
    recommended: ["logo", "url", "sameAs", "contactPoint"],
  },
  LocalBusiness: {
    required: ["name", "address"],
    recommended: ["telephone", "openingHours", "geo"],
  },
  Person: {
    required: ["name"],
    recommended: ["jobTitle", "worksFor", "sameAs", "image"],
  },
  BreadcrumbList: { required: ["itemListElement"], recommended: [] },
  WebPage: {
    required: ["name"],
    recommended: ["description", "lastReviewed", "speakable"],
  },
  Product: {
    required: ["name", "offers"],
    recommended: ["description", "brand", "aggregateRating", "image"],
  },
};

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

function statusFromScore(score: number, max: number): SignalResult["status"] {
  const r = max > 0 ? score / max : 0;
  if (r >= 0.85) return "excellent";
  if (r >= 0.6) return "good";
  if (r >= 0.3) return "needs_improvement";
  return "poor";
}

function collectSchemaNodes(node: unknown, out: Map<string, object[]>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectSchemaNodes(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const types: string[] = [];
  if (typeof t === "string") types.push(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.push(x);
  for (const ty of types) {
    const arr = out.get(ty) ?? [];
    arr.push(obj);
    out.set(ty, arr);
  }
  for (const key of Object.keys(obj)) {
    if (key === "@type") continue;
    collectSchemaNodes(obj[key], out);
  }
}

function parseJsonLdFromHtml(html: string): Map<string, object[]> {
  const out = new Map<string, object[]>();
  const scan = (source: string) => {
    const re =
      /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const raw = m[1]?.trim();
      if (!raw) continue;
      try {
        collectSchemaNodes(JSON.parse(raw), out);
      } catch {
        /* skip malformed block */
      }
    }
  };
  scan(html);
  const nsRe = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi;
  let n: RegExpExecArray | null;
  while ((n = nsRe.exec(html)) !== null) {
    if (n[1]) scan(n[1]);
  }
  return out;
}

function isFieldPopulated(node: Record<string, unknown>, field: string): boolean {
  const v = node[field];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function measureSchemaCompleteness(
  instances: object[],
  required: string[],
  recommended: string[],
): { completeness: number; populatedFields: string[]; missingFields: string[] } {
  const all = [...required, ...recommended];
  if (all.length === 0) {
    return { completeness: instances.length > 0 ? 1 : 0, populatedFields: [], missingFields: [] };
  }
  let bestCompleteness = 0;
  let bestPopulated: string[] = [];
  let bestMissing: string[] = all.slice();
  for (const inst of instances) {
    const rec = inst as Record<string, unknown>;
    const populated = all.filter((f) => isFieldPopulated(rec, f));
    const missing = all.filter((f) => !isFieldPopulated(rec, f));
    const c = populated.length / all.length;
    if (c >= bestCompleteness) {
      bestCompleteness = c;
      bestPopulated = populated;
      bestMissing = missing;
    }
  }
  return {
    completeness: bestCompleteness,
    populatedFields: bestPopulated,
    missingFields: bestMissing,
  };
}

export async function computeSignals(
  content: string,
  targetQuery: string,
  articleUpdatedAt?: string,
  schemaCompleteness?: number,
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
  let semStatus: SignalResult["status"];
  if (cos >= 0.75) semStatus = "excellent";
  else if (cos >= 0.5) semStatus = "good";
  else if (cos >= 0.25) semStatus = "needs_improvement";
  else semStatus = "poor";
  const semRecs: string[] = [];
  if (cos < 0.5) semRecs.push("Mention the target query's concepts more directly.");

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
  const citations = detectCitations(safeContent);
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

  let freshnessScore = 5;
  let freshnessStatus: SignalResult["status"] = "needs_improvement";
  let freshnessRec = "No update timestamp — freshness cannot be measured.";
  if (articleUpdatedAt && typeof articleUpdatedAt === "string" && articleUpdatedAt.length > 0) {
    const parsed = new Date(articleUpdatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      const ageDays = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= 30) {
        freshnessScore = 10;
        freshnessStatus = "excellent";
        freshnessRec = "Content is fresh — no action.";
      } else if (ageDays <= 90) {
        freshnessScore = 6;
        freshnessStatus = "good";
        freshnessRec = "Plan an update in the next 2 weeks.";
      } else {
        freshnessScore = 3;
        freshnessStatus = "needs_improvement";
        freshnessRec = "Stale — refresh with a current-year datapoint and re-publish.";
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
      maxScore: 15,
      status: statusFromScore(authorityScore, 15),
      recommendations: authorityRecs,
    },
    {
      signal: "Freshness",
      score: freshnessScore,
      maxScore: 10,
      status: freshnessStatus,
      recommendations: [freshnessRec],
    },
  ];

  const overallScore = Math.max(
    0,
    Math.min(
      100,
      signals.reduce((s, x) => s + x.score, 0),
    ),
  );

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

function normaliseUrl(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

function urlHashOf(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

export function setupGeoSignalsRoutes(app: Express): void {
  app.post("/api/geo-signals/analyze", async (req, res) => {
    try {
      requireUser(req);
      const { content, targetQuery, articleUpdatedAt, schemaCompleteness } = req.body ?? {};
      if (
        !content ||
        typeof content !== "string" ||
        !targetQuery ||
        typeof targetQuery !== "string"
      ) {
        return res.status(400).json({ success: false, error: "Content and target query required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res
          .status(413)
          .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      const result = await computeSignals(
        content,
        targetQuery,
        typeof articleUpdatedAt === "string" ? articleUpdatedAt : undefined,
        typeof schemaCompleteness === "number" ? schemaCompleteness : undefined,
      );
      res.json({
        success: true,
        data: {
          signals: result.signals,
          overallScore: result.overallScore,
          termCoverageRatio: result.termCoverageRatio,
          questionHeadingFraction: result.questionHeadingFraction,
          wordCount: result.wordCount,
        },
      });
    } catch (err) {
      logger.error({ err }, "geo-signals/analyze failed");
      res.status(500).json({ success: false, error: "Failed to analyze signals" });
    }
  });

  app.post("/api/geo-signals/chunk-analysis", async (req, res) => {
    try {
      requireUser(req);
      const { content } = req.body ?? {};
      if (!content || typeof content !== "string") {
        return res.status(400).json({ success: false, error: "Content required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res
          .status(413)
          .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      const { chunks, stats } = computeChunks(content);
      res.json({ success: true, data: { chunks, stats } });
    } catch (err) {
      logger.error({ err }, "geo-signals/chunk-analysis failed");
      res.status(500).json({ success: false, error: "Failed to analyze chunks" });
    }
  });

  app.post("/api/geo-signals/optimize-chunks", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const { content, brandId } = req.body ?? {};
      if (!content || typeof content !== "string") {
        return res.status(400).json({ success: false, error: "Content required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res
          .status(413)
          .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      let brand;
      if (brandId && typeof brandId === "string") {
        brand = await requireBrand(brandId, user.id);
      }

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [
          {
            role: "system",
            content: `You are a GEO content optimization expert. Restructure content into AI-extractable chunks following these rules:
1. Each section should be ~375 words (500 tokens max)
2. Start each section with a question-based H2 heading (e.g., "## What is X?" or "## How does Y work?")
3. Follow each heading with a direct 2-3 sentence answer
4. Include supporting details with bullet points or numbered lists
5. End sections with clear, factual conclusions
6. Maintain natural flow between sections
${brand ? `Brand context: ${brand.name}, Industry: ${brand.industry}` : ""}`,
          },
          {
            role: "user",
            content: `Restructure this content into AI-optimized chunks:\n\n${content}`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.7,
      });

      const optimizedContent = response.choices[0]?.message?.content || content;
      res.json({ success: true, data: { optimizedContent } });
    } catch (err) {
      logger.error({ err }, "geo-signals/optimize-chunks failed");
      res.status(500).json({ success: false, error: "Failed to optimize chunks" });
    }
  });

  app.post("/api/geo-signals/schema-audit", async (req, res) => {
    try {
      requireUser(req);
      const { url } = req.body ?? {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL required" });
      }

      const normalised = normaliseUrl(url);
      const hash = urlHashOf(normalised);

      const cachedRows = await db
        .select()
        .from(schemaAudits)
        .where(eq(schemaAudits.urlHash, hash))
        .limit(1);
      const cached = cachedRows[0];
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (
        cached &&
        cached.fetchedAt &&
        Date.now() - new Date(cached.fetchedAt).getTime() < sevenDays
      ) {
        const payload = cached.schemas as {
          schemas: unknown;
          additionalTypes: string[];
          totalSchemasFound: number;
        };
        return res.json({
          success: true,
          data: {
            url: cached.url,
            fetched: true,
            schemas: payload.schemas,
            additionalTypes: payload.additionalTypes ?? cached.additionalTypes ?? [],
            totalSchemasFound: payload.totalSchemasFound ?? 0,
            cachedAt: cached.fetchedAt,
          },
        });
      }

      let html = "";
      let fetchError: string | null = null;
      try {
        const result = await safeFetchText(normalised, {
          maxBytes: 2 * 1024 * 1024,
          timeoutMs: 15_000,
          headers: { "User-Agent": "VentureCite-SchemaAudit/1.0" },
        });
        if (result.status >= 200 && result.status < 300) {
          html = result.text;
        } else {
          fetchError = `Target returned HTTP ${result.status}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch URL";
        if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
          return res.status(400).json({
            success: false,
            error: "This URL isn't reachable (private host or invalid).",
          });
        }
        fetchError = msg;
      }

      const nodesByType = html ? parseJsonLdFromHtml(html) : new Map<string, object[]>();
      const schemas = Object.entries(SCHEMA_FIELD_REQUIREMENTS).map(([schemaType, spec]) => {
        const instances = nodesByType.get(schemaType) ?? [];
        const present = instances.length > 0;
        const { completeness, populatedFields, missingFields } = present
          ? measureSchemaCompleteness(instances, spec.required, spec.recommended)
          : {
              completeness: 0,
              populatedFields: [],
              missingFields: [...spec.required, ...spec.recommended],
            };
        return {
          schemaType,
          present,
          completenessPercent: Math.round(completeness * 100),
          populatedFields,
          missingFields,
          required: spec.required,
          recommended: spec.recommended,
        };
      });

      const catalogueSet = new Set(Object.keys(SCHEMA_FIELD_REQUIREMENTS));
      const additionalTypes = Array.from(nodesByType.keys()).filter((t) => !catalogueSet.has(t));
      const completenessByType: Record<string, number> = {};
      for (const s of schemas) {
        if (s.present) completenessByType[s.schemaType] = s.completenessPercent / 100;
      }
      const totalSchemasFound = nodesByType.size;
      const responsePayload = {
        url: normalised,
        fetched: !fetchError,
        fetchError,
        schemas,
        additionalTypes,
        totalSchemasFound,
        cachedAt: null as Date | null,
      };

      if (!fetchError) {
        try {
          await db
            .insert(schemaAudits)
            .values({
              urlHash: hash,
              url: normalised,
              schemas: { schemas, additionalTypes, totalSchemasFound },
              additionalTypes,
              completenessByType,
            })
            .onConflictDoUpdate({
              target: schemaAudits.urlHash,
              set: {
                url: normalised,
                schemas: { schemas, additionalTypes, totalSchemasFound },
                additionalTypes,
                completenessByType,
                fetchedAt: new Date(),
              },
            });
        } catch (err) {
          logger.warn({ err }, "schema-audit: failed to upsert cache");
        }
      }

      res.json({ success: true, data: responsePayload });
    } catch (err) {
      logger.error({ err }, "geo-signals/schema-audit failed");
      const msg = err instanceof Error ? err.message : "Failed to audit schema";
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.get("/api/geo-signals/schema-completeness/:articleId", async (req, res) => {
    try {
      const user = requireUser(req);
      const articleId = req.params.articleId;
      const rows = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
      const article = rows[0];
      if (!article) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      const brandRows = await db
        .select()
        .from(brands)
        .where(and(eq(brands.id, article.brandId), eq(brands.userId, user.id)))
        .limit(1);
      const brand = brandRows[0];
      if (!brand) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      if (!brand.website) {
        return res.json({ success: true, data: { completeness: null } });
      }
      const url = normaliseUrl(
        `${brand.website.replace(/\/$/, "")}/${article.slug.replace(/^\//, "")}`,
      );
      const hash = urlHashOf(url);
      const cached = (
        await db.select().from(schemaAudits).where(eq(schemaAudits.urlHash, hash)).limit(1)
      )[0];
      if (!cached) {
        return res.json({ success: true, data: { completeness: null } });
      }
      const map = (cached.completenessByType ?? {}) as Record<string, number>;
      const values = Object.values(map);
      const completeness =
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
      res.json({
        success: true,
        data: { completeness, cachedAt: cached.fetchedAt, byType: map },
      });
    } catch (err) {
      logger.error({ err }, "geo-signals/schema-completeness failed");
      res.status(500).json({ success: false, error: "Failed to read schema completeness" });
    }
  });

  app.post("/api/geo-signals/pipeline-simulation", async (req, res) => {
    try {
      requireUser(req);
      const { content, query, articleUpdatedAt, schemaCompleteness } = req.body ?? {};
      if (!content || typeof content !== "string" || !query || typeof query !== "string") {
        return res.status(400).json({ success: false, error: "Content and query required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res
          .status(413)
          .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      const signalsResult = await computeSignals(
        content,
        query,
        typeof articleUpdatedAt === "string" ? articleUpdatedAt : undefined,
        typeof schemaCompleteness === "number" ? schemaCompleteness : undefined,
      );
      const { chunks, stats } = computeChunks(content);

      const contentLower = content.toLowerCase();
      const qLower = query.toLowerCase();
      const terms = stopwordFilterQuery(query);
      const verbatimMatch = contentLower.includes(qLower);
      const firstPara = (content.split(/\n\n+/)[0] ?? "").toLowerCase();
      const firstParaHasQueryWord = terms.length > 0 && terms.some((w) => firstPara.includes(w));
      const firstParaVerbatim = firstPara.includes(qLower);

      const prepareScore = Math.min(
        100,
        Math.round(
          (verbatimMatch ? 20 : 0) +
            signalsResult.termCoverageRatio * 30 +
            (firstParaVerbatim ? 50 : firstParaHasQueryWord ? 25 : 0),
        ),
      );

      const extractable = stats.totalChunks > 0 ? stats.extractableChunks / stats.totalChunks : 0;
      const retrieveScore = Math.min(
        100,
        Math.round(
          signalsResult.termCoverageRatio * 35 +
            signalsResult.questionHeadingFraction * 25 +
            extractable * 40,
        ),
      );

      const signalScore = signalsResult.overallScore;

      const hasRichChunk = chunks.some(
        (c) =>
          c.hasHeading &&
          c.hasDirectAnswer &&
          typeof c.rawContent === "string" &&
          c.rawContent.length >= 200,
      );
      const hasLink = /\bhttps?:\/\/\S+/i.test(content);
      const byline = detectBylines(content);
      const serveScore = Math.min(
        100,
        (hasRichChunk ? 50 : 0) + (hasLink ? 30 : 0) + (byline.found ? 20 : 0),
      );

      const statusOf = (s: number): "pass" | "warning" | "fail" =>
        s >= 70 ? "pass" : s >= 40 ? "warning" : "fail";

      const stages = [
        {
          stage: "Prepare",
          status: statusOf(prepareScore),
          score: prepareScore,
          details: [
            `Verbatim query match: ${verbatimMatch ? "yes" : "no"}`,
            `Query-term coverage: ${Math.round(signalsResult.termCoverageRatio * 100)}%`,
            `Direct answer in first paragraph: ${firstParaVerbatim ? "verbatim" : firstParaHasQueryWord ? "partial" : "none"}`,
          ],
        },
        {
          stage: "Retrieve",
          status: statusOf(retrieveScore),
          score: retrieveScore,
          details: [
            `Term coverage ratio: ${signalsResult.termCoverageRatio.toFixed(2)}`,
            `Question-style headings: ${Math.round(signalsResult.questionHeadingFraction * 100)}%`,
            `Extractable chunks: ${stats.extractableChunks}/${stats.totalChunks}`,
          ],
        },
        {
          stage: "Signal",
          status: statusOf(signalScore),
          score: signalScore,
          details: [
            `6-signal overall score: ${signalScore}/100`,
            "Matches Tab 1 scorecard exactly",
          ],
        },
        {
          stage: "Serve",
          status: statusOf(serveScore),
          score: serveScore,
          details: [
            `Rich citable chunk (heading + direct answer + >=200 chars): ${hasRichChunk ? "yes" : "no"}`,
            `Outbound http(s) links: ${hasLink ? "yes" : "no"}`,
            `Byline / author attribution: ${byline.found ? "yes" : "no"}`,
          ],
        },
      ];
      res.json({ success: true, data: { stages, query } });
    } catch (err) {
      logger.error({ err }, "geo-signals/pipeline-simulation failed");
      res.status(500).json({ success: false, error: "Failed to simulate pipeline" });
    }
  });
}
