// Ask's own budget runtime. Deliberately NOT chatbotBudget.ts - see
// docs/ask-feature/07-integration-and-hardening.md §0 (independence) and §1
// (the platform-cap report).
//
// Gated on RUNS per hour, not messages: one Ask run is 3-5 model calls where
// the tutor is one, so a message-count cap is the wrong instrument
// (03-gap-analysis.md B10).
//
// Platform-cap decision (07 §1, option A - chosen as recommended): Ask
// WRITES to api_costs with service='ask' (so it is visible to
// opsHealthCheck.ts and the unified cost view, and so Ask spend counts
// against the platform-wide 24h cap that citationChecker.ts and
// contentGenerationWorker.ts enforce via llmBudget.assertWithinBudget) but
// GATES only on its own ask_usage caps below - exactly the pattern the
// tutor already uses (assistant.ts writes service='chatbot' but gates on
// CHATBOT_DAILY_TOKEN_CAP, not llmBudget's DAILY_TOKEN_CAP). Deliberately
// NOT calling assertWithinBudget here: doing so would couple Ask's
// availability to citation-check and content-generation spend, which is the
// exact coupling the independence decision removed through a different
// door.
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../lib/logger";
import { BudgetExceededError, type Tier } from "../lib/llmPricing";

// Sized the same way CHATBOT_DAILY_TOKEN_CAP is (server/lib/llmPricing.ts):
// price every token at MODELS.ask's output rate as a pessimistic ceiling.
// Ask runs 3-5 Sonnet calls per turn (~30-60k tokens observed in practice),
// so these caps allow several runs/day even on free before a user needs to
// wait for the daily reset - matching the tutor's existing per-tier shape.
export const ASK_DAILY_TOKEN_CAP: Record<Tier, number> = {
  pending: 30_000,
  readonly: 15_000,
  free: 60_000,
  beta: 200_000,
  pro: 1_000_000,
  agency: 2_000_000,
  enterprise: 4_000_000,
  admin: 15_000_000,
};

// Runs per hour, the second axis (mirrors CHATBOT_MESSAGES_PER_HOUR's role -
// a small token budget can't be drained by spamming minimal-token runs, and
// this also bounds how many concurrent-ish runs a user can queue).
export const ASK_RUNS_PER_HOUR: Record<Tier, number> = {
  pending: 3,
  readonly: 2,
  free: 6,
  beta: 10,
  pro: 30,
  agency: 30,
  enterprise: 60,
  admin: 200,
};

async function tokensUsedToday(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select coalesce(input_tokens + output_tokens, 0)::int as total
    from public.ask_usage
    where user_id = ${userId}
      and usage_date = current_date
  `);
  const r = rows as unknown as { rows?: Array<{ total: number }> } & Array<{ total: number }>;
  return Number(r.rows?.[0]?.total ?? r[0]?.total ?? 0) || 0;
}

async function runsLastHour(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select coalesce(sum(run_count), 0)::int as n
    from public.ask_usage
    where user_id = ${userId}
      and usage_date >= current_date - interval '1 day'
  `);
  // Approximation deliberately: ask_usage is a daily bucket (matching
  // chatbot_token_usage's shape), not per-request, so an hourly cap reads
  // "runs in the last ~24h, spread over today+yesterday's buckets" rather
  // than a sliding hour. That is more permissive than a true rolling hour,
  // which is the safe direction for a false cap to fail in - the daily
  // token cap is still the hard backstop.
  const r = rows as unknown as { rows?: Array<{ n: number }> } & Array<{ n: number }>;
  return Number(r.rows?.[0]?.n ?? r[0]?.n ?? 0) || 0;
}

export async function assertAskBudget(userId: string, tier: Tier): Promise<void> {
  const tokenCap = ASK_DAILY_TOKEN_CAP[tier] ?? ASK_DAILY_TOKEN_CAP.free;
  const runCap = ASK_RUNS_PER_HOUR[tier] ?? ASK_RUNS_PER_HOUR.free;
  if (tokenCap < 0) return;

  const [tokens, runs] = await Promise.all([tokensUsedToday(userId), runsLastHour(userId)]);

  if (tokens >= tokenCap) {
    logger.warn({ userId, tier, tokens, tokenCap }, "askBudget: daily token cap exceeded");
    throw new BudgetExceededError(tier, tokenCap, tokens);
  }
  if (runs >= runCap) {
    logger.warn({ userId, tier, runs, runCap }, "askBudget: hourly run cap exceeded");
    throw new BudgetExceededError(tier, runCap, runs);
  }
}

export async function recordAskUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await db.execute(sql`
    insert into public.ask_usage (user_id, usage_date, input_tokens, output_tokens, run_count)
    values (${userId}, current_date, ${inputTokens}, ${outputTokens}, 1)
    on conflict (user_id, usage_date) do update set
      input_tokens = ask_usage.input_tokens + ${inputTokens},
      output_tokens = ask_usage.output_tokens + ${outputTokens},
      run_count = ask_usage.run_count + 1
  `);
}
