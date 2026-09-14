// Live values: brand, goal, task queue, task details, awarded points, level, and mention trend.
// Pending backend values: exact verified-change counts and Board 02 engine/question note.
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useAssignedTasks, useWorkSummary } from "@/v2/data/workSummary";
import { useVisibilityMentionRate, latestObservedWeek } from "@/v2/data/visibilityTrend";
import type { Board01Data } from "./Screen";
import { buildTodayData, type AssignedTasksProjection } from "./shared/todayAdapter";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import { isObservationStale } from "@/v2/today/staleness";

export function mapBoard01Data(
  summary: WorkSummaryView,
  tasks: AssignedTasksProjection,
  trend: VisibilityMentionRate | undefined,
  brandName: string,
  visibilityState: "loading" | "failed" = "loading",
): Board01Data {
  return buildTodayData("board01", summary, tasks, trend, brandName, visibilityState);
}

function buildResult(
  selectedBrandId: string,
  brandName: string,
  summaryQuery: ReturnType<typeof useWorkSummary>,
  tasksQuery: ReturnType<typeof useAssignedTasks>,
  trendQuery: ReturnType<typeof useVisibilityMentionRate>,
): V2LiveResult<Board01Data> {
  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "Select a brand before loading Today." } };
  }
  if (summaryQuery.isPending || tasksQuery.isPending) {
    return { state: { kind: "loading" } };
  }
  if (summaryQuery.isError || tasksQuery.isError) {
    return { state: { kind: "error", message: "Today work data could not be loaded." } };
  }
  if (!summaryQuery.data || !tasksQuery.data) {
    return { state: { kind: "loading" } };
  }

  const data = mapBoard01Data(
    summaryQuery.data,
    tasksQuery.data,
    trendQuery.data,
    brandName,
    trendQuery.isError ? "failed" : "loading",
  );
  // Stale means the brand's latest real observation is old, not that some
  // query's cache entry has crossed its own staleTime - see
  // client/src/v2/today/staleness.ts.
  const latestObserved = latestObservedWeek(trendQuery.data?.weeks);
  if (isObservationStale(latestObserved?.weekStart)) {
    return {
      state: {
        kind: "stale",
        reason: "The latest measurement is more than 14 days old.",
        asOf: `${latestObserved!.weekStart}T00:00:00.000Z`,
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}

export function useBoard01Data(): V2LiveResult<Board01Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const tasksQuery = useAssignedTasks(selectedBrandId);
  const trendQuery = useVisibilityMentionRate(selectedBrandId);

  if (brandsLoading) return { state: { kind: "loading" } };
  return buildResult(
    selectedBrandId,
    selectedBrand?.name ?? "",
    summaryQuery,
    tasksQuery,
    trendQuery,
  );
}
