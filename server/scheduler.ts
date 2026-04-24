import cron from "node-cron";
import { db } from "./db";
import { and, eq, gte, ne, isNull, isNotNull, lte, or } from "drizzle-orm";
import * as schema from "@shared/schema";
import { runBrandPrompts } from "./citationChecker";
import { generateSuggestedPrompts } from "./lib/suggestionGenerator";
import { storage } from "./storage";
import {
  sendWeeklyVisibilityReport,
  sendWeeklyDigest,
  isEmailConfigured,
  type BrandReport,
  type WeeklyDigestBrandBrief,
} from "./emailService";
import { discoverCompetitors } from "./lib/competitorDiscovery";
import { withAdvisoryLock, lockKeys } from "./lib/advisoryLock";
import { refreshScrapedFacts } from "./lib/factExtractor";
import { scanBrandMentions } from "./lib/mentionScanner";
import { scanBrandListicles } from "./lib/listicleScanner";
import { logger } from "./lib/logger";
import { Sentry } from "./instrument";
import { logSystemAudit } from "./lib/audit";
import { supabaseAdmin } from "./supabase";
import { tickActiveRuns, startRun } from "./lib/workflowEngine";

const WEEKLY_CRON = process.env.WEEKLY_REPORT_CRON || "0 8 * * 0";
const MAX_BRANDS_PER_USER = Number(process.env.WEEKLY_MAX_BRANDS_PER_USER || 3);

export async function runWeeklyReportJob(): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const eligibleUsers = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
    })
    .from(schema.users)
    .where(
      and(eq(schema.users.weeklyReportEnabled, 1), gte(schema.users.updatedAt, thirtyDaysAgo)),
    );

  for (const user of eligibleUsers) {
    if (!user.email) {
      skipped += 1;
      continue;
    }
    try {
      const userBrands = await db
        .select()
        .from(schema.brands)
        .where(and(eq(schema.brands.userId, user.id), isNull(schema.brands.deletedAt)))
        .limit(MAX_BRANDS_PER_USER);

      if (userBrands.length === 0) {
        skipped += 1;
        continue;
      }

      const brandReports: BrandReport[] = [];

      for (const brand of userBrands) {
        const storedPrompts = await storage.getBrandPromptsByBrandId(brand.id);
        if (storedPrompts.length === 0) {
          // No prompts generated yet for this brand — surface that in the report.
          brandReports.push({
            name: brand.name,
            totalChecks: 0,
            totalCited: 0,
            citationRate: 0,
            platformStats: [],
            topPrompts: [],
            needsSetup: true,
          });
          continue;
        }

        // Actually re-run the prompts against every platform this week.
        // Pass triggeredBy: "cron" so the run is tagged in citation_runs history.
        const { totalChecks, totalCited, rankings } = await runBrandPrompts(brand.id, undefined, {
          triggeredBy: "cron",
        });

        const platformMap = new Map<string, { cited: number; checks: number }>();
        for (const r of rankings) {
          const plat = r.aiPlatform;
          const entry = platformMap.get(plat) || { cited: 0, checks: 0 };
          entry.checks += 1;
          if (r.isCited) entry.cited += 1;
          platformMap.set(plat, entry);
        }

        const platformStats = Array.from(platformMap.entries()).map(([platform, s]) => ({
          platform,
          cited: s.cited,
          checks: s.checks,
        }));

        // Top 3 prompts by citation count across platforms.
        const promptScores = new Map<string, { prompt: string; cited: number; checks: number }>();
        for (const r of rankings) {
          const key = r.prompt;
          const entry = promptScores.get(key) || { prompt: r.prompt, cited: 0, checks: 0 };
          entry.checks += 1;
          if (r.isCited) entry.cited += 1;
          promptScores.set(key, entry);
        }
        const topPrompts = Array.from(promptScores.values())
          .sort((a, b) => b.cited - a.cited)
          .slice(0, 3);

        brandReports.push({
          name: brand.name,
          totalChecks,
          totalCited,
          citationRate: totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0,
          platformStats,
          topPrompts,
          needsSetup: false,
        });
      }

      const ok = await sendWeeklyVisibilityReport({
        userId: user.id,
        userEmail: user.email,
        firstName: user.firstName,
        brands: brandReports,
      });

      if (ok) {
        await db
          .update(schema.users)
          .set({ lastWeeklyReportSentAt: new Date() })
          .where(eq(schema.users.id, user.id));
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, "weekly report failed");
      Sentry.captureException(err, { tags: { source: "scheduler.weekly-report" } });
      skipped += 1;
    }
  }

  logger.info({ sent, skipped }, `weekly report job done — sent ${sent}, skipped ${skipped}`);
  return { sent, skipped };
}

