import { db } from "../db";
import { and, eq, gte, isNull } from "drizzle-orm";
import * as schema from "@shared/schema";
import { sendWeeklyDigest, isEmailConfigured, type WeeklyDigestBrandBrief } from "../emailService";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
const LOOKBACK_MS = 25 * 60 * 60 * 1000;

export type DigestEmitResult =
  | { sent: true }
  | {
      sent: false;
      reason:
        | "email_disabled"
        | "user_missing"
        | "no_email"
        | "deduped"
        | "no_brands"
        | "still_pending"
        | "no_runs"
        | "send_failed";
    };

// Check whether all of a user's most-recent weekly_catchup runs have
// reached terminal status, and if so, send ONE combined digest. Idempotent
// via the 6-day cooldown stamped onto users.lastWeeklyReportSentAt.
//
// Called from two places:
//   - server/scheduler.ts runWeeklyDigestAggregator (legacy 5-min cron;
//     dropped from boot in the Vercel migration but the function remains
//     callable from the daily orchestrator if desired).
//   - server/lib/workflowEngine.ts advanceRun, when a weekly_catchup run
//     transitions to a terminal state (lazy-eval replacement for the cron).
export async function tryEmitWeeklyDigestForUser(userId: string): Promise<DigestEmitResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "email_disabled" };

  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastWeeklyReportSentAt: schema.users.lastWeeklyReportSentAt,
      weeklyReportEnabled: schema.users.weeklyReportEnabled,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) return { sent: false, reason: "user_missing" };
  if (user.deletedAt) return { sent: false, reason: "user_missing" };
  if (user.weeklyReportEnabled !== 1) return { sent: false, reason: "deduped" };
  if (!user.email) return { sent: false, reason: "no_email" };

  if (
    user.lastWeeklyReportSentAt &&
    Date.now() - new Date(user.lastWeeklyReportSentAt).getTime() < SIX_DAYS_MS
  ) {
    return { sent: false, reason: "deduped" };
  }

  const userBrands = await db
    .select({
      id: schema.brands.id,
      name: schema.brands.name,
      createdAt: schema.brands.createdAt,
    })
    .from(schema.brands)
    .where(and(eq(schema.brands.userId, user.id), isNull(schema.brands.deletedAt)));

  if (userBrands.length === 0) return { sent: false, reason: "no_brands" };

  const cutoff = new Date(Date.now() - LOOKBACK_MS);

  const briefs: WeeklyDigestBrandBrief[] = [];
  let allTerminal = true;
  let sawAnyRun = false;

  for (const b of userBrands) {
    const runs = await db
      .select()
      .from(schema.workflowRuns)
      .where(
        and(
          eq(schema.workflowRuns.brandId, b.id),
          eq(schema.workflowRuns.workflowKey, "weekly_catchup"),
          gte(schema.workflowRuns.createdAt, cutoff),
        ),
      );
    if (runs.length === 0) {
      allTerminal = false;
      continue;
    }
    sawAnyRun = true;
    runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const latest = runs[0];
    const terminal =
      latest.status === "completed" || latest.status === "failed" || latest.status === "cancelled";
    if (!terminal) {
      allTerminal = false;
      continue;
    }

    const states =
      (latest.stepStates as unknown as Array<{
        key: string;
        status: string;
        output?: unknown;
      }> | null) ?? [];
    const compose = states.find((s) => s.key === "compose_digest")?.output as
      | Record<string, unknown>
      | undefined;
    const delta = states.find((s) => s.key === "delta_calc")?.output as
      | Record<string, unknown>
      | undefined;

    briefs.push({
      brandName: String(compose?.brandName ?? b.name),
      currentScore: Number(compose?.currentScore ?? 0),
      delta: compose?.delta === null || compose?.delta === undefined ? null : Number(compose.delta),
      newlyLost: Array.isArray(delta?.newlyLost) ? (delta!.newlyLost as string[]) : [],
      newlyWon: Array.isArray(delta?.newlyWon) ? (delta!.newlyWon as string[]) : [],
      hallucinationCount: Number(compose?.hallucinationCount ?? 0),
      topInsight: String(compose?.topInsight ?? ""),
      firstRun: Boolean(compose?.firstRun),
    });
  }

  if (!sawAnyRun) return { sent: false, reason: "no_runs" };
  if (!allTerminal) return { sent: false, reason: "still_pending" };

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  let weekN: number | null = null;
  if (userBrands.length > 0) {
    const oldestMs = userBrands.reduce<number>((min, b) => {
      const t = b.createdAt ? new Date(b.createdAt as unknown as string).getTime() : Date.now();
      return t < min ? t : min;
    }, Number.POSITIVE_INFINITY);
    if (Number.isFinite(oldestMs)) {
      weekN = Math.max(0, Math.floor((Date.now() - oldestMs) / MS_PER_WEEK));
    }
  }

  try {
    const ok = await sendWeeklyDigest(user.email, {
      user: { id: user.id, email: user.email, firstName: user.firstName ?? null },
      brandBriefs: briefs,
      weekN,
    });
    if (ok) {
      await db
        .update(schema.users)
        .set({ lastWeeklyReportSentAt: new Date() })
        .where(eq(schema.users.id, user.id));
      return { sent: true };
    }
    return { sent: false, reason: "send_failed" };
  } catch (err) {
    logger.error({ err, userId: user.id }, "weekly digest emit failed");
    captureAndFlush(err, { tags: { source: "weeklyDigestEmitter" } });
    return { sent: false, reason: "send_failed" };
  }
}
