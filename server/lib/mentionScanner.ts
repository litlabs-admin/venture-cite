import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { safeFetchText } from "./ssrf";
import { buildBrandNameVariants } from "../citationChecker";
import type { Brand, BrandMention, GeoRanking } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const RAW_DELIM = "||| RAW_RESPONSE |||";
const USER_AGENT = "VentureCite/1.0 (mentions scanner)";
const REDDIT_RATE_DELAY_MS = 2100; // 10 req/min unauthenticated limit
const MIN_CITATION_OCCURRENCES = 3; // a domain must appear this often before we treat it as a mention source
const MAX_RESULTS_PER_SOURCE = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try { return JSON.parse(candidate) as T; } catch { return null; }
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

  const variants = buildBrandNameVariants(
    brand.name,
    Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
    brand.website || undefined,
  );
  // Take only the longest 3 variants for searching — short ones would return too much noise
  const searchQueries = variants
    .filter((v) => v.length >= 4 && !/^\w+\.\w+$/.test(v)) // skip bare domains as search terms
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
      console.warn(`[mentionScanner] reddit "${q}" failed:`, err instanceof Error ? err.message : err);
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

  // Source 3 — Citation-data mining. Every domain that cites the brand ≥N times
  // gets one synthesized mention (one per unique URL).
  try {
    raw.push(...(await mineFromCitations(brandId)));
  } catch (err) {
    console.warn(`[mentionScanner] citation mining failed:`, err instanceof Error ? err.message : err);
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
    const sentiment = sentimentText.length > 30
      ? await judgeSentiment(sentimentText, brand.name).catch(() => ({ sentiment: "neutral", sentimentScore: 0 }))
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
  const body = await res.json() as any;
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
  const body = await res.json() as any;
  const hits = body?.hits || [];
  return hits.map((h: any) => ({
    platform: "hackernews",
    sourceUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
    sourceTitle: h.title || h.story_title || (h.comment_text ? h.comment_text.slice(0, 200) : ""),
    mentionContext: h.story_text || h.comment_text || h.title || "",
    engagementScore: (h.points || 0) + (h.num_comments || 0),
    authorUsername: h.author,
    mentionedAt: h.created_at ? new Date(h.created_at) : undefined,
  })).filter((m: RawMention) => m.sourceUrl);
}

async function mineFromCitations(brandId: string): Promise<RawMention[]> {
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  if (prompts.length === 0) return [];
  const rankings = await storage.getGeoRankingsByBrandPromptIds(prompts.map((p) => p.id));
  const cited = rankings.filter((r: GeoRanking) => r.isCited === 1 && r.citingOutletUrl);

  // Count per exact URL
  const byUrl = new Map<string, GeoRanking[]>();
  for (const r of cited) {
    const arr = byUrl.get(r.citingOutletUrl!) || [];
    arr.push(r);
    byUrl.set(r.citingOutletUrl!, arr);
  }

  const mentions: RawMention[] = [];
  for (const [url, rows] of Array.from(byUrl.entries())) {
    if (rows.length < MIN_CITATION_OCCURRENCES) continue;
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
    const platform = platformFromDomain(host);
    // Context from the first cited response that referenced this URL
    const first = rows[0];
    const ctx = (first.citationContext || "").split(RAW_DELIM)[1]?.slice(0, 500) || "";
    mentions.push({
      platform,
      sourceUrl: url,
      sourceTitle: host,
      mentionContext: ctx,
      engagementScore: rows.length,
      mentionedAt: first.checkedAt ? new Date(first.checkedAt) : undefined,
    });
  }
  return mentions;
}

function platformFromDomain(host: string): string {
  if (/reddit\.com$/.test(host)) return "reddit";
  if (/ycombinator\.com$/.test(host) || /news\.ycombinator\.com$/.test(host)) return "hackernews";
  if (/quora\.com$/.test(host)) return "quora";
  if (/youtube\.com$/.test(host) || host === "youtu.be") return "youtube";
  if (/twitter\.com$|x\.com$/.test(host)) return "twitter";
  if (/linkedin\.com$/.test(host)) return "linkedin";
  if (/medium\.com$/.test(host)) return "medium";
  return "web";
}

async function judgeSentiment(text: string, brandName: string): Promise<{ sentiment: string; sentimentScore: number }> {
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
  const parsed = safeParseJson<{ sentiment?: string; sentimentScore?: number }>(completion.choices[0]?.message?.content);
  const sentiment = parsed?.sentiment === "positive" || parsed?.sentiment === "negative" ? parsed.sentiment : "neutral";
  const score = typeof parsed?.sentimentScore === "number" ? Math.max(-1, Math.min(1, parsed.sentimentScore)) : 0;
  return { sentiment, sentimentScore: Number(score.toFixed(2)) };
}
