/**
 * Cross-cutting constants shared between client and server.
 *
 * Single source of truth for values that were previously hardcoded in
 * multiple places (platform lists, scoring weights, time windows).
 */

// ---------------------------------------------------------------------------
// AI platforms tracked for citation / visibility analytics.
// Split into ACTIVE (platforms we actually query via the citation runner — see
// server/citationChecker.ts DEFAULT_CITATION_PLATFORMS) and PLANNED (platforms
// we surface in UI scaffolding but don't yet produce data for). Do not claim
// "9 platforms" anywhere user-facing — only ACTIVE produces data.
// ---------------------------------------------------------------------------
export const AI_PLATFORMS_ACTIVE = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
  "DeepSeek",
] as const;

export const AI_PLATFORMS_PLANNED = [
  "Grok",
  "Microsoft Copilot",
  "Meta AI",
  "Google AI",
  "Bing AI",
] as const;

// Backwards-compatible alias. New code should import AI_PLATFORMS_ACTIVE
// directly. Kept pointing at ACTIVE so any remaining consumer renders only
// platforms that actually produce data.
export const AI_PLATFORMS = AI_PLATFORMS_ACTIVE;

export type AiPlatform =
  | (typeof AI_PLATFORMS_ACTIVE)[number]
  | (typeof AI_PLATFORMS_PLANNED)[number];

// Legacy alias retained — same set as AI_PLATFORMS_ACTIVE.
export const AI_PLATFORMS_CORE = AI_PLATFORMS_ACTIVE;

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

// ---------------------------------------------------------------------------
// AI Visibility checklist total.
//
// Sum of `engine.steps.length` across every entry in `aiEngines` in
// `client/src/pages/ai-visibility.tsx`. Surfaced server-side as the
// denominator of the "AI Visibility checklist progress" recommendation
// input (rule #9 `complete-visibility-checklist`). Keep this in lockstep
// with that file — if you add/remove a step there, update this number.
// ---------------------------------------------------------------------------
export const VISIBILITY_CHECKLIST_TOTAL = 57;
