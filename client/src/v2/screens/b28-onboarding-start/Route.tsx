import { StateView } from "../_placeholder/StateView";
import { Board28Screen } from "./Screen";
import { useBoard28Data } from "./data";
export function Board28Route() {
  const result = useBoard28Data();
  if (result.data !== undefined)
    return (
      <Board28Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
