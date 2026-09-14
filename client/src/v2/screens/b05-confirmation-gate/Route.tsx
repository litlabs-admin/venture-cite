import { StateView } from "../_placeholder/StateView";
import { Board05Screen } from "./Screen";
import { useBoard05Data } from "./data";

export function Board05Route() {
  const result = useBoard05Data();
  if (result.data !== undefined) {
    return (
      <Board05Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
