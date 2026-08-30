// Brand Fact Sheet run-lifecycle service (v1 run/page/settings admin).
//
// Extracted verbatim from server/routes/factSheet.ts (phase B7-16). No
// Express types here - every function takes explicit parameters (a runId, a
// brandId, an already-ownership-checked run row) and returns plain data or
// throws. Ownership enforcement (`requireBrand`) stays in the route.
//
// `FACT_SHEET_TERMINAL_STATUSES` was declared twice in the original route
// file under two names (`TERMINAL_STATUSES` for cancel, `TERMINAL_FOR_STREAM`
// for the SSE stream) with the identical value - folded into one export here
// since both call sites already meant the same thing.

import { storage } from "../storage";
import { logger } from "../lib/logger";
import type { BrandFactScrapeRun } from "@shared/schema";

export const FACT_SHEET_TERMINAL_STATUSES = ["completed", "failed", "timeout", "cancelled"];

// ────────────────────────────────────────────────────────────────────────
// Task 5: GET /api/brand-fact-sheet/runs?brandId=...&limit=10
// ────────────────────────────────────────────────────────────────────────
export async function listFactSheetRuns(brandId: string, limit: number) {
  return storage.listScrapeRunsForBrand(brandId, limit);
}

// ────────────────────────────────────────────────────────────────────────
// UI audit #10: GET /api/brand-fact-sheet/runs/latest-completed?brandId=...
//
// Goes through storage rather than querying db directly. This module is
// imported by route tests that mock `storage`; a direct `db` import
// pulls in the real connection at module load, which throws without
// DATABASE_URL and took seven factSheet specs down at collection time.
// ────────────────────────────────────────────────────────────────────────
export async function getLatestCompletedFactSheetRun(brandId: string) {
  return storage.getLatestCompletedScrapeRun(brandId);
}

// ────────────────────────────────────────────────────────────────────────
// Shared lookup - reused by v1 run detail/cancel/stream and every v2 source
// route (scrape-one/search-llm/user-enrich/aggregate/paste). Same storage
// call in every case; not a v1/v2 divergence worth duplicating.
// ────────────────────────────────────────────────────────────────────────
export async function getFactSheetRunById(runId: string): Promise<BrandFactScrapeRun | null> {
  return storage.getScrapeRunById(runId);
}

export async function getFactSheetPageById(pageId: string) {
  return storage.getScrapePageById(pageId);
}

// ────────────────────────────────────────────────────────────────────────
// Task 3: GET /api/brand-fact-sheet/runs/:runId
// ────────────────────────────────────────────────────────────────────────
export async function listFactSheetRunPages(runId: string) {
  return storage.listScrapePagesForRun(runId);
}

// ────────────────────────────────────────────────────────────────────────
// Task 4: POST /api/brand-fact-sheet/runs/:runId/cancel
// ────────────────────────────────────────────────────────────────────────
export type CancelFactSheetRunResult =
  | { outcome: "already_terminal"; status: string }
  | { outcome: "status_changed" }
  | { outcome: "cancelled" };

export async function cancelFactSheetRun(run: {
  id: string;
  brandId: string;
  status: string;
}): Promise<CancelFactSheetRunResult> {
  if (FACT_SHEET_TERMINAL_STATUSES.includes(run.status)) {
    return { outcome: "already_terminal", status: run.status };
  }

  // CAS: atomic transition only if status is still non-terminal.
  const updated = await storage.transitionScrapeRunStatusCAS(run.id, run.status, "cancelled");
  if (!updated) {
    return { outcome: "status_changed" };
  }

  logger.info({ runId: run.id, brandId: run.brandId }, "factSheet.runs.cancel: ok");
  return { outcome: "cancelled" };
}

// ────────────────────────────────────────────────────────────────────────
// GET /api/brand-fact-sheet/cost-status?brandId=...
//
// Spec 2 §5.4 + §4.9: surface the brand's monthly fact-scrape spend so the
// UI can render "$X.XX of $5.00 used this month". If no cap row exists for
// the current month yet, return defaults - lazy creation lives in the
// first run-insert path, not here.
// ────────────────────────────────────────────────────────────────────────
export async function getFactSheetCostStatus(
  brandId: string,
): Promise<{ factScrapeCents: number; monthlyCapCents: number }> {
  const monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const cap = await storage.getMonthlyCostCap(brandId, monthKey);

  return {
    factScrapeCents: cap?.factScrapeCents ?? 0,
    monthlyCapCents: cap?.monthlyCapCents ?? 500,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Task 10: PATCH /api/brands/:brandId/fact-scrape-enabled
// ────────────────────────────────────────────────────────────────────────
export async function setFactSheetScrapeEnabled(
  brandId: string,
  enabled: boolean,
): Promise<boolean> {
  const updated = await storage.setBrandFactScrapeEnabled(brandId, enabled);
  logger.info({ brandId, enabled }, "factSheet.brand.toggleEnabled");
  return updated;
}
