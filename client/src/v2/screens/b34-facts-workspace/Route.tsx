import { StateView } from "../_placeholder/StateView";
import { Board34Screen } from "./Screen";
import { useBoard34Data } from "./data";
export function Board34Route() {
  const result = useBoard34Data();
  if (result.data !== undefined)
    return (
      <Board34Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
