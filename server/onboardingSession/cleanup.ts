// Expired-session sweep for anonymous onboarding sessions. Mirrors
// server/lib/tourCleanup.ts's shape: a thin job wrapper around one store
// function, logged once per run.
import { logger } from "../lib/logger";
import { deleteExpiredUnclaimedSessions } from "./store";

export async function runOnboardingSessionCleanupJob(): Promise<void> {
  const deleted = await deleteExpiredUnclaimedSessions();
  logger.info({ deleted }, "onboarding session cleanup ran");
}
