// Central model registry — edit model names here and every call site picks
// them up. Keep the keys grouped by feature page so it's obvious where each
// value is used.
//
// Non-citation features call OpenAI directly. Citation features call 4 of 5
// platforms through OpenRouter (Claude, Gemini, Perplexity, DeepSeek); the
// ChatGPT citation check stays on the direct OpenAI client.

export const MODELS = {
  // ── Brand Setup (brands page) ─────────────────────────────────────
  // Used by /api/brands/autofill and /api/brands/create-from-website to
  // extract a structured brand profile from a website URL.
  brandAutofill: "gpt-4o-mini",

  // ── AI Keyword Research (keyword-research page) ───────────────────
  // /api/keyword-research/discover — generates 12–15 scored keywords.
  keywordResearch: "gpt-4o-mini",
  // /api/keyword-suggestions — inline autosuggest on the content page.
  keywordSuggestions: "gpt-4o-mini",
  // /api/popular-topics — trending topics on the content page.
  popularTopics: "gpt-4o-mini",

  // ── AI Content Generation (content page) ──────────────────────────
  // Main article writer inside the background worker.
  contentGeneration: "gpt-4o-mini",
  // Humanization rewriter (multiple passes per article).
  contentHumanize: "gpt-4o-mini",
  // Adversarial scorer that grades how "human" the draft reads.
  contentAnalyze: "gpt-4o-mini",

  // ── Track AI Citations (citations page) ───────────────────────────
  // Prompt portfolio generator — 10 strategic questions per brand.
  brandPromptGeneration: "gpt-4o-mini",
  // ChatGPT citation check — direct OpenAI client.
  citationChatGPT: "gpt-4o-mini",
  // The remaining four platforms go through OpenRouter. Slugs verified
  // against https://openrouter.ai/api/v1/models on 2026-04-16 — edit here
  // if OpenRouter renames or deprecates any of them.
  citationClaude: "anthropic/claude-haiku-4.5",
  citationGemini: "google/gemini-2.5-flash-lite",
  citationPerplexity: "perplexity/sonar",
  citationDeepSeek: "deepseek/deepseek-v3.2",

  // ── Distribute Content (articles page → distribute dialog) ────────
  // Rewrites an article for LinkedIn, Medium, Reddit, Quora.
  distribution: "gpt-4o-mini",

  // ── Everything else (not Phase 1) ─────────────────────────────────
  // Catch-all for non-Phase-1 features (sentiment, listicles, FAQs,
  // agent tasks, geo-signals, community posts, etc.). Bump this if you
  // need a stronger model for side features.
  misc: "gpt-4o-mini",
} as const;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
