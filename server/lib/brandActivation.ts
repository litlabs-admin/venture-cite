// Brand activation - the producers that fill the dashboard panels the
// citation run does not.
//
// WHY THIS EXISTS. The onboarding autopilot builds the fact sheet, discovers
// competitors, generates prompts and runs citations. That covers most of the
// dashboard. Four panels had no producer on that path at all:
//
//   Mentions / tone   brand_mentions, scan_jobs   Monday-gated cron only
//   Listicles         listicles                   Monday-gated cron only
//   Perception        brand_perception_runs       ONE button on /perception
//   Site health       (no table - see below)      computed per request, never warmed
//
// So a freshly onboarded brand showed dashes across a third of the dashboard
// until the following Monday, and Perception stayed empty forever unless the
// user found another page and clicked a button. This module is the single
// path that populates all four, called from two places: the end of onboarding
// (so a new brand is complete on first load) and the weekly cron sweep.
//
// SCHEDULING. Weekly per brand, anchored on that brand's own rhythm rather
// than a global Monday: the first pass happens at onboarding, and each
// sub-job is due again 7 days after it last ran. Brands created on a Tuesday
// therefore refresh on Tuesdays, load spreads naturally across the week, and
// a missed week self-heals on the next tick instead of waiting for Monday.
//
// The "when did this last run" ledger lives in system_state, one JSON row per
// brand, rather than five new columns on `brands`. ponytail: no migration for
// what is a scheduling detail, and it keeps every sub-job's bookkeeping in one
// read and one write.

import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "./logger";
import { PAYING_TIERS } from "@shared/schema";
import { captureAndFlush } from "./sentryReport";
import { discoverCompetitors } from "./competitorDiscovery";
import { scanBrandListicles } from "./listicleScanner";
import { runMentionScan } from "./runMentionScan";
import { runPerceptionScoring } from "./perceptionRun";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Ordered cheapest-first so a tight deadline still buys the panels that cost
// nothing in LLM spend. Site health is network-only; the mention and listicle
// scans and perception scoring each spend model calls.
const JOBS = ["siteHealth", "mentionScan", "listicleScan", "perception", "competitors"] as const;
type JobName = (typeof JOBS)[number];

type Ledger = Partial<Record<JobName, string>>;

const ledgerKey = (brandId: string) => `brand_jobs:${brandId}`;

async function readLedger(brandId: string): Promise<Ledger> {
  try {
    const raw = await storage.getSystemState(ledgerKey(brandId));
    return raw && typeof raw === "object" ? (raw as Ledger) : {};
  } catch (err) {
    // A ledger we cannot read is treated as empty, which re-runs the week's
    // work once. That is the safe direction: the alternative is a brand that
    // silently stops refreshing.
    logger.warn({ err, brandId }, "brandActivation: ledger read failed");
    return {};
  }
}

function isDue(ledger: Ledger, job: JobName): boolean {
  const last = ledger[job];
  if (!last) return true; // never run
  const at = new Date(last).getTime();
  if (!Number.isFinite(at)) return true; // corrupt stamp - treat as never run
  return Date.now() - at >= WEEK_MS;
}

/**
 * Populate every dashboard panel the citation run does not cover.
 *
 * Each sub-job is independently gated, so a call that ran out of budget last
 * tick picks up exactly where it stopped. Nothing here throws: one brand's
 * failing scan must not abort the sweep, and the caller (onboarding) must not
 * fail a user's activation because a third-party site was down.
 *
 * Returns the jobs that actually ran, for logging.
 */
