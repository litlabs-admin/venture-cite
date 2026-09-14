import { StateView } from "../_placeholder/StateView";
import { Board17Screen } from "./Screen";
import { useBoard17Data } from "./data";
export function Board17Route() {
  const result = useBoard17Data();
  if (result.data !== undefined)
    return (
      <Board17Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
