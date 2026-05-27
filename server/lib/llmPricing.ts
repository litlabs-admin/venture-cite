// Pure pricing math for LLM cost estimation (Wave 3.2).
//
// Split out from server/lib/llmBudget.ts so the math can be unit-tested
// without booting the database (llmBudget imports `db` at module load).

export type Tier = "free" | "beta" | "pro" | "enterprise" | "admin";

// Daily token cap per tier. -1 = unlimited.
//
// 2026-05-27: token budget intentionally disabled across all tiers — the
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
// Disabled 2026-05-27 alongside DAILY_TOKEN_CAP — see note above.
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
// in the api_costs row — analytics-only, not part of the cap. Update
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
  // Citation engines — token rates verified 2026-05-18 against the
  // OpenRouter model pages. The web-search server-tool request fee
  // (~$0.005/req) is separate, not token-priced here (analytics-only).
  "anthropic/claude-haiku-4.5": { in: 0.1, out: 0.5 }, // $1 / $5 per 1M
  "google/gemini-2.5-flash-lite": { in: 0.01, out: 0.04 }, // $0.10 / $0.40 per 1M
  "perplexity/sonar": { in: 0.1, out: 0.1 }, // $1 / $1 per 1M (+ search fee)
  // DeepSeek slug verified 2026-05-28 — live variant is the `-exp` one.
  "deepseek/deepseek-v3.2-exp": { in: 0.027, out: 0.041 }, // $0.27 / $0.41 per 1M (OpenRouter card)
  // Keep the non-exp key as a fallback so analytics records that
  // pre-dated the fix still cost-estimate sensibly via the
  // `startsWith` matcher in estimateCostCents.
  "deepseek/deepseek-v3.2": { in: 0.027, out: 0.041 },
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

// Estimate cents for a given token count + model. Falls back to a
// generic price when the model isn't in the table.
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
  return Math.max(0, Math.round(cents));
}
