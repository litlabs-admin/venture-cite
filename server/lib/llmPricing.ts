// Pure pricing math for LLM cost estimation (Wave 3.2).
//
// Split out from server/lib/llmBudget.ts so the math can be unit-tested
// without booting the database (llmBudget imports `db` at module load).

export type Tier = "free" | "beta" | "pro" | "enterprise" | "admin";

// Daily token cap per tier. -1 = unlimited (admin).
//
// Tuned for typical content-generation cost: a single article job is
// ~5-10k tokens total. So free=100k allows ~10-20 jobs/day, pro=1M
// allows ~100-200 jobs/day, enterprise allows ~1000-2000 jobs/day.
export const DAILY_TOKEN_CAP: Record<Tier, number> = {
  free: 100_000,
  beta: 250_000,
  pro: 1_000_000,
  enterprise: 10_000_000,
  admin: -1,
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
