// Cron orchestrator maintenance-sweep steps, extracted verbatim from
// server/routes/cron.ts as part of the B7 service-layer split.
//
// Each function here is one orchestrator step's worker: it reaps or drains
// whatever browser-driven work lost its tab (a closed browser mid content
// job, mid citation run, mid perception probe run) or stalled outright
// (a content_generation_job or mention-scan job wedged mid-run). The
// orchestrator itself - Orchestrator class, STEP_CAPS_MS, and the
// `orch.run("step-name", ...)` call sites - stays in server/routes/cron.ts;
// tests/unit/schedulerOrchestratorParity.test.ts reads that file's source
// text directly and requires those literal call sites to remain there.

import { logger } from "../lib/logger";
import { storage } from "../storage";
import { runArticleSlice } from "../contentGenerationWorker";
import { refundArticleQuota } from "../lib/usageLimit";
import { advanceCitationRun } from "../citationChecker";
import { advancePerceptionProbeRun } from "../lib/perceptionProbes";
import { db } from "../db";
import * as schema from "@shared/schema";
import { and, inArray, lt } from "drizzle-orm";

// Drain pending content_generation_jobs whose /advance lock has expired.
// Runs ONE slice for the oldest available job per cron tick - multiple
// jobs in serial would blow the budget and the next cron tick picks up
// any remaining stragglers.
export async function drainPendingContentJobs(
  deadlineMs: number,
): Promise<{ progressed: number; completed: number }> {
  const jobs = await storage.listAdvanceablePendingJobs(1);
  let progressed = 0;
  let completed = 0;
  for (const j of jobs) {
    if (Date.now() >= deadlineMs - 500) break;
    try {
      const claimed = await storage.claimContentJobForSlice(j.id, 30);
      if (!claimed) continue;
      const sliceDeadline = Math.min(deadlineMs - 500, Date.now() + 7000);
      const outcome = await runArticleSlice(j.id, sliceDeadline, claimed.advanceToken);
      progressed += 1;
      if (outcome.done && outcome.status === "succeeded") completed += 1;
    } catch (err) {
      logger.warn({ err, jobId: j.id }, "cron: drain content job slice failed");
    }
  }
  return { progressed, completed };
}

// Drain in-progress citation runs that no longer have a browser polling
// /advance. Picks the oldest still-active run with a stale started_at and
// drives one slice. Bounded to a single run per cron tick.
export async function drainPendingCitationRuns(
  deadlineMs: number,
): Promise<{ progressed: boolean; runId?: string; status?: string }> {
  // citation_runs has no updated_at column, but startedAt is set on
  // creation. Anything still active 30s after startedAt is a candidate
  // for the drain step (typical full sweep is ~30-60s; the orphan
  // reconciler picks up runs older than 5 minutes as failed).
  const stale = await db
    .select({ id: schema.citationRuns.id })
    .from(schema.citationRuns)
    .where(
      and(
        inArray(schema.citationRuns.status, ["pending", "running"]),
        lt(schema.citationRuns.startedAt, new Date(Date.now() - 30_000)),
      ),
    )
    .limit(1);

  if (stale.length === 0) return { progressed: false };
  const runId = stale[0].id;
  const sliceDeadline = Math.min(deadlineMs - 500, Date.now() + 8000);
  const result = await advanceCitationRun(runId, sliceDeadline);
  return { progressed: true, runId, status: result.status };
}

// Backstop for perception probe runs. The browser drives its own run with
// repeated /advance calls, but a closed tab mid-run would otherwise strand it
// with answers stored and no scores. Same shape as the citation drain above:
// one stale still-active run per tick, one slice.
export async function drainPendingPerceptionProbeRuns(
  deadlineMs: number,
): Promise<{ progressed: boolean; runId?: string; status?: string }> {
  const stale = await db
    .select({
      id: schema.brandPerceptionProbeRuns.id,
      brandId: schema.brandPerceptionProbeRuns.brandId,
    })
    .from(schema.brandPerceptionProbeRuns)
    .where(
      and(
        inArray(schema.brandPerceptionProbeRuns.status, ["pending", "running"]),
        // A live run gets an /advance from the browser every few seconds, so
        // anything untouched for 2 minutes has lost its driver.
        lt(schema.brandPerceptionProbeRuns.startedAt, new Date(Date.now() - 120_000)),
      ),
    )
    .limit(1);

  if (stale.length === 0) return { progressed: false };
  const brand = await storage.getBrandById(stale[0].brandId);
  if (!brand) return { progressed: false };
  const sliceDeadline = Math.min(deadlineMs - 500, Date.now() + 8000);
  const result = await advancePerceptionProbeRun(
    brand,
    stale[0].id,
    sliceDeadline,
    brand.userId ?? undefined,
  );
  return { progressed: true, runId: stale[0].id, status: result.status };
}

export async function failStuckContentJobsForOrchestrator(): Promise<{ failed: number }> {
  const stale = await storage.failStuckContentJobs(60);
  for (const j of stale) {
    try {
      if (j.articleId) await storage.setArticleFailed(j.articleId);
      await refundArticleQuota(j.userId, j.id, "timeout");
    } catch (err) {
      logger.warn({ err, jobId: j.id }, "cron: stuck-job refund/reset failed");
    }
  }
  return { failed: stale.length };
}

// Reaper for mention-scan jobs orphaned mid-run (serverless timeout, deploy,
// crash). Without this a dead 'running' job wedges all future scans for that
// brand.
export async function failStaleScanJobsForOrchestrator(): Promise<{ failed: number }> {
  const failed = await storage.failStaleScanJobs(30);
  return { failed };
}
