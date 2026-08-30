// Brand Fact Sheet fact-conflict resolution service (v1 accept/dismiss/
// bulk-accept/diff). Extracted verbatim from server/routes/factSheet.ts
// (phase B7-16). No Express types - ownership enforcement (`requireBrand`)
// stays in the route; these functions take an already-loaded fact/brandId
// and return plain data or throw.

import { storage } from "../storage";
import { logger } from "../lib/logger";

export async function getFactSheetFactById(factId: string) {
  return storage.getBrandFactById(factId);
}

// ────────────────────────────────────────────────────────────────────────
// Task 7: POST /api/brand-fact-sheet/facts/:factId/accept
// ────────────────────────────────────────────────────────────────────────
export async function acceptFactSheetFact(
  fact: { id: string; brandId: string },
  dismissOtherSide: boolean,
) {
  const updated = await storage.acceptFact(fact.id, { dismissOtherSide });
  logger.info(
    {
      brandId: fact.brandId,
      factId: fact.id,
      domain: (fact as any).domain,
      subcategory: (fact as any).subcategory,
      factKey: (fact as any).factKey,
    },
    "factSheet.facts.accept",
  );
  return updated;
}

// ────────────────────────────────────────────────────────────────────────
// Task 7: POST /api/brand-fact-sheet/facts/:factId/dismiss
// ────────────────────────────────────────────────────────────────────────
export async function dismissFactSheetFact(fact: { id: string; brandId: string }) {
  const updated = await storage.dismissFact(fact.id);
  logger.info(
    {
      brandId: fact.brandId,
      factId: fact.id,
      domain: (fact as any).domain,
      subcategory: (fact as any).subcategory,
      factKey: (fact as any).factKey,
    },
    "factSheet.facts.dismiss",
  );
  return updated;
}

// ────────────────────────────────────────────────────────────────────────
// Task 8: POST /api/brand-fact-sheet/facts/bulk-accept
// ────────────────────────────────────────────────────────────────────────
export async function bulkAcceptFactSheetConflicts(params: {
  brandId: string;
  side: "user" | "scraped";
  domain?: string;
  runId?: string;
}): Promise<number> {
  const { brandId, side, domain, runId } = params;
  const conflicts = await storage.getBrandFactSheetConflicts(brandId);
  let affected = 0;
  for (const pair of conflicts) {
    if (domain && (pair.userFact as any).domain !== domain) continue;
    // MEDIUM 7: honor runId scope when provided.
    if (runId && (pair.scrapedFact as any).runId !== runId) continue;
    const keep = side === "user" ? pair.userFact : pair.scrapedFact;
    const drop = side === "user" ? pair.scrapedFact : pair.userFact;
    await storage.acceptFact(keep.id, { dismissOtherSide: false });
    await storage.dismissFact(drop.id);
    affected += 1;
  }
  logger.info({ brandId, side, domain, runId, affected }, "factSheet.facts.bulkAccept");
  return affected;
}

// ────────────────────────────────────────────────────────────────────────
// Task 9: GET /api/brand-fact-sheet/diff?brandId=...
// ────────────────────────────────────────────────────────────────────────
export async function getFactSheetDiff(brandId: string) {
  const flat = await storage.getBrandFactSheetConflicts(brandId);
  // CRITICAL 1: client expects domain-grouped record, not flat array.
  const conflicts: Record<string, typeof flat> = {};
  for (const pair of flat) {
    const domain = (pair.userFact as any).domain as string;
    if (!conflicts[domain]) conflicts[domain] = [];
    conflicts[domain].push(pair);
  }
  return conflicts;
}
