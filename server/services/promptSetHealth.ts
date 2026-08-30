// Business logic for the prompt-set health audit: the cooldown gate on
// re-running it.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split.

import { storage } from "../storage";
import { runPromptSetHealthAudit } from "../lib/promptSetHealthAuditor";
import { SET_HEALTH_COOLDOWN_MS } from "@shared/constants";
import type { Brand, PromptSetHealthRun } from "@shared/schema";

export type RunSetHealthAuditResult =
  { outcome: "cooldown"; retryAfterSeconds: number } | { outcome: "ok"; data: PromptSetHealthRun };

export async function runSetHealthAuditForBrand(brand: Brand): Promise<RunSetHealthAuditResult> {
  const recent = await storage.getLatestSetHealthRun(brand.id);
  if (recent?.createdAt) {
    const ageMs = Date.now() - new Date(recent.createdAt).getTime();
    if (ageMs < SET_HEALTH_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((SET_HEALTH_COOLDOWN_MS - ageMs) / 1000);
      return { outcome: "cooldown", retryAfterSeconds: retryAfterSec };
    }
  }

  const run = await runPromptSetHealthAudit(brand.id);
  return { outcome: "ok", data: run };
}
