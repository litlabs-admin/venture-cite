import { StateView } from "../_placeholder/StateView";
import { Board37Screen } from "./Screen";
import { useBoard37Data } from "./data";
export function Board37Route() {
  const result = useBoard37Data();
  if (result.data !== undefined)
    return (
      <Board37Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
