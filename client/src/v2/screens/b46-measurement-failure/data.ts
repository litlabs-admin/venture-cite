// Live values: brand, aggregate failed-attempt count, staleness of the
// latest observation, and the last verified visibility report (same
// projection Today uses). Pending backend values: per-engine failure rows,
// an incident record, and a retry endpoint - see Screen.tsx's honest states.
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useVisibilityMentionRate, latestObservedWeek } from "@/v2/data/visibilityTrend";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { isObservationStale } from "@/v2/today/staleness";
import { measuredVisibility } from "../b01-today/shared/todayAdapter";
import type { Board46Data } from "./Screen";

function formatDate(dateIso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T00:00:00Z`));
}

export function useBoard46Data(): V2LiveResult<Board46Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const { mode } = useV2Mode();
  const trendQuery = useVisibilityMentionRate(selectedBrandId);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "Select a brand before loading Today." } };
  }
  if (trendQuery.isPending) return { state: { kind: "loading" } };
  if (trendQuery.isError) {
    return { state: { kind: "error", message: "The measurement status could not be loaded." } };
  }
  if (!trendQuery.data) return { state: { kind: "loading" } };

  const trend = trendQuery.data;
  const latest = latestObservedWeek(trend.weeks);
  const isStale = isObservationStale(latest?.weekStart);

  return {
    state: { kind: "ready" },
    data: {
      brandId: selectedBrandId,
      mode,
      brand: { name: selectedBrand?.name ?? "" },
      alert: {
        failedCount: trend.failed,
        observedCount: trend.observed,
        isStale,
        staleAsOfLabel: latest
          ? `more than 14 days old (last observed ${formatDate(latest.weekStart)})`
          : null,
      },
      lastVerified: measuredVisibility(trend.weeks, "board01"),
    },
  };
}
