import { StateView } from "../_placeholder/StateView";
import { Board18Screen } from "./Screen";
import { useBoard18Data } from "./data";
export function Board18Route() {
  const result = useBoard18Data();
  if (result.data !== undefined)
    return (
      <Board18Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
