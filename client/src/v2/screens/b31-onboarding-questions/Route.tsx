import { StateView } from "../_placeholder/StateView";
import { Board31Screen } from "./Screen";
import { useBoard31Data } from "./data";
export function Board31Route() {
  const result = useBoard31Data();
  if (result.data !== undefined)
    return (
      <Board31Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