// Per-brand auto-citation: runs daily at 6 AM UTC, checks each brand's
// individual schedule (off/weekly/biweekly/monthly) and preferred day.
// Re-runs the locked tracked-prompt set and refreshes suggestions.
const AUTO_CITATION_CRON = process.env.AUTO_CITATION_CRON || "0 6 * * *"; // daily check

function isBrandDueForCitation(brand: {
  autoCitationSchedule: string;
  autoCitationDay: number;
  lastAutoCitationAt: Date | null;
}): boolean {
  if (brand.autoCitationSchedule === "off") return false;

  const now = new Date();
  const todayDow = now.getUTCDay(); // 0=Sun ... 6=Sat

  // Only run on the user's chosen day of week
  if (todayDow !== brand.autoCitationDay) return false;

  if (!brand.lastAutoCitationAt) return true; // never run before

  const daysSinceLast =
    (now.getTime() - brand.lastAutoCitationAt.getTime()) / (24 * 60 * 60 * 1000);

  switch (brand.autoCitationSchedule) {
    case "weekly":
      return daysSinceLast >= 6; // at least ~1 week
    case "biweekly":
      return daysSinceLast >= 13;
    case "monthly":
      return daysSinceLast >= 27;
    default:
      return false;
  }
}

async function runAutoCitationJob(): Promise<void> {
  logger.info("auto-citation job starting");

  // Fetch all brands that have auto-citation enabled (not "off") and
  // are not soft-deleted (Wave 4.5).
  const scheduledBrands = await db
    .select()
    .from(schema.brands)
    .where(and(ne(schema.brands.autoCitationSchedule, "off"), isNull(schema.brands.deletedAt)));

  let ranCount = 0;
  for (const brand of scheduledBrands) {
    if (!isBrandDueForCitation(brand)) continue;

    try {
      // Skip brands that never seeded tracked prompts — weekly cron should
      // not auto-create the initial 10; that's a user-initiated action.
      const tracked = await storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" });
      if (tracked.length === 0) {
        logger.info(
          { brandId: brand.id, name: brand.name },
          "brand has no tracked prompts — skipping weekly run",
        );
        continue;
      }

      // Step 1: Re-check citations on the locked tracked set.
      await runBrandPrompts(brand.id, undefined, { triggeredBy: "cron" });

      // Step 2: Refresh suggestions for the user to review.
      const suggestionResult = await generateSuggestedPrompts(brand.id, { replaceExisting: true });
      if (suggestionResult.error) {
        logger.warn(
          { brandId: brand.id, name: brand.name, error: suggestionResult.error },
          "suggestion refresh failed",
        );
      }

      // Step 3: Update lastAutoCitationAt
      await db
        .update(schema.brands)
        .set({ lastAutoCitationAt: new Date() })
        .where(eq(schema.brands.id, brand.id));

      ranCount += 1;
      logger.info({ brandId: brand.id, name: brand.name }, "auto-citation done for brand");
    } catch (err) {
      logger.error({ err, brandId: brand.id }, "auto-citation failed for brand");
      Sentry.captureException(err, {
        tags: { source: "scheduler.auto-citation" },
        extra: { brandId: brand.id },
      });
    }
  }
  logger.info({ ranCount }, `auto-citation job complete — ${ranCount} brands checked`);
}

// Weekly automation crons. Each iterates every brand in serial with a
// try/catch per brand so one brand's failure doesn't stop the run.
const COMPETITOR_DISCOVERY_CRON = process.env.COMPETITOR_DISCOVERY_CRON || "0 7 * * 1"; // Monday 7 AM UTC
const MENTION_SCAN_CRON = process.env.MENTION_SCAN_CRON || "0 9 * * 1"; // Monday 9 AM UTC
const LISTICLE_SCAN_CRON = process.env.LISTICLE_SCAN_CRON || "0 11 * * 1"; // Monday 11 AM UTC
const FACT_REFRESH_CRON = process.env.FACT_REFRESH_CRON || "0 10 1 * *"; // 1st of month 10 AM UTC

