import { StateView } from "../_placeholder/StateView";
import { Board29Screen } from "./Screen";
import { useBoard29Data } from "./data";
export function Board29Route() {
  const result = useBoard29Data();
  if (result.data !== undefined)
    return (
      <Board29Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
