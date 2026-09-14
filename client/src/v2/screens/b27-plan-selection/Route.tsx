import { StateView } from "../_placeholder/StateView";
import { Board27Screen } from "./Screen";
import { useBoard27Data } from "./data";
export function Board27Route() {
  const result = useBoard27Data();
  if (result.data !== undefined)
    return (
      <Board27Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
