import { storage } from "../storage";
import { logger } from "./logger";

/**
 * Phase 8 — "automate around weekly".
 *
 * Runs at the end of every citation run (manual AND cron), AFTER
 * recordCurrentMetrics + hallucination detection. It diffs this run's
 * just-written metrics_history snapshots against the prior run's and
 * persists a row per material regression into `alert_history`. Those rows
 * are read by:
 *   - the Command Center "What changed" widget (GET /api/brands/:id/alerts)
 *   - the weekly digest body (weeklyDigestEmitter accumulates them)
 *
 * Everything here is best-effort: the only caller wraps it in try/catch and
 * a failure must never revert the rankings the run already saved.
 */

const VISIBILITY_DROP_PTS = 10;

type ByPrompt = { promptId: string; cited: number; checks: number };

export type RunChangeAlert = {
  alertType: "visibility_drop" | "prompts_lost" | "new_hallucinations";
  message: string;
  details: Record<string, unknown>;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function byPromptOf(snapshot: { metricDetails?: unknown } | undefined): Map<string, ByPrompt> {
  const details = (snapshot?.metricDetails as Record<string, unknown> | undefined) ?? {};
  const list = (details.byPrompt as ByPrompt[] | undefined) ?? [];
  const map = new Map<string, ByPrompt>();
  for (const p of list) {
    if (p && typeof p.promptId === "string") map.set(p.promptId, p);
  }
  return map;
}

/**
 * Pure-ish detector: reads snapshots only, no writes. Returns [] when there
 * is no prior run to compare against (first run / insufficient history).
 */
export async function detectRunChangeAlerts(brandId: string): Promise<RunChangeAlert[]> {
  const alerts: RunChangeAlert[] = [];

  // visibility_score: last = this run (written by recordCurrentMetrics in the
  // same finalize block), second-to-last = prior run. Mirrors the prior-index
  // convention in workflows/weeklyCatchup.ts.
  const vis = await storage.getMetricsHistory(brandId, "visibility_score", 30);
  if (vis.length < 2) return alerts;

  const current = vis[vis.length - 1];
  const prior = vis[vis.length - 2];

  const currentScore = num(current.metricValue);
  const priorScore = num(prior.metricValue);
  if (currentScore !== null && priorScore !== null) {
    const delta = Math.round(currentScore - priorScore);
    if (delta <= -VISIBILITY_DROP_PTS) {
      alerts.push({
        alertType: "visibility_drop",
        message: `Visibility dropped ${Math.abs(delta)} pts (from ${Math.round(
          priorScore,
        )}% to ${Math.round(currentScore)}%) since the last run.`,
        details: {
          priorScore: Math.round(priorScore),
          currentScore: Math.round(currentScore),
          delta,
          nextLabel: "Review citations",
          nextHref: "/monitor?tab=citations",
        },
      });
    }
  }

  // Prompts that were cited last run and are not cited now.
  const priorBy = byPromptOf(prior);
  const currentBy = byPromptOf(current);
  const lost: string[] = [];
  for (const [promptId, cur] of Array.from(currentBy.entries())) {
    const was = priorBy.get(promptId);
    if (was && was.cited > 0 && cur.cited === 0) lost.push(promptId);
  }
  if (lost.length > 0) {
    alerts.push({
      alertType: "prompts_lost",
      message: `${lost.length} prompt${
        lost.length === 1 ? " is" : "s are"
      } no longer cited since the last run.`,
      details: {
        promptIds: lost,
        count: lost.length,
        nextLabel: "Generate content for gaps",
        nextHref: "/act?tab=create",
      },
    });
  }

  // New unresolved hallucinations from THIS run. recordCurrentMetrics wrote
  // the "hallucinations" snapshot BEFORE detectHallucinationsForRun ran, so
  // (live unresolved count) − (this-run snapshot) is exactly what this run
  // newly flagged.
  try {
    const hHist = await storage.getMetricsHistory(brandId, "hallucinations", 30);
    const thisRunSnapshot = hHist.length > 0 ? num(hHist[hHist.length - 1].metricValue) : null;
    if (thisRunSnapshot !== null) {
      const open = await storage.getBrandHallucinations(brandId, { isResolved: false });
      const liveUnresolved = Array.isArray(open) ? open.length : 0;
      const added = liveUnresolved - thisRunSnapshot;
      if (added > 0) {
        alerts.push({
          alertType: "new_hallucinations",
          message: `${added} new unresolved hallucination${
            added === 1 ? "" : "s"
          } detected this run (${liveUnresolved} open total).`,
          details: {
            added,
            openTotal: liveUnresolved,
            nextLabel: "Review hallucinations",
            nextHref: "/diagnose?tab=hallucinations",
          },
        });
      }
    }
  } catch (err) {
    logger.warn({ err, brandId }, "[runChangeAlerts] hallucination delta check failed");
  }

  return alerts;
}

/**
 * Detect + persist. Each alert becomes one `alert_history` row
 * (sentVia="in_app" — not an email/slack send, an in-product change record).
 * Returns the alerts so the caller / digest can reuse them without re-query.
 */
export async function recordRunChangeAlerts(brandId: string): Promise<RunChangeAlert[]> {
  const alerts = await detectRunChangeAlerts(brandId);
  for (const a of alerts) {
    try {
      await storage.createAlertHistory({
        brandId,
        alertType: a.alertType,
        message: a.message,
        details: a.details,
        sentVia: "in_app",
      } as any);
    } catch (err) {
      logger.warn(
        { err, brandId, alertType: a.alertType },
        "[runChangeAlerts] persist alert_history failed",
      );
    }
  }
  if (alerts.length > 0) {
    logger.info({ brandId, count: alerts.length }, "[runChangeAlerts] recorded run-change alerts");
  }
  return alerts;
}
