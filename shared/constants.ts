/**
 * Cross-cutting constants shared between client and server.
 *
 * Single source of truth for values that were previously hardcoded in
 * multiple places (platform lists, scoring weights, time windows).
 */

// ---------------------------------------------------------------------------
// AI platforms tracked for citation / visibility analytics.
// Keep this sorted by business priority (most-queried first).
// ---------------------------------------------------------------------------
export const AI_PLATFORMS = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
  "Grok",
  "Microsoft Copilot",
  "Meta AI",
  "DeepSeek",
  "Google AI",
  "Bing AI",
] as const;

export type AiPlatform = (typeof AI_PLATFORMS)[number];

// Shorter subset used by client reports / compact badges where space is tight.
// Reflects the platforms we actively run citation checks against. Microsoft
// Copilot and Meta AI removed — not currently queried; DeepSeek added since
// we run against it via OpenRouter.
export const AI_PLATFORMS_CORE = ["ChatGPT", "Claude", "Perplexity", "Gemini", "DeepSeek"] as const;

// ---------------------------------------------------------------------------
// Citation scoring weights (server/routes.ts /api/geo-analytics).
// Centralized so score formula can be tuned without code changes elsewhere.
// ---------------------------------------------------------------------------
export const CITATION_SCORING = {
  citationWeight: 40,
  mentionWeight: 30,
  rankWeight: 30,
  citationMultiplier: 10,
  mentionMultiplier: 5,
  rankMultiplier: 3,
} as const;

// ---------------------------------------------------------------------------
// Analytics time windows (days).
// ---------------------------------------------------------------------------
export const ANALYTICS_WINDOWS = {
  week: 7,
  month: 30,
  quarter: 90,
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Content limits.
// ---------------------------------------------------------------------------
export const CONTENT_LIMITS = {
  maxArticleChars: 40_000,
  maxCitationResponseChars: 8_000,
} as const;
