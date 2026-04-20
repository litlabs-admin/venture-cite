import { storage } from "../storage";

/**
 * Record a time-series snapshot of the current brand metrics to
 * `metrics_history`. Called at the end of every citation run so the Metrics
 * History chart has real data points going forward.
 *
 * Reads from the Phase 1 tables (brand_prompts + geo_rankings) rather than
 * the deprecated prompt_portfolio / citation_quality tables so we always
 * snapshot the numbers the dashboard actually displays.
 */
export async function recordCurrentMetrics(
  brandId: string,
  runStats: { citationRate: number; totalChecks: number; totalCited: number },
): Promise<void> {
  // 1. Citation rate — the headline metric.
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "citation_rate",
    metricValue: runStats.citationRate.toFixed(2),
    metricDetails: { totalChecks: runStats.totalChecks, totalCited: runStats.totalCited },
  } as any);

  // 2. Citation quality — average relevance_score across cited rankings in this run.
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  const promptIds = prompts.map((p) => p.id);
  if (promptIds.length > 0) {
    const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds);
    const cited = rankings.filter((r) => r.isCited === 1);
    const withRelevance = cited.filter((r) => typeof (r as any).relevanceScore === "number");
    if (withRelevance.length > 0) {
      const avgRelevance =
        withRelevance.reduce((sum, r) => sum + ((r as any).relevanceScore as number), 0) /
        withRelevance.length;
      await storage.createMetricsSnapshot({
        brandId,
        metricType: "citation_quality",
        metricValue: avgRelevance.toFixed(2),
        metricDetails: { cited: cited.length, scored: withRelevance.length },
      } as any);
    }
  }

  // 3. Hallucinations — unresolved count.
  const hallucinations = await storage.getBrandHallucinations(brandId).catch(() => []);
  const unresolved = hallucinations.filter((h: any) => h.isResolved === 0).length;
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "hallucinations_unresolved",
    metricValue: unresolved.toString(),
    metricDetails: { total: hallucinations.length, unresolved },
  } as any);
}
