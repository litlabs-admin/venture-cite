import { StateView } from "../_placeholder/StateView";
import { Board38Screen } from "./Screen";
import { useBoard38Data } from "./data";
export function Board38Route() {
  const result = useBoard38Data();
  if (result.data !== undefined)
    return (
      <Board38Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