async function runForEveryBrand(
  label: string,
  fn: (brandId: string) => Promise<number | void | { updated: number; checked: number }>,
): Promise<void> {
  logger.info({ job: label }, `${label} job starting`);
  // Skip soft-deleted brands (Wave 4.5) — no point spending LLM tokens
  // on a brand the user has scheduled for deletion.
  const brands = await db
    .select({ id: schema.brands.id, name: schema.brands.name })
    .from(schema.brands)
    .where(isNull(schema.brands.deletedAt));
  let ok = 0;
  for (const b of brands) {
    try {
      await fn(b.id);
      ok += 1;
    } catch (err) {
      logger.error({ err, job: label, brandId: b.id }, `${label} failed for brand`);
      Sentry.captureException(err, {
        tags: { source: `scheduler.${label}` },
        extra: { brandId: b.id },
      });
    }
  }
  logger.info(
    { job: label, ok, total: brands.length },
    `${label} job complete — ${ok}/${brands.length} brands processed`,
  );
}

// Each job body is wrapped in a pg advisory lock so overlapping scheduler
// instances (container-restart overlap, accidental HA) skip instead of
// double-running — which otherwise inflates competitor/snapshot counts
// and racks up LLM spend.
export async function runCompetitorDiscoveryJob(): Promise<void> {
  await withAdvisoryLock(lockKeys.competitorDiscovery, "competitor-discovery", () =>
    runForEveryBrand("competitor-discovery", (bid) => discoverCompetitors(bid)),
  );
}
export async function runMentionScanJob(): Promise<void> {
  await withAdvisoryLock(lockKeys.mentionScan, "mention-scan", () =>
    runForEveryBrand("mention-scan", (bid) => scanBrandMentions(bid)),
  );
}
export async function runListicleScanJob(): Promise<void> {
  await withAdvisoryLock(lockKeys.listicleScan, "listicle-scan", () =>
    runForEveryBrand("listicle-scan", async (bid) => {
      await scanBrandListicles(bid);
    }),
  );
}
export async function runFactRefreshJob(): Promise<void> {
  await withAdvisoryLock(lockKeys.factRefresh, "fact-refresh", () =>
    runForEveryBrand("fact-refresh", (bid) => refreshScrapedFacts(bid)),
  );
}

// Daily 03:00 UTC: hard-delete users whose 30-day grace window has
// elapsed. Cascade FKs from migrations/0003_fk_hardening.sql clean up
// brand-rooted data automatically; we still call Supabase admin to drop
// the auth row separately (Supabase auth.users is in a different schema
// than public.users so cascade doesn't reach it).
const ACCOUNT_PURGE_CRON = process.env.ACCOUNT_PURGE_CRON || "0 3 * * *";

