// Central model registry — edit model names here and every call site picks
// them up. Keep the keys grouped by feature page so it's obvious where each
// value is used.
//
// Non-citation features call OpenAI directly. Citation features call 4 of 5
// platforms through OpenRouter (Claude, Gemini, Perplexity, DeepSeek); the
// ChatGPT citation check stays on the direct OpenAI client.
//
// Wave 3.5: OpenAI models are pinned to dated snapshots so bumping the
// `openai` SDK package can't silently swap us onto a newer model that
// changes pricing, latency, or output format. To bump:
//   1. Pick the new dated snapshot from https://platform.openai.com/docs/models
//   2. Update OPENAI_MINI_SNAPSHOT below
//   3. Re-run a sample article generation + citation check; verify
//      humanization scores and JSON-mode parsing still work
//   4. Update PRICING_PER_1K_TOKENS_CENTS in server/lib/llmPricing.ts
//      if the new snapshot has different pricing
const OPENAI_MINI_SNAPSHOT = "gpt-4o-mini-2024-07-18";

export const MODELS = {
  // ── Brand Setup (brands page) ─────────────────────────────────────
  // Used by /api/brands/create-from-website to extract a structured
  // brand profile from a website URL.
  brandAutofill: OPENAI_MINI_SNAPSHOT,

  // ── AI Keyword Research (keyword-research page) ───────────────────
  // /api/keyword-research/discover — generates 12–15 scored keywords.
  keywordResearch: OPENAI_MINI_SNAPSHOT,
  // /api/keyword-suggestions — inline autosuggest on the content page.
  keywordSuggestions: OPENAI_MINI_SNAPSHOT,
  // /api/popular-topics — trending topics on the content page.
  popularTopics: OPENAI_MINI_SNAPSHOT,

  // ── AI Content Generation (content page) ──────────────────────────
  // Main article writer inside the background worker.
  contentGeneration: OPENAI_MINI_SNAPSHOT,
  // Humanization rewriter (multiple passes per article).
  contentHumanize: OPENAI_MINI_SNAPSHOT,
  // Adversarial scorer that grades how "human" the draft reads.
  contentAnalyze: OPENAI_MINI_SNAPSHOT,

  // ── Track AI Citations (citations page) ───────────────────────────
  // Prompt portfolio generator — 10 strategic questions per brand.
  brandPromptGeneration: OPENAI_MINI_SNAPSHOT,
  // ChatGPT citation check — direct OpenAI client.
  citationChatGPT: OPENAI_MINI_SNAPSHOT,
  // The remaining four platforms go through OpenRouter. Slugs verified
  // against https://openrouter.ai/api/v1/models on 2026-04-16 — edit here
  // if OpenRouter renames or deprecates any of them.
  citationClaude: "anthropic/claude-haiku-4.5",
  citationGemini: "google/gemini-2.5-flash-lite",
  citationPerplexity: "perplexity/sonar",
  citationDeepSeek: "deepseek/deepseek-v3.2",

  // ── Distribute Content (articles page → distribute dialog) ────────
  // Rewrites an article for LinkedIn, Medium, Reddit, Quora.
  distribution: OPENAI_MINI_SNAPSHOT,

  // ── Everything else (not Phase 1) ─────────────────────────────────
  // Catch-all for non-Phase-1 features (sentiment, listicles, FAQs,
  // agent tasks, geo-signals, community posts, etc.). Bump this if you
  // need a stronger model for side features.
  misc: OPENAI_MINI_SNAPSHOT,
} as const;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
