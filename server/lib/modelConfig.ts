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
  // Rewrites an article for LinkedIn, Medium, Reddit.
  distribution: OPENAI_MINI_SNAPSHOT,

  // ── Everything else (not Phase 1) ─────────────────────────────────
  // Catch-all for non-Phase-1 features (sentiment, listicles, FAQs,
  // agent tasks, geo-signals, community posts, etc.). Bump this if you
  // need a stronger model for side features.
  misc: OPENAI_MINI_SNAPSHOT,
} as const;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// ── Citation grounding ──────────────────────────────────────────────
// Citation checks must reflect REAL AI-search behavior: each engine
// answers with LIVE WEB GROUNDING, queried as itself, deterministically.
// Slugs + token prices + the facts below verified 2026-05-18 against the
// OpenAI / OpenRouter model + docs pages.
//   - ChatGPT: OpenAI `gpt-4o-mini-search-preview` via the direct OpenAI
//     client. Search-preview models do their own retrieval and REJECT
//     all sampling params (temperature/top_p/penalties) → returns a
//     400 if `temperature` is sent, so supportsTemperature:false.
//   - Claude / Gemini / DeepSeek: clean OpenRouter slug + the
//     `openrouter:web_search` SERVER TOOL (added to the request `tools`
//     array). The legacy `:online` suffix / web plugin is DEPRECATED by
//     OpenRouter; the server tool is the supported path and runs the
//     search server-side in ONE round-trip, returning url_citation
//     annotations (no client-side tool-call handling needed).
//   - Perplexity `sonar` is natively web-grounded; no tool needed.
// pricingModel == model (token cost only). The web-search request fee
// (~$0.005/req via Exa) is not token-priced (analytics-only). If a slug
// 404s or a price drifts, this is the one place to edit.
export type CitationModelClient = "openai" | "openrouter";
export interface CitationModelConfig {
  client: CitationModelClient;
  model: string;
  pricingModel: string;
  supportsTemperature: boolean;
  // Attach the openrouter:web_search server tool. False for engines that
  // ground natively (ChatGPT search-preview, Perplexity sonar).
  webSearchTool: boolean;
}
export const CITATION_MODELS: Record<string, CitationModelConfig> = {
  ChatGPT: {
    client: "openai",
    model: "gpt-4o-mini-search-preview",
    pricingModel: "gpt-4o-mini-search-preview",
    supportsTemperature: false,
    webSearchTool: false,
  },
  Claude: {
    client: "openrouter",
    model: "anthropic/claude-haiku-4.5",
    pricingModel: "anthropic/claude-haiku-4.5",
    supportsTemperature: true,
    webSearchTool: true,
  },
  Gemini: {
    client: "openrouter",
    model: "google/gemini-2.5-flash-lite",
    pricingModel: "google/gemini-2.5-flash-lite",
    supportsTemperature: true,
    webSearchTool: true,
  },
  Perplexity: {
    client: "openrouter",
    model: "perplexity/sonar",
    pricingModel: "perplexity/sonar",
    supportsTemperature: true,
    webSearchTool: false,
  },
  DeepSeek: {
    client: "openrouter",
    model: "deepseek/deepseek-v3.2",
    pricingModel: "deepseek/deepseek-v3.2",
    supportsTemperature: true,
    webSearchTool: true,
  },
};
