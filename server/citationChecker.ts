import OpenAI from "openai";
import { storage } from "./storage";
import type { GeoRanking, Brand } from "@shared/schema";
import { pickModel } from "./lib/modelConfig";
import { attachAiLogger } from "./lib/aiLogger";
import { attachTestModeFallback } from "./lib/testModeClient";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);
attachTestModeFallback(openai);

export const DEFAULT_CITATION_PLATFORMS = ['ChatGPT', 'Perplexity', 'DeepSeek', 'Claude', 'Gemini'] as const;

// Heuristic brand-mention detector used by every platform's response parser.
export function checkForCitation(
  responseText: string,
  brandName: string,
  keywords: string,
  articleTitle: string,
): { isCited: boolean; context: string | null; rank: number | null } {
  const lowerResponse = responseText.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  const lowerTitle = articleTitle.toLowerCase();

  if (!brandName && !articleTitle) {
    return { isCited: false, context: null, rank: null };
  }

  let isCited = false;
  let context: string | null = null;
  let rank: number | null = null;

  if (brandName && brandName.length > 2 && lowerResponse.includes(lowerBrand)) {
    isCited = true;
    const idx = lowerResponse.indexOf(lowerBrand);
    const start = Math.max(0, idx - 100);
    const end = Math.min(responseText.length, idx + brandName.length + 100);
    context = `Brand mentioned: "...${responseText.substring(start, end)}..."`;

    const beforeMention = lowerResponse.substring(0, idx);
    const mentionNumber = (beforeMention.match(new RegExp(lowerBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length + 1;
    rank = mentionNumber;
  }

  if (!isCited && articleTitle && articleTitle.length > 10) {
    const titleWords = lowerTitle.split(/\s+/).filter((w) => w.length > 4);
    const matchedWords = titleWords.filter((w) => lowerResponse.includes(w));
    if (matchedWords.length >= Math.ceil(titleWords.length * 0.6)) {
      isCited = true;
      context = `Content topic strongly referenced. Matched keywords: ${matchedWords.join(', ')}`;
      rank = 3;
    }
  }

  if (!isCited && keywords) {
    const keywordList = keywords.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k.length > 3);
    const matchedKeywords = keywordList.filter((k) => lowerResponse.includes(k));
    if (matchedKeywords.length >= Math.ceil(keywordList.length * 0.5) && matchedKeywords.length >= 2) {
      context = `Related keywords found: ${matchedKeywords.join(', ')} (indirect reference)`;
    }
  }

  return { isCited, context, rank };
}

// Per-platform query. Real APIs used where keys are configured, otherwise a
// simulated fallback that makes the limitation visible in the citationContext.
export async function runPlatformCitationCheck(
  platform: string,
  prompt: string,
  brand: Brand | null,
  brandName: string,
  articleKeywords: string,
  articleTitle: string,
): Promise<{ isCited: boolean; citationContext: string | null; rank: number | null }> {
  const systemChatgpt = "You are a helpful assistant. Answer the question thoroughly, citing specific sources, brands, companies, or products when relevant.";
  const toResult = (r: { isCited: boolean; context: string | null; rank: number | null }) =>
    ({ isCited: r.isCited, citationContext: r.context, rank: r.rank });

  if (platform === 'ChatGPT' || platform === 'GPT-4') {
    const chatResponse = await openai.chat.completions.create({
      model: pickModel("gpt-4o-mini"),
      messages: [
        { role: "system", content: systemChatgpt },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });
    const responseText = chatResponse.choices[0].message.content || '';
    return toResult(checkForCitation(responseText, brandName, articleKeywords, articleTitle));
  }

  if (platform === 'Perplexity') {
    if (!process.env.PERPLEXITY_API_KEY) {
      return { isCited: false, citationContext: "Perplexity not configured (missing PERPLEXITY_API_KEY)", rank: null };
    }
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          { role: "system", content: "Be thorough and cite specific sources, brands, and companies when relevant." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });
    if (!perplexityResponse.ok) {
      const errText = await perplexityResponse.text().catch(() => "");
      throw new Error(`Perplexity API ${perplexityResponse.status}: ${errText.slice(0, 200)}`);
    }
    const perplexityData = (await perplexityResponse.json()) as any;
    const responseText = perplexityData.choices?.[0]?.message?.content || '';
    const citations: string[] = Array.isArray(perplexityData.citations) ? perplexityData.citations : [];
    const citationCheck = checkForCitation(responseText, brandName, articleKeywords, articleTitle);

    const brandUrl = brand?.website?.replace(/https?:\/\//, '').replace(/\/$/, '') || '';
    const urlCited = brandUrl && citations.some((c) => typeof c === 'string' && c.includes(brandUrl));
    const citationContext = citationCheck.context || (urlCited
      ? `Brand URL found in Perplexity citations: ${citations.filter((c) => typeof c === 'string' && c.includes(brandUrl)).join(', ')}`
      : null);
    return {
      isCited: citationCheck.isCited || Boolean(urlCited),
      citationContext,
      rank: citationCheck.rank,
    };
  }

  if (platform === 'DeepSeek') {
    if (!process.env.DEEPSEEK_API_KEY) {
      return { isCited: false, citationContext: "DeepSeek not configured (missing DEEPSEEK_API_KEY)", rank: null };
    }
    const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: "system", content: systemChatgpt },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });
    if (!deepseekResponse.ok) {
      const errText = await deepseekResponse.text().catch(() => "");
      throw new Error(`DeepSeek API ${deepseekResponse.status}: ${errText.slice(0, 200)}`);
    }
    const deepseekData = (await deepseekResponse.json()) as any;
    const responseText = deepseekData.choices?.[0]?.message?.content || '';
    return toResult(checkForCitation(responseText, brandName, articleKeywords, articleTitle));
  }

  // Simulated fallback for platforms without real API integration (Claude,
  // Gemini, Grok, etc.). citationContext is tagged so the UI can label it.
  const chatResponse = await openai.chat.completions.create({
    model: pickModel("gpt-4o-mini"),
    messages: [
      { role: "system", content: `You are ${platform}, a helpful AI assistant. Answer the question thoroughly, citing specific sources, brands, companies, or products when relevant.` },
      { role: "user", content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });
  const responseText = chatResponse.choices[0].message.content || '';
  const base = checkForCitation(responseText, brandName, articleKeywords, articleTitle);
  return {
    isCited: base.isCited,
    citationContext: base.context ? `[simulated via OpenAI] ${base.context}` : `[simulated via OpenAI — no ${platform} API configured]`,
    rank: base.rank,
  };
}

// Runs every stored prompt for a brand across each platform and persists a
// geo_rankings row per (prompt, platform) pair. Shared between the API
// endpoint and the weekly scheduler.
export async function runBrandPrompts(
  brandId: string,
  platforms: string[] = [...DEFAULT_CITATION_PLATFORMS],
): Promise<{ totalChecks: number; totalCited: number; rankings: GeoRanking[] }> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");
  const brandName = brand.companyName || brand.name || '';
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  if (prompts.length === 0) return { totalChecks: 0, totalCited: 0, rankings: [] };

  const cappedPlatforms = platforms.slice(0, 5);
  const rankings: GeoRanking[] = [];
  let totalCited = 0;

  for (const bp of prompts) {
    for (const platform of cappedPlatforms) {
      let isCited = false;
      let citationContext: string | null = null;
      let rank: number | null = null;
      try {
        const result = await runPlatformCitationCheck(platform, bp.prompt, brand, brandName, '', '');
        isCited = result.isCited;
        citationContext = result.citationContext;
        rank = result.rank;
      } catch (apiError) {
        citationContext = `Check failed: ${apiError instanceof Error ? apiError.message : 'API error'}`;
      }
      const row = await storage.createGeoRanking({
        articleId: null,
        brandPromptId: bp.id,
        aiPlatform: platform,
        prompt: bp.prompt,
        rank,
        isCited: isCited ? 1 : 0,
        citationContext,
        checkedAt: new Date(),
      } as any);
      rankings.push(row);
      if (isCited) totalCited += 1;
    }
  }
  return { totalChecks: rankings.length, totalCited, rankings };
}
