// Source health gate helper (Task 9 — Mentions Rebuild).
//
// Tracks consecutive scan failures per (brandId, source) pair and
// automatically pauses a source for 24 h after three consecutive failures.
//
// Public API:
//   shouldSkipSource   — check whether a source is currently paused
//   recordSourceSuccess — reset failure counter on a successful scan
//   recordSourceFailure — increment counter, pause after ≥3 failures

import { storage } from "../storage";
import type { InsertSourceHealth } from "@shared/schema";

export type HealthDecision = { skip: boolean; reason?: string };

// Maximum length stored for failure reason text.
const MAX_REASON_LENGTH = 200;

/**
 * Always returns { skip: false }. The pause-on-consecutive-failures behavior
 * was removed per product decision — every scan attempt should hit the
 * source, regardless of past failures. Source-health rows are still written
 * for observability, but pausedUntil is never honored.
 */
export async function shouldSkipSource(
  _brandId: string,
  _source: string,
  _now: Date = new Date(),
): Promise<HealthDecision> {
  return { skip: false };
}

/**
 * Record a successful scan: resets failure state entirely.
 */
export async function recordSourceSuccess(brandId: string, source: string): Promise<void> {
  const input: InsertSourceHealth = {
    brandId,
    source,
    consecutiveFailures: 0,
    lastSuccessfulScanAt: new Date(),
    pausedUntil: null,
    lastFailureAt: null,
    lastFailureReason: null,
  };
  await storage.upsertSourceHealth(input);
}

/**
 * Record a scan failure. Increments the consecutive failure counter.
 * If the counter reaches PAUSE_THRESHOLD, sets pausedUntil = now + 24h.
 * The lastSuccessfulScanAt field is preserved from any existing row.
 */
export async function recordSourceFailure(
  brandId: string,
  source: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  const existing = await storage.getSourceHealth(brandId, source);
  const prevFailures = existing?.consecutiveFailures ?? 0;
  const newFailures = prevFailures + 1;

  const input: InsertSourceHealth = {
    brandId,
    source,
    consecutiveFailures: newFailures,
    lastFailureAt: now,
    lastFailureReason: reason.slice(0, MAX_REASON_LENGTH),
    // Pause-on-failure removed — scans always run regardless of past failures.
    pausedUntil: null,
    // Preserve the prior lastSuccessfulScanAt — do not overwrite it.
    lastSuccessfulScanAt: existing?.lastSuccessfulScanAt ?? null,
  };
  await storage.upsertSourceHealth(input);
}
