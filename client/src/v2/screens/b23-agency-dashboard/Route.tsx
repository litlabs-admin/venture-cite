import { StateView } from "../_placeholder/StateView";
import { Board23Screen } from "./Screen";
import { useBoard23Data } from "./data";
export function Board23Route() {
  const result = useBoard23Data();
  if (result.data !== undefined)
    return (
      <Board23Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
