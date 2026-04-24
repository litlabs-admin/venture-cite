// Per-user LLM token budget runtime (Wave 3.2).
//
// Pure pricing math (caps, cost estimation, error class) lives in
// llmPricing.ts so unit tests can import without booting the database
// — this module's `db.execute` import would otherwise pull in pg.Pool.
//
// Each LLM call site does:
//   await assertWithinBudget(userId, tier);   // throws if at cap
//   const resp = await openai.chat.completions.create(...);
//   await recordSpend({ userId, service, model, tokens... });
//
// Soft-alert at 80% logs warn so you can spot users hitting their cap
// before they're blocked. Hard-block at 100% throws BudgetExceededError.

import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "./logger";
import { DAILY_TOKEN_CAP, BudgetExceededError, estimateCostCents } from "./llmPricing";

export {
  DAILY_TOKEN_CAP,
  BudgetExceededError,
  estimateCostCents,
  isBudgetExceededError,
} from "./llmPricing";
export type { Tier } from "./llmPricing";

// Sum tokens spent by user in the last 24 hours.
async function tokensUsedLast24h(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select coalesce(sum(tokens_in + tokens_out), 0)::int as total
    from public.api_costs
    where user_id = ${userId}
      and created_at > now() - interval '24 hours'
  `);
  // drizzle-orm execute returns differently shaped rows depending on driver;
  // handle both pg.Rows-style and array-style.
  const r = rows as unknown as { rows?: Array<{ total: number }> } & Array<{ total: number }>;
  const total = r.rows?.[0]?.total ?? r[0]?.total ?? 0;
  return Number(total) || 0;
}

// Block the call when the user is at or above their daily cap. Logs a
// warn (not error) at 80%+ so you can watch users approach the wall.
export async function assertWithinBudget(
  userId: string,
  tier: import("./llmPricing").Tier,
): Promise<void> {
  const cap = DAILY_TOKEN_CAP[tier] ?? DAILY_TOKEN_CAP.free;
  if (cap < 0) return; // admin / unlimited

  const used = await tokensUsedLast24h(userId);
  if (used >= cap) {
    throw new BudgetExceededError(tier, cap, used);
  }
  if (used >= cap * 0.8) {
    logger.warn(
      { userId, tier, used, cap, pct: Math.round((used / cap) * 100) },
      "llmBudget: user approaching daily cap (>=80%)",
    );
  }
}

export interface SpendRecord {
  userId: string;
  service: string;
  model?: string | null;
  tokensIn: number;
  tokensOut: number;
}

export async function recordSpend(spend: SpendRecord): Promise<void> {
  const cents = estimateCostCents(spend.model, spend.tokensIn, spend.tokensOut);
  try {
    await db.execute(sql`
      insert into public.api_costs (user_id, service, model, tokens_in, tokens_out, est_cost_cents)
      values (
        ${spend.userId},
        ${spend.service},
        ${spend.model ?? null},
        ${spend.tokensIn},
        ${spend.tokensOut},
        ${cents}
      )
    `);
  } catch (err) {
    // Cost-tracking failure must NOT abort the user's request. The
    // worst case is a missed-spend event in the analytics; the work
    // already happened. Log it.
    logger.error({ err, userId: spend.userId }, "llmBudget: failed to record spend");
  }
}
