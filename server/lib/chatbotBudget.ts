import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CHATBOT_DAILY_TOKEN_CAP,
  CHATBOT_MESSAGES_PER_HOUR,
  BudgetExceededError,
  type Tier,
} from "./llmPricing";

// Reads today's token usage row. Returns 0 if no row yet.
export async function tokensUsedToday(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select coalesce(input_tokens + output_tokens, 0)::int as total
    from public.chatbot_token_usage
    where user_id = ${userId}
      and usage_date = current_date
  `);
  const r = rows as unknown as { rows?: Array<{ total: number }> } & Array<{ total: number }>;
  return Number(r.rows?.[0]?.total ?? r[0]?.total ?? 0) || 0;
}

// Returns count of chatbot_messages with role='user' in the last hour.
export async function messagesLastHour(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select count(*)::int as n
    from public.chatbot_messages
    where user_id = ${userId}
      and role = 'user'
      and created_at > now() - interval '1 hour'
  `);
  const r = rows as unknown as { rows?: Array<{ n: number }> } & Array<{ n: number }>;
  return Number(r.rows?.[0]?.n ?? r[0]?.n ?? 0) || 0;
}

export async function assertChatbotBudget(userId: string, tier: Tier): Promise<void> {
  const tokenCap = CHATBOT_DAILY_TOKEN_CAP[tier] ?? CHATBOT_DAILY_TOKEN_CAP.free;
  const msgCap = CHATBOT_MESSAGES_PER_HOUR[tier] ?? CHATBOT_MESSAGES_PER_HOUR.free;
  if (tokenCap < 0) return;

  const [tokens, msgs] = await Promise.all([tokensUsedToday(userId), messagesLastHour(userId)]);

  if (tokens >= tokenCap) {
    throw new BudgetExceededError(tier, tokenCap, tokens);
  }
  if (msgs >= msgCap) {
    throw new BudgetExceededError(tier, msgCap, msgs);
  }
}

// Atomic UPSERT — increments today's row.
export async function recordChatbotUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await db.execute(sql`
    insert into public.chatbot_token_usage (user_id, usage_date, input_tokens, output_tokens, message_count)
    values (${userId}, current_date, ${inputTokens}, ${outputTokens}, 1)
    on conflict (user_id, usage_date) do update set
      input_tokens = chatbot_token_usage.input_tokens + ${inputTokens},
      output_tokens = chatbot_token_usage.output_tokens + ${outputTokens},
      message_count = chatbot_token_usage.message_count + 1
  `);
}
