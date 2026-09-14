import type { BoardId } from "@/v2/contracts/screen";
import { SCREENS, type ScreenRegistryEntry } from "@/v2/screens/registry";

export type TodayMeasurementSummary =
  | { kind: "unavailable"; reason: string }
  | { kind: "none"; reason: string }
  | {
      kind: "available";
      failedAttempts: number;
      reliabilityThreshold: number;
      isStale: boolean;
    };

export type TodayDispatchSummary = {
  measurement: TodayMeasurementSummary;
  baselineComplete: boolean;
  goalSet: boolean;
  levelCompletedSinceLastSeen: boolean;
};

export type TodayRoute = ScreenRegistryEntry["Route"];

function boardRoute(board: BoardId): TodayRoute {
  return SCREENS[board].Route;
}

export function selectTodayBoard(summary: TodayDispatchSummary): BoardId {
  if (summary.measurement.kind === "none") return "b45";
  if (summary.baselineComplete && !summary.goalSet) return "b33";

  if (
    summary.measurement.kind === "available" &&
    (summary.measurement.failedAttempts > summary.measurement.reliabilityThreshold ||
      summary.measurement.isStale)
  ) {
    return "b46";
  }

  if (summary.levelCompletedSinceLastSeen) return "b47";
  return "b01";
}

export function todayDispatch(summary: TodayDispatchSummary): TodayRoute {
  return boardRoute(selectTodayBoard(summary));
}
