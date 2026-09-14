// Live values: brand, observation-window totals (mentions, failed attempts,
// mention rate, latest observed date), recommended task, level and points.
// Pending backend values: per-engine and buyer-journey-stage breakdowns, and
// a distinct citation (as opposed to mention) count - see Screen.tsx's
// honest empty state for that gap.
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "@/v2/data/workSummary";
import { useVisibilityMentionRate, latestObservedWeek } from "@/v2/data/visibilityTrend";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import type { Board33Data, Board33Value } from "./Screen";

function measured<T>(value: T): Board33Value<T> {
  return { kind: "measured", value };
}
const notMeasured: Board33Value<never> = { kind: "not-measured" };

function formatDate(dateIso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T00:00:00Z`));
}

export function useBoard33Data(): V2LiveResult<Board33Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const { mode } = useV2Mode();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const trendQuery = useVisibilityMentionRate(selectedBrandId);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "Select a brand before loading Today." } };
  }
  if (summaryQuery.isPending || trendQuery.isPending) return { state: { kind: "loading" } };
  if (summaryQuery.isError) {
    return { state: { kind: "error", message: "The baseline review could not be loaded." } };
  }
  if (!summaryQuery.data) return { state: { kind: "loading" } };

  const summary = summaryQuery.data;
  const trend = trendQuery.data;
  const latest = latestObservedWeek(trend?.weeks);

  const nextTask = summary.nextTask;

  return {
    state: { kind: "ready" },
    data: {
      brandId: selectedBrandId,
      mode,
      brand: { name: selectedBrand?.name ?? "" },
      baseline: {
        measuredDate: latest ? measured(formatDate(latest.weekStart)) : notMeasured,
        mentionCount: trend && trend.measured > 0 ? measured(trend.cited) : notMeasured,
        mentionDenominator: trend && trend.measured > 0 ? measured(trend.measured) : notMeasured,
        mentionRate: trend && trend.measured > 0 ? measured(trend.mentionRate) : notMeasured,
        failedCount: trend ? measured(trend.failed) : notMeasured,
        failedDenominator: trend ? measured(trend.observed) : notMeasured,
      },
      recommendedTask: nextTask
        ? {
            title: measured(nextTask.title),
            points: measured(nextTask.points),
            reason: nextTask.reason ? measured(nextTask.reason) : notMeasured,
          }
        : null,
      progress: {
        level: summary.currentLevel.level,
        levelName: summary.currentLevel.name,
        points: summary.points,
        nextLevelPoints: summary.nextThreshold?.points ?? null,
      },
    },
  };
}
