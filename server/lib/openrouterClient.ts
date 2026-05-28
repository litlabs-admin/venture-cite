import OpenAI from "openai";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";

let cached: OpenAI | null = null;

// Lazy singleton — instantiated on first use so tests can mock the
// module before construction. Uses OpenAI SDK pointed at OpenRouter
// (OpenAI-compatible API). Throws if OPENROUTER_API_KEY missing.
export function getOpenRouterClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for the chatbot");
  }
  cached = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://venturecite.com",
      "X-Title": "VentureCite",
    },
    // Tier-aware: ~6.3s on Hobby, 25s on Pro.
    timeout: LLM_CALL_TIMEOUT_MS,
    maxRetries: 1,
  });
  return cached;
}

export const CHATBOT_MODEL = "anthropic/claude-sonnet-4.5";