export async function runAccountPurgeJob(): Promise<{ purged: number; failed: number }> {
  const now = new Date();
  const due = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(
      and(
        // Both columns set together by the deletion endpoint, but check
        // both anyway so a stray manual update doesn't trip us.
        isNotNull(schema.users.deletedAt),
        lte(schema.users.deletionScheduledFor, now),
      ),
    );

  let purged = 0;
  let failed = 0;
  for (const user of due) {
    try {
      // Drop the Supabase auth row first. If this fails we keep the
      // public.users row so the next cron tick retries — better than a
      // partial-purge state where the app row is gone but the user can
      // still sign in.
      const { error: supaErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (supaErr && !/not\s*found/i.test(supaErr.message)) {
        throw new Error(`supabase auth deleteUser: ${supaErr.message}`);
      }

      await db.delete(schema.users).where(eq(schema.users.id, user.id));

      await logSystemAudit(null, {
        action: "user.delete.completed",
        entityType: "user",
        entityId: user.id,
        before: { email: user.email, deletionScheduledFor: now.toISOString() },
      });
      logger.info({ userId: user.id }, "user.purge: hard-deleted after grace");
      purged += 1;
    } catch (err) {
      logger.error({ err, userId: user.id }, "user.purge failed");
      Sentry.captureException(err, {
        tags: { source: "scheduler.account-purge" },
        extra: { userId: user.id },
      });
      failed += 1;
    }
  }
  if (due.length > 0) {
    logger.info({ purged, failed, total: due.length }, "account purge job complete");
  }
  return { purged, failed };
}

// Wave 4.5: hard-delete brands whose 30-day soft-delete window has
// elapsed. Cascade FKs from migrations/0003_fk_hardening.sql clean up
// brand-rooted data automatically. Scheduled at 03:30 UTC, half an
// hour after account purge so they don't run concurrently.
const BRAND_PURGE_CRON = process.env.BRAND_PURGE_CRON || "30 3 * * *";

export async function runBrandPurgeJob(): Promise<{ purged: number; failed: number }> {
  const now = new Date();
  const due = await db
    .select({ id: schema.brands.id, name: schema.brands.name, userId: schema.brands.userId })
    .from(schema.brands)
    .where(and(isNotNull(schema.brands.deletedAt), lte(schema.brands.deletionScheduledFor, now)));

  let purged = 0;
  let failed = 0;
  for (const brand of due) {
    try {
      // Drafts have no FK cascade — clean them up explicitly first.
      // (Same pattern as the soft-delete handler in routes.ts pre-Wave 4.5.)
      await storage.deleteContentDraftsByBrandId(brand.id);
      await db.delete(schema.brands).where(eq(schema.brands.id, brand.id));

      await logSystemAudit(brand.userId ?? null, {
        action: "brand.delete.completed",
        entityType: "brand",
        entityId: brand.id,
        before: { name: brand.name, deletionScheduledFor: now.toISOString() },
      });
      logger.info({ brandId: brand.id }, "brand.purge: hard-deleted after grace");
      purged += 1;
    } catch (err) {
      logger.error({ err, brandId: brand.id }, "brand.purge failed");
      Sentry.captureException(err, {
        tags: { source: "scheduler.brand-purge" },
        extra: { brandId: brand.id },
      });
      failed += 1;
    }
  }
  if (due.length > 0) {
    logger.info({ purged, failed, total: due.length }, "brand purge job complete");
  }
  return { purged, failed };
}

// Kicks off one `weekly_catchup` workflow run per eligible brand. The
// users table has `weeklyReportEnabled` (the column is the weekly-digest
// opt-in proxy — a dedicated `weeklyDigest` column does not exist). If
// that behavior ever diverges, add a distinct column + filter here.
// Iterate USERS (not brands) so the digest is per-user, and guard against
// firing a second weekly_catchup for a brand that still has a non-terminal
// run from a prior kickoff.
export async function runWeeklyCatchupKickoff(): Promise<{
  started: number;
  skipped: number;
  failed: number;
}> {
  let started = 0;
  let skipped = 0;
  let failed = 0;

  const eligibleUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.weeklyReportEnabled, 1), isNull(schema.users.deletedAt)));

  for (const u of eligibleUsers) {
    const userBrands = await db
      .select({ id: schema.brands.id })
      .from(schema.brands)
      .where(and(eq(schema.brands.userId, u.id), isNull(schema.brands.deletedAt)));

    for (const b of userBrands) {
      try {
        // Skip if a non-terminal weekly_catchup run already exists for this brand.
        const existing = await db
          .select({ id: schema.workflowRuns.id, status: schema.workflowRuns.status })
          .from(schema.workflowRuns)
          .where(
            and(
              eq(schema.workflowRuns.brandId, b.id),
              eq(schema.workflowRuns.workflowKey, "weekly_catchup"),
            ),
          );
        const hasActive = existing.some(
          (r) =>
            r.status === "pending" || r.status === "running" || r.status === "awaiting_approval",
        );
        if (hasActive) {
          skipped += 1;
          logger.info(
            { brandId: b.id, userId: u.id },
            "weekly_catchup skipped — existing non-terminal run",
          );
          continue;
        }
        await startRun("weekly_catchup", b.id, u.id, {}, "cron");
        started += 1;
      } catch (err) {
        failed += 1;
        logger.error({ err, brandId: b.id, userId: u.id }, "weekly_catchup startRun failed");
      }
    }
  }
  logger.info(
    { started, skipped, failed, users: eligibleUsers.length },
    "weekly catchup kickoff complete",
  );
  return { started, skipped, failed };
}

