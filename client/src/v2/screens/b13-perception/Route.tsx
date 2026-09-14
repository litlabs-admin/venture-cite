import { StateView } from "../_placeholder/StateView";
import { Board13Screen } from "./Screen";
import { useBoard13Data } from "./data";

export function Board13Route() {
  const result = useBoard13Data();
  if (result.data !== undefined) {
    return (
      <Board13Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
