// Listicle discovery business logic, extracted from
// server/routes/contentTypes.ts (phase B7-13).

import { storage } from "../storage";

// Discover listicles for a brand using AI. Callers are responsible for the
// env/profile/cooldown preflight checks (those touch res, or are trivial
// guards left in the route handler).
export async function discoverBrandListicles(brandId: string, brandName: string) {
  const { scanBrandListicles } = await import("../lib/listicleScanner");
  // A full ScanReport includes reverified, lostInclusion, and
  // multi-line failure list so the toast can surface partial failures.
  const report = await scanBrandListicles(brandId);
  const listicles = await storage.getListicles(brandId);

  return {
    brand: { id: brandId, name: brandName },
    report,
    // Legacy field aliases kept for any existing client that
    // still reads { inserted, candidates }. New clients should
    // read `report.*` directly.
    inserted: report.inserted,
    candidates: report.found,
    reason: report.found === 0 ? "no_candidates" : "ok",
    listicles,
    tips: [
      "Listicles where you're not yet listed are outreach targets",
      "Focus on listicles from high-domain-authority publications",
      "Re-scan weekly - new listicles appear regularly in active categories",
    ],
  };
}
