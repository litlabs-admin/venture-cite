// Shared OpenRouter client for v2 sources. PROJECT POLICY: every non-GPT
// model call goes through OpenRouter via the OpenAI SDK pointed at
// OPENROUTER_BASE_URL. We do not install direct Anthropic / Google /
// Perplexity SDKs.
//
// Lazy + singleton: built on first call, cached for the process lifetime.
// Returns null when OPENROUTER_API_KEY is unset (callers gracefully skip).
import OpenAI from "openai";
import { OPENROUTER_BASE_URL } from "../../modelConfig";

let cached: OpenAI | null | undefined;

export function getOpenrouterClient(): OpenAI | null {
  if (cached !== undefined) return cached;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new OpenAI({
    apiKey: key,
    baseURL: OPENROUTER_BASE_URL,
    timeout: 45_000,
    maxRetries: 1,
  });
  return cached;
}

// Test-only: clear the cache so module re-imports pick up a new env.
export function _resetOpenrouterClientForTests(): void {
  cached = undefined;
}
