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
 * Returns { skip: true } when the source is paused (pausedUntil is in the
 * future). Returns { skip: false } otherwise.
 */
export async function shouldSkipSource(
  brandId: string,
  source: string,
  now: Date = new Date(),
): Promise<HealthDecision> {
  const health = await storage.getSourceHealth(brandId, source);
  if (!health) return { skip: false };

  if (health.pausedUntil && health.pausedUntil > now) {
    return {
      skip: true,
      reason: `Source paused until ${health.pausedUntil.toISOString()} after ${health.consecutiveFailures} consecutive failures`,
    };
  }

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

  // Pause the source for 24 h after 3 or more consecutive failures.
  const PAUSE_THRESHOLD = 3;
  const pausedUntil =
    newFailures >= PAUSE_THRESHOLD ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null;

  const input: InsertSourceHealth = {
    brandId,
    source,
    consecutiveFailures: newFailures,
    lastFailureAt: now,
    lastFailureReason: reason.slice(0, MAX_REASON_LENGTH),
    pausedUntil,
    // Preserve the prior lastSuccessfulScanAt — do not overwrite it.
    lastSuccessfulScanAt: existing?.lastSuccessfulScanAt ?? null,
  };
  await storage.upsertSourceHealth(input);
}
