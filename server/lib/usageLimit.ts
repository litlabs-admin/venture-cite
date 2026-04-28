// Atomic usage-limit enforcement (Wave 4.2).
//
// The unsafe pattern (pre-Wave 4.2):
//   1. SELECT count → 4 of 5 used
//   2. enqueue / create
//   3. UPDATE count = count + 1
// Two concurrent requests both see "4 of 5", both pass step 1, both
// create at step 2 — user gets 6 of 5.
//
// The fix here:
//   BEGIN
//     SELECT articles_used FROM users WHERE id = $1 FOR UPDATE;
//     IF articles_used >= cap: ROLLBACK + 403
//     ... do the work ...
//     UPDATE users SET articles_used = articles_used + 1 WHERE id = $1
//   COMMIT
//
// `FOR UPDATE` row-locks the user, so the second request blocks until
// the first commits, then reads the post-increment value. By the time
// it gets to the cap check, it sees the real number.

import { sql } from "drizzle-orm";
import { db } from "../db";
import { usageLimits } from "@shared/schema";
import type { Tier } from "./llmPricing";

// Type alias for the parameter Drizzle passes to a transaction callback.
// Same shape as `db` for our purposes — supports `.insert`, `.update`,
// `.execute`, etc. Extracting it from the function-type lets us avoid
// importing the entire generic Drizzle PgTransaction signature.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class UsageLimitError extends Error {
  readonly limitKind: "articles" | "brands";
  readonly cap: number;
  constructor(limitKind: "articles" | "brands", cap: number, message: string) {
    super(message);
    this.name = "UsageLimitError";
    this.limitKind = limitKind;
    this.cap = cap;
  }
}

export function isUsageLimitError(err: unknown): err is UsageLimitError {
  return err instanceof UsageLimitError;
}

// Helper for the messy "drizzle .execute() returns either {rows} or array
// depending on driver" rune.
function firstRow<T>(result: unknown): T | undefined {
  const r = result as { rows?: T[] } & T[];
  return r.rows?.[0] ?? r[0];
}

// Run `work` inside a transaction with the user row pinned via SELECT
// FOR UPDATE, gated on the article quota.
//
// Caller's `work` does its INSERT via the supplied `tx`. The usage
// counter is bumped after `work` resolves; both rollback together if
// `work` throws.
//
// IMPORTANT: usage is incremented at enqueue time, not at job-completion
// time. Failed jobs still consume quota — that's the cost of preventing
// runaway parallel enqueues from over-spending the cap. Acceptable
// trade-off for pre-launch.
export async function withArticleQuota<T>(
  userId: string,
  tier: Tier,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const limits = usageLimits[tier] ?? usageLimits.free;
  return await db.transaction(async (tx) => {
    if (limits.articlesPerMonth !== -1) {
      const row = firstRow<{ articles_used_this_month: number }>(
        await tx.execute(sql`
          select articles_used_this_month
          from public.users
          where id = ${userId}
          for update
        `),
      );
      const used = row?.articles_used_this_month ?? 0;
      if (used >= limits.articlesPerMonth) {
        throw new UsageLimitError(
          "articles",
          limits.articlesPerMonth,
          `You've reached your monthly limit of ${limits.articlesPerMonth} articles. Upgrade your plan for more.`,
        );
      }
    } else {
      // Unlimited tier — still take the lock so increment ordering stays
      // sane if the caller's work depends on serialization.
      await tx.execute(sql`select id from public.users where id = ${userId} for update`);
    }

    const result = await work(tx);

    await tx.execute(sql`
      update public.users
      set articles_used_this_month = articles_used_this_month + 1
      where id = ${userId}
    `);

    return result;
  });
}

// Wave 7: refund an article quota slot when a generation job ends in a
// transient failure (OpenAI 429/5xx, circuit open, timeout, or user-cancel)
// so users aren't billed for infrastructure problems they can't fix.
//
// Idempotent: gated on `content_generation_jobs.refunded_at IS NULL`. The
// caller passes the classified errorKind; the helper itself only refunds for
// kinds we judge "infra error or user-cancel". 'budget' and 'invalid_input'
// are *not* refunded — those are real terminal failures the user caused.
const REFUNDABLE_ERROR_KINDS = new Set([
  "openai_429",
  "openai_5xx",
  "circuit",
  "timeout",
  "cancelled",
]);

export type ErrorKind =
  | "budget"
  | "circuit"
  | "openai_5xx"
  | "openai_429"
  | "timeout"
  | "invalid_input"
  | "cancelled"
  | "unknown";

export function isRefundableErrorKind(kind: string | null | undefined): boolean {
  return kind !== null && kind !== undefined && REFUNDABLE_ERROR_KINDS.has(kind);
}

export async function refundArticleQuota(
  userId: string,
  jobId: string,
  errorKind: ErrorKind,
): Promise<{ refunded: boolean }> {
  if (!isRefundableErrorKind(errorKind)) return { refunded: false };
  return await db.transaction(async (tx) => {
    // Lock both the user row (for the counter) and the job row (for the
    // refund flag). Same ordering as withArticleQuota so we can't deadlock.
    await tx.execute(sql`select id from public.users where id = ${userId} for update`);
    const job = firstRow<{ id: string; refunded_at: Date | null }>(
      await tx.execute(sql`
        select id, refunded_at
        from public.content_generation_jobs
        where id = ${jobId}
        for update
      `),
    );
    if (!job) return { refunded: false };
    if (job.refunded_at) return { refunded: false }; // idempotent
    await tx.execute(sql`
      update public.users
      set articles_used_this_month = greatest(articles_used_this_month - 1, 0)
      where id = ${userId}
    `);
    await tx.execute(sql`
      update public.content_generation_jobs
      set refunded_at = now()
      where id = ${jobId}
    `);
    return { refunded: true };
  });
}

// Brand quota — counts rows in public.brands rather than reading a
// per-user counter (the existing brands_used column drifts because of
// soft deletes and FK cascades). Same FOR UPDATE row-lock pattern.
export async function withBrandQuota<T>(
  userId: string,
  tier: Tier,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const limits = usageLimits[tier] ?? usageLimits.free;
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select id from public.users where id = ${userId} for update`);

    if (limits.maxBrands !== -1) {
      // Wave 4.5: exclude soft-deleted brands from the cap so a user
      // who deletes their last brand can immediately create a new one
      // (instead of being blocked for 30 days until the purge cron).
      const row = firstRow<{ count: number }>(
        await tx.execute(sql`
          select count(*)::int as count
          from public.brands
          where user_id = ${userId}
            and deleted_at is null
        `),
      );
      const count = row?.count ?? 0;
      if (count >= limits.maxBrands) {
        throw new UsageLimitError(
          "brands",
          limits.maxBrands,
          `Brand limit reached — your ${tier} plan allows ${limits.maxBrands}. Delete an existing brand or upgrade for more.`,
        );
      }
    }

    return await work(tx);
  });
}
