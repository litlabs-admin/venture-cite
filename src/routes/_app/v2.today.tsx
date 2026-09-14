import { createFileRoute } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "@/v2/data/workSummary";
import { useVisibilityMentionRate, type VisibilityWeek } from "@/v2/data/visibilityTrend";
import { todayDispatch, type TodayDispatchSummary } from "@/v2/dispatch/todayDispatch";

function latestMeasurement(weeks: VisibilityWeek[] | undefined): VisibilityWeek | undefined {
  if (!weeks) return undefined;
  return [...weeks].reverse().find((week) => week.measured > 0 || week.failed > 0);
}

function TodayRoute() {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const measurementQuery = useVisibilityMentionRate(selectedBrandId);

  const latest = latestMeasurement(measurementQuery.data?.weeks);
  const measurement: TodayDispatchSummary["measurement"] = brandsLoading
    ? { kind: "unavailable", reason: "Brands are loading." }
    : !selectedBrandId
      ? { kind: "none", reason: "No measurement exists for this brand." }
      : measurementQuery.isPending
        ? { kind: "unavailable", reason: "The latest measurement is loading." }
        : measurementQuery.isError
          ? { kind: "unavailable", reason: "The latest measurement could not be read." }
          : !latest
            ? { kind: "none", reason: "No measurement exists for this brand." }
            : {
                kind: "available",
                failedAttempts: latest.failed,
                // The current mention-rate response does not expose a stored
                // reliability threshold. Keep the selector at two failed
                // attempts until the API provides the configured value.
                reliabilityThreshold: 2,
                isStale: false,
              };

  const dispatchSummary: TodayDispatchSummary = {
    measurement,
    baselineComplete: Boolean(summaryQuery.data?.milestones.includes("baseline_ready")),
    goalSet: summaryQuery.data ? summaryQuery.data.goal !== null : true,
    // No current Today response records whether the user saw the completion.
    // The live route therefore keeps this false until that field exists.
    levelCompletedSinceLastSeen: false,
  };
  const ScreenRoute = todayDispatch(dispatchSummary);
  return <ScreenRoute />;
}

export const Route = createFileRoute("/_app/v2/today")({
  component: TodayRoute,
  staticData: { v2Shell: "guided", v2Board: "b01" },
});
