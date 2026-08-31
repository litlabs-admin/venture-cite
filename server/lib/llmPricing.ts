// Pure pricing math for LLM cost estimation.
//
// Split out from server/lib/llmBudget.ts so the math can be unit-tested
// without booting the database (llmBudget imports `db` at module load).

import { usageLimits } from "@shared/schema";

// Derived from usageLimits rather than hand-listed beside it.
//
// The hand-written union used to read
// `"free" | "beta" | "pro" | "enterprise" | "admin"`, which omitted three of
// the eight tiers the application actually issues - pending, readonly and
// agency - while naming two that no production user holds. Checked against
// production on 2026-08-31: 29 free, 6 agency, 6 pending, 3 pro, 2 beta, and
// nobody on enterprise or admin.
//
// That mattered the moment caps were enforced. `DAILY_TOKEN_CAP[tier] ??
// DAILY_TOKEN_CAP.free` in llmBudget.ts silently gave every agency account -
// a SELLABLE tier, above pro in SELLABLE_TIERS - the free-tier allowance.
// Deriving the key set means a tier added to usageLimits fails the build here
// instead of quietly inheriting someone else's budget.
export type Tier = keyof typeof usageLimits;

// Daily token cap per tier, covering citationChecker.ts sweeps and
// contentGenerationWorker.ts article generation. -1 = unlimited.
//
// 2026-05-27: disabled across all tiers - the `if (cap < 0) return;`
// short-circuit in assertWithinBudget() made enforcement a no-op while
// recordSpend() kept writing api_costs rows for analytics only.
// CHATBOT_MESSAGES_PER_HOUR (below) still applied as a spam guard, but
// nothing bounded token spend: a runaway onboarding loop ran 114 full
// citation sweeps in 34 hours and burned roughly $65 before anyone
// noticed (2026-08-31 incident). Re-enabled below.
//
// Sizing: citation sweeps fan out across CITATION_MODELS
// (server/lib/modelConfig.ts) - claude-haiku-4.5, gemini-3.1-flash-lite,
// deepseek-v4-flash, grok-4.3. grok-4.3 is the most expensive at
// $1.25 / $2.50 per 1M tokens (0.125 / 0.25 cents per 1k - see the
// pricing table below). Caps here price every token at grok's *output*
// rate (0.25 cents/1k) as a deliberately pessimistic ceiling, so the
// real dollar cost of hitting a cap is at or below the target:
//   tokens = target_cents / 0.25 * 1000
// Targets: free $0.50/day, beta $2/day, pro $10/day, enterprise $50/day.
// admin (internal/ops accounts) keeps a generous but finite backstop
// ($125/day) instead of true -1, since unbounded admin spend is exactly
// the failure mode this cap exists to prevent.
//   free:       50 / 0.25 * 1000 =    200,000
//   beta:      200 / 0.25 * 1000 =    800,000
//   pro:      1000 / 0.25 * 1000 =  4,000,000
//   agency:   2500 / 0.25 * 1000 = 10,000,000
//   enterprise: 5000 / 0.25 * 1000 = 20,000,000
//   admin:    12500 / 0.25 * 1000 = 50,000,000
// A single legitimate sweep (a handful of prompts x 4 models, ~800
// tokens/call) runs well under 50k tokens, so free-tier users get
// several sweeps/day of headroom while a 114-sweep runaway loop is
// stopped after roughly its 6th sweep instead of its 114th.
//
// agency sits between pro and enterprise because SELLABLE_TIERS orders it
// above pro, and usageLimits gives it 40 articles/month across 10 brands
// against pro's 3 brands.
//
// pending and readonly are bounded but NOT zero, deliberately. usageLimits
// allows both 0 articles and 0 brands, so a cap of 0 would match the stated
// intent - but 6 accounts sit at `pending` in production right now, and a
// hard 0 would block them from any LLM work the instant this deploys.
// A small ceiling bounds the spend without turning an enforcement change
// into an outage. Tightening these to 0 is a product decision, not this
// change's to make.
export const DAILY_TOKEN_CAP: Record<Tier, number> = {
  pending: 100_000,
  readonly: 50_000,
  free: 200_000,
  beta: 800_000,
  pro: 4_000_000,
  agency: 10_000_000,
  enterprise: 20_000_000,
  admin: 50_000_000,
};

// Per-user chatbot token cap per day. -1 = unlimited.
//
// Re-enabled 2026-08-31 alongside DAILY_TOKEN_CAP - see note above.
// The chatbot always runs CHATBOT_MODEL (anthropic/claude-sonnet-4.5,
// server/lib/openrouterClient.ts), priced at $3 / $15 per 1M tokens
// (0.3 / 1.5 cents per 1k). Caps price every token at the output rate
// (1.5 cents/1k) as a pessimistic ceiling:
//   tokens = target_cents / 1.5 * 1000
// Targets: free $0.30/day, beta $1/day, pro $5/day, enterprise $20/day,
// admin a generous but finite $75/day backstop.
//   free:      30 / 1.5 * 1000 =    20,000
//   beta:     100 / 1.5 * 1000 =    66,667  (round to 65,000)
//   pro:      500 / 1.5 * 1000 =   333,333  (round to 330,000)
//   enterprise: 2000 / 1.5 * 1000 = 1,333,333 (round to 1,300,000)
//   admin:    7500 / 1.5 * 1000 = 5,000,000
// CHATBOT_MESSAGES_PER_HOUR (below) still applies alongside this as a
// second axis, so a small budget can't be drained by spamming
// minimal-token messages.
export const CHATBOT_DAILY_TOKEN_CAP: Record<Tier, number> = {
  pending: 10_000,
  readonly: 5_000,
  free: 20_000,
  beta: 65_000,
  pro: 330_000,
  agency: 650_000,
  enterprise: 1_300_000,
  admin: 5_000_000,
};

// Per-user chatbot messages per hour. Two-axis cap (token + count) so
// a small budget can't be drained by spamming 1-token messages.
export const CHATBOT_MESSAGES_PER_HOUR: Record<Tier, number> = {
  pending: 10,
  readonly: 5,
  free: 20,
  beta: 30,
  pro: 60,
  agency: 90,
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
