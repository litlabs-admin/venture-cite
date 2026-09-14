import { StateView } from "../_placeholder/StateView";
import { Board46Screen } from "./Screen";
import { useBoard46Data } from "./data";
export function Board46Route() {
  const result = useBoard46Data();
  if (result.data !== undefined)
    return (
      <Board46Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
