// GEO Signals scoring primitives (Wave 1.1).
//
// Pure helpers — no DB access, no Express. Imported by
// server/routes/geoSignals.ts to compose the real 6-signal scorecard.

import { createHash } from "crypto";
import { openai } from "./routesShared";
import { logger } from "./logger";

export const STOPWORDS: Set<string> = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "as",
  "and",
  "or",
  "but",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "my",
  "your",
  "our",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "will",
  "would",
  "should",
  "could",
]);

export function stopwordFilterQuery(q: string): string[] {
  if (!q) return [];
  const splitRe = new RegExp("[^\\p{L}\\p{N}]+", "u");
  const tokens = q.toLowerCase().split(splitRe).filter(Boolean);
  return tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  const cos = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  if (!Number.isFinite(cos)) return 0;
  return Math.max(0, Math.min(1, cos));
}

const EMBED_CACHE_MAX = 500;
const embedCache = new Map<string, number[]>();

function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function cacheGet(key: string): number[] | undefined {
  const v = embedCache.get(key);
  if (v) {
    embedCache.delete(key);
    embedCache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, v: number[]): void {
  if (embedCache.has(key)) embedCache.delete(key);
  embedCache.set(key, v);
  while (embedCache.size > EMBED_CACHE_MAX) {
    const first = embedCache.keys().next().value;
    if (first === undefined) break;
    embedCache.delete(first);
  }
}

// Module-level counters for telemetry. Reported to logs every
// EMBED_REPORT_INTERVAL_MS so the operator can spot cache-hit
// regressions and embedding-spend spikes. Per-instance, but that's
// acceptable for a coarse signal — Sentry/Datadog can aggregate.
const embedStats = {
  totalCalls: 0,
  totalInputs: 0,
  cacheHits: 0,
  cacheMisses: 0,
  apiErrors: 0,
  estimatedSpendCents: 0,
  lastReportAt: Date.now(),
};
const EMBED_REPORT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
// text-embedding-3-small is $0.02 / 1M tokens. We approximate tokens as
// ceil(chars / 4) — close enough for spend telemetry. The output dim
// doesn't matter for billing.
const EMBED_PRICE_PER_M_TOKENS_CENTS = 2;

function maybeReportEmbedStats(): void {
  if (Date.now() - embedStats.lastReportAt < EMBED_REPORT_INTERVAL_MS) return;
  embedStats.lastReportAt = Date.now();
  const total = embedStats.cacheHits + embedStats.cacheMisses;
  const hitRate = total > 0 ? embedStats.cacheHits / total : 0;
  logger.info(
    {
      calls: embedStats.totalCalls,
      inputs: embedStats.totalInputs,
      cacheHits: embedStats.cacheHits,
      cacheMisses: embedStats.cacheMisses,
      hitRate: Number(hitRate.toFixed(3)),
      apiErrors: embedStats.apiErrors,
      estimatedSpendCents: Number(embedStats.estimatedSpendCents.toFixed(2)),
    },
    "embedBatch: 5m stats roll-up",
  );
  // Reset counters so each window is independent.
  embedStats.totalCalls = 0;
  embedStats.totalInputs = 0;
  embedStats.cacheHits = 0;
  embedStats.cacheMisses = 0;
  embedStats.apiErrors = 0;
  embedStats.estimatedSpendCents = 0;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];
  const cleaned = texts.map((t) => (typeof t === "string" && t.length > 0 ? t : " "));
  const keys = cleaned.map(cacheKey);
  embedStats.totalCalls++;
  embedStats.totalInputs += cleaned.length;
  const result: (number[] | null)[] = keys.map((k) => {
    const hit = cacheGet(k);
    if (hit !== undefined) embedStats.cacheHits++;
    return hit ?? null;
  });
  const missingIdx: number[] = [];
  const missingText: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (result[i] === null) {
      missingIdx.push(i);
      missingText.push(cleaned[i]);
      embedStats.cacheMisses++;
    }
  }
  if (missingText.length > 0) {
    try {
      const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: missingText,
      });
      // Spend telemetry: ceil(chars/4) ≈ tokens.
      const approxTokens = missingText.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
      embedStats.estimatedSpendCents += (approxTokens * EMBED_PRICE_PER_M_TOKENS_CENTS) / 1_000_000;
      for (let j = 0; j < missingIdx.length; j++) {
        const emb = resp.data[j]?.embedding;
        if (Array.isArray(emb)) {
          const arr = emb as number[];
          result[missingIdx[j]] = arr;
          cacheSet(keys[missingIdx[j]], arr);
        } else {
          result[missingIdx[j]] = [];
        }
      }
    } catch (err) {
      embedStats.apiErrors++;
      logger.warn({ err }, "embedBatch: OpenAI embeddings call failed");
      for (const j of missingIdx) if (result[j] === null) result[j] = [];
    }
  }
  maybeReportEmbedStats();
  return result.map((r) => r ?? []);
}

/** Test-only / debug accessor — returns a snapshot of the current
 *  embedding-call stats. Lets the operator inspector show live
 *  cache-hit rate without grep-ing logs. */
export function getEmbedStats(): Readonly<typeof embedStats> {
  return { ...embedStats };
}