// Aggregator: runs every 5 minutes. For each user whose every brand's most
// recent weekly_catchup run (since last digest send) has reached terminal
// status, send ONE combined digest email and stamp lastWeeklyReportSentAt.
// This replaces per-brand email sends from inside the workflow.
export async function runWeeklyDigestAggregator(): Promise<{ sent: number; pending: number }> {
  let sent = 0;
  let pending = 0;

  if (!isEmailConfigured()) return { sent, pending };

  const eligibleUsers = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastWeeklyReportSentAt: schema.users.lastWeeklyReportSentAt,
    })
    .from(schema.users)
    .where(and(eq(schema.users.weeklyReportEnabled, 1), isNull(schema.users.deletedAt)));

  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000); // look back ~last day

  for (const user of eligibleUsers) {
    if (!user.email) continue;
    // Dedup: if we sent in the past 6 days, skip.
    if (
      user.lastWeeklyReportSentAt &&
      Date.now() - new Date(user.lastWeeklyReportSentAt).getTime() < 6 * 24 * 60 * 60 * 1000
    ) {
      continue;
    }

    const userBrands = await db
      .select({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands)
      .where(and(eq(schema.brands.userId, user.id), isNull(schema.brands.deletedAt)));

    if (userBrands.length === 0) continue;

    // Fetch the latest weekly_catchup run per brand since the cutoff.
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
        // No kickoff yet for this brand — treat as "still pending" so we
        // don't send a partial digest that omits a brand.
        allTerminal = false;
        continue;
      }
      sawAnyRun = true;
      // Pick most recent
      runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const latest = runs[0];
      const terminal =
        latest.status === "completed" ||
        latest.status === "failed" ||
        latest.status === "cancelled";
      if (!terminal) {
        allTerminal = false;
        continue;
      }

      // Extract compose_digest output from stepStates for this run.
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
        delta:
          compose?.delta === null || compose?.delta === undefined ? null : Number(compose.delta),
        newlyLost: Array.isArray(delta?.newlyLost) ? (delta!.newlyLost as string[]) : [],
        newlyWon: Array.isArray(delta?.newlyWon) ? (delta!.newlyWon as string[]) : [],
        hallucinationCount: Number(compose?.hallucinationCount ?? 0),
        topInsight: String(compose?.topInsight ?? ""),
        firstRun: Boolean(compose?.firstRun),
      });
    }

    if (!sawAnyRun || !allTerminal) {
      pending += 1;
      continue;
    }

    try {
      const ok = await sendWeeklyDigest(user.email, {
        user: { id: user.id, email: user.email, firstName: user.firstName ?? null },
        brandBriefs: briefs,
      });
      if (ok) {
        await db
          .update(schema.users)
          .set({ lastWeeklyReportSentAt: new Date() })
          .where(eq(schema.users.id, user.id));
        sent += 1;
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, "weekly digest aggregator send failed");
      Sentry.captureException(err, { tags: { source: "scheduler.weekly-digest-agg" } });
    }
  }

  if (sent > 0 || pending > 0) {
    logger.info({ sent, pending }, "weekly digest aggregator tick");
  }
  return { sent, pending };
}

// Wraps a cron callback so any crash is reported to logger + Sentry without
// silencing it. Pino logs the error; Sentry captures with the cron tag.
function cronCrashGuard(jobName: string, fn: () => Promise<unknown>): () => void {
  return () => {
    fn().catch((err) => {
      logger.error({ err, job: jobName }, `${jobName} cron crashed`);
      Sentry.captureException(err, { tags: { source: `scheduler.${jobName}` } });
    });
  };
}

