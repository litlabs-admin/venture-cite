import { StateView } from "../_placeholder/StateView";
import { Board07Screen } from "./Screen";
import { useBoard07Data } from "./data";

export function Board07Route() {
  const result = useBoard07Data();
  if (result.data !== undefined) {
    return (
      <Board07Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
