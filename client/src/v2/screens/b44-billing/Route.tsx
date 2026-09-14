import { StateView } from "../_placeholder/StateView";
import { Board44Screen } from "./Screen";
import { useBoard44Data } from "./data";
export function Board44Route() {
  const result = useBoard44Data();
  if (result.data !== undefined)
    return (
      <Board44Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
