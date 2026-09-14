// Live values: brand, current level and points (the level just completed),
// next level, milestones achieved, next recommended task. Pending backend
// values: a discrete award-history ledger (approved-change, publication-
// check and results-review counts) - `/work/summary` reports milestone KEYS
// achieved, not a per-category count, so the screen lists the milestones it
// actually has instead of inventing counts for the ones it doesn't.
import { useEffect } from "react";
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "@/v2/data/workSummary";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { writeLevelSeen } from "@/v2/today/levelSeen";
import { milestoneLabel } from "./milestoneLabels";
import type { Board47Data } from "./Screen";

export function useBoard47Data(): V2LiveResult<Board47Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const { mode } = useV2Mode();
  const summaryQuery = useWorkSummary(selectedBrandId);

  const level = summaryQuery.data?.currentLevel.level;
  useEffect(() => {
    // Marking the level "seen" here, not on a button click, is deliberate:
    // the dispatch condition that routed here (`levelCompletedSinceLastSeen`
    // in src/routes/_app/v2.today.tsx) must stop being true once this board
    // has actually been shown, or the very next visit lands here again.
    if (selectedBrandId && level !== undefined) {
      writeLevelSeen(selectedBrandId, level);
    }
  }, [selectedBrandId, level]);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "Select a brand before loading Today." } };
  }
  if (summaryQuery.isPending) return { state: { kind: "loading" } };
  if (summaryQuery.isError) {
    return { state: { kind: "error", message: "The level completion could not be loaded." } };
  }
  if (!summaryQuery.data) return { state: { kind: "loading" } };

  const summary = summaryQuery.data;

  return {
    state: { kind: "ready" },
    data: {
      brandId: selectedBrandId,
      mode,
      brand: { name: selectedBrand?.name ?? "" },
      completion: {
        level: summary.currentLevel.level,
        levelName: summary.currentLevel.name,
        verifiedWorkPoints: summary.points,
        milestoneLabels: summary.milestones.map(milestoneLabel),
      },
      nextLevel: summary.nextThreshold
        ? { level: summary.nextThreshold.level, name: summary.nextThreshold.name }
        : null,
      nextTask: summary.nextTask
        ? { title: summary.nextTask.title, points: summary.nextTask.points }
        : null,
    },
  };
}
