// Pure pricing math for LLM cost estimation.
//
// Split out from server/lib/llmBudget.ts so the math can be unit-tested
// without booting the database (llmBudget imports `db` at module load).

export type Tier = "free" | "beta" | "pro" | "enterprise" | "admin";

// Daily token cap per tier. -1 = unlimited.
//
// 2026-05-27: token budget intentionally disabled across all tiers - the
// `if (cap < 0) return;` short-circuit in assertWithinBudget() makes the
// enforcement a no-op while keeping recordSpend() writing api_costs rows
// for analytics. CHATBOT_MESSAGES_PER_HOUR (below) still applies as a
// spam guard. Re-introduce per-tier limits here if billing reinstates a
// daily ceiling.
export const DAILY_TOKEN_CAP: Record<Tier, number> = {
  free: -1,
  beta: -1,
  pro: -1,
  enterprise: -1,
  admin: -1,
};

// Per-user chatbot token cap per day. -1 = unlimited.
// Disabled 2026-05-27 alongside DAILY_TOKEN_CAP - see note above.
export const CHATBOT_DAILY_TOKEN_CAP: Record<Tier, number> = {
  free: -1,
  beta: -1,
  pro: -1,
  enterprise: -1,
  admin: -1,
};

// Per-user chatbot messages per hour. Two-axis cap (token + count) so
// a small budget can't be drained by spamming 1-token messages.
export const CHATBOT_MESSAGES_PER_HOUR: Record<Tier, number> = {
  free: 20,
  beta: 30,
  pro: 60,
  enterprise: 120,
  admin: 1000,
};

// Rough cents-per-1k-tokens (input / output). Used for est_cost_cents
// in the api_costs row - analytics-only, not part of the cap. Update
// when prices change; missing models get a generic fallback.
const PRICING_PER_1K_TOKENS_CENTS: Record<string, { in: number; out: number }> = {
  // OpenAI 2025-04 prices, in cents
  "gpt-4o-mini": { in: 0.015, out: 0.06 },
  "gpt-4o": { in: 0.25, out: 1.0 },
  "gpt-4-turbo": { in: 1.0, out: 3.0 },
  "gpt-3.5-turbo": { in: 0.05, out: 0.15 },
  // Anthropic via OpenRouter
  "claude-3-5-sonnet": { in: 0.3, out: 1.5 },
  "claude-3-haiku": { in: 0.025, out: 0.125 },
  "claude-sonnet-4.5": { in: 0.3, out: 1.5 },
  "anthropic/claude-sonnet-4.5": { in: 0.3, out: 1.5 },
  // Citation engines - token rates verified 2026-05-18 against the
  // OpenRouter model pages. The web-search server-tool request fee
  // (~$0.005/req) is separate, not token-priced here (analytics-only).
  "anthropic/claude-haiku-4.5": { in: 0.1, out: 0.5 }, // $1 / $5 per 1M
  "google/gemini-2.5-flash-lite": { in: 0.01, out: 0.04 }, // $0.10 / $0.40 per 1M
  "perplexity/sonar": { in: 0.1, out: 0.1 }, // $1 / $1 per 1M (+ search fee)
  // DeepSeek slug verified 2026-05-28 - live variant is the `-exp` one.
  "deepseek/deepseek-v3.2-exp": { in: 0.027, out: 0.041 }, // $0.27 / $0.41 per 1M (OpenRouter card)
  // Keep the non-exp key as a fallback so analytics records that
  // pre-dated the fix still cost-estimate sensibly via the
  // `startsWith` matcher in estimateCostCents.
  "deepseek/deepseek-v3.2": { in: 0.027, out: 0.041 },
  // Prices below verified 2026-08-13 against https://openrouter.ai/api/v1/models.
  // Conversion: dollars per 1M / 10 = cents per 1k. A missing row here is
  // not an error - it silently falls through to FALLBACK_PRICING and makes
  // every cost row for that model fiction.
  "google/gemini-3.1-flash-lite": { in: 0.025, out: 0.15 }, // $0.25 / $1.50 per 1M
  "deepseek/deepseek-v4-flash": { in: 0.014, out: 0.028 }, // $0.14 / $0.28 per 1M
  "x-ai/grok-4.3": { in: 0.125, out: 0.25 }, // $1.25 / $2.50 per 1M
  // Analysis tier - brand profile, competitor discovery, prompt generation.
  "openai/gpt-5.6-luna": { in: 0.01, out: 0.06 }, // $0.10 / $0.60 per 1M
  // OpenAI web-search chat model used for the ChatGPT citation check.
  "gpt-4o-mini-search-preview": { in: 0.015, out: 0.06 },
};

const FALLBACK_PRICING = { in: 0.1, out: 0.4 };

export class BudgetExceededError extends Error {
  readonly tier: Tier;
  readonly capTokens: number;
  readonly usedTokens: number;
  constructor(tier: Tier, capTokens: number, usedTokens: number) {
    // Pin to en-US so the message is byte-stable regardless of server
    // locale (Indian-locale runtimes group as 1,05,000 not 105,000,
    // which breaks log filtering and snapshot tests).
    const fmt = (n: number) => n.toLocaleString("en-US");
    super(
      `LLM token budget exceeded for ${tier} tier (${fmt(usedTokens)} / ${fmt(capTokens)} tokens in last 24h).`,
    );
    this.name = "BudgetExceededError";
    this.tier = tier;
    this.capTokens = capTokens;
    this.usedTokens = usedTokens;
  }
}

export function isBudgetExceededError(err: unknown): err is BudgetExceededError {
  return err instanceof BudgetExceededError;
}

// Precision kept in the returned value. Matches the `numeric(12,6)`
// column est_cost_cents is stored in - rounding here to more places than
// the column keeps would just let Postgres re-round on insert.
const CENTS_PRECISION = 6;
const CENTS_PRECISION_FACTOR = 10 ** CENTS_PRECISION;

// Estimate cents for a given token count + model. Falls back to a
// generic price when the model isn't in the table.
//
// Returns a fractional number of cents rather than rounding to a whole
// cent. A single call routinely costs less than one cent - one Gemini
// Flash-Lite call at ~28 input / 935 output tokens prices to roughly
// 0.14 cents - and rounding that to the nearest integer before storage
// made every such call record as exactly 0. `api_costs.est_cost_cents`
// is a `numeric` column (0122_api_costs_cost_precision.sql) so the
// fraction survives into storage; callers that need a display value can
// round at render time, not here.
export function estimateCostCents(
  model: string | undefined | null,
  tokensIn: number,
  tokensOut: number,
): number {
  const key = (model ?? "").toLowerCase();
  const price =
    PRICING_PER_1K_TOKENS_CENTS[key] ??
    Object.entries(PRICING_PER_1K_TOKENS_CENTS).find(([k]) => key.startsWith(k))?.[1] ??
    FALLBACK_PRICING;
  const cents = (tokensIn / 1000) * price.in + (tokensOut / 1000) * price.out;
  const rounded = Math.round(cents * CENTS_PRECISION_FACTOR) / CENTS_PRECISION_FACTOR;
  return Math.max(0, rounded);
}
