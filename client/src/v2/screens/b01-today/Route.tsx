import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useVisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { StateView } from "../_placeholder/StateView";
import { Board01Screen } from "./Screen";
import { useBoard01Data } from "./data";

export function Board01Route() {
  const result = useBoard01Data();
  // Same query key `useBoard01Data` already subscribes to - React Query
  // dedupes this to the same cache entry, so this costs no extra request. It
  // exists only to hand the range control a real `refetch`, without widening
  // `useBoard01Data`'s own return past the live-result contract.
  const { selectedBrandId } = useBrandSelection();
  const trendQuery = useVisibilityMentionRate(selectedBrandId);

  if (result.data !== undefined) {
    return (
      <Board01Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
        onRefetchVisibility={() => void trendQuery.refetch()}
      />
    );
  }

  return <StateView state={result.state} />;
}
