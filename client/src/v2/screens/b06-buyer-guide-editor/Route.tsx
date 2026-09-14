import { StateView } from "../_placeholder/StateView";
import { Board06Screen } from "./Screen";
import { useBoard06Data } from "./data";

export function Board06Route() {
  const result = useBoard06Data();
  if (result.data !== undefined) {
    return (
      <Board06Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
