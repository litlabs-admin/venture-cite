import { StateView } from "../_placeholder/StateView";
import { Board43Screen } from "./Screen";
import { useBoard43Data } from "./data";
export function Board43Route() {
  const result = useBoard43Data();
  if (result.data !== undefined)
    return (
      <Board43Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
