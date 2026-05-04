import OpenAI from "openai";

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
    timeout: 45_000,
    maxRetries: 1,
  });
  return cached;
}

export const CHATBOT_MODEL = "anthropic/claude-sonnet-4.5";
