import { createFileRoute } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "@/v2/data/workSummary";
import {
  useVisibilityMentionRate,
  latestObservedWeek,
  type VisibilityWeek,
} from "@/v2/data/visibilityTrend";
import { todayDispatch, type TodayDispatchSummary } from "@/v2/dispatch/todayDispatch";
import { isObservationStale } from "@/v2/today/staleness";
import { readLevelSeen } from "@/v2/today/levelSeen";

function latestMeasurement(weeks: VisibilityWeek[] | undefined): VisibilityWeek | undefined {
  if (!weeks) return undefined;
  return [...weeks].reverse().find((week) => week.measured > 0 || week.failed > 0);
}

function TodayRoute() {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const measurementQuery = useVisibilityMentionRate(selectedBrandId);

  const latest = latestMeasurement(measurementQuery.data?.weeks);
  // Staleness is about the data, not the read: it asks when the brand was
  // last actually observed, which is the latest week that holds real
  // answers - not merely the latest week a call was attempted (that week can
  // hold nothing but failures) and never the React Query cache's own
  // `isStale` flag, which flips on the client's fetch schedule and says
  // nothing about the measurement itself.
  const latestObserved = latestObservedWeek(measurementQuery.data?.weeks);
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
                isStale: isObservationStale(latestObserved?.weekStart),
              };

  const currentLevel = summaryQuery.data?.currentLevel.level;
  const levelSeen = selectedBrandId ? readLevelSeen(selectedBrandId) : null;

  const dispatchSummary: TodayDispatchSummary = {
    measurement,
    baselineComplete: Boolean(summaryQuery.data?.milestones.includes("baseline_ready")),
    goalSet: summaryQuery.data ? summaryQuery.data.goal !== null : true,
    // A completion the user has never been shown a lower level for is not a
    // completion the user "has not seen" - it is their first visit. Only a
    // level that is HIGHER than the one already recorded as seen counts.
    levelCompletedSinceLastSeen:
      currentLevel !== undefined && levelSeen !== null && currentLevel > levelSeen,
  };
  const ScreenRoute = todayDispatch(dispatchSummary);
  return <ScreenRoute />;
}

export const Route = createFileRoute("/_app/v2/today")({
  component: TodayRoute,
  staticData: { v2Shell: "guided", v2Board: "b01" },
});
