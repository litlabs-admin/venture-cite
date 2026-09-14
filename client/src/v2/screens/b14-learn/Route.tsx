import { StateView } from "../_placeholder/StateView";
import { Board14Screen } from "./Screen";
import { useBoard14Data } from "./data";

export function Board14Route() {
  const result = useBoard14Data();
  if (result.data !== undefined) {
    return (
      <Board14Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
