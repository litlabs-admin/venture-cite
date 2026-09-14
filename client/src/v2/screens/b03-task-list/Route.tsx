import { StateView } from "../_placeholder/StateView";
import { Board03Screen } from "./Screen";
import { useBoard03Data } from "./data";

export function Board03Route() {
  const result = useBoard03Data();
  if (result.data !== undefined) {
    return (
      <Board03Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
