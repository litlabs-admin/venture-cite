// Central model registry - edit model names here and every call site picks
// them up. Keep the keys grouped by feature page so it's obvious where each
// value is used.
//
// Most non-citation features call OpenAI directly. The three ANALYSIS_MODEL
// features go through OpenRouter. Citation features call 5 of 6 platforms
// through OpenRouter (Claude, Gemini, Perplexity, DeepSeek, Grok); the
// ChatGPT citation check stays on the direct OpenAI client.
//
// OpenAI models use dated snapshots so bumping the
// `openai` SDK package can't silently swap us onto a newer model that
// changes pricing, latency, or output format. To bump:
//   1. Pick the new dated snapshot from https://platform.openai.com/docs/models
//   2. Update OPENAI_MINI_SNAPSHOT below
//   3. Re-run a sample article generation + citation check; verify
//      humanization scores and JSON-mode parsing still work
//   4. Update PRICING_PER_1K_TOKENS_CENTS in server/lib/llmPricing.ts
//      if the new snapshot has different pricing
const OPENAI_MINI_SNAPSHOT = "gpt-4o-mini-2024-07-18";

// Analysis tier - brand-profile inference, competitor discovery and prompt
// generation. These three calls decide everything downstream: the industry
// label becomes an extraction hint, the competitor set defines the market,
// and the prompts are what every citation run measures. On gpt-4o-mini they
// produced sector words ("Technology"), supplier names as competitors, and
// off-category questions. This is an OpenRouter slug, so these three calls
// use getOpenrouterClient(), not the direct OpenAI client.
// $0.10/$1M in, $0.60/$1M out, 1.05M context.
const ANALYSIS_MODEL = "openai/gpt-5.6-luna";

export const MODELS = {
  // ── Brand Setup (brands page) ─────────────────────────────────────
  // Used by /api/brands/create-from-website to extract a structured
  // brand profile from a website URL.
  brandAutofill: ANALYSIS_MODEL,

  // ── AI Keyword Research (keyword-research page) ───────────────────
  // /api/keyword-research/discover - generates 12–15 scored keywords.
  keywordResearch: OPENAI_MINI_SNAPSHOT,
  // /api/keyword-suggestions - inline autosuggest on the content page.
  keywordSuggestions: OPENAI_MINI_SNAPSHOT,
  // /api/popular-topics - trending topics on the content page.
  popularTopics: OPENAI_MINI_SNAPSHOT,

  // ── AI Content Generation (content page) ──────────────────────────
  // Main article writer inside the background worker.
  contentGeneration: OPENAI_MINI_SNAPSHOT,
  // Humanization rewriter (multiple passes per article).
  contentHumanize: OPENAI_MINI_SNAPSHOT,
  // Adversarial scorer that grades how "human" the draft reads.
  contentAnalyze: OPENAI_MINI_SNAPSHOT,

  // ── Track AI Citations (citations page) ───────────────────────────
  // Prompt portfolio generator - 15 strategic questions per brand.
  brandPromptGeneration: ANALYSIS_MODEL,
  // Competitor discovery - both the profile inference and the
  // citation-mining pass. Both call sites must use this key: they share
  // one OpenRouter client, so a bare OpenAI snapshot name would 404.
  competitorDiscovery: ANALYSIS_MODEL,
  // No `citationChatGPT` key: the ChatGPT citation check needs a
  // web-grounded model, so it uses `gpt-4o-mini-search-preview`, declared
  // directly on CITATION_MODELS.ChatGPT below. A key here holding the
  // non-search snapshot was read by nothing and stated the wrong model -
  // the same "edit the obvious place, change nothing" trap that let the
  // DeepSeek slug 404 in production.
  // The other five platforms go through OpenRouter. Slugs verified
  // against https://openrouter.ai/api/v1/models on 2026-04-16 - edit here
  // if OpenRouter renames or deprecates any of them.
  citationClaude: "anthropic/claude-haiku-4.5",
  citationGemini: "google/gemini-3.1-flash-lite",
  citationPerplexity: "perplexity/sonar",
  // 2026-08-13: moved off `deepseek/deepseek-v3.2-exp` onto the V4 line,
  // which is both newer and cheaper ($0.14/$0.28 vs $0.27/$0.41 per 1M).
  // The old slug was the experimental variant of V3.2 - it had already
  // 404'd once as `deepseek/deepseek-v3.2`, and the circuit breaker ate
  // that as a 4xx (non-infra) failure, so the DeepSeek column silently
  // returned is_cited=false for every prompt. Verify any future slug
  // against https://openrouter.ai/api/v1/models before editing.
  citationDeepSeek: "deepseek/deepseek-v4-flash",
  citationGrok: "x-ai/grok-4.3",

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
// Slugs + token prices + the facts below verified 2026-05-27 against the
// OpenAI / OpenRouter model + docs pages.
//   - ChatGPT: OpenAI `gpt-4o-mini-search-preview` via the direct OpenAI
//     client. Search-preview models do their own retrieval and REJECT
//     all sampling params (temperature/top_p/penalties) → returns a
//     400 if `temperature` is sent, so supportsTemperature:false.
//   - Claude / Gemini / DeepSeek / Grok: clean OpenRouter slug + the documented
//     `plugins:[{id:"web", max_results:5}]` extension on the OpenAI-compatible
//     chat-completions request. (Per https://openrouter.ai/docs/guides/features/plugins/web-search
//     the supported forms are the `:online` model suffix or the `plugins`
//     array - there is no `openrouter:web_search` tool type. The prior
//     code mistakenly built a fake `tools` entry which OpenRouter
//     silently ignored, so these engines were running against stale
//     training data.) OpenRouter runs the search server-side in one
//     round-trip and returns url_citation annotations on
//     `choices[].message.annotations` - no client-side tool-call handling.
//   - Perplexity `sonar` is natively web-grounded; no plugin needed.
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
// Slugs live in MODELS above - this map adds only the per-platform
// transport config (client, temperature support, web-search plugin).
// Reading `model`/`pricingModel` from MODELS keeps both in sync: a slug
// fix applied to MODELS.citationX now reaches the citation runner too.
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
    model: MODELS.citationClaude,
    pricingModel: MODELS.citationClaude,
    supportsTemperature: true,
    webSearchTool: true,
  },
  Gemini: {
    client: "openrouter",
    model: MODELS.citationGemini,
    pricingModel: MODELS.citationGemini,
    supportsTemperature: true,
    webSearchTool: true,
  },
  Perplexity: {
    client: "openrouter",
    model: MODELS.citationPerplexity,
    pricingModel: MODELS.citationPerplexity,
    supportsTemperature: true,
    webSearchTool: false,
  },
  DeepSeek: {
    client: "openrouter",
    model: MODELS.citationDeepSeek,
    pricingModel: MODELS.citationDeepSeek,
    supportsTemperature: true,
    webSearchTool: true,
  },
  // Grok is live on x.com natively, but that grounding is not guaranteed
  // through OpenRouter's chat-completions path - the web plugin is what
  // returns the url_citation annotations the citation parser reads. Same
  // posture as Claude / Gemini / DeepSeek.
  Grok: {
    client: "openrouter",
    model: MODELS.citationGrok,
    pricingModel: MODELS.citationGrok,
    supportsTemperature: true,
    webSearchTool: true,
  },
};
