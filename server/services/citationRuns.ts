// Business logic for kicking off and observing a brand's citation run:
// starting the run (with its background drive loop) and building the
// progress snapshot the client polls.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split. No Express types - callers resolve `brand`/`brandId`
// via requireBrand first and pass it in.

import { storage } from "../storage";
import {
  kickoffBrandPromptsRun,
  advanceCitationRun,
  DEFAULT_CITATION_PLATFORMS,
} from "../citationChecker";
import { logger } from "../lib/logger";
import { waitUntil } from "@vercel/functions";
import type { Brand } from "@shared/schema";

export type StartCitationRunResult =
  | { outcome: "not_configured" }
  | { outcome: "no_prompts" }
  | { outcome: "no_platforms_selected" }
  | { outcome: "already_running"; runId: string }
  | { outcome: "start_failed" }
  | { outcome: "started"; runId: string };

// Run all tracked prompts against each platform and persist results.
// Async kickoff: creates the citation_runs row synchronously, then runs a
// deadline-bounded slice (see citationChecker.kickoffBrandPromptsRun) and
// returns the runId. The client tracks completion via the
// /citation-runs/state polling channel and drives any remainder via
// /advance. The partial unique index from migration 0035 guarantees only
// one in-flight run per brand - duplicate kickoffs (two tabs racing) get
// 409 with the existing runId so the UI joins it.
export async function startBrandCitationRun(
  brand: Brand,
  platformsRaw: unknown,
): Promise<StartCitationRunResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { outcome: "not_configured" };
  }

  const existing = await storage.getBrandPromptsByBrandId(brand.id);
  if (existing.length === 0) {
    return { outcome: "no_prompts" };
  }

  const platforms: string[] = (
    Array.isArray(platformsRaw) ? platformsRaw : [...DEFAULT_CITATION_PLATFORMS]
  )
    .filter((p): p is string => typeof p === "string")
    .slice(0, DEFAULT_CITATION_PLATFORMS.length);

  // Reject an empty platforms array. Previously, the kickoff would
  // happily create a run, do zero AI calls, and finalize as
  // status='failed' with an "All platform calls failed" error message -
  // a phantom failed row in History for nothing. The dedup index would
  // also block legitimate retries until the phantom finalized.
  if (platforms.length === 0) {
    return { outcome: "no_platforms_selected" };
  }

  const result = await kickoffBrandPromptsRun(brand.id, platforms, {
    triggeredBy: "manual",
  });
  if (!result.ok && result.reason === "already_running") {
    return { outcome: "already_running", runId: result.runId };
  }
  // The bounded-retry path can return ok=false with no runId in the rare
  // race window. Surface as a generic failure so the client toast says
  // "Couldn't start run" rather than silently dropping.
  if (!result.ok) {
    return { outcome: "start_failed" };
  }

  // Server-side drive: progress the run without requiring an open browser
  // tab. Additive - the client /citation-runs/state + /advance loop still
  // runs as the fast path when a tab is open (Vercel Hobby has no
  // frequent cron). advanceCitationRun holds a per-run advisory lock
  // internally, so server + client slices can't double-process the same
  // pairs. Whatever doesn't finish in this function's window is resumed
  // by the daily cron's drainPendingCitationRuns - a tab is no longer
  // REQUIRED.
  const driveRunId = result.runId;
  const driveDeadlineMs = Date.now() + 50_000;
  waitUntil(
    (async () => {
      try {
        while (Date.now() < driveDeadlineMs) {
          const sliceDeadlineMs = Math.min(driveDeadlineMs, Date.now() + 12_000);
          const outcome = await advanceCitationRun(driveRunId, sliceDeadlineMs);
          if (outcome.done) break;
          await new Promise((r) => setTimeout(r, 1_500));
        }
      } catch (err) {
        logger.warn({ err, runId: driveRunId }, "citation run: server-side drive failed");
      }
    })(),
  );

  return { outcome: "started", runId: result.runId };
}

export type CitationRunStateSnapshot = {
  runs: Array<{
    runId: string;
    status: string;
    progressPct: number;
    totalChecks: number;
    totalCited: number;
    citationRate: number;
    rankings: Array<{ id: string; aiPlatform: string; isCited: boolean; checkedAt: string }>;
    done: boolean;
  }>;
  since: number;
  hasActive: boolean;
};

// Vercel migration: per-run progress snapshot for client polling. Client
// polls every ~1s with its `?since=<unixMs>` cursor; returns each active
// run's progressPct/totalChecks/totalCited plus any geo_rankings rows
// created since the cursor. `done: true` on a run's slot signals the
// client to stop polling that run.
export async function buildCitationRunStateSnapshot(
  brandId: string,
  sinceMs: number,
): Promise<CitationRunStateSnapshot> {
  const active = await storage.getActiveCitationRuns(brandId);
  const runs: CitationRunStateSnapshot["runs"] = [];

  let nextSince = sinceMs;

  for (const r of active) {
    const live = await storage.getCitationRunLiveState(r.id);
    if (!live) continue;
    const recent = await storage.getRecentRankingsForRun(r.id, sinceMs, 100);
    for (const row of recent) {
      if (row.checkedAt) {
        const ms = new Date(row.checkedAt).getTime();
        if (ms > nextSince) nextSince = ms;
      }
    }
    runs.push({
      runId: r.id,
      status: live.status,
      progressPct: live.progressPct,
      totalChecks: live.totalChecks,
      totalCited: live.totalCited,
      citationRate: live.citationRate,
      rankings: recent.map((row) => ({
        id: row.id,
        aiPlatform: row.aiPlatform,
        isCited: !!row.isCited,
        checkedAt: row.checkedAt ? new Date(row.checkedAt).toISOString() : new Date().toISOString(),
      })),
      done: live.status !== "pending" && live.status !== "running",
    });
  }

  return {
    runs,
    since: nextSince,
    hasActive: active.length > 0,
  };
}