export function detectBylines(content: string): { found: boolean; authors: string[] } {
  if (!content) return { found: false, authors: [] };
  const authors = new Set<string>();

  const metaRe =
    /<meta\s+[^>]*name\s*=\s*["']author["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(content)) !== null) {
    const v = m[1]?.trim();
    if (v) authors.add(v);
  }

  const nameShape = /([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,3})/;
  const prefixes: RegExp[] = [
    /\bAuthor\s*[:-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
    /\bWritten\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
    /(?:^|[\n\r>.\s])By\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g,
    /(?:^|\n)\s*[-—–]{1,2}\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/gm,
  ];

  const badSuffixes = /(ing|ed|ly|tion|ment)$/i;

  for (const re of prefixes) {
    let x: RegExpExecArray | null;
    while ((x = re.exec(content)) !== null) {
      const candidate = x[1]?.trim();
      if (!candidate) continue;
      const parts = candidate.split(/\s+/);
      if (parts.length < 2) continue;
      if (parts.some((p) => badSuffixes.test(p))) continue;
      if (!nameShape.test(candidate)) continue;
      authors.add(candidate);
    }
  }

  return { found: authors.size > 0, authors: Array.from(authors) };
}

export function detectCitations(
  content: string,
  ownDomain?: string | null,
): { urls: string[]; count: number; selfLinkCount: number } {
  if (!content) return { urls: [], count: 0, selfLinkCount: 0 };
  const stripped = content.replace(/\]\(([^)]+)\)/g, " $1 ");
  const urlRe = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(stripped)) !== null) {
    const cleaned = m[0].replace(/[.,;:!?)]+$/, "");
    urls.add(cleaned);
  }
  const all = Array.from(urls);
  // Exclude same-domain links from the "external authority" count.
  // The Authority signal cares about whether the article cites EXTERNAL
  // sources, not whether it cross-links to itself. A footer that links
  // to /about, /pricing, and /blog used to score +4 on citations
  // without any actual third-party reference. ownDomain is normalised
  // to a registrable host (no scheme, no www., no path); we treat a
  // link as "self" if its host endsWith that.
  const own = normaliseDomain(ownDomain);
  let external = 0;
  let self = 0;
  for (const u of all) {
    try {
      const h = new URL(u).host.toLowerCase().replace(/^www\./, "");
      if (own && (h === own || h.endsWith("." + own))) self++;
      else external++;
    } catch {
      external++; // malformed URL — count it; we'd rather over-credit than crash.
    }
  }
  return { urls: all, count: external, selfLinkCount: self };
}

function normaliseDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    const stripped = d
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/?#]/)[0];
    const lower = stripped.toLowerCase();
    return lower.length > 0 ? lower : null;
  } catch {
    return null;
  }
}

/** Unified bucketizer — single source of truth for score → status across
 *  every signal, the overall scorecard, and the pipeline-simulation
 *  stages. Replaces three inconsistent threshold systems that disagreed
 *  with each other (one used 0.85/0.6/0.3, one used 0.75/0.5/0.25, one
 *  used 70/40). The same icon palette means the same thing everywhere. */
export type SignalStatus = "excellent" | "good" | "needs_improvement" | "poor";
export function bucketize(ratio: number): SignalStatus {
  if (!Number.isFinite(ratio)) return "poor";
  if (ratio >= 0.8) return "excellent";
  if (ratio >= 0.6) return "good";
  if (ratio >= 0.4) return "needs_improvement";
  return "poor";
}

/** Strip control characters / newlines and trim. Used to sanitise
 *  user-controlled fields (brand.name, brand.industry) before they're
 *  interpolated into an LLM prompt — closes the self-prompt-injection
 *  hole in /optimize-chunks. */
export function sanitisePromptField(s: string | null | undefined, maxLen = 120): string {
  if (!s) return "";
  // Char-by-char so we don't need a regex containing literal control
  // bytes (eslint no-control-regex). Strips C0 controls (0x00-0x1F)
  // and DEL (0x7F), collapses any whitespace run to a single space,
  // trims trailing space, and caps length. Closes the self-prompt-
  // injection vector in /optimize-chunks where a brand name with
  // embedded newlines could break out of the system prompt.
  let out = "";
  let lastWasSpace = false;
  for (let i = 0; i < s.length && out.length < maxLen; i++) {
    const code = s.charCodeAt(i);
    const isControl = code < 0x20 || code === 0x7f;
    const isSpace = code === 0x20 || isControl;
    if (isSpace) {
      if (!lastWasSpace && out.length > 0) {
        out += " ";
        lastWasSpace = true;
      }
    } else {
      out += s[i];
      lastWasSpace = false;
    }
  }
  return out.trimEnd();
}

export function detectFactualClaims(content: string): { count: number; matches: string[] } {
  if (!content) return { count: 0, matches: [] };
  const patterns: RegExp[] = [
    /\baccording to\b/gi,
    /\breports?\s+that\b/gi,
    /\bfound\s+that\b/gi,
    /\bresearch\s+shows\b/gi,
    /\bstudies?\s+(?:indicate|show|suggest)\b/gi,
    /\bdata\s+suggests?\b/gi,
    /\bstatistics\s+show\b/gi,
  ];
  const matches: string[] = [];
  for (const re of patterns) {
    const found = content.match(re);
    if (found) for (const f of found) matches.push(f.toLowerCase());
  }
  return { count: matches.length, matches };
}

export function countContentWords(text: string): number {
  if (!text) return 0;
  const re = new RegExp("\\p{L}+", "gu");
  const m = text.match(re);
  return m ? m.length : 0;
}

export function detectHeadings(content: string): {
  count: number;
  hasHierarchy: boolean;
  headings: Array<{ level: number; text: string }>;
} {
  if (!content) return { count: 0, hasHierarchy: false, headings: [] };
  const headings: Array<{ level: number; text: string }> = [];

  const mdRe = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(content)) !== null) {
    headings.push({ level: m[1].length, text: m[2].trim() });
  }

  const htmlRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = htmlRe.exec(content)) !== null) {
    const level = parseInt(m[1], 10);
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    headings.push({ level, text });
  }

  const levels = new Set(headings.map((h) => h.level));
  const hasHierarchy = levels.has(2) && levels.has(3);
  return { count: headings.length, hasHierarchy, headings };
}
