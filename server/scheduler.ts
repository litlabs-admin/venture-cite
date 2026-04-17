import cron from "node-cron";
import { db } from "./db";
import { and, eq, gte, ne, isNull, lte, or } from "drizzle-orm";
import * as schema from "@shared/schema";
import { runBrandPrompts } from "./citationChecker";
import { generateSuggestedPrompts } from "./lib/suggestionGenerator";
import { storage } from "./storage";
import { sendWeeklyVisibilityReport, isEmailConfigured, type BrandReport } from "./emailService";

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
      and(
        eq(schema.users.weeklyReportEnabled, 1),
        gte(schema.users.updatedAt, thirtyDaysAgo),
      ),
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
        .where(eq(schema.brands.userId, user.id))
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
        const { totalChecks, totalCited, rankings } = await runBrandPrompts(brand.id, undefined, { triggeredBy: "cron" });

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
      console.error(`[scheduler] Failed report for user ${user.id}:`, err);
      skipped += 1;
    }
  }

  console.log(`[scheduler] Weekly report job done — sent ${sent}, skipped ${skipped}`);
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

  const daysSinceLast = (now.getTime() - brand.lastAutoCitationAt.getTime()) / (24 * 60 * 60 * 1000);

  switch (brand.autoCitationSchedule) {
    case "weekly": return daysSinceLast >= 6; // at least ~1 week
    case "biweekly": return daysSinceLast >= 13;
    case "monthly": return daysSinceLast >= 27;
    default: return false;
  }
}

async function runAutoCitationJob(): Promise<void> {
  console.log("[scheduler] auto-citation job starting...");

  // Fetch all brands that have auto-citation enabled (not "off")
  const scheduledBrands = await db
    .select()
    .from(schema.brands)
    .where(ne(schema.brands.autoCitationSchedule, "off"));

  let ranCount = 0;
  for (const brand of scheduledBrands) {
    if (!isBrandDueForCitation(brand)) continue;

    try {
      // Skip brands that never seeded tracked prompts — weekly cron should
      // not auto-create the initial 10; that's a user-initiated action.
      const tracked = await storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" });
      if (tracked.length === 0) {
        console.log(`[scheduler] brand ${brand.name} has no tracked prompts — skipping weekly run`);
        continue;
      }

      // Step 1: Re-check citations on the locked tracked set.
      await runBrandPrompts(brand.id, undefined, { triggeredBy: "cron" });

      // Step 2: Refresh suggestions for the user to review.
      const suggestionResult = await generateSuggestedPrompts(brand.id, { replaceExisting: true });
      if (suggestionResult.error) {
        console.warn(`[scheduler] suggestion refresh for ${brand.name} failed: ${suggestionResult.error}`);
      }

      // Step 3: Update lastAutoCitationAt
      await db
        .update(schema.brands)
        .set({ lastAutoCitationAt: new Date() })
        .where(eq(schema.brands.id, brand.id));

      ranCount += 1;
      console.log(`[scheduler] auto-citation done for brand ${brand.name}`);
    } catch (err) {
      console.error(`[scheduler] auto-citation failed for brand ${brand.id}:`, err);
    }
  }
  console.log(`[scheduler] auto-citation job complete — ${ranCount} brands checked`);
}

export function initScheduler(): void {
  // Auto-citation cron — always active, no RESEND_API_KEY needed.
  if (cron.validate(AUTO_CITATION_CRON)) {
    cron.schedule(AUTO_CITATION_CRON, () => {
      runAutoCitationJob().catch((err) => console.error("[scheduler] Auto-citation job crashed:", err));
    });
    console.log(`[scheduler] Auto-citation job scheduled (${AUTO_CITATION_CRON})`);
  }

  // Weekly email report — only if Resend is configured.
  if (!isEmailConfigured()) {
    console.log("[scheduler] RESEND_API_KEY not set — weekly email reports disabled");
    return;
  }
  if (!cron.validate(WEEKLY_CRON)) {
    console.error(`[scheduler] Invalid cron expression: ${WEEKLY_CRON}`);
    return;
  }
  cron.schedule(WEEKLY_CRON, () => {
    runWeeklyReportJob().catch((err) => console.error("[scheduler] Job crashed:", err));
  });
  console.log(`[scheduler] Weekly report job scheduled (${WEEKLY_CRON})`);
}
