import { StateView } from "../_placeholder/StateView";
import { Board16Screen } from "./Screen";
import { useBoard16Data } from "./data";
export function Board16Route() {
  const result = useBoard16Data();
  if (result.data !== undefined)
    return (
      <Board16Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
