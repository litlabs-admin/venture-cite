import { StateView } from "../_placeholder/StateView";
import { Board35Screen } from "./Screen";
import { useBoard35Data } from "./data";
export function Board35Route() {
  const result = useBoard35Data();
  if (result.data !== undefined)
    return (
      <Board35Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
