import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { safeFetchText } from "./ssrf";
import type { BrandMention } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const USER_AGENT = "VentureCite/1.0 (mentions scanner)";
const REDDIT_RATE_DELAY_MS = 2100; // 10 req/min unauthenticated limit
const QUORA_RATE_DELAY_MS = 1000;
const MAX_RESULTS_PER_SOURCE = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

interface RawMention {
  platform: string;
  sourceUrl: string;
  sourceTitle?: string;
  mentionContext?: string;
  engagementScore?: number;
  authorUsername?: string;
  mentionedAt?: Date;
}

/**
 * Three-source weekly scan. Each source populates `brand_mentions` rows
 * after dedupe (by sourceUrl) and sentiment scoring.
 */
export async function scanBrandMentions(brandId: string): Promise<number> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");

  const existing = await storage.getBrandMentions(brandId).catch(() => [] as BrandMention[]);
  const seenUrls = new Set(existing.map((m: BrandMention) => m.sourceUrl));

  // Build search queries from the brand name + user-curated variations.
  // We skip auto-generated forms (acronyms, bare domain) — those are useful
  // for in-text matching but produce noisy search-API queries.
  const candidateQueries = [
    brand.name,
    ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length >= 4 && !/^\w+\.\w+$/.test(s));
  const searchQueries = Array.from(new Set(candidateQueries.map((q) => q.toLowerCase())))
    .map((lower) => candidateQueries.find((q) => q.toLowerCase() === lower) || lower)
    .slice(0, 3);
  if (searchQueries.length === 0 && brand.name.length >= 3) {
    searchQueries.push(brand.name);
  }

  const raw: RawMention[] = [];

  // Source 1 — Reddit
  for (const q of searchQueries) {
    try {
      raw.push(...(await searchReddit(q)));
      await sleep(REDDIT_RATE_DELAY_MS);
    } catch (err) {
      console.warn(
        `[mentionScanner] reddit "${q}" failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Source 2 — Hacker News (Algolia)
  for (const q of searchQueries) {
    try {
      raw.push(...(await searchHackerNews(q)));
    } catch (err) {
      console.warn(`[mentionScanner] hn "${q}" failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Source 3 — Quora search (public HTML scrape, degrades gracefully)
  for (const q of searchQueries) {
    try {
      raw.push(...(await searchQuora(q)));
      await sleep(QUORA_RATE_DELAY_MS);
    } catch (err) {
      console.warn(
        `[mentionScanner] quora "${q}" failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Dedupe by sourceUrl (case-insensitive)
  const unique = new Map<string, RawMention>();
  for (const m of raw) {
    if (!m.sourceUrl) continue;
    const key = m.sourceUrl.toLowerCase().replace(/[?#].*$/, "");
    if (seenUrls.has(m.sourceUrl) || unique.has(key)) continue;
    unique.set(key, m);
  }

  let inserted = 0;
  for (const m of Array.from(unique.values())) {
    const sentimentText = m.mentionContext || m.sourceTitle || "";
    const sentiment =
      sentimentText.length > 30
        ? await judgeSentiment(sentimentText, brand.name).catch(() => ({
            sentiment: "neutral",
            sentimentScore: 0,
          }))
        : { sentiment: "neutral", sentimentScore: 0 };

    try {
      await storage.createBrandMention({
        brandId,
        platform: m.platform,
        sourceUrl: m.sourceUrl,
        sourceTitle: m.sourceTitle?.slice(0, 500) || null,
        mentionContext: m.mentionContext?.slice(0, 2000) || null,
        sentiment: sentiment.sentiment,
        sentimentScore: String(sentiment.sentimentScore),
        engagementScore: m.engagementScore ?? null,
        authorUsername: m.authorUsername?.slice(0, 120) || null,
        mentionedAt: m.mentionedAt ?? null,
      } as any);
      inserted += 1;
    } catch (err) {
      console.warn(`[mentionScanner] insert failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[mentionScanner] brand=${brandId} unique=${unique.size} inserted=${inserted}`);
  return inserted;
}

async function searchReddit(query: string): Promise<RawMention[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS_PER_SOURCE}&sort=new`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  const body = (await res.json()) as any;
  const children = body?.data?.children || [];
  return children
    .filter((c: any) => c?.kind === "t3" || c?.kind === "t1")
    .map((c: any) => {
      const d = c.data || {};
      return {
        platform: "reddit",
        sourceUrl: `https://reddit.com${d.permalink || ""}`,
        sourceTitle: d.title || d.link_title || (d.body ? d.body.slice(0, 200) : ""),
        mentionContext: d.selftext || d.body || d.title || "",
        engagementScore: (d.ups || 0) + (d.num_comments || 0) * 2,
        authorUsername: d.author,
        mentionedAt: d.created_utc ? new Date(d.created_utc * 1000) : undefined,
      } as RawMention;
    })
    .filter((m: RawMention) => m.sourceUrl && m.sourceUrl !== "https://reddit.com");
}

async function searchHackerNews(query: string): Promise<RawMention[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=(story,comment)&hitsPerPage=${MAX_RESULTS_PER_SOURCE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const body = (await res.json()) as any;
  const hits = body?.hits || [];
  return hits
    .map((h: any) => ({
      platform: "hackernews",
      sourceUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
      sourceTitle: h.title || h.story_title || (h.comment_text ? h.comment_text.slice(0, 200) : ""),
      mentionContext: h.story_text || h.comment_text || h.title || "",
      engagementScore: (h.points || 0) + (h.num_comments || 0),
      authorUsername: h.author,
      mentionedAt: h.created_at ? new Date(h.created_at) : undefined,
    }))
    .filter((m: RawMention) => m.sourceUrl);
}

async function searchQuora(query: string): Promise<RawMention[]> {
  const { status, text } = await safeFetchText(
    `https://www.quora.com/search?q=${encodeURIComponent(query)}`,
    { timeoutMs: 15_000, maxBytes: 2_000_000 },
  );
  if (status < 200 || status >= 300) return [];

  // Quora question slug pattern: /Some-Question-Title or /topic/Some-Question
  const seen = new Set<string>();
  const results: RawMention[] = [];
  const anchorRe = /<a[^>]+href="(\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(text)) !== null) {
    const path = match[1];
    if (!/^\/[^/]+(-[^/]+)+$/.test(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const rawTitle = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawTitle) continue;
    results.push({
      platform: "quora",
      sourceUrl: `https://www.quora.com${path}`,
      sourceTitle: rawTitle.slice(0, 300),
      mentionContext: undefined,
    });
    if (results.length >= MAX_RESULTS_PER_SOURCE) break;
  }
  return results;
}

async function judgeSentiment(
  text: string,
  brandName: string,
): Promise<{ sentiment: string; sentimentScore: number }> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 150,
    messages: [
      {
        role: "system",
        content: `Sentiment analyst. Return JSON: {"sentiment": "positive"|"neutral"|"negative", "sentimentScore": -1.0..1.0}. Focus on how this text talks about the brand specifically.`,
      },
      {
        role: "user",
        content: `Brand: ${brandName}\n\nText:\n"""\n${text.slice(0, 2000)}\n"""`,
      },
    ],
  });
  const parsed = safeParseJson<{ sentiment?: string; sentimentScore?: number }>(
    completion.choices[0]?.message?.content,
  );
  const sentiment =
    parsed?.sentiment === "positive" || parsed?.sentiment === "negative"
      ? parsed.sentiment
      : "neutral";
  const score =
    typeof parsed?.sentimentScore === "number"
      ? Math.max(-1, Math.min(1, parsed.sentimentScore))
      : 0;
  return { sentiment, sentimentScore: Number(score.toFixed(2)) };
}
