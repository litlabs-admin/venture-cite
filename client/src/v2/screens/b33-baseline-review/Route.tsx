import { StateView } from "../_placeholder/StateView";
import { Board33Screen } from "./Screen";
import { useBoard33Data } from "./data";
export function Board33Route() {
  const result = useBoard33Data();
  if (result.data !== undefined)
    return (
      <Board33Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
