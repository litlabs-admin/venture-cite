// Direct OpenAI client for GPT models called outside the routes layer.
// PROJECT POLICY (owner, 2026-09-19): GPT models, Luna included, go to
// OpenAI's own API, never through OpenRouter. Non-GPT models keep using
// factAgent/v2/openrouterClient.ts.
//
// Lazy singleton, like getOpenrouterClient: null when OPENAI_API_KEY is
// unset, so callers keep their existing "AI not configured" branches.
import OpenAI from "openai";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";
import { attachAiLogger } from "./aiLogger";

let cached: OpenAI | null | undefined;

export function getOpenAIClient(): OpenAI | null {
  if (cached !== undefined) return cached;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new OpenAI({ apiKey: key, timeout: LLM_CALL_TIMEOUT_MS, maxRetries: 1 });
  attachAiLogger(cached);
  return cached;
}

// Test-only: clear the cache so module re-imports pick up a new env.
export function _resetOpenAIClientForTests(): void {
  cached = undefined;
}
