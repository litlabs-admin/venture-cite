import { StateView } from "../_placeholder/StateView";
import { Board36Screen } from "./Screen";
import { useBoard36Data } from "./data";
export function Board36Route() {
  const result = useBoard36Data();
  if (result.data !== undefined)
    return (
      <Board36Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
