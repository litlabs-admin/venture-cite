import { StateView } from "../_placeholder/StateView";
import { Board11Screen } from "./Screen";
import { useBoard11Data } from "./data";

export function Board11Route() {
  const result = useBoard11Data();
  if (result.data !== undefined) {
    return (
      <Board11Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
