import { StateView } from "../_placeholder/StateView";
import { Board24Screen } from "./Screen";
import { useBoard24Data } from "./data";
export function Board24Route() {
  const result = useBoard24Data();
  if (result.data !== undefined)
    return (
      <Board24Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
