// Single source of truth for which OpenAI model to use at any call site,
// plus the OpenRouter fallback chain used when USE_TEST_MODEL=true.
//
// When USE_TEST_MODEL=true, every `openai.chat.completions.create()` call is
// intercepted and routed to OpenRouter instead of OpenAI. OpenRouter is
// OpenAI-SDK-compatible — same request/response shapes, same tool calling,
// same response_format, same temperature — so nothing else in the codebase
// changes. The only substitution is the model name and the base URL.
//
// ┌────────────────────────────────────────────────────────────────┐
// │ TO EDIT THE FALLBACK MODEL LIST: just change OPENROUTER_MODELS │
// │ below. The first entry is tried first; on any error the next  │
// │ one is tried; and so on until the list is exhausted.          │
// └────────────────────────────────────────────────────────────────┘

// Ordered fallback list of free OpenRouter models. Tried in sequence — the
// first one that succeeds wins. Add, remove, or reorder entries freely.
export const OPENROUTER_MODELS: string[] = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m2.5:free",
  "arcee-ai/trinity-large-preview:free",
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function isTestMode(): boolean {
  return process.env.USE_TEST_MODEL === "true";
}

// Wrap every production model choice at a call site. In production this
// returns the original string. In test mode it returns the FIRST OpenRouter
// model — the fallback wrapper in aiLogger.ts will walk the rest of the
// list automatically if that one errors.
export function pickModel(productionModel: string): string {
  if (!isTestMode()) return productionModel;
  return OPENROUTER_MODELS[0] ?? productionModel;
}

// Structured log helper for the `[ai]` line-per-request trace that goes to
// stdout (separate from the full JSON log file in log.txt).
export function logAiCall(feature: string, userId: string | undefined, modelUsed: string): void {
  console.log(`[ai] model=${modelUsed} feature=${feature} user=${userId ?? "anon"}`);
}
