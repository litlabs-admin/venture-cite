import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useVisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { StateView } from "../_placeholder/StateView";
import { Board02Screen } from "./Screen";
import { useBoard02Data } from "./data";

export function Board02Route() {
  const result = useBoard02Data();
  // Same dedup note as Board01Route: this subscribes to the cache entry
  // `useBoard02Data` already reads, purely to expose `refetch` to the range
  // control.
  const { selectedBrandId } = useBrandSelection();
  const trendQuery = useVisibilityMentionRate(selectedBrandId);

  if (result.data !== undefined) {
    return (
      <Board02Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
        onRefetchVisibility={() => void trendQuery.refetch()}
      />
    );
  }

  return <StateView state={result.state} />;
}