export async function populateBrandDashboard(
  brandId: string,
  options: { deadlineMs?: number } = {},
): Promise<{ ran: JobName[]; skipped: JobName[] }> {
  const ran: JobName[] = [];
  const skipped: JobName[] = [];

  const brand = await storage.getBrandById(brandId);
  if (!brand) {
    logger.warn({ brandId }, "brandActivation: brand not found");
    return { ran, skipped };
  }

  const ledger = await readLedger(brandId);

  for (const job of JOBS) {
    if (!isDue(ledger, job)) continue;
    if (options.deadlineMs !== undefined && Date.now() > options.deadlineMs) {
      // Out of budget. Leave the ledger untouched so this job is still due on
      // the next tick.
      skipped.push(job);
      continue;
    }

    try {
      await runJob(job, brand);
      ran.push(job);
    } catch (err) {
      // Stamp anyway - see below. Logged and reported, never rethrown.
      logger.error({ err, brandId, job }, "brandActivation: job failed");
      captureAndFlush(err, { tags: { source: "brand-activation" }, extra: { brandId, job } });
    }

    // Stamped on ATTEMPT, not on success. A brand whose site is permanently
    // unreachable, or whose scan throws every time, would otherwise be retried
    // on every hourly tick for a week - spending model calls each time on work
    // that is failing for a reason an hour will not change. Stamping gives
    // failures the same weekly backoff as successes.
    ledger[job] = new Date().toISOString();
    try {
      await storage.setSystemState(ledgerKey(brandId), ledger);
    } catch (err) {
      logger.warn({ err, brandId, job }, "brandActivation: ledger write failed");
    }
  }

  if (ran.length || skipped.length) {
    logger.info({ brandId, ran, skipped }, "brandActivation: pass complete");
  }
  return { ran, skipped };
}

async function runJob(
  job: JobName,
  brand: { id: string; name: string; website: string | null; userId: string | null },
): Promise<void> {
  switch (job) {
    case "siteHealth": {
      // Deferred import, matching the orchestrator's own convention for its
      // heavier steps. warmSiteHealth lives in routes/dashboard.ts alongside
      // the computation it shares, so a static import here would pull the
      // whole HTTP route module into the scheduler's and the cron's import
      // graphs - a lib depending on a route module, and a meaningful amount of
      // boot work for a job that usually has nothing to do. Resolve it only
      // when the job is actually due.
      const { warmSiteHealth } = await import("../routes/dashboard");
      await warmSiteHealth(brand.id, brand.website);
      return;
    }

    case "mentionScan": {
      // Mirrors what the cron scheduler does: a scan_jobs row is the unit of
      // work, and runMentionScan drives it to a terminal state. The dashboard
      // reads that row to tell "scanned, found nothing" apart from "never
      // scanned", so the job row matters as much as the mentions it finds.
      if (!brand.userId) return;
      const scan = await storage.createScanJob({
        brandId: brand.id,
        userId: brand.userId,
        trigger: "cron",
      });
      await runMentionScan(scan.id);
      return;
    }

    case "listicleScan":
      await scanBrandListicles(brand.id);
      return;

    case "perception":
      // Resolves null when there is no cited context to judge yet - a brand
      // whose first citation run found nothing. Not an error; the panel stays
      // empty and the next weekly pass tries again.
      await runPerceptionScoring(brand);
      return;

    case "competitors":
      await discoverCompetitors(brand.id);
      return;
  }
}

/**
 * Weekly sweep across every live brand.
 *
 * Ordered by created_at so the queue is stable between ticks: when the
 * deadline cuts a pass short, the next tick walks the same order and the
 * brands that already ran are skipped by their own ledger, so the tail
 * advances instead of the head being re-processed forever.
 */
export async function runBrandActivationSweep(
  deadlineMs?: number,
): Promise<{ processed: number; total: number }> {
  // Only brands whose owner is actually entitled to work that costs money.
  //
  // Read-only accounts (a cancelled trial, a subscription that failed) keep
  // their data visible, and that is the whole bargain: visible, but frozen. A
  // weekly citation run across four AI engines plus the activation sweep is
  // real spend, every week, forever - running it for accounts paying nothing
  // would make "downgrade instead of lock out" quietly expensive.
  //
  // PAYING_TIERS is the single list; unknown or pending tiers are excluded by
  // omission, which fails closed.
  const brands = await db.execute<{ id: string }>(sql`
    SELECT b.id
    FROM brands b
    JOIN users u ON u.id = b.user_id
    WHERE b.deleted_at IS NULL
      AND u.access_tier = ANY(${PAYING_TIERS})
    ORDER BY b.created_at ASC
  `);
  const list = (brands as { rows?: Array<{ id: string }> }).rows ?? [];

  let processed = 0;
  for (const b of list) {
    if (deadlineMs !== undefined && Date.now() > deadlineMs) {
      logger.info(
        { processed, total: list.length },
        "brandActivation: deadline hit - remaining brands deferred to the next tick",
      );
      break;
    }
    processed += 1;
    // populateBrandDashboard already swallows per-brand failures.
    await populateBrandDashboard(b.id, { deadlineMs });
  }

  logger.info({ processed, total: list.length }, "brandActivation: sweep complete");
  return { processed, total: list.length };
}
