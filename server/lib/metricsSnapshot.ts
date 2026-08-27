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
  // 1. Citation rate - also written as "share_of_answer" for the TrendsTab
  // chart which queries that key. Same underlying numerator (cited/total)
  // since we don't currently distinguish SoA from citation-rate per run.
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "citation_rate",
    metricValue: runStats.citationRate.toFixed(2),
    metricDetails: { totalChecks: runStats.totalChecks, totalCited: runStats.totalCited },
  } as any);
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "share_of_answer",
    metricValue: runStats.citationRate.toFixed(2),
    metricDetails: { totalChecks: runStats.totalChecks, totalCited: runStats.totalCited },
  } as any);

  // Fetch prompts and aggregate rankings for the visibility_score and
  // citation_quality snapshots below.
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
  const promptIds = prompts.map((p) => p.id);
  const citationCounts =
    promptIds.length > 0 ? await storage.getPromptCitationCounts(promptIds) : [];

  // 2. visibility_score - REQUIRED. Both the dashboard hero delta
  // (server/routes/dashboard.ts → getMetricsHistory("visibility_score"))
  // and the weekly_catchup delta_calc step
  // (server/lib/workflows/weeklyCatchup.ts → prior.metricDetails.byPrompt)
  // read this metric. It was never being written, so the hero "+N pts"
  // trend and the weekly digest's newly-won / newly-lost prompt diff were
  // permanently dead. metricValue uses the run citation-rate as the
  // visibility proxy (same 0–100 scale weekly_catchup compares against);
  // metricDetails.byPrompt is the per-prompt cited/checks map weekly_catchup
  // diffs run-over-run. (Fully reconciling metricValue with the dashboard
  // composite score is a separate, documented follow-up.)
  const byPromptMap = new Map<string, { promptId: string; cited: number; checks: number }>();
  for (const r of citationCounts) {
    if (!r.brandPromptId) continue;
    byPromptMap.set(r.brandPromptId, {
      promptId: r.brandPromptId,
      cited: r.cited,
      checks: r.checks,
    });
  }
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "visibility_score",
    metricValue: runStats.citationRate.toFixed(2),
    metricDetails: {
      totalChecks: runStats.totalChecks,
      totalCited: runStats.totalCited,
      byPrompt: Array.from(byPromptMap.values()),
    },
  } as any);

  // 3. Citation quality - average relevance_score across cited rankings in this run.
  if (promptIds.length > 0) {
    const { cited, scored, avgRelevance } = await storage.getCitedRelevanceStats(promptIds);
    if (scored > 0 && avgRelevance !== null) {
      await storage.createMetricsSnapshot({
        brandId,
        metricType: "citation_quality",
        metricValue: avgRelevance.toFixed(2),
        metricDetails: { cited, scored },
      } as any);
    }
  }

  // 4. Hallucinations - unresolved count. Written under two metric keys:
  // "hallucinations" for TrendsTab's existing query, and
  // "hallucinations_unresolved" preserved for anything that still reads it.
  const hallucinations = await storage.getBrandHallucinations(brandId).catch(() => []);
  const unresolved = hallucinations.filter((h: any) => h.isResolved === 0).length;
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "hallucinations",
    metricValue: unresolved.toString(),
    metricDetails: { total: hallucinations.length, unresolved },
  } as any);
  await storage.createMetricsSnapshot({
    brandId,
    metricType: "hallucinations_unresolved",
    metricValue: unresolved.toString(),
    metricDetails: { total: hallucinations.length, unresolved },
  } as any);
}
