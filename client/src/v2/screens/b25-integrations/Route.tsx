import { StateView } from "../_placeholder/StateView";
import { Board25Screen } from "./Screen";
import { useBoard25Data } from "./data";
export function Board25Route() {
  const result = useBoard25Data();
  if (result.data !== undefined)
    return (
      <Board25Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