export function initScheduler(): void {
  // Daily account purge for users whose 30-day deletion grace has elapsed.
  if (cron.validate(ACCOUNT_PURGE_CRON)) {
    cron.schedule(ACCOUNT_PURGE_CRON, cronCrashGuard("account-purge", runAccountPurgeJob));
    logger.info({ cron: ACCOUNT_PURGE_CRON }, "account purge job scheduled");
  }

  // Daily brand purge for brands whose 30-day soft-delete window has elapsed.
  if (cron.validate(BRAND_PURGE_CRON)) {
    cron.schedule(BRAND_PURGE_CRON, cronCrashGuard("brand-purge", runBrandPurgeJob));
    logger.info({ cron: BRAND_PURGE_CRON }, "brand purge job scheduled");
  }

  // Auto-citation cron — always active, no RESEND_API_KEY needed.
  if (cron.validate(AUTO_CITATION_CRON)) {
    cron.schedule(AUTO_CITATION_CRON, cronCrashGuard("auto-citation", runAutoCitationJob));
    logger.info({ cron: AUTO_CITATION_CRON }, "auto-citation job scheduled");
  }

  // Phase 2 automation crons — run independent of email config.
  if (cron.validate(COMPETITOR_DISCOVERY_CRON)) {
    cron.schedule(
      COMPETITOR_DISCOVERY_CRON,
      cronCrashGuard("competitor-discovery", runCompetitorDiscoveryJob),
    );
    logger.info({ cron: COMPETITOR_DISCOVERY_CRON }, "competitor discovery scheduled");
  }
  if (cron.validate(MENTION_SCAN_CRON)) {
    cron.schedule(MENTION_SCAN_CRON, cronCrashGuard("mention-scan", runMentionScanJob));
    logger.info({ cron: MENTION_SCAN_CRON }, "mention scan scheduled");
  }
  if (cron.validate(LISTICLE_SCAN_CRON)) {
    cron.schedule(LISTICLE_SCAN_CRON, cronCrashGuard("listicle-scan", runListicleScanJob));
    logger.info({ cron: LISTICLE_SCAN_CRON }, "listicle scan scheduled");
  }
  if (cron.validate(FACT_REFRESH_CRON)) {
    cron.schedule(FACT_REFRESH_CRON, cronCrashGuard("fact-refresh", runFactRefreshJob));
    logger.info({ cron: FACT_REFRESH_CRON }, "fact refresh scheduled");
  }

  // Workflow tick — every 30 seconds, advance any pending/running runs.
  const WORKFLOW_TICK_CRON = process.env.WORKFLOW_TICK_CRON || "*/30 * * * * *";
  if (cron.validate(WORKFLOW_TICK_CRON)) {
    cron.schedule(WORKFLOW_TICK_CRON, cronCrashGuard("workflow-tick", tickActiveRuns));
    logger.info({ cron: WORKFLOW_TICK_CRON }, "workflow tick scheduled");
  }

  // Weekly catch-up workflow kickoff — Monday 06:00 UTC. Independent of
  // the weekly-report Resend gate below: the workflow's digest-send step
  // checks email config internally. The 30s workflow-tick drives the
  // actual execution of each run it enqueues.
  const WEEKLY_CATCHUP_CRON = process.env.WEEKLY_CATCHUP_CRON || "0 6 * * 1";
  if (cron.validate(WEEKLY_CATCHUP_CRON)) {
    cron.schedule(
      WEEKLY_CATCHUP_CRON,
      cronCrashGuard("weekly-catchup-kickoff", runWeeklyCatchupKickoff),
    );
    logger.info({ cron: WEEKLY_CATCHUP_CRON }, "weekly catchup kickoff scheduled");
  }

  // Weekly digest aggregator — every 5 minutes. When all of a user's
  // per-brand weekly_catchup runs are terminal, send ONE combined digest.
  const WEEKLY_DIGEST_AGG_CRON = process.env.WEEKLY_DIGEST_AGG_CRON || "*/5 * * * *";
  if (cron.validate(WEEKLY_DIGEST_AGG_CRON)) {
    cron.schedule(
      WEEKLY_DIGEST_AGG_CRON,
      cronCrashGuard("weekly-digest-aggregator", runWeeklyDigestAggregator),
    );
    logger.info({ cron: WEEKLY_DIGEST_AGG_CRON }, "weekly digest aggregator scheduled");
  }

  // Weekly email report — only if Resend is configured.
  if (!isEmailConfigured()) {
    logger.info("RESEND_API_KEY not set — weekly email reports disabled");
    return;
  }
  if (!cron.validate(WEEKLY_CRON)) {
    logger.error({ cron: WEEKLY_CRON }, "invalid cron expression for weekly report");
    return;
  }
  cron.schedule(WEEKLY_CRON, cronCrashGuard("weekly-report", runWeeklyReportJob));
  logger.info({ cron: WEEKLY_CRON }, "weekly report job scheduled");
}
