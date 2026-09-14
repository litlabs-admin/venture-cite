import { StateView } from "../_placeholder/StateView";
import { Board12Screen } from "./Screen";
import { useBoard12Data } from "./data";

export function Board12Route() {
  const result = useBoard12Data();
  if (result.data !== undefined) {
    return (
      <Board12Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
