import { StateView } from "../_placeholder/StateView";
import { Board41Screen } from "./Screen";
import { useBoard41Data } from "./data";
export function Board41Route() {
  const result = useBoard41Data();
  if (result.data !== undefined)
    return (
      <Board41Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
