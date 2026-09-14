import { StateView } from "../_placeholder/StateView";
import { Board45Screen } from "./Screen";
import { useBoard45Data } from "./data";
export function Board45Route() {
  const result = useBoard45Data();
  if (result.data !== undefined)
    return (
      <Board45Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
