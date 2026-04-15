import OpenAI from "openai";
import { OPENROUTER_MODELS, OPENROUTER_BASE_URL, isTestMode } from "./modelConfig";
import { attachAiLogger } from "./aiLogger";

// Lazily-built OpenRouter client. We can't construct this eagerly at module
// load time because OPENROUTER_API_KEY is loaded from .env slightly after
// server/index.ts initialises, so the first call reads the env var. The
// OpenRouter client also gets wrapped by attachAiLogger so every fallback
// attempt (success OR error) is written to log.txt.
let openrouter: OpenAI | null = null;

function getOpenRouter(): OpenAI {
  if (!openrouter) {
    openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "missing",
      baseURL: OPENROUTER_BASE_URL,
      timeout: 45_000,
      maxRetries: 0, // we handle retries ourselves via the fallback chain
      defaultHeaders: {
        // OpenRouter uses these for attribution / routing hints. Harmless
        // if the values are generic.
        "HTTP-Referer": process.env.APP_URL || "https://venturecite.app",
        "X-Title": "VentureCite",
      },
    });
    attachAiLogger(openrouter);
  }
  return openrouter;
}

// Monkeypatches an existing OpenAI client instance so that ALL
// chat.completions.create() calls are redirected to OpenRouter when
// USE_TEST_MODEL=true. Walks OPENROUTER_MODELS in order, trying each model
// until one succeeds. If every model fails, the last error is thrown so the
// existing error handling in routes.ts can surface it.
//
// When USE_TEST_MODEL is off, the original method is called unchanged.
//
// Idempotent — a client wrapped twice will only be wrapped once.
const WRAPPED = Symbol.for("venturecite.testModeClient.wrapped");

export function attachTestModeFallback(openai: OpenAI): void {
  const target = openai.chat.completions as unknown as {
    create: (...args: any[]) => Promise<any>;
    [k: symbol]: unknown;
  };
  if (target[WRAPPED]) return;
  const original = target.create.bind(target);

  target.create = async function (...args: any[]) {
    if (!isTestMode()) return original(...args);

    const requestBody = args[0] ?? {};
    const options = args[1];
    const router = getOpenRouter();

    let lastErr: unknown = null;
    for (const model of OPENROUTER_MODELS) {
      const attempt = { ...requestBody, model };
      // Many OpenRouter free models don't honour `response_format: json_object`
      // and either ignore the field (returning plain text) or 400 on it. Strip
      // it so call sites can safely set it for OpenAI without breaking test
      // mode. Our downstream parsers (safeParseJson) still handle both shapes.
      delete (attempt as any).response_format;
      try {
        // Call OpenRouter via its own OpenAI-compatible client.
        const response = await router.chat.completions.create(attempt, options);
        return response;
      } catch (err: any) {
        lastErr = err;
        console.warn(
          `[testMode] model ${model} failed (${err?.status ?? err?.code ?? err?.name ?? "error"}): ${err?.message?.slice?.(0, 200)} — trying next...`,
        );
        // Try the next model.
        continue;
      }
    }

    // All models failed — rethrow the last error so callers see a real error.
    console.error(`[testMode] all ${OPENROUTER_MODELS.length} OpenRouter models failed`);
    throw lastErr ?? new Error("All OpenRouter fallback models failed");
  } as typeof target.create;

  (target as any)[WRAPPED] = true;
}

