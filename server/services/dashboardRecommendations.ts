// Dashboard recommendations service.
//
// Phase 4: deterministic "do this next" rules engine. Loads brand state via
// parallel storage queries, calls the pure engine in
// server/lib/recommendationsEngine.ts, and returns up to 5 prioritised
// recommendations. Sub-200ms target - no LLM call, just count queries.
//
// Extracted verbatim from server/routes/dashboard.ts.

import { storage } from "../storage";
import { VISIBILITY_CHECKLIST_TOTAL } from "@shared/constants";
import type { Brand } from "@shared/schema";
import { getRecommendations, type RecommendationState } from "../lib/recommendationsEngine";

// ==========================================================================
// GET /api/brands/:brandId/recommendations
// ==========================================================================
export async function getDashboardRecommendations(user: { id: string }, brand: Brand) {
  const brandId = brand.id;

  // Parallel-load all the count/state queries the engine needs.
  // 2026-05-28: replaced getLastGeoSignalRunAt (timestamp-only)
  // with getLastGeoSignalSummary (timestamp + overall score) so
  // the engine can fork the Signals rec on staleness vs result
  // quality. One query instead of two.
  const [
    articles,
    prompts,
    citationRuns,
    competitors,
    communityPosts,
    faqItems,
    visibilityRows,
    lastSignalsSummary,
  ] = await Promise.all([
    storage.getArticlesByUserIdWithStatus(user.id, { brandId, limit: 100, offset: 0 }),
    storage.getBrandPromptsByBrandId(brandId),
    storage.getCitationRunsByBrandId(brandId, 100),
    storage.getCompetitors(brandId),
    storage.getCommunityPosts(brandId),
    storage.getFaqItems(brandId),
    storage.getVisibilityProgress(brandId),
    storage.getLastGeoSignalSummary(brandId),
  ]);

  // Citation rate from the most recent COMPLETED run. Null if no runs
  // have completed yet. citation_runs orders newest-first per the
  // storage method's contract.
  const latestCompletedRun = citationRuns.find(
    (r) => r.status === "completed" || r.status === "succeeded",
  );
  const citationRate =
    latestCompletedRun && (latestCompletedRun.totalChecks ?? 0) > 0
      ? (latestCompletedRun.totalCited ?? 0) / (latestCompletedRun.totalChecks ?? 1)
      : null;

  const state: RecommendationState = {
    brand,
    articleCount: articles.length,
    promptCount: prompts.length,
    citationRunCount: citationRuns.length,
    citationRate,
    lastSignalsScanAt: lastSignalsSummary?.ranAt ?? null,
    lastSignalsScore: lastSignalsSummary?.overallScore ?? null,
    visibilityChecklistCompleted: visibilityRows.length,
    visibilityChecklistTotal: VISIBILITY_CHECKLIST_TOTAL,
    competitorCount: competitors.length,
    communityPostCount: communityPosts.length,
    faqCount: faqItems.length,
  };

  return getRecommendations(state);
}
