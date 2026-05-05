import OpenAI from "openai";
import { createHash } from "crypto";
import { storage } from "../storage";
import { MODELS } from "./modelConfig";
import { attachAiLogger } from "./aiLogger";
import { logger } from "./logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
attachAiLogger(openai);

export type SentimentInput = { key: string; text: string };
export type SentimentOutput = {
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  source: "llm" | "fallback" | "capped";
};

const BATCH_SIZE = 10;

export function contentHash(brandName: string, text: string): string {
  return createHash("sha256").update(`${brandName}::${text}`).digest("hex");
}

export async function judgeSentimentBatch(
  brandName: string,
  inputs: SentimentInput[],
  opts: { remainingBudget?: number } = {},
): Promise<Record<string, SentimentOutput>> {
  const out: Record<string, SentimentOutput> = {};
  const cacheKeyByInputKey = new Map<string, string>();

  // 1. Look up cache for everyone.
  const uncached: SentimentInput[] = [];
  for (const inp of inputs) {
    const h = contentHash(brandName, inp.text);
    cacheKeyByInputKey.set(inp.key, h);
    const hit = await storage.getCachedSentiment(h);
    if (hit) {
      out[inp.key] = {
        sentiment: hit.sentiment as SentimentOutput["sentiment"],
        sentimentScore: Number(hit.sentimentScore),
        source: "llm",
      };
    } else {
      uncached.push(inp);
    }
  }

  // 2. Apply budget. The first `remainingBudget` uncached entries get LLM; rest get 'capped'.
  let budget = opts.remainingBudget ?? Number.POSITIVE_INFINITY;
  const llmTargets: SentimentInput[] = [];
  for (const inp of uncached) {
    if (budget > 0) {
      llmTargets.push(inp);
      budget -= 1;
    } else {
      out[inp.key] = { sentiment: "neutral", sentimentScore: 0, source: "capped" };
    }
  }

  // 3. Call OpenAI in batches of 10.
  for (let i = 0; i < llmTargets.length; i += BATCH_SIZE) {
    const batch = llmTargets.slice(i, i + BATCH_SIZE);
    try {
      const completion = await openai.chat.completions.create({
        model: MODELS.misc,
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: `You are a sentiment analyst. For each entry, decide how it talks about the brand specifically. Return JSON: {"verdicts":[{"key":"...","sentiment":"positive"|"neutral"|"negative","sentimentScore":-1..1}]}.`,
          },
          {
            role: "user",
            content: `Brand: ${brandName}\n\nEntries:\n${batch.map((b) => `- key=${b.key}\n  text: """${b.text.slice(0, 2000)}"""`).join("\n")}`,
          },
        ],
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
        verdicts?: Array<{ key: string; sentiment: string; sentimentScore: number }>;
      };
      const verdictsByKey = new Map((parsed.verdicts ?? []).map((v) => [v.key, v]));
      for (const inp of batch) {
        const v = verdictsByKey.get(inp.key);
        if (!v) {
          out[inp.key] = { sentiment: "neutral", sentimentScore: 0, source: "fallback" };
          continue;
        }
        const sentiment = (["positive", "neutral", "negative"] as const).includes(
          v.sentiment as "positive" | "neutral" | "negative",
        )
          ? (v.sentiment as SentimentOutput["sentiment"])
          : "neutral";
        const score = Math.max(-1, Math.min(1, Number(v.sentimentScore) || 0));
        out[inp.key] = { sentiment, sentimentScore: Number(score.toFixed(2)), source: "llm" };
        await storage.upsertCachedSentiment({
          contentHash: cacheKeyByInputKey.get(inp.key)!,
          sentiment,
          sentimentScore: score.toFixed(2),
        });
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "sentiment.batch.fallback",
      );
      for (const inp of batch) {
        out[inp.key] = { sentiment: "neutral", sentimentScore: 0, source: "fallback" };
      }
    }
  }

  return out;
}
