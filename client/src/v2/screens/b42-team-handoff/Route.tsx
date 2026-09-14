import { StateView } from "../_placeholder/StateView";
import { Board42Screen } from "./Screen";
import { useBoard42Data } from "./data";
export function Board42Route() {
  const result = useBoard42Data();
  if (result.data !== undefined)
    return (
      <Board42Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
