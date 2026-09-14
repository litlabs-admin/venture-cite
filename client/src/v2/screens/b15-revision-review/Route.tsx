import { StateView } from "../_placeholder/StateView";
import { Board15Screen } from "./Screen";
import { useBoard15Data } from "./data";

export function Board15Route() {
  const result = useBoard15Data();
  if (result.data !== undefined) {
    return (
      <Board15Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
