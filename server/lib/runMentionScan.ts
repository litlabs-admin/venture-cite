// runMentionScan — Task 14 (Mentions Rebuild)
//
// Orchestrates a single scan-job run: reads the job row, guards idempotency,
// transitions status (queued → running → complete | failed), and delegates
// the actual scanning to scanBrandMentions.
//
// Callers fire-and-forget this function (detached promise), so it must never
// re-throw. All errors are persisted to the scan_jobs row and forwarded to
// Sentry via captureAndFlush.

import { storage } from "../storage";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";
import { scanBrandMentions } from "./mentionScanner";

export async function runMentionScan(scanId: string): Promise<void> {
  // 1. Read the scan_jobs row.
  const job = await storage.getScanJob(scanId);
  if (!job) {
    logger.warn({ scanId }, "scan.run.not_found — scan job missing, skipping");
    return;
  }

  // 2. Idempotency guard: don't re-run a terminal job.
  if (job.status === "complete" || job.status === "failed") {
    return;
  }

  // 3. Transition to running.
  await storage.updateScanJob(scanId, { status: "running", startedAt: new Date() });

  const startedAt = Date.now();

  try {
    // 4. Execute the scan.
    const report = await scanBrandMentions(job.brandId, scanId);

    const durationMs = Date.now() - startedAt;

    // 5. Mark complete.
    await storage.updateScanJob(scanId, {
      status: "complete",
      completedAt: new Date(),
      perSource: report.perSource,
      totals: report.totals,
    });

    logger.info(
      { scanId, brandId: job.brandId, durationMs, totals: report.totals },
      "scan.run.complete",
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // 6. Mark failed.
    await storage.updateScanJob(scanId, {
      status: "failed",
      completedAt: new Date(),
      error: errMsg.slice(0, 500),
    });

    captureAndFlush(err, {
      tags: { source: "runMentionScan" },
      extra: { scanId, brandId: job.brandId },
    });

    logger.error({ err, scanId }, "scan.run.failed");
    // Do NOT re-throw — callers detach the promise.
  }
}
