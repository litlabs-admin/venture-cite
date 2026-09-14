import { StateView } from "../_placeholder/StateView";
import { Board30Screen } from "./Screen";
import { useBoard30Data } from "./data";
export function Board30Route() {
  const result = useBoard30Data();
  if (result.data !== undefined)
    return (
      <Board30Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
