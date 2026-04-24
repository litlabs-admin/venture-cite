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

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];
  const cleaned = texts.map((t) => (typeof t === "string" && t.length > 0 ? t : " "));
  const keys = cleaned.map(cacheKey);
  const result: (number[] | null)[] = keys.map((k) => cacheGet(k) ?? null);
  const missingIdx: number[] = [];
  const missingText: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (result[i] === null) {
      missingIdx.push(i);
      missingText.push(cleaned[i]);
    }
  }
  if (missingText.length > 0) {
    try {
      const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: missingText,
      });
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
      logger.warn({ err }, "embedBatch: OpenAI embeddings call failed");
      for (const j of missingIdx) if (result[j] === null) result[j] = [];
    }
  }
  return result.map((r) => r ?? []);
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
    /\bAuthor\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
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

export function detectCitations(content: string): { urls: string[]; count: number } {
  if (!content) return { urls: [], count: 0 };
  const stripped = content.replace(/\]\(([^)]+)\)/g, " $1 ");
  const urlRe = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(stripped)) !== null) {
    const cleaned = m[0].replace(/[.,;:!?)]+$/, "");
    urls.add(cleaned);
  }
  return { urls: Array.from(urls), count: urls.size };
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
