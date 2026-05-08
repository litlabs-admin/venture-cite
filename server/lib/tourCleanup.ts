// server/lib/tourCleanup.ts
import { logger } from "./logger";
import { storage } from "../storage";

const RETENTION_DAYS = 90;

export async function runTourEventsCleanupJob(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await storage.deleteOldTourEvents(cutoff);
  logger.info({ deleted, cutoff: cutoff.toISOString() }, "tour events cleanup ran");
}
